import { useState, useEffect } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  Wallet,
  ArrowDownToLine,
  AlertCircle,
  Search,
  CheckCircle2,
} from "lucide-react";
import {
  AUCTION_HOUSE,
  AH_PROGRAM,
  deriveBuyerEscrow,
  reclaimWithWallet,
} from "./recovery";

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

const INITIAL_TRACKED_WALLETS: TrackedWallet[] = (
  affectedWalletsData.wallets || []
).map((w: TrackedWallet) => ({ address: w.address, balance: w.balance }));

// Optional metadata written by refresh_balances.cjs (older data files omit these).
const DATA_META = affectedWalletsData as unknown as {
  generatedAt?: string;
  totalLockedSol?: number;
  walletsStillLocked?: number;
  walletsRecovered?: number;
};

function App() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: string;
    text: string;
    sig?: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "recovery" | "about">(
    "dashboard",
  );
  const [trackedWallets, setTrackedWallets] = useState<TrackedWallet[]>(
    INITIAL_TRACKED_WALLETS,
  );
  const [lookupInput, setLookupInput] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const handleCopy = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const totalPages = Math.ceil(trackedWallets.length / itemsPerPage);
  const currentWallets = trackedWallets.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
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

  const escrowBalanceFor = async (owner: PublicKey): Promise<number> => {
    const [buyerEscrow] = deriveBuyerEscrow(owner);
    const info = await connection.getAccountInfo(buyerEscrow);
    return info && info.lamports > 0 ? info.lamports / 1e9 : 0;
  };

  const lookupDashboardWallet = async () => {
    if (!lookupInput.trim()) return;
    setLookupLoading(true);
    try {
      const addressToCheck = new PublicKey(lookupInput.trim());
      const escrowBalance = await escrowBalanceFor(addressToCheck);

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
      const escrowBalance = await escrowBalanceFor(new PublicKey(wallet));
      setBalance(escrowBalance);
      if (escrowBalance === 0) {
        setMessage({
          type: "error",
          text: "No reclaimable SOL found for this wallet.",
        });
      }
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Error fetching balance.",
      });
      setBalance(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Working recovery: CloseEscrowAccount is NOT gated by requiresSignOff, so the
  // wallet owner alone can close the escrow and reclaim all of its lamports.
  const reclaimSol = async () => {
    if (!wallet || balance === null || balance === 0) return;
    setIsLoading(true);
    setMessage(null);
    try {
      const provider = (window as any).phantom?.solana;
      if (!provider) throw new Error("Phantom wallet not found");

      const sig = await reclaimWithWallet(
        connection,
        new PublicKey(wallet),
        provider,
      );
      setMessage({
        type: "success",
        text: `Reclaimed ${balance} SOL to your wallet.`,
        sig,
      });
      setBalance(0);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: "error", text: err.message || "Transaction failed." });
    } finally {
      setIsLoading(false);
    }
  };

  const totalStuck = trackedWallets.reduce((acc, curr) => acc + curr.balance, 0);
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
              RECLAIM
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
          <button
            className="nav-connect-btn"
            onClick={connectWallet}
            disabled={isLoading}
          >
            {isLoading
              ? "..."
              : wallet
                ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}`
                : "CONNECT"}
          </button>
        </div>
      </nav>

      <div className="main-content">
        <header>
          <h1>OPENSEA ESCROW RECOVERY</h1>
          <p className="subtitle">
            Reclaim SOL from the deprecated OpenSea Solana Auction House
          </p>
        </header>

        {activeTab === "dashboard" ? (
          <div className="dashboard-content">
            <div className="metrics-grid">
              <div className="metric-card">
                <span className="metric-label">Total SOL Still Locked</span>
                <span className="metric-value">
                  {totalStuck.toFixed(4)}{" "}
                  <span className="metric-unit">SOL</span>
                </span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Wallets Still Locked</span>
                <span className="metric-value">{affectedCount}</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Recovery Status</span>
                <span
                  className="metric-value"
                  style={{
                    fontSize: "1.5rem",
                    marginTop: "auto",
                    color: "var(--success, #22c55e)",
                  }}
                >
                  Available
                </span>
              </div>
            </div>

            <div
              className="message message-success"
              style={{ marginBottom: "1.5rem" }}
            >
              Funds are recoverable. The escrow can be closed by its owner via the{" "}
              <strong>CloseEscrowAccount</strong> instruction, which does not need
              OpenSea's sign-off. Go to the <strong>RECLAIM</strong> tab.
            </div>

            {DATA_META.generatedAt && (
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.8rem",
                  marginBottom: "1rem",
                }}
              >
                Snapshot: {new Date(DATA_META.generatedAt).toLocaleString()} ·{" "}
                {DATA_META.walletsRecovered ?? 0} wallets already emptied.
              </p>
            )}

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
                    <th style={{ textAlign: "right" }}>Balance (SOL)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {currentWallets.map((w, idx) => (
                    <tr key={idx}>
                      <td
                        onClick={() => handleCopy(w.address)}
                        style={{ cursor: "pointer" }}
                        title="Click to copy address"
                      >
                        <span className="desktop-only">{w.address}</span>
                        <span className="mobile-only">
                          {w.address.slice(0, 4)}...{w.address.slice(-4)}
                        </span>
                        {copiedAddress === w.address && (
                          <span
                            style={{
                              color: "#38bdf8",
                              marginLeft: "8px",
                              fontSize: "0.75rem",
                              fontWeight: "bold",
                            }}
                          >
                            Copied!
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          fontWeight: "bold",
                          color: w.balance > 0 ? "var(--text-main)" : "inherit",
                        }}
                      >
                        {w.balance > 0 ? w.balance.toFixed(5) : "0"}
                      </td>
                      <td>
                        {w.balance > 0 ? (
                          <span className="badge badge-locked">
                            <span className="desktop-only">Reclaimable</span>
                            <span className="mobile-only">Open</span>
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
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    PREV
                  </button>
                  <span>
                    PAGE {currentPage} OF {totalPages}
                  </span>
                  <button
                    className="btn-page"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
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
                <h2
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    marginBottom: "1rem",
                  }}
                >
                  CONNECT WALLET
                </h2>
                <p
                  style={{
                    color: "var(--text-muted)",
                    marginBottom: "2rem",
                    maxWidth: "400px",
                  }}
                >
                  Connect the wallet that made the OpenSea offers to check and
                  reclaim its escrow balance.
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

                {balance !== null && balance > 0 && (
                  <div className="stuck-funds-row">
                    <span className="info-label">Reclaimable Funds</span>
                    <span className="balance-large">
                      {balance}{" "}
                      <span
                        style={{
                          fontSize: "1rem",
                          alignSelf: "flex-end",
                          marginBottom: "0.5rem",
                        }}
                      >
                        SOL
                      </span>
                    </span>
                    <p
                      style={{
                        fontSize: "0.85rem",
                        color: "var(--text-muted)",
                        marginTop: "0.5rem",
                      }}
                    >
                      Reclaiming closes your escrow account and returns these
                      lamports to your wallet. Only your signature is required.
                    </p>
                  </div>
                )}

                <button
                  className="btn-primary"
                  onClick={reclaimSol}
                  disabled={isLoading || balance === null || balance === 0}
                  style={{
                    width: "100%",
                    padding: "1.25rem",
                    marginTop: "1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                  }}
                >
                  <ArrowDownToLine size={20} />
                  {isLoading ? "RECLAIMING..." : "RECLAIM SOL"}
                </button>
                <p className="blocked-note">
                  Uses CloseEscrowAccount. The old Withdraw path is blocked by
                  Error 6011; this one is not.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div
            className="explanation-card"
            style={{ margin: "0 auto", marginTop: "2rem" }}
          >
            <h2 className="explanation-title">
              <AlertCircle size={20} />
              The OpenSea Solana Escrow Issue — and the fix
            </h2>
            <div className="explanation-text">
              <h3 style={{ color: "var(--text-main)", marginBottom: "1rem" }}>
                What happened to my SOL?
              </h3>
              <p>
                When you made an offer on a Solana NFT using OpenSea, your SOL was
                moved into a per-wallet escrow account (a PDA) owned by OpenSea's
                Auction House program. If the offer was never accepted, that SOL
                is still sitting in the escrow.
              </p>

              <h3 style={{ color: "var(--text-main)", margin: "2rem 0 1rem" }}>
                Why "Withdraw" fails
              </h3>
              <p>
                OpenSea configured the contract with{" "}
                <strong>
                  <code>requiresSignOff = true</code>
                </strong>
                . The <code>Withdraw</code> instruction is gated by that flag, so
                a withdraw needs OpenSea's backend to co-sign. Since that backend
                is offline, a withdraw is rejected with{" "}
                <strong>Error 6011 (CannotTakeThisActionWithoutAuctionHouseSignOff)</strong>
                .
              </p>

              <h3 style={{ color: "var(--text-main)", margin: "2rem 0 1rem" }}>
                The fix: CloseEscrowAccount
              </h3>
              <p>
                The same program has a different instruction,{" "}
                <strong>
                  <code>CloseEscrowAccount</code>
                </strong>
                , which is <strong>not</strong> gated by the sign-off flag. It
                closes your escrow PDA and returns <strong>all</strong> of its
                lamports (your deposited SOL plus the account rent) to your wallet,
                requiring <strong>only your own signature</strong>. No OpenSea
                sign-off, and OpenSea does not need to change any setting.
              </p>
              <p>
                This has been verified by simulation and by live, successful
                on-chain closures on this exact auction house. Use the{" "}
                <strong>RECLAIM</strong> tab, or the <code>reclaim.cjs</code> CLI
                in the repository.
              </p>

              <hr
                style={{
                  border: "none",
                  borderTop: "1px solid var(--border-color)",
                  margin: "3rem 0",
                }}
              />

              <h3
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.9rem",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  marginBottom: "1rem",
                }}
              >
                Technical Details & Explorer Links
              </h3>
              <ul
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.9rem",
                  lineHeight: "1.8",
                  paddingLeft: "1.5rem",
                }}
              >
                <li>
                  <strong>Auction House Program:</strong>{" "}
                  <a
                    href={`https://solscan.io/account/${AH_PROGRAM.toBase58()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#38bdf8", textDecoration: "none" }}
                  >
                    {AH_PROGRAM.toBase58()}
                  </a>
                </li>
                <li>
                  <strong>Auction House Instance PDA:</strong>{" "}
                  <a
                    href={`https://solscan.io/account/${AUCTION_HOUSE.toBase58()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#38bdf8", textDecoration: "none" }}
                  >
                    {AUCTION_HOUSE.toBase58()}
                  </a>
                </li>
                <li>
                  <strong>Recovery instruction:</strong> CloseEscrowAccount
                  (discriminator 209,42,208,179,140,78,18,43 + escrow bump)
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
