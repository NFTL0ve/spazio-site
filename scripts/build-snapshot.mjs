// scripts/build-snapshot.mjs
// Build a leaderboard JSON for Spazio Brothers holders using the HyperEVM Blockscout explorer.
// - Fetches all ERC-721 Transfer events for the contract
// - Points only accrue for CURRENT owners, since the last time they received each token
// - Selling (transfer out) resets points for that token for the seller
// - Scoring: every 6 hours = 10 points per NFT, counting only since 2025-08-01T00:00:00Z

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import dayjs from "dayjs";

// Read env (prefer .env.local, then fallback to .env)
dotenv.config({ path: ".env.local" });
dotenv.config();

// Explorer config (Blockscout/Etherscan compatible)
const API = process.env.EXPLORER_API_BASE || "https://hyperliquid.cloud.blockscout.com/api";
const API_KEY = process.env.EXPLORER_API_KEY || "";
const CONTRACT = (process.env.SPAZIO_CONTRACT || "").toLowerCase();

if (!CONTRACT) {
  console.error("Missing SPAZIO_CONTRACT in .env.local");
  process.exit(1);
}

// Scoring rules
const SIX_HOURS = 6 * 60 * 60;          // seconds
const POINTS_PER_PERIOD = 10;           // <-- changed from 600 to 10
const START_AT_ISO = "2025-08-01T00:00:00Z";
const START_EPOCH = Math.floor(new Date(START_AT_ISO).getTime() / 1000);

// Sleep helper
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fetch one page of ERC-721 transfers from Blockscout/Etherscan-compatible API
async function fetchPage(page, offset) {
  const params = new URLSearchParams({
    module: "account",
    action: "tokennfttx",
    contractaddress: CONTRACT,
    page: String(page),
    offset: String(offset),
    sort: "asc",
  });
  if (API_KEY) params.append("apikey", API_KEY);
  const url = `${API}?${params.toString()}`;

  // modest retry w/ backoff for transient issues
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      const text = await res.text();
      const json = JSON.parse(text);
      if (json.status === "1" && Array.isArray(json.result)) return json.result;
      if (
        json.status === "0" &&
        (String(json.message || "").toLowerCase().includes("no transactions") ||
          (Array.isArray(json.result) && json.result.length === 0))
      ) {
        return [];
      }
      await sleep(600 * (attempt + 1));
    } catch {
      await sleep(800 * (attempt + 1));
    }
  }
  throw new Error(`Explorer API failed for page ${page}`);
}

async function main() {
  console.log("Explorer:", API);
  console.log("Contract:", CONTRACT);
  console.log("Scoring: 10 pts / 6h, start at", START_AT_ISO);

  const offset = 1000; // rows per page
  let page = 1;
  const transfers = [];

  // Pull pages until empty page
  while (true) {
    const rows = await fetchPage(page, offset);
    console.log(`Fetched page ${page} (${rows.length} rows)`);
    if (!rows.length) break;

    for (const r of rows) {
      transfers.push({
        blockNumber: Number(r.blockNumber),
        timestamp: Number(r.timeStamp), // seconds epoch
        from: String(r.from).toLowerCase(),
        to: String(r.to).toLowerCase(),
        tokenId: BigInt(r.tokenID),
        txHash: r.hash,
        logIndex: Number(r.logIndex ?? 0),
      });
    }

    page += 1;
    await sleep(200); // tiny politeness pause
  }

  console.log(`Total transfers fetched: ${transfers.length}`);

  // Sort globally by block then logIndex
  transfers.sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber - b.blockNumber
  );

  // Group events by tokenId
  const byToken = new Map();
  for (const t of transfers) {
    const k = t.tokenId.toString();
    const arr = byToken.get(k) ?? [];
    arr.push(t);
    byToken.set(k, arr);
  }

  // --- Compute holding time for CURRENT owners only (reset on sale) ---
  const ZERO = "0x0000000000000000000000000000000000000000";
  const now = Math.floor(Date.now() / 1000);
  const holdingsSeconds = {}; // address -> seconds counted since max(last receive, START)

  for (const arr of byToken.values()) {
    // each arr is sorted ascending; the last transfer defines the current owner
    const last = arr[arr.length - 1];
    const currentOwner = last.to.toLowerCase();
    if (currentOwner === ZERO) continue; // burned

    // Only time since BOTH: the owner's last receive AND the global START date
    const heldStart = Math.max(last.timestamp, START_EPOCH);
    const held = Math.max(0, now - heldStart);

    holdingsSeconds[currentOwner] = (holdingsSeconds[currentOwner] ?? 0) + held;
  }

  // Convert seconds -> points (full 6h windows only)
  const leaderboard = Object.entries(holdingsSeconds)
    .map(([address, secs]) => {
      const periods = Math.floor(secs / SIX_HOURS);
      const points = periods * POINTS_PER_PERIOD;
      return { address, holdingSeconds: secs, periods, points };
    })
    .sort((a, b) => b.points - a.points);

  const payload = {
    updatedAt: dayjs().toISOString(),
    contract: CONTRACT,
    rule: {
      windowHours: 6,
      pointsPerWindow: POINTS_PER_PERIOD,
      onlyCurrentOwners: true,
      resetOnSale: true,
      startAt: START_AT_ISO, // <-- included for the UI to show
    },
    totalHolders: leaderboard.length,
    leaderboard,
  };

  const outDir = path.join(process.cwd(), "public");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "leaderboard.json"), JSON.stringify(payload, null, 2));
  console.log("Wrote public/leaderboard.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
