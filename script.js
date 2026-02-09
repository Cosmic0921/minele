const enterButton = document.querySelector(".enterWord");
const wordHistory = document.querySelector(".previousWords");
const guessHTML = document.querySelector(".status #gusses");
const minesHTML = document.querySelector(".status #mines");
const removeLetter = document.querySelector(".removeLetter");
const timeHUD = document.querySelector(".timeLimit");
const wordBuffer = document.querySelector(".wordBuffer");
const keys = document.querySelectorAll(".keyboard .key");


let inputLocked = false;
let clockInstance;
// let shakeInstance;
timeHUD.innerText = `⏰ 01:00`;

let gameState = initGame({
    targetWord: "POINTER",
    wordLength: 7,
    maxGuesses: 15,
    lives: 3,
    mineCount: 5,
    timeLimitSeconds: 60
});

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

        guesses: []
    };
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
    const didWin = result.every(r => r === "correct");
    const didLose =
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
    if (gameState.currentGuess.length != gameState.wordLength) return;
    
    const guess = gameState.currentGuess;

    const outcome = resolveGuess(gameState, guess);
    if (!outcome) return;

    const {
        result, 
        bombHits,
        didWin,
        didLose
    } = outcome;

    inputLocked = true;

    revealBuffer(result, () => {
        addGuessToHistory(guess, result);
        guessHTML.innerText = 
            `${gameState.maxGuesses - gameState.guessCount} Guesses`;
        
        minesHTML.innerText = 
            `${gameState.bombLetters.size} 💣`;
        
        for (let key = 0; key < 26; key++) {
            keys[key].classList.add(gameState.letterKnowledge[keys[key].innerText]);
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
}

function handleWin() {
    inputLocked = true;
}

function handleLoss() {
    inputLocked = true;
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
function OS_Keyboard(letter) {
    if (inputLocked) return;
    addLetter(letter);
}
removeLetter.addEventListener("click", function () {
    if (inputLocked) return;
    removeLastLetter();
});

function timerTick() {
    gameState.timeRemainingMs -= 100;
    timeHUD.innerText = `⏰ ${Math.floor(gameState.timeRemainingMs / 60).toString().padStart(2, "0")}:${(gameState.timeRemainingMs % 60).toString().padStart(2, "0")}`;
    timerRunning = true;
    if (gameState.timeRemainingMs <= 1) {
        timeHUD.innerText = `⏰ 00:00`;
        timeOut();
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

function timeOut() {
    // clearInterval(shakeInstance);
    // stopShake();
    clearInterval(clockInstance);
}

// function rand(min, max) {
//     return Math.random() * (max - min) + min;
// }
// function shake() {
//     const x = rand(-5, 5);
//     const y = rand(-5, 5);

//     timer.style.transform = `translate(${x}px, ${y}px)`;
// }
// function stopShake() {
//     timer.style.transform = "translate(0px, 0px)";
// }

initWordBuffer();