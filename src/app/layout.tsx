import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FFO Client Health Command Center",
  description: "Fractional Family Office - Client Health Scoring & Management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
