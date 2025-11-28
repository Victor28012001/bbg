import { GameState } from "../core/GameState.js";
import { checkRakeAttacks } from "../utils/utils.js";

export class RakeManager {
  constructor(scene, rakeGLTF, audioManager) {
    if (!scene) throw new Error("Scene is required");
    if (!rakeGLTF) throw new Error("Rake GLTF is required");
    if (!audioManager) throw new Error("AudioManager is required");

    this.scene = scene;
    this.rakeGLTF = rakeGLTF;
    this.audio = audioManager;
    this.rakes = [];
    this.activeGrowls = 0;
    this.isHit = false;
    this.lastPlayerPosition = new THREE.Vector3();
    this.isPlayerMoving = false;

    // Verify animations exist
    if (!this.rakeGLTF.animations || this.rakeGLTF.animations.length === 0) {
      console.warn("Rake model has no animations");
    }
  }

  spawnRakes() {
    if (!GameState.buildingClones || GameState.buildingClones.length === 0) {
      console.warn("No buildings available to spawn rakes");
      return;
    }

    const rakesToSpawn = Math.max(
      1,
      Math.floor(GameState.buildingClones.length / 2)
    );
    const shuffledBuildings = [...GameState.buildingClones].sort(
      () => Math.random() - 0.5
    );

    for (let i = 0; i < Math.min(rakesToSpawn, shuffledBuildings.length); i++) {
      const building = shuffledBuildings[i];
      if (!building?.position) continue;

      const roomCenter = building.position.clone();
      const isBackRight = Math.random() > 0.5;

      const cornerOffset = new THREE.Vector3(
        isBackRight
          ? GameState.roomWidth / 2 - 1
          : -(GameState.roomWidth / 2 - 1),
        0,
        -(GameState.roomDepth / 2 - 1)
      );

      const rakePosition = roomCenter.add(cornerOffset);
      this.spawnSingleRake(rakePosition, building);
    }
  }

  spawnSingleRake(pos, building) {
    try {
      building.userData.hasRake = true;
      building.userData.rakePosition = pos.clone();

      const rake = THREE.SkeletonUtils.clone(this.rakeGLTF.scene);
      rake.name = "TheRake";
      rake.position.copy(pos);
      rake.scale.set(3.5, 3.5, 3.5);

      const mixer = new THREE.AnimationMixer(rake);
      const animations = this.setupAnimations(this.rakeGLTF.animations);
      const actions = this.createActions(mixer, animations);
      if (actions.idle) actions.idle.play();

      const rakeObj = {
        object: rake,
        mixer,
        animations,
        actions,
        currentState: "idle",
        homePosition: pos.clone(),
        currentRoom: building,
        health: 100,
        detectionRange: 15,
        attackRange: 3,
        lightSensitivity: true,
        isHit: this.isHit,
        lastStateChange: 0,
        teleportCooldown: 0,
        transitionState: null,
        transitionTimer: 0,
        searchTimer: 0,
        targetPosition: null,
        returnPath: [],
        isReturning: false,
        currentAnimation: "idle",
        searchOriginPosition: null,
        searchAreaRadius: 5,
        isSearching: false,
        lastHeardPosition: null,
        persistentAttackRange: 20,
        lastSeenPlayerPosition: null,
        attackCooldown: 0,
        attackPersistTime: 5,
        currentAttackPersistTime: 0,
        searchTimeout: null,
      };

      // ✅ Attach logic to mesh
      rake.userData.rakeLogic = rakeObj;

      this.scene.add(rake);
      this.rakes.push(rakeObj);
      GameState.rakeMeshes.push(rake);
    } catch (error) {
      console.error("Failed to spawn rake:", error);
    }
  }

  setupAnimations(animations) {
    return {
      idle: animations?.find((clip) => clip.name === "metarig|idle"),
      idleStanding: animations?.find(
        (clip) => clip.name === "metarig|idle standing"
      ),
      getup2: animations?.find((clip) => clip.name === "metarig|getup2"),
      standingRun: animations?.find(
        (clip) => clip.name === "metarig|standing run"
      ),
      screech: animations?.find((clip) => clip.name === "metarig|screech"),
      ref: animations?.find((clip) => clip.name === "metarig|ref"),
      search: animations?.find((clip) => clip.name === "metarig|search"),
      walk: animations?.find((clip) => clip.name === "metarig|walk"),
    };
  }

  createActions(mixer, animations) {
    const actions = {};
    for (const [key, clip] of Object.entries(animations)) {
      if (clip) actions[key] = mixer.clipAction(clip);
    }
    return actions;
  }

  update(deltaTime) {
    if (!GameState.player || !GameState.controls) return;

    const player = GameState.game.controlsSystem.isMobile
      ? GameState.camera
      : GameState.controls.getObject();
    const playerPos = player.position;
    const playerLightOn = GameState.flashlight.enabled;

    const movedDistance = this.lastPlayerPosition.distanceToSquared(playerPos);
    this.isPlayerMoving = movedDistance > 0.001;
    this.lastPlayerPosition.copy(playerPos);

    this.rakes.forEach((rake) => {
      const { mixer } = rake;

      mixer.update(deltaTime);
      rake.lastStateChange += deltaTime;
      rake.teleportCooldown = Math.max(0, rake.teleportCooldown - deltaTime);

      if (rake.transitionState) {
        rake.transitionTimer -= deltaTime;
        if (rake.transitionTimer <= 0) {
          this.completeTransition(rake);
        }
      } else {
        this.checkForGunshotTeleport(rake, playerPos);

        switch (rake.currentState) {
          case "idle":
            this.handleIdleState(rake, playerPos, playerLightOn);
            break;
          case "jumpscare":
            this.handleJumpscareState(rake, playerPos, playerLightOn);
            break;
          case "attack":
            this.handleAttackState(rake, playerPos);
            break;
          case "searching":
            this.handleSearchingState(rake, playerPos, deltaTime);
            break;
          case "exiting":
            this.handleExitingState(rake, deltaTime);
            break;
          case "movingToDoor":
            this.handleMovingToDoorState(rake, deltaTime);
            break;
          case "hunting":
            this.handleHuntingState(rake, deltaTime);
            break;
        }
      }
      this.applySeparationForce(rake);
    });
  }

  completeTransition(rake) {
    const { transitionState } = rake;
    rake.transitionState = null;

    switch (transitionState) {
      case "to_attack":
        rake.currentState = "attack";
        this.playAction(rake, "standingRun");
        break;
      case "to_jumpscare":
        rake.currentState = "jumpscare";
        this.playAction(rake, "idleStanding");
        this.playSound("jumpscare", 1.0, false);

        // 👉 Calculate jumpscare position in front of player ONCE
        const playerDirection = new THREE.Vector3();
        GameState.camera.getWorldDirection(playerDirection);
        playerDirection.y = 0;
        playerDirection.normalize();

        const player = GameState.game.controlsSystem.isMobile
          ? GameState.camera
          : GameState.controls.getObject();

        const playerPos = player.position.clone();

        rake.jumpscarePosition = playerPos.add(
          playerDirection.multiplyScalar(1.5)
        );
        rake.jumpscarePosition.y = 0.4;
        break;
    }
  }

  playAction(rake, actionName, fadeDuration = 0.2) {
    for (const [key, action] of Object.entries(rake.actions)) {
      if (key !== actionName && action.isRunning()) {
        action.fadeOut(fadeDuration);
      }
    }

    if (rake.actions[actionName]) {
      rake.actions[actionName]
        .reset()
        .setEffectiveTimeScale(1)
        .fadeIn(fadeDuration)
        .play();
    }
    rake.currentAnimation = actionName;
  }

  playSound(
    soundName,
    volume = 1,
    loop = false,
    is3D = false,
    position = null
  ) {
    try {
      if (!this.audio) {
        console.warn(`Audio system not available for sound: ${soundName}`);
        return;
      }

      // For growl sounds, add additional checks
      if (soundName === "monster-growl") {
        const playerPos = GameState.controls?.getObject()?.position;
        if (!playerPos || (position && position.distanceTo(playerPos) > 20)) {
          return; // Don't play if player is too far
        }

        // Limit concurrent growl sounds
        if (this.activeGrowls >= 2) return;
        this.activeGrowls = (this.activeGrowls || 0) + 1;

        // Set up cleanup
        const sound = this.audio.play(soundName, volume, loop, is3D, position);
        if (sound && sound.onEnded) {
          sound.onEnded = () => {
            this.activeGrowls = Math.max(0, (this.activeGrowls || 0) - 1);
          };
        }
        return;
      }

      // Regular sound playback
      this.audio.play(soundName, volume, loop, is3D, position);
    } catch (error) {
      console.error(`Failed to play sound ${soundName}:`, error);
    }
  }

  handleMovingToDoorState(rake, deltaTime) {
    if (!rake.returnPath || rake.returnPath.length === 0) {
      rake.currentState = "idle";
      return;
    }

    const target = rake.returnPath[0];
    const direction = new THREE.Vector3().subVectors(
      target,
      rake.object.position
    );
    direction.y = 0;
    const distance = direction.length();
    direction.normalize();

    const moveSpeed = 0.05 * 60 * deltaTime;
    rake.object.position.add(direction.multiplyScalar(moveSpeed));
    rake.object.lookAt(
      new THREE.Vector3(target.x, rake.object.position.y, target.z)
    );

    if (distance < 0.5) {
      rake.returnPath.shift();

      if (rake.returnPath.length === 0) {
        this.playAction(rake, "search");
        rake.currentState = "searching";
        rake.searchTimer = 5;
      } else {
        this.playAction(rake, "standingRun");
        rake.currentState = "hunting";
      }
    }
  }

  checkForGunshotTeleport(rake, playerPos) {
    if (rake.teleportCooldown > 0 || !GameState.isFiring) return;

    if (rake.currentState === "attack" || rake.currentState === "jumpscare")
      return;

    const distToRoom = rake.currentRoom.position.distanceTo(playerPos);
    if (distToRoom < rake.detectionRange * 1.5) {
      rake.searchOriginPosition = playerPos.clone();
      rake.targetPosition = playerPos.clone();
      rake.lastHeardPosition = playerPos.clone();

      if (
        rake.currentState !== "hunting" &&
        rake.currentState !== "movingToDoor"
      ) {
        this.initiateHuntSequence(rake, playerPos);
      }
      rake.teleportCooldown = 10;
      this.playSound("teleport", 0.5, false);
    }
    rake.object.position.y = 0;
  }

  initiateHuntSequence(rake, playerPos) {
    if (rake.currentState === "attack" || rake.currentState === "jumpscare")
      return;

    rake.targetPosition = playerPos.clone();

    if (rake.currentState === "hunting") {
      return;
    }

    const doorPos = this.getDoorPositionForBuilding(rake.currentRoom);

    if (!doorPos) {
      this.playAction(rake, "standingRun");
      rake.currentState = "hunting";
      return;
    }

    const playerRoom = this.getPlayerRoom();
    if (playerRoom && playerRoom === rake.currentRoom) {
      this.playAction(rake, "standingRun");
      rake.currentState = "hunting";
      return;
    }

    rake.returnPath = [doorPos, rake.targetPosition];
    this.playAction(rake, "walk");
    rake.currentState = "movingToDoor";

    const doorController = rake.currentRoom.userData.doorController;
    if (doorController && !doorController.doors[0].isOpen) {
      doorController.openDoor(doorController.doors[0]);
    }
  }

  getPlayerRoom() {
    const playerPos = GameState.game.controlsSystem.isMobile
      ? GameState.camera.position
      : GameState.controls.getObject().position;
    for (const building of GameState.buildingClones) {
      const roomCenter = building.position;
      const roomWidth = GameState.roomWidth;
      const roomDepth = GameState.roomDepth;

      if (
        Math.abs(playerPos.x - roomCenter.x) < roomWidth / 2 &&
        Math.abs(playerPos.z - roomCenter.z) < roomDepth / 2
      ) {
        return building;
      }
    }
    return null;
  }

  handleHuntingState(rake, deltaTime) {
    if (!rake.targetPosition) {
      this.startSearching(rake);
      return;
    }

    const direction = new THREE.Vector3().subVectors(
      rake.targetPosition,
      rake.object.position
    );
    direction.y = 0;
    const distance = direction.length();

    if (distance < 1.0) {
      this.startSearching(rake);
      return;
    }

    direction.normalize();
    const moveSpeed = 0.1 * 60 * deltaTime;
    rake.object.position.add(direction.multiplyScalar(moveSpeed));

    const playerPos = GameState.game.controlsSystem.isMobile
      ? GameState.camera.position
      : GameState.controls.getObject().position;
    const distToPlayer = rake.object.position.distanceTo(playerPos);

    if (distToPlayer < rake.detectionRange * 1.2) {
      if (rake.searchTimeout) {
        clearTimeout(rake.searchTimeout);
        rake.searchTimeout = null;
      }
      rake.lastSeenPlayerPosition = playerPos.clone();
      this.playAction(rake, "standingRun");
      rake.currentState = "attack";
      rake.lastStateChange = 0;
      this.playSound("monsterRoar", 0.7, false);
      return;
    }

    rake.object.lookAt(
      new THREE.Vector3(
        rake.targetPosition.x,
        rake.object.position.y,
        rake.targetPosition.z
      )
    );
  }

  startSearching(rake) {
    this.playAction(rake, "search");
    rake.currentState = "searching";
    rake.isSearching = true;
    rake.searchTimer = 5;
    rake.searchStartTime = GameState.clock.getElapsedTime();
  }

  handleIdleState(rake, playerPos, playerLightOn) {
    const { object, currentRoom } = rake;
    object.position.y = 0;
    const distToPlayer = object.position.distanceTo(playerPos);
    const playerInRoom = distToPlayer < rake.detectionRange;

    // Only play growl if player is nearby and not too frequent
    if (
      playerInRoom &&
      (!rake.lastGrowlTime || Date.now() - rake.lastGrowlTime > 5000)
    ) {
      this.playSound(
        "../sounds/monster-growl-251374.ogg",
        0.8,
        false,
        true,
        rake.object.position
      );
      rake.lastGrowlTime = Date.now();
    }

    if (playerInRoom) {
      const doorController = currentRoom.userData.doorController;
      let doorOpen = false;

      if (doorController) {
        doorOpen = doorController.doors.some(
          (door) =>
            door.isOpen &&
            door.action &&
            door.action.time >= door.clipDuration / 2
        );
      }

      if (doorOpen) {
        if (!playerLightOn) {
          rake.transitionState = "to_jumpscare";
          rake.transitionTimer = 0.1;
        } else if (rake.currentState !== "attack") {
          this.playAction(rake, "getup2");
          rake.transitionState = "to_attack";
          rake.transitionTimer = rake.animations.getup2
            ? rake.animations.getup2.duration
            : 1;
          this.playSound("monsterRoar", 0.7, false);
        }
      }
    }
  }

  handleJumpscareState(rake, playerPos, playerLightOn) {
    const playerDirection = new THREE.Vector3();
    GameState.camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();

    if (rake.jumpscarePosition) {
      rake.object.position.copy(rake.jumpscarePosition);
    }
    const flatPlayerPos = playerPos.clone();
    flatPlayerPos.y = rake.object.position.y;
    rake.object.lookAt(flatPlayerPos);
    rake.object.position.y = 0.4;

    if (rake.lastStateChange === 0) {
      this.playAction(rake, "screech");
      this.playSound("jumpscare", 1.0, false);

      // Save initial jumpscare position
      const playerDirection = new THREE.Vector3();
      GameState.camera.getWorldDirection(playerDirection);
      playerDirection.y = 0;
      playerDirection.normalize();

      rake.jumpscarePosition = playerPos
        .clone()
        .add(playerDirection.multiplyScalar(1.5));
      rake.jumpscarePosition.y = 0.4;
    }

    const screechDuration = rake.animations.screech
      ? rake.animations.screech.duration
      : 2;
    if (
      rake.lastStateChange > screechDuration &&
      rake.currentAnimation !== "idleStanding"
    ) {
      this.playAction(rake, "idleStanding");
      this.playSound("monsterGrowl", 1.0, false, rake.object.position);
    }

    if (
      (playerLightOn || this.isPlayerMoving) &&
      rake.currentAnimation === "idleStanding" &&
      rake.lastStateChange > screechDuration
    ) {
      this.playAction(rake, "standingRun");
      rake.currentState = "attack";
      rake.lastStateChange = 0;
      this.playSound("monsterRoar", 0.7, false);
    }

    if (rake.isHit && rake.currentAnimation === "idleStanding") {
      this.playAction(rake, "standingRun");
      rake.currentState = "attack";
      rake.lastStateChange = 0;
      this.playSound("monsterRoar", 0.7, false);
    }
  }

  handleAttackState(rake, playerPos) {
    const { object, attackRange, persistentAttackRange } = rake;

    // Calculate ideal attack position (1.5 units in front of player)
    const attackOffset = new THREE.Vector3(0, 0, -1.0).applyQuaternion(
      GameState.camera.quaternion
    );
    const targetPosition = playerPos.clone().add(attackOffset);
    targetPosition.y = 0; // Keep on ground

    const distToTarget = object.position.distanceTo(targetPosition);
    const distToPlayer = object.position.distanceTo(playerPos);

    // Smooth movement parameters
    const arrivalThreshold = 0.5; // Distance where we consider arrived
    const slowDownRadius = 2.0; // Distance where we start slowing down
    const maxSpeed = 0.1 * 60 * GameState.clock.getDelta();

    // Movement logic
    if (distToTarget > arrivalThreshold) {
      const direction = new THREE.Vector3()
        .subVectors(targetPosition, object.position)
        .normalize();

      // Smooth slowing down as we approach
      const speedFactor = Math.min(1, distToTarget / slowDownRadius);
      const currentSpeed = maxSpeed * speedFactor;

      // Apply movement
      object.position.add(direction.multiplyScalar(currentSpeed));
      object.position.y = 0;
    }

    // Always face the player (not the offset position)
    object.lookAt(
      new THREE.Vector3(playerPos.x, object.position.y, playerPos.z)
    );

    // Attack cooldown and state management
    rake.lastSeenPlayerPosition = playerPos.clone();
    rake.attackCooldown = 3;

    // Check for attacks with increased radius
    if (distToPlayer < attackRange + 1.5 && GameState.player) {
      checkRakeAttacks();
    }

    // Transition to hunting if player gets too far
    if (distToPlayer > persistentAttackRange + 1.5) {
      rake.attackCooldown -= GameState.clock.getDelta();
      if (rake.attackCooldown <= 0) {
        this.transitionToHunting(rake);
      }
    }
  }

  transitionToHunting(rake) {
    if (rake.lastSeenPlayerPosition) {
      rake.targetPosition = rake.lastSeenPlayerPosition.clone();
      this.playAction(rake, "standingRun");
      rake.currentState = "hunting";

      rake.searchTimeout = setTimeout(() => {
        if (
          rake.currentState === "hunting" ||
          rake.currentState === "searching"
        ) {
          this.initiateReturnHome(rake);
        }
      }, 5000);
    } else {
      this.initiateReturnHome(rake);
    }
  }

  handleSearchingState(rake, playerPos, deltaTime) {
    rake.searchTimer -= deltaTime;
    rake.object.position.y = 0;

    if (rake.lastStateChange > 1) {
      rake.object.rotation.y += (Math.PI / 4) * deltaTime;
      rake.lastStateChange = 0;
    }

    const searchDetectionRange = rake.detectionRange * 1.5;
    const distToPlayer = rake.object.position.distanceTo(playerPos);

    if (distToPlayer < searchDetectionRange) {
      rake.lastSeenPlayerPosition = playerPos.clone();
      this.playAction(rake, "standingRun");
      rake.currentState = "attack";
      rake.lastStateChange = 0;
      rake.isSearching = false;
      this.playSound("monsterRoar", 0.7, false);
      return;
    }

    if (rake.searchTimer <= 0) {
      rake.isSearching = false;
      this.initiateReturnHome(rake);
    }
  }

  // In RakeManager class
  handleHit(rake, damage = 10) {
    if (rake.currentState === "jumpscare") {
      // Instantly break out of jumpscare into attack
      rake.isPlayingHitReaction = false;
      rake.isHit = false;

      this.playAction(rake, "standingRun");
      rake.currentState = "attack";
      rake.lastStateChange = 0;
      this.playSound("monsterRoar", 0.7, false);
      return; // No further processing
    }
    // Don't interrupt attacks or if already in hit reaction
    if (rake.isAttacking || rake.isPlayingHitReaction) return;

    rake.health -= damage;
    rake.isPlayingHitReaction = true;
    rake.isHit = true;
    rake.hitCooldown = 2.0;

    // Store current animation state
    const wasAttacking = rake.isAttacking;
    const previousAnimation = rake.currentAnimation;

    // Temporarily stop attack animations
    if (wasAttacking) {
      rake.isAttacking = false;
      for (const action of Object.values(rake.actionGroups.attacks)) {
        action.stop();
      }
    }

    // Play screech animation
    const screechAction = rake.actions.screech;
    screechAction.reset().setLoop(THREE.LoopOnce).play();

    // Flash red effect
    const originalColors = [];
    rake.object.traverse((child) => {
      if (child.isMesh) {
        originalColors.push({
          mesh: child,
          color: child.material.color.clone(),
        });
        child.material.color.set(0xff0000);
      }
    });

    // Reset color after 100ms
    setTimeout(() => {
      originalColors.forEach(({ mesh, color }) =>
        mesh.material.color.copy(color)
      );
    }, 100);

    // Play hit sound
    this.playSound("monsterHurt", 0.8, false);

    // After screech finishes, resume previous behavior
    setTimeout(() => {
      rake.isPlayingHitReaction = false;
        rake.isHit = false;

      if (wasAttacking) {
        rake.isAttacking = true;
        this.playAction(rake, "standingRun");
      } else {
        this.playAction(rake, previousAnimation);
      }
    }, screechAction.getClip().duration * 500);

    // Death check
    if (rake.health <= 0) {
      this.killRake(rake);
    }
  }

  killRake(rake) {
    // Play death animation (screech)
    this.playAction(rake, "screech");

    // Play death sound
    this.playSound("monsterDeath", 1.0, false);

    // Remove after animation completes
    const screechDuration = rake.animations.screech?.duration || 2;
    setTimeout(() => {
      GameState.enemiesDefeated++;
      this.scene.remove(rake.object);
      rake.mixer.stopAllAction();

      // Remove from arrays
      this.rakes = this.rakes.filter((r) => r !== rake);
      GameState.rakeMeshes = GameState.rakeMeshes.filter(
        (m) => m !== rake.object
      );

      // Clear any search timeout
      if (rake.searchTimeout) {
        clearTimeout(rake.searchTimeout);
      }
    }, screechDuration * 500);
  }

  initiateReturnHome(rake) {
    const doorPos = this.getDoorPositionForBuilding(rake.currentRoom);
    if (!doorPos) {
      rake.object.position.copy(rake.homePosition);
      this.playAction(rake, "idle");
      rake.currentState = "idle";
      return;
    }

    rake.returnPath = [doorPos, rake.homePosition];
    rake.isReturning = true;
    this.playAction(rake, "walk");
    rake.currentState = "movingToDoor";

    const doorController = rake.currentRoom.userData.doorController;
    if (doorController && doorController.doors[0].isOpen) {
      doorController.closeDoor(doorController.doors[0]);
    }
  }

  getDoorPositionForBuilding(building) {
    if (!building.userData.doorController) return null;
    const doorController = building.userData.doorController;
    if (doorController.doors.length === 0) return null;
    return doorController.doors[0].object.getWorldPosition(new THREE.Vector3());
  }

  applySeparationForce(rake) {
    const separationRadius = 1.5; // Radius to check for nearby rakes
    const separationStrength = 0.03; // How strongly to push away
    const force = new THREE.Vector3();
    const rakePos = rake.object.position.clone(); // Get current position

    // Only check visible rakes (optimization)
    const nearbyRakes = this.rakes.filter((other) => {
      return (
        other !== rake &&
        rakePos.distanceTo(other.object.position) < separationRadius
      );
    });

    // Calculate separation force from each nearby rake
    nearbyRakes.forEach((other) => {
      const otherPos = other.object.position.clone();
      const dist = rakePos.distanceTo(otherPos);

      if (dist > 0.0001) {
        // Avoid division by zero
        const awayDirection = rakePos
          .clone()
          .sub(otherPos)
          .normalize()
          .divideScalar(dist); // Stronger when closer
        force.add(awayDirection);
      }
    });

    // Apply the force if it exists
    if (force.lengthSq() > 0) {
      force.normalize().multiplyScalar(separationStrength);

      // Calculate new position
      const newPos = rakePos.clone().add(force);

      // Check for collisions before moving
      // if (!checkBuildingCollision(newPos, true)) {
      rake.object.position.copy(newPos);
      // }
    }
  }

  cleanup() {
    this.rakes.forEach((rake) => {
      if (rake.searchTimeout) {
        clearTimeout(rake.searchTimeout);
      }
      this.scene.remove(rake.object);
      rake.mixer.stopAllAction();
    });
    this.rakes = [];
    GameState.rakeMeshes = GameState.rakeMeshes.filter(
      (mesh) => !this.rakes.some((s) => s.object === mesh)
    );
  }
}
