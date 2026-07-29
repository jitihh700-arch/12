import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

const env = {
    NODE_ENV: 'development',
    FRONTEND_ORIGIN: 'http://127.0.0.1:4173',
    FRONTEND_ORIGINS: ['http://127.0.0.1:4173'],
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_PUBLISHABLE_KEY: 'publishable-placeholder',
    SUPABASE_SECRET_KEY: 'secret-placeholder'
};

const productionEnv = {
    ...env,
    NODE_ENV: 'production',
    FRONTEND_ORIGIN: 'https://frontend.example',
    FRONTEND_ORIGINS: ['https://frontend.example']
};

describe('Express app', () => {
    it('retourne un healthcheck sans secret', async () => {
        const app = createApp({ env, multiplayerService: {}, authVerifier: async () => ({ userId: 'u1' }) });
        const response = await request(app).get('/health').expect(200);
        expect(response.body.status).toBe('ok');
        expect(response.body.version).toBe('phase-6');
        expect(JSON.stringify(response.body)).not.toMatch(/secret|token|key/i);
    });

    it('autorise le healthcheck de production sans Origin ni Authorization', async () => {
        const app = createApp({ env: productionEnv, multiplayerService: {}, authVerifier: async () => ({ userId: 'u1' }) });
        const response = await request(app).get('/health').expect(200);
        expect(response.body.status).toBe('ok');
        expect(response.body.version).toBe('phase-6');
        expect(JSON.stringify(response.body)).not.toMatch(/secret|token|key|stack|SUPABASE|FRONTEND_ORIGIN/i);
    });

    it('autorise le healthcheck de production depuis une origine frontend autorisee', async () => {
        const app = createApp({ env: productionEnv, multiplayerService: {}, authVerifier: async () => ({ userId: 'u1' }) });
        const response = await request(app)
            .get('/health')
            .set('Origin', 'https://frontend.example')
            .expect(200);
        expect(response.body.version).toBe('phase-6');
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('refuse le diagnostic multijoueur sans bearer token', async () => {
        const app = createApp({
            env,
            multiplayerService: { getState: async () => [] },
            authVerifier: async () => {
                throw Object.assign(new Error('authentication_required'), { code: 'authentication_required' });
            }
        });
        const response = await request(app).get('/api/multiplayer/status/ABC234').expect(401);
        expect(response.body.error).toBe('authentication_required');
    });

    it('applique une liste CORS fermee', async () => {
        const app = createApp({ env, multiplayerService: {}, authVerifier: async () => ({ userId: 'u1' }) });
        await request(app)
            .options('/api/multiplayer/status/ABC234')
            .set('Origin', 'http://127.0.0.1:4173')
            .set('Access-Control-Request-Method', 'GET')
            .expect(204)
            .expect('Access-Control-Allow-Origin', 'http://127.0.0.1:4173');

        const denied = await request(app)
            .get('/api/multiplayer/status/ABC234')
            .set('Origin', 'https://evil.example')
            .expect(403);
        expect(denied.body.error).toBe('cors_origin_denied');
    });

    it('garde une CORS applicative stricte en production sans wildcard', async () => {
        const app = createApp({
            env: productionEnv,
            multiplayerService: { getState: async () => [] },
            authVerifier: async () => ({ userId: 'u1', accessToken: 'token' })
        });

        await request(app)
            .options('/api/multiplayer/status/ABC234')
            .set('Origin', 'https://frontend.example')
            .set('Access-Control-Request-Method', 'GET')
            .expect(204)
            .expect('Access-Control-Allow-Origin', 'https://frontend.example');

        const denied = await request(app)
            .get('/api/multiplayer/status/ABC234')
            .set('Origin', 'https://evil.example')
            .set('Authorization', 'Bearer token')
            .expect(403);
        expect(denied.body.error).toBe('cors_origin_denied');
        expect(denied.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('retourne un etat controle au participant authentifie', async () => {
        const app = createApp({
            env,
            multiplayerService: {
                getState: async () => [{
                    game_code: 'ABC234',
                    category_id: 'series',
                    status: 'waiting',
                    max_players: 4,
                    current_players: 1,
                    host_id: 'u1',
                    duration_seconds: 600,
                    player_id: 'p1',
                    user_id: 'u1',
                    pseudo: 'Host',
                    score: 0,
                    correct_answers: 0,
                    is_ready: true,
                    is_connected: true,
                    is_host: true,
                    rank: 1
                }]
            },
            authVerifier: async () => ({ userId: 'u1', accessToken: 'token' })
        });
        const response = await request(app)
            .get('/api/multiplayer/status/ABC234')
            .set('Authorization', 'Bearer token')
            .expect(200);
        expect(response.body.data.gameCode).toBe('ABC234');
        expect(response.body.data.players[0].pseudo).toBe('Host');
    });
});
