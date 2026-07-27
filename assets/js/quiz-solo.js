        function normalizeString(str) { if (!str) return ''; let normalized = str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); normalized = normalized.replace(/^\d{4}\s*:\s*/, ''); normalized = normalized.replace(/[^a-z0-9\s]/g, '').trim(); return normalized; }
        let currentGame = null; let timerInterval = null;
        class QuizGame { constructor(category, categoryKey, questionsList, showYears, yearsList, hintList) { this.category = category; this.categoryKey = categoryKey; this.questions = [...questionsList]; this.showYears = showYears; this.yearsList = yearsList; this.hintList = hintList; this.correctAnswers = new Array(this.questions.length).fill(false); this.score = 0; this.timeLeft = 600; this.gameActive = true; }
            findMatchingQuestion(answer) { const normalizedAnswer = normalizeString(answer); for (let i = 0; i < this.questions.length; i++) { if (!this.correctAnswers[i]) { let normalizedQuestion = normalizeString(this.questions[i]); if (normalizedAnswer === normalizedQuestion) return i; const firstWord = normalizedQuestion.split(' ')[0]; if (normalizedAnswer === firstWord && firstWord.length > 2) return i; const words = normalizedQuestion.split(' '); if (words.length > 1 && !normalizedQuestion.includes(':')) { const lastName = words[words.length - 1]; if (normalizedAnswer === lastName && lastName.length > 2) return i; } } } return -1; }
            submitAnswer(answer) { if (!this.gameActive) return { success: false, gameInactive: true }; const sanitizedAnswer = answer.trim(); const matchIndex = this.findMatchingQuestion(sanitizedAnswer); if (matchIndex === -1) return { success: false, notFound: true }; if (this.correctAnswers[matchIndex]) return { success: false, alreadyAnswered: true }; this.correctAnswers[matchIndex] = true; this.score++; return { success: true, index: matchIndex, correctName: this.questions[matchIndex] }; }
            isComplete() { return this.correctAnswers.every(correct => correct === true); }
            getProgress() { const answered = this.correctAnswers.filter(c => c === true).length; return { answered, total: this.questions.length, percentage: (answered / this.questions.length) * 100 }; }
        }
        function showGamePanel(categoryKey) { if (currentGame) closeGame(); const category = categoryMapping[categoryKey]; if (!category) return; currentGame = new QuizGame(category, categoryKey, category.data, category.showYears, category.yearsList, category.hintList); let tableRows = ''; for (let i = 0; i < currentGame.questions.length; i++) { let displayText = "❓ ???"; if (currentGame.showYears && currentGame.yearsList && currentGame.yearsList[i]) { displayText = `📅 ${currentGame.yearsList[i]} : ???`; } else if (currentGame.hintList && currentGame.hintList[i]) { displayText = `${currentGame.hintList[i]}`; } tableRows += `<tr id="row-${i}"><td style="width:60px;text-align:center;font-weight:bold;">${i+1}<\/td><td id="answer-display-${i}">${displayText}<\/td><td id="status-${i}" style="width:70px;text-align:center;">⏳<\/td><\/tr>`; } let infoHtml = ''; if (categoryKey === 'meilleursCombats') infoHtml = `<div class="info-note">💡 <strong>Info :</strong> Tapez le nom complet avec "vs" (ex: "Naruto Uzumaki vs Sasuke Uchiha").</div>`; else if (categoryKey === 'meilleursArcs') infoHtml = `<div class="info-note">💡 <strong>Info :</strong> Tapez juste le nom (ex: "Fourmis Chimères" ou "Pain").</div>`; else if (categoryKey === 'ligueDesChampions') infoHtml = `<div class="info-note">💡 <strong>Info :</strong> Tapez le nom du club (ex: "Real Madrid", "Bayern Munich"). L'année est automatiquement associée.</div>`; else if (categoryKey === 'ballonDor') infoHtml = `<div class="info-note">💡 <strong>Info :</strong> Tapez le nom du joueur (ex: "Lionel Messi", "Cristiano Ronaldo"). L'année est automatiquement associée.</div>`; else if (categoryKey === 'trouveAnime') infoHtml = `<div class="info-note">💡 <strong>Info :</strong> Trouve l'anime grâce aux emojis ! Tape le nom complet (ex: "One Piece", "Naruto").</div>`; else if (categoryKey === 'devinePersonnage') infoHtml = `<div class="info-note">💡 <strong>Info :</strong> Devine le personnage grâce à l'indice ! Tape son nom complet.</div>`; else if (categoryKey === 'animeParOrganisation') infoHtml = `<div class="info-note">💡 <strong>Info :</strong> Trouve l'anime dont vient l'organisation ! Tape le nom de l'anime.</div>`; const gameHTML = `<div class="game-panel" id="game-panel"><div class="game-container"><div class="game-header"><h2>${category.title}</h2><button class="restart-category-btn" id="restart-category-btn">🔄 Recommencer cette catégorie</button><div class="timer" id="timer">10:00</div><div class="score" id="score">🎯 0/${currentGame.questions.length}</div><button class="close-game" id="close-game-btn">✕ Fermer</button></div><div class="progress" id="progress">📊 Progression: 0/${currentGame.questions.length} (0%)</div>${infoHtml}<div class="quiz-table"><table><thead><tr><th>#</th><th>${currentGame.hintList ? 'Indice' : (currentGame.showYears ? 'Année' : 'Nom')}</th><th>✅ Statut</th></tr></thead><tbody>${tableRows}</tbody></table></div><div class="input-area"><div class="input-group"><input type="text" id="quick-input" placeholder="✏️ Tape ta réponse ici..." autocomplete="off"><button id="quick-submit">🎮 Valider</button></div><div id="message"></div><div id="found-list"></div></div></div></div>`; document.body.insertAdjacentHTML('beforeend', gameHTML); startTimer(); document.getElementById('quick-submit').onclick = () => handleQuickSubmit(); document.getElementById('quick-input').onkeypress = (e) => { if (e.key === 'Enter') handleQuickSubmit(); }; document.getElementById('close-game-btn').onclick = () => closeGame(); document.getElementById('restart-category-btn').onclick = () => restartGame(); document.getElementById('quick-input').focus(); }

        // ========== FONCTIONS AUDIO ==========
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

        function handleQuickSubmit() {
            if (!currentGame || !currentGame.gameActive) return;
            const input = document.getElementById('quick-input');
            if (!input) return;
            const answer = input.value.trim();
            if (answer === '') {
                showMessage('📝 Veuillez entrer une réponse', 'error');
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
                showMessage(`❌ "${answer}" n'est pas dans la liste. Réessaie !`, 'error');
            } else if (result.alreadyAnswered) {
                playSoundWrong();
                showMessage(`⚠️ "${answer}" a déjà été trouvé !`, 'error');
            }
            input.value = '';
            input.focus();
        }

        function updateRow(index, correctName) { const answerDisplay = document.getElementById(`answer-display-${index}`); const statusCell = document.getElementById(`status-${index}`); if (answerDisplay) { if (currentGame.showYears && currentGame.yearsList && currentGame.yearsList[index]) { answerDisplay.innerHTML = `✅ ${currentGame.yearsList[index]} : ${correctName.replace(/^\d{4}\s*:\s*/, '')}`; } else if (currentGame.hintList && currentGame.hintList[index]) { answerDisplay.innerHTML = `✅ ${currentGame.hintList[index]} → ${correctName}`; } else { answerDisplay.innerHTML = `✅ ${correctName}`; } answerDisplay.style.color = '#28a745'; answerDisplay.style.fontWeight = 'bold'; } if (statusCell) { statusCell.innerHTML = '✓'; statusCell.style.color = '#28a745'; statusCell.style.fontSize = '20px'; statusCell.style.fontWeight = 'bold'; } }
        function updateFoundList() { const foundListDiv = document.getElementById('found-list'); if (!foundListDiv) return; const found = []; const notFound = []; for (let i = 0; i < currentGame.questions.length; i++) { if (currentGame.correctAnswers[i]) { let display = currentGame.questions[i]; if (currentGame.showYears && currentGame.yearsList) { display = `${currentGame.yearsList[i]} : ${display.replace(/^\d{4}\s*:\s*/, '')}`; } else if (currentGame.hintList && currentGame.hintList[i]) { display = `${currentGame.hintList[i]} → ${display}`; } found.push(display); } else notFound.push(i + 1); } if (found.length > 0) foundListDiv.innerHTML = `<strong>🏆 Déjà trouvés (${found.length}/${currentGame.questions.length}) :</strong> ${found.join(', ')}<br><strong>⏳ Restants :</strong> positions ${notFound.join(', ')}`; else foundListDiv.innerHTML = `💡 Tape une réponse pour commencer l'aventure Memoriz !`; }
        function updateScoreAndProgress() { const progress = currentGame.getProgress(); const scoreElement = document.getElementById('score'); const progressElement = document.getElementById('progress'); if (scoreElement) scoreElement.textContent = `🎯 ${currentGame.score}/${currentGame.questions.length}`; if (progressElement) progressElement.textContent = `📊 Progression: ${progress.answered}/${progress.total} (${Math.round(progress.percentage)}%)`; }
        function startTimer() { if (timerInterval) clearInterval(timerInterval); timerInterval = setInterval(() => { if (!currentGame || !currentGame.gameActive) return; if (currentGame.timeLeft <= 0) endGame(false); else { currentGame.timeLeft--; const timerElement = document.getElementById('timer'); if (timerElement) { const minutes = Math.floor(currentGame.timeLeft / 60); const seconds = currentGame.timeLeft % 60; timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`; if (currentGame.timeLeft <= 60) timerElement.classList.add('warning'); } } }, 1000); }
        function shareOnWhatsApp() { if (!currentGame) return; const text = `🎯 J'ai fait ${currentGame.score}/${currentGame.questions.length} (${Math.round(currentGame.getProgress().percentage)}%) au quiz Memoriz !`; window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank'); }
        function shareOnTwitter() { if (!currentGame) return; const text = `🎯 J'ai fait ${currentGame.score}/${currentGame.questions.length} (${Math.round(currentGame.getProgress().percentage)}%) au quiz Memoriz !`; window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank'); }
        function endGame(completed) { if (!currentGame || !currentGame.gameActive) return; currentGame.gameActive = false; if (timerInterval) clearInterval(timerInterval); const gameContainer = document.querySelector('.game-container'); if (!gameContainer) return; const percentage = (currentGame.score / currentGame.questions.length) * 100; for (let i = 0; i < currentGame.questions.length; i++) { const answerDisplay = document.getElementById(`answer-display-${i}`); if (answerDisplay && !currentGame.correctAnswers[i]) { if (currentGame.showYears && currentGame.yearsList) { answerDisplay.innerHTML = `❌ ${currentGame.yearsList[i]} : ${currentGame.questions[i].replace(/^\d{4}\s*:\s*/, '')}`; } else if (currentGame.hintList && currentGame.hintList[i]) { answerDisplay.innerHTML = `❌ ${currentGame.hintList[i]} → ${currentGame.questions[i]}`; } else { answerDisplay.innerHTML = `❌ ${currentGame.questions[i]}`; } answerDisplay.style.color = '#dc3545'; } } gameContainer.innerHTML = `<div class="game-complete"><h2>${completed ? '🏆 FÉLICITATIONS ! 🏆' : '⏰ TEMPS ÉCOULÉ ! ⏰'}</h2><p style="font-size:1.5rem;margin:20px 0;">Ton score : ${currentGame.score}/${currentGame.questions.length} (${Math.round(percentage)}%)</p><p>${completed ? 'Tu as dominé ce défi Memoriz !' : 'Continue à t\'entraîner, tu vas y arriver !'}</p><button class="play-again" onclick="closeGame()">🏠 Retour aux catégories</button><button class="play-again" onclick="restartGame()">🔄 Rejouer</button><div style="margin-top:20px;"><button class="share-btn" onclick="shareOnWhatsApp()">💬 Partager sur WhatsApp</button><button class="share-btn share-twitter" onclick="shareOnTwitter()">🐦 Partager sur X (Twitter)</button></div></div>`; }
        function closeGame() { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } const gamePanel = document.getElementById('game-panel'); if (gamePanel) gamePanel.remove(); currentGame = null; }
        function restartGame() { if (currentGame) { const categoryKey = currentGame.categoryKey; closeGame(); setTimeout(() => showGamePanel(categoryKey), 50); } }
