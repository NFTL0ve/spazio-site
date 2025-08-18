// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Spazio Shrooms",
  description:
    "Hold a Spazio Brother NFT to earn Shrooms. Selling resets; only current holders accrue.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-black text-white`}>
        <header className="sticky top-0 z-20 border-b border-white/10 bg-black/70 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
            <Link href="/" className="text-xl font-extrabold tracking-tight">
              Spazio Shrooms
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/leaderboard" className="text-white/85 hover:text-white hover:underline">
                Leaderboard
              </Link>
              <Link href="/raffle" className="text-white/85 hover:text-white hover:underline">
                Raffle
              </Link>
              <Link
                href="/leaderboard"
                className="rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-white/90"
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
