// scripts/build-snapshot.mjs
// Spazio Shrooms snapshot generator
//
// What it does
// 1) (Optional) FAST explorer scan: Blockscout DESC pages to discover latest transfer per tokenId.
//    You can disable this by setting PAGE_SIZE=0 or SKIP_EXPLORER=1.
// 2) ALWAYS does an RPC backfill (eth_getLogs) to ensure we discover *all* tokenIds up to SUPPLY.
// 3) Builds a leaderboard of *current owners only*.
//    Shrooms = floor( (now - max(lastReceiveTs, START_AT)) / 6h ) * SHROOMS_PER_WINDOW
//
// Env you probably want in `.env.local`:
//   EXPLORER_API_BASE=https://hyperliquid.cloud.blockscout.com/api
//   SPAZIO_CONTRACT=0x04483D877E95Ce182e8595A3f67fDccc7B55A676
//   START_AT_ISO=2025-08-18T10:00:00Z
//   SHROOMS_PER_WINDOW=10
//   SUPPLY=3333
//
//   # Explorer pass (set PAGE_SIZE=0 to skip)
//   PAGE_SIZE=1000
//
//   # RPC settings
//   RPC_URL=https://hyperliquid.drpc.org
//   RPC_FROM_BLOCK=0
//   RPC_CHUNK=8000
//   RPC_PARALLEL=2
//
//   # Retry/backoff (optional)
//   MAX_RETRIES=8
//   BASE_BACKOFF=500
//   MAX_BACKOFF=5000
//
// Run with more heap if needed:
//   NODE_OPTIONS="--max-old-space-size=3072 --expose-gc" npm run snapshot

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import dayjs from "dayjs";

dotenv.config({ path: ".env.local" });
dotenv.config();

// -------------------------
// Config
// -------------------------
const API = process.env.EXPLORER_API_BASE || "https://hyperliquid.cloud.blockscout.com/api";
const CONTRACT = (process.env.SPAZIO_CONTRACT || "").toLowerCase();
if (!/^0x[0-9a-fA-F]{40}$/.test(CONTRACT)) {
  console.error("Missing/invalid SPAZIO_CONTRACT in .env.local");
  process.exit(1);
}

const START_AT_ISO = process.env.START_AT_ISO || "2025-08-18T10:00:00Z";
const START_AT = Math.floor(new Date(START_AT_ISO).getTime() / 1000);
const SHROOMS_PER_WINDOW = Number(process.env.SHROOMS_PER_WINDOW || 10);
const SIX_HOURS = 6 * 60 * 60;

const SUPPLY = Number(process.env.SUPPLY || 0);
if (!SUPPLY || SUPPLY <= 0) {
  console.error("Please set SUPPLY (total minted token count) in .env.local");
  process.exit(1);
}

// Explorer paging
const PAGE_SIZE = Number(process.env.PAGE_SIZE ?? 1000);
const SKIP_EXPLORER = PAGE_SIZE <= 0 || process.env.SKIP_EXPLORER === "1";
const STALE_PAGES_AFTER_TARGET = 3; // keep paging a few more pages after reaching target

// RPC settings
const RPC_URL = process.env.RPC_URL || "https://hyperliquid.drpc.org";
const RPC_FROM_BLOCK = Number(process.env.RPC_FROM_BLOCK || 0);
const RPC_CHUNK = Number(process.env.RPC_CHUNK || 8000);
const RPC_PARALLEL = Math.max(1, Number(process.env.RPC_PARALLEL || 2));

// Retry/backoff
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 8);
const BASE_BACKOFF = Number(process.env.BASE_BACKOFF || 500);
const MAX_BACKOFF = Number(process.env.MAX_BACKOFF || 5000);

// ERC-721 Transfer(topic0) = keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// -------------------------
// Helpers
// -------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const toHex = (n) => "0x" + BigInt(n).toString(16);

function topicToAddress(topic) {
  // topic is 32-byte hex string (0x + 64 hex). Last 40 chars are the address.
  return "0x" + topic.slice(-40).toLowerCase();
}

function hexToDec(hex) {
  return Number(BigInt(hex));
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

// Simple JSON fetch with retries (for Blockscout)
async function fetchJSON(url) {
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      const text = await res.text();
      // Blockscout sometimes returns html on errors/timeouts
      if (!text || text[0] !== "{") {
        throw new Error(`Non-JSON explorer response: ${text.slice(0, 120)}...`);
      }
      const json = JSON.parse(text);
      return json;
    } catch (e) {
      attempt++;
      if (attempt > MAX_RETRIES) throw e;
      const backoff = clamp(BASE_BACKOFF * 2 ** (attempt - 1), BASE_BACKOFF, MAX_BACKOFF);
      console.log(`  ↳ explorer retry ${attempt}/${MAX_RETRIES}: ${e.message}`);
      await sleep(backoff);
    }
  }
}

// -------------------------
// Explorer fast scan (DESC)
// -------------------------
async function fetchExplorerPageDESC({ page, offset }) {
  const params = new URLSearchParams({
    module: "account",
    action: "tokennfttx",
    contractaddress: CONTRACT,
    page: String(page),
    offset: String(offset),
    sort: "desc",
  });
  const url = `${API}?${params.toString()}`;
  const json = await fetchJSON(url);
  if (json.status === "0") return [];
  if (json.status === "1" && Array.isArray(json.result)) return json.result;
  return [];
}

/**
 * Returns rows of latest transfers (DESC) but only *first seen* per tokenId.
 * Stops when page returns empty OR after reaching target and seeing no growth
 * for STALE_PAGES_AFTER_TARGET pages.
 */
async function fastDescBySupply({ pageSize, target }) {
  const seen = new Set();
  const latestRows = new Map(); // tokenId -> row
  let page = 1;
  let stale = 0;

  console.log(
    `⚡ FAST DESC scan: pageSize=${pageSize}, target=${target}; will keep paging for ${STALE_PAGES_AFTER_TARGET} page(s) with no new tokens after target`
  );

  while (true) {
    let rows = [];
    try {
      rows = await fetchExplorerPageDESC({ page, offset: pageSize });
    } catch (e) {
      // Some explorers 524; try once with smaller page
      console.log(`  ↳ explorer retry 1/8: ${e.message}`);
      rows = await fetchExplorerPageDESC({ page, offset: Math.max(500, Math.floor(pageSize / 2)) });
    }

    if (!rows.length) {
      console.log(`Explorer returned empty page at ${page}. Stopping.`);
      break;
    }

    let newOnThisPage = 0;

    for (const r of rows) {
      const tokenId = String(r.tokenID);
      if (!seen.has(tokenId)) {
        seen.add(tokenId);
        latestRows.set(tokenId, r); // first time we see it in DESC = latest
        newOnThisPage++;
      }
    }

    console.log(
      `page ${page} • rows=${rows.length}, newTokens=+${newOnThisPage} • discovered=${seen.size}/${target}`
    );

    if (seen.size >= target) {
      if (newOnThisPage === 0) stale++;
      else stale = 0;
      if (stale >= STALE_PAGES_AFTER_TARGET) break;
    }

    page++;
  }

  return Array.from(latestRows.values());
}

// -------------------------
// Minimal JSON-RPC client
// -------------------------
async function rpc(method, params) {
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message || "RPC error");
      return json.result;
    } catch (e) {
      attempt++;
      if (attempt > MAX_RETRIES) throw e;
      const backoff = clamp(BASE_BACKOFF * 2 ** (attempt - 1), BASE_BACKOFF, MAX_BACKOFF);
      await sleep(backoff);
    }
  }
}

async function getLatestBlockNumber() {
  const hex = await rpc("eth_blockNumber", []);
  return Number(BigInt(hex));
}

async function getBlockTimestamp(blockNumber) {
  const hex = toHex(blockNumber);
  const result = await rpc("eth_getBlockByNumber", [hex, false]);
  return Number(BigInt(result.timestamp));
}

async function getLogsRange(fromBlock, toBlock) {
  const filter = {
    fromBlock: toHex(fromBlock),
    toBlock: toHex(toBlock),
    address: CONTRACT,
    topics: [TRANSFER_TOPIC],
  };
  return await rpc("eth_getLogs", [filter]);
}

/**
 * RPC discovery of tokenIds:
 * - walk block ranges descending: [latest … fromBlock]
 * - first time we see tokenId is the *latest* transfer (because we go descending by ranges)
 * - stores {blockNumber, logIndex, to, tokenId}
 */
async function discoverTokenIdsRPC({
  target,
  already, // Set<string> of tokenIds from explorer pass (optional)
  fromBlock,
  chunk,
  parallel,
}) {
  const latest = new Map(already ? Array.from(already).map((t) => [t, null]) : []);
  const have = () => Array.from(latest.keys()).filter((k) => latest.get(k) !== null).length;

  const high = await getLatestBlockNumber();
  let cursor = high;

  // Build work items descending
  const work = [];
  while (cursor > fromBlock) {
    const start = Math.max(fromBlock, cursor - chunk + 1);
    const end = cursor;
    work.push({ start, end });
    cursor = start - 1;
  }

  console.log(
    `🔎 RPC backfill from block ${high} → ${fromBlock}, chunk=${chunk}, parallel=${parallel}, target=${target}`
  );

  // Simple worker pool
  let idx = 0;
  async function worker(wid) {
    while (idx < work.length && have() < target) {
      const { start, end } = work[idx++];
      let logs = [];
      try {
        logs = await getLogsRange(start, end);
      } catch (e) {
        // One retry with halved chunk
        const mid = Math.floor((start + end) / 2);
        try {
          const a = await getLogsRange(mid + 1, end);
          const b = await getLogsRange(start, mid);
          logs = a.concat(b);
        } catch (e2) {
          // give up this slice; continue
          continue;
        }
      }

      // We process the returned logs in reverse so the last (highest) wins *within* the slice
      for (let i = logs.length - 1; i >= 0; i--) {
        const L = logs[i];
        // topics: [topic0, from, to, tokenId]
        if (!Array.isArray(L.topics) || L.topics.length < 4) continue;
        const tokenIdHex = L.topics[3];
        const tokenId = String(BigInt(tokenIdHex));
        // First time we set it we keep it (latest seen overall)
        if (!latest.has(tokenId) || latest.get(tokenId) === null) {
          latest.set(tokenId, {
            blockNumber: Number(BigInt(L.blockNumber)),
            logIndex: Number(BigInt(L.logIndex)),
            to: topicToAddress(L.topics[2]),
          });
        }
        if (have() >= target) break;
      }
      // Progress
      const got = have();
      console.log(
        `  • rpc ${wid} captured ${got}/${target} tokens (range ${start}..${end}, logs=${logs.length})`
      );
    }
  }

  const workers = Array.from({ length: parallel }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  // Filter to only tokenIds we actually resolved
  const entries = [];
  for (const [tokenId, data] of latest.entries()) {
    if (data) entries.push([tokenId, data]);
  }
  // If we still didn't hit target, we just return what we have.
  return new Map(entries);
}

// -------------------------
// Build leaderboard
// -------------------------
async function buildLeaderboard(latestByToken /* Map<tokenId, {blockNumber, logIndex, to}> */) {
  // Gather all blocks we need timestamps for
  const blockNums = uniq(Array.from(latestByToken.values()).map((v) => v.blockNumber));
  const tsCache = new Map();

  // Fetch timestamps (serial to be gentle; you can parallelize if your RPC allows)
  for (const bn of blockNums) {
    const ts = await getBlockTimestamp(bn);
    tsCache.set(bn, ts);
  }

  // Aggregate current owners only
  const ZERO = "0x0000000000000000000000000000000000000000";
  const owners = new Map(); // addr -> { tokens, heldSeconds }
  const now = Math.floor(Date.now() / 1000);

  for (const [, info] of latestByToken) {
    if (!info || !info.to || info.to === ZERO) continue;
    const ts = tsCache.get(info.blockNumber) || now;
    const startClock = Math.max(START_AT, ts);
    const held = Math.max(0, now - startClock);
    const prev = owners.get(info.to) || { tokens: 0, heldSeconds: 0 };
    prev.tokens += 1;
    prev.heldSeconds += held;
    owners.set(info.to, prev);
  }

  const leaderboard = Array.from(owners.entries())
    .map(([address, v]) => {
      const periods = Math.floor(v.heldSeconds / SIX_HOURS);
      const points = periods * SHROOMS_PER_WINDOW;
      return {
        address,
        tokens: v.tokens,
        holdingSeconds: v.heldSeconds,
        periods,
        points,
      };
    })
    .sort((a, b) => b.points - a.points || b.tokens - a.tokens);

  const payload = {
    updatedAt: dayjs().toISOString(),
    contract: CONTRACT,
    rule: {
      windowHours: 6,
      shroomsPerWindow: SHROOMS_PER_WINDOW,
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
  console.log("✅ Wrote public/leaderboard.json");
}

// -------------------------
// Main
// -------------------------
async function main() {
  console.log("Explorer:", API);
  console.log("Contract:", CONTRACT);
  console.log(`Scoring: ${SHROOMS_PER_WINDOW} Shrooms / 6h, start at ${START_AT_ISO}`);

  // 1) Optional explorer pass (fast DESC)
  const seedTokenIds = new Set();
  if (!SKIP_EXPLORER) {
    try {
      const rows = await fastDescBySupply({ pageSize: PAGE_SIZE, target: SUPPLY });
      for (const r of rows) seedTokenIds.add(String(BigInt(r.tokenID)));
      console.log(`Explorer seed tokenIds: ${seedTokenIds.size}`);
    } catch (e) {
      console.warn(`Explorer pass failed (${e.message}). Continuing with RPC only…`);
    }
  } else {
    console.log("Skipping explorer pass (PAGE_SIZE=0 or SKIP_EXPLORER=1). Using RPC only.");
  }

  // 2) RPC discovery to ensure we reach full SUPPLY
  const latestMap = await discoverTokenIdsRPC({
    target: SUPPLY,
    already: seedTokenIds,
    fromBlock: RPC_FROM_BLOCK,
    chunk: RPC_CHUNK,
    parallel: RPC_PARALLEL,
  });

  console.log(`Unique tokens captured (merged): ${latestMap.size}`);

  // 3) Build the leaderboard from latest transfer per token
  await buildLeaderboard(latestMap);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
