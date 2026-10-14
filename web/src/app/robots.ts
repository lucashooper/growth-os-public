import type { MetadataRoute } from "next";
import { publicSiteUrl } from "@/lib/public-config";

const siteUrl = publicSiteUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/signup", "/privacy", "/terms", "/contact", "/status"],
        disallow: [
          "/agent",
          "/chat",
          "/dashboard",
          "/generate",
          "/library",
          "/queue",
          "/analytics",
          "/settings",
          "/api/",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
