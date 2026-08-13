(function() {
    let initialized = false;

    function byId(id) {
        return document.getElementById(id);
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

    function categoryCards() {
        return [...document.querySelectorAll('.category-card[data-category]')];
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

    function suggestionLabel(card) {
        return card.querySelector('h3')?.textContent?.trim() || card.dataset.category || '';
    }

    function renderCategorySuggestions(query, activeFilter) {
        const input = byId('v4-category-search');
        const suggestions = byId('v4-category-suggestions');
        if (!input || !suggestions) return;

        suggestions.replaceChildren();
        if (!query) {
            suggestions.hidden = true;
            return;
        }

        const matches = categoryCards()
            .filter(card => {
                const matchesFilter = activeFilter === 'all' || card.dataset.v4Theme === activeFilter;
                return matchesFilter && card.dataset.v4Search.includes(query);
            })
            .slice(0, 5);

        if (!matches.length) {
            suggestions.hidden = true;
            return;
        }

        matches.forEach(card => {
            const label = suggestionLabel(card);
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.addEventListener('click', () => {
                input.value = label;
                input.focus();
                filterCategories();
            });
            suggestions.append(button);
        });
        suggestions.hidden = false;
    }

    function filterCategories() {
        const input = byId('v4-category-search');
        const clear = byId('v4-category-clear');
        const empty = byId('v4-category-empty');
        const activeFilter = document.querySelector('[data-v4-filter].is-active')?.getAttribute('data-v4-filter') || 'all';
        const query = normalize(input?.value || '');
        let visibleCount = 0;

        categoryCards().forEach(card => {
            const matchesQuery = !query || card.dataset.v4Search.includes(query);
            const matchesFilter = activeFilter === 'all' || card.dataset.v4Theme === activeFilter;
            const visible = matchesQuery && matchesFilter;
            card.hidden = !visible;
            if (visible) visibleCount += 1;
        });

        if (clear) clear.hidden = !query;
        renderCategorySuggestions(query, activeFilter);
        if (empty) empty.hidden = visibleCount !== 0;
    }

    function bindExplorer() {
    const search = byId('v4-category-search');
    const clear = byId('v4-category-clear');
    const searchForm = document.querySelector('.v4-search');

    search?.addEventListener('input', filterCategories);
    clear?.addEventListener('click', () => {
        search.value = '';
        search.focus();
        filterCategories();
    });

    // 🔴 BLOQUE le rechargement de page à l'appui sur Entrée
    searchForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        filterCategories();
    });

        // ← AJOUTER CE BLOC
        searchForm?.addEventListener('submit', (e) => {
            e.preventDefault();
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
                const category = card.getAttribute('data-category');
                if (category && typeof window.showGamePanel === 'function') {
                    window.showGamePanel(category);
                    return;
                }
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
            target.focus({ preventScroll: true });
        }
    }

    function setMobileMenu(open) {
        const button = byId('v4-menu-toggle');
        const menu = byId('v4-mobile-menu');
        if (!button || !menu) return;

        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        button.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
        menu.hidden = !open;
    }

    function bindNavigation() {
        document.addEventListener('click', event => {
            // 🔴 CORRECTION : ignorer les clics à l'intérieur des modales, commentaires et sections interactives
            if (event.target.closest('.multiplayer-modal, .profile-modal, .leaderboard-modal, .comments-section, .modal, [aria-modal="true"]')) {
                return;
            }

            const menuButton = event.target.closest('#v4-menu-toggle');
            if (menuButton) {
                event.preventDefault();
                const expanded = menuButton.getAttribute('aria-expanded') === 'true';
                setMobileMenu(!expanded);
                return;
            }

            const link = event.target.closest('[data-v4-route]');
            if (!link) return;
            const route = link.getAttribute('data-v4-route');
            if (!route) return;
            event.preventDefault();
            setMobileMenu(false);
            goToRoute(route, { focus: true });
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') setMobileMenu(false);
        });
        byId('v4-nav-profile-action')?.addEventListener('click', () => {
            window.memorizAuth?.openModal?.();
        });
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
        const hasConfig = Boolean(window.MEMORIZ_SUPABASE_CONFIG?.url && window.MEMORIZ_SUPABASE_CONFIG?.publishableKey && window.supabase);
        target.textContent = profile?.pseudo ? profile.pseudo : (hasConfig ? 'Créer profil' : 'Mode solo');
    }

    function init() {
        if (initialized) return;
        initialized = true;
        enrichCategories();
        bindExplorer();
        bindNavigation();
        syncProfileName();
        filterCategories();
        setCurrentRoute(routeFromHash(window.location.hash));
        document.addEventListener('memoriz:profile-ready', syncProfileName);
        document.addEventListener('memoriz:profile-needed', syncProfileName);
        document.addEventListener('memoriz:profile-unavailable', syncProfileName);
        window.addEventListener('hashchange', () => setCurrentRoute(routeFromHash(window.location.hash)));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
