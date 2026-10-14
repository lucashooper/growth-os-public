import type { Metadata } from "next";
import Script from "next/script";
import { Geist_Mono, Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { DemoModeProvider } from "@/lib/demo-recording";
import { publicSiteUrl } from "@/lib/public-config";
import "./globals.css";

/**
 * Display face: General Sans (Fontshare) — free geometric humanist.
 * Waldenburg is licensed/commercial and cannot load from public CSS;
 * Syne was a prior substitute. Body remains Inter.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = publicSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Growth OS — AI Growth OS for creators",
    template: "%s · Growth OS",
  },
  description:
    "Research trends, generate viral TikTok carousels, manage assets, and publish from one AI-powered workspace.",
  keywords: [
    "Growth OS",
    "TikTok growth",
    "AI content generator",
    "carousel maker",
    "creator analytics",
  ],
  openGraph: {
    type: "website",
    locale: "en_GB",
    url: siteUrl,
    siteName: "Growth OS",
    title: "Growth OS — AI Growth OS for creators",
    description:
      "Research trends, generate viral TikTok carousels, manage assets, and publish from one AI-powered workspace.",
    images: [{ url: "/GrowthOS-Logo.png", alt: "Growth OS" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Growth OS",
    description:
      "AI growth operating system for creators and brand teams.",
    images: ["/GrowthOS-Logo.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "any" },
      { url: "/GrowthOS-Logo.png", type: "image/png", sizes: "412x412" },
    ],
    apple: [{ url: "/GrowthOS-Logo.png", sizes: "180x180" }],
    shortcut: ["/favicon.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} dark h-full`}
      suppressHydrationWarning
    >
      <head>
        {/* General Sans — Fontshare CDN (confirm in DevTools: font-family "General Sans") */}
        <link
          href="https://api.fontshare.com/v2/css?f[]=general-sans@500,600,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full bg-bg font-sans text-ink antialiased">
        <Script
          id="growthos-accent"
          strategy="beforeInteractive"
        >{`(function(){try{var t=localStorage.getItem("growthos.accent");if(t==="emerald"||t==="violet")document.documentElement.dataset.accent=t;}catch(e){}})();`}</Script>
        <ThemeProvider>
          <DemoModeProvider>{children}</DemoModeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
