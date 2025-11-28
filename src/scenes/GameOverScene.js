export class GameOverScene {
    constructor(game) {
      this.game = game;
    }
  
    enter() {
      this.game.ui.clearAllUI();
      const over = document.createElement('div');
      over.id = 'gameOver';
      over.style = 'text-align: center; color: red; font-size: 2em; padding-top: 20vh;';
      over.innerHTML = `
        <p>Game Over</p>
        <button id="restartBtn">Restart</button>`;
      document.body.appendChild(over);
  
      document.getElementById('restartBtn').addEventListener('click', () => {
        document.getElementById('gameOver').remove();
        this.game.sceneManager.switchTo('mainMenu');
      });
    }
  
    exit() {
      this.game.ui.clearAllUI();
    }
  }
  