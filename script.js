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

let ALLOWED_WORDS = [];
let SOLUTION_WORDS = [];
async function loadWords(wordLength) {
    const response = await fetch("sowpods.txt");
    const text = await response.text();

    const allWords = text.split("\n");

    ALLOWED_WORDS = allWords.filter(w => w.length === wordLength);

    // Solution list filtering (curation pass)
    SOLUTION_WORDS = ALLOWED_WORDS.filter(isPlayableWord);

    console.log("Allowed:", ALLOWED_WORDS.length);
    console.log("Solutions:", SOLUTION_WORDS.length);
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
    // win: new Audio("sfx/win.mp3"),
    // lose: new Audio("sfx/lose.mp3"),
    music: new Audio("sfx/golf-2-PT.mp3")
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
        gameState.timeRemainingMs += 45_000;
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
    }
}

let inputMode = "NONE";
// "NONE" | "FLAG" | "GUESS"
let gameStarted = false;
let inputLocked = false;
let selectedKey = null;
let clockInstance;
// let shakeInstance;
const letterBoardState = {
    proximityMap: {},  
    revealed: new Set(), 
};

let gameState;
(async function start() {
    await loadWords(7);

    gameState = initGame({
        targetWord: getRandomWord(),
        wordLength: 7,
        maxGuesses: 15,
        lives: 3,
        mineCount: 5,
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

    letterBoardState.proximityMap =
        buildProximityMap(bombLetters);

    timeHUD.innerText = `⏰ ${Math.floor(timeLimitSeconds / 60).toString().padStart(2, "0")}:${(timeLimitSeconds % 60).toString().padStart(2, "0")}`;
    renderLives(lives);
    return {
        state: "PLAYING",

        targetWord,
        wordLength,
        maxGuesses,

        currentGuess: "",
        guessCount: 0,

        bombLetters,
        lives,

        timeLimitMs: timeLimitSeconds * 1000,
        timeRemainingMs: timeLimitSeconds * 1000,

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

function resolveGuess(state, guess) {
    if (state.state !== "PLAYING") return null;
    if (guess.length !== state.wordLength) return null;

    const result = evaluateGuess(guess, state.targetWord);

    // --- Bombs ---
    let bombHits = 0;
    for (let i = 0; i < guess.length; i++) {
        if (state.bombLetters.has(guess[i])) {
            bombHits++;
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

    return {
        result,
        bombHits,
        didWin,
        didLose
    };
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
    
    clockInstance = setInterval(timerTick, 1000);
    sfx.music.volume = 0.3;
    sfx.music.play();
}

function handleWin() {
    clearInterval(clockInstance);
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
    gameState.timeRemainingMs -= 1000;
    timeHUD.innerText = `⏰ ${Math.floor(gameState.timeRemainingMs / 60000).toString().padStart(2, "0")}:${((gameState.timeRemainingMs / 1000) % 60).toString().padStart(2, "0")}`;
    timerRunning = true;
    if (gameState.timeRemainingMs <= 1) {
        timeHUD.innerText = `⏰ 00:00`;
        handleLoss();
    }
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