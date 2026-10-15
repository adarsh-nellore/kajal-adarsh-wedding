// Vercel Routing Middleware: everything on the admin site sits behind ADMIN_PASSWORD.
// The password form posts to /?login; a right answer sets the signed session cookie
// (lib/session.js). /?logout clears it. The API checks the cookie again itself.

import { authed, clearCookie, passwordOk, sessionCookie } from './lib/session.js';

const headers = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' };

export default async function middleware(request) {
  const url = new URL(request.url);
  if (url.pathname === '/robots.txt') return;

  if (url.searchParams.has('logout')) {
    return new Response(null, { status: 303, headers: { ...headers, location: '/', 'set-cookie': clearCookie } });
  }

  if (request.method === 'POST' && url.searchParams.has('login')) {
    const form = await request.formData().catch(() => null);
    if (passwordOk(String(form?.get('password') || ''))) {
      return new Response(null, { status: 303, headers: { ...headers, location: '/', 'set-cookie': await sessionCookie() } });
    }
    await new Promise((r) => setTimeout(r, 800));
    return page(true);
  }

  if (await authed(request)) return;

  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'signed out' }), { status: 401, headers: { ...headers, 'content-type': 'application/json' } });
  }
  return page(false);
}

function page(wrong) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#121212">
<meta name="robots" content="noindex, nofollow">
<title>Guest list — Kajal &amp; Adarsh</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Jaini&family=EB+Garamond:wght@400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;}
html,body{margin:0;height:100%;}
body{background:#121212;color:#EAE3D6;font-family:'EB Garamond',Georgia,serif;display:flex;align-items:center;justify-content:center;padding:24px;}
main{width:100%;max-width:320px;text-align:center;}
h1{font-family:'Jaini',serif;font-weight:400;font-size:44px;line-height:1.1;color:#CDA45E;margin:0 0 32px;}
form{display:flex;flex-direction:column;gap:12px;}
input::placeholder{color:rgba(234,227,214,.45);opacity:1;}
input{font:inherit;font-size:18px;text-align:center;color:#EAE3D6;background:transparent;border:1px solid rgba(205,164,94,.5);padding:12px 14px;border-radius:2px;outline:none;}
input:focus{border-color:#CDA45E;}
button{font:inherit;font-size:18px;color:#121212;background:#CDA45E;border:0;padding:12px 14px;border-radius:2px;cursor:pointer;}
button:hover{background:#d8b273;}
p{margin:4px 0 0;font-size:16px;color:rgba(234,227,214,.7);min-height:1.4em;}
</style>
</head>
<body>
<main>
<h1>Guest list</h1>
<form method="post" action="/?login">
<input id="password" name="password" type="password" placeholder="Password" aria-label="Password" autocapitalize="off" autocomplete="current-password" autofocus required>
<button type="submit">Enter</button>
<p role="status">${wrong ? 'That isn’t it. Please try again.' : ''}</p>
</form>
</main>
</body>
</html>`;
  return new Response(html, { status: 401, headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } });
}
