import type { NextConfig } from 'next';
const backend = process.env.BACKEND_URL || 'http://127.0.0.1:3083';
const config: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  agentRules: false,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/qr/:id',
          has: [{ type: 'query', key: 'format', value: 'raw' }],
          destination: `${backend}/api/qr-image/:id`,
        },
        {
          source: '/qr/:id',
          has: [{ type: 'query', key: 'raw', value: '1' }],
          destination: `${backend}/api/qr-image/:id`,
        },
        ...[
          '/api/:path*',
          '/create-qris',
          '/check-payment',
          '/transactions/:path*',
          '/token-status',
          '/health',
        ].map((source) => ({ source, destination: backend + source })),
      ],
    };
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};
export default config;
