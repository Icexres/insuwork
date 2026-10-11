/** @type {import('next').NextConfig} */
const nextConfig = {
  // workspace packages are consumed as TypeScript source (no build step)
  transpilePackages: ["@insuwork/sdk"],
  webpack: (config) => {
    // the SDK imports "./x.ts" paths (allowImportingTsExtensions); let webpack resolve them
    config.resolve.extensionAlias = { ".js": [".ts", ".js"] };
    return config;
  },
};
module.exports = nextConfig;
