(function() {
    const INTRO_STEPS = [
        ['01-inactive-1920x1080.webp', '01-inactive-1080x1920.webp'],
        ['02-first-mark-1920x1080.webp', '02-first-mark-1080x1920.webp'],
        ['03-second-mark-1920x1080.webp', '03-second-mark-1080x1920.webp'],
        ['04-third-mark-1920x1080.webp', '04-third-mark-1080x1920.webp'],
        ['05-ultimate-1920x1080.webp', '05-ultimate-1080x1920.webp']
    ];
    const STEP_MS = Number(window.MEMORIZ_V4_INTRO_STEP_MS || 520);
    const REDUCED_MS = Number(window.MEMORIZ_V4_INTRO_REDUCED_MS || 220);
    const timers = new Set();

    function byId(id) {
        return document.getElementById(id);
    }

    function setTimer(callback, delay) {
        const id = window.setTimeout(() => {
            timers.delete(id);
            callback();
        }, delay);
        timers.add(id);
        return id;
    }

    function clearTimers() {
        timers.forEach(id => window.clearTimeout(id));
        timers.clear();
    }

    function introPath(kind, file) {
        return `assets/images/memoriz/intro/${kind}/${file}`;
    }

    function preloadIntro() {
        return Promise.all(INTRO_STEPS.flatMap(([web, mobile]) => [introPath('web', web), introPath('mobile', mobile)]).map(src => new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = resolve;
            image.onerror = reject;
            image.src = src;
        })));
    }

    function setIntroStep(index) {
        const intro = byId('v4-intro');
        const image = byId('v4-intro-image');
        const source = byId('v4-intro-source');
        const step = INTRO_STEPS[index];
        if (!image || !source || !step) return;
        if (intro) {
            intro.dataset.step = String(index + 1);
            intro.classList.remove('is-step-1', 'is-step-2', 'is-step-3', 'is-step-4', 'is-step-5');
            intro.classList.add(`is-step-${index + 1}`);
        }
        source.srcset = introPath('web', step[0]);
        image.src = introPath('mobile', step[1]);
    }

    function finishIntro(options = {}) {
        const intro = byId('v4-intro');
        if (!intro) return;
        if (options.immediate) {
            intro.classList.remove('is-active', 'is-leaving');
            intro.setAttribute('aria-hidden', 'true');
            clearTimers();
            restoreProfileModalFocus();
            return;
        }
        intro.classList.add('is-leaving');
        setTimer(() => {
            intro.classList.remove('is-active', 'is-leaving');
            intro.setAttribute('aria-hidden', 'true');
            clearTimers();
            restoreProfileModalFocus();
        }, 380);
    }

    function skipIntro() {
        const intro = byId('v4-intro');
        if (!intro) return;
        intro.dataset.started = 'true';
        intro.classList.remove('is-active', 'is-leaving');
        intro.setAttribute('aria-hidden', 'true');
        clearTimers();
    }

    function restoreProfileModalFocus() {
        const modal = byId('profile-modal');
        const input = byId('profile-pseudo-input');
        if (!modal || modal.hidden || !input) return;
        window.setTimeout(() => input.focus(), 0);
    }

    function watchProfileModalDuringIntro() {
        const modal = byId('profile-modal');
        if (!modal || typeof MutationObserver !== 'function') return;

        const observer = new MutationObserver(() => {
            if (modal.hidden) return;
            finishIntro({ immediate: true });
            restoreProfileModalFocus();
            observer.disconnect();
        });

        observer.observe(modal, { attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });
    }

    function scheduleIntro() {
        const config = window.MEMORIZ_SUPABASE_CONFIG || {};
        const modal = byId('profile-modal');
        if (!config.url || !config.publishableKey || !modal) {
            startIntro();
            return;
        }

        let settled = false;
        let observer = null;
        const run = () => {
            if (settled) return;
            settled = true;
            observer?.disconnect();
            if (!modal.hidden) {
                skipIntro();
                restoreProfileModalFocus();
                return;
            }
            startIntro();
        };

        observer = new MutationObserver(() => {
            if (!modal.hidden) run();
        });
        observer.observe(modal, { attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });
        document.addEventListener('memoriz:profile-ready', run, { once: true });
        document.addEventListener('memoriz:profile-unavailable', run, { once: true });
        setTimer(run, 3000);
    }

    async function startIntro() {
        const intro = byId('v4-intro');
        const fallback = byId('v4-intro-fallback');
        if (!intro || window.MEMORIZ_V4_SKIP_INTRO === true || intro.dataset.started === 'true') return;

        intro.dataset.started = 'true';
        intro.dataset.step = '1';
        intro.classList.add('is-active');
        intro.classList.add('is-step-1');
        intro.setAttribute('aria-hidden', 'false');
        watchProfileModalDuringIntro();

        try {
            await preloadIntro();
        } catch (error) {
            if (fallback) fallback.hidden = false;
            setTimer(finishIntro, REDUCED_MS);
            return;
        }

        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced) {
            setIntroStep(INTRO_STEPS.length - 1);
            setTimer(finishIntro, REDUCED_MS);
            return;
        }

        INTRO_STEPS.forEach((step, index) => {
            setTimer(() => setIntroStep(index), index * STEP_MS);
        });
        setTimer(finishIntro, INTRO_STEPS.length * STEP_MS + 260);
    }

    function normalize(text) {
        return String(text || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    function categoryTheme(key) {
        if (/anime|manga|transformations|combats|arcs|techniques|filles/i.test(key)) return 'anime';
        if (/foot|sport|ballon|ligue/i.test(key)) return 'sport';
        return 'culture';
    }

    function enrichCategories() {
        document.querySelectorAll('.category-card[data-category]').forEach(card => {
            const key = card.getAttribute('data-category');
            if (!key || card.dataset.v4Ready === 'true') return;
            const title = card.querySelector('h3')?.textContent?.trim() || key;
            const description = card.querySelector('p')?.textContent?.trim() || '';
            const count = card.querySelector('.questions-count')?.textContent?.trim() || '';

            const image = document.createElement('img');
            image.className = 'v4-category-image';
            image.src = `assets/images/memoriz/categories/${key}.webp`;
            image.alt = `Illustration de la catégorie ${title}`;
            image.width = 640;
            image.height = 400;
            image.loading = 'lazy';
            image.onerror = () => {
                image.hidden = true;
                card.classList.add('v4-category-missing-image');
            };

            const body = document.createElement('div');
            body.className = 'v4-category-body';

            const heading = document.createElement('h3');
            heading.textContent = title;
            const text = document.createElement('p');
            text.textContent = description;
            const badge = document.createElement('span');
            badge.className = 'questions-count';
            badge.textContent = count;

            body.append(heading, text, badge);
            card.replaceChildren(image, body);
            card.dataset.v4Ready = 'true';
            card.dataset.v4Search = normalize(`${title} ${description} ${count} ${key}`);
            card.dataset.v4Theme = categoryTheme(key);
            card.tabIndex = 0;
            card.setAttribute('role', 'button');
            card.setAttribute('aria-label', `Lancer le quiz ${title}`);
        });
    }

    function filterCategories() {
        const input = byId('v4-category-search');
        const clear = byId('v4-category-clear');
        const empty = byId('v4-category-empty');
        const activeFilter = document.querySelector('[data-v4-filter].is-active')?.getAttribute('data-v4-filter') || 'all';
        const query = normalize(input?.value || '');
        let visibleCount = 0;

        document.querySelectorAll('.category-card[data-category]').forEach(card => {
            const matchesQuery = !query || card.dataset.v4Search.includes(query);
            const matchesFilter = activeFilter === 'all' || card.dataset.v4Theme === activeFilter;
            const visible = matchesQuery && matchesFilter;
            card.hidden = !visible;
            if (visible) visibleCount += 1;
        });

        if (clear) clear.hidden = !query;
        if (empty) empty.hidden = visibleCount !== 0;
    }

    function bindExplorer() {
        const search = byId('v4-category-search');
        const clear = byId('v4-category-clear');
        search?.addEventListener('input', filterCategories);
        clear?.addEventListener('click', () => {
            search.value = '';
            search.focus();
            filterCategories();
        });
        document.querySelectorAll('[data-v4-filter]').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('[data-v4-filter]').forEach(item => item.classList.remove('is-active'));
                button.classList.add('is-active');
                filterCategories();
            });
        });
        document.querySelectorAll('.category-card[data-category]').forEach(card => {
            card.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                card.click();
            });
        });
    }

    function setCurrentRoute(route) {
        document.querySelectorAll('[data-v4-route]').forEach(link => {
            const isCurrent = link.getAttribute('data-v4-route') === route;
            if (isCurrent) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
        const viewRoute = route === 'profile' ? 'home' : route;
        document.querySelectorAll('[data-v4-view]').forEach(view => {
            view.classList.toggle('is-v4-current', view.getAttribute('data-v4-view') === viewRoute);
        });
        document.body.dataset.v4Route = route;
    }

    function routeTarget(route) {
        const targets = {
            home: 'home',
            explorer: 'explorer',
            solo: 'solo',
            multiplayer: 'multiplayer',
            community: 'community',
            articles: 'articles',
            profile: 'profile-card'
        };
        return byId(targets[route] || route);
    }

    function routeFromHash(hash) {
        const value = hash ? hash.replace(/^#/, '') : 'home';
        const hashRoutes = {
            home: 'home',
            explorer: 'explorer',
            solo: 'solo',
            multiplayer: 'multiplayer',
            community: 'community',
            articles: 'articles',
            'profile-card': 'profile'
        };
        return hashRoutes[value] || 'home';
    }

    function goToRoute(route, options = {}) {
        const target = routeTarget(route);
        if (!target) return;
        setCurrentRoute(route);
        window.location.hash = target.id;
        if (!options.silent) target.scrollIntoView({ behavior: 'auto', block: 'start' });
        if (options.focus) {
            target.setAttribute('tabindex', '-1');
            window.setTimeout(() => target.focus({ preventScroll: true }), 260);
        }
    }

    function bindNavigation() {
        document.querySelectorAll('[data-v4-route]').forEach(link => {
            link.addEventListener('click', event => {
                const route = link.getAttribute('data-v4-route');
                if (!route) return;
                event.preventDefault();
                goToRoute(route, { focus: true });
            });
        });
        byId('v4-home-multiplayer')?.addEventListener('click', () => goToRoute('multiplayer', { focus: true }));
        byId('v4-multiplayer-create')?.addEventListener('click', () => {
            window.MemorizMultiplayer?.open?.();
            byId('multiplayer-tab-create')?.click();
        });
        byId('v4-multiplayer-join')?.addEventListener('click', () => {
            window.MemorizMultiplayer?.open?.();
            byId('multiplayer-tab-join')?.click();
        });
    }

    function syncProfileName() {
        const target = byId('v4-nav-profile-name');
        if (!target) return;
        const profile = window.memorizAuth?.getState?.().profile || window.memorizProfile;
        target.textContent = profile?.pseudo ? profile.pseudo : 'Mode solo';
    }

    function init() {
        enrichCategories();
        bindExplorer();
        bindNavigation();
        syncProfileName();
        filterCategories();
        setCurrentRoute(routeFromHash(window.location.hash));
        scheduleIntro();
        document.addEventListener('memoriz:profile-ready', syncProfileName);
        window.addEventListener('hashchange', () => setCurrentRoute(routeFromHash(window.location.hash)));
        window.addEventListener('beforeunload', clearTimers);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
