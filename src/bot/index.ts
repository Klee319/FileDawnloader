// Discord Bot for FileDawnloader
import {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    type Interaction,
    type ChatInputCommandInteraction,
    type ButtonInteraction,
    type ModalSubmitInteraction,
    type StringSelectMenuInteraction,
} from 'discord.js';
import { db } from '../db';

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});

const ITEMS_PER_PAGE = 10;

// ==================== Helper Functions ====================

function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function getBaseUrl(): string {
    return process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
}

// ==================== Create Panel Embed ====================

async function createPanelEmbed(page: number = 0): Promise<{ embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] }> {
    const files = db.getAllActiveFiles();
    const baseUrl = getBaseUrl();

    const totalPages = Math.ceil(files.length / ITEMS_PER_PAGE) || 1;
    const currentPage = Math.min(page, totalPages - 1);
    const startIdx = currentPage * ITEMS_PER_PAGE;
    const pageFiles = files.slice(startIdx, startIdx + ITEMS_PER_PAGE);

    let description = '';

    if (pageFiles.length === 0) {
        description = '*まだファイルがありません*';
    } else {
        description = pageFiles.map(file => {
            const displayName = file.display_name || file.original_name;
            const adminLink = db.getAdminDownloadLink(file.id);
            const downloadUrl = adminLink ? `${baseUrl}/d/${adminLink.code}` : '#';
            const timestamp = formatDate(file.created_at);
            const size = formatFileSize(file.file_size);

            return `[${displayName}](${downloadUrl}) (${size}) - ${timestamp}`;
        }).join('\n');
    }

    const embed = new EmbedBuilder()
        .setTitle('📁 FileDawnloader')
        .setDescription(description)
        .setColor(0xe94560)
        .setFooter({ text: `ページ ${currentPage + 1}/${totalPages} · ファイルは7日後に自動削除` })
        .setTimestamp();

    // Main action buttons
    const actionRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setLabel('アップロードページ')
                .setStyle(ButtonStyle.Link)
                .setURL(`${baseUrl}/?auth=${process.env.ADMIN_SECRET}`),
            new ButtonBuilder()
                .setCustomId('generate_upload_code')
                .setLabel('コード発行')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔑'),
            new ButtonBuilder()
                .setCustomId('generate_download_link')
                .setLabel('リンク共有')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔗'),
        );

    // Pagination buttons
    const paginationRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`panel_prev_${currentPage}`)
                .setLabel('◀ 前へ')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 0),
            new ButtonBuilder()
                .setCustomId('panel_refresh')
                .setLabel('🔄 更新')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`panel_next_${currentPage}`)
                .setLabel('次へ ▶')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage >= totalPages - 1),
        );

    return {
        embed,
        components: [actionRow, paginationRow],
    };
}

// ==================== Update All Panels ====================

async function updateAllPanels() {
    const panels = db.getAllPanels();

    for (const panel of panels) {
        try {
            const channel = await client.channels.fetch(panel.channel_id);
            if (channel && 'messages' in channel) {
                const message = await channel.messages.fetch(panel.message_id);
                const { embed, components } = await createPanelEmbed(0);
                await message.edit({ embeds: [embed], components: components as any });
            }
        } catch (e) {
            console.error(`Failed to update panel in channel ${panel.channel_id}:`, e);
        }
    }
}

// ==================== Slash Commands ====================

const commands = [
    new SlashCommandBuilder()
        .setName('panel')
        .setDescription('FileDawnloaderのコントロールパネルを投稿'),
].map(cmd => cmd.toJSON());

// ==================== Event Handlers ====================

client.once('ready', async () => {
    console.log(`Discord Bot logged in as ${client.user?.tag}`);

    // Register slash commands
    const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN!);

    try {
        await rest.put(
            Routes.applicationCommands(client.user!.id),
            { body: commands }
        );
        console.log('Slash commands registered');
    } catch (e) {
        console.error('Failed to register commands:', e);
    }
});

client.on('interactionCreate', async (interaction: Interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            await handleCommand(interaction);
        } else if (interaction.isButton()) {
            await handleButton(interaction);
        } else if (interaction.isModalSubmit()) {
            await handleModal(interaction);
        } else if (interaction.isStringSelectMenu()) {
            await handleSelectMenu(interaction);
        }
    } catch (e) {
        console.error('Interaction error:', e);
    }
});

// ==================== Command Handler ====================

async function handleCommand(interaction: ChatInputCommandInteraction) {
    if (interaction.commandName === 'panel') {
        const { embed, components } = await createPanelEmbed(0);

        const message = await interaction.reply({
            embeds: [embed],
            components: components as any,
            fetchReply: true,
        });

        // Save panel reference
        db.upsertPanel({
            guildId: interaction.guildId!,
            channelId: interaction.channelId,
            messageId: message.id,
        });
    }
}

// ==================== Button Handler ====================

async function handleButton(interaction: ButtonInteraction) {
    const customId = interaction.customId;

    if (customId === 'generate_upload_code') {
        // Show modal for upload code generation
        const modal = new ModalBuilder()
            .setCustomId('upload_code_modal')
            .setTitle('アップロードコード発行')
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId('max_uses')
                        .setLabel('使用回数（デフォルト: 1）')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('1')
                        .setRequired(false)
                ),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId('max_size')
                        .setLabel('最大ファイルサイズ MB（デフォルト: 500）')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('500')
                        .setRequired(false)
                ),
            );

        await interaction.showModal(modal);
    }
    else if (customId === 'generate_download_link') {
        // Show file selection menu
        const files = db.getAllActiveFiles();

        if (files.length === 0) {
            await interaction.reply({
                content: 'ファイルがありません',
                ephemeral: true,
            });
            return;
        }

        const options = files.slice(0, 25).map(file => ({
            label: (file.display_name || file.original_name).slice(0, 100),
            value: file.id,
            description: `${formatFileSize(file.file_size)} · ${formatDate(file.created_at)}`,
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_file_for_download')
            .setPlaceholder('ファイルを選択')
            .addOptions(options);

        await interaction.reply({
            content: '限定ダウンロードリンクを生成するファイルを選択してください:',
            components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)],
            ephemeral: true,
        });
    }
    else if (customId === 'panel_refresh') {
        const { embed, components } = await createPanelEmbed(0);
        await interaction.update({ embeds: [embed], components: components as any });
    }
    else if (customId.startsWith('panel_prev_')) {
        const currentPage = parseInt(customId.split('_')[2]);
        const { embed, components } = await createPanelEmbed(Math.max(0, currentPage - 1));
        await interaction.update({ embeds: [embed], components: components as any });
    }
    else if (customId.startsWith('panel_next_')) {
        const currentPage = parseInt(customId.split('_')[2]);
        const { embed, components } = await createPanelEmbed(currentPage + 1);
        await interaction.update({ embeds: [embed], components: components as any });
    }
}

// ==================== Modal Handler ====================

async function handleModal(interaction: ModalSubmitInteraction) {
    const customId = interaction.customId;

    if (customId === 'upload_code_modal') {
        const maxUses = parseInt(interaction.fields.getTextInputValue('max_uses')) || 1;
        const maxSize = parseInt(interaction.fields.getTextInputValue('max_size')) || 500;

        const code = db.createUploadCode({
            maxUses,
            maxFileSizeMb: maxSize,
            expiresInHours: 24,
        });

        const baseUrl = getBaseUrl();
        const uploadUrl = `${baseUrl}/public?code=${code.code}`;

        const embed = new EmbedBuilder()
            .setTitle('🔑 アップロードコード発行完了')
            .setDescription(`このリンクを共有すると、相手がファイルをアップロードできます。`)
            .addFields(
                { name: 'アップロードURL', value: `\`\`\`${uploadUrl}\`\`\``, inline: false },
                { name: 'コード', value: `\`${code.code}\``, inline: true },
                { name: '使用回数', value: `${maxUses}回`, inline: true },
                { name: '最大サイズ', value: `${maxSize}MB`, inline: true },
                { name: '有効期限', value: formatDate(code.expires_at), inline: true },
            )
            .setColor(0x4ade80);

        await interaction.reply({
            embeds: [embed],
            ephemeral: true,
        });
    }
    else if (customId === 'download_limit_modal') {
        // Handle download limit modal - need to get fileId from somewhere
        // We'll store it in the custom ID
    }
    else if (customId.startsWith('download_limit_modal_')) {
        const fileId = customId.replace('download_limit_modal_', '');
        const maxDownloads = parseInt(interaction.fields.getTextInputValue('max_downloads')) || 1;

        const link = db.createDownloadLink({
            fileId,
            maxDownloads,
        });

        const baseUrl = getBaseUrl();
        const downloadUrl = `${baseUrl}/d/${link.code}`;

        const file = db.getFileById(fileId);

        const embed = new EmbedBuilder()
            .setTitle('🔗 ダウンロードリンク発行完了')
            .setDescription(`**${file?.display_name || file?.original_name}** のダウンロードリンクを発行しました。`)
            .addFields(
                { name: 'ダウンロードURL', value: `\`\`\`${downloadUrl}\`\`\``, inline: false },
                { name: 'ダウンロード回数制限', value: `${maxDownloads}回`, inline: true },
            )
            .setColor(0x4ade80);

        await interaction.reply({
            embeds: [embed],
            ephemeral: true,
        });

        // Refresh panel
        await updateAllPanels();
    }
}

// ==================== Select Menu Handler ====================

async function handleSelectMenu(interaction: StringSelectMenuInteraction) {
    const customId = interaction.customId;

    if (customId === 'select_file_for_download') {
        const fileId = interaction.values[0];

        // Show modal for download limit
        const modal = new ModalBuilder()
            .setCustomId(`download_limit_modal_${fileId}`)
            .setTitle('限定ダウンロードリンク発行')
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId('max_downloads')
                        .setLabel('ダウンロード回数制限（デフォルト: 1）')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('1')
                        .setRequired(false)
                ),
            );

        await interaction.showModal(modal);
    }
}

// ==================== Start Bot ====================

const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
    console.error('DISCORD_BOT_TOKEN is not set');
    process.exit(1);
}

client.login(token);

// Export for panel updates from server
export { updateAllPanels };
