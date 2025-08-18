// scripts/build-snapshot.mjs
// Fast snapshot for Spazio Shrooms
// - Scans Blockscout `tokennfttx` in DESC order (newest first)
// - Records the *first* occurrence of each tokenId (that's the latest transfer => current owner)
// - Stops early once we've discovered SUPPLY tokens
// - Shrooms = floor( (now - max(lastReceiveTs, START_AT)) / 6h ) * 10

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import dayjs from "dayjs";

dotenv.config({ path: ".env.local" });
dotenv.config();

const API = process.env.EXPLORER_API_BASE || "https://hyperliquid.cloud.blockscout.com/api";
const API_KEY = process.env.EXPLORER_API_KEY || "";
const CONTRACT = (process.env.SPAZIO_CONTRACT || "").toLowerCase();

const START_AT_ISO = process.env.START_AT_ISO || "2025-08-18T10:00:00Z"; // 6am ET
const START_AT = Math.floor(new Date(START_AT_ISO).getTime() / 1000);

const SUPPLY = Number(process.env.SUPPLY || 0);           // REQUIRED for fast mode
const BURN_TOLERANCE = Number(process.env.BURN_TOLERANCE || 0);

const SIX_HOURS = 6 * 60 * 60;
const SHROOMS_PER_WINDOW = 10;

// tuneable page size (apis usually allow up to 5k)
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 5000);

if (!CONTRACT) {
  console.error("❌ Missing SPAZIO_CONTRACT in .env.local");
  process.exit(1);
}
if (!SUPPLY) {
  console.error("❌ Please set SUPPLY=<total minted tokens> in .env.local for fast scanning.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPageDesc(page) {
  const params = new URLSearchParams({
    module: "account",
    action: "tokennfttx",
    contractaddress: CONTRACT,
    page: String(page),
    offset: String(PAGE_SIZE),
    sort: "desc", // newer → older
  });
  if (API_KEY) params.append("apikey", API_KEY);

  const url = `${API}?${params.toString()}`;

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      const text = await res.text();
      const json = JSON.parse(text);
      if (json.status === "1" && Array.isArray(json.result)) return json.result;
      if (json.status === "0") return []; // empty page
    } catch (_) {}
    await sleep(400 * (attempt + 1));
  }
  throw new Error(`Explorer API failed at page ${page}`);
}

async function main() {
  console.log("Explorer:", API);
  console.log("Contract:", CONTRACT);
  console.log(`Scoring: ${SHROOMS_PER_WINDOW} Shrooms / 6h, start at ${START_AT_ISO}`);
  console.log(`Fast mode: DESC scan, pageSize=${PAGE_SIZE}, SUPPLY=${SUPPLY}`);

  // latest transfer per tokenId (we will only store the *first* time we see a tokenId)
  const latestByToken = new Map(); // tokenId(string) -> { to, ts }
  const seen = new Set();

  let page = 1;
  let totalRows = 0;
  const TARGET = Math.max(0, SUPPLY - BURN_TOLERANCE);

  while (true) {
    const rows = await fetchPageDesc(page);
    if (!rows.length) break;

    totalRows += rows.length;

    for (const r of rows) {
      const tokenId = String(r.tokenID);
      if (!seen.has(tokenId)) {
        // first time we see this token in DESC means it's the *latest* transfer
        seen.add(tokenId);
        latestByToken.set(tokenId, {
          to: String(r.to).toLowerCase(),
          ts: Number(r.timeStamp), // seconds
        });
      }
    }

    console.log(
      `Page ${page} (${rows.length} rows) • discovered so far: ${seen.size}/${TARGET} tokens`
    );
// scripts/build-snapshot.mjs
// Spazio Shrooms snapshot
// - FAST: If SUPPLY is set, scan transfers in DESC order and capture the first (latest) event per tokenId.
// - SLOW: Otherwise, scan full history ASC and take the last event per tokenId.
// - Current owners only; selling resets. Shrooms = floor(heldSinceStart/6h) * SHROOMS_PER_WINDOW.

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import dayjs from "dayjs";

dotenv.config({ path: ".env.local" });
dotenv.config();

const API = process.env.EXPLORER_API_BASE || "https://hyperliquid.cloud.blockscout.com/api";
const API_KEY = process.env.EXPLORER_API_KEY || "";
const CONTRACT = (process.env.SPAZIO_CONTRACT || "").toLowerCase();
const START_AT_ISO = process.env.START_AT_ISO || "2025-08-18T10:00:00Z";
const SHROOMS_PER_WINDOW = Number(process.env.SHROOMS_PER_WINDOW || 10);
const SUPPLY = Number(process.env.SUPPLY || 0); // FAST MODE if > 0

const SIX_HOURS = 6 * 60 * 60;
const START_AT = Math.floor(new Date(START_AT_ISO).getTime() / 1000);

if (!CONTRACT) {
  console.error("Missing SPAZIO_CONTRACT in .env.local");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage({ page, offset, sort }) {
  const params = new URLSearchParams({
    module: "account",
    action: "tokennfttx",
    contractaddress: CONTRACT,
    page: String(page),
    offset: String(offset),
    sort: sort, // "asc" | "desc"
  });
  if (API_KEY) params.append("apikey", API_KEY);
  const url = `${API}?${params.toString()}`;

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      const text = await res.text();
      const json = JSON.parse(text);
      if (json.status === "1" && Array.isArray(json.result)) return json.result;
      if (json.status === "0") return []; // empty page / end
    } catch (e) {
      // backoff and retry
    }
    await sleep(400 * (attempt + 1));
  }
  throw new Error(`Explorer API failed for page ${page} (sort=${sort})`);
}

async function scanFastBySupply(total) {
  // DESC pages, grab first occurrence per tokenId => latest transfer for that token
  const offset = 1000;
  let page = 1;
  const latestByToken = new Map(); // tokenId -> row

  console.log(`FAST mode: DESC pages, pageSize=${offset}, target unique tokens=${total}`);
  while (true) {
    const rows = await fetchPage({ page, offset, sort: "desc" });
    console.log(`Fetched page ${page} (${rows.length} rows), unique so far: ${latestByToken.size}/${total}`);
    if (!rows.length) break;

    for (const r of rows) {
      const tokenId = String(r.tokenID);
      if (!latestByToken.has(tokenId)) {
        latestByToken.set(tokenId, r); // first time we see it in DESC = latest transfer
        if (latestByToken.size >= total) break;
      }
    }
    if (latestByToken.size >= total) break;
    page += 1;
    await sleep(100);
  }
  return Array.from(latestByToken.values()).map((r) => ({
    blockNumber: Number(r.blockNumber),
    timestamp: Number(r.timeStamp),
    from: String(r.from).toLowerCase(),
    to: String(r.to).toLowerCase(),
    tokenId: String(r.tokenID),
    logIndex: Number(r.logIndex ?? 0),
  }));
}

async function scanSlowFullAsc() {
  // Full history ASC; last event per token is the current owner
  const offset = 1000;
  let page = 1;
  const rowsAll = [];

  console.log("SLOW mode: ASC pages, full scan. This can take a while…");
  while (true) {
    const rows = await fetchPage({ page, offset, sort: "asc" });
    console.log(`Fetched page ${page} (${rows.length} rows)`);
    if (!rows.length) break;

    for (const r of rows) {
      rowsAll.push({
        blockNumber: Number(r.blockNumber),
        timestamp: Number(r.timeStamp),
        from: String(r.from).toLowerCase(),
        to: String(r.to).toLowerCase(),
        tokenId: String(r.tokenID),
        logIndex: Number(r.logIndex ?? 0),
      });
    }
    page += 1;
    await sleep(150);
  }
  return rowsAll;
}

async function main() {
  console.log("Explorer:", API);
  console.log("Contract:", CONTRACT);
  console.log(`Scoring: ${SHROOMS_PER_WINDOW} Shrooms / 6h, start at ${START_AT_ISO}`);

  const ZERO = "0x0000000000000000000000000000000000000000";
  let events;

  if (SUPPLY > 0) {
    // FAST
    const latest = await scanFastBySupply(SUPPLY);
    // We already have “latest per token”; no need to sort/group full history.
    events = latest;
  } else {
    // SLOW
    const all = await scanSlowFullAsc();
    // Keep the last (latest) transfer per token
    const byToken = new Map();
    for (const x of all) {
      const arr = byToken.get(x.tokenId) ?? [];
      arr.push(x);
      byToken.set(x.tokenId, arr);
    }
    events = Array.from(byToken.values()).map((arr) => arr[arr.length - 1]);
  }

  console.log(`Unique tokens captured: ${new Set(events.map((e) => e.tokenId)).size}`);

  // Aggregate holders
  const now = Math.floor(Date.now() / 1000);
  const owners = new Map(); // address -> { tokens, heldSeconds }

  for (const ev of events) {
    const currentOwner = ev.to.toLowerCase();
    if (currentOwner === ZERO) continue; // burned / null

    const startClock = Math.max(START_AT, ev.timestamp); // only since START_AT or last receive
    const held = Math.max(0, now - startClock);

    const prev = owners.get(currentOwner) || { tokens: 0, heldSeconds: 0 };
    prev.tokens += 1;
    prev.heldSeconds += held;
    owners.set(currentOwner, prev);
  }

  // Build leaderboard
  const leaderboard = Array.from(owners.entries())
    .map(([address, v]) => {
      const periods = Math.floor(v.heldSeconds / SIX_HOURS);
      const points = periods * SHROOMS_PER_WINDOW; // “Shrooms”
      return { address, tokens: v.tokens, holdingSeconds: v.heldSeconds, periods, points };
    })
    .filter((e) => e.tokens > 0) // keep current holders; points may be 0 if < 6h so far
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
  console.log("Wrote public/leaderboard.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
