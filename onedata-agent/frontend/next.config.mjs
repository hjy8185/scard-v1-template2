;

const nextConfig = {
  reactStrictMode: true,
  env: {
    BFF_URL: process.env.BFF_URL ?? 'http://localhost:8000',
  },
};

export default nextConfig;
