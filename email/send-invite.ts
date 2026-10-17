/**
 * Send wedding invitations through Resend's one-off /emails API (transactional),
 * not Broadcasts/Audiences.
 *
 * Future guest sends should use this helper so we keep:
 *   - HTML + strong plain-text multipart
 *   - one Resend message per unique address (never multi-To; that looks bulk)
 *   - reply_to → k+a@ (inbound forward fans replies to both Gmails; see invite-email.ts)
 *   - cc → personal Gmails (cc omitted when the recipient is us)
 *   - List-Unsubscribe + one-click (no Precedence: bulk / List-Id)
 *   - open/click tracking OFF on the domain (set in Resend dashboard; leave it)
 *
 * Usage:
 *   # load RESEND_API_KEY from .env.local, then:
 *   node --experimental-strip-types email/send-invite.ts \
 *     --to 949kjp@gmail.com,adarsh.nellore@gmail.com \
 *     --names Kajal,Adarsh
 *
 * Optional: --from 'Kajal & Adarsh <k+a@kajal-adarsh.club>'
 *           --dry-run   (print payload, do not send)
 *           --no-cc     (omit INVITE_CC; guest To: only — saves quota; re-enable later)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { INVITE_CC, REPLY_TO } from "./couple-addresses.ts";
import { buildInvitationEmail } from "./invite-email.ts";
import { inviteDeliveryHeaders } from "./resend-headers.ts";

const FROM_DEFAULT = "Kajal & Adarsh <k+a@kajal-adarsh.club>";

function loadEnvLocal(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, key, val] = m;
      if (process.env[key] === undefined) {
        process.env[key] = val.replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // .env.local optional if RESEND_API_KEY is already in the environment
  }
}

function parseArgs(argv: string[]) {
  const out: {
    to: string[];
    names: string[];
    from: string;
    dryRun: boolean;
    noCc: boolean;
  } = {
    to: [],
    names: [],
    from: FROM_DEFAULT,
    dryRun: false,
    noCc: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--no-cc") out.noCc = true;
    else if (a === "--to") out.to = splitList(argv[++i] ?? "");
    else if (a === "--names") out.names = splitList(argv[++i] ?? "");
    else if (a === "--from") out.from = argv[++i] ?? FROM_DEFAULT;
  }
  return out;
}

function splitList(s: string): string[] {
  return s
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Lowercase email key; keep first occurrence's original spelling. */
export function dedupeEmails(addresses: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of addresses) {
    const email = raw.trim();
    if (!email || !email.includes("@")) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

export type SendInviteOpts = {
  to: string | string[];
  firstNames?: string[];
  firstName?: string;
  from?: string;
  replyTo?: string | string[];
  /** Defaults to INVITE_CC; recipient is never also CCed. */
  cc?: string | string[];
  /** Merged on top of inviteDeliveryHeaders (Precedence: bulk / List-Id still stripped). */
  headers?: Record<string, string>;
};

export type SendInviteResult = {
  ok: boolean;
  status: number;
  id?: string;
  error?: string;
  to: string[];
  /** Present when several addresses were split into one-message-each sends. */
  results?: SendInviteResult[];
};

/** CC list minus the To: address (Resend/Gmail get confused if both match). */
function ccForRecipient(to: string, cc: string[]): string[] {
  const toKey = to.trim().toLowerCase();
  return dedupeEmails(cc).filter((addr) => addr.toLowerCase() !== toKey);
}

/** Flatten reply_to / cc opts into a deduped string list (Resend accepts string | string[]). */
function normalizeAddressList(raw: string | string[]): string[] {
  const parts = Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    for (const addr of splitList(String(part))) {
      const key = addr.toLowerCase().replace(/^.*<([^>]+)>.*$/, "$1").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(addr);
    }
  }
  return out;
}

async function postOneInvite(opts: {
  key: string;
  to: string;
  from: string;
  replyTo: string[];
  cc: string[];
  mail: ReturnType<typeof buildInvitationEmail>;
  headers?: Record<string, string>;
}): Promise<SendInviteResult> {
  const entityRef = `invite-${Date.now().toString(36)}-${opts.to.toLowerCase()}`;
  const headers = inviteDeliveryHeaders({
    entityRef,
    extra: opts.headers,
  });
  const cc = ccForRecipient(opts.to, opts.cc);
  // One-element arrays stay arrays; Resend serializes them as a single Reply-To.
  const body: Record<string, unknown> = {
    from: opts.from,
    to: [opts.to],
    subject: opts.mail.subject,
    html: opts.mail.html,
    text: opts.mail.text,
    reply_to: opts.replyTo.length === 1 ? opts.replyTo[0] : opts.replyTo,
    headers,
  };
  if (cc.length) body.cc = cc;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const raw = await resp.text();
  let parsed: { id?: string; message?: string } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { message: raw.slice(0, 400) };
  }
  return {
    ok: resp.ok,
    status: resp.status,
    id: parsed.id,
    error: resp.ok ? undefined : parsed.message || raw.slice(0, 400),
    to: [opts.to],
  };
}

/**
 * POST https://api.resend.com/emails — one transactional message per address.
 * Multi-address `to` is split (never one message with many To:). No Broadcasts/Audiences.
 */
export async function sendInvitation(opts: SendInviteOpts): Promise<SendInviteResult> {
  loadEnvLocal();
  const key = process.env.RESEND_API_KEY || "";
  if (!key) return { ok: false, status: 0, error: "RESEND_API_KEY is not set", to: [] };

  const to = dedupeEmails(Array.isArray(opts.to) ? opts.to : [opts.to]);
  if (!to.length) return { ok: false, status: 0, error: "no valid recipients", to: [] };

  const mail = buildInvitationEmail({
    firstNames: opts.firstNames,
    firstName: opts.firstName,
  });
  // Always a string[] for Resend. Prefer one address: clients reply to the first only.
  const replyTo = normalizeAddressList(opts.replyTo ?? [...REPLY_TO]);
  const cc = dedupeEmails(
    opts.cc === undefined
      ? [...INVITE_CC]
      : Array.isArray(opts.cc)
        ? opts.cc
        : [opts.cc],
  );
  const from = opts.from ?? FROM_DEFAULT;

  if (to.length === 1) {
    return postOneInvite({
      key,
      to: to[0],
      from,
      replyTo,
      cc,
      mail,
      headers: opts.headers,
    });
  }

  const results: SendInviteResult[] = [];
  for (const addr of to) {
    results.push(
      await postOneInvite({
        key,
        to: addr,
        from,
        replyTo,
        cc,
        mail,
        headers: opts.headers,
      }),
    );
  }
  const failed = results.find((r) => !r.ok);
  return {
    ok: !failed,
    status: failed?.status ?? results[0]?.status ?? 0,
    id: results.map((r) => r.id).filter(Boolean).join(",") || undefined,
    error: failed?.error,
    to,
    results,
  };
}

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));
  if (!args.to.length) {
    console.error(
      "Usage: node --experimental-strip-types email/send-invite.ts --to a@x.com,b@y.com [--names A,B] [--dry-run] [--no-cc]",
    );
    process.exit(1);
  }
  const to = dedupeEmails(args.to);
  const mail = buildInvitationEmail({ firstNames: args.names });
  const headers = inviteDeliveryHeaders({
    entityRef: `invite-dry-${Date.now().toString(36)}`,
  });
  const cc = args.noCc ? [] : [...INVITE_CC];
  const payload = {
    from: args.from,
    to,
    oneMessagePerRecipient: true,
    subject: mail.subject,
    reply_to: [...REPLY_TO],
    cc,
    noCc: args.noCc,
    headers,
    textBytes: mail.text.length,
    htmlBytes: mail.html.length,
    imgs: (mail.html.match(/<img /g) || []).length,
    hasBtn: mail.html.includes("btn-bg"),
  };
  if (args.dryRun) {
    console.log(JSON.stringify({ dryRun: true, ...payload, textPreview: mail.text.slice(0, 280) }, null, 2));
    return;
  }
  const result = await sendInvitation({
    to,
    firstNames: args.names.length ? args.names : undefined,
    from: args.from,
    cc,
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

const isMain =
  process.argv[1]?.endsWith("send-invite.ts") ||
  process.argv[1]?.endsWith("send-invite");

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
