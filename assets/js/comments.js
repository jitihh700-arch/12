(function() {
    const PAGE_SIZE = 20;
    const MAX_LENGTH = 500;
    const TOPIC = 'comments:public';
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const state = {
        api: null,
        client: null,
        profile: null,
        comments: [],
        hasMore: false,
        loading: false,
        submitting: false,
        editingId: null,
        deletingId: null,
        actionsOpenId: null,
        channel: null,
        reconnectTimer: null,
        toastTimer: null,
        lastRemoteToastAt: 0,
        needsProfile: false,
        replyingToId: null,
        replyingToPseudo: null,
        initialized: false
    };

    function getEls() {
        return {
            section: document.getElementById('comments-section'),
            status: document.getElementById('comments-status'),
            form: document.getElementById('comments-form'),
            input: document.getElementById('comment-input'),
            counter: document.getElementById('comment-counter'),
            error: document.getElementById('comments-error'),
            submit: document.getElementById('comment-submit'),
            feedStatus: document.getElementById('comments-feed-status'),
            list: document.getElementById('comments-list'),
            loadMore: document.getElementById('comments-load-more')
        };
    }

    function normalizeRow(row) {
        if (!row || typeof row !== 'object') return null;
        const id = row.id || row.comment_id;
        if (!isUuid(id) || !isUuid(row.user_id)) return null;
        if (typeof row.pseudo !== 'string' || typeof row.content !== 'string') return null;
        if (typeof row.created_at !== 'string' || typeof row.updated_at !== 'string') return null;
        return {
            id,
            user_id: row.user_id,
            pseudo: row.pseudo,
            content: row.content,
            is_edited: row.is_edited === true,
            created_at: row.created_at,
            updated_at: row.updated_at,
            parent_id: row.parent_id || null
        };
    }

    function isUuid(value) {
        return typeof value === 'string' && UUID_RE.test(value);
    }

    function safeText(value) {
        return String(value == null ? '' : value);
    }

    function cleanContent(value) {
        return safeText(value).trim();
    }

    function countChars(value) {
        return [...safeText(value)].length;
    }

    function validateContent(value) {
        const content = cleanContent(value);
        if (!content) return { ok: false, message: 'Écris un commentaire avant de publier.' };
        if (countChars(content) > MAX_LENGTH) return { ok: false, message: 'Le commentaire doit contenir 500 caractères maximum.' };
        return { ok: true, content };
    }

    function extractErrorKey(error) {
        if (!error) return '';
        const known = [
            'authentication_required',
            'profile_required',
            'invalid_comment_content',
            'comment_too_long',
            'comment_limit_reached',
            'comment_not_found',
            'comment_forbidden',
            'comment_deleted',
            'invalid_pagination'
        ];
        const haystack = [error.message, error.details, error.hint, error.code].filter(Boolean).join(' ');
        return known.find(key => haystack.includes(key)) || error.message || 'unknown_error';
    }

    function describeError(error) {
        const messages = {
            authentication_required: 'Connecte ton profil avant de commenter.',
            profile_required: 'Crée ton pseudo avant de commenter.',
            invalid_comment_content: 'Écris un commentaire avant de publier.',
            comment_too_long: 'Le commentaire doit contenir 500 caractères maximum.',
            comment_limit_reached: 'Vous avez atteint la limite de 50 commentaires',
            comment_not_found: 'Ce commentaire n'est plus disponible.',
            comment_forbidden: 'Tu ne peux modifier que tes propres commentaires.',
            comment_deleted: 'Ce commentaire est déjà supprimé.',
            invalid_pagination: 'La pagination des commentaires est invalide.'
        };
        return messages[extractErrorKey(error)] || 'Les commentaires sont temporairement indisponibles';
    }

    function setText(element, text) {
        if (element) element.textContent = text;
    }

    function setDisabled(disabled) {
        const els = getEls();
        if (els.input) els.input.disabled = disabled;
        if (els.submit) els.submit.disabled = disabled || state.submitting;
    }

    function setNeedsProfile() {
        const els = getEls();
        state.needsProfile = true;
        setDisabled(false);
        if (els.input) {
            els.input.readOnly = true;
            els.input.removeAttribute('aria-disabled');
            els.input.setAttribute('aria-readonly', 'true');
        }
        setText(els.status, 'Pseudo requis');
        setText(els.feedStatus, 'Crée ton pseudo pour charger les commentaires.');
    }

    function setUnavailable(message) {
        const els = getEls();
        state.profile = null;
        state.comments = [];
        state.hasMore = false;
        state.editingId = null;
        state.replyingToId = null;
        state.replyingToPseudo = null;
        state.needsProfile = message.includes('pseudo') || message.includes('profil');
        clearReconnectTimer();
        unsubscribe();
        setDisabled(!state.needsProfile);
        if (els.input) {
            els.input.readOnly = state.needsProfile;
            els.input.removeAttribute('aria-disabled');
            if (state.needsProfile) els.input.setAttribute('aria-readonly', 'true');
            else els.input.removeAttribute('aria-readonly');
        }
        setText(els.status, 'Commentaires indisponibles');
        setText(els.feedStatus, message);
        setText(els.error, '');
        if (els.list) els.list.replaceChildren();
        if (els.loadMore) els.loadMore.hidden = true;
        updateReplyBanner();
    }

    function setReadyStatus(text = 'Commentaires connectés') {
        setText(getEls().status, text);
    }

    function updateCounter(input) {
        const els = getEls();
        const total = countChars(input == null ? els.input?.value : input);
        setText(els.counter, `${total} / ${MAX_LENGTH}`);
    }

    function formatDate(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return new Intl.DateTimeFormat('fr-FR', {
            dateStyle: 'medium',
            timeStyle: 'short'
        }).format(date);
    }

    function createButton(label, action, className = 'comment-action') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.dataset.action = action;
        button.textContent = label;
        return button;
    }

    function showToast(message, type = 'success') {
        let region = document.querySelector('.comments-toast-region');
        if (!region) {
            region = document.createElement('div');
            region.className = 'comments-toast-region';
            region.setAttribute('aria-live', 'polite');
            region.setAttribute('aria-atomic', 'true');
            document.body.append(region);
        }

        region.replaceChildren();
        const toast = document.createElement('div');
        toast.className = 'comments-toast';
        toast.dataset.type = type;
        toast.textContent = message;
        region.append(toast);
        window.clearTimeout(state.toastTimer);
        state.toastTimer = window.setTimeout(() => toast.remove(), 3200);
    }

    function shouldToastRemote() {
        const now = Date.now();
        if (now - state.lastRemoteToastAt < 2500) return false;
        state.lastRemoteToastAt = now;
        return true;
    }

    function upsertComment(comment, position = 'top') {
        const index = state.comments.findIndex(item => item.id === comment.id);
        if (index >= 0) {
            state.comments[index] = { ...state.comments[index], ...comment };
            return false;
        }
        if (position === 'bottom') state.comments.push(comment);
        else state.comments.unshift(comment);
        return true;
    }

    function removeComment(id) {
        const before = state.comments.length;
        state.comments = state.comments.filter(comment => comment.id !== id);
        return state.comments.length !== before;
    }

    function updateReplyBanner() {
        const els = getEls();
        let banner = document.getElementById('comment-reply-banner');
        if (!state.replyingToId) {
            if (banner) banner.remove();
            if (els.input) els.input.placeholder = 'Ton commentaire';
            return;
        }
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'comment-reply-banner';
            banner.className = 'comment-reply-banner';
            els.form.insertBefore(banner, els.form.firstChild);
        }
        banner.innerHTML = '';
        const text = document.createElement('span');
        text.textContent = `En réponse à ${state.replyingToPseudo || 'un commentaire'}`;
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'comment-reply-cancel';
        cancel.textContent = 'Annuler';
        cancel.addEventListener('click', () => {
            state.replyingToId = null;
            state.replyingToPseudo = null;
            updateReplyBanner();
            els.input?.focus();
        });
        banner.append(text, cancel);
        if (els.input) els.input.placeholder = `Réponds à ${state.replyingToPseudo || '...'}`;
    }

    function render() {
        const els = getEls();
        if (!els.list) return;

        const roots = state.comments.filter(c => !c.parent_id);
        const replies = state.comments.filter(c => c.parent_id);
        const fragments = [];

        roots.forEach(comment => {
            const article = renderComment(comment);
            const commentReplies = replies.filter(r => r.parent_id === comment.id);
            if (commentReplies.length) {
                const replyList = document.createElement('div');
                replyList.className = 'comment-replies';
                commentReplies.forEach(reply => replyList.appendChild(renderComment(reply)));
                article.appendChild(replyList);
            }
            fragments.push(article);
        });

        const orphanedReplies = replies.filter(r => !roots.find(root => root.id === r.parent_id));
        orphanedReplies.forEach(reply => fragments.push(renderComment(reply)));

        els.list.replaceChildren(...fragments);

        if (state.profile && state.comments.length === 0 && !state.loading) {
            setText(els.feedStatus, 'Aucun commentaire pour le moment.');
        } else if (state.profile && !state.loading) {
            const rootCount = roots.length;
            setText(els.feedStatus, `${rootCount} commentaire${rootCount > 1 ? 's' : ''} affiché${rootCount > 1 ? 's' : ''}.`);
        }
        if (els.loadMore) {
            els.loadMore.hidden = !state.hasMore || !state.profile;
            els.loadMore.disabled = state.loading;
        }
        updateReplyBanner();
    }

    function renderComment(comment) {
        const article = document.createElement('article');
        article.className = 'comment-item';
        if (comment.parent_id) article.classList.add('is-reply');
        article.dataset.commentId = comment.id;

        if (state.editingId === comment.id) {
            article.append(renderEditForm(comment));
            return article;
        }

        const header = document.createElement('div');
        header.className = 'comment-header';

        const authorLine = document.createElement('div');
        authorLine.className = 'comment-author-line';
        const author = document.createElement('strong');
        author.className = 'comment-author';
        author.textContent = comment.pseudo;
        const time = document.createElement('time');
        time.className = 'comment-date';
        time.setAttribute('datetime', comment.created_at);
        time.textContent = formatDate(comment.created_at);
        authorLine.append(author, time);
        if (comment.is_edited) {
            const edited = document.createElement('span');
            edited.className = 'comment-edited';
            edited.textContent = 'Modifié';
            authorLine.append(edited);
        }

        header.append(authorLine);
        header.append(renderActions(comment));

        const content = document.createElement('p');
        content.className = 'comment-content';
        content.textContent = comment.content;

        article.append(header, content);
        if (state.deletingId === comment.id) article.append(renderDeleteConfirm(comment));
        return article;
    }

    function renderActions(comment) {
        const actions = document.createElement('div');
        actions.className = 'comment-actions';
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'comment-menu-toggle';
        toggle.dataset.action = 'toggle-actions';
        toggle.setAttribute('aria-label', 'Actions du commentaire');
        toggle.setAttribute('aria-haspopup', 'menu');
        toggle.setAttribute('aria-expanded', state.actionsOpenId === comment.id ? 'true' : 'false');
        toggle.textContent = '⋮';
        toggle.addEventListener('click', event => {
            event.stopPropagation();
            state.actionsOpenId = state.actionsOpenId === comment.id ? null : comment.id;
            render();
            document.querySelector(`[data-comment-id="${comment.id}"] [data-action="toggle-actions"]`)?.focus();
        });
        actions.append(toggle);

        if (state.actionsOpenId !== comment.id) return actions;

        const menu = document.createElement('div');
        menu.className = 'comment-actions-menu';
        menu.setAttribute('role', 'menu');

        const reply = createButton('Répondre', 'reply');
        reply.setAttribute('role', 'menuitem');
        reply.setAttribute('aria-label', `Répondre à ${comment.pseudo}`);
        reply.addEventListener('click', event => {
            event.stopPropagation();
            state.actionsOpenId = null;
            state.replyingToId = comment.id;
            state.replyingToPseudo = comment.pseudo;
            render();
            getEls().input?.focus();
        });
        menu.append(reply);

        if (isOwner(comment)) {
            const edit = createButton('Modifier', 'edit');
            edit.setAttribute('role', 'menuitem');
            edit.setAttribute('aria-label', 'Modifier mon commentaire');
            edit.addEventListener('click', event => {
                event.stopPropagation();
                state.actionsOpenId = null;
                startEdit(comment.id);
            });
            const del = createButton('Supprimer', 'delete');
            del.setAttribute('role', 'menuitem');
            del.setAttribute('aria-label', 'Supprimer mon commentaire');
            del.addEventListener('click', event => {
                event.stopPropagation();
                state.actionsOpenId = null;
                state.deletingId = comment.id;
                render();
                document.querySelector(`[data-comment-id="${comment.id}"] [data-action="confirm-delete"]`)?.focus();
            });
            menu.append(edit, del);
        }

        actions.append(menu);
        return actions;
    }

    function renderEditForm(comment) {
        const form = document.createElement('form');
        form.className = 'comment-edit';
        form.noValidate = true;

        const label = document.createElement('label');
        label.className = 'comment-edit-label';
        label.setAttribute('for', `comment-edit-${comment.id}`);
        label.textContent = 'Modifier le commentaire';

        const input = document.createElement('textarea');
        input.id = `comment-edit-${comment.id}`;
        input.className = 'comment-edit-input';
        input.maxLength = MAX_LENGTH;
        input.rows = 4;
        input.value = comment.content;

        const meta = document.createElement('div');
        meta.className = 'comment-edit-meta';
        const error = document.createElement('p');
        error.className = 'comments-error';
        error.setAttribute('role', 'alert');
        error.setAttribute('aria-live', 'assertive');
        const counter = document.createElement('span');
        counter.className = 'comment-counter';
        counter.textContent = `${countChars(input.value)} / ${MAX_LENGTH}`;
        meta.append(error, counter);

        input.addEventListener('input', () => {
            counter.textContent = `${countChars(input.value)} / ${MAX_LENGTH}`;
            error.textContent = '';
        });

        const actions = document.createElement('div');
        actions.className = 'comment-edit-actions';
        const save = createButton('Enregistrer', 'save-edit');
        const cancel = createButton('Annuler', 'cancel-edit');
        cancel.addEventListener('click', () => {
            state.editingId = null;
            render();
            focusComment(comment.id);
        });
        actions.append(save, cancel);

        form.addEventListener('submit', async event => {
            event.preventDefault();
            const validation = validateContent(input.value);
            if (!validation.ok) {
                error.textContent = validation.message;
                input.focus();
                return;
            }
            save.disabled = true;
            cancel.disabled = true;
            input.disabled = true;
            try {
                const { data, error: rpcError } = await state.api.updateMyComment(comment.id, validation.content);
                if (rpcError) throw rpcError;
                const normalized = normalizeRow(data);
                if (normalized) upsertComment(normalized);
                state.editingId = null;
                render();
                showToast('Commentaire modifié avec succès');
                focusComment(comment.id);
            } catch (errorUpdate) {
                error.textContent = describeError(errorUpdate);
                save.disabled = false;
                cancel.disabled = false;
                input.disabled = false;
                input.focus();
            }
        });

        form.append(label, input, meta, actions);
        window.setTimeout(() => input.focus(), 0);
        return form;
    }

    function renderDeleteConfirm(comment) {
        const panel = document.createElement('div');
        panel.className = 'comment-confirm';
        panel.setAttribute('role', 'alertdialog');
        panel.setAttribute('aria-label', 'Confirmer la suppression du commentaire');
        const text = document.createElement('p');
        text.textContent = 'Supprimer ce commentaire ?';
        const actions = document.createElement('div');
        actions.className = 'comment-confirm-actions';
        const confirm = createButton('Confirmer', 'confirm-delete', 'comment-confirm-action');
        const cancel = createButton('Annuler', 'cancel-delete', 'comment-confirm-action');
        confirm.addEventListener('click', () => confirmDelete(comment.id, confirm, cancel));
        cancel.addEventListener('click', () => {
            state.deletingId = null;
            render();
            focusComment(comment.id);
        });
        actions.append(confirm, cancel);
        panel.append(text, actions);
        return panel;
    }

    function focusComment(id) {
        const item = document.querySelector(`[data-comment-id="${id}"]`);
        if (!item) return;
        item.setAttribute('tabindex', '-1');
        item.focus();
    }

    function isOwner(comment) {
        return Boolean(state.profile && comment.user_id === state.profile.id);
    }

    async function confirmDelete(id, confirmButton, cancelButton) {
        confirmButton.disabled = true;
        cancelButton.disabled = true;
        try {
            const { error } = await state.api.deleteMyComment(id);
            if (error) throw error;
            removeComment(id);
            state.deletingId = null;
            render();
            showToast('Commentaire supprimé');
            getEls().input?.focus();
        } catch (deleteError) {
            state.deletingId = null;
            render();
            showToast(describeError(deleteError), 'error');
        }
    }

    async function loadFirstPage() {
        if (!state.profile || !state.api) return;
        const els = getEls();
        state.loading = true;
        setText(els.feedStatus, 'Chargement des commentaires...');
        if (els.loadMore) els.loadMore.disabled = true;

        try {
            const { data, error } = await state.api.listComments({ limit: PAGE_SIZE, offset: 0 });
            if (error) throw error;
            state.comments = data.map(normalizeRow).filter(Boolean);
            state.hasMore = data.length === PAGE_SIZE;
            setReadyStatus('Commentaires connectés');
        } catch (loadError) {
            state.comments = [];
            state.hasMore = false;
            setText(els.feedStatus, describeError(loadError));
            setReadyStatus('Commentaires indisponibles');
            showToast('Les commentaires sont temporairement indisponibles', 'error');
        } finally {
            state.loading = false;
            render();
        }
    }

    async function loadMore() {
        if (!state.profile || state.loading || !state.hasMore) return;
        const els = getEls();
        state.loading = true;
        if (els.loadMore) els.loadMore.disabled = true;
        try {
            const { data, error } = await state.api.listComments({ limit: PAGE_SIZE, offset: state.comments.length });
            if (error) throw error;
            for (const row of data) {
                const comment = normalizeRow(row);
                if (comment) upsertComment(comment, 'bottom');
            }
            state.hasMore = data.length === PAGE_SIZE;
        } catch (moreError) {
            showToast(describeError(moreError), 'error');
        } finally {
            state.loading = false;
            render();
        }
    }

    async function submitComment(event) {
        event.preventDefault();
        if (!state.profile || !state.api || state.submitting) return;
        const els = getEls();
        const validation = validateContent(els.input.value);
        if (!validation.ok) {
            setText(els.error, validation.message);
            els.input.focus();
            return;
        }

        state.submitting = true;
        setDisabled(true);
        setText(els.error, '');
        try {
            let payload = validation.content;
            if (state.replyingToId) {
                payload = { content: validation.content, parent_id: state.replyingToId };
            }
            const { data, error } = await state.api.createComment(payload);
            if (error) throw error;
            const comment = normalizeRow(data);
            if (comment) upsertComment(comment);
            els.input.value = '';
            updateCounter('');
            state.replyingToId = null;
            state.replyingToPseudo = null;
            render();
            showToast('Commentaire ajouté avec succès');
        } catch (createError) {
            const message = describeError(createError);
            setText(els.error, message);
            showToast(message, 'error');
        } finally {
            state.submitting = false;
            setDisabled(false);
            els.input.focus();
        }
    }

    function startEdit(id) {
        state.editingId = id;
        state.deletingId = null;
        state.replyingToId = null;
        state.replyingToPseudo = null;
        render();
    }

    function validatePublicPayload(payload) {
        return normalizeRow(payload);
    }

    function validateDeletePayload(payload) {
        if (!payload || typeof payload !== 'object') return null;
        if (!isUuid(payload.id) || typeof payload.deleted_at !== 'string') return null;
        return { id: payload.id, deleted_at: payload.deleted_at };
    }

    function handleCreated(payload) {
        const comment = validatePublicPayload(payload);
        if (!comment) return;
        const inserted = upsertComment(comment);
        render();
        if (inserted && !isOwner(comment) && shouldToastRemote()) {
            showToast(`Nouveau commentaire de ${comment.pseudo}`);
        }
    }

    function handleUpdated(payload) {
        const comment = validatePublicPayload(payload);
        if (!comment) return;
        upsertComment(comment);
        render();
    }

    function handleDeleted(payload) {
        const deletion = validateDeletePayload(payload);
        if (!deletion) return;
        removeComment(deletion.id);
        if (state.editingId === deletion.id) state.editingId = null;
        if (state.deletingId === deletion.id) state.deletingId = null;
        render();
    }

    async function subscribe() {
        if (!state.client || state.channel) return;
        try {
            const { data } = await state.client.auth.getSession();
            if (data?.session?.access_token && state.client.realtime?.setAuth) {
                state.client.realtime.setAuth(data.session.access_token);
            }
        } catch {
            scheduleReconnect();
            return;
        }

        state.channel = state.client
            .channel(TOPIC, { config: { private: true } })
            .on('broadcast', { event: 'comment_created' }, message => handleCreated(message.payload))
            .on('broadcast', { event: 'comment_updated' }, message => handleUpdated(message.payload))
            .on('broadcast', { event: 'comment_deleted' }, message => handleDeleted(message.payload));

        state.channel.subscribe(status => {
            if (status === 'SUBSCRIBED') {
                clearReconnectTimer();
                setReadyStatus('Commentaires en temps réel');
            }
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                setReadyStatus('Commentaires à resynchroniser');
                scheduleReconnect();
            }
        });
    }

    function scheduleReconnect() {
        if (state.reconnectTimer || !state.profile) return;
        state.reconnectTimer = window.setTimeout(async () => {
            state.reconnectTimer = null;
            await unsubscribe();
            await loadFirstPage();
            await subscribe();
        }, 3000);
    }

    function clearReconnectTimer() {
        if (state.reconnectTimer) {
            window.clearTimeout(state.reconnectTimer);
            state.reconnectTimer = null;
        }
    }

    async function unsubscribe() {
        if (!state.client || !state.channel) {
            state.channel = null;
            return;
        }
        const channel = state.channel;
        state.channel = null;
        try {
            await state.client.removeChannel(channel);
        } catch {
            // Le canal peut deja etre ferme par Supabase.
        }
    }

    async function onProfileReady(profile) {
        if (state.profile && state.profile.id === profile.id) return;
        const els = getEls();
        if (!els.section) return;
        try {
            if (!window.MemorizProfileApi) {
                throw new Error('API non disponible');
            }
            state.api = window.MemorizProfileApi.init(window.MEMORIZ_SUPABASE_CONFIG || {});
            state.client = state.api.client;
            state.profile = profile;
            state.needsProfile = false;
            state.editingId = null;
            state.deletingId = null;
            setDisabled(false);
            if (els.input) {
                els.input.readOnly = false;
                els.input.removeAttribute('aria-disabled');
                els.input.removeAttribute('aria-readonly');
            }
            setText(els.error, '');
            updateCounter();
            await unsubscribe();
            await loadFirstPage();
            await subscribe();
        } catch (err) {
            console.error('[Comments] onProfileReady error:', err);
            setUnavailable('Les commentaires sont temporairement indisponibles.');
        }
    }

    function bind() {
        if (state.initialized) return;
        state.initialized = true;
        const els = getEls();
        if (!els.section) {
            console.warn('[Comments] Section non trouvée');
            return;
        }
        els.input.addEventListener('input', () => {
            updateCounter();
            setText(els.error, '');
        });
        els.input.addEventListener('focus', () => {
            if (!state.needsProfile) return;
            setText(els.error, 'Crée ton pseudo pour commenter.');
        });
        els.input.addEventListener('click', () => {
            if (!state.needsProfile) return;
            window.memorizAuth?.openModal?.();
        });
        els.form.addEventListener('submit', submitComment);
        els.loadMore.addEventListener('click', loadMore);
        document.addEventListener('click', event => {
            if (!state.actionsOpenId || event.target.closest?.('.comment-actions')) return;
            state.actionsOpenId = null;
            render();
        });
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || !state.actionsOpenId) return;
            state.actionsOpenId = null;
            render();
        });
        document.addEventListener('memoriz:profile-ready', event => {
            console.log('[Comments] Event profile-ready reçu');
            onProfileReady(event.detail.profile);
        });
        document.addEventListener('memoriz:profile-unavailable', () => {
            console.log('[Comments] Event profile-unavailable reçu');
            setUnavailable('Les commentaires sont temporairement indisponibles, mais le quiz solo reste disponible.');
        });

        // Vérification immédiate
        const authState = window.memorizAuth?.getState?.();
        if (authState?.profile) {
            console.log('[Comments] Profil déjà prêt au bind');
            onProfileReady(authState.profile);
        } else if (!window.MEMORIZ_SUPABASE_CONFIG?.url || !window.MEMORIZ_SUPABASE_CONFIG?.publishableKey || !window.supabase) {
            console.log('[Comments] Config Supabase absente');
            setUnavailable('Les commentaires sont temporairement indisponibles, mais le quiz solo reste disponible.');
        } else {
            console.log('[Comments] Profil requis');
            setNeedsProfile();
        }

        // 🔴 CORRECTION : Polling de secours si l'événement est passé avant l'écouteur
        let checkCount = 0;
        const checkInterval = window.setInterval(() => {
            if (state.profile || checkCount > 20) {
                window.clearInterval(checkInterval);
                return;
            }
            checkCount++;
            const auth = window.memorizAuth;
            const liveState = auth?.getState?.();
            if (liveState?.profile) {
                console.log('[Comments] Profil détecté par polling');
                onProfileReady(liveState.profile);
                window.clearInterval(checkInterval);
            }
        }, 300);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    window.MemorizComments = {
        getState: () => ({
            comments: state.comments.map(comment => ({ ...comment })),
            hasMore: state.hasMore,
            profile: state.profile ? { ...state.profile } : null,
            editingId: state.editingId,
            replyingToId: state.replyingToId
        }),
        validatePublicPayload,
        validateDeletePayload,
        reload: loadFirstPage
    };
})();
