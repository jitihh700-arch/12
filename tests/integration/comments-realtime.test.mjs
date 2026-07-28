import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const rootDir = fileURLToPath(new URL('../..', import.meta.url));

function dockerEnv() {
    return {
        ...process.env,
        PATH: `C:\\Program Files\\Docker\\Docker\\resources\\bin;${process.env.PATH || ''}`
    };
}

function supabaseStatus() {
    const raw = execSync('npx supabase status --output json', {
        cwd: rootDir,
        env: dockerEnv(),
        encoding: 'utf8',
        shell: 'cmd.exe',
        stdio: ['ignore', 'pipe', 'pipe']
    });
    return JSON.parse(raw);
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function waitForRealtime(status) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 30000) {
        try {
            const response = await fetch(`${status.API_URL}/realtime/v1/api/ping`, { method: 'HEAD' });
            if (response.ok) return;
        } catch {
            // Le service peut redemarrer juste apres un db reset.
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('Realtime ping timeout');
}

function waitForEvent(events, predicate, label, statuses) {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const timer = setInterval(() => {
            const event = events.find(predicate);
            if (event) {
                clearInterval(timer);
                resolve(event);
                return;
            }
            if (Date.now() - startedAt > 15000) {
                clearInterval(timer);
                reject(new Error(`Evenement Realtime absent: ${label}; statuts=${statuses.join(',')}; recus=${events.map(event => event.eventType).join(',')}`));
            }
        }, 100);
    });
}

function forbiddenKeys(payload, allowedKeys) {
    return Object.keys(payload).filter(key => !allowedKeys.includes(key));
}

function waitForSubscription(channel, statuses) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Realtime subscription timeout')), 15000);
        channel.subscribe((status) => {
            statuses.push(status);
            if (status === 'SUBSCRIBED') {
                clearTimeout(timer);
                resolve();
            }
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                clearTimeout(timer);
                reject(new Error(`Realtime subscription ${status}`));
            }
        });
    });
}

function waitForRejectedSubscription(channel, statuses) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Abonnement anon non refuse; statuts=${statuses.join(',')}`)), 15000);
        channel.subscribe((status) => {
            statuses.push(status);
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                clearTimeout(timer);
                resolve();
            }
            if (status === 'SUBSCRIBED') {
                clearTimeout(timer);
                reject(new Error('Abonnement anon au canal prive accepte'));
            }
        });
    });
}

async function createProfileClient(status, pseudo) {
    const client = createClient(status.API_URL, status.ANON_KEY, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });

    const { data: authData, error: authError } = await client.auth.signInAnonymously();
    if (authError) throw authError;
    if (authData.session?.access_token) {
        client.realtime.setAuth(authData.session.access_token);
    }

    const { error: profileError } = await client.rpc('register_profile', { p_pseudo: pseudo });
    if (profileError) throw profileError;

    return client;
}

const status = supabaseStatus();
await waitForRealtime(status);
const suffix = String(Date.now()).slice(-8);
const listener = await createProfileClient(status, `RR_${suffix}`);
const writer = await createProfileClient(status, `RW_${suffix}`);
const attacker = await createProfileClient(status, `RA_${suffix}`);
const anonClient = createClient(status.API_URL, status.ANON_KEY, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});
const events = [];
const statuses = [];
const anonStatuses = [];
const attackerStatuses = [];

const channel = listener
    .channel('comments:public', { config: { private: true } })
    .on('broadcast', { event: 'comment_created' }, (message) => events.push({ event: 'comment_created', payload: message.payload }))
    .on('broadcast', { event: 'comment_updated' }, (message) => events.push({ event: 'comment_updated', payload: message.payload }))
    .on('broadcast', { event: 'comment_deleted' }, (message) => events.push({ event: 'comment_deleted', payload: message.payload }));

const anonChannel = anonClient.channel('comments:public', { config: { private: true } });
await waitForRejectedSubscription(anonChannel, anonStatuses);
await anonClient.removeChannel(anonChannel);

await waitForSubscription(channel, statuses);
await new Promise(resolve => setTimeout(resolve, 3000));

const attackerChannel = attacker.channel('comments:public', { config: { private: true } });
await waitForSubscription(attackerChannel, attackerStatuses);
await attackerChannel.send({
    type: 'broadcast',
    event: 'comment_created',
    payload: { id: 'fake', content: 'fake event' }
});
await new Promise(resolve => setTimeout(resolve, 1000));
assert(!events.some(event => event.payload?.id === 'fake'), 'client authenticated ne doit pas injecter un faux Broadcast visible');

const { data: createdRows, error: createError } = await writer.rpc('create_comment', {
    p_content: 'Realtime insert'
});
if (createError) throw createError;
const created = Array.isArray(createdRows) ? createdRows[0] : createdRows;

const createPayloadKeys = ['id', 'user_id', 'pseudo', 'content', 'is_edited', 'created_at', 'updated_at'];
const deletePayloadKeys = ['id', 'deleted_at'];

const insertEvent = await waitForEvent(events, event => event.event === 'comment_created' && event.payload.id === created.comment_id, 'comment_created', statuses);
assert(insertEvent.payload.content === 'Realtime insert', 'comment_created sans contenu attendu');
assert(insertEvent.payload.user_id === created.user_id, 'comment_created sans user_id attendu');
assert(insertEvent.payload.pseudo === created.pseudo, 'comment_created sans pseudo courant');
assert(forbiddenKeys(insertEvent.payload, createPayloadKeys).length === 0, 'comment_created expose des champs non autorises');

const { error: updateError } = await writer.rpc('update_my_comment', {
    p_comment_id: created.comment_id,
    p_content: 'Realtime update'
});
if (updateError) throw updateError;

const updateEvent = await waitForEvent(events, event => event.event === 'comment_updated' && event.payload.id === created.comment_id && event.payload.content === 'Realtime update', 'comment_updated', statuses);
assert(updateEvent.payload.is_edited === true, 'comment_updated sans is_edited');
assert(forbiddenKeys(updateEvent.payload, createPayloadKeys).length === 0, 'comment_updated expose des champs non autorises');

const { error: deleteError } = await writer.rpc('delete_my_comment', {
    p_comment_id: created.comment_id
});
if (deleteError) throw deleteError;

const softDeleteEvent = await waitForEvent(events, event => event.event === 'comment_deleted' && event.payload.id === created.comment_id && event.payload.deleted_at, 'comment_deleted', statuses);
assert(forbiddenKeys(softDeleteEvent.payload, deletePayloadKeys).length === 0, 'comment_deleted expose des champs non autorises');
assert(!Object.prototype.hasOwnProperty.call(softDeleteEvent.payload, 'content'), 'comment_deleted expose le contenu supprime');
assert(!Object.prototype.hasOwnProperty.call(softDeleteEvent.payload, 'pseudo'), 'comment_deleted expose le pseudo');
assert(events.filter(event => event.payload?.id === created.comment_id).length === 3, 'evenement en double detecte');

const { data: visibleRows, error: listError } = await writer.rpc('list_comments', { p_limit: 100, p_offset: 0 });
if (listError) throw listError;
assert(!visibleRows.some(row => row.comment_id === created.comment_id), 'commentaire supprime encore visible');

await listener.removeChannel(channel);
await attacker.removeChannel(attackerChannel);
await listener.auth.signOut();
await writer.auth.signOut();
await attacker.auth.signOut();

console.log('Broadcast commentaires OK: create/update/delete prives, payloads limites, anon refuse, injection client refusee');
