// scripts/build-snapshot.mjs
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

// --- scoring ---
const SIX_HOURS = 6 * 60 * 60;      // seconds
const POINTS_PER_PERIOD = 10;       // << 10 pts per 6h
const START_AT_ISO = "2025-08-01T00:00:00Z";  // start counting from this date (UTC)
const START_EPOCH = Math.floor(new Date(START_AT_ISO).getTime() / 1000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  console.log(`Scoring: ${POINTS_PER_PERIOD} pts / 6h, start at ${START_AT_ISO}`);

  const offset = 1000;
  let page = 1;
  const transfers = [];

  while (true) {
    const rows = await fetchPage(page, offset);
    console.log(`Fetched page ${page} (${rows.length} rows)`);
    if (!rows.length) break;

    for (const r of rows) {
      transfers.push({
        blockNumber: Number(r.blockNumber),
        timestamp: Number(r.timeStamp),
        from: String(r.from).toLowerCase(),
        to: String(r.to).toLowerCase(),
        tokenId: BigInt(r.tokenID),
        txHash: r.hash,
        logIndex: Number(r.logIndex ?? 0),
      });
    }
    page += 1;
    await sleep(200);
  }

  console.log(`Total transfers fetched: ${transfers.length}`);

  transfers.sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber - b.blockNumber
  );

  const byToken = new Map();
  for (const t of transfers) {
    const k = t.tokenId.toString();
    const arr = byToken.get(k) ?? [];
    arr.push(t);
    byToken.set(k, arr);
  }

  const ZERO = "0x0000000000000000000000000000000000000000";
  const now = Math.floor(Date.now() / 1000);
  const holdingsSeconds = {};

  for (const arr of byToken.values()) {
    const last = arr[arr.length - 1];
    const owner = last.to.toLowerCase();
    if (owner === ZERO) continue;

    // count only since the later of (last receive) and (START date)
    const start = Math.max(last.timestamp, START_EPOCH);
    const held = Math.max(0, now - start);
    holdingsSeconds[owner] = (holdingsSeconds[owner] ?? 0) + held;
  }

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
