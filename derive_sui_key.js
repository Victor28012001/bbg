import { mnemonicToSeed } from "@scure/bip39";
import { HDKey } from "@scure/bip32";
import { Ed25519Keypair } from "@mysten/sui.js";

// Replace this with your mnemonic
const MNEMONIC = "slot cube vacuum panther sentence rubber cute pear provide friend alley order";

// Sui derivation path for ed25519
const DERIVATION_PATH = "m/44'/784'/0'/0'/0'";

async function main() {
  // Convert mnemonic to seed
  const seed = await mnemonicToSeed(MNEMONIC);
  
  // Derive master key
  const hd = HDKey.fromMasterSeed(seed);
  
  // Derive Sui private key
  const child = hd.derive(DERIVATION_PATH);
  const privateKeyBytes = child.privateKey;

  if (!privateKeyBytes) throw new Error("Could not derive private key");

  // Create Sui keypair
  const keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);

  console.log("Private key (hex) for Sui CLI:");
  console.log(Buffer.from(keypair.export()).toString("hex"));
  console.log("Corresponding Sui address:");
  console.log(keypair.getPublicKey().toSuiAddress());
}

main();
