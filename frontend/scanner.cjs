/**
 * Scanner v2: Find all wallets with SOL stuck in the OpenSea Auction House escrow.
 *
 * Strategy (optimized for Helius free tier):
 *  1. Fetch signatures for the Auction House in batches.
 *  2. For each signature, fetch the parsed transaction INDIVIDUALLY 
 *     (no batch API on free plan).
 *  3. Extract unique wallet addresses from AH instructions.
 *  4. Derive the buyer_escrow PDA for each wallet.
 *  5. Check the current balance of each escrow PDA.
 *  6. Save wallets with balance > 0 to affected_wallets.json.
 *
 * Optimization: We save discovered wallets to a cache file so we can
 * resume / skip the slow tx-parsing step on subsequent runs.
 */

const { Connection, PublicKey } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

require('dotenv').config();
// ── Constants ──────────────────────────────────────────────────────────────
const HELIUS_RPC = process.env.VITE_HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com";
const connection = new Connection(HELIUS_RPC, "confirmed");

const AH_PROGRAM = new PublicKey(
  "hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk"
);
const AUCTION_HOUSE = new PublicKey(
  "3o9d13qUvEuuauhFrVom1vuCzgNsJifeaBYDPquaT73Y"
);

// Signature fetching config
const SIG_BATCH = 1000;
const MAX_SIGS = 50000;

// Rate limiting
const DELAY_BETWEEN_TX = 100;   // ms between individual tx fetches
const DELAY_BETWEEN_BALANCE = 50; // ms between balance checks

// Max retries on rate limit errors
const MAX_RETRIES = 5;

// File paths
const CACHE_FILE = path.join(__dirname, "wallet_cache.json");
const OUTPUT_FILE = path.join(__dirname, "src", "affected_wallets.json");

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry(fn, label = "RPC call") {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err.message || "";
      const isRateLimit =
        msg.includes("429") ||
        msg.includes("413") ||
        msg.includes("Too many") ||
        msg.includes("403");
      if (isRateLimit && attempt < MAX_RETRIES - 1) {
        const delay = Math.pow(2, attempt + 1) * 1000 + Math.random() * 1000;
        console.log(
          `  ⚠ Rate limited on ${label}, retrying in ${(delay / 1000).toFixed(1)}s (attempt ${attempt + 1}/${MAX_RETRIES})...`
        );
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
}

// ── Step 1: Fetch Signatures ───────────────────────────────────────────────

async function fetchAllSignatures() {
  const allSigs = [];
  let before = undefined;

  while (allSigs.length < MAX_SIGS) {
    const opts = { limit: SIG_BATCH };
    if (before) opts.before = before;

    const batch = await withRetry(
      () => connection.getSignaturesForAddress(AUCTION_HOUSE, opts),
      "getSignaturesForAddress"
    );

    if (batch.length === 0) {
      console.log("  Reached end of transaction history.");
      break;
    }

    allSigs.push(...batch);
    before = batch[batch.length - 1].signature;

    const date = new Date(batch[batch.length - 1].blockTime * 1000)
      .toISOString()
      .split("T")[0];
    console.log(`  Fetched ${allSigs.length} signatures... (oldest: ${date})`);

    await sleep(300);
  }

  return allSigs;
}

// ── Step 2: Extract Wallets from Transactions ──────────────────────────────

async function extractWalletsFromSignatures(signatures) {
  const wallets = new Set();
  const sigStrings = signatures
    .filter((s) => s.err === null)
    .map((s) => s.signature);

  console.log(
    `\nProcessing ${sigStrings.length} successful transactions (one at a time)...`
  );
  console.log(
    `  Estimated time: ~${Math.ceil((sigStrings.length * DELAY_BETWEEN_TX) / 60000)} minutes\n`
  );

  let skipped = 0;

  for (let i = 0; i < sigStrings.length; i++) {
    try {
      const tx = await withRetry(
        () =>
          connection.getParsedTransaction(sigStrings[i], {
            maxSupportedTransactionVersion: 0,
          }),
        `tx ${i + 1}`
      );

      if (!tx || !tx.transaction) {
        skipped++;
        continue;
      }

      for (const ix of tx.transaction.message.instructions) {
        if (
          ix.programId &&
          ix.programId.toString() === AH_PROGRAM.toString() &&
          ix.accounts &&
          ix.accounts.length > 0
        ) {
          wallets.add(ix.accounts[0].toString());
        }
      }
    } catch (err) {
      skipped++;
    }

    if ((i + 1) % 200 === 0 || i === sigStrings.length - 1) {
      console.log(
        `  Parsed ${i + 1}/${sigStrings.length} — ${wallets.size} unique wallets (${skipped} skipped)`
      );
    }

    await sleep(DELAY_BETWEEN_TX);
  }

  return Array.from(wallets);
}

// ── Step 3: Check Escrow Balances ──────────────────────────────────────────

async function checkEscrowBalances(walletAddresses) {
  const results = [];
  console.log(`\nChecking escrow balances for ${walletAddresses.length} wallets...`);

  // Compute all PDAs upfront
  const walletToPda = new Map();
  for (const addr of walletAddresses) {
    try {
      const [buyerEscrow] = PublicKey.findProgramAddressSync(
        [Buffer.from("auction_house"), AUCTION_HOUSE.toBuffer(), new PublicKey(addr).toBuffer()],
        AH_PROGRAM
      );
      walletToPda.set(addr, buyerEscrow);
    } catch {
      continue;
    }
  }

  const addresses = Array.from(walletToPda.keys());
  const pdas = Array.from(walletToPda.values());
  const BATCH_SIZE = 100;

  for (let i = 0; i < pdas.length; i += BATCH_SIZE) {
    const batchPdas = pdas.slice(i, i + BATCH_SIZE);
    const batchAddrs = addresses.slice(i, i + BATCH_SIZE);

    try {
      const infos = await withRetry(
        () => connection.getMultipleAccountsInfo(batchPdas),
        `balance batch ${i}`
      );

      for (let j = 0; j < infos.length; j++) {
        const info = infos[j];
        if (info && info.lamports > 0) {
          results.push({
            address: batchAddrs[j],
            escrowPda: batchPdas[j].toString(),
            balance: info.lamports / 1e9,
            lamports: info.lamports,
          });
        }
      }
    } catch (err) {
      console.log(`Failed to fetch batch ${i}`);
    }

    if (i + BATCH_SIZE >= pdas.length || (i + BATCH_SIZE) % 1000 === 0) {
      console.log(`  Checked ${Math.min(i + BATCH_SIZE, pdas.length)}/${pdas.length} — ${results.length} with stuck funds`);
    }

    await sleep(200); // 200ms between batches
  }

  results.sort((a, b) => b.balance - a.balance);
  return results;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== OpenSea Auction House Escrow Scanner v2 ===\n");
  console.log("Auction House:", AUCTION_HOUSE.toString());
  console.log("Program:", AH_PROGRAM.toString());

  let wallets;

  // Check for cached wallet list (skip the slow tx parsing step)
  if (fs.existsSync(CACHE_FILE)) {
    console.log(`\n✓ Found wallet cache at ${CACHE_FILE}`);
    const cached = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    wallets = cached.wallets;
    console.log(`  Loaded ${wallets.length} cached wallets.`);
    console.log("  Skipping Step 1 & 2. Delete wallet_cache.json to re-scan.\n");
  } else {
    // Step 1: Fetch signatures
    console.log(`\nStep 1: Fetching transaction signatures (max ${MAX_SIGS})...`);
    const signatures = await fetchAllSignatures();
    console.log(`Total signatures fetched: ${signatures.length}`);

    // Step 2: Extract wallet addresses
    console.log("\nStep 2: Extracting wallet addresses from transactions...");
    wallets = await extractWalletsFromSignatures(signatures);
    console.log(`\nTotal unique wallets found: ${wallets.length}`);

    // Cache the wallet list
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({ scanDate: new Date().toISOString(), wallets }, null, 2)
    );
    console.log(`Wallet list cached to ${CACHE_FILE}`);
  }

  // Step 3: Check escrow balances
  console.log("\nStep 3: Checking current escrow balances...");
  const affected = await checkEscrowBalances(wallets);

  // Step 4: Report & save
  const totalSol = affected.reduce((sum, w) => sum + w.balance, 0);

  console.log("\n" + "=".repeat(60));
  console.log("                    SCAN RESULTS");
  console.log("=".repeat(60));
  console.log(`  Total unique wallets scanned:  ${wallets.length}`);
  console.log(`  Wallets with stuck funds:      ${affected.length}`);
  console.log(`  Total SOL locked:              ${totalSol.toFixed(6)} SOL`);
  console.log("=".repeat(60));

  if (affected.length > 0) {
    console.log("\nTop 20 affected wallets:");
    affected.slice(0, 20).forEach((w, i) => {
      console.log(
        `  ${String(i + 1).padStart(3)}. ${w.address}  ${w.balance.toFixed(6)} SOL`
      );
    });
  }

  // Save to JSON for the frontend
  const output = {
    scanDate: new Date().toISOString(),
    totalUniqueWallets: wallets.length,
    affectedWallets: affected.length,
    totalLockedSol: totalSol,
    wallets: affected.map((w) => ({
      address: w.address,
      balance: w.balance,
    })),
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\n✓ Results saved to: ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error("Scanner failed:", err);
  process.exit(1);
});
