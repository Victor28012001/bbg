export class WalletModal {
  constructor() {
    this.modal = document.createElement("div");
    this.modal.className = "wallet-modal hidden";
    this.modal.innerHTML = `
        <div class="wallet-modal-content">
          <h2>Select a Wallet</h2>
          <ul id="walletList"></ul>
          <button id="closeWalletModal">Close</button>
        </div>
      `;
    this.walletList = this.modal.querySelector("#walletList");
    this.closeBtn = this.modal.querySelector("#closeWalletModal");

    document.body.appendChild(this.modal);

    this.closeBtn.addEventListener("click", () => this.close());
  }

  open(wallets, onSelect) {
    this.walletList.innerHTML = "";
    wallets.forEach((wallet) => {
      const li = document.createElement("li");
      li.textContent = wallet.name;
      li.addEventListener("click", () => {
        this.close();
        onSelect(wallet);
      });
      this.walletList.appendChild(li);
    });

    this.modal.classList.remove("hidden");
  }

  close() {
    this.modal.classList.add("hidden");
  }
}

// Optional: include this via CSS or inject programmatically
export const walletModalStyles = `
    .wallet-modal {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.6);
      display: flex; align-items: center; justify-content: center;
      z-index: 9999;
      font-family: "Karantina", system-ui;
    }
    .wallet-modal.hidden {
      display: none;
    }
    .wallet-modal-content {
      background: white;
      padding: 20px;
      border-radius: 8px;
      min-width: 300px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }
    #walletList {
      list-style: none; padding: 0; margin: 20px 0;
    }
    #walletList li {
      padding: 10px; cursor: pointer;
      border: 1px solid #ccc;
      margin-bottom: 10px;
      border-radius: 4px;
      text-align: center;
      transition: background 0.2s ease;
    }
    #walletList li:hover {
      background: #f0f0f0;
    }
    #closeWalletModal {
        padding: 10px; margin: 10px 0;
      font-family: "Karantina", system-ui;
      font-size: 14px;
    }
  `;
