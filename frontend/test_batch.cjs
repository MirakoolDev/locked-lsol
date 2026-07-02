require('dotenv').config();
const { Connection, PublicKey } = require("@solana/web3.js");

const connection = new Connection(
  process.env.VITE_HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com",
  "confirmed"
);

async function main() {
  const p1 = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const p2 = new PublicKey("11111111111111111111111111111111");
  try {
    const res = await connection.getMultipleAccountsInfo([p1, p2]);
    console.log("Success! Accounts:", res.length);
  } catch (e) {
    console.log("Failed:", e.message);
  }
}
main();
