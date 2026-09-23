import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { getLocale } from "@/lib/i18n";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], variable: "--font-plex-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin", "latin-ext"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "Extrusion Intelligence",
  description: "Decision support for twin-screw extrusion.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
