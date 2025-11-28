import { GameState } from "../core/GameState.js";
import {
  updateSpiderHUD,
  checkSpiderAttacks,
  checkCollision,
  checkBuildingCollision,
} from "../utils/utils.js";
import {
  MeshBVH,
  acceleratedRaycast,
} from "https://esm.sh/three-mesh-bvh@0.9.0?bundle";

THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = MeshBVH.computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = MeshBVH.disposeBoundsTree;

export class SpiderManager {
  constructor(scene, spiderGLTF, audioManager) {
    if (!scene) throw new Error("Scene is required");
    if (!spiderGLTF) throw new Error("Spider GLTF is required");
    if (!audioManager) throw new Error("AudioManager is required");

    this.scene = scene;
    this.spiderGLTF = spiderGLTF;
    this.audio = audioManager;
    this.spiders = [];
    this.totalSpiders = 40;
    this.spawnedSpiders = 0;
    this.spawnInterval = null;

    // Verify animations exist
    if (
      !this.spiderGLTF.animations ||
      this.spiderGLTF.animations.length === 0
    ) {
      console.warn("Spider model has no animations");
    }

    GameState.totalSpiders = this.totalSpiders;
    GameState.frameCount = 0;
  }

  spawnSpiders() {
    // Clear any existing interval
    if (this.spawnInterval) {
      clearInterval(this.spawnInterval);
    }

    // Start spawning spiders every 2 seconds
    this.spawnInterval = setInterval(() => {
      if (this.spawnedSpiders >= this.totalSpiders) {
        clearInterval(this.spawnInterval);
        return;
      }

      // Get valid spawn position outside rooms
      const spiderPosition = this.findValidSpawnPosition();

      if (spiderPosition) {
        this.spawnSingleSpider(spiderPosition, null); // No building association
        this.spawnedSpiders++;
        this.updateSpiderHUD();
      }
    }, 2000); // 2000ms = 2 seconds
  }

  findValidSpawnPosition() {
    const maxAttempts = 50;
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;

      // Generate random position within entire game bounds
      const x = Math.random() * GameState.gridSize - GameState.halfGridSize;
      const z = Math.random() * GameState.gridSize - GameState.halfGridSize;
      const candidatePosition = new THREE.Vector3(x, 1, z);

      // Check if position is inside any room
      let isInsideRoom = false;
      for (const building of GameState.buildingClones) {
        const roomCenter = building.position;
        const roomHalfWidth = GameState.roomWidth / 2;
        const roomHalfDepth = GameState.roomDepth / 2;

        if (
          Math.abs(x - roomCenter.x) < roomHalfWidth &&
          Math.abs(z - roomCenter.z) < roomHalfDepth
        ) {
          isInsideRoom = true;
          break;
        }
      }

      // Also ensure position isn't too close to player
      const minDistanceFromPlayer = 20;
      if (GameState.player) {
        const playerPos = GameState.game.controlsSystem.isMobile ? GameState.camera.position : GameState.controls.getObject().position;
        if (candidatePosition.distanceTo(playerPos) < minDistanceFromPlayer) {
          continue;
        }
      }

      // If not inside any room and not too close to player, return this position
      if (!isInsideRoom) {
        return candidatePosition;
      }
    }

    console.warn(
      "Failed to find valid spawn position after",
      maxAttempts,
      "attempts"
    );
    return null;
  }

  // Helper method to update HUD
  updateSpiderHUD() {
    try {
      if (
        document.getElementById("total-spiders") &&
        document.getElementById("spiders-killed")
      ) {
        updateSpiderHUD(GameState.totalSpiders, GameState.killedSpiders);
      }
    } catch (e) {
      console.warn("Couldn't update spider HUD:", e);
    }
  }

  spawnSingleSpider(pos, building) {
    try {
      const spider = THREE.SkeletonUtils.clone(this.spiderGLTF.scene);
      pos.y = 0.1;
      spider.position.copy(pos);
      spider.scale.set(0.2, 0.2, 0.2);
      spider.name = "Spider";

      // Initialize collider properties
      spider.userData.collider = {
        radius: 0.5,
        segment: new THREE.Line3(new THREE.Vector3(), new THREE.Vector3()),
        head: new THREE.Vector3(),
        tail: new THREE.Vector3(),
      };

      const mixer = new THREE.AnimationMixer(spider);
      const animations = this.setupAnimations(this.spiderGLTF.animations);
      const actions = this.createActions(mixer, animations);

      // Create animation action groups for blending
      const actionGroups = {
        legs: {
          idle: actions.idle,
          running: actions.running,
        },
        attacks: {
          jaw: actions.attack_jaw,
          inner_jaw: actions.attack_inner_jaw,
          left: actions.attack_L,
          right: actions.attack_R,
        },
      };

      if (actions.idle) actions.idle.play();

      this.scene.add(spider);

      this.spiders.push({
        object: spider,
        mixer,
        animations,
        actions,
        actionGroups,
        currentState: "idle",
        homePosition: pos.clone(),
        currentRoom: building,
        health: 100,
        healthBar: this.createHealthBar(),
        detectionRange: 10,
        attackRange: 2,
        lastStateChange: 0,
        wanderTarget: null,
        currentAnimation: "idle",
      });

      GameState.mixers.push(mixer);
      GameState.spiderMeshes.push(spider);
    } catch (error) {
      console.error("Failed to spawn spider:", error);
    }
  }

  setupAnimations(animations) {
    return {
      idle: animations.find((clip) => clip.name === "idle"),
      running: animations.find((clip) => clip.name === "running"),
      sprinting: animations.find((clip) => clip.name === "sprinting"),
      attack_jaw: animations.find((clip) => clip.name === "attack_jaw"),
      attack_inner_jaw: animations.find(
        (clip) => clip.name === "attack_inner_jaw"
      ),
      attack_L: animations.find((clip) => clip.name === "attack_L"),
      attack_R: animations.find((clip) => clip.name === "attack_R"),
      hit: animations.find((clip) => clip.name === "hit"),
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

    const player = GameState.game.controlsSystem.isMobile ? GameState.camera : GameState.controls.getObject();
    const playerPos = player.position;
    const playerLightOn = GameState.flashlight.enabled;

    // Only update visible spiders (within 50 units of camera)
    const visibleSpiders = this.spiders.filter((spider) => {
      // Skip spiders without proper collider setup
      if (!spider.object.userData.collider) {
        console.warn("Spider missing collider:", spider);
        return false;
      }
      return GameState.camera.position.distanceTo(spider.object.position) < 50;
    });

    // Limit updates per frame (10 spiders max per frame)
    const spidersToUpdate = visibleSpiders.slice(0, 10);

    spidersToUpdate.forEach((spider, index) => {
      // Spread updates over 3 frames (update 1/3 of spiders each frame)
      if (index % 3 === GameState.frameCount % 3) {
        this.updateSingleSpider(
          spider,
          playerPos,
          player,
          playerLightOn,
          deltaTime
        );
      }

      // Update animation mixer
      if (spider.mixer) spider.mixer.update(deltaTime);
    });

    GameState.frameCount++;
  }

  updateSingleSpider(spider, playerPos, player, playerLightOn, deltaTime) {
    spider.object.position.y = 0.1;
    this.updateSpiderCollider(spider.object);
    this.updateHealthBar(spider);

    spider.lastStateChange += deltaTime;

    switch (spider.currentState) {
      case "idle":
        this.handleIdleState(
          spider,
          playerPos,
          player,
          playerLightOn,
          deltaTime
        );
        break;
      case "alert":
        this.handleAlertState(spider, playerPos, deltaTime);
        break;
      case "attack":
        this.handleAttackState(spider, playerPos, player, deltaTime);
        this.chasePlayer(spider, playerPos, player, deltaTime);
        break;
    }

    this.applySeparationForce(spider);
  }

  handleIdleState(spider, playerPos, player, playerLightOn, deltaTime) {
    const distToPlayer = spider.object.position.distanceTo(playerPos);
    const dirToPlayer = playerPos
      .clone()
      .sub(spider.object.position)
      .normalize();
    const playerForward = new THREE.Vector3(0, 0, -1).applyQuaternion(
      player.quaternion
    );
    const inSight = dirToPlayer.dot(playerForward) > 0.7;

    if (distToPlayer < 10 || (playerLightOn && inSight && distToPlayer < 15)) {
      this.playAction(spider, "running");
      spider.currentState = "attack";
      this.playSpiderSound(spider, "alert");
    } else if (distToPlayer < 6) {
      this.playAction(spider, "running");
      spider.currentState = "alert";
    } else {
      this.wanderAndMove(spider, deltaTime);
    }
  }

  handleAlertState(spider, playerPos, deltaTime) {
    const distToPlayer = spider.object.position.distanceTo(playerPos);

    if (distToPlayer < 4) {
      spider.currentState = "attack";
      return;
    }

    if (distToPlayer > 8) {
      spider.currentState = "idle";
      return;
    }

    this.moveToPlayer(spider, playerPos, deltaTime);
  }

  handleAttackState(spider, playerPos, player, deltaTime) {
    // Calculate target position with offset (1.2 units in front of player)
    const attackOffset = new THREE.Vector3(0, 0, -1.2).applyQuaternion(
      GameState.camera.quaternion
    );
    const targetPosition = playerPos.clone().add(attackOffset);
    targetPosition.y = 0.1; // Keep spider at ground level

    const distToTarget = spider.object.position.distanceTo(targetPosition);

    // Always play running animation during attack state
    if (!spider.actionGroups.legs.running.isRunning()) {
      spider.actionGroups.legs.running
        .reset()
        .setEffectiveTimeScale(1.5) // Faster during attack
        .fadeIn(0.1)
        .play();
    }

    // Movement parameters
    const arrivalThreshold = 0.5; // Distance where we consider arrived
    const maxSpeed = 8.0 * deltaTime;

    if (distToTarget > arrivalThreshold) {
      const direction = targetPosition
        .clone()
        .sub(spider.object.position)
        .normalize();

      // Apply continuous movement without slowing down
      spider.object.position.add(direction.multiplyScalar(maxSpeed));
      spider.object.position.y = 0.1;
    }

    // Face the player (horizontal only)
    spider.object.lookAt(
      new THREE.Vector3(playerPos.x, spider.object.position.y, playerPos.z)
    );
    spider.object.rotateY(Math.PI);
  }

  wanderAndMove(spider, deltaTime) {
    if (
      !spider.wanderTarget ||
      spider.object.position.distanceTo(spider.wanderTarget) < 0.5
    ) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * 5;
      spider.wanderTarget = spider.object.position.clone().add(
        new THREE.Vector3(
          Math.cos(angle) * distance,
          0, // Y remains 0 for wandering
          Math.sin(angle) * distance
        )
      );
    }

    const dir = spider.wanderTarget
      .clone()
      .sub(spider.object.position)
      .normalize();

    // Zero out Y movement
    dir.y = 0;

    this.moveInDirection(spider, dir, deltaTime);
  }

  moveToPlayer(spider, playerPos, deltaTime) {
    // Create horizontal position
    const horizontalPlayerPos = new THREE.Vector3(
      playerPos.x,
      spider.object.position.y, // Maintain current Y
      playerPos.z
    );

    const dir = horizontalPlayerPos
      .clone()
      .sub(spider.object.position)
      .normalize();
    this.moveInDirection(spider, dir, deltaTime);
  }

  chasePlayer(spider, playerPos, player, deltaTime) {
    // Create horizontal position
    const horizontalPlayerPos = new THREE.Vector3(
      playerPos.x,
      spider.object.position.y, // Maintain current Y
      playerPos.z
    );

    const dir = horizontalPlayerPos
      .clone()
      .sub(spider.object.position)
      .normalize();
    const oldPosition = spider.object.position.clone();
    const moveStep = dir.clone().multiplyScalar(0.1 * deltaTime * 60);

    // Keep original Y position
    moveStep.y = 0;

    const nextPos = oldPosition.clone().add(moveStep);
    const collisionData = checkBuildingCollision(nextPos, true);

    if (collisionData?.collisionNormal || collisionData === true) {
      const reverseStep = oldPosition.clone().add(
        dir
          .clone()
          .negate()
          .multiplyScalar(0.1 * deltaTime * 60)
      );
      reverseStep.y = oldPosition.y; // Maintain Y position
      if (!checkBuildingCollision(reverseStep, true)) {
        spider.object.position.copy(reverseStep);
      }
    } 
    // else {
    //   spider.object.position.copy(nextPos);
    // }

    // Face the player (horizontal only)
    const lookAtPos = new THREE.Vector3(
      horizontalPlayerPos.x,
      spider.object.position.y,
      horizontalPlayerPos.z
    );
    spider.object.lookAt(lookAtPos);
    spider.object.rotateY(Math.PI); // Adjust if facing wrong way

    // Attack distance checks
    const dist = spider.object.position.distanceTo(horizontalPlayerPos);
    if (dist < 2) {
      this.playAction(
        spider,
        Math.random() > 0.5 ? "attack_jaw" : "attack_inner_jaw"
      );
    } else if (dist < 6) {
      this.playAction(spider, Math.random() > 0.5 ? "attack_L" : "attack_R");
    }

    if (GameState.player) {
      checkSpiderAttacks();
    }
  }

  alertNearbySpiders(attackedSpider, playerPosition) {
    const alertRadius = 15; // Radius within which spiders will be alerted
    const minAlertDistance = 5; // Minimum distance for alert to trigger

    this.spiders.forEach((spider) => {
      if (spider === attackedSpider) return;

      const distanceToPlayer =
        spider.object.position.distanceTo(playerPosition);
      const distanceToAttackedSpider = spider.object.position.distanceTo(
        attackedSpider.object.position
      );
      if (
        (distanceToPlayer < alertRadius ||
          distanceToAttackedSpider < minAlertDistance) &&
        spider.currentState !== "attack"
      ) {
        // Only alert if the spider can see the player or is very close to the attacked spider
        if (
          this.canSeePlayer(spider, playerPosition) ||
          distanceToAttackedSpider < minAlertDistance
        ) {
          spider.currentState = "alert";
          spider.lastStateChange = 0; // Reset state timer
          spider.wanderTarget = null; // Clear any wander target

          // Play alert sound with 50% probability to avoid sound spam
          if (Math.random() > 0.5) {
            this.playSpiderSound(spider, "alert");
          }
        }
      }
    });
  }

  canSeePlayer(spider, playerPosition) {
    const spiderPos = spider.object.position.clone();
    const directionToPlayer = playerPosition.clone().sub(spiderPos).normalize();

    const raycaster = new THREE.Raycaster(
      spiderPos,
      directionToPlayer,
      0, // near
      spider.detectionRange // far
    );

    // Check for obstacles between spider and player
    const obstacles = GameState.buildingClones.concat(
      this.spiders.map((s) => s.object).filter((s) => s !== spider.object)
    );

    const intersects = raycaster.intersectObjects(obstacles, true);

    // If no obstacles or player is very close, spider can see player
    if (intersects.length === 0 || spiderPos.distanceTo(playerPosition) < 3) {
      return true;
    }

    // Check if the first intersection is beyond the player position
    const firstIntersectDistance = intersects[0]?.distance || Infinity;
    const playerDistance = spiderPos.distanceTo(playerPosition);

    return firstIntersectDistance > playerDistance;
  }

  moveInDirection(spider, dir, deltaTime) {
    const speed = 0.05 * deltaTime * 60;
    const origin = spider.object.position.clone();

    // Ensure direction is horizontal
    dir.y = 0;
    dir.normalize();

    // First try straight ahead (0 angle)
    const straightPos = origin.clone().add(dir.clone().multiplyScalar(speed));
    straightPos.y = origin.y; // Maintain Y position

    if (!checkCollision(straightPos)) {
      const collisionData = checkBuildingCollision(straightPos, true);
      if (!collisionData?.collisionNormal && collisionData !== true) {
        spider.object.position.copy(straightPos);

        // Face movement direction (horizontal only)
        const lookAtPos = origin.clone().add(dir);
        lookAtPos.y = origin.y;
        spider.object.lookAt(lookAtPos);
        spider.object.rotateY(Math.PI);
        return;
      }
    }

    // If straight failed, try one random angle (left or right)
    const randomAngle = Math.random() > 0.5 ? Math.PI / 4 : -Math.PI / 4;
    const tryDir = dir
      .clone()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), randomAngle)
      .normalize();

    const newPos = origin.clone().add(tryDir.clone().multiplyScalar(speed));
    newPos.y = origin.y; // Maintain Y position

    if (!checkCollision(newPos)) {
      const collisionData = checkBuildingCollision(newPos, true);
      if (!collisionData?.collisionNormal && collisionData !== true) {
        spider.object.position.copy(newPos);

        // Face movement direction (horizontal only)
        const lookAtPos = origin.clone().add(tryDir);
        lookAtPos.y = origin.y;
        spider.object.lookAt(lookAtPos);
        spider.object.rotateY(Math.PI);
        return;
      }
    }
  }

  updateSpiderCollider(spider) {
    if (!spider.userData.collider) return;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
      spider.quaternion
    );
    const backward = forward.clone().negate();

    // Update head and tail positions
    spider.userData.collider.head
      .copy(spider.position)
      .add(forward.multiplyScalar(0.5));
    spider.userData.collider.tail
      .copy(spider.position)
      .add(backward.multiplyScalar(0.5));

    // Update segment
    spider.userData.collider.segment.start.copy(spider.userData.collider.head);
    spider.userData.collider.segment.end.copy(spider.userData.collider.tail);
  }

  createHealthBar() {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 12;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "green";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const healthBar = new THREE.Sprite(material);

    healthBar.scale.set(1.5, 0.3, 1);
    return healthBar;
  }

  updateHealthBar(spider) {
    const canvas = spider.healthBar.material.map.image;
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const healthPercent = Math.max(spider.health / 100, 0);
    ctx.fillStyle = "red";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "green";
    ctx.fillRect(0, 0, canvas.width * healthPercent, canvas.height);

    spider.healthBar.material.map.needsUpdate = true;
  }

  playAction(spider, actionName, fadeDuration = 0.2) {
    // For non-attack actions, stop all actions except running
    if (!actionName.includes("attack") && actionName !== "hit") {
      for (const [key, action] of Object.entries(spider.actions)) {
        if (action && action.isRunning() && key !== "running") {
          action.fadeOut(fadeDuration);
        }
      }
    }

    // Always ensure running is playing for movement states
    if (
      (actionName === "running" || actionName === "sprinting") &&
      !spider.actions.running.isRunning()
    ) {
      spider.actions.running
        .reset()
        .setEffectiveTimeScale(actionName === "sprinting" ? 1.5 : 1)
        .fadeIn(fadeDuration)
        .play();
    }

    // Play the main action
    if (spider.actions[actionName] && !actionName.includes("attack")) {
      const action = spider.actions[actionName]
        .reset()
        .setEffectiveTimeScale(1)
        .fadeIn(fadeDuration)
        .play();

      if (actionName === "hit") {
        action.setLoop(THREE.LoopOnce);
        action.clampWhenFinished = true;
        spider.mixer.addEventListener("finished", () => {
          this.playAction(spider, "running");
        });
      } else {
        action.setLoop(THREE.LoopRepeat);
      }
    }

    spider.currentAnimation = actionName;
    this.playSpiderSound(spider, actionName);
  }

  handleAttackAnimation(spider, attackName, fadeDuration = 0.1) {
    // Ensure running animation continues
    if (!spider.actionGroups.legs.running.isRunning()) {
      spider.actionGroups.legs.running
        .reset()
        .setEffectiveTimeScale(1.5) // Faster during attack
        .fadeIn(fadeDuration)
        .play();
    }

    // Play the attack animation
    const attackAction = spider.actionGroups.attacks[attackName.split("_")[1]];
    if (attackAction) {
      attackAction.reset().setEffectiveTimeScale(1).fadeIn(fadeDuration).play();
      attackAction.setLoop(THREE.LoopOnce);
      attackAction.clampWhenFinished = true;

      spider.isAttacking = true;
      spider.currentAttack = attackAction;

      // When attack finishes, keep running
      spider.mixer.addEventListener("finished", (e) => {
        if (e.action === attackAction) {
          spider.isAttacking = false;
          spider.currentAttack = null;
          // Running animation continues automatically
        }
      });
    }

    this.playSpiderSound(spider, "attack");
  }

  playSpiderSound(spider, state) {
    const soundMap = {
      idle: "../sounds/StunSpider.ogg",
      alert: "../sounds/Shriek2.ogg",
      attack: "../sounds/Shriek2.ogg",
      move: "../sounds/Shriek2.ogg",
      hit: "../sounds/StunSpider.ogg",
    };
    const soundFile = soundMap[state];
    if (soundFile) {
      GameState.audio.play3D(soundFile, spider.object.position, 0.5);
    }
  }

  applySeparationForce(spider) {
    const separationRadius = 1; // Radius to check for nearby spiders
    const separationStrength = 0.03; // How strongly to push away
    const force = new THREE.Vector3();
    const spiderPos = spider.object.position.clone(); // Get current position

    // Only check visible spiders (optimization)
    const nearbySpiders = this.spiders.filter((other) => {
      return (
        other !== spider &&
        spiderPos.distanceTo(other.object.position) < separationRadius
      );
    });

    // Calculate separation force from each nearby spider
    nearbySpiders.forEach((other) => {
      const otherPos = other.object.position.clone();
      const dist = spiderPos.distanceTo(otherPos);

      if (dist > 0.0001) {
        // Avoid division by zero
        const awayDirection = spiderPos
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
      const newPos = spiderPos.clone().add(force);

      // Check for collisions before moving
      if (!checkBuildingCollision(newPos, true)) {
        spider.object.position.copy(newPos);
      }
    }
  }

  cleanup() {
    // Clear the spawn interval
    if (this.spawnInterval) {
      clearInterval(this.spawnInterval);
      this.spawnInterval = null;
    }

    // Clean up spiders
    this.spiders.forEach((spider) => {
      // Remove debug visuals
      if (spider.debugLine) spider.object.remove(spider.debugLine);
      if (spider.debugHead) spider.object.remove(spider.debugHead);

      if (spider.mixer) {
        spider.mixer.stopAllAction();
        GameState.mixers = GameState.mixers.filter((m) => m !== spider.mixer);
      }
      this.scene.remove(spider.object);
    });
    GameState.spiderMeshes = GameState.spiderMeshes.filter(
      (mesh) => !this.spiders.some((s) => s.object === mesh)
    );

    this.spiders = [];
    this.spawnedSpiders = 0;
  }
}
