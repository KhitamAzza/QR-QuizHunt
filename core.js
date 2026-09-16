// ==========================================
// 1. CONFIGURATION & GLOBAL STATE
// ==========================================
const FIREBASE_URL = 'https://qr-codehunt-default-rtdb.asia-southeast1.firebasedatabase.app'; 
const FIREBASE_SECRET = 'yhqWJQqmv7KY1gAGBUubYbbwaQtfnV3kjYR1hSIK'; 

// Global state shared across modules
let currentUser = null;
let isGameActive = false;

// ==========================================
// 2. DOM ELEMENTS (Shared & Core)
// ==========================================
const loginScreen = document.getElementById('login-screen');
const studentDashboard = document.getElementById('student-dashboard');
const teacherDashboard = document.getElementById('teacher-dashboard');
const gameOverOverlay = document.getElementById('game-over-overlay');

const passwordInput = document.getElementById('password-input');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const teacherLogoutBtn = document.getElementById('teacher-logout-btn');
const gameOverLogoutBtn = document.getElementById('game-over-logout-btn');

const displayName = document.getElementById('display-name');
const displayClass = document.getElementById('display-class');

// ==========================================
// 3. SCREEN MANAGEMENT
// ==========================================
function showScreen(screenElement) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    screenElement.classList.add('active');
    gameOverOverlay.classList.add('hidden');
}

function showGameOver() {
    gameOverOverlay.classList.remove('hidden');
    // Clean up student specific intervals/scanners if they exist
    if (window.html5QrcodeScanner) {
        window.html5QrcodeScanner.stop().then(() => { 
            window.html5QrcodeScanner.clear(); 
            window.html5QrcodeScanner = null; 
        }).catch(err => console.log(err));
    }
    if (window.studentTimerInterval) clearInterval(window.studentTimerInterval);
}

// ==========================================
// 4. LOGIN & LOGOUT LOGIC
// ==========================================
loginBtn.addEventListener('click', async () => {
    const password = passwordInput.value.trim();
    if (!password) return alert("Please enter your password!");

    // Teacher Route
    if (password.toLowerCase() === 'admin') {
        showScreen(teacherDashboard);
        loadTeacherDashboard(); // Function defined in teacher.js
        passwordInput.value = '';
        return;
    }

    // Student Route
    loginBtn.textContent = "Checking...";
    try {
        const response = await fetch(`${FIREBASE_URL}/students/${password}.json?auth=${FIREBASE_SECRET}`);
        const studentData = await response.json();

        if (studentData && studentData.name) {
            currentUser = { 
                password, 
                name: studentData.name, 
                class: studentData.class,
                answeredQuestions: new Set() 
            };

                    // Fetch past submissions to prevent duplicate answers AND count global uses
         const subsRes = await fetch(`${FIREBASE_URL}/submissions.json?auth=${FIREBASE_SECRET}`);
         const allSubs = await subsRes.json();
         
         // 1. Initialize the global tracker
         currentUser.globalQuestionUses = {};

         if (allSubs) {
             Object.values(allSubs).forEach(sub => {
                 // Track what THIS specific student has answered
                 if (sub.student_password === currentUser.password) {
                     currentUser.answeredQuestions.add(sub.question_id);
                 }
                 
                 // Track how many times EACH question has been used globally
                 const qId = sub.question_id;
                 currentUser.globalQuestionUses[qId] = (currentUser.globalQuestionUses[qId] || 0) + 1;
             });
         }

                    // Fetch total questions and build rarity breakdown of answered ones
        const questionsRes = await fetch(`${FIREBASE_URL}/questions.json?auth=${FIREBASE_SECRET}`);
        const allQuestions = await questionsRes.json();
        currentUser.totalQuestions = allQuestions ? Object.keys(allQuestions).length : 0;
        
        // --- NEW: Store max_uses for every question ---
        currentUser.questionMaxUses = {};
        if (allQuestions) {
            for (const [qId, q] of Object.entries(allQuestions)) {
                currentUser.questionMaxUses[qId] = q.max_uses || 99;
            }
        }

        // Track which rarities they've answered
        currentUser.answeredRarities = { common: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 };
        if (allQuestions && allSubs) {
            Object.values(allSubs).forEach(sub => {
                if (sub.student_password === currentUser.password && allQuestions[sub.question_id]) {
                    const rarity = allQuestions[sub.question_id].rarity 
                        ? allQuestions[sub.question_id].rarity.toLowerCase().trim() 
                        : 'common';
                    if (currentUser.answeredRarities[rarity] !== undefined) {
                        currentUser.answeredRarities[rarity]++;
                    }
                }
            });
        }
                    // --- NEW: Calculate Local Stats for Finish Screen ---
        currentUser.correctCount = 0;
        currentUser.rawScore = 0;
        const RARITY_POINTS = { common: 10, rare: 25, epic: 50, legendary: 100, mythic: 250 };

        if (allQuestions && allSubs) {
            Object.values(allSubs).forEach(sub => {
                if (sub.student_password === currentUser.password) {
                    const qId = sub.question_id;
                    const q = allQuestions[qId];
                    
                    // Track rarity
                    if (q) {
                        const rarity = q.rarity ? q.rarity.toLowerCase().trim() : 'common';
                        if (currentUser.answeredRarities[rarity] !== undefined) {
                            currentUser.answeredRarities[rarity]++;
                        }

                        // Check if correct and add score (ignore bombs for score)
                        if (q.chest_type !== 'bomb' && sub.selected_answer === q.correct_answer) {
                            currentUser.correctCount++;
                            currentUser.rawScore += (RARITY_POINTS[rarity] || 10);
                        }
                    }
                }
            });
        }

        displayName.textContent = currentUser.name;
        displayClass.textContent = currentUser.class;
        
        await checkGameStatusAndUpdateTimer(); 
        
        // --- NEW: Check if already finished ---
                // --- Check if already finished personally ---
        let resolvedChests = 0;
        if (currentUser.questionMaxUses) {
            for (const [qId, maxUses] of Object.entries(currentUser.questionMaxUses)) {
                const openedByMe = currentUser.answeredQuestions.has(qId);
                const claimedGlobally = (currentUser.globalQuestionUses[qId] || 0) >= maxUses;
                if (openedByMe || claimedGlobally) resolvedChests++;
            }
        }

        const isFinished = resolvedChests >= currentUser.totalQuestions && currentUser.totalQuestions > 0;

        if (isFinished) {
            showFinishScreen();
        } else if (isGameActive) {
            showScreen(studentDashboard);
            updateProgressTracker(); 
            startStudentTimer(); 
            startScanner();
            startAnnouncementPolling(); 
        } else {
            showGameOver();
        }

            displayName.textContent = currentUser.name;
            displayClass.textContent = currentUser.class;
            
            // Check game status before entering (Functions defined in student.js)
            await checkGameStatusAndUpdateTimer(); 
            if (isGameActive) {
                showScreen(studentDashboard);
                updateProgressTracker(); // From student.js
                startStudentTimer(); 
                startScanner(); 
            } else {
                showGameOver();
            }
        } else {
            alert("Password not found. Please check with your teacher.");
        }
    } catch (error) {
        console.error("Login error:", error);
        alert("Connection error. Check your internet or Firebase URL.");
    }
    loginBtn.textContent = "Login";
    passwordInput.value = '';
});

passwordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') loginBtn.click(); });

function handleLogout() {
    currentUser = null;
    if (window.studentTimerInterval) clearInterval(window.studentTimerInterval);
    if (window.html5QrcodeScanner) {
        window.html5QrcodeScanner.stop().then(() => {
            window.html5QrcodeScanner.clear();
            window.html5QrcodeScanner = null;
        }).catch(err => console.log(err));
    }

    // --- FIX: Force-hide ALL overlays so they don't bleed into the login screen ---
    const overlaysToHide = [
        'finish-overlay', 
        'parchment-overlay', 
        'chest-overlay', 
        'scroll-overlay', 
        'bomb-overlay', 
        'locked-overlay',
        'game-over-overlay'
    ];
    
    overlaysToHide.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    // --------------------------------------------------------------------------------

    showScreen(loginScreen);
    
    // Bonus: Clear the password field
    const passwordInput = document.getElementById('password-input');
    if (passwordInput) passwordInput.value = '';
}

logoutBtn.addEventListener('click', handleLogout);
teacherLogoutBtn.addEventListener('click', handleLogout);
gameOverLogoutBtn.addEventListener('click', handleLogout);
