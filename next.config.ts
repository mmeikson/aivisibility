import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Type checking runs locally via `npx tsc --noEmit`; skip it during Vercel builds
    // where Next.js regenerates tsconfig and breaks the @/* path alias
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
