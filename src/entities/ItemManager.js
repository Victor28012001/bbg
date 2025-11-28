import { GameState } from "../core/GameState.js";

export class Item {
  constructor(mesh) {
    this.mesh = mesh;
    this.pickedUp = false;
    this.isVisible = false;
    this.name = undefined;
    this.hud = { action: "pickup the" };
    this.raycastMesh = this.computeRaycastMesh();
    this.bvh = null;
    this.consumable = false;
    this.useEffect = null;
  }

  computeRaycastMesh() {
    const bbox = new InteractionBox(this.mesh);
    bbox.rotation.copy(this.mesh.rotation);
    bbox.userData = this;
    return bbox;
  }

  async initBVH() {
    if (!this.mesh) return;

    if (this.mesh.geometry) {
      const { computeBoundsTree, disposeBoundsTree } = await import(
        "three-mesh-bvh"
      );
      this.mesh.geometry.computeBoundsTree = computeBoundsTree;
      this.mesh.geometry.disposeBoundsTree = disposeBoundsTree;
      this.mesh.geometry.computeBoundsTree();
      this.bvh = this.mesh.geometry.boundsTree;
    }
  }

  highlight() {
    const applyEmissive = (material) => {
      if (material?.emissive) {
        material.emissive.setHex(0xff0000);
      }
    };

    if (Array.isArray(this.mesh.material)) {
      this.mesh.material.forEach(applyEmissive);
    } else if (this.mesh.material) {
      applyEmissive(this.mesh.material);
    } else {
      this.mesh.children.forEach((child) => {
        if (
          child.material instanceof THREE.MeshLambertMaterial ||
          child.material instanceof THREE.MeshPhongMaterial
        ) {
          child.material.emissive.setHex(0xff0000);
        }
      });
    }
  }

  reset() {
    const resetEmissive = (material) => {
      if (material?.emissive) {
        material.emissive.setHex(0x000000);
      }
    };

    if (Array.isArray(this.mesh.material)) {
      this.mesh.material.forEach(resetEmissive);
    } else if (this.mesh.material) {
      resetEmissive(this.mesh.material);
    } else {
      this.mesh.children.forEach((child) => {
        if (
          child.material instanceof THREE.MeshLambertMaterial ||
          child.material instanceof THREE.MeshPhongMaterial
        ) {
          child.material.emissive.setHex(0x000000);
        }
      });
    }
  }

  interact(hudElement) {
    GameState.audio.play("wusch");
    this.pickedUp = true;
    this.mesh.visible = false;
    if (this.raycastMesh) this.raycastMesh.visible = false;

    // Add to player's inventory
    if (GameState.player && GameState.player.inventar) {
      const added = GameState.player.inventar.addItem(this);
      if (!added) {
        // Inventory full - don't pick up
        this.pickedUp = false;
        this.mesh.visible = true;
        return;
      }
    }

    if (typeof this.mesh.userData.customAction === "function") {
      const text = ` to toggle the <span class='highlight-item'>${this.name}</span>`;
      hudElement.show(true, text);
      this.mesh.userData.customAction();
    }

    this.raycastMesh.visible = false;

    // Show pickup notification
    const text = `Picked up <span class='highlight-item'>${this.name}</span>`;
    hudElement.show(true, text);
    // setTimeout(() => {
    //   hudElement.hide()
    // }, 1000);
  }

  // Add this method to Item class
  drop(position) {
    this.pickedUp = false;
    this.mesh.visible = true;
    if (this.raycastMesh) this.raycastMesh.visible = true;

    // Update position if provided
    if (position) {
      this.mesh.position.copy(position);
    }

    // Remove from inventory if it's there
    if (GameState.player?.inventar?.containsObject(this)) {
      GameState.player.inventar.removeItem(this);
    }
  }

  // Define what happens when item is used
  use() {
    if (this.useEffect) {
      return this.useEffect();
    }
    return false;
  }

  // Battery - increases flashlight battery life
  static createBatteryItem(mesh, chargeAmount = 25) {
    const item = new Item(mesh);
    item.name = "Battery";
    item.consumable = true;
    item.useEffect = () => {
      GameState.flashlight.battery = Math.min(
        100,
        GameState.flashlight.battery + chargeAmount
      );
      GameState.audio.play("power_up");
      return true;
    };
    return item;
  }

  // Bandages - increases energy regeneration rate temporarily
  static createBandagesItem(mesh, duration = 30000, regenBoost = 0.5) {
    const item = new Item(mesh);
    item.name = "Bandages";
    item.consumable = true;
    item.useEffect = () => {
      const originalRegenRate = GameState.playerData.energyRegenRate;
      GameState.playerData.energyRegenRate += regenBoost;
      GameState.audio.play("bandage");

      setTimeout(() => {
        GameState.playerData.energyRegenRate = originalRegenRate;
      }, duration);

      return true;
    };
    return item;
  }

  // Adrenaline - increases player speed temporarily
  static createAdrenalineItem(mesh, duration = 20000, speedBoost = 0.2) {
    const item = new Item(mesh);
    item.name = "Adrenaline Shot";
    item.consumable = true;
    item.useEffect = () => {
      const originalWalk = GameState.playerData.walkSpeed;
      const originalRun = GameState.playerData.runSpeed;
      const originalSprint = GameState.playerData.sprintSpeed;

      GameState.playerData.walkSpeed += speedBoost * 0.5;
      GameState.playerData.runSpeed += speedBoost;
      GameState.playerData.sprintSpeed += speedBoost * 1.5;
      GameState.audio.play("adrenaline");

      setTimeout(() => {
        GameState.playerData.walkSpeed = originalWalk;
        GameState.playerData.runSpeed = originalRun;
        GameState.playerData.sprintSpeed = originalSprint;
      }, duration);

      return true;
    };
    return item;
  }

  // Serum - increases health and strength
  static createSerumItem(mesh, healAmount = 40, strengthBoost = 20) {
    const item = new Item(mesh);
    item.name = "Healing Serum";
    item.consumable = true;
    item.useEffect = () => {
      // Heal player
      GameState.playerData.health = Math.min(
        100,
        GameState.playerData.health + healAmount
      );

      // Increase strength
      const originalStrength = GameState.playerData.strength;
      GameState.playerData.strength += strengthBoost;
      GameState.audio.play("serum");

      // Strength boost is permanent (or you could add timeout for temporary)
      return true;
    };
    return item;
  }

  // Blood Sample - could be used later for story progression
  static createBloodSampleItem(mesh) {
    const item = new Item(mesh);
    item.name = "Blood Sample";
    item.consumable = false; // Not consumable, used for quests
    item.useEffect = () => {
      GameState.audio.play("vial");
      return false; // Can't be consumed
    };
    return item;
  }

  // Photograph - could be used later for story progression
  static createPhotographItem(mesh) {
    const item = new Item(mesh);
    item.name = "Old Photograph";
    item.consumable = false; // Not consumable, used for quests
    item.useEffect = () => {
      GameState.audio.play("paper");
      return false; // Can't be consumed
    };
    return item;
  }

  // Map Fragment - could be used later for story progression
  static createMapFragmentItem(mesh) {
    const item = new Item(mesh);
    item.name = "Map Fragment";
    item.consumable = false; // Not consumable, used for quests
    item.useEffect = () => {
      GameState.audio.play("paper");
      return false; // Can't be consumed
    };
    return item;
  }

  static resetAllHighlights() {
    // You'll need to track all items or get them from GameState
    GameState.itemManager.getAllItems().forEach((item) => {
      if (!item.pickedUp) item.reset();
    });
  }

  getRaycastMesh() {
    return this.raycastMesh;
  }
}

export class Itemslot {
  constructor(item) {
    const temp = item.mesh.children;
    item.mesh.children = [];

    const mesh = item.mesh.clone();
    mesh.material = mesh.material.clone();
    mesh.rotation.set(0, 0, 0);
    mesh.position.set(0, 0, 0);

    item.mesh.children = temp;

    mesh.material.opacity = 0.4;
    mesh.material.transparent = true;

    this.stdMaterial = mesh.material;

    const hasItemHighlightMaterial = new THREE.MeshPhongMaterial();
    hasItemHighlightMaterial.emissive.setHex(0x005500);
    hasItemHighlightMaterial.opacity = 0.9;

    this.hasItemHighlightMaterial = this.modifyMaterial(
      this.stdMaterial.clone(),
      hasItemHighlightMaterial
    );
    this.missingItemHighlightMaterial = this.stdMaterial.clone();

    this.name = item.name;
    this.active = true;
    this.mesh = mesh;
    this.item = item;
    this.hud = { action: "insert the" };
    this.raycastMesh = this.computeRaycastMesh();
    this.effect = undefined;
  }

  modifyMaterial(current, mod) {
    if (current instanceof THREE.MultiMaterial) {
      // Handle if needed
    } else {
      current.emissive = mod.emissive;
      current.opacity = mod.opacity;
      current.transparent = mod.transparent;
    }
    return current;
  }

  computeRaycastMesh() {
    const bbox = new InteractionBox(this.mesh);
    bbox.rotation.copy(this.mesh.rotation);
    bbox.userData = this;
    return bbox;
  }

  highlight(inventar, hudElement) {
    const hasItem = inventar.containsObject(this.item, inventar);

    if (hasItem) {
      this.mesh.material = this.hasItemHighlightMaterial;
    } else {
      const innerHTML = `Press <span class='highlight-inactivekey'>[ e ]</span> to ${this.hud.action} <span class='highlight-inactive'>${this.name}</span>`;
      hudElement.setHTML(innerHTML);
      this.mesh.material = this.missingItemHighlightMaterial;
    }
  }

  reset() {
    if (this.active) {
      this.mesh.material = this.stdMaterial;
    }
  }

  animateRotation() {
    const duration = 2000;
    const startRotation = this.mesh.rotation.clone();
    const targetRotation = new THREE.Euler(0, 0, Math.PI * 2);
    const startTime = performance.now();

    const animate = () => {
      const now = performance.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const t = progress * progress * (3 - 2 * progress);

      this.mesh.rotation.x =
        startRotation.x + (targetRotation.x - startRotation.x) * t;
      this.mesh.rotation.y =
        startRotation.y + (targetRotation.y - startRotation.y) * t;
      this.mesh.rotation.z =
        startRotation.z + (targetRotation.z - startRotation.z) * t;

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }

  interact(inventar) {
    const hasItem = inventar.containsObject(this.item, inventar);
    if (!hasItem) {
      GameState.audio.play("lightswitch");
      return false;
    }

    if (this.effect) {
      const size = this.mesh.geometry.boundingSphere.radius;
      this.effect.mesh.position.copy(this.mesh.position);
      this.effect.triggerPoolEmitter(1);
    }

    inventar.removeItem(this.item);
    GameState.audio.play("harfe");
    GameState.audio.play("schlag");

    this.animateRotation();
    this.raycastMesh.visible = false;
    this.mesh.material = this.item.mesh.material;
    this.active = false;

    return true;
  }

  getRaycastMesh() {
    return this.raycastMesh;
  }
}

export class ItemPlacer {
  constructor(rooms, preloadedAssets) {
    if (!rooms || rooms.length === 0) {
      console.warn("ItemPlacer created with empty rooms array");
    }

    this.rooms = rooms;
    this.preloadedAssets = preloadedAssets;
    this.itemSpawnPoints = [];
    this.initializeSpawnPoints();
  }

  getRandomSpawnPoint() {
    const availablePoints = this.itemSpawnPoints.filter((point) => !point.used);
    if (availablePoints.length === 0) {
      console.warn("No available spawn points - reusing old ones");
      return this.itemSpawnPoints[
        Math.floor(Math.random() * this.itemSpawnPoints.length)
      ];
    }

    availablePoints.sort((a, b) => {
      const aUses = this.itemSpawnPoints.filter(
        (p) => p.room === a.room && p.used
      ).length;
      const bUses = this.itemSpawnPoints.filter(
        (p) => p.room === b.room && p.used
      ).length;
      return aUses - bUses;
    });

    const quarter = Math.max(1, Math.floor(availablePoints.length * 0.25));
    return availablePoints[Math.floor(Math.random() * quarter)];
  }

  initializeSpawnPoints() {
    // Clear existing spawn points
    GameState.itemSpawn = [];

    this.rooms.forEach((room) => {
      if (!room.isObject3D) {
        console.error("Invalid room - not a THREE.Object3D:", room);
        return;
      }

      const box = new THREE.Box3().setFromObject(room);
      const size = new THREE.Vector3();
      box.getSize(size);

      if (size.x < 2 || size.z < 2) return;

      const spawnOffsets = [
        new THREE.Vector3((-size.x / 2) * 0.7, 0, (-size.z / 2) * 0.7),
        new THREE.Vector3((size.x / 2) * 0.7, 0, (-size.z / 2) * 0.7),
        new THREE.Vector3((-size.x / 2) * 0.7, 0, (size.z / 2) * 0.7),
        new THREE.Vector3((size.x / 2) * 0.7, 0, (size.z / 2) * 0.7),
        new THREE.Vector3(0, 0, (-size.z / 2) * 0.8),
        new THREE.Vector3(0, 0, (size.z / 2) * 0.8),
      ];

      spawnOffsets.forEach((offset) => {
        const worldPos = room.position.clone().add(offset);
        worldPos.y = 1;

        const spawnPoint = {
          position: worldPos,
          room: room,
          used: false,
        };

        this.itemSpawnPoints.push(spawnPoint);

        // Store in GameState with unique ID
        GameState.itemSpawn.push({
          room: room,
          position: worldPos.clone(),
          hasItem: false,
          spawnPoint: spawnPoint, // Reference to the actual spawn point
        });
      });
    });
  }

  async placeRandomItems(count) {
    if (count <= 0) return [];

    const placedItems = [];
    const allowedInventoryItems = [
      "battery",
      "bloodSample",
      "photograph",
      "mapFragment",
      "serum",
      "adrenaline",
      "bandages",
    ];

    const itemTypes = allowedInventoryItems.filter(
      (key) => this.preloadedAssets[key] !== undefined
    );

    if (itemTypes.length === 0) {
      console.warn("No inventory items available to place");
      return [];
    }

    for (let i = 0; i < count; i++) {
      const spawnPoint = this.getRandomSpawnPoint();
      if (!spawnPoint) {
        console.warn(
          `Could only place ${placedItems.length} of ${count} items`
        );
        break;
      }

      const type = itemTypes[Math.floor(Math.random() * itemTypes.length)];
      const item = await this.createItem(type, spawnPoint.position);

      if (item) {
        placedItems.push(item);
        spawnPoint.used = true;

        // Update GameState.itemSpawn
        const gameStateEntry = GameState.itemSpawn.find(
          (entry) => entry.spawnPoint === spawnPoint
        );

        if (gameStateEntry) {
          gameStateEntry.hasItem = true;
          gameStateEntry.item = item;
        }
      }
    }

    // Debug log to verify rooms with items
    console.log(
      "Rooms with items:",
      GameState.itemSpawn
        .filter((entry) => entry.hasItem)
        .map((entry) => ({
          room: entry.room,
          position: entry.position,
        }))
    );

    return placedItems;
  }

  // async createItem(type, position) {
  //   if (!this.preloadedAssets[type]) {
  //     console.error(`Item model not found: ${type}`);
  //     return null;
  //   }

  //   const mesh = this.preloadedAssets[type].scene.clone();
  //   const item = new Item(mesh);
  //   item.name = this.getItemName(type);
  //   item.mesh.position.copy(position);

  //   // Set default scale for all items
  //   let scale = 0.05; // Default small scale

  //   // Custom scaling for specific items
  //   const scalePresets = {
  //     battery: 0.09,
  //     bloodSample: 2,
  //     photograph: 0.01,
  //     mapFragment: 0.04,
  //     serum: 0.03,
  //     adrenaline: 0.02,
  //     bandages: 1,
  //     buch: 0.02,
  //     fuse: 0.03,
  //     key: 0.03,
  //   };

  //   if (scalePresets[type]) {
  //     scale = scalePresets[type];
  //   }

  //   // Apply the scale
  //   item.mesh.scale.set(scale, scale, scale);

  //   switch (type) {
  //     case "photograph":
  //       position.y += 0.04;
  //       break;
  //     case "battery":
  //       mesh.position.y += 0.02;
  //       mesh.rotation.y = Math.PI / 2;
  //       break;
  //     case "bloodSample":
  //     case "mapFragment":
  //       mesh.position.y += 0.06;
  //       break;
  //   }

  //   await item.initBVH();
  //   return item;
  // }

  async createItem(type, position) {
    if (!this.preloadedAssets[type]) {
      console.error(`Item model not found: ${type}`);
      return null;
    }

    const mesh = this.preloadedAssets[type].scene.clone();
    let item;

    // Use specific item creators based on type
    switch (type) {
      case "battery":
        item = Item.createBatteryItem(mesh);
        break;
      case "bandages":
        item = Item.createBandagesItem(mesh);
        break;
      case "adrenaline":
        item = Item.createAdrenalineItem(mesh);
        break;
      case "serum":
        item = Item.createSerumItem(mesh);
        break;
      case "bloodSample":
        item = Item.createBloodSampleItem(mesh);
        break;
      case "photograph":
        item = Item.createPhotographItem(mesh);
        break;
      case "mapFragment":
        item = Item.createMapFragmentItem(mesh);
        break;
      default:
        item = new Item(mesh);
        item.name = this.getItemName(type);
    }

    item.mesh.position.copy(position);

    // Apply scaling (same as before)
    let scale = 0.05;
    const scalePresets = {
      battery: 0.09,
      bloodSample: 2,
      photograph: 0.01,
      mapFragment: 0.04,
      serum: 0.03,
      adrenaline: 0.02,
      bandages: 1,
      buch: 0.02,
      fuse: 0.03,
      key: 0.03,
    };

    if (scalePresets[type]) {
      scale = scalePresets[type];
    }
    item.mesh.scale.set(scale, scale, scale);

    // Position adjustments (same as before)
    switch (type) {
      case "photograph":
        position.y += 0.04;
        break;
      case "battery":
        mesh.position.y += 0.02;
        mesh.rotation.y = Math.PI / 2;
        break;
      case "bloodSample":
      case "mapFragment":
        mesh.position.y += 0.06;
        break;
    }

    await item.initBVH();
    return item;
  }

  getItemName(type) {
    const names = {
      battery: "Battery",
      bloodSample: "Blood Sample",
      photograph: "Old Photograph",
      mapFragment: "Map Fragment",
      serum: "Healing Serum",
      adrenaline: "Adrenaline Shot",
      bandages: "Bandages",
      buch: "Book",
      fuse: "Fuse",
      key: "Key",
    };
    return names[type] || type;
  }
}

export class ItemManager {
  constructor(preloaded, player, hudElement, particleGroup) {
    this.preloaded = preloaded;
    this.player = player;
    this.hudElement = hudElement;
    this.particleGroup = particleGroup;
    this.raycastMeshes = [];
    this.requiredItems = [];
    this.randomItems = [];
    this.itemPlacer = null;
  }

  async init(requiredItemTypes = [], rooms = [], randomItemCount = 0) {
    this.itemPlacer = new ItemPlacer(rooms, this.preloaded);
    GameState.required = [];

    await this._createRequiredItems(requiredItemTypes, rooms);

    if (randomItemCount > 0) {
      this.randomItems = await this.itemPlacer.placeRandomItems(
        randomItemCount
      );
      this._registerItems(this.randomItems);
    }

    await this._createInteractiveObjects();

    return {
      requiredItems: this.requiredItems,
      randomItems: this.randomItems,
    };
  }

  getPickableItems() {
    return this.getAllItems().filter((item) => !item.pickedUp);
  }

  _registerItems(items) {
    items.forEach((item) => {
      if (!item) return;
      this.raycastMeshes.push(item.getRaycastMesh());
      GameState.scene.add(item.mesh);
    });
  }

  getRaycastMeshes() {
    return this.raycastMeshes.filter((mesh) => {
      const item = this.findItemByRaycastMesh(mesh);
      return item && !item.pickedUp;
    });
  }

  findItemByRaycastMesh(mesh) {
    return this.getAllItems().find(
      (item) => item.getRaycastMesh() === mesh || item.mesh === mesh
    );
  }

  async _createRequiredItems(requiredItemTypes, rooms) {
    for (const type of requiredItemTypes) {
      const roomWithDrawer = this._findRoomWithDrawer(rooms);
      if (!roomWithDrawer) {
        console.warn("No room with drawer found for item", type);
        continue;
      }

      const position = roomWithDrawer.position;
      const item = await this._createItem(type, position);
      if (item) {
        this.requiredItems.push(item);
        this.raycastMeshes.push(item.getRaycastMesh());
        GameState.scene.add(item.mesh);

        GameState.required.push({
          room: roomWithDrawer,
          item: item,
          hasItem: true,
          itemType: type,
        });
      }
    }
  }

  _findRoomWithDrawer(rooms) {
    const roomsWithDrawers = rooms.filter((r) => r.hasDrawer);
    if (roomsWithDrawers.length === 0) return null;

    // Return random room from that list
    const index = Math.floor(Math.random() * roomsWithDrawers.length);
    return roomsWithDrawers[index];
  }

  async _createItem(type, position) {
    if (!this.preloaded[type]) {
      console.error(`Item model not found: ${type}`);
      return null;
    }

    const mesh = this.preloaded[type].scene.clone();
    const item = new Item(mesh);
    item.name = this._getItemName(type);

    const scaleFactor = 0.05;
    item.mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
    switch (type) {
      case "buch":
        item.mesh.scale.set(0.1, 0.1, 0.1);
        item.mesh.position.y += 0.5;
        break;
      case "key":
        item.mesh.scale.set(0.1, 0.1, 0.1);
        item.mesh.position.y += 0.5;
        break;
      case "fuse":
        item.mesh.position.y += 0.5;
        break;
    }

    if (position) {
      item.mesh.position.copy(position);
    } else {
      switch (type) {
        case "fuse":
          item.mesh.position.set(0, 1, 0);
          item.scale = 0.005;
          break;
        case "buch":
          item.mesh.position.set(0, 1, 0);
          item.mesh.rotation.set(0, 0, 0);
          item.scale = 0.6;
          break;
        case "key":
          item.mesh.position.set(0, 1, 0);
          item.mesh.rotation.set(0, -2.6, 0);
          item.scale = 0.05;
          break;
      }
    }

    await item.initBVH();
    return item;
  }

  _getItemName(type) {
    return this.itemPlacer.getItemName(type);
  }

  getAllItems() {
    return [...this.requiredItems, ...this.randomItems];
  }

  async _createInteractiveObjects() {
    // Initialize your interactive objects (safe, fuse box, etc.) here
    // ... existing implementation ...
  }
}

export class Inventar {
  constructor(inventoryUI) {
    this.items = [];
    this.maxSize = 8;
    this.ui = inventoryUI;
  }

  addItem(item) {
    if (!(item instanceof Item)) {
      console.error("item added is not an instance of Item", item);
      return;
    }

    if (this.items.length >= this.maxSize) {
      console.warn("Inventory is full");
      return false;
    }

    this.items.push(item);
    this.ui.update(this.items, this.maxSize);
    return true;
  }

  removeItem(item) {
    const index = this.items.indexOf(item);
    if (index > -1) {
      this.items.splice(index, 1);
      this.ui.update(this.items, this.maxSize);
      return true;
    }
    return false;
  }

  containsObject(item) {
    return this.items.includes(item);
  }

  getItem(index) {
    return this.items[index];
  }

  useItem(index) {
    if (index < 0 || index >= this.items.length) {
      console.warn(`Invalid item index: ${index}`);
      return false;
    }

    const item = this.items[index];

    // Check if item can be used
    if (!item.useEffect) {
      const text = `<span class='highlight-item-red'>${this.name}</span> cannot be used`;
      GameState.game.ui.hudElement.show(true, text);
      GameState.audio.play("error"); // Play error sound
      return false;
    }

    // Special case for non-consumable items (like quest items)
    if (!item.consumable) {
      console.log(`${item.name} is not consumable`);
      GameState.audio.play("paper"); // Play paper/vial sound for documents
      return false;
    }

    // Use the item and get the result
    const useResult = item.useEffect();

    // Only remove if consumable and use was successful
    if (useResult && item.consumable) {
      this.removeItem(item);

      // Show UI notification
      if (GameState.game.ui) {
        const text = `Used <span class='highlight-item'>${this.name}</span>`;
        GameState.game.ui.hudElement.show(true, text);
      }

      return true;
    }

    // If we get here, the item wasn't consumed
    console.log(`Failed to use ${item.name}`);
    return false;
  }
}

export class InteractionBox extends THREE.BoxHelper {
  constructor(mesh, upscale = 1.3) {
    mesh.updateMatrixWorld();
    mesh.scale.multiplyScalar(upscale);
    super(mesh);
    mesh.scale.multiplyScalar(1 / upscale);
    this.material.visible = false;
    mesh.add(this);
  }
}
