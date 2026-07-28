import { createClient } from '@supabase/supabase-js';

export function createSupabaseAdmin(env) {
    return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
}

export function createSupabaseForUser(env, accessToken) {
    return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        }
    });
}

export async function verifyAccessToken(env, accessToken, admin = createSupabaseAdmin(env)) {
    if (!accessToken || typeof accessToken !== 'string') {
        throw Object.assign(new Error('authentication_required'), { code: 'authentication_required' });
    }

    const { data, error } = await admin.auth.getUser(accessToken);
    if (error || !data?.user?.id) {
        throw Object.assign(new Error('invalid_token'), { code: 'invalid_token' });
    }

    const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('id,pseudo')
        .eq('id', data.user.id)
        .maybeSingle();

    if (profileError) {
        throw Object.assign(new Error('service_unavailable'), { code: 'service_unavailable' });
    }
    if (!profile) {
        throw Object.assign(new Error('profile_required'), { code: 'profile_required' });
    }

    return {
        userId: data.user.id,
        profileId: profile.id,
        pseudo: profile.pseudo,
        accessToken
    };
}
