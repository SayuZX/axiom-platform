export default {
  assetPrefix: '/ai-assets',
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', '@napi-rs/canvas'],
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
      ]
    }, ...['account', 'manage', 'merchant', 'checkout', 'playground', 'maintenance', 'account-api', 'customer-api', 'manage-api', 'wallet-api', 'merchant-api', 'commerce-api'].map(path => ({ source: `/${path}/:path*`, headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }))];
  }
};
