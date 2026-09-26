import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Standalone output keeps the production container small (infra/docker/web.Dockerfile).
  output: 'standalone',
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  transpilePackages: ['@agri/ui', '@agri/contracts'],
  typedRoutes: true,
  // Lint is its own turbo task (`pnpm lint`) using the flat config in eslint.config.mjs;
  // Next's build-time lint does not detect flat configs and would run it a second time.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
