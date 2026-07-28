(function() {
    const state = {
        api: null,
        profile: null,
        openButton: null,
        lastFocus: null,
        loading: false
    };

    function getEls() {
        return {
            button: document.getElementById('leaderboard-open'),
            modal: document.getElementById('leaderboard-modal'),
            dialog: document.querySelector('#leaderboard-modal .leaderboard-modal-content'),
            close: document.getElementById('leaderboard-close'),
            refresh: document.getElementById('leaderboard-refresh'),
            status: document.getElementById('leaderboard-status'),
            list: document.getElementById('leaderboard-list'),
            mine: document.getElementById('leaderboard-my-rank')
        };
    }

    function getApi() {
        if (state.api) return state.api;
        try {
            state.api = window.MemorizProfileApi?.init(window.MEMORIZ_SUPABASE_CONFIG || {});
            return state.api;
        } catch (error) {
            return null;
        }
    }

    function setStatus(text) {
        const els = getEls();
        if (els.status) els.status.textContent = text;
    }

    function clearNode(node) {
        if (node) node.replaceChildren();
    }

    function formatDate(value) {
        if (!value) return 'Aucune activité';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Date indisponible';
        return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
    }

    function stat(label, value) {
        const item = document.createElement('span');
        const strong = document.createElement('strong');
        strong.textContent = String(value);
        const caption = document.createElement('span');
        caption.textContent = label;
        item.append(strong, caption);
        return item;
    }

    function renderMine(rank) {
        const els = getEls();
        clearNode(els.mine);
        const title = document.createElement('h3');
        title.textContent = 'Mon classement';
        els.mine.append(title);

        if (!rank) {
            const empty = document.createElement('p');
            empty.textContent = 'Crée un profil puis termine un quiz classé pour afficher ton rang.';
            els.mine.append(empty);
            return;
        }

        const card = document.createElement('div');
        card.className = 'leaderboard-my-card';
        const pseudo = document.createElement('strong');
        pseudo.textContent = rank.pseudo || 'Profil';
        pseudo.title = pseudo.textContent;
        const stats = document.createElement('div');
        stats.className = 'leaderboard-stat-grid';
        stats.append(
            stat('rang', rank.rank ? `${rank.rank}/${rank.total_players || '?'}` : 'hors classement'),
            stat('points', Number(rank.total_points || 0)),
            stat('quiz', Number(rank.quizzes_completed || 0))
        );
        const activity = document.createElement('span');
        activity.className = 'leaderboard-activity';
        activity.textContent = formatDate(rank.last_played_at);
        card.append(pseudo, stats, activity);
        els.mine.append(card);
    }

    function renderList(rows) {
        const els = getEls();
        clearNode(els.list);
        if (!rows.length) {
            const empty = document.createElement('li');
            empty.className = 'leaderboard-empty';
            empty.textContent = 'Aucun score classé pour le moment.';
            els.list.append(empty);
            return;
        }

        rows.forEach(row => {
            const item = document.createElement('li');
            item.className = 'leaderboard-row';
            if (state.profile && row.pseudo === state.profile.pseudo) item.classList.add('is-current');

            const rank = document.createElement('span');
            rank.className = 'leaderboard-rank';
            rank.textContent = `#${row.rank}`;

            const identity = document.createElement('span');
            identity.className = 'leaderboard-player';
            identity.textContent = row.pseudo || 'Profil';
            identity.title = identity.textContent;

            const points = document.createElement('span');
            points.className = 'leaderboard-points';
            points.textContent = `${Number(row.total_points || 0)} pts`;

            const quizzes = document.createElement('span');
            quizzes.className = 'leaderboard-quizzes';
            quizzes.textContent = `${Number(row.quizzes_completed || 0)} quiz`;

            item.append(rank, identity, points, quizzes);
            els.list.append(item);
        });
    }

    async function reload() {
        const api = getApi();
        const els = getEls();
        if (!api || !state.profile) {
            setStatus('Classement indisponible sans profil actif.');
            clearNode(els.list);
            clearNode(els.mine);
            return;
        }

        state.loading = true;
        if (els.refresh) els.refresh.disabled = true;
        setStatus('Chargement du classement...');
        const [top, mine] = await Promise.all([
            api.getLeaderboard(20),
            api.getMyLeaderboardRank()
        ]);
        state.loading = false;
        if (els.refresh) els.refresh.disabled = false;

        if (top.error || mine.error) {
            setStatus('Classement momentanément indisponible.');
            clearNode(els.list);
            renderMine(null);
            return;
        }

        renderMine(mine.data);
        renderList(top.data);
        setStatus(top.data.length ? 'Classement à jour.' : 'Aucun score classé pour le moment.');
    }

    function focusable(modal) {
        return [...modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
            .filter(element => !element.disabled && !element.hidden);
    }

    async function openModal() {
        const els = getEls();
        if (!els.modal) return;
        state.lastFocus = document.activeElement;
        els.modal.hidden = false;
        els.modal.setAttribute('aria-hidden', 'false');
        window.setTimeout(() => els.close?.focus(), 0);
        await reload();
    }

    function closeModal() {
        const els = getEls();
        if (!els.modal) return;
        els.modal.hidden = true;
        els.modal.setAttribute('aria-hidden', 'true');
        if (state.lastFocus && typeof state.lastFocus.focus === 'function') state.lastFocus.focus();
    }

    function bind() {
        const els = getEls();
        if (!els.modal || !els.button) return;
        els.button.addEventListener('click', openModal);
        els.close.addEventListener('click', closeModal);
        els.refresh.addEventListener('click', reload);
        els.modal.addEventListener('click', event => {
            if (event.target === els.modal) closeModal();
        });
        els.modal.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeModal();
            }
            if (event.key === 'Tab') {
                const items = focusable(els.modal);
                if (!items.length) return;
                event.preventDefault();
                const index = items.indexOf(document.activeElement);
                const direction = event.shiftKey ? -1 : 1;
                items[(index + direction + items.length) % items.length].focus();
            }
        });
    }

    document.addEventListener('DOMContentLoaded', bind);
    document.addEventListener('memoriz:profile-ready', event => {
        state.profile = event.detail.profile;
        const els = getEls();
        if (els.button) els.button.disabled = false;
        if (!getEls().modal?.hidden) reload();
    });
    document.addEventListener('memoriz:profile-unavailable', () => {
        state.profile = null;
        const els = getEls();
        if (els.button) els.button.disabled = true;
    });
    document.addEventListener('memoriz:quiz-finalized', reload);

    window.MemorizLeaderboard = { open: openModal, reload };
})();
