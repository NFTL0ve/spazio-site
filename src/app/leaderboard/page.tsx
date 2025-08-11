"use client";

import { Card } from "@/components/ui/card";

const fake = [
  { address: "0xAbc...1234", points: 4800, hours: 24 },
  { address: "0xDeF...5678", points: 4200, hours: 21 },
  { address: "0x9aB...Cdef", points: 3600, hours: 18 },
];

export default function LeaderboardPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FDF7F2] to-white">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-3xl font-bold">Leaderboard</h1>
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify({ leaderboard: fake }, null, 2)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "spazio-points.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="rounded-2xl bg-black text-white px-5 py-3"
          >
            Export JSON
          </button>
        </div>

        <div className="mt-6 grid gap-3">
          {fake.map((e, i) => (
            <Card key={i} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-8 text-right tabular-nums">{i + 1}.</div>
                <div className="font-mono">{e.address}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold tabular-nums">{e.points.toLocaleString()} pts</div>
                <div className="text-xs text-neutral-500">{e.hours}h held</div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
