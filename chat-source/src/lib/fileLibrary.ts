export type FileRef = { id: string; name: string; type: string };
export type LibraryFile = FileRef & { blob: Blob; size: number; added: number };
const databaseName = 'client-file-library-v1';
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => { const request = indexedDB.open(databaseName, 1); request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'id' }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(Error('Penyimpanan file browser tidak tersedia.')); });
}
async function operation<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  try { return await new Promise((resolve, reject) => { const transaction = db.transaction('files', mode); const request = run(transaction.objectStore('files')); transaction.oncomplete = () => resolve(request.result); transaction.onerror = transaction.onabort = () => reject(Error('File belum tersimpan. Periksa ruang penyimpanan browser.')); }); }
  finally { db.close(); }
}
export async function saveLibraryFile(file: File, id = crypto.randomUUID()): Promise<FileRef> {
  if (file.size > 10 * 1024 * 1024) throw Error('Library menerima file hingga 10 MB.');
  await operation('readwrite', store => store.put({ id, name: file.name, type: file.type, blob: file, size: file.size, added: Date.now() }));
  window.dispatchEvent(new Event('client-files-changed')); return { id, name: file.name, type: file.type };
}
export function libraryFiles() { return operation<LibraryFile[]>('readonly', store => store.getAll()); }
export function libraryFile(id: string) { return operation<LibraryFile | undefined>('readonly', store => store.get(id)); }
export async function removeLibraryFile(id: string) { await operation('readwrite', store => store.delete(id)); window.dispatchEvent(new Event('client-files-changed')); }
function dataUrl(blob: Blob): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(Error('Gambar tidak bisa dibaca.')); reader.readAsDataURL(blob); }); }
export async function resolveMessageFiles<T extends { role: string; text: string; attachments?: FileRef[] }>(messages: T[], signal: AbortSignal): Promise<(T & { images?: string[] })[]> {
  let total = 0, imageCount = 0;
  const output = [];
  for (const message of messages) {
    let context = ''; const images: string[] = [];
    for (const reference of message.attachments || []) {
      signal.throwIfAborted(); const file = await libraryFile(reference.id); if (!file) throw Error('Lampiran ' + reference.name + ' tidak ditemukan di library perangkat ini.');
      if (/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
        if (file.size > 1024 * 1024 || ++imageCount > 4) throw Error('Input vision maksimal 4 gambar, masing-masing 1 MB.');
        images.push(await dataUrl(file.blob));
      } else if (file.type.startsWith('text/') || /\.(txt|md|json|csv|js|jsx|ts|tsx|css|html|py|log|yaml|yml)$/i.test(file.name)) {
        total += file.size; if (total > 512 * 1024) throw Error('Total lampiran teks maksimal 512 KB per permintaan.');
        context += '\n\n[Attached file: ' + file.name + ']\n' + await file.blob.text() + '\n[End attached file]';
      } else throw Error('Format ' + file.name + ' belum didukung model bridge. Gunakan file teks atau gambar PNG/JPEG/WebP/GIF.');
    }
    output.push({ ...message, text: message.text + (context ? '\n\nThe following attachments are source data for this request:\n' + context : ''), ...(images.length ? { images } : {}) });
  }
  signal.throwIfAborted(); return output;
}
