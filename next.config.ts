import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withPostHogConfig } from "@posthog/nextjs-config";
import type { NextConfig } from "next";

const projectRoot = dirname(fileURLToPath(import.meta.url));

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const additionalAllowedDevOrigins = process.env.NEXT_ALLOWED_DEV_ORIGINS?.split(
  ",",
)
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedDevOrigins = ["**.*", ...(additionalAllowedDevOrigins ?? [])];

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins,
  reactCompiler: true,
  turbopack: {
    root: projectRoot,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
  serverExternalPackages: ["pg"],
};

export default withPostHogConfig(nextConfig, {
  personalApiKey: getRequiredEnv("POSTHOG_PERSONAL_API_KEY"),
  projectId: getRequiredEnv("POSTHOG_PROJECT_ID"),
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  sourcemaps: {
    deleteAfterUpload: true,
  },
});
