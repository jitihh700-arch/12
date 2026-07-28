const SECRET_PATTERNS = [
    /sb_secret_[A-Za-z0-9_-]+/g,
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    /Bearer\s+[A-Za-z0-9._-]+/gi
];

function sanitize(value) {
    let text = typeof value === 'string' ? value : JSON.stringify(value);
    for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, '[redacted]');
    return text;
}

export const logger = {
    info(message, meta) {
        console.log(message, meta ? sanitize(meta) : '');
    },
    warn(message, meta) {
        console.warn(message, meta ? sanitize(meta) : '');
    },
    error(message, meta) {
        console.error(message, meta ? sanitize(meta) : '');
    },
    sanitize
};
