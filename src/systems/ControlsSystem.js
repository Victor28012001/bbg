import { GameState } from "../core/GameState.js";
import { updateAmmoHUD } from "../utils/utils.js";

export class ControlsSystem {
  constructor(game) {
    this.game = game;
    this.keyStates = {};
    this.initialized = false;
    this.pointerLockControls = null;
    this.moveSpeed = 5.0;
    this.lookSensitivity = 0.002;
    this._isToggling = false;
    this.isPointerLocked = false;
    this.lastTapTime = 0;
    this.doubleTapDelay = 1000;
    this.shootToggle = false;

    // Mobile controls
    this.moveJoystickActive = false;
    this.aimJoystickActive = false;
    this.moveJoystickValues = { x: 0, y: 0 };
    this.aimJoystickValues = { x: 0, y: 0 };
    this.isMobile = false;
    this.controlsActive = true;

    // Track all event listeners
    this.eventListeners = {
      move: { element: null, events: {} },
      aim: { element: null, events: {} },
      buttons: { elements: [], events: {} },
      doubleTap: null,
    };

    // Camera rotation for mobile
    this.cameraRotation = {
      x: 0,
      y: 0,
      minPolarAngle: 0,
      maxPolarAngle: Math.PI,
    };

    // Unified controls object
    this.controlsObject = {
      position: new THREE.Vector3(),
      rotation: new THREE.Euler(),
      speed: 0,
      getObject: () => ({
        position: this.position,
        rotation: this.rotation,
        add: (obj) => {
          if (this.isMobile) {
            GameState.scene.add(obj);
          } else if (this.pointerLockControls) {
            this.pointerLockControls.getObject().add(obj);
          }
        },
      }),
      isLocked: true,
      moveForward: (speed) => {
        if (this.isMobile) {
          const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(
            GameState.camera.quaternion
          );
          direction.y = 0;
          direction.normalize().multiplyScalar(speed);
          GameState.camera.position.add(direction);
        } else if (this.pointerLockControls) {
          this.pointerLockControls.moveForward(speed);
        }
      },
      moveRight: (speed) => {
        if (this.isMobile) {
          const direction = new THREE.Vector3(1, 0, 0).applyQuaternion(
            GameState.camera.quaternion
          );
          direction.y = 0;
          direction.normalize().multiplyScalar(speed);
          GameState.camera.position.add(direction);
        } else if (this.pointerLockControls) {
          this.pointerLockControls.moveRight(speed);
        }
      },
      lock: () => {
        if (!this.isMobile && this.pointerLockControls) {
          return GameState.renderer.domElement.requestPointerLock();
        }
        return Promise.resolve();
      },
      unlock: () => {
        if (!this.isMobile) {
          document.exitPointerLock();
        }
      },
    };

    // Bind all handlers
    this.boundHandleMoveStart = this.handleMoveStart.bind(this);
    this.boundHandleMoveDrag = this.handleMoveDrag.bind(this);
    this.boundHandleMoveEnd = this.handleMoveEnd.bind(this);
    this.boundHandleAimStart = this.handleAimStart.bind(this);
    this.boundHandleAimDrag = this.handleAimDrag.bind(this);
    this.boundHandleAimEnd = this.handleAimEnd.bind(this);
    this.boundHandleReload = this.handleReload.bind(this);
    this.boundHandleShootToggle = this.handleShootToggle.bind(this);
    this.boundHandleFlashlight = this.handleFlashlight.bind(this);
    this.boundHandleDoubleTap = this.handleDoubleTap.bind(this);
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundOnKeyUp = this.onKeyUp.bind(this);
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnMouseUp = this.onMouseUp.bind(this);
    this.boundRequestPointerLock = this.requestPointerLock.bind(this);
    this.canvasClickHandler = this.handleCanvasClick.bind(this);
  }

  // Add new helper method
  addListener(element, type, handler, options) {
    if (!element) return null;
    element.addEventListener(type, handler, options);
    return { element, type, handler, options };
  }

  setControlsEnabled(enabled) {
    this.controlsActive = enabled;

    if (!enabled) {
      this.moveJoystickActive = false;
      this.aimJoystickActive = false;
      this.moveJoystickValues = { x: 0, y: 0 };
      this.aimJoystickValues = { x: 0, y: 0 };

      GameState.moveForward = false;
      GameState.moveBackward = false;
      GameState.moveLeft = false;
      GameState.moveRight = false;
      GameState.isFiring = false;
    }
  }

  updateCameraReference() {
    if (GameState.camera) {
      this.controlsObject.position = GameState.camera.position;
      this.controlsObject.rotation = GameState.camera.rotation;
    }
  }

  async reinitialize(rendererDomElement) {
    const currentSpeed = this.controlsObject?.speed || 0;
    this.cleanup();
    this.initialized = false;
    this.keyStates = {};

    // Reset movement and firing states
    GameState.moveForward = false;
    GameState.moveBackward = false;
    GameState.moveLeft = false;
    GameState.moveRight = false;
    GameState.isFiring = false;

    // Initialize or reset flashlight state
    if (!GameState.flashlight) {
      GameState.flashlight = {
        enabled: true,
        battery: 100,
        depletionRate: 0.5,
        rechargeRate: 0.005,
        flickerThreshold: 15,
      };
    } else {
      GameState.flashlight.enabled = true;
      GameState.flashlight.battery = 100;
    }

    // Ensure lights are in correct state
    if (GameState.tommyGunLight) {
      GameState.tommyGunLight.visible = GameState.flashlight.enabled;
    }
    if (GameState.tommyGunLight1) {
      GameState.tommyGunLight1.visible = false;
    }

    await this.init(rendererDomElement);
    if (this.controlsObject) {
      this.controlsObject.speed = currentSpeed;
    }

    if (!GameState.paused && !this.isMobile) {
      await this.requestPointerLock().catch(console.warn);
    }
  }

  async init(rendererDomElement) {
    if (this.initialized) return;

    // Detect mobile
    this.isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) ||
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0;

    try {
      if (!this.isMobile) {
        // Desktop controls
        this.pointerLockControls = new THREE.PointerLockControls(
          GameState.camera,
          rendererDomElement
        );

        GameState.scene.add(this.pointerLockControls.getObject());
        GameState.controls = this.pointerLockControls;

        // Add event listeners
        document.addEventListener("keydown", this.boundOnKeyDown);
        document.addEventListener("keyup", this.boundOnKeyUp);
        document.addEventListener("mousedown", this.boundOnMouseDown);
        document.addEventListener("mouseup", this.boundOnMouseUp);

        this.pointerLockControls.addEventListener("lock", () => {
          this.isPointerLocked = true;
          document.body.style.cursor = "none";
        });

        this.pointerLockControls.addEventListener("unlock", () => {
          this.isPointerLocked = false;
          document.body.style.cursor = "default";
        });

        // Manage pointer lock on canvas click
        rendererDomElement.removeEventListener(
          "click",
          this.boundRequestPointerLock
        );
        rendererDomElement.addEventListener("click", this.canvasClickHandler);
      } else {
        // Mobile controls
        GameState.controls = this.controlsObject;
        this.controlsObject.getObject().add(GameState.camera);

        // Ensure controls are never "locked" on mobile
        this.controlsObject.isLocked = false;
        this.isPointerLocked = false;
        GameState.renderer.domElement.focus();

        // GameState.game.ui.createMobileControls();
        this.setupMobileControls();

        // Make sure cursor is visible
        document.body.style.cursor = "default";

        // Initialize camera rotation
        this.cameraRotation.x = GameState.camera.rotation.y;
        this.cameraRotation.y = GameState.camera.rotation.x;
      }

      this.initialized = true;
    } catch (error) {
      console.error("[ControlsSystem] Initialization failed:", error);
    }
  }

  handleCanvasClick(event) {
    if (GameState.paused || event.target !== GameState.renderer.domElement) {
      document.body.style.cursor = "default";
      return;
    }

    if (!this.isPointerLocked) {
      this.requestPointerLock().catch(console.warn);
    }
  }

  async requestPointerLock() {
    if (GameState.paused || this.isPointerLocked) return;

    try {
      await GameState.renderer.domElement.requestPointerLock();
    } catch (err) {
      console.warn("Pointer lock failed:", err);
    }
  }

  async ensurePointerLock() {
    if (GameState.paused || this.isPointerLocked) return;

    try {
      GameState.renderer.domElement.focus();
      await GameState.renderer.domElement.requestPointerLock();

      if (!this.isPointerLocked) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        await GameState.renderer.domElement.requestPointerLock();
      }
    } catch (err) {
      console.warn("Pointer lock failed:", err);
    }
  }

  onKeyDown(event) {
    if (event.repeat) return;
    GameState.input = event.code;
    if (GameState.paused && event.code !== "Escape" && event.code !== "KeyP") {
      return;
    }

    this.keyStates[event.code] = true;

    switch (event.code) {
      case "KeyW":
      case "ArrowUp":
        GameState.moveForward = true;
        break;
      case "KeyS":
      case "ArrowDown":
        GameState.moveBackward = true;
        break;
      case "KeyA":
      case "ArrowLeft":
        GameState.moveLeft = true;
        break;
      case "KeyD":
      case "ArrowRight":
        GameState.moveRight = true;
        break;
      case "Space":
        if (!GameState.paused) {
          GameState.isFiring = true;
          if (GameState.currentWeapon === "gun" && GameState.currentBullets > 0)
            GameState.audio.play("gunshot", 1);
        }
        break;
      case "KeyR":
        this.reload();
        break;
      case "KeyL":
        this.toggleGunLight();
        break;
      case "Escape":
      case "KeyP":
        this.togglePause();
        break;
      case "KeyQ":
        GameState.player.toggleWeapon();
        break;
    }
  }

  onKeyUp(event) {
    if (event.code === "KeyE" || GameState.input === "Keye") {
        GameState.input = "";
    }
    this.keyStates[event.code] = false;

    switch (event.code) {
      case "KeyW":
      case "ArrowUp":
        GameState.moveForward = false;
        break;
      case "KeyS":
      case "ArrowDown":
        GameState.moveBackward = false;
        break;
      case "KeyA":
      case "ArrowLeft":
        GameState.moveLeft = false;
        break;
      case "KeyD":
      case "ArrowRight":
        GameState.moveRight = false;
        break;
      case "Space":
        GameState.isFiring = false;
        if (GameState.currentWeapon === "gun" && GameState.tommyGunLight1)
          GameState.tommyGunLight1.visible = false;
        break;
    }
  }

  onMouseDown(event) {
    if (GameState.paused) return;

    if (
      this.pointerLockControls?.isLocked &&
      event.button === 0 &&
      event.target.id !== "playButton" &&
      !GameState.isFiring
    ) {
      GameState.isFiring = true;
    }
  }

  onMouseUp(event) {
    if (event.button === 0) GameState.isFiring = false;
  }

  toggleGunLight() {
    if (!GameState.tommyGunLight || !GameState.flashlight) {
      console.warn("Light components not available");
      return;
    }

    GameState.flashlight.enabled = !GameState.flashlight.enabled;
    GameState.tommyGunLight.visible = GameState.flashlight.enabled;

    if (GameState.tommyGunLight1) {
      GameState.tommyGunLight1.visible = false;
    }

    const indicator = document.getElementById("flashlight-indicator");
    if (indicator) {
      indicator.style.backgroundImage = GameState.flashlight.enabled
        ? "url('./assets/images/flashlight_on.png')"
        : "url('./assets/images/flashlight_off.png')";
      indicator.style.animation = "flashlightPulse 0.3s ease";
      indicator.addEventListener(
        "animationend",
        () => (indicator.style.animation = ""),
        { once: true }
      );
    }

    GameState.audio.play("lighton", 0.5);
  }

  async togglePause() {
    if (!this.initialized) return;
    if (this._isToggling) return;
    this._isToggling = true;

    try {
      const game = this.game || GameState.game;
      if (!game) {
        console.error("Game reference not available");
        return;
      }

      // Skip pointer lock handling for mobile
      if (!this.isMobile) {
        const wasPaused = game.isPaused();

        if (
          (wasPaused && !this.pointerLockControls?.isLocked) ||
          (!wasPaused && this.pointerLockControls?.isLocked)
        ) {
          game.togglePause();
        }

        if (this.pointerLockControls) {
          if (game.isPaused()) {
            if (this.pointerLockControls.isLocked) {
              document.exitPointerLock();
            }
          } else {
            if (!this.pointerLockControls.isLocked) {
              await this.requestPointerLock();
            }
          }
        }
      } else {
        // Simple pause toggle for mobile
        game.togglePause();
      }
    } finally {
      this._isToggling = false;
    }
  }

  reload() {
    if (
      GameState.isReloading ||
      GameState.currentBullets === GameState.maxMagazineSize ||
      GameState.totalBullets === 0
    )
      return;

    GameState.isReloading = true;
    GameState.audio.play("reload", 1);

    setTimeout(() => {
      const bulletsNeeded =
        GameState.maxMagazineSize - GameState.currentBullets;
      const bulletsToReload = Math.min(bulletsNeeded, GameState.totalBullets);
      GameState.currentBullets += bulletsToReload;
      GameState.totalBullets -= bulletsToReload;
      GameState.isReloading = false;
      updateAmmoHUD(GameState.currentBullets, GameState.totalBullets);
    }, 3500);
  }

  setupMobileControls() {
    this.cleanupMobileControls();

    // Get control elements
    this.eventListeners.move.element =
      document.getElementById("joystick-move-base");
    this.eventListeners.aim.element =
      document.getElementById("joystick-aim-base");

    const reloadBtn = document.getElementById("mobile-reload-btn");
    const flashlightBtn = document.getElementById("mobile-flashlight-btn");
    const shootToggleBtn = document.getElementById("mobile-shoot-btn");
    this.eventListeners.buttons.elements = [
      reloadBtn,
      flashlightBtn,
      shootToggleBtn,
    ];

    // Add move joystick listeners
    if (this.eventListeners.move.element) {
      this.eventListeners.move.events.start = this.addListener(
        this.eventListeners.move.element,
        "touchstart",
        this.boundHandleMoveStart,
        { passive: false }
      );
      this.eventListeners.move.events.move = this.addListener(
        document,
        "touchmove",
        this.boundHandleMoveDrag,
        { passive: false }
      );
      this.eventListeners.move.events.end = this.addListener(
        document,
        "touchend",
        this.boundHandleMoveEnd,
        { passive: false }
      );
    }

    // Add aim joystick listeners
    if (this.eventListeners.aim.element) {
      this.eventListeners.aim.events.start = this.addListener(
        this.eventListeners.aim.element,
        "touchstart",
        this.boundHandleAimStart,
        { passive: false }
      );
      this.eventListeners.aim.events.move = this.addListener(
        document,
        "touchmove",
        this.boundHandleAimDrag,
        { passive: false }
      );
      this.eventListeners.aim.events.end = this.addListener(
        document,
        "touchend",
        this.boundHandleAimEnd,
        { passive: false }
      );
    }

    // Add button listeners
    if (reloadBtn) {
      this.eventListeners.buttons.events.reload = this.addListener(
        reloadBtn,
        "touchstart",
        this.boundHandleReload,
        { passive: false }
      );
    }
    if (flashlightBtn) {
      this.eventListeners.buttons.events.flashlight = this.addListener(
        flashlightBtn,
        "touchstart",
        this.boundHandleFlashlight,
        { passive: false }
      );
    }

    if (shootToggleBtn) {
      this.eventListeners.buttons.events.shootToggle = this.addListener(
        shootToggleBtn,
        "touchstart",
        this.boundHandleShootToggle,
        { passive: false }
      );
    }

    // Add double tap for pause
    this.eventListeners.doubleTap = this.addListener(
      document,
      "touchend",
      this.boundHandleDoubleTap,
      { passive: false }
    );
  }

  cleanupMobileControls() {
    const moveBase = document.getElementById("joystick-move-base");
    const aimBase = document.getElementById("joystick-aim-base");

    if (moveBase) {
      moveBase.removeEventListener("touchstart", this.boundHandleMoveStart);
    }
    document.removeEventListener("touchmove", this.boundHandleMoveDrag);
    document.removeEventListener("touchend", this.boundHandleMoveEnd);

    if (aimBase) {
      aimBase.removeEventListener("touchstart", this.boundHandleAimStart);
    }
    document.removeEventListener("touchmove", this.boundHandleAimDrag);
    document.removeEventListener("touchend", this.boundHandleAimEnd);

    const reloadBtn = document.getElementById("mobile-reload-btn");
    const flashlightBtn = document.getElementById("mobile-flashlight-btn");
    const shootToggleBtn = document.getElementById("mobile-shoot-btn");

    if (reloadBtn)
      reloadBtn.removeEventListener("touchstart", this.boundHandleReload);
    if (flashlightBtn)
      flashlightBtn.removeEventListener(
        "touchstart",
        this.boundHandleFlashlight
      );
    if (shootToggleBtn) {
      shootToggleBtn.removeEventListener(
        "touchstart",
        this.boundHandleShootToggle
      );
    }

    document.removeEventListener("touchend", this.boundHandleDoubleTap);
  }

  handleMoveStart(e) {
    if (GameState.paused) {
      e.preventDefault();
      return;
    }

    if (!e.touches || e.touches.length === 0) return;
    this.moveJoystickActive = true;
    const rect = e.currentTarget.getBoundingClientRect();
    this.moveJoystickCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    e.currentTarget.classList.add("active");
    this.updateMoveJoystick(e.touches[0]);
    e.preventDefault();
    e.stopPropagation();
  }

  handleMoveDrag(e) {
    if (!this.moveJoystickActive) return;
    if (!e.touches || e.touches.length === 0) return;

    this.updateMoveJoystick(e.touches[0]);
    e.preventDefault();
    e.stopPropagation();
  }

  handleMoveEnd() {
    this.moveJoystickActive = false;
    this.resetJoystick("move");
    const moveBase = document.getElementById("joystick-move-base");
    if (moveBase) moveBase.classList.remove("active");
    this.onMoveJoystick(0, 0);
  }

  updateMobileMovement(delta) {
    if (!this.isMobile) return;

    const moveSpeed = this.moveSpeed * delta;
    const direction = new THREE.Vector3();

    if (GameState.moveForward) direction.z -= 1;
    if (GameState.moveBackward) direction.z += 1;
    if (GameState.moveLeft) direction.x -= 1;
    if (GameState.moveRight) direction.x += 1;

    if (direction.lengthSq() > 0) {
      direction.normalize().multiplyScalar(moveSpeed);
      direction.applyEuler(new THREE.Euler(0, GameState.camera.rotation.y, 0));
      GameState.camera.position.add(direction);
      this.controlsObject.position.copy(GameState.camera.position);
    }
  }

  handleAimStart(e) {
    this.aimJoystickActive = true;
    const rect = e.currentTarget.getBoundingClientRect();
    this.aimJoystickCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    e.currentTarget.classList.add("active");
    this.updateAimJoystick(e.touches[0]);
    e.preventDefault();
  }

  handleAimDrag(e) {
    if (!this.aimJoystickActive) return;
    this.updateAimJoystick(e.touches[0]);
    e.preventDefault();
  }

  handleAimEnd() {
    this.aimJoystickActive = false;
    this.resetJoystick("aim");
    const aimBase = document.getElementById("joystick-aim-base");
    if (aimBase) aimBase.classList.remove("active");
    this.onAimJoystick(0, 0);
  }

  handleReload() {
    this.reload();
  }

  handleFlashlight() {
    this.toggleGunLight();
  }

  handleShootToggle() {
    this.shootToggle = !this.shootToggle;
    const shootBtn = document.getElementById("mobile-shoot-btn");
    if (shootBtn) {
      shootBtn.style.backgroundColor = this.shootToggle
        ? "rgba(255, 0, 0, 0.6)"
        : "rgba(255, 255, 255, 0.3)";
    }

    if (!this.shootToggle) {
      GameState.isFiring = false;
    }
  }

  handleDoubleTap(e) {
    e.preventDefault();
    const currentTime = new Date().getTime();
    const tapLength = currentTime - this.lastTapTime;

    if (tapLength < this.doubleTapDelay && tapLength > 0 && !GameState.paused) {
      console.log("Double tap detected", GameState.paused);
      this.togglePause();
    }

    this.lastTapTime = currentTime;
  }

  updateMoveJoystick(touch) {
    const dx = touch.clientX - this.moveJoystickCenter.x;
    const dy = touch.clientY - this.moveJoystickCenter.y;
    const distance = Math.min(Math.sqrt(dx * dx + dy * dy), 50);

    const angle = Math.atan2(dy, dx);
    const moveX = Math.cos(angle) * distance;
    const moveY = Math.sin(angle) * distance;

    const knob = document.getElementById("joystick-move-knob");
    if (knob) {
      knob.style.transform = `translate(${moveX}px, ${moveY}px)`;
    }

    this.moveJoystickValues = {
      x: moveX / 50,
      y: moveY / 50,
    };

    this.onMoveJoystick(this.moveJoystickValues.x, this.moveJoystickValues.y);
  }

  updateAimJoystick(touch) {
    const dx = touch.clientX - this.aimJoystickCenter.x;
    const dy = touch.clientY - this.aimJoystickCenter.y;
    const distance = Math.min(Math.sqrt(dx * dx + dy * dy), 50);

    const angle = Math.atan2(dy, dx);
    const aimX = Math.cos(angle) * distance;
    const aimY = Math.sin(angle) * distance;

    const knob = document.getElementById("joystick-aim-knob");
    if (knob) {
      knob.style.transform = `translate(${aimX}px, ${aimY}px)`;
    }

    this.aimJoystickValues = {
      x: aimX / 50,
      y: aimY / 50,
    };

    this.onAimJoystick(this.aimJoystickValues.x, this.aimJoystickValues.y);
  }

  resetJoystick(type) {
    const knob = document.getElementById(`joystick-${type}-knob`);
    if (knob) {
      knob.style.transform = "translate(0, 0)";
    }
  }

  onMoveJoystick(x, y) {
    const threshold = 0.2;

    GameState.moveForward = y < -threshold;
    GameState.moveBackward = y > threshold;
    GameState.moveLeft = x < -threshold;
    GameState.moveRight = x > threshold;

    const knob = document.getElementById("joystick-move-knob");
    if (knob) {
      const magnitude = Math.sqrt(x * x + y * y);
      if (magnitude > 0.8) {
        knob.style.backgroundColor = "rgba(0, 255, 0, 0.6)";
      } else {
        knob.style.backgroundColor = "rgba(255, 255, 255, 0.3)";
      }
    }
  }

  onAimJoystick(x, y) {
    const aimThreshold = 0.3;
    const fireThreshold = 0.8;
    const magnitude = Math.sqrt(x * x + y * y);

    if (magnitude > aimThreshold) {
      const sensitivity = 0.05;

      this.cameraRotation.x -= x * sensitivity;

      this.cameraRotation.y -= y * sensitivity * 0.5;
      this.cameraRotation.y = Math.max(
        Math.PI / 2 - this.cameraRotation.maxPolarAngle,
        Math.min(
          Math.PI / 2 - this.cameraRotation.minPolarAngle,
          this.cameraRotation.y
        )
      );

      GameState.camera.rotation.set(
        this.cameraRotation.y,
        this.cameraRotation.x,
        0,
        "YXZ"
      );
    }

    if (magnitude >= fireThreshold && this.shootToggle) {
      if (!GameState.isFiring) {
        GameState.isFiring = true;
        if (GameState.currentBullets > 0) {
          GameState.audio.play("gunshot", 1);
        }
      }
    } else {
      GameState.isFiring = false;
    }

    const knob = document.getElementById("joystick-aim-knob");
    if (knob) {
      if (magnitude >= fireThreshold) {
        knob.style.backgroundColor = "rgba(255, 0, 0, 0.6)";
      } else if (magnitude > aimThreshold) {
        knob.style.backgroundColor = "rgba(255, 165, 0, 0.6)";
      } else {
        knob.style.backgroundColor = "rgba(255, 255, 255, 0.3)";
      }
    }
  }

  cleanup() {
    document.removeEventListener("keydown", this.boundOnKeyDown);
    document.removeEventListener("keyup", this.boundOnKeyUp);
    document.removeEventListener("mousedown", this.boundOnMouseDown);
    document.removeEventListener("mouseup", this.boundOnMouseUp);
    document.removeEventListener("click", this.boundRequestPointerLock);

    if (GameState.renderer?.domElement) {
      GameState.renderer.domElement.removeEventListener(
        "click",
        this.canvasClickHandler
      );
      GameState.renderer.domElement.removeEventListener(
        "click",
        this.boundRequestPointerLock
      );
    }

    if (this.pointerLockControls) {
      if (this.pointerLockControls.isLocked) {
        document.exitPointerLock();
      }
      if (GameState.scene && this.pointerLockControls.getObject()) {
        GameState.scene.remove(this.pointerLockControls.getObject());
      }
      this.pointerLockControls.dispose();
      this.pointerLockControls = null;
    }

    if (this.isMobile) {
      this.cleanupMobileControls();
    }

    this.initialized = false;
    this.isPointerLocked = false;
    this._isToggling = false;
    this.keyStates = {};
  }
}
