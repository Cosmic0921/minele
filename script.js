const enterButton = document.querySelector(".enterWord");
const wordHistory = document.querySelector(".previousWords");
const guessHTML = document.querySelector(".status #gusses");
const minesHTML = document.querySelector(".status #mines");

let guessCounter = 20;
let minesRemain = 5;

guessHTML.innerText = `${guessCounter} Guesses`;
minesHTML.innerText = `${minesRemain} 💣`;

enterButton.addEventListener("click", function () {
    if (guessCounter > 0) guessCounter--;
    guessHTML.innerText = `${guessCounter} Guesses`;
});
for (let i = 1; i <= 25; i++) {
    let testText = document.createElement("p");
    testText.innerText = `Word ${i}`;
    wordHistory.append(testText);
}