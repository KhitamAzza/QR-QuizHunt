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
            
            // Fetch past submissions to prevent duplicate answers
            const subsRes = await fetch(`${FIREBASE_URL}/submissions.json?auth=${FIREBASE_SECRET}`);
            const allSubs = await subsRes.json();
            if (allSubs) {
                Object.values(allSubs).forEach(sub => {
                    if (sub.student_password === currentUser.password) {
                        currentUser.answeredQuestions.add(sub.question_id);
                    }
                });
            }

            displayName.textContent = currentUser.name;
            displayClass.textContent = currentUser.class;
            
            // Check game status before entering (Functions defined in student.js)
            await checkGameStatusAndUpdateTimer(); 
            if (isGameActive) {
                showScreen(studentDashboard);
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
    showScreen(loginScreen);
}

logoutBtn.addEventListener('click', handleLogout);
teacherLogoutBtn.addEventListener('click', handleLogout);
gameOverLogoutBtn.addEventListener('click', handleLogout);