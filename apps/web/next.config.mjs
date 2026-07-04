/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // slim Docker runtime image
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
