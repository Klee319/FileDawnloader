# FileDawnloader

個人用無制限ファイル共有サービス with Discord Bot連携

## 機能

### Webインターフェース

- **管理者ページ** (`/?auth=YOUR_SECRET`)
  - Cookie認証による保護
  - ワンタップでファイルアップロード
  - 任意の表示名設定
  - ダウンロードリンクのワンクリックコピー
  - アップロード済みファイル一覧表示・管理

- **公開アップロードページ** (`/public?code=UPLOAD_CODE`)
  - ワンタイムコードによるアクセス制御
  - 管理者が発行したコードでのみアップロード可能

### Discord Bot

- `/panel` - ファイル共有パネルを投稿
  - ファイル一覧（ページネーション対応）
  - 管理者ページへのリンク
  - アップロードコード生成ボタン
  - 限定ダウンロードリンク生成ボタン

### その他

- ファイルは1週間後に自動削除
- 限定回数ダウンロードリンクの発行が可能
- SQLiteによる軽量データベース

## 技術スタック

- **Runtime**: [Bun](https://bun.sh)
- **Server**: [Hono](https://hono.dev)
- **Database**: SQLite (Bun built-in)
- **Discord**: discord.js v14

## セットアップ

### 1. 依存関係のインストール

```bash
bun install
```

### 2. 環境変数の設定

`.env`ファイルを編集:

```env
# Server Configuration
PORT=3000
BASE_URL=http://localhost:3000

# Authentication - 必ず変更してください
ADMIN_SECRET=your-super-secret-key-change-this

# Discord Bot
DISCORD_BOT_TOKEN=your-discord-bot-token

# File Settings
MAX_FILE_SIZE_MB=500
FILE_RETENTION_DAYS=7
UPLOAD_DIR=./uploads
```

### 3. Discord Botの設定

1. [Discord Developer Portal](https://discord.com/developers/applications)でアプリケーションを作成
2. Bot tokenを取得して`.env`に設定
3. OAuth2 URL Generatorで以下の権限を選択:
   - `bot` scope
   - `applications.commands` scope
   - `Send Messages`, `Embed Links`, `Use Slash Commands` permissions
4. 生成されたURLでBotをサーバーに招待

### 4. 起動

**開発モード（サーバーのみ）:**
```bash
bun run dev
```

**Discord Botのみ:**
```bash
bun run bot
```

**両方同時起動:**
```bash
bun run start
```

## 使い方

### 管理者としてアクセス

ブラウザで以下にアクセス:
```
http://localhost:3000/?auth=YOUR_ADMIN_SECRET
```

初回アクセス時にCookieが設定され、以降は`http://localhost:3000/`で直接アクセス可能。

### 他の人にファイルをアップロードしてもらう

1. Discord Botの`/panel`コマンドでパネルを表示
2. "Generate Upload Code"ボタンをクリック
3. 使用回数と容量制限を設定
4. 生成されたURLを相手に共有

### ファイルを共有する

1. Discord Botパネルの"Share Download Link"ボタンをクリック
2. 共有したいファイルを選択
3. ダウンロード可能回数を設定
4. 生成されたURLを相手に共有

## API

### ファイル一覧取得
```
GET /api/files
Cookie: filedawnloader_auth=ADMIN_SECRET
```

### ファイルアップロード（管理者）
```
POST /upload/admin
Cookie: filedawnloader_auth=ADMIN_SECRET
Content-Type: multipart/form-data
- file: ファイル
- displayName: 表示名（任意）
```

### ファイルアップロード（公開）
```
POST /upload/public
Content-Type: multipart/form-data
- file: ファイル
- code: アップロードコード
- displayName: 表示名（任意）
```

### アップロードコード生成
```
POST /api/codes/upload
Cookie: filedawnloader_auth=ADMIN_SECRET
Content-Type: application/json
{
  "maxUses": 1,
  "maxFileSizeMb": 500,
  "expiresInHours": 24
}
```

### 限定ダウンロードリンク生成
```
POST /api/links/download
Cookie: filedawnloader_auth=ADMIN_SECRET
Content-Type: application/json
{
  "fileId": "xxx",
  "maxDownloads": 3
}
```

## ライセンス

MIT
