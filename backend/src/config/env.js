import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
    NODE_ENV: z.string().default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    FRONTEND_ORIGIN: z.string().min(1),
    SUPABASE_URL: z.string().url(),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    SUPABASE_SECRET_KEY: z.string().min(1),
    MULTIPLAYER_INACTIVITY_MINUTES: z.coerce.number().int().positive().default(30),
    MULTIPLAYER_REACTION_WINDOW_SECONDS: z.coerce.number().int().positive().default(10),
    MULTIPLAYER_REACTION_MAX_COUNT: z.coerce.number().int().positive().default(5)
});

export function loadEnv(source = process.env) {
    const parsed = schema.safeParse(source);
    if (!parsed.success) {
        const fields = parsed.error.issues.map(issue => issue.path.join('.')).join(', ');
        throw new Error(`missing_or_invalid_env:${fields}`);
    }
    return parsed.data;
}

export const env = process.env.NODE_ENV === 'test' ? null : loadEnv();
