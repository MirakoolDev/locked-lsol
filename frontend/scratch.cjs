const tx = require('./tx.json');
const instructions = tx.result.transaction.message.instructions;
const ahInstruction = instructions.find(ix => ix.programId === 'hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk');

if (ahInstruction) {
  console.log("Auction House Instruction Accounts:");
  console.log(ahInstruction.accounts);
  console.log("Data:", ahInstruction.data);
} else {
  console.log("No AH instruction found.");
}
