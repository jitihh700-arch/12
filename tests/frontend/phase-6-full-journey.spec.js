const { test, expect } = require('@playwright/test');
const {
    writeRuntimeConfig,
    removeRuntimeConfig,
    psql,
    gotoHome,
    createProfile,
    currentSession,
    expectNoHorizontalOverflow
} = require('./helpers/phase2b-helpers');

test.describe.configure({ mode: 'serial' });

const runId = Date.now().toString().slice(-8);

test.beforeAll(() => {
    writeRuntimeConfig();
});

test.beforeEach(() => {
    writeRuntimeConfig();
    psql('delete from public.comments');
});

test.afterAll(() => {
    writeRuntimeConfig();
});

async function installFakeMultiplayer(page) {
    await page.addInitScript(() => {
        window.MEMORIZ_MULTIPLAYER_CONFIG = { url: 'http://backend.test' };
        window.__phase6Payloads = [];
        window.__phase6Snapshot = {
            gameCode: 'ZX45YU',
            categoryId: 'series',
            status: 'waiting',
            maxPlayers: 4,
            currentPlayers: 2,
            hostId: 'u1',
            durationSeconds: 600,
            expiresAt: new Date(Date.now() + 600000).toISOString(),
            players: [
                { playerId: 'p1', pseudo: 'Alpha', score: 0, correctAnswers: 0, isReady: true, isConnected: true, isHost: true, isCurrent: true, rank: 1 },
                { playerId: 'p2', pseudo: 'Beta', score: 0, correctAnswers: 0, isReady: true, isConnected: true, isHost: false, isCurrent: false, rank: 2 }
            ],
            myFoundAnswers: []
        };
    });
}

async function enableFakeSocket(page) {
    await page.evaluate(() => {
        window.MemorizMultiplayerSocket = {
            async connect() {
                document.dispatchEvent(new CustomEvent('memoriz:multiplayer-network', { detail: { connected: true } }));
            },
            on() {},
            disconnect() {},
            getState() {
                return { connected: true };
            },
            async emitWithAck(event, payload) {
                window.__phase6Payloads.push({ event, payload });
                const snapshot = window.__phase6Snapshot;
                if (event === 'createGame') return { created: { game_code: snapshot.gameCode }, snapshot };
                if (event === 'setReady') {
                    snapshot.players[0].isReady = payload.ready;
                    return { updated: { result: 'ready_updated' }, snapshot };
                }
                if (event === 'startGame') {
                    snapshot.status = 'playing';
                    snapshot.expiresAt = new Date(Date.now() + 600000).toISOString();
                    return { started: { result: 'started' }, snapshot };
                }
                if (event === 'submitAnswer') {
                    snapshot.players[0].score = 10;
                    snapshot.players[0].correctAnswers = 1;
                    snapshot.myFoundAnswers = [{ display: 'Walter White', displayOrder: 1 }];
                    return { result: { result: 'correct' }, snapshot };
                }
                if (event === 'sendReaction') {
                    window.MemorizReactions.showReaction({ reactionType: payload.reactionType, pseudo: 'Beta', gameCode: payload.gameCode });
                    return { reactionType: payload.reactionType, pseudo: 'Beta' };
                }
                if (event === 'requestGameState') return snapshot;
                if (event === 'leaveGame') return { result: 'left' };
                return snapshot;
            }
        };
    });
}

test('parcours complet: profil, commentaire, quiz classe, leaderboard, multijoueur, reaction et pseudo', async ({ page }) => {
    await installFakeMultiplayer(page);
    await gotoHome(page);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await createProfile(page, `Phase6_${runId}`);
    await enableFakeSocket(page);

    await page.locator('#comment-input').fill('Commentaire Phase 6');
    await page.locator('#comments-form').evaluate(form => form.requestSubmit());
    await expect(page.locator('.comment-content').filter({ hasText: 'Commentaire Phase 6' })).toBeVisible();

    await page.locator('.category-card[data-category="series"]').click();
    await expect(page.locator('#quiz-mode-badge')).toContainText('Mode classé');
    await page.locator('#quick-input').fill('Walter White');
    await page.locator('#quick-submit').click();
    await expect(page.locator('#score')).toContainText('10 pts');
    await page.evaluate(() => window.MemorizQuizSession.complete());
    await page.locator('#close-game-btn').click();
    await expect(page.locator('#profile-stats')).toContainText('10 pt');

    await page.locator('#leaderboard-open').click();
    await expect(page.locator('#leaderboard-my-rank')).toContainText(`Phase6_${runId}`);
    await page.locator('#leaderboard-close').click();
    await expect(page.locator('#leaderboard-modal')).toBeHidden();
    await expect(page.locator('#leaderboard-open')).toBeFocused();

    await page.locator('#multiplayer-open').click();
    await page.locator('#multiplayer-create').click();
    await expect(page.locator('#multiplayer-code-display')).toHaveText('ZX45YU');
    await page.locator('#multiplayer-start').click();
    await page.locator('#multiplayer-answer-input').fill('Walter White');
    await page.locator('#multiplayer-answer-form').evaluate(form => form.requestSubmit());
    await expect(page.locator('#multiplayer-score-live')).toContainText('10 pts');
    await page.locator('.reaction-button[data-reaction-type="heart"]').click();
    await expect(page.locator('.reaction-toast')).toContainText('Beta');

    const payloads = await page.evaluate(() => JSON.stringify(window.__phase6Payloads));
    for (const key of ['user_id', 'pseudo', 'score', 'points', 'answer_id', 'host_id']) {
        expect(payloads).not.toContain(key);
    }

    await page.locator('#multiplayer-close').click();
    const session = await currentSession(page);
    psql(`update public.profiles set created_at = now() - interval '16 days', updated_at = now() - interval '15 days', pseudo_changed_at = now() - interval '15 days' where id = '${session.userId}'::uuid`);
    await page.reload({ waitUntil: 'networkidle' });
    await enableFakeSocket(page);
    await page.locator('#profile-primary-action').click();
    await page.locator('#profile-pseudo-input').fill(`Phase6New_${runId}`);
    await page.locator('#profile-form').evaluate(form => form.requestSubmit());
    await expect(page.locator('#profile-pseudo')).toHaveText(`Phase6New_${runId}`);
    await page.evaluate(() => window.MemorizComments.reload());
    await expect(page.locator('.comment-author').first()).toHaveText(`Phase6New_${runId}`);

    await page.locator('.comment-item').filter({ hasText: 'Commentaire Phase 6' }).locator('[data-action="delete"]').click();
    await page.locator('[data-action="confirm-delete"]').click();
    await expect(page.locator('.comment-content').filter({ hasText: 'Commentaire Phase 6' })).toHaveCount(0);
});

test('mode degrade final: Supabase, backend et Socket indisponibles sans bloquer le solo', async ({ page }) => {
    removeRuntimeConfig();
    await gotoHome(page);
    await expect(page.locator('#profile-status-label')).toHaveText('Mode solo');
    await expect(page.locator('#leaderboard-open')).toBeDisabled();
    await expect(page.locator('#multiplayer-open')).toBeDisabled();
    await page.locator('.category-card[data-category="series"]').click();
    await page.locator('#quick-input').fill('Walter White');
    await page.locator('#quick-submit').click();
    await expect(page.locator('#score')).toContainText('1/20');
    await expectNoHorizontalOverflow(page);
});
