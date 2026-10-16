// Invitation status from Resend. The list endpoint already includes last_event
// (sent, delivered, opened, clicked, bounced, …), so we never fetch message bodies.
//
// Open and click tracking are domain settings, not part of the send payload, and
// they only apply to mail sent after a tracking subdomain is verified. Mail sent
// while tracking is off never grows an "opened" event. Subjects that start with
// "[test]" (any case) are probes, not invitations.

const SUBJECT = 'Kajal & Adarsh · Mexico City · February 2027';
const FROM = 'k+a@kajal-adarsh.club';
const DOMAIN = 'kajal-adarsh.club';
const PAGE = 100;
const MAX_PAGES = 30;
const TTL = 60_000;

const LABELS = {
  opened: 'Opened',
  clicked: 'Opened',
  delivered: 'Delivered',
  sent: 'Sent',
  delivery_delayed: 'Delayed',
  bounced: 'Bounced',
  bounced_permanent: 'Bounced',
  bounced_transient: 'Bounced',
  bounced_undetermined: 'Bounced',
  complained: 'Complained',
  failed: 'Failed',
  suppressed: 'Suppressed',
  scheduled: 'Scheduled',
};

let cache = null;

export function isTestSubject(subject) {
  return /^\s*\[test\]/i.test(String(subject || ''));
}

export function addressOf(raw) {
  const s = String(raw || '').trim().toLowerCase();
  const wrapped = s.match(/<([^>]+)>/);
  return (wrapped ? wrapped[1] : s).trim();
}

export function isInvite(email) {
  const subject = String(email?.subject || '').trim();
  if (!subject || isTestSubject(subject) || subject !== SUBJECT) return false;
  return String(email.from || '').toLowerCase().includes(FROM);
}

export function labelFor(event) {
  if (!event) return 'Sent';
  return LABELS[event] || String(event);
}

// messages are newest first, as Resend returns them. The first real invite for
// an address wins, so a later page cannot overwrite a newer send.
export function indexInvites(messages) {
  const byEmail = {};
  for (const message of messages || []) {
    if (!isInvite(message)) continue;
    const addrs = [].concat(message.to || [], message.cc || [], message.bcc || []);
    for (const raw of addrs) {
      const email = addressOf(raw);
      if (!email || byEmail[email]) continue;
      byEmail[email] = {
        label: labelFor(message.last_event),
        event: message.last_event || null,
        at: iso(message.created_at),
      };
    }
  }
  return byEmail;
}

function iso(value) {
  if (!value) return null;
  const normalized = String(value).trim().replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1').replace(/\+00$/, 'Z');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function resend(key, path) {
  const res = await fetch(`https://api.resend.com${path}`, { headers: { Authorization: `Bearer ${key}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Resend ${res.status}`);
  return body;
}

async function listEmails(key) {
  const out = [];
  let after = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ limit: String(PAGE) });
    if (after) query.set('after', after);
    const body = await resend(key, `/emails?${query}`);
    const data = body.data || [];
    out.push(...data);
    if (!body.has_more || !data.length) break;
    after = data[data.length - 1].id;
  }
  return out;
}

async function openTracking(key) {
  const list = await resend(key, '/domains');
  const found = (list.data || []).find((domain) => domain.name === DOMAIN);
  if (!found) return false;
  const domain = await resend(key, `/domains/${found.id}`);
  // Both are required. A flag with no verified tracking subdomain does not insert a pixel.
  return Boolean(domain.open_tracking) && Boolean(domain.tracking_subdomain);
}

export async function inviteStatus() {
  const key = process.env.RESEND_API_KEY || '';
  if (!key) {
    return { unavailable: true, openTracking: false, byEmail: {}, reason: 'RESEND_API_KEY is not set' };
  }
  if (cache && cache.until > Date.now()) return cache.value;
  try {
    const [messages, tracking] = await Promise.all([listEmails(key), openTracking(key)]);
    const value = { unavailable: false, openTracking: tracking, byEmail: indexInvites(messages) };
    cache = { until: Date.now() + TTL, value };
    return value;
  } catch (error) {
    return { unavailable: true, openTracking: false, byEmail: {}, reason: error.message || 'Resend request failed' };
  }
}
