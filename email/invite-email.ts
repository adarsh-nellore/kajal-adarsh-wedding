// The invitation that points guests to the website, in Kajal and Adarsh's design.
// buildInvitationEmail() gives { subject, html, text } for Resend or any sender;
// pasteable() gives the same email as one self-contained table to paste into Gmail.

import {
  ENTER,
  LINK,
  PASSWORD,
  TEXT_ADARSH,
  TEXT_KAJAL,
  card,
  dates,
  esc,
  link,
  page,
  photo,
  rule,
  signoff,
  text,
} from "./rsvp-email.ts";

export { COUPLE_INBOXES, INVITE_CC, REPLY_TO } from "./couple-addresses.ts";

export const HOME = ENTER;

const SUBJECT = "Invitation from Kajal and Adarsh · February 2027";
const HEADLINE = "We'd love for you to join us, for the weekend of our dreams!";
// Inbox snippet shown after the subject in Gmail/Apple Mail.
const PREHEADER = "Invite for wedding inside - Feb. 19-21, 2027. RSVP link and more info.";
const OPENING =
  "We're getting married in CDMX, and we can't wait to celebrate with our favorite people!";
const DETAILS_BEFORE =
  "We've put together everything you need to know about the weekend, including events, hotel block, and dress guidance on our";
const REPLY_BY = "Please let us know by December 1, 2026.";
const HOPE = "We hope you can join us!";
// Quiet CTA: underlined text + password in prose (no filled button / dashed promo box —
// those read as marketing to Gmail's Promotions classifier).
const rsvpCta = (href: string) =>
  text(
    `${link(href, "RSVP on our site", "#08040a")}. Password: <span style="font-weight:700;">${esc(PASSWORD)}</span>`,
    { size: "m", bottom: 16 },
  );

const inviteQuestions =
  text("Questions? We're happy to help!", { size: "s", top: 0, bottom: 8 }) +
  text(
    `Kajal · ${link(TEXT_KAJAL, "949-293-1051", LINK)}<br>Adarsh · ${link(TEXT_ADARSH, "408-752-1100", LINK)}`,
    { size: "s", bottom: 0 },
  );

const inviteQuestionsText = [
  "Questions? We're happy to help!",
  `Kajal · 949-293-1051 · ${TEXT_KAJAL}`,
  `Adarsh · 408-752-1100 · ${TEXT_ADARSH}`,
];

/** Wordmark as type, not a remote PNG — one fewer image fetch for inbox filters. */
const titles = () =>
  text("Kajal y Adarsh", { size: "l", weight: 600, top: 4, bottom: 14 });

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
    rule() + photo() + rule() + titles() + dates() + rule() +
    text(`${esc(OPENING)}`) +
    text(
      `${esc(DETAILS_BEFORE)} ${link(HOME, "wedding website", "#08040a")}.`,
    ) +
    rsvpCta(HOME) +
    text(`${esc(REPLY_BY)}<br>${esc(HOPE)}`) +
    signoff() + rule() + inviteQuestions;
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
    // Strong plain-text part: reads as a short letter (helps multipart ratio vs image HTML).
    text: [
      ...(greeting ? [greeting, ""] : []),
      HEADLINE,
      "",
      "Kajal y Adarsh",
      "February 19–21, 2027 · Mexico City, Mexico",
      "",
      OPENING,
      "",
      `${DETAILS_BEFORE} wedding website.`,
      `Wedding website: ${HOME}`,
      `RSVP on our site: ${HOME}`,
      `Password: ${PASSWORD}`,
      "",
      REPLY_BY,
      HOPE,
      "",
      "With love,",
      "Kajal & Adarsh",
      "",
      ...inviteQuestionsText,
    ].join("\n"),
  };
}

// For pasting into Gmail compose: no <head> or media queries, everything inline on one tan table.
export function pasteable(greeting?: string): string {
  return card(rows(greeting));
}
