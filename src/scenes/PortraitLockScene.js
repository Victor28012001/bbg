export class PortraitLockScene {
  constructor(game) {
    this.game = game;
    this.container = null;
    this.rotationIcon = null;
    this.rotationAngle = 0;
    this.isActive = false;
    this.previousScene = null;
    this.previousSceneContext = null;
  }

  enter(previousScene, context = null) {
    if (this.isActive) return;
    this.isActive = true;
    this.previousScene = previousScene || "mainMenu";
    this.previousSceneContext = context;
    this.setupDOM();
  }

  exit() {
    if (!this.isActive) return;
    this.isActive = false;
    this.cleanupDOM();
  }

  setupDOM() {
    // Only create if elements don't exist
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.style.position = "fixed"; // Changed from absolute to fixed
      this.container.style.top = "0";
      this.container.style.left = "0";
      this.container.style.width = "100%";
      this.container.style.height = "100%";
      this.container.style.backgroundColor = "#222222";
      this.container.style.display = "flex";
      this.container.style.flexDirection = "column";
      this.container.style.justifyContent = "center";
      this.container.style.alignItems = "center";
      this.container.style.zIndex = "1000";
      this.container.style.color = "white";
      this.container.style.fontFamily = "Arial, sans-serif";
      this.container.style.textAlign = "center";

      // Add message
      const message1 = document.createElement("div");
      message1.textContent = "Please rotate your device";
      message1.style.fontSize = "clamp(24px, 6vw, 48px)"; // Responsive font size
      message1.style.fontWeight = "bold";
      message1.style.marginBottom = "20px";

      const message2 = document.createElement("div");
      message2.textContent = "This game requires landscape mode";
      message2.style.fontSize = "clamp(16px, 4vw, 32px)";
      message2.style.marginBottom = "40px";

      // Add rotation icon
      this.rotationIcon = document.createElement("div");
      this.rotationIcon.style.width = "clamp(60px, 15vw, 100px)";
      this.rotationIcon.style.height = "clamp(60px, 15vw, 100px)";
      this.rotationIcon.style.border = "3px solid white";
      this.rotationIcon.style.borderRadius = "50%";
      this.rotationIcon.style.position = "relative";

      // Create arrow inside the circle
      const arrow = document.createElement("div");
      arrow.style.position = "absolute";
      arrow.style.top = "15%";
      arrow.style.left = "40%";
      arrow.style.width = "20%";
      arrow.style.height = "20%";
      arrow.style.borderTop = "3px solid white";
      arrow.style.borderRight = "3px solid white";
      arrow.style.transform = "rotate(45deg)";

      this.rotationIcon.appendChild(arrow);

      this.container.appendChild(message1);
      this.container.appendChild(message2);
      this.container.appendChild(this.rotationIcon);

      document.body.appendChild(this.container);
    }
  }

  update(deltaTime) {
    if (!this.isActive || !this.container || !this.rotationIcon) return;

    // Rotate the icon
    this.rotationAngle += deltaTime * 1.5;
    this.rotationIcon.style.transform = `rotate(${this.rotationAngle}rad)`;

    // Check orientation
    if (!this.isPortrait()) {
      this.exit();
      this.returnToPreviousScene();
    }
  }

  returnToPreviousScene() {
    const { normalizedName, context } = this.normalizeSceneName(
      this.previousScene
    );

    if (this.game.sceneManager.scenes.has(normalizedName)) {
      this.game.sceneManager.switchTo(normalizedName, context).catch((err) => {
        console.error(`Failed to switch to ${normalizedName}:`, err);
        this.fallbackToMainMenu();
      });
    } else {
      console.warn(
        `Scene ${normalizedName} not registered, falling back to mainMenu`
      );
      this.fallbackToMainMenu();
    }
  }

  normalizeSceneName(sceneName) {
    if (!sceneName) return { normalizedName: "mainMenu", context: null };

    let normalizedName = sceneName;
    let context = this.previousSceneContext || {};

    // Remove "scene" suffix if present
    if (normalizedName.endsWith("scene")) {
      normalizedName = normalizedName.slice(0, -5);
    }

    const lowerName = normalizedName.toLowerCase();

    // 1. Handle level menu first (special case)
    if (lowerName.startsWith("levelmenu")) {
      return { normalizedName: "levelMenu", context: null };
    }

    // 2. Handle cutscene variations (new addition)
    if (lowerName.startsWith("cutscene")) {
      const levelIndex =
        (normalizedName.includes("_")
          ? normalizedName.split("_")[1]
          : context.levelIndex) ??
        this.game.currentLevel ??
        0;
      return {
        normalizedName: `cutscene_${levelIndex}`,
        context: { levelIndex: parseInt(levelIndex) },
      };
    }

    // 3. Handle dynamiclevel and levelX cases
    if (
      lowerName.startsWith("dynamiclevel") ||
      (lowerName.startsWith("level") && !lowerName.includes("_"))
    ) {
      const levelIndex = context.levelIndex ?? this.game.currentLevel ?? 0;
      return {
        normalizedName: `level_${levelIndex}`,
        context: { levelIndex },
      };
    }

    // 4. Handle properly formatted level scenes
    if (lowerName.startsWith("level_")) {
      const levelIndex =
        (normalizedName.split("_")[1] || context.levelIndex) ??
        this.game.currentLevel ??
        0;
      return {
        normalizedName: `level_${levelIndex}`,
        context: { levelIndex: parseInt(levelIndex) },
      };
    }

    // 5. Standard scenes
    switch (lowerName) {
      case "splash":
        return { normalizedName: "splash", context: null };
      case "mainmenu":
        return { normalizedName: "mainMenu", context: null };
      case "portraitlock":
        return { normalizedName: "portraitLock", context: null };
      default:
        return { normalizedName, context };
    }
  }

  fallbackToMainMenu() {
    if (this.game.sceneManager.scenes.has("mainMenu")) {
      this.game.sceneManager.switchTo("mainMenu");
    } else {
      console.error("Main menu scene not available!");
    }
  }

  cleanupDOM() {
    if (this.container && this.container.parentNode) {
      document.body.removeChild(this.container);
    }
    this.container = null;
    this.rotationIcon = null;
  }

  isPortrait() {
    return window.innerHeight > window.innerWidth;
  }
}
