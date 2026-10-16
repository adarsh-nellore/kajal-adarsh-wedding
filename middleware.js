// Vercel Routing Middleware: the site sits behind the password from the invitation.
// A correct password (the form, or ?pw= on the email's link) sets an HttpOnly cookie
// for a year. The save-the-date and the images the emails load stay public.
// The project's vercel.app address forwards to the domain.

const PASSWORD = 'churro';
// Cookie is sealed with a fixed string (not the live password), so guests who
// already unlocked keep access when the password changes.
const SEAL = '2027';
const ok = (pw) => String(pw ?? '').trim().toLowerCase() === PASSWORD;
const COOKIE = 'ka_pass';
const YEAR = 60 * 60 * 24 * 365;

const PUBLIC = [/^\/savethedate(\/|$)/, /^\/email\/[^/]+\.(png|jpe?g|gif|webp)$/, /^\/img\/og\.jpe?g$/, /^\/favicon\.ico$/];

// HTTPS stubs for the email footer's phone links — Gmail strips sms: hrefs, so the
// mail points here and this page opens Messages (with a tappable fallback).
const TEXT = {
  '/text/kajal': { sms: 'sms:+19492931051', who: 'Kajal', display: '949-293-1051' },
  '/text/adarsh': { sms: 'sms:+14087521100', who: 'Adarsh', display: '408-752-1100' },
};

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
    'set-cookie': `${COOKIE}=${await token(SEAL)}; Path=/; Max-Age=${YEAR}; HttpOnly; Secure; SameSite=Lax`,
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
  const text = TEXT[url.pathname.replace(/\/$/, '') || '/'];
  if (text) return textPage(text);
  if (PUBLIC.some((re) => re.test(url.pathname))) return;

  if (url.searchParams.has('pw')) {
    if (ok(url.searchParams.get('pw'))) {
      url.searchParams.delete('pw');
      return unlock(url.pathname + url.search);
    }
    url.searchParams.delete('pw');
    return page(url.pathname + url.search, true);
  }

  if (request.method === 'POST' && url.searchParams.has('unlock')) {
    const form = await request.formData().catch(() => null);
    const next = safe(String(form?.get('next') || '/'));
    if (ok(form?.get('password'))) return unlock(next);
    return page(next, true);
  }

  if (cookie(request, COOKIE) === (await token(SEAL))) return;

  return page(url.pathname + url.search, false);
}

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function textPage(t) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0;url=${esc(t.sms)}">
<title>Text ${esc(t.who)}</title>
<script>location.replace(${JSON.stringify(t.sms)})</script>
</head>
<body style="margin:0;background:#121212;color:#EAE3D6;font:18px/1.5 Georgia,serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;text-align:center;">
<p style="margin:0;">Opening Messages…<br><a href="${esc(t.sms)}" style="color:#CDA45E;">Text ${esc(t.who)} · ${esc(t.display)}</a></p>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=86400' },
  });
}

function page(next, wrong) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#121212">
<meta name="robots" content="noindex">
<title>Kajal &amp; Adarsh</title>
<meta property="og:title" content="Kajal &amp; Adarsh">
<meta property="og:description" content="Mexico City · February 19–21, 2027">
<meta property="og:image" content="https://kajal-adarsh.club/img/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="1200">
<meta name="twitter:card" content="summary">
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
<h1>Kajal &amp; Adarsh</h1>
<form method="post" action="/?unlock">
<input type="hidden" name="next" value="${esc(next)}">
<input id="password" name="password" type="password" placeholder="Password" aria-label="Password" autocapitalize="none" autocomplete="current-password" autofocus required>
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
