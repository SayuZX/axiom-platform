// Shared by the website admin shell and the native 9router sidebar extension.
export const siteAdminNavigation = ['Administrasi AXIOM', [
  ['/dashboard?admin=api-sales', 'Jual API'],
  ['/dashboard?admin=billing', 'Billing'],
  ['/dashboard?admin=models', 'Model Showcase'],
  ['/dashboard?admin=pricing', 'Model Pricing'],
  ['/dashboard?admin=billing#qris', 'Pengaturan QRIS'],
  ['/dashboard?admin=maintenance', 'Maintenance'],
  ['/manage/announcements', 'Pengumuman'],
]];

export const adminNavigation = [
  ['9router', [
    ['/dashboard', 'Ringkasan router'], ['/dashboard/endpoint', 'Endpoint & Key'],
    ['/dashboard/providers', 'Providers'], ['/dashboard/combos', 'Combo & Vision Adapter'],
    ['/dashboard/usage', 'Usage'], ['/dashboard/quota', 'Quota Tracker'],
    ['/dashboard/token-saver', 'Token Saver'], ['/dashboard/cli-tools', 'CLI Tools'],
  ]],
  siteAdminNavigation,
  ['System', [
    ['/dashboard/media-providers/embedding', 'Embedding'], ['/dashboard/media-providers/image', 'Image'],
    ['/dashboard/media-providers/video', 'Video'], ['/dashboard/media-providers/tts', 'Text to Speech'],
    ['/dashboard/media-providers/stt', 'Speech to Text'], ['/dashboard/media-providers/web', 'Web Fetch & Search'],
    ['/dashboard/proxy-pools', 'Proxy Pools'], ['/dashboard/skills', 'Skills'],
    ['/dashboard/console-log', 'Console Log'], ['/dashboard/translator', 'Translator'],
    ['/dashboard/basic-chat', 'Chat router'], ['/dashboard/pxpipe', 'PxPipe'], ['/dashboard/mitm', 'MITM'],
    ['/dashboard/profile', 'Profil & pengaturan'],
  ]],
  ['Jelajahi', [['/', 'Situs publik'], ['/buy', 'Halaman pembeli'], ['/docs', 'Dokumentasi']]],
];

export const nativeAdminAliases = {
  '/dashboard/billing': '/dashboard?admin=billing',
  '/dashboard/models': '/dashboard?admin=models',
  '/dashboard/settings/pricing': '/dashboard?admin=pricing',
};

export function adminPanelHref(href) {
  if (typeof href !== 'string') return href;
  const match = /^\/manage\/(api-sales|billing|models|pricing|maintenance)(#.*)?$/.exec(href);
  return match ? `/dashboard?admin=${match[1]}${match[2] || ''}` : nativeAdminAliases[href] || href;
}
