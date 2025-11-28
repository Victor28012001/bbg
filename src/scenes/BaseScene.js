export class BaseScene {
  constructor(game) {
    this.game = game;
    this.isPaused = false;
    this.name = "base";
    this.isActive = false;
  }

  async enter() {
    this.isActive = true;
  }

  async exit() {
    this.isActive = false;
  }
  pause() {
    this.isPaused = true;
  }
  resume() {
    this.isPaused = false;
  }

  update(deltaTime) {
    // To be implemented by child classes
  }
}
