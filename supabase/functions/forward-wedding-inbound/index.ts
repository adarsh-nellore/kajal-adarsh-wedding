// Edge Function: forward-wedding-inbound
// Resend email.received webhook → fan-out guest replies (and other mail to
// @kajal-adarsh.club) to both personal Gmails so a normal Reply reaches both.
//
// Deploy: supabase functions deploy forward-wedding-inbound --no-verify-jwt --project-ref zfhhknasebbhaifabszd
// Then create a Resend webhook for email.received pointing at this URL and set
// RESEND_WEBHOOK_SECRET to the signing_secret Resend returns.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const WEBHOOK_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET") || "";
const FORWARD_TO = ["adarsh.nellore@gmail.com", "949kjp@gmail.com"];
// Separate from k+a@ so our forwards are not re-received and looped.
const FORWARD_FROM = "Kajal & Adarsh <replies@kajal-adarsh.club>";
const DOMAIN = "kajal-adarsh.club";

type ReceivedEvent = {
  type: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
  };
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function emailKey(addr: string): string {
  const m = addr.match(/<([^>]+)>/);
  return (m ? m[1] : addr).trim().toLowerCase();
}

function isOurDomain(addr: string): boolean {
  return emailKey(addr).endsWith(`@${DOMAIN}`);
}

/** Svix-compatible verify (Resend webhook signatures). */
async function verifySvix(
  payload: string,
  headers: Headers,
  secret: string,
): Promise<boolean> {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatureHeader = headers.get("svix-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 60 * 5) return false;

  const keyPart = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const keyBytes = Uint8Array.from(atob(keyPart), (c) => c.charCodeAt(0));
  const signed = `${id}.${timestamp}.${payload}`;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(signed)));
  const expected = btoa(String.fromCharCode(...mac));

  for (const part of signatureHeader.split(" ")) {
    const [ver, sig] = part.split(",", 2);
    if (ver === "v1" && sig && timingSafeEqual(sig, expected)) return true;
  }
  return false;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function resendGet(path: string): Promise<{ ok: boolean; status: number; body: any }> {
  const resp = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });
  const text = await resp.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text.slice(0, 400) };
  }
  return { ok: resp.ok, status: resp.status, body };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!RESEND_API_KEY) return json({ error: "missing RESEND_API_KEY" }, 500);
  if (!WEBHOOK_SECRET) return json({ error: "missing RESEND_WEBHOOK_SECRET" }, 500);

  const payload = await req.text();
  const valid = await verifySvix(payload, req.headers, WEBHOOK_SECRET);
  if (!valid) return json({ error: "invalid signature" }, 401);

  let event: ReceivedEvent;
  try {
    event = JSON.parse(payload);
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  if (event.type !== "email.received") {
    return json({ ok: true, skipped: event.type });
  }

  const emailId = event.data?.email_id;
  if (!emailId) return json({ error: "missing email_id" }, 400);

  const fromAddr = event.data?.from || "";
  // Don't re-forward our own fan-out (or other mail we send from the domain).
  if (fromAddr && isOurDomain(fromAddr)) {
    return json({ ok: true, skipped: "from our domain" });
  }

  const received = await resendGet(`/emails/receiving/${emailId}`);
  if (!received.ok) {
    return json({ error: "fetch received failed", detail: received.body }, 502);
  }

  const email = received.body;
  const guestFrom = email.from || fromAddr;
  const subject = email.subject || event.data?.subject || "(no subject)";

  const attachmentsResp = await resendGet(`/emails/receiving/${emailId}/attachments`);
  const attachmentMeta: Array<{
    id: string;
    filename?: string;
    content_type?: string;
    content_id?: string;
    download_url?: string;
  }> = attachmentsResp.ok ? (attachmentsResp.body?.data || []) : [];

  const attachments: Array<Record<string, string>> = [];
  for (const att of attachmentMeta) {
    if (!att.download_url) continue;
    try {
      const bin = await fetch(att.download_url);
      if (!bin.ok) continue;
      const buf = new Uint8Array(await bin.arrayBuffer());
      let binary = "";
      for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
      const contentId = att.content_id ? att.content_id.replace(/^<|>$/g, "") : undefined;
      attachments.push({
        filename: att.filename || "attachment",
        content: btoa(binary),
        ...(att.content_type ? { content_type: att.content_type } : {}),
        ...(contentId ? { content_id: contentId } : {}),
      });
    } catch {
      // Skip failed attachments; still forward the body.
    }
  }

  const sendBody: Record<string, unknown> = {
    from: FORWARD_FROM,
    to: FORWARD_TO,
    subject,
    reply_to: guestFrom || undefined,
    html: email.html || undefined,
    text: email.text || undefined,
  };
  if (!sendBody.html && !sendBody.text) {
    sendBody.text = `(Empty body)\n\nOriginal From: ${guestFrom}\nTo: ${(email.to || []).join(", ")}`;
  }
  if (attachments.length) sendBody.attachments = attachments;

  const sendResp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `inbound-forward-${emailId}`,
    },
    body: JSON.stringify(sendBody),
  });
  const sendText = await sendResp.text();
  let sendParsed: any = {};
  try {
    sendParsed = sendText ? JSON.parse(sendText) : {};
  } catch {
    sendParsed = { message: sendText.slice(0, 400) };
  }

  if (!sendResp.ok) {
    return json({ error: "forward send failed", detail: sendParsed }, 502);
  }

  return json({
    ok: true,
    forwarded_id: sendParsed.id,
    to: FORWARD_TO,
    from_guest: guestFrom,
  });
});
