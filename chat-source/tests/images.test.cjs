const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.resolve(__dirname, '..');
const cache = new Map();

function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const output = file.endsWith('SDKPrimitives.tsx')
    ? require('esbuild').buildSync({
        absWorkingDir: root,
        entryPoints: [file],
        bundle: true,
        write: false,
        platform: 'node',
        format: 'cjs',
        jsx: 'automatic',
        loader: { '.css': 'empty', '.module.css': 'empty' },
        external: ['react', 'react-dom', 'react/jsx-runtime']
      }).outputFiles[0].text
    : ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          target: ts.ScriptTarget.ES2022
        }
      }).outputText;

  new Function('require', 'module', 'exports', output)(name => {
    if (!name.startsWith('.')) return require(name);
    const base = path.resolve(path.dirname(file), name);
    return load([base + '.tsx', base + '.ts', base + '/index.ts'].find(candidate => fs.existsSync(candidate)));
  }, mod, mod.exports);

  return mod.exports;
}

// Minimal browser globals for rendering
if (!global.window) global.window = new EventTarget();
if (!global.indexedDB) {
  global.indexedDB = {
    open() {
      const req = {};
      queueMicrotask(() => {
        req.result = {
          close() {},
          transaction() {
            return {
              objectStore() {
                return {
                  getAll() {
                    const r = { result: [] };
                    queueMicrotask(() => r.onsuccess?.());
                    return r;
                  }
                };
              }
            };
          }
        };
        req.onsuccess?.();
      });
      return req;
    }
  };
}

const { STYLE_PRESETS, ImagesHub } = load(path.join(root, 'src/desktop/ImagesHub.tsx'));
const { CollectionScreen } = load(path.join(root, 'src/desktop/ClientCollections.tsx'));

test('STYLE_PRESETS contains 10 curated visual style presets with prompt starters and metadata', () => {
  assert.equal(STYLE_PRESETS.length, 10, 'Expected exactly 10 style presets');
  for (const preset of STYLE_PRESETS) {
    assert.ok(preset.id && typeof preset.id === 'string', 'Preset must have an id');
    assert.ok(preset.name && typeof preset.name === 'string', 'Preset must have a name');
    assert.ok(preset.prompt && preset.prompt.length > 20, 'Preset must have a prompt starter');
    assert.ok(preset.badge && typeof preset.badge === 'string', 'Preset must have a category badge');
    assert.ok(preset.gradient && preset.gradient.startsWith('linear-gradient'), 'Preset must have a gradient');
    assert.ok(preset.ratio && typeof preset.ratio === 'string', 'Preset must have an aspect ratio tag');
  }

  const ids = STYLE_PRESETS.map(p => p.id);
  assert.ok(ids.includes('photographic'), 'Includes Photographic preset');
  assert.ok(ids.includes('anime'), 'Includes Anime & Manga preset');
  assert.ok(ids.includes('isometric-3d'), 'Includes 3D Isometric preset');
  assert.ok(ids.includes('cyberpunk'), 'Includes Cyberpunk preset');
  assert.ok(ids.includes('watercolor'), 'Includes Watercolor preset');
  assert.ok(ids.includes('oil-impressionism'), 'Includes Impressionist Oil preset');
  assert.ok(ids.includes('pixel-art'), 'Includes Pixel Art preset');
  assert.ok(ids.includes('swiss-minimalist'), 'Includes Swiss Minimalist preset');
  assert.ok(ids.includes('claymation'), 'Includes Claymation preset');
  assert.ok(ids.includes('fantasy-concept'), 'Includes Fantasy Concept preset');
});

test('ImagesHub renders navigation tabs, category filters, and style cards', () => {
  let drafted = '';
  const markup = renderToStaticMarkup(
    React.createElement(ImagesHub, {
      onDraft(prompt) {
        drafted = prompt;
      },
      query: ''
    })
  );

  assert.ok(markup.includes('role="tablist"'), 'Contains tablist for hub views');
  assert.ok(markup.includes('Style Presets'), 'Contains Style Presets tab');
  assert.ok(markup.includes('Saved Images'), 'Contains Saved Images tab');
  assert.ok(markup.includes('d-style-presets-grid'), 'Renders style presets grid');
  assert.ok(markup.includes('Photographic Realism'), 'Renders Photographic Realism title');
  assert.ok(markup.includes('Anime &amp; Manga') || markup.includes('Anime & Manga'), 'Renders Anime title');
  assert.ok(markup.includes('Use Style in Chat'), 'Renders Use Style in Chat CTA button');
});

test('ImagesHub respects search query filtering', () => {
  const markup = renderToStaticMarkup(
    React.createElement(ImagesHub, {
      onDraft() {},
      query: 'cyberpunk'
    })
  );

  assert.ok(markup.includes('Cyberpunk Neon'), 'Includes matching style preset');
  assert.ok(!markup.includes('Fluid Watercolor'), 'Filters out non-matching style presets');
});

test('CollectionScreen integrates ImagesHub when screen is images', () => {
  const store = {
    data: { documents: [], sites: [], tasks: [], mcp: [], skills: [], notifications: [] },
    setData() {}
  };
  const markup = renderToStaticMarkup(
    React.createElement(CollectionScreen, {
      screen: 'images',
      store,
      onOpen() {},
      onDraft() {},
      onChooseProject() {},
      onSelectProject() {}
    })
  );

  assert.ok(markup.includes('d-images-hub'), 'Renders ImagesHub component inside CollectionScreen');
  assert.ok(markup.includes('Explore Visual Styles'), 'Renders ImagesHub section heading');
});

test('images.css includes :focus-within reveal and touch fallback for gallery overlay', () => {
  const css = fs.readFileSync(path.join(root, 'src/desktop/images.css'), 'utf8');
  assert.ok(css.includes('.d-gallery-thumb-wrap:focus-within .d-gallery-overlay'), 'Focus within on thumbnail wrap reveals overlay');
  assert.ok(css.includes('.d-gallery-overlay:focus-within'), 'Focus within on overlay directly keeps overlay visible');
  assert.ok(css.includes('@media (hover: none)'), 'Touch fallback provides persistent visible controls on touch devices');
});
