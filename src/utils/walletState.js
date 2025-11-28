let userPublicKey = localStorage.getItem("userPublicKey") || null;

export function setUserPublicKey(key) {
  userPublicKey = key;
  localStorage.setItem("userPublicKey", key);
}

export function getUserPublicKey() {
  return userPublicKey;
}

export function clearUserPublicKey() {
  userPublicKey = null;
  localStorage.removeItem("userPublicKey");
}

export function isWalletConnected() {
  const publicKey = getUserPublicKey();
  const wallet = window.solana || window.solflare;
  return !!publicKey && !!wallet && wallet.isConnected;
}

export async function ensureWalletConnected() {
  if (!isWalletConnected()) {
    const wallet = window.solana || window.solflare;
    if (wallet) {
      try {
        await wallet.connect();
        return true;
      } catch (error) {
        console.error("Wallet connection failed:", error);
        return false;
      }
    }
    return false;
  }
  return true;
}
