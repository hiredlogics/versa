import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeScript } from "@/components/theme/ThemeScript";
import { BRAND } from "@/config/brand";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  preload: true,
  weight: ["400", "500", "600", "700", "900"],
});

export const metadata: Metadata = {
  title: `${BRAND.fullName}: ${BRAND.tagline}`,
  description: BRAND.longTagline,
  metadataBase: process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL)
    : undefined,
  openGraph: { images: ["/og.png"] },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${inter.variable} antialiased bg-charcoal text-off-white font-[family-name:var(--font-inter)]`}>
        {children}
      </body>
    </html>
  );
}
