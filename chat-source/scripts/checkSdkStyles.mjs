import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export function assertSdkLayerOrder(css) {
  const layers = [];
  for (const match of css.matchAll(/@layer\s+([^;{]+)[;{]/g)) {
    for (const name of match[1].split(',').map(value => value.trim())) if (!layers.includes(name)) layers.push(name);
  }
  const base = layers.indexOf('base'), components = layers.indexOf('components'), utilities = layers.indexOf('utilities');
  if (base < 0 || components <= base || utilities <= components) {
    throw Error('SDK CSS layer order is invalid. Load sdk-ui.css before application/component imports; base resets must precede components.');
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const html = readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  const styles = [...html.matchAll(/href="(?:\/axiom-chat\/|\/)?(assets\/[^"\s]+\.css)"/g)].map(match => match[1]);
  if (!styles.length) throw Error('No entry stylesheet found in dist/index.html.');
  const css = styles.map(file => readFileSync(path.join(root, 'dist', file), 'utf8')).join('\n');
  assertSdkLayerOrder(css);
  console.log('SDK production CSS layer order verified.');
}
