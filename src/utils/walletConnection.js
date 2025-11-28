// walletConnection.js
// import { post, get, put } from "./api.js"; // Update if you need to adjust API import paths
import { WalletModal, walletModalStyles } from "../entities/walletModal.js"; // Update path if needed
import { setUserPublicKey, clearUserPublicKey } from "./walletState.js";
// import { setUser, getState } from "./state.js";

export function createSolanaWalletButton(buttonSelector) {
  const connectBtn = document.querySelector(buttonSelector);
  if (!connectBtn) return;

  const modal = new WalletModal();
  injectStyles(walletModalStyles);

  let originalText = connectBtn.textContent;
  connectBtn.dataset.connected = "false";

  function getAvailableWallets() {
    const wallets = [];

    if (window.solana?.isPhantom) {
      wallets.push({ name: "Phantom", provider: window.solana });
    }

    if (window.backpack?.solana) {
      wallets.push({ name: "Backpack", provider: window.backpack.solana });
    }

    if (window.solflare?.isSolflare) {
      wallets.push({ name: "Solflare", provider: window.solflare });
    }

    return wallets;
  }

  async function connect(wallet) {
    try {
      const walletProvider = wallet.provider;
      const res = await walletProvider.connect();
      const publicKey =
        res?.publicKey?.toString() || walletProvider.publicKey?.toString();
      const displayKey = `${publicKey.slice(0, 6)}...${publicKey.slice(-4)}`;
      setUserPublicKey(publicKey);
      //   const data = await get(`/players/${publicKey}`);
      //   const playerExists = data.exists;

      //   if (playerExists && data.player) {
      //     // setUser(data.player);
      //     // console.log(getState().user);
      //   } else {
      //     console.log("Player does not exist in DB.");
      //   }

      connectBtn.textContent = displayKey;
      connectBtn.dataset.content = displayKey;
      connectBtn.dataset.connected = "true";
      connectBtn.dataset.walletName = wallet.name;
      console.log(`${wallet.name} connected:`, publicKey);

      walletProvider.on?.("disconnect", () => {
        connectBtn.textContent = originalText;
        connectBtn.dataset.content = originalText;
        connectBtn.dataset.connected = "false";
        console.log(`${wallet.name} disconnected.`);
      });
    } catch (err) {
      console.error(`${wallet.name} connection failed:`, err);
    }
  }

  async function disconnect(wallet) {
    try {
      if (wallet.disconnect) {
        await wallet.disconnect();
      }
      clearUserPublicKey();
      connectBtn.textContent = originalText || "Connect Wallet";
      connectBtn.dataset.content = originalText || "Connect Wallet";
      connectBtn.dataset.connected = "false";
      connectBtn.dataset.walletName = "";
    } catch (err) {
      console.error(`Failed to disconnect ${wallet.name}:`, err);
    }
  }

  connectBtn.addEventListener("click", async () => {
    const wallets = getAvailableWallets();

    if (connectBtn.dataset.connected === "true") {
      const walletName = connectBtn.dataset.walletName;
      const wallet = wallets.find((w) => w.name === walletName);
      if (wallet) {
        await disconnect(wallet.provider);
      }
      return;
    }

    if (wallets.length === 0) {
      alert(
        "No supported wallets found. Please install Phantom, Backpack, or Solflare."
      );
      window.open("https://phantom.app", "_blank");
      return;
    }

    if (wallets.length === 1) {
      await connect(wallets[0]);
    } else {
      modal.open(wallets, async (selectedWallet) => {
        await connect(selectedWallet);
      });
    }
  });

  window.addEventListener("load", async () => {
    const wallets = getAvailableWallets();

    for (const wallet of wallets) {
      try {
        const res = await wallet.provider.connect({ onlyIfTrusted: true });
        const publicKey =
          res?.publicKey?.toString() || wallet.provider.publicKey?.toString();
        setUserPublicKey(publicKey);
        // const data = await get(`/players/${publicKey}`);
        // const playerExists = data.exists;

        // if (playerExists && data.player) {
        // //   setUser(data.player);
        // //   console.log(getState().user);
        // }

        if (publicKey) {
          const displayKey = `${publicKey.slice(0, 6)}...${publicKey.slice(
            -4
          )}`;
          connectBtn.textContent = displayKey;
          connectBtn.dataset.content = displayKey;
          connectBtn.dataset.connected = "true";
          connectBtn.dataset.walletName = wallet.name;
          console.log(`Auto-connected ${wallet.name}:`, publicKey);
          break;
        }
      } catch (err) {
        console.debug(`Silent connect failed for ${wallet.name}`);
      }
    }
  });
}

function injectStyles(styleStr) {
  const style = document.createElement("style");
  style.textContent = styleStr;
  document.head.appendChild(style);
}
