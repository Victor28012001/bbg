import { Keypair } from "@solana/web3.js";
import { client } from "./src/utils/honeyCombServices.js";
import fs from "fs";
import path from "path";
import { sendTransactionForTests } from "@honeycomb-protocol/edge-client/client/helpers.js";


// Load wallet keypair from file
const walletFile = JSON.parse(
  fs.readFileSync(path.join("./keys/admin.json"), "utf8")
);
const payer = Keypair.fromSecretKey(new Uint8Array(walletFile));

// Define all achievements up to Level 8 Completed
const achievements = [
  "Game Completed",
  "Speed Runner",
  "Flawless Victory",
  "Energy Efficient",
  "Sharpshooter",
  "Pacifist",
  "Level 1 Completed",
  "Level 2 Completed",
  "Level 3 Completed",
  "Level 4 Completed",
  "Level 5 Completed",
  "Level 6 Completed",
  "Level 7 Completed",
  "Level 8 Completed",
];

// Step 1: Create the Project Transaction
const {
  createCreateProjectTransaction: { project, tx },
} = await client.createCreateProjectTransaction({
  name: "Bring Gladys Back",
  authority: payer.publicKey.toString(),
  payer: payer.publicKey.toString(),
  profileDataConfig: {
    achievements,
    customDataFields: ["XP"],
  },
});

console.log("tx:", tx);
console.log("🧠 Intended Project Address:", project.toString());

// Step 2: Send and sign the transaction
const result = await sendTransactionForTests(
  client,
  {
    blockhash: tx.blockhash,
    lastValidBlockHeight: tx.lastValidBlockHeight,
    transaction: tx.transaction,
  },
  [payer],
  {
    skipPreflight: true,
    commitment: "finalized",
  }
);

// Step 3: Check result status
if (result.status !== "Success") {
  console.error("❌ Transaction failed.");
  console.error("⚠️ Full result:", result);
  console.error("⚠️ Status:", result.status);
  console.error("🧾 Signature:", result.signature);
  console.error("🚨 Error:", result.error);
  if (result.getLogs) {
    const logs = await result.getLogs();
    console.error("🧾 On-chain logs:\n", logs.join("\n"));
  }

  if (result.error) {
    console.error("🔍 Error Details:", JSON.stringify(result.error, null, 2));
  }

  process.exit(1);
}

console.log("✅ Transaction sent successfully!");
console.log("📨 Tx Signature:", result.signature);
console.log("🏗️ Project Address:", project.toString());

