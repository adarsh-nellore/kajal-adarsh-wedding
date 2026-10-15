// RSVP emails in the invitation's look: the guest's copy and the note to Kajal and Adarsh.
// Imported by supabase/functions/notify-wedding-rsvp: pass the party's rows, the
// submitter first, and send the returned { subject, html, text } through Resend.
// Built with tables and inline styles so Gmail, Apple Mail and Outlook agree.

export type Rsvp = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  attending: boolean;
  guests: number | null;
  events: string[];
  dietary: string | null;
  note: string | null;
  send_copy: boolean;
  party: string | null;
  submission_id: string | null;
  submitted_by: string | null;
};

export const SITE = "https://adarsh-nellore.github.io/kajal-adarsh-wedding/";
export const PHOTO = SITE + "email/photo.png";
export const NAMES = SITE + "email/names.png";
const TZ = "America/Chicago";

export const EVENTS: Record<string, string> = {
  "welcome-party": "Welcome Party · Friday 19th",
  "saatak-haldi": "Ganesh Pooja, Grah Shanti & Haldi · Saturday 20th",
  "baarat-wedding": "Baarat & Wedding · Sunday 21st",
  "after-party": "After Party · Sunday 21st",
};

export const GROUND = "#f0f1f5";
export const CARD = "#d4b481";
export const INK = "#000000";
export const BUTTON = "#bf9c74";
export const BUTTON_INK = "#323232";
export const LINK = "#222222";
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

// The card's pieces. Font sizes carry a class so phones get the design's smaller step.
const SIZES = { 17.3: ["fs-173", 1.7], 18.7: ["fs-187", 1.4], 21.3: ["fs-213", 1.4] } as const;

export function text(html: string, o: { size?: 17.3 | 18.7 | 21.3; weight?: number; top?: number; bottom?: number } = {}): string {
  const size = o.size ?? 18.7;
  const [cls, lh] = SIZES[size];
  return `
        <tr>
          <td class="${cls}" align="center" style="padding:${o.top ?? 0}px 24px ${o.bottom ?? 16}px;font-family:${FONT};font-size:${size}px;line-height:${lh};${o.weight ? `font-weight:${o.weight};` : ""}color:${INK};text-align:center;">${html}</td>
        </tr>`;
}

export const rule = (bottom = 16) => `
        <tr>
          <td style="padding:0 24px ${bottom}px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" style="height:1px;line-height:1px;font-size:0;background-color:${INK};">&nbsp;</td></tr></table>
          </td>
        </tr>`;

export const link = (href: string, label: string, color = INK) =>
  `<a href="${esc(href)}" style="color:${color};text-decoration:underline;">${esc(label)}</a>`;

export const photo = (href: string) => `
        <tr>
          <td class="photo" align="center" style="padding:20px 36px 28px;">
            <a href="${esc(href)}" style="display:block;text-decoration:none;border:0;"><img src="${PHOTO}" width="528" alt="Kajal and Adarsh walking hand in hand up a green hill" style="display:block;width:528px;max-width:100%;height:auto;border:0;outline:none;"></a>
          </td>
        </tr>`;

export const names = () => `
        <tr>
          <td align="center" style="padding:0 24px 16px;">
            <img src="${NAMES}" width="454" alt="Kajal y Adarsh" style="display:block;width:454px;max-width:100%;height:auto;border:0;outline:none;font-family:${FONT};font-size:40px;line-height:48px;color:#555555;">
          </td>
        </tr>`;

export const dates = () =>
  text(`<span style="font-weight:700;">February 19–21, 2027</span><br>Mexico City, Mexico`, { size: 21.3 });

// The design's button: beige fill, thin black rule, square corners.
export const button = (href: string, label: string, width?: number) => `
        <tr>
          <td align="center" style="padding:0 24px 16px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
              <tr>
                <td bgcolor="${BUTTON}"${width ? ` width="${width}"` : ""} style="${width ? `width:${width}px;` : ""}background-color:${BUTTON};border:1px solid ${INK};">
                  <a href="${esc(href)}" class="btn" style="display:block;padding:9px ${width ? 8 : 24}px;text-align:center;font-family:${FONT};font-size:26.5px;line-height:37px;color:${BUTTON_INK};text-decoration:none;">${esc(label)}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;

export const signoff = () => text("With love,<br>Kajal &amp; Adarsh");

export const QUESTIONS = rule() +
  text("Questions? Reach out to us anytime.", { size: 17.3 }) +
  text(`Kajal · ${link("tel:+19492931051", "949-293-1051", LINK)}<br>Adarsh · ${link("tel:+14087521100", "408-752-1100", LINK)}`, { size: 17.3 }) +
  rule(24);

export const QUESTIONS_TEXT = ["Questions? Reach out to us anytime.", "Kajal · 949-293-1051", "Adarsh · 408-752-1100"];

// The 600px tan card holding the rows; on phones it fills the screen.
export function card(rows: string, inline = false): string {
  return `<table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${CARD}" class="card" style="${inline ? "width:100%;" : "width:600px;"}max-width:600px;margin:0 auto;background-color:${CARD};border-collapse:collapse;">${rows}
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
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(o.title)}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>td,div,a,span{font-family:Georgia,serif !important;}</style>
<![endif]-->
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;600;700&display=swap" rel="stylesheet">
<style>
:root{color-scheme:light;supported-color-schemes:light;}
body{margin:0;padding:0;width:100% !important;background-color:${GROUND};-webkit-text-size-adjust:100%;text-size-adjust:100%;}
a[x-apple-data-detectors]{color:inherit !important;text-decoration:inherit !important;}
@media (max-width:620px){
  .shell{padding:0 !important;}
  .card{width:100% !important;}
  .photo{padding:16px 20px 24px !important;}
}
@media (max-width:550px){
  .fs-173{font-size:16.7px !important;}
  .fs-187{font-size:17.4px !important;}
  .fs-213{font-size:18.7px !important;}
  .btn{font-size:24px !important;line-height:34px !important;}
}
</style>
</head>
<body style="margin:0;padding:0;background-color:${GROUND};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${GROUND};">${esc(o.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${GROUND}" style="background-color:${GROUND};">
  <tr>
    <td class="shell" align="center" style="padding:32px 0;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
      ${card(o.rows)}
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;
}

function guestBlock(g: Rsvp): string {
  const parts = [`<span style="font-weight:700;">${esc(g.name)}</span>`, g.attending ? "Joyfully accepts" : "Regretfully declines"];
  if (g.attending) {
    parts.push(...eventsOf(g).map((e) => esc(e).replace(/ · (.+)$/, ' · <span style="white-space:nowrap;">$1</span>')));
    if (g.dietary?.trim()) parts.push(`Dietary restrictions or allergies: ${lines(g.dietary)}`);
  }
  return text(parts.join("<br>"), { bottom: 20 });
}

function note(rs: Rsvp[]): string {
  const n = rs[0].note?.trim();
  return n ? text(`<span style="font-weight:700;">A note to us</span><br>${lines(n)}`, { bottom: 20 }) : "";
}

const plain = (rs: Rsvp[]) => [
  ...rs.flatMap((g) => g.attending
    ? [g.name, "Joyfully accepts", ...eventsOf(g).map((e) => `  ${e}`),
      ...(g.dietary?.trim() ? [`  Dietary restrictions or allergies: ${g.dietary.trim()}`] : []), ""]
    : [g.name, "Regretfully declines", ""]),
  ...(rs[0].note?.trim() ? ["A note to us", rs[0].note.trim(), ""] : []),
];

// The copy for the guest who asked for one.
export function guestEmail(rs: Rsvp[]) {
  const by = rs[0].submitted_by || rs[0].name;
  const going = rs.some((g) => g.attending);
  const line = going
    ? "Your reply is in. We can’t wait to celebrate with you in Mexico City."
    : "We’ll miss you, and we’ll be thinking of you from Mexico City.";
  const rows =
    text(`Thank you, ${esc(by)}.`, { weight: 600, top: 24 }) +
    rule() + photo(SITE) + rule() + names() + dates() + rule(20) +
    text(esc(line), { bottom: 20 }) +
    rs.map(guestBlock).join("") + note(rs) +
    button(SITE + "#rsvp", "Change your reply") +
    signoff() + QUESTIONS;
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
      `Change your reply: ${SITE}#rsvp`,
      "",
      "With love,",
      "Kajal & Adarsh",
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
  const rows =
    text(`${esc(by)} replied.`, { weight: 600, top: 24 }) +
    rule() + names() +
    text(`<span style="font-weight:700;">${esc(tally)}${r.party ? ` · Party ${esc(r.party)}` : ""}</span><br>${link("mailto:" + r.email, r.email, LINK)}<br>${esc(when)}`, { size: 17.3 }) +
    rule(20) +
    rs.map(guestBlock).join("") + note(rs) +
    rule(24);
  return {
    subject: r.submission_id
      ? `RSVP: ${by}${r.party ? ` (party ${r.party})` : ""}, ${coming} of ${rs.length} coming`
      : `RSVP: ${r.name} ${r.attending ? "accepts" : "declines"}`,
    html: page({ title: `RSVP: ${by}`, preheader: `${tally}. ${rs.map((g) => g.name).join(", ")}`, rows }),
    text: [`${by} replied.`, `${tally}${r.party ? ` · Party ${r.party}` : ""}`, `${r.email} · ${when}`, "", ...plain(rs)].join("\n"),
  };
}
