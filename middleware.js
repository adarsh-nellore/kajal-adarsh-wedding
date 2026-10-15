// Vercel Routing Middleware: the site sits behind the password from the invitation.
// A correct password (the form, or ?pw= on the email's link) sets an HttpOnly cookie
// for a year. The save-the-date and the images the emails load stay public.
// The project's vercel.app address forwards to the domain.

const PASSWORD = '2027';
const COOKIE = 'ka_pass';
const YEAR = 60 * 60 * 24 * 365;

const PUBLIC = [/^\/savethedate(\/|$)/, /^\/email\/[^/]+\.(png|jpe?g|gif|webp)$/, /^\/favicon\.ico$/];

async function token(pw) {
  const bytes = new TextEncoder().encode('kajal-adarsh:' + pw);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function cookie(request, name) {
  const m = (request.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? m[1] : null;
}

const unlock = async (location) => new Response(null, {
  status: 303,
  headers: {
    location,
    'set-cookie': `${COOKIE}=${await token(PASSWORD)}; Path=/; Max-Age=${YEAR}; HttpOnly; Secure; SameSite=Lax`,
    'cache-control': 'no-store',
  },
});

// Only same-site paths, so the form can't be used to bounce people elsewhere.
const safe = (next) => (typeof next === 'string' && /^\/(?![/\\])/.test(next) ? next : '/');

export default async function middleware(request) {
  const url = new URL(request.url);
  if (url.hostname === 'kajal-adarsh-wedding.vercel.app') {
    return Response.redirect('https://kajal-adarsh.club' + url.pathname + url.search, 308);
  }
  if (PUBLIC.some((re) => re.test(url.pathname))) return;

  if (url.searchParams.has('pw')) {
    if (url.searchParams.get('pw') === PASSWORD) {
      url.searchParams.delete('pw');
      return unlock(url.pathname + url.search);
    }
    url.searchParams.delete('pw');
    return page(url.pathname + url.search, true);
  }

  if (request.method === 'POST' && url.searchParams.has('unlock')) {
    const form = await request.formData().catch(() => null);
    const next = safe(String(form?.get('next') || '/'));
    if (form?.get('password') === PASSWORD) return unlock(next);
    return page(next, true);
  }

  if (cookie(request, COOKIE) === (await token(PASSWORD))) return;

  return page(url.pathname + url.search, false);
}

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function page(next, wrong) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#121212">
<meta name="robots" content="noindex">
<title>Kajal &amp; Adarsh</title>
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
label{font-size:17px;}
input{font:inherit;font-size:18px;text-align:center;color:#EAE3D6;background:transparent;border:1px solid rgba(205,164,94,.5);padding:12px 14px;border-radius:2px;outline:none;}
input:focus{border-color:#CDA45E;}
button{font:inherit;font-size:18px;color:#121212;background:#CDA45E;border:0;padding:12px 14px;border-radius:2px;cursor:pointer;}
button:hover{background:#d8b273;}
p{margin:4px 0 0;font-size:16px;color:rgba(234,227,214,.7);min-height:1.4em;}
</style>
</head>
<body>
<main>
<h1>Kajal &amp; Adarsh</h1>
<form method="post" action="/?unlock">
<input type="hidden" name="next" value="${esc(next)}">
<label for="password">Password</label>
<input id="password" name="password" type="password" inputmode="numeric" autocomplete="current-password" autofocus required>
<button type="submit">Enter</button>
<p role="status">${wrong ? 'That isn’t it. Please try again.' : ''}</p>
</form>
</main>
<script>
if (location.hash) document.querySelector('[name=next]').value += location.hash;
</script>
</body>
</html>`;
  return new Response(html, {
    status: 401,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
