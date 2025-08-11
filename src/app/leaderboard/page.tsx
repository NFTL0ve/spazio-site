"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";

type Entry = {
  address: string;
  tokens: number;
  holdingSeconds: number;
  periods: number;
  points: number;
};
type Data = { updatedAt: string; contract: string; leaderboard: Entry[]; totalHolders: number };

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

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.leaderboard;
    return data.leaderboard.filter((e) => e.address.toLowerCase().includes(q));
  }, [data, query]);

  const download = (type: "json" | "csv") => {
    if (!data) return;
    if (type === "json") {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "spazio-points.json"; a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const headers = ["rank","address","tokens","points","periods","holdingSeconds","holdingHours"];
    const rows = data.leaderboard.map((e,i)=>[
      String(i+1), e.address, String(e.tokens), String(e.points), String(e.periods),
      String(e.holdingSeconds), (e.holdingSeconds/3600).toFixed(2)
    ]);
    const csv = [headers.join(","), ...rows.map(r=>r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "spazio-points.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const highlightAddr = query.trim().toLowerCase();

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* banner */}
        <div className="mb-4 rounded-xl bg-white/5 border border-white/10 p-3 text-sm text-white/80">
          <b className="text-white">Rules:</b> Every 6h = 600 pts per NFT. <b className="text-white">Selling resets points</b> for that NFT and past holders are removed. Only time since your last receive counts.
        </div>

        {/* header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight">Spazio Leaderboard</h1>
            {data && (
              <p className="text-sm text-white/70">
                Updated: {new Date(data.updatedAt).toLocaleString()} • Holders:{" "}
                {data.totalHolders.toLocaleString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={()=>download("csv")}
              className="rounded-xl border border-white/20 bg-transparent px-4 py-2 text-white hover:bg-white/10"
            >
              Export CSV
            </button>
            <button
              onClick={()=>download("json")}
              className="rounded-xl bg-white text-black px-4 py-2 font-semibold hover:bg-white/90"
            >
              Export JSON
            </button>
          </div>
        </div>

        {/* tools */}
        <div className="mt-6 grid gap-4 md:grid-cols-[2fr,1fr]">
          <Card className="p-4">
            <label className="text-sm font-medium text-white">Search wallets</label>
            <input
              value={query}
              onChange={(e)=>setQuery(e.target.value)}
              placeholder="Paste or type a wallet (0x...)"
              className="mt-2 w-full rounded-xl border border-white/15 bg-[#0f0f0f] px-4 py-3 text-white placeholder:text-white/40 outline-none focus:ring-2 ring-white/25"
            />
            <p className="mt-2 text-sm text-white/60">
              Showing {filtered.length.toLocaleString()} wallets{query ? " (filtered)" : ""}
            </p>
          </Card>

          <Card className="p-4">
            <div className="text-sm text-white/80">
              <div className="font-medium mb-1 text-white">Tip</div>
              Paste a full address to highlight it below. New owners start from 0 points.
            </div>
          </Card>
        </div>

        {!data && !err && <p className="mt-6 text-white/90">Loading…</p>}
        {err && <p className="mt-6 text-red-400">Error loading JSON: {err}</p>}

        {/* list */}
        <div className="mt-6 grid gap-3">
          {filtered.slice(0, 200).map((e, i) => {
            const isMatch = highlightAddr && e.address.toLowerCase() === highlightAddr;
            return (
              <Card
                key={e.address}
                className={`p-4 flex items-center justify-between ${isMatch ? "ring-2 ring-white/30" : ""}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 text-right tabular-nums text-white/70">{i + 1}.</div>
                  <div className="font-mono text-sm text-white">
                    {e.address.slice(0, 8)}…{e.address.slice(-6)}
                  </div>
                </div>
                <div className="flex items-center gap-6 text-right">
                  <div className="text-xs text-white/60">
                    NFTs<br/><span className="text-base font-semibold text-white">{e.tokens}</span>
                  </div>
                  <div>
                    <div className="font-semibold tabular-nums text-white">{e.points.toLocaleString()} pts</div>
                    <div className="text-xs text-white/60">
                      {(e.holdingSeconds / 3600).toFixed(1)}h • {e.periods}×6h
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {filtered.length > 200 && (
          <p className="mt-4 text-center text-sm text-white/60">
            Showing top 200. Use search to find a wallet.
          </p>
        )}
      </div>
    </main>
  );
}
