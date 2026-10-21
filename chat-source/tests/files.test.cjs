const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/fileLibrary.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = { exports: {} }; new Function('module', 'exports', code)(loaded, loaded.exports);
const { saveLibraryFile, libraryFiles, removeLibraryFile, resolveMessageFiles } = loaded.exports;

// Minimal asynchronous IndexedDB API fixture. Tests the client lifecycle and
// request hydration, not a browser's native IndexedDB implementation.
const records = new Map(); let notifications = 0;
global.window = new EventTarget(); window.addEventListener('client-files-changed', () => notifications++);
global.indexedDB = { open() {
  const request = {};
  queueMicrotask(() => { request.result = { close() {}, transaction() {
    const transaction = { objectStore() {
      const result = value => { const response = { result: value }; queueMicrotask(() => transaction.oncomplete?.()); return response; };
      return { put(value) { records.set(value.id, value); return result(value.id); }, get(id) { return result(records.get(id)); }, getAll() { return result([...records.values()]); }, delete(id) { records.delete(id); return result(undefined); } };
    } }; return transaction;
  } }; request.onsuccess(); }); return request;
} };
global.FileReader = class { readAsDataURL(blob) { blob.arrayBuffer().then(buffer => { this.result = 'data:' + blob.type + ';base64,' + Buffer.from(buffer).toString('base64'); this.onload(); }, () => this.onerror()); } };
test.beforeEach(() => { records.clear(); notifications = 0; });

test('library keeps blobs outside conversation metadata and publishes storage changes', async () => {
  const reference = await saveLibraryFile(new File(['source'], 'readme.txt', { type: 'text/plain' }), 'source');
  assert.deepEqual(reference, { id: 'source', name: 'readme.txt', type: 'text/plain' });
  const files = await libraryFiles(); assert.equal(await files[0].blob.text(), 'source'); assert.equal(notifications, 1);
  await removeLibraryFile('source'); assert.equal((await libraryFiles()).length, 0); assert.equal(notifications, 2);
});

test('text hydration adds explicit file context without mutating saved messages', async () => {
  const ref = await saveLibraryFile(new File(['Hello 🌏'], 'hello.md', { type: 'text/markdown' }));
  const messages = [{ role: 'user', text: 'Summarize', attachments: [ref] }];
  const resolved = await resolveMessageFiles(messages, new AbortController().signal);
  assert.equal(messages[0].text, 'Summarize'); assert.match(resolved[0].text, /Attached file: hello.md/); assert.match(resolved[0].text, /Hello 🌏/);
});

test('vision hydration generates image data only for supported image types', async () => {
  const ref = await saveLibraryFile(new File(['image-bytes'], 'image.png', { type: 'image/png' }));
  const resolved = await resolveMessageFiles([{ role: 'user', text: 'Describe', attachments: [ref] }], new AbortController().signal);
  assert.deepEqual(resolved[0].images, ['data:image/png;base64,' + Buffer.from('image-bytes').toString('base64')]); assert.equal(resolved[0].text, 'Describe');
});

test('missing, unsupported or excessive attachments fail before sending', async () => {
  const signal = new AbortController().signal;
  await assert.rejects(resolveMessageFiles([{ role: 'user', text: '', attachments: [{ id: 'missing', name: 'missing.txt' }] }], signal), /tidak ditemukan/);
  const binary = await saveLibraryFile(new File(['pdf'], 'file.pdf', { type: 'application/pdf' }));
  await assert.rejects(resolveMessageFiles([{ role: 'user', text: '', attachments: [binary] }], signal), /belum didukung/);
  const text = await saveLibraryFile(new File(['x'.repeat(512 * 1024 + 1)], 'large.txt', { type: 'text/plain' }));
  await assert.rejects(resolveMessageFiles([{ role: 'user', text: '', attachments: [text] }], signal), /512 KB/);
  const image = await saveLibraryFile(new File(['tiny'], 'image.png', { type: 'image/png' }));
  await assert.rejects(resolveMessageFiles([{ role: 'user', text: '', attachments: Array(5).fill(image) }], signal), /4 gambar/);
  const largeImage = await saveLibraryFile(new File(['x'.repeat(1024 * 1024 + 1)], 'large.png', { type: 'image/png' }));
  await assert.rejects(resolveMessageFiles([{ role: 'user', text: '', attachments: [largeImage] }], signal), /1 MB/);
  await assert.rejects(saveLibraryFile(new File(['x'.repeat(10 * 1024 * 1024 + 1)], 'huge.txt')), /10 MB/);
});

test('aborted attachment resolution does not prepare provider context', async () => {
  const ref = await saveLibraryFile(new File(['secret source'], 'file.txt', { type: 'text/plain' }));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(resolveMessageFiles([{ role: 'user', text: '', attachments: [ref] }], controller.signal), error => error.name === 'AbortError');
});
