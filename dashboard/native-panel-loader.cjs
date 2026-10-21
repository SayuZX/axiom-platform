module.exports = function (source) {
  const callback = this.async();
  if (this.resourcePath.endsWith('.css')) return callback(null, '');
  require('next/dist/build/swc').transform(source, {
    filename: this.resourcePath,
    sourceMaps: false,
    jsc: { target: 'es2020', parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } },
    module: { type: 'es6' },
  }).then(result => callback(null, result.code), callback);
};
