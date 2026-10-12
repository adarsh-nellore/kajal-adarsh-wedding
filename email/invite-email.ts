// The invitation that points guests to the website, in the RSVP emails' look.
// buildInvitationEmail() gives { subject, html, text } for Resend or any sender;
// pasteable() gives the same email as one self-contained table to paste into Gmail.

import { BODY, CARD, EVENTS, GOLD, GROUND, HEAD, MUTED, QUESTIONS, RULE, WHITE, esc, frame, page } from "./rsvp-email.ts";

export const HOME = "https://kajal-adarsh-wedding.vercel.app/";

const SUBJECT = "Kajal & Adarsh · Mexico City · February 2027";
const INVITE = "We’re getting married in Mexico City this February, and we want all of our loved ones there. We’d love for you to celebrate with us.";
const WEBSITE = "Our website has everything you’ll need: the events, travel and our hotel block, what to wear, and FAQs. You can RSVP for everyone in your party there. Kindly reply by December 1.";
const BUTTON = "View the website & RSVP";

const para = (s: string, top = 0) =>
  `<div style="padding-top:${top}px;font-family:${BODY};font-size:17px;line-height:27px;color:${WHITE};">${esc(s)}</div>`;

// The site's RSVP button: Jaini in gold inside a thin gold rule, square corners.
const button = (href: string, label: string) => `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
              <tr>
                <td align="center" style="border:1px solid ${GOLD};">
                  <a href="${esc(href)}" style="display:inline-block;padding:7px 26px 10px;font-family:${HEAD};font-size:24px;line-height:30px;color:${GOLD};text-decoration:none;letter-spacing:.01em;">${esc(label)}</a>
                </td>
              </tr>
            </table>`;

function weekend(): string {
  const rows = Object.values(EVENTS).map((e) => `
              <tr>
                <td width="18" valign="top" style="width:18px;padding:0;font-size:10px;line-height:26px;color:${GOLD};">&#9670;</td>
                <td style="padding:0;font-family:${BODY};font-size:16px;line-height:26px;color:${WHITE};">${esc(e).replace(/ · (.+)$/, ' · <span style="white-space:nowrap;">$1</span>')}</td>
              </tr>`).join("");
  return `
        <tr>
          <td style="padding:28px 0 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CARD}" style="border:1px solid ${RULE};border-radius:4px;background-color:${CARD};">
              <tr>
                <td style="padding:16px 20px 18px;">
                  <div style="font-family:${BODY};font-size:15px;line-height:22px;color:${MUTED};">The weekend</div>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;">${rows}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
}

function body(greeting: string): string {
  return `
        <tr>
          <td>
            <div style="font-family:${BODY};font-size:24px;line-height:32px;font-weight:500;color:${GOLD};">${esc(greeting)}</div>
            ${para(INVITE, 8)}
          </td>
        </tr>${weekend()}
        <tr>
          <td style="padding:28px 0 0;">
            ${para(WEBSITE)}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:32px 0 0;">${button(HOME, BUTTON)}
          </td>
        </tr>
        <tr>
          <td style="padding:40px 0 0;">
            ${para("With love,")}
            <div style="padding-top:2px;font-family:${HEAD};font-size:30px;line-height:36px;color:${GOLD};">Kajal &amp; Adarsh</div>
          </td>
        </tr>`;
}

const greet = (firstName?: string) => (firstName?.trim() ? `Dear ${firstName.trim()},` : "Hello,");

export function buildInvitationEmail({ firstName }: { firstName?: string } = {}) {
  const greeting = greet(firstName);
  return {
    subject: SUBJECT,
    html: page({ title: "Kajal y Adarsh", preheader: INVITE, body: body(greeting), footer: QUESTIONS, home: HOME }),
    text: [
      "Kajal y Adarsh",
      "Friday, February 19 – Sunday, February 21, 2027",
      "Mexico City, Mexico",
      "",
      greeting,
      INVITE,
      "",
      "The weekend",
      ...Object.values(EVENTS).map((e) => `  ${e}`),
      "",
      WEBSITE,
      "",
      `${BUTTON}: ${HOME}`,
      "",
      "With love,",
      "Kajal & Adarsh",
      "",
      "Questions?",
      "Message Kajal (https://wa.me/19492931051) or Adarsh (https://wa.me/14087521100)",
    ].join("\n"),
  };
}

// For pasting into Gmail compose: no <head>, no background image, no media queries,
// everything inline on one dark table that carries its own background.
export function pasteable(greeting = "Hello,"): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${GROUND}" style="width:100%;max-width:640px;background-color:${GROUND};border-collapse:separate;">
  <tr>
    <td align="center" bgcolor="${GROUND}" style="padding:48px 12px 56px;background-color:${GROUND};">
      ${frame({ body: body(greeting), footer: QUESTIONS, home: HOME, names: 46 })}
    </td>
  </tr>
</table>`;
}
