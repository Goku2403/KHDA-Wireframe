/* Leaderboard — sector readiness ranking for the reporting period. Score out of 1,000:
     Coverage 400   accepted ÷ required (waived excluded)
     Data quality 250   accepted rows ÷ validated rows, weighted by dataset size
     Timeliness 200   on-time ÷ required-with-due-date, minus 1 point per day late (floor 0); event datasets excluded
     Automation 150   via REST API ÷ required
   Ties: coverage → timeliness → data quality. Our institution's figures come from the submission model; the other
   36 Dubai institutions are generated deterministically per period (illustrative). */
(function () {
  'use strict';
  const M = window.KHDA_MODEL, U = window.KHDA_UI;
  if (!M || !U) return;
  const { $, esc, t } = U;
  const ALL = ((window.KHDA_DATA || {}).institutions || []);
  // 37 Dubai institutions in scope (licence codes from the dictionary's institution list)
  const CODES = [75, 14, 18, 19, 22, 23, 27, 28, 43, 47, 59, 60, 67, 70, 72, 73, 74, 92, 93, 101, 104, 105, 106, 132, 133, 134, 139, 141, 143, 144, 146, 147, 148, 151, 153, 154, 155];
  const WAVE = code => ['Pilot Wave 1', 'Wave 2', 'Wave 3', 'Wave 4'][M.hash('w' + code) % 4];
  const short = name => name.replace(/\s*[-–—,(].*$/, '').replace(/^(The )/, '').trim();
  let page = 1; const SIZE = 10;

  // ---------- scoring ----------
  function score(x) {
    const coverage = Math.round(400 * (x.required ? x.accepted / x.required : 0));
    const quality = Math.round(250 * (x.validatedRows ? x.acceptedRows / x.validatedRows : 0));
    const timeliness = Math.max(0, Math.round(200 * (x.withDue ? x.onTime / x.withDue : 0)) - x.lateDays);
    const automation = Math.round(150 * (x.required ? x.api / x.required : 0));
    return { coverage, quality, timeliness, automation, total: coverage + quality + timeliness + automation };
  }
  function mine(per) {
    const sm = M.summary(per), req = sm.all.filter(M.REQ), withDue = req.filter(s => s.req.due);
    const late = withDue.filter(s => M.RECEIVED(s) && s.receivedAt > s.req.due);
    return { code: M.INSTITUTION.code, name: M.INSTITUTION.name, wave: 'Wave 2', me: true, required: sm.required, accepted: sm.accepted, validatedRows: sm.rows, acceptedRows: sm.rows - sm.returnedRows, withDue: withDue.length, onTime: withDue.filter(s => M.RECEIVED(s) && s.receivedAt <= s.req.due).length, lateDays: late.reduce((n, s) => n + M.daysBetween(s.receivedAt, s.req.due), 0), api: sm.api };
  }
  function other(code, per) {
    const inst = ALL.find(i => String(i.code) === String(code)); const r = (() => { let x = M.hash('lb' + code + per.id) || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; }; })();
    const required = M.summary(per).required, withDue = Math.round(required * 0.67);
    const accepted = Math.round(required * (0.15 + r() * 0.75)), onTime = Math.min(withDue, Math.round(accepted * (0.4 + r() * 0.6)));
    const rows = 3000 + Math.round(r() * 9000);
    return { code: String(code), name: inst ? inst.name : 'Institution ' + code, wave: WAVE(code), required, accepted, validatedRows: rows, acceptedRows: rows - Math.round(rows * r() * 0.12), withDue, onTime, lateDays: Math.round(r() * 60), api: Math.round(accepted * (0.3 + r() * 0.7)) };
  }
  function ranking(per) {
    const rows = [mine(per), ...CODES.filter(c => String(c) !== M.INSTITUTION.code).map(c => other(c, per))].map(x => ({ ...x, s: score(x) }));
    rows.sort((a, b) => b.s.total - a.s.total || b.s.coverage - a.s.coverage || b.s.timeliness - a.s.timeliness || b.s.quality - a.s.quality);
    rows.forEach((x, i) => { x.rank = i + 1; });
    return rows;
  }

  // ---------- render ----------
  const PART = [['coverage', 400, 'var(--primary)'], ['quality', 250, 'var(--info)'], ['timeliness', 200, 'var(--success)'], ['automation', 150, 'var(--warning)']];
  const bars = s => `<div class="lb-bars">${PART.map(([k, max, c]) => `<span class="lb-bar" title="${esc(t('lb.p.' + k))} ${s[k]} / ${max}"><i style="width:${Math.round(s[k] / max * 100)}%;background:${c}"></i></span>`).join('')}</div>`;
  const breakdown = s => PART.map(([k, max, c]) => `<span class="legend__item"><span class="legend__dot" style="background:${c}"></span><span class="legend__label">${esc(t('lb.p.' + k))}</span><span class="legend__value">${s[k]}<small class="muted"> / ${max}</small></span></span>`).join('');

  function render() {
    const per = M.period(), rows = ranking(per), me = rows.find(x => x.me), top = rows.slice(0, 3);
    const sector = Math.round(rows.reduce((n, x) => n + x.s.total, 0) / rows.length);
    const pages = Math.ceil(rows.length / SIZE); page = Math.min(page, pages);
    const pageRows = rows.slice((page - 1) * SIZE, page * SIZE);
    const prev = M.PERIODS[M.PERIODS.indexOf(per) - 1]; const prevRank = prev ? ranking(prev).find(x => x.me).rank : null;


    // next moves: what raises the score most
    const moves = [];
    const m = me;
    if (m.accepted < m.required) moves.push(t('lb.move.coverage', { n: m.required - m.accepted, p: Math.round(400 / m.required * Math.min(5, m.required - m.accepted)), k: Math.min(5, m.required - m.accepted) }));
    if (m.lateDays) moves.push(t('lb.move.late', { n: m.lateDays }));
    if (m.api < m.required) moves.push(t('lb.move.api', { n: m.required - m.api, p: Math.round(150 / m.required * (m.required - m.api)) }));
    if (m.acceptedRows < m.validatedRows) moves.push(t('lb.move.quality', { n: (m.validatedRows - m.acceptedRows).toLocaleString(), p: Math.round(250 * (m.validatedRows - m.acceptedRows) / Math.max(1, m.validatedRows)) }));

    $('#lbView').innerHTML = `
      <div class="lb-top">
        <section class="dash-card lb-me">
          <div class="dash-card__head"><div><div class="small muted">${t('lb.yourPosition')}</div><h2 class="dash-card__title">${esc(me.name)}</h2></div><span class="chip chip--outline">${esc(per.label)}</span></div>
          <div class="lb-me__score"><span class="lb-rank">#${me.rank}</span><span class="lb-me__of">${t('lb.ofN', { n: rows.length })}${prevRank ? ` · ${prevRank > me.rank ? '▲' : prevRank < me.rank ? '▼' : '▬'} ${t('lb.prevRank', { n: prevRank })}` : ''}</span><span class="lb-me__total"><b>${me.s.total}</b><small> / 1000</small></span><span class="lb-me__sector">${t('lb.sectorAvg', { n: sector })}</span></div>
          ${bars(me.s)}
          <div class="legend legend--wrap">${breakdown(me.s)}</div>
        </section>
        <section class="dash-card lb-podium">
          <div class="dash-card__head"><h2 class="dash-card__title">${t('lb.podium')}</h2></div>
          <ol class="podium">${[top[1], top[0], top[2]].map(x => `<li class="podium__p podium__p--${x.rank}${x.me ? ' is-me' : ''}"><span class="podium__rank">${x.rank}</span><span class="podium__name">${esc(short(x.name))}</span><span class="podium__score">${x.s.total}</span><span class="podium__wave">${esc(x.wave)}</span></li>`).join('')}</ol>
        </section>
        <section class="dash-card lb-moves">
          <div class="dash-card__head"><h2 class="dash-card__title">${t('lb.nextMoves')}</h2></div>
          <ol class="lb-moves__list">${moves.map(x => `<li>${esc(x)}</li>`).join('') || `<li>${t('lb.noMoves')}</li>`}</ol>
          <a class="btn btn--outline btn--sm" href="status.html">${t('nav.status')}</a>
        </section>
      </div>

      <section class="report-block">
        <div class="report-block__head"><h2 class="report-block__title">${t('lb.rankings')} <span class="chip chip--outline">${rows.length}</span></h2><div class="legend legend--wrap">${PART.map(([k, max, c]) => `<span class="legend__item"><span class="legend__dot" style="background:${c}"></span><span class="legend__label">${esc(t('lb.p.' + k))} · ${max}</span></span>`).join('')}</div></div>
        <div class="table-wrap"><table class="data-table data-table--fit lb-table"><thead><tr><th class="num">#</th><th>${t('lb.h.institution')}</th><th>${t('mon.f.wave')}</th><th class="num">${t('lb.h.score')}</th><th>${t('lb.h.breakdown')}</th><th class="num">${t('lb.p.coverage')}</th><th class="num">${t('lb.p.quality')}</th><th class="num">${t('lb.p.timeliness')}</th><th class="num">${t('lb.p.automation')}</th></tr></thead><tbody>
          ${pageRows.map(x => `<tr${x.me ? ' class="is-editing"' : ''}><td class="num">${x.rank}</td><td><div class="cell-title cell-wrap">${esc(x.name)}${x.me ? ` <span class="chip chip--current">${t('lb.you')}</span>` : ''}</div><div class="cell-sub">${t('lb.acceptedOf', { a: x.accepted, b: x.required })} · ${t('lb.apiN', { n: x.api })}</div></td><td>${esc(x.wave)}</td><td class="num"><b>${x.s.total}</b></td><td>${bars(x.s)}</td><td class="num">${x.s.coverage}</td><td class="num">${x.s.quality}</td><td class="num">${x.s.timeliness}${x.lateDays ? `<div class="cell-sub late">−${x.lateDays} ${t('lb.lateDays')}</div>` : ''}</td><td class="num">${x.s.automation}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="pagination"><span class="pagination__info">${t('rem.showingShort', { a: (page - 1) * SIZE + 1, b: Math.min(rows.length, page * SIZE), n: rows.length })}</span><div class="pager">${Array.from({ length: pages }, (_, i) => i + 1).map(p => `<button class="pager__page" type="button" data-page="${p}"${p === page ? ' aria-current="page"' : ''}>${p}</button>`).join('')}</div></div>
      </section>

      <section class="report-block">
        <h2 class="report-block__title">${t('lb.how')}</h2>
        <div class="lb-how">
          ${PART.map(([k, max, c]) => `<div class="chart"><div class="chart__head"><span class="legend__dot" style="background:${c}"></span><h3 class="chart__title">${esc(t('lb.p.' + k))}</h3><span class="chart__count">${max} ${t('lb.points')}</span></div><p class="small">${esc(t('lb.how.' + k))}</p><p class="small muted mono">${esc(t('lb.formula.' + k))}</p></div>`).join('')}
        </div>
        <p class="small muted">${t('lb.ties')}</p>
      </section>`;
    $('#lbView').querySelector('.pager').addEventListener('click', e => { const b = e.target.closest('[data-page]'); if (b) { page = +b.dataset.page; render(); window.scrollTo({ top: $('.lb-table').getBoundingClientRect().top + window.scrollY - 120 }); } });
  }

  document.addEventListener('khda:refresh', render);
  render();
})();
