// Parser-blocking bootstrap: apply the saved scheme before styles/app render.
(() => {
  let preference = 'dark';
  try { const value = JSON.parse(localStorage.getItem('client-settings-v1') || 'null')?.theme; if (['dark', 'light', 'system'].includes(value)) preference = value; } catch { /* Storage is optional. */ }
  const theme = preference === 'system' ? window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark' : preference;
  const root = document.documentElement;
  root.dataset.mobileLaunch = String(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || new URLSearchParams(location.search).get('mobile') === '1');
  root.dataset.clientTheme = theme; root.dataset.theme = theme;
  root.style.colorScheme = theme; root.style.backgroundColor = theme === 'light' ? '#ffffff' : '#000000';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', root.style.backgroundColor);
})();
