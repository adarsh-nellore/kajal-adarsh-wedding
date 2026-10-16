/* =========================================================================
   K + A · CDMX 2027 — Slideshow engine
   Auto-starts on DOMContentLoaded. No scroll. No click-to-begin.
   ========================================================================= */

(() => {
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------------------------------------------------------------------
  // Supabase (anon credentials — safe to expose; RLS allows insert only).
  // ---------------------------------------------------------------------
  const SUPABASE_URL = 'https://zfhhknasebbhaifabszd.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_dJcPYQhdaQyWeJ-VAmc9QA_pD7eIyJB';

  // Clean up the legacy lifetime-lockout flag from earlier builds. Upserts
  // on email handle dedupe at the database level now.
  try { localStorage.removeItem('ka-rsvp-submitted'); } catch (_) {}

  // ---------------------------------------------------------------------
  // Pausable + abortable scheduler.
  // Every timed wait in the slideshow goes through `sleep`. Pausing the
  // slideshow halts all pending sleeps (and audio); skipping a scene
  // aborts them, rejecting with a sentinel that the run loop catches.
  // ---------------------------------------------------------------------
  const pending = new Set();
  let paused = false;
  let abortCtl = null;
  const ABORT = Symbol('aborted');

  function scheduleEntry(entry) {
    entry.startedAt = performance.now();
    entry.timer = setTimeout(() => {
      if (entry.signalCleanup) entry.signalCleanup();
      pending.delete(entry);
      entry.resolve();
    }, entry.remaining);
  }

  function sleep(ms) {
    return new Promise((resolve, reject) => {
      const signal = abortCtl ? abortCtl.signal : null;
      if (signal && signal.aborted) { reject(ABORT); return; }

      const entry = { remaining: ms, resolve, timer: null, startedAt: 0 };

      const onAbort = () => {
        if (entry.timer) clearTimeout(entry.timer);
        pending.delete(entry);
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(ABORT);
      };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      entry.signalCleanup = () => signal && signal.removeEventListener('abort', onAbort);

      pending.add(entry);
      if (!paused) scheduleEntry(entry);
    });
  }

  function pauseAll() {
    if (paused) return;
    paused = true;
    pending.forEach(entry => {
      if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
        const elapsed = performance.now() - entry.startedAt;
        entry.remaining = Math.max(0, entry.remaining - elapsed);
      }
    });
    if (audio) audio.pause();
  }

  function resumeAll() {
    if (!paused) return;
    paused = false;
    pending.forEach(entry => { if (!entry.timer) scheduleEntry(entry); });
    if (audio) audio.play().catch(() => {});
  }

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const TYPE_IN  = REDUCED ? 0 : 45;
  const TYPE_OUT = REDUCED ? 0 : 22;

  // ---------------------------------------------------------------------
  // Music — starts silently via autoplay+muted; unmutes on first input
  // or via the top-right toggle. Toggle reflects on/off state.
  // ---------------------------------------------------------------------
  const audio = $('#music');
  if (audio) {
    audio.addEventListener('error', () =>
      console.warn('[K+A] Audio failed to load. Place cerca-de-ti.mp3 in assets/.')
    , { once: true });
  }
  const audioToggle = $('#audio-toggle');
  let firstUnmuteDone = false;

  function setToggle(state) {
    if (audioToggle) {
      audioToggle.dataset.state = state;
      audioToggle.setAttribute('aria-label', state === 'on' ? 'Mute audio' : 'Unmute audio');
    }
  }

  function unmuteMusic() {
    if (!audio) return;
    audio.muted = false;
    if (!firstUnmuteDone) {
      try { audio.currentTime = 0; } catch (_) {}
    }
    if (!paused) audio.play().catch(() => {});
    if (!firstUnmuteDone) {
      firstUnmuteDone = true;
      fadeMusic(0.55, 1200);
    } else {
      audio.volume = 0.55;
    }
    setToggle('on');
  }

  function muteMusic() {
    if (!audio) return;
    audio.muted = true;
    setToggle('off');
  }

  function startMusic() {
    if (!audio) return;

    if (audio.muted) {
      // No user gesture has happened yet — keep silent and wait for one.
      audio.volume = 0.55;
      audio.play().catch(() => {});
      setToggle('on');

      const events = ['pointerdown','pointermove','mousemove','click','keydown','touchstart','wheel','scroll'];
      const onFirstInput = () => {
        events.forEach(ev => document.removeEventListener(ev, onFirstInput, true));
        if (!firstUnmuteDone) unmuteMusic();
      };
      events.forEach(ev => document.addEventListener(ev, onFirstInput, { capture: true, passive: true }));
    } else {
      // The cover click already unmuted us; fade up from 0.
      firstUnmuteDone = true;
      audio.play().catch(() => {});
      fadeMusic(0.55, 1200);
      setToggle('on');
    }

    if (audioToggle) {
      audioToggle.addEventListener('click', () => {
        if (audio.muted) unmuteMusic();
        else muteMusic();
      });
    }
  }

  let fadeId = 0;
  function fadeMusic(targetVol, durMs) {
    if (!audio) return Promise.resolve();
    const myId = ++fadeId;
    return new Promise(resolve => {
      const v0 = audio.volume;
      let elapsed = 0;
      let last = performance.now();
      const tick = () => {
        if (myId !== fadeId) { resolve(); return; }
        const now = performance.now();
        if (!paused) elapsed += now - last;
        last = now;
        const t = Math.min(1, elapsed / durMs);
        audio.volume = v0 + (targetVol - v0) * t;
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      tick();
    });
  }

  // ---------------------------------------------------------------------
  // Typewriter
  // ---------------------------------------------------------------------

  // Plain text type-in (extends, never replaces, so we can append to a line).
  async function type(el, text, speed = TYPE_IN) {
    el.classList.add('is-typing');
    try {
      if (REDUCED) { el.append(text); return; }
      for (const ch of text) {
        el.append(ch);
        await sleep(speed);
      }
    } finally {
      el.classList.remove('is-typing');
    }
  }

  // Rich type-in: segments = [{text, italic?}]
  async function typeRich(el, segments, speed = TYPE_IN) {
    el.classList.add('is-typing');
    try {
      for (const seg of segments) {
        const target = seg.italic ? document.createElement('em') : null;
        if (target) el.appendChild(target);
        const sink = target || el;
        if (REDUCED) {
          sink.append(seg.text);
          continue;
        }
        for (const ch of seg.text) {
          sink.append(ch);
          await sleep(speed);
        }
      }
    } finally {
      el.classList.remove('is-typing');
    }
  }

  // Fade an element out, then clear its content. Replaces the old
  // character-by-character backspace.
  async function untype(el, durMs = 1400) {
    if (!el) return;
    el.classList.remove('is-typing');
    el.classList.add('is-out');
    if (REDUCED) {
      while (el.firstChild) el.removeChild(el.firstChild);
      el.classList.remove('is-out');
      return;
    }
    await sleep(durMs);
    while (el.firstChild) el.removeChild(el.firstChild);
    el.classList.remove('is-out');
  }

  async function untypeAll(els, durMs = 1400) {
    return Promise.all(els.map(el => untype(el, durMs)));
  }

  // ---------------------------------------------------------------------
  // Photo helpers
  // ---------------------------------------------------------------------
  const showPhoto = (el) => el && el.classList.add('is-in');
  const hidePhoto = (el) => el && el.classList.remove('is-in');

  async function fadePhoto(el, durMs = 1400) {
    return new Promise(resolve => {
      const onEnd = () => { el.removeEventListener('transitionend', onEnd); resolve(); };
      el.addEventListener('transitionend', onEnd);
      // Safety timeout in case transitionend doesn't fire
      setTimeout(resolve, durMs + 200);
    });
  }

  // ---------------------------------------------------------------------
  // Scene activation
  //
  // Cross-fading scenes vs. blank transitions:
  //   `.scene` uses `transition: opacity 700ms`. When we remove `is-active`
  //   from the current scene and add it to the next in the same frame,
  //   both opacity transitions run in parallel — a true cross-fade.
  //
  //   The old flow emptied the current scene (untype + hidePhoto + tail
  //   sleep) BEFORE calling activate, so the user saw a blank scene
  //   container for ~2s before any cross-fade started. We now leave the
  //   outgoing scene's content visible and let the parent's opacity drop
  //   take it down. Optionally, the incoming photo gets `is-in` in the
  //   same frame so the new image fades in concurrently with the new
  //   scene container.
  // ---------------------------------------------------------------------
  let currentScene = null;
  async function activate(id, opts = {}) {
    const next = $('#' + id);
    if (currentScene) currentScene.classList.remove('is-active');
    next.classList.add('is-active');
    if (opts.enterPhoto) {
      const photo = $('.photo', next);
      if (photo) photo.classList.add('is-in');
    }
    currentScene = next;
    const delay = opts.delay !== undefined ? opts.delay : 700;
    if (delay > 0) await sleep(delay);
  }

  // Convenience: select inside the current scene
  const c = (sel) => $(sel, currentScene);
  const cAll = (sel) => $$(sel, currentScene);

  // Scene 6 (form): the photo is vertically centered in its column while the
  // copy is top-aligned, so the heading starts above the image. Align the top
  // of the copy to the top of the (centered) photo by giving the copy a
  // padding-top equal to the photo's centering offset. The photo height is
  // capped dynamically, so this is measured live rather than expressed in CSS.
  // Desktop only — on mobile the layout is a single stacked column.
  function alignFormCopyToPhoto() {
    const scene = document.getElementById('s6');
    if (!scene) return;
    const copy = scene.querySelector('.copy--left-top');
    const photo = scene.querySelector('.photo--portrait');
    if (!copy || !photo) return;
    if (window.matchMedia('(max-width: 900px)').matches) {
      copy.style.paddingTop = '';
      return;
    }
    const heading = copy.firstElementChild || copy;
    // The copy and photo sit in the same auto-height grid row, so adding
    // padding to the copy grows the row and nudges the (centered) photo down
    // too. Iterate to convergence — it settles in 1–2 passes.
    let pad = 0;
    copy.style.paddingTop = '0px';
    for (let i = 0; i < 5; i++) {
      const diff = photo.getBoundingClientRect().top - heading.getBoundingClientRect().top;
      if (Math.abs(diff) < 0.5) break;
      pad = Math.max(0, pad + 2 * diff);
      copy.style.paddingTop = pad + 'px';
    }
    copy.style.paddingTop = Math.round(pad) + 'px';
  }

  // ---------------------------------------------------------------------
  // Scenes
  // ---------------------------------------------------------------------

  async function scene1() {
    // Scene fades in as the cover dismisses; hold on black for 1s, then photo.
    await activate('s1');

    const lead = c('.line-lead');
    const fade = c('.city-fade');

    // First thing the viewer sees is the "Meet us in" line on black.
    await type(lead, 'Meet us in');

    await sleep(1000);
    // Photo and "Mexico City" appear together.
    requestAnimationFrame(() => {
      fade.classList.add('is-in');
      showPhoto(c('.photo'));
    });

    await sleep(2000);
    captureSceneSnapshot(0);
    await sleep(3000);

    // 1s breathing beat between s1 and s2 so the Mexico City moment lands
    // before the cross-fade to "amor" begins.
    await sleep(1000);

    // No explicit exit — scene 2's activate() cross-fades this scene out
    // via the parent's 700ms opacity drop (carries lead, city-fade, and
    // photo with it). Matches scenes 3/4/6/7. Mexico City disappears
    // quickly instead of holding through a long untype + tail sleep.
  }

  async function scene2() {
    await activate('s2');

    // Pre-baked structure (see index.html): an empty `.line-lead` followed
    // by an opacity-0 `.amor-fade` span. The fade span reserves space so
    // the right-aligned line does not shift when the closing piece appears.
    const lead = c('.line-lead');
    const fade = c('.amor-fade');

    await type(lead, 'For a weekend celebrating');

    // 1.5s beat, then "amor ♥" and the photo fade in together.
    await sleep(1500);
    requestAnimationFrame(() => {
      fade.classList.add('is-in');
      showPhoto(c('.photo'));
    });

    // Wait for the amor fade to complete (2s).
    await sleep(2000);
    captureSceneSnapshot(1);
    await sleep(2500);

    // Exit: fade lead-in, amor and photo simultaneously.
    fade.classList.remove('is-in');
    fade.classList.add('is-out');
    hidePhoto(c('.photo'));
    await untype(lead);
    await sleep(900);
  }

  async function scene3() {
    // Photo fades in concurrently with the scene cross-fade (no blank gap).
    await activate('s3', { enterPhoto: true });

    const dDate = c('[data-line="d-date"]');
    const dFri  = c('[data-line="d-fri"]');
    const dSat  = c('[data-line="d-sat"]');
    const dSun  = c('[data-line="d-sun"]');

    // Brief settle beat so the photo isn't typed-over the instant it lands.
    await sleep(250);

    await type(dDate, 'February 19 to 21, 2027.');
    await sleep(1100);

    await type(dFri, 'Friday. Welcome dinner.');
    await sleep(500);

    await type(dSat, 'Saturday. Haldi + Saatak.');
    await sleep(500);

    await type(dSun, 'Sunday. Wedding + Reception.');

    captureSceneSnapshot(2);

    // Read-time hold (1s shorter than before so this screen exits sooner).
    await sleep(4500);

    // Explicit exit + 1s gap on black before the next screen. Deactivating
    // here (instead of letting scene 4's activate cross-fade) fades this
    // scene out on its own, then we hold on black so there's a clear beat
    // between this screen and the next.
    if (currentScene) currentScene.classList.remove('is-active');
    currentScene = null;
    await sleep(1000);
  }

  async function scene4() {
    await activate('s4', { enterPhoto: true });

    const lQ = c('[data-line="why-q"]');
    const l1 = c('[data-line="why-1"]');
    const l2 = c('[data-line="why-2"]');
    const l3 = c('[data-line="why-3"]');
    const l5 = c('[data-line="why-5"]');

    const SLOW = REDUCED ? 0 : 60;

    await sleep(250);

    await type(lQ, 'We chose Mexico City for…', SLOW);
    await sleep(700);

    await type(l1, 'the vibrant energy,', SLOW);
    await sleep(700);
    await type(l2, 'the incredible food,', SLOW);
    await sleep(700);
    await type(l3, 'and the cinematic beauty.', SLOW);
    await sleep(900);

    await typeRich(l5, [
      { text: 'Also… ' },
      { text: 'por qué no,', italic: true }
    ], SLOW);
    await sleep(600);
    await typeRich(l5, [
      { text: ' amigo?', italic: true }
    ], SLOW);

    captureSceneSnapshot(3);

    // Read-time hold; the next scene's activate() cross-fades this out.
    await sleep(7000);
  }

  async function scene6() {
    await activate('s6');

    // Reset any stale class state from a previous play so the entrance order
    // (heading → fields → actions) is clean. The mobile CSS now relies on
    // .is-in alone to reveal .actions; .is-locked must NOT be present until
    // we've decided what to do post-stagger.
    const actionsEl0 = c('.actions');
    if (actionsEl0) actionsEl0.classList.remove('is-in', 'is-locked');

    // Align the copy to the photo column up front — before anything reveals —
    // so the heading is already at its final position. The photo figure
    // reserves its full height via aspect-ratio even while still opacity:0, so
    // this measures correctly here. Doing it now (instead of after showPhoto)
    // means the layout is settled before the photo fades in, so the page no
    // longer jumps when the photo appears.
    alignFormCopyToPhoto();
    requestAnimationFrame(alignFormCopyToPhoto);

    // 1. Type the heading.
    await type(c('[data-line="form-q"]'), FORM_Q_TEXT);
    await sleep(500);
    showPhoto(c('.photo'));
    // Re-confirm alignment (no-op visually — value is already set), guarding
    // against late font metrics shifting the copy height.
    requestAnimationFrame(alignFormCopyToPhoto);

    // 2. Reveal fields one-by-one.
    const fields = cAll('.field');
    for (const f of fields) {
      f.classList.add('is-in');
      await sleep(500);
    }

    // 3. THEN bind input listeners and run the initial refreshSubmit, which
    // adds .is-in to .actions for the first time. On mobile this is the
    // moment Submit appears (greyed out until both required fields are
    // filled); on desktop, .actions stays hidden until the inputs are valid.
    const form    = c('#rsvp');
    const actions = c('.actions');
    const nameEl  = form.elements.name;
    const emailEl = form.elements.email;

    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    const submitBtn = actions.querySelector('button[type="submit"]');

    const refreshSubmit = () => {
      const ok = nameEl.value.trim() && emailEl.value.trim();
      if (isMobile) {
        actions.classList.remove('is-locked');
        actions.classList.add('is-in');
        if (submitBtn) {
          submitBtn.toggleAttribute('disabled', !ok);
          submitBtn.setAttribute('aria-disabled', String(!ok));
        }
      } else if (ok) {
        actions.classList.remove('is-locked');
        actions.classList.add('is-in');
      } else {
        actions.classList.remove('is-in');
        actions.classList.add('is-locked');
      }
    };
    nameEl.addEventListener('input', refreshSubmit);
    emailEl.addEventListener('input', refreshSubmit);
    refreshSubmit();

    const errEl = form.querySelector('.rsvp__error');
    const setError = (msg) => { if (errEl) errEl.textContent = msg || ''; };

    // Wait for submission OR navigation abort
    const intent = await new Promise((resolve, reject) => {
      const signal = abortCtl ? abortCtl.signal : null;

      const finish = (data) => {
        cleanup();
        $$('input, button', form).forEach(el => el.setAttribute('disabled', 'true'));
        resolve(data);
      };

      const onSubmit = async (e) => {
        e.preventDefault();
        const name  = form.elements.name.value.trim();
        const email = form.elements.email.value.trim().toLowerCase();
        if (!name) { nameEl.focus(); return; }
        if (!email) { emailEl.focus(); return; }
        const address1 = form.elements.address1.value.trim();
        const address2 = form.elements.address2.value.trim();
        const data = {
          name,
          email,
          phone:      form.elements.phone.value.trim(),
          address1,
          address2,
          address:    [address1, address2].filter(Boolean).join(', '),
          optInRecs:  form.elements.recs.checked
        };
        window.__rsvp = data;

        if (submitBtn) {
          submitBtn.setAttribute('disabled', 'true');
          submitBtn.setAttribute('aria-disabled', 'true');
        }
        setError('');

        const payload = {
          name:       data.name,
          email:      data.email,
          phone:      data.phone,
          address:    data.address,
          wants_recs: data.optInRecs,
          user_agent: navigator.userAgent || '',
        };

        try {
          // Append-only: each submission is a new row. Hosts dedupe by
          // email + created_at when reviewing. Avoids the RLS UPDATE
          // permission required by an upsert, and gives a clean audit
          // trail when a guest re-submits with edits.
          const res = await fetch(`${SUPABASE_URL}/rest/v1/rsvps`, {
            method: 'POST',
            headers: {
              'apikey':        SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type':  'application/json',
              'Prefer':        'return=minimal',
            },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const txt = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status} ${txt.slice(0, 200)}`);
          }

          fetch(`${SUPABASE_URL}/functions/v1/notify-rsvp`, {
            method: 'POST',
            headers: {
              'apikey':        SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type':  'application/json',
            },
            body: JSON.stringify({ ...payload, created_at: new Date().toISOString() }),
            keepalive: true,
          }).catch(() => {});

          finish(data);
        } catch (err) {
          console.warn('[K+A] RSVP insert failed:', err);
          setError('Could not save — please check your connection and try again.');
          if (submitBtn) {
            submitBtn.removeAttribute('disabled');
            submitBtn.setAttribute('aria-disabled', 'false');
          }
        }
      };

      const onAbort = () => { cleanup(); reject(ABORT); };

      function cleanup() {
        form.removeEventListener('submit', onSubmit);
        nameEl.removeEventListener('input', refreshSubmit);
        emailEl.removeEventListener('input', refreshSubmit);
        if (signal) signal.removeEventListener('abort', onAbort);
      }

      form.addEventListener('submit', onSubmit);
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });

    captureSceneSnapshot(4);

    // Brief acknowledgment of the submission; then return so the next
    // scene's activate() cross-fades the whole form (photo, fields,
    // actions, form-q) out together with the scene container.
    await sleep(600);

    return intent;
  }

  async function revealSignature(container) {
    const sig = $('.sig-ink', container);
    if (!sig) return;

    sig.classList.remove('is-in');

    if (REDUCED) {
      sig.src = SIG_FINAL;
      sig.classList.add('is-in');
      return;
    }

    // Don't clear src — an empty <img> collapses to 0 height and mobile
    // flex centering jumps when the asset decodes. Cache-bust so replays
    // restart the draw animation.
    sig.src = SIG_ANIM + '?t=' + Date.now();
    sig.classList.add('is-in');
    await sleep(SIG_DRAW_MS);
  }

  function showSignatureFinal(container) {
    const sig = $('.sig-ink', container);
    if (!sig) return;
    sig.src = SIG_FINAL;
    sig.classList.add('is-in');
  }

  async function scene7() {
    await activate('s7', { enterPhoto: true });

    // Decode signature assets during the typewriter beats so reveal doesn't
    // shift layout when the <img> src is assigned.
    [SIG_ANIM, SIG_FINAL].forEach((src) => { const img = new Image(); img.src = src; });

    const t2a = c('[data-line="t-2a"]');
    const t2b = c('[data-line="t-2b"]');
    const t3  = c('[data-line="t-3"]');
    const t4  = c('[data-line="t-4"]');
    const t6  = c('[data-line="t-6"]');
    const t5  = c('[data-line="t-5"]');

    await type(t2a, 'February 19–21, 2027');
    await sleep(300);
    await type(t2b, 'Mexico City');
    await sleep(800);
    await type(t3, 'Hotel block will be arranged.');
    await sleep(800);
    await type(t4, 'More details and a formal invitation to follow later this summer.');
    await sleep(900);
    await type(t6, 'We can’t wait to celebrate with you!');
    await sleep(900);
    await revealSignature(t5);

    captureSceneSnapshot(5);

    // Typing is done — let the moment land, then fade the music out.
    // Volume goes to 0 but playback continues so back-navigation can
    // fade it back up.
    await sleep(1200);
    fadeMusic(0, 5000);

    // Hold; user can advance to the logo finale via the next arrow.
    await sleep(86400000);
  }

  async function scene8() {
    await activate('s8');
    const logo = c('.logo-mark');
    if (logo) logo.classList.add('is-in');
    await sleep(1400);
    captureSceneSnapshot(6);

    // If music is still up (user skipped scene 7 quickly), fade it out here.
    if (audio && audio.volume > 0.05) fadeMusic(0, 3000);

    await sleep(86400000);
  }

  // ---------------------------------------------------------------------
  // Navigation: prev / next
  // ---------------------------------------------------------------------
  const scenes = [scene1, scene2, scene3, scene4, scene6, scene7, scene8];
  const sceneIds = ['s1','s2','s3','s4','s6','s7','s8'];
  const FORM_Q_TEXT = 'Please share your contact information so we can send you an invitation and updates:';
  const SIG_ANIM = 'assets/signature.webp?v=4';
  const SIG_FINAL = 'assets/signature-final.png?v=4';
  const SIG_DRAW_MS = 2520;
  let currentIndex = 0;

  // Snapshot every `.line` element's initial innerHTML at boot so the
  // pre-baked structure on the amor line (lead + fade span) survives a
  // reset. Bare lines snapshot as "" and get cleared as before.
  const lineSnapshot = new Map();
  $$('.line').forEach(el => lineSnapshot.set(el, el.innerHTML));
  // Also snapshot any nested ".amor-fade" so resets put it back to opacity 0.
  function resetScene(idx) {
    const scene = $('#' + sceneIds[idx]);
    if (!scene) return;
    $$('.line', scene).forEach(el => {
      el.innerHTML = lineSnapshot.get(el) || '';
      el.classList.remove('is-typing', 'is-out');
    });
    $$('.sig-ink', scene).forEach(el => {
      el.classList.remove('is-in');
      el.removeAttribute('src');
    });
    $$('.line-lead, .amor-fade, .city-fade', scene).forEach(el => el.classList.remove('is-typing', 'is-in', 'is-out'));
    $$('.photo', scene).forEach(el => el.classList.remove('is-in'));
    $$('.field, .actions', scene).forEach(el => el.classList.remove('is-in'));
    $$('.actions--single', scene).forEach(el => el.classList.add('is-locked'));
    $$('input, button[type="submit"]', scene).forEach(el => el.removeAttribute('disabled'));
    $$('input[type="text"], input[type="email"], input[type="tel"]', scene).forEach(el => { el.value = ''; });
    $$('input[type="checkbox"]', scene).forEach(el => { el.checked = false; });
    $$('.logo-mark', scene).forEach(el => el.classList.remove('is-in'));
  }

  // ---------------------------------------------------------------------
  // Deferred scene reset
  //
  // resetScene wipes lines, clears `is-in` on the photo, restores
  // line-snapshots and form inputs. If called while the just-finished
  // scene is still cross-fading out, those changes are visible. So we
  // schedule the reset for AFTER the scene-cross-fade completes (700ms
  // CSS transition + small buffer = 800ms). If we re-enter the scene
  // during that window (back-nav -> snapshot restore), we cancel the
  // pending reset to avoid clobbering the restored state.
  // ---------------------------------------------------------------------
  const pendingResets = new Map();
  function scheduleSceneReset(idx, delayMs = 800) {
    cancelSceneReset(idx);
    const t = setTimeout(() => {
      pendingResets.delete(idx);
      resetScene(idx);
    }, delayMs);
    pendingResets.set(idx, t);
  }
  function cancelSceneReset(idx) {
    const t = pendingResets.get(idx);
    if (t) { clearTimeout(t); pendingResets.delete(idx); }
  }

  // Per-play snapshots: capture each scene's DOM at peak visibility so a
  // back-nav restores final state instead of replaying typewriter + fades.
  const snapshots = new Map();

  function captureSceneSnapshot(idx) {
    const scene = $('#' + sceneIds[idx]);
    if (!scene) return;
    const snap = { lines: [], lead: null, photoIn: false, decoIn: [], fieldsIn: false, actionsIn: false, formValues: null };

    $$('.line', scene).forEach(el => {
      if (el.dataset.line) snap.lines.push([el.dataset.line, el.innerHTML]);
    });
    const lead = $('.line-lead', scene);
    if (lead) snap.lead = lead.innerHTML;

    const photo = $('.photo', scene);
    if (photo) snap.photoIn = photo.classList.contains('is-in');

    $$('.city-fade, .amor-fade', scene).forEach(el => {
      const cls = el.classList.contains('city-fade') ? 'city-fade' : 'amor-fade';
      snap.decoIn.push([cls, el.classList.contains('is-in')]);
    });

    const fields = $$('.field', scene);
    if (fields.length) snap.fieldsIn = fields.every(f => f.classList.contains('is-in'));
    const actions = $('.actions', scene);
    if (actions) snap.actionsIn = actions.classList.contains('is-in');
    if (window.__rsvp) snap.formValues = { ...window.__rsvp };

    if (sceneIds[idx] === 's6') {
      snap.fieldsIn = true;
      snap.actionsIn = true;
    }

    snapshots.set(idx, snap);
  }

  function restoreFormSceneReady(scene) {
    const q = $('[data-line="form-q"]', scene);
    if (q) {
      q.innerHTML = FORM_Q_TEXT;
      q.classList.remove('is-typing', 'is-out');
    }

    $$('.field', scene).forEach(f => {
      f.classList.add('is-in');
      f.classList.remove('is-out');
    });

    const photo = $('.photo', scene);
    if (photo) photo.classList.add('is-in');

    const actions = $('.actions', scene);
    if (actions) {
      actions.classList.add('is-in', 'is-locked');
      actions.classList.remove('is-out');
    }

    const form = $('#rsvp', scene);
    if (form) {
      const clear = (el) => {
        if (!el) return;
        if (el.type === 'checkbox') el.checked = false;
        else el.value = '';
        el.removeAttribute('disabled');
        el.removeAttribute('aria-disabled');
      };
      clear(form.elements.name);
      clear(form.elements.email);
      clear(form.elements.phone);
      clear(form.elements.address1);
      clear(form.elements.address2);
      clear(form.elements.recs);
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.setAttribute('disabled', 'true');
        submitBtn.setAttribute('aria-disabled', 'true');
      }
      const err = form.querySelector('.rsvp__error');
      if (err) err.textContent = '';
    }
  }

  function restoreSceneSnapshot(idx) {
    const snap = snapshots.get(idx);
    if (!snap) return false;
    const scene = $('#' + sceneIds[idx]);
    if (!scene) return false;

    scene.classList.add('is-restoring');

    if (sceneIds[idx] === 's6') {
      restoreFormSceneReady(scene);
      snapshots.delete(idx);
      void scene.offsetWidth;
      requestAnimationFrame(() => { scene.classList.remove('is-restoring'); alignFormCopyToPhoto(); });
      return true;
    }

    snap.lines.forEach(([dataLine, html]) => {
      const el = $(`[data-line="${dataLine}"]`, scene);
      if (el) { el.innerHTML = html; el.classList.remove('is-typing', 'is-out'); }
    });

    if (sceneIds[idx] === 's7') {
      const t5 = $('[data-line="t-5"]', scene);
      if (t5) showSignatureFinal(t5);
    }
    if (snap.lead !== null) {
      const lead = $('.line-lead', scene);
      if (lead) { lead.innerHTML = snap.lead; lead.classList.remove('is-typing', 'is-out'); }
    }

    const photo = $('.photo', scene);
    if (photo) { photo.classList.toggle('is-in', snap.photoIn); photo.classList.remove('is-out'); }

    snap.decoIn.forEach(([cls, isIn]) => {
      const el = $('.' + cls, scene);
      if (el) { el.classList.toggle('is-in', isIn); el.classList.remove('is-out', 'is-typing'); }
    });

    if (snap.fieldsIn) $$('.field', scene).forEach(f => f.classList.add('is-in'));
    const actions = $('.actions', scene);
    if (actions) { actions.classList.toggle('is-in', snap.actionsIn); actions.classList.remove('is-locked'); }
    if (snap.formValues) {
      const form = $('#rsvp', scene);
      if (form) {
        form.elements.name.value     = snap.formValues.name     || '';
        form.elements.email.value    = snap.formValues.email    || '';
        form.elements.phone.value    = snap.formValues.phone    || '';
        form.elements.address1.value = snap.formValues.address1 || '';
        form.elements.address2.value = snap.formValues.address2 || '';
        form.elements.recs.checked   = !!snap.formValues.optInRecs;
        $$('input, button', form).forEach(el => el.setAttribute('disabled', 'true'));
      }
    }

    const logo = $('.logo-mark', scene);
    if (logo) logo.classList.add('is-in');

    // Force reflow so the property writes commit without transition, then
    // drop the is-restoring class on the next frame.
    void scene.offsetWidth;
    requestAnimationFrame(() => scene.classList.remove('is-restoring'));
    return true;
  }

  function updateNavButtons() {
    const prevBtn = $('#prev');
    const nextBtn = $('#next');
    if (prevBtn) prevBtn.toggleAttribute('disabled', currentIndex === 0);
    if (nextBtn) nextBtn.toggleAttribute('disabled', currentIndex >= scenes.length - 1);
  }

  function nav(delta) {
    const target = currentIndex + delta;
    if (target < 0 || target >= scenes.length) return;
    currentIndex = target;
    if (paused) {
      // Unpause when navigating so the new scene can run.
      const ctrl = $('#control');
      if (ctrl) {
        ctrl.dataset.state = 'playing';
        ctrl.setAttribute('aria-label', 'Pause');
      }
      resumeAll();
    }
    if (abortCtl) abortCtl.abort();
  }

  // ---------------------------------------------------------------------
  // Run
  // ---------------------------------------------------------------------
  async function run() {
    startMusic();

    while (currentIndex < scenes.length) {
      abortCtl = new AbortController();
      const idx = currentIndex;
      updateNavButtons();

      // If the user navigated back from a scene where music had been fading
      // down (the final thank-you scene, now at index 5), restore volume.
      if (idx < scenes.length - 1 && audio && audio.volume < 0.4) {
        fadeMusic(0.55, 1500);
      }

      // Already played to completion — restore final state and hold for next nav.
      if (snapshots.has(idx)) {
        try {
          // Cancel any pending reset for this scene; we're re-entering it.
          cancelSceneReset(idx);
          // Restore content BEFORE the cross-fade so the new scene fades
          // in with its final-state DOM (no blank container appearing
          // first, then content popping in).
          restoreSceneSnapshot(idx);
          await activate(sceneIds[idx]);
          await sleep(86400000);
        } catch (err) {
          if (err !== ABORT) {
            console.error('Slideshow error:', err);
            return;
          }
        }
        continue;
      }

      try {
        await scenes[idx]();
        // Auto-advance only on natural completion (user didn't navigate).
        if (currentIndex === idx) currentIndex++;
      } catch (err) {
        if (err !== ABORT) {
          console.error('Slideshow error:', err);
          return;
        }
        // Aborted via prev/next — currentIndex was updated by `nav`.
      }
      // Defer reset until the scene cross-fade is done so we don't wipe
      // the outgoing scene's DOM while it's still visibly fading out.
      scheduleSceneReset(idx);
    }

    updateNavButtons();
  }

  // ---------------------------------------------------------------------
  // Controls wiring
  // ---------------------------------------------------------------------
  function bindControls() {
    const ctrl = $('#control');
    if (ctrl) {
      ctrl.addEventListener('click', () => {
        if (paused) {
          resumeAll();
          ctrl.dataset.state = 'playing';
          ctrl.setAttribute('aria-label', 'Pause');
        } else {
          pauseAll();
          ctrl.dataset.state = 'paused';
          ctrl.setAttribute('aria-label', 'Play');
        }
      });
    }

    const prevBtn = $('#prev');
    if (prevBtn) prevBtn.addEventListener('click', () => nav(-1));

    const nextBtn = $('#next');
    if (nextBtn) nextBtn.addEventListener('click', () => nav(+1));

    // Keep the form heading top-aligned to the photo top as the viewport
    // changes (the photo's centering offset depends on size).
    let alignRaf = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(alignRaf);
      alignRaf = requestAnimationFrame(alignFormCopyToPhoto);
    });
  }

  function bindCover() {
    const cover = $('#cover');
    const playBtn   = $('#cover-play');
    const playGroup = $('#cover-play-group');
    const controls  = $('#controls');
    const stage     = $('.stage');
    if (!cover || !playBtn) {
      // No cover gate — make sure the stage / controls are interactive.
      if (controls) controls.removeAttribute('inert');
      if (stage)    stage.removeAttribute('inert');
      run();
      return;
    }
    document.body.classList.add('is-cover');

    const pwForm  = $('#cover-password');
    const pwInput = $('#cover-pw-input');
    const pwError = $('#cover-pw-error');
    if (pwForm && pwInput) {
      pwForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (pwInput.value.trim().toLowerCase() === 'churro') {
          pwForm.classList.add('is-out');
          if (playGroup) playGroup.classList.remove('is-hidden');
          playBtn.focus();
        } else {
          pwInput.value = '';
          if (pwError) pwError.textContent = 'Incorrect password.';
          pwInput.focus();
        }
      });
    }

    playBtn.addEventListener('click', () => {
      if (audio) {
        try { audio.currentTime = 0; } catch (_) {}
        audio.muted = false;
        audio.volume = 0;
        audio.play().catch(() => {});
      }
      cover.classList.add('is-out');
      // Restore interactivity for the stage/controls now that the modal
      // cover is dismissing. Done immediately (not on transitionend) so
      // keyboard users can Tab to the controls during the fade-out.
      if (controls) controls.removeAttribute('inert');
      if (stage)    stage.removeAttribute('inert');
      const cleanup = () => {
        cover.removeEventListener('transitionend', cleanup);
        if (cover.parentNode) cover.parentNode.removeChild(cover);
        document.body.classList.remove('is-cover');
      };
      cover.addEventListener('transitionend', cleanup);
      setTimeout(cleanup, 1000);
      run();
    }, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { bindControls(); bindCover(); });
  } else {
    bindControls();
    bindCover();
  }
})();
