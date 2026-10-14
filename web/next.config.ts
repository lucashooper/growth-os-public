import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // Allow ngrok (and similar tunnels) to load Next.js dev assets / HMR
  allowedDevOrigins: [
    "efc1-88-98-121-240.ngrok-free.app",
    "*.ngrok-free.app",
    "*.ngrok.io",
  ],
  serverExternalPackages: [
    "playwright",
    "playwright-core",
    "@opentelemetry/api",
  ],
  async redirects() {
    return [
      { source: "/dashboard", destination: "/insights", permanent: false },
      {
        source: "/analytics",
        destination: "/insights?tab=performance",
        permanent: false,
      },
      {
        source: "/experiments",
        destination: "/insights?tab=experiments",
        permanent: false,
      },
      {
        source: "/competitor-centre",
        destination: "/insights?tab=competitors",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
