import { GameState } from "../core/GameState.js";
import { Player } from "../entities/Player.js";

export class GameScene extends THREE.Scene {
  constructor(game, levelIndex) {
    super();
    this.game = game;
    this.levelIndex = levelIndex;
    this.name = `level_${levelIndex}`;
    GameState.scene = this;
    this.loader = new THREE.TextureLoader(GameState.loadingManager);

    // Use the game's controls system instead of creating a new one
    this.controlsSystem = game.controlsSystem;
    this.levelData = game.levelManager.getLevelData(levelIndex);
  }

  async init() {
    try {
      GameState.init();
      this.initRenderer();
      this.initCamera();
      GameState.audio.attachListenerToCamera();
      this.initLights();
      GameState.player = new Player();
      await this.initEnvironment();
      this.initControls();
      this.setupEventListeners();
      GameState.game.ui.showGameHUD();
    } catch (error) {
      console.error(`[GameScene] Initialization failed:`, error);
      throw error;
    }
  }

  initRenderer() {
    GameState.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: "high-performance",
    });
    GameState.renderer.setClearColor(0x333333);
    GameState.renderer.setPixelRatio(window.devicePixelRatio);
    GameState.renderer.setSize(window.innerWidth, window.innerHeight);
    GameState.renderer.shadowMap.enabled = true;
    GameState.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = GameState.renderer.domElement;
    canvas.id = "game-canvas";

    const oldRenderer = document.querySelector("canvas");
    if (oldRenderer) oldRenderer.remove();
    document.body.appendChild(GameState.renderer.domElement);
  }

  initCamera() {
    if (!GameState.camera) {
      GameState.camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.01,
        1000
      );
    }

    const corner = "bottomRight";
    let x = GameState.halfGridSize;
    let z = GameState.halfGridSize;

    switch (corner) {
      case "topLeft":
        x = -GameState.halfGridSize;
        z = -GameState.halfGridSize;
        break;
      case "topRight":
        x = GameState.halfGridSize;
        z = -GameState.halfGridSize;
        break;
      case "bottomLeft":
        x = -GameState.halfGridSize;
        z = GameState.halfGridSize;
        break;
    }

    GameState.camera.position.set(x - 2, 2.5, z - 2);
  }

  initLights() {
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0.5, 1, 0.5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;

    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -10;
    directionalLight.shadow.camera.right = 10;
    directionalLight.shadow.camera.top = 10;
    directionalLight.shadow.camera.bottom = -10;
    // this.add(directionalLight)
  }

  async initEnvironment() {
    try {
      const textures = await this.loadTextures();
      const ground = this.createGround(textures.ground);
      this.add(ground);
      this.createWalls(textures.ground);
      this.createCeiling(textures.ceiling);
    } catch (error) {
      console.error("[GameScene] Environment initialization failed:", error);
      throw error;
    }
  }

  async loadTextures() {
    const groundBase = "assets/textures/ground/";
    const ceilingBase = "assets/textures/ceiling/";

    const [
      groundDiffuseMap,
      groundNormalMap,
      groundRoughnessMap,
      groundAoMap,
      ceilingDiffuseMap,
      ceilingNormalMap,
      ceilingRoughnessMap,
    ] = await Promise.all([
      this.loader.loadAsync(`${groundBase}ground_diffuse.webp`),
      this.loader.loadAsync(`${groundBase}ground_normal.webp`),
      this.loader.loadAsync(`${groundBase}ground_roughness.webp`),
      this.loader.loadAsync(`${groundBase}ground_ao.webp`),
      this.loader.loadAsync(`${ceilingBase}Part1Mtl_BaseColor.webp`),
      this.loader.loadAsync(`${ceilingBase}Part1Mtl_Normal.webp`),
      this.loader.loadAsync(`${ceilingBase}Part1Mtl_MetallicRoughness.webp`),
    ]);

    const tileSize = 10;
    const repeat = GameState.gridSize / tileSize;

    const ceilingTileSize = 1;
    const ceilingRepeat = GameState.gridSize / ceilingTileSize;

    [
      groundDiffuseMap,
      groundNormalMap,
      groundRoughnessMap,
      groundAoMap,
    ].forEach((map) => {
      map.wrapS = THREE.RepeatWrapping;
      map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(repeat, repeat);
    });

    [ceilingDiffuseMap, ceilingNormalMap, ceilingRoughnessMap].forEach(
      (map) => {
        map.wrapS = THREE.RepeatWrapping;
        map.wrapT = THREE.RepeatWrapping;
        map.repeat.set(ceilingRepeat, ceilingRepeat);
      }
    );

    return {
      ground: {
        diffuseMap: groundDiffuseMap,
        normalMap: groundNormalMap,
        roughnessMap: groundRoughnessMap,
        aoMap: groundAoMap,
      },
      ceiling: {
        diffuseMap: ceilingDiffuseMap,
        normalMap: ceilingNormalMap,
        roughnessMap: ceilingRoughnessMap,
      },
    };
  }

  createGround({ diffuseMap, normalMap, roughnessMap, aoMap }) {
    const geometry = new THREE.PlaneGeometry(
      GameState.gridSize,
      GameState.gridSize,
      250,
      250
    );
    geometry.attributes.uv2 = geometry.attributes.uv;

    const material = new THREE.MeshStandardMaterial({
      map: diffuseMap,
      normalMap: normalMap,
      roughnessMap: roughnessMap,
      aoMap: aoMap,
      side: THREE.DoubleSide,
    });

    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    ground.name = "Ground";

    return ground;
  }

  createWalls({ diffuseMap, normalMap, roughnessMap, aoMap }) {
    const wallHeight = 10;
    const wallGeometry = new THREE.PlaneGeometry(
      GameState.gridSize,
      wallHeight
    );

    const wallMaterial = new THREE.MeshStandardMaterial({
      map: diffuseMap,
      normalMap: normalMap,
      roughnessMap: roughnessMap,
      aoMap: aoMap,
      side: THREE.DoubleSide,
    });

    const halfSize = GameState.halfGridSize;

    const walls = [
      {
        name: "NorthWall",
        position: [0, wallHeight / 2 - 0.5, halfSize],
        rotation: [0, 0, 0],
      },
      {
        name: "SouthWall",
        position: [0, wallHeight / 2 - 0.5, -halfSize],
        rotation: [0, Math.PI, 0],
      },
      {
        name: "EastWall",
        position: [halfSize, wallHeight / 2 - 0.5, 0],
        rotation: [0, Math.PI / 2, 0],
      },
      {
        name: "WestWall",
        position: [-halfSize, wallHeight / 2 - 0.5, 0],
        rotation: [0, -Math.PI / 2, 0],
      },
    ];

    walls.forEach((wall) => {
      const mesh = new THREE.Mesh(wallGeometry, wallMaterial);
      mesh.position.set(...wall.position);
      mesh.rotation.y = wall.rotation[1];
      mesh.name = wall.name;
      this.add(mesh);
    });
  }

  createCeiling({ diffuseMap, normalMap, roughnessMap }) {
    const ceilingGeometry = new THREE.PlaneGeometry(
      GameState.gridSize,
      GameState.gridSize
    );

    const ceilingMaterial = new THREE.MeshStandardMaterial({
      map: diffuseMap,
      normalMap: normalMap,
      roughnessMap: roughnessMap,
      side: THREE.DoubleSide,
    });

    const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 4.5;
    ceiling.name = "Ceiling";
    this.add(ceiling);
  }

  initControls() {
    try {
      this.controlsSystem.updateCameraReference();
      this.controlsSystem.reinitialize(GameState.renderer.domElement);

      // Use the appropriate controls based on device
      GameState.controls = this.controlsSystem.isMobile
        ? this.controlsSystem.controlsObject
        : this.controlsSystem.pointerLockControls;
    } catch (error) {
      console.error("[GameScene] Controls initialization failed:", error);
      throw error;
    }
  }

  setupEventListeners() {
    window.addEventListener("resize", this.onWindowResize.bind(this));

    let crosshair = document.getElementById("crosshair");
    if (!crosshair) {
      crosshair = document.createElement("div");
      crosshair.id = "crosshair";
      crosshair.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: url('assets/images/reticle.png') center/contain no-repeat;
        pointer-events: none;
        display: block;
        width: 120px;
        height: 120px;
      `;
      document.body.appendChild(crosshair);
    }
  }

  onWindowResize() {
    GameState.camera.aspect = window.innerWidth / window.innerHeight;
    GameState.camera.updateProjectionMatrix();
    GameState.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  update(delta) {
    if (GameState.mixers) {
      GameState.mixers.forEach((mixer) => mixer.update(delta));
    }
  }

  cleanup() {
    window.removeEventListener("resize", this.onWindowResize);

    // Don't cleanup the controls system here - let the Game class handle it
    const crosshair = document.getElementById("crosshair");
    if (crosshair) crosshair.remove();

    if (GameState.controls) {
      GameState.controls = null; // Just clear the reference
    }

    this.traverse((child) => {
      if (child.isMesh) {
        child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  }
}
