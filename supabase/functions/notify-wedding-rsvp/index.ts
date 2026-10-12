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
  "saatak-haldi": "Ganesh Pooja, Grah Shanti & Haldi · Saturday 20th",
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
  party: string | null;
  submission_id: string | null;
  submitted_by: string | null;
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

function partyRows(rs: Rsvp[]): [string, string][] {
  const r = rs[0];
  const out: [string, string][] = [
    ["Sent by", r.submitted_by || r.name],
    ["Email", r.email],
    ["Party", r.party || ""],
  ];
  for (const g of rs) {
    out.push([g.name, g.attending
      ? ["Joyfully accepts", ...(g.events || []).map((e) => EVENTS[e] || e)].join("\n")
      : "Regretfully declines"]);
  }
  if (rs.some((g) => g.attending)) out.push(["Dietary", r.dietary || "None"]);
  out.push(["Note", r.note || ""]);
  return out;
}

function render(title: string, intro: string, rs: Rsvp[]) {
  const list = rs[0].submission_id ? partyRows(rs) : rows(rs[0]);
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
  const anyAttending = rs.some((g) => g.attending);

  // One message per address, so a rejected recipient (e.g. while sending from
  // onboarding@resend.dev) doesn't block the other.
  const subject = r.submission_id
    ? `RSVP: ${by}${r.party ? ` (party ${r.party})` : ""}, ${rs.filter((g) => g.attending).length} of ${rs.length} coming`
    : `RSVP: ${r.name} ${r.attending ? "accepts" : "declines"}`;
  const body = render("New RSVP", `${by} replied on ${new Date(r.created_at).toUTCString()}.`, rs);
  const couple: Record<string, Awaited<ReturnType<typeof send>>> = {};
  for (const to of TO) couple[to] = await send([to], subject, body, r.email);
  const anyOk = Object.values(couple).some((c) => c.ok);

  if (!anyOk) {
    await fetch(`${SUPABASE_URL}/rest/v1/wedding_rsvps?id=in.(${rs.map((g) => g.id).join(",")})`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ notified_at: null }),
    });
  }

  let guest = null;
  if (r.send_copy) {
    guest = await send(
      [r.email],
      "Your RSVP for Kajal & Adarsh's wedding",
      render(
        `Thank you, ${by}.`,
        anyAttending
          ? "Here's a copy of your reply. We can't wait to celebrate with you in Mexico City."
          : "Here's a copy of your reply. We'll miss you, and we'll be thinking of you from Mexico City.",
        rs,
      ),
      TO[0],
    );
  }

  return json({ ok: anyOk, couple, guest }, anyOk ? 200 : 502);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
