import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "800"] });

export const metadata: Metadata = {
  title: "Spazio Points",
  description: "Hold a Spazio Brother. Earn points every 6 hours.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-black text-white`}>
        <header className="sticky top-0 z-10 border-b border-white/10 bg-black/70 backdrop-blur">
          <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
            <a href="/" className="font-extrabold text-xl tracking-tight">Spazio Points</a>
            <nav className="flex items-center gap-3 text-sm">
              <a href="/leaderboard" className="text-white/90 hover:text-white hover:underline">
                Leaderboard
              </a>
              <a href="/leaderboard" className="rounded-xl bg-white text-black px-4 py-2 font-semibold">
                Export
              </a>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
