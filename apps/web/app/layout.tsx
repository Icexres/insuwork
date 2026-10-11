import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import en from "@insuwork/shared/i18n/en.json";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-inter" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: "400", variable: "--font-mono" });

export const metadata: Metadata = { title: en.app.name, description: en.app.tagline };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
