import { GameState } from "../core/GameState.js";
import { Bullet } from "../entities/Bullet.js";
import {
  SUBTRACTION,
  Brush,
  Evaluator,
} from "https://cdn.jsdelivr.net/npm/three-bvh-csg@0.0.17/+esm";
const UNION = 0;
// Update HUD
export function updateSpiderHUD(totalSpiders, killedSpiders) {
  const display1 = document.getElementById("total-spiders");
  const display2 = document.getElementById("spiders-killed");
  if (display1 && display2) {
    display1.textContent = totalSpiders;
    display1.textContent = killedSpiders;
  }
}

export function updateAmmoHUD(currentBullets, totalBullets) {
  const display1 = document.getElementById("totalBullets");
  const display2 = document.getElementById("currentBullets");
  const display3 = document.getElementById("reloadMessage");
  if (display1 && display2) {
    display2.textContent = currentBullets;
    display1.textContent = totalBullets;
  }

  if (currentBullets === 0 && totalBullets > 0 && display3) {
    display3.style.display = "block";
  } else {
    display3.style.display = "none";
  }
}

export function loadAudioFile(url, callback) {
  fetch(url)
    .then((response) => response.arrayBuffer())
    .then((arrayBuffer) => GameState.audioContext.decodeAudioData(arrayBuffer))
    .then((buffer) => {
      if (typeof callback === "function") {
        callback(buffer);
      }
    })
    .catch((err) => console.error("Audio loading error:", err));
}

export function playAnimation(name, options = {}) {
  if (name === null) return false;

  const {
    weapon = GameState.currentWeapon || "gun",
    fadeDuration = 0.2,
    forceRestart = false,
    playbackSpeed = name.includes("Sprint") ? 0.8 : 1.0,
  } = options;

  const weaponData = GameState.weapons[weapon];
  if (!weaponData) {
    console.warn("Invalid weapon type:", weapon);
    return false;
  }

  const animations = weaponData.animations;
  const mixer = weaponData.mixer;
  const model = weaponData.model;

  if (!animations || !mixer || !model) {
    console.error(`Missing resources for ${weapon} animation`);
    return false;
  }

  const clip = animations[name];
  if (!clip) {
    console.error(`[${weapon}] Animation not found:`, name);
    return false;
  }

  const newAction = mixer.clipAction(clip);
  const currentAction = mixer._actions.find((action) => action.isRunning());

  if (!forceRestart && currentAction?.getClip()?.name === name) {
    return false;
  }

  newAction.setEffectiveTimeScale(playbackSpeed);

  if (currentAction) {
    currentAction.fadeOut(fadeDuration);
  }

  mixer.stopAllAction();
  newAction.reset().fadeIn(fadeDuration).play();

  GameState.currentAnimation = name;
  return true;
}

export function getAnimationState() {
  const now = performance.now();
  if (now - GameState.gameStartTime < 1500) {
    return GameState.currentWeapon === "knife" ? "Knife_Idle" : "Arms_Draw";
  }

  const isKnife = GameState.currentWeapon === "knife";

  // Handle reloading (gun only)
  if (GameState.isReloading && !isKnife) return "Arms_fullreload";

  // Handle firing
  if (GameState.isFiring) {
    if (isKnife) {
      return "Knife_Slash";
    } else {
      return GameState.currentBullets > 0 ? "Arms_Fire" : "Arms_Inspect";
    }
  }

  // Handle movement
  if (GameState.isMoving) {
    const moveType = GameState.playerData.movementState;
    if (isKnife) {
      switch (moveType) {
        case "run":
        case "sprint":
          return "Knife_Run";
        case "walk":
        default:
          return "Knife_Walk";
      }
    } else {
      switch (moveType) {
        case "sprint":
          return "Arms_Sprint";
        case "run":
          return "Arms_Run";
        case "walk":
        default:
          return "Arms_Walk";
      }
    }
  }

  // Default to idle
  return isKnife ? "Knife_Idle" : "Arms_Idle";
}

export function checkCollision(position) {
  const half = GameState.halfGridSize;
  const margin = GameState.margin;

  if (
    position.x < -half + margin ||
    position.x > half - margin ||
    position.z < -half + margin ||
    position.z > half - margin
  ) {
    return true;
  }

  return false;
}

export function checkBuildingCollision(playerPosition) {
  if (playerPosition.distanceTo(GameState.camera.position) > 100) return false;
  const raycaster = new THREE.Raycaster();
  const collisionDistance = 0.5;
  if (!GameState.buildingClones || GameState.buildingClones.length === 0)
    return false;

  const directions = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ];

  for (const dir of directions) {
    raycaster.set(playerPosition, dir);

    for (const building of GameState.buildingClones) {
      const intersects = raycaster.intersectObject(building, true);
      if (intersects.length > 0 && intersects[0].distance < collisionDistance) {
        return true;
      }
    }
  }

  return false;
}

export function toggleLight(isFiring) {
  if (isFiring && GameState.tommyGunLight1) {
    GameState.tommyGunLight1.visible = true;
    setTimeout(() => {
      if (GameState.tommyGunLight1) {
        GameState.tommyGunLight1.visible = false;
      }
    }, 50); // flash duration in ms
  }
}

export function updateGunMuzzleFlash(position) {
  toggleLight(GameState.isFiring);
  GameState.tommyGunLight1.position.copy(position);
}

export function createBullet(position, direction) {
  GameState.audio.play("bullet", 1);
  GameState.audio.fadeOutMusic(3);
  const bullet = new Bullet(position, direction);
  GameState.bullets.push(bullet);
}

export function updateBullets(spiderManager, rakeManager, abandonedBuilding) {
  for (let i = GameState.bullets.length - 1; i >= 0; i--) {
    const bullet = GameState.bullets[i];
    const stillActive = bullet.update();

    if (!stillActive) {
      GameState.scene.remove(bullet.mesh);
      GameState.bullets.splice(i, 1);
      continue;
    }

    bullet.checkCollision(
      spiderManager,
      rakeManager,
      abandonedBuilding,
      i,
      GameState.bullets
    );
  }
}

export function faceBulletHolesToCamera() {
  GameState.bulletHoles.forEach(function (bulletHole) {
    var direction = GameState.camera.position
      .clone()
      .sub(bulletHole.position)
      .normalize();

    var quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      direction
    );

    // Apply the rotation to the bullet hole
    bulletHole.setRotationFromQuaternion(quaternion);
  });
}

export function checkSpiderAttacks() {
  if (!GameState.tommyGun || !GameState.knifeArm) return;

  let currentTime = Date.now();
  const targetPosition = new THREE.Vector3();
  if (GameState.tommyGun) {
    GameState.tommyGun.getWorldPosition(targetPosition);
  } else {
    GameState.tommyGun.getWorldPosition(targetPosition);
  }

  let isAttacked = false;

  GameState.spiderMeshes.forEach((spider) => {
    if (!spider || !spider.position) return;

    let horizontalSpiderPos = spider.position.clone();
    horizontalSpiderPos.y = 0;

    let horizontalGunPos = targetPosition.clone();
    horizontalGunPos.y = 0;

    let distanceToGun = horizontalSpiderPos.distanceTo(horizontalGunPos);

    if (distanceToGun < 0.8) {
      isAttacked = true;

      if (
        !GameState.playerData.lastAttackTime ||
        currentTime - GameState.playerData.lastAttackTime >= 500
      ) {
        GameState.player.takeDamage(2);
        GameState.playerData.lastAttackTime = currentTime;

        // Safely handle UI access
        if (GameState.game?.ui) {
          GameState.game.ui.showBloodOverlay();
        }
        // playSpiderAttackSound();
        GameState.audio.play("bite", 1);
        GameState.audio.play("scream", 1);
        if (GameState.playerData.regenTimeout) {
          clearTimeout(GameState.playerData.regenTimeout);
          GameState.playerData.regenTimeout = null;
        }
      }
    }
  });

  // Update health bar if it exists
  const healthBar = document.getElementById("player-health");
  if (healthBar) {
    healthBar.style.width = `${GameState.playerData?.health || 100}%`;
  }

  if (
    !isAttacked &&
    GameState.playerData?.lastAttackTime &&
    currentTime - GameState.playerData.lastAttackTime >= 5000
  ) {
    GameState.player?.handleRegen?.();
  }
}

export function checkRakeAttacks() {
  if (!GameState.tommyGun || !GameState.rakeMeshes) return;

  const currentTime = Date.now();
  const playerPos = GameState.game.controlsSystem.isMobile
    ? GameState.camera.position
    : GameState.controls.getObject().position;
  const playerForward = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(GameState.camera.quaternion)
    .normalize();

  // Attack area is in front of player
  const attackAreaCenter = playerPos
    .clone()
    .add(playerForward.multiplyScalar(1.0));
  attackAreaCenter.y = 0;

  let isAttacked = false;

  GameState.rakeMeshes.forEach((rake) => {
    if (!rake?.position) return;

    // Skip if rake is dead or currently hit
    const rakeLogic = rake.userData?.rakeLogic;
    if (rakeLogic?.health <= 0 || rakeLogic?.isHit) {
      return;
    }

    const rakePos = rake.position.clone();
    rakePos.y = 0;

    // Check if in conical attack area in front of player
    const toRake = new THREE.Vector3().subVectors(rakePos, playerPos);
    toRake.y = 0;
    const distance = toRake.length();
    const angle = playerForward.angleTo(toRake.normalize());

    // Attack if within 1.5m and 60° cone in front
    if (distance < 1.5 && angle < Math.PI / 3) {
      isAttacked = true;

      if (
        !GameState.playerData.lastAttackTime ||
        currentTime - GameState.playerData.lastAttackTime >= 800
      ) {
        GameState.player.takeDamage(10);
        GameState.playerData.lastAttackTime = currentTime;

        if (GameState.game?.ui) {
          GameState.game.ui.showBloodOverlay();
        }
        GameState.audio.play("bite", 1);
        GameState.audio.play("scream", 1);

        if (GameState.playerData.regenTimeout) {
          clearTimeout(GameState.playerData.regenTimeout);
          GameState.playerData.regenTimeout = null;
        }
      }
    }
  });

  // Update health bar if it exists
  const healthBar = document.getElementById("player-health");
  if (healthBar) {
    healthBar.style.width = `${GameState.playerData?.health || 100}%`;
  }

  if (
    !isAttacked &&
    GameState.playerData?.lastAttackTime &&
    currentTime - GameState.playerData.lastAttackTime >= 5000
  ) {
    GameState.player?.handleRegen?.();
  }
}

export function cutDoorHole(building) {
  const doorWidth = 1.8;
  const doorHeight = 3.01;
  const doorDepth = 2.0;

  const bbox = new THREE.Box3().setFromObject(building);
  const floorY = bbox.min.y;

  const doorHoleBrush = new Brush(
    new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth)
  );
  doorHoleBrush.position.set(0, floorY + doorHeight / 2, 4.47);
  doorHoleBrush.updateMatrixWorld();

  const brushes = [];

  building.traverse((child) => {
    if (child.isMesh) {
      let geom = child.geometry.clone();
      geom = THREE.BufferGeometryUtils.mergeVertices(geom);
      geom.applyMatrix4(child.matrixWorld);
      const brush = new Brush(geom);
      brush.updateMatrixWorld();
      brushes.push(brush);
    }
  });

  if (brushes.length === 0) {
    console.error("No brushes found in building");
    return;
  }

  let buildingBrush = brushes[0];
  const evaluator = new Evaluator();

  for (let i = 1; i < brushes.length; i++) {
    buildingBrush = evaluator.evaluate(buildingBrush, brushes[i], UNION);
  }

  const resultBrush = evaluator.evaluate(
    buildingBrush,
    doorHoleBrush,
    SUBTRACTION
  );

  if (evaluator.simplify) evaluator.simplify(resultBrush);

  const resultMesh = new THREE.Mesh(
    resultBrush.geometry,
    building.children[0].material
  );
  resultMesh.geometry = THREE.BufferGeometryUtils.mergeVertices(
    resultMesh.geometry
  );
  resultMesh.geometry.computeVertexNormals();

  resultMesh.material.side = THREE.DoubleSide;
  resultMesh.material.flatShading = true;
  resultMesh.material.needsUpdate = true;

  resultMesh.castShadow = true;
  resultMesh.receiveShadow = true;

  building.clear();
  building.add(resultMesh);
}

export function restoreFlashlightState() {
  const enabled = GameState.tommyGunLightEnabled;
  GameState.tommyGunLightEnabled = enabled;

  if (GameState.tommyGunLight) {
    GameState.tommyGunLight.visible = enabled;
  }

  // FIX: Add null check for GameState.dom
  if (GameState.dom?.flashlightIndicator) {
    GameState.dom.flashlightIndicator.style.backgroundImage = enabled
      ? "url('./assets/images/flashlight_on.png')"
      : "url('./assets/images/flashlight_off.png')";
  }
}

export function checkElevatorCollision(playerPosition) {
  if (!GameState.elevatorBox) return false;
  const playerSize = 0.5;
  const playerBox = new THREE.Box3(
    new THREE.Vector3(
      playerPosition.x - playerSize,
      playerPosition.y - playerSize,
      playerPosition.z - playerSize
    ),
    new THREE.Vector3(
      playerPosition.x + playerSize,
      playerPosition.y + playerSize,
      playerPosition.z + playerSize
    )
  );

  return GameState.elevatorBox.intersectsBox(playerBox);
}

export function isPlayerInsideElevator(playerPosition) {
  if (!GameState.elevatorBox) return false;
  const innerBox = GameState.elevatorBox.clone();
  const shrinkAmount = 0.3;
  innerBox.min.addScalar(shrinkAmount);
  innerBox.max.subScalar(shrinkAmount);

  return innerBox.containsPoint(playerPosition);
}

export function checkElevatorEntryZone(playerPosition) {
  if (!GameState.elevatorOpened || !GameState.elevator?.entryZoneBox)
    return false;

  const playerSize = 0.5;
  const playerBox = new THREE.Box3(
    new THREE.Vector3(
      playerPosition.x - playerSize,
      playerPosition.y - playerSize,
      playerPosition.z - playerSize
    ),
    new THREE.Vector3(
      playerPosition.x + playerSize,
      playerPosition.y + playerSize,
      playerPosition.z + playerSize
    )
  );

  return GameState.elevator.entryZoneBox.intersectsBox(playerBox);
}

export function endGame(won) {
  GameState.isEnded = true;
  GameState.controls.unlock();

  if (GameState.game?.ui) {
    if (won) {
      // Use the GameUI instance from GameState or wherever you have access to it
      GameState.game.ui.showGameWonPopup(GameState.renderer, () => {
        GameState.game.showLevelMenu();
      });
    } else {
      GameState.game.ui.showGameOverPopup(GameState.renderer, () => {
        GameState.game.loadLevel(GameState.currentLevel);
      });
    }
  } else {
    console.warn("Game UI not available - cannot show end game screen");
    // Fallback behavior if UI isn't available
    if (won) {
      window.location.reload(); // Simple reload as fallback
    } else {
      window.location.reload();
    }
  }
}

export function addDebugHelpers() {
  // Add bounding box helpers
  const gunHelper = new THREE.BoxHelper(GameState.weapons.gun.model, 0xffff00);
  const knifeHelper = new THREE.BoxHelper(
    GameState.weapons.knife.model,
    0xff00ff
  );

  // Add axis helpers
  const gunAxis = new THREE.AxesHelper(1);
  const knifeAxis = new THREE.AxesHelper(1);

  GameState.weapons.gun.model.add(gunHelper);
  GameState.weapons.gun.model.add(gunAxis);
  GameState.weapons.knife.model.add(knifeHelper);
  GameState.weapons.knife.model.add(knifeAxis);

  console.log("Debug helpers added");
}
