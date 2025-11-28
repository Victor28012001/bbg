// extract-secret.js
import fs from "fs";

const kp = JSON.parse(fs.readFileSync("./keys/admin.json", "utf8"));
console.log("Use this in .env:");
console.log(JSON.stringify(kp)); // paste this in quotes into VITE_ADMIN_KEY
