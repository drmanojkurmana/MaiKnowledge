// Password gate for /pitch/* (the StewardMD pitch deck).
//
// Uses a cookie + login form rather than HTTP Basic Auth on purpose: Cloudflare
// emits an HTTP 103 Early Hints response for this path, and Chrome throws
// ERR_TOO_MANY_RETRIES when a 103 is followed by a 401 auth challenge. A normal
// 200 login page avoids that entirely.
//
// Shared password (default "admin"). Override by setting PITCH_PASS in the Pages
// project env vars, then redeploy. The cookie stores an opaque token, not the
// password.
const COOKIE = 'pitch_auth';
const TOKEN = 'mk-pitch-granted-v1'; // opaque marker set only after a correct password

const loginPage = (error) => new Response(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pitch Deck | MaiKnowledge</title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sacramento&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:radial-gradient(125% 100% at 50% 0%,#ffffff 0%,#eef1f6 74%);
    font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',Helvetica,Arial,sans-serif;color:#1d1d1f}
  .card{width:min(92vw,380px);background:#fff;border:1px solid rgba(0,0,0,.1);border-radius:24px;
    padding:36px 32px;box-shadow:0 40px 90px -40px rgba(0,0,0,.25);text-align:center}
  .brand{display:inline-flex;align-items:baseline;margin-bottom:18px}
  .brand b{font-size:22px;font-weight:600;letter-spacing:-.02em}
  .brand i{font-family:'Sacramento',cursive;font-style:normal;font-size:30px;margin-left:-.5px;padding-right:7px;
    background:linear-gradient(105deg,#1e46e6,#0a1a6b);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
  h1{font-size:20px;font-weight:600;margin:0 0 6px}
  p{color:#6e6e73;font-size:14px;margin:0 0 22px}
  input{width:100%;padding:13px 15px;border:1px solid rgba(0,0,0,.15);border-radius:12px;font-size:16px;margin-bottom:12px}
  input:focus{outline:none;border-color:#0071e3}
  button{width:100%;padding:13px;border:none;border-radius:980px;background:#0071e3;color:#fff;font-size:16px;font-weight:600;cursor:pointer}
  button:hover{opacity:.9}
  .err{color:#c11;font-size:13px;margin:-4px 0 12px}
</style></head>
<body>
  <form class="card" method="POST" action="/pitch/">
    <div class="brand"><b>MaiK</b><i>nowledge</i></div>
    <h1>Pitch Deck</h1>
    <p>This deck is private. Enter the password to continue.</p>
    ${error ? '<div class="err">Incorrect password. Please try again.</div>' : ''}
    <input type="password" name="password" placeholder="Password" autofocus autocomplete="current-password" required>
    <button type="submit">View deck</button>
  </form>
</body></html>`, {
  status: 200, // never 401 on this path — a 103 Early Hints + 401 loops Chrome
  headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' },
});

export const onRequest = async (context) => {
  const { request, env, next } = context;
  const PASS = env.PITCH_PASS || 'admin';

  const cookies = request.headers.get('Cookie') || '';
  const authed = cookies.split(';').some((c) => c.trim() === `${COOKIE}=${TOKEN}`);
  if (authed) return next();

  if (request.method === 'POST') {
    let password = '';
    try { password = (await request.formData()).get('password') || ''; } catch (_) {}
    if (password === PASS) {
      return new Response(null, {
        status: 302,
        headers: {
          'Location': '/pitch/',
          'Set-Cookie': `${COOKIE}=${TOKEN}; Path=/pitch/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
          'Cache-Control': 'no-store',
        },
      });
    }
    return loginPage(true);
  }

  return loginPage(false);
};
