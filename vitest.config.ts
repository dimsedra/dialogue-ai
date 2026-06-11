import { defineConfig } from "vitest/config";
import { loadEnvConfig } from "@next/env";

// Load environment variables from .env.local, .env, etc.
loadEnvConfig(process.cwd());

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "**/archive/**"],
  },
});
