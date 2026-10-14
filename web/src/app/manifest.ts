import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Growth OS",
    short_name: "Growth OS",
    description: "AI Growth OS for creators",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0c",
    theme_color: "#0a0a0c",
    icons: [
      { src: "/GrowthOS-Logo.png", sizes: "512x512", type: "image/png" },
      { src: "/GrowthOS-Logo.png", sizes: "192x192", type: "image/png" },
    ],
  };
}
