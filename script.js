const enterButton = document.querySelector(".enterWord");
const wordHistory = document.querySelector(".previousWords");
const guessHTML = document.querySelector(".status #gusses");
const minesHTML = document.querySelector(".status #mines");
const removeLetter = document.querySelector(".removeLetter");
const timeHUD = document.querySelector(".timeLimit");
const wordBuffer = document.querySelector(".wordBuffer");
const keys = document.querySelectorAll(".keyboard .key");
const flagBtn = document.querySelector(".flagBtn");
const guessBtn = document.querySelector(".guessBtn");
const letterLogic = document.querySelector(".letterBoard");
const clock = document.querySelector(".timeLimit #clock-icon")

let timerRunning = false;
let ALLOWED_WORDS = [];
let SOLUTION_WORDS = [];
async function loadWords(wordLength) {
    const response = await fetch("valid-wordle-words.txt");
    const text = await response.text();

    const allWords = text.toUpperCase().split("\n");

    ALLOWED_WORDS = allWords.filter(w => w.length === wordLength);

    // Solution list filtering (curation pass)
    SOLUTION_WORDS = await fetch("shuffled_real_wordles.txt");
    SOLUTION_WORDS = await SOLUTION_WORDS.text();
    SOLUTION_WORDS = SOLUTION_WORDS.toUpperCase().split('\n');

    console.log("Allowed:", ALLOWED_WORDS.length);
    console.log("Solutions:", SOLUTION_WORDS.length);
}

function rand(min, max) {
    return Math.random() * (max - min) + min;
}

function shakeText(element, intensity = 2) {
    const x = rand(-intensity, intensity);
    const y = rand(-intensity, intensity);

    element.style.transform = `translate(${x}px, ${y}px)`;
}

function stopShake(element) {
    element.style.transform = "translate(0px, 0px)";
}


function isPlayableWord(word) {
    // Must contain at least 2 vowels
    const vowelCount = (word.match(/[AEIOU]/g) || []).length;
    if (vowelCount < 2) return false;

    // Avoid rare Scrabble junk endings
    if (word.endsWith("S") && word.length > 7) return false;

    // Avoid extreme consonant clusters
    if (/[BCDFGHJKLMNPQRSTVWXYZ]{5}/.test(word)) return false;

    return true;
}


const sfx = {
    bombHit: new Audio("sfx/broken-glass.mp3"),
    bombDefuse: new Audio("sfx/correct-sfx.mp3"),
    bombIncorrect: new Audio("sfx/wrong-sfx.mp3"),
    // win: new Audio("sfx/win.mp3"),
    // lose: new Audio("sfx/lose.mp3"),
    music: new Audio("sfx/clockin-out-late.mp3")
}

const boomFlash = document.createElement("div");
boomFlash.className = "boom-flash";
document.body.appendChild(boomFlash);


for (let i = 65; i <= 90; i++) {
    const LBcol = document.createElement("div");
    const LBprox = document.createElement("div");
    const LBletter = document.createElement("div");
    LBcol.className = "lb-col";
    LBcol.setAttribute("data-letter", String.fromCharCode(i));
    LBprox.className = "lb-proximity";
    LBletter.className = "lb-letter";
    LBletter.innerText = String.fromCharCode(i);

    LBcol.append(LBprox, LBletter);
    letterLogic.append(LBcol);
}

document.body.classList.add("pre-game");

keys.forEach((key, i) => {
    key.style.animationDelay = `${i * 40}ms`;
});

keys.forEach(key => {
    key.addEventListener("click", () => {
        const letter = key.innerText;

        if (inputMode === "FLAG") {
            toggleFlag(letter, key);
            setInputMode("NONE");
            return;
        }

        if (inputMode === "GUESS") {
            let outcome = resolveBombGuess(letter, key);
            if (!outcome) gameState.guessCount++;
            guessHTML.innerText = 
                `${gameState.maxGuesses - gameState.guessCount} G`;
            setInputMode("NONE");
            return;
        }

        // Normal typing mode
        addLetter(letter);
    });
});

function toggleFlag(letter, keyEl) {
    const flags = gameState.flaggedLetters;

    if (flags.has(letter)) {
        flags.delete(letter);
        keyEl.classList.remove("flagged");
    } else {
        flags.add(letter);
        keyEl.classList.add("flagged");
    }
}

function buildProximityMap(bombLetters) {
    const map = {};

    for (let i = 0; i < 26; i++) {
        const letter = String.fromCharCode(65 + i);
        let min = Infinity;

        for (const bomb of bombLetters) {
            const bIdx = bomb.charCodeAt(0) - 65;
            min = Math.min(min, Math.abs(i - bIdx));
        }

        map[letter] = min === 0 ? "BOMB" : min;
    }

    return map;
}

function resolveBombGuess(letter, key) {
    // already guessed for time
    if (gameState.guessedBombs.has(letter)) return null;

    // already hurt player — no reward allowed
    if (gameState.trippedBombs.has(letter)) return null;


    if (gameState.bombLetters.has(letter)) {
        gameState.guessedBombs.add(letter);
        gameState.secondsTimer += 45;
        gameState.hesitationCounter = 0;
        key.classList.add("bomb-disabled");
        gameState.remainingBombs.delete(letter);
        letterBoardState.revealed.add(letter);
        renderLetterBoard();
        minesHTML.innerText =
            `${gameState.remainingBombs.size} 💣`;

        sfx.bombDefuse.currentTime = 0;
        sfx.bombDefuse.play();
    } else {
        key.classList.add("bomb-wrong");
        sfx.bombIncorrect.currentTime = 0;
        sfx.bombIncorrect.play();
    }
}

let inputMode = "NONE";
// "NONE" | "FLAG" | "GUESS"
let gameStarted = false;
let inputLocked = false;
let selectedKey = null;
let clockInstance;
let shakeInstance;
const letterBoardState = {
    proximityMap: {},  
    revealed: new Set(), 
};

const hasteState = {
    active: false,
    startTime: 0,
    duration: 2000, // total ms, tune this
};


let gameState;
(async function start() {
    await loadWords(5);

    gameState = initGame({
        targetWord: getRandomWord(),
        wordLength: 5,
        maxGuesses: 15,
        lives: 3,
        mineCount: 8,
        timeLimitSeconds: 90,
    });

    initWordBuffer();
})();
function getRandomWord() {
    return SOLUTION_WORDS[
        Math.floor(Math.random() * SOLUTION_WORDS.length)
    ];
}

function initGame(config) {
    const {
        targetWord,
        wordLength,
        maxGuesses,
        lives,
        mineCount,
        timeLimitSeconds
    } = config;

    if (!targetWord || targetWord.length !== wordLength) {
        throw new Error("Invalid target word");
    }

    const letterKnowledge = {};
    for (let i = 65; i <= 90; i++) {
        letterKnowledge[String.fromCharCode(i)] = "unknown";
    }

    const bombLetters = new Set();
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        .split("")
        .filter(l => !targetWord.includes(l));

    while (bombLetters.size < mineCount) {
        const letter = alphabet[Math.floor(Math.random() * alphabet.length)];
        bombLetters.add(letter);
    }

    guessHTML.innerText =
            `${maxGuesses} G`;
    minesHTML.innerText =
    `${mineCount} 💣`;

    letterBoardState.proximityMap =
        buildProximityMap(bombLetters);

    renderLives(lives);
    return {
        state: "PLAYING",

        targetWord,
        wordLength,
        maxGuesses,

        firstGameMade: false,

        currentGuess: "",
        guessCount: 0,

        bombLetters,
        lives,

        secondsTimer: timeLimitSeconds,
        subSecond: 0,
        hesitationCounter: 0,

        letterKnowledge,

        trippedBombs: new Set(),
        flaggedLetters: new Set(),
        guessedBombs: new Set(),

        remainingBombs: new Set(bombLetters),

        guesses: []
    };
}

function renderLetterBoard() {
    const columns = document.querySelectorAll(".letterBoard .lb-col");

    columns.forEach(col => {
        const letter = col.dataset.letter;
        const proximityEl = col.querySelector(".lb-proximity");
        const letterEl = col.querySelector(".lb-letter");

        if (!letterBoardState.revealed.has(letter)) {
            proximityEl.innerText = "";
            col.classList.remove("revealed", "bomb");
            return;
        }

        const value = letterBoardState.proximityMap[letter];


        if (value === "BOMB") {
            proximityEl.innerText = "💣";
            col.classList.add("bomb");
        } else {
            proximityEl.innerText = value;
            col.classList.remove("bomb");
        }
    });
}


flagBtn.addEventListener("click", () => {
    setInputMode(inputMode === "FLAG" ? "NONE" : "FLAG");
});

guessBtn.addEventListener("click", () => {
    setInputMode(inputMode === "GUESS" ? "NONE" : "GUESS");
});

function setInputMode(mode) {
    inputMode = mode;

    flagBtn.classList.toggle("active-flag", mode === "FLAG");
    guessBtn.classList.toggle("active-guess", mode === "GUESS");

    document.body.classList.toggle("flag-mode", mode === "FLAG");
    document.body.classList.toggle("guess-mode", mode === "GUESS");
}

function triggerHaste() {
    const overlay = document.getElementById("hasteOverlay");

    hasteState.active = true;
    hasteState.startTime = performance.now();

    overlay.style.display = "block";
}

function updateHaste(now) {
    if (!hasteState.active) return;

    const overlay = document.getElementById("hasteOverlay");
    const elapsed = now - hasteState.startTime;
    const progress = elapsed / hasteState.duration;

    if (progress >= 1 || !inputLocked) {
        overlay.style.display = "none";
        overlay.style.opacity = 0;
        overlay.style.transform = "translate(-50%, -50%)";
        hasteState.active = false;
        return;
    }

    // Fade curve: fade in fast, fade out slow
    const opacity =
        progress < 0.4
            ? progress / 0.4
            : 1 - ((progress - 0.4) / 0.6);

    // Shake intensity increases over time
    const shakeStrength = progress * 10;

    const offsetX = (Math.random() - 0.5) * shakeStrength;
    const offsetY = (Math.random() - 0.5) * shakeStrength;

    overlay.style.opacity = opacity;
    overlay.style.transform =
        `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`;
}


function resolveGuess(state, guess) {
    if (state.state !== "PLAYING") return null;
    if (guess.length !== state.wordLength) return null;

    const result = evaluateGuess(guess, state.targetWord);

    // --- Bombs ---
    let bombHits = 0;

    // Count bombs first
    for (let i = 0; i < guess.length; i++) {
        if (state.bombLetters.has(guess[i])) {
            bombHits++;
        }
    }

    // First guess remap protection
    if (state.guessCount === 0 && bombHits > 0) {
        triggerHaste();
        remapFirstGuessBombs(guess, state);

        // Rebuild proximity map
        letterBoardState.proximityMap = buildProximityMap(state.bombLetters);
        
        state.remainingBombs = new Set(state.bombLetters);

        // Recalculate bomb hits after remap
        bombHits = 0;
        for (let i = 0; i < guess.length; i++) {
            if (state.bombLetters.has(guess[i])) {
                bombHits++;
            }
        }
    }

    // Now apply damage + register tripped bombs
    for (let i = 0; i < guess.length; i++) {
        if (state.bombLetters.has(guess[i])) {
            state.trippedBombs.add(guess[i]);
            state.remainingBombs.delete(guess[i]);
        }
    }

    state.lives = Math.max(0, state.lives - bombHits);


    // --- Letter knowledge ---
    for (let i = 0; i < guess.length; i++) {
        const letter = guess[i];
        const evalResult = result[i];
        const current = state.letterKnowledge[letter];

        if (evalResult === "correct") {
            state.letterKnowledge[letter] = "correct";
        } else if (evalResult === "misplaced" && current !== "correct") {
            state.letterKnowledge[letter] = "present";
        } else if (evalResult === "absent" && current === "unknown") {
            state.letterKnowledge[letter] = "absent";
        }
    }

    // --- History ---
    state.guesses.push({
        word: guess,
        result,
        bombHits
    });

    state.guessCount++;

    // --- Win / Lose ---
    const solvedWord = result.every(r => r === "correct");
    let didWin = solvedWord && state.lives > 0;
    let didLose =
        state.lives <= 0 ||
        state.guessCount >= state.maxGuesses;

    if (didLose) didWin = false;
    if (didWin) state.state = "WON";
    if (didLose) state.state = "LOST";

    minesHTML.innerText =
    `${gameState.remainingBombs.size} 💣`;

    return {
        result,
        bombHits,
        didWin,
        didLose
    };
}
function remapFirstGuessBombs(guess, state) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

    guess.split("").forEach(letter => {
        if (state.bombLetters.has(letter)) {
            // Remove bomb from guessed letter
            state.bombLetters.delete(letter);

            // Find replacement letter
            let replacement;

            do {
                replacement = alphabet[Math.floor(Math.random() * 26)];
            } while (
                state.bombLetters.has(replacement) ||
                guess.includes(replacement)
            );

            state.bombLetters.add(replacement);
        }
    });
}

function initWordBuffer() {
    wordBuffer.innerHTML = "";
    wordBuffer.style.setProperty("--word-length", gameState.wordLength);

    for (let i = 0; i < gameState.wordLength; i++) {
        const cell = document.createElement("div");
        cell.className = "bufferLetter";
        cell.innerText = "";
        wordBuffer.appendChild(cell);
    }
}

function revealBuffer(evaluation, callback) {
    inputLocked = true;
    const cells = wordBuffer.children;

    let i = 0;

    function revealNext() {
        if (i >= gameState.wordLength) {
            inputLocked = false;
            callback();
            return;
        }

        const cell = cells[i];
        cell.classList.add("reveal");

        setTimeout(() => {
            cell.classList.add(evaluation[i]);
            i++;
            revealNext();
        }, 400);
    }

    revealNext();
}

function addLetter(letter) {
    if (gameState.currentGuess.length >= gameState.wordLength) return;
    gameState.currentGuess += letter;
    renderWordBuffer();
}

function removeLastLetter() {
    gameState.currentGuess = gameState.currentGuess.slice(0, -1);
    renderWordBuffer();
}

function renderWordBuffer() {
    const cells = wordBuffer.children;
    for (let i = 0; i < gameState.wordLength; i++) {
        cells[i].innerText = gameState.currentGuess[i] || "";
    }
}

function addGuessToHistory(word, evaluation) {
    const row = document.createElement("div");
    row.className = "historyRow";

    /* 
    font-family: "Lato", sans-serif;
    font-size: clamp(24px, 4vw, 48px);
    */
    for (let i = 0; i < word.length; i++) {
        const span = document.createElement("span");
        span.className = `historyLetter ${evaluation[i]}`;
        span.innerText = word[i];
        row.appendChild(span);
    }

    wordHistory.appendChild(row);
}

function submitGuess() {
    if (inputLocked) return;
    if (gameState.state !== "PLAYING") return;
    if (gameState.currentGuess.length !== gameState.wordLength) return;


    const guess = gameState.currentGuess;
    if (!ALLOWED_WORDS.includes(guess)) return;
    if (!gameStarted) {
        startGame();
    }

    const outcome = resolveGuess(gameState, guess);
    if (!outcome) return;

    // --- LETTER BOARD UPDATE (ONCE, HERE) ---
    for (const letter of guess) {
        letterBoardState.revealed.add(letter);
    }
    renderLetterBoard();
    // ---------------------------------------

    const {
        result,
        bombHits,
        didWin,
        didLose
    } = outcome;

    inputLocked = true;

    if (bombHits > 0) {
        flashBombDamage(bombHits);
    }
    gameState.hesitationCounter = 0;
    revealBuffer(result, () => {
        addGuessToHistory(guess, result);

        guessHTML.innerText =
            `${gameState.maxGuesses - gameState.guessCount} G`;

        minesHTML.innerText =
            `${gameState.remainingBombs.size} 💣`;

        for (const keyEl of keys) {
            keyEl.classList.remove(
                "correct",
                "present",
                "absent",
            );

            const letter = keyEl.innerText;

            if (gameState.trippedBombs.has(letter)) {
                keyEl.classList.add("bomb-tripped");
                continue;
            }

            const state = gameState.letterKnowledge[letter];
            if (state && state !== "unknown") {
                keyEl.classList.add(state);
            }
        }

        gameState.currentGuess = "";
        initWordBuffer();

        if (didWin) {
            handleWin();
        } else if (didLose) {
            handleLoss();
        } else {
            inputLocked = false;
        }
    });

    renderLives(gameState.lives);
}

function computeProximity(letter, bombSet) {
    const index = letter.charCodeAt(0) - 65;
    let min = Infinity;

    for (const bomb of bombSet) {
        const bombIndex = bomb.charCodeAt(0) - 65;
        const dist = Math.abs(index - bombIndex);
        if (dist < min) min = dist;
    }

    return min;
}


function flashBombDamage(count) {
    boomFlash.classList.add("active");

    setTimeout(() => {
        boomFlash.classList.remove("active");
    }, 300);

    sfx.bombHit.currentTime = 0;
    sfx.bombHit.play();
}


function startGame() {
    gameStarted = true; 
    document.body.classList.remove("pre-game"); 
    document.body.classList.add("in-game"); 
    
    requestAnimationFrame(handleHaste);
    clockInstance = setInterval(timerTick, 25);
    shakeInstance = setInterval(shake, 10);
    requestAnimationFrame(animateClock);
    sfx.music.volume = 0.3;
    sfx.music.play();
}

function handleHaste(now) {
    updateHaste(now);

    requestAnimationFrame(handleHaste);
}
function handleWin() {
    clearInterval(clockInstance);
    clearInterval(shakeInstance);
    inputLocked = true;

    document.body.classList.add("game-won");

    // sfx.win.play();
    sfx.music.pause();

    setTimeout(() => {
        alert("You Win.");
    }, 300);
}

function handleLoss() {
    clearInterval(clockInstance);
    clearInterval(shakeInstance);
    inputLocked = true;

    document.body.classList.add("game-lost");

    setTimeout(() => {
        alert(`You Lost. Word was ${gameState.targetWord}`);
    }, 300);

    // sfx.lose.play();
    sfx.music.pause();
}

enterButton.addEventListener("click", function () {
    if (inputLocked) return;
    submitGuess();
});
document.addEventListener('keydown', (event) => {
    if (inputLocked) return;
    const key = event.key.toUpperCase();
    const testKeyInput = /^[A-Z]$/.test(key);
    if (testKeyInput) {
        addLetter(key);
    } else if (event.key === "Backspace") {
        removeLastLetter();
    } else if (event.key === "Enter") {
        submitGuess();
    }
});
removeLetter.addEventListener("click", function () {
    if (inputLocked) return;
    removeLastLetter();
});
function timerTick() {
    if (inputLocked && timerRunning) return;
    if (timerRunning) {
        gameState.subSecond--;
        if (gameState.subSecond < 0) {
            gameState.secondsTimer--;
            gameState.hesitationCounter = Math.min(gameState.hesitationCounter + 3, 45);
            gameState.subSecond = 60 - gameState.hesitationCounter;
        }
    }
    updateTimer(gameState.secondsTimer, gameState.subSecond);
    timerRunning = true;
    if (gameState.secondsTimer == 0 && gameState.subSecond == 0) {
        handleLoss();
    }
}
function updateTimer(secondsLeft, subSecondsLeft) {
    // const total = gameState.timeLimitMs * 1000;

    const text = document.querySelector(".timeLimit #timer-text");
    const clock = document.querySelector(".timeLimit #clock-icon");

    text.innerText =  `${secondsLeft.toString().padStart(2, "0")}:${subSecondsLeft.toString().padStart(2, "0")}`;

    // Color transition
    text.style.color = `red`;

    // Random shake intensity
    // const intensity = dangerRatio * 2;
    
    // if (dangerRatio > 0.2) {
        
    // } else {
    //     stopShake(text);
    // }
}

function shake() {
    const text = document.querySelector(".timeLimit #timer-text");
    shakeText(text, (gameState.hesitationCounter / 10));
}

let startTime = null;

function animateClock(timestamp) {
    if (!startTime) startTime = timestamp;

    const elapsed = (timestamp - startTime) / 1000;

    const period = 2; // seconds per full swing cycle
    const phase = (elapsed % period) / period;

    // Triangle wave mapped to [-π/4, π/4]
    const omega = 2 * Math.PI / period;
    const theta = (Math.PI / 4) * Math.sin(omega * elapsed);


    // Radius of swing (pixels)
    const radius = 20;

    const x = radius * Math.sin(theta) - 15;
    const y = radius * Math.cos(theta) - 15;

    clock.style.transform = `
        translate(${x}px, ${-y}px)
        rotate(${theta}rad)
    `;

    requestAnimationFrame(animateClock);
}

function renderLives(lives, maxLives = 3) {
    const container = document.getElementById("lives");
    container.innerHTML = "";

    for (let i = 0; i < maxLives; i++) {
        const heart = document.createElement("span");
        heart.className = "heart";
        heart.innerText = "❤️";
        if (i >= lives) heart.classList.add("dead");
        container.appendChild(heart);
    }
}
function evaluateGuess(guess, answer) {
    const result = Array(guess.length).fill("absent");
    const answerLetters = answer.split("");

    for (let i = 0; i < guess.length; i++) {
        if (guess[i] === answer[i]) {
            result[i] = "correct";
            answerLetters[i] = null;
        }
    }

    for (let i = 0; i < guess.length; i++) {
        if (result[i] !== "absent") continue;

        const idx = answerLetters.indexOf(guess[i]);
        if (idx !== -1) {
            result[i] = "misplaced";
            answerLetters[idx] = null;
        }
    }

    return result;
}
