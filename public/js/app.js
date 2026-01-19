// FileDawnloader - Main Application JS

// Detect base path from URL (for reverse proxy support, e.g., /node1)
function getBasePath() {
    const path = window.location.pathname;
    const normalized = path.replace(/\/$/, '');

    // Known routes
    if (normalized === '' || normalized === '/public') {
        return '';
    }
    if (normalized.endsWith('/public')) {
        return normalized.slice(0, -7); // remove '/public'
    }
    // Root with query params (admin page)
    return normalized;
}

const BASE_PATH = getBasePath();

class FileDawnloader {
    constructor(isAdmin = true) {
        this.isAdmin = isAdmin;
        this.basePath = BASE_PATH;
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.displayNameInput = document.getElementById('displayName');
        this.progressContainer = document.getElementById('progressContainer');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        this.resultCard = document.getElementById('resultCard');
        this.downloadLink = document.getElementById('downloadLink');
        this.copyBtn = document.getElementById('copyBtn');
        this.fileList = document.getElementById('fileList');
        this.codeInput = document.getElementById('codeInput');

        // Confirmation section elements (public upload only)
        this.confirmSection = document.getElementById('confirmSection');
        this.confirmFileName = document.getElementById('confirmFileName');
        this.confirmFileSize = document.getElementById('confirmFileSize');
        this.confirmUploadBtn = document.getElementById('confirmUploadBtn');
        this.cancelUploadBtn = document.getElementById('cancelUploadBtn');
        this.pendingFile = null;

        this.init();
    }

    init() {
        // Drag and drop
        if (this.uploadArea) {
            this.uploadArea.addEventListener('click', () => this.fileInput?.click());
            this.uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
            this.uploadArea.addEventListener('dragleave', () => this.handleDragLeave());
            this.uploadArea.addEventListener('drop', (e) => this.handleDrop(e));
        }

        // File input change
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }

        // Copy button
        if (this.copyBtn) {
            this.copyBtn.addEventListener('click', () => this.copyLink());
        }

        // Confirmation buttons (public upload only)
        if (this.confirmUploadBtn) {
            this.confirmUploadBtn.addEventListener('click', () => this.confirmUpload());
        }
        if (this.cancelUploadBtn) {
            this.cancelUploadBtn.addEventListener('click', () => this.cancelUpload());
        }

        // Load file list for admin
        if (this.isAdmin && this.fileList) {
            this.loadFiles();
        }
    }

    handleDragOver(e) {
        e.preventDefault();
        this.uploadArea.classList.add('dragover');
    }

    handleDragLeave() {
        this.uploadArea.classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.handleFile(files[0]);
        }
    }

    handleFileSelect(e) {
        const files = e.target.files;
        if (files.length > 0) {
            this.handleFile(files[0]);
        }
    }

    handleFile(file) {
        // Admin uploads immediately, public shows confirmation
        if (this.isAdmin) {
            this.uploadFile(file);
        } else {
            this.showConfirmation(file);
        }
    }

    showConfirmation(file) {
        this.pendingFile = file;

        // Update confirmation UI
        if (this.confirmFileName) {
            this.confirmFileName.textContent = file.name;
        }
        if (this.confirmFileSize) {
            this.confirmFileSize.textContent = this.formatFileSize(file.size);
        }

        // Show confirmation section
        if (this.confirmSection) {
            this.confirmSection.classList.add('active');
        }

        // Hide result card if visible
        if (this.resultCard) {
            this.resultCard.classList.remove('active');
        }
    }

    confirmUpload() {
        if (this.pendingFile) {
            this.uploadFile(this.pendingFile);
            this.hideConfirmation();
        }
    }

    cancelUpload() {
        this.pendingFile = null;
        this.hideConfirmation();

        // Clear file input
        if (this.fileInput) {
            this.fileInput.value = '';
        }

        this.showToast('キャンセルしました', 'info');
    }

    hideConfirmation() {
        if (this.confirmSection) {
            this.confirmSection.classList.remove('active');
        }
        this.pendingFile = null;
    }

    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);

        const displayName = this.displayNameInput?.value?.trim();
        if (displayName) {
            formData.append('displayName', displayName);
        }

        // For public upload, add code
        if (!this.isAdmin && this.codeInput) {
            const code = this.codeInput.value.trim();
            if (!code) {
                this.showToast('アップロードコードを入力してください', 'error');
                return;
            }
            formData.append('code', code);
        }

        const endpoint = this.isAdmin ? `${this.basePath}/upload/admin` : `${this.basePath}/upload/public`;

        this.showProgress();

        try {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    this.updateProgress(percent);
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status === 200) {
                    const result = JSON.parse(xhr.responseText);
                    this.showResult(result);
                    if (this.isAdmin) {
                        this.loadFiles();
                    }
                } else {
                    const error = JSON.parse(xhr.responseText);
                    this.showToast(this.translateError(error.error) || 'アップロード失敗', 'error');
                    this.hideProgress();
                }
            });

            xhr.addEventListener('error', () => {
                this.showToast('アップロード失敗', 'error');
                this.hideProgress();
            });

            xhr.open('POST', endpoint);
            xhr.send(formData);

        } catch (error) {
            this.showToast('アップロード失敗: ' + error.message, 'error');
            this.hideProgress();
        }
    }

    translateError(error) {
        const translations = {
            'No file provided': 'ファイルが選択されていません',
            'Upload code required': 'アップロードコードが必要です',
            'Invalid or expired upload code': '無効または期限切れのアップロードコードです',
            'File size exceeds': 'ファイルサイズが制限を超えています',
        };
        for (const [key, value] of Object.entries(translations)) {
            if (error && error.includes(key)) {
                return value;
            }
        }
        return error;
    }

    showProgress() {
        this.progressContainer.classList.add('active');
        this.resultCard.classList.remove('active');
        this.updateProgress(0);
    }

    hideProgress() {
        this.progressContainer.classList.remove('active');
    }

    updateProgress(percent) {
        this.progressFill.style.width = percent + '%';
        this.progressText.textContent = `アップロード中... ${percent}%`;
    }

    showResult(result) {
        this.hideProgress();
        this.hideConfirmation();
        this.resultCard.classList.add('active');
        this.downloadLink.value = result.downloadUrl;

        // Clear inputs
        if (this.displayNameInput) {
            this.displayNameInput.value = '';
        }
        if (this.fileInput) {
            this.fileInput.value = '';
        }

        this.showToast('アップロード完了！', 'success');
    }

    async copyLink() {
        try {
            await navigator.clipboard.writeText(this.downloadLink.value);
            this.copyBtn.textContent = 'コピー完了！';
            this.copyBtn.classList.add('copied');
            setTimeout(() => {
                this.copyBtn.textContent = 'コピー';
                this.copyBtn.classList.remove('copied');
            }, 2000);
        } catch (error) {
            // Fallback for older browsers
            this.downloadLink.select();
            document.execCommand('copy');
            this.copyBtn.textContent = 'コピー完了！';
            setTimeout(() => {
                this.copyBtn.textContent = 'コピー';
            }, 2000);
        }
    }

    async loadFiles() {
        try {
            const response = await fetch(`${this.basePath}/api/files`);
            if (!response.ok) throw new Error('Failed to load files');

            const data = await response.json();
            this.renderFileList(data.files);
        } catch (error) {
            console.error('Failed to load files:', error);
        }
    }

    renderFileList(files) {
        if (!this.fileList) return;

        if (files.length === 0) {
            this.fileList.innerHTML = `
                <div class="empty-state">
                    <div class="icon">📁</div>
                    <p>まだファイルがありません</p>
                </div>
            `;
            return;
        }

        this.fileList.innerHTML = files.map(file => `
            <div class="file-item" data-id="${file.id}">
                <div class="file-info">
                    <div class="file-name">${this.escapeHtml(file.name)}</div>
                    <div class="file-meta">
                        ${this.formatFileSize(file.size)} ·
                        ${this.formatDate(file.createdAt)} ·
                        有効期限: ${this.formatDate(file.expiresAt)}
                    </div>
                </div>
                <div class="file-actions">
                    <button onclick="app.copyFileLink('${file.downloadCode}')" title="リンクをコピー">📋</button>
                    <button onclick="app.deleteFile('${file.id}')" class="delete" title="削除">🗑️</button>
                </div>
            </div>
        `).join('');
    }

    async copyFileLink(code) {
        const baseUrl = window.location.origin;
        const link = `${baseUrl}${this.basePath}/d/${code}`;

        try {
            await navigator.clipboard.writeText(link);
            this.showToast('リンクをコピーしました', 'success');
        } catch (error) {
            this.showToast('コピーに失敗しました', 'error');
        }
    }

    async deleteFile(id) {
        if (!confirm('このファイルを削除しますか？')) return;

        try {
            const response = await fetch(`${this.basePath}/api/files/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete');

            this.showToast('ファイルを削除しました', 'success');
            this.loadFiles();
        } catch (error) {
            this.showToast('削除に失敗しました', 'error');
        }
    }

    showToast(message, type = 'info') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.remove(), 3000);
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('ja-JP', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize
let app;
document.addEventListener('DOMContentLoaded', () => {
    const isAdmin = !window.location.pathname.includes('/public');
    app = new FileDawnloader(isAdmin);
});
