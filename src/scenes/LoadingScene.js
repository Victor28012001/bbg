// scenes/LoadingScene.js
export class LoadingScene {
  constructor(game) {
    this.game = game;
    this.loadingElement = null;
  }

  async enter() {
    // Create loading element if it doesn't exist
    if (!this.loadingElement) {
      this.loadingElement = document.createElement('div');
      this.loadingElement.id = 'loading-screen';
      this.loadingElement.style = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.8);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        color: white;
        font-size: 2em;
      `;
      
      const spinner = document.createElement('div');
      spinner.style = `
        border: 5px solid #f3f3f3;
        border-top: 5px solid #3498db;
        border-radius: 50%;
        width: 50px;
        height: 50px;
        animation: spin 1s linear infinite;
        margin-bottom: 20px;
      `;
      
      const text = document.createElement('div');
      text.textContent = 'Loading...';
      
      this.loadingElement.appendChild(spinner);
      this.loadingElement.appendChild(text);
    }

    document.body.appendChild(this.loadingElement);
  }

  async exit() {
    if (this.loadingElement && this.loadingElement.parentNode) {
      this.loadingElement.remove();
    }
  }
}