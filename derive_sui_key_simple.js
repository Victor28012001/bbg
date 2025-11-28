import { mnemonicToSeedSync } from "@scure/bip39";
import { HDKey } from "@scure/bip32";
import * as ed from "@noble/ed25519";

// Your mnemonic
const MNEMONIC = "slot cube vacuum panther sentence rubber cute pear provide friend alley order";

// Sui derivation path
const PATH = "m/44'/784'/0'/0'/0'";

// Convert mnemonic to seed
const seed = mnemonicToSeedSync(MNEMONIC);
const hd = HDKey.fromMasterSeed(seed);

// Derive child key
const child = hd.derive(PATH);
const privKey = child.privateKey;

if (!privKey) throw new Error("Failed to derive private key");

// Sui CLI expects 32-byte private key for ed25519
console.log("Private key (hex) for Sui CLI:");
console.log(privKey.toString("hex"));
