import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  // We can remove the `images` configuration for now as it's not needed
  // and might be causing issues.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
