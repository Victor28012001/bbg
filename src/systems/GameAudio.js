// systems/GameAudio.js
import { GameState } from "../core/GameState.js";

export class GameAudio {
  constructor() {
    // 2D audio player for UI and non-positional sounds
    this.soundPlayer = new SoundPlayer();

    // 3D audio player for positional sounds
    this.sound3DPlayer = new Sound3DPlayer();

    // Cache for loaded sounds
    this.sounds = new Map();
    this.currentMusic = null;
    this._initialized = false;
  }

  async init() {
    if (this._initialized) return;

    // Initialize both audio systems
    this.soundPlayer.ensureAudioContext(); // Initialize 2D audio context
    this.sound3DPlayer.initAudio(); // Initialize 3D audio context

    // Add listener to camera for 3D audio if camera exists
    if (GameState.camera && !this.sound3DPlayer.listener) {
      this.sound3DPlayer.listener = new THREE.AudioListener();
      GameState.camera.add(this.sound3DPlayer.listener);
      console.log("3D Audio listener initialized");
    }

    this._initialized = true;
  }

  attachListenerToCamera() {
    if (!GameState.camera) {
      console.warn("🚫 Cannot attach 3D listener — camera missing");
      return false;
    }

    if (!this.sound3DPlayer.listener) {
      this.sound3DPlayer.listener = new THREE.AudioListener();
      GameState.camera.add(this.sound3DPlayer.listener);
      console.log("✅ 3D Audio listener attached");
      return true;
    } else {
      console.log("⚠️ 3D audio listener already exists");
      return true;
    }
  }

  async load(name, url, is3D = false) {
    try {
      if (is3D) {
        // For 3D sounds, we'll let the 3D player handle loading when played
        return true;
      }

      // For 2D sounds, use the sound player
      return await this.soundPlayer.load(name, url);
    } catch (error) {
      console.error("Audio loading error:", error);
      return false;
    }
  }

  // Play a sound (2D or 3D)
  play(name, volume = 1, loop = false, is3D = false, position = null) {
    if (is3D && position) {
      // Play as 3D positional audio
      this.sound3DPlayer.playPositionalAudio(name, position, volume);
    } else {
      // Play as regular 2D audio
      return this.soundPlayer.play(name, volume, loop);
    }
  }

  // Inside the GameAudio class
  stopSound(name, is3D = false) {
    if (is3D) {
      return this.sound3DPlayer.stopPositionalAudio(name);
    } else {
      return this.soundPlayer.stopSound(name);
    }
  }

  // Optional: Stop all sounds (useful for cleanup)
  stopAllSounds() {
    this.soundPlayer.stopMusic();
    if (this.soundPlayer.activeSounds) {
      this.soundPlayer.activeSounds.forEach((source) => {
        source.stop();
        source.disconnect();
      });
      this.soundPlayer.activeSounds.clear();
    }

    this.sound3DPlayer.activeSounds.forEach((soundEntry) => {
      this.sound3DPlayer.cleanupSound(soundEntry);
    });
  }

  // Play background music
  async playMusic(src, targetVolume = 0.5, fadeDuration = 1.0) {
    await this.soundPlayer.playMusic(src, targetVolume, fadeDuration);
    this.currentMusic = src;
  }

  // Add this method to properly expose fadeOutMusic
  fadeOutMusic(duration = 1.0) {
    this.soundPlayer.fadeOutMusic(duration);
  }

  // Stop current music
  stopMusic() {
    this.soundPlayer.stopMusic();
    this.currentMusic = null;
  }

  // Pause current music
  pauseMusic() {
    this.soundPlayer.pauseMusic();
  }

  // Resume current music
  resumeMusic() {
    if (this.currentMusic) {
      this.soundPlayer.resumeMusic(this.currentMusic);
    }
  }

  isPlaying(soundName) {
    // Check if a sound is currently playing
    if (this.soundPlayer.activeSounds?.has(soundName)) {
      return true;
    }

    // For 3D sounds, you'd need similar checking logic
    return false;
  }

  // Play a 3D positional sound
  play3D(name, position, volume = 1) {
    this.sound3DPlayer.playPositionalAudio(name, position, volume);
  }

  // Update 3D audio listener position (call in game loop)
  updateListenerPosition() {
    if (
      !this._initialized ||
      !GameState.camera ||
      !this.sound3DPlayer.listener
    ) {
      return false;
    }

    this.sound3DPlayer.listener.position.copy(GameState.camera.position);
    return true;
  }

  // Set music volume
  setMusicVolume(vol) {
    this.soundPlayer.setMusicVolume(vol);
  }

  // Set SFX volume
  setSfxVolume(vol) {
    this.soundPlayer.setSfxVolume(vol);
  }

  // Mute/unmute all audio
  muteAll(mute = true) {
    this.soundPlayer.muteAll(mute);
    this.sound3DPlayer.muteAll(mute);
  }
}

// Internal SoundPlayer class (2D audio)
class SoundPlayer {
  constructor() {
    this.audioContext = null;
    this.bufferCache = {};
    this.musicSource = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.musicVolume = 0.5;
    this.sfxVolume = 1.0;
    this.isMuted = false;
  }

  // Initialize audio context
  ensureAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      this.musicGain = this.audioContext.createGain();
      this.sfxGain = this.audioContext.createGain();

      this.musicGain.connect(this.audioContext.destination);
      this.sfxGain.connect(this.audioContext.destination);

      this.musicGain.gain.value = this.musicVolume;
      this.sfxGain.gain.value = this.sfxVolume;
    }
  }

  // Load audio file
  async load(name, url) {
    this.ensureAudioContext();
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      this.bufferCache[name] = await this.audioContext.decodeAudioData(
        arrayBuffer
      );
      return true;
    } catch (error) {
      console.error("Audio loading error:", error);
      return false;
    }
  }

  // Play a sound
  play(name, volume = 1, loop = false, playbackRate = 1) {
    this.ensureAudioContext();
    if (!this.bufferCache[name]) {
      console.warn(`Sound "${name}" not loaded`);
      return null;
    }

    const source = this.audioContext.createBufferSource();
    const gainNode = this.audioContext.createGain();

    source.buffer = this.bufferCache[name];
    source.loop = loop;
    source.playbackRate.setValueAtTime(
      playbackRate,
      this.audioContext.currentTime
    );

    gainNode.gain.value = volume;
    source.connect(gainNode);
    gainNode.connect(this.sfxGain);

    source.start(0);

    // Track active sounds (if not music)
    if (name !== this.currentMusic) {
      if (!this.activeSounds) this.activeSounds = new Map();
      this.activeSounds.set(name, source);

      // Auto-remove when sound ends
      source.onended = () => this.activeSounds.delete(name);
    }

    return source;
  }

  // Inside the SoundPlayer class
  stopSound(name) {
    this.ensureAudioContext();

    // If it's music, use the existing stopMusic()
    if (this.musicSource && name === this.currentMusic) {
      this.stopMusic();
      return true;
    }

    // For SFX, we need to track active sounds (add this to constructor)
    if (!this.activeSounds) {
      this.activeSounds = new Map();
    }

    const soundSource = this.activeSounds.get(name);
    if (soundSource) {
      soundSource.stop();
      soundSource.disconnect();
      this.activeSounds.delete(name);
      return true;
    }

    console.warn(`Sound "${name}" not found or already stopped`);
    return false;
  }

  // Play background music
  async playMusic(src, targetVolume = 0.5, fadeDuration = 1.0) {
    this.ensureAudioContext();
    if (!this.bufferCache[src]) {
      await this.load(src, src);
    }

    this.stopMusic();

    const source = this.audioContext.createBufferSource();
    source.buffer = this.bufferCache[src];
    source.loop = true;
    source.connect(this.musicGain);
    source.start(0);

    this.musicSource = source;

    // Fade in
    const now = this.audioContext.currentTime;
    this.musicGain.gain.setValueAtTime(0, now);
    this.musicGain.gain.linearRampToValueAtTime(
      targetVolume,
      now + fadeDuration
    );
  }

  // Stop current music
  stopMusic() {
    if (this.musicSource) {
      this.musicSource.stop();
      this.musicSource.disconnect();
      this.musicSource = null;
    }
  }

  // Pause current music
  pauseMusic() {
    if (this.musicSource) {
      this.musicSource.stop();
      this.musicSource.disconnect();
      this.musicSource = null;
    }
  }

  // Resume music
  resumeMusic(src) {
    if (!this.musicSource) {
      this.playMusic(src, this.musicVolume);
    }
  }

  // Set music volume
  setMusicVolume(vol) {
    this.musicVolume = vol;
    if (!this.isMuted && this.musicGain) {
      this.musicGain.gain.setTargetAtTime(
        vol,
        this.audioContext.currentTime,
        0.1
      );
      localStorage.setItem("musicVolume", vol);
    }
  }

  // Set SFX volume
  setSfxVolume(vol) {
    this.sfxVolume = vol;
    if (!this.isMuted && this.sfxGain) {
      this.sfxGain.gain.setTargetAtTime(
        vol,
        this.audioContext.currentTime,
        0.1
      );
      localStorage.setItem("sfxVolume", vol);
    }
  }

  // Mute/unmute all audio
  muteAll(mute = true) {
    this.isMuted = mute;
    const value = mute ? 0 : this.musicVolume;
    if (this.musicGain && this.sfxGain) {
      this.musicGain.gain.setTargetAtTime(
        value,
        this.audioContext.currentTime,
        0.1
      );
      this.sfxGain.gain.setTargetAtTime(
        mute ? 0 : this.sfxVolume,
        this.audioContext.currentTime,
        0.1
      );
    }
  }

  // Fade out music over a period of time
  fadeOutMusic(fadeDuration = 1.0) {
    if (!this.musicGain) return;

    const now = this.audioContext.currentTime;
    this.musicGain.gain.linearRampToValueAtTime(0, now + fadeDuration);
    setTimeout(() => this.stopMusic(), fadeDuration * 1000); // Stop music after fade
  }
}

// Internal Sound3DPlayer class (3D positional audio)
class Sound3DPlayer {
  constructor() {
    this.audioContext = null;
    this.bufferCache = new Map();
    this.listener = null;
    this.musicVolume = 0.5;
    this.sfxVolume = 1.0;
    this.isMuted = false;
    this.maxConcurrentSounds = 5;
    this.activeSounds = new Set();
  }

  // Initialize audio context and listener
  initAudio() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
    }
  }

  // Load audio file
  async loadAudioFile(src) {
    if (!this.bufferCache[src]) {
      const res = await fetch(src);
      const arrayBuffer = await res.arrayBuffer();
      this.bufferCache[src] = await this.audioContext.decodeAudioData(
        arrayBuffer
      );
    }
    return this.bufferCache[src];
  }

  // Play positional audio
  async playPositionalAudio(src, position, volume = 1) {
    if (!this.audioContext) this.initAudio();
    if (!this.listener) return;

    // Clean up finished sounds
    this.cleanupFinishedSounds();

    // Enforce sound limit
    if (this.activeSounds.size >= this.maxConcurrentSounds) {
      console.warn("Max concurrent sounds reached, skipping:", src);
      return;
    }

    try {
      let buffer;
      if (!this.bufferCache.has(src)) {
        const res = await fetch(src);
        const arrayBuffer = await res.arrayBuffer();
        buffer = await this.audioContext.decodeAudioData(arrayBuffer);
        this.bufferCache.set(src, buffer);
      } else {
        buffer = this.bufferCache.get(src);
      }

      const sound = new THREE.PositionalAudio(this.listener);
      sound.setBuffer(buffer);
      sound.setRefDistance(20);
      sound.setMaxDistance(50);
      sound.setVolume(volume);

      const soundObject = new THREE.Object3D();
      soundObject.add(sound);
      soundObject.position.copy(position);
      GameState.scene.add(soundObject);

      sound.play();

      // Track active sounds
      const soundEntry = { sound, soundObject };
      this.activeSounds.add(soundEntry);

      // Clean up after playback
      sound.onEnded = () => {
        this.cleanupSound(soundEntry);
      };
    } catch (error) {
      console.error("Error playing 3D audio:", error);
    }
  }

  // Inside the Sound3DPlayer class
  stopPositionalAudio(name) {
    let stopped = false;

    // Find and stop all instances of this sound
    for (const soundEntry of this.activeSounds) {
      if (
        soundEntry.sound.context.state !== "closed" &&
        soundEntry.sound.isPlaying &&
        soundEntry.sound.buffer === this.bufferCache.get(name)
      ) {
        this.cleanupSound(soundEntry);
        stopped = true;
      }
    }

    if (!stopped) {
      console.warn(`Positional sound "${name}" not found or already stopped`);
    }
    return stopped;
  }

  cleanupFinishedSounds() {
    for (const soundEntry of this.activeSounds) {
      if (
        soundEntry.sound.context.state === "closed" ||
        soundEntry.sound.isPlaying === false
      ) {
        this.cleanupSound(soundEntry);
      }
    }
  }

  cleanupSound(soundEntry) {
    if (soundEntry.sound) {
      soundEntry.sound.stop();
      soundEntry.sound.disconnect();
    }
    if (soundEntry.soundObject?.parent) {
      GameState.scene.remove(soundEntry.soundObject);
    }
    this.activeSounds.delete(soundEntry);
  }

  // Mute/unmute
  muteAll(mute = true) {
    this.isMuted = mute;
    // Note: THREE.PositionalAudio volume is controlled per sound
  }
}
