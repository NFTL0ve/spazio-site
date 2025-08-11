// src/app/page.tsx
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-[calc(100vh-56px)] bg-[var(--bg)] text-[var(--txt)]">
      <section className="relative overflow-hidden">
        {/* soft neon glows */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 left-10 h-80 w-80 rounded-full bg-[var(--accent2)]/15 blur-3xl" />
          <div className="absolute top-40 right-10 h-96 w-96 rounded-full bg-[var(--accent)]/14 blur-3xl" />
        </div>

        <div className="mx-auto max-w-6xl px-6 py-20">
          <h1 className="text-5xl font-extrabold tracking-tight">
            Spazio <span className="text-white/80">Points</span>
          </h1>

          <p className="mt-4 max-w-2xl text-white/70">
            Hold a Spazio Brother NFT. Every 6 hours = <b className="text-white">600 points</b> per NFT.
            <br className="hidden sm:block" />
            Selling resets points and past holders are removed.
          </p>

          <div className="mt-8 flex items-center gap-3">
            <Link
              href="/leaderboard"
              className="rounded-xl bg-white text-black px-5 py-3 font-semibold hover:bg-white/90"
            >
              View Leaderboard
            </Link>
            <a
              href="https://drip.trade/collections/spazio-brothers"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-white/20 px-5 py-3 text-white hover:bg-white/10"
            >
              View Collection
            </a>
          </div>

          <div className="mt-10 grid gap-3 text-sm text-white/60">
            <div className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
              Points accrue only while you currently hold the NFT.
            </div>
            <div className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--accent2)]" />
              Exports available on the leaderboard page (CSV / JSON).
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
