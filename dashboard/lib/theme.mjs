// Native Zustand persists the same `theme` key; use its envelope across both apps.
function bootstrapTheme() {
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  function decode(value) {
    if (['light', 'dark', 'system'].includes(value)) return value;
    try {
      const parsed = JSON.parse(value)?.state?.theme;
      if (['light', 'dark', 'system'].includes(parsed)) return parsed;
    } catch {}
    return 'system';
  }
  function readPreference() {
    try { return decode(localStorage.getItem('theme')); } catch { return preference; }
  }
  function apply(value) {
    preference = decode(value);
    const dark = preference === 'dark' || (preference === 'system' && media.matches);
    if (root.classList.contains('dark') !== dark) root.classList.toggle('dark', dark);
    root.dataset.theme = preference;
    root.style.colorScheme = dark ? 'dark' : 'light';
    window.dispatchEvent(new Event('axiom-theme-change'));
  }
  window.axiomSetTheme = (value) => {
    apply(value);
    try {
      localStorage.setItem('theme', JSON.stringify({ state: { theme: preference }, version: 0 }));
      root.dataset.themeSaved = 'true';
    } catch { root.dataset.themeSaved = 'false'; }
  };
  preference = readPreference();
  // Normalize a legacy raw preference before the native store hydrates.
  try {
    const stored = localStorage.getItem('theme');
    if (['light', 'dark', 'system'].includes(stored)) localStorage.setItem('theme', JSON.stringify({ state: { theme: preference }, version: 0 }));
  } catch {}
  media.addEventListener('change', () => apply(readPreference()));
  window.addEventListener('storage', (event) => { if (event.key === 'theme' || event.key === null) apply(readPreference()); });
  // Native controls update html.dark directly after persisting their preference.
  new MutationObserver(() => apply(readPreference())).observe(root, { attributes: true, attributeFilter: ['class'] });
  apply(preference);
}

export const themeScript = `(${bootstrapTheme.toString()})();`;
