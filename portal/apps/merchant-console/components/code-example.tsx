'use client';

import { useState } from 'react';

export default function CodeExample({ title, code }: { title: string; code: string }) {
  const [message, setMessage] = useState('');

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setMessage('Disalin');
    } catch {
      setMessage('Pilih teks kode lalu salin secara manual.');
    }
  }

  return (
    <div className="api-code">
      <div className="api-code-heading">
        <span>{title}</span>
        <button type="button" onClick={copy} aria-label={`Salin ${title}`}>
          Salin
        </button>
      </div>
      <pre tabIndex={0}>
        <code>{code}</code>
      </pre>
      <span className="api-copy-status" role="status">
        {message}
      </span>
    </div>
  );
}
