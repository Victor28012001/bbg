// scenes/DynamicLevelScene.js
import { GameScene } from "./GameScene.js";
import { GameState } from "../core/GameState.js";
import { DoorController } from "../systems/DoorController.js";
import { RakeManager } from "../systems/RakeManager.js";
import { KeypadController } from "../systems/keypadController.js";
import { Player } from "../entities/Player.js";
import { SpiderManager } from "../systems/SpiderManager.js";
import { updateBullets } from "../utils/utils.js";
import { DrawerController } from "../systems/DrawerController.js";
import { ItemManager, Inventar } from "../entities/ItemManager.js";

export class DynamicLevelScene extends GameScene {
  constructor(game, levelIndex, context) {
    super(game, levelIndex);
    this.name = `level_${levelIndex}`;
    this.levelCode = game.levelManager.getLevelCode(levelIndex);
    this.buildingClones = [];
    this.brokenTables = [];
    this.doorControllers = [];
    this.drawerControllers = [];
    this.shelves = [];
    this.drawerController = null;
    this.drawers = [];
    this.spiderManager = null;
    this.calendarRoom = null;
    this.calendarRoomHelper = null;
    this.parTime = 300000;

    // Store music context from cutscene
    this.musicContext = context;
    this.debugMode = true;
    this.isMobile = GameState.game.controlsSystem.isMobile;
  }

  async init() {
    console.log(`Initializing level ${this.levelIndex}`);
    try {
      await super.init();

      // Initialize player if not already exists
      if (!GameState.player) {
        GameState.player = new Player();
        GameState.player.inventar = new Inventar();
      }

      // Check if we're coming from a cutscene
      if (this.context?.cutsceneFinished !== undefined) {
        this.game.cutsceneFinished = this.context.cutsceneFinished;
      } else {
        this.game.cutsceneFinished = true;
      }

      // Verify preloaded assets exist
      if (!GameState.preloadedAssets) {
        throw new Error("Preloaded assets not available");
      }

      // If we have music from cutscene, ensure it keeps playing
      if (this.musicContext?.musicId && this.musicContext?.musicPath) {
        // Check if the music is already playing
        if (!this.game.audio.isPlaying(this.musicContext.musicId)) {
          await this.game.audio.load(
            this.musicContext.musicId,
            this.musicContext.musicPath
          );
          this.game.audio.play(this.musicContext.musicId, 0.5, true);
        }
      }

      await this.loadResources();
      await this.buildLevel();

      await this.setupPlayer();
      await this.setupSpiders();

      this.player = this.isMobile
        ? GameState.camera
        : GameState.controls.getObject();
      this.playerPosition = this.player.position;

      // Only start game loop if cutscene is finished or we're resetting
      if (this.game.cutsceneFinished || this.game.isResetting) {
        this.game.startGameLoop();
        GameState.shotsFired = 0;
        GameState.shotsHit = 0;
        GameState.enemiesDefeated = 0;
        GameState.gameStartTime = performance.now();
      }

      console.log(`Level ${this.levelIndex} initialized successfully`);
    } catch (error) {
      console.error(`Level ${this.levelIndex} initialization failed:`, {
        error: error.message,
        stack: error.stack,
        levelData: this.levelData,
      });

      throw error;
    }
  }

  async loadResources() {
    try {
      // Get all models from preloaded assets
      this.calendarGLB = GameState.preloadedAssets.calendar;
      this.doorGLB = GameState.preloadedAssets.door;
      this.brokenTableGLB = GameState.preloadedAssets.table;
      this.elevatorGLB = GameState.preloadedAssets.elevator;
      this.keypadGLB = GameState.preloadedAssets.keypad;
      this.drawersGLB = GameState.preloadedAssets.drawers;
      this.shelfGLB = GameState.preloadedAssets.shelf;

      if (
        !this.calendarGLB ||
        !this.doorGLB ||
        !this.brokenTableGLB ||
        !this.elevatorGLB ||
        !this.keypadGLB ||
        !this.drawersGLB ||
        !this.shelfGLB
      ) {
        throw new Error("Missing required preloaded assets");
      }

      await this.generateCalendarTexture();
    } catch (error) {
      console.error("Failed to load level resources:", error);
      throw error;
    }
  }

  async generateCalendarTexture() {
    // Implementation from original LevelManager
    const canvasWidth = 1024;
    const canvasHeight = 768;
    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const code = this.game.levelManager.calendarCodes[this.levelIndex];
    const markedDates = [
      { month: code[0] - 1, day: code[0] },
      { month: code[1] - 1, day: code[1] },
      { month: code[2] - 1, day: code[2] },
      { month: code[3] - 1, day: code[3] },
    ];

    // Draw calendar title
    ctx.fillStyle = "#333";
    ctx.font = "bold 48px Arial";
    ctx.textAlign = "center";
    ctx.fillText("2024 Calendar", canvas.width / 2, 60);

    // Draw calendar grid
    const monthWidth = canvas.width / 5;
    const monthHeight = (canvas.height - 80) / 3;
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    for (let m = 0; m < 12; m++) {
      const col = m % 4;
      const row = Math.floor(m / 4);
      const x = col * monthWidth + 20;
      const y = row * monthHeight + 80;

      ctx.fillStyle = "#444";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "left";
      ctx.fillText(months[m], x, y);

      const dayNames = ["S", "M", "T", "W", "T", "F", "S"];
      for (let d = 0; d < 7; d++) {
        ctx.fillStyle = "#666";
        ctx.font = "7px Arial";
        ctx.fillText(dayNames[d], x + d * 25, y + 30);
      }

      let firstDay = new Date(2024, m, 1).getDay();
      let date = 1;

      for (let week = 0; week < 6 && date <= daysInMonth[m]; week++) {
        for (let day = 0; day < 7 && date <= daysInMonth[m]; day++) {
          if (week === 0 && day < firstDay) continue;

          const isMarked = markedDates.some(
            (md) => md.month === m && md.day === date
          );

          if (isMarked) {
            ctx.fillStyle = "#ff0000";
            ctx.beginPath();
            ctx.arc(x + day * 25 + 10, y + week * 25 + 50, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#fff";
          } else {
            ctx.fillStyle = "#000";
          }

          ctx.font = "7px Arial";
          ctx.textAlign = "center";
          ctx.fillText(date.toString(), x + day * 25 + 10, y + week * 25 + 55);
          date++;
        }
      }

      ctx.strokeStyle = "#ddd";
      ctx.strokeRect(x, y - 30, monthWidth - 40, monthHeight - 20);
    }

    ctx.fillStyle = "#000";
    ctx.font = "bold 18px Arial";
    ctx.textAlign = "right";
    ctx.fillText(
      `Level ${this.levelIndex + 1}`,
      canvas.width - 20,
      canvas.height - 20
    );

    this.calendarTexture = new THREE.CanvasTexture(canvas);
    this.calendarTexture.flipY = false;
  }

  async buildLevel() {
    const objects = this.levelData.objects;
    this.buildingClones = [];
    const calendarRoomIndex = Math.floor(objects.length / 2);
    this.debugMarkers = [];

    for (let i = 0; i < objects.length; i++) {
      const box = objects[i];
      // console.log(box);
      const room = this.createRoom(box);

      if (i === calendarRoomIndex) {
        this.addCalendarToRoom(room);
        this.calendarRoom = room;
        this.addCalendarRoomHelper(room);
      }

      this.addBrokenTable(room);
      this.addDoorController(room);
    }

    // Mark drawer rooms (but don't add them yet)
    for (const room of this.buildingClones) {
      if (room !== this.calendarRoom && Math.random() < 0.2) {
        room.hasDrawer = true;
      }
    }

    // Wait for ItemManager to place items into GameState.required
    await this.initializeItems();

    // Now loop again, and add drawers *after* GameState.required is filled
    for (const room of this.buildingClones) {
      this.addShelves(room);

      if (room.hasDrawer) {
        this.addDrawerController(room);
      }
    }

    this.markRoomsWithItems();

    await this.setupElevator();
    await this.setupRakes();
  }

  async initializeItems() {
    if (!this.buildingClones || this.buildingClones.length === 0) {
      throw new Error("Cannot place items - no rooms available");
    }

    this.itemManager = new ItemManager(
      GameState.preloadedAssets,
      GameState.player,
      this.game.ui.hudElement,
      this.particleGroup
    );

    // Store in GameState for global access
    GameState.itemManager = this.itemManager;

    const { requiredItems, randomItems } = await this.itemManager.init(
      ["buch", "fuse", "key"],
      this.buildingClones,
      8 // Number of random items
    );

    // Verify initialization
    console.assert(
      GameState.itemManager.getRaycastMeshes().length > 0,
      "No raycast meshes registered"
    );

    this.requiredItems = requiredItems;
    this.randomItems = randomItems;
    this.inventar = new Inventar(GameState.inventary);

    // Add this line to log positions after placement
    this.logItemPositions();
  }

  markRoomsWithItems() {
    // Clear existing markers
    this.clearDebugMarkers();

    // Create a map of rooms to their items
    const roomItemMap = new Map();

    // Process required items
    this.requiredItems.forEach((item) => {
      const room = this.findItemRoom(item.mesh.position);
      if (room) {
        if (!roomItemMap.has(room)) roomItemMap.set(room, []);
        roomItemMap.get(room).push(item);
      }
    });

    // Process random items
    this.randomItems.forEach((item) => {
      const room = this.findItemRoom(item.mesh.position);
      if (room) {
        if (!roomItemMap.has(room)) roomItemMap.set(room, []);
        roomItemMap.get(room).push(item);
      }
    });

    // Create visual markers for each room with items
    roomItemMap.forEach((items, room) => {
      this.addRoomMarker(room, items);
    });
  }

  findItemRoom(itemPosition) {
    // Find which room contains this item
    return this.buildingClones.find((room) => {
      const roomBox = new THREE.Box3().setFromObject(room);
      return roomBox.containsPoint(itemPosition);
    });
  }

  addRoomMarker(room, items) {
    // Create a floating indicator above the room
    const roomBox = new THREE.Box3().setFromObject(room);
    const center = new THREE.Vector3();
    roomBox.getCenter(center);
    center.y += 3; // Position above the room

    // Create marker geometry
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.7,
      })
    );
    marker.position.copy(center);
    marker.name = "ItemRoomMarker";

    // Add text label showing item count
    const itemCount = items.length;
    const text = this.createTextLabel(`Items: ${itemCount}`);
    text.position.set(center.x, center.y + 1, center.z);
    text.name = "ItemCountLabel";

    // Store references for cleanup
    this.debugMarkers.push(marker, text);
    this.add(marker);
    this.add(text);
  }

  createTextLabel(content) {
    // Create a 2D canvas for text
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const context = canvas.getContext("2d");

    // Draw text
    context.fillStyle = "rgba(0, 0, 0, 0.7)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = "Bold 40px Arial";
    context.fillStyle = "white";
    context.textAlign = "center";
    context.fillText(content, canvas.width / 2, canvas.height / 2 + 15);

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);

    // Create sprite with texture
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2, 1, 1);

    return sprite;
  }

  clearDebugMarkers() {
    // Remove all existing debug markers
    this.debugMarkers.forEach((marker) => {
      if (marker.parent) {
        marker.parent.remove(marker);
      }
      // Dispose of materials and geometries
      if (marker.material) marker.material.dispose();
      if (marker.geometry) marker.geometry.dispose();
    });
    this.debugMarkers = [];
  }

  logItemPositions() {
    console.group("Item Positions Debug");

    // Log required items
    console.groupCollapsed("Required Items");
    this.requiredItems.forEach((item, index) => {
      console.log(
        `%c${item.name || "Unnamed Item"} ${index + 1}:`,
        "color: #4CAF50; font-weight: bold;",
        `Y Position: ${item.mesh.position.y.toFixed(2)}`,
        item.mesh.position
      );
    });
    console.groupEnd();

    // Log random items
    console.groupCollapsed("Random Items");
    this.randomItems.forEach((item, index) => {
      console.log(
        `%c${item.name || "Unnamed Item"} ${index + 1}:`,
        "color: #2196F3; font-weight: bold;",
        `Y Position: ${item.mesh.position.y.toFixed(2)}`,
        item.mesh.position
      );
    });
    console.groupEnd();

    console.groupEnd();
  }

  addCalendarRoomHelper(room) {
    // Create a box helper for visualization (same as in LevelManager)
    const helper = new THREE.BoxHelper(room, 0x00ff00);
    helper.name = "CalendarRoomHelper";
    this.add(helper);
    this.calendarRoomHelper = helper;

    console.log("Calendar room debug helper added at position:", room.position);
  }

  createRoom(positionArray) {
    if (!GameState.abandonedBuilding) {
      throw new Error("Abandoned building not initialized - check preloading");
    }

    const position = new THREE.Vector3(
      positionArray[0] * GameState.gridScale,
      positionArray[1] * GameState.gridScale,
      positionArray[2] * GameState.gridScale
    );

    const room = GameState.abandonedBuilding.clone(true);
    room.position.copy(position);
    // if (position.z === 100) {
    //   room.rotation.y = Math.PI;
    // }

    // Calculate bounding box for the room
    const box = new THREE.Box3().setFromObject(room);

    // Store room dimensions (using your predefined room dimensions)
    room.userData = {
      bounds: box,
      dimensions: {
        width: GameState.roomWidth,
        height: GameState.wallHeight,
        depth: GameState.roomDepth,
      },
    };

    this.add(room);
    this.buildingClones.push(room);
    GameState.buildingClones = this.buildingClones;

    return room;
  }

  getCurrentRoom(playerPosition) {
    if (
      !this.buildingClones ||
      this.buildingClones.length === 0 ||
      !playerPosition
    ) {
      return null;
    }

    for (const room of this.buildingClones) {
      if (!room.userData?.bounds) continue;

      try {
        if (room.userData.bounds.containsPoint(playerPosition)) {
          return room;
        }
      } catch (error) {
        console.error("Room bounds check failed:", error, {
          room,
          playerPosition,
        });
        continue;
      }
    }
    return null;
  }

  addCalendarToRoom(room) {
    if (!this.calendarGLB || !this.calendarTexture) return;

    if (GameState.calendar) {
      GameState.scene.remove(GameState.calendar);
    }

    const calendar = this.calendarGLB.scene.clone();
    calendar.scale.set(0.3, 0.3, 0.3);

    const wallOffset = new THREE.Vector3(
      -GameState.roomWidth / 2 + 0.1,
      2.2,
      0
    );

    calendar.position.copy(room.position).add(wallOffset);
    calendar.rotation.set(0, Math.PI / 2, 0);

    calendar.traverse((child) => {
      if (child.isMesh && child.material) {
        this.calendarTexture.rotation = Math.PI / 2; // Rotate texture 90 degrees
        this.calendarTexture.center.set(0.5, 0.5); // Set rotation center
        this.calendarTexture.flipY = false;
        this.calendarTexture.needsUpdate = true;

        child.material.map = this.calendarTexture;
        child.material.needsUpdate = true;
      }
    });

    room.add(calendar);
    GameState.calendar = calendar;
    room.userData.calendar = calendar;
  }

  addBrokenTable(room) {
    const tableClone = this.brokenTableGLB.scene.clone(true);
    const tableOffset = new THREE.Vector3(
      -GameState.roomWidth / 2 + 4,
      0,
      -GameState.roomDepth / 2 + 4
    );
    tableClone.position.copy(room.position.clone().add(tableOffset));
    tableClone.scale.set(1.5, 1.5, 1.5);
    tableClone.rotation.y = Math.PI / 4;
    this.add(tableClone);
    this.brokenTables.push(tableClone);
  }

  addShelves(room) {
    // Check if this room has any items in GameState.itemSpawn
    const roomHasItems = GameState.itemSpawn.some(
      (spawn) => spawn.room === room && spawn.hasItem
    );

    const roomItems = GameState.itemSpawn.filter(
      (spawn) => spawn.room === room && spawn.hasItem
    );

    if (!roomHasItems) {
      return; // Skip rooms without items
    }

    const shelfClone = this.shelfGLB.scene.clone(true);
    const shelfOffset = new THREE.Vector3(
      -GameState.roomWidth / 2 + 0.4,
      1.4,
      0
    );
    shelfClone.position.copy(room.position.clone().add(shelfOffset));
    shelfClone.scale.set(0.005, 0.006, 0.01);
    this.add(shelfClone);
    this.shelves.push(shelfClone);

    // Position items on the shelf
    roomItems.forEach((itemSpawn, index) => {
      if (!itemSpawn.item) return;

      // Calculate position on shelf (spread items across the shelf)
      const itemX = index * 0.3 - roomItems.length * 0.15;
      const itemPosition = new THREE.Vector3(
        shelfClone.position.x + itemX,
        shelfClone.position.y + 0.2, // Slightly above shelf
        shelfClone.position.z
      );

      itemSpawn.item.mesh.position.copy(itemPosition);

      // Rotate items to lay flat on shelf
      if (
        itemSpawn.item.name.includes("Photograph") ||
        itemSpawn.item.name.includes("Map")
      ) {
        itemSpawn.item.mesh.rotation.set(0, 0, 0);
      } else if (itemSpawn.item.name.includes("Adrenaline")) {
        itemSpawn.item.mesh.rotation.set(0, 0, Math.PI / 2);
        itemSpawn.item.mesh.position.y += 0.05; // Slightly above shelf
      } else {
        itemSpawn.item.mesh.rotation.set(0, 0, 0);
      }
    });
  }

  addDoorController(room) {
    const controller = new DoorController({
      targetParent: room,
      loader: this.loader,
      gltf: this.doorGLB,
      offset: new THREE.Vector3(0, 0, 4.47),
      rotationY: Math.PI,
      triggerDistance: 2.5,
    });
    room.userData.doorController = controller;
    this.doorControllers.push(controller);
  }

  addDrawerController(room) {
    // Ensure drawerControllers array exists
    if (!Array.isArray(this.drawerControllers)) {
      this.drawerControllers = [];
    }

    if (!room || !room.position) {
      console.error("Cannot add drawer to invalid room");
      return null;
    }

    const roomHasItems =
      GameState.required?.some(
        (spawn) => spawn.room?.uuid === room.uuid && spawn.hasItem
      ) || false;

    const roomItems =
      GameState.required?.filter(
        (spawn) => spawn.room?.uuid === room.uuid && spawn.hasItem
      ) || [];

    if (!roomHasItems || roomItems.length === 0) {
      return null;
    }

    try {
      const controller = new DrawerController({
        scene: this,
        gltf: this.drawersGLB,
        room: room,
        offset: new THREE.Vector3(-GameState.roomWidth / 2 + 0.2, 0, -1),
        items: roomItems,
      });

      room.userData.drawerController = controller;
      this.drawerControllers.push(controller);
      return controller;
    } catch (error) {
      console.error("Failed to create drawer controller:", error);
      return null;
    }
  }

  async setupElevator() {
    const elevator = this.elevatorGLB.scene;
    elevator.position.set(
      -GameState.halfGridSize + 2.01,
      -0.5,
      -GameState.halfGridSize + 1.99
    );
    this.add(elevator);
    const box = new THREE.Box3().setFromObject(elevator);
    GameState.elevatorBox = box;
    this.add(elevator);

    // Create entry zone
    const entryZoneSize = new THREE.Vector3(2, 6, 5);
    const entryZoneGeometry = new THREE.BoxGeometry(
      entryZoneSize.x,
      entryZoneSize.y,
      entryZoneSize.z
    );
    const entryZoneMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.3,
      visible: false,
    });

    GameState.elevatorEntryZone = new THREE.Mesh(
      entryZoneGeometry,
      entryZoneMaterial
    );
    GameState.elevatorEntryZone.position
      .copy(elevator.position)
      .add(new THREE.Vector3(0, 1, 2)); // Position in front of elevator
    // GameState.elevatorEntryZone.visible = false;
    this.add(GameState.elevatorEntryZone);

    // Store animations in GameState
    GameState.elevator = {
      model: elevator,
      animations: this.elevatorGLB.animations,
      mixer: null,
      opened: false,
      entryZoneBox: new THREE.Box3().setFromObject(GameState.elevatorEntryZone),
    };

    // Initialize KeypadController with preloaded keypad model
    this.keypadController = new KeypadController({
      scene: this,
      elevator: {
        model: elevator,
        animations: this.elevatorGLB.animations,
        entryZone: this.elevatorEntryZone,
      },
      keypadModel: this.keypadGLB.scene, // Pass the loaded model
      triggerDistance: 3.0,
      levelCode: this.levelCode,
    });
  }

  async setupRakes() {
    try {
      if (!GameState.preloadedAssets.rake) {
        throw new Error("Rake model not preloaded");
      }

      this.rakeManager = new RakeManager(
        this,
        GameState.preloadedAssets.rake,
        GameState.audio
      );

      this.rakeManager.spawnRakes();
    } catch (error) {
      console.error("Rake initialization failed:", error);
      // Continue without rakes
      this.game.ui.showWarning(
        "Monster AI Disabled",
        "Could not initialize monster behavior"
      );

      // Create empty rake manager to prevent null references
      this.rakeManager = {
        update: () => {},
        cleanup: () => {},
        rakes: [],
      };
    }
  }

  async setupSpiders() {
    console.log("setting up spider");
    try {
      this.spiderManager = new SpiderManager(
        this,
        GameState.preloadedAssets.spider,
        GameState.audio // Add audio manager parameter
      );
      console.log("spider loaded");
      this.spiderManager.spawnSpiders();
      console.log("spider spawned");
    } catch (error) {
      console.error("Spider initialization failed:", error);
      this.spiderManager = {
        update: () => {},
        cleanup: () => {},
        spiders: [],
      };
    }
  }

  async setupPlayer() {
    try {
      if (
        !GameState.preloadedAssets.player ||
        !GameState.preloadedAssets.player1
      ) {
        throw new Error("Player models not preloaded");
      }

      if (!GameState.player) {
        GameState.player = new Player();
      }

      if (!GameState.controls && this.game.controls) {
        GameState.controls = this.game.controls;
        GameState.player.controls = GameState.controls;
      }

      // Load both weapon models (and store in GameState)
      await GameState.player.loadModel(
        GameState.preloadedAssets.player1,
        "knife"
      );
      await GameState.player.loadModel(GameState.preloadedAssets.player, "gun");

      // Start with gun equipped
      GameState.currentWeapon = "gun";
      GameState.player.addToScene("gun");

      console.log("Player initialized with both weapons");
    } catch (error) {
      console.error("Player setup failed:", error);
      throw error;
    }
  }

  async handleLevelCompletion() {
    if (this._isCompleting) return;
    this._isCompleting = true;

    try {
      this.game.ui.showGameWonPopup();

      const xpEarned = 100 * (this.levelIndex + 1);
      const timeTaken = performance.now() - GameState.gameStartTime;
      const accuracy = this.calculateAccuracy();
      const killCount = GameState.enemiesDefeated || 0;

      const profile = GameState.playerProfile?.currentProfile;

      if (profile) {
        await GameState.playerProfile.updateXP(xpEarned);

        const achievements = this.generateAchievements({
          timeTaken,
          accuracy,
          killCount,
        });

        for (const achievement of achievements) {
          try {
            await GameState.playerProfile.addAchievement(achievement);
          } catch (error) {
            console.error(
              `❌ Failed to add achievement: ${achievement.name}`,
              error
            );
          }
        }

        this.updatePlayerStats();
      }

      await this.finishLevelFlow();
    } catch (error) {
      console.error("Level completion failed:", error);
      await this.game.sceneManager.switchTo("mainMenu");
    } finally {
      this._isCompleting = false;
    }
  }

  generateAchievements({ timeTaken, accuracy, killCount }) {
    const level = this.levelIndex + 1;
    const now = new Date().toISOString();
    const achievements = [];

    const pushAchievement = (index, name, description) => {
      achievements.push({ index, name, description, timestamp: now });
    };

    // Level Completion (indexes 6 - 13)
    pushAchievement(
      5 + level,
      `Level ${level} Completed`,
      `Completed level ${level}`
    );

    // Time-based
    if (timeTaken < this.parTime)
      pushAchievement(
        1,
        `Speed Runner`,
        `Completed level ${level} under par time`
      );

    // Health
    if (GameState.playerData.health >= 80)
      pushAchievement(
        2,
        `Flawless Victory`,
        `Completed level ${level} with high health`
      );

    // Energy
    if (GameState.playerData.energy > 50)
      pushAchievement(
        3,
        `Energy Efficient`,
        `Completed level ${level} with high energy`
      );

    // Accuracy
    if (accuracy > 0.8)
      pushAchievement(
        4,
        `Sharpshooter`,
        `High accuracy (${Math.round(accuracy * 100)}%) in level ${level}`
      );

    // Pacifist
    if (killCount < 5)
      pushAchievement(
        5,
        `Pacifist`,
        `Completed level ${level} with minimal kills (${killCount})`
      );

    // Game Completed
    if (level >= this.game.levelManager.totalLevels)
      pushAchievement(0, `Game Completed`, `Completed all levels`);

    return achievements;
  }

  async finishLevelFlow() {
    const nextLevel = this.levelIndex + 1;
    this.game.unlockNextLevel();

    GameState.player.isCompleted = false;
    this.game.cutsceneFinished = false;
    await this.cleanup();
    this.game.resetLevelState();
    await this.game.ensureControls();

    if (nextLevel < this.game.levelManager.totalLevels) {
      await this.game.sceneManager.switchTo("loading");
      await this.game.startLevelWithCutscene(nextLevel);
    } else {
      await this.game.sceneManager.switchTo("mainMenu");
    }
  }

  calculateAccuracy() {
    const shotsFired = GameState.shotsFired || 1; // Avoid division by zero
    const shotsHit = GameState.shotsHit || 0;
    return shotsHit / shotsFired;
  }

  updatePlayerStats() {
    const stats = GameState.playerProfile.getPlayerStats();

    GameState.playerData.walkSpeed = stats.walkSpeed;
    GameState.playerData.runSpeed = stats.runSpeed;
    GameState.playerData.sprintSpeed = stats.sprintSpeed;

    GameState.playerData.energyDrainRate = stats.energyDrainRate;
    GameState.playerData.energyRegenRate = stats.energyRegenRate;
    GameState.playerData.energy = Math.min(
      GameState.playerData.energy,
      stats.energy
    );

    const baseHealth =
      100 + (GameState.playerProfile.currentProfile.stats.healthBoost - 10);
    const healthPercent = GameState.playerData.health / baseHealth;
    GameState.playerData.health = Math.floor(stats.health * healthPercent);

    GameState.playerData.damageMultiplier = stats.damageMultiplier;
    GameState.playerData.strength = stats.strength;
  }

  handleRaycastIntersection() {
    // Early exit checks - now properly checks ItemManager
    if (
      !GameState.controls ||
      !GameState.raycaster ||
      !GameState.camera ||
      !GameState.itemManager
    ) {
      return;
    }

    try {
      // Use ItemManager's raycast meshes
      const raycastMeshes = GameState.itemManager.getRaycastMeshes();
      if (!raycastMeshes || raycastMeshes.length === 0) return;

      GameState.raycaster.setFromCamera(
        new THREE.Vector2(0, 0),
        GameState.camera
      );

      const intersects = GameState.raycaster.intersectObjects(
        raycastMeshes,
        true
      );

      if (intersects.length > 0) {
        const intersectedObject = intersects[0].object;

        // Find the item using ItemManager's data
        const item = this.findItemByRaycastMesh(intersectedObject);
        if (!["Book", "Fuse", "Key"].includes(item.name)) {
          item.isVisible = true;
        }

        if (item && !item.pickedUp && item.isVisible) {
          item.highlight();
          GameState.game.ui.hudElement.show(
            true,
            `Press [E] to pickup <span class='highlight-item'>${item.name}</span>`
          );

          if (GameState.input === "KeyE" || GameState.input === "Keye") {
            item.interact(GameState.game.ui.hudElement);
            GameState.input = "";
          }
          return;
        }
      } else {
        GameState.game.ui.hudElement.hide();
      }

      // Reset highlights using ItemManager's items
      this.resetAllItemHighlights();
    } catch (error) {
      console.error("Raycast error:", error);
    }
  }

  findItemByRaycastMesh(mesh) {
    const allItems = GameState.itemManager.getAllItems();
    return allItems.find(
      (item) => item.getRaycastMesh() === mesh || item.mesh === mesh
    );
  }

  resetAllItemHighlights() {
    const allItems = GameState.itemManager.getAllItems();
    allItems.forEach((item) => {
      if (!item.pickedUp) item.reset();
    });
  }

  update(delta) {
    if (GameState.paused) return;

    super.update(delta);

    if (this.rakeManager) this.rakeManager.update(delta);
    if (this.spiderManager) this.spiderManager.update(delta);
    if (GameState.player) GameState.player.update(delta);

    if (this.keypadController) this.keypadController.update(delta);
    this.doorControllers.forEach((controller) => controller.update(delta));

    this.drawerControllers.forEach((controller) => controller.update(delta));

    if (GameState.player?.isCompleted) {
      this.handleLevelCompletion();
    }

    const currentRoom = this.getCurrentRoom(this.playerPosition);

    if (currentRoom) {
      this.handleRaycastIntersection();
    }

    updateBullets(
      this.spiderManager,
      this.rakeManager,
      GameState.abandonedBuilding
    );
  }

  cleanup() {
    super.cleanup();

    if (this.drawerControllers) {
      this.drawerControllers.forEach((controller) => {
        try {
          controller.cleanup();
        } catch (e) {
          console.error("Error cleaning up drawer controller:", e);
        }
      });
      this.drawerControllers = [];
    }

    this.clearDebugMarkers();
    this.traverse((child) => {
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

    // Stop the music when cleaning up the level
    if (this.musicId) {
      this.game.audio.stopSound(this.musicId);
    }

    if (this.calendarRoomHelper) {
      if (this.calendarRoomHelper.parent) {
        this.calendarRoomHelper.parent.remove(this.calendarRoomHelper);
      }
      this.calendarRoomHelper = null;
    }

    this.calendarRoom = null;

    // Clean up managers
    if (this.spiderManager) {
      this.spiderManager.cleanup();
      this.spiderManager = null;
    }

    if (this.rakeManager) {
      this.rakeManager.cleanup();
      this.rakeManager = null;
    }

    if (this.keypadController) {
      this.keypadController.cleanup();
      this.keypadController = null;
    }

    if (this.doorControllers) {
      this.doorControllers.forEach((controller) => controller.cleanup());
      this.doorControllers = null;
    }

    // Clean up player
    if (GameState.player) {
      GameState.player.cleanup();
    }

    // Clear arrays
    this.buildingClones = [];
    this.brokenTables = [];
    this.doorControllers = [];

    // Remove all children
    while (this.children.length > 0) {
      this.remove(this.children[0]);
    }

    // Clear any remaining references
    if (GameState.abandonedBuilding && GameState.abandonedBuilding.parent) {
      GameState.abandonedBuilding.parent.remove(GameState.abandonedBuilding);
    }
    GameState.calendar = null;
    GameState.elevator = null;
    GameState.elevatorBox = null;
    GameState.elevatorEntryZone = null;

    // Force garbage collection (where supported)
    if (typeof gc !== "undefined") gc();
  }
}
