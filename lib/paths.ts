// Base path for static assets. Empty for root deploys (Vercel). Set
// NEXT_PUBLIC_BASE_PATH="/re-flight" (or similar) when hosting under a subpath
// such as GitHub Pages. next.config.mjs reads the same variable.
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
