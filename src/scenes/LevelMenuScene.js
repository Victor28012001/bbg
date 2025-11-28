export class LevelMenuScene {
  constructor(game) {
    this.game = game;
  }

  async enter() {
    // Show level menu with proper z-index (lower than cutscene)
    this.game.ui.showLevelMenu(
      this.game.unlockedLevels,
      async (levelIndex) => {
        console.log(`[LevelMenu] Selected level ${levelIndex}`);
        await this.game.startLevelWithCutscene(levelIndex);
      },
      () => this.game.resetProgress()
    );
  }

  async exit() {
    this.game.audio.stopSound("music");
    // Clear the level menu UI completely
    this.game.ui.removeAllUI();
  }
}