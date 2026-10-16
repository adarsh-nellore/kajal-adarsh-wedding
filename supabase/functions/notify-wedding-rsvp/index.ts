// Edge Function: notify-wedding-rsvp
// Emails Kajal and Adarsh (and, if asked, the guest) about a new wedding RSVP.
// Sibling of the save-the-date's notify-rsvp, in the same project, using the
// same RESEND_API_KEY secret.
//
// Called fire-and-forget from the site with `{ id }` right after the insert,
// or by a DB webhook on public.wedding_rsvps (`{ record: { id, ... } }`).
// Only the id is trusted: the row is read back with the service role, and
// claimed via notified_at, so each RSVP is emailed once and the function can't
// be used to send arbitrary mail.
//
// Party replies are one row per guest sharing a submission_id; whichever row
// is claimed first claims its siblings too, so a party gets one email.
//
// The emails themselves come from email/rsvp-email.ts at the repo root, which the
// deploy bundles in; preview them with `node --experimental-strip-types email/build.ts`.
//
// Deploy with: supabase functions deploy notify-wedding-rsvp --no-verify-jwt
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { coupleEmail, guestEmail, type Rsvp } from "../../../email/rsvp-email.ts";
import { rsvpDeliveryHeaders } from "../../../email/resend-headers.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// Must be an address on the verified domain. onboarding@resend.dev only delivers
// to the Resend account's own address and is not aligned for guests.
const FROM = Deno.env.get("RESEND_FROM") || "Kajal & Adarsh <k+a@kajal-adarsh.club>";
const TO = ["adarsh.nellore@gmail.com", "949kjp@gmail.com"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function send(
  to: string[],
  subject: string,
  body: { text: string; html: string },
  opts: { replyTo?: string | string[]; guestFacing?: boolean; entityRef?: string } = {},
) {
  const payload: Record<string, unknown> = {
    from: FROM,
    to,
    subject,
    ...body,
  };
  if (opts.replyTo) payload.reply_to = opts.replyTo;
  // Couple-facing alerts stay private; guest-facing confirmations get List-Unsubscribe.
  if (opts.guestFacing) {
    payload.headers = rsvpDeliveryHeaders({ entityRef: opts.entityRef });
  }
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { ok: resp.ok, status: resp.status, resend: (await resp.text()).slice(0, 500) };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!RESEND_API_KEY) return json({ error: "missing RESEND_API_KEY" }, 500);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const id = String((payload?.record ?? payload)?.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "missing id" }, 400);

  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const headers = {
    "apikey": SERVICE_KEY,
    "Authorization": `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
  const claimWhere = async (filter: string) => {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/wedding_rsvps?${filter}&notified_at=is.null&created_at=gt.${since}`,
      {
        method: "PATCH",
        headers: { ...headers, "Prefer": "return=representation" },
        body: JSON.stringify({ notified_at: new Date().toISOString() }),
      },
    );
    if (!res.ok) throw new Error((await res.text()).slice(0, 300));
    return (await res.json()) as Rsvp[];
  };

  let rs: Rsvp[];
  try {
    rs = await claimWhere(`id=eq.${id}`);
    const sid = rs[0]?.submission_id;
    if (sid && /^[0-9a-f-]{36}$/i.test(sid)) rs = rs.concat(await claimWhere(`submission_id=eq.${sid}`));
  } catch (e) {
    return json({ error: "lookup failed", detail: String(e) }, 502);
  }
  const r = rs[0];
  if (!r) return json({ ok: true, skipped: "not found, too old, or already notified" });
  const by = r.submitted_by || r.name;
  rs.sort((a, b) => Number(b.name === by) - Number(a.name === by));
  // each guest has their own email now; replies and the copy go to the replier's, else the party's first
  const email = rs.find((g) => g.email)?.email || "";

  // One message per address, so a rejected recipient (e.g. while sending from
  // onboarding@resend.dev) doesn't block the other.
  const { subject, ...body } = coupleEmail(rs);
  const couple: Record<string, Awaited<ReturnType<typeof send>>> = {};
  for (const to of TO) {
    couple[to] = await send([to], subject, body, {
      replyTo: email || undefined,
      entityRef: `rsvp-couple-${r.id}-${to}`,
    });
  }
  const anyOk = Object.values(couple).some((c) => c.ok);

  if (!anyOk) {
    await fetch(`${SUPABASE_URL}/rest/v1/wedding_rsvps?id=in.(${rs.map((g) => g.id).join(",")})`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ notified_at: null }),
    });
  }

  let guest = null;
  if (rs[0].send_copy && email) {
    const { subject: guestSubject, ...copy } = guestEmail(rs);
    guest = await send([email], guestSubject, copy, {
      replyTo: TO,
      guestFacing: true,
      entityRef: `rsvp-guest-${r.id}`,
    });
  }

  return json({ ok: anyOk, couple, guest }, anyOk ? 200 : 502);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
