/* REST API documentation for institutions: quick start, authentication, submitting a dataset, checking
   status, fetching returned records, errors, and the payload schema of every dataset — generated from the
   same dictionary the portal form and Excel template use, so the three channels can never disagree.
   Deep link: ?sheet=<sheet>. */
(function () {
  'use strict';
  const M = window.KHDA_MODEL, U = window.KHDA_UI, S = window.KHDA_SCHEMA;
  if (!M || !U) return;
  const { $, esc, t } = U;
  const DATA = window.KHDA_DATASETS || [];
  const LISTS = window.KHDA_LISTS || {};
  let env = 'sandbox';
  let ds = DATA.find(d => d.sheet === (new URLSearchParams(location.search).get('sheet') || '')) || DATA.find(d => /^Graduates/i.test(d.sheet)) || DATA[0];

  const BASE = { sandbox: 'https://api-sandbox.khda.gov.ae/hedb/v1', production: 'https://api.khda.gov.ae/hedb/v1' };
  const SECTIONS = [['start', 'api.n.start'], ['auth', 'api.n.auth'], ['submit', 'api.n.submit'], ['status', 'api.n.status'], ['returned', 'api.n.returned'], ['errors', 'api.n.errors'], ['schema', 'api.n.schema'], ['lists', 'api.n.lists']];

  const json = o => JSON.stringify(o, null, 2);
  const code = (s, lang) => `<pre class="code" data-lang="${lang || ''}"><code>${esc(s)}</code></pre>`;
  const method = m => `<span class="method method--${m.toLowerCase()}">${m}</span>`;
  const endpoint = (m, path) => `<div class="endpoint">${method(m)}<code>${esc(path)}</code></div>`;
  const jsType = f => f.control === 'number' ? (f.integer ? 'integer' : 'number') : 'string';

  function payload(d) {
    const sc = S.get(d.sheet), rec = S.sampleRecord(sc);
    const record = {}; sc.fields.forEach(f => { const v = rec[f.key]; record[f.db] = f.control === 'number' ? Number(v || 0) : String(v == null ? '' : v); });
    return { dataset: M.codeOf(d), reportingPeriod: M.period().id, dictionaryVersion: '2026', institutionCode: M.INSTITUTION.code, version: 1, records: [record] };
  }
  function jsonSchema(d) {
    const sc = S.get(d.sheet); const props = {};
    sc.fields.forEach(f => { const p = { type: jsType(f), title: f.label }; if (f.maxLen) p.maxLength = f.maxLen; if (f.min != null) p.minimum = f.min; if (f.listName) p['x-referenceList'] = f.listName; if (f.control === 'date') p.format = 'date'; if (f.desc) p.description = f.desc; props[f.db] = p; });
    return { $schema: 'https://json-schema.org/draft/2020-12/schema', title: M.codeOf(d), description: d.desc, type: 'object', required: sc.fields.filter(f => f.required).map(f => f.db), properties: props, 'x-primaryKey': sc.pk.map(k => sc.fields.find(f => f.key === k).db) };
  }
  const ruleText = f => [f.required ? t('api.required') : t('api.optional'), f.listName ? t('api.fromList', { x: f.listName }) : '', f.maxLen ? t('api.maxLen', { n: f.maxLen }) : '', f.control === 'number' ? (f.integer ? t('api.integer') : t('api.decimal')) + (f.min != null ? ' ≥ ' + f.min : '') : '', f.control === 'date' ? 'YYYY-MM-DD' : ''].filter(Boolean).join(' · ');

  function render() {
    const base = BASE[env], sc = S.get(ds.sheet), codeName = M.codeOf(ds), per = M.period();
    $('#apActions').innerHTML = `<div class="segmented segmented--pill" role="group" id="apEnv"><button type="button" data-env="sandbox" aria-pressed="${env === 'sandbox'}">${t('api.sandbox')}</button><button type="button" data-env="production" aria-pressed="${env === 'production'}">${t('api.production')}</button></div>
      <button class="tool-btn" type="button" id="apOpenApi"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v12m0 0-4-4m4 4 4-4M4 16v4h16v-4"/></svg><span>${t('api.downloadSpec')}</span></button>`;
    $('#apNav').innerHTML = `<ol class="docs__list">${SECTIONS.map(([id, k]) => `<li><a href="#${id}">${t(k)}</a></li>`).join('')}</ol>`;

    const sample = payload(ds);
    $('#apBody').innerHTML = `
      <section class="docs__section" id="start">
        <h2 class="report-block__title">${t('api.n.start')}</h2>
        <dl class="profile-facts docs__facts">
          <div class="fact"><dt class="fact__label">${t('api.baseUrl')}</dt><dd class="fact__value mono">${esc(base)}</dd></div>
          <div class="fact"><dt class="fact__label">${t('api.format')}</dt><dd class="fact__value">JSON over HTTPS · UTF-8 · ${t('api.oneDataset')}</dd></div>
          <div class="fact"><dt class="fact__label">${t('api.limits')}</dt><dd class="fact__value">${t('api.limitsText')}</dd></div>
          <div class="fact"><dt class="fact__label">${t('api.environments')}</dt><dd class="fact__value">${t('api.environmentsText')}</dd></div>
        </dl>
        <ol class="docs__steps">
          <li><b>${t('api.step1')}</b> ${t('api.step1Text')}</li>
          <li><b>${t('api.step2')}</b> ${t('api.step2Text')}</li>
          <li><b>${t('api.step3')}</b> ${t('api.step3Text')}</li>
          <li><b>${t('api.step4')}</b> ${t('api.step4Text')}</li>
          <li><b>${t('api.step5')}</b> ${t('api.step5Text')}</li>
        </ol>
      </section>

      <section class="docs__section" id="auth">
        <h2 class="report-block__title">${t('api.n.auth')}</h2>
        <p class="report-sub">${t('api.authText')}</p>
        ${endpoint('POST', base + '/oauth/token')}
        ${code(`curl -X POST ${base}/oauth/token \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=client_credentials&client_id=${'{client_id}'}&client_secret=${'{client_secret}'}&scope=hedb.submit"`, 'bash')}
        ${code(json({ access_token: 'eyJhbGciOiJSUzI1NiIs…', token_type: 'Bearer', expires_in: 3600, scope: 'hedb.submit' }), 'json')}
        <div class="alert"><div><div class="alert__title">${t('api.ipTitle')}</div><div class="alert__text">${t('api.ipText')}</div></div></div>
      </section>

      <section class="docs__section" id="submit">
        <h2 class="report-block__title">${t('api.n.submit')}</h2>
        <p class="report-sub">${t('api.submitText')}</p>
        ${endpoint('POST', base + '/datasets/{dataset}/submissions')}
        <div class="docs__pick"><label class="field"><span class="field__label">${t('api.exampleFor')}</span><select class="control control--select" id="apDataset">${DATA.map(d => `<option value="${esc(d.sheet)}"${d === ds ? ' selected' : ''}>${esc(M.titleOf(d))} · ${esc(M.codeOf(d))}</option>`).join('')}</select></label></div>
        ${code(`POST ${base}/datasets/${codeName}/submissions
Authorization: Bearer {access_token}
Content-Type: application/json
Idempotency-Key: ${M.INSTITUTION.code}-${codeName.toLowerCase()}-${per.id}-v1

${json(sample)}`, 'http')}
        <p class="report-sub">${t('api.submitResponse')}</p>
        ${code(json({ receipt: `KHDA-${per.id}-${M.INSTITUTION.code}-4821`, dataset: codeName, reportingPeriod: per.id, version: 1, status: 'submitted', recordsReceived: 1, receivedAt: M.TODAY.toISOString().slice(0, 10) + 'T09:14:07Z', links: { status: `${base}/submissions/KHDA-${per.id}-${M.INSTITUTION.code}-4821`, returned: `${base}/submissions/KHDA-${per.id}-${M.INSTITUTION.code}-4821/returned` } }), 'json')}
      </section>

      <section class="docs__section" id="status">
        <h2 class="report-block__title">${t('api.n.status')}</h2>
        <p class="report-sub">${t('api.statusText')}</p>
        ${endpoint('GET', base + '/submissions/{receipt}')}
        ${code(json({ receipt: `KHDA-${per.id}-${M.INSTITUTION.code}-4821`, dataset: codeName, version: 1, status: 'returned_validation', recordsReceived: 312, recordsReturned: 9, stages: [{ stage: 'submitted', at: '2025-11-10T09:14:07Z' }, { stage: 'received', at: '2025-11-10T09:14:08Z' }, { stage: 'validation', at: '2025-11-10T09:39:12Z', outcome: 'returned', recordsReturned: 9 }] }), 'json')}
        <div class="table-wrap"><table class="data-table data-table--fit"><thead><tr><th>status</th><th>${t('api.meaning')}</th><th>${t('api.next')}</th></tr></thead><tbody>
          ${[['submitted', 'submitted'], ['validation', 'validation'], ['quality_review', 'review'], ['returned_validation', 'returned_v'], ['returned_quality_review', 'returned_q'], ['accepted', 'accepted'], ['accepted_late', 'accepted_late']].map(([k, st]) => `<tr><td class="mono">${k}</td><td>${U.chip(st)}</td><td>${t('api.next.' + st)}</td></tr>`).join('')}
        </tbody></table></div>
        ${endpoint('GET', base + '/submissions?reportingPeriod=' + per.id)}
        <p class="report-sub">${t('api.listText')}</p>
      </section>

      <section class="docs__section" id="returned">
        <h2 class="report-block__title">${t('api.n.returned')}</h2>
        <p class="report-sub">${t('api.returnedText')}</p>
        ${endpoint('GET', base + '/submissions/{receipt}/returned')}
        ${code(json({ receipt: `KHDA-${per.id}-${M.INSTITUTION.code}-4821`, returnedBy: 'validation', records: [{ record: `${M.INSTITUTION.code}-4127`, field: sc.fields[2] ? sc.fields[2].db : 'Field', valueReceived: 'XX9', rule: M.rulesFor(ds)[1] ? M.rulesFor(ds)[1].id : 'V-101', reason: M.rulesFor(ds)[1] ? M.rulesFor(ds)[1].text : '', fix: M.rulesFor(ds)[1] ? M.rulesFor(ds)[1].fix : '' }], total: 9 }), 'json')}
        <p class="report-sub">${t('api.resubmitText')}</p>
        ${code(json({ dataset: codeName, reportingPeriod: per.id, version: 2, supersedes: `KHDA-${per.id}-${M.INSTITUTION.code}-4821`, records: ['…'] }), 'json')}
      </section>

      <section class="docs__section" id="errors">
        <h2 class="report-block__title">${t('api.n.errors')}</h2>
        <div class="table-wrap"><table class="data-table data-table--fit"><thead><tr><th>HTTP</th><th>code</th><th>${t('api.meaning')}</th></tr></thead><tbody>
          ${[['400', 'MALFORMED_REQUEST', 'api.e.400'], ['401', 'UNAUTHORIZED', 'api.e.401'], ['403', 'IP_NOT_ALLOWED', 'api.e.403'], ['404', 'UNKNOWN_DATASET', 'api.e.404'], ['409', 'DUPLICATE_SUBMISSION', 'api.e.409'], ['413', 'PAYLOAD_TOO_LARGE', 'api.e.413'], ['422', 'SCHEMA_VIOLATION', 'api.e.422'], ['429', 'RATE_LIMITED', 'api.e.429']].map(([h, c, k]) => `<tr><td class="mono">${h}</td><td class="mono">${c}</td><td class="cell-wrap">${t(k)}</td></tr>`).join('')}
        </tbody></table></div>
        ${code(json({ error: 'SCHEMA_VIOLATION', message: 'Request rejected before validation: 2 fields do not match the dataset schema.', details: [{ record: 0, field: sc.fields[0].db, problem: 'missing' }, { record: 0, field: 'Unknown_Column', problem: 'not in schema' }] }), 'json')}
      </section>

      <section class="docs__section" id="schema">
        <h2 class="report-block__title">${t('api.n.schema')} <span class="chip chip--outline">${esc(M.titleOf(ds))}</span></h2>
        <p class="report-sub">${t('api.schemaText', { x: esc(M.titleOf(ds)), n: sc.fields.length, k: sc.pk.length ? sc.pk.map(k => sc.fields.find(f => f.key === k).db).join(' + ') : '—' })}</p>
        <div class="docs__tools">${endpoint('GET', base + '/datasets/' + codeName + '/schema')}<button class="tool-btn" type="button" id="apSchema"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v12m0 0-4-4m4 4 4-4M4 16v4h16v-4"/></svg><span>${t('api.downloadSchema')}</span></button></div>
        <div class="table-wrap"><table class="data-table data-table--fit"><thead><tr><th>${t('recon.h.field')}</th><th>${t('api.column')}</th><th>${t('api.type')}</th><th>${t('api.rules')}</th></tr></thead><tbody>
          ${sc.fields.map(f => `<tr><td><div class="cell-title">${esc(f.label)}</div>${sc.pk.includes(f.key) ? `<div class="cell-sub">${t('api.keyPart')}</div>` : ''}</td><td class="mono">${esc(f.db)}</td><td class="mono">${jsType(f)}${f.control === 'date' ? ' (date)' : ''}</td><td class="cell-wrap">${esc(ruleText(f))}</td></tr>`).join('')}
        </tbody></table></div>
      </section>

      <section class="docs__section" id="lists">
        <h2 class="report-block__title">${t('api.n.lists')} <span class="chip chip--outline">${Object.keys(LISTS).length}</span></h2>
        <p class="report-sub">${t('api.listsText')}</p>
        ${endpoint('GET', base + '/reference-lists/{name}')}
        <div class="table-wrap"><table class="data-table data-table--fit"><thead><tr><th>${t('api.listName')}</th><th class="num">${t('api.codes')}</th><th>${t('api.example')}</th><th>${t('api.usedBy')}</th></tr></thead><tbody>
          ${Object.keys(LISTS).sort().map(name => { const used = DATA.filter(d => d.fields.some(f => f.list === name)).length; const [c, l] = LISTS[name][0] || ['', '']; return `<tr><td class="cell-title cell-wrap">${esc(name)}</td><td class="num">${LISTS[name].length}</td><td class="mono cell-wrap">${esc(c)}${l ? ' — ' + esc(l) : ''}</td><td>${t('api.datasetsN', { n: used })}</td></tr>`; }).join('')}
        </tbody></table></div>
      </section>`;

    $('#apEnv').addEventListener('click', e => { const b = e.target.closest('[data-env]'); if (b) { env = b.dataset.env; render(); } });
    $('#apDataset').addEventListener('change', e => { ds = DATA.find(d => d.sheet === e.target.value) || ds; history.replaceState(null, '', 'api.html?sheet=' + encodeURIComponent(ds.sheet)); render(); document.getElementById('submit').scrollIntoView({ block: 'start' }); });
    $('#apSchema').addEventListener('click', () => { U.download(codeName + '.schema.json', json(jsonSchema(ds)), 'application/json'); U.toast('success', t('api.downloadSchema'), codeName + '.schema.json'); });
    $('#apOpenApi').addEventListener('click', () => {
      const paths = {};
      const op = (summary, tag) => ({ summary, tags: [tag], security: [{ bearer: [] }] });
      paths['/oauth/token'] = { post: op('Request an access token', 'Authentication') };
      paths['/datasets'] = { get: op('List datasets and their reporting periods', 'Datasets') };
      paths['/datasets/{dataset}/schema'] = { get: op('JSON Schema of a dataset', 'Datasets') };
      paths['/datasets/{dataset}/submissions'] = { post: op('Submit a dataset for the reporting period', 'Submissions') };
      paths['/submissions'] = { get: op('List submissions for a reporting period', 'Submissions') };
      paths['/submissions/{receipt}'] = { get: op('Status of a submission', 'Submissions') };
      paths['/submissions/{receipt}/returned'] = { get: op('Records returned for reconciliation', 'Submissions') };
      paths['/reference-lists/{name}'] = { get: op('Codes of a reference list', 'Reference lists') };
      const schemas = {}; DATA.forEach(d => { schemas[M.codeOf(d)] = jsonSchema(d); });
      const spec = { openapi: '3.1.0', info: { title: 'KHDA Higher-Education Data API', version: '1.0', description: 'Dataset submission for licensed higher-education institutions. Dictionary 2026.' }, servers: [{ url: BASE.production, description: 'Production' }, { url: BASE.sandbox, description: 'Sandbox' }], paths, components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }, schemas } };
      U.download('khda-hedb-api-v1.openapi.json', json(spec), 'application/json'); U.toast('success', t('api.downloadSpec'), 'khda-hedb-api-v1.openapi.json');
    });
  }

  render();
  if (location.hash) { const el = document.getElementById(location.hash.slice(1)); if (el) el.scrollIntoView(); }
})();
