import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateGameCode(length = 6, randomInt = crypto.randomInt) {
    let code = '';
    for (let index = 0; index < length; index += 1) {
        code += ALPHABET[randomInt(0, ALPHABET.length)];
    }
    return code;
}

export function normalizeGameCode(value) {
    return String(value || '').trim().toUpperCase();
}

export function isGameCode(value) {
    return /^[A-Z0-9]{6}$/.test(normalizeGameCode(value));
}

export { ALPHABET };
