import React from 'react';
import { createRoot } from 'react-dom/client';
import { AdminEmbed } from './app/components/AdminEmbed';
import AdminSalesClient from './app/manage/AdminSalesClient';
import Models from './app/manage/models/page';
import Pricing from './app/manage/pricing/page';
import Maintenance from './app/manage/maintenance/page';
import { siteAdminNavigation, adminPanelHref } from './lib/admin-navigation.mjs';
import { createAdminIcon } from './lib/admin-icons.mjs';

const panels = { 'api-sales': () => <AdminSalesClient section="sales"/>, billing: () => <AdminSalesClient section="billing"/>, models: Models, pricing: Pricing, maintenance: Maintenance };
let mounted;
function restoreHeader() {
  for (const { node, original, applied } of mounted?.headerText || []) {
    if (node.nodeValue === applied) node.nodeValue = original;
  }
  mounted?.heading?.closest('header')?.removeAttribute('data-axiom-admin-header');
  mounted?.headerIcon?.remove();
  if (mounted) { mounted.headerText = []; mounted.headerIcon = null; mounted.heading = null; }
}
function syncHeading(id) {
  const heading = document.querySelector('main > header h1, main > header h2');
  const href = `/dashboard?admin=${id}${location.hash}`;
  const label = siteAdminNavigation[1].find(([target]) => target === href)?.[1]
    || siteAdminNavigation[1].find(([target]) => target === `/dashboard?admin=${id}`)?.[1];
  const iconId = id === 'billing' && location.hash === '#qris' ? 'qris' : id;
  if (mounted.heading !== heading) { restoreHeader(); mounted.heading = heading; }
  if (heading) {
    heading.closest('header').setAttribute('data-axiom-admin-header', '');
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT, {
      acceptNode: node => node.parentElement.closest('button,a,svg,[role="button"]') || !node.nodeValue.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node, index) => {
      let entry = mounted.headerText.find(entry => entry.node === node);
      if (!entry) { entry = { node, original: node.nodeValue }; mounted.headerText.push(entry); }
      else if (node.nodeValue !== entry.applied) entry.original = node.nodeValue;
      entry.applied = index === 0 ? label : '';
      if (node.nodeValue !== entry.applied) node.nodeValue = entry.applied;
    });
    if (mounted.headerIcon?.dataset.axiomHugeicon !== iconId || !mounted.headerIcon?.isConnected) {
      mounted.headerIcon?.remove(); mounted.headerIcon = createAdminIcon(iconId); heading.prepend(mounted.headerIcon);
    }
  }
  mounted.host.querySelectorAll('.dash-page-heading h1').forEach(title => {
    const old = title.querySelector('[data-axiom-hugeicon]');
    if (old?.dataset.axiomHugeicon === iconId) return;
    old?.remove(); title.prepend(createAdminIcon(iconId));
  });
}
export function unmountNativePanel() {
  if (!mounted) return;
  const { root, host, content } = mounted;
  restoreHeader();
  mounted = null;
  root.unmount(); host.remove(); content.removeAttribute('data-axiom-panel-active');
}
export function mountNativePanel() {
  const id = new URLSearchParams(location.search).get('admin');
  const Panel = location.pathname === '/dashboard' && panels[id];
  const content = document.querySelector('main > div.overflow-y-auto');
  if (!Panel || !content) { unmountNativePanel(); return; }
  if (mounted?.content !== content || !mounted?.host.isConnected) unmountNativePanel();
  if (!mounted) {
    const host = document.createElement('div'); host.dataset.axiomPanelHost = ''; host.tabIndex = -1;
    content.append(host); content.setAttribute('data-axiom-panel-active', '');
    mounted = { root: createRoot(host), host, content, key: null, headerText: [], headerIcon: null, heading: null };
  }
  const key = id + location.hash;
  if (mounted.key !== key) {
    mounted.key = key;
    mounted.root.render(<AdminEmbed.Provider value={true}><Panel key={key}/></AdminEmbed.Provider>);
    mounted.content.scrollTop = 0; mounted.host.focus({ preventScroll: true });
  }
  syncHeading(id);
}
function navigation() {
  if (!location.pathname.startsWith('/dashboard')) return;
  document.querySelectorAll('aside nav').forEach(nav => {
    if (!nav.querySelector('a[href^="/dashboard"]')) return;
    nav.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href'), target = adminPanelHref(href);
      if (href !== target) link.setAttribute('href', target);
    });
    if (!nav.querySelector('[data-axiom-admin-navigation]')) {
      const section = document.createElement('section'); section.dataset.axiomAdminNavigation = '';
      section.setAttribute('aria-label', siteAdminNavigation[0]);
      const heading = document.createElement('h2'); heading.textContent = siteAdminNavigation[0];
      heading.className = 'px-3 text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 mt-4'; section.append(heading);
      for (const [href, label] of siteAdminNavigation[1]) {
        if ([...nav.querySelectorAll('a[href]')].some(link => link.getAttribute('href') === href)) continue;
        const link = document.createElement('a'); link.href = href; link.textContent = label;
        link.className = 'flex items-center gap-3 px-3 py-1 rounded-lg text-text-muted hover:bg-surface-2 hover:text-text-main text-[13px] font-medium'; section.append(link);
      }
      nav.append(section);
    }
    nav.querySelectorAll('a[href*="?admin="]').forEach(link => {
      const url = new URL(link.href);
      const iconId = url.hash === '#qris' ? 'qris' : url.searchParams.get('admin');
      if (panels[url.searchParams.get('admin')] && !link.querySelector('[data-axiom-hugeicon]')) {
        link.querySelectorAll(':scope > svg, :scope > .material-symbols-rounded, :scope > .material-symbols-outlined').forEach(icon => icon.remove());
        link.prepend(createAdminIcon(iconId));
      }
      const active = link.pathname === location.pathname && link.search === location.search && link.hash === location.hash;
      if (active && link.getAttribute('aria-current') !== 'page') link.setAttribute('aria-current', 'page');
      if (!active && link.hasAttribute('aria-current')) link.removeAttribute('aria-current');
    });
  });
}
function sync() { navigation(); mountNativePanel(); }
function start() {
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) return;
    const url = new URL(adminPanelHref(link.getAttribute('href')), location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === '/dashboard' && panels[url.searchParams.get('admin')]) {
      event.preventDefault(); event.stopImmediatePropagation();
      history.pushState(history.state, '', url); sync();
      // Native drawer owns its state: activate its own close control rather than hiding it.
      const aside = link.closest('aside');
      if (aside && matchMedia('(max-width: 1023px)').matches) {
        const close = aside.querySelector('button[aria-label*="close" i],button[aria-label*="tutup" i]');
        if (close) close.click();
        else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }
    } else if (mounted && url.pathname.startsWith('/dashboard')) unmountNativePanel();
  }, true);
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function (...args) { const result = original.apply(this, args); sync(); return result; };
  }
  window.addEventListener('popstate', sync);
  window.addEventListener('hashchange', sync);
  window.addEventListener('pagehide', unmountNativePanel);
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true; queueMicrotask(() => { scheduled = false; sync(); });
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  sync();
  window.AxiomNativePanels = { mountNativePanel, unmountNativePanel };
}
if (document.readyState === 'complete') start();
else window.addEventListener('load', start, { once: true });
