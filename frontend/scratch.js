const https = require('https');

const data = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "getTransaction",
  params: [
    "ijSvLK2PjnADQU8rCNB6ai1XSyxjXPUWVPRotGKkPTX3xNKwFV1JUKdGUQ6QUpcaSpkjiE9qauTJV8MBjUp2kx8",
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }
  ]
});

const options = {
  hostname: 'api.mainnet-beta.solana.com',
  port: 443,
  path: '/',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(body);
      if (parsed.result && parsed.result.meta) {
        const postTokenBalances = parsed.result.meta.postTokenBalances;
        console.log("Post Token Balances:");
        console.log(JSON.stringify(postTokenBalances, null, 2));
        console.log("Accounts:");
        console.log(JSON.stringify(parsed.result.transaction.message.accountKeys, null, 2));
      } else {
        console.log("Result:", JSON.stringify(parsed, null, 2));
      }
    } catch (e) {
      console.log("Error parsing:", e);
      console.log(body);
    }
  });
});

req.on('error', (e) => {
  console.error(e);
});

req.write(data);
req.end();
