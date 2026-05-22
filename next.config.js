/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_GIT_SHA: (process.env.COMMIT_REF || 'dev').slice(0, 7),
  },
}

module.exports = nextConfig
