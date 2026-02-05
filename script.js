const enterButton = document.querySelector(".enterWord");
const wordHistory = document.querySelector(".previousWords");
const guessHTML = document.querySelector(".status #gusses");
const minesHTML = document.querySelector(".status #mines");

let guessCounter = 20;
let minesRemain = 5;

guessHTML.innerText = `${guessCounter} Guesses`;
minesHTML.innerText = `${minesRemain} 💣`;

enterButton.addEventListener("click", function () {
    if (guessCounter > 0) {
        guessCounter--;
        guessHTML.innerText = `${guessCounter} Guesses`;

        let testText = document.createElement("p");
        testText.innerText = `Word ${21-guessCounter}`;
        wordHistory.append(testText);
    }
});
