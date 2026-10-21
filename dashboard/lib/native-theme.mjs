import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { themeScript } from './theme.mjs';

let pending;
export function getNativeTheme() {
  pending ??= Promise.all(['native/common.css', 'native/showcase.css', 'public/native-panels.js', 'public/native-panels.css'].map(file =>
    readFile(path.join(process.cwd(), file), 'utf8')
  )).then(parts => {
    const css = parts.slice(0, 2).join('\n');
    return { css, version: createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 16) };
  }).catch(error => { pending = undefined; throw error; });
  return pending;
}

export function injectNativeTheme(html, version) {
  if (!/^[a-f0-9]{16}$/.test(version)) throw new Error('Invalid theme revision');
  const close = html.indexOf('</head>');
  if (close < 0) throw new Error('Native page has no head');
  const link = `<script>${themeScript}</script><script type="module" src="/axiom-feedback.js?v=3"></script><link rel="stylesheet" href="/native-theme/${version}.css" data-axiom-native-theme="${version}"><link rel="stylesheet" href="/native-panels.css?v=${version}"><script defer src="/native-panels.js?v=${version}"></script>`;
  return html.slice(0, close) + link + html.slice(close);
}
