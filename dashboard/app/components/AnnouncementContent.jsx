import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './announcement-content.css';

export default function AnnouncementContent({ content }) {
  return <div className="announcement-content"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ h1: ({ children }) => <h2>{children}</h2>, img: ({ alt }) => <span>{alt}</span>, table: ({ children }) => <div className="announcement-table" tabIndex={0} role="region" aria-label="Tabel pengumuman"><table>{children}</table></div> }}>{content}</ReactMarkdown></div>;
}
