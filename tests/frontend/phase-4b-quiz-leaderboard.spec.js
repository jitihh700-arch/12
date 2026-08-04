const { test, expect } = require('@playwright/test');
const {
    writeRuntimeConfig,
    removeRuntimeConfig,
    psql,
    gotoHome,
    openExplorer,
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
});

test.afterAll(() => {
    writeRuntimeConfig();
});

async function createRankedProfile(page, prefix) {
    await gotoHome(page);
    await createProfile(page, `${prefix}_${runId}`);
    await expect(page.locator('#profile-status-label')).toHaveText('Profil actif');
    return currentSession(page);
}

async function startRankedSeries(page) {
    await openExplorer(page);
    await page.locator('.category-card[data-category="series"]').click();
    await expect(page.locator('#game-panel')).toBeVisible();
    await expect(page.locator('#quiz-mode-badge')).toContainText('Mode classé');
    await expect(page.locator('#timer')).toContainText(/10:00|09:59/);
    return page.evaluate(() => window.MemorizQuizSession.getState().session.session_id);
}

test('mode entraînement: Supabase absent, quiz jouable et leaderboard indisponible', async ({ page }) => {
    removeRuntimeConfig();
    await gotoHome(page);
    await expect(page.locator('#profile-status-label')).toHaveText('Mode solo');
    await expect(page.locator('#leaderboard-open')).toBeDisabled();
    await openExplorer(page);
    await page.locator('.category-card[data-category="series"]').click();
    await expect(page.locator('#quiz-mode-badge')).toContainText('Mode entraînement');
    await page.locator('#quick-input').fill('Walter White');
    await page.locator('#quick-submit').click();
    await expect(page.locator('#score')).toContainText('1/20');
    await page.locator('#close-game-btn').click();
});

test('mode classé: start, submit correct/incorrect/duplicate et aucun point envoyé', async ({ page }) => {
    const rpcPayloads = [];
    await page.route('**/rest/v1/rpc/**', async route => {
        const url = route.request().url();
        if (url.includes('start_quiz_session') || url.includes('submit_quiz_answer')) {
            rpcPayloads.push({
                url,
                body: route.request().postDataJSON()
            });
        }
        await route.continue();
    });

    const session = await createRankedProfile(page, 'Ranked');
    await startRankedSeries(page);
    await page.locator('#quick-input').fill('Walter White');
    await page.locator('#quick-submit').click();
    await expect(page.locator('#score')).toContainText('10 pts');
    await expect(page.locator('#score')).toContainText('1/20');
    await expect(page.locator('#answer-display-0')).toContainText('Walter White');

    await page.locator('#quick-input').fill('Mauvaise réponse');
    await page.locator('#quick-submit').click();
    await expect(page.locator('#score')).toContainText('1/20');

    await page.locator('#quick-input').fill('Walter White');
    await page.locator('#quick-submit').click();
    await expect(page.locator('#score')).toContainText('1/20');

    const forbiddenKeys = ['user_id', 'pseudo', 'points', 'correct_answers', 'quizzes_completed', 'last_played_at', 'completed_at', 'answer_id'];
    for (const payload of rpcPayloads) {
        const serialized = JSON.stringify(payload.body || {});
        for (const key of forbiddenKeys) expect(serialized).not.toContain(key);
    }
    expect(psql(`select total_points from public.profiles where id = '${session.userId}'::uuid`)).toBe('0');
    await page.locator('#close-game-btn').click();
});

test('restauration: reload reprend la même session et seulement les réponses trouvées', async ({ page }) => {
    await createRankedProfile(page, 'Restore');
    const sessionId = await startRankedSeries(page);
    await page.locator('#quick-input').fill('Walter White');
    await page.locator('#quick-submit').click();
    await expect(page.locator('#score')).toContainText('1/20');

    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('#game-panel')).toBeVisible();
    await expect(page.locator('#quiz-mode-badge')).toContainText('Mode classé');
    await expect(page.locator('#answer-display-0')).toContainText('Walter White');
    await expect(page.locator('#score')).toContainText('10 pts');
    const restoredId = await page.evaluate(() => window.MemorizQuizSession.getState().session.session_id);
    expect(restoredId).toBe(sessionId);
    const exposed = await page.locator('#found-list').textContent();
    expect(exposed).toContain('Walter White');
    expect(exposed).not.toContain('Jesse Pinkman');
    await page.locator('#close-game-btn').click();
});

test('sécurité du score et finalisation: DOM falsifié sans effet, crédit serveur unique', async ({ page }) => {
    const session = await createRankedProfile(page, 'Secure');
    await startRankedSeries(page);
    await page.locator('#quick-input').fill('Walter White');
    await page.locator('#quick-submit').click();
    await page.evaluate(() => {
        document.getElementById('score').textContent = '🎯 999999 pts · 20/20';
    });
    expect(psql(`select total_points from public.profiles where id = '${session.userId}'::uuid`)).toBe('0');

    const first = await page.evaluate(() => window.MemorizQuizSession.complete());
    const second = await page.evaluate(() => window.MemorizQuizSession.complete());
    expect(first.data.points_awarded).toBe(10);
    expect(['already_completed', 'completed']).toContain(second.data.result);
    expect(psql(`select total_points from public.profiles where id = '${session.userId}'::uuid`)).toBe('10');
    await expect(page.locator('#profile-stats')).toContainText('10 pt');
    await page.locator('#close-game-btn').click();
});

test('fermeture et restart: abandon sans crédit puis nouvelle session', async ({ page }) => {
    const session = await createRankedProfile(page, 'Restart');
    const firstSession = await startRankedSeries(page);
    await page.locator('#quick-input').fill('Walter White');
    await page.locator('#quick-submit').click();
    await page.locator('#restart-category-btn').click();
    await expect(page.locator('#score')).toContainText('0/20');
    const secondSession = await page.evaluate(() => window.MemorizQuizSession.getState().session.session_id);
    expect(secondSession).not.toBe(firstSession);
    expect(psql(`select status || '|' || points_awarded from public.quiz_sessions where id = '${firstSession}'::uuid`)).toBe('abandoned|0');
    expect(psql(`select total_points from public.profiles where id = '${session.userId}'::uuid`)).toBe('0');
    await page.locator('#close-game-btn').click();
    expect(psql(`select status from public.quiz_sessions where id = '${secondSession}'::uuid`)).toBe('abandoned');
});

test('leaderboard: Top 20, rang personnel, refresh, accessibilité et responsive', async ({ page }) => {
    const session = await createRankedProfile(page, 'Board');
    psql(`update public.profiles set total_points = 40, quizzes_completed = 4, last_played_at = now() where id = '${session.userId}'::uuid`);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('#leaderboard-open')).toBeEnabled();
    await page.locator('#leaderboard-open').focus();
    await page.locator('#leaderboard-open').click();
    await expect(page.locator('#leaderboard-modal .leaderboard-modal-content')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('#leaderboard-modal .leaderboard-modal-content')).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('#leaderboard-status')).toContainText('Classement à jour');
    await expect.poll(() => page.locator('#leaderboard-list .leaderboard-row').count()).toBeGreaterThan(0);
    await expect(page.locator('#leaderboard-my-rank')).toContainText(`Board_${runId}`);
    await expect(page.locator('#leaderboard-close')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#leaderboard-refresh')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#leaderboard-modal')).toBeHidden();
    await expect(page.locator('#leaderboard-open')).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#leaderboard-open').click();
    await expectNoHorizontalOverflow(page);
    await page.locator('#leaderboard-close').click();
    await expect(page.locator('#leaderboard-modal')).toBeHidden();
    await page.setViewportSize({ width: 780, height: 844 });
    await page.locator('#leaderboard-open').click();
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await expectNoHorizontalOverflow(page);
    await page.locator('#leaderboard-close').click();
    await expect(page.locator('#leaderboard-modal')).toBeHidden();
});

test('deux utilisateurs: session A interdite à B', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await createRankedProfile(pageA, 'UserA');
    const sessionA = await startRankedSeries(pageA);
    await createRankedProfile(pageB, 'UserB');
    const forced = await pageB.evaluate(async sessionId => {
        const api = window.MemorizProfileApi.init(window.MEMORIZ_SUPABASE_CONFIG);
        const state = await api.getMyQuizSessionState(sessionId);
        const submit = await api.submitQuizAnswer(sessionId, 'Walter White');
        const complete = await api.completeQuizSession(sessionId);
        return {
            state: state.error?.message || '',
            submit: submit.error?.message || '',
            complete: complete.error?.message || ''
        };
    }, sessionA);
    expect(forced.state).toContain('session_forbidden');
    expect(forced.submit).toContain('session_forbidden');
    expect(forced.complete).toContain('session_forbidden');

    await contextA.close();
    await contextB.close();
});
