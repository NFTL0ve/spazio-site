// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Nunito } from "next/font/google";

const nunito = Nunito({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Spazio Shrooms",
  description:
    "Hold a Spazio Brother NFT to earn Shrooms over time. Selling resets Shrooms; only current holders accrue.",
  icons: { icon: "/favicon.ico" },
  openGraph: {
    title: "Spazio Shrooms",
    description:
      "Hold a Spazio Brother NFT to earn Shrooms. Selling resets; only current holders accrue.",
    url: "https://spazio-site.vercel.app",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Spazio Shrooms",
    description:
      "Hold a Spazio Brother NFT to earn Shrooms. Selling resets; only current holders accrue.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${nunito.className} bg-[#0b0b0b] text-white antialiased`}
      >
        {/* header */}
        <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0b0b0b]/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
            <Link
              href="/"
              className="font-extrabold tracking-tight text-white hover:opacity-90"
            >
              Spazio Shrooms
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link
                href="/leaderboard"
                className="text-white/80 hover:text-white"
              >
                Leaderboard
              </Link>
            </nav>
          </div>
        </header>

        {children}
      </body>
    </html>
  );
}
