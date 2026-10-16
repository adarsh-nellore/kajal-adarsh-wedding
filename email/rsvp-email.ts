// RSVP emails in the invitation's look: the guest's copy and the note to Kajal and Adarsh.
// Imported by supabase/functions/notify-wedding-rsvp: pass the party's rows, the
// submitter first, and send the returned { subject, html, text } through Resend.
// Built with tables and inline styles so Gmail, Apple Mail and Outlook agree.

export type Rsvp = {
  id: string;
  created_at: string;
  name: string;
  email: string | null;
  attending: boolean;
  guests: number | null;
  events: string[];
  dietary: string | null;
  note: string | null;
  send_copy: boolean;
  party: string | null;
  submission_id: string | null;
  submitted_by: string | null;
  phone?: string | null;
  email_kept?: boolean;
  phone_kept?: boolean;
  plus_one?: boolean;
};

export const SITE = "https://kajal-adarsh.club/";
// The site is behind this password; links carrying it skip the prompt.
export const PASSWORD = "churro";
export const ENTER = SITE + "?pw=" + PASSWORD;
export const PHOTO = SITE + "email/photo-v2.png";
export const NAMES = SITE + "email/names-light.png";
const TZ = "America/Chicago";

export const EVENTS: Record<string, string> = {
  "welcome-party": "Welcome Party · Friday 19th",
  "saatak-haldi": "Ganesh Pooja, Grah Shanti & Haldi · Saturday 20th",
  "baarat-wedding": "Baarat & Wedding · Sunday 21st",
  "after-party": "After Party · Sunday 21st",
};

export const CARD = "#d4b481";
export const INK = "#141414";
export const BUTTON = "#bf9c74";
export const BUTTON_INK = "#323232";
export const LINK = "#222222";

export const BACKDROP = "#e9dbc0";

// The design stays light in dark mode: Apple Mail honours "light only", Outlook gets its
// data-ogsc/ogsb hooks pointed back at these colours, and for Gmail's forced inversion the
// off-black ink and the haloed wordmark keep everything legible.
export const FONT = "'EB Garamond',Georgia,'Times New Roman',serif";

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
  ));
}

const lines = (s: string) => esc(s.trim()).replace(/\r?\n/g, "<br>");

function eventsOf(g: Rsvp): string[] {
  const order = Object.keys(EVENTS);
  return [...(g.events || [])]
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map((e) => EVENTS[e] || e);
}

// The column's pieces. Each size carries a class so phones get one step smaller.
const SIZES = { s: ["fs-s", 15, 1.7], m: ["fs-m", 16, 1.5], l: ["fs-l", 18, 1.4] } as const;

export function text(html: string, o: { size?: keyof typeof SIZES; weight?: number; top?: number; bottom?: number } = {}): string {
  const [cls, size, lh] = SIZES[o.size ?? "m"];
  return `
        <tr>
          <td class="${cls} ink side" align="center" style="padding:${o.top ?? 0}px 32px ${o.bottom ?? 16}px;font-family:${FONT};font-size:${size}px;line-height:${lh};${o.weight ? `font-weight:${o.weight};` : ""}color:${INK};text-align:center;">${html}</td>
        </tr>`;
}

/** Hairline with the same space above and below (pass the gap once). */
export const rule = (gap = 16) => `
        <tr>
          <td class="side" style="padding:${gap}px 32px ${gap}px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="rule" height="1" style="height:1px;line-height:1px;font-size:0;background-color:${INK};">&nbsp;</td></tr></table>
          </td>
        </tr>`;

export const link = (href: string, label: string, color = INK) =>
  `<a href="${esc(href)}" class="ink" style="color:${color};text-decoration:underline;">${esc(label)}</a>`;

// href is optional. A linked hero image reads as a marketing banner; the invitation
// shows the photo without that extra link and keeps the RSVP button as the action.
export const photo = (href?: string) => {
  const img = `<img src="${PHOTO}" width="560" alt="Kajal and Adarsh walking hand in hand up a green hill" style="display:block;width:560px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">`;
  const inner = href
    ? `<a href="${esc(href)}" style="display:block;text-decoration:none;border:0;outline:none;">${img}</a>`
    : img;
  return `
        <tr>
          <td class="photo" align="center" style="padding:0 40px;">
            ${inner}
          </td>
        </tr>`;
};

export const names = () => `
        <tr>
          <td class="side" align="center" style="padding:4px 32px 14px;">
            <img src="${NAMES}" width="300" alt="Kajal y Adarsh" style="display:block;width:300px;max-width:100%;height:auto;border:0;outline:none;font-family:${FONT};font-size:28px;line-height:34px;color:#555555;">          </td>
        </tr>`;

export const dates = () =>
  text(`<span style="font-weight:700;">February 19–21, 2027</span><br>Mexico City, Mexico`, { size: "l", bottom: 0 });

// The design's button: beige fill, thin black rule, square corners.
export const button = (href: string, label: string, width?: number) => `
        <tr>
          <td class="side" align="center" style="padding:4px 32px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
              <tr>
                <td class="btn-bg" bgcolor="${BUTTON}"${width ? ` width="${width}"` : ""} style="${width ? `width:${width}px;` : ""}background-color:${BUTTON};border:1px solid ${INK};">
                  <a href="${esc(href)}" class="btn" style="display:block;padding:7px ${width ? 8 : 22}px;text-align:center;font-family:${FONT};font-size:20px;line-height:28px;color:${BUTTON_INK};text-decoration:none;">${esc(label)}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;

export const signoff = () => text("With love,<br>Kajal &amp; Adarsh", { bottom: 0 });

// HTTPS stubs (not sms:) — Gmail strips custom schemes and leaves the numbers unlinked.
export const TEXT_KAJAL = SITE + "text/kajal";
export const TEXT_ADARSH = SITE + "text/adarsh";

/* gap above comes from the preceding rule — keep phones snug under the Questions line */
export const QUESTIONS =
  text("Questions? Message us anytime.", { size: "s", top: 0, bottom: 8 }) +
  text(`Kajal · ${link(TEXT_KAJAL, "949-293-1051", LINK)}<br>Adarsh · ${link(TEXT_ADARSH, "408-752-1100", LINK)}`, { size: "s", bottom: 0 });

export const QUESTIONS_TEXT = [
  "Questions? Message us anytime.",
  `Kajal · 949-293-1051 · ${TEXT_KAJAL}`,
  `Adarsh · 408-752-1100 · ${TEXT_ADARSH}`,
];

// A lighter tan from edge to edge, with the rows on a centred 640px tan card.
export function card(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BACKDROP}" class="backdrop" style="width:100%;background-color:${BACKDROP};border-collapse:collapse;">
  <tr>
    <td class="shell" align="center" style="padding:32px 16px;">
      <!--[if mso]><table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
      <table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CARD}" class="card" style="width:100%;max-width:640px;margin:0 auto;background-color:${CARD};border-collapse:collapse;">
        <tr>
          <td class="inner" style="padding:28px 0 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">${rows}
            </table>
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>`;
}

export function page(o: { title: string; preheader: string; rows: string }): string {
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${esc(o.title)}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>td,div,a,span{font-family:Georgia,serif !important;}</style>
<![endif]-->
<!-- No remote webfont fetch — third-party CSS can look like tracking to inbox filters. -->
<style>
:root{color-scheme:light only;supported-color-schemes:light;}
body{margin:0;padding:0;width:100% !important;background-color:${BACKDROP};-webkit-text-size-adjust:100%;text-size-adjust:100%;}
a[x-apple-data-detectors]{color:inherit !important;text-decoration:inherit !important;}
a img,a:focus,a:active{outline:none !important;}
@media (max-width:620px){
  .shell{padding:0 !important;}
  .inner{padding:20px 0 14px !important;}
  .side{padding-left:20px !important;padding-right:20px !important;}
  .photo{padding:4px 20px 22px !important;}
  .fs-s{font-size:14px !important;}
  .fs-m{font-size:15px !important;}
  .fs-l{font-size:17px !important;}
  .btn{font-size:19px !important;line-height:26px !important;}
}
[data-ogsb] body,[data-ogsb] .backdrop{background-color:${BACKDROP} !important;}
[data-ogsb] .card{background-color:${CARD} !important;}
[data-ogsc] .ink{color:${INK} !important;}
[data-ogsb] .rule{background-color:${INK} !important;}
[data-ogsb] .btn-bg{background-color:${BUTTON} !important;border-color:${INK} !important;}
[data-ogsc] .btn{color:${BUTTON_INK} !important;}
</style>
</head>
<body style="margin:0;padding:0;background-color:${BACKDROP};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BACKDROP};">${esc(o.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
${card(o.rows)}
</body>
</html>`;
}

// A guest's email and phone for the couple: "confirmed" matches the guest list,
// "new" doesn't (so isn't in the sheet yet). The database sets the *_kept flags.
function contactOf(g: Rsvp) {
  return ([[g.email, g.email_kept, "mailto:"], [g.phone, g.phone_kept, "tel:"]] as const)
    .filter(([v]) => v)
    .map(([v, kept, scheme]) => ({ v: v!, mark: kept ? "confirmed" : "new", href: scheme + (scheme === "tel:" ? v!.replace(/[^\d+]/g, "") : v) }));
}

// A plus one left unnamed is saved as "Guest of <replier>".
const who = (g: Rsvp) =>
  !g.plus_one ? g.name : g.name === `Guest of ${g.submitted_by}` ? "Plus one" : `Plus one: ${g.name}`;

function guestBlock(g: Rsvp, contact = false): string {
  const parts = [`<span style="font-weight:700;">${esc(who(g))}</span>`, g.attending ? "Joyfully accepts" : "Regretfully declines"];
  if (g.attending) {
    parts.push(...eventsOf(g).map((e) => esc(e).replace(/ · (.+)$/, ' · <span style="white-space:nowrap;">$1</span>')));
    if (g.dietary?.trim()) parts.push(`Allergies and/or dietary preferences: ${lines(g.dietary)}`);
  }
  if (contact) parts.push(...contactOf(g).map((c) => `${link(c.href, c.v, LINK)} (${c.mark})`));
  return text(parts.join("<br>"), { bottom: 20 });
}

function note(rs: Rsvp[]): string {
  const n = rs[0].note?.trim();
  return n ? text(`<span style="font-weight:700;">A note to us</span><br>${lines(n)}`, { bottom: 20 }) : "";
}

const plain = (rs: Rsvp[], contact = false) => [
  ...rs.flatMap((g) => [
    ...(g.attending
      ? [who(g), "Joyfully accepts", ...eventsOf(g).map((e) => `  ${e}`),
        ...(g.dietary?.trim() ? [`  Allergies and/or dietary preferences: ${g.dietary.trim()}`] : [])]
      : [who(g), "Regretfully declines"]),
    ...(contact ? contactOf(g).map((c) => `  ${c.v} (${c.mark})`) : []),
    "",
  ]),
  ...(rs[0].note?.trim() ? ["A note to us", rs[0].note.trim(), ""] : []),
];

// The copy for the guest who asked for one.
export function guestEmail(rs: Rsvp[]) {
  const by = rs[0].submitted_by || rs[0].name;
  const going = rs.some((g) => g.attending);
  const line = going
    ? "Your reply is in."
    : "We’ll miss you, and we’ll be thinking of you from Mexico City.";
  // Photo is not linked — a linked hero reads as a marketing banner in Gmail.
  const rows =
    text(`Thank you, ${esc(by)}.`, { size: "l", weight: 600, top: 4, bottom: 0 }) +
    rule() + photo() + rule() + names() + dates() + rule() +
    text(esc(line), { bottom: 20 }) +
    rs.map((g) => guestBlock(g)).join("") + note(rs) +
    button(ENTER + "#rsvp", "Change your reply") +
    rule() + QUESTIONS;
  return {
    subject: "Your RSVP for Kajal & Adarsh’s wedding",
    html: page({ title: "Kajal y Adarsh", preheader: line, rows }),
    text: [
      `Thank you, ${by}.`,
      "",
      "Kajal y Adarsh",
      "February 19–21, 2027",
      "Mexico City, Mexico",
      "",
      line,
      "",
      ...plain(rs),
      `Change your reply: ${ENTER}#rsvp`,
      "",
      ...QUESTIONS_TEXT,
    ].join("\n"),
  };
}

// The note to Kajal and Adarsh. Sent with reply_to set to the guest.
export function coupleEmail(rs: Rsvp[]) {
  const r = rs[0];
  const by = r.submitted_by || r.name;
  const coming = rs.filter((g) => g.attending).length;
  const when = new Date(r.created_at).toLocaleString("en-US", {
    timeZone: TZ, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
  }).replace(/, (\d+:\d+)/, " at $1");
  const tally = rs.length > 1 ? `${coming} of ${rs.length} coming` : (coming ? "Coming" : "Not coming");
  const fresh = rs.some((g) => contactOf(g).some((c) => c.mark === "new")) ? "Anything marked new isn’t in the sheet yet" : "";
  const rows =
    text(`${esc(by)} replied.`, { size: "l", weight: 600, top: 4, bottom: 0 }) +
    rule() + names() +
    text(`<span style="font-weight:700;">${esc(tally)}${r.party ? ` · Party ${esc(r.party)}` : ""}</span><br>${esc(when)}${fresh ? `<br>${fresh}` : ""}`, { size: "s", bottom: 0 }) +
    rule() +
    rs.map((g) => guestBlock(g, true)).join("") + note(rs) +
    rule();
  return {
    subject: r.submission_id
      ? `RSVP: ${by}${r.party ? ` (party ${r.party})` : ""}, ${coming} of ${rs.length} coming`
      : `RSVP: ${r.name} ${r.attending ? "accepts" : "declines"}`,
    html: page({ title: `RSVP: ${by}`, preheader: `${tally}. ${rs.map(who).join(", ")}`, rows }),
    text: [`${by} replied.`, `${tally}${r.party ? ` · Party ${r.party}` : ""}`, when, ...(fresh ? [fresh] : []), "", ...plain(rs, true)].join("\n"),
  };
}
