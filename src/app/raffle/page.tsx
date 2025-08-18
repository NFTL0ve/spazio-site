'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';

type Entry = {
  address: string;
  tokens: number;
  holdingSeconds: number;
  periods: number;
  points: number; // Shrooms
};

export default function RafflePage() {
  // Next requires a Suspense boundary around components using useSearchParams
  return (
    <Suspense fallback={<div className="min-h-screen bg-black text-white p-6">Loading…</div>}>
      <RaffleInner />
    </Suspense>
  );
}

function RaffleInner() {
  const sp = useSearchParams();

  const initialWinners = Math.max(1, Math.min(50, Number(sp.get('winners') || '1') | 0));
  const initialMin = Math.max(0, Number(sp.get('min') || '0') | 0);

  const [data, setData] = useState<Entry[]>([]);
  const [winners, setWinners] = useState(initialWinners);
  const [min, setMin] = useState(initialMin);
  const [draw, setDraw] = useState<Entry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/leaderboard.json')
      .then((r) => r.json())
      .then((j) => {
        setData(j.leaderboard as Entry[]);
        setLoading(false);
      })
      .catch((e) => {
        setErr(String(e));
        setLoading(false);
      });
  }, []);

  const pool = useMemo(() => data.filter((e) => e.points >= min), [data, min]);

  function secureRandom01() {
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
      const buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      return (buf[0] >>> 0) / 2 ** 32;
    }
    return Math.random();
  }

  // Weighted without replacement: each point is a "ticket"
  function pickWeightedMany(list: Entry[], k: number): Entry[] {
    const arr = list.slice();
    const result: Entry[] = [];
    let total = arr.reduce((s, e) => s + e.points, 0);

    for (let i = 0; i < k && arr.length && total > 0; i++) {
      const r = secureRandom01() * total;
      let acc = 0;
      let idx = -1;
      for (let j = 0; j < arr.length; j++) {
        acc += arr[j].points;
        if (r < acc) {
          idx = j;
          break;
        }
      }
      if (idx < 0) idx = arr.length - 1;

      result.push(arr[idx]);
      total -= arr[idx].points;
      arr.splice(idx, 1);
    }
    return result;
  }

  function runRaffle() {
    setDraw(pickWeightedMany(pool, winners));
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-4xl font-extrabold mb-4">Community Raffle</h1>
        <p className="text-white/70 mb-6">
          Winners are chosen at random but weighted by <b>Shrooms</b>. More Shrooms = higher chance.
        </p>

        <Card className="p-4 mb-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm text-white/70">Winners</span>
              <input
                type="number"
                min={1}
                max={50}
                value={winners}
                onChange={(e) =>
                  setWinners(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
                }
                className="mt-1 w-full rounded-xl border border-white/15 bg-[#0f0f0f] px-3 py-2 outline-none"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm text-white/70">Minimum Shrooms (optional)</span>
              <input
                type="number"
                min={0}
                value={min}
                onChange={(e) => setMin(Math.max(0, Number(e.target.value) || 0))}
                className="mt-1 w-full rounded-xl border border-white/15 bg-[#0f0f0f] px-3 py-2 outline-none"
              />
            </label>
          </div>
          <button
            onClick={runRaffle}
            className="mt-4 rounded-xl bg-white text-black px-4 py-2 font-semibold hover:bg-white/90"
          >
            Draw winners
          </button>
        </Card>

        {loading && <p>Loading leaderboard…</p>}
        {err && <p className="text-red-400">Error: {err}</p>}

        {draw && (
          <Card className="p-4">
            <h2 className="text-xl font-semibold mb-3">Winners</h2>
            <ol className="grid gap-2">
              {draw.map((w, i) => (
                <li key={w.address} className="flex items-center justify-between">
                  <div className="font-mono">{w.address.slice(0, 8)}…{w.address.slice(-6)}</div>
                  <div className="text-white/70">{w.points.toLocaleString()} Shrooms</div>
                </li>
              ))}
            </ol>
            <button
              onClick={() => {
                const out = draw.map((w, i) => `${i + 1},${w.address},${w.points}`).join('\n');
                const blob = new Blob([`rank,address,shrooms\n${out}`], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'raffle_winners.csv';
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="mt-4 rounded-xl border border-white/20 px-4 py-2 hover:bg-white/10"
            >
              Export CSV
            </button>
          </Card>
        )}
      </div>
    </main>
  );
}
