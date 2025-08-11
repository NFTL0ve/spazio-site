import type { Metadata } from "next";
import "./globals.css";
import { Nunito } from "next/font/google";

const nunito = Nunito({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Spazio Points",
  description: "Hold a Spazio Brother. Earn points every 6 hours.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${nunito.className} bg-[#FFF7EC] text-[#1f1f1f]`}>
        <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
          <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
            <a href="/" className="font-extrabold text-xl tracking-tight">Spazio Points</a>
            <nav className="flex items-center gap-3 text-sm">
              <a href="/leaderboard" className="hover:underline">Leaderboard</a>
              <a href="/leaderboard" className="rounded-xl bg-black text-white px-4 py-2">
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
