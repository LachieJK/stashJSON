/** @type {import('next').NextConfig} */
const nextConfig = {
  // Overridable build dir so a verification build can run alongside `next dev`
  // without the two corrupting each other's .next artifacts.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
