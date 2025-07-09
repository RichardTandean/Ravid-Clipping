/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['fluent-ffmpeg']
  },
  api: {
    bodyParser: {
      sizeLimit: '500mb'
    },
    responseLimit: false
  },
  output: 'standalone'
}

module.exports = nextConfig 