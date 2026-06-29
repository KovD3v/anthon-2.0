import type { NextConfig } from "next";

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

export default nextConfig;
