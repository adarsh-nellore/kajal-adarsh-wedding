// The invitation that points guests to the website, in Kajal and Adarsh's design.
// buildInvitationEmail() gives { subject, html, text } for Resend or any sender;
// pasteable() gives the same email as one self-contained table to paste into Gmail.

import { BACKDROP, BUTTON, BUTTON_INK, ENTER, FONT, INK, PASSWORD, QUESTIONS, QUESTIONS_TEXT, card, dates, esc, link, names, page, photo, rule, signoff, text } from "./rsvp-email.ts";

export const HOME = ENTER;

const SUBJECT = "Kajal & Adarsh · Mexico City · February 2027";
const HEADLINE = "We'd love for you to join us, for the weekend of our dreams!";
const PREHEADER = "We'd love for you to join us, February 19–21 in Mexico City.";
const INVITE = "We're getting married in CDMX.";
const DETAILS = "The weekend is on our wedding website.";
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

/** Skip blanks, "Guest", "Guest of …", and other placeholders without a real first name. */
function isRealFirstName(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  if (/^guest(\s+of\b.*)?$/i.test(n)) return false;
  if (/^(plus\s*one|baby|tbd|n\/?a)$/i.test(n)) return false;
  return true;
}

/** First token of a name ("Priya Shah" → "Priya"), if it looks real. */
export function firstNameOf(name: string): string | undefined {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return isRealFirstName(first) ? first : undefined;
}

/**
 * "Dear Priya," / "Dear Priya and Rohan," / "Dear Priya, Rohan, and Meera,"
 * Pass first names (or full names — first token is used). Empty / Guest skipped.
 */
export function dearGreeting(firstNames: string[]): string | undefined {
  const names = firstNames
    .map((n) => firstNameOf(n) ?? (isRealFirstName(n) ? n.trim() : undefined))
    .filter((n): n is string => !!n);
  // Dedupe while keeping order (same first name twice in a party is rare; keep both only if distinct entries were intentional — collapse exact dupes)
  const seen = new Set<string>();
  const unique = names.filter((n) => {
    const k = n.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!unique.length) return undefined;
  if (unique.length === 1) return `Dear ${unique[0]},`;
  if (unique.length === 2) return `Dear ${unique[0]} and ${unique[1]},`;
  return `Dear ${unique.slice(0, -1).join(", ")}, and ${unique[unique.length - 1]},`;
}

function rows(greeting?: string): string {
  const lead = greeting
    ? text(esc(greeting), { size: "l", top: 4, bottom: 8 }) +
      text(esc(HEADLINE), { size: "l", weight: 600, bottom: 0 })
    : text(esc(HEADLINE), { size: "l", weight: 600, top: 4, bottom: 0 });
  return lead +
    rule() + photo() + rule() + names() + dates() + rule() +
    text(`${esc(INVITE)}<br>The weekend is on our ${link(HOME, "wedding website", "#08040a")}.`) +
    rsvpButton(HOME) +
    text(`${esc(REPLY_BY)}<br>${esc(CANT_WAIT)}`) +
    signoff() + rule() + QUESTIONS;
}

export type InvitationOpts = {
  /** One guest — same as firstNames: [firstName]. Kept for mail-merge / old callers. */
  firstName?: string;
  /** Party first names for "Dear X, Y, and Z," */
  firstNames?: string[];
};

export function buildInvitationEmail(opts: InvitationOpts = {}) {
  const list = opts.firstNames?.length
    ? opts.firstNames
    : (opts.firstName?.trim() ? [opts.firstName.trim()] : []);
  const greeting = dearGreeting(list);
  return {
    subject: SUBJECT,
    html: page({ title: "Kajal y Adarsh", preheader: PREHEADER, rows: rows(greeting) }),
    text: [
      ...(greeting ? [greeting] : []),
      HEADLINE,
      "",
      "Kajal y Adarsh",
      "February 19–21, 2027",
      "Mexico City, Mexico",
      "",
      INVITE,
      `${DETAILS} ${HOME}`,
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
