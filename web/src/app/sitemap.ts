import type { MetadataRoute } from "next";
import { publicSiteUrl } from "@/lib/public-config";

const siteUrl = publicSiteUrl();

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["", "/login", "/signup", "/privacy", "/terms", "/contact", "/status"];
  const now = new Date();
  return paths.map((path) => ({
    url: `${siteUrl}${path || "/"}`,
    lastModified: now,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.6,
  }));
}
