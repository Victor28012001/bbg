// // core/Game.js
import { GameUI } from "../systems/GameUI.js";
import { GameAudio } from "../systems/GameAudio.js";
import { SceneManager } from "./SceneManager.js";
import { SplashScene } from "../scenes/SplashScene.js";
import { LoadingScene } from "../scenes/LoadingScene.js";
import { MainMenuScene } from "../scenes/MainMenuScene.js";
import { ProfileScene } from "../scenes/ProfileScene.js";
import { CreditsScene } from "../scenes/CreditsScene.js";
import { SettingsScene } from "../scenes/SettingsScene.js";
import { GameState } from "./GameState.js";
import { LevelDataManager } from "./LevelDataManager.js";
import { DynamicLevelScene } from "../scenes/DynamicLevelScene.js";
import { LevelMenuScene } from "../scenes/LevelMenuScene.js";
import { CutsceneScene } from "../scenes/CutsceneScene.js";
import { cutDoorHole } from "../utils/utils.js";
import { ControlsSystem } from "../systems/ControlsSystem.js";

export class Game {
  constructor() {
    this.ui = new GameUI();
    this.audio = new GameAudio();
    this.sceneManager = new SceneManager(this);
    this.levelManager = new LevelDataManager();
    this.controlsSystem = new ControlsSystem(this);
    this.currentLevel = 0;
    this.unlockedLevels = parseInt(localStorage.getItem("unlockedLevels")) || 1;
    this.renderer = null;
    this._paused = false;
    this.cutsceneFinished = false;
    this.isResetting = false;
  }

  isPaused() {
    return this._paused;
  }

  async init() {
    try {
      // GameState.init();
      GameState.audio = this.audio;
      GameState.game = this;
      GameState.controlsSystem = this.controlsSystem;

      // Initialize audio system early
      await this.audio.init();

      await this.levelManager.loadAllLevels();
      GameState.levelData = this.levelManager.levels;

      try {
        const response = await fetch("./CutScenes.json");
        this.cutsceneData = await response.json();
      } catch (error) {
        console.error("Failed to load cutscene data:", error);
        this.cutsceneData = [];
      }

      this.renderer = GameState.renderer;

      this.sceneManager.register("splash", () => new SplashScene(this));
      this.sceneManager.register("loading", () => new LoadingScene(this));
      this.sceneManager.register("mainMenu", () => new MainMenuScene(this));
      this.sceneManager.register("credits", () => new CreditsScene(this));
      this.sceneManager.register("settings", () => new SettingsScene(this));
      this.sceneManager.register("profile", () => new ProfileScene(this));
      this.sceneManager.register("levelMenu", () => new LevelMenuScene(this));
      // this.sceneManager.register(
      //   "portraitLock",
      //   () => new PortraitLockScene(this)
      // );

      // Start orientation checking
      // this.startOrientationChecker();

      // Check initial orientation
      // if (this.getOrientation() === "portrait") {
      //   await this.sceneManager.switchTo("portraitLock");
      // } else {
      await this.sceneManager.switchTo("splash");
      // }

      this.startGameLoop();
    } catch (error) {
      console.error("Game initialization failed:", error);
    }
  }

  togglePause() {
    this._paused = !this._paused;
    GameState.paused = this._paused;
    GameState.timer.active = !this._paused;

    // Handle controls state
    if (this.controlsSystem) {
      this.controlsSystem.setControlsEnabled(!this._paused);

      // Special handling for mobile
      if (this.controlsSystem.isMobile && !this._paused) {
        setTimeout(() => {
          this.ui.refreshMobileControls();
        }, 100);
      }
    }

    if (GameState.audio) {
      if (this._paused) {
        GameState.audio.pauseMusic();
      } else {
        GameState.audio.resumeMusic();
      }
    }

    if (this.ui) {
      if (this._paused) {
        this.ui.showPauseMenu();
      } else {
        this.ui.hidePauseMenu();
        // this.ui.showGameHUD();
      }
    }

    if (this._paused) {
      if (GameState.animationFrameId) {
        cancelAnimationFrame(GameState.animationFrameId);
        GameState.animationFrameId = null;
      }
    } else {
      this.startGameLoop();
    }
  }

  startGameLoop() {
    // Only start if not paused and cutscene is finished
    if (GameState.paused || !this.cutsceneFinished) return;

    if (GameState.animationFrameId) {
      cancelAnimationFrame(GameState.animationFrameId);
      GameState.animationFrameId = null;
    }

    if (GameState.paused) return;

    this.lastTime = performance.now();
    GameState.timer.lastUpdate = this.lastTime;
    GameState.timer.active = true;

    const animate = (currentTime) => {
      if (
        this.sceneManager.currentSceneName === "splashscene" ||
        this.sceneManager.currentSceneName === "mainmenuscene" ||
        this.sceneManager.currentSceneName === "levelmenuscene"
      ) {
        this.controlsSystem.isPointerLocked = false;
        return;
      }
      GameState.animationFrameId = requestAnimationFrame(animate);

      if (GameState.paused) return;

      const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
      this.lastTime = currentTime;

      // Update timer
      this.updateGameTimer(deltaTime);

      if (GameState.audio.updateListenerPosition()) {
        GameState.audio.updateListenerPosition();
      } else {
        console.log("doesnt exist");
      }

      try {
        if (this.sceneManager?.currentScene?.update) {
          this.sceneManager.currentScene.update(deltaTime);
        }

        if (
          // this.sceneManager.currentSceneName !== "portraitLock" &&
          GameState.renderer &&
          GameState.scene &&
          GameState.camera
        ) {
          GameState.renderer.render(GameState.scene, GameState.camera);
        }
      } catch (error) {
        console.error("Game loop error:", error);
        this.handleGameError(error);
      }
    };

    GameState.animationFrameId = requestAnimationFrame(animate);
  }

  stopGameLoop() {
    if (GameState.animationFrameId) {
      cancelAnimationFrame(GameState.animationFrameId);
      GameState.animationFrameId = null;
    }
  }

  updateGameTimer(deltaTime) {
    if (!GameState.timer.active) return;

    // Update timer
    GameState.timer.remaining -= deltaTime;

    // Update UI
    this.ui.updateTimerDisplay(
      Math.max(0, Math.ceil(GameState.timer.remaining))
    );

    // Check if time has run out
    if (GameState.timer.remaining <= 0) {
      this.handleTimeExpired();
    }
  }

  async handleTimeExpired() {
    // Stop the timer
    GameState.timer.active = false;

    // Play time expired sound
    GameState.audio.play("timeout", 0.7);

    // Show time's up message
    this.ui.showTimeExpiredMessage(async () => {
      // Reset the level after message is dismissed
      await this.resetCurrentLevel();
    });
  }

  async startLevelWithCutscene(levelIndex) {
    try {
      // Reset all completion flags
      this.cutsceneFinished = false;
      if (GameState.player) {
        GameState.player.isCompleted = false;
      }

      // Clamp level index
      levelIndex = Math.max(0, Math.min(7, levelIndex));
      this.currentLevel = levelIndex;

      // Reset game state
      this.resetLevelState();

      // Find cutscene data
      const cutsceneId = `cutscene_${levelIndex}`;
      const levelSceneId = `level_${levelIndex}`;
      const sceneData = this.cutsceneData?.find(
        (c) =>
          c.id === `cutscene${levelIndex}` || c.id === `cutscene_${levelIndex}`
      );

      // Ensure controls are ready
      // await this.controlsSystem.reinitialize(GameState.renderer.domElement);

      if (sceneData) {
        // Register scenes if needed
        if (!this.sceneManager.scenes.has(cutsceneId)) {
          this.sceneManager.register(
            cutsceneId,
            () =>
              new CutsceneScene(this, {
                dialogue: sceneData.dialogue,
                background: sceneData.background,
                nextScene: levelSceneId,
                levelIndex: levelIndex,
              })
          );
        }

        if (!this.sceneManager.scenes.has(levelSceneId)) {
          this.sceneManager.register(
            levelSceneId,
            () => new DynamicLevelScene(this, levelIndex)
          );
        }

        // Start with loading screen then cutscene
        await this.sceneManager.switchTo("loading");
        await this.sceneManager.switchTo(cutsceneId, { levelIndex });
      } else {
        // No cutscene, load level directly
        this.cutsceneFinished = true;
        await this.sceneManager.switchTo("loading");
        await this.loadLevel(levelSceneId, { levelIndex });
      }
    } catch (error) {
      console.error(`Failed to start level ${levelIndex}:`, error);
      this.ui.showError("Level failed to load", "Returning to main menu");
      await this.sceneManager.switchTo("mainMenu");
    }
  }

  async ensureControls() {
    // Reset control states
    GameState.moveForward = false;
    GameState.moveBackward = false;
    GameState.moveLeft = false;
    GameState.moveRight = false;
    GameState.isFiring = false;

    // Reinitialize controls
    await this.controlsSystem.reinitialize(GameState.renderer.domElement);

    // Request pointer lock if needed
    if (!this.controlsSystem.isMobile && !GameState.paused) {
      await this.controlsSystem.requestPointerLock().catch(console.warn);
    }
  }

  async loadLevel(levelIndex) {
    levelIndex = Math.max(0, Math.min(7, levelIndex));
    this.currentLevel = levelIndex;
    const levelSceneId = `level_${levelIndex}`;

    if (!this.sceneManager.scenes.has(levelSceneId)) {
      this.sceneManager.register(
        levelSceneId,
        (context) => new DynamicLevelScene(this, levelIndex, context)
      );
    }

    await this.sceneManager.switchTo(levelSceneId, { levelIndex });
  }

  showGameWon() {
    this.ui.showGameWonPopup(this.renderer, () => this.showLevelMenu());
  }

  showLevelMenu() {
    this.ui.showLevelMenu(
      this.unlockedLevels,
      async (levelIndex) => await this.startLevelWithCutscene(levelIndex - 1),
      () => this.resetProgress()
    );
  }

  resetProgress() {
    localStorage.removeItem("unlockedLevels");
    this.unlockedLevels = 1;
    this.showLevelMenu();
  }

  unlockNextLevel() {
    const nextLevel = this.currentLevel + 1;
    if (nextLevel < this.levelManager.totalLevels) {
      this.unlockedLevels = Math.max(this.unlockedLevels, nextLevel + 1);
      localStorage.setItem("unlockedLevels", this.unlockedLevels);
    }
  }

  showGameOver() {
    this.ui.showGameOverPopup(this.renderer);
  }

  showBloodOverlay() {
    this.ui.showBloodOverlay();
  }

  async resetCurrentLevel() {
    try {
      this.isResetting = true;
      const currentLevel = this.currentLevel;

      // Force cleanup of controls first
      this.controlsSystem.cleanup();

      await this.sceneManager.switchTo("loading");

      // Reset pause state before rebuilding
      this._paused = false;
      GameState.paused = false;

      if (this.sceneManager.currentScene) {
        await this.sceneManager._safeCleanup(this.sceneManager.currentScene);
      }

      this.resetLevelState();

      // Reinitialize controls with existing instance
      await this.controlsSystem.reinitialize(GameState.renderer.domElement);

      await this.reinitializeBuilding();

      this.ui.removeAllUI();
      this.ui.showGameHUD();
      this.audio.stopAllSounds();
      await this.loadLevel(currentLevel);

      if (!this._paused && !this.controlsSystem.isMobile) {
        setTimeout(() => {
          this.controlsSystem.requestPointerLock().catch(console.warn);
        }, 200);
      }

      // this.startGameLoop();
      // this.audio.play("music")
    } catch (error) {
      console.error("Failed to reset level:", error);
      await this.sceneManager.switchTo("mainMenu");
    }
  }

  async reinitializeBuilding() {
    try {
      if (!GameState.preloadedAssets?.abandonedRoom) {
        console.warn("Preloaded assets missing - reloading");
        await preloadCoreAssets();
      }

      GameState.abandonedBuilding =
        GameState.preloadedAssets.abandonedRoom.scene.clone();
      GameState.abandonedBuilding.traverse((child) => {
        if (child.isMesh) {
          const mat = child.material;
          child.material = new THREE.MeshStandardMaterial({
            map: mat.map || null,
            metalness: 0,
            roughness: 1,
            emissive: new THREE.Color(0x000000),
            envMap: null,
            side: THREE.DoubleSide,
          });
          child.castShadow = false;
          child.receiveShadow = true;
        }
      });

      cutDoorHole(GameState.abandonedBuilding);
      GameState.scene.add(GameState.abandonedBuilding);
    } catch (error) {
      console.error("Failed to reinitialize building:", error);
      throw error;
    }
  }

  async cleanupEverything() {
    // Cancel any ongoing game loop
    if (GameState.animationFrameId) {
      cancelAnimationFrame(GameState.animationFrameId);
      GameState.animationFrameId = null;
    }

    // Stop all audio
    if (this.audio) {
      this.audio.stopAllSounds();
    }

    // Clean up current scene
    if (this.sceneManager.currentScene) {
      await this.sceneManager._safeCleanup(this.sceneManager.currentScene);
    }

    // Reset game state
    this.resetLevelState();

    // Clear Three.js renderer
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement = null;
      this.renderer = null;
      GameState.renderer = null;
    }
    // Remove canvas from DOM
    const canvas = document.getElementById("game-canvas");
    if (canvas) {
      canvas.remove();
    }

    // Clean up controls
    if (this.controlsSystem) {
      this.controlsSystem.cleanup();
      GameState.controls = null;
    }

    // Reset camera
    GameState.camera = null;

    // Clear all UI elements
    this.ui.removeAllUI();
    document.body.style.cursor = "default";

    // Force garbage collection (where supported)
    if (typeof gc !== "undefined") gc();
  }

  resetLevelState() {
    GameState.moveForward = false;
    GameState.moveBackward = false;
    GameState.moveLeft = false;
    GameState.moveRight = false;
    GameState.isFiring = false;
    GameState.isReloading = false;

    // Reset timer
    GameState.timer = {
      duration: 1500,
      remaining: 1500,
      active: false,
      lastUpdate: 0,
      warningThreshold: 60,
    };

    // Reset player data
    if (GameState.player) {
      GameState.player.reset();
      GameState.player.isCompleted = false;
    }

    // Update UI if available
    if (this.ui.updateTimerDisplay) {
      this.ui.updateTimerDisplay(GameState.timer.remaining);
    }

    GameState.initPlayerState();

    GameState.spiderMeshes = [];
    GameState.rakeMeshes = [];
    GameState.totalSpiders = 0;
    GameState.killedSpiders = 0;
    GameState.bulletHoles = [];
    GameState.bullets = [];
    GameState.buildingClones = [];

    this._paused = false;
    GameState.paused = false;
    GameState.animationFrameId = null;
    GameState.isEnded = false;

    if (GameState.controls) {
      this.controlsSystem.isMobile
        ? GameState.controls.lock()
        : GameState.controls.unlock();
    }

    if (GameState.controls) {
      try {
        GameState.controls.unlock();
      } catch (e) {
        console.warn("Could not unlock controls:", e);
      }
    }

    // Reinitialize audio if needed
    if (GameState.audio && GameState.camera) {
      GameState.audio.init().catch(console.error);
    }
  }

  handleGameError(error) {
    console.error("Critical game error:", error);
    this.resetCurrentLevel();
  }
}
