import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "월드컵 스튜디오",
  description: "이상형 월드컵을 찾고 만들고 공유하는 MVP"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
