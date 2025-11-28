import {
  MeshBVH,
  acceleratedRaycast,
} from "https://esm.sh/three-mesh-bvh@0.9.0?bundle";
import { GameState } from "../core/GameState.js";
import {
  playAnimation,
  updateAmmoHUD,
  createBullet,
  updateGunMuzzleFlash,
  getAnimationState,
  checkCollision,
  checkBuildingCollision,
  restoreFlashlightState,
  checkElevatorCollision,
  isPlayerInsideElevator,
  checkElevatorEntryZone,
} from "../utils/utils.js";
import { ScreenShake } from "../utils/ScreenShake.js";
import { Inventar } from "./ItemManager.js";

// Patch THREE.Mesh raycast for BVH acceleration (do once globally)
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export class Player {
  constructor() {
    if (!GameState.scene || !GameState.camera) {
      throw new Error(
        "GameState not properly initialized before Player creation"
      );
    }

    this.scene = GameState.scene;
    this.camera = GameState.camera;
    this.controls = null;
    this.gltf = null;
    this.animations = {};
    this.lights = [];
    this.mixers = [];
    this.eventListeners = [];

    this.playerCapsule = {
      radius: 0.5,
      segment: new THREE.Line3(
        new THREE.Vector3(),
        new THREE.Vector3(0, -1.0, 0)
      ),
    };

    // this.initPlayerState();

    // Flashlight battery
    this.lastBatteryUpdate = performance.now();
    this.batteryUpdateLock = false;

    // Footstep sound setup
    this.lastStepTime = 0;
    this.stepInterval = 400;
    this.isCompleted = false;
    this.inventar = new Inventar(GameState.inventary);
  }

  async reset() {
    // this.initPlayerState();

    // Reset position if controls exist
    if (GameState.controls) {
      const object = GameState.game.controlsSystem.isMobile
        ? GameState.camera
        : GameState.controls.getObject();
      object.position.set(0, 0, 0); // Or your default spawn position
      GameState.controls.speed = 0;
    }

    // Reset flashlight
    GameState.flashlight = {
      enabled: true,
      battery: 100,
      depletionRate: 0.5,
      rechargeRate: 0.005,
      flickerThreshold: 15,
    };

    // Reinitialize controls if needed
    if (GameState.controlsSystem) {
      await GameState.controlsSystem.reinitialize(
        GameState.renderer.domElement
      );
    }
  }

  initPlayerState() {
    const baseStats = GameState.playerProfile
      ? GameState.playerProfile.getPlayerStats()
      : {
          health: 100,
          energy: 100,
          strength: 100,
          walkSpeed: 0.1,
          runSpeed: 0.2,
          sprintSpeed: 0.4,
          energyDrainRate: 0.5,
          energyRegenRate: 0.2,
        };

    GameState.playerData = {
      health: baseStats.health,
      energy: baseStats.energy,
      strength: baseStats.strength,
      walkSpeed: baseStats.walkSpeed,
      runSpeed: baseStats.runSpeed,
      sprintSpeed: baseStats.sprintSpeed,
      currentSpeed: baseStats.walkSpeed,
      energyDrainRate: baseStats.energyDrainRate,
      energyRegenRate: baseStats.energyRegenRate,
      movementDuration: 0,
      walkToRunThreshold: 1,
      runToSprintThreshold: 3,
      movementState: "idle",
      lastAttackTime: null,
      regenTimeout: null,
      lastEnergyUpdate: performance.now(),
    };

    GameState.currentBullets = 30;
    GameState.totalBullets = 240;
    GameState.maxMagazineSize = 30;
    GameState.isReloading = false;
    GameState.isFiring = false;
    GameState.currentAnimation = null;
    GameState.gameStartTime = performance.now();
  }

  async loadModel(preloadedModel, type) {
    if (!preloadedModel?.scene) {
      throw new Error("Invalid preloaded player model provided");
    }

    const gltf = preloadedModel;

    // Set scale, position, rotation based on weapon config
    const weaponConfig = GameState.weapons[type];
    gltf.scene.scale.set(...weaponConfig.scale);
    gltf.scene.position.set(...weaponConfig.position);
    gltf.scene.rotation.set(...weaponConfig.rotation);

    // Store model reference
    weaponConfig.model = gltf.scene;
    if (type === "gun") {
      GameState.tommyGun = gltf.scene;
    } else if (type === "knife") {
      GameState.knifeArm = gltf.scene;
    }

    // Setup animation mixer
    weaponConfig.mixer = new THREE.AnimationMixer(weaponConfig.model);

    // Cache animations by name
    weaponConfig.animations = {};
    gltf.animations.forEach((clip) => {
      weaponConfig.animations[clip.name] = clip;
    });

    // Add mixer to global mixers list for update
    if (!GameState.mixers.includes(weaponConfig.mixer)) {
      GameState.mixers.push(weaponConfig.mixer);
    }
    GameState.audio.play("breathing", 0.7, true);

    this.addLighting();
    restoreFlashlightState();
  }

  addLighting() {
    const currentWeapon = GameState.currentWeapon;
    const weapon = GameState.weapons[currentWeapon];

    if (!weapon || !weapon.model) {
      console.warn("Lighting skipped: weapon model not found");
      return;
    }

    // Remove any previous lights
    this.lights.forEach((light) => {
      if (light.parent) {
        light.parent.remove(light);
      }
    });
    this.lights = [];

    const light1 = new THREE.PointLight(0xb69f66, 0.2);
    const light = new THREE.PointLight(0xb69f66, 5, 450, 1.5);
    const light2 = new THREE.PointLight(0xffffff, 5, 450, 1.5);

    light.position.set(0.3, -0.2, 2);
    light.castShadow = true;
    light.shadow.bias = -0.001;
    light.shadow.radius = 2;

    light2.position.set(0, 0, 2);
    light2.castShadow = false;

    light1.position.set(-0.065, -0.45, 0);
    light1.castShadow = false;

    weapon.model.add(light, light1, light2);
    this.lights.push(light, light1, light2);

    if (currentWeapon === "gun" || currentWeapon === "knife") {
      GameState.tommyGunLight = light;
      GameState.tommyGunLight1 = light2;
      GameState.tommyGunLight1.visible = false;
    }
  }

  updateCapsuleSegment() {
    if (!this.controls || !this.controls.getObject()) return;

    const pos = this.controls.getObject().position;
    this.playerCapsule.segment.start
      .copy(pos)
      .add(new THREE.Vector3(0, this.playerCapsule.radius, 0));
    this.playerCapsule.segment.end
      .copy(pos)
      .add(new THREE.Vector3(0, -1.0 + this.playerCapsule.radius, 0));
  }

  // Get collision data: penetration depth, collision normal, closest point
  getCollisionData(bvh, capsule) {
    let closestDistance = Infinity;
    let closestPoint = new THREE.Vector3();
    let collisionNormal = new THREE.Vector3();

    bvh.shapecast({
      intersectsBounds: (box) => {
        return box
          .expandByScalar(capsule.radius)
          .intersectsSegment(capsule.segment);
      },
      intersectsTriangle: (tri) => {
        const triClosestPoint = new THREE.Vector3();
        const distSquared = tri.closestPointToSegment(
          capsule.segment,
          triClosestPoint
        );
        if (
          distSquared < capsule.radius * capsule.radius &&
          distSquared < closestDistance
        ) {
          closestDistance = distSquared;
          closestPoint.copy(triClosestPoint);
          tri.getNormal(collisionNormal);
        }
        return false;
      },
    });

    if (closestDistance < Infinity) {
      return {
        penetrationDepth: capsule.radius - Math.sqrt(closestDistance),
        collisionNormal,
        closestPoint,
      };
    }
    return null;
  }

  update(delta) {
    if (GameState.paused) {
      return;
    }
    if (GameState.tommyGunMixer) GameState.tommyGunMixer.update(delta);
    this.handleRegen();
    this.handleMovement();
    this.updateMovementAnimation();
    if (!GameState.paused) {
      this.updateFlashlightBattery();
      this.updateEnergyUI();
    }
    if (GameState.isFiring) {
      this.fire();
    }
    this.checkGoalReached();
  }

  handleMovement() {
    // Early exit if controls aren't available
    if (!GameState.controls || !GameState.game?.controlsSystem) return;

    // Check if controls are active (locked for desktop or mobile flag)
    const isActive =
      GameState.controls.isLocked || GameState.game.controlsSystem.isMobile;
    if (!isActive) return;

    // Get the appropriate controls object
    const controls = GameState.game.controlsSystem.isMobile
      ? GameState.game.controlsSystem.controlsObject
      : GameState.controls;

    // Initialize time tracking
    const now = performance.now();
    const deltaTime = (now - GameState.playerData.lastEnergyUpdate) / 1000;
    GameState.playerData.lastEnergyUpdate = now;

    // Initialize speed if needed
    if (controls.speed === undefined) {
      controls.speed = GameState.playerData.walkSpeed;
    }

    // Track movement duration
    const isMoving =
      GameState.moveForward ||
      GameState.moveBackward ||
      GameState.moveLeft ||
      GameState.moveRight;

    if (isMoving) {
      GameState.playerData.movementDuration += deltaTime;
      GameState.isMoving = true;
    } else {
      GameState.playerData.movementDuration = 0;
      GameState.isMoving = false;
      GameState.playerData.movementState = "idle";
    }

    // Determine movement state
    let targetState = "walk";
    let targetSpeed = GameState.playerData.walkSpeed;

    if (
      GameState.playerData.movementDuration >
      GameState.playerData.walkToRunThreshold +
        GameState.playerData.runToSprintThreshold
    ) {
      targetState = "sprint";
      targetSpeed = GameState.playerData.sprintSpeed;
    } else if (
      GameState.playerData.movementDuration >
      GameState.playerData.walkToRunThreshold
    ) {
      targetState = "run";
      targetSpeed = GameState.playerData.runSpeed;
    }

    // Energy management
    if (targetState === "sprint" && GameState.playerData.energy <= 0) {
      targetState = "run";
      targetSpeed = GameState.playerData.runSpeed;
    }

    GameState.playerData.movementState = targetState;

    // Update energy
    if (targetState === "sprint") {
      GameState.playerData.energy = Math.max(
        0,
        GameState.playerData.energy -
          GameState.playerData.energyDrainRate * deltaTime
      );
    } else {
      GameState.playerData.energy = Math.min(
        100,
        GameState.playerData.energy +
          GameState.playerData.energyRegenRate * deltaTime
      );
    }

    // Smooth speed transitions
    const acceleration = 0.005;
    const deceleration = 0.01;

    if (controls.speed < targetSpeed) {
      controls.speed = Math.min(targetSpeed, controls.speed + acceleration);
    } else if (controls.speed > targetSpeed) {
      controls.speed = Math.max(
        GameState.playerData.walkSpeed,
        controls.speed - deceleration
      );
    }

    // Apply movement if needed
    const directions = [];
    if (GameState.moveForward) directions.push("forward");
    if (GameState.moveBackward) directions.push("backward");
    if (GameState.moveLeft) directions.push("left");
    if (GameState.moveRight) directions.push("right");

    if (directions.length === 0) {
      controls.speed = 0;
      return;
    }

    const object = GameState.game.controlsSystem.isMobile
      ? GameState.camera
      : GameState.controls.getObject();
    const oldPosition = object.position.clone();

    directions.forEach((dir) => {
      const speed = controls.speed;
      switch (dir) {
        case "forward":
          controls.moveForward(speed);
          break;
        case "backward":
          controls.moveForward(-speed);
          break;
        case "left":
          controls.moveRight(-speed);
          break;
        case "right":
          controls.moveRight(speed);
          break;
      }
    });

    // Collision detection
    const pos = object.position;
    if (checkElevatorEntryZone(pos)) {
      return;
    }

    if (checkCollision(pos) || checkElevatorCollision(pos)) {
      object.position.copy(oldPosition);
      controls.speed = 0;
      return;
    }

    const collisionData = checkBuildingCollision(pos, true);
    if (collisionData?.collisionNormal) {
      const pushDistance = 0.05;
      object.position
        .copy(oldPosition)
        .addScaledVector(collisionData.collisionNormal, pushDistance);
      controls.speed = 0;
    } else if (collisionData === true) {
      object.position.copy(oldPosition);
      controls.speed = 0;
    }

    GameState.isMoving = true;
  }

  updateFlashlightBattery() {
    const flashlight = GameState.flashlight;

    if (flashlight.enabled) {
      flashlight.battery = Math.max(
        0,
        flashlight.battery - flashlight.depletionRate * 0.025
      );

      if (flashlight.battery <= 0) {
        flashlight.enabled = false;
        GameState.tommyGunLight.visible = false;
      } else if (flashlight.battery <= flashlight.flickerThreshold) {
        this.handleFlickering();
      }
    } else {
      flashlight.battery = Math.min(
        100,
        flashlight.battery + flashlight.rechargeRate * 0.025
      );
    }

    this.updateBatteryUI();
  }

  handleFlickering() {
    if (GameState.tommyGunLight) {
      GameState.tommyGunLight.visible = Math.random() > 0.2;
    }
  }

  updateBatteryUI() {
    const bar = document.getElementById("battery-bar");
    if (bar) bar.style.width = GameState.flashlight.battery + "%";
  }

  updateEnergyUI() {
    const energyBar = document.getElementById("energy-bar");
    if (!energyBar) return;

    energyBar.style.width = GameState.playerData.energy + "%";

    // Visual feedback based on movement state
    switch (GameState.playerData.movementState) {
      case "sprint":
        energyBar.style.backgroundColor = "#ffff00"; // Yellow
        energyBar.style.boxShadow = "0 0 10px #ffff00";
        break;
      case "run":
        energyBar.style.backgroundColor = "#55ff55"; // Green
        energyBar.style.boxShadow = "0 0 5px #55ff55";
        break;
      case "walk":
        energyBar.style.backgroundColor = "#55ff55"; // Green
        energyBar.style.boxShadow = "none";
        break;
      default:
        energyBar.style.backgroundColor =
          GameState.playerData.energy < 20 ? "#ff5555" : "#55ff55";
        energyBar.style.boxShadow = "none";
    }

    // Update sprint buildup indicator
    const buildupBar = document.getElementById("sprint-buildup-bar");
    if (buildupBar) {
      let buildupPercent = 0;
      if (
        GameState.playerData.movementDuration >
        GameState.playerData.walkToRunThreshold
      ) {
        buildupPercent = Math.min(
          100,
          ((GameState.playerData.movementDuration -
            GameState.playerData.walkToRunThreshold) /
            GameState.playerData.runToSprintThreshold) *
            100
        );
      }
      buildupBar.style.width = buildupPercent + "%";
    }
  }

  takeDamage(amount) {
    GameState.playerData.health = Math.max(
      0,
      GameState.playerData.health - amount
    );
    GameState.playerData.energy = Math.max(0, GameState.playerData.energy - 10);
    ScreenShake.shake(15, 600);
    GameState.playerData.lastAttackTime = Date.now();
    this.clearRegen();

    this.updateHealthUI();
    if (GameState.playerData.health <= 0) {
      this.onDeath();
    }
  }

  onDeath() {
    GameState.isEnded = true;

    // Stop all animations immediately
    if (GameState.mixers) {
      GameState.mixers.forEach((mixer) => {
        mixer.stopAllAction();
        mixer.uncacheRoot(mixer.getRoot());
      });
      GameState.mixers = [];
    }

    // Stop the game loop
    if (GameState.animationFrameId) {
      cancelAnimationFrame(GameState.animationFrameId);
      GameState.animationFrameId = null;
    }

    // Pause all audio
    if (GameState.audio) {
      GameState.audio.stopAllSounds();
    }

    // Stop all enemy animations and AI
    if (GameState.game.sceneManager?.currentScene) {
      const currentScene = GameState.game.sceneManager.currentScene;

      // Stop spider animations
      if (currentScene.spiderManager) {
        currentScene.spiderManager.spiders.forEach((spider) => {
          if (spider.mixer) {
            spider.mixer.stopAllAction();
          }
          spider.aiEnabled = false; // Disable AI
        });
      }

      // Stop rake animations
      if (currentScene.rakeManager) {
        currentScene.rakeManager.rakes.forEach((rake) => {
          if (rake.mixer) {
            rake.mixer.stopAllAction();
          }
          rake.aiEnabled = false; // Disable AI
        });
      }

      // Stop door animations
      if (currentScene.doorControllers) {
        currentScene.doorControllers.forEach((controller) => {
          if (controller.mixer) {
            controller.mixer.stopAllAction();
          }
        });
      }

      // Stop elevator animations
      if (GameState.elevator?.mixer) {
        GameState.elevator.mixer.stopAllAction();
      }

      // Stop keypad animations if exists
      if (currentScene.keypadController?.mixer) {
        currentScene.keypadController.mixer.stopAllAction();
      }
    }

    // Unlock controls
    if (GameState.controls) {
      GameState.controls.unlock();
    }

    // Show game over popup with restart handler
    GameState.game.ui.showGameOverPopup(GameState.renderer, async () => {
      try {
        // Ensure all animations are stopped before reset
        if (GameState.animationFrameId) {
          cancelAnimationFrame(GameState.animationFrameId);
          GameState.animationFrameId = null;
        }

        await GameState.game.resetCurrentLevel();
      } catch (error) {
        console.error("Failed to restart level:", error);
        await GameState.game.sceneManager.switchTo("mainMenu");
      }
    });
  }

  updateHealthUI() {
    const healthHUD = document.getElementById("player-health");
    if (healthHUD) {
      healthHUD.style.width = GameState.playerData.health + "%";
    }
  }

  clearRegen() {
    if (GameState.playerData.regenTimeout) {
      clearTimeout(GameState.playerData.regenTimeout);
      GameState.playerData.regenTimeout = null;
    }
  }

  handleRegen() {
    if (GameState.playerData.health < 100) {
      GameState.playerData.health = Math.min(
        100,
        GameState.playerData.health + 0.001
      );
      this.updateHealthUI();

      GameState.playerData.regenTimeout = setTimeout(
        () => this.handleRegen(),
        1000
      );
    } else {
      GameState.playerData.regenTimeout = null;
    }
  }
  fire() {
    GameState.playerData.energy = Math.max(
      0,
      GameState.playerData.energy - 0.5
    );

    const currentTime = performance.now();
    if (
      currentTime - GameState.lastMeshAdditionTime <
      GameState.meshAdditionInterval
    ) {
      return;
    }

    GameState.lastMeshAdditionTime = currentTime;

    const currentWeapon = GameState.currentWeapon;
    const weaponData = GameState.weapons[currentWeapon];

    if (!weaponData || !weaponData.model) {
      console.warn(`Weapon model not found for: ${currentWeapon}`);
      return;
    }

    // Play weapon-specific firing/slashing animation
    const animationName =
      currentWeapon === "gun"
        ? GameState.currentBullets > 0
          ? "Arms_Fire"
          : "Arms_Inspect"
        : "Knife_Slash";

    playAnimation(animationName, { weapon: currentWeapon, forceRestart: true });
    GameState.shotsFired++;

    if (currentWeapon === "gun") {
      // Find gun's muzzle (magazine)
      let muzzle = null;
      weaponData.model.traverse(function (object) {
        if (object.name === "mag_82") {
          muzzle = object;
        }
      });

      if (!muzzle) {
        console.warn("Muzzle (mag_82) not found on weapon model");
        return;
      }

      if (GameState.currentBullets > 0) {
        GameState.currentBullets--;

        const muzzleWorldPos = new THREE.Vector3();
        muzzle.getWorldPosition(muzzleWorldPos);

        const direction = new THREE.Vector3();
        GameState.camera.getWorldDirection(direction);

        const bulletSize = 0.05;
        const bulletColor = 0xff0000;
        const bulletSpeed = 1.5;

        createBullet(
          muzzleWorldPos,
          direction,
          bulletSize,
          bulletColor,
          bulletSpeed
        );
        updateGunMuzzleFlash(muzzleWorldPos);
      }

      updateAmmoHUD(GameState.currentBullets, GameState.totalBullets);
    }

    // 🔪 Knife weapon logic: short-range melee hit detection
    if (currentWeapon === "knife") {
      const rayOrigin = GameState.camera.position.clone();
      const direction = new THREE.Vector3();
      GameState.camera.getWorldDirection(direction);

      const raycaster = new THREE.Raycaster(rayOrigin, direction, 0, 2.0); // 2 meter range
      const enemyTargets = GameState.enemyMeshes || []; // Customize this with your actual enemy objects

      const intersects = raycaster.intersectObjects(enemyTargets, true);
      if (intersects.length > 0) {
        const hit = intersects[0].object;
        dealKnifeDamage(hit); // Call your damage function (implement this)
        console.log("Knife hit enemy:", hit.name);
      } else {
        console.log("Knife swing missed");
      }
    }
  }

  updateMovementAnimation() {
    const nextAnim = getAnimationState();

    // Only update if we have a valid animation and it's different from current
    if (nextAnim !== null && GameState.currentAnimation !== nextAnim) {
      playAnimation(nextAnim);
      GameState.currentAnimation = nextAnim;
    }

    // Handle footstep sounds only when moving and after initial delay
    const now = performance.now();
    if (GameState.isMoving && now - GameState.gameStartTime >= 1500) {
      if (now - this.lastStepTime > this.stepInterval) {
        let rate = 0.9 + Math.random() * 0.2;
        // Adjust step rate based on movement state
        if (GameState.playerData.movementState === "sprint") {
          rate = 1.3 + Math.random() * 0.2;
        } else if (GameState.playerData.movementState === "run") {
          rate = 1.1 + Math.random() * 0.2;
        }
        GameState.audio.play("walk", 0.7, false, rate);
        this.lastStepTime = now;
      }
    }

    // Breathing sounds
    if (
      GameState.playerData.movementState === "sprint" &&
      now - this.lastBreathTime > 2000
    ) {
      GameState.audio.play("heavy_breathing", 0.5);
      this.lastBreathTime = now;
    }

    // When energy depleted
    if (
      GameState.playerData.energy <= 0 &&
      !this.playedExhaustedSound &&
      !GameState.isEnded
    ) {
      GameState.audio.play("exhausted", 0.7);
      this.playedExhaustedSound = true;
    } else if (GameState.playerData.energy > 10) {
      this.playedExhaustedSound = false;
    }
  }

  checkGoalReached() {
    if (!GameState.controls || !GameState.controls.getObject) {
      return;
    }

    const playerPos = GameState.game.controlsSystem.isMobile
      ? GameState.camera.position
      : GameState.controls.getObject().position;

    if (!playerPos) {
      return;
    }

    if (isPlayerInsideElevator(playerPos)) {
      setTimeout(() => {
        this.isCompleted = true;
        if (GameState.controls) {
          GameState.controls.unlock();
        }
      }, 2000);
    }
  }

  cleanup() {
    // Remove all lights
    this.lights.forEach((light) => {
      if (light.parent) light.parent.remove(light);
      light.dispose();
    });
    this.lights = [];

    // Stop all animations and clean up mixers
    this.mixers.forEach((mixer) => {
      mixer.stopAllAction();
      if (GameState.mixers.includes(mixer)) {
        GameState.mixers = GameState.mixers.filter((m) => m !== mixer);
      }
    });
    this.mixers = [];

    // Remove event listeners
    this.eventListeners.forEach(({ type, handler }) => {
      document.removeEventListener(type, handler);
    });
    this.eventListeners = [];

    // Remove model from scene
    if (GameState.tommyGun && GameState.tommyGun.parent) {
      GameState.tommyGun.parent.remove(GameState.tommyGun);
    }

    // Clear references
    GameState.tommyGun = null;
    GameState.tommyGunMixer = null;
    GameState.tommyGunAnimations = {};
    GameState.tommyGunLight = null;
    GameState.tommyGunLight1 = null;
    this.gltf = null;
    this.animations = {};
  }

  async toggleWeapon() {
    if (GameState.isReloading || GameState.isFiring) return;

    const newWeaponType = GameState.currentWeapon === "gun" ? "knife" : "gun";

    // Remove current weapon model from scene
    const currentWeaponModel =
      GameState.weapons[GameState.currentWeapon]?.model;
    if (currentWeaponModel && currentWeaponModel.parent) {
      currentWeaponModel.parent.remove(currentWeaponModel);
    }

    // Update current weapon in game state
    GameState.currentWeapon = newWeaponType;

    // Add new weapon model to scene
    GameState.player.addToScene(newWeaponType);

    // Play draw animation for new weapon
    playAnimation(newWeaponType === "gun" ? "Arms_Draw" : "Knife_Idle", {
      weapon: newWeaponType,
      forceRestart: true,
    });

    // After draw animation, switch to idle
    const clip =
      GameState.weapons[newWeaponType].animations[
        newWeaponType === "gun" ? "Arms_Draw" : "Knife_Idle"
      ];
    if (clip) {
      setTimeout(() => {
        playAnimation(newWeaponType === "gun" ? "Arms_Idle" : "Knife_Idle", {
          weapon: newWeaponType,
        });
      }, clip.duration * 1000);
    }
  }
  addToScene(weaponType) {
    // Remove any existing weapon models from scene
    ["gun", "knife"].forEach((type) => {
      const model = GameState.weapons[type]?.model;
      if (model && model.parent) {
        model.parent.remove(model);
      }
    });

    const weapon = GameState.weapons[weaponType];
    if (!weapon || !weapon.model) {
      console.warn("No model found for weapon", weaponType);
      return;
    }

    // Attach the selected weapon model to the controls (or camera if mobile)
    const controlsObject = GameState.game.controlsSystem?.isMobile
      ? GameState.camera
      : GameState.controls?.getObject();

    if (controlsObject) {
      controlsObject.add(weapon.model);
      weapon.model.position.set(...weapon.position);
      weapon.model.rotation.set(...weapon.rotation);
      weapon.model.scale.set(...weapon.scale);
    }
    this.addLighting();
    restoreFlashlightState();
  }
}
