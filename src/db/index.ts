// Database connection and operations
import { Database } from 'bun:sqlite';
import { schema, type File, type UploadCode, type DownloadLink, type DiscordPanel } from './schema';
import { nanoid } from 'nanoid';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data.db');

class DB {
    private db: Database;

    constructor() {
        this.db = new Database(DB_PATH);
        this.db.exec('PRAGMA journal_mode = WAL;');
        this.db.exec(schema);
    }

    // ==================== Files ====================

    createFile(data: {
        originalName: string;
        displayName?: string;
        filePath: string;
        fileSize: number;
        mimeType?: string;
        uploadedBy: 'admin' | 'public';
        uploadCodeId?: string;
        retentionDays?: number;
    }): File {
        const id = nanoid();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + (data.retentionDays || 7));

        const stmt = this.db.prepare(`
            INSERT INTO files (id, original_name, display_name, file_path, file_size, mime_type, uploaded_by, upload_code_id, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            id,
            data.originalName,
            data.displayName || null,
            data.filePath,
            data.fileSize,
            data.mimeType || null,
            data.uploadedBy,
            data.uploadCodeId || null,
            expiresAt.toISOString()
        );

        return this.getFileById(id)!;
    }

    getFileById(id: string): File | null {
        const stmt = this.db.prepare('SELECT * FROM files WHERE id = ?');
        return stmt.get(id) as File | null;
    }

    getFileByDownloadCode(code: string): (File & { download_link_id: string }) | null {
        const stmt = this.db.prepare(`
            SELECT f.*, dl.id as download_link_id
            FROM files f
            JOIN download_links dl ON f.id = dl.file_id
            WHERE dl.code = ? AND dl.is_active = TRUE
            AND (dl.max_downloads IS NULL OR dl.current_downloads < dl.max_downloads)
            AND (dl.expires_at IS NULL OR dl.expires_at > datetime('now'))
            AND f.expires_at > datetime('now')
        `);
        return stmt.get(code) as (File & { download_link_id: string }) | null;
    }

    getAllActiveFiles(): File[] {
        const stmt = this.db.prepare(`
            SELECT * FROM files
            WHERE expires_at > datetime('now')
            ORDER BY created_at DESC
        `);
        return stmt.all() as File[];
    }

    deleteFile(id: string): boolean {
        const stmt = this.db.prepare('DELETE FROM files WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }

    deleteExpiredFiles(): string[] {
        const stmt = this.db.prepare(`
            SELECT file_path FROM files WHERE expires_at <= datetime('now')
        `);
        const files = stmt.all() as { file_path: string }[];
        const filePaths = files.map(f => f.file_path);

        this.db.exec(`DELETE FROM files WHERE expires_at <= datetime('now')`);

        return filePaths;
    }

    // ==================== Upload Codes ====================

    createUploadCode(data: {
        maxUses?: number;
        maxFileSizeMb?: number;
        expiresInHours?: number;
    }): UploadCode {
        const id = nanoid();
        const code = nanoid(10);
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + (data.expiresInHours || 24));

        const stmt = this.db.prepare(`
            INSERT INTO upload_codes (id, code, max_uses, max_file_size_mb, expires_at)
            VALUES (?, ?, ?, ?, ?)
        `);

        stmt.run(id, code, data.maxUses || 1, data.maxFileSizeMb || 500, expiresAt.toISOString());

        return this.getUploadCodeById(id)!;
    }

    getUploadCodeById(id: string): UploadCode | null {
        const stmt = this.db.prepare('SELECT * FROM upload_codes WHERE id = ?');
        return stmt.get(id) as UploadCode | null;
    }

    validateUploadCode(code: string): UploadCode | null {
        const stmt = this.db.prepare(`
            SELECT * FROM upload_codes
            WHERE code = ?
            AND is_active = TRUE
            AND current_uses < max_uses
            AND expires_at > datetime('now')
        `);
        return stmt.get(code) as UploadCode | null;
    }

    incrementUploadCodeUse(id: string): void {
        const stmt = this.db.prepare(`
            UPDATE upload_codes SET current_uses = current_uses + 1 WHERE id = ?
        `);
        stmt.run(id);
    }

    // ==================== Download Links ====================

    createDownloadLink(data: {
        fileId: string;
        maxDownloads?: number;
        expiresInHours?: number;
    }): DownloadLink {
        const id = nanoid();
        const code = nanoid(12);
        let expiresAt: string | null = null;

        if (data.expiresInHours) {
            const expDate = new Date();
            expDate.setHours(expDate.getHours() + data.expiresInHours);
            expiresAt = expDate.toISOString();
        }

        const stmt = this.db.prepare(`
            INSERT INTO download_links (id, file_id, code, max_downloads, expires_at)
            VALUES (?, ?, ?, ?, ?)
        `);

        stmt.run(id, data.fileId, code, data.maxDownloads || null, expiresAt);

        return this.getDownloadLinkById(id)!;
    }

    getDownloadLinkById(id: string): DownloadLink | null {
        const stmt = this.db.prepare('SELECT * FROM download_links WHERE id = ?');
        return stmt.get(id) as DownloadLink | null;
    }

    getDownloadLinksByFileId(fileId: string): DownloadLink[] {
        const stmt = this.db.prepare(`
            SELECT * FROM download_links
            WHERE file_id = ? AND is_active = TRUE
            ORDER BY created_at DESC
        `);
        return stmt.all(fileId) as DownloadLink[];
    }

    getAdminDownloadLink(fileId: string): DownloadLink | null {
        const stmt = this.db.prepare(`
            SELECT * FROM download_links
            WHERE file_id = ? AND max_downloads IS NULL AND is_active = TRUE
            LIMIT 1
        `);
        return stmt.get(fileId) as DownloadLink | null;
    }

    incrementDownloadCount(linkId: string): void {
        const stmt = this.db.prepare(`
            UPDATE download_links SET current_downloads = current_downloads + 1 WHERE id = ?
        `);
        stmt.run(linkId);
    }

    // ==================== Discord Panels ====================

    upsertPanel(data: {
        guildId: string;
        channelId: string;
        messageId: string;
    }): DiscordPanel {
        const id = nanoid();
        const stmt = this.db.prepare(`
            INSERT INTO discord_panels (id, guild_id, channel_id, message_id)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(guild_id, channel_id)
            DO UPDATE SET message_id = excluded.message_id
        `);

        stmt.run(id, data.guildId, data.channelId, data.messageId);

        return this.getPanelByChannel(data.guildId, data.channelId)!;
    }

    getPanelByChannel(guildId: string, channelId: string): DiscordPanel | null {
        const stmt = this.db.prepare(`
            SELECT * FROM discord_panels WHERE guild_id = ? AND channel_id = ?
        `);
        return stmt.get(guildId, channelId) as DiscordPanel | null;
    }

    getAllPanels(): DiscordPanel[] {
        const stmt = this.db.prepare('SELECT * FROM discord_panels');
        return stmt.all() as DiscordPanel[];
    }

    close(): void {
        this.db.close();
    }
}

// Singleton instance
export const db = new DB();
