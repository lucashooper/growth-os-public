import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { publicSiteUrl } from "@/lib/public-config";

const siteUrl = publicSiteUrl();

export const metadata: Metadata = {
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
    "short-form marketing",
  ],
  authors: [{ name: "Growth OS" }],
  creator: "Growth OS",
  metadataBase: new URL(siteUrl),
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_GB",
    url: siteUrl,
    siteName: "Growth OS",
    title: "Growth OS — AI Growth OS for creators",
    description:
      "Research trends, generate viral TikTok carousels, manage assets, and publish from one AI-powered workspace.",
    images: [
      {
        url: "/GrowthOS-Logo.png",
        width: 512,
        height: 512,
        alt: "Growth OS",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Growth OS — AI Growth OS for creators",
    description: "AI growth operating system for creators and brand teams.",
    images: ["/GrowthOS-Logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Growth OS",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "AI Growth OS for creators — research, generate, and publish short-form content.",
    url: siteUrl,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };

  return (
    <div className="min-h-screen bg-[#040406] text-[#e2e3e9]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
