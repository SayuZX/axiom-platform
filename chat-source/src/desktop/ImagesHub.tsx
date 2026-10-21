import { useEffect, useRef, useState } from 'react';
import { UIIcon as I } from '../components/UIIcon';
import { libraryFiles, removeLibraryFile, saveLibraryFile, type LibraryFile } from '../lib/fileLibrary';
import { ClientAlert, ClientEmpty } from '../components/SDKPrimitives';

export type StylePresetCategory = 'all' | 'photo' | 'anime' | '3d' | 'classic' | 'digital';

export type StylePreset = {
  id: string;
  name: string;
  category: StylePresetCategory;
  tag: string;
  badge: string;
  description: string;
  prompt: string;
  gradient: string;
  ratio: string;
  icon: string;
};

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'photographic',
    name: 'Photographic Realism',
    category: 'photo',
    tag: '35mm • Natural Light',
    badge: 'Realism',
    description: 'Hyper-detailed portrait or landscape with natural depth of field, authentic bokeh, and film texture.',
    prompt: 'Create a photorealistic 35mm film photograph with natural lighting, subtle lens flare, realistic depth of field, and rich lifelike textures of: ',
    gradient: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
    ratio: '16:9',
    icon: 'image'
  },
  {
    id: 'anime',
    name: 'Anime & Manga',
    category: 'anime',
    tag: 'Makoto Shinkai • Cel-Shaded',
    badge: 'Anime',
    description: 'Cinematic anime visual with luminous sky gradients, volumetric clouds, and crisp hand-drawn line art.',
    prompt: 'Create a stunning cinematic anime-style illustration in the style of Makoto Shinkai, featuring glowing sky, billowing clouds, delicate cel-shading, and emotional lighting of: ',
    gradient: 'linear-gradient(135deg, #be185d 0%, #f43f5e 100%)',
    ratio: '16:9',
    icon: 'sparkles'
  },
  {
    id: 'isometric-3d',
    name: '3D Isometric Render',
    category: '3d',
    tag: 'Octane • Soft Clay • Raytracing',
    badge: '3D / Clay',
    description: 'Smooth 3D miniature scene with tilt-shift depth, ambient occlusion shadows, and vivid clean surfaces.',
    prompt: 'Create a 3D isometric diorama render with Octane Render raytracing, soft diffuse clay lighting, miniature tilt-shift focus, and vibrant clean colors of: ',
    gradient: 'linear-gradient(135deg, #4338ca 0%, #6d28d9 100%)',
    ratio: '1:1',
    icon: 'cube'
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    category: 'digital',
    tag: 'High-Tech Noir • Volumetric Rain',
    badge: 'Sci-Fi',
    description: 'Rainy futuristic cityscape bathed in vibrant magenta and cyan neon glow, reflections, and holograms.',
    prompt: 'Create a high-tech cyberpunk noir scene with rain-slicked asphalt reflections, neon magenta and electric cyan lighting, atmospheric volumetric fog, and futuristic details of: ',
    gradient: 'linear-gradient(135deg, #09090b 0%, #3b0764 50%, #1e1b4b 100%)',
    ratio: '21:9',
    icon: 'lightning'
  },
  {
    id: 'watercolor',
    name: 'Fluid Watercolor',
    category: 'classic',
    tag: 'Wet-on-Wet • Raw Cotton Paper',
    badge: 'Traditional',
    description: 'Dreamy bleeding pigment washes on textured cotton paper with delicate splash blooms and ink outlines.',
    prompt: 'Create a delicate fluid watercolor painting with soft wet-on-wet color bleeding, authentic paper texture, gentle translucent washes, and subtle ink line work of: ',
    gradient: 'linear-gradient(135deg, #0f766e 0%, #059669 100%)',
    ratio: '4:3',
    icon: 'sketch'
  },
  {
    id: 'oil-impressionism',
    name: 'Impressionist Oil',
    category: 'classic',
    tag: 'Impasto • Canvas Texture • Monet',
    badge: 'Classic Art',
    description: 'Rich painterly impasto strokes with dramatic natural lighting, color vibration, and textured canvas weave.',
    prompt: 'Create an impressionist oil painting with thick expressive impasto brushstrokes, vibrant natural lighting, rich textural canvas feel, and evocative colors of: ',
    gradient: 'linear-gradient(135deg, #c2410c 0%, #d97706 100%)',
    ratio: '4:3',
    icon: 'book'
  },
  {
    id: 'pixel-art',
    name: '16-Bit Retro Pixel',
    category: 'digital',
    tag: 'SNES Retro • Dithered Shading',
    badge: 'Pixel Art',
    description: 'Nostalgic pixel-perfect retro game art with crisp palettes, dithered shading, and arcade charm.',
    prompt: 'Create a detailed 16-bit retro pixel art scene with a cohesive nostalgic color palette, crisp grid-aligned pixels, authentic CRT scanline feel, and charming sprites of: ',
    gradient: 'linear-gradient(135deg, #7c2d12 0%, #9a3412 100%)',
    ratio: '1:1',
    icon: 'grid'
  },
  {
    id: 'swiss-minimalist',
    name: 'Swiss Vector Minimalist',
    category: 'digital',
    tag: 'Bauhaus • Bold Geometry • Duotone',
    badge: 'Design',
    description: 'Bold geometric shapes, strict architectural grid composition, high contrast, and timeless graphic elegance.',
    prompt: 'Create a modern Swiss-style minimalist vector poster with bold geometric composition, clean negative space, duotone color accents, and elegant graphic balance of: ',
    gradient: 'linear-gradient(135deg, #0369a1 0%, #0e7490 100%)',
    ratio: '3:4',
    icon: 'panels'
  },
  {
    id: 'claymation',
    name: 'Claymation & Plasticine',
    category: '3d',
    tag: 'Stop-Motion • Handmade Thumbprints',
    badge: 'Stop-Motion',
    description: 'Charming stop-motion plasticine miniature with tactile fingerprint indentations and macro studio lighting.',
    prompt: 'Create a charming stop-motion claymation character and scene sculpted out of colorful modeling clay, with tactile fingerprint indentations, soft studio macro lighting, and handmade charm of: ',
    gradient: 'linear-gradient(135deg, #be123c 0%, #e11d48 100%)',
    ratio: '1:1',
    icon: 'cube'
  },
  {
    id: 'fantasy-concept',
    name: 'Epic Fantasy Concept',
    category: 'digital',
    tag: 'Matte Painting • Grand Scale',
    badge: 'Concept Art',
    description: 'Sprawling mythical landscapes, ancient ruins, atmospheric god rays, floating islands, and cinematic scale.',
    prompt: 'Create an epic fantasy concept art digital matte painting with ancient towering architecture, atmospheric god rays, drifting dust particles, and grand cinematic scale of: ',
    gradient: 'linear-gradient(135deg, #431407 0%, #78350f 100%)',
    ratio: '21:9',
    icon: 'cloud'
  }
];

export function ImagesHub({
  onDraft,
  onAttach,
  query = '',
  onUploadClick
}: {
  onDraft: (prompt: string) => void;
  onAttach?: (file: File) => void;
  query?: string;
  onUploadClick?: () => void;
}) {
  const [subTab, setSubTab] = useState<'all' | 'presets' | 'saved'>('all');
  const [category, setCategory] = useState<StylePresetCategory>('all');
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [error, setError] = useState('');
  const filePickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      libraryFiles()
        .then(items => {
          if (active) {
            setFiles(items.filter(f => f.type.startsWith('image/')).sort((a, b) => b.added - a.added));
          }
        })
        .catch(err => {
          if (active) setError(err.message);
        });
    };
    refresh();
    window.addEventListener('client-files-changed', refresh);
    return () => {
      active = false;
      window.removeEventListener('client-files-changed', refresh);
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredPresets = STYLE_PRESETS.filter(preset => {
    const matchesCategory = category === 'all' || preset.category === category;
    const matchesQuery =
      !normalizedQuery ||
      preset.name.toLowerCase().includes(normalizedQuery) ||
      preset.tag.toLowerCase().includes(normalizedQuery) ||
      preset.badge.toLowerCase().includes(normalizedQuery) ||
      preset.description.toLowerCase().includes(normalizedQuery);
    return matchesCategory && matchesQuery;
  });

  const filteredFiles = files.filter(file => {
    return !normalizedQuery || file.name.toLowerCase().includes(normalizedQuery);
  });

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files || []);
    event.target.value = '';
    if (!incoming.length) return;
    try {
      for (const file of incoming) {
        if (!file.type.startsWith('image/')) continue;
        await saveLibraryFile(file);
      }
    } catch (failure) {
      setError((failure as Error).message);
    }
  }

  function handleAttachFile(file: LibraryFile) {
    if (onAttach) {
      const nativeFile = new File([file.blob], file.name, { type: file.type });
      onAttach(nativeFile);
    } else {
      onDraft(`Analyze and describe this image: ${file.name}`);
    }
  }

  return (
    <div className="d-images-hub">
      <input
        ref={filePickerRef}
        type="file"
        multiple
        accept="image/*"
        hidden
        onChange={handleFileUpload}
      />

      <div className="d-images-hub-nav">
        <div className="d-images-tabs" role="tablist" aria-label="Images Hub View">
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'all'}
            className={subTab === 'all' ? 'd-active' : ''}
            onClick={() => setSubTab('all')}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'presets'}
            className={subTab === 'presets' ? 'd-active' : ''}
            onClick={() => setSubTab('presets')}
          >
            Style Presets <span className="d-tab-count">({STYLE_PRESETS.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'saved'}
            className={subTab === 'saved' ? 'd-active' : ''}
            onClick={() => setSubTab('saved')}
          >
            Saved Images <span className="d-tab-count">({files.length})</span>
          </button>
        </div>

        <div className="d-images-hub-actions">
          <button
            type="button"
            className="d-white d-upload-trigger"
            onClick={() => {
              if (onUploadClick) onUploadClick();
              else filePickerRef.current?.click();
            }}
          >
            <I name="plus" size={16} /> Upload Image
          </button>
        </div>
      </div>

      {error && <ClientAlert className="d-local-error">{error}</ClientAlert>}

      {(subTab === 'all' || subTab === 'presets') && (
        <section className="d-images-section">
          <div className="d-section-header">
            <div>
              <h2>Explore Visual Styles &amp; Prompt Templates</h2>
              <p className="d-section-subtitle">
                Pilih template prompt visual lokal untuk merangkai instruksi pembuatan gambar ke model chat Anda.
              </p>
            </div>
            <div className="d-category-filters" role="radiogroup" aria-label="Filter visual style categories">
              {(
                [
                  ['all', 'All'],
                  ['photo', 'Photographic'],
                  ['anime', 'Anime & Manga'],
                  ['3d', '3D & Clay'],
                  ['classic', 'Classic Art'],
                  ['digital', 'Digital & Vector']
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={category === id}
                  className={`d-filter-pill ${category === id ? 'd-active' : ''}`}
                  onClick={() => setCategory(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="d-style-presets-grid">
            {filteredPresets.map(preset => (
              <article key={preset.id} className="d-preset-card">
                <div className="d-preset-banner" style={{ background: preset.gradient }}>
                  <span className="d-preset-badge">{preset.badge}</span>
                  <span className="d-preset-ratio">{preset.ratio}</span>
                  <div className="d-preset-icon-circle">
                    <I name={preset.icon} size={22} />
                  </div>
                </div>
                <div className="d-preset-body">
                  <div className="d-preset-title-row">
                    <h3>{preset.name}</h3>
                    <small>{preset.tag}</small>
                  </div>
                  <p>{preset.description}</p>
                  <button
                    type="button"
                    className="d-preset-cta"
                    onClick={() => onDraft(preset.prompt)}
                  >
                    <I name="chat" size={16} /> Use Style in Chat
                  </button>
                </div>
              </article>
            ))}
          </div>

          {!filteredPresets.length && (
            <p className="d-local-empty">Tidak ada style preset yang sesuai dengan pencarian &quot;{query}&quot;.</p>
          )}
        </section>
      )}

      {(subTab === 'all' || subTab === 'saved') && (
        <section className="d-images-section">
          <div className="d-section-header">
            <div>
              <h2>Saved Device Images</h2>
              <p className="d-section-subtitle">
                Gambar yang disimpan secara lokal di perangkat Anda. Lampirkan langsung ke model vision.
              </p>
            </div>
            <span className="d-saved-count-pill">{filteredFiles.length} file</span>
          </div>

          {filteredFiles.length > 0 ? (
            <div className="d-gallery-grid">
              {filteredFiles.map(file => (
                <GalleryCard
                  key={file.id}
                  file={file}
                  onAttach={() => handleAttachFile(file)}
                  onDelete={() => {
                    removeLibraryFile(file.id).catch(err => setError(err.message));
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="d-images-empty-box">
              <ClientEmpty
                title={query ? 'Tidak ada gambar yang cocok dengan filter.' : 'Belum ada gambar tersimpan.'}
                description={
                  query
                    ? 'Coba ganti kata kunci pencarian.'
                    : 'Unggah gambar dari perangkat Anda untuk disimpan di memori browser lokal.'
                }
              />
              {!query && (
                <button
                  type="button"
                  className="d-white d-upload-box-btn"
                  onClick={() => filePickerRef.current?.click()}
                >
                  <I name="plus" size={16} /> Upload Gambar Pertama
                </button>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function GalleryCard({
  file,
  onAttach,
  onDelete
}: {
  file: LibraryFile;
  onAttach: () => void;
  onDelete: () => void;
}) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file.blob]);

  return (
    <article className="d-gallery-item-card">
      <div className="d-gallery-thumb-wrap">
        {url ? <img src={url} alt={file.name} loading="lazy" /> : <div className="d-gallery-placeholder" />}
        <div className="d-gallery-overlay">
          <button
            type="button"
            className="d-gallery-btn-attach"
            onClick={onAttach}
            title="Kirim ke Chat"
          >
            <I name="chat" size={16} /> Attach
          </button>
          <div className="d-gallery-btn-group">
            <a
              href={url}
              download={file.name}
              className="d-gallery-btn-icon"
              title="Download gambar"
            >
              <I name="download" size={16} />
            </a>
            <button
              type="button"
              className="d-gallery-btn-icon d-btn-danger"
              onClick={onDelete}
              title="Hapus gambar"
            >
              <I name="trash" size={16} />
            </button>
          </div>
        </div>
      </div>
      <div className="d-gallery-details">
        <strong className="d-gallery-title" title={file.name}>{file.name}</strong>
        <div className="d-gallery-meta-row">
          <span>{Math.ceil(file.size / 1024)} KB</span>
          <span>·</span>
          <span>{new Date(file.added).toLocaleDateString()}</span>
        </div>
      </div>
    </article>
  );
}
