// Renders the mockups from rsvp-email.ts with a sample party:
//   node --experimental-strip-types email/build.ts
import { writeFileSync } from "node:fs";
import { coupleEmail, esc, guestEmail, SITE, type Rsvp } from "./rsvp-email.ts";
import { buildInvitationEmail, pasteable } from "./invite-email.ts";

const base = {
  created_at: "2026-10-12T16:40:00Z",
  email: "priya.shah@gmail.com",
  guests: 1,
  dietary: null,
  note: "Meera has exams that week and is so sad to miss it.\nCan’t wait to see you both!",
  send_copy: true,
  party: "12",
  submission_id: "6f1c2a8e-3b7d-4e0a-9c55-2d8f1b7e4a90",
  submitted_by: "Priya Shah",
};

const party: Rsvp[] = [
  { ...base, id: "1", name: "Priya Shah", attending: true, events: ["welcome-party", "saatak-haldi", "baarat-wedding", "after-party"],
    phone: "(415) 555-0142", email_kept: true, phone_kept: false },
  { ...base, id: "2", name: "Rohan Shah", attending: true, events: ["baarat-wedding", "welcome-party"], dietary: "Vegetarian, allergic to tree nuts",
    email: "rohan.shah@gmail.com", phone: "(415) 555-0187", email_kept: true, phone_kept: true },
  { ...base, id: "3", name: "Meera Shah", attending: false, guests: 0, events: [], email: null },
  { ...base, id: "4", name: "Jane Doe", plus_one: true, attending: true, events: ["baarat-wedding", "after-party"],
    email: "jane.doe@gmail.com", phone: null },
];

const dir = new URL(".", import.meta.url);
const local = (html: string) => html.replaceAll(SITE + "email/", "");
for (const [file, mail] of [
  ["rsvp-confirmation", guestEmail(party)],
  ["rsvp-notification", coupleEmail(party)],
  ["invitation", buildInvitationEmail()],
] as const) {
  writeFileSync(new URL(file + ".html", dir), local(mail.html));
  writeFileSync(new URL(file + ".txt", dir), `Subject: ${mail.subject}\n\n${mail.text}\n`);
}

// A page to copy the invitation from and paste into Gmail compose.
const versions = { plain: pasteable(), merge: pasteable("Dear {{First Name}},") };
writeFileSync(new URL("invitation-gmail.html", dir), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invitation for Gmail</title>
<style>
body{margin:0;background:#f0f1f5;color:#2a2722;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
.how{max-width:640px;margin:0 auto;padding:28px 16px 20px;}
.how h1{margin:0 0 8px;font-size:18px;}
.how ol{margin:0 0 14px;padding-left:20px;}
.how code{font-size:13px;background:#e8e4dc;padding:1px 4px;border-radius:3px;}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
.bar button{font:inherit;padding:8px 14px;border:1px solid #2a2722;background:#fff;border-radius:6px;cursor:pointer;}
.bar button.on{background:#2a2722;color:#fff;}
.bar span{color:#6b665d;}
#mail{margin:0 0 48px;}
</style>
</head>
<body>
<div class="how">
<h1>Invitation, ready for Gmail</h1>
<ol>
<li>Pick a greeting, then click <b>Copy email</b> (or click into the email below, press Cmd+A, Cmd+C).</li>
<li>In Gmail, click Compose, add the subject <code>${esc(buildInvitationEmail().subject)}</code>, click into the body and press Cmd+V.</li>
<li>Send it to yourself first and check it on your phone.</li>
</ol>
<p>For one email per guest with their name, use the mail-merge greeting with an add-on like YAMM or GMass: paste it into a Gmail draft and they fill in <code>{{First Name}}</code> from your sheet. Both also accept <code>invitation.html</code> directly.</p>
<div class="bar">
<button type="button" data-v="plain" class="on">No greeting</button>
<button type="button" data-v="merge">“Dear {{First Name}},”</button>
<button type="button" id="copy">Copy email</button>
<span id="said" aria-live="polite"></span>
</div>
</div>
<div id="mail" contenteditable="true" spellcheck="false">${versions.plain}</div>
<script>
var versions = ${JSON.stringify(versions).replaceAll("<", "\\u003c")};
var mail = document.getElementById('mail'), said = document.getElementById('said'), pick = 'plain';
document.querySelectorAll('[data-v]').forEach(function(b){
  b.onclick = function(){
    pick = b.dataset.v; mail.innerHTML = versions[pick];
    document.querySelectorAll('[data-v]').forEach(function(x){ x.classList.toggle('on', x === b); });
    said.textContent = '';
  };
});
document.getElementById('copy').onclick = function(){
  var html = mail.innerHTML, text = mail.innerText;
  var done = function(){ said.textContent = 'Copied. Paste into Gmail compose.'; };
  var fallback = function(){
    var r = document.createRange(); r.selectNodeContents(mail);
    var s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.execCommand('copy'); s.removeAllRanges(); done();
  };
  if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
    navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([text], { type: 'text/plain' })
    })]).then(done, fallback);
  } else fallback();
};
</script>
</body>
</html>
`);
