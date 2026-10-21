import { getNativeTheme } from '../../../lib/native-theme.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { file } = await params;
  const theme = await getNativeTheme();
  const headers = { 'Content-Type': 'text/css; charset=utf-8', 'X-Content-Type-Options': 'nosniff' };
  if (file !== `${theme.version}.css`) return new Response('/* Unknown theme version */', { status: 404, headers: { ...headers, 'Cache-Control': 'no-store' } });
  return new Response(theme.css, { headers: { ...headers, 'Cache-Control': 'public, max-age=31536000, immutable' } });
}
