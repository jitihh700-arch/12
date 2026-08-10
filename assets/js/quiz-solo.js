function normalizeString(str) {
    if (!str) return '';
    let normalized = str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    normalized = normalized.replace(/^\d{4}\s*:\s*/, '');
    normalized = normalized.replace(/[^a-z0-9\s]/g, '').trim();
    return normalized;
}

let currentGame = null;
let timerInterval = null;

class QuizGame {
    constructor(category, categoryKey, questionsList, showYears, yearsList, hintList) {
        this.category = category;
        this.categoryKey = categoryKey;
        this.questions = [...questionsList];
        this.showYears = showYears;
        this.yearsList = yearsList;
        this.hintList = hintList;
        this.correctAnswers = new Array(this.questions.length).fill(false);
        this.score = 0;
        this.points = 0;
        this.serverPoints = 0;
        this.timeLeft = 600;
        this.expiresAt = null;
        this.mode = 'practice';
        this.gameActive = true;
        this.finalized = false;
        this.pendingAnswer = false;
    }

    calculatePoints() {
        const basePoints = this.score * 10;
        let timeBonus = 0;
        if (this.mode === 'practice' && this.timeLeft > 0 && this.isComplete()) {
            timeBonus = Math.floor(this.timeLeft / 10);
        }
        return basePoints + timeBonus;
    }

    findMatchingQuestion(answer) {
        const normalizedAnswer = normalizeString(answer);
        for (let i = 0; i < this.questions.length; i++) {
            if (!this.correctAnswers[i]) {
                const normalizedQuestion = normalizeString(this.questions[i]);
                if (normalizedAnswer === normalizedQuestion) return i;
                const firstWord = normalizedQuestion.split(' ')[0];
                if (normalizedAnswer === firstWord && firstWord.length > 2) return i;
                const words = normalizedQuestion.split(' ');
                if (words.length > 1 && !normalizedQuestion.includes(':')) {
                    const lastName = words[words.length - 1];
                    if (normalizedAnswer === lastName && lastName.length > 2) return i;
                }
            }
        }
        return -1;
    }

    submitAnswer(answer) {
        if (!this.gameActive) return { success: false, gameInactive: true };
        const sanitizedAnswer = answer.trim();
        const matchIndex = this.findMatchingQuestion(sanitizedAnswer);
        if (matchIndex === -1) return { success: false, notFound: true };
        if (this.correctAnswers[matchIndex]) return { success: false, alreadyAnswered: true };
        this.correctAnswers[matchIndex] = true;
        this.score++;
        this.points = this.calculatePoints();
        return { success: true, index: matchIndex, correctName: this.questions[matchIndex] };
    }

    markServerAnswer(payload) {
        const index = Number(payload.matched_display_order || 0) - 1;
        if (index < 0 || index >= this.questions.length) return null;
        if (!this.correctAnswers[index]) this.correctAnswers[index] = true;
        this.score = Number(payload.correct_answers || this.score);
        this.serverPoints = Number(payload.points_current || this.score * 10);
        this.points = this.serverPoints;
        return {
            index,
            correctName: payload.matched_answer_display || this.questions[index]
        };
    }

    restoreFoundAnswers(foundAnswers) {
        (foundAnswers || []).forEach(answer => {
            const index = Number(answer.displayOrder || 0) - 1;
            if (index >= 0 && index < this.correctAnswers.length) {
                this.correctAnswers[index] = true;
            }
        });
        this.score = this.correctAnswers.filter(Boolean).length;
        this.serverPoints = Number(this.serverPoints || this.score * 10);
        this.points = this.mode === 'ranked' ? this.serverPoints : this.calculatePoints();
    }

    isComplete() {
        return this.correctAnswers.every(correct => correct === true);
    }

    getProgress() {
        const answered = this.correctAnswers.filter(c => c === true).length;
        return { answered, total: this.questions.length, percentage: (answered / this.questions.length) * 100 };
    }
}

function initialDisplayFor(index) {
    let displayText = '❓ ???';
    if (currentGame.showYears && currentGame.yearsList && currentGame.yearsList[index]) {
        displayText = `📅 ${currentGame.yearsList[index]} : ???`;
    } else if (currentGame.hintList && currentGame.hintList[index]) {
        displayText = currentGame.hintList[index];
    }
    return displayText;
}

function infoHtmlFor(categoryKey) {
    if (categoryKey === 'meilleursCombats') return '<div class="info-note">💡 <strong>Info :</strong> Tapez le nom complet avec "vs" (ex: "Naruto Uzumaki vs Sasuke Uchiha").</div>';
    if (categoryKey === 'meilleursArcs') return '<div class="info-note">💡 <strong>Info :</strong> Tapez juste le nom (ex: "Fourmis Chimères" ou "Pain").</div>';
    if (categoryKey === 'ligueDesChampions') return '<div class="info-note">💡 <strong>Info :</strong> Tapez le nom du club (ex: "Real Madrid", "Bayern Munich"). L\'année est automatiquement associée.</div>';
    if (categoryKey === 'ballonDor') return '<div class="info-note">💡 <strong>Info :</strong> Tapez le nom du joueur (ex: "Lionel Messi", "Cristiano Ronaldo"). L\'année est automatiquement associée.</div>';
    if (categoryKey === 'trouveAnime') return '<div class="info-note">💡 <strong>Info :</strong> Trouve l\'anime grâce aux emojis ! Tape le nom complet (ex: "One Piece", "Naruto").</div>';
    if (categoryKey === 'devinePersonnage') return '<div class="info-note">💡 <strong>Info :</strong> Devine le personnage grâce à l\'indice ! Tape son nom complet.</div>';
    if (categoryKey === 'animeParOrganisation') return '<div class="info-note">💡 <strong>Info :</strong> Trouve l\'anime dont vient l\'organisation ! Tape le nom de l\'anime.</div>';
    return '';
}

function renderGamePanel(categoryKey) {
    let tableRows = '';
    for (let i = 0; i < currentGame.questions.length; i++) {
        tableRows += `<tr id="row-${i}"><td style="width:60px;text-align:center;font-weight:bold;">${i + 1}</td><td id="answer-display-${i}">${initialDisplayFor(i)}</td><td id="status-${i}" style="width:70px;text-align:center;">⏳</td></tr>`;
    }

    const modeLabel = currentGame.mode === 'ranked' ? 'Mode classé' : 'Mode entraînement';
    const modeHelp = currentGame.mode === 'ranked'
        ? 'Score validé par le serveur.'
        : 'Aucun point classé ne sera enregistré.';
    const gameHTML = `<div class="game-panel" id="game-panel"><div class="game-container"><div class="game-header"><h2>${currentGame.category.title}</h2><button class="restart-category-btn" id="restart-category-btn">🔄 Recommencer cette catégorie</button><div class="timer" id="timer">10:00</div><div class="score" id="score">🎯 0/${currentGame.questions.length}</div><button class="close-game" id="close-game-btn">✕ Fermer</button></div><div class="quiz-mode-badge" id="quiz-mode-badge"><strong>${modeLabel}</strong><span>${modeHelp}</span></div><div class="progress" id="progress" aria-live="polite">📊 Progression: 0/${currentGame.questions.length} (0%)</div>${infoHtmlFor(categoryKey)}<div class="quiz-table"><table><thead><tr><th>#</th><th>${currentGame.hintList ? 'Indice' : (currentGame.showYears ? 'Année' : 'Nom')}</th><th>✅ Statut</th></tr></thead><tbody>${tableRows}</tbody></table></div><div class="input-area"><div class="input-group"><input type="text" id="quick-input" placeholder="✏️ Tape ta réponse ici..." autocomplete="off" aria-describedby="message quiz-mode-badge"><button id="quick-submit">🎮 Valider</button></div><div id="message" aria-live="polite"></div><div id="found-list"></div></div></div></div>`;
    document.body.insertAdjacentHTML('beforeend', gameHTML);
}

async function showGamePanel(categoryKey) {
    if (currentGame) await closeGame();
    const category = categoryMapping[categoryKey];
    if (!category) return;

    currentGame = new QuizGame(category, categoryKey, category.data, category.showYears, category.yearsList, category.hintList);
    const startResult = await window.MemorizQuizSession?.start?.(categoryKey);
    if (startResult?.mode === 'ranked') {
        currentGame.mode = 'ranked';
        currentGame.expiresAt = startResult.session.expires_at;
        currentGame.timeLeft = Math.max(0, Math.ceil((new Date(currentGame.expiresAt).getTime() - Date.now()) / 1000));
    }

    renderGamePanel(categoryKey);
    startTimer();
    document.getElementById('quick-submit').onclick = () => handleQuickSubmit();
    document.getElementById('quick-input').onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleQuickSubmit();
        }
    };
    document.getElementById('close-game-btn').onclick = () => closeGame();
    document.getElementById('restart-category-btn').onclick = () => restartGame();
    document.getElementById('quick-input').focus();
    updateScoreAndProgress();
    updateFoundList();
}

async function restoreActiveGame() {
    if (currentGame || !window.MemorizQuizSession) return;
    const restored = await window.MemorizQuizSession.restore();
    if (!restored?.restored || !restored.session) return;
    const categoryKey = restored.session.category_id;
    const category = categoryMapping[categoryKey];
    if (!category) {
        window.MemorizQuizSession.clearCache();
        return;
    }

    currentGame = new QuizGame(category, categoryKey, category.data, category.showYears, category.yearsList, category.hintList);
    currentGame.mode = 'ranked';
    currentGame.expiresAt = restored.session.expires_at;
    currentGame.restoreFoundAnswers(restored.session.foundAnswers);
    currentGame.serverPoints = Number(restored.session.points_current || currentGame.score * 10);
    renderGamePanel(categoryKey);
    restored.session.foundAnswers.forEach(answer => {
        const index = Number(answer.displayOrder || 0) - 1;
        if (index >= 0) updateRow(index, answer.display || currentGame.questions[index]);
    });
    startTimer();
    document.getElementById('quick-submit').onclick = () => handleQuickSubmit();
    document.getElementById('quick-input').onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleQuickSubmit();
        }
    };
    document.getElementById('close-game-btn').onclick = () => closeGame();
    document.getElementById('restart-category-btn').onclick = () => restartGame();
    updateScoreAndProgress();
    updateFoundList();
    if (restored.session.status === 'completed') await endGame(true);
    else document.getElementById('quick-input').focus();
}

function playSoundCorrect() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.value = 880;
        gainNode.gain.value = 0.2;
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.15);
        setTimeout(() => {
            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            osc2.type = 'sine';
            osc2.frequency.value = 1100;
            gain2.gain.value = 0.15;
            osc2.start();
            osc2.stop(audioCtx.currentTime + 0.15);
        }, 120);
    } catch (e) { /* silencieux */ }
}

function playSoundWrong() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sawtooth';
        oscillator.frequency.value = 300;
        gainNode.gain.value = 0.1;
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.25);
    } catch (e) { /* silencieux */ }
}

function setInputPending(isPending) {
    const input = document.getElementById('quick-input');
    const button = document.getElementById('quick-submit');
    if (input) input.disabled = isPending;
    if (button) button.disabled = isPending;
}

async function handleQuickSubmit() {
    if (!currentGame || !currentGame.gameActive || currentGame.pendingAnswer) return;
    const input = document.getElementById('quick-input');
    if (!input) return;
    const answer = input.value.trim();
    if (answer === '') {
        showMessage('📝 Veuillez entrer une réponse', 'error');
        return;
    }

    if (currentGame.mode === 'ranked') {
        await handleRankedSubmit(answer, input);
        return;
    }

    const result = currentGame.submitAnswer(answer);
    if (result.success) {
        playSoundCorrect();
        updateRow(result.index, result.correctName);
        updateScoreAndProgress();
        showMessage(`✅ BRAVO ! "${result.correctName}" trouvé !`, 'success');
        input.value = '';
        input.focus();
        updateFoundList();
        if (currentGame.isComplete()) endGame(true);
    } else if (result.notFound) {
        playSoundWrong();
        showMessage('❌ Cette réponse n’est pas dans la liste. Réessaie !', 'error');
    } else if (result.alreadyAnswered) {
        playSoundWrong();
        showMessage('⚠️ Cette réponse a déjà été trouvée !', 'error');
    }
    input.value = '';
    input.focus();
}

async function handleRankedSubmit(answer, input) {
    currentGame.pendingAnswer = true;
    setInputPending(true);
    showMessage('Validation serveur...', 'success');
    const result = await window.MemorizQuizSession.submit(answer);
    currentGame.pendingAnswer = false;
    setInputPending(false);

    if (result.error) {
        playSoundWrong();
        showMessage(result.message || 'Service classé indisponible.', 'error');
        input.focus();
        return;
    }

    const payload = result.data;
    if (payload.result === 'correct' || payload.result === 'completed') {
        const marked = currentGame.markServerAnswer(payload);
        if (marked) {
            playSoundCorrect();
            updateRow(marked.index, marked.correctName);
        }
        updateScoreAndProgress();
        updateFoundList();
        showMessage(`✅ Réponse validée par le serveur : ${marked?.correctName || 'trouvée'} !`, 'success');
        input.value = '';
        if (payload.result === 'completed') await endGame(true);
    } else if (payload.result === 'duplicate') {
        playSoundWrong();
        showMessage('⚠️ Réponse déjà validée sur cette session.', 'error');
    } else if (payload.result === 'expired') {
        playSoundWrong();
        await endGame(false);
    } else {
        playSoundWrong();
        showMessage('❌ Réponse non reconnue par le serveur. Réessaie !', 'error');
    }

    input.value = '';
    input.focus();
}

function updateRow(index, correctName) {
    const answerDisplay = document.getElementById(`answer-display-${index}`);
    const statusCell = document.getElementById(`status-${index}`);
    if (answerDisplay) {
        if (currentGame.showYears && currentGame.yearsList && currentGame.yearsList[index]) {
            answerDisplay.textContent = `✅ ${currentGame.yearsList[index]} : ${correctName.replace(/^\d{4}\s*:\s*/, '')}`;
        } else if (currentGame.hintList && currentGame.hintList[index]) {
            answerDisplay.textContent = `✅ ${currentGame.hintList[index]} → ${correctName}`;
        } else {
            answerDisplay.textContent = `✅ ${correctName}`;
        }
        answerDisplay.style.color = '#28a745';
        answerDisplay.style.fontWeight = 'bold';
    }
    if (statusCell) {
        statusCell.textContent = '✓';
        statusCell.style.color = '#28a745';
        statusCell.style.fontSize = '20px';
        statusCell.style.fontWeight = 'bold';
    }
}

function updateFoundList() {
    const foundListDiv = document.getElementById('found-list');
    if (!foundListDiv || !currentGame) return;
    const found = [];
    const notFound = [];
    for (let i = 0; i < currentGame.questions.length; i++) {
        if (currentGame.correctAnswers[i]) {
            let display = currentGame.questions[i];
            if (currentGame.showYears && currentGame.yearsList) {
                display = `${currentGame.yearsList[i]} : ${display.replace(/^\d{4}\s*:\s*/, '')}`;
            } else if (currentGame.hintList && currentGame.hintList[i]) {
                display = `${currentGame.hintList[i]} → ${display}`;
            }
            found.push(display);
        } else {
            notFound.push(i + 1);
        }
    }
    foundListDiv.replaceChildren();
    if (found.length > 0) {
        const summary = document.createElement('strong');
        summary.textContent = `🏆 Déjà trouvés (${found.length}/${currentGame.questions.length}) : `;
        const foundText = document.createTextNode(found.join(', '));
        const separator = document.createElement('br');
        const remaining = document.createElement('strong');
        remaining.textContent = '⏳ Restants : ';
        const remainingText = document.createTextNode(`positions ${notFound.join(', ')}`);
        foundListDiv.append(summary, foundText, separator, remaining, remainingText);
    } else {
        foundListDiv.textContent = '💡 Tape une réponse pour commencer l’aventure Memoriz !';
    }
}

function updateScoreAndProgress() {
    if (!currentGame) return;
    const progress = currentGame.getProgress();
    const scoreElement = document.getElementById('score');
    const progressElement = document.getElementById('progress');
    if (scoreElement) {
        const pts = currentGame.mode === 'ranked' ? currentGame.serverPoints : currentGame.points;
        scoreElement.textContent = `🎯 ${pts} pts · ${progress.answered}/${currentGame.questions.length}`;
    }
    if (progressElement) {
        progressElement.textContent = `📊 Progression: ${progress.answered}/${progress.total} (${Math.round(progress.percentage)}%)`;
    }
}

function currentRemainingSeconds() {
    if (!currentGame) return 0;
    if (currentGame.mode === 'ranked' && currentGame.expiresAt) {
        return Math.max(0, Math.ceil((new Date(currentGame.expiresAt).getTime() - Date.now()) / 1000));
    }
    return Math.max(0, currentGame.timeLeft);
}

function renderTimer() {
    const timerElement = document.getElementById('timer');
    if (!timerElement) return;
    const remaining = currentRemainingSeconds();
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    if (remaining <= 60) timerElement.classList.add('warning');
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    renderTimer();
    timerInterval = setInterval(() => {
        if (!currentGame || !currentGame.gameActive) return;
        if (currentGame.mode !== 'ranked') currentGame.timeLeft--;
        renderTimer();
        if (currentRemainingSeconds() <= 0) endGame(false);
    }, 1000);
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) renderTimer();
});

document.addEventListener('memoriz:profile-ready', () => {
    restoreActiveGame();
});

function shareOnTwitter() {
    if (!currentGame) return;
    const text = `🎯 J'ai fait ${currentGame.score}/${currentGame.questions.length} (${Math.round(currentGame.getProgress().percentage)}%) au quiz Memoriz !`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
}

async function endGame(completed) {
    if (!currentGame || !currentGame.gameActive || currentGame.finalized) return;
    currentGame.gameActive = false;
    currentGame.finalized = true;
    if (timerInterval) clearInterval(timerInterval);
    setInputPending(true);

    // ⬇️ NOUVEAU : recalcule les points finaux en mode entraînement
    if (currentGame.mode !== 'ranked') {
        currentGame.points = currentGame.calculatePoints();
    }

    let finalResult = null;
    if (currentGame.mode === 'ranked') {
        finalResult = await window.MemorizQuizSession.complete();
        if (finalResult.data) {
            currentGame.score = Number(finalResult.data.correct_answers || currentGame.score);
            currentGame.serverPoints = Number(finalResult.data.points_awarded || currentGame.serverPoints);
        }
    }

    const gameContainer = document.querySelector('.game-container');
    if (!gameContainer) return;
    const percentage = (currentGame.score / currentGame.questions.length) * 100;
    if (currentGame.mode !== 'ranked') revealPracticeAnswers();
    renderFinalScreen(gameContainer, completed, percentage, finalResult?.data);
}

function revealPracticeAnswers() {
    for (let i = 0; i < currentGame.questions.length; i++) {
        const answerDisplay = document.getElementById(`answer-display-${i}`);
        if (answerDisplay && !currentGame.correctAnswers[i]) {
            if (currentGame.showYears && currentGame.yearsList) {
                answerDisplay.textContent = `❌ ${currentGame.yearsList[i]} : ${currentGame.questions[i].replace(/^\d{4}\s*:\s*/, '')}`;
            } else if (currentGame.hintList && currentGame.hintList[i]) {
                answerDisplay.textContent = `❌ ${currentGame.hintList[i]} → ${currentGame.questions[i]}`;
            } else {
                answerDisplay.textContent = `❌ ${currentGame.questions[i]}`;
            }
            answerDisplay.style.color = '#dc3545';
        }
    }
}

function renderFinalScreen(container, completed, percentage, serverResult) {
    container.replaceChildren();
    const final = document.createElement('div');
    final.className = 'game-complete';
    const title = document.createElement('h2');
    title.textContent = completed ? '🏆 FÉLICITATIONS ! 🏆' : '⏰ TEMPS ÉCOULÉ ! ⏰';
    const score = document.createElement('p');
    score.style.fontSize = '1.5rem';
    score.style.margin = '20px 0';
    
    // ⬇️ NOUVEAU : affiche les points dans tous les modes
    const displayPoints = currentGame.mode === 'ranked' 
        ? currentGame.serverPoints 
        : currentGame.points;
    score.textContent = `🎯 ${displayPoints} pts (${currentGame.score}/${currentGame.questions.length}, ${Math.round(percentage)}%)`;
    
    const text = document.createElement('p');
    if (currentGame.mode === 'ranked') {
        const won = Number(serverResult?.points_awarded || 0);
        text.textContent = won > 0 ? `Vous avez gagné ${won} points !` : 'Aucun point classé supplémentaire.';
    } else {
        // ⬇️ NOUVEAU : message avec points en entraînement
        text.textContent = displayPoints > 0 
            ? `Tu as accumulé ${displayPoints} points ! Continue comme ça !` 
            : 'Continue à t\'entraîner, tu vas y arriver !';
    }

    const home = document.createElement('button');
    home.className = 'play-again';
    home.type = 'button';
    home.textContent = '🏠 Retour aux catégories';
    home.addEventListener('click', () => closeGame(false));
    const replay = document.createElement('button');
    replay.className = 'play-again';
    replay.type = 'button';
    replay.textContent = '🔄 Rejouer';
    replay.addEventListener('click', () => restartGame());
    const shares = document.createElement('div');
    shares.style.marginTop = '20px';
    const twitter = document.createElement('button');
    twitter.className = 'share-btn share-twitter';
    twitter.type = 'button';
    twitter.textContent = '🐦 Partager sur X (Twitter)';
    twitter.addEventListener('click', shareOnTwitter);
    shares.append(twitter);

    final.append(title, score, text, home, replay);
    if (currentGame.mode === 'ranked') {
        const leaderboard = document.createElement('button');
        leaderboard.className = 'play-again';
        leaderboard.type = 'button';
        leaderboard.textContent = '🏆 Voir le classement';
        leaderboard.addEventListener('click', () => window.MemorizLeaderboard?.open?.());
        final.append(leaderboard);
    }
    final.append(shares);
    container.append(final);
}

async function closeGame(abandon = true) {
    const shouldAbandon = abandon && currentGame && currentGame.mode === 'ranked' && currentGame.gameActive;
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    if (shouldAbandon) await window.MemorizQuizSession?.abandon?.();
    const gamePanel = document.getElementById('game-panel');
    if (gamePanel) gamePanel.remove();
    currentGame = null;
}

async function restartGame() {
    if (currentGame) {
        const categoryKey = currentGame.categoryKey;
        await closeGame(true);
        setTimeout(() => showGamePanel(categoryKey), 50);
    }
}

window.showGamePanel = showGamePanel;
