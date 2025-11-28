// PlayerProfile.js
import { getUserPublicKey } from "../utils/walletState.js";
import { client } from "../utils/honeyCombServices.js";
import { BadgesCondition } from "@honeycomb-protocol/edge-client";
import {
  isWalletConnected,
  ensureWalletConnected,
} from "../utils/walletState.js";
import bs58 from "bs58";
import * as web3 from "@solana/web3.js";
import { Buffer } from "buffer";
import { sendClientTransactions } from "@honeycomb-protocol/edge-client/client/walletHelpers.js";

const PROJECT_ADDRESS = import.meta.env.VITE_PROJECT_KEY;

export class PlayerProfile {
  constructor() {
    this.currentProfile = {
      address: null,
      identity: null,
      info: {
        name: "Guest",
        bio: "",
        pfp: "",
      },
      userId: null,
      stats: {
        // Initialize stats with default values
        healthBoost: 0,
        energyBoost: 0,
        strengthBoost: 0,
        speedBoost: 0,
        energyEfficiency: 0,
        energyCapacity: 0,
        damageBoost: 0,
        xpBoost: 0,
      },
      xp: 0,
      achievements: [],
      levelsClaimed: [],
    };
  }

  setProfile(profileData) {
    if (!profileData) {
      console.warn("Attempted to set null profile");
      return;
    }

    // Preserve existing stats or initialize new ones
    const currentStats = this.currentProfile?.stats || {
      healthBoost: 0,
      energyBoost: 0,
      strengthBoost: 0,
      speedBoost: 0,
      energyEfficiency: 0,
      energyCapacity: 0,
      damageBoost: 0,
      xpBoost: 0,
    };

    this.currentProfile = {
      address: profileData.address || null,
      identity: profileData.identity || "guest",
      info: {
        name: profileData.info?.name || "Unnamed",
        bio: profileData.info?.bio || "",
        pfp: profileData.info?.pfp || "",
      },
      userId: profileData.userId || null,
      stats: {
        ...currentStats,
        ...(profileData.stats || {}),
      },
      xp: profileData.xp || 0,
      achievements: profileData.achievements || [],
      levelsClaimed: profileData.levelsClaimed || [],
    };
  }

  async updateXP(amount) {
    this.currentProfile.xp += amount;
  }

  async addAchievement(achievement) {
    console.log("Adding achievement:", achievement);
    try {
      if (!achievement?.name) {
        throw new Error("Invalid achievement: missing name");
      }

      if (!this.currentProfile) {
        throw new Error("No profile exists to add achievement to");
      }

      if (!this.currentProfile) {
        this.currentProfile = this.createDefaultProfile();
      }

      if (!this.currentProfile.achievements) {
        this.currentProfile.achievements = [];
      }
      if (!this.currentProfile.levelsClaimed) {
        this.currentProfile.levelsClaimed = [];
      }

      // Prevent duplicate achievements by name
      if (
        this.currentProfile.achievements.some(
          (a) => a.name === achievement.name
        )
      ) {
        console.log("Achievement already added:", achievement.name);
        return false;
      }

      let xpToAward = 0;
      // Award XP only once per level completed
      const lvlMatch = achievement.name.match(/^Level (\d+) Completed$/);
      if (lvlMatch) {
        const levelNumber = Number(lvlMatch[1]);
        if (!this.currentProfile.levelsClaimed.includes(levelNumber)) {
          xpToAward = 100; // Example XP amount per level
          this.currentProfile.levelsClaimed.push(levelNumber);
        }
      }

      this.currentProfile.achievements.push(achievement);
      this.applyStatImprovements(achievement);

      const profileAddress = this.currentProfile.address;
      const userPublicKey = getUserPublicKey();

      if (!profileAddress || !userPublicKey) {
        throw new Error("Missing profile address or wallet public key");
      }

      // 1. Call backend to award XP and register achievement (admin signed transaction)
      const backendResponse = await fetch("http://localhost:4000/award-xp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileAddress,
          xp: xpToAward,
          achievements: [achievement.index],
        }),
      });

      if (!backendResponse.ok) {
        const errorBody = await backendResponse.json();
        throw new Error(`Backend XP awarding failed: ${errorBody.error}`);
      }

      console.log("✅ XP and achievement awarded on backend.");

      //   // 2. Claim the badge on-chain via Honeycomb client
      //   const {
      //     createClaimBadgeCriteriaTransaction: { txResponse },
      //   } = await client.createClaimBadgeCriteriaTransaction({
      //     args: {
      //       profileAddress,
      //       projectAddress: PROJECT_ADDRESS,
      //       proof: BadgesCondition.Public,
      //       payer: userPublicKey.toString(),
      //       criteriaIndex: achievement.index,
      //     },
      //   });

      //   const response = await sendClientTransactions(
      //     client, // The client instance you created earlier in the setup
      //     wallet, // The wallet you got from the useWallet hook
      //     txResponse // You can pass the transaction response containing either a single transaction or an array of transactions
      //   );

      //   console.log(
      //     `✅ Badge #${achievement.index} claimed on-chain:`,
      //     response.responses[achievement.index].signature
      //   );

      return true;
    } catch (error) {
      console.error("Error adding achievement:", error);
      throw error;
    }
  }

  storeLocalAchievement(achievement) {
    try {
      let localAchievements;
      try {
        const stored = localStorage.getItem("localAchievements");
        localAchievements = stored ? JSON.parse(stored) : [];
      } catch (e) {
        localAchievements = [];
      }

      localAchievements.push(achievement);
      localStorage.setItem(
        "localAchievements",
        JSON.stringify(localAchievements)
      );
    } catch (error) {
      console.error("Failed to store achievement locally:", error);
      if (!this._localAchievementsFallback) {
        this._localAchievementsFallback = [];
      }
      this._localAchievementsFallback.push(achievement);
    }
  }

  async syncLocalAchievements() {
    if (!isWalletConnected()) return false;

    const localAchievements = JSON.parse(
      localStorage.getItem("localAchievements") || "[]"
    );
    if (localAchievements.length === 0) return true;

    try {
      for (const achievement of localAchievements) {
        await this.addAchievement(achievement);
      }
      localStorage.removeItem("localAchievements");
      return true;
    } catch (error) {
      console.error("Failed to sync local achievements:", error);
      return false;
    }
  }

  applyStatImprovements(achievement) {
    if (!achievement?.name) return;

    this.currentProfile.stats = {
      healthBoost: 0,
      energyBoost: 0,
      strengthBoost: 0,
      speedBoost: 0,
      energyEfficiency: 0,
      energyCapacity: 0,
      damageBoost: 0,
      xpBoost: 0,
      ...(this.currentProfile.stats || {}),
    };

    const stats = this.currentProfile.stats;

    switch (achievement.name) {
      case "Game Completed":
        stats.healthBoost += 10;
        stats.strengthBoost += 5;
        break;

      case "Speed Runner":
        stats.speedBoost += 0.05;
        break;

      case "Flawless Victory":
        stats.healthBoost += 10;
        break;

      case "Energy Efficient":
        stats.energyEfficiency += 0.1;
        stats.energyCapacity += 10;
        break;

      case "Sharpshooter":
        stats.damageBoost += 0.05;
        break;

      case "Pacifist":
        stats.energyCapacity += 10;
        break;

      default:
        if (
          achievement.name.startsWith("Level ") &&
          achievement.name.includes("Completed")
        ) {
          stats.xpBoost += 5;
        }
        break;
    }
  }

  getPlayerStats() {
    const stats = this.currentProfile.stats || {};
    return {
      health: 100 + (stats.healthBoost || 0),
      energy: 100 + (stats.energyCapacity || 0),
      strength: 100 + (stats.strengthBoost || 0),
      walkSpeed: 0.1 + (stats.speedBoost || 0),
      runSpeed: 0.2 + (stats.speedBoost || 0),
      sprintSpeed: 0.4 + (stats.speedBoost || 0),
      energyDrainRate: Math.max(0.1, 0.5 - (stats.energyEfficiency || 0)),
      energyRegenRate: 0.2 + (stats.energyEfficiency || 0) * 0.05,
      damageMultiplier: 1 + (stats.damageBoost || 0),
    };
  }

  async getAccessToken(publicKey) {
    let authRequest;

    try {
      // 1. Ensure we have a connected wallet
      if (!publicKey) {
        if (!(await ensureWalletConnected())) {
          throw new Error("Wallet not connected");
        }
        publicKey = getUserPublicKey();
      }

      const wallet = window.solana || window.solflare;
      if (!wallet) {
        throw new Error("Wallet extension not found");
      }

      // 2. Get authentication challenge from server
      const { authRequest: serverAuthRequest } = await client.authRequest({
        wallet: publicKey.toString(),
      });
      authRequest = serverAuthRequest;

      // 3. Prepare the exact message that needs to be signed
      // The server expects the raw message without any modifications
      const message = authRequest.message; // Extract just the message string
      const encodedMessage = new TextEncoder().encode(message);

      // 4. Sign the message with wallet
      let signature;
      try {
        const signed = await wallet.signMessage(encodedMessage, "utf8");

        // Handle different wallet response formats
        if (signed?.signature) {
          // Phantom wallet format
          signature = signed.signature;
        } else if (signed instanceof Uint8Array) {
          // Direct Uint8Array response
          signature = signed;
        } else {
          // Fallback for other formats
          signature = new Uint8Array(Object.values(signed));
        }

        // Final validation
        if (!(signature instanceof Uint8Array)) {
          throw new Error("Invalid signature format");
        }
      } catch (signError) {
        console.error("Signing failed:", signError);
        throw new Error("User rejected signing");
      }

      // 5. Convert to base58 (required by Honeycomb API)
      const signatureBase58 = bs58.encode(signature);

      // 6. Verify with server
      const { authConfirm } = await client.authConfirm({
        wallet: publicKey.toString(),
        signature: signatureBase58,
      });

      return authConfirm.accessToken;
    } catch (error) {
      console.error("Authentication failed:", {
        error,
        authRequest: authRequest?.message || "Not received",
        publicKey: publicKey?.toString() || "Not available",
      });
      throw error;
    }
  }
}
