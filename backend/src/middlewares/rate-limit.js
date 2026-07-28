import rateLimit from 'express-rate-limit';

export function createRestLimiter() {
    return rateLimit({
        windowMs: 60_000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false
    });
}

export class EventRateLimiter {
    constructor(now = () => Date.now()) {
        this.now = now;
        this.buckets = new Map();
    }

    check(key, { max, windowMs }) {
        const now = this.now();
        const current = (this.buckets.get(key) || []).filter(time => now - time < windowMs);
        if (current.length >= max) {
            this.buckets.set(key, current);
            return false;
        }
        current.push(now);
        this.buckets.set(key, current);
        return true;
    }

    clear() {
        this.buckets.clear();
    }
}
