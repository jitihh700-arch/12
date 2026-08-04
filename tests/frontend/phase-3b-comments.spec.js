const { test, expect } = require('@playwright/test');
const {
    writeRuntimeConfig,
    removeRuntimeConfig,
    psql,
    gotoHome,
    openExplorer,
    openCommunity,
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

async function createComment(page, content) {
    await openCommunity(page);
    await page.locator('#comment-input').fill(content);
    await page.locator('#comments-form').evaluate(form => form.requestSubmit());
    await expect(page.locator('.comments-toast')).toContainText('Commentaire ajouté avec succès');
}

async function commentsState(page) {
    return page.evaluate(() => window.MemorizComments.getState());
}

async function openCommentActions(item) {
    await item.locator('[data-action="toggle-actions"]').click();
    await expect(item.locator('[role="menu"]')).toBeVisible();
}

test('mode degrade commentaires: Supabase absent, formulaire bloque et quiz solo utilisable', async ({ page }, testInfo) => {
    removeRuntimeConfig();
    await gotoHome(page);
    await openCommunity(page);
    await expect(page.locator('#comments-status')).toHaveText('Commentaires indisponibles');
    await expect(page.locator('#comment-input')).toBeDisabled();
    await expect(page.locator('#comments-feed-status')).toContainText('quiz solo reste disponible');
    await page.screenshot({ path: testInfo.outputPath('comments-unavailable.png'), fullPage: true });
    await openExplorer(page);
    await page.locator('.category-card[data-category="series"]').click();
    await expect(page.locator('#score')).toContainText('0/20');
    await page.locator('#close-game-btn').click();
});

test('creation: validations, compteur, succes, quota et HTML rendu en texte', async ({ page }, testInfo) => {
    await gotoHome(page);
    await createProfile(page, `Com_${runId}`);
    await openCommunity(page);
    await expect(page.locator('#comments-feed-status')).toContainText(/Aucun commentaire|commentaire/);

    await expect(page.locator('#comment-counter')).toHaveText('0 / 500');
    await page.locator('#comment-input').fill('   ');
    await page.locator('#comments-form').evaluate(form => form.requestSubmit());
    await expect(page.locator('#comments-error')).toContainText('Écris un commentaire');

    const fiveHundred = 'a'.repeat(500);
    await page.locator('#comment-input').fill(fiveHundred);
    await expect(page.locator('#comment-counter')).toHaveText('500 / 500');
    await page.locator('#comment-input').evaluate(input => {
        input.value = 'b'.repeat(501);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.locator('#comments-form').evaluate(form => form.requestSubmit());
    await expect(page.locator('#comments-error')).toContainText('500 caractères maximum');

    await createComment(page, '<script>alert("xss")</script>');
    await expect(page.locator('.comment-content').first()).toHaveText('<script>alert("xss")</script>');
    await page.screenshot({ path: testInfo.outputPath('comments-xss-text.png'), fullPage: true });
    const xss = await page.evaluate(() => window.__xssRan || false);
    expect(xss).toBe(false);

    const session = await currentSession(page);
    const values = Array.from({ length: 49 }, (_, index) => `('${session.userId}'::uuid, 'quota ${index}')`).join(',');
    psql(`insert into public.comments (user_id, content) values ${values}`);
    await page.locator('#comment-input').fill('commentaire 51');
    await page.locator('#comments-form').evaluate(form => form.requestSubmit());
    await expect(page.locator('#comments-error')).toContainText('limite de 50 commentaires');
});

test('lecture et pagination: ordre serveur, charger plus et absence de doublons', async ({ page }, testInfo) => {
    await gotoHome(page);
    await createProfile(page, `Pag_${runId}`);
    await openCommunity(page);
    await page.evaluate(async () => {
        const api = window.MemorizProfileApi.init(window.MEMORIZ_SUPABASE_CONFIG);
        for (let index = 0; index < 23; index += 1) {
            const { error } = await api.createComment(`page ${String(index).padStart(2, '0')}`);
            if (error) throw error;
        }
        await window.MemorizComments.reload();
    });

    await expect(page.locator('.comment-item')).toHaveCount(20);
    await expect(page.locator('.comment-content').first()).toHaveText('page 22');
    await expect(page.locator('#comments-load-more')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('comments-many-desktop.png'), fullPage: true });
    await page.locator('#comments-load-more').click();
    await expect(page.locator('.comment-item')).toHaveCount(23);
    await expect(page.locator('#comments-load-more')).toBeHidden();
    const ids = (await commentsState(page)).comments.map(comment => comment.id);
    expect(new Set(ids).size).toBe(ids.length);
});

test('deux utilisateurs: Broadcast, actions proprietaire et refus serveur force', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await gotoHome(pageA);
    await createProfile(pageA, `A_${runId}`);
    await gotoHome(pageB);
    await createProfile(pageB, `B_${runId}`);
    await openCommunity(pageB);

    await createComment(pageA, 'message de A');
    await expect(pageB.locator('.comment-content').filter({ hasText: 'message de A' })).toBeVisible({ timeout: 20000 });
    await expect(pageA.locator('.comment-content').filter({ hasText: 'message de A' })).toHaveCount(1);

    const itemB = pageB.locator('.comment-item').filter({ hasText: 'message de A' });
    await expect(itemB.locator('[data-action="toggle-actions"]')).toHaveCount(0);
    await expect(itemB.locator('[data-action="edit"]')).toHaveCount(0);
    await expect(itemB.locator('[data-action="delete"]')).toHaveCount(0);

    const commentId = (await commentsState(pageA)).comments.find(comment => comment.content === 'message de A').id;
    const forced = await pageB.evaluate(async id => {
        const api = window.MemorizProfileApi.init(window.MEMORIZ_SUPABASE_CONFIG);
        const update = await api.updateMyComment(id, 'attaque');
        const deletion = await api.deleteMyComment(id);
        return {
            update: update.error?.message || '',
            deletion: deletion.error?.message || ''
        };
    }, commentId);
    expect(forced.update).toContain('comment_forbidden');
    expect(forced.deletion).toContain('comment_forbidden');

    await contextA.close();
    await contextB.close();
});

test('modification, annulation, suppression logique et list_comments sans contenu supprime', async ({ browser }, testInfo) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await gotoHome(pageA);
    await createProfile(pageA, `EditA_${runId}`);
    await gotoHome(pageB);
    await createProfile(pageB, `EditB_${runId}`);
    await openCommunity(pageB);
    await createComment(pageA, 'a modifier');

    const item = pageA.locator('.comment-item').filter({ hasText: 'a modifier' });
    await openCommentActions(item);
    await item.locator('[data-action="edit"]').click();
    await expect(pageA.locator('.comment-edit-input')).toBeFocused();
    await pageA.screenshot({ path: testInfo.outputPath('comments-edit-mode.png'), fullPage: true });
    await pageA.locator('[data-action="cancel-edit"]').click();
    await expect(pageA.locator('.comment-edit-input')).toHaveCount(0);

    await openCommentActions(item);
    await item.locator('[data-action="edit"]').click();
    await pageA.locator('.comment-edit-input').fill('modifie chez A');
    await pageA.locator('.comment-edit').evaluate(form => form.requestSubmit());
    await expect(pageA.locator('.comment-edited').first()).toHaveText('Modifié');
    await expect(pageB.locator('.comment-content').filter({ hasText: 'modifie chez A' })).toBeVisible({ timeout: 20000 });

    const editedItem = pageA.locator('.comment-item').filter({ hasText: 'modifie chez A' });
    await openCommentActions(editedItem);
    await editedItem.locator('[data-action="delete"]').click();
    await pageA.locator('[data-action="cancel-delete"]').click();
    await expect(pageA.locator('.comment-content').filter({ hasText: 'modifie chez A' })).toBeVisible();
    await openCommentActions(editedItem);
    await editedItem.locator('[data-action="delete"]').click();
    await expect(pageA.locator('[role="alertdialog"]')).toBeVisible();
    await pageA.screenshot({ path: testInfo.outputPath('comments-delete-confirmation.png'), fullPage: true });
    await pageA.locator('[data-action="confirm-delete"]').click();
    await expect(pageA.locator('.comment-content').filter({ hasText: 'modifie chez A' })).toHaveCount(0);
    await expect(pageB.locator('.comment-content').filter({ hasText: 'modifie chez A' })).toHaveCount(0, { timeout: 20000 });

    const visibleAfterDelete = await pageA.evaluate(async () => {
        const api = window.MemorizProfileApi.init(window.MEMORIZ_SUPABASE_CONFIG);
        const { data } = await api.listComments({ limit: 100, offset: 0 });
        return data.some(row => row.content === 'modifie chez A');
    });
    expect(visibleAfterDelete).toBe(false);

    await contextA.close();
    await contextB.close();
});

test('pseudo, payload malforme, responsive, accessibilite et regression generale', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHome(page);
    await createProfile(page, `Pseudo_${runId}`);
    await createComment(page, '<img src=x onerror=alert(1)>');
    await createComment(page, '<b>texte</b>');
    await expect(page.locator('.comment-content').filter({ hasText: '<img src=x onerror=alert(1)>' })).toBeVisible();
    await expect(page.locator('.comment-content').filter({ hasText: '<b>texte</b>' })).toBeVisible();

    const malformed = await page.evaluate(() => ({
        publicPayload: window.MemorizComments.validatePublicPayload({ id: 'bad' }),
        deletePayload: window.MemorizComments.validateDeletePayload({ id: 'bad', deleted_at: 'now' })
    }));
    expect(malformed.publicPayload).toBe(null);
    expect(malformed.deletePayload).toBe(null);

    const session = await currentSession(page);
    psql(`update public.profiles set created_at = now() - interval '16 days', updated_at = now() - interval '15 days', pseudo_changed_at = now() - interval '15 days' where id = '${session.userId}'::uuid`);
    await page.reload({ waitUntil: 'networkidle' });
    await openCommunity(page);
    await page.locator('#profile-primary-action').evaluate(button => button.click());
    await page.locator('#profile-pseudo-input').fill(`NewPseudo_${runId}`);
    await page.locator('#profile-form').evaluate(form => form.requestSubmit());
    await expect(page.locator('.comment-author').first()).toHaveText(`NewPseudo_${runId}`);

    await expect(page.locator('#comments-section')).toHaveAttribute('aria-labelledby', 'comments-title');
    await expect(page.locator('label[for="comment-input"]')).toBeVisible();
    await expect(page.locator('#comments-feed-status')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('time').first()).toHaveAttribute('datetime', /T/);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('comments-desktop.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('comments-mobile.png'), fullPage: true });
    await page.locator('#themeToggle').evaluate(button => button.click());
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('comments-mobile-light.png'), fullPage: true });
    await page.setViewportSize({ width: 780, height: 844 });
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await expectNoHorizontalOverflow(page);

    await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
    await openExplorer(page);
    await expect(page.locator('.category-card')).toHaveCount(26);
    await page.locator('.category-card[data-category="series"]').click();
    await page.locator('#quick-input').fill('Walter White');
    await page.locator('#quick-submit').click();
    await expect(page.locator('#score')).toContainText('1/20');
    await expect(page.locator('#timer')).toContainText(/10:00|09:59/);
    await page.locator('#close-game-btn').click();
    await page.locator('#privacy-link').evaluate(link => link.click());
    await expect(page.locator('#legal-modal')).toContainText('suppression logique');
    await page.locator('.close-modal').click();
});
