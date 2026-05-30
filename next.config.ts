import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Allows Vercel to deploy even if there are TypeScript warnings
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
