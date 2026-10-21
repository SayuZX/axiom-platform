export default function robots() {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/account', '/manage', '/merchant', '/checkout', '/playground', '/maintenance', '/site-api/', '/account-api/', '/customer-api/', '/commerce-api/', '/wallet-api/', '/manage-api/', '/merchant-api/', '/native-theme/', '/v1/', '/api/'] },
    sitemap: 'https://ai.axiomcreative.xyz/sitemap.xml',
  };
}
