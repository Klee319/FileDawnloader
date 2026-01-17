// Database Schema for FileDawnloader
// Using Bun's built-in SQLite

export const schema = `
-- Files table: stores uploaded file information
CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    original_name TEXT NOT NULL,
    display_name TEXT,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT,
    uploaded_by TEXT NOT NULL DEFAULT 'admin', -- 'admin' or 'public'
    upload_code_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (upload_code_id) REFERENCES upload_codes(id)
);

-- Upload codes: one-time codes for public uploads
CREATE TABLE IF NOT EXISTS upload_codes (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    max_uses INTEGER NOT NULL DEFAULT 1,
    current_uses INTEGER NOT NULL DEFAULT 0,
    max_file_size_mb INTEGER DEFAULT 500,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

-- Download links: shareable download links with optional limits
CREATE TABLE IF NOT EXISTS download_links (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    max_downloads INTEGER, -- NULL means unlimited
    current_downloads INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

-- Discord panel message tracking
CREATE TABLE IF NOT EXISTS discord_panels (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, channel_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_files_expires_at ON files(expires_at);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at);
CREATE INDEX IF NOT EXISTS idx_upload_codes_code ON upload_codes(code);
CREATE INDEX IF NOT EXISTS idx_upload_codes_expires_at ON upload_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_download_links_code ON download_links(code);
CREATE INDEX IF NOT EXISTS idx_download_links_file_id ON download_links(file_id);
`;

export type File = {
    id: string;
    original_name: string;
    display_name: string | null;
    file_path: string;
    file_size: number;
    mime_type: string | null;
    uploaded_by: 'admin' | 'public';
    upload_code_id: string | null;
    created_at: string;
    expires_at: string;
};

export type UploadCode = {
    id: string;
    code: string;
    max_uses: number;
    current_uses: number;
    max_file_size_mb: number;
    created_at: string;
    expires_at: string;
    is_active: boolean;
};

export type DownloadLink = {
    id: string;
    file_id: string;
    code: string;
    max_downloads: number | null;
    current_downloads: number;
    created_at: string;
    expires_at: string | null;
    is_active: boolean;
};

export type DiscordPanel = {
    id: string;
    guild_id: string;
    channel_id: string;
    message_id: string;
    created_at: string;
};
