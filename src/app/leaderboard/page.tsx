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

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const list = data.leaderboard;
    if (!q) return list;
    return list.filter((e) => e.address.toLowerCase().includes(q));
  }, [data, query]);

  const download = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "spazio-points.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FDF7F2] to-white">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold">Leaderboard</h1>
            {data && (
              <p className="text-sm text-neutral-600">
                Updated: {new Date(data.updatedAt).toLocaleString()}
              </p>
            )}
          </div>
          <button onClick={download} className="rounded-2xl bg-black text-white px-5 py-3">
            Export JSON
          </button>
        </div>

        <div className="mt-6">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search wallet (0x...)"
            className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 outline-none"
          />
          <p className="mt-2 text-sm text-neutral-600">
            Showing {filtered.length.toLocaleString()} wallets
            {query ? " (filtered)" : ""}
          </p>
        </div>

        {!data && !err && <p className="mt-6">Loading…</p>}
        {err && <p className="mt-6 text-red-600">Error loading JSON: {err}</p>}

        <div className="mt-6 grid gap-3">
          {filtered.slice(0, 200).map((e, i) => (
            <Card key={e.address} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 text-right tabular-nums">{i + 1}.</div>
                <div className="font-mono text-sm">{e.address.slice(0, 8)}…{e.address.slice(-6)}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold tabular-nums">{e.points.toLocaleString()} pts</div>
                <div className="text-xs text-neutral-500">
                  {(e.holdingSeconds / 3600).toFixed(1)}h held • {e.periods}×6h
                </div>
              </div>
            </Card>
          ))}
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
