"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";

type Entry = { address: string; holdingSeconds: number; periods: number; points: number };
type Data = { updatedAt: string; contract: string; leaderboard: Entry[] };

export default function LeaderboardPage() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/leaderboard.json")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setErr(String(e)));
  }, []);

  const isFullAddress = (q: string) => /^0x[a-fA-F0-9]{40}$/.test(q.trim());
  const exactRank =
    data && isFullAddress(query)
      ? data.leaderboard.findIndex((e) => e.address.toLowerCase() === query.trim().toLowerCase())
      : -1;

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.leaderboard;
    return data.leaderboard.filter((e) => e.address.toLowerCase().includes(q));
  }, [data, query]);

  const downloadJSON = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "spazio-points.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCSV = () => {
    if (!data) return;
    const headers = ["rank", "address", "points", "periods", "holdingSeconds", "holdingHours"];
    const rows = data.leaderboard.map((e, i) => [
      String(i + 1),
      e.address,
      String(e.points),
      String(e.periods),
      String(e.holdingSeconds),
      (e.holdingSeconds / 3600).toFixed(2),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "spazio-points.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const highlightAddr = query.trim().toLowerCase();

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FFF7EC] to-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-4 rounded-xl bg-white border p-3 text-sm text-neutral-700">
          <b>Heads up:</b> data refreshes every 6 hours. Export JSON/CSV to share airdrops.
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-extrabold">Spazio Leaderboard</h1>
            {data && (
              <p className="text-sm text-neutral-600">
                Updated: {new Date(data.updatedAt).toLocaleString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={downloadCSV} className="rounded-2xl bg-white border px-4 py-2">
              Export CSV
            </button>
            <button onClick={downloadJSON} className="rounded-2xl bg-black text-white px-4 py-2">
              Export JSON
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[2fr,1fr]">
          <Card className="p-4">
            <label className="text-sm font-medium">Search wallets</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Paste or type a wallet (0x...)"
              className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 outline-none"
            />
            <p className="mt-2 text-sm text-neutral-600">
              Showing {filtered.length.toLocaleString()} wallets{query ? " (filtered)" : ""}
            </p>
          </Card>

          <Card className="p-4">
            <div className="text-sm">
              <div className="font-medium mb-1">Find my rank (no wallet connect)</div>
              <p className="text-neutral-600">
                Paste your full address above. If it’s an exact match, we’ll show your rank here.
              </p>
              {exactRank >= 0 && data && (
                <div className="mt-3 rounded-lg bg-[#FFF0F7] border border-pink-200 p-3">
                  <div className="text-lg font-bold">Rank #{exactRank + 1}</div>
                  <div className="text-sm text-neutral-700">
                    Points: {data.leaderboard[exactRank].points.toLocaleString()} • Hours held:{" "}
                    {(data.leaderboard[exactRank].holdingSeconds / 3600).toFixed(1)}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {!data && !err && <p className="mt-6">Loading…</p>}
        {err && <p className="mt-6 text-red-600">Error loading JSON: {err}</p>}

        <div className="mt-6 grid gap-3">
          {filtered.slice(0, 200).map((e, i) => {
            const isMatch = highlightAddr && e.address.toLowerCase() === highlightAddr;
            return (
              <Card
                key={e.address}
                className={`p-4 flex items-center justify-between ${isMatch ? "ring-2 ring-pink-400" : ""}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 text-right tabular-nums">{i + 1}.</div>
                  <div className="font-mono text-sm">
                    {e.address.slice(0, 8)}…{e.address.slice(-6)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">{e.points.toLocaleString()} pts</div>
                  <div className="text-xs text-neutral-500">
                    {(e.holdingSeconds / 3600).toFixed(1)}h • {e.periods}×6h
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {filtered.length > 200 && (
          <p className="mt-4 text-center text-sm text-neutral-500">
            Showing top 200. Use search to find a wallet.
          </p>
        )}
      </div>
    </main>
  );
}
