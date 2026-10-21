import { getAxiomHistory } from '../lib/axiomHistory';
import type { LibraryFile } from '../lib/fileLibrary';

export type SearchFilter = 'Top' | 'Chats' | 'Images' | 'Documents' | 'Projects';
export type MobileProject = { id: string; name: string; chats: string[] };
export type SearchItem = { id: string; title: string; detail: string; icon: string; kind: Exclude<SearchFilter, 'Top'>; updated: number; text?: string; file?: LibraryFile };
export function loadMobileProjects(): MobileProject[] {
  try { const values: unknown = JSON.parse(localStorage.getItem('client-mobile-projects-v1') || '[]'); if (!Array.isArray(values)) return []; const titles = getAxiomHistory().titles; return values.flatMap((project: unknown) => { if (!project || typeof project !== 'object' || !('id' in project) || typeof project.id !== 'string' || !('name' in project) || typeof project.name !== 'string' || !('chats' in project) || !Array.isArray(project.chats)) return []; return [{ id: project.id, name: project.name, chats: project.chats.filter((title: unknown): title is string => typeof title === 'string' && titles.includes(title)) }]; }); } catch { return []; }
}
export function fileCategory(name: string, type: string): { detail: string; icon: string; kind: 'Images' | 'Documents' } {
  if (/\.(html?|xhtml)$/i.test(name) || /html/i.test(type)) return { detail: 'HTML', icon: 'globe', kind: 'Documents' };
  if (type.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi)$/i.test(name)) return { detail: 'Video', icon: 'video-file', kind: 'Documents' };
  if (type.startsWith('image/') || /\.(png|jpe?g|webp|gif|heic|svg)$/i.test(name)) return { detail: 'Gambar', icon: 'image-file', kind: 'Images' };
  if (type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/i.test(name)) return { detail: 'Audio', icon: 'audio-file', kind: 'Documents' };
  return { detail: 'Dokumen', icon: 'document-file', kind: 'Documents' };
}
export function fileSearchItems(files: LibraryFile[]): SearchItem[] {
  return files.map(file => ({ id: file.id, title: file.name, ...fileCategory(file.name, file.type), updated: file.added, file })).sort((a, b) => b.updated - a.updated);
}
export function filterSearchItems(items: SearchItem[], query: string, filter: SearchFilter): SearchItem[] {
  const normalized = query.trim().normalize('NFKC').toLocaleLowerCase('id-ID');
  return items.filter(item => (filter === 'Top' || item.kind === filter) && [item.title, item.text || ''].some(text => text.normalize('NFKC').toLocaleLowerCase('id-ID').includes(normalized)));
}
export function chatSearchItems(titles: string[], archived: string[]): SearchItem[] {
  const { content } = getAxiomHistory();
  return titles.filter(title => !archived.includes(title)).map((title, index) => {
    const messages = Array.isArray(content[title]) ? content[title] : [];
    return { id: title, title, detail: 'Obrolan', icon: 'comment', kind: 'Chats', updated: messages.at(-1)?.timestamp || -index, text: messages.map(message => typeof message?.text === 'string' ? message.text : '').join('\n') };
  });
}
