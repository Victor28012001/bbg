import { GameState } from "../core/GameState";
import { DynamicLevelScene } from "./DynamicLevelScene";
export class CutsceneScene {
  constructor(game, options) {
    this.game = game;
    this.dialogue = options.dialogue || [];
    this.background = options.background || "";
    this.nextScene = options.nextScene;
    this.currentIndex = 0;
    this.typing = false;
    this.voice = null;
    this.music = null;
    this.container = null;
    this.portrait = null;
    this.textBox = null;
    this.tickSound = null;
    this.typingInterval = null;
    this.fullText = "";
    this.currentChar = 0;
  }

  // Helper method to add both touch and click handlers
  addMobileListener(element, handler) {
    if (!element) return;

    // Add both touch and click handlers
    element.addEventListener("click", handler);
    element.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        handler(e);
      },
      { passive: false }
    );
  }

  async enter() {
    // Clear any existing UI first
    this.game.ui.removeAllUI();

    // Create container but don't fade in here - let SceneManager handle it
    this.container = document.createElement("div");
    this.container.id = "cutscene";
    this.container.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: url('${this.background}') center/cover no-repeat;
      display: flex; 
      align-items: end; 
      justify-content: center;
      color: white; 
      text-shadow: 2px 2px 6px black;
      font-size: 1.4em; 
      opacity: 0;
      transition: opacity 300ms ease-out;
    `;

    // Create container but don't fade in here - let SceneManager handle it
    this.cont = document.createElement("div");
    this.cont.id = "cont";
    this.cont.style.cssText = `
      width: 100%;
      display: flex; 
      align-items: center; 
      justify-content: center;
      text-shadow: 2px 2px 6px black;
      font-size: 1.4em; 
    `;

    // Portrait image
    this.portrait = document.createElement("img");
    this.portrait.id = "cutscene-portrait";
    this.portrait.style.cssText = `
      width: 120px;
      margin-bottom: 20px;
      display: none;
      object-fit: cover;
      max-width: 30%;
      border-radius: 50%;
      border: 12px solid white;
      aspect-ratio: 1 / 1;
    `;
    this.container.appendChild(this.cont);
    this.cont.appendChild(this.portrait);

    // Text box
    this.textBox = document.createElement("div");
    this.textBox.id = "cutscene-text";
    this.textBox.style.cssText = `
      max-width: 70%;
      background: rgba(0,0,0,0.6);
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      user-select: none;
    `;
    this.cont.appendChild(this.textBox);

    // Skip button
    const skip = document.createElement("button");
    skip.innerText = "Skip";
    skip.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      padding: 8px 12px;
      background: rgba(0,0,0,0.7);
      color: white;
      border: none;
      cursor: pointer;
      user-select: none;
    `;
    this.addMobileListener(skip, () => this.finish());
    this.container.appendChild(skip);

    document.body.appendChild(this.container);

    // Wait for next frame to ensure DOM is ready
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // Fade in cutscene content
    this.container.style.opacity = "1";

    document.addEventListener("keydown", this.skipHandler);
    this.addMobileListener(this.container, this.advance);

    await this.showNextDialogue();
  }

  skipHandler = (e) => {
    if (e.key === "Escape") this.finish();
  };

  advance = () => {
    if (this.typing) {
      this.finishTyping();
    } else {
      this.showNextDialogue();
    }
  };

  async showNextDialogue() {
    if (this.currentIndex >= this.dialogue.length) {
      await this.finish();
      return;
    }

    const line = this.dialogue[this.currentIndex];
    this.currentIndex++;

    // Update background if provided in line
    if (line.background) {
      this.container.style.background = `url('${line.background}') center/cover no-repeat`;
    }

    // Show portrait if available
    if (line.portrait) {
      try {
        await this.loadImage(line.portrait);
        this.portrait.src = line.portrait;
        this.portrait.style.display = "block";
      } catch {
        this.portrait.style.display = "none";
      }
    } else {
      this.portrait.style.display = "none";
    }

    // Handle audio - stop previous voice if playing
    if (this.voiceSoundId) {
      this.game.audio.stopSound(this.voiceSoundId);
      this.voiceSoundId = null;
    }

    if (line.voice) {
      try {
        // Generate unique ID for this voice line
        this.voiceSoundId = `voice_${this.currentIndex}`;
        await this.game.audio.load(this.voiceSoundId, line.voice);
        this.game.audio.play(this.voiceSoundId);
      } catch (error) {
        console.error("Failed to play voice:", error);
        this.voiceSoundId = null;
      }
    }

    // Handle music
    if (line.musicCue) {
      if (!this.musicSoundId || this.musicSoundId !== line.musicCue) {
        if (this.musicSoundId) {
          this.game.audio.stopSound(this.musicSoundId);
        }
        try {
          this.musicSoundId = `music_${this.currentIndex}`;
          await this.game.audio.load(this.musicSoundId, line.musicCue);
          this.game.audio.play(this.musicSoundId, 0.5, true);
        } catch (error) {
          console.error("Failed to play music:", error);
          this.musicSoundId = null;
        }
      }
    } else if (this.musicSoundId) {
      // this.game.audio.stopSound(this.musicSoundId);
      // this.musicSoundId = null;
    }

    await this.typeText(line.text);
  }

  async loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        console.warn(`Image load failed: ${src}, using fallback`);
        // Create transparent 1x1 pixel fallback
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        resolve(canvas);
      };
      img.src = src;
    });
  }

  async typeText(text) {
    this.textBox.innerHTML = ""; // Use innerHTML instead of innerText
    this.typing = true;
    this.fullText = text;
    this.currentChar = 0;

    // Create a span for each character to allow for better styling
    const textContainer = document.createElement("span");
    this.textBox.appendChild(textContainer);

    if (!this.tickSound) {
      // Use GameAudio for the tick sound
      await this.game.audio.load("tick", "../sounds/flashlight_click.mp3");
    }

    // Add CSS for text styling
    const style = document.createElement("style");
    style.textContent = `
      #cutscene-text {
        white-space: pre-wrap;
        word-wrap: break-word;
        line-height: 1.5;
      }
      #cutscene-text span {
        display: inline;
      }
    `;
    document.head.appendChild(style);

    await new Promise((resolve) => {
      this.typingInterval = setInterval(() => {
        if (this.currentChar < this.fullText.length) {
          const char = this.fullText[this.currentChar];
          const charSpan = document.createElement("span");
          charSpan.textContent = char;
          textContainer.appendChild(charSpan);

          this.currentChar++;

          // Auto-scroll to bottom
          this.textBox.scrollTop = this.textBox.scrollHeight;

          if (this.currentChar % 2 === 0) {
            this.game.audio.play("tick", 0.4);
          }
        } else {
          clearInterval(this.typingInterval);
          this.typing = false;
          style.remove?.(); // Clean up the style
          resolve();
        }
      }, 30); // Adjust typing speed as needed
    });
  }

  finishTyping() {
    clearInterval(this.typingInterval);
    this.textBox.innerHTML = this.fullText;
    this.typing = false;
  }

  async finish() {
    if (this._isExiting) return;
    this._isExiting = true;

    try {
      // Fade out cutscene
      this.container.style.opacity = "0";
      await new Promise((resolve) => {
        this.container.addEventListener("transitionend", resolve, {
          once: true,
        });
      });

      await this.exit();

      // Prepare context for next scene
      const context = {
        musicId: this.musicSoundId,
        levelIndex: this.levelIndex,
      };

      // Ensure controls are properly reset
      // await this.game.controlsSystem.reinitialize(
      //   GameState.renderer.domElement
      // );

      // Reset player state again before loading level
      if (GameState.player) {
        GameState.player.isCompleted = false;
        // await GameState.player.reset();
      }

      // Load next level
      await this.game.sceneManager.switchTo(this.nextScene, context);
    
    // Only mark cutscene as finished AFTER the new scene is fully initialized
    if (this.game.sceneManager.currentScene instanceof DynamicLevelScene) {
      this.game.cutsceneFinished = true;
    }
    } catch (error) {
      console.error("Cutscene transition failed:", error);
      await this.game.sceneManager.switchTo("mainMenu");
    } finally {
      this._isExiting = false;
    }
  }

  async exit() {
    document.removeEventListener("keydown", this.skipHandler);

    if (this.container) {
      // Remove both event listeners by using the same reference
      this.container.removeEventListener("click", this.advance);
      this.container.removeEventListener("touchstart", this.advance);
    }

    // Stop all audio using GameAudio
    if (this.voiceSoundId) {
      this.game.audio.stopSound(this.voiceSoundId);
    }

    if (this.tickSound) {
      this.game.audio.stopSound("cutscene_tick");
    }

    if (this.typingInterval) {
      clearInterval(this.typingInterval);
    }

    if (this.container && this.container.parentNode) {
      this.container.remove();
    }
  }
}
