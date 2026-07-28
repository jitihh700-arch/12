import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const originSchema = z.string().min(1).transform(value => value.split(',')
    .map(origin => origin.trim())
    .filter(Boolean))
    .refine(origins => origins.length > 0, 'at_least_one_origin_required')
    .refine(origins => origins.every(origin => {
        try {
            const parsed = new URL(origin);
            return ['http:', 'https:'].includes(parsed.protocol) && !origin.endsWith('/');
        } catch (error) {
            return false;
        }
    }), 'invalid_origin');

const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    FRONTEND_ORIGIN: originSchema,
    SUPABASE_URL: z.string().url(),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    SUPABASE_SECRET_KEY: z.string().min(1),
    MULTIPLAYER_INACTIVITY_MINUTES: z.coerce.number().int().positive().default(30),
    MULTIPLAYER_REACTION_WINDOW_SECONDS: z.coerce.number().int().positive().default(10),
    MULTIPLAYER_REACTION_MAX_COUNT: z.coerce.number().int().positive().default(5)
}).superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production') {
        const insecureLocalOrigins = value.FRONTEND_ORIGIN.filter(origin => /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|$)/.test(origin));
        if (insecureLocalOrigins.length) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['FRONTEND_ORIGIN'],
                message: 'production_origin_must_not_be_local_http'
            });
        }
    }
});

export function loadEnv(source = process.env) {
    const parsed = schema.safeParse(source);
    if (!parsed.success) {
        const fields = parsed.error.issues.map(issue => issue.path.join('.')).join(', ');
        throw new Error(`missing_or_invalid_env:${fields}`);
    }
    return {
        ...parsed.data,
        FRONTEND_ORIGIN: parsed.data.FRONTEND_ORIGIN,
        FRONTEND_ORIGINS: parsed.data.FRONTEND_ORIGIN
    };
}

export const env = process.env.NODE_ENV === 'test' ? null : loadEnv();
