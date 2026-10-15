// The invitation that points guests to the website, in Kajal and Adarsh's design.
// buildInvitationEmail() gives { subject, html, text } for Resend or any sender;
// pasteable() gives the same email as one self-contained table to paste into Gmail.

import { BACKDROP, BUTTON, BUTTON_INK, ENTER, FONT, INK, PASSWORD, QUESTIONS, QUESTIONS_TEXT, card, dates, esc, link, names, page, photo, rule, signoff, text } from "./rsvp-email.ts";

export const HOME = ENTER;

const SUBJECT = "Kajal & Adarsh · Mexico City · February 2027";
const HEADLINE = "Please join us in celebrating our wedding!";
const INVITE = "We're getting married in CDMX, and we'd love to celebrate with you!";
const REPLY_BY = "Kindly reply by December 1, 2026.";
const CANT_WAIT = "We can't wait to celebrate with you!";

// The RSVP button with the site's password on a lighter stub just beneath it.
const rsvpButton = (href: string) => `
        <tr>
          <td class="side" align="center" style="padding:4px 32px 20px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
              <tr>
                <td class="btn-bg" bgcolor="${BUTTON}" width="130" style="width:130px;background-color:${BUTTON};border:1px solid ${INK};">
                  <a href="${esc(href)}" class="btn" style="display:block;padding:7px 8px;text-align:center;font-family:${FONT};font-size:20px;line-height:28px;color:${BUTTON_INK};text-decoration:none;">RSVP</a>
                </td>
              </tr>
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td height="10" style="height:10px;line-height:10px;font-size:0;">&nbsp;</td></tr></table>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
              <tr>
                <td class="backdrop ink" bgcolor="${BACKDROP}" align="center" style="padding:6px 16px;background-color:${BACKDROP};border:1px dashed ${INK};font-family:${FONT};font-size:18px;line-height:24px;color:${INK};text-align:center;">Password: <span style="font-weight:700;">${esc(PASSWORD)}</span></td>
              </tr>
            </table>
          </td>
        </tr>`;

function rows(greeting?: string): string {
  return text(HEADLINE, { size: "l", weight: 600, top: 4 }) +
    rule() + photo(HOME) + rule() + names() + dates() + rule() +
    (greeting ? text(esc(greeting)) : "") +
    text(`${esc(INVITE)}<br>Visit our ${link(HOME, "wedding website", "#08040a")} for all the details and to RSVP.`) +
    rsvpButton(HOME) +
    text(`${esc(REPLY_BY)}<br>${esc(CANT_WAIT)}`) +
    signoff() + QUESTIONS;
}

const greet = (firstName?: string) => (firstName?.trim() ? `Dear ${firstName.trim()},` : undefined);

export function buildInvitationEmail({ firstName }: { firstName?: string } = {}) {
  const greeting = greet(firstName);
  return {
    subject: SUBJECT,
    html: page({ title: "Kajal y Adarsh", preheader: INVITE, rows: rows(greeting) }),
    text: [
      HEADLINE,
      "",
      "Kajal y Adarsh",
      "February 19–21, 2027",
      "Mexico City, Mexico",
      "",
      ...(greeting ? [greeting] : []),
      INVITE,
      `Visit our wedding website for all the details and to RSVP: ${HOME}`,
      `Password: ${PASSWORD}`,
      "",
      REPLY_BY,
      CANT_WAIT,
      "",
      "With love,",
      "Kajal & Adarsh",
      "",
      ...QUESTIONS_TEXT,
    ].join("\n"),
  };
}

// For pasting into Gmail compose: no <head> or media queries, everything inline on one tan table.
export function pasteable(greeting?: string): string {
  return card(rows(greeting));
}
