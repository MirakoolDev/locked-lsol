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
