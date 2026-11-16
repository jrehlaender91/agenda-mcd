/* Agenda pública: lista de próximos eventos, vista mensual y detalle. */
(() => {
  const A = AGENDA;
  const { esc } = A;
  const $ = (id) => document.getElementById(id);
  const main = $('main');
  const detail = $('detail');

  const state = {
    events: [],
    category: 'todos',
    career: 'todas',
    view: 'list',
    showPast: false,
    month: A.dayKey(new Date()).slice(0, 7), // 'YYYY-MM'
    selectedDay: null,
  };
  try {
    const saved = localStorage.getItem('agenda-carrera');
    if (saved === 'lc' || saved === 'ltm') state.career = saved;
  } catch { /* sin almacenamiento: se usa "todas" */ }
  const todayKey = () => A.dayKey(new Date());

  // ── Datos ──────────────────────────────────────────────
  async function load() {
    try {
      const res = await fetch(
        `${A.SUPABASE_URL}/rest/v1/agenda_events?select=*&published=eq.true&order=starts_at.asc`,
        { headers: { apikey: A.SUPABASE_KEY } }
      );
      if (!res.ok) throw new Error(res.status);
      state.events = await res.json();
      render();
      openFromHash();
    } catch {
      main.innerHTML = `<div class="state"><strong>No pudimos cargar la agenda</strong>Revisa tu conexión y vuelve a intentarlo.<button type="button" class="link-btn" id="retry">Reintentar</button></div>`;
      $('retry').onclick = () => { main.innerHTML = '<p class="state">Cargando la agenda…</p>'; load(); };
    }
  }

  /** Con una carrera elegida se ven sus eventos y los que son para todas. */
  const byCareer = () =>
    state.career === 'todas' ? state.events : state.events.filter((e) => !e.audience || e.audience === 'todas' || e.audience === state.career);
  const filtered = () =>
    state.category === 'todos' ? byCareer() : byCareer().filter((e) => e.category === state.category);

  const statusPill = (ev) =>
    ev.status === 'cancelado' || ev.status === 'reprogramado' ? `<span class="pill ${ev.status}">${A.STATUSES[ev.status]}</span>` : '';
  const careerPill = (ev) =>
    ev.audience === 'lc' || ev.audience === 'ltm' ? `<span class="pill">${A.CAREERS[ev.audience]}</span>` : '';
  const cancelledClass = (ev) => (ev.status === 'cancelado' ? ' is-cancelled' : '');

  // ── Piezas ─────────────────────────────────────────────
  function relLabel(ev) {
    const t = todayKey(), s = A.startKey(ev), e = A.endKey(ev);
    if (s <= t && t <= e) return 'Hoy';
    if (s === A.addDays(t, 1)) return 'Mañana';
    return '';
  }

  function card(ev) {
    if (A.isInst(ev)) {
      const past = A.endKey(ev) < todayKey();
      return `
      <li class="event inst${past ? ' past' : ''}${cancelledClass(ev)}">
        <span class="inst-date">${esc(A.shortDate(ev))}</span>
        <a class="inst-title" href="#e-${esc(ev.id)}">${esc(ev.title)}</a>
        ${statusPill(ev)}${careerPill(ev)}
      </li>`;
    }
    const s = A.startKey(ev);
    const d = A.keyDate(s);
    const dow = A.utcFmt({ weekday: 'short' }).format(d).replace('.', '');
    const rel = relLabel(ev);
    const multi = A.endKey(ev) !== s;
    const past = A.endKey(ev) < todayKey();
    const img = A.safeUrl(ev.image_url);
    return `
      <li class="event${past ? ' past' : ''}${cancelledClass(ev)}" style="--c: var(--c-${esc(ev.category)})">
        <div class="event-date">
          <span class="dow">${esc(dow)}</span>
          <span class="num">${Number(s.slice(8))}</span>
          ${rel && ev.status !== 'cancelado' ? `<span class="rel">${rel}</span>` : ''}
        </div>
        <div class="event-body">
          <div class="tagline">
            <span class="tag"><span class="dot"></span>${esc(A.CATEGORIES[ev.category] || 'Evento')}</span>
            ${statusPill(ev)}${careerPill(ev)}
          </div>
          <h3 class="event-title"><a href="#e-${esc(ev.id)}">${esc(ev.title)}</a></h3>
          <div class="meta">
            <span class="time">${esc(multi ? A.dateLabel(ev) : A.timeLabel(ev))}</span>
            ${ev.location ? `<span>${esc(ev.location)}</span>` : ''}
          </div>
        </div>
        ${img ? `<img class="event-thumb" src="${esc(img)}" alt="" loading="lazy">` : ''}
      </li>`;
  }

  const isToday = (ev) => { const t = todayKey(); return A.startKey(ev) <= t && t <= A.endKey(ev); };

  /** Tarjetas de un mes; en la lista de próximos marca dónde empieza y termina "hoy". */
  function monthItems(list, markToday) {
    let html = '', open = false;
    for (const ev of list) {
      const today = markToday && isToday(ev);
      if (today && !open) { html += '<li class="now" aria-hidden="true">Hoy</li>'; open = true; }
      if (!today && open) { html += '<li class="now later" aria-hidden="true">Más adelante</li>'; open = false; }
      html += card(ev);
    }
    return html;
  }

  const EMPTY_ART = `<svg viewBox="0 0 84 84" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="12" y="18" width="60" height="54" rx="9"/><path d="M12 33h60M28 11v13M56 11v13"/>
    <path class="hl" d="M31 52h22"/></svg>`;

  function groupByMonth(events, markToday) {
    const groups = new Map();
    for (const ev of events) {
      const k = A.startKey(ev).slice(0, 7);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(ev);
    }
    return [...groups].map(([k, list]) => {
      const d = A.keyDate(k + '-01');
      const name = A.cap(A.utcFmt({ month: 'long' }).format(d));
      return `<h2 class="month-title">${name} <span>${k.slice(0, 4)}</span></h2><ul class="events">${monthItems(list, markToday)}</ul>`;
    }).join('');
  }

  // ── Vista: lista ───────────────────────────────────────
  function renderList() {
    const t = todayKey();
    const all = filtered();
    const upcoming = all.filter((e) => A.endKey(e) >= t);
    const past = all.filter((e) => A.endKey(e) < t).reverse();
    let html = '';
    if (upcoming.length) {
      html += groupByMonth(upcoming, true);
    } else {
      const what = state.category === 'todos' ? 'eventos' : `eventos de tipo «${esc(A.CATEGORIES[state.category])}»`;
      html += `<div class="state">${EMPTY_ART}<strong>Nada en cartelera por ahora</strong>Todavía no hay ${what} próximos. Suscríbete y lo que venga llegará solo a tu calendario.<br><button type="button" class="btn small" id="empty-subscribe">Suscribirme al calendario</button></div>`;
    }
    if (past.length) {
      html += `<button type="button" class="link-btn" id="toggle-past">${state.showPast ? 'Ocultar eventos pasados' : `Ver eventos pasados (${past.length})`}</button>`;
      if (state.showPast) html += groupByMonth(past);
    }
    main.innerHTML = html;
    if ($('empty-subscribe')) $('empty-subscribe').onclick = openSubscribe;
    const tp = $('toggle-past');
    if (tp) tp.onclick = () => { state.showPast = !state.showPast; render(); };
  }

  // ── Vista: mes ─────────────────────────────────────────
  function eventsByDay(events) {
    const map = new Map();
    for (const ev of events) {
      let k = A.startKey(ev);
      const end = A.endKey(ev);
      for (let i = 0; k <= end && i < 62; i++, k = A.addDays(k, 1)) {
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(ev);
      }
    }
    return map;
  }

  function renderMonth() {
    const [y, m] = state.month.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1, 12));
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const lead = (first.getUTCDay() + 6) % 7; // semana inicia en lunes
    const byDay = eventsByDay(filtered());
    const t = todayKey();
    const title = A.cap(A.utcFmt({ month: 'long', year: 'numeric' }).format(first));

    let cells = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => `<div class="cal-dow">${d}</div>`).join('');
    cells += '<div class="cal-day blank"></div>'.repeat(lead);
    for (let d = 1; d <= daysInMonth; d++) {
      const k = `${state.month}-${String(d).padStart(2, '0')}`;
      const all = byDay.get(k) || [];
      const inst = all.filter(A.isInst);
      const evs = all.filter((e) => !A.isInst(e));
      const room = inst.length ? 1 : 2;
      const label = A.utcFmt({ day: 'numeric', month: 'long' }).format(A.keyDate(k)) + (inst.length ? `, ${inst.map((e) => e.title).join(', ')}` : '') + (evs.length ? `, ${evs.length} evento${evs.length > 1 ? 's' : ''}` : '');
      cells += `
        <button type="button" class="cal-day${k === t ? ' is-today' : ''}${inst.length ? ' inst' : ''}" data-day="${k}" aria-pressed="${k === state.selectedDay}" aria-label="${esc(label)}">
          <span class="n">${d}</span>
          ${inst.slice(0, 1).map((e) => `<span class="cal-ev inst">${esc(e.title)}</span>`).join('')}
          ${evs.slice(0, room).map((e) => `<span class="cal-ev${cancelledClass(e)}" style="--c: var(--c-${esc(e.category)})">${esc(e.title)}</span>`).join('')}
          ${evs.length > room ? `<span class="cal-more">+${evs.length - room} más</span>` : ''}
          <span class="cal-dots">${evs.slice(0, 4).map((e) => `<i style="--c: var(--c-${esc(e.category)})"></i>`).join('')}</span>
        </button>`;
    }

    let below = '';
    if (state.selectedDay) {
      const evs = byDay.get(state.selectedDay) || [];
      const name = A.cap(A.utcFmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(A.keyDate(state.selectedDay)));
      below = `<h3 class="day-title">${name}</h3>` +
        (evs.length ? `<ul class="events">${evs.map(card).join('')}</ul>` : '<p class="state">Día libre: no hay nada programado.</p>');
    }

    main.innerHTML = `
      <div class="cal-head">
        <h2>${title}</h2>
        <button type="button" class="btn small" id="cal-today">Hoy</button>
        <button type="button" class="icon-btn" id="cal-prev" aria-label="Mes anterior">‹</button>
        <button type="button" class="icon-btn" id="cal-next" aria-label="Mes siguiente">›</button>
      </div>
      <div class="cal-grid">${cells}</div>
      <div id="day-events">${below}</div>`;

    const shift = (n) => {
      const d = new Date(Date.UTC(y, m - 1 + n, 1, 12));
      state.month = d.toISOString().slice(0, 7);
      state.selectedDay = null;
      render();
    };
    $('cal-prev').onclick = () => shift(-1);
    $('cal-next').onclick = () => shift(1);
    $('cal-today').onclick = () => { state.month = t.slice(0, 7); state.selectedDay = t; render(); };
    main.querySelectorAll('.cal-day[data-day]').forEach((b) => {
      b.onclick = () => { state.selectedDay = b.dataset.day; render(); };
    });
  }

  // ── Barra ──────────────────────────────────────────────
  function renderChips() {
    const used = new Set(byCareer().map((e) => e.category));
    if (state.category !== 'todos' && !used.has(state.category)) state.category = 'todos';
    const cats = Object.keys(A.CATEGORIES).filter((c) => used.has(c));
    $('chips').innerHTML =
      `<button type="button" class="chip" data-cat="todos" aria-pressed="${state.category === 'todos'}">Todos</button>` +
      cats.map((c) => `<button type="button" class="chip" data-cat="${c}" style="--c: var(--c-${c})" aria-pressed="${state.category === c}"><span class="dot"></span>${esc(A.CATEGORIES[c])}</button>`).join('');
    $('chips').querySelectorAll('.chip').forEach((b) => {
      b.onclick = () => { state.category = b.dataset.cat; render(); };
    });
  }

  function render() {
    renderChips();
    document.querySelectorAll('#career button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.career === state.career));
    $('view-list').setAttribute('aria-pressed', state.view === 'list');
    $('view-month').setAttribute('aria-pressed', state.view === 'month');
    state.view === 'list' ? renderList() : renderMonth();
  }

  // ── Detalle y calendario personal ──────────────────────
  const stamp = (d) => new Date(d).toISOString().replace(/[-:]|\.\d{3}/g, '');
  function calendarRange(ev) {
    if (ev.all_day) {
      return { allDay: true, start: A.startKey(ev).replace(/-/g, ''), end: A.addDays(A.endKey(ev), 1).replace(/-/g, '') };
    }
    const end = ev.ends_at ? new Date(ev.ends_at) : new Date(new Date(ev.starts_at).getTime() + 3600e3);
    return { allDay: false, start: stamp(ev.starts_at), end: stamp(end) };
  }
  function googleUrl(ev) {
    const r = calendarRange(ev);
    const p = new URLSearchParams({ action: 'TEMPLATE', text: ev.title, dates: `${r.start}/${r.end}`, details: ev.description || '', location: ev.location || '' });
    return 'https://calendar.google.com/calendar/render?' + p;
  }
  function icsFile(ev) {
    const r = calendarRange(ev);
    const t = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Medios y Cultura Digital//Agenda//ES', 'BEGIN:VEVENT',
      `UID:${ev.id}@agenda-medios`, `DTSTAMP:${stamp(new Date())}`,
      r.allDay ? `DTSTART;VALUE=DATE:${r.start}` : `DTSTART:${r.start}`,
      r.allDay ? `DTEND;VALUE=DATE:${r.end}` : `DTEND:${r.end}`,
      `SUMMARY:${t(ev.title)}`, `STATUS:${ev.status === 'cancelado' ? 'CANCELLED' : 'CONFIRMED'}`, `DESCRIPTION:${t(ev.description)}`, `LOCATION:${t(ev.location)}`,
      'END:VEVENT', 'END:VCALENDAR',
    ];
    return new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  }

  function openDetail(ev) {
    const inst = A.isInst(ev);
    const img = inst ? null : A.safeUrl(ev.image_url);
    const signup = inst ? null : A.safeUrl(ev.signup_url);
    const multi = A.endKey(ev) !== A.startKey(ev);
    const cancelled = ev.status === 'cancelado';
    const notice = cancelled
      ? '<p class="notice cancelado">Este evento fue cancelado.</p>'
      : ev.status === 'reprogramado' ? '<p class="notice">Este evento cambió de fecha u horario. Los datos de abajo son los nuevos.</p>' : '';
    detail.style.setProperty('--c', `var(--c-${ev.category})`);
    detail.innerHTML = `
      <div class="sheet">
        <div class="sheet-top">
          <div class="tagline">
            <span class="tag"><span class="dot"></span>${esc(A.CATEGORIES[ev.category] || 'Evento')}</span>
            ${careerPill(ev)}
          </div>
          <button type="button" class="close" id="detail-close" aria-label="Cerrar">✕</button>
        </div>
        <h2 id="detail-title"${cancelled ? ' class="is-cancelled"' : ''}>${esc(ev.title)}</h2>
        ${notice}
        <dl class="facts">
          <dt>Cuándo</dt><dd>${esc(A.dateLabel(ev))}${ev.all_day && (multi || inst) ? '' : ' · ' + esc(A.timeLabel(ev))}</dd>
          ${ev.location ? `<dt>Dónde</dt><dd>${esc(ev.location)}</dd>` : ''}
        </dl>
        ${ev.description ? `<p class="desc">${esc(ev.description)}</p>` : ''}
        <div class="actions">
          ${signup && !cancelled ? `<a class="btn primary" href="${esc(signup)}" target="_blank" rel="noopener">Inscribirme</a>` : ''}
          ${cancelled ? '' : `<a class="btn" href="${esc(googleUrl(ev))}" target="_blank" rel="noopener">Agregar a Google Calendar</a>
          <button type="button" class="btn" id="detail-ics">Apple / Outlook</button>`}
          <button type="button" class="btn" id="detail-copy">Copiar enlace</button>
        </div>
        ${img ? `<a href="${esc(img)}" target="_blank" rel="noopener"><img class="poster" src="${esc(img)}" alt="Afiche de ${esc(ev.title)}"></a>` : ''}
      </div>`;
    $('detail-close').onclick = () => detail.close();
    if ($('detail-ics')) $('detail-ics').onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(icsFile(ev));
      a.download = 'evento.ics';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('detail-copy').onclick = async (e) => {
      try {
        await navigator.clipboard.writeText(location.href);
        e.target.textContent = 'Enlace copiado';
      } catch {
        e.target.textContent = 'No se pudo copiar';
      }
    };
    if (!detail.open) detail.showModal();
  }

  // ── Suscripción al calendario ──────────────────────────
  function openSubscribe() {
    const c = state.career;
    const url = A.FEED_URL + (c === 'todas' ? '' : `?carrera=${c}`);
    const webcal = url.replace(/^https:/, 'webcal:');
    const google = 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(webcal);
    const scope = c === 'todas' ? 'todos los eventos' : `los eventos de ${A.CAREERS[c]} y los generales`;
    detail.style.setProperty('--c', 'var(--accent)');
    detail.innerHTML = `
      <div class="sheet">
        <div class="sheet-top">
          <span class="tag"><span class="dot"></span>Suscripción</span>
          <button type="button" class="close" id="detail-close" aria-label="Cerrar">✕</button>
        </div>
        <h2 id="detail-title">La agenda, en tu calendario</h2>
        <p class="desc">Agrega ${scope} a tu calendario personal. Los eventos nuevos y los cambios aparecen solos, sin volver a entrar aquí.</p>
        <div class="actions">
          <a class="btn primary" href="${esc(google)}" target="_blank" rel="noopener">Google Calendar</a>
          <a class="btn" href="${esc(webcal)}">iPhone / Mac / Outlook</a>
        </div>
        <ol class="steps">
          <li>Elige tu calendario y confirma la suscripción.</li>
          <li>Tu calendario revisa los cambios por su cuenta; Google puede tardar varias horas en reflejarlos.</li>
          <li>Para cambiar de carrera, cierra esta ventana, elige LC o LTM arriba y vuelve a suscribirte.</li>
        </ol>
        <div class="field">
          <span style="font-size:.85rem;font-weight:600">¿No se abrió? Copia la dirección y pégala en «Agregar calendario por URL».</span>
          <div class="copy-row">
            <input class="input" id="feed-url" readonly value="${esc(url)}" aria-label="Dirección del calendario">
            <button type="button" class="btn" id="feed-copy">Copiar</button>
          </div>
        </div>
      </div>`;
    $('detail-close').onclick = () => detail.close();
    $('feed-copy').onclick = async (e) => {
      try {
        await navigator.clipboard.writeText(url);
        e.target.textContent = 'Copiada';
      } catch {
        $('feed-url').select();
      }
    };
    if (!detail.open) detail.showModal();
  }

  function openFromHash() {
    const m = location.hash.match(/^#e-(.+)$/);
    const ev = m && state.events.find((e) => e.id === m[1]);
    if (ev) openDetail(ev);
    else if (detail.open) detail.close();
  }
  detail.addEventListener('close', () => {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  });
  detail.addEventListener('click', (e) => { if (e.target === detail) detail.close(); });
  window.addEventListener('hashchange', openFromHash);

  // ── Arranque ───────────────────────────────────────────
  $('today').textContent = 'Hoy es ' + A.fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  $('subscribe').onclick = openSubscribe;
  document.querySelectorAll('#career button').forEach((b) => {
    b.onclick = () => {
      state.career = b.dataset.career;
      try { localStorage.setItem('agenda-carrera', state.career); } catch { /* opcional */ }
      render();
    };
  });
  $('view-list').onclick = () => { state.view = 'list'; render(); };
  $('view-month').onclick = () => { state.view = 'month'; render(); };
  load();
})();
