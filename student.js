// ==========================================
// 1. STUDENT STATE & DOM ELEMENTS
// ==========================================
let html5QrcodeScanner = null;
let currentQuestionId = null;
let studentTimerInterval = null;

const studentTimer = document.getElementById('student-timer');
const scannerArea = document.getElementById('scanner-area');
const questionModal = document.getElementById('question-modal');
const qText = document.getElementById('q-text');
const qOptions = document.getElementById('q-options');
const feedbackArea = document.getElementById('feedback-area');
const feedbackText = document.getElementById('feedback-text');
const manualInput = document.getElementById('manual-qr-input');
const manualSubmitBtn = document.getElementById('manual-submit-btn');
const progressTracker = document.getElementById('progress-tracker');
// --- TENSION TIMER CONFIG ---
const RARITY_TIME_LIMITS = {
    mythic: 5000,     // 5 seconds (Panic!)
    legendary: 10000, // 10 seconds
    epic: 15000,      // 15 seconds
    rare: 20000,      // 20 seconds
    common: 30000     // 30 seconds (Default)
};

let questionTimerInterval = null;
// ==========================================
// 2. GAME TIMER & STATUS
// ==========================================
async function checkGameStatusAndUpdateTimer() {
    try {
        const response = await fetch(`${FIREBASE_URL}/gameSettings.json?auth=${FIREBASE_SECRET}`);
        const settings = await response.json();
        
        if (settings && settings.isActive && settings.endTime) {
            const now = Date.now();
            const remaining = settings.endTime - now;
            
            if (remaining <= 0) {
                isGameActive = false;
                studentTimer.textContent = "⏳ 00:00";
            } else {
                isGameActive = true;
                const mins = Math.floor(remaining / 60000);
                const secs = Math.floor((remaining % 60000) / 1000);
                studentTimer.textContent = `⏳ ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
        } else {
            isGameActive = false;
            studentTimer.textContent = "⏳ Ended";
        }
    } catch (error) {
        console.error("Timer error:", error);
        isGameActive = false;
    }
}

function startStudentTimer() {
    if (studentTimerInterval) clearInterval(studentTimerInterval);
    checkGameStatusAndUpdateTimer();
    studentTimerInterval = setInterval(async () => {
        await checkGameStatusAndUpdateTimer();
        if (!isGameActive) {
            clearInterval(studentTimerInterval);
            showGameOver(); // From core.js
        }
    }, 1000);
}

// ==========================================
// 3. QR SCANNER & MANUAL ENTRY
// ==========================================
async function startScanner() {
    if (html5QrcodeScanner) return;
    html5QrcodeScanner = new Html5Qrcode("reader");
    const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };

    try {
        await html5QrcodeScanner.start({ facingMode: "environment" }, config, onScanSuccess, onScanFailure);
    } catch (err) {
        try {
            await html5QrcodeScanner.start({ facingMode: "user" }, config, onScanSuccess, onScanFailure);
        } catch (err2) {
            document.getElementById('reader').innerHTML = "<p style='padding:20px; color:red;'>Camera access denied. Use manual entry.</p>";
        }
    }
}

function onScanSuccess(decodedText) {
    let questionId = decodedText;
    if (decodedText.includes('?q=')) questionId = decodedText.split('?q=')[1].split('&')[0];
    else if (decodedText.includes('&q=')) questionId = decodedText.split('&q=')[1].split('&')[0];
    loadQuestion(questionId);
}

function onScanFailure(error) { /* Ignore */ }

manualSubmitBtn.addEventListener('click', () => {
    const qId = manualInput.value.trim();
    if (qId) { loadQuestion(qId); manualInput.value = ''; }
});

// ==========================================
// 4. QUESTION & ANSWER LOGIC
// ==========================================
async function loadQuestion(questionId) {
    if (!isGameActive) { showGameOver(); return; }

    // Prevent duplicate answers
    if (currentUser && currentUser.answeredQuestions.has(questionId)) {
        if (html5QrcodeScanner) html5QrcodeScanner.pause(true);
        scannerArea.classList.add('hidden');
        feedbackArea.classList.add('hidden');
        questionModal.classList.remove('hidden');
        
        qText.textContent = `⚠️ You have already answered "${questionId}"!`;
        qText.style.color = "#f44336";
        qOptions.innerHTML = `<button class="option-btn" style="background-color:#4CAF50;" onclick="resetToScanner()">Back to Scanner</button>`;
        return;
    }

    currentQuestionId = questionId;
    if (html5QrcodeScanner) html5QrcodeScanner.pause(true);
    scannerArea.classList.add('hidden');
    feedbackArea.classList.add('hidden');
    qText.textContent = "Loading question...";
    qText.style.color = "var(--text-color)";
    qOptions.innerHTML = ''; 
    questionModal.classList.remove('hidden');

            try {
        const response = await fetch(`${FIREBASE_URL}/questions/${questionId}.json?auth=${FIREBASE_SECRET}`);
        const qData = await response.json();

        if (!qData || !qData.text) throw new Error("Question data is empty or ID is wrong");

        // --- RARITY LOGIC (From previous step) ---
        const rarity = qData.rarity ? qData.rarity.toLowerCase().trim() : 'common';
        questionModal.className = 'question-modal'; 
        questionModal.classList.add(`rarity-${rarity}`);

        const badgeHTML = `<div class="rarity-badge">${rarity}</div>`;
        qText.innerHTML = badgeHTML + qData.text; 
        qText.style.color = "var(--text-color)"; 
        
        // --- RENDER OPTIONS ---
        qOptions.innerHTML = ''; 
        const labels = ['A', 'B', 'C', 'D'];
        qData.options.forEach((opt, index) => {
            if (opt) {
                const btn = document.createElement('button');
                btn.className = 'option-btn';
                btn.textContent = `${labels[index]}. ${opt}`;
                btn.onclick = () => submitAnswer(labels[index]);
                qOptions.appendChild(btn);
            }
        });

        // --- NEW: TENSION TIMER LOGIC ---
        // 1. Get time limit for this rarity (default to 30s if missing)
        const timeLimit = RARITY_TIME_LIMITS[rarity] || 30000;
        
        // 2. Inject Timer UI at the top of the modal
        const timerHTML = `
            <div class="question-timer-container">
                <div class="question-timer-bar"></div>
                <span class="question-timer-text">${timeLimit / 1000}s</span>
            </div>
        `;
        questionModal.insertAdjacentHTML('afterbegin', timerHTML);

        // 3. Start the countdown!
        startQuestionTimer(timeLimit);

    } catch (error) {
        console.error("Error loading question:", error);
        questionModal.className = 'question-modal'; 
        qText.innerHTML = `❌ Error: Question "${questionId}" not found!`;
        qText.style.color = "red";
        qOptions.innerHTML = `<button class="option-btn" style="background-color:#f44336;" onclick="resetToScanner()">Go Back</button>`;
    }
}
// --- TENSION TIMER FUNCTIONS ---
function startQuestionTimer(timeLimit) {
    clearInterval(questionTimerInterval); // Clear any old timers
    const startTime = Date.now();
    const timerBar = document.querySelector('.question-timer-bar');
    const timerText = document.querySelector('.question-timer-text');

    // Update every 100ms for a smooth shrinking bar
    questionTimerInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = timeLimit - elapsed;

        if (remaining <= 0) {
            clearInterval(questionTimerInterval);
            handleTimeUp();
        } else {
            const percent = (remaining / timeLimit) * 100;
            
            // Update UI
            if(timerBar) timerBar.style.width = percent + '%';
            if(timerText) timerText.textContent = Math.ceil(remaining / 1000) + 's';

            // Change color based on tension (Green -> Orange -> Red)
            if (percent < 30) {
                if(timerBar) timerBar.style.backgroundColor = '#f44336'; // Red
            } else if (percent < 60) {
                if(timerBar) timerBar.style.backgroundColor = '#ff9800'; // Orange
            }
        }
    }, 100);
}

function handleTimeUp() {
    // 1. Hide question modal
    questionModal.classList.add('hidden');
    
    // 2. Show "Time's Up" feedback (Orange instead of Green)
    feedbackText.textContent = `⏰ Time's Up! Scan again to retry.`;
    feedbackArea.classList.remove('hidden');
    feedbackArea.style.backgroundColor = '#ff9800'; 

    // 3. Return to scanner after 2 seconds
    setTimeout(() => {
        resetToScanner();
        feedbackArea.style.backgroundColor = ''; // Reset to default green
    }, 2000);
}

async function submitAnswer(selectedOption) {
    clearInterval(questionTimerInterval);
    if (!currentUser || !currentQuestionId) return;
    if (!isGameActive) { showGameOver(); return; }

    qText.textContent = "Recording answer...";
    qOptions.innerHTML = ''; 
    
    const submissionData = {
        student_password: currentUser.password,
        student_name: currentUser.name,
        student_class: currentUser.class,
        question_id: currentQuestionId,
        selected_answer: selectedOption,
        timestamp: Date.now()
    };

    try {
        const response = await fetch(`${FIREBASE_URL}/submissions.json?auth=${FIREBASE_SECRET}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(submissionData)
        });
        if (!response.ok) throw new Error("Network response was not ok");

        currentUser.answeredQuestions.add(currentQuestionId);

        questionModal.classList.add('hidden');
        feedbackText.textContent = `✅ Answer for ${currentQuestionId} Recorded!`;
        feedbackArea.classList.remove('hidden');

        setTimeout(() => { resetToScanner(); }, 2000);
    } catch (error) {
        qText.textContent = "❌ Failed to record. Tap to try again.";
        qOptions.innerHTML = `<button class="option-btn" onclick="loadQuestion('${currentQuestionId}')">Retry</button>`;
    }
}

function resetToScanner() {
    feedbackArea.classList.add('hidden');
    questionModal.classList.add('hidden');
    scannerArea.classList.remove('hidden');
    currentQuestionId = null;
    qText.style.color = "var(--text-color)";
    if (html5QrcodeScanner) html5QrcodeScanner.resume();
    clearInterval(questionTimerInterval);
}
// --- PROGRESS TRACKER ---
function updateProgressTracker() {
    if (!currentUser || !progressTracker) return;

    const answered = currentUser.answeredQuestions.size;
    const total = currentUser.totalQuestions;
    const percent = total > 0 ? (answered / total) * 100 : 0;

    // Build rarity breakdown HTML (only show rarities they've touched)
    let rarityHTML = '';
    const rarityLabels = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic' };
    for (const [rarity, count] of Object.entries(currentUser.answeredRarities)) {
        if (count > 0) {
            rarityHTML += `<span class="rarity-dot ${rarity}">${count} ${rarityLabels[rarity]}</span>`;
        }
    }

    // Check if they've answered everything
    const isComplete = answered >= total && total > 0;

    progressTracker.innerHTML = `
        <div class="progress-header">
            <span>📋 Quest Progress</span>
            <span>${answered} / ${total} Questions</span>
        </div>
        <div class="progress-bar-container ${isComplete ? 'progress-complete' : ''}">
            <div class="progress-bar-fill" style="width: ${percent}%"></div>
        </div>
        ${rarityHTML ? `<div class="progress-rarity-breakdown">${rarityHTML}</div>` : ''}
        ${isComplete ? '<div style="text-align:center; font-weight:bold; color:#FFD700; margin-top:5px;">🏆 ALL QUESTIONS COMPLETE!</div>' : ''}
    `;
}