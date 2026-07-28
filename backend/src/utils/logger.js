const SECRET_PATTERNS = [
    /sb_secret_[A-Za-z0-9_-]+/g,
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    /Bearer\s+[A-Za-z0-9._-]+/gi,
    /(Authorization["']?\s*[:=]\s*["']?)[^"',\s}]+/gi,
    /(access[_-]?token["']?\s*[:=]\s*["']?)[^"',\s}]+/gi,
    /(refresh[_-]?token["']?\s*[:=]\s*["']?)[^"',\s}]+/gi,
    /(secret[_-]?key["']?\s*[:=]\s*["']?)[^"',\s}]+/gi,
    /(password["']?\s*[:=]\s*["']?)[^"',\s}]+/gi,
    /postgres:\/\/[^\s"']+/gi
];

function sanitize(value) {
    let text = typeof value === 'string' ? value : JSON.stringify(value);
    if (!text) return '';
    for (const pattern of SECRET_PATTERNS) {
        text = text.replace(pattern, (match, prefix) => prefix ? `${prefix}[redacted]` : '[redacted]');
    }
    return text;
}

export const logger = {
    info(message, meta) {
        console.log(JSON.stringify({ level: 'info', message: sanitize(message), meta: meta ? sanitize(meta) : undefined }));
    },
    warn(message, meta) {
        console.warn(JSON.stringify({ level: 'warn', message: sanitize(message), meta: meta ? sanitize(meta) : undefined }));
    },
    error(message, meta) {
        console.error(JSON.stringify({ level: 'error', message: sanitize(message), meta: meta ? sanitize(meta) : undefined }));
    },
    sanitize
};
