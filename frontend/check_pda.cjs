const { PublicKey } = require('@solana/web3.js');

const AH_PROGRAM = new PublicKey('hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk');
const TREASURY_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const USER_WALLET = new PublicKey('F3dmsCL5jiNwBbQiPJ2bJhptwovrQpNgLBFKqx7xcRZW');
const CREATOR = new PublicKey('3o9d13qUvEuuauhFrV1GzomikSzieH1d3gGVjyu3ovA7');

const [auctionHouse] = PublicKey.findProgramAddressSync(
  [Buffer.from('auction_house'), CREATOR.toBuffer(), TREASURY_MINT.toBuffer()],
  AH_PROGRAM
);

const [feeAccount] = PublicKey.findProgramAddressSync(
  [Buffer.from('auction_house'), auctionHouse.toBuffer(), Buffer.from('fee_payer')],
  AH_PROGRAM
);

const [buyerEscrow] = PublicKey.findProgramAddressSync(
  [Buffer.from('auction_house'), auctionHouse.toBuffer(), USER_WALLET.toBuffer()],
  AH_PROGRAM
);

console.log("Using CREATOR:", CREATOR.toBase58());
console.log("auctionHouse:", auctionHouse.toBase58());
console.log("feeAccount:", feeAccount.toBase58());
console.log("buyerEscrow:", buyerEscrow.toBase58());

// Try the other address from tx.json just in case it's the actual creator or auction house
const OTHER_ADDRESS = new PublicKey('3o9d13qUvEuuauhFrVom1vuCzgNsJifeaBYDPquaT73Y');
const [auctionHouse2] = PublicKey.findProgramAddressSync(
  [Buffer.from('auction_house'), OTHER_ADDRESS.toBuffer(), TREASURY_MINT.toBuffer()],
  AH_PROGRAM
);
const [buyerEscrow2] = PublicKey.findProgramAddressSync(
  [Buffer.from('auction_house'), auctionHouse2.toBuffer(), USER_WALLET.toBuffer()],
  AH_PROGRAM
);
console.log("\nUsing OTHER_ADDRESS:", OTHER_ADDRESS.toBase58());
console.log("auctionHouse2:", auctionHouse2.toBase58());
console.log("buyerEscrow2:", buyerEscrow2.toBase58());

// Another address
const ANOTHER = new PublicKey('3o9d13qUvEuuauhFrVom1vuCzgNsJifeaBYDPquaT73Y');
const [buyerEscrow3] = PublicKey.findProgramAddressSync(
  [Buffer.from('auction_house'), ANOTHER.toBuffer(), USER_WALLET.toBuffer()],
  AH_PROGRAM
);
console.log("\nIf auction house is:", ANOTHER.toBase58());
console.log("buyerEscrow3:", buyerEscrow3.toBase58());

