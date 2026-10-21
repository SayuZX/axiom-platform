// Run in browser DevTools on an authenticated native dashboard after loading native-panels.js.
(async () => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const api = window.AxiomNativePanels;
  assert(api, 'Compiled native panel bundle missing');
  const content = document.querySelector('main > div.overflow-y-auto');
  assert(content, 'Native dashboard content region missing');
  const original = [...content.children];
  const before = location.href;
  const state = history.state;
  try {
    history.pushState(state, '', '/dashboard?admin=models');
    api.mountNativePanel();
    assert(content.querySelector('[data-axiom-panel-host]'), 'Panel must mount inside native content');
    assert(original.every(node => node.parentNode === content), 'Native children must remain owned by native React');
    assert(original.every(node => getComputedStyle(node).display === 'none'), 'Native content must be hidden while panel is visible');
    const restored = new Promise(resolve => window.addEventListener('popstate', resolve, { once: true }));
    history.back(); await restored;
    api.mountNativePanel();
    assert(location.href === before, 'Back must restore native route');
    assert(!content.querySelector('[data-axiom-panel-host]'), 'Back must unmount panel');
    assert(!content.hasAttribute('data-axiom-panel-active'), 'Back must restore native content visibility');
    assert(original.every(node => node.parentNode === content), 'Native DOM identity must survive');
    console.log('Native panel mount/back restoration passed');
  } finally {
    history.replaceState(state, '', before); api.unmountNativePanel();
  }
})();
