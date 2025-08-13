// src/app/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Rule = {
  windowHours: number;
  pointsPerWindow: number; // treated as "shrooms per window" for display
  startAt?: string;
};

type Snapshot = { updatedAt: string; rule: Rule };

export default function Home() {
  const [rule, setRule] = useState<Rule | null>(null);

  useEffect(() => {
    fetch("/leaderboard.json")
      .then((r) => r.json())
      .then((d: Snapshot) => setRule(d.rule))
      .catch(() =>
        setRule({
          windowHours: 6,
          pointsPerWindow: 10,
          startAt: "2025-08-01T00:00:00Z",
        })
      );
  }, []);

  const windowH = rule?.windowHours ?? 6;
  const shrooms = rule?.pointsPerWindow ?? 10;
  const since = rule?.startAt
    ? new Date(rule.startAt).toLocaleDateString()
    : undefined;

  return (
    <main className="min-h-screen bg-[#0b0b0b] text-white">
      <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <h1 className="text-6xl font-extrabold tracking-tight">Spazio Shrooms</h1>

        <p className="mt-6 max-w-3xl text-lg leading-relaxed text-white/85">
          Hold a Spazio Brother NFT. Every {windowH} hours ={" "}
          <b className="text-white">{shrooms} Shrooms</b> per NFT. Selling
          resets Shrooms and past holders are removed
          {since ? <>. Counting since {since}.</> : "."}
        </p>

        <div className="mt-10 flex flex-wrap gap-4">
          <Link
            href="/leaderboard"
            className="rounded-2xl bg-white px-5 py-3 font-semibold text-black hover:bg-white/90"
          >
            View Leaderboard
          </Link>

          <a
            href="https://drip.trade/collections/spazio-brothers"
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl border border-white/20 px-5 py-3 font-semibold hover:bg-white/10"
          >
            View Collection
          </a>
        </div>

        <ul className="mt-10 space-y-2 text-white/80">
          <li className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-lime-400" />
            Shrooms accrue only while you currently hold the NFT.
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            Exports available on the leaderboard page (CSV / JSON).
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-pink-400" />
            Raffles are weighted by Shrooms (each Shroom = one ticket).
          </li>
        </ul>
      </section>
    </main>
  );
}
