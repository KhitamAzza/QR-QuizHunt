// --- DOM Elements ---
const loginScreen = document.getElementById('login-screen');
const studentDashboard = document.getElementById('student-dashboard');
const teacherDashboard = document.getElementById('teacher-dashboard');

const passwordInput = document.getElementById('password-input');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const teacherLogoutBtn = document.getElementById('teacher-logout-btn');

const displayName = document.getElementById('display-name');
const displayClass = document.getElementById('display-class');

const feedbackArea = document.getElementById('feedback-area');
const feedbackText = document.getElementById('feedback-text');

const manualInput = document.getElementById('manual-qr-input');
const manualSubmitBtn = document.getElementById('manual-submit-btn');

// --- State ---
let currentUser = null;
let userRole = null; // 'student' or 'teacher'
let html5QrcodeScanner = null;

// --- Screen Management ---
function showScreen(screenElement) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    screenElement.classList.add('active');
}

// --- Login Logic ---
loginBtn.addEventListener('click', () => {
    const password = passwordInput.value.trim();
    
    if (!password) {
        alert("Please enter your password!");
        return;
    }

    // MOCK LOGIC: 
    // If the password is "admin", treat them as a teacher. 
    // Otherwise, treat them as a student.
    // (Later, we will replace this with a Firebase check against your Google Sheet)
    
    if (password.toLowerCase() === 'admin') {
        userRole = 'teacher';
        currentUser = 'Teacher';
        showScreen(teacherDashboard);
    } else {
        userRole = 'student';
        currentUser = password; // The password is their name
        
        // Mocking the class data for now
        displayName.textContent = currentUser;
        displayClass.textContent = "Class 10A"; 
        
        showScreen(studentDashboard);
        startScanner();
    }
    
    // Clear the input field for next time
    passwordInput.value = '';
});

// Allow pressing "Enter" on the keyboard to login
passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loginBtn.click();
    }
});

// --- Logout Logic ---
function handleLogout() {
    currentUser = null;
    userRole = null;
    passwordInput.value = '';
    
    // Stop camera if it's running
    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(ignore => {
            html5QrcodeScanner.clear();
            html5QrcodeScanner = null;
        }).catch(err => console.log(err));
    }
    
    showScreen(loginScreen);
}

logoutBtn.addEventListener('click', handleLogout);
teacherLogoutBtn.addEventListener('click', handleLogout);

// --- QR Scanner Logic ---
function startScanner() {
    if (html5QrcodeScanner) return; // Already running

    html5QrcodeScanner = new Html5Qrcode("reader");
    
    const config = { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0 
    };

    html5QrcodeScanner.start(
        { facingMode: "environment" }, // Use rear camera
        config,
        onScanSuccess,
        onScanFailure
    ).catch(err => {
        console.warn("Camera not available or permission denied.", err);
        document.getElementById('reader').innerHTML = "<p style='padding:20px; color:red;'>Camera access denied. Please use manual entry below.</p>";
    });
}

function onScanSuccess(decodedText, decodedResult) {
    // The QR code might be a full URL like "https://app.com/?q=Q001" or just "Q001"
    let questionId = decodedText;
    
    // Simple parsing if it's a URL
    if (decodedText.includes('?q=')) {
        questionId = decodedText.split('?q=')[1];
    } else if (decodedText.includes('&q=')) {
        questionId = decodedText.split('&q=')[1].split('&')[0];
    }

    processAnswer(questionId);
}

function onScanFailure(error) {
    // Ignore scan failures (happens every frame when no QR is in view)
}

// --- Manual Entry Fallback ---
manualSubmitBtn.addEventListener('click', () => {
    const qId = manualInput.value.trim();
    if (qId) {
        processAnswer(qId);
        manualInput.value = '';
    }
});

// --- Core Game Logic ---
function processAnswer(questionId) {
    // 1. Stop scanner temporarily so it doesn't keep scanning the same code
    if (html5QrcodeScanner) {
        html5QrcodeScanner.pause(true); 
    }

    // 2. Show Feedback
    feedbackText.textContent = `Answer for ${questionId} Recorded!`;
    feedbackArea.classList.remove('hidden');

    // TODO: Later, we will send this data to Firebase here:
    // saveToFirebase(currentUser, questionId, selectedAnswer);

    // 3. Reset after 2 seconds
    setTimeout(() => {
        feedbackArea.classList.add('hidden');
        if (html5QrcodeScanner) {
            html5QrcodeScanner.resume();
        }
    }, 2000);
}