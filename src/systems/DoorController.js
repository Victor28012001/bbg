import { GameState } from "../core/GameState.js";

export class DoorController {
  constructor({
    targetParent,
    loader,
    filePath,
    gltf,
    offset = new THREE.Vector3(),
    rotationY = 0,
    triggerDistance = 2.5,
  }) {
    this.targetParent = targetParent;
    this.loader = loader;
    this.offset = offset;
    this.rotationY = rotationY;
    this.triggerDistance = triggerDistance;
    this.doors = [];
    this.tempVec = new THREE.Vector3();
    this.playerInTrigger = false;
    this.currentDoor = null;
    this.parentBuilding = targetParent;
    this.isMobile = GameState.game.controlsSystem.isMobile;
    this.debug = true; // Enable debug logging

    // Create tooltip element (for desktop)
    this.createTooltip();

    // Create mobile button (for mobile)
    this.createMobileButton();

    if (gltf) {
      const clonedScene = gltf.scene.clone(true);
      this.setupDoor({ scene: clonedScene, animations: gltf.animations });
    } else if (filePath) {
      this.loadDoor(filePath);
    } else {
      throw new Error("Either gltf or filePath must be provided.");
    }

    // Add keydown event listener (for desktop)
    this.handleKeyPress = this.handleKeyPress.bind(this);
    document.addEventListener("keydown", this.handleKeyPress);
  }

  createTooltip() {
    this.tooltipElement = document.createElement("div");
    this.tooltipElement.className = "door-tooltip";
    this.tooltipElement.innerHTML = "Press O to open door";
    this.tooltipElement.style.position = "absolute";
    this.tooltipElement.style.display = "none";
    this.tooltipElement.style.zIndex = "1000";
    document.body.appendChild(this.tooltipElement);
  }

  createMobileButton() {
    // Remove existing button if it exists
    if (this.mobileButton) {
      this.mobileButton.removeEventListener("click", this.handleMobileButtonClick);
      this.mobileButton.removeEventListener("touchstart", this.handleMobileButtonClick);
      if (this.mobileButton.parentNode) {
        this.mobileButton.parentNode.removeChild(this.mobileButton);
      }
    }

    // Create new button
    this.mobileButton = GameState.game.ui.createActionButton("door", "Open");
    this.mobileButton.id = "mobile-door-btn";
    this.mobileButton.style.display = "none";
    
    // Style the button for mobile
    

    // Add event listeners
    this.handleMobileButtonClick = this.handleMobileButtonClick.bind(this);
    this.mobileButton.addEventListener("click", this.handleMobileButtonClick);
    this.mobileButton.addEventListener("touchstart", this.handleMobileButtonClick, { passive: false });

    // Add to DOM
    const container = document.getElementById("mobile-action-buttons") || document.body;
    container.appendChild(this.mobileButton);

  }

  handleMobileButtonClick(e) {
    
    e.preventDefault();
    e.stopPropagation();

    if (this.playerInTrigger && this.currentDoor && !this.currentDoor.isOpen) {
      this.openDoor(this.currentDoor);
    } else {
      if (this.debug) console.log("Button pressed but conditions not met:", {
        playerInTrigger: this.playerInTrigger,
        currentDoor: !!this.currentDoor,
        isOpen: this.currentDoor?.isOpen
      });
    }
  }

  loadDoor(filePath) {
    this.loader.load(filePath, (gltf) => {
      this.setupDoor(gltf);
    });
  }

  setupDoor(gltf) {
    const doorObject = gltf.scene;
    const animations = gltf.animations;

    doorObject.name = "Door";
    doorObject.position.copy(this.offset);
    doorObject.rotation.y = this.rotationY;
    doorObject.scale.x = 1.5;

    this.targetParent.add(doorObject);
    doorObject.updateMatrixWorld(true);

    if (!animations || animations.length === 0) {
      console.warn("No animations found on door GLTF.");
    }

    const clip = animations ? animations[0] : null;
    const mixer = new THREE.AnimationMixer(doorObject);
    const action = clip ? mixer.clipAction(clip) : null;

    if (action) {
      action.clampWhenFinished = true;
      action.setLoop(THREE.LoopOnce);
    }

    const doorWorldPos = doorObject.getWorldPosition(new THREE.Vector3());

    const triggerMaterial = new THREE.MeshBasicMaterial({
      visible: false,
      side: THREE.DoubleSide,
    });

    const triggerGeometry = new THREE.CircleGeometry(this.triggerDistance, 32);
    const triggerZone = new THREE.Mesh(triggerGeometry, triggerMaterial);
    triggerZone.rotation.x = -Math.PI / 2;
    triggerZone.position.copy(doorWorldPos);
    triggerZone.name = "TriggerZone";
    triggerZone.receiveShadow = false;
    triggerZone.castShadow = false;
    triggerZone.visible = false;

    triggerZone.userData.ignoreCollision = true;
    triggerZone.userData.isTriggerZone = true;

    GameState.scene.add(triggerZone);

    let doorMesh = null;
    doorObject.traverse((child) => {
      if (child.isMesh && child.name.toLowerCase().includes("door")) {
        child.userData.ignoreCollision = false;
        doorMesh = child;
      }
    });

    this.doors.push({
      object: doorObject,
      mixer,
      action,
      isOpen: false,
      clipDuration: clip ? clip.duration : 0,
      triggerZone,
      doorMesh,
      playerInRange: false,
      parentBuilding: this.parentBuilding,
    });
  }

  showTooltip() {
    if (this.isMobile) {
      this.mobileButton.style.display = "flex";
    } else {
      this.tooltipElement.style.display = "block";
      this.tooltipElement.style.left = `${
        window.innerWidth / 2 - this.tooltipElement.offsetWidth / 2
      }px`;
      this.tooltipElement.style.top = `${window.innerHeight / 2 + 50}px`;
    }
  }

  hideTooltip() {
    if (this.isMobile) {
      this.mobileButton.style.display = "none";
    } else {
      this.tooltipElement.style.display = "none";
    }
  }

  handleKeyPress(event) {
    if (
      !this.isMobile &&
      event.key.toLowerCase() === "o" &&
      this.playerInTrigger &&
      this.currentDoor &&
      !this.currentDoor.isOpen
    ) {
      this.openDoor(this.currentDoor);
    }
  }

  openDoor(doorData, silent = false) {
    const { mixer, action, clipDuration, doorMesh } = doorData;

    if (!silent) {
      GameState.audio.play("open", 0.7, false);
    }

    action.reset();
    action.time = 0;
    action.setLoop(THREE.LoopOnce);
    action.timeScale = 1;
    action.play();

    setTimeout(() => {
      action.paused = true;
      action.time = clipDuration / 2;
      mixer.update(0);
    }, (clipDuration / 2) * 1000);

    doorData.isOpen = true;

    if (doorMesh) {
      doorMesh.userData.ignoreCollision = true;
    }

  }

  closeDoor(doorData) {
    const { mixer, action, clipDuration, doorMesh } = doorData;

    GameState.audio.play("close", 0.7, false);

    action.paused = false;
    action.reset();
    action.time = clipDuration / 2;
    action.setLoop(THREE.LoopOnce);
    action.timeScale = -1;
    action.play();

    doorData.isOpen = false;

    if (doorMesh) {
      doorMesh.userData.ignoreCollision = false;
    }
  }

  update(delta) {
    if (!GameState.controls) return;
    const player = this.isMobile
      ? GameState.camera
      : GameState.controls.getObject();
    if (!player) return;

    const playerPos = player.position;
    let playerNearAnyDoor = false;
    let nearestDoor = null;
    let minDistance = Infinity;

    this.doors.forEach((doorData) => {
      const { object, isOpen } = doorData;

      if (!object) return;

      object.updateMatrixWorld(true);
      object.getWorldPosition(this.tempVec);

      const dx = playerPos.x - this.tempVec.x;
      const dz = playerPos.z - this.tempVec.z;
      const distanceXZ = Math.sqrt(dx * dx + dz * dz);

      doorData.playerInRange = distanceXZ < this.triggerDistance;
      doorData.mixer.update(delta);

      if (doorData.playerInRange) {
        playerNearAnyDoor = true;
        if (distanceXZ < minDistance) {
          minDistance = distanceXZ;
          nearestDoor = doorData;
        }
      }

      if (!doorData.playerInRange && isOpen) {
        this.closeDoor(doorData);
      }
    });

    this.playerInTrigger = playerNearAnyDoor;
    this.currentDoor = nearestDoor;

    if (this.playerInTrigger && this.currentDoor && !this.currentDoor.isOpen) {
      this.showTooltip();
    } else {
      this.hideTooltip();
    }

    if (this.debug && this.isMobile) {
      this.mobileButton.style.border = this.playerInTrigger 
        ? "2px solid green" 
        : "2px solid red";
    }
  }
  

  cleanup() {
    // Remove event listeners
    document.removeEventListener("keydown", this.handleKeyPress);
    if (this.mobileButton) {
      this.mobileButton.removeEventListener("click", this.handleMobileButtonClick);
      this.mobileButton.removeEventListener("touchstart", this.handleMobileButtonClick);
      if (this.mobileButton.parentNode) {
        this.mobileButton.parentNode.removeChild(this.mobileButton);
      }
    }

    // Remove tooltip
    if (this.tooltipElement && this.tooltipElement.parentNode) {
      this.tooltipElement.parentNode.removeChild(this.tooltipElement);
    }

    // Clean up door resources
    this.doors.forEach((doorData) => {
      if (doorData.object && doorData.object.parent) {
        doorData.object.parent.remove(doorData.object);
      }
      if (doorData.triggerZone && doorData.triggerZone.parent) {
        GameState.scene.remove(doorData.triggerZone);
      }
    });
  }
}
