const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static site — no server runtime. Deployable to any static host.
  output: 'export',
  // Root deploys (Vercel) leave this empty; set NEXT_PUBLIC_BASE_PATH for a
  // subpath host such as GitHub Pages.
  ...(base ? { basePath: base, assetPrefix: base } : {}),
  // Emit /flights/denali/index.html rather than /flights/denali.html so the
  // per-flight routes resolve cleanly on plain static hosts.
  trailingSlash: true,
  images: { unoptimized: true },
  // The renderer is bespoke imperative three.js; lint config would only get in
  // the way of a static export build.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
