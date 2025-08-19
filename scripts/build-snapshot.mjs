// scripts/build-snapshot.mjs
// Spazio Shrooms — Explorer-only fast snapshot
// - Fetch Blockscout `account.tokennfttx` in DESC order (newest first)
// - Keep the first occurrence of each tokenId => latest transfer/current owner
// - Stop when we've discovered SUPPLY unique tokenIds
// - Score since START_AT_ISO and write public/leaderboard.json

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import dayjs from "dayjs";

dotenv.config({ path: ".env.local" });
dotenv.config();

// ----- Env -----
const CONTRACT = (process.env.SPAZIO_CONTRACT || "").toLowerCase();
const EXPLORER_API_BASE = process.env.EXPLORER_API_BASE || "https://hyperliquid.cloud.blockscout.com/api";
const EXPLORER_API_KEY = process.env.EXPLORER_API_KEY || ""; // optional

const START_AT_ISO = process.env.START_AT_ISO || "2025-08-18T10:00:00Z"; // 6am ET
const SHROOMS_PER_WINDOW = Number(process.env.SHROOMS_PER_WINDOW || 10);
const SUPPLY = Number(process.env.SUPPLY || 0); // REQUIRED
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 1000); // Blockscout: 1000 is safe

if (!CONTRACT) {
  console.error("❌ Missing SPAZIO_CONTRACT in .env.local");
  process.exit(1);
}
if (!SUPPLY) {
  console.error("❌ SUPPLY is required in .env.local");
  process.exit(1);
}
if (!EXPLORER_API_BASE) {
  console.error("❌ EXPLORER_API_BASE is required in .env.local");
  process.exit(1);
}

const ZERO = "0x0000000000000000000000000000000000000000";
const SIX_HOURS = 6 * 60 * 60;
const START_AT = Math.floor(new Date(START_AT_ISO).getTime() / 1000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ----- Explorer fetch with polite backoff (handles 429) -----
async function fetchExplorer(paramsObj, attempt = 1) {
  const params = new URLSearchParams(paramsObj);
  if (EXPLORER_API_KEY) params.append("apikey", EXPLORER_API_KEY);
  const url = `${EXPLORER_API_BASE}?${params.toString()}`;

  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    const txt = await res.text();
    let json;
    try { json = JSON.parse(txt); } catch { json = { status: "0", message: "parse error", result: [] }; }

    // rate-limit or temp errors
    if (res.status === 429 || (json && /limit/i.test(String(json.message || "")))) {
      const wait = Math.min(1000 * 2 ** (attempt - 1), 8000);
      await sleep(wait);
      if (attempt < 7) return fetchExplorer(paramsObj, attempt + 1);
      throw new Error(`Explorer 429 after ${attempt} attempts`);
    }

    if (res.ok && Array.isArray(json.result)) return json.result;
    if (json.status === "0") return []; // end/empty page

    const wait = Math.min(500 * 2 ** (attempt - 1), 5000);
    await sleep(wait);
    if (attempt < 6) return fetchExplorer(paramsObj, attempt + 1);
    throw new Error(`Explorer failed: HTTP ${res.status} / ${json?.message || "?"}`);
  } catch (e) {
    const wait = Math.min(500 * 2 ** (attempt - 1), 5000);
    await sleep(wait);
    if (attempt < 6) return fetchExplorer(paramsObj, attempt + 1);
    throw e;
  }
}

// ----- Stage A: discover unique tokenIds (DESC) -----
async function discoverLatestTransfersDesc() {
  console.log(`🔎 Explorer DESC discovery (pageSize=${PAGE_SIZE})`);
  const byToken = new Map(); // tokenId -> {to, ts}
  let page = 1;

  while (byToken.size < SUPPLY) {
    const rows = await fetchExplorer({
      module: "account",
      action: "tokennfttx",
      contractaddress: CONTRACT,
      page: String(page),
      offset: String(PAGE_SIZE),
      sort: "desc", // newest first
    });

    if (!rows.length) break;

    let newHits = 0;
    for (const r of rows) {
      const tid = String(r.tokenID);
      if (!byToken.has(tid)) {
        byToken.set(tid, {
          to: String(r.to).toLowerCase(),
          timestamp: Number(r.timeStamp), // seconds
        });
        newHits++;
        if (byToken.size >= SUPPLY) break;
      }
    }
    console.log(`  • page ${page}: +${rows.length} rows, +${newHits} new → ${byToken.size}/${SUPPLY}`);
    page += 1;

    // tiny pause to be nice to the explorer
    await sleep(150);
  }

  console.log(`✅ Unique tokens captured: ${byToken.size}`);
  return byToken;
}

// ----- Scoring -----
function buildLeaderboard(latestByToken) {
  const now = Math.floor(Date.now() / 1000);
  const owners = new Map(); // address -> { tokens, heldSeconds }

  for (const { to, timestamp } of latestByToken.values()) {
    if (!to || to === ZERO) continue; // burned
    const startClock = Math.max(START_AT, timestamp);
    const held = Math.max(0, now - startClock);

    const prev = owners.get(to) || { tokens: 0, heldSeconds: 0 };
    prev.tokens += 1;
    prev.heldSeconds += held;
    owners.set(to, prev);
  }

  return Array.from(owners.entries())
    .map(([address, v]) => {
      const periods = Math.floor(v.heldSeconds / SIX_HOURS);
      const points = periods * SHROOMS_PER_WINDOW;
      return { address, tokens: v.tokens, holdingSeconds: v.heldSeconds, periods, points };
    })
    .sort((a, b) => b.points - a.points || b.tokens - a.tokens);
}

// ----- Main -----
async function main() {
  console.log("Contract:", CONTRACT);
  console.log(`Scoring: ${SHROOMS_PER_WINDOW} Shrooms / 6h, start at ${START_AT_ISO}`);
  console.log(`Explorer: ${EXPLORER_API_BASE}`);

  const latestByToken = await discoverLatestTransfersDesc();
  const leaderboard = buildLeaderboard(latestByToken);

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
  console.log("✨ Wrote public/leaderboard.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
