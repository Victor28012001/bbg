// main.js
import './style.css'
import './backup.css'
import { Game } from "./core/Game.js";
import { SceneTransition } from "./core/SceneTransition.js";
import { GameState } from "./core/GameState.js";

// PWA-specific initialization
function initPWAFeatures() {
  // Check if launched as PWA
  GameState.isPWA = window.matchMedia("(display-mode: standalone)").matches;

  // Handle offline state
  window.addEventListener("offline", () => {
    GameState.networkStatus = "offline";
    console.warn("Network connection lost");
  });

  window.addEventListener("online", () => {
    GameState.networkStatus = "online";
    console.log("Network connection restored");
  });
}

const game = new Game();
GameState.game = game;

window.onload = async () => {
  initPWAFeatures();
  await SceneTransition.fadeOut(500);
  game.init();

  // Lock orientation for mobile
  if (screen.orientation && screen.orientation.lock) {
    try {
      await screen.orientation.lock("landscape");
    } catch (err) {
      console.warn("Orientation lock failed:", err);
    }
  }
};

window.onbeforeunload = () => {
  SceneTransition.fadeIn(500);

  // Clean up Three.js resources
  if (GameState.scene) {
    GameState.scene.traverse((obj) => {
      if (obj.isMesh) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      }
    });
  }

  if (GameState.renderer) {
    GameState.renderer.dispose();
  }
};
