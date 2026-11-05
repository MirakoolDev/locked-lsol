#!/usr/bin/env node
/**
 * reclaim.cjs — recover SOL stuck in OpenSea's Solana Auction House escrow.
 *
 * The Auction House `Withdraw` instruction is blocked by requiresSignOff (error
 * 6011). This tool uses `CloseEscrowAccount`, which is NOT sign-off gated: it
 * closes the buyer-escrow PDA and returns all its lamports to the owner wallet,
 * needing only the owner's signature.
 *
 * SAFETY
 *   - Simulate mode (default) reads the chain only. No key required, nothing sent.
 *   - Execute mode (--execute) requires --keypair and sends ONE transaction that
 *     returns your own escrow funds to your own wallet.
 *   - This script never asks for or transmits your private key anywhere. The
 *     keypair file is read locally and used only to sign the transaction.
 *
 * USAGE
 *   # Dry run for any wallet (read-only, no key):
 *   node reclaim.cjs --wallet <WALLET_PUBKEY>
 *
 *   # Dry run using a keypair file (Solana CLI id.json: JSON array of 64 bytes):
 *   node reclaim.cjs --keypair ./id.json
 *
 *   # Actually reclaim (sends the transaction):
 *   node reclaim.cjs --keypair ./id.json --execute
 *
 *   # Custom RPC (recommended; public RPC is rate-limited):
 *   node reclaim.cjs --keypair ./id.json --execute --rpc https://your-rpc-url
 */

const fs = require("fs");
const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} = require("@solana/web3.js");

const AH_PROGRAM = new PublicKey("hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk");
const AUCTION_HOUSE = new PublicKey(
  "3o9d13qUvEuuauhFrVom1vuCzgNsJifeaBYDPquaT73Y",
);
const CLOSE_ESCROW_DISCRIMINATOR = Buffer.from("d12ad0b38c4e122b", "hex");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--execute") args.execute = true;
    else if (a === "--wallet") args.wallet = argv[++i];
    else if (a === "--keypair") args.keypair = argv[++i];
    else if (a === "--rpc") args.rpc = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

function loadKeypair(path) {
  const raw = fs.readFileSync(path, "utf8").trim();
  // Solana CLI format: JSON array of 64 numbers.
  const secret = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(secret);
}

function deriveBuyerEscrow(owner) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("auction_house"), AUCTION_HOUSE.toBuffer(), owner.toBuffer()],
    AH_PROGRAM,
  );
}

function buildCloseEscrowInstruction(owner) {
  const [buyerEscrow, bump] = deriveBuyerEscrow(owner);
  return new TransactionInstruction({
    programId: AH_PROGRAM,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: buyerEscrow, isSigner: false, isWritable: true },
      { pubkey: AUCTION_HOUSE, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([CLOSE_ESCROW_DISCRIMINATOR, Buffer.from([bump])]),
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || (!args.wallet && !args.keypair)) {
    console.log(
      "Usage:\n" +
        "  node reclaim.cjs --wallet <PUBKEY>                 # dry run, no key\n" +
        "  node reclaim.cjs --keypair ./id.json              # dry run with key\n" +
        "  node reclaim.cjs --keypair ./id.json --execute    # send the tx\n" +
        "  [--rpc <url>]  custom RPC endpoint (recommended)\n",
    );
    process.exit(args.help ? 0 : 1);
  }

  const rpc = args.rpc || "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpc, "confirmed");

  let keypair = null;
  let owner;
  if (args.keypair) {
    keypair = loadKeypair(args.keypair);
    owner = keypair.publicKey;
  } else {
    owner = new PublicKey(args.wallet);
  }

  const [escrow, bump] = deriveBuyerEscrow(owner);
  console.log("Owner wallet :", owner.toBase58());
  console.log("Escrow PDA   :", escrow.toBase58(), `(bump ${bump})`);

  const info = await connection.getAccountInfo(escrow);
  const lamports = info ? info.lamports : 0;
  console.log("Escrow balance:", lamports / 1e9, "SOL");
  if (lamports === 0) {
    console.log("Nothing to reclaim for this wallet. Exiting.");
    return;
  }

  // Always simulate first.
  const ix = buildCloseEscrowInstruction(owner);
  const tx = new Transaction().add(ix);
  tx.feePayer = owner;
  tx.recentBlockhash = (
    await connection.getLatestBlockhash("confirmed")
  ).blockhash;

  const sim = await connection.simulateTransaction(tx);
  console.log("\n--- simulation ---");
  console.log("err:", JSON.stringify(sim.value.err));
  (sim.value.logs || []).forEach((l) => console.log("  " + l));

  if (sim.value.err) {
    console.log(
      "\nSimulation failed. Not sending. (Re-run with a working RPC if this was a transient error.)",
    );
    process.exit(1);
  }
  console.log("\nSimulation OK: this transaction would return the funds.");

  if (!args.execute) {
    console.log(
      "Dry run only. Re-run with --keypair <path> --execute to send it for real.",
    );
    return;
  }
  if (!keypair) {
    console.log("--execute requires --keypair <path>.");
    process.exit(1);
  }

  tx.sign(keypair);
  const sig = await connection.sendRawTransaction(tx.serialize());
  console.log("\nSent. Signature:", sig);
  await connection.confirmTransaction(sig, "confirmed");
  console.log("Confirmed. View: https://solscan.io/tx/" + sig);
}

main().catch((e) => {
  console.error("Error:", e.message || e);
  process.exit(1);
});
