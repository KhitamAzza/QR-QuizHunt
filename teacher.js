// ==========================================
// 1. TEACHER DOM ELEMENTS
// ==========================================
const gameDurationInput = document.getElementById('game-duration');
const startGameBtn = document.getElementById('start-game-btn');
const stopGameBtn = document.getElementById('stop-game-btn');
const gameStatusText = document.getElementById('game-status-text');
const refreshScoresBtn = document.getElementById('refresh-scores-btn');
const leaderboardBody = document.getElementById('leaderboard-body');

// ==========================================
// 2. TEACHER DASHBOARD INIT & STATUS
// ==========================================
function loadTeacherDashboard() {
    checkTeacherGameStatus();
    calculateAndRenderLeaderboard();
}

async function checkTeacherGameStatus() {
    try {
        const response = await fetch(`${FIREBASE_URL}/gameSettings.json?auth=${FIREBASE_SECRET}`);
        const settings = await response.json();
        if (settings && settings.isActive) {
            const now = Date.now();
            if (now < settings.endTime) {
                const minsLeft = Math.ceil((settings.endTime - now) / 60000);
                gameStatusText.textContent = `🟢 Game is ACTIVE. Time remaining: ~${minsLeft} mins.`;
                gameStatusText.style.color = "green";
                isGameActive = true;
            } else {
                gameStatusText.textContent = `🔴 Game ENDED (Time expired).`;
                gameStatusText.style.color = "red";
                isGameActive = false;
            }
        } else {
            gameStatusText.textContent = `🔴 Game is STOPPED.`;
            gameStatusText.style.color = "red";
            isGameActive = false;
        }
    } catch (error) {
        gameStatusText.textContent = "🟡 Could not fetch game status.";
    }
}

// ==========================================
// 3. GAME CONTROLS
// ==========================================
startGameBtn.addEventListener('click', async () => {
    const duration = parseInt(gameDurationInput.value);
    if (!duration || duration < 1) return alert("Please enter a valid duration in minutes.");
    
    const now = Date.now();
    const endTime = now + (duration * 60 * 1000);
    
    const settings = { isActive: true, durationMinutes: duration, startTime: now, endTime: endTime };

    try {
        await fetch(`${FIREBASE_URL}/gameSettings.json?auth=${FIREBASE_SECRET}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        alert("Game Started!");
        checkTeacherGameStatus();
    } catch (error) {
        alert("Failed to start game.");
    }
});

stopGameBtn.addEventListener('click', async () => {
    if (!confirm("Are you sure you want to end the game early?")) return;
    try {
        await fetch(`${FIREBASE_URL}/gameSettings.json?auth=${FIREBASE_SECRET}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive: false })
        });
        alert("Game Ended.");
        checkTeacherGameStatus();
    } catch (error) {
        alert("Failed to stop game.");
    }
});

// ==========================================
// 4. DYNAMIC ARCADE SCORING & LEADERBOARD
// ==========================================
refreshScoresBtn.addEventListener('click', calculateAndRenderLeaderboard);

async function calculateAndRenderLeaderboard() {
    leaderboardBody.innerHTML = "<tr><td colspan='6'>Calculating scores...</td></tr>";
    
    // 1. Define the Retro Point Values for each rarity
    const RARITY_POINTS = {
        common: 10,
        rare: 25,
        epic: 50,
        legendary: 100,
        mythic: 250
    };

    try {
        // 2. Fetch all data in parallel
        const [studentsRes, questionsRes, submissionsRes] = await Promise.all([
            fetch(`${FIREBASE_URL}/students.json?auth=${FIREBASE_SECRET}`).then(r => r.json()),
            fetch(`${FIREBASE_URL}/questions.json?auth=${FIREBASE_SECRET}`).then(r => r.json()),
            fetch(`${FIREBASE_URL}/submissions.json?auth=${FIREBASE_SECRET}`).then(r => r.json())
        ]);

        const students = studentsRes || {};
        const questions = questionsRes || {};
        const submissions = submissionsRes ? Object.values(submissionsRes) : [];

        // 3. CALCULATE THE "AUTO MAX SCORE"
        let maxPossibleScore = 0;
        for (const qId in questions) {
            const q = questions[qId];
            const rarity = q.rarity ? q.rarity.toLowerCase().trim() : 'common';
            maxPossibleScore += (RARITY_POINTS[rarity] || 10); // Default to 10 if rarity is missing
        }

        // Prevent division by zero if there are no questions
        if (maxPossibleScore === 0) maxPossibleScore = 1; 

        // 4. Initialize student score trackers
        const scores = {};
        for (const [password, data] of Object.entries(students)) {
            scores[password] = {
                name: data.name,
                class: data.class,
                rawScore: 0,
                questionsAnswered: new Set()
            };
        }

        // 5. Grade the submissions
        submissions.forEach(sub => {
            const qId = sub.question_id;
            const studentPwd = sub.student_password;
            
            if (scores[studentPwd] && questions[qId]) {
                // Only count each question once per student
                if (!scores[studentPwd].questionsAnswered.has(qId)) {
                    scores[studentPwd].questionsAnswered.add(qId);
                    
                    // If they got it right, add the points for that rarity!
                    if (sub.selected_answer === questions[qId].correct_answer) {
                        const rarity = questions[qId].rarity ? questions[qId].rarity.toLowerCase().trim() : 'common';
                        scores[studentPwd].rawScore += (RARITY_POINTS[rarity] || 10);
                    }
                }
            }
        });

        // 6. Calculate Final Grades & Ranks, then sort
        const leaderboard = Object.values(scores).map(s => {
            const percentage = (s.rawScore / maxPossibleScore) * 100;
            let rank = "💀 F-Rank";
            if (percentage >= 90) rank = "🏆 S-Rank";
            else if (percentage >= 80) rank = "🥇 A-Rank";
            else if (percentage >= 70) rank = "🥈 B-Rank";
            else if (percentage >= 60) rank = "🥉 C-Rank";

            return {
                ...s,
                questionsAnswered: s.questionsAnswered.size,
                percentage: percentage.toFixed(1), // Keep 1 decimal place
                rank: rank
            };
        }).sort((a, b) => b.rawScore - a.rawScore); // Sort by raw score descending

        // 7. Render the Table
        if (leaderboard.length === 0) {
            leaderboardBody.innerHTML = "<tr><td colspan='6'>No students found.</td></tr>";
            return;
        }

        leaderboardBody.innerHTML = leaderboard.map((student, index) => `
            <tr>
                <td>#${index + 1}</td>
                <td>${student.name}</td>
                <td>${student.class}</td>
                <td>${student.rawScore} / ${maxPossibleScore}</td>
                <td><strong>${student.percentage}%</strong></td>
                <td style="font-weight: bold; color: ${student.percentage >= 60 ? '#4CAF50' : '#f44336'};">${student.rank}</td>
            </tr>
        `).join('');

    } catch (error) {
        console.error("Error calculating leaderboard:", error);
        leaderboardBody.innerHTML = "<tr><td colspan='6' style='color:red;'>Error loading scores.</td></tr>";
    }
}
// ==========================================
// 5. PURGE SUBMISSIONS (CLEAR ALL ANSWERS)
// ==========================================
const purgeSubmissionsBtn = document.getElementById('purge-submissions-btn');

purgeSubmissionsBtn.addEventListener('click', async () => {
    // 1. Strict confirmation to prevent accidents
    const confirmed = confirm("⚠️ WARNING: This will permanently delete ALL student answers and reset the leaderboard to 0. This cannot be undone.\n\nAre you sure you want to clear all submissions?");
    if (!confirmed) return;

    // 2. Disable button and show loading state
    purgeSubmissionsBtn.textContent = "Clearing...";
    purgeSubmissionsBtn.disabled = true;

    try {
        // 3. Send DELETE request to the submissions node
        const response = await fetch(`${FIREBASE_URL}/submissions.json?auth=${FIREBASE_SECRET}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error("Network response was not ok");

        // 4. Success feedback
        alert("✅ All answers have been successfully cleared!");
        
        // 5. Refresh the leaderboard so it immediately shows 0 scores
        calculateAndRenderLeaderboard();

    } catch (error) {
        console.error("Purge error:", error);
        alert("❌ Failed to clear answers. Please check your internet connection.");
    } finally {
        // 6. Re-enable button
        purgeSubmissionsBtn.textContent = "🗑️ Clear All Answers";
        purgeSubmissionsBtn.disabled = false;
    }
});