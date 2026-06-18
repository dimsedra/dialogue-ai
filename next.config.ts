import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@mastra/core", "@ladybugdb/core", "@libsql/client", "@huggingface/transformers", "onnxruntime-node"],
  experimental: {
    instrumentationHook: true,
    optimizePackageImports: ["framer-motion"],
  },
};

export default nextConfig;
