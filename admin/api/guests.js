// The admin site's only way into the guest list. Every request needs the admin
// session cookie (checked here as well as in the middleware); writes go to
// Supabase with the service role key, which never leaves the server.
//
//   GET                         guests, RSVP replies, and invitation status from Resend
//   POST    {row} | {rows}      add guests (rows with an id re-add a deleted guest: Undo)
//   POST    {place: {party, ids}}  put these guests in this party, in this order
//   PATCH   ?id=  {changes}     edit one guest
//   DELETE  ?id=                delete one guest; returns it, for Undo

import { enrichWithRsvps, inviteStatus } from '../lib/invites.js';
import { authed } from '../lib/session.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zfhhknasebbhaifabszd.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const COLS = 'id,party,sort_order,first_name,last_name,is_plus_one,display_name,events,email,phone,note,created_at,updated_at';
const EVENTS = ['welcome-party', 'saatak-haldi', 'baarat-wedding', 'after-party'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

class Bad extends Error {}

// only these fields, of the right types; the table's checks catch the rest
function clean(input, { insert = false } = {}) {
  if (!input || typeof input !== 'object') throw new Bad('expected an object');
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    switch (k) {
      case 'party':
      case 'sort_order': {
        const n = Number(v);
        if (!Number.isInteger(n) || (k === 'party' && (n < 1 || n > 9999))) throw new Bad(`${k} must be a whole number${k === 'party' ? ' from 1 to 9999' : ''}`);
        out[k] = n;
        break;
      }
      case 'first_name':
      case 'last_name':
      case 'email':
      case 'phone':
      case 'note':
        if (v !== null && typeof v !== 'string') throw new Bad(`${k} must be text`);
        out[k] = k === 'first_name' || k === 'last_name' ? (v || '').replace(/\s+/g, ' ').trim() : v;
        break;
      case 'is_plus_one':
        out[k] = Boolean(v);
        break;
      case 'events':
        if (v !== null && !(Array.isArray(v) && v.every((e) => EVENTS.includes(e)))) throw new Bad('unknown event');
        out[k] = v === null ? null : EVENTS.filter((e) => v.includes(e));
        break;
      case 'id':
      case 'created_at':
        if (!insert) break;
        if (k === 'id' && !UUID.test(String(v))) throw new Bad('bad id');
        out[k] = v;
        break;
      default:
        break;
    }
  }
  return out;
}

async function db(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(body?.message || `Supabase ${res.status}`);
  return body;
}

async function guard(request, write) {
  if (!KEY) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set' }, 500);
  if (!(await authed(request))) return json({ error: 'signed out' }, 401);
  if (write) {
    // the cookie is SameSite=Strict; this also refuses cross-site form posts
    if (!(request.headers.get('content-type') || '').startsWith('application/json')) return json({ error: 'expected JSON' }, 415);
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: 'wrong origin' }, 403);
  }
  return null;
}

async function run(fn) {
  try {
    return await fn();
  } catch (e) {
    return json({ error: e.message }, e instanceof Bad ? 400 : 502);
  }
}

export async function GET(request) {
  return (await guard(request, false)) || run(async () => {
    const [guests, rsvps, invitesRaw] = await Promise.all([
      db(`wedding_guests?select=${COLS}&order=party,sort_order,created_at,id`),
      db('wedding_rsvps?select=id,created_at,name,party,attending,events,dietary,plus_one,submission_id,submitted_by&order=created_at.desc'),
      inviteStatus(),
    ]);
    // RSVP on file (same party) counts as Opened alongside Resend opened/clicked.
    const invites = enrichWithRsvps(invitesRaw, guests, rsvps);
    return json({ guests, rsvps, invites });
  });
}

export async function POST(request) {
  return (await guard(request, true)) || run(async () => {
    const body = await request.json().catch(() => null);
    if (body?.place) {
      const party = Number(body.place.party);
      const ids = body.place.ids;
      if (!Number.isInteger(party) || party < 1 || party > 9999) throw new Bad('party must be a whole number from 1 to 9999');
      if (!Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every((id) => UUID.test(String(id)))) throw new Bad('bad ids');
      await db('rpc/wedding_guests_place', { method: 'POST', body: JSON.stringify({ p_party: party, p_ids: ids }) });
      const guests = await db(`wedding_guests?select=${COLS}&id=in.(${ids.join(',')})`);
      return json({ guests });
    }
    const rows = (body?.rows || (body?.row ? [body.row] : [])).map((r) => clean(r, { insert: true }));
    if (!rows.length || rows.length > 500) throw new Bad('nothing to add');
    for (const r of rows) if (r.party === undefined) throw new Bad('a guest needs a party');
    // rows may name different fields; the rest take the table's defaults
    const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))].join(',');
    const guests = await db(`wedding_guests?select=${COLS}&columns=${columns}`, { method: 'POST', body: JSON.stringify(rows) });
    return json({ guests });
  });
}

export async function PATCH(request) {
  return (await guard(request, true)) || run(async () => {
    const id = new URL(request.url).searchParams.get('id') || '';
    if (!UUID.test(id)) throw new Bad('bad id');
    const changes = clean(await request.json().catch(() => null));
    if (!Object.keys(changes).length) throw new Bad('nothing to change');
    const [guest] = await db(`wedding_guests?id=eq.${id}&select=${COLS}`, { method: 'PATCH', body: JSON.stringify(changes) });
    if (!guest) return json({ error: 'not found' }, 404);
    return json({ guest });
  });
}

export async function DELETE(request) {
  return (await guard(request, true)) || run(async () => {
    const id = new URL(request.url).searchParams.get('id') || '';
    if (!UUID.test(id)) throw new Bad('bad id');
    const [guest] = await db(`wedding_guests?id=eq.${id}&select=${COLS}`, { method: 'DELETE' });
    if (!guest) return json({ error: 'not found' }, 404);
    return json({ guest });
  });
}
