const path = require('node:path');
const fs = require('node:fs/promises');
const { createRequire } = require('node:module');
const nextRequire = createRequire(require.resolve('next/package.json'));
const webpackPackage = require('next/dist/compiled/webpack/webpack');
const { webpack } = webpackPackage;
const postcss = nextRequire('postcss');
const root = __dirname;
async function build() {
  await require('next/dist/build/swc').loadBindings();
  await fs.mkdir(path.join(root, 'public'), { recursive: true });
  await new Promise((resolve, reject) => {
    const compiler = webpack({
      mode: 'production', target: 'web', context: root,
      entry: './native-panels.jsx',
      output: { path: path.join(root, 'public'), filename: 'native-panels.js', uniqueName: 'axiom-native-panels' },
      resolve: { extensions: ['.jsx', '.js', '.mjs', '.json'], modules: [path.join(root, 'node_modules'), 'node_modules'], alias: { 'next/navigation$': path.join(root, 'native-panel-navigation.js') } },
      module: { rules: [{ test: /\.(jsx|js)$/, exclude: /node_modules/, use: path.join(root, 'native-panel-loader.cjs') }, { test: /\.css$/, use: path.join(root, 'native-panel-loader.cjs') }] },
      optimization: { splitChunks: false, runtimeChunk: false, minimize: false },
      plugins: [new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 })],
      devtool: false,
    });
    compiler.run((error, stats) => compiler.close(closeError => {
      if (error || closeError) return reject(error || closeError);
      if (stats.hasErrors()) return reject(new Error(stats.toString({ all: false, errors: true })));
      console.log(stats.toString({ colors: false, modules: false, chunks: false })); resolve();
    }));
  });
  const bundle = path.join(root, 'public/native-panels.js');
  const minified = await require('next/dist/build/swc').minify(await fs.readFile(bundle, 'utf8'), { compress: true, mangle: true });
  await fs.writeFile(bundle, minified.code);
  const css = postcss.parse(await fs.readFile(path.join(root, 'app/dashboard.css'), 'utf8'));
  css.walkRules(rule => {
    if (rule.parent.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    rule.selectors = rule.selectors.map(selector => {
      if (selector === ':root') return '[data-axiom-panel-host]';
      if (selector === 'html.dark') return 'html.dark [data-axiom-panel-host]';
      if (selector.startsWith('html.dark ')) return `html.dark [data-axiom-panel-host] ${selector.slice(10)}`;
      return `[data-axiom-panel-host] ${selector}`;
    });
  });
  await fs.writeFile(path.join(root, 'public/native-panels.css'), css.toString() + '\n' + await fs.readFile(path.join(root, 'native-panels.css'), 'utf8'));
}
build().catch(error => { console.error(error); process.exitCode = 1; });
