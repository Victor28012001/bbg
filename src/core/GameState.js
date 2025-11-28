import { PlayerProfile } from "../entities/PlayerProfile.js";

export const GameState = {
  // Core Three.js objects
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  levelData: [],
  buildingClones: [],
  roomWidth: 9.5,
  wallHeight: 3.8,
  roomDepth: 9.5,
  game: null,
  audio: null,
  abandonedBuilding: null,

  // Game state
  paused: false,
  isEnded: false,
  currentLevel: 0,

  // Bullets & shooting
  bulletHoles: [],
  bullets: [],
  bulletCount: 0,
  maxMagazineSize: 30,
  totalBullets: 240, // 8 magazines of 30 bullets each
  currentBullets: 30,
  isFiring: false,
  isReloading: false,
  itemSpawn: [],
  required: [],
  itemManager: null,
  input: "",
  itemVisible: false,

  // Input states
  moveForward: false,
  moveBackward: false,
  moveLeft: false,
  moveRight: false,
  isFiring: false,
  mouse: new THREE.Vector2(),
  gridSize: 250,
  halfGridSize: 125,
  gridScale: 10,
  margin: 0.1,
  controlsSystem: null,
  inventary: null,

  // Player state
  player: null,
  playerProfile: new PlayerProfile(),
  flashlight: {
    enabled: true,
    battery: 100,
    depletionRate: 0.5,
    rechargeRate: 0.005,
    flickerThreshold: 15,
  },
  preloadedAssets: {},
  preloadAudioAssets: {},
  preloadVideoAsset: {},
  elevator: null,
  elevatorBox: null,
  elevatorOpened: false,
  elevatorEntryZone: null,
  elevatorMixer: null,
  currentAnimation: null,
  currentAnimationAction: null,

  timer: {
    duration: 1500, // 5 minutes in seconds (adjust as needed)
    remaining: 1500,
    active: false,
    lastUpdate: 0,
    warningThreshold: 60, // When to show warning (last 60 seconds)
  },

  // Resources
  loadingManager: new THREE.LoadingManager(),
  clock: new THREE.Clock(),
  raycaster: new THREE.Raycaster(),
  spiderMeshes: [],
  rakeMeshes: [],
  modelReady: false,
  totalSpiders: 0,
  killedSpiders: 0,
  frameCount: 0,
  animationFrameId: null,
  lastMeshAdditionTime: 0,
  meshAdditionInterval: 100,
  currentWeapon: "gun",
  weapons: {
    gun: {
      model: null,
      mixer: null,
      animations: {},
      position: [-0.018, -0.15, -0.045],
      scale: [0.1, 0.1, 0.1],
      rotation: [0, -Math.PI, 0]
    },
    knife: {
      model: null,
      mixer: null,
      animations: {},
      position: [-0.008, -0.068, -0.03],
      scale: [0.09, 0.09, 0.09],
      rotation: [0, -Math.PI, 0]
    }
  },

  // Initialization method
  init() {
    this.playerProfile = new PlayerProfile();

    // Initialize other systems
    this.initPlayerState();

    // Initialize other player-related state
    this.tommyGun = null;
    this.knifeArm = null;
    this.tommyGunMixer = null;
    this.knifeMixer = null;
    this.tommyGunAnimations = {};
    this.knifeAnimations = {};
    this.mixers = [];
    this.currentWeapon = "gun";
    this.weapons = {
      gun: {
        model: null,
        mixer: null,
        animations: {},
        position: [-0.018, -0.15, -0.045],
        scale: [0.09, 0.09, 0.09],
        rotation: [0, -Math.PI, 0]
      },
      knife: {
        model: null,
        mixer: null,
        animations: {},
        position: [-0.008, -0.068, -0.03],
        scale: [0.12, 0.12, 0.12],
        rotation: [0, -Math.PI, 0]
      }
    };
  },

  // Initialize player state with profile stats
  initPlayerState() {
    const stats = this.playerProfile.getPlayerStats();

    this.playerData = {
      health: stats.health,
      energy: stats.energy,
      strength: stats.strength,
      walkSpeed: stats.walkSpeed,
      runSpeed: stats.runSpeed,
      sprintSpeed: stats.sprintSpeed,
      currentSpeed: stats.walkSpeed,
      energyDrainRate: stats.energyDrainRate,
      energyRegenRate: stats.energyRegenRate,
      movementDuration: 0,
      walkToRunThreshold: 1,
      runToSprintThreshold: 3,
      movementState: "idle",
      lastAttackTime: null,
      regenTimeout: null,
      lastEnergyUpdate: performance.now(),
    };

    // Combat tracking
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.enemiesDefeated = 0;
    this.gameStartTime = performance.now();

    // Ammo
    this.currentBullets = 30;
    this.totalBullets = 240;
    this.maxMagazineSize = 30;
    this.isReloading = false;
    this.isFiring = false;
    this.currentAnimation = null;
  },
};
