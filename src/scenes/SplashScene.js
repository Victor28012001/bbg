// scenes/SplashScene.js
import { BaseScene } from "./BaseScene.js";
export class SplashScene extends BaseScene {
  constructor(game) {
    super(game);
    this.name = "splash";
  }

  async enter() {
    super.enter();
    
    await this.game.ui.showInitialSplash();
    // Show loading splash screen and wait for it to complete
    await this.game.ui.showSplashScreen(async () => {
      // This runs when splash screen is dismissed
      await this.game.sceneManager.switchTo("mainMenu");
    });
  }
}