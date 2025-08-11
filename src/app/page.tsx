export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FDF7F2] to-white">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="text-4xl font-bold tracking-tight">Spazio Points</h1>
        <p className="mt-3 text-neutral-700">
          Hold a Spazio Brother NFT. Every 6 hours = 600 points. More NFTs = more points.
        </p>

        <a
          href="/leaderboard"
          className="inline-block mt-8 rounded-2xl bg-black text-white px-5 py-3"
        >
          View Leaderboard
        </a>
      </div>
    </main>
  );
}
