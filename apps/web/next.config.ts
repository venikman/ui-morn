import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: false,
  transpilePackages: ["@ui-morn/shared"],
};

export default nextConfig;
