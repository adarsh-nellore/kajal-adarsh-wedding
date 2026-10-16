/**
 * Send wedding invitations through Resend's one-off /emails API (transactional),
 * not Broadcasts/Audiences.
 *
 * Future guest sends should use this helper so we keep:
 *   - HTML + strong plain-text multipart
 *   - one message per unique address (deduped within a party)
 *   - reply_to → personal Gmails
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
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildInvitationEmail, REPLY_TO } from "./invite-email.ts";
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
  const out: { to: string[]; names: string[]; from: string; dryRun: boolean } = {
    to: [],
    names: [],
    from: FROM_DEFAULT,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
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
  /** Merged on top of inviteDeliveryHeaders (Precedence: bulk / List-Id still stripped). */
  headers?: Record<string, string>;
};

/**
 * POST https://api.resend.com/emails — one transactional message.
 * Does not use Broadcasts, Audiences, or marketing batch APIs.
 */
export async function sendInvitation(opts: SendInviteOpts): Promise<{
  ok: boolean;
  status: number;
  id?: string;
  error?: string;
  to: string[];
}> {
  loadEnvLocal();
  const key = process.env.RESEND_API_KEY || "";
  if (!key) return { ok: false, status: 0, error: "RESEND_API_KEY is not set", to: [] };

  const to = dedupeEmails(Array.isArray(opts.to) ? opts.to : [opts.to]);
  if (!to.length) return { ok: false, status: 0, error: "no valid recipients", to: [] };

  const mail = buildInvitationEmail({
    firstNames: opts.firstNames,
    firstName: opts.firstName,
  });

  const replyTo = opts.replyTo ?? [...REPLY_TO];
  const entityRef = `invite-${Date.now().toString(36)}-${to[0].toLowerCase()}`;
  const headers = inviteDeliveryHeaders({
    entityRef,
    extra: opts.headers,
  });

  const body: Record<string, unknown> = {
    from: opts.from ?? FROM_DEFAULT,
    to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    reply_to: replyTo,
    headers,
  };

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
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
    to,
  };
}

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));
  if (!args.to.length) {
    console.error("Usage: node --experimental-strip-types email/send-invite.ts --to a@x.com,b@y.com [--names A,B] [--dry-run]");
    process.exit(1);
  }
  const to = dedupeEmails(args.to);
  const mail = buildInvitationEmail({ firstNames: args.names });
  const headers = inviteDeliveryHeaders({
    entityRef: `invite-dry-${Date.now().toString(36)}`,
  });
  const payload = {
    from: args.from,
    to,
    subject: mail.subject,
    reply_to: [...REPLY_TO],
    headers,
    textBytes: mail.text.length,
    htmlBytes: mail.html.length,
  };
  if (args.dryRun) {
    console.log(JSON.stringify({ dryRun: true, ...payload, textPreview: mail.text.slice(0, 280) }, null, 2));
    return;
  }
  const result = await sendInvitation({
    to,
    firstNames: args.names.length ? args.names : undefined,
    from: args.from,
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
