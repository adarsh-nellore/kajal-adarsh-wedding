// RSVP emails in the site's look: the guest's copy and the note to Kajal and Adarsh.
// Drop-in for supabase/functions/notify-wedding-rsvp: pass the party's rows, the
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
const LATTICE = SITE + "email/lattice.png";
const TZ = "America/Chicago";

export const EVENTS: Record<string, string> = {
  "welcome-party": "Welcome Party · Friday 19th",
  "saatak-haldi": "Ganesh Pooja, Grah Shanti & Haldi · Saturday 20th",
  "baarat-wedding": "Baarat & Wedding · Sunday 21st",
  "after-party": "After Party · Sunday 21st",
};

export const GROUND = "#121212";
export const GOLD = "#CDA45E";
export const WHITE = "#EAE3D6";
export const MUTED = "#98948C";   // the off-white at 62% on the ground
export const RULE = "#3B3223";    // the gold at 22%, the site's card border
export const CARD = "#161615";
export const HEAD = "'Jaini','EB Garamond',Georgia,serif";
export const BODY = "'EB Garamond',Georgia,'Times New Roman',serif";

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

function guestCard(g: Rsvp): string {
  const reply = g.attending
    ? `<div style="margin:2px 0 0;font-family:${HEAD};font-size:20px;line-height:28px;color:${GOLD};">Joyfully accepts</div>`
    : `<div style="margin:2px 0 0;font-family:${HEAD};font-size:20px;line-height:28px;color:${MUTED};">Regretfully declines</div>`;
  const events = g.attending
    ? eventsOf(g).map((e) => `
              <tr>
                <td width="18" valign="top" style="width:18px;padding:0;font-size:10px;line-height:26px;color:${GOLD};">&#9670;</td>
                <td style="padding:0;font-family:${BODY};font-size:16px;line-height:26px;color:${WHITE};">${esc(e).replace(/ · (.+)$/, ' · <span style="white-space:nowrap;">$1</span>')}</td>
              </tr>`).join("")
    : "";
  return `
        <tr>
          <td style="padding:0 0 10px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${RULE};border-radius:4px;background-color:${CARD};">
              <tr>
                <td style="padding:16px 20px 18px;">
                  <div style="font-family:${BODY};font-size:18px;line-height:26px;font-weight:500;color:${WHITE};">${esc(g.name)}</div>
                  ${reply}${events ? `
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">${events}
                  </table>` : ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
}

function detail(label: string, value: string): string {
  return `
        <tr>
          <td style="padding:18px 0 0;">
            <div style="font-family:${BODY};font-size:15px;line-height:22px;color:${MUTED};">${esc(label)}</div>
            <div style="padding-top:2px;font-family:${BODY};font-size:17px;line-height:27px;color:${WHITE};">${lines(value)}</div>
          </td>
        </tr>`;
}

function details(rs: Rsvp[]): string {
  const r = rs[0];
  let out = "";
  if (rs.some((g) => g.attending) && r.dietary?.trim()) out += detail("Dietary restrictions or allergies", r.dietary);
  if (r.note?.trim()) out += detail("A note to us", r.note);
  return out;
}

export const link = (href: string, text: string) =>
  `<a href="${esc(href)}" style="color:${GOLD};text-decoration:underline;text-decoration-color:${RULE};text-underline-offset:3px;">${esc(text)}</a>`;

export const QUESTIONS = `
        <tr>
          <td class="col" align="center" style="padding:56px 20px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${RULE};font-size:0;line-height:0;">&nbsp;</td></tr></table>
            <div style="padding-top:40px;font-family:${HEAD};font-size:30px;line-height:34px;color:${GOLD};">Questions?</div>
            <div style="padding-top:6px;font-family:${BODY};font-size:17px;line-height:27px;color:${WHITE};">Message ${link("https://wa.me/19492931051", "Kajal")} or ${link("https://wa.me/14087521100", "Adarsh")}</div>
          </td>
        </tr>`;

// The 560px column: names, dates and place, then the body rows and the footer.
export function frame(o: { body: string; footer: string; home?: string; names?: number }): string {
  const size = o.names ?? 52;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <tr>
          <td class="col" align="center" style="padding:0 20px;">
            <a href="${esc(o.home ?? SITE)}" class="names" style="font-family:${HEAD};font-size:${size}px;line-height:${size + 6}px;color:${GOLD};text-decoration:none;letter-spacing:.01em;">Kajal y Adarsh</a>
            <div style="padding-top:18px;font-family:${BODY};font-size:17px;line-height:26px;color:${WHITE};"><span style="white-space:nowrap;">Friday, February 19 –</span> <span style="white-space:nowrap;">Sunday, February 21, 2027</span><br>Mexico City, Mexico</div>
          </td>
        </tr>
        <tr>
          <td class="col" style="padding:56px 20px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${o.body}
            </table>
          </td>
        </tr>${o.footer}
      </table>`;
}

export function page(o: { title: string; preheader: string; body: string; footer: string; home?: string }): string {
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(o.title)}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>td,div,a,span{font-family:Georgia,serif !important;}</style>
<![endif]-->
<link href="https://fonts.googleapis.com/css2?family=Jaini&family=EB+Garamond:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{color-scheme:dark;supported-color-schemes:dark;}
body{margin:0;padding:0;width:100% !important;background-color:${GROUND};-webkit-text-size-adjust:100%;}
a{color:${GOLD};}
@media (max-width:600px){
  .shell{padding:40px 14px 48px !important;}
  .col{padding-left:10px !important;padding-right:10px !important;}
  .names{font-size:44px !important;line-height:48px !important;}
}
</style>
</head>
<body style="margin:0;padding:0;background-color:${GROUND};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${GROUND};">${esc(o.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${GROUND}" background="${LATTICE}" style="background-color:${GROUND};background-image:url('${LATTICE}');">
  <tr>
    <td class="shell" align="center" style="padding:64px 16px 72px;">
      <!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      ${frame(o)}
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;
}

const plain = (rs: Rsvp[]) => [
  ...rs.flatMap((g) => g.attending
    ? [g.name, "Joyfully accepts", ...eventsOf(g).map((e) => `  ${e}`), ""]
    : [g.name, "Regretfully declines", ""]),
  ...(rs.some((g) => g.attending) && rs[0].dietary?.trim() ? ["Dietary restrictions or allergies", rs[0].dietary.trim(), ""] : []),
  ...(rs[0].note?.trim() ? ["A note to us", rs[0].note.trim(), ""] : []),
];

// The copy for the guest who asked for one.
export function guestEmail(rs: Rsvp[]) {
  const by = rs[0].submitted_by || rs[0].name;
  const going = rs.some((g) => g.attending);
  const line = going
    ? "Your reply is in. We can’t wait to celebrate with you in Mexico City."
    : "We’ll miss you, and we’ll be thinking of you from Mexico City.";
  const body = `
        <tr>
          <td style="padding:0 0 24px;">
            <div style="font-family:${BODY};font-size:24px;line-height:32px;font-weight:500;color:${GOLD};">Thank you, ${esc(by)}.</div>
            <div style="padding-top:8px;font-family:${BODY};font-size:17px;line-height:27px;color:${WHITE};">${esc(line)}</div>
          </td>
        </tr>${rs.map(guestCard).join("")}${details(rs)}
        <tr>
          <td style="padding:24px 0 0;font-family:${BODY};font-size:17px;line-height:27px;color:${WHITE};">${link(SITE + "#rsvp", "Change your reply")}</td>
        </tr>`;
  return {
    subject: "Your RSVP for Kajal & Adarsh’s wedding",
    html: page({ title: "Kajal y Adarsh", preheader: line, body, footer: QUESTIONS }),
    text: [
      "Kajal y Adarsh",
      "Friday, February 19 – Sunday, February 21, 2027",
      "Mexico City, Mexico",
      "",
      `Thank you, ${by}.`,
      line,
      "",
      ...plain(rs),
      `Change your reply: ${SITE}#rsvp`,
      "",
      "Questions?",
      "Message Kajal (https://wa.me/19492931051) or Adarsh (https://wa.me/14087521100)",
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
  const body = `
        <tr>
          <td style="padding:0 0 24px;">
            <div style="font-family:${BODY};font-size:24px;line-height:32px;font-weight:500;color:${GOLD};">${esc(by)} replied.</div>
            <div style="padding-top:8px;font-family:${BODY};font-size:17px;line-height:27px;color:${WHITE};">${esc(tally)}${r.party ? ` · Party ${esc(r.party)}` : ""}</div>
            <div style="font-family:${BODY};font-size:15px;line-height:24px;color:${MUTED};">${link("mailto:" + r.email, r.email)} · ${esc(when)}</div>
          </td>
        </tr>${rs.map(guestCard).join("")}${details(rs)}`;
  return {
    subject: r.submission_id
      ? `RSVP: ${by}${r.party ? ` (party ${r.party})` : ""}, ${coming} of ${rs.length} coming`
      : `RSVP: ${r.name} ${r.attending ? "accepts" : "declines"}`,
    html: page({ title: `RSVP: ${by}`, preheader: `${tally}. ${rs.map((g) => g.name).join(", ")}`, body, footer: "" }),
    text: [`${by} replied.`, `${tally}${r.party ? ` · Party ${r.party}` : ""}`, `${r.email} · ${when}`, "", ...plain(rs)].join("\n"),
  };
}
