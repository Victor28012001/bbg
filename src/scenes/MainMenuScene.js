export class MainMenuScene {
  constructor(game) {
    this.game = game;
  }

  async enter() {
    if (this.game.renderer?.domElement) {
      this.game.renderer.domElement.remove();
      this.game.renderer = null;
    }
    this.game.ui.showMainMenu(this.game);
    this.game.audio.play("lighton");
    this.game.audio.play("music", 0.5, true);
  }

  async exit() {
    // Ensure UI is cleared before transition completes
    this.game.ui.removeAllUI();
    this.game.ui.removeUI("main-menu");
  }
}
