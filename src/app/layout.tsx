// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "800"] });

export const metadata: Metadata = {
  title: "Spazio Points",
  description: "Hold a Spazio Brother. Earn points every 6 hours.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[var(--bg)] text-[var(--txt)]`}>
        <header className="sticky top-0 z-10 border-b border-white/10 bg-black/70 backdrop-blur">
          <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
            {/* Use <Link> for internal navigation */}
            <Link href="/" className="text-xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-[var(--accent)] via-white to-[var(--accent2)] bg-clip-text text-transparent">
                Spazio
              </span>{" "}
              Points
            </Link>

            <nav className="flex items-center gap-3 text-sm">
              <Link href="/leaderboard" className="text-white/85 hover:text-white hover:underline">
                Leaderboard
              </Link>
              <Link
                href="/leaderboard"
                className="rounded-xl bg-white text-black px-4 py-2 font-semibold hover:bg-white/90"
              >
                Export
              </Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
