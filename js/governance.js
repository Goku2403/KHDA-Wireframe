/* KHDA — data governance landing: the policies on offer, each opening its own tool. */
(function () {
  'use strict';

  const t = (k, v) => (window.t ? window.t(k, v) : k);
  const datasets = window.KHDA_DATASETS || [];
  const S = window.KHDA_SCHEMA;

  // the card states the scale it governs, so the count comes from the metadata rather than
  // a number typed into the markup that would drift from the dictionary
  function paint() {
    const ds = document.getElementById('govDatasets');
    const fl = document.getElementById('govFields');
    if (!ds || !fl || !S) return;
    const fields = datasets.reduce((n, d) => n + S.get(d.sheet).fields.length, 0);
    ds.textContent = t('gov.datasets', { n: datasets.length });
    fl.textContent = t('gov.fields', { n: fields.toLocaleString() });
  }

  // i18n.js reloads the page on a language switch, so painting once is enough
  paint();
})();
