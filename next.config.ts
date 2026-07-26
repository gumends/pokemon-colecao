import type { NextConfig } from "next";

const apiOrigin = process.env.API_INTERNAL_URL?.trim() || "http://127.0.0.1:5080";

const nextConfig: NextConfig = {
  // tesseract.js usa worker threads + wasm — não pode ser bundleado pelo Next
  serverExternalPackages: ["tesseract.js", "tesseract.js-core", "sharp"],
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
    ],
  },
  // Acesso por IP na LAN / IP público no modo `next dev`
  allowedDevOrigins: [
    "192.168.15.11",
    "192.168.15.6",
    "179.135.81.138",
    "179.135.81.141",
    "127.0.0.1",
    "localhost",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "assets.tcgdex.net",
      },
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
      },
    ],
  },
  // Proxy da API .NET na mesma porta 8211 → só precisa abrir TCP 8211 no roteador.
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: `${apiOrigin}/:path*`,
      },
    ];
  },
};

export default nextConfig;
