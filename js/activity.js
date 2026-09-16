/* A small activity log so the dashboard can show what actually happened, rather than
   inferring it from the one submission timestamp each dataset keeps.

   Entries are written by the data entry page as the user works, kept in localStorage and
   capped, so the log can never grow without bound. */
(function () {
  'use strict';

  const KEY = 'khda.activity.v1';
  const CAP = 60;

  function all() {
    try {
      const list = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  }

  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(-CAP))); } catch { /* ignore */ }
  }

  function log(type, sheet, n) {
    if (!type || !sheet) return;
    const list = all();
    list.push({ t: Date.now(), type, sheet, n: Number(n) || 1 });
    write(list);
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  }

  // Newest first, with runs of the same action on the same dataset folded into one entry
  // so adding six records in a row reads as one line rather than six.
  function recent(limit) {
    const list = all().slice().sort((a, b) => b.t - a.t);
    const out = [];
    for (const e of list) {
      const last = out[out.length - 1];
      if (last && last.type === e.type && last.sheet === e.sheet && last.t - e.t < 10 * 60 * 1000) {
        last.n += e.n;
        last.from = e.t;
        continue;
      }
      out.push({ ...e, from: e.t });
      if (limit && out.length >= limit) break;
    }
    return out;
  }

  window.KHDA_ACTIVITY = { log, all, recent, clear, KEY };
})();
