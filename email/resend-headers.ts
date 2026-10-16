/**
 * Headers for Resend's /emails API.
 *
 * Wedding invites are one-to-one notes, not a newsletter — but Gmail still
 * rewards a working List-Unsubscribe (and one-click) when mail looks bulk.
 * We never set Precedence: bulk or List-Id (those read as marketing).
 *
 * Open/click tracking is a domain setting in Resend — keep both OFF.
 */

export const FROM_ADDRESS = "k+a@kajal-adarsh.club";
export const UNSUBSCRIBE_URL = "https://kajal-adarsh.club/email/unsubscribe";
export const UNSUBSCRIBE_MAILTO =
  `mailto:${FROM_ADDRESS}?subject=${encodeURIComponent("Please stop wedding emails")}`;

/** Strip bulk/marketing signals callers shouldn't set. */
export function scrubBulkHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (/^precedence$/i.test(key)) continue;
    if (/^list-id$/i.test(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * List-Unsubscribe (mailto + HTTPS) and RFC 8058 one-click.
 * Optional unique X-Entity-Ref-ID so Gmail doesn't collapse distinct invites.
 */
export function inviteDeliveryHeaders(opts: {
  /** Stable-ish id for this send (email id, guest id, or random). */
  entityRef?: string;
  extra?: Record<string, string>;
} = {}): Record<string, string> {
  const headers: Record<string, string> = {
    "List-Unsubscribe": `<${UNSUBSCRIBE_URL}>, <${UNSUBSCRIBE_MAILTO}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    ...(opts.extra ?? {}),
  };
  if (opts.entityRef) {
    headers["X-Entity-Ref-ID"] = opts.entityRef;
  }
  return scrubBulkHeaders(headers);
}

/** Guest RSVP confirmation — same unsubscribe path; no marketing List-Id. */
export function rsvpDeliveryHeaders(opts: { entityRef?: string } = {}): Record<string, string> {
  return inviteDeliveryHeaders(opts);
}
