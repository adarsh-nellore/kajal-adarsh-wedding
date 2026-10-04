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
// Deploy with: supabase functions deploy notify-wedding-rsvp --no-verify-jwt
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// onboarding@resend.dev only delivers to the Resend account's own address.
// Set RESEND_FROM to an address on a verified domain to reach everyone.
const FROM = Deno.env.get("RESEND_FROM") || "K + A RSVPs <onboarding@resend.dev>";
const TO = ["adarsh.nellore@gmail.com", "949kjp@gmail.com"];

const EVENTS: Record<string, string> = {
  "welcome-party": "Welcome Party · Friday 19th",
  "saatak-haldi": "Saatak & Haldi · Saturday 20th",
  "baarat-wedding": "Baarat & Wedding · Sunday 21st",
  "after-party": "After Party · Sunday 21st",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Rsvp = {
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
};

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
  ));
}

function rows(r: Rsvp): [string, string][] {
  const out: [string, string][] = [
    ["Name(s)", r.name],
    ["Email", r.email],
    ["Attending", r.attending ? "Joyfully accepts" : "Regretfully declines"],
  ];
  if (r.attending) {
    out.push(["Guests", String(r.guests ?? "")]);
    out.push(["Events", (r.events || []).map((e) => EVENTS[e] || e).join("\n")]);
    out.push(["Dietary", r.dietary || "None"]);
  }
  out.push(["Note", r.note || ""]);
  return out;
}

function render(title: string, intro: string, r: Rsvp) {
  const list = rows(r);
  const text = [intro, "", ...list.map(([k, v]) => `${k}: ${v.replace(/\n/g, ", ")}`)].join("\n");
  const html = `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#222">
      <h2 style="margin:0 0 8px;font-weight:500">${esc(title)}</h2>
      <p style="margin:0 0 16px;font-size:14px">${esc(intro)}</p>
      <table style="font-size:14px;border-collapse:collapse">
        ${list.map(([k, v]) => `<tr><td style="padding:6px 14px 6px 0;color:#777;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;white-space:pre-line">${esc(v)}</td></tr>`).join("")}
      </table>
    </div>`;
  return { text, html };
}

async function send(to: string[], subject: string, body: { text: string; html: string }, replyTo?: string) {
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, ...body, ...(replyTo ? { reply_to: replyTo } : {}) }),
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
  const claim = await fetch(
    `${SUPABASE_URL}/rest/v1/wedding_rsvps?id=eq.${id}&notified_at=is.null&created_at=gt.${since}`,
    {
      method: "PATCH",
      headers: {
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify({ notified_at: new Date().toISOString() }),
    },
  );
  if (!claim.ok) return json({ error: "lookup failed", detail: (await claim.text()).slice(0, 300) }, 502);
  const [r] = (await claim.json()) as Rsvp[];
  if (!r) return json({ ok: true, skipped: "not found, too old, or already notified" });

  const couple = await send(
    TO,
    `RSVP: ${r.name} ${r.attending ? "accepts" : "declines"}`,
    render("New RSVP", `${r.name} replied on ${new Date(r.created_at).toUTCString()}.`, r),
    r.email,
  );

  let guest = null;
  if (r.send_copy) {
    guest = await send(
      [r.email],
      "Your RSVP for Kajal & Adarsh's wedding",
      render(
        `Thank you, ${r.name}.`,
        r.attending
          ? "Here's a copy of your reply. We can't wait to celebrate with you in Mexico City."
          : "Here's a copy of your reply. We'll miss you, and we'll be thinking of you from Mexico City.",
        r,
      ),
      TO[0],
    );
  }

  return json({ ok: couple.ok, couple, guest }, couple.ok ? 200 : 502);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
