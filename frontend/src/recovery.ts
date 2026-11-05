/**
 * Recovery module for SOL stuck in OpenSea's deprecated Solana Auction House.
 *
 * Background
 * ----------
 * When you made an offer on OpenSea's Solana marketplace, your SOL was moved
 * into a per-wallet "buyer escrow" PDA owned by the Auction House program
 * (hausS13...). OpenSea deployed this Auction House with `requiresSignOff = true`.
 *
 * The `Withdraw` instruction is gated by that flag, so a client-side withdraw is
 * rejected with Anchor error 6011 (CannotTakeThisActionWithoutAuctionHouseSignOff)
 * because OpenSea's backend no longer co-signs.
 *
 * HOWEVER, the program's `CloseEscrowAccount` instruction is NOT gated by the
 * sign-off flag. It closes the buyer escrow PDA and returns ALL of its lamports
 * (your deposited SOL + the rent) to the owning wallet, requiring only the wallet
 * owner's signature. This is the recovery path, and it is actively being used
 * on-chain today against the same auction house.
 *
 * This module builds that instruction. It never touches private keys: signing is
 * done by the connected wallet (browser) or by a keypair the caller supplies
 * explicitly (the Node CLI).
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import { Buffer } from "buffer";

export const AH_PROGRAM = new PublicKey(
  "hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk",
);
export const AUCTION_HOUSE = new PublicKey(
  "3o9d13qUvEuuauhFrVom1vuCzgNsJifeaBYDPquaT73Y",
);

/**
 * Anchor discriminator for `CloseEscrowAccount` on this program.
 * Bytes: [209, 42, 208, 179, 140, 78, 18, 43]
 * Verified against live, successful on-chain CloseEscrowAccount transactions.
 */
export const CLOSE_ESCROW_DISCRIMINATOR = Buffer.from(
  "d12ad0b38c4e122b",
  "hex",
);

/** Derive the buyer-escrow PDA and its bump for a given owner wallet. */
export function deriveBuyerEscrow(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("auction_house"), AUCTION_HOUSE.toBuffer(), owner.toBuffer()],
    AH_PROGRAM,
  );
}

/**
 * Build the `CloseEscrowAccount` instruction for `owner`.
 * Signed by the owner, it drains the escrow PDA back to the owner's wallet.
 */
export function buildCloseEscrowInstruction(
  owner: PublicKey,
): TransactionInstruction {
  const [buyerEscrow, escrowPaymentBump] = deriveBuyerEscrow(owner);

  return new TransactionInstruction({
    programId: AH_PROGRAM,
    keys: [
      // wallet: pays fees and receives the reclaimed lamports
      { pubkey: owner, isSigner: true, isWritable: true },
      // escrow_payment_account: the PDA being closed
      { pubkey: buyerEscrow, isSigner: false, isWritable: true },
      // auction_house: checked via has_one
      { pubkey: AUCTION_HOUSE, isSigner: false, isWritable: false },
      // system_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      CLOSE_ESCROW_DISCRIMINATOR,
      Buffer.from([escrowPaymentBump]),
    ]),
  });
}

/** Look up the current escrow balance (in SOL) for an owner wallet. */
export async function getEscrowBalance(
  connection: Connection,
  owner: PublicKey,
): Promise<{ escrow: PublicKey; lamports: number; sol: number }> {
  const [escrow] = deriveBuyerEscrow(owner);
  const info = await connection.getAccountInfo(escrow);
  const lamports = info ? info.lamports : 0;
  return { escrow, lamports, sol: lamports / 1e9 };
}

/**
 * Dry-run the close against the live program without signing or sending.
 * Returns the simulation error (null means it would succeed) and the logs.
 */
export async function simulateClose(
  connection: Connection,
  owner: PublicKey,
): Promise<{ ok: boolean; err: unknown; logs: string[] }> {
  const ix = buildCloseEscrowInstruction(owner);
  const tx = new Transaction().add(ix);
  tx.feePayer = owner;
  tx.recentBlockhash = (
    await connection.getLatestBlockhash("confirmed")
  ).blockhash;
  const res = await connection.simulateTransaction(tx);
  return {
    ok: res.value.err == null,
    err: res.value.err,
    logs: res.value.logs ?? [],
  };
}

/**
 * Browser reclaim via an injected wallet (e.g. Phantom's window.phantom.solana).
 * The wallet object must expose signTransaction(). Returns the tx signature.
 */
export async function reclaimWithWallet(
  connection: Connection,
  owner: PublicKey,
  // deno-lint-ignore no-explicit-any
  provider: { signTransaction: (tx: Transaction) => Promise<Transaction> },
): Promise<string> {
  const ix = buildCloseEscrowInstruction(owner);
  const tx = new Transaction().add(ix);
  tx.feePayer = owner;
  tx.recentBlockhash = (
    await connection.getLatestBlockhash("confirmed")
  ).blockhash;

  const signed = await provider.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}
