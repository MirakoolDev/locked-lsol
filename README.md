# OpenSea Solana Escrow Tracker (L-SOL)

A dashboard and toolset for tracking SOL funds permanently locked in the deprecated OpenSea Solana Auction House smart contract.

## The Problem
When OpenSea operated on Solana, they used a Metaplex Auction House contract (`hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk`). Users' SOL used for making NFT offers was sent to an escrow PDA. OpenSea configured this contract with `requiresSignOff = true`. This strict security constraint dictates that **no funds can ever leave the escrow** without a co-signature from OpenSea's backend authority wallet. 

Because OpenSea shut down their Solana backend, it is completely impossible to execute a withdrawal transaction. Any attempt to withdraw from the client side will be rejected by the blockchain with **Anchor Error 6011 (CannotTakeThisActionWithoutAuctionHouseSignOff)**. OpenSea must manually toggle this flag to `false` to release the locked funds.

## This Dashboard
This repository contains a full React + Vite application that displays over 2,800 wallets and 704+ SOL that are currently stuck in this contract. 

### Running Locally

```bash
cd frontend
npm install
npm run dev
```

The data used in this dashboard is sourced directly from the Solana blockchain using a custom built scanner. The compiled results are stored in `frontend/src/affected_wallets.json`.

---

## UPDATE: A recovery path was found — the funds are NOT permanently locked

The conclusion above (that funds can never leave without OpenSea's co-signature) is
**only true for the `Withdraw` instruction**. OpenSea's Auction House has a second,
separate instruction that moves escrow funds and is **not gated by `requiresSignOff`**:
**`CloseEscrowAccount`**.

`CloseEscrowAccount` closes a wallet's buyer-escrow PDA and returns **all** of its
lamports (the deposited SOL plus the account rent) to the owning wallet. It requires
**only the wallet owner's signature** — no OpenSea backend sign-off.

### Evidence

- **Simulation:** Simulating `CloseEscrowAccount` against the live program for an
  affected escrow (signed by only the owner wallet) succeeds (`err: null`). The same
  wallet's `Withdraw` still fails with Anchor error 6011, as documented above.
- **Live on-chain:** Wallets are successfully closing their escrows **today** on this
  exact auction house (`3o9d13qUvEuuauhFrVom1vuCzgNsJifeaBYDPquaT73Y`), signed only by
  their own wallet with no OpenSea co-signature. Escrows closed this way now hold 0 SOL.

So OpenSea does **not** need to flip `requiresSignOff` to `false`. Each affected owner
can reclaim their own funds directly.

### How to reclaim

**Option A — the dashboard:** use the **CLAIM** tab, connect the affected wallet, and
use the **Reclaim** action (built on `CloseEscrowAccount`).

**Option B — the CLI** (`frontend/reclaim.cjs`):

```bash
cd frontend
npm install

# Dry run (read-only, no private key needed):
node reclaim.cjs --wallet <YOUR_WALLET_PUBKEY>

# Reclaim for real (reads a local Solana CLI id.json keypair, sends one tx):
node reclaim.cjs --keypair ./id.json --execute --rpc <YOUR_RPC_URL>
```

The CLI simulates before sending and never transmits your private key anywhere.

### The instruction

- **Program:** `hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk`
- **Instruction:** `CloseEscrowAccount` (discriminator `209,42,208,179,140,78,18,43`,
  followed by the 1-byte escrow bump)
- **Accounts:** `wallet` (signer, writable) · `escrowPaymentAccount` (writable) ·
  `auctionHouse` · `systemProgram`
- **Escrow PDA:** `["auction_house", auctionHouse, wallet]`

The core logic lives in `frontend/src/recovery.ts`.
