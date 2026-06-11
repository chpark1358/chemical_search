import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter"
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono"
});

export const metadata: Metadata = {
  title: "Chemical Papers — 화학물질 논문 검색",
  description:
    "물질명, SMILES, InChIKey, 분자식으로 화학물질을 확인하고 관련 논문을 검색합니다."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={`${inter.variable} ${jetbrainsMono.variable}`} lang="ko">
      <body className="bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}
