import { GameState } from "../core/GameState.js";
import {
  preloadCoreAssets,
  preloadVideoAsset,
  preloadAllAudio,
} from "../utils/Preloader.js";
import { createSolanaWalletButton } from "../utils/walletConnection.js";
import { getUserPublicKey } from "../utils/walletState.js";
import { WalletService } from "../wallet/walletService.js";
import { NFTService } from "../wallet/nftService.js";
import { InventoryUI, ContextMenu } from "../entities/InventoryUI.js";

export class GameUI {
  constructor() {
    this.root = document.getElementById("game-ui") || this.createRoot();
    this.domElements = {
      flashlightIndicator: null,
      bloodOverlay: null,
    };
    this.loadingScreenVisible = false;
    this.profiles = [
      {
        name: "Player 1",
        image: "../assets/images/scare.png",
        description: "",
        chosen: false,
        isChainProfile: false,
      },
      {
        name: "Player 2",
        image: "../assets/images/scare.png",
        description: "",
        chosen: false,
        isChainProfile: false,
      },
    ];

    this.selectedProfileIndex = null;
    this.walletService = new WalletService();
    this.nftService = null; // Will be initialized after wallet connection
    this.walletConnected = false;
    this.formSubmitted = false;
    this.messageTimeout = null;
    this.inventoryUI = new InventoryUI();
    GameState.inventary = this.inventoryUI;
    this.contextMenu = new ContextMenu();

    document.addEventListener("keydown", (e) => {
      if (e.key === "i" || e.key === "I") {
        if (this.inventoryUI.element.style.display === "block") {
          this.inventoryUI.hide();
          if (GameState.game.controlsSystem) {
            GameState.game.controlsSystem.requestPointerLock();
          }
        } else {
          this.inventoryUI.show();
          if (GameState.game.controlsSystem) {
            document.exitPointerLock();
          }
        }
      }
    });
  }

  createRoot() {
    const root = document.createElement("div");
    root.id = "game-ui";
    document.body.appendChild(root);
    return root;
  }

  // In your UI class
  async showInitialSplash() {
    // Clear any existing splash
    this.removeUI("initialSplash");

    return new Promise((resolve) => {
      // Create splash element with your exact styling
      const splashHTML = `
      <div id="initialSplash" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: #000;
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        transition: opacity 0.5s ease-out;
      ">
        <img src="/assets/images/Web 1920 – 3.png" style="
          max-width: 100%;
          min-height: 100%;
        ">
      </div>
    `;

      this.root.innerHTML += splashHTML;

      // Automatically fade out after 3 seconds
      setTimeout(async () => {
        const splash = document.getElementById("initialSplash");
        if (splash) {
          splash.style.opacity = "0";
          await new Promise((r) =>
            splash.addEventListener("transitionend", r, { once: true })
          );
          this.removeUI("initialSplash");
        }
        resolve();
      }, 3000);
    });
  }

  async showSplashScreen(onComplete) {
    // Clear any existing splash screen
    this.removeUI("splashScreen");

    return new Promise((resolve) => {
      // Create splash screen with your exact styling
      const splashHTML = `
      <div id="splashScreen" style="
        z-index: 10000;
      ">
        <div id="splashContent" style="
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          background-color: rgba(0,0,0,0.5);
          width:100%; 
          height:100vh; 
          justify-content:center;
        ">
          <h1>Bring Back Gladys</h1>
          <p id="paragraph">Loading assets...</p>
          <div id="loadingBarContainer">
            <div id="loadingProgress" style="
              transition: width 0.3s ease;
            "></div>
          </div>
          <button id="loadingButton" disabled style="
            margin-top: 2rem;">Start Game</button>
        </div>
      </div>
    `;

      this.root.innerHTML += splashHTML;

      // Set up loading manager
      GameState.loadingManager.onProgress = (url, loaded, total) => {
        const progress = (loaded / total) * 100;
        const progressEl = document.getElementById("loadingProgress");
        if (progressEl) progressEl.style.width = `${progress}%`;
      };

      GameState.loadingManager.onLoad = () => {
        const paragraph = document.getElementById("paragraph");
        const button = document.getElementById("loadingButton");

        if (paragraph) paragraph.textContent = "Assets Loaded!";
        if (button) {
          button.disabled = false;
          button.textContent = "Start Game";
        }
      };

      // Set up button click handler
      const button = document.getElementById("loadingButton");
      if (button) {
        button.onclick = async () => {
          const screen = document.getElementById("splashScreen");
          if (screen) {
            screen.style.transition = "opacity 0.5s ease";
            screen.style.opacity = "0";
            await new Promise((r) =>
              screen.addEventListener("transitionend", r, { once: true })
            );
            this.removeUI("splashScreen");
          }
          if (onComplete) onComplete();
          resolve();
        };
      }

      // Start loading assets
      preloadCoreAssets()
        .then(() => preloadAllAudio())
        .then(() => preloadVideoAsset("/assets/videos/splash1.mp4"))
        .catch((err) => {
          console.error("Error loading assets:", err);
          const paragraph = document.getElementById("paragraph");
          if (paragraph) paragraph.textContent = "Error loading assets!";
        });
    });
  }

  //credits scene
  async showCredits(game) {
    // Fetch credits from JSON
    let credits = [];
    try {
      const res = await fetch("./Credits.json");
      credits = await res.json();
    } catch (err) {
      console.error("Failed to load credits:", err);
      credits = [{ name: "Error loading credits", assetLink: "#" }];
    }

    // Build HTML structure
    this.root.innerHTML = `
    <div class="credits-scene-container" id="credits-scene">
      <div class="credits-overlay">
        <h1 class="credits-title">Game Credits</h1>
        <div class="credits-scrollable" id="credits-scroll">
          ${credits
            .map(
              (entry) => `
            <div class="credit-entry">
              <p class="credit-name">${entry.name}</p>
              <a class="credit-link" href="${entry.assetLink}" target="_blank">${entry.assetLink}</a>
            </div>
          `
            )
            .join("")}
        </div>

        <div class="back-button-wrapper">
          <button id="back-to-menu" class="menu-action-button">
            <span class="button-text">Back to Menu</span>
          </button>
        </div>
      </div>
    </div>
  `;

    // Auto scroll animation
    const scrollEl = document.getElementById("credits-scroll");
    scrollEl.scrollTo({ top: 0 });

    function smoothScrollToBottom(element, duration) {
      const start = element.scrollTop;
      const end = element.scrollHeight - element.clientHeight;
      const distance = end - start;
      const startTime = performance.now();

      function animateScroll(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        element.scrollTop = start + distance * progress;
        if (progress < 1) {
          requestAnimationFrame(animateScroll);
        }
      }

      requestAnimationFrame(animateScroll);
    }

    smoothScrollToBottom(scrollEl, 60000);

    // Back button handler
    const backBtn = document.getElementById("back-to-menu");
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        game.audio.play("clickSound");
        game.audio.stopSound("music");
        game.sceneManager.switchTo("mainMenu");
      });
    }
  }

  //settings scene
  async showSettings(game) {
    this.root.innerHTML = `
    <div class="settings-scene-container" id="settings-scene">
      <div class="settings-overlay">
        <h1 class="settings-title">Game Settings</h1>

        <div class="setting-group">
          <label for="music-volume">Music Volume</label>
          <input type="range" id="music-volume" min="0" max="1" step="0.01" />
        </div>

        <div class="setting-group">
          <label for="sfx-volume">Sound Effects Volume</label>
          <input type="range" id="sfx-volume" min="0" max="1" step="0.01" />
        </div>

        <div class="setting-group">
          <label for="mute-toggle">Mute All Audio</label>
          <input type="checkbox" id="mute-toggle" />
        </div>

        <div class="setting-group">
          <label for="visual-quality">Visual Quality</label>
          <select id="visual-quality">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div class="setting-group">
          <label for="fullscreen-toggle">Fullscreen Mode</label>
          <input type="checkbox" id="fullscreen-toggle" />
        </div>

        <div class="setting-group">
          <label for="language-select">Language</label>
          <select id="language-select">
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
          </select>
        </div>

        <div class="setting-group">
          <label for="keyboard-layout-select">Keyboard Layout</label>
          <select id="keyboard-layout-select">
            <option value="wasd">WASD</option>
            <option value="arrows">Arrow Keys</option>
          </select>
        </div>

        <button id="back-from-settings" class="menu-action-button">
          <span class="button-text">Back to Menu</span>
        </button>
      </div>
    </div>`;

    const musicSlider = document.getElementById("music-volume");
    const sfxSlider = document.getElementById("sfx-volume");
    const muteCheckbox = document.getElementById("mute-toggle");
    const visualSelect = document.getElementById("visual-quality");
    const fullscreenToggle = document.getElementById("fullscreen-toggle");
    const languageSelect = document.getElementById("language-select");
    const keyboardSelect = document.getElementById("keyboard-layout-select");
    const backBtn = document.getElementById("back-from-settings");

    // Load saved settings or defaults
    musicSlider.value = localStorage.getItem("musicVolume") || 0.5;
    sfxSlider.value = localStorage.getItem("sfxVolume") || 1.0;
    muteCheckbox.checked = localStorage.getItem("audioMuted") === "true";
    visualSelect.value = localStorage.getItem("visualQuality") || "high";
    fullscreenToggle.checked = document.fullscreenElement != null;
    languageSelect.value = localStorage.getItem("language") || "en";
    keyboardSelect.value = localStorage.getItem("keyboardLayout") || "wasd";

    // Apply audio settings
    game.audio.setMusicVolume(parseFloat(musicSlider.value));
    game.audio.setSfxVolume(parseFloat(sfxSlider.value));
    game.audio.muteAll(muteCheckbox.checked);

    // Listeners
    musicSlider.oninput = (e) => {
      const vol = parseFloat(e.target.value);
      game.audio.setMusicVolume(vol);
      localStorage.setItem("musicVolume", vol);
    };
    sfxSlider.oninput = (e) => {
      const vol = parseFloat(e.target.value);
      game.audio.setSfxVolume(vol);
      localStorage.setItem("sfxVolume", vol);
    };
    muteCheckbox.onchange = (e) => {
      game.audio.muteAll(e.target.checked);
      localStorage.setItem("audioMuted", e.target.checked);
    };
    visualSelect.onchange = (e) => {
      localStorage.setItem("visualQuality", e.target.value);
      // Optionally adjust rendering quality via your engine
    };
    fullscreenToggle.onchange = async (e) => {
      if (e.target.checked) {
        await document.documentElement.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    };
    languageSelect.onchange = (e) => {
      localStorage.setItem("language", e.target.value);
      // Optionally reload UI strings or game localization
    };
    keyboardSelect.onchange = (e) => {
      localStorage.setItem("keyboardLayout", e.target.value);
      // Your input system should adapt based on this
    };

    backBtn.addEventListener("click", () => {
      game.audio.play("clickSound");
      game.audio.stopSound("music");
      game.sceneManager.switchTo("mainMenu");
    });

    // Fullscreen sync
    document.addEventListener("fullscreenchange", () => {
      fullscreenToggle.checked = document.fullscreenElement != null;
    });
  }

  async showProfile(game) {
    const publickey = getUserPublicKey();
    const displayKey =
      publickey && publickey.length >= 8
        ? `${publickey.slice(0, 6)}...${publickey.slice(-4)}`
        : "Connect Wallet";

    const createCornerDivs = (baseClass) =>
      Array.from(
        { length: 4 },
        (_, i) => `<div class="${baseClass}${i + 1}"></div>`
      ).join("");

    const DEFAULT_AVATAR =
      "https://www.arweave.net/qR_n1QvCaHqVTYFaTdnZoAXR6JBwWspDLtDNcLj2a5w?ext=png";

    // Reset profiles and fetch from chain
    this.profiles = [];
    let hasChainProfiles = false;

    if (publickey) {
      try {
        const { user: usersArray } = await client.findUsers({
          wallets: [publickey],
          includeProof: true,
        });

        if (usersArray?.length > 0) {
          const { profile: profilesArray } = await client.findProfiles({
            userIds: [usersArray[0].id],
            includeProof: true,
          });
          console.log("Chain Profiles:", profilesArray);

          if (profilesArray?.length > 0) {
            hasChainProfiles = true;

            // Transform profiles with XP and achievements
            this.profiles = profilesArray.map((profile, index) => {
              const profileInfo = profile.info || {};
              const customData = profile.customData || {};

              // Parse stats from customData if they exist
              const stats = customData.stats
                ? JSON.parse(customData.stats[0])
                : {
                    healthBoost: 0,
                    energyBoost: 0,
                    strengthBoost: 0,
                    speedBoost: 0,
                    energyEfficiency: 0,
                    energyCapacity: 0,
                    damageBoost: 0,
                    xpBoost: 0,
                  };

              return {
                name: profileInfo.name || "Unnamed",
                description: profileInfo.bio || "",
                image: profileInfo.pfp || DEFAULT_AVATAR,
                chosen: index === 0,
                isChainProfile: true,
                chainData: profile,
                address: profile.address,
                stats: stats, // Include the parsed stats
                xp: customData.xp ? parseInt(customData.xp[0]) : 0,
                achievements: customData.achievements
                  ? JSON.parse(customData.achievements[0])
                  : [],
                userId: profile.userId,
              };
            });
            36;
          }
        }
      } catch (error) {
        console.error("Error fetching chain profiles:", error);
      }
    }

    // If no chain profiles, show default disabled option
    if (!hasChainProfiles) {
      this.profiles = [
        {
          name: "Default",
          description: publickey
            ? "Create your first profile"
            : "Connect wallet to create profile",
          image: DEFAULT_AVATAR,
          chosen: true,
          isChainProfile: false,
          disabled: true,
          xp: 0,
          achievements: [],
          chainData: {
            info: {
              name: "Default",
              bio: "",
              pfp: DEFAULT_AVATAR,
            },
          },
        },
      ];
    }

    // Set the first profile as active in GameState if it exists
    if (
      this.profiles.length > 0 &&
      this.profiles[0].isChainProfile &&
      this.validateProfile(this.profiles[0].chainData)
    ) {
      const profileToSet = {
        ...this.profiles[0],
        identity: this.profiles[0].chainData?.identity || "main",
        address: this.profiles[0].chainData?.address || null,
        userId: this.profiles[0].chainData?.userId || null,
      };
      GameState.playerProfile.setProfile(profileToSet);
    }

    const createProfileBtn = (profile, index) => {
      const imageUrl = profile.image || DEFAULT_AVATAR;
      const disabledClass = profile.disabled ? "disabled" : "";
      const xpBadge = profile.isChainProfile
        ? `<div class="xp-badge">${profile.xp} XP</div>`
        : "";

      return `
            <label for="open${index}" class="open profile-btn ${disabledClass}" data-index="${index}" tabindex="0">
                <div class="profile-container">
                    <div class="avatar-container">
                        <img src="${imageUrl}" alt="${
        profile.name
      }" class="profile-img ${
        profile.chosen ? "chosen" : ""
      }" onerror="this.src='${DEFAULT_AVATAR}'" />
                        ${xpBadge}
                    </div>
                    <span class="profile-name">${profile.name}</span>
                </div>
                ${createCornerDivs("cornerCBtn")}
            </label>
        `;
    };

    // Rest of your method remains the same...
    const createYesNoForm = () => `
        <form id="customProfileForm" class="custom-profile-form">
            <label class="image-upload">
                <input type="file" accept="image/*" id="profileImageInput" required />
                <div class="image-preview"></div>
            </label>
            <div id="inputs">
                <input type="text" id="profileName" placeholder="Enter name" required />
                <textarea id="profileDesc" placeholder="Enter description" required></textarea>
                <button type="submit">Create Profile</button>
            </div>
        </form>
    `;

    const createYesNoBtn = (id, className, text) => `
        <label for="${id}" class="${className}" tabindex="1">
            <input type="radio" class="${id}" />
            <span>${text}</span>
            ${createCornerDivs(`cornerBtn${className === "yes" ? "1" : "2"}`)}
        </label>
    `;

    const radiosHTML =
      this.profiles
        .map(
          (_, i) =>
            `<input type="radio" name="toggle" class="open" id="open${i}" hidden />`
        )
        .join("") +
      `
        <input type="radio" name="toggle" id="yesCheck" class="yesCheck" hidden />
        <input type="radio" name="toggle" id="noCheck" class="noCheck" hidden />
    `;

    this.root.innerHTML = `
        <div class="main" id="main-profile">
            <div class="mainTitle"><span>Choose Or Create Profile</span></div>
            ${radiosHTML}
            <div class="menuOpenBtns">
                ${createCornerDivs("corner")}
                <div class="topHeadingDiv">
                    <p>Want to own your story?, connect Wallet</p>
                    <button id="connectWalletBtn">${
                      displayKey !== null ? displayKey : "Connect Wallet"
                    }</button>
                </div>
                <div class="selectionBtns">
                    ${this.profiles.map(createProfileBtn).join("")}
                </div>
            </div>

            <div class="overlay"></div>

            <div class="menuWrapper">
                ${createCornerDivs("corner")}
                <div class="menu">
                    <div class="topHeadingDiv">
                        <span style="padding-left: 1.5em;">Are you sure you want to choose this option?</span>
                    </div>
                    <div class="middleDiv">
                        <span style="padding-left: 1.5em;">Or Create a new Profile?</span>
                        ${createYesNoForm()}
                    </div>
                    <div class="bottomDiv">
                        <div class="buttons">
                            ${createYesNoBtn("yesCheck", "yes", "Yes")}
                            ${createYesNoBtn("noCheck", "no", "No")}
                        </div>
                    </div>
                </div>
            </div>
            <div id="bottom-button">
                <button id="bottom-btn">Continue</button>
            </div>
        </div>
    `;

    // Add CSS for XP badge
    const style = document.createElement("style");
    style.textContent = `
        .avatar-container {
            position: relative;
            display: inline-block;
        }
        .xp-badge {
            position: absolute;
            bottom: -5px;
            right: -5px;
            background: linear-gradient(135deg, #f5d742, #f5a742);
            color: #000;
            border-radius: 10px;
            padding: 2px 6px;
            font-size: 10px;
            font-weight: bold;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .profile-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
        }
        .profile-name {
            font-size: 14px;
            color: white;
            text-align: center;
            max-width: 80px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .profile-btn.disabled {
            opacity: 0.6;
            cursor: not-allowed;
            /*pointer-events: none;*/
        }
    `;
    this.root.appendChild(style);

    this.addProfileEventListeners(game);
    createSolanaWalletButton("#connectWalletBtn", () => {
      this.walletConnected = true;
      this.showProfile(game); // Refresh after wallet connect
    });
  }

  validateProfile(profile) {
    return (
      profile &&
      typeof profile === "object" &&
      profile.info &&
      typeof profile.info === "object"
    );
  }

  addProfileEventListeners(game) {
    const openRadios = document.querySelectorAll("input.open");
    const profileBtns = document.querySelectorAll(
      ".profile-btn:not(.disabled)"
    );
    const yesNoLabels = document.querySelectorAll("label.yes, label.no");
    const yesNoRadios = document.querySelectorAll(
      "input.yesCheck, input.noCheck"
    );
    const continueBtn = document.getElementById("bottom-btn");
    const fileInput = document.getElementById("profileImageInput");
    const imagePreview = document.querySelector(".image-preview");

    let currentIndex = 0;
    let inYesNoSection = false;
    let allowYesNoEnter = false;

    // Profile selection logic
    profileBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const dataIndex = btn.getAttribute("data-index");
        const index = parseInt(dataIndex, 10);

        // Update all profile selected states
        this.profiles.forEach((p, i) => {
          p.chosen = i === index;
        });

        this.selectedProfileIndex = index;
        openRadios[index].checked = true;

        // Set the selected profile in game state
        GameState.playerProfile.setProfile(this.profiles[index]);

        // Update UI to reflect selection
        document.querySelectorAll(".profile-img").forEach((img) => {
          img.classList.remove("chosen");
        });
        btn.querySelector(".profile-img").classList.add("chosen");

        GameState.audio.play("clickSound");

        setTimeout(() => {
          inYesNoSection = true;
          allowYesNoEnter = false;
          currentIndex = 1;
          yesNoLabels[currentIndex].classList.add("focused");
          yesNoLabels[currentIndex].focus();
          setTimeout(() => (allowYesNoEnter = true), 200);
        }, 100);
      });
    });

    // Yes/No button handlers
    yesNoLabels.forEach((label, index) => {
      label.addEventListener("click", () => {
        yesNoRadios[index].checked = true;
        GameState.audio.play("yesNoSound");

        if (index === 0) {
          // Yes
          this.showProfile(game);
        } else {
          // No
          inYesNoSection = false;
          currentIndex = 0;
          profileBtns[currentIndex].classList.add("focused");
          profileBtns[currentIndex].focus();
        }
      });
    });

    // Image preview handler
    fileInput?.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          imagePreview.style.backgroundImage = `url('${event.target.result}')`;
          imagePreview.style.backgroundSize = "cover";
          imagePreview.style.backgroundPosition = "center";
        };
        reader.readAsDataURL(file);
      }
    });

    // Form submission
    const form = document.getElementById("customProfileForm");
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await this.handleCustomProfileSubmit(game);
    });

    // Continue button
    continueBtn?.addEventListener("click", () => {
      GameState.game.sceneManager.switchTo("levelMenu");
    });
  }

  async handleCustomProfileSubmit(game) {
    const name = document.getElementById("profileName").value.trim();
    const desc = document.getElementById("profileDesc").value.trim();
    const fileInput = document.getElementById("profileImageInput");
    const file = fileInput.files[0];

    if (!file || !name || !desc) {
      alert("Please fill in all fields and upload an image.");
      return;
    }

    // Show loading state
    this.showMessage("Creating profile on blockchain...", "Please wait", 0);

    try {
      // First upload image to IPFS
      const imageUrl = await this.uploadToIPFS(file);

      // Then create on chain
      const result = await this.submitProfileToChain(name, desc, imageUrl);

      if (result?.status === "Success") {
        // Refresh to show new profile
        this.showProfile(game);
      } else {
        throw new Error("Chain creation failed");
      }
    } catch (error) {
      console.error("Profile creation failed:", error);
      alert("Failed to create profile on blockchain. Please try again.");
    } finally {
      this.clearMessage();
    }
  }

  async uploadToIPFS(file) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await axios.post(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
          pinata_api_key: import.meta.env.VITE_PINATA_API_KEY,
          pinata_secret_api_key: import.meta.env.VITE_PINATA_SECRET_KEY,
        },
      }
    );

    const ipfsHash = response.data.IpfsHash;
    return `https://aquamarine-working-thrush-698.mypinata.cloud/ipfs/${ipfsHash}`;
  }

  async submitProfileToChain(name, desc, imageUrl) {
    const pub = getUserPublicKey();
    if (!pub) {
      throw new Error("Wallet not connected");
    }

    const projectAddress = import.meta.env.VITE_PROJECT_KEY;
    const secret = JSON.parse(import.meta.env.VITE_ADMIN_KEY);

    if (!Array.isArray(secret) || secret.length !== 64) {
      throw new Error("Invalid admin key");
    }

    const adminKeyPair = web3.Keypair.fromSecretKey(new Uint8Array(secret));

    const { createNewUserWithProfileTransaction: txResponse } =
      await client.createNewUserWithProfileTransaction({
        project: projectAddress.toString(),
        wallet: pub.toString(),
        payer: adminKeyPair.publicKey.toString(),
        profileIdentity: "main",
        userInfo: {
          name: name,
          bio: desc,
          pfp: imageUrl,
        },
      });

    return await sendTransactionForTests(
      client,
      {
        blockhash: txResponse.blockhash,
        lastValidBlockHeight: txResponse.lastValidBlockHeight,
        transaction: txResponse.transaction,
      },
      [adminKeyPair],
      {
        skipPreflight: true,
        commitment: "finalized",
      }
    );
  }

  // Main menu
  showMainMenu(game) {
    this.root.innerHTML = `
    <div class="main-menu-container" id="main-menu">
        <video id="menu-bg-video" autoplay muted loop playsinline preload="auto">
            <source src="/assets/videos/splash1.mp4" type="video/mp4" />
        </video>

      <div class="main-menu-overlay">
        <h1 class="game-title">Bring Back Gladys</h1>

        <div class="main-buttons">
          <div class="menu-button">
            ${this.monsterHandSVG(true)}
            <button id="play-btn" class="menu-action-button">
              <span class="button-text">Play</span>
            </button>
            ${this.monsterHandSVG(false)}
          </div>

          <div class="menu-button">
            ${this.monsterHandSVG(true)}
            <button id="settings-btn" class="menu-action-button">
              <span class="button-text">Settings</span>
            </button>
            ${this.monsterHandSVG(false)}
          </div>

          <div class="menu-button">
            ${this.monsterHandSVG(true)}
            <button id="quit-btn" class="menu-action-button">
              <span class="button-text">Credits</span>
            </button>
            ${this.monsterHandSVG(false)}
          </div>
        </div>
      </div>
    </div>
  `;

    const animateButtonScare = (btnId) => {
      const button = document.getElementById(btnId);
      const span = button.querySelector(".button-text");

      GameState.audio.play("jumpscare");

      // Hide text and expand
      span.classList.add("hidden");
      button.classList.add("expanding");

      // Add scare image if not already there
      let scareImg = button.querySelector(".button-img");
      if (!scareImg) {
        scareImg = document.createElement("img");
        scareImg.src = "/assets/images/scare.png";
        scareImg.className = "button-img";
        button.appendChild(scareImg);
      }

      // Trigger sliding animation on next frame
      requestAnimationFrame(() => {
        scareImg.classList.add("show");
      });
    };

    const addMobileListener = (elementId, handler) => {
      const element = document.getElementById(elementId);
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
    };

    // Button actions with unified mobile/desktop handling
    const handlePlayButton = () => {
      animateButtonScare("play-btn");
      requestAnimationFrame(() => {
        setTimeout(() => {
          game.sceneManager.switchTo("profile");
          // game.sceneManager.switchTo("levelMenu");
        }, 1500);
      });
    };

    const handleSettingsButton = () => {
      animateButtonScare("settings-btn");
      requestAnimationFrame(() => {
        setTimeout(() => {
          game.sceneManager.switchTo("settings");
          // Add your settings menu logic here
        }, 1500);
      });
    };

    const handleCreditButton = () => {
      animateButtonScare("quit-btn");
      requestAnimationFrame(() => {
        setTimeout(() => {
          game.sceneManager.switchTo("credits");
          // Add your quit game logic here
        }, 1500);
      });
    };

    // Add event listeners for both mobile and desktop
    addMobileListener("play-btn", handlePlayButton);
    addMobileListener("settings-btn", handleSettingsButton);
    addMobileListener("quit-btn", handleCreditButton);

    // Add video play handler for iOS
    const video = document.getElementById("menu-bg-video");
    if (video) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          // Auto-play was prevented, add a play button overlay
          const playOverlay = document.createElement("div");
          playOverlay.className = "video-play-overlay";
          playOverlay.innerHTML = "▶";
          playOverlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            font-size: 5em;
            color: white;
            background: rgba(0,0,0,0.5);
            cursor: pointer;
            z-index: 10;
          `;
          playOverlay.addEventListener("click", () => {
            video.play();
            playOverlay.remove();
          });
          video.parentNode.appendChild(playOverlay);
        });
      }
    }
  }

  monsterHandSVG(mirror = false) {
    const transformStyle = mirror ? "transform: scaleX(-1);" : "";
    return `
    <div class="hand-container">
      <svg width="60" height="50" viewBox="0 0 90 70"
           xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
           class="hand-svg claw" style="${transformStyle}">
        <g transform="translate(-60, -20) scale(0.545, 0.636) rotate(45, 150, 100)">
          <path d="M150 100 Q145 85 160 70 Q165 65 170 80 Q175 95 170 110 Q165 125 150 100" fill="#e6e6e6"/>
          <path d="M160 70 Q170 50 190 20" stroke="#e6e6e6" stroke-width="6" fill="none" stroke-linecap="round"/>
          <path d="M165 75 Q175 55 200 25" stroke="#e6e6e6" stroke-width="6" fill="none" stroke-linecap="round"/>
          <path d="M170 80 Q180 60 210 30" stroke="#e6e6e6" stroke-width="6" fill="none" stroke-linecap="round"/>
          <path d="M175 90 Q185 70 215 40" stroke="#e6e6e6" stroke-width="6" fill="none" stroke-linecap="round"/>
          <path d="M165 105 Q170 95 180 85" stroke="#e6e6e6" stroke-width="6" fill="none" stroke-linecap="round"/>
          <path d="M190 20 L195 10" stroke="#e6e6e6" stroke-width="2"/>
          <path d="M200 25 L207 13" stroke="#e6e6e6" stroke-width="2"/>
          <path d="M210 30 L220 15" stroke="#e6e6e6" stroke-width="2"/>
          <path d="M215 40 L225 25" stroke="#e6e6e6" stroke-width="2"/>
          <path d="M180 85 L188 75" stroke="#e6e6e6" stroke-width="2"/>
        </g>
      </svg>
    </div>`;
  }

  //level Menu
  showLevelMenu(unlockedLevels, loadLevelCallback, resetProgressCallback) {
    const menuHTML = `
    <div class="menu hidden" id="menu">
      <h2>Select Level</h2>
      <div class="body">
        <div id="levelButtons"></div>
      </div>
      <button id="resetProgress">Reset Progress</button>
    </div>`;

    if (!document.getElementById("menu")) {
      document.body.insertAdjacentHTML("beforeend", menuHTML);
    }

    // Helper function to add both click and touch handlers
    const addMobileListener = (element, handler) => {
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
    };

    const populateLevelButtons = () => {
      const container = document.getElementById("levelButtons");
      if (!container) {
        setTimeout(populateLevelButtons, 100);
        return;
      }

      container.innerHTML = "";
      GameState.levelData.forEach((_, i) => {
        const fullName = GameState.levelData[i].name;
        const shortName = fullName.split(" - ")[0].trim();
        const shortLoc = fullName.split(" - ")[1].trim();
        const imageKey = shortName.toLowerCase().replace(/\s+/g, "");

        console.log(shortName);

        const anchor = document.createElement("div");
        anchor.className = "level-card";
        anchor.style.position = "relative";

        // const levelNumber = document.createElement("span");
        // levelNumber.textContent = `Level ${i + 1}`;
        // levelNumber.style.position = "absolute";
        // levelNumber.style.bottom = "-40px";
        // levelNumber.style.left = "50%";
        // levelNumber.style.transform = "translateX(-50%)";
        // levelNumber.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
        // levelNumber.style.color = "#fff";
        // levelNumber.style.fontSize = "14px";
        // levelNumber.style.padding = "5px 10px";
        // levelNumber.style.width = "100%";
        // levelNumber.style.textAlign = "center";
        // anchor.appendChild(levelNumber);

        const card = document.createElement("div");
        card.className = "card";
        const wrapper = document.createElement("div");
        wrapper.className = "wrapper";
        const coverImg = document.createElement("img");
        coverImg.src = `./assets/images/${imageKey}.png`;
        coverImg.className = "cover-image";
        const titleImg = document.createElement("h3");
        titleImg.innerHTML = `<span class="level-name">${shortName}</span><br><span class="level-location">${shortLoc}</span>`;
        titleImg.className = "title";
        const charImg = document.createElement("img");
        charImg.src = `./assets/images/${imageKey}1.png`;
        charImg.className = "character";
        charImg.width = "200";

        wrapper.appendChild(coverImg);
        card.appendChild(wrapper);
        card.appendChild(titleImg);
        card.appendChild(charImg);
        anchor.appendChild(card);

        if (i >= unlockedLevels) {
          anchor.classList.add("disabled-card");
          anchor.style.pointerEvents = "none";
          anchor.style.opacity = "0.4";
        } else {
          // Use our mobile listener helper instead of direct click handler
          addMobileListener(anchor, () => loadLevelCallback(i));
        }

        container.appendChild(anchor);
      });

      document.getElementById("menu").classList.remove("hidden");
    };

    // Use the mobile listener helper for the reset button too
    const resetBtn = document.getElementById("resetProgress");
    if (resetBtn) {
      addMobileListener(resetBtn, resetProgressCallback);
    }

    populateLevelButtons();
  }

  //loading screen
  async showLoadingScreen() {
    if (this.loadingScreenVisible) return;
    this.loadingScreenVisible = true;

    const loadingElement = document.createElement("div");
    loadingElement.id = "ui-loading-screen";
    loadingElement.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.7);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 9998;
      color: white;
      font-size: 2em;
      opacity: 0;
      transition: opacity 300ms ease-out;
    `;

    const spinner = document.createElement("div");
    spinner.style.cssText = `
      border: 5px solid #f3f3f3;
      border-top: 5px solid #3498db;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      animation: spin 1s linear infinite;
      margin-bottom: 20px;
    `;

    const text = document.createElement("div");
    text.textContent = "Loading...";

    loadingElement.appendChild(spinner);
    loadingElement.appendChild(text);
    document.body.appendChild(loadingElement);

    // Add animation
    const style = document.createElement("style");
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);

    // Force repaint before triggering transition
    void loadingElement.offsetWidth;
    loadingElement.style.opacity = "1";

    this.loadingElement = loadingElement;
    this.loadingStyle = style;
  }

  async hideLoadingScreen() {
    if (!this.loadingScreenVisible || !this.loadingElement) return;

    return new Promise((resolve) => {
      this.loadingElement.style.opacity = "0";
      this.loadingElement.addEventListener(
        "transitionend",
        () => {
          if (this.loadingElement && this.loadingElement.parentNode) {
            this.loadingElement.remove();
          }
          if (this.loadingStyle && this.loadingStyle.parentNode) {
            this.loadingStyle.remove();
          }
          this.loadingScreenVisible = false;
          resolve();
        },
        { once: true }
      );
    });
  }

  // Game HUD
  showGameHUD() {
    this.root.innerHTML = `
      <div id="ammoHUD">
        <p><img src="./assets/images/bullet.png" alt="" />Bullets:
          <span id="currentBullets">30</span> /
          <span id="totalBullets">${GameState.totalBullets}</span>
        </p>
        <span id="weapon-hud" class="hud-weapon">MP5</span>
        <p id="reloadMessage" style="display: none; color: red">Press R to Reload</p>
      </div>
      <div id="player-hud">
        <div id="player-health-bar">
          <div id="player-health"><img src="./assets/images/skull1.png" alt="" width="24" /></div>
        </div>
          <div id="battery-container">
            <div style="height: 100%; background: yellow; width: 100%" id="battery-bar" ></div>
          </div>
          <div id="energy-container">
            <div class="hud-label"><img src="./assets/images/flash.png" alt="" width="24" /></div>
            <div class="energy-bar-container">
              <div id="sprint-buildup-bar" class="buildup-bar"></div>
              <div id="energy-bar" class="energy-bar"></div>
            </div>
          </div>
      </div>
      <div id="timer-hud">
        <span id="game-timer">05:00</span>
      </div>
      <div id="spider-hud">
        <p><img src="./assets/images/spider.png" alt="" width="24" />Spiders: <span id="total-spiders">0</span></p>
        <p><img src="./assets/images/skull.png" alt="" width="16" />Kills: <span id="spiders-killed">0</span></p>
      </div>
    `;

    this.createFlashlightIndicator();
    if ("ontouchstart" in window || navigator.maxTouchPoints) {
      if (GameState.game.controlsSystem) {
        GameState.game.controlsSystem.setControlsEnabled(true);

        if (GameState.game.controlsSystem.isMobile) {
          this.refreshMobileControls();
        }
      }
      this.createMobileControls();
    }
  }

  updateTimerDisplay(seconds) {
    const timerElement = document.getElementById("game-timer");
    if (!timerElement) return;

    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const formattedTime = `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;

    timerElement.textContent = formattedTime;

    // Visual feedback when time is running low
    if (seconds <= GameState.timer.warningThreshold) {
      timerElement.style.color = seconds % 2 === 0 ? "red" : "white";
      timerElement.style.fontWeight = "bold";

      // Play warning sound every 10 seconds when time is low
      if (seconds % 10 === 0) {
        GameState.audio.play("warning", 0.5);
      }
    } else {
      timerElement.style.color = "white";
      timerElement.style.fontWeight = "normal";
    }
  }

  // Game state screens
  showGameOverPopup(_renderer, onRestart) {
    this.root.innerHTML = `
        <div id="game-over-popup">
            <h2>GAME OVER</h2>
            <p>You didn't survive the night...</p>
        <button id="restart-game">Restart</button>
      </div>
    `;

    const restartButton = document.getElementById("restart-game");
    if (!restartButton) return;

    // Shared handler function
    const handleRestart = async () => {
      // Unlock controls first
      if (GameState.controls) {
        GameState.controls.unlock();
      }

      // Execute restart callback
      if (onRestart) {
        await onRestart();
      }

      // Hide popup
      this.hidePopup();
    };

    // Add both click and touch handlers
    restartButton.addEventListener("click", handleRestart);
    restartButton.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        handleRestart();
      },
      { passive: false }
    );
  }

  hidePopup() {
    this.removeUI("game-over-popup");
  }

  // showGameWonPopup(renderer, onNextAction) {
  //   this.root.innerHTML = `
  //     <div id="game-won-popup">
  //       <h2>Game Won</h2>
  //       <p>You survived the spiders!</p>
  //       <button id="continue-button">Continue</button>
  //     </div>
  //   `;

  //   const continueButton = document.getElementById("continue-button");
  //   if (!continueButton) return;

  //   // Shared handler function
  //   const handleContinue = () => {
  //     if (renderer?.domElement?.parentNode) {
  //       renderer.renderLists.dispose();
  //       renderer.domElement.parentNode.removeChild(renderer.domElement);
  //     }
  //     this.removeAllUI();

  //     // Execute the provided callback
  //     if (typeof onNextAction === "function") {
  //       onNextAction();
  //     }
  //   };

  //   // Add both click and touch handlers
  //   continueButton.addEventListener("click", handleContinue);
  //   continueButton.addEventListener(
  //     "touchstart",
  //     (e) => {
  //       e.preventDefault();
  //       handleContinue();
  //     },
  //     { passive: false }
  //   );
  // }

  // Blocker/instructions screen
  showBlocker(onStartGame) {
    this.root.innerHTML = `
      <div id="blocker-wrapper">
        <div id="blocker">
          <div id="instructions">
            <div id="playButton">
              <h1>Play Now</h1>
              <p>
                ESC - Menu<br>
                WASD / ARROWS - Move<br>
                LEFT MOUSE / Spacebar - Fire<br>
                R Key - Reload
              </p>
            </div>
          </div>
        </div>
      </div>
    `;

    const playBtn = document.getElementById("playButton");
    if (playBtn) {
      playBtn.addEventListener("click", () => {
        if (GameState.controls) GameState.controls.lock();
        if (typeof onStartGame === "function") onStartGame();
        GameState.audio.play("./sounds/Breathing.ogg", 0.7, true);
        this.removeUI("blocker-wrapper");
      });
    }
  }
  hudElement = {
    show: (visible, html) => {
      this.removeUI("hud-notification");

      if (visible) {
        this.root.innerHTML += `
                    <div id="hud-notification" style="
                        position: fixed;
                        bottom: 20%;
                        left: 50%;
                        transform: translateX(-50%);
                        background: rgba(0,0,0,0.7);
                        color: white;
                        padding: 10px 20px;
                        border-radius: 5px;
                        z-index: 101;
                        text-align: center;
                    ">
                        ${html}
                    </div>
                `;
      }
    },
    hide: () => this.removeUI("hud-notification"),
  };

  //mobile controls
  createMobileControls() {
    this.removeMobileControls();

    const moveJoystick = this.createJoystick("move");
    this.root.appendChild(moveJoystick);

    const aimJoystick = this.createJoystick("aim");
    this.root.appendChild(aimJoystick);

    const actionButtons = this.createActionButtons();
    this.root.appendChild(actionButtons);
  }

  createJoystick(type) {
    const joystick = document.createElement("div");
    joystick.id = `joystick-${type}`;
    joystick.className = "joystick";
    joystick.style.cssText = `
    position: fixed;
    ${
      type === "move"
        ? "left: 30px; bottom: 30px;"
        : "right: 30px; bottom: 30px;"
    }
    width: 150px;
    height: 150px;
    touch-action: none;
    z-index: 1000;
  `;

    const base = document.createElement("div");
    base.id = `joystick-${type}-base`;
    base.className = "joystick-base";
    base.style.cssText = `
    position: relative;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.5);
  `;

    const knob = document.createElement("div");
    knob.id = `joystick-${type}-knob`;
    knob.className = "joystick-knob";
    knob.style.cssText = `
    position: absolute;
    width: 50%;
    height: 50%;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    top: 25%;
    left: 25%;
    transition: transform 0.1s;
  `;

    base.appendChild(knob);
    joystick.appendChild(base);

    return joystick;
  }

  createActionButtons() {
    const container = document.createElement("div");
    container.id = "mobile-action-buttons";

    // Fire button
    const shootBtn = this.createActionButton("shoot", "F");
    shootBtn.style.backgroundColor = "rgba(255, 0, 0, 0.5)";
    container.appendChild(shootBtn);

    // Reload button
    const reloadBtn = this.createActionButton("reload", "R");
    reloadBtn.style.backgroundColor = "rgba(255, 165, 0, 0.5)";
    container.appendChild(reloadBtn);

    // Flashlight button
    const flashlightBtn = this.createActionButton("flashlight", "L");
    flashlightBtn.style.backgroundColor = "rgba(255, 255, 0, 0.5)";
    container.appendChild(flashlightBtn);

    return container;
  }

  createActionButton(id, text) {
    const button = document.createElement("div");
    button.id = `mobile-${id}-btn`;
    button.className = "mobile-action-btn";
    button.textContent = text;
    return button;
  }

  removeMobileControls() {
    const ids = [
      "joystick-move",
      "joystick-aim",
      "mobile-action-buttons",
      "mobile-reload-btn",
      "mobile-flashlight-btn",
    ];

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }
  }

  showGameWonPopup() {
    // Clear any existing message
    this.clearMessage();

    // Create message container if it doesn't exist
    if (!this.messageContainer) {
      this.messageContainer = document.createElement("div");
      this.messageContainer.id = "game-message-container";
      this.messageContainer.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 20px 40px;
        border-radius: 10px;
        text-align: center;
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none;
      `;
      document.body.appendChild(this.messageContainer);
    }

    // Create title element if it doesn't exist
    if (!this.messageTitle) {
      this.messageTitle = document.createElement("h2");
      this.messageTitle.style.cssText = `
        margin: 0 0 10px 0;
        font-size: 2em;
        color: #4CAF50;
      `;
      this.messageContainer.appendChild(this.messageTitle);
    }

    // Create text element if it doesn't exist
    if (!this.messageText) {
      this.messageText = document.createElement("p");
      this.messageText.style.cssText = `
        margin: 0;
        font-size: 1.2em;
      `;
      this.messageContainer.appendChild(this.messageText);
    }

    // Set message content
    this.messageTitle.textContent = "Level Complete!";
    this.messageText.textContent = "Loading next level...";

    // Show message with fade in
    this.messageContainer.style.opacity = "1";

    // Auto-hide after delay
    this.messageTimeout = setTimeout(() => {
      this.clearMessage();
    }, 1500);
  }

  // Shows a customizable message (used by showGameWonPopup)
  showMessage(title, text, duration = 1500) {
    this.clearMessage();

    if (!this.messageContainer) {
      this.messageContainer = document.createElement("div");
      this.messageContainer.id = "game-message-container";
      this.messageContainer.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 20px 40px;
        border-radius: 10px;
        text-align: center;
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none;
      `;
      document.body.appendChild(this.messageContainer);
    }

    this.messageContainer.innerHTML = `
      <h2 style="margin: 0 0 10px 0; font-size: 2em; color: #4CAF50;">${title}</h2>
      <p style="margin: 0; font-size: 1.2em;">${text}</p>
    `;

    this.messageContainer.style.opacity = "1";

    this.messageTimeout = setTimeout(() => {
      this.clearMessage();
    }, duration);
  }

  // Clears any currently displayed message
  clearMessage() {
    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
      this.messageTimeout = null;
    }

    if (this.messageContainer) {
      this.messageContainer.style.opacity = "0";

      // Remove after fade out completes
      setTimeout(() => {
        if (this.messageContainer && this.messageContainer.parentNode) {
          this.messageContainer.parentNode.removeChild(this.messageContainer);
          this.messageContainer = null;
          this.messageTitle = null;
          this.messageText = null;
        }
      }, 300);
    }
  }

  // Shows an error message (can be used as fallback)
  showError(title, message) {
    this.showMessage(title, message, 3000);

    // Optionally add error styling
    if (this.messageContainer) {
      const titleElement = this.messageContainer.querySelector("h2");
      if (titleElement) {
        titleElement.style.color = "#f44336";
      }
    }
  }

  // Pause menu
  showPauseMenu() {
    const existingHUD = this.root.innerHTML;
    this.hidePauseMenu();

    this.root.innerHTML = `
        ${existingHUD}
        <div class="pauseMenu" id="pauseMenu">
            <div class="pause-menu">
                <div class="pause-menu-header">
                    <h2>GAME PAUSED</h2>
                    <div id="pause-timer">${this.formatTime(
                      GameState.timer.remaining
                    )}</div>
                    <button id="settings-gear" class="gear-button">⚙️ SETTINGS</button>
                </div>
                <button id="resume-button" class="pause-menu-btn">RESUME</button>
                <button id="restart-button" class="pause-menu-btn">RESTART LEVEL</button>
                <button id="main-menu-button" class="pause-menu-btn">MAIN MENU</button>
            </div>
        </div>
    `;

    // Disable controls when pausing
    if (GameState.game.controlsSystem) {
      GameState.game.controlsSystem.setControlsEnabled(false);
    }

    // Add mobile-friendly event listeners
    this.addPauseMenuEventListeners();

    const canvasBlocker = document.createElement("div");
    canvasBlocker.id = "canvas-blocker";
    canvasBlocker.className = "canvas-blocker";
    document.body.appendChild(canvasBlocker);
  }

  addPauseMenuEventListeners() {
    const addMobileListener = (elementId, handler) => {
      const element = document.getElementById(elementId);
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
    };

    // Resume button
    addMobileListener("resume-button", (e) => {
      e.preventDefault();
      const blocker = document.getElementById("canvas-blocker");
      if (blocker) blocker.remove();

      // Ensure controls exist before resuming
      if (!GameState.controls) {
        GameState.game.controlsSystem.reinitialize(
          GameState.renderer.domElement
        );
      }

      GameState.game.togglePause();

      if (!GameState.game.controlsSystem.isMobile) {
        setTimeout(() => {
          try {
            GameState.controlsSystem.ensurePointerLock();
            GameState.renderer.domElement.focus();
          } catch (err) {
            console.warn("Pointer lock error:", err);
          }
        }, 50);
      }
    });

    // Restart button
    addMobileListener("restart-button", async () => {
      GameState.game.controlsSystem.reinitialize(GameState.renderer.domElement);
      if (GameState.controls) {
        GameState.controls.unlock();
      }

      // Ensure controls exist before resuming
      if (!GameState.controls) {
        GameState.game.controlsSystem.reinitialize(
          GameState.renderer.domElement
        );
      }
      await GameState.game.resetCurrentLevel();
      this.hidePauseMenu();
    });

    // Main menu button
    addMobileListener("main-menu-button", async () => {
      // Pause the game first
      GameState.game.stopGameLoop();
      GameState.game.togglePause();

      // Clean up controls first
      if (GameState.controlsSystem) {
        await GameState.controlsSystem.cleanup();
      }

      const currentScene = GameState.game.sceneManager.currentScene;
      if (currentScene?.cleanup) {
        await currentScene.cleanup();
      }

      GameState.audio.stopAllSounds();

      GameState.game.resetLevelState();

      this.removeAllUI();

      const blocker = document.getElementById("canvas-blocker");
      if (blocker) blocker.remove();
      GameState.game.cleanupEverything();

      await GameState.game.sceneManager.switchTo("mainMenu");
    });

    // Settings gear
    addMobileListener("settings-gear", (e) => {
      e.stopPropagation();
      this.showSettingsPopup();
    });
  }

  hidePauseMenu() {
    const pauseMenu = document.getElementById("pauseMenu");
    if (pauseMenu) {
      pauseMenu.remove();
    }
    const blocker = document.getElementById("canvas-blocker");
    if (blocker) blocker.remove();

    // Re-enable controls and refresh mobile UI
    if (GameState.game.controlsSystem) {
      GameState.game.controlsSystem.setControlsEnabled(true);

      if (GameState.game.controlsSystem.isMobile) {
        this.refreshMobileControls();
      }
    }
  }

  refreshMobileControls() {
    this.removeMobileControls();
    this.createMobileControls();

    setTimeout(() => {
      if (GameState.game.controlsSystem) {
        GameState.game.controlsSystem.setupMobileControls();
      }
    }, 50);
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }

  showContextMenu(index, item, x, y) {
    this.contextMenu.show(index, item, x, y);
  }

  // Effects
  showBloodOverlay() {
    // Remove existing overlay if any
    if (this.domElements.bloodOverlay) {
      this.domElements.bloodOverlay.remove();
    }

    // Create new overlay
    this.domElements.bloodOverlay = document.createElement("div");
    this.domElements.bloodOverlay.id = "blood-overlay";

    this.root.appendChild(this.domElements.bloodOverlay);

    // Trigger animation
    requestAnimationFrame(() => {
      if (this.domElements.bloodOverlay) {
        this.domElements.bloodOverlay.style.opacity = "0.8";
      }

      // Fade out after 1 second
      setTimeout(() => {
        if (this.domElements.bloodOverlay) {
          this.domElements.bloodOverlay.style.opacity = "0";
        }

        // Remove after fade out completes
        setTimeout(() => {
          if (this.domElements.bloodOverlay?.parentNode) {
            this.domElements.bloodOverlay.remove();
            this.domElements.bloodOverlay = null;
          }
        }, 300);
      }, 1000);
    });
  }

  createFlashlightIndicator() {
    const indicator = document.getElementById("battery-container");
    this.domElements.flashlightIndicator = document.createElement("div");
    this.domElements.flashlightIndicator.id = "flashlight-indicator";
    Object.assign(this.domElements.flashlightIndicator.style, {
      position: "absolute",
      top: "-5px",
      left: "-4px",
      backgroundImage: "url(./assets/images/flashlight_on.png)",
      backgroundSize: "cover",
      transition: "opacity 0.2s",
      pointerEvents: "none",
      border: "1px #8282a9 solid",
      borderRadius: "50%",
      backgroundColor: "white",
    });
    indicator.appendChild(this.domElements.flashlightIndicator);
  }

  // Utility methods
  removeUI(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  showTimeExpiredMessage(onConfirm) {
    this.removeAllUI(); // Clear existing UI

    this.root.innerHTML = `
        <div id="time-expired-popup">
            <div class="time-expired-content">
                <h2>TIME'S UP!</h2>
                <p>You didn't complete the level in time</p>
                <button id="retry-button">Retry Level</button>
            </div>
        </div>
    `;

    const retryButton = document.getElementById("retry-button");
    if (!retryButton) return;

    // Helper function to handle the retry action
    const handleRetry = async () => {
      if (typeof onConfirm === "function") {
        await onConfirm();
      }
      this.removeUI("time-expired-popup");
    };

    // Add both click and touch handlers
    retryButton.addEventListener("click", handleRetry);
    retryButton.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        handleRetry();
      },
      { passive: false }
    );
  }

  removeAllUI() {
    this.clearMessage();
    const ids = [
      "splashScreen",
      "splash",
      "menu",
      "main-menu",
      "blocker-wrapper",
      "ammoHUD",
      "player-hud",
      "blood-overlay",
      "spider-hud",
      "game-over-popup",
      "game-won-popup",
      "flashlight-indicator",
      "canvas-blocker",
      "pauseMenu",
      "main-profile",
    ];
    ids.forEach((id) => this.removeUI(id));
  }

  showReloadMessage(show = true) {
    const reloadEl = document.getElementById("reloadMessage");
    if (reloadEl) {
      reloadEl.style.display = show ? "block" : "none";
    }
  }

  showSettingsPopup() {
    // Remove existing popup if any
    const existingPopup = document.getElementById("settings-popup");
    if (existingPopup) {
      existingPopup.remove();
    }

    // Create popup container
    const popup = document.createElement("div");
    popup.id = "settings-popup";
    popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.9);
        padding: 20px;
        border-radius: 10px;
        z-index: 10001;
        width: 300px;
        max-width: 90%;
        border: 1px solid #444;
        user-select: none;
        -webkit-user-select: none;
        touch-action: manipulation;
        pointer-events: auto;
    `;

    // Create title and close button container
    const header = document.createElement("div");
    header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 1px solid #444;
        pointer-events: auto;
    `;

    // Title
    const title = document.createElement("h3");
    title.textContent = "Settings";
    title.style.cssText = `
        margin: 0;
        color: white;
        pointer-events: none;
    `;

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = "&times;";
    closeBtn.style.cssText = `
        background: none;
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
        padding: 0 8px;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        pointer-events: auto;
    `;

    // Create settings content
    const settingsContent = document.createElement("div");
    settingsContent.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 15px;
        pointer-events: auto;
    `;

    // Music volume slider
    const musicControl = document.createElement("div");
    musicControl.style.cssText =
      "display: flex; flex-direction: column; gap: 5px; pointer-events: auto;";
    const musicLabel = document.createElement("label");
    musicLabel.textContent = "Music Volume";
    musicLabel.style.cssText = "color: white; pointer-events: none;";
    const musicSlider = document.createElement("input");
    musicSlider.type = "range";
    musicSlider.id = "musicVolume";
    musicSlider.min = "0";
    musicSlider.max = "1";
    musicSlider.step = "0.01";
    musicSlider.value = GameState.audio.musicVolume;
    musicSlider.style.cssText =
      "touch-action: manipulation; -webkit-tap-highlight-color: transparent;";
    musicControl.appendChild(musicLabel);
    musicControl.appendChild(musicSlider);

    // SFX volume slider
    const sfxControl = document.createElement("div");
    sfxControl.style.cssText =
      "display: flex; flex-direction: column; gap: 5px; pointer-events: auto;";
    const sfxLabel = document.createElement("label");
    sfxLabel.textContent = "SFX Volume";
    sfxLabel.style.cssText = "color: white; pointer-events: none;";
    const sfxSlider = document.createElement("input");
    sfxSlider.type = "range";
    sfxSlider.id = "sfxVolume";
    sfxSlider.min = "0";
    sfxSlider.max = "1";
    sfxSlider.step = "0.01";
    sfxSlider.value = GameState.audio.sfxVolume;
    sfxSlider.style.cssText =
      "touch-action: manipulation; -webkit-tap-highlight-color: transparent;";
    sfxControl.appendChild(sfxLabel);
    sfxControl.appendChild(sfxSlider);

    // Mute button
    const muteBtn = document.createElement("button");
    muteBtn.id = "muteBtn";
    muteBtn.textContent = GameState.audio.isMuted
      ? "Unmute Audio"
      : "Mute Audio";
    muteBtn.style.cssText = `
        padding: 8px;
        background: #333;
        color: white;
        border: 1px solid #555;
        border-radius: 4px;
        cursor: pointer;
        margin-top: 10px;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        pointer-events: auto;
    `;

    // Assemble UI
    header.appendChild(title);
    header.appendChild(closeBtn);
    popup.appendChild(header);

    settingsContent.appendChild(musicControl);
    settingsContent.appendChild(sfxControl);
    settingsContent.appendChild(muteBtn);
    popup.appendChild(settingsContent);

    // Add to DOM in a way that ensures it's above canvas
    const uiContainer = document.getElementById("game-ui") || document.body;
    uiContainer.appendChild(popup);

    // Event listeners - use both mouse and touch events
    const addMobileListener = (element, event, handler) => {
      element.addEventListener(event, handler);
      element.addEventListener(`touch${event}`, handler, { passive: true });
    };

    addMobileListener(closeBtn, "click", () => {
      popup.remove();
    });

    musicSlider.addEventListener("input", (e) => {
      GameState.audio.setMusicVolume(parseFloat(e.target.value));
    });

    sfxSlider.addEventListener("input", (e) => {
      GameState.audio.setSfxVolume(parseFloat(e.target.value));
    });

    addMobileListener(muteBtn, "click", () => {
      GameState.audio.muteAll(!GameState.audio.isMuted);
      muteBtn.textContent = GameState.audio.isMuted
        ? "Unmute Audio"
        : "Mute Audio";
    });

    // Close when clicking outside - works for both mouse and touch
    const handleOutsideClick = (e) => {
      if (popup && !popup.contains(e.target)) {
        popup.remove();
        document.removeEventListener("click", handleOutsideClick);
        document.removeEventListener("touchstart", handleOutsideClick);
      }
    };

    document.addEventListener("click", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick, {
      passive: true,
    });

    // Prevent canvas from blocking touches
    const canvas = document.querySelector("canvas");
    if (canvas) {
      canvas.style.pointerEvents = "none";

      // Restore pointer events when popup closes
      const observer = new MutationObserver(() => {
        if (!document.contains(popup)) {
          canvas.style.pointerEvents = "auto";
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  clear() {
    this.root.innerHTML = "";
  }
}
