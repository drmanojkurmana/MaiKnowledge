// HTTP Basic Auth gate for /pitch/* (the StewardMD pitch deck).
// Server-enforced on Cloudflare Pages, so the deck and its assets are not
// reachable without the password. Shared demo credentials — username & password
// both "admin". To change, set env vars PITCH_USER / PITCH_PASS in the Pages
// project (they take precedence over the defaults below) and redeploy.
export const onRequest = async (context) => {
  const USER = context.env.PITCH_USER || 'admin';
  const PASS = context.env.PITCH_PASS || 'admin';

  const header = context.request.headers.get('Authorization') || '';
  if (header.startsWith('Basic ')) {
    let decoded = '';
    try { decoded = atob(header.slice(6)); } catch (_) { decoded = ''; }
    const i = decoded.indexOf(':');
    const u = i === -1 ? decoded : decoded.slice(0, i);
    const p = i === -1 ? '' : decoded.slice(i + 1);
    if (u === USER && p === PASS) return context.next();
  }

  return new Response('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="MaiKnowledge Pitch Deck", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  });
};
