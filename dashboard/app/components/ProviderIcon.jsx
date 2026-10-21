const icons = {
  cbai: 'codebuddy',
  cbcn: 'codebuddy',
  'codebuddy-intl': 'codebuddy',
  'codebuddy-cn': 'codebuddy',
  codebuddy: 'codebuddy',
  cx: 'codex',
  codex: 'codex',
  'openai codex': 'codex',
  openai: 'openai',
  deepseek: 'deepseek',
  gemini: 'gemini',
  'z.ai': 'zai',
  hunyuan: 'hunyuan',
  kimi: 'kimi',
  'xiaomi mimo': 'xiaomimimo',
  minimax: 'minimax',
  qwen: 'qwen',
};

// Decorative only: keep the catalog provider label beside the icon.
export default function ProviderIcon({ provider, size = 24 }) {
  const key = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
  const icon = Object.hasOwn(icons, key) ? icons[key] : null;
  const src = key === 'atr' || key === 'atria' ? '/provider-logos/atria.png' : icon ? `/provider-logos/${icon}.svg` : null;
  return src ? <img src={src} width={size} height={size} alt="" aria-hidden="true" style={{ display: 'inline-block', flexShrink: 0, objectFit: 'contain', verticalAlign: 'middle', boxSizing: 'border-box', padding: 2, borderRadius: 4, backgroundColor: '#fff' }}/> : null;
}
