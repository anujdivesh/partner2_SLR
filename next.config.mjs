const basePath = process.env.BASE_PATH ?? "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath,
  // assetPrefix is automatically handled by basePath
};

export default nextConfig;
