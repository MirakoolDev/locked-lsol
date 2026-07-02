import { useState, useEffect } from "react";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import {
  Wallet,
  Loader2,
  ArrowDownToLine,
  AlertCircle,
  Search,
  LayoutDashboard,
  Wrench,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";

const AH_PROGRAM = new PublicKey("hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk");
const AH_AUTHORITY = new PublicKey(
  "2pahVjmt9TTsxkHni5sqSC8DhnzguLWLYK8wfGjuNmM8",
);
const TREASURY_MINT = new PublicKey(
  "So11111111111111111111111111111111111111112",
);
const AUCTION_HOUSE = new PublicKey(
  "3o9d13qUvEuuauhFrVom1vuCzgNsJifeaBYDPquaT73Y",
);
const FEE_ACCOUNT = new PublicKey(
  "5xyoD5hnWDBLsW6rjW2TBmqiDQsbod6Uaw15dRhNrDzn",
);
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
const SYSVAR_RENT_PUBKEY = new PublicKey(
  "SysvarRent111111111111111111111111111111111",
);

// Use Helius RPC for reliable connection
const connection = new Connection(
  import.meta.env.VITE_HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com",
  "confirmed",
);

interface TrackedWallet {
  address: string;
  balance: number;
}

import affectedWalletsData from "./affected_wallets.json";

const INITIAL_TRACKED_WALLETS: TrackedWallet[] = affectedWalletsData.wallets.map(w => ({
  address: w.address,
  balance: w.balance
}));

function App() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string; sig?: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "recovery" | "about">("dashboard");
  const [trackedWallets, setTrackedWallets] = useState<TrackedWallet[]>(INITIAL_TRACKED_WALLETS);
  const [lookupInput, setLookupInput] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const totalPages = Math.ceil(trackedWallets.length / itemsPerPage);
  const currentWallets = trackedWallets.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    // Check if Phantom is already connected
    const checkConnection = async () => {
      try {
        const provider = (window as any).phantom?.solana;
        if (provider?.isPhantom) {
          const resp = await provider.connect({ onlyIfTrusted: true });
          setWallet(resp.publicKey.toString());
        }
      } catch (err) {
        // Not connected yet
      }
    };
    checkConnection();
  }, []);

  const connectWallet = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const provider = (window as any).phantom?.solana;
      if (!provider?.isPhantom) {
        throw new Error("Please install Phantom Wallet");
      }
      const resp = await provider.connect();
      setWallet(resp.publicKey.toString());
      setMessage({ type: "success", text: "Wallet connected successfully" });
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Failed to connect wallet",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const lookupDashboardWallet = async () => {
    if (!lookupInput.trim()) return;
    setLookupLoading(true);

    try {
      const addressToCheck = new PublicKey(lookupInput.trim());

      const [buyerEscrow] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("auction_house"),
          AUCTION_HOUSE.toBuffer(),
          addressToCheck.toBuffer(),
        ],
        AH_PROGRAM,
      );

      const escrowInfo = await connection.getAccountInfo(buyerEscrow);
      const escrowBalance =
        escrowInfo && escrowInfo.lamports > 0 ? escrowInfo.lamports / 1e9 : 0;

      // Update dashboard
      const existingIndex = trackedWallets.findIndex(
        (w) => w.address === addressToCheck.toString(),
      );
      if (existingIndex >= 0) {
        const updated = [...trackedWallets];
        updated[existingIndex].balance = escrowBalance;
        setTrackedWallets(updated);
      } else {
        setTrackedWallets((prev) => [
          { address: addressToCheck.toString(), balance: escrowBalance },
          ...prev,
        ]);
      }

      setLookupInput("");
    } catch (err) {
      console.error("Lookup failed:", err);
    } finally {
      setLookupLoading(false);
    }
  };

  const checkMyBalance = async () => {
    if (!wallet) return;
    setIsLoading(true);
    setMessage(null);
    try {
      const [buyerEscrow] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("auction_house"),
          AUCTION_HOUSE.toBuffer(),
          new PublicKey(wallet).toBuffer(),
        ],
        AH_PROGRAM,
      );

      let escrowBalance = 0;
      const escrowInfo = await connection.getAccountInfo(buyerEscrow);
      if (escrowInfo && escrowInfo.lamports > 0) {
        escrowBalance = escrowInfo.lamports / 1e9;
      }

      if (escrowBalance > 0) {
        setBalance(escrowBalance);
        setLsolMint(TREASURY_MINT.toString());
      } else {
        setBalance(0);
        setMessage({
          type: "error",
          text: "No stuck SOL found for your wallet.",
        });
      }
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Error fetching balance.",
      });
      setBalance(null);
      setLsolMint(null);
    } finally {
      setIsLoading(false);
    }
  };

  const withdrawSol = async () => {
    if (!wallet || balance === null || !lsolMint) return;
    setIsLoading(true);
    setMessage(null);
    try {
      const provider = (window as any).phantom?.solana;
      if (!provider) throw new Error("Phantom wallet not found");

      const USER_WALLET = new PublicKey(wallet);
      const [buyerEscrow, escrowPaymentBump] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("auction_house"),
          AUCTION_HOUSE.toBuffer(),
          USER_WALLET.toBuffer(),
        ],
        AH_PROGRAM,
      );

      const amountBuffer = Buffer.alloc(8);
      amountBuffer.writeBigUInt64LE(BigInt(Math.floor(balance * 1e9)), 0);

      const discriminator = Buffer.from("b712469c946da122", "hex");

      const ix = new TransactionInstruction({
        programId: AH_PROGRAM,
        keys: [
          { pubkey: USER_WALLET, isSigner: true, isWritable: false },
          { pubkey: USER_WALLET, isSigner: false, isWritable: true },
          { pubkey: buyerEscrow, isSigner: false, isWritable: true },
          { pubkey: TREASURY_MINT, isSigner: false, isWritable: false },
          { pubkey: AH_AUTHORITY, isSigner: false, isWritable: false }, // Must be true according to smart contract!
          { pubkey: AUCTION_HOUSE, isSigner: false, isWritable: false },
          { pubkey: FEE_ACCOUNT, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
          {
            pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
          },
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([
          discriminator,
          Buffer.from([escrowPaymentBump]),
          amountBuffer,
        ]),
      });

      const tx = new Transaction().add(ix);
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = USER_WALLET;

      const signedTx = await provider.signTransaction(tx);
      const txid = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(txid, "confirmed");

      setMessage({
        type: "success",
        text: `Successfully withdrew ${balance} SOL.`,
        sig: txid,
      });
      setBalance(0);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: "error", text: err.message || "Transaction failed." });
    } finally {
      setIsLoading(false);
    }
  };

  const totalStuck = trackedWallets.reduce(
    (acc, curr) => acc + curr.balance,
    0,
  );
  const affectedCount = trackedWallets.filter((w) => w.balance > 0).length;

  return (
    <>
      <nav className="navbar">
        <div className="nav-left">
          <div className="logo-box">
            <span className="logo-icon">■</span>
            <span className="logo-text">L-SOL</span>
          </div>
          <div className="nav-links">
            <button
              className={`nav-link ${activeTab === "dashboard" ? "active" : ""}`}
              onClick={() => setActiveTab("dashboard")}
            >
              DASHBOARD
            </button>
            <button
              className={`nav-link ${activeTab === "recovery" ? "active" : ""}`}
              onClick={() => setActiveTab("recovery")}
            >
              CLAIM
            </button>
            <button 
              className={`nav-link ${activeTab === "about" ? "active" : ""}`}
              onClick={() => setActiveTab("about")}
            >
              ABOUT
            </button>
          </div>
        </div>
        <div className="nav-right">
          <button className="nav-connect-btn" onClick={connectWallet} disabled={isLoading}>
            {isLoading ? "..." : wallet ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : "CONNECT"}
          </button>
        </div>
      </nav>

      <div className="main-content">
        <header>
          <h1>OPENSEA ESCROW TRACKER</h1>
          <p className="subtitle">
            Monitoring stuck SOL in deprecated Metaplex Auction Houses
          </p>
        </header>

        {activeTab === "dashboard" ? (
          <div className="dashboard-content">
            <div className="metrics-grid">
              <div className="metric-card">
                <span className="metric-label">Total SOL Locked</span>
                <span className="metric-value">
                  {totalStuck.toFixed(4)} <span className="metric-unit">SOL</span>
                </span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Tracked Accounts</span>
                <span className="metric-value">{affectedCount}</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Contract Status</span>
                <span className="metric-value alert-value" style={{ fontSize: "1.5rem", marginTop: "auto" }}>
                  requiresSignOff: true
                </span>
              </div>
            </div>

            <div className="lookup-section">
              <h2 className="lookup-title">
                <Search size={18} /> Lookup Wallet Escrow
              </h2>
              <div className="lookup-row">
                <input
                  type="text"
                  value={lookupInput}
                  onChange={(e) => setLookupInput(e.target.value)}
                  placeholder="Enter Solana wallet address..."
                  className="lookup-input"
                />
                <button
                  className="btn-primary"
                  onClick={lookupDashboardWallet}
                  disabled={lookupLoading || !lookupInput.trim()}
                >
                  {lookupLoading ? "SEARCHING..." : "SEARCH"}
                </button>
              </div>
            </div>

            <div className="table-section">
              <div className="table-header">TRACKED AFFECTED WALLETS</div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Wallet Address</th>
                    <th style={{ textAlign: "right" }}>Stuck Balance (SOL)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {currentWallets.map((w, idx) => (
                    <tr key={idx}>
                      <td>{w.address}</td>
                      <td
                        style={{
                          textAlign: "right",
                          fontWeight: "bold",
                          color: w.balance > 0 ? "var(--error)" : "inherit",
                        }}
                      >
                        {w.balance > 0 ? w.balance.toFixed(5) : "0"}
                      </td>
                      <td>
                        {w.balance > 0 ? (
                          <span className="badge badge-locked">
                            Locked (Error 6011)
                          </span>
                        ) : (
                          <span className="badge badge-empty">Empty</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="pagination">
                  <button 
                    className="btn-page" 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                    disabled={currentPage === 1}
                  >
                    PREV
                  </button>
                  <span>PAGE {currentPage} OF {totalPages}</span>
                  <button 
                    className="btn-page" 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                    disabled={currentPage === totalPages}
                  >
                    NEXT
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === "recovery" ? (
          <div className="recovery-content">
            {!wallet ? (
              <div style={{ textAlign: "center" }}>
                <Wallet
                  size={48}
                  color="var(--text-main)"
                  style={{ margin: "0 auto 1.5rem" }}
                />
                <h2 style={{ fontFamily: "'JetBrains Mono', monospace", marginBottom: "1rem" }}>CONNECT WALLET</h2>
                <p
                  style={{ color: "var(--text-muted)", marginBottom: "2rem", maxWidth: "400px" }}
                >
                  Connect your Phantom wallet to attempt a withdrawal from your
                  personal escrow account.
                </p>
                <button
                  className="btn-primary"
                  onClick={connectWallet}
                  disabled={isLoading}
                  style={{ padding: "1rem 2rem" }}
                >
                  CONNECT PHANTOM
                </button>
              </div>
            ) : (
              <div className="wallet-info">
                <div className="info-row">
                  <span className="info-label">Connected Wallet</span>
                  <span className="info-value">
                    {wallet.slice(0, 4)}...{wallet.slice(-4)}
                  </span>
                </div>

                <button
                  className="btn-primary"
                  onClick={checkMyBalance}
                  disabled={isLoading}
                  style={{ width: "100%", padding: "1.25rem", marginTop: "1rem" }}
                >
                  {isLoading ? "CHECKING..." : "CHECK MY ESCROW BALANCE"}
                </button>

                {balance !== null && (
                  <div className="stuck-funds-row">
                    <span className="info-label" style={{ color: "var(--error)" }}>
                      Stuck Funds Found
                    </span>
                    <span className="balance-large">
                      {balance} <span style={{ fontSize: "1rem", alignSelf: "flex-end", marginBottom: "0.5rem" }}>SOL</span>
                    </span>
                    <p style={{ fontSize: "0.85rem", color: "var(--error)", opacity: 0.8, marginTop: "0.5rem" }}>
                      These funds are locked in the OpenSea escrow PDA.
                    </p>
                  </div>
                )}

                <button
                  className="btn-danger"
                  onClick={withdrawSol}
                  disabled={isLoading || balance === null || balance === 0}
                  title="Withdrawals are blocked by the smart contract"
                >
                  <ArrowDownToLine size={20} />
                  WITHDRAW SOL (BLOCKED)
                </button>
                <p className="blocked-note">
                  Withdrawal simulation will fail with Error 6011.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="explanation-card" style={{ margin: "0 auto", marginTop: "2rem" }}>
            <h2 className="explanation-title">
              <AlertCircle size={20} />
              The OpenSea Solana Escrow Issue
            </h2>
            <div className="explanation-text">
              <h3 style={{ color: "var(--text-main)", marginBottom: "1rem" }}>What happened to my SOL?</h3>
              <p>
                When you made an offer on a Solana NFT using OpenSea, your SOL was temporarily transferred into a secure digital vault (called an "escrow" account). This was a normal process to ensure that if the seller accepted your offer, your funds were ready to complete the trade.
              </p>
              
              <h3 style={{ color: "var(--text-main)", margin: "2rem 0 1rem" }}>The "Two-Key" Vault Problem</h3>
              <p>
                To prevent fraud, OpenSea configured their smart contract with a strict security setting called <strong><code>requiresSignOff = true</code></strong>. 
              </p>
              <p>
                Think of this like a bank vault that requires two keys to open: your key (your Phantom wallet), and OpenSea's key (their backend server). <strong>No funds can ever leave the vault without both keys turning at the same time.</strong>
              </p>

              <h3 style={{ color: "var(--text-main)", margin: "2rem 0 1rem" }}>Why is it stuck now?</h3>
              <p>
                When OpenSea officially shut down their Solana marketplace, they permanently turned off the backend servers that hold their "second key." Because their systems are offline, they are no longer co-signing withdrawal requests.
              </p>
              <p>
                If you attempt to withdraw your SOL today, the Solana blockchain will automatically reject it with an <strong>Error 6011 (CannotTakeThisActionWithoutAuctionHouseSignOff)</strong>. It is mathematically impossible to withdraw your funds without OpenSea's approval.
              </p>

              <h3 style={{ color: "var(--text-main)", margin: "2rem 0 1rem" }}>How can this be fixed?</h3>
              <p>
                OpenSea still controls the master administrator wallet for this contract. All they need to do is send a single transaction to toggle the <code>requiresSignOff</code> setting to <code>false</code>. 
              </p>
              <p>
                Once they flip that switch, the requirement for their "second key" is removed, and all <strong>2,800+ users</strong> will immediately be able to withdraw their <strong>704+ stuck SOL</strong> using the Claim page on this site.
              </p>

              <hr style={{ border: "none", borderTop: "1px solid var(--border-color)", margin: "3rem 0" }} />

              <h3 style={{ color: "var(--text-muted)", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "1rem" }}>Technical Details & Explorer Links</h3>
              <ul style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: "1.8", paddingLeft: "1.5rem" }}>
                <li>
                  <strong>Metaplex Auction House Program:</strong>{" "}
                  <a href="https://solscan.io/account/hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk" target="_blank" rel="noopener noreferrer" style={{ color: "#38bdf8", textDecoration: "none" }}>
                    hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk
                  </a>
                </li>
                <li>
                  <strong>OpenSea Authority Wallet:</strong>{" "}
                  <a href="https://solscan.io/account/2pahVjZpYQ38mXW3iU7CqBwtN1X7f2J9B62iJ1M81V13" target="_blank" rel="noopener noreferrer" style={{ color: "#38bdf8", textDecoration: "none" }}>
                    2pahVjZpYQ38mXW3iU7CqBwtN1X7f2J9B62iJ1M81V13
                  </a>
                </li>
                <li>
                  <strong>Auction House Instance PDA:</strong>{" "}
                  <a href="https://solscan.io/account/3o9d13qUvEuuauhFrVom1vuCzgNsJifeaBYDPquaT73Y" target="_blank" rel="noopener noreferrer" style={{ color: "#38bdf8", textDecoration: "none" }}>
                    3o9d13qUvEuuauhFrVom1vuCzgNsJifeaBYDPquaT73Y
                  </a>
                </li>
              </ul>
            </div>
          </div>
        )}

        {message && (
          <div className={`message message-${message.type}`}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                marginBottom: "0.5rem",
              }}
            >
              {message.type === "success" ? (
                <CheckCircle2 size={18} />
              ) : (
                <AlertCircle size={18} />
              )}
              <strong>{message.type === "success" ? "SUCCESS" : "ERROR"}</strong>
            </div>
            <div>{message.text}</div>
            {message.sig && (
              <div style={{ marginTop: "1rem" }}>
                <a
                  href={`https://solscan.io/tx/${message.sig}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="signature-link"
                >
                  VIEW ON SOLSCAN ↗
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default App;
