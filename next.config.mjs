/** @type {import('next').NextConfig} */
const nextConfig = {
  // The curated gallery + flight pages are still statically prerendered (SSG),
  // but "fly your own log" needs a runtime terrain endpoint (browsers can't fetch
  // the elevation tiles directly — the bucket sends no CORS headers), so this is a
  // Vercel-hosted Next app rather than a pure static export. Remove app/replay +
  // app/api/terrain and re-add `output: 'export'` to go back to a static site.
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
