import { ClientAlert, ClientEmpty } from '../components/SDKPrimitives';
import { useEffect, useRef, useState } from 'react';
import { libraryFiles, removeLibraryFile, saveLibraryFile, type LibraryFile } from '../lib/fileLibrary';
import { LocalDialog } from './WorkspaceControls';

export function FileLibrary({ imagesOnly = false, onAttach, onClose, onProjectFiles }: { imagesOnly?: boolean; onAttach: (file: File) => void; onClose: () => void; onProjectFiles?: () => void }) {
  const [files, setFiles] = useState<LibraryFile[]>([]), [query, setQuery] = useState(''), [error, setError] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => { let alive = true; const refresh = () => void libraryFiles().then(value => { if (alive) setFiles(value.sort((a, b) => b.added - a.added)); }).catch(failure => { if (alive) setError(failure.message); }); refresh(); window.addEventListener('client-files-changed', refresh); return () => { alive = false; window.removeEventListener('client-files-changed', refresh); }; }, []);
  const filtered = files.filter(file => (!imagesOnly || file.type.startsWith('image/')) && file.name.toLowerCase().includes(query.toLowerCase()));
  return <LocalDialog title={imagesOnly ? 'Images' : 'File library'} onClose={onClose} className="d-local-files"><div className="d-local-actions"><button className="d-local-primary" onClick={() => picker.current?.click()}>Add files</button>{onProjectFiles && <button onClick={onProjectFiles}>Browse project files</button>}</div><input ref={picker} type="file" hidden multiple accept={imagesOnly ? 'image/*' : undefined} onChange={async event => { const incoming = [...(event.target.files || [])]; event.target.value = ''; try { for (const file of incoming) await saveLibraryFile(file); } catch (failure) { setError((failure as Error).message); } }}/><input aria-label="Search file library" placeholder="Search files" value={query} onChange={event => setQuery(event.target.value)}/><p>File tersimpan di perangkat ini. Teks dan gambar dikirim ke model hanya setelah Send; model harus mendukung input vision untuk gambar.</p><div className="d-library-grid">{filtered.map(file => <LibraryItem key={file.id} file={file} onAttach={() => { onAttach(new File([file.blob], file.name, { type: file.type })); onClose(); }} onDelete={() => void removeLibraryFile(file.id).catch(failure => setError(failure.message))}/>)}</div>{!filtered.length && <ClientEmpty title="Belum ada file yang sesuai."/>}{error && <ClientAlert className="d-local-error">{error}</ClientAlert>}</LocalDialog>;
}
function LibraryItem({ file, onAttach, onDelete }: { file: LibraryFile; onAttach: () => void; onDelete: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const value = URL.createObjectURL(file.blob); setUrl(value); return () => URL.revokeObjectURL(value); }, [file.blob]);
  return <section>{file.type.startsWith('image/') && <img src={url} alt={file.name}/>}<b>{file.name}</b><small>{Math.ceil(file.size / 1024)} KB</small><div><button onClick={onAttach}>Attach</button><a href={url} download={file.name}>Download</a><button onClick={onDelete}>Remove</button></div></section>;
}
