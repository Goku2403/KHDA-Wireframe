/* HEDB data submission — generic entry form + grid for any dataset in the data dictionary.
   The dataset is chosen with ?sheet=<sheet name>; the form, validation, grid, Excel template,
   upload and export are all built from that dataset's field metadata. */
(function () {
  'use strict';

  const S = window.KHDA_SCHEMA;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const params = new URLSearchParams(location.search);
  const schema = S.get(params.get('sheet') || 'Applicants - Basic Details');

  let records = [], step = 1, editingId = null;
  let formSections = [], formPart = 0;   // the record form walks through its sections
  let sortKey = schema.gridCols[0], sortDir = 1, filter = 'all', query = '', page = 1, pageSize = 10;
  let reviewQuery = '';

  const recordForm = $('#recordForm');
  const gridBody = $('#gridBody');

  // ---------- boot ----------
  const saved = load();
  records = saved.records || [];
  let submittedAt = saved.submittedAt || null;
  step = Math.min(saved.step || 1, 2);

  document.title = 'KHDA';
  $('#dsTitle').textContent = schema.title;
  $('#reportLink').href = 'report.html?sheet=' + encodeURIComponent(schema.sheet);

  // 'bulk' shows the file dropper and keeps the form for fixing rows; 'form' hides every
  // bulk control; anything else (older links, the dashboard, the report) shows both.
  const mode = ['bulk', 'form'].includes(params.get('mode')) ? params.get('mode') : 'full';
  applyMode();

  buildForm();
  bindForm();
  bindGrid();
  bindFooter();
  bindDropzone();
  bindStepper();
  goTo(step, { silent: true });

  (function openFromLink() {
    const id = params.get('edit');
    if (!id || !records.some(r => r.id === id)) return;
    history.replaceState(null, '', location.pathname + '?sheet=' + encodeURIComponent(schema.sheet));
    startEdit(id);
  })();

  // ---------- submission mode ----------
  function applyMode() {
    const bulk = mode === 'bulk';
    const formOnly = mode === 'form';

    $('#dropzone').hidden = !bulk;
    // in bulk the form is only needed to correct a row, so it stays out of the way
    $('#recordForm').hidden = bulk;

    // The spreadsheet tools belong to the bulk route: bulk has its own template button beside
    // the drop zone, and a submission typed into the form has no spreadsheet step at all.
    $('#btnTemplate').hidden = true;
    $('#btnImport').hidden = true;
    $('#btnExport').hidden = !bulk;

    // A form-only submission is about the form. What has been entered is reviewed on
    // step two, so the records grid does not belong on step one.
    $('.records').hidden = formOnly;
  }

  function revealFormForEdit() {
    if (mode !== 'bulk') return;
    $('#recordForm').hidden = false;
  }

  function hideFormAfterEdit() {
    if (mode !== 'bulk') return;
    $('#recordForm').hidden = true;
  }

  function bindDropzone() {
    const box = $('#dropBox');
    if (!box) return;
    const open = () => $('#fileImport').click();
    box.addEventListener('click', open);
    box.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    ['dragenter', 'dragover'].forEach(n => box.addEventListener(n, e => {
      e.preventDefault(); e.stopPropagation();
      box.classList.add('is-over');
    }));
    ['dragleave', 'drop'].forEach(n => box.addEventListener(n, e => {
      e.preventDefault(); e.stopPropagation();
      if (n === 'dragleave' && box.contains(e.relatedTarget)) return;
      box.classList.remove('is-over');
    }));
    box.addEventListener('drop', e => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) readFile(file);
    });
    const alt = $('#btnTemplate2');
    if (alt) alt.addEventListener('click', downloadTemplate);
  }

  // ---------- form ----------
  function sectionTitle(sec) {
    const base = t('form.sec.' + sec.kind);
    return sec.parts ? t('form.sec.part', { x: base, a: sec.part, b: sec.parts }) : base;
  }

  function buildForm() {
    formSections = S.sections(schema);
    const fieldHtml = f => {
      const req = f.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
      const label = `<label class="field__label" for="${f.key}">${esc(f.label)}${f.required ? '' : ' ' + t('entry.optional')}${req}</label>`;
      let control;
      if (f.control === 'select') {
        control = `<select class="control control--select" id="${f.key}"><option value="">${t('entry.select')}</option>${
          f.opts.map(o => `<option value="${esc(o.v)}">${esc(o.l)}</option>`).join('')}</select>`;
      } else if (f.control === 'date') {
        control = `<div class="datefield"><input class="control" id="${f.key}" type="text" placeholder="YYYY-MM-DD" data-datepicker${/updated/i.test(f.label) ? ' data-max="today"' : ''}></div>`;
      } else if (f.control === 'number') {
        control = `<input class="control" id="${f.key}" type="number"${f.integer ? ' step="1"' : ' step="any"'}${f.min != null ? ` min="${f.min}"` : ''} inputmode="${f.integer ? 'numeric' : 'decimal'}">`;
      } else {
        control = `<input class="control" id="${f.key}" type="${f.email ? 'email' : 'text'}"${f.maxLen ? ` maxlength="${f.maxLen}"` : ''}${f.readonly ? ' readonly' : ''}>`;
      }
      return `<div class="field" data-field="${f.key}">
        ${label}${control}
        <div class="field__error"><span></span></div>
      </div>`;
    };

    $('#formGrid').innerHTML = formSections.map((sec, i) => `
      <section class="form-section" data-section="${i}"${i ? ' hidden' : ''}>
        <h3 class="form-section__title">${esc(sectionTitle(sec))}</h3>
        <div class="form-grid">${sec.fields.map(k => fieldHtml(schema.field(k))).join('')}</div>
      </section>`).join('');
    $$('#formGrid input[data-datepicker]').forEach(i => window.KHDADatePicker && window.KHDADatePicker.build(i));
    formPart = 0;
    renderFormNav();
    renderFormSteps();
  }

  // ---------- moving between form sections ----------
  function showSection(i, opts = {}) {
    formPart = Math.max(0, Math.min(i, formSections.length - 1));
    $$('#formGrid .form-section').forEach(el => { el.hidden = Number(el.dataset.section) !== formPart; });
    renderFormNav();
    renderStepper();
    if (!opts.silent) $('#recordForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function sectionOfField(key) {
    const i = formSections.findIndex(sec => sec.fields.includes(key));
    return i < 0 ? 0 : i;
  }

  // a section is only left once its own fields are clean, so errors surface where they were typed
  function sectionErrors(i) {
    const rec = readForm();
    const all = S.validate({ ...rec, id: editingId }, records, schema);
    const mine = {};
    for (const k of formSections[i].fields) if (all[k]) mine[k] = all[k];
    return mine;
  }

  function nextSection() {
    const errs = sectionErrors(formPart);
    const n = Object.keys(errs).length;
    if (n) {
      showErrors(errs);
      toast('error', t('entry.sectionIncomplete'), t('entry.fieldsNeedAttention', { n }));
      const el = $('#' + Object.keys(errs)[0]);
      if (el) { el.focus(); el.closest('.field').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      return;
    }
    showSection(formPart + 1);
  }

  function renderFormNav() {
    const last = formPart >= formSections.length - 1;
    const prev = $('#btnFormPrev'), next = $('#btnFormNext'), save = $('#btnSave');
    if (!prev) return;
    prev.hidden = formSections.length < 2 || formPart === 0;
    next.hidden = formSections.length < 2 || last;
    save.hidden = !last && formSections.length > 1;
    $('#formStepNote').hidden = formSections.length < 2;
    $('#formStepNote').textContent = formSections.length < 2 ? ''
      : t('entry.sectionOf', { a: formPart + 1, b: formSections.length, x: sectionTitle(formSections[formPart]) });
  }

  function bindForm() {
    for (const f of schema.fields) {
      const el = $('#' + f.key);
      if (!el) continue;
      el.addEventListener(f.control === 'select' ? 'change' : 'input', () => {
        clearError(f.key);
        for (const d of schema.fields) {          // fill anything derived from this field
          if (d.derivedFrom !== f.key) continue;
          const hit = f.opts && f.opts.find(o => String(o.v) === el.value);
          $('#' + d.key).value = hit ? labelOf(hit) : '';
          clearError(d.key);
        }
      });
    }
    recordForm.addEventListener('submit', e => {
      e.preventDefault();
      const rec = readForm();
      const errors = S.validate({ ...rec, id: editingId }, records, schema);
      showErrors(errors);
      const n = Object.keys(errors).length;
      if (n) {
        toast('error', t('entry.notSaved'), t('entry.fieldsNeedAttention', { n }));
        const first = Object.keys(errors)[0];
        showSection(sectionOfField(first), { silent: true });
        const el = $('#' + first);
        if (el) { el.focus(); el.closest('.field').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        return;
      }
      if (editingId) {
        const i = records.findIndex(r => r.id === editingId);
        records[i] = { ...records[i], ...rec };
        note('updated');
        toast('success', t('entry.recordUpdated'), describe(rec));
      } else {
        records.push({ id: uid(), ...rec });
        note('added');
        toast('success', t('entry.recordAdded'), describe(rec));
        page = Math.ceil(records.length / pageSize) || 1;
      }
      markChanged(); persist(); resetForm(); showSection(0, { silent: true }); hideFormAfterEdit(); render();
    });
    $('#btnCancel').addEventListener('click', () => { resetForm(); showSection(0, { silent: true }); hideFormAfterEdit(); render(); });
    $('#btnFormNext').addEventListener('click', nextSection);
    $('#btnFormPrev').addEventListener('click', () => showSection(formPart - 1));
    $('#formSteps').addEventListener('click', e => {
      const b = e.target.closest('button[data-part]');
      if (b) showSection(Number(b.dataset.part));
    });
  }

  // function declaration, not a const: it is called from handlers that can run before this point
  function labelOf(o) { return o.l.includes(' — ') ? o.l.split(' — ').slice(1).join(' — ') : o.l; }
  function readForm() {
    const rec = {};
    for (const f of schema.fields) rec[f.key] = ($('#' + f.key)?.value ?? '').trim();
    return rec;
  }
  function fillForm(r) { for (const f of schema.fields) { const el = $('#' + f.key); if (el) el.value = r[f.key] ?? ''; } }
  function resetForm() {
    recordForm.reset();
    schema.fields.forEach(f => { const el = $('#' + f.key); if (el) el.value = ''; });
    editingId = null;
    $('#btnSaveLabel').textContent = t('entry.addRecord');
    clearAllErrors();
  }
  function startEdit(id) {
    const r = records.find(x => x.id === id); if (!r) return;
    if (step !== 1) goTo(1);
    editingId = id; fillForm(r);
    showSection(0, { silent: true });
    revealFormForEdit();
    $('#btnSaveLabel').textContent = t('entry.updateRecord');
    showErrors(S.validate(r, records, schema));
    const idx = visibleRecords().findIndex(x => x.r.id === id);
    if (idx >= 0) page = Math.floor(idx / pageSize) + 1;
    render();
    recordForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#' + schema.fields[0].key)?.focus();
  }

  function showErrors(errors) {
    clearAllErrors();
    for (const [k, msg] of Object.entries(errors)) {
      const f = $(`.field[data-field="${k}"]`); if (!f) continue;
      f.classList.add('is-invalid'); f.querySelector('.field__error span').textContent = msg;
    }
  }
  // also blank the text: CSS hides it, but a stale message left in the DOM can still be announced
  function clearError(k) { wipeError($(`.field[data-field="${k}"]`)); }
  function clearAllErrors() { $$('.field.is-invalid').forEach(wipeError); }
  function wipeError(f) {
    if (!f) return;
    f.classList.remove('is-invalid');
    const span = f.querySelector('.field__error span');
    if (span) span.textContent = '';
  }
  function errorCount() { return records.filter(r => Object.keys(S.validate(r, records, schema)).length).length; }

  // ---------- steps ----------
  function reachable() { return (!records.length || errorCount()) ? 1 : 2; }
  function bindStepper() {
    $$('#stepper .stepper__btn').forEach(btn => btn.addEventListener('click', () => {
      const s = Number(btn.closest('.stepper__item').dataset.step);
      if (s <= reachable()) goTo(s);
      else toast('info', t('entry.stepLocked'), records.length ? t('entry.fixErrorsFirst') : t('entry.addOneFirst'));
    }));
  }
  function goTo(s, opts = {}) {
    step = s;
    $$('.step-panel').forEach(p => p.hidden = Number(p.dataset.panel) !== s);
    if (s === 1) render(); else renderReview();
    renderStepper(); renderFooter(); persist();
    if (!opts.silent) window.scrollTo({ top: $('.main').offsetTop - 16, behavior: 'smooth' });
  }
  function next() {
    if (step === 1) {
      if (!records.length) { toast('error', t('entry.noRecords'), t('entry.addOneFirst')); return; }
      const errs = errorCount();
      if (errs) {
        filter = 'error';
        $$('.segmented button').forEach(x => x.setAttribute('aria-pressed', x.dataset.filter === 'error' ? 'true' : 'false'));
        page = 1; render();
        toast('error', t('entry.recordsNeedAttention'), t('entry.fixNBeforeContinuing', { n: errs }));
        $('.records').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      goTo(2); return;
    }
    submit();
  }
  function renderStepper() {
    const maxStep = reachable(), errs = errorCount();
    const status = {
      1: records.length ? [errs ? t('entry.nRecordsNErrors', { n: records.length, e: errs }) : t('entry.nRecords', { n: records.length }), errs ? 'warning' : 'complete']
                        : (step === 1 ? [t('entry.inProgress'), 'current'] : [t('entry.required'), 'neutral']),
      2: step === 2 ? [t('entry.inProgress'), 'current'] : [t('entry.required'), 'neutral'],
    };
    $$('#stepper .stepper__item').forEach(li => {
      const s = Number(li.dataset.step), [label, kind] = status[s];
      li.classList.toggle('stepper__item--current', s === step);
      li.classList.toggle('stepper__item--done', kind === 'complete' && s !== step);
      li.classList.toggle('stepper__item--warning', kind === 'warning');
      li.classList.toggle('stepper__item--locked', s > maxStep && s !== step);
      li.querySelector('.stepper__btn').disabled = s > maxStep && s !== step;
      const cur = s === step && kind !== 'warning';
      setChip(li.querySelector('.stepper__status'), cur ? t('entry.inProgress') : label, cur ? 'current' : kind);
      li.querySelector('.stepper__icon').innerHTML =
        (kind === 'complete' && s !== step) ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>'
        : (kind === 'warning') ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 8v5m0 3h.01"/></svg>' : '';
    });
    $('#stepLabel').textContent = t('entry.stepOf', { a: step, b: 2 });
    $('#stepFill').style.width = `${step * 50}%`;
    renderFormSteps();
  }

  // The sections of the record form sit under step 1, so the rail shows the whole journey.
  function renderFormSteps() {
    const host = $('#formSteps');
    if (!host) return;
    const show = step === 1 && formSections.length > 1 && !$('#recordForm').hidden;
    host.hidden = !show;
    if (!show) { host.innerHTML = ''; return; }
    host.innerHTML = formSections.map((sec, i) => `
      <li class="stepper__subitem${i === formPart ? ' is-current' : ''}">
        <button type="button" data-part="${i}">
          <span class="stepper__dot" aria-hidden="true"></span>
          <span>${esc(sectionTitle(sec))}</span>
        </button>
      </li>`).join('');
  }
  function renderFooter() {
    $('#btnBack').disabled = step === 1;
    const n = $('#btnNext');
    n.textContent = step === 2 ? t('common.submit') : t('common.next');
    n.disabled = step === 2 && !$('#confirmAccurate').checked;
  }

  // ---------- grid ----------
  function cols() { return schema.gridCols.map(k => schema.field(k)); }
  function cellHtml(r, f) {
    const val = r[f.key];
    if (val == null || val === '') return '<span class="cell-sub">—</span>';
    if (f.opts) {
      const hit = f.opts.find(o => String(o.v) === String(val));
      const label = hit ? labelOf(hit) : '';
      return `<div class="cell-title mono">${esc(val)}</div>${label && label !== String(val) ? `<div class="cell-sub">${esc(trunc(label, 32))}</div>` : ''}`;
    }
    if (f.control === 'number' || f.control === 'date') return `<span class="mono">${esc(val)}</span>`;
    return esc(trunc(String(val), 40));
  }
  function visibleRecords() {
    let list = records.map(r => ({ r, errors: S.validate(r, records, schema) }));
    if (filter === 'valid') list = list.filter(x => !Object.keys(x.errors).length);
    if (filter === 'error') list = list.filter(x => Object.keys(x.errors).length);
    if (query) {
      const words = query.split(/\s+/).filter(Boolean);
      list = list.filter(({ r }) => {
        const hay = schema.fields.map(f => `${r[f.key] ?? ''} ${S.display(r, f) ?? ''}`).join(' ').toLowerCase();
        return words.every(w => hay.includes(w));
      });
    }
    list.sort((a, b) => {
      const va = a.r[sortKey] ?? '', vb = b.r[sortKey] ?? '';
      const na = Number(va), nb = Number(vb);
      const numeric = va !== '' && vb !== '' && !isNaN(na) && !isNaN(nb);
      return (numeric ? na - nb : String(va).localeCompare(String(vb))) * sortDir;
    });
    return list;
  }
  function render() {
    const list = visibleRecords(), total = list.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (page > pages) page = pages;
    const slice = list.slice((page - 1) * pageSize, page * pageSize);
    const C = cols();

    $('#gridHead').innerHTML = C.map(f => `<th class="sortable${f.control === 'number' ? ' num' : ''}${f.key === sortKey ? ' is-sorted' : ''}" data-sort="${f.key}">${esc(f.label)} <span class="sort-ind">⇅</span></th>`).join('')
      + '<th class="th-actions"><span class="sr-only">Actions</span></th>';
    const ind = $(`#gridHead th[data-sort="${sortKey}"] .sort-ind`);
    if (ind) ind.textContent = sortDir === 1 ? '↑' : '↓';

    gridBody.innerHTML = slice.map(({ r, errors }) => {
      const errs = Object.values(errors);
      return `<tr data-id="${r.id}" class="${errs.length ? 'has-error' : ''} ${editingId === r.id ? 'is-editing' : ''}">
        ${C.map(f => `<td class="${f.control === 'number' ? 'num' : ''}">${cellHtml(r, f)}</td>`).join('')}
        <td class="actions">
          <button class="btn-actions" type="button" data-action="menu" aria-haspopup="menu" aria-expanded="false">${esc(t('common.actions'))}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></button>
        </td></tr>${errs.length ? `<tr class="row-note"><td colspan="${C.length + 1}"><span class="row-error">${errs.slice(0, 4).map(esc).join(' · ')}${errs.length > 4 ? ` · +${errs.length - 4} more` : ''}</span></td></tr>` : ''}`;
    }).join('');

    const errs = errorCount();
    if (!errs && filter !== 'all') {
      filter = 'all';
      $$('.segmented button').forEach(x => x.setAttribute('aria-pressed', x.dataset.filter === 'all' ? 'true' : 'false'));
      return render();
    }
    $('#gridFilter').hidden = !errs;
    const filtered = records.length > 0 && total === 0;
    $('#emptyTitle').textContent = filtered ? t('entry.noMatch') : t('entry.noRecords');
    $('#emptyText').textContent = filtered ? t('entry.noMatchText') : t('entry.noRecordsText');
    $('#btnLoadSample').hidden = filtered;
    $('#gridEmpty').hidden = total !== 0;
    $('#grid').hidden = total === 0;
    $('#gridCount').textContent = total !== records.length ? `${fmt(total)} of ${fmt(records.length)}` : fmt(records.length);
    const hidden = schema.fields.length - C.length;
    $('#colNote').hidden = hidden <= 0;
    $('#colNote').textContent = hidden > 0 ? t('entry.columnsShown', { a: C.length, b: schema.fields.length }) : '';

    $('#pagination').hidden = total === 0;
    const from = total ? (page - 1) * pageSize + 1 : 0, to = Math.min(page * pageSize, total);
    $('#pageInfo').textContent = t('entry.showing', { a: from, b: to, c: fmt(total) });
    const pb = $('#pageButtons'); pb.innerHTML = '';
    const mk = (label, p, o = {}) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'page-btn'; b.innerHTML = label;
      if (o.current) b.setAttribute('aria-current', 'page');
      b.disabled = !!o.disabled;
      b.addEventListener('click', () => { page = p; render(); });
      pb.append(b);
    };
    mk('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5m6-6-6 6 6 6"/></svg>', page - 1, { disabled: page === 1 });
    for (let p = 1; p <= pages; p++) {
      if (pages > 7 && Math.abs(p - page) > 2 && p !== 1 && p !== pages) {
        if (p === 2 || p === pages - 1) { const s = document.createElement('span'); s.className = 'page-btn'; s.textContent = '…'; pb.append(s); }
        continue;
      }
      mk(String(p), p, { current: p === page });
    }
    mk('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>', page + 1, { disabled: page === pages });
    renderStepper();
  }

  function bindGrid() {
    $('#gridSearch').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); page = 1; render(); });
    $('#reviewSearch').addEventListener('input', e => { reviewQuery = e.target.value.trim().toLowerCase(); renderReview(); });
    $$('.segmented button').forEach(b => b.addEventListener('click', () => {
      $$('.segmented button').forEach(x => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true'); filter = b.dataset.filter; page = 1; render();
    }));
    $('#gridHead').addEventListener('click', e => {
      const th = e.target.closest('th[data-sort]'); if (!th) return;
      const k = th.dataset.sort;
      if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; }
      render();
    });
    $('#pageSize').addEventListener('change', e => { pageSize = Number(e.target.value); page = 1; render(); });
    gridBody.addEventListener('click', e => {
      const btn = e.target.closest('button[data-action]'); if (!btn) return;
      const id = btn.closest('tr').dataset.id;
      window.khdaRowMenu(btn, [
        { label: t('entry.editRecord'), onChoose: () => startEdit(id) },
        { label: t('entry.deleteRecord'), danger: true, onChoose: () => removeRecord(id) },
      ]);
    });
    function removeRecord(id) {
      const r = records.find(x => x.id === id); if (!r) return;
      confirm(t('entry.deleteTitle'), t('entry.deleteText', { x: describe(r) }))
        .then(ok => {
          if (!ok) return;
          records = records.filter(x => x.id !== id);
          if (editingId === id) resetForm();
          markChanged(); persist(); render();
          note('deleted');
          toast('info', t('entry.recordDeleted'), describe(r));
        });
    }
    $('#btnLoadSample').addEventListener('click', () => {
      const rec = S.sampleRecord(schema);
      const key = S.dupKeyOf(rec, schema);
      if (key && records.some(r => S.dupKeyOf(r, schema) === key)) {
        toast('info', t('entry.sampleLoaded'), t('entry.sampleLoadedText'));
        return;
      }
      records.push({ id: uid(), ...rec });
      markChanged(); persist(); render();
      note('added');
      toast('success', t('entry.sampleAdded'), t('entry.sampleAddedText'));
    });
    $('#btnTemplate').addEventListener('click', downloadTemplate);
    $('#btnExport').addEventListener('click', exportData);
    $('#btnImport').addEventListener('click', () => $('#fileImport').click());
    $('#fileImport').addEventListener('change', importFile);
  }

  // ---------- review ----------
  function reviewRows() {
    if (!reviewQuery) return records;
    return records.filter(r => {
      const hay = schema.fields.map(f => `${r[f.key] ?? ''} ${S.display(r, f) ?? ''}`).join(' ').toLowerCase();
      return reviewQuery.split(/\s+/).every(w => hay.includes(w));
    });
  }
  function renderReview() {
    const C = cols();
    const rows = reviewRows();
    $('#reviewCount').textContent = rows.length === records.length
      ? fmt(records.length)
      : `${fmt(rows.length)} / ${fmt(records.length)}`;
    $('#reviewEmpty').hidden = rows.length !== 0;
    $('#reviewTable').hidden = rows.length === 0;
    const hidden = schema.fields.length - C.length;
    $('#reviewColNote').hidden = hidden <= 0;
    $('#reviewColNote').textContent = hidden > 0 ? t('entry.columnsShownExport', { a: C.length, b: schema.fields.length }) : '';
    $('#reviewHead').innerHTML = C.map(f => `<th class="${f.control === 'number' ? 'num' : ''}">${esc(f.label)}</th>`).join('');
    $('#reviewBody').innerHTML = rows.map(r => `<tr>${C.map(f => `<td class="${f.control === 'number' ? 'num' : ''}">${cellHtml(r, f)}</td>`).join('')}</tr>`).join('');
    const hasNums = C.some(f => f.control === 'number');
    $('#reviewFoot').innerHTML = hasNums
      ? `<tr>${C.map((f, i) => f.control === 'number'
          ? `<th class="num">${fmt(rows.reduce((n, r) => n + (Number(r[f.key]) || 0), 0))}</th>`
          : (i === 0 ? `<th>${esc(t('common.total'))}</th>` : '<th></th>')).join('')}</tr>`
      : '';
  }
  function submit() {
    if (!$('#confirmAccurate').checked) return;
    confirm(t('entry.submitTitle'), t('entry.submitText', { n: records.length, x: schema.title }), t('common.submit'))
      .then(ok => {
        if (!ok) return;
        submittedAt = new Date().toISOString();
        persist();
        note('submitted', records.length);
        $('#successText').textContent = t('entry.successDetail', { n: records.length, x: schema.title });
        $('#entryView').hidden = true; $('#successView').hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
  }

  // ---------- footer ----------
  function bindFooter() {
    $('#btnBack').addEventListener('click', () => { if (step > 1) goTo(step - 1); });
    $('#btnNext').addEventListener('click', next);
    $('#btnSaveExit').addEventListener('click', () => { persist(); toast('success', t('entry.draftSaved'), t('entry.draftSavedText')); });
    $('#confirmAccurate').addEventListener('change', renderFooter);
    $('#btnBackToEntry').addEventListener('click', () => { $('#successView').hidden = true; $('#entryView').hidden = false; goTo(1); });
    $('#aboutLink').addEventListener('click', e => {
      e.preventDefault();
      confirm(t('entry.aboutTitle'), `${schema.desc || schema.title}  —  ${schema.fields.length} fields, ${schema.group} submission, sheet "${schema.sheet}" of the HEDB Data Dictionary 2026.`, 'Got it', true);
    });
  }

  // ---------- Excel ----------
  const headers = () => schema.fields.map(f => f.db);
  const rowFor = r => schema.fields.map(f => {
    const v = r[f.key] ?? '';
    return f.control === 'number' && v !== '' && !isNaN(Number(v)) ? Number(v) : v;
  });

  function downloadTemplate() {
    try {
      const { sheets, definedNames } = templateWorkbook();
      saveBlob(window.KHDA_XLSX.build(sheets, definedNames), fileName('Template') + '.xlsx');
      toast('success', t('entry.templateDone'), t('entry.templateDoneText'));
    } catch (err) {
      saveCsv([headers()], fileName('Template') + '.csv');
      toast('info', t('entry.templateCsv'), t('entry.templateCsvText'));
    }
  }
  function templateWorkbook() {
    const TEMPLATE_ROWS = 100, VALID_ROWS = 1000;
    const used = new Set();
    const sheetName = s => {
      let n = String(s).replace(/[\\\/\?\*\[\]:]/g, ' ').trim().slice(0, 28) || 'List';
      const base = n; let i = 1;
      while (used.has(n)) n = `${base.slice(0, 25)} ${++i}`;
      used.add(n); return n;
    };
    const listSheets = new Map();
    for (const f of schema.fields) {
      if (!f.opts) continue;
      const key = f.listName || f.label;
      if (!listSheets.has(key)) {
        listSheets.set(key, { name: sheetName(key), rows: f.opts.map(o => [o.v, labelOf(o) === String(o.v) ? '' : labelOf(o)]) });
      }
      f._list = listSheets.get(key);
    }
    const definedNames = [];
    let li = 0;
    for (const l of listSheets.values()) {
      l.dn = 'KHDA_L' + (++li);
      definedNames.push({ name: l.dn, ref: `'${l.name}'!$A$2:$A$${l.rows.length + 1}` });
    }

    const head = headers();
    const rows = [head];
    for (let r = 2; r <= TEMPLATE_ROWS + 1; r++) {
      const row = new Array(head.length).fill('');
      schema.fields.forEach((f, i) => {
        if (f.derivedFrom) {
          const src = schema.field(f.derivedFrom);
          if (src && src._list) row[i] = { f: `IFERROR(VLOOKUP($${col(src.idx)}${r},'${src._list.name}'!$A:$B,2,FALSE),"")`, s: 2 };
        } else if (f.control === 'date') row[i] = { v: '', s: 3 };
      });
      rows.push(row);
    }

    const validations = [];
    schema.fields.forEach((f, i) => {
      const c = col(i), sq = `${c}2:${c}${VALID_ROWS}`;
      if (f._list) {
        validations.push({ type: 'list', formula1: f._list.dn, sqref: sq, promptTitle: trunc(f.label, 32), prompt: trunc(f.values || 'Pick a value from the list.', 180), errorTitle: 'Value not in the list', error: 'Pick a value from the dropdown. The full list is on the reference sheets.' });
      } else if (f.control === 'number') {
        validations.push({ type: f.integer ? 'whole' : 'decimal', operator: 'greaterThanOrEqual', formula1: String(f.min != null ? f.min : -999999999), sqref: sq, promptTitle: trunc(f.label, 32), prompt: f.integer ? 'Whole number.' : 'Number, decimals allowed.', errorTitle: 'Invalid number', error: f.integer ? 'Enter a whole number.' : 'Enter a number.' });
      } else if (f.control === 'date') {
        validations.push({ type: 'date', operator: 'lessThanOrEqual', formula1: 'TODAY()', sqref: sq, promptTitle: trunc(f.label, 32), prompt: 'Date in YYYY-MM-DD format.', errorTitle: 'Invalid date', error: 'Enter a date of today or earlier.' });
      } else if (f.maxLen) {
        validations.push({ type: 'textLength', operator: 'lessThanOrEqual', formula1: String(f.maxLen), sqref: sq, promptTitle: trunc(f.label, 32), prompt: `Up to ${f.maxLen} characters.`, errorTitle: 'Too long', error: `Use ${f.maxLen} characters or fewer.` });
      }
    });
    for (const cr of schema.cross) {
      const f = schema.field(cr.key), o = schema.field(cr.other);
      const cf = col(f.idx), co = col(o.idx);
      const rule = { type: 'custom', formula1: `AND(ISNUMBER(${cf}2),${cf}2>=0,OR($${co}2="",${cf}2<=$${co}2))`, sqref: `${cf}2:${cf}${VALID_ROWS}`, promptTitle: trunc(f.label, 32), prompt: `Number, and not above ${o.label}.`, errorTitle: 'Invalid number', error: cr.message };
      const at = validations.findIndex(v => v.sqref === rule.sqref);
      if (at >= 0) validations[at] = rule; else validations.push(rule);
    }

    const guide = [['Field name', 'Column in the Data sheet', 'Data type', 'Mandatory', 'Acceptable values', 'Rules', 'Example']];
    for (const f of schema.fields) guide.push([f.label, f.db, f.type, f.required ? 'Yes' : 'No', f.values, f.keyText, String(f.sample || '')]);
    guide.push([]);
    guide.push([`How to use this template — ${schema.title}`]);
    guide.push(['1. Fill in one row per record on the Data sheet. Do not rename the header row.']);
    guide.push(['2. Coded columns have dropdown lists; grey columns fill in by themselves.']);
    guide.push(['3. Save the file, then use Upload on the submission page.']);

    const sheets = [
      { name: 'Data', rows, opts: { freeze: true, cols: schema.fields.map(f => Math.min(40, Math.max(14, f.db.length + 4))), validations } },
      { name: 'Field guide', rows: guide, opts: { freeze: true, cols: [34, 30, 14, 11, 36, 46, 18] } },
    ];
    for (const l of listSheets.values()) sheets.push({ name: l.name, rows: [['Code', 'Description'], ...l.rows], opts: { freeze: true, cols: [18, 60] } });
    return { sheets, definedNames };
  }
  function col(i) { let s = ''; for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; }

  function exportData() {
    if (!records.length) { toast('info', t('entry.nothingToExport'), t('entry.addRecordsFirst')); return; }
    const rows = [headers(), ...records.map(rowFor)];
    const base = fileName(today());
    const n = `${records.length} record${records.length > 1 ? 's' : ''}`;
    if (typeof XLSX === 'undefined') { saveCsv(rows, base + '.csv'); toast('success', 'CSV exported', `${n} using the database field names.`); return; }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = schema.fields.map(f => ({ wch: Math.min(40, Math.max(14, f.db.length + 4)) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, base + '.xlsx');
    toast('success', t('entry.exported'), t('entry.exportedText', { x: n }));
  }

  function importFile(e) {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    readFile(file);
  }
  function readFile(file) {
    const isCsv = /\.csv$/i.test(file.name), useXlsx = !isCsv && typeof XLSX !== 'undefined';
    const reader = new FileReader();
    reader.onload = () => {
      let rows;
      try {
        if (useXlsx) {
          const wb = XLSX.read(new Uint8Array(reader.result), { type: 'array', cellDates: true });
          const sheet = wb.Sheets['Data'] || wb.Sheets[wb.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, raw: true }).map(r => r.map(cellText));
        } else if (isCsv) {
          rows = parseCsv(String(reader.result).replace(/^﻿/, ''));
        } else { toast('error', t('entry.importFailed'), t('entry.importNoExcel')); return; }
      } catch { toast('error', t('entry.importFailed'), t('entry.importUnreadable')); return; }
      ingest(rows);
    };
    if (useXlsx) reader.readAsArrayBuffer(file); else reader.readAsText(file);
  }
  function cellText(v) {
    if (v == null) return '';
    if (v instanceof Date) return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    return String(v).trim();
  }
  function ingest(rows) {
    if (!rows || rows.length < 2) { toast('error', t('entry.importFailed'), t('entry.importNoRows')); return; }
    const head = rows[0].map(h => String(h ?? '').trim());
    // claim each column once, so a file that still carries repeated headers cannot feed
    // two fields from the same column
    const idx = {}, taken = new Set();
    for (const f of schema.fields) {
      let at = -1;
      for (let j = 0; j < head.length; j++) {
        if (!taken.has(j) && head[j] === f.db) { at = j; break; }
      }
      if (at >= 0) taken.add(at);
      idx[f.key] = at;
    }
    const found = Object.values(idx).filter(i => i >= 0).length;
    if (!found) { toast('error', t('entry.importFailed'), t('entry.importBadHeader')); return; }
    let added = 0, skipped = 0;
    for (const row of rows.slice(1)) {
      if (!row.some(c => String(c ?? '').trim() !== '')) continue;
      const rec = {};
      for (const f of schema.fields) rec[f.key] = idx[f.key] >= 0 ? String(row[idx[f.key]] ?? '').trim() : '';
      const dk = S.dupKeyOf(rec, schema);
      if (dk && records.some(r => S.dupKeyOf(r, schema) === dk)) { skipped++; continue; }
      records.push({ id: uid(), ...rec }); added++;
    }
    markChanged(); persist(); render();
    const errs = errorCount();
    const notes = [];
    if (found < schema.fields.length) notes.push(t('entry.importColsMatched', { a: found, b: schema.fields.length }));
    if (skipped) notes.push(t('entry.importDupes', { n: skipped }));
    notes.push(errs ? t('entry.importNeedAttention', { n: errs }) : t('entry.importAllValid'));
    if (added) note('imported', added);
    toast(added ? 'success' : 'info', t('entry.importDone', { n: added }), notes.join(' '));
  }
  // RFC 4180: a quoted cell may hold commas, doubled quotes and line breaks, so the whole
  // file is scanned in one pass rather than split into lines first
  function parseCsv(text) {
    const rows = [];
    let row = [], cur = '', quoted = false;
    const endCell = () => { row.push(cur); cur = ''; };
    const endRow = () => { endCell(); if (row.some(c => c.trim() !== '')) rows.push(row); row = []; };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch !== '"') { cur += ch; continue; }
        if (text[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
        continue;
      }
      if (ch === '"') { quoted = true; continue; }
      if (ch === ',') { endCell(); continue; }
      if (ch === '\r') { if (text[i + 1] === '\n') i++; endRow(); continue; }
      if (ch === '\n') { endRow(); continue; }
      cur += ch;
    }
    if (cur !== '' || row.length) endRow();
    return rows;
  }
  function csvq(s) { return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
  function saveCsv(rows, filename) {
    const text = rows.map(r => r.map(v => csvq(String(v ?? ''))).join(',')).join('\r\n');
    saveBlob(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }), filename);
  }
  function saveBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function fileName(suffix) { return `${schema.sheet.replace(/[^A-Za-z0-9]+/g, '_')}_${suffix}`; }

  // ---------- storage ----------
  function load() { try { return JSON.parse(localStorage.getItem(schema.storageKey) || '{}'); } catch { return {}; } }
  function persist() {
    try { localStorage.setItem(schema.storageKey, JSON.stringify({ records, step, submittedAt })); } catch { /* ignore */ }
  }
  // any change to the records reopens the submission
  function markChanged() { submittedAt = null; }
  // feed the dashboard's activity card
  function note(type, n) {
    if (window.KHDA_ACTIVITY) window.KHDA_ACTIVITY.log(type, schema.sheet, n || 1);
  }

  // ---------- modal + toast ----------
  function confirm(title, text, okLabel, single = false) {
    okLabel = okLabel || t('common.continue');
    const m = $('#confirmModal');
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    $('#confirmOk').textContent = okLabel;
    $('#confirmCancel').hidden = single;
    m.hidden = false; $('#confirmOk').focus();
    return new Promise(res => {
      const done = v => { m.hidden = true; cleanup(); res(v); };
      const onOk = () => done(true), onNo = () => done(false), onKey = e => { if (e.key === 'Escape') done(false); };
      function cleanup() {
        $('#confirmOk').removeEventListener('click', onOk);
        $('#confirmCancel').removeEventListener('click', onNo);
        $('#confirmClose').removeEventListener('click', onNo);
        document.removeEventListener('keydown', onKey);
      }
      $('#confirmOk').addEventListener('click', onOk);
      $('#confirmCancel').addEventListener('click', onNo);
      $('#confirmClose').addEventListener('click', onNo);
      document.addEventListener('keydown', onKey);
    });
  }
  function toast(kind, title, text) { window.khdaToast(kind, title, text); }

  // ---------- utils ----------
  function setChip(node, text, kind) {
    if (!node) return;
    node.textContent = text;
    node.className = `chip chip--${kind}` + (node.classList.contains('stepper__status') ? ' stepper__status' : '');
  }
  function describe(r) {
    const keys = schema.pk.length ? schema.pk : schema.gridCols.slice(0, 3);
    const parts = keys.map(k => S.display(r, schema.field(k))).filter(Boolean);
    return parts.length ? parts.join(' · ') : schema.title;
  }
  function fmt(n) { return n == null || n === '' ? '—' : Number(n).toLocaleString('en-US'); }
  function trunc(s, n) { return String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
})();
