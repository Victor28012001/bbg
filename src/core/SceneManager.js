import { SceneTransition } from "./SceneTransition.js";
import { GameState } from "./GameState.js";

export class SceneManager {
  constructor(game) {
    this.game = game;
    this.scenes = new Map();
    this.currentScene = null;
    this.transitionState = {
      active: false,
      target: null,
      promise: null,
    };
  }

  get currentSceneName() {
    return this.currentScene?.constructor.name.toLowerCase();
  }

  register(name, sceneCreator) {
    if (this.scenes.has(name)) {
      console.warn(`Scene ${name} is already registered`);
    }
    this.scenes.set(name, sceneCreator);
  }

  async switchTo(sceneName, ...args) {
    if (
      this.transitionState.active &&
      this.transitionState.target === sceneName
    ) {
      return this.transitionState.promise;
    }

    if (this.transitionState.active) {
      await this.transitionState.promise;
      if (this.transitionState.target === sceneName) return;
    }

    this.transitionState = {
      active: true,
      target: sceneName,
      promise: this._executeTransition(sceneName, ...args),
    };

    try {
      return await this.transitionState.promise;
    } finally {
      this.transitionState.active = false;
      this.transitionState.target = null;
    }
  }

  async _executeTransition(sceneName, ...args) {
    // console.log(`[Transition] Starting to ${sceneName}`);

    try {
      await SceneTransition.fadeIn(300);

      if (this.currentScene) {
        await this._safeCleanup(this.currentScene);
      }

      const sceneCreator = this.scenes.get(sceneName);
      if (!sceneCreator) {
        throw new Error(
          `Scene ${sceneName} not registered. Available scenes: ${[
            ...this.scenes.keys(),
          ].join(", ")}`
        );
      }

      this.currentScene = sceneCreator(...args);

      if (typeof this.currentScene.enter === "function") {
        await this.currentScene.enter(...args);
      } else {
        await this._initializeScene(this.currentScene);
      }

      // Force a render frame
      if (GameState.renderer && GameState.scene && GameState.camera) {
        GameState.renderer.render(GameState.scene, GameState.camera);
      }

      await SceneTransition.fadeOut(300);
      // console.log(`[Transition] Completed transition to ${sceneName}`);
    } catch (error) {
      console.error(
        `[Transition] Failed to transition to ${sceneName}:`,
        error
      );

      if (sceneName !== "mainMenu" && this.scenes.has("mainMenu")) {
        console.warn("[Transition] Falling back to main menu");
        return this._executeTransition("mainMenu");
      }

      throw error;
    }
  }

  async _safeCleanup(scene) {
    try {
      if (scene?.exit) await scene.exit();
      if (scene?.cleanup) await scene.cleanup();

      // Additional cleanup for Three.js scenes
      if (scene?.isScene) {
        scene.traverse((child) => {
          if (child.isMesh) {
            child.geometry?.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((m) => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
      }
    } catch (cleanupError) {
      console.error("Cleanup failed:", cleanupError);
    }
  }

  async _initializeScene(scene) {
    try {
      if (!scene) throw new Error("Scene is null");

      // Store reference to current scene
      this.currentScene = scene;

      if (scene.preload) await scene.preload();
      if (scene.init) await scene.init();
      if (scene.enter) await scene.enter();
    } catch (initError) {
      console.error(
        `Scene initialization failed: ${scene?.constructor?.name || "Unknown"}`,
        initError
      );
      throw initError;
    }
  }
}
