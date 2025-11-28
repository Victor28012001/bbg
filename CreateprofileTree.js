import { client } from "./src/utils/honeyCombServices.js";
import fs from "fs";
import path from "path";
import { sendTransactionForTests } from "@honeycomb-protocol/edge-client/client/helpers.js";
import { Keypair } from "@solana/web3.js";

// Load wallet keypair from file
const projectAddress = "HrcvtpN62j2mqtdfmu2zy5rF7F3y62qH6wPvVZAhbJJ";
const walletFile = JSON.parse(
  fs.readFileSync(path.join("./keys/admin.json"), "utf8")
);
const payer = Keypair.fromSecretKey(new Uint8Array(walletFile));

const {
  createCreateProfilesTreeTransaction: { tx, treeAddress },
} = await client.createCreateProfilesTreeTransaction({
  payer: payer.publicKey.toString(),
  project: projectAddress,
  treeConfig: {
    basic: {
      numAssets: 100000,
    },
  },
});

console.log("🌲 Intended Tree Address:", treeAddress);
console.log("📦 Raw TX:", tx.transaction);

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

  process.exit(1);
}

console.log("✅ Profile tree created successfully!");
console.log("📨 Tx Signature:", result.signature);
console.log("🌲 Tree Address:", treeAddress);