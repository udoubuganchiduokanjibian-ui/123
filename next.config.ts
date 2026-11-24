import type { NextConfig } from "next";

const config: NextConfig = {
  agentRules: false,
  devIndicators: false,
  ...(process.env.READER_OFFLINE_PREVIEW === "1" ? { distDir: ".next-offline-preview" } : {}),
};

export default config;
