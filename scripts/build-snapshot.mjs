// Fast leaderboard snapshot for Spazio Brothers (Hyperliquid EVM via Blockscout)
// - Current owner only (time since they last RECEIVED each token)
// - Selling resets for that token (past holders removed)
// - 10 Shrooms / 6h
// - Count only since 2025-08-18 06:00 US-Eastern = 2025-08-18T10:00:00Z
//
// Bounds strategy (no proxy calls required):
//   latestBlock := block of newest NFT transfer (account/tokennfttx sort=desc offset=1)
//   startBlock  := walk transfers (sort=desc pages) to find last row with ts >= START; use its block.
//                  If newest transfer ts < START, set startBlock = latestBlock (no events since start).
//
// Then logs are fetched via logs/getLogs in small chunks [startBlock..latestBlock].

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import dayjs from "dayjs";

dotenv.config({ path: ".env.local" });
dotenv.config();

const API = process.env.EXPLORER_API_BASE || "https://hyperliquid.cloud.blockscout.com/api";
const API_KEY = process.env.EXPLORER_API_KEY || "";
const CONTRACT = (process.env.SPAZIO_CONTRACT || "").toLowerCase();
if (!CONTRACT) {
  console.error("Missing SPAZIO_CONTRACT in .env.local");
  process.exit(1);
}

// ----- scoring -----
const SIX_HOURS = 6 * 60 * 60;               // seconds
const POINTS_PER_PERIOD = 10;                // 10 Shrooms per 6h
const START_AT_ISO = "2025-08-18T10:00:00Z"; // 06:00 US-Eastern
const START_EPOCH = Math.floor(new Date(START_AT_ISO).getTime() / 1000);

// Optional manual override if ever needed:
const ENV_START_BLOCK = Number(process.env.START_BLOCK || 0);

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJSON(url, tries = 6) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      const text = await res.text();
      return JSON.parse(text);
    } catch (e) {
      err = e;
      await sleep(300 * (i + 1));
    }
  }
  throw err || new Error(`Failed to fetch ${url}`);
}

async function fetchTransfersPage({ page, offset = 1000, sort = "desc" }) {
  const p = new URLSearchParams({
    module: "account",
    action: "tokennfttx",
    contractaddress: CONTRACT,
    page: String(page),
    offset: String(offset),
    sort,
  });
  if (API_KEY) p.append("apikey", API_KEY);
  const url = `${API}?${p.toString()}`;
  const j = await fetchJSON(url);
  return Array.isArray(j?.result) ? j.result : [];
}

// Resolve scan bounds from transfers only
async function resolveBoundsFromTransfers() {
  // newest transfer gives us latest block
  const newest = await fetchTransfersPage({ page: 1, offset: 1, sort: "desc" });
  if (!newest.length) throw new Error("No transfers found for this contract.");
  const latestBlock = Number(newest[0].blockNumber);
  const newestTs = Number(newest[0].timeStamp || 0);

  // If even the newest transfer is older than start, there were no transfers since start.
  // Use startBlock = latestBlock to minimize scan (will return zero logs or very few).
  if (newestTs < START_EPOCH) {
    return { startBlock: latestBlock, latestBlock };
  }

  // Otherwise, walk pages until we find first row with ts < START_EPOCH.
  const pageSize = 1000;
  let page = 1;
  let candidateBlock = Number(newest[0].blockNumber); // last block we saw with ts >= START

  while (true) {
    const rows = await fetchTransfersPage({ page, offset: pageSize, sort: "desc" });
    if (!rows.length) break; // shouldn’t happen before we cross

    // If the oldest row on this page is still >= START, keep going.
    const oldestTs = Number(rows[rows.length - 1]?.timeStamp || 0);
    if (oldestTs >= START_EPOCH) {
      // update candidate with the oldest row in this page (still >= START)
      candidateBlock = Number(rows[rows.length - 1].blockNumber);
      page += 1;
      await sleep(120);
      continue;
    }

    // We crossed the boundary inside this page. Pick last row with ts >= START.
    for (let i = 0; i < rows.length; i++) {
      const ts = Number(rows[i].timeStamp || 0);
      if (ts < START_EPOCH) {
        // last >= START is i-1, but handle i==0 edge: none >= START in this page
        const idx = i - 1;
        if (idx >= 0) {
          candidateBlock = Number(rows[idx].blockNumber);
        }
        // If idx<0, there were none >= START in this page; keep previous candidate.
        return { startBlock: candidateBlock, latestBlock };
      }
      // Still >= START
      candidateBlock = Number(rows[i].blockNumber);
    }

    // If we didn’t return, whole page >= START, continue
    page += 1;
    await sleep(120);
  }

  // Fallback: use the last candidate we saw >= START
  return { startBlock: candidateBlock, latestBlock };
}

async function fetchLogsRange(fromBlock, toBlock) {
  const params = new URLSearchParams({
    module: "logs",
    action: "getLogs",
    fromBlock: String(fromBlock),
    toBlock: String(toBlock),
    address: CONTRACT,
    topic0: TRANSFER_TOPIC0,
  });
  if (API_KEY) params.append("apikey", API_KEY);
  const url = `${API}?${params.toString()}`;
  const json = await fetchJSON(url, 8);

  if (json.status === "1" && Array.isArray(json.result)) return json.result;
  if (json.status === "0") {
    const msg = (json.message || "").toLowerCase();
    if (msg.includes("no records") || msg.includes("no logs")) return [];
  }
  return Array.isArray(json.result) ? json.result : [];
}

function addrFromTopic(t) {
  if (!t || typeof t !== "string") return "0x0000000000000000000000000000000000000000";
  return "0x" + t.slice(-40).toLowerCase();
}
function tokenIdFromTopic(t) { try { return BigInt(t); } catch { return 0n; } }

async function main() {
  console.log("Explorer:", API);
  console.log("Contract:", CONTRACT);
  console.log(`Scoring: ${POINTS_PER_PERIOD} Shrooms / 6h, start at ${START_AT_ISO}`);

  let { startBlock, latestBlock } = await resolveBoundsFromTransfers();
  if (ENV_START_BLOCK > 0) startBlock = ENV_START_BLOCK; // manual override if provided
  if (startBlock > latestBlock) startBlock = latestBlock;

  console.log("Block span:", startBlock, "→", latestBlock);

  const CHUNK = 3000; // rate-limit friendly
  const transfers = [];

  for (let from = startBlock; from <= latestBlock; from += CHUNK + 1) {
    const to = Math.min(latestBlock, from + CHUNK);
    const logs = await fetchLogsRange(from, to);
    console.log(`  blocks ${from}-${to}: ${logs.length} logs`);
    for (const l of logs) {
      const blockNumber = Number(l.blockNumber ?? l.block_number ?? 0);
      const logIndex    = Number(l.logIndex ?? l.log_index ?? 0);
      const timeStamp   = Number(l.timeStamp ?? l.timestamp ?? 0);
      const topics      = l.topics || [];
      transfers.push({
        blockNumber,
        timestamp: timeStamp,
        from: addrFromTopic(topics[1]),
        to:   addrFromTopic(topics[2]),
        tokenId: tokenIdFromTopic(topics[3]),
        txHash: l.transactionHash || l.transaction_hash || "",
        logIndex,
      });
    }
    await sleep(120);
  }

  // Sort events
  transfers.sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber - b.blockNumber
  );

  // Group by tokenId
  const byToken = new Map();
  for (const t of transfers) {
    const k = t.tokenId.toString();
    (byToken.get(k) ?? byToken.set(k, []).get(k)).push(t);
  }

  // Compute current owners since max(lastReceive, START_EPOCH)
  const ZERO = "0x0000000000000000000000000000000000000000";
  const now = Math.floor(Date.now() / 1000);
  const holdingsSeconds = {}; // addr -> seconds
  const tokenCount = {};      // addr -> tokens held

  for (const arr of byToken.values()) {
    const last = arr[arr.length - 1];
    const owner = last.to.toLowerCase();
    if (owner === ZERO) continue;
    const startTs = Math.max(last.timestamp || START_EPOCH, START_EPOCH);
    const held = Math.max(0, now - startTs);
    holdingsSeconds[owner] = (holdingsSeconds[owner] ?? 0) + held;
    tokenCount[owner] = (tokenCount[owner] ?? 0) + 1;
  }

  const leaderboard = Object.entries(holdingsSeconds)
    .map(([address, secs]) => {
      const periods = Math.floor(secs / SIX_HOURS);
      const points  = periods * POINTS_PER_PERIOD;
      return { address, tokens: tokenCount[address] ?? 0, holdingSeconds: secs, periods, points };
    })
    .sort((a, b) => b.points - a.points);

  const payload = {
    updatedAt: dayjs().toISOString(),
    contract: CONTRACT,
    rule: {
      label: "Shrooms",
      windowHours: 6,
      pointsPerWindow: POINTS_PER_PERIOD,
      onlyCurrentOwners: true,
      resetOnSale: true,
      startAt: START_AT_ISO,
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
