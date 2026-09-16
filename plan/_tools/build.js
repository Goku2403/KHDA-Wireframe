// Assembles plan/index.html from:
//   _context/final-ia.json            (information architecture)
//   _context/pages/<id>.json          (per-page spec written by the page agents)
//   images/<id>.png                   (rendered mockups)
//   _context/research-*.json          (sources appendix, optional)
// Usage: node build.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CTX = path.join(ROOT, '_context');
const IMG = path.join(ROOT, 'images');

const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; } };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const li = (arr, cls = '') => (arr || []).length ? `<ul class="${cls}">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';

const ia = readJson(path.join(CTX, 'final-ia.json'), null);
if (!ia) { console.error('final-ia.json missing'); process.exit(1); }

const specs = {};
const pagesDir = path.join(CTX, 'pages');
if (fs.existsSync(pagesDir)) for (const f of fs.readdirSync(pagesDir)) if (f.endsWith('.json')) { const s = readJson(path.join(pagesDir, f), null); if (s && s.id) specs[s.id] = s; }

const ROLE = { institution: 'Institution', 'khda-data': 'KHDA Data', 'khda-it': 'KHDA IT', shared: 'Shared' };
const ROLE_ORDER = ['institution', 'khda-data', 'khda-it', 'shared'];
const STATUS = { old: 'From wireframe', changed: 'Changed', new: 'New' };

const pages = (ia.pages || []).slice();
const byRole = {};
for (const p of pages) (byRole[p.role] = byRole[p.role] || []).push(p);
const imgExists = (id) => fs.existsSync(path.join(IMG, id + '.png'));
const imgSize = (id) => { try { const b = fs.readFileSync(path.join(IMG, id + '.png')); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; } catch (e) { return null; } };

const counts = { old: 0, changed: 0, new: 0 };
for (const p of pages) counts[p.status] = (counts[p.status] || 0) + 1;

// ─────────────────────────── pieces ───────────────────────────
const pipeline = [
  ['HE institution', 'REST client / Excel bridge'], ['iPaaS', 'Integration layer'], ['API Hub', 'Azure API Management'], ['University Adapter', 'API service · own DB'],
  ['Qlik Data Quality', 'validation · profiling · processing'], ['Qlik Portal', 'dashboards · reporting · receipts'],
];
function pipelineSvg() {
  const n = pipeline.length, w = 1100, h = 150, gap = w / n;
  let s = `<svg class="pipe" viewBox="0 0 ${w} ${h}" role="img" aria-label="Release 1 pipeline">`;
  for (let i = 0; i < n; i++) {
    const x = i * gap + gap / 2;
    if (i < n - 1) s += `<line x1="${x + 26}" y1="44" x2="${x + gap - 26}" y2="44" stroke="var(--outline-variant)" stroke-width="3"/>` + `<polygon points="${x + gap - 30},38 ${x + gap - 22},44 ${x + gap - 30},50" fill="var(--outline-variant)"/>`;
    const portal = i >= 4;
    s += `<circle cx="${x}" cy="44" r="22" fill="${portal ? 'var(--primary)' : 'var(--surface)'}" stroke="${portal ? 'var(--primary)' : 'var(--outline-variant)'}" stroke-width="3"/>`;
    s += `<text x="${x}" y="49" text-anchor="middle" font-size="14" fill="${portal ? '#fff' : 'var(--ink-2)'}">${i + 1}</text>`;
    s += `<text x="${x}" y="96" text-anchor="middle" font-size="15" fill="var(--ink)">${esc(pipeline[i][0])}</text>`;
    s += `<text x="${x}" y="118" text-anchor="middle" font-size="12" fill="var(--muted)">${esc(pipeline[i][1])}</text>`;
  }
  s += `<rect x="${4 * gap + 6}" y="4" width="${2 * gap - 12}" height="140" rx="14" fill="none" stroke="var(--primary)" stroke-dasharray="6 6"/>`;
  s += `<text x="${5 * gap}" y="142" text-anchor="middle" font-size="12" fill="var(--primary)">THE PORTAL WE BUILD</text>`;
  return s + '</svg>';
}

function pageCard(p) {
  const s = specs[p.id] || {};
  const has = imgExists(p.id);
  const size = has ? imgSize(p.id) : null;
  const comps = (s.components && s.components.length) ? s.components : (p.keyComponents || []).map((c) => ({ name: c, status: p.status, note: '' }));
  const compHtml = comps.map((c) => `<li class="comp comp--${esc(c.status || p.status)}"><span class="comp__dot"></span><span><b>${esc(c.name)}</b>${c.note ? ` — ${esc(c.note)}` : ''}</span></li>`).join('');
  const impl = s.implementation || {};
  return `
<article class="pg" id="page-${esc(p.id)}">
  <header class="pg__head">
    <div>
      <div class="pg__eyebrow">${esc(ROLE[p.role] || p.role)} · ${esc(p.priority || '')}</div>
      <h3 class="pg__title">${esc(s.title || p.name)}</h3>
      <p class="pg__purpose">${esc(s.summary || p.purpose)}</p>
    </div>
    <span class="badge badge--${esc(p.status)}">${esc(STATUS[p.status] || p.status)}</span>
  </header>
  ${has ? `<a class="shot" href="images/${esc(p.id)}.png" target="_blank" rel="noopener" title="Open full size"><img src="images/${esc(p.id)}.png" alt="${esc(p.name)} mockup" loading="lazy" ${size ? `width="${size.w}" height="${size.h}"` : ''}></a>` : `<div class="shot shot--missing">Mockup not rendered</div>`}
  <div class="pg__grid">
    <section>
      <h4>What the user does here</h4>
      ${li(s.userExperience && s.userExperience.length ? s.userExperience : p.interactions, 'bul')}
    </section>
    <section>
      <h4>Components</h4>
      <ul class="comps">${compHtml}</ul>
    </section>
    <section>
      <h4>Implementation</h4>
      ${impl.dataSources && impl.dataSources.length ? `<p class="k">Data</p>${li(impl.dataSources, 'bul')}` : (p.dataNeeds && p.dataNeeds.length ? `<p class="k">Data</p>${li(p.dataNeeds, 'bul')}` : '')}
      ${impl.apis && impl.apis.length ? `<p class="k">APIs / services</p>${li(impl.apis, 'bul')}` : ''}
      ${impl.reuse && impl.reuse.length ? `<p class="k">Reuse from our wireframe</p>${li(impl.reuse, 'bul')}` : (p.oldReference ? `<p class="k">Reuse from our wireframe</p><p>${esc(p.oldReference)}</p>` : '')}
      ${impl.notes && impl.notes.length ? `<p class="k">Notes</p>${li(impl.notes, 'bul')}` : ''}
    </section>
    <section>
      <h4>Against the competitor</h4>
      <p class="k">Their screen</p><p>${esc((s.competitor && s.competitor.screen) || p.competitorEquivalent || 'none')}</p>
      ${s.competitor && s.competitor.theyHave ? `<p class="k">They have</p><p>${esc(s.competitor.theyHave)}</p>` : ''}
      <p class="k">Our edge</p><p class="edge">${esc((s.competitor && s.competitor.edge) || p.beatsCompetitor)}</p>
      ${p.innovation ? `<p class="k">Signature interaction</p><p>${esc(p.innovation)}</p>` : ''}
    </section>
  </div>
  ${s.suggestions && s.suggestions.length ? `<div class="pg__sugg"><h4>Suggestions</h4>${li(s.suggestions, 'bul')}</div>` : ''}
</article>`;
}

function journeyHtml(j) {
  return `<div class="journey"><div class="journey__head"><b>${esc(j.name)}</b><span class="tag">${esc(ROLE[j.role] || j.role)}</span></div>
  <ol class="journey__steps">${(j.steps || []).map((st) => `<li>${esc(st)}</li>`).join('')}</ol>
  ${j.pagesInvolved && j.pagesInvolved.length ? `<div class="journey__pages">${j.pagesInvolved.map((id) => `<a href="#page-${esc(id)}">${esc((pages.find((p) => p.id === id) || {}).name || id)}</a>`).join('')}</div>` : ''}</div>`;
}

const research = fs.readdirSync(CTX).filter((f) => f.startsWith('research-') && f.endsWith('.json')).map((f) => readJson(path.join(CTX, f), null)).filter(Boolean);

// ─────────────────────────── document ───────────────────────────
const toc = [
  ['summary', 'Executive summary'], ['architecture', 'Architecture we build on'], ['roles', 'Roles & navigation'], ['journeys', 'Journeys'],
  ...ROLE_ORDER.filter((r) => byRole[r]).map((r) => ['pages-' + r, ROLE[r] + ' pages']),
  ['scoring', 'Fair scoring model'], ['compare', 'Competitor comparison'], ['delta', 'Old · changed · new'], ['phases', 'Implementation phases'], ['suggestions', 'Suggestions'],
  ...(research.length ? [['sources', 'Research sources']] : []),
];

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(ia.productName || 'KHDA Higher-Education Data Portal')} — Product plan</title>
<style>
:root{
  --primary:#A8305C; --primary-ink:#7A1D42; --primary-wash:#FFECF0;
  --ink:#1B1B1F; --ink-2:#4B4546; --muted:#5E5E62; --line:#E4E2E6; --line-2:#C0C6CF;
  --surface:#FFFFFF; --surface-2:#FBF8FD; --ground:#F5F5F5;
  --success:#0D6D2D; --success-wash:#E3F6E7; --warning:#835400; --warning-wash:#FFEEDD; --info:#006687; --info-wash:#E6EFF7; --error:#C0000A;
  --font:"Dubai","Segoe UI","Helvetica Neue",Arial,system-ui,sans-serif;
  --mono:Consolas,"Courier New",monospace;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;font:400 16px/24px var(--font);color:var(--ink);background:radial-gradient(1000px 520px at 100% -10%, rgba(35,183,177,.16), rgba(245,245,245,0) 65%),var(--ground)}
a{color:var(--primary);text-decoration:none}a:hover{text-decoration:underline}
h1,h2,h3,h4,p,ul,ol{margin:0}
.wrap{max-width:1360px;margin:0 auto;padding:0 32px 96px}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 0 0}
.top img{height:48px}
.mast{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:48px;padding:40px 0 32px;border-bottom:1px solid var(--line-2);align-items:end}
.eyebrow{font:400 14px/20px var(--font);letter-spacing:1.4px;text-transform:uppercase;color:var(--primary)}
h1{font:300 56px/60px var(--font);letter-spacing:-.4px;margin:12px 0 16px}
.thesis{font:300 22px/32px var(--font);color:var(--ink-2);max-width:60ch}
.facts{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.fact{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px}
.fact b{display:block;font:300 36px/40px var(--font)}
.fact span{font:400 14px/20px var(--font);color:var(--muted)}
.layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:48px;padding-top:32px}
.toc{position:sticky;top:24px;align-self:start;display:flex;flex-direction:column;gap:4px;font:400 14px/20px var(--font)}
.toc a{padding:6px 10px;border-radius:8px;color:var(--ink-2)}.toc a:hover{background:var(--primary-wash);text-decoration:none;color:var(--primary-ink)}
.toc .sub{padding-inline-start:18px}
section.sec{padding:40px 0 8px;scroll-margin-top:24px}
h2{font:300 40px/48px var(--font);letter-spacing:-.2px;margin-bottom:8px}
.lede{color:var(--ink-2);max-width:70ch;margin-bottom:24px}
h3{font:400 24px/32px var(--font)}
h4{font:400 14px/20px var(--font);letter-spacing:1.2px;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
.k{font:400 12px/16px var(--font);letter-spacing:1.2px;text-transform:uppercase;color:var(--muted);margin:12px 0 4px}
.k:first-child{margin-top:0}
.bul{padding-inline-start:18px;display:flex;flex-direction:column;gap:6px;color:var(--ink-2)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:24px}
.grid{display:grid;gap:16px}.g2{grid-template-columns:repeat(2,minmax(0,1fr))}.g3{grid-template-columns:repeat(3,minmax(0,1fr))}
.tag{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:8px;background:var(--surface-2);border:1px solid var(--line);font:400 13px/20px var(--font);color:var(--ink-2)}
.badge{display:inline-flex;align-items:center;height:28px;padding:0 12px;border-radius:999px;font:400 13px/20px var(--font);letter-spacing:.3px;white-space:nowrap}
.badge--new{background:var(--primary);color:#fff}.badge--changed{background:var(--warning-wash);color:var(--warning);border:1px solid #C78200}.badge--old{background:var(--surface-2);color:var(--ink-2);border:1px solid var(--line-2)}
.pipe{width:100%;height:auto;display:block}
.pipe text{font-family:var(--font)}
.stages{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:16px}
.stage{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.stage b{display:block;margin-bottom:4px}.stage span{font-size:14px;color:var(--ink-2)}
.roles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.role{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px;border-top:4px solid var(--primary)}
.role h3{margin-bottom:4px}.role p{color:var(--muted);font-size:14px;margin-bottom:12px}
.nav{display:flex;flex-wrap:wrap;gap:8px}.nav span{padding:4px 10px;border-radius:999px;background:var(--primary-wash);color:var(--primary-ink);font-size:14px}
.journeys{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.journey{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px}
.journey__head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}
.journey__steps{padding-inline-start:20px;display:flex;flex-direction:column;gap:6px;color:var(--ink-2);font-size:15px}
.journey__pages{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.journey__pages a{font-size:13px;padding:2px 8px;border:1px solid var(--line);border-radius:999px;background:var(--surface-2)}
.pg{background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:28px;margin-bottom:24px;scroll-margin-top:24px}
.pg__head{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:16px}
.pg__eyebrow{font:400 13px/20px var(--font);letter-spacing:1.2px;text-transform:uppercase;color:var(--primary)}
.pg__title{font:300 32px/40px var(--font);margin:4px 0 6px}
.pg__purpose{color:var(--ink-2);max-width:80ch}
.shot{display:block;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--surface-2);margin-bottom:20px}
.shot img{display:block;width:100%;height:auto}
.shot--missing{padding:48px;text-align:center;color:var(--muted)}
.pg__grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px}
.pg__grid section{min-width:0;font-size:15px;line-height:22px}
.pg__grid p{color:var(--ink-2)}
.edge{color:var(--ink);background:var(--primary-wash);border-radius:8px;padding:8px 10px}
.comps{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px}
.comp{display:flex;gap:8px;align-items:flex-start;color:var(--ink-2)}.comp b{font-weight:400;color:var(--ink)}
.comp__dot{width:10px;height:10px;border-radius:50%;margin-top:6px;flex:0 0 auto;background:var(--line-2)}
.comp--new .comp__dot{background:var(--primary)}.comp--changed .comp__dot{background:#C78200}.comp--old .comp__dot{background:var(--line-2)}
.pg__sugg{margin-top:20px;padding-top:16px;border-top:1px dashed var(--line)}
table{width:100%;border-collapse:separate;border-spacing:0;background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden;font-size:15px}
th{background:var(--surface-2);text-align:left;padding:12px 16px;font-weight:400;color:var(--ink-2);border-bottom:1px solid var(--line);font-size:13px;letter-spacing:.6px;text-transform:uppercase}
td{padding:12px 16px;border-bottom:1px solid var(--line);vertical-align:top;color:var(--ink-2)}
tr:last-child td{border-bottom:0}
td.ours{color:var(--ink)}
.formula{font-family:var(--mono);font-size:13px;background:var(--surface-2);border-radius:6px;padding:2px 6px;white-space:nowrap}
.legend{display:flex;gap:16px;font-size:14px;color:var(--muted);margin:8px 0 16px}.legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-inline-end:6px;vertical-align:middle}
.phases{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.phase{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px}
.phase b{display:block;font:400 20px/28px var(--font);margin-bottom:6px}.phase p{color:var(--ink-2);font-size:15px;margin-bottom:10px}
.phase .nav a{background:var(--surface-2);color:var(--ink-2);border:1px solid var(--line)}
.inn{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.inn div{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px;border-inline-start:4px solid var(--primary)}
.inn b{display:block;font:400 20px/28px var(--font);margin-bottom:6px}.inn p{color:var(--ink-2);font-size:15px}.inn em{display:block;margin-top:8px;color:var(--primary-ink);font-style:normal;font-size:14px}
.inn .nav{margin-top:10px}
.foot{margin-top:48px;padding-top:24px;border-top:1px solid var(--line-2);color:var(--muted);font-size:14px;display:flex;justify-content:space-between}
@media (max-width:1100px){.layout{grid-template-columns:1fr}.toc{position:static;flex-direction:row;flex-wrap:wrap}.pg__grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mast{grid-template-columns:1fr}.roles,.phases,.inn,.stages{grid-template-columns:1fr}.journeys{grid-template-columns:1fr}}
@media print{.toc{display:none}.layout{grid-template-columns:1fr}.pg{break-inside:avoid}body{background:#fff}}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <img src="../assets/gov-dubai.svg" alt="Government of Dubai">
    <img src="../assets/khda-logo.svg" alt="Dubai Knowledge">
  </div>
  <header class="mast">
    <div>
      <div class="eyebrow">KHDA · Higher education · Data readiness · Product plan</div>
      <h1>${esc(ia.productName || 'KHDA Higher-Education Data Portal')}</h1>
      <p class="thesis">${esc(ia.thesis || '')}</p>
    </div>
    <div class="facts">
      <div class="fact"><b>${pages.length}</b><span>pages across 3 roles</span></div>
      <div class="fact"><b>${counts.new || 0}</b><span>new pages</span></div>
      <div class="fact"><b>${(counts.old || 0) + (counts.changed || 0)}</b><span>carried from our wireframe (${counts.changed || 0} redesigned)</span></div>
      <div class="fact"><b>37 × 46</b><span>institutions × datasets per period</span></div>
      <div class="fact"><b>EN / AR</b><span>bilingual, RTL, accessible</span></div>
      <div class="fact"><b>R1</b><span>iPaaS → API Hub → Adapter → Qlik DQ → Portal</span></div>
    </div>
  </header>

  <div class="layout">
    <nav class="toc" aria-label="Contents">${toc.map(([id, t]) => `<a href="#${id}">${esc(t)}</a>`).join('')}</nav>
    <div>

      <section class="sec" id="summary">
        <h2>Executive summary</h2>
        <p class="lede">${esc(ia.thesis || '')}</p>
        <div class="grid g2">
          <div class="card"><h4>Principles</h4>${li(ia.principles, 'bul')}</div>
          <div class="card"><h4>Why this beats the competitor's demo</h4>${li((ia.competitorComparison || []).slice(0, 8).map((c) => `${c.capability}: ${c.ours}`), 'bul')}</div>
        </div>
        <h3 style="margin:32px 0 12px">Signature innovations</h3>
        <div class="inn">${(ia.signatureInnovations || []).map((x) => `<div><b>${esc(x.name)}</b><p>${esc(x.description)}</p><em>${esc(x.whyItWins)}</em>${x.pages && x.pages.length ? `<div class="nav">${x.pages.map((id) => `<a href="#page-${esc(id)}"><span>${esc((pages.find((p) => p.id === id) || {}).name || id)}</span></a>`).join('')}</div>` : ''}</div>`).join('')}</div>
      </section>

      <section class="sec" id="architecture">
        <h2>The architecture we build on</h2>
        <p class="lede">KHDA's Release-1 approach: institutions submit through the integration layer and the Azure API Hub into a university adapter; every submission then passes through the Qlik data-quality layer before it reaches the portal. The portal we plan is the Qlik layer made visible — stages 5 and 6 below — with the earlier stages surfaced as a live journey for every submission.</p>
        <div class="card">${pipelineSvg()}
          <div class="stages">
            <div class="stage"><b>1 · Institution</b><span>REST client through iPaaS, or the Excel bridge for exception-approved institutions. Self-service credentials, sandbox, submission log.</span></div>
            <div class="stage"><b>2 · iPaaS</b><span>Receives the call; the portal shows "Received" with the timestamp and channel.</span></div>
            <div class="stage"><b>3 · API Hub</b><span>Client id, token and IP allowlist validation. Failures surface as an authentication error on the journey — never a silent drop.</span></div>
            <div class="stage"><b>4 · University Adapter</b><span>Stores the payload in the institution's own DB; the portal shows "Stored" and the record count.</span></div>
            <div class="stage"><b>5 · Qlik Data Quality</b><span>Validation (dictionary rules), profiling (completeness, distributions), processing (load). Every issue is row-addressable and fixable from the portal.</span></div>
            <div class="stage"><b>6 · Qlik Portal</b><span>Receipt issued, dashboards updated, compliance and readiness recalculated, notifications sent.</span></div>
          </div>
        </div>
      </section>

      <section class="sec" id="roles">
        <h2>Roles &amp; navigation</h2>
        <p class="lede">Three roles, one shell. The header, search, notifications, language and accessibility controls are shared; the navigation and home page change with the role.</p>
        <div class="roles">
          <div class="role"><h3>Institution</h3><p>Data Steward · Approver · Institution Admin · Read-only</p><div class="nav">${(ia.navigation.institution || []).map((n) => `<span>${esc(n)}</span>`).join('')}</div></div>
          <div class="role"><h3>KHDA Data</h3><p>Analyst · Lead</p><div class="nav">${(ia.navigation.khdaData || []).map((n) => `<span>${esc(n)}</span>`).join('')}</div></div>
          <div class="role"><h3>KHDA IT</h3><p>Integration · Security · Admin</p><div class="nav">${(ia.navigation.khdaIt || []).map((n) => `<span>${esc(n)}</span>`).join('')}</div></div>
        </div>
        ${ia.crossCutting && ia.crossCutting.length ? `<h3 style="margin:32px 0 12px">Cross-cutting capabilities</h3><div class="grid g3">${ia.crossCutting.map((c) => `<div class="card" style="padding:16px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:6px"><b style="font-weight:400">${esc(c.name)}</b><span class="badge badge--${esc(c.status)}">${esc(STATUS[c.status] || c.status)}</span></div><p style="color:var(--ink-2);font-size:14px">${esc(c.description)}</p></div>`).join('')}</div>` : ''}
      </section>

      <section class="sec" id="journeys">
        <h2>Journeys</h2>
        <p class="lede">Each journey is a sequence of pages; the page cards below link back here.</p>
        <div class="journeys">${(ia.journeys || []).map(journeyHtml).join('')}</div>
      </section>

      ${ROLE_ORDER.filter((r) => byRole[r]).map((r) => `
      <section class="sec" id="pages-${r}">
        <h2>${esc(ROLE[r])} pages</h2>
        <div class="legend"><span><i style="background:var(--primary)"></i>New</span><span><i style="background:#C78200"></i>Changed</span><span><i style="background:var(--line-2)"></i>From our wireframe</span></div>
        ${byRole[r].map(pageCard).join('')}
      </section>`).join('')}

      <section class="sec" id="scoring">
        <h2>Fair scoring model</h2>
        <p class="lede">${esc((ia.scoringModel || {}).summary || '')}</p>
        <table><thead><tr><th>Measure</th><th>Max</th><th>Formula</th><th>Fixes</th></tr></thead><tbody>
        ${((ia.scoringModel || {}).measures || []).map((m) => `<tr><td class="ours">${esc(m.name)}</td><td>${esc(m.maxPoints)}</td><td><span class="formula">${esc(m.formula)}</span></td><td>${esc(m.fixesCompetitorFlaw || '')}</td></tr>`).join('')}
        </tbody></table>
      </section>

      <section class="sec" id="compare">
        <h2>Competitor comparison</h2>
        <table><thead><tr><th>Capability</th><th>Competitor demo</th><th>Our portal</th></tr></thead><tbody>
        ${(ia.competitorComparison || []).map((c) => `<tr><td class="ours">${esc(c.capability)}</td><td>${esc(c.competitor)}</td><td class="ours">${esc(c.ours)}</td></tr>`).join('')}
        </tbody></table>
      </section>

      <section class="sec" id="delta">
        <h2>Old · changed · new</h2>
        <div class="grid g3">
          <div class="card"><h4>From our wireframe (kept)</h4>${li((ia.oldNewChanged || {}).old, 'bul')}</div>
          <div class="card"><h4>Changed</h4>${li((ia.oldNewChanged || {}).changed, 'bul')}</div>
          <div class="card"><h4>New</h4>${li((ia.oldNewChanged || {}).new, 'bul')}</div>
        </div>
      </section>

      <section class="sec" id="phases">
        <h2>Implementation phases</h2>
        <div class="phases">${(ia.implementationPhases || []).map((ph) => `<div class="phase"><b>${esc(ph.phase)}</b><p>${esc(ph.goal)}</p><div class="nav">${(ph.pages || []).map((id) => `<a href="#page-${esc(id)}"><span>${esc((pages.find((p) => p.id === id) || {}).name || id)}</span></a>`).join('')}</div>${ph.notes ? `<p style="margin-top:10px;font-size:14px;color:var(--muted)">${esc(ph.notes)}</p>` : ''}</div>`).join('')}</div>
      </section>

      <section class="sec" id="suggestions">
        <h2>Suggestions</h2>
        <div class="card">${li(ia.suggestions, 'bul')}</div>
      </section>

      ${research.length ? `<section class="sec" id="sources"><h2>Research sources</h2><div class="grid g2">${research.map((r) => `<div class="card" style="padding:16px"><h4>${esc(r.topic)}</h4>${li((r.exemplars || []).map((e) => `${e.name}: ${e.whatToBorrow}`), 'bul')}</div>`).join('')}</div></section>` : ''}

      <div class="foot"><span>© 2026 Knowledge and Human Development Authority · Product plan prepared for evaluation</span><span>Mockups rendered on the KHDA Design System (DDS v2.2) in Dubai type</span></div>
    </div>
  </div>
</div>
</body>
</html>`;

fs.writeFileSync(path.join(ROOT, 'index.html'), html);
const missing = pages.filter((p) => !imgExists(p.id)).map((p) => p.id);
console.log(`built index.html — ${pages.length} pages, ${Object.keys(specs).length} specs, ${pages.length - missing.length} images` + (missing.length ? `, missing images: ${missing.join(', ')}` : ''));
