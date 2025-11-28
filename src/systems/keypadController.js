import { GameState } from "../core/GameState.js";

export class KeypadController {
  constructor({
    scene,
    elevator,
    keypadModel,
    triggerDistance,
    levelCode,
  }) {
    this.scene = scene;
    this.elevatorModel = elevator.model ? elevator.model : elevator;
    this.elevatorAnimations = elevator.animations;
    this.elevatorPosition = this.elevatorModel.position.clone();
    this.triggerDistance = triggerDistance;
    this.levelCode = levelCode;
    
    // Initialize properties
    this.keypad = null;
    this.keypadBox = null;
    this.triggerZone = null;
    this.playerInRange = false;
    this.tempVec = new THREE.Vector3();
    this.currentCode = [];
    this.correctCode = levelCode.split("").map(Number);
    this.isCompleted = false;

    // Create UI elements
    this.createTooltip();
    this.createKeypadUI();
    
    // Initialize keypad with preloaded model
    this.initKeypad(keypadModel);

    document.addEventListener("keydown", (e) => this.handleKeyPress(e));
  }

  createTooltip() {
    this.tooltipElement = document.createElement("div");
    this.tooltipElement.className = "door-tooltip";
    this.tooltipElement.innerHTML = "Press E to use keypad";
    this.tooltipElement.style.position = "absolute";
    this.tooltipElement.style.display = "none";
    document.body.appendChild(this.tooltipElement);
  }

  createKeypadUI() {
    this.keypadModal = document.createElement("div");
    this.keypadModal.className = "keypad-modal";
    this.keypadModal.style.display = "none";

    const modalContent = document.createElement("div");
    modalContent.className = "modal-content";

    const inputCont = document.createElement("div");
    inputCont.className = "inputCont";

    const warning = document.createElement("p");
    warning.className = "warning";
    warning.textContent =
      "Please enter a valid code, you have only 4 tries or press Q to close.";
    warning.style.color = "red";

    this.statusLight = document.createElement("div");
    this.statusLight.className = "status-light";

    this.codeInputs = Array(4)
      .fill()
      .map((_, i) => {
        const input = document.createElement("input");
        input.type = "text";
        input.maxLength = 1;
        input.className = "code-input";
        input.addEventListener("input", (e) => this.handleInput(e, i));
        return input;
      });

    const submitBtn = document.createElement("button");
    submitBtn.className = "submit-btn";
    submitBtn.textContent = "SUBMIT";
    submitBtn.addEventListener("click", () => this.checkCode());

    modalContent.appendChild(this.statusLight);
    this.codeInputs.forEach((input) => inputCont.appendChild(input));
    modalContent.appendChild(inputCont);
    modalContent.appendChild(submitBtn);
    modalContent.appendChild(warning);
    this.keypadModal.appendChild(modalContent);
    document.body.appendChild(this.keypadModal);
  }

  initKeypad(keypadModel) {
    try {
      this.keypad = keypadModel.clone();
      const keypadOffset = new THREE.Vector3(1.05, 2.5, 2);
      this.keypad.position.copy(this.elevatorPosition).add(keypadOffset);
      this.keypad.name = "keypad";
      this.scene.add(this.keypad);

      this.keypadBox = new THREE.Box3().setFromObject(this.keypad);
      this.createTriggerZone();
    } catch (error) {
      console.error("Failed to initialize keypad:", error);
      this.createFallbackKeypad();
    }
  }

  createFallbackKeypad() {
    // Simple fallback keypad
    const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.1);
    const material = new THREE.MeshBasicMaterial({ color: 0x333333 });
    this.keypad = new THREE.Mesh(geometry, material);
    
    const keypadOffset = new THREE.Vector3(1.05, 2.5, 2);
    this.keypad.position.copy(this.elevatorPosition).add(keypadOffset);
    this.keypad.name = "fallback-keypad";
    this.scene.add(this.keypad);
    
    this.keypadBox = new THREE.Box3().setFromObject(this.keypad);
    this.createTriggerZone();
  }

  createTriggerZone() {
    const triggerMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });

    const triggerGeometry = new THREE.CircleGeometry(this.triggerDistance, 32);
    this.triggerZone = new THREE.Mesh(triggerGeometry, triggerMaterial);
    this.triggerZone.rotation.x = -Math.PI / 2;
    this.triggerZone.position.copy(this.keypad.position.clone().setY(0.1));
    this.triggerZone.name = "KeypadTriggerZone";
    this.triggerZone.visible = false;
    this.scene.add(this.triggerZone);
  }

  handleInput(e, index) {
    const value = e.target.value.replace(/\D/g, "");
    e.target.value = value;
    this.currentCode[index] = value ? parseInt(value) : null;

    if (value && index < 3) {
      this.codeInputs[index + 1].focus();
    }
  }

  checkCode() {
    const enteredCode = this.currentCode.join("");

    if (enteredCode === this.correctCode.join("")) {
      this.statusLight.style.backgroundColor = "green";
      this.keypadModal.style.display = "none";
      this.currentCode = [];
      this.codeInputs.forEach((input) => (input.value = ""));
      GameState.game.controlsSystem.isMobile?GameState.controls.lock():GameState.controls.lock();
      this.isCompleted = true;

      if (this.elevatorAnimations?.length) {
        if (!GameState.elevator?.mixer) {
          GameState.elevator.mixer = new THREE.AnimationMixer(this.elevatorModel);
        }

        const openAnim = this.elevatorAnimations.find(
          (anim) => anim.name === "02_open"
        );

        if (openAnim) {
          const action = GameState.elevator.mixer.clipAction(openAnim);
          action.reset();
          action.clampWhenFinished = true;
          action.setLoop(THREE.LoopOnce);
          action.play();

          if (!GameState.mixers.includes(GameState.elevator.mixer)) {
            GameState.mixers.push(GameState.elevator.mixer);
          }
          GameState.elevatorOpened = true;

          setTimeout(() => {
            GameState.elevatorOpened = false;
          }, openAnim.duration * 1000);
        }
      }
    } else {
      this.statusLight.style.backgroundColor = "red";
      const closeListener = (e) => {
        if (e.key.toLowerCase() === "q") {
          this.keypadModal.style.display = "none";
          GameState.game.controlsSystem.isMobile?GameState.controls.lock():GameState.controls.lock();
          document.removeEventListener("keydown", closeListener);
        }
      };
      document.addEventListener("keydown", closeListener);
    }
  }

  handleKeyPress(event) {
    if (event.key.toLowerCase() === "e" && this.playerInRange) {
      this.activateKeypad();
    }
  }

  activateKeypad() {
    this.keypadModal.style.display = "block";
    this.codeInputs[0].focus();
    GameState.controls.unlock();

    document.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "q") {
        this.keypadModal.style.display = "none";
        GameState.game.controlsSystem.isMobile?GameState.controls.lock():GameState.controls.lock();
      }
    });
  }

  showTooltip() {
    this.tooltipElement.style.display = "block";
    this.tooltipElement.style.left = `${
      window.innerWidth / 2 - this.tooltipElement.offsetWidth / 2
    }px`;
    this.tooltipElement.style.top = `${window.innerHeight / 2 + 50}px`;
  }

  hideTooltip() {
    this.tooltipElement.style.display = "none";
  }

  update() {
    if (!GameState.controls || !this.triggerZone || !this.keypad) return;

    const player = GameState.game.controlsSystem.isMobile ? GameState.camera : GameState.controls.getObject();
    const playerPos = player.position;
    const keypadPos = this.keypad.position.clone();
    this.triggerZone.getWorldPosition(this.tempVec);
    const distance = playerPos.distanceTo(this.tempVec);
    const isInRange = distance <= this.triggerDistance;
    let dot = 0;
    let isFacing = false;

    if (isInRange) {
      const playerForward = new THREE.Vector3()
        .setFromMatrixColumn(GameState.camera.matrixWorld, 0)
        .normalize();

      const toKeypad = new THREE.Vector3()
        .subVectors(keypadPos, playerPos)
        .normalize();

      dot = playerForward.dot(toKeypad);
      const maxDot = Math.cos(51 * (Math.PI / 180));
      const minDot = Math.cos(121 * (Math.PI / 180));
      isFacing = dot <= maxDot && dot >= minDot;
    }

    this.playerInRange = isInRange && isFacing;

    if (this.playerInRange) {
      this.showTooltip();
    } else {
      this.hideTooltip();
    }
  }

  cleanup() {
    document.removeEventListener("keydown", this.handleKeyPress);
    if (this.tooltipElement && this.tooltipElement.parentNode) {
      document.body.removeChild(this.tooltipElement);
    }
    if (this.keypadModal && this.keypadModal.parentNode) {
      document.body.removeChild(this.keypadModal);
    }
    if (this.keypad && this.scene) {
      this.scene.remove(this.keypad);
    }
    if (this.triggerZone && this.scene) {
      this.scene.remove(this.triggerZone);
    }
  }
}