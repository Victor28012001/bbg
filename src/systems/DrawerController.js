import { GameState } from "../core/GameState";

export class DrawerController {
  constructor({ scene, gltf, room, offset, items }) {
    if (!room || !room.position) {
      throw new Error("Invalid room provided to DrawerController");
    }

    this.scene = scene;
    this.gltf = gltf;
    this.room = room;
    this.offset = offset || new THREE.Vector3();
    this.items = items || [];
    this.drawer = null;
    this.tooltipElement = null;
    this.mobileButton = null;
    this.playerInTrigger = false;
    this.isMobile = GameState.game?.controlsSystem?.isMobile || false;
    this.currentDrawer = null;
    this.tempVec = new THREE.Vector3();
    this.triggerDistance = 3;
    this.debug = false;

    this.initDrawer();
    this.createTooltip();
    this.createMobileButton();
    this.handleKeyPress = this.handleKeyPress.bind(this);
    document.addEventListener("keydown", this.handleKeyPress);
  }

  initDrawer() {
    if (!this.gltf?.scene) {
      throw new Error("Missing drawer GLTF model");
    }

    const drawerClone = this.gltf.scene.clone(true);
    const animations = this.gltf.animations || [];
    drawerClone.name = "Drawer";

    // Position the drawer
    drawerClone.position.copy(this.room.position).add(this.offset);
    drawerClone.rotation.set(0, 0, 0);
    drawerClone.scale.set(0.5, 0.5, 0.5);
    drawerClone.position.x += 0.3;

    // Set up animation
    const clip = animations[0];
    const mixer = new THREE.AnimationMixer(drawerClone);
    const action = clip ? mixer.clipAction(clip) : null;

    if (action) {
      action.clampWhenFinished = true;
      action.setLoop(THREE.LoopOnce);
    }

    // Create trigger zone like DoorController
    const triggerMaterial = new THREE.MeshBasicMaterial({
      visible: this.debug, // Only visible in debug mode
      wireframe: true,
      transparent: true,
      opacity: 0.3,
      color: 0xff0000,
    });
    const triggerGeometry = new THREE.CircleGeometry(
      this.triggerDistance,
      32,
      0,
      Math.PI
    ); // Half circle
    const triggerZone = new THREE.Mesh(triggerGeometry, triggerMaterial);
    triggerZone.rotation.x = -Math.PI / 2;
    triggerZone.rotation.z = -Math.PI / 2; // Rotate to face forward
    triggerZone.position.copy(drawerClone.position);
    triggerZone.name = "DrawerTriggerZone";
    triggerZone.userData.isTriggerZone = true;
    this.scene.add(triggerZone);

    // Find the drawer mesh for collision
    let drawerMesh = null;
    drawerClone.traverse((child) => {
      if (child.isMesh && child.name.toLowerCase().includes("drawer")) {
        drawerMesh = child;
      }
    });

    this.drawer = {
      object: drawerClone,
      mixer,
      action,
      isOpen: false,
      clipDuration: clip?.duration || 0,
      triggerZone,
      drawerMesh,
      playerInRange: false,
      openTime: 1.51, // Specific time to stop for open animation
    };

    this.scene.add(drawerClone);
    this.positionItems();
  }

  createMobileButton() {
    if (this.mobileButton) {
      this.mobileButton.removeEventListener(
        "click",
        this.handleMobileButtonClick
      );
      if (this.mobileButton.parentNode) {
        this.mobileButton.parentNode.removeChild(this.mobileButton);
      }
    }

    this.mobileButton = GameState.game.ui.createActionButton("drawer", "Open");
    this.mobileButton.id = "mobile-drawer-btn";
    this.mobileButton.style.display = "none";

    this.handleMobileButtonClick = this.handleMobileButtonClick.bind(this);
    this.mobileButton.addEventListener("click", this.handleMobileButtonClick);

    const container =
      document.getElementById("mobile-action-buttons") || document.body;
    container.appendChild(this.mobileButton);
  }

  handleMobileButtonClick(e) {
    e.preventDefault();
    if (
      this.playerInTrigger &&
      this.currentDrawer &&
      !this.currentDrawer.isOpen
    ) {
      this.interact();
    }
  }

  positionItems() {
    if (!this.drawer?.object || !this.items) return;

    this.items.forEach((itemSpawn, index) => {
      if (!itemSpawn?.item?.mesh) return;

      const itemX = index * 0.3 - this.items.length * 0.15;
      const itemPosition = new THREE.Vector3(
        this.drawer.object.position.x + itemX,
        this.drawer.object.position.y + 0.2,
        this.drawer.object.position.z
      );

      itemSpawn.item.mesh.position.copy(itemPosition);
      itemSpawn.item.mesh.position.z += 0.2;
      itemSpawn.item.mesh.position.y += 1.1;
      itemSpawn.item.mesh.position.x += 0.8;

      // Make items invisible initially
      itemSpawn.item.mesh.visible = false;
    });
  }

  update(delta) {
    if (!GameState.controls || !this.drawer?.object) {
      this.hideTooltip();
      return;
    }

    const player = this.isMobile
      ? GameState.camera
      : GameState.controls.getObject();
    if (!player?.position) {
      this.hideTooltip();
      return;
    }

    // Update animation mixer
    if (this.drawer.mixer) {
      this.drawer.mixer.update(delta);
    }

    // Calculate distance to drawer trigger zone
    this.drawer.triggerZone.updateMatrixWorld(true);
    this.drawer.triggerZone.getWorldPosition(this.tempVec);

    const dx = player.position.x - this.tempVec.x;
    const dz = player.position.z - this.tempVec.z;
    const distanceXZ = Math.sqrt(dx * dx + dz * dz);
    this.drawer.playerInRange = distanceXZ < this.triggerDistance;

    // Update interaction state based on trigger zone
    if (this.drawer.playerInRange && !this.drawer.isOpen) {
      this.currentDrawer = this.drawer;
      this.playerInTrigger = true;
      this.showTooltip();
    } else {
      if (this.currentDrawer === this.drawer) {
        this.currentDrawer = null;
        this.playerInTrigger = false;
        this.hideTooltip();
      }
    }

    // Auto-close when player moves away
    if (!this.drawer.playerInRange && this.drawer.isOpen) {
      this.closeDrawer(this.drawer);
    }

    // Debug visualization
    if (this.debug && this.isMobile) {
      this.mobileButton.style.border = this.playerInTrigger
        ? "2px solid green"
        : "2px solid red";
    }
  }

  interact() {
    if (!this.currentDrawer || this.currentDrawer.isOpen) return;

    this.openDrawer(this.currentDrawer);
  }

  openDrawer(drawerData) {
    const { action, mixer, openTime } = drawerData;

    if (!action) return;

    action.reset();
    action.time = 0;
    action.setLoop(THREE.LoopOnce);
    action.timeScale = 1;
    action.play();

    // Pause at 1.51 seconds for open
    setTimeout(() => {
      action.paused = true;
      action.time = openTime;
      mixer.update(0);

      // Show items when drawer is opened
      this.items.forEach((itemSpawn) => {
        if (itemSpawn?.item) {
          const shouldShow = !itemSpawn.item.pickedUp;
          itemSpawn.item.mesh.visible = shouldShow;
          if (itemSpawn.item.raycastMesh) {
            itemSpawn.item.raycastMesh.visible = shouldShow;
            itemSpawn.item.isVisible = true;
          }
        }
      });
    }, openTime * 1000);

    drawerData.isOpen = true;
    this.hideTooltip();

    // Disable collision when open
    if (drawerData.drawerMesh) {
      drawerData.drawerMesh.userData.ignoreCollision = true;
    }
  }

  closeDrawer(drawerData) {
    const { action, openTime, drawerMesh } = drawerData;

    if (!action) return;

    action.paused = false;
    action.reset();
    action.time = openTime;
    action.setLoop(THREE.LoopOnce);
    action.timeScale = -1;
    action.play();

    // Hide items when drawer starts closing
    this.items.forEach((itemSpawn) => {
      if (itemSpawn?.item?.mesh) {
        itemSpawn.item.mesh.visible = false;
        itemSpawn.item.isVisible = false;
      }
    });

    drawerData.isOpen = false;

    // Re-enable collision when closed
    if (drawerMesh) {
      drawerMesh.userData.ignoreCollision = false;
    }
  }

  createTooltip() {
    this.tooltipElement = document.createElement("div");
    this.tooltipElement.className = "drawer-tooltip";
    this.tooltipElement.innerHTML = "Press O to open drawer";
    this.tooltipElement.style.position = "absolute";
    this.tooltipElement.style.display = "none";
    this.tooltipElement.style.zIndex = "1000";
    document.body.appendChild(this.tooltipElement);
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
      this.currentDrawer &&
      !this.currentDrawer.isOpen
    ) {
      this.interact();
    }
  }

  cleanup() {
    document.removeEventListener("keydown", this.handleKeyPress);

    if (this.mobileButton) {
      this.mobileButton.removeEventListener(
        "click",
        this.handleMobileButtonClick
      );
      if (this.mobileButton.parentNode) {
        this.mobileButton.parentNode.removeChild(this.mobileButton);
      }
    }

    if (this.tooltipElement?.parentNode) {
      this.tooltipElement.parentNode.removeChild(this.tooltipElement);
    }

    if (this.drawer?.triggerZone?.parent) {
      this.scene.remove(this.drawer.triggerZone);
    }
  }
}
