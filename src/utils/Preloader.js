import { GameState } from "../core/GameState.js";
import { cutDoorHole } from "./utils.js";

export async function preloadCoreAssets() {
  const gltfLoader = new THREE.GLTFLoader(GameState.loadingManager);

  const modelPaths = [
    {
      key: "player",
      path: "./assets/models/fps_animations_lowpoly_mp5-opt.glb",
    },
    { key: "player1", path: "./assets/models/fps_knife_arm.glb" },
    { key: "player2", path: "./assets/models/animated_fps_lever_action-opt.glb" },
    {
      key: "calendar",
      path: "./assets/models/calendar_wall_-_3mb-opt (1).glb",
    },
    { key: "door", path: "./assets/models/door_wood-opt.glb" },
    { key: "table", path: "./assets/models/broken_table-opt.glb" },
    { key: "bed", path: "./assets/models/bed.glb" },
    { key: "chair", path: "./assets/models/chair.glb" },
    {
      key: "elevator",
      path: "./assets/models/elevator_-_low_poly_animated-opt (1).glb",
    },
    { key: "keypad", path: "./assets/models/keypad-opt.glb" },
    { key: "rake", path: "./assets/models/the_rake-opt.glb" },
    { key: "spider", path: "../assets/models/voided_spider-opt.glb" },
    {
      key: "abandonedRoom",
      path: "./assets/models/low_poly_abandoned_brick_room-opt.glb",
    },
    // Add inventory item models
    { key: "drawers", path: "./assets/models/low_poly_-_chest_of_drawers-opt.glb" },
    { key: "shelf", path: "./assets/models/shelf.glb" },
    { key: "fuse", path: "./assets/models/fuse.glb" },
    { key: "buch", path: "./assets/models/old_book.glb" },
    { key: "key", path: "./assets/models/key_card.glb" },
    { key: "battery", path: "./assets/models/battery.glb" },
    { key: "bloodSample", path: "./assets/models/blood_sample.glb" },
    { key: "photograph", path: "./assets/models/photograph.glb" },
    { key: "mapFragment", path: "./assets/models/map_fragment.glb" },
    { key: "serum", path: "./assets/models/serum.glb" },
    { key: "adrenaline", path: "./assets/models/adrenaline.glb" },
    { key: "bandages", path: "./assets/models/bandage.glb" },
    { key: "milk", path: "./assets/models/condensed_milk-opt.glb" },
  ];

  const promises = modelPaths.map(
    ({ key, path }) =>
      new Promise((resolve, reject) => {
        gltfLoader.load(
          path,
          (gltf) => {
            if (!gltf?.scene) {
              reject(new Error(`Loaded GLTF for ${key} but scene is invalid`));
              return;
            }
            resolve({ key, gltf });
          },
          undefined,
          (error) => {
            console.error(`Failed to load model ${key}:`, error);
            reject(
              new Error(
                `Failed to load ${key} model: ${
                  error.message || "Unknown error"
                }`
              )
            );
          }
        );
      })
  );

  try {
    const results = await Promise.all(promises);

    // Store in GameState
    GameState.preloadedAssets = {};
    results.forEach(({ key, gltf }) => {
      GameState.preloadedAssets[key] = gltf;
      // console.log(`Successfully loaded ${key} model`);
    });

    // Process abandoned room
    GameState.abandonedBuilding =
      GameState.preloadedAssets.abandonedRoom.scene.clone();

    GameState.abandonedBuilding.traverse((child) => {
      if (child.isMesh) {
        const mat = child.material;
        child.material = new THREE.MeshStandardMaterial({
          map: mat.map || null,
          metalness: 0,
          roughness: 1,
          emissive: new THREE.Color(0x000000),
          envMap: null,
          side: THREE.DoubleSide,
        });
        child.castShadow = false;
        child.receiveShadow = true;
      }
    });

    cutDoorHole(GameState.abandonedBuilding);

    return GameState.preloadedAssets;
  } catch (error) {
    console.error("Critical error loading core assets:", error);
    throw error;
  }
}

export async function preloadAudioAssets() {
  const audioManager = GameState.audio;
  const audioPaths = [
    { name: "music", path: "../assets/music/music.mp3" },
    { name: "reload", path: "../sounds/ShotgunReload.ogg" },
    { name: "jumpscare", path: "../sounds/jumpscare_open_room.ogg" },
    { name: "monsterGrowl", path: "../sounds/monster-growl-251374.ogg" },
    { name: "monsterRoar", path: "../sounds/monster-roar-6985.ogg" },
    { name: "teleport", path: "../sounds/low-monster-roar-97413.mp3" },
    { name: "gunshot", path: "../sounds/tommy-gun-single-bullet.mp3" },
    { name: "bullet", path: "../sounds/tommy-gun-single-bullet.mp3" },
    { name: "lighton", path: "../sounds/flashlight_click.mp3" },
    { name: "open", path: "../sounds/DoorOpen1.ogg" },
    { name: "close", path: "../sounds/DoorClose2.ogg" },
    { name: "StunSpider", path: "../sounds/StunSpider.ogg" },
    { name: "shriek", path: "../sounds/Shriek2.ogg" },
    { name: "monsterHurt", path: "../sounds/HitCrawler.ogg" },
    { name: "monsterDeath", path: "../sounds/HitCrawler2.ogg" },
    { name: "bite", path: "../sounds/BitePlayer.ogg" },
    { name: "scream", path: "../sounds/mixkit-scream-in-pain-2200.ogg" },
    { name: "wallhit", path: "../sounds/bullet-ricochet.mp3" },
    { name: "walk", path: "../sounds/Step2.ogg" },
    { name: "exhausted", path: "../sounds/exhausted.ogg" },
    { name: "heavy_breathing", path: "../sounds/heavy_breathing.ogg" },
    { name: "sprint_start", path: "../sounds/sprint_start.mp3" },
    { name: "sprint_end", path: "../sounds/sprint_end.mp3" },
    { name: "warning", path: "../sounds/AlertHUD.ogg" },
    { name: "timeout", path: "../sounds/time_out.mp3" },
    { name: "navSound", path: "../sounds/Switch.mp3" },
    { name: "clickSound", path: "../sounds/Choose.mp3" },
    { name: "yesNoSound", path: "../sounds/Confirm.mp3" },
    { name: "breathing", path: "../sounds/Breathing.ogg" },
    { name: "wusch", path: "../sounds/wusch.ogg" },
  ];

  try {
    const results = await Promise.all(
      audioPaths.map(({ name, path }) =>
        audioManager
          .load(name, path)
          // .then(() => console.log(`Loaded audio: ${name}`))
          .catch((error) => {
            console.error(`Failed to load audio ${name}:`, error);
            throw error;
          })
      )
    );
    return results;
  } catch (error) {
    console.error("Failed to load audio assets:", error);
    throw error;
  }
}

export async function preloadVideoAsset(src) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.src = src;
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    video.addEventListener(
      "canplaythrough",
      () => {
        // console.log(`Video loaded: ${src}`);
        resolve(video);
      },
      { once: true }
    );

    video.addEventListener(
      "error",
      (err) => {
        console.error(`Video load failed: ${src}`, err);
        reject(new Error(`Failed to load video: ${src}`));
      },
      { once: true }
    );
  });
}

export async function preloadCutsceneAudio() {
  const audioManager = GameState.audio;

  try {
    // Load the cutscene JSON file
    const response = await fetch("../CutScenes.json");
    const cutsceneData = await response.json();

    // Collect all unique audio paths from the cutscenes
    const audioPaths = new Set();

    cutsceneData.forEach((cutscene) => {
      cutscene.dialogue.forEach((dialogue) => {
        if (dialogue.voice) audioPaths.add(dialogue.voice);
        if (dialogue.musicCue) audioPaths.add(dialogue.musicCue);
      });
    });

    // Convert to array of objects with unique names
    const audioAssets = Array.from(audioPaths).map((path, index) => {
      // Generate a unique name based on the path
      const name = `cutscene_${path
        .split("/")
        .pop()
        .replace(/\.[^/.]+$/, "")}_${index}`;
      return { name, path };
    });

    // Preload all audio assets
    const results = await Promise.all(
      audioAssets.map(({ name, path }) =>
        audioManager.load(name, path).catch((error) => {
          console.error(`Failed to load cutscene audio ${path}:`, error);
          // Continue even if some files fail to load
          return false;
        })
      )
    );

    console.log(
      `Preloaded ${results.filter(Boolean).length}/${
        audioAssets.length
      } cutscene audio files`
    );
    return results;
  } catch (error) {
    console.error("Failed to preload cutscene audio:", error);
    throw error;
  }
}

export async function preloadAllAudio() {
  try {
    // Preload core game audio
    await preloadAudioAssets();

    // Preload cutscene-specific audio
    await preloadCutsceneAudio();

    console.log("All audio assets preloaded successfully");
  } catch (error) {
    console.error("Audio preloading failed:", error);
    throw error;
  }
}
