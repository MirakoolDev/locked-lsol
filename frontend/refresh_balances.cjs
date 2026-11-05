#!/usr/bin/env node
/**
 * refresh_balances.cjs — re-check the current escrow balance of every wallet in
 * src/affected_wallets.json and rewrite the file with fresh numbers.
 *
 * Usage: node refresh_balances.cjs [--rpc <url>]
 */
const fs = require("fs");
const path = require("path");
const { Connection, PublicKey } = require("@solana/web3.js");

const AH_PROGRAM = new PublicKey("hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk");
const AUCTION_HOUSE = new PublicKey("3o9d13qUvEuuauhFrVom1vuCzgNsJifeaBYDPquaT73Y");

const rpcArg = process.argv.indexOf("--rpc");
const RPC = rpcArg > -1 ? process.argv[rpcArg + 1] : "https://api.mainnet-beta.solana.com";
const connection = new Connection(RPC, "confirmed");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FILE = path.join(__dirname, "src", "affected_wallets.json");

function escrowFor(owner) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("auction_house"), AUCTION_HOUSE.toBuffer(), new PublicKey(owner).toBuffer()],
    AH_PROGRAM,
  );
  return pda;
}

async function getMany(pubkeys) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await connection.getMultipleAccountsInfo(pubkeys);
    } catch (e) {
      if (/429|rate/i.test(e.message || "")) { await sleep(1000); continue; }
      throw e;
    }
  }
  throw new Error("getMultipleAccounts retries exhausted");
}

async function main() {
  const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const wallets = data.wallets || [];
  console.log("Re-checking", wallets.length, "wallets via", RPC);

  const escrows = wallets.map((w) => escrowFor(w.address));
  const BATCH = 100;
  const out = [];
  let total = 0;
  for (let i = 0; i < escrows.length; i += BATCH) {
    const slice = escrows.slice(i, i + BATCH);
    const infos = await getMany(slice);
    for (let j = 0; j < infos.length; j++) {
      const lamports = infos[j] ? infos[j].lamports : 0;
      const sol = lamports / 1e9;
      out.push({ address: wallets[i + j].address, balance: sol });
      total += sol;
    }
    process.stdout.write(`\r  checked ${Math.min(i + BATCH, escrows.length)}/${escrows.length}`);
    await sleep(200);
  }
  console.log("");

  const stillLocked = out.filter((w) => w.balance > 0);
  const recovered = out.length - stillLocked.length;
  // Keep only wallets that still hold funds, sorted high to low.
  stillLocked.sort((a, b) => b.balance - a.balance);

  const result = {
    generatedAt: new Date().toISOString(),
    auctionHouse: AUCTION_HOUSE.toBase58(),
    totalLockedSol: Number(total.toFixed(6)),
    walletsStillLocked: stillLocked.length,
    walletsRecovered: recovered,
    wallets: stillLocked.map((w) => ({ address: w.address, balance: Number(w.balance.toFixed(8)) })),
  };
  fs.writeFileSync(FILE, JSON.stringify(result, null, 2));

  console.log("\n=== refreshed ===");
  console.log("total still locked :", result.totalLockedSol, "SOL");
  console.log("wallets locked     :", result.walletsStillLocked);
  console.log("wallets now empty  :", result.walletsRecovered, "(recovered or spent)");
  console.log("written to", FILE);
}
main().catch((e) => { console.error("Error:", e.message || e); process.exit(1); });
