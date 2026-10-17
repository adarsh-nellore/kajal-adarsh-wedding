/**
 * Shared couple addresses for invites + RSVP mail.
 *
 * Gmail (and many clients) only put the first Reply-To on Reply. A multi-address
 * Reply-To list therefore cannot deliver a normal Reply to both of us.
 * Guests reply to the domain inbox; Resend inbound → forward-wedding-inbound
 * fans those messages out to COUPLE_INBOXES.
 */
export const REPLY_TO = ["Kajal & Adarsh <k+a@kajal-adarsh.club>"] as const;
export const COUPLE_INBOXES = ["adarsh.nellore@gmail.com", "949kjp@gmail.com"] as const;
/** Always CC us on invite sends (recipient is omitted from CC if they are one of us). */
export const INVITE_CC = ["949kjp@gmail.com", "adarsh.nellore@gmail.com"] as const;
