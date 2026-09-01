import {
  aggregateNotifications,
  clientStatusLabel,
  getWorkspaceCurrentActionContext,
  serializeReleasedClientReport
} from '/portal-client-core.js';

const portal = window.NexusPortal;
if (!portal) throw new Error('Nexus portal context is unavailable.');
const { sb, state, stateController, runtime, toast } = portal;
if (state.admin && state.viewMode !== 'client') throw new Error('Client Shell must not load in the Nexus admin workspace.');

const { events, boundary, modals } = runtime;
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const arr = value => Array.isArray(value) ? value : [];
const terminal = new Set(['complete', 'completed', 'done', 'closed', 'resolved', 'cancelled', 'canceled', 'archived']);
const addressedRequirement = value => ['ready', 'uploaded', 'build_with_nexus', 'not_available', 'not_applicable'].includes(String(value || '').toLowerCase());
const TABS = Object.freeze([
  ['overview', 'Today'],
  ['data-room', 'Data Room'],
  ['action-queue', 'Actions'],
  ['projects', 'Projects'],
  ['ledger', 'Improvements'],
  ['notifications', 'Notifications']
]);
const TAB_KEYS = new Set(TABS.map(([key]) => key));
const scope = events.createScope('level2-client-shell');
let refreshVersion = 0;

document.body.classList.add('portal-client-mode', 'nexus-client-shell-mode', 'nexus-level2-client');

function day(value) {
  if (!value) return '';
  try { return new Date(String(value).length === 10 ? `${value}T00:00:00` : value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return ''; }
}
function activeCompany(snapshot = state) { return arr(snapshot.companies).find(company => company.id === snapshot.companyId) || null; }
function activeProject(snapshot = state) { return arr(snapshot.projects).find(project => !terminal.has(String(project.status || '').toLowerCase())) || arr(snapshot.projects)[0] || null; }
function statusPill(name) { return `<span class="nexus-client-status ${String(name).toLowerCase().replaceAll('_', '-')}">${esc(clientStatusLabel(name))}</span>`; }
function nexusStore() {
  if (window.NexusStore) return window.NexusStore;
  const allowedTabs = new Set(TABS.map(([key]) => key));
  const store = Object.freeze({
    getState: () => stateController.snapshot(),
    subscribe: listener => stateController.subscribe(listener),
    patch: (values, reason = 'nexus-store:patch') => stateController.patch(values, reason),
    setActiveTab: tab => stateController.patch({ activeTab: allowedTabs.has(tab) ? tab : 'overview' }, 'ui:active-tab'),
    setModalState: modalState => stateController.patch({ modalState: modalState || null }, 'ui:modal-state'),
    setEvidenceChecklist: evidenceChecklist => stateController.patch({ evidenceChecklist }, 'ui:evidence-checklist')
  });
  window.NexusStore = store;
  return store;
}
const store = nexusStore();

function computeEvidenceChecklist(snapshot = state) {
  const requirements = arr(snapshot.dataRequirements);
  const requests = arr(snapshot.docRequests).filter(request => (request.owner_scope || 'client') === 'client');
  const reqDone = requirements.filter(item => addressedRequirement(item.status)).length;
  const requestDone = requests.filter(item => item.fulfilled_document_id || ['fulfilled', 'complete', 'completed', 'uploaded'].includes(String(item.status || '').toLowerCase())).length;
  const total = requirements.length + requests.length;
  const addressed = reqDone + requestDone;
  const missing = Math.max(0, total - addressed);
  const readiness = total ? Math.round((addressed / total) * 100) : 100;
  const nextRequirement = requirements.find(item => !addressedRequirement(item.status));
  const nextRequest = requests.find(item => !item.fulfilled_document_id && String(item.status || '').toLowerCase() === 'requested');
  const nextTitle = nextRequest?.title || nextRequirement?.catalog?.title || null;
  return Object.freeze({ total, addressed, missing, readiness, nextTitle });
}

function syncCanonicalState(snapshot = state, reason = 'ui:sync') {
  const checklist = computeEvidenceChecklist(snapshot);
  const changes = {};
  if (snapshot.currentUser !== snapshot.user) changes.currentUser = snapshot.user || null;
  const existing = snapshot.evidenceChecklist || {};
  if (existing.total !== checklist.total || existing.addressed !== checklist.addressed || existing.missing !== checklist.missing || existing.readiness !== checklist.readiness || existing.nextTitle !== checklist.nextTitle) changes.evidenceChecklist = checklist;
  if (!TAB_KEYS.has(snapshot.activeTab)) changes.activeTab = 'overview';
  if (Object.keys(changes).length) store.patch(changes, reason);
}

function ensureShell() {
  const app = $('portalApp');
  const main = document.querySelector('.main');
  const sidebar = document.querySelector('.sidebar');
  const topbar = document.querySelector('.topbar');
  if (!app || !main || !sidebar || !topbar) throw new Error('Nexus Level Two client shell anchors are missing.');

  document.querySelectorAll('.main > .section').forEach(section => section.classList.add('nexus-client-legacy-section'));
  sidebar.querySelector('.side-nav')?.classList.add('nexus-client-legacy-nav');
  $('companyMini')?.classList.add('nexus-client-legacy-mini');

  let context = $('nexusClientMiniContext');
  if (!context) {
    context = document.createElement('div');
    context.id = 'nexusClientMiniContext';
    context.className = 'nexus-client-mini-context';
    sidebar.prepend(context);
  }

  let nav = $('nexusClientPrimaryNav');
  if (!nav) {
    nav = document.createElement('nav');
    nav.id = 'nexusClientPrimaryNav';
    nav.className = 'nexus-client-primary-nav';
    nav.setAttribute('aria-label', 'Workspace navigation');
    nav.setAttribute('role', 'tablist');
    nav.innerHTML = TABS.map(([key, label]) => `<button type="button" role="tab" data-client-view="${key}" aria-controls="nexus-client-${key}" aria-selected="false"><span aria-hidden="true"></span><b>${label}</b></button>`).join('');
    sidebar.appendChild(nav);
  }

  for (const [key] of TABS) {
    let section = $(`nexus-client-${key}`);
    if (!section) {
      section = document.createElement('section');
      section.id = `nexus-client-${key}`;
      section.className = 'section nexus-client-shell-section';
      section.dataset.clientView = key;
      section.setAttribute('role', 'tabpanel');
      section.setAttribute('aria-labelledby', `nexus-tab-${key}`);
      main.appendChild(section);
    }
  }
  [...nav.querySelectorAll('[data-client-view]')].forEach(button => { button.id = `nexus-tab-${button.dataset.clientView}`; });

  let health = $('nexusHealthButton');
  if (!health) {
    health = document.createElement('button');
    health.id = 'nexusHealthButton';
    health.type = 'button';
    health.className = 'btn secondary nexus-client-utility-button';
    health.textContent = 'System check';
    health.hidden = true;
    topbar.insertBefore(health, $('signOutBtn') || null);
  }

  ensureActionResponseModal();
  ensureApprovalModal();
  bindShellEvents(nav, main);
  updateMiniContext();
  syncCanonicalState(state, 'ui:shell-init');
}

function bindShellEvents(nav, main) {
  scope.delegate(nav, 'click', 'navigation', '[data-client-view]', (_event, button) => activateTab(button.dataset.clientView));
  scope.delegate(main, 'click', 'main-actions', '[data-client-go],[data-complete-task],[data-open-modal],[data-upload-request],[data-download-document],[data-mark-all-read],[data-open-approval]', (event, target) => {
    if (target.dataset.clientGo) return activateTab(target.dataset.clientGo);
    if (target.dataset.completeTask) return openTask(target.dataset.completeTask);
    if (target.dataset.openModal) return openPrimaryModal(target.dataset.openModal, target);
    if (target.dataset.uploadRequest) return openUploadForRequest(target.dataset.uploadRequest, target.dataset.uploadTitle || 'Requested evidence');
    if (target.dataset.downloadDocument) return portal.downloadDocument?.(target.dataset.downloadDocument);
    if (target.hasAttribute('data-mark-all-read')) return $('readAllBtn')?.click();
    if (target.dataset.openApproval) return openApproval(target.dataset.openApproval);
    event.preventDefault();
  });
  scope.delegate(main, 'dragover', 'dragover', '[data-room-dropzone]', (event, target) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; target.classList.add('is-dragging'); });
  scope.delegate(main, 'dragleave', 'dragleave', '[data-room-dropzone]', (_event, target) => target.classList.remove('is-dragging'));
  scope.delegate(main, 'drop', 'drop', '[data-room-dropzone]', (event, target) => handleDrop(event, target));
  scope.delegate(main, 'change', 'file-autocategory', '#docFile', event => { const file = event.target.files?.[0]; if (file) autoCategorize(file); });
  scope.delegate(main, 'click', 'dropzone-click', '[data-room-dropzone]', () => $('docFile')?.click());
  scope.delegate(main, 'keydown', 'dropzone-key', '[data-room-dropzone]', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('docFile')?.click(); } });
  scope.bind(window, 'nexus:workspace-ready', 'workspace-ready', event => { if (event.detail?.companyId === state.companyId) refreshClientShell({ force: true }); });
  scope.bind(window, 'nexus:diagnosis-changed', 'diagnosis-changed', () => refreshClientShell({ force: true }));
}

function updateMiniContext() {
  const host = $('nexusClientMiniContext');
  const company = activeCompany();
  if (!host) return;
  host.innerHTML = `<div class="kicker">Client workspace</div><b>${esc(company?.name || 'Nexus workspace')}</b><span>${esc(company?.industry || company?.website || 'Private client workspace')}</span>`;
}

function activateTab(tab) {
  const next = TAB_KEYS.has(tab) ? tab : 'overview';
  store.setActiveTab(next);
  document.querySelectorAll('.nexus-client-shell-section').forEach(section => {
    const selected = section.dataset.clientView === next;
    section.classList.toggle('active', selected);
    section.hidden = !selected;
  });
  document.querySelectorAll('#nexusClientPrimaryNav [data-client-view]').forEach(button => {
    const selected = button.dataset.clientView === next;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
    button.setAttribute('tabindex', selected ? '0' : '-1');
  });
  renderActiveTab(next);
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
}

function renderActiveTab(tab = state.activeTab || 'overview') {
  if (tab === 'data-room') renderDataRoom();
  else if (tab === 'action-queue') renderActionQueue();
  else if (tab === 'projects') renderProjects();
  else if (tab === 'ledger') renderLedger();
  else if (tab === 'notifications') renderNotifications();
  else renderOverview();
}

function renderOverview() {
  const root = $('nexus-client-overview');
  const context = state.clientContext;
  if (!root || !context) return;
  const primary = context.primaryAction;
  const checklist = state.evidenceChecklist || computeEvidenceChecklist();
  const activeMiles = arr(state.miles).filter(item => !terminal.has(String(item.status || '').toLowerCase()));
  const milestone = activeMiles.sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')))[0] || null;
  const actionRequired = checklist.nextTitle ? `Action required: ${checklist.nextTitle}` : 'No evidence action required';
  root.innerHTML = `<header class="nexus-client-page-head compact"><div><div class="eyebrow">Today</div><h1>Your Next Single Step</h1><p>One decision or action at a time. Everything else waits until it is ready.</p></div></header>
    <section class="nexus-client-primary-action">${primary ? `<div class="nexus-client-primary-label">DO THIS NEXT</div><div class="nexus-client-primary-top"><div><h2>${esc(primary.title)}</h2>${primary.dueDate ? `<span class="nexus-client-due">Due ${esc(day(primary.dueDate))}</span>` : ''}</div>${statusPill('WAITING_ON_YOU')}</div><p class="nexus-client-primary-copy">${esc(primary.provide)}</p><details class="nexus-client-progressive"><summary>Why this matters</summary><p>${esc(primary.why)}</p><p><b>After you submit:</b> ${esc(primary.afterward)}</p></details><button class="btn primary nexus-client-primary-cta" type="button" data-complete-task="${esc(primary.taskId)}">Complete this step →</button>` : `<div class="nexus-client-clear-state"><b>You are clear right now.</b><span>Nexus will place the next required step here automatically.</span></div>`}</section>
    <section class="nexus-client-micro-grid"><button type="button" class="nexus-client-micro-card" data-client-go="data-room"><span>Data Room Readiness</span><strong>${checklist.readiness}%</strong><div class="nexus-client-meter" aria-label="Data Room readiness ${checklist.readiness}%"><i style="width:${checklist.readiness}%"></i></div><small>${esc(actionRequired)}</small></button><button type="button" class="nexus-client-micro-card" data-client-go="action-queue"><span>Ready actions</span><strong>${context.now.length}</strong><small>${context.next.length} upcoming after dependencies clear</small></button><button type="button" class="nexus-client-micro-card" data-client-go="projects"><span>Next milestone</span><strong>${esc(milestone?.title || 'Clear')}</strong><small>${milestone?.due_date ? `Target ${esc(day(milestone.due_date))}` : 'No milestone waiting'}</small></button></section>
    <details class="nexus-client-boundary"><summary>Important boundaries</summary><p>Portal tasks and planning dates coordinate work; they do not amend signed scope, fees, acceptance criteria, or service levels.</p></details>`;
}

function requestCategory(request) {
  const text = `${request.title || ''} ${request.purpose || ''}`.toLowerCase();
  if (/invoice|receipt|square|stripe|bank|payment|revenue|expense|p&l|financial/.test(text)) return 'Financial';
  if (/crm|system|software|integration|calendar|scheduling|email/.test(text)) return 'Systems';
  if (/contract|legal|policy|compliance|privacy/.test(text)) return 'Legal';
  if (/owner|stakeholder|role|people|approval/.test(text)) return 'People';
  return 'General';
}

function renderDataRoom() {
  const root = $('nexus-client-data-room');
  if (!root) return;
  const requests = arr(state.clientDocumentRequests).filter(request => String(request.status || '').toLowerCase() === 'requested' && (request.owner_scope || 'client') === 'client');
  const checklist = state.evidenceChecklist || computeEvidenceChecklist();
  const recent = arr(state.docs).slice(0, 8);
  const groups = new Map();
  for (const request of requests) { const category = requestCategory(request); if (!groups.has(category)) groups.set(category, []); groups.get(category).push(request); }
  root.innerHTML = `<header class="nexus-client-page-head compact"><div><div class="eyebrow">Secure Data Room</div><h1>Drop it. Nexus sorts it.</h1><p>Share the smallest useful example. The portal keeps the request linkage and category with the file.</p></div><div class="nexus-client-readiness"><strong>${checklist.readiness}%</strong><span>ready</span></div></header>
    <section class="nexus-client-files-panel"><div class="nexus-client-section-head"><div><div class="kicker">Requested from you</div><h2>${requests.length ? `${requests.length} item${requests.length === 1 ? '' : 's'} remaining` : 'Nothing waiting'}</h2></div></div>${groups.size ? [...groups.entries()].map(([category, items], index) => `<details class="nexus-client-file-group" ${index === 0 ? 'open' : ''}><summary><span><b>${esc(category)}</b><small>${items.length} request${items.length === 1 ? '' : 's'}</small></span><span>View</span></summary><div class="nexus-client-file-request-list">${items.map(request => `<article class="nexus-client-file-request"><div>${statusPill('WAITING_ON_YOU')}<h3>${esc(request.title)}</h3><p>${esc(request.purpose || 'Nexus needs this evidence to continue.')}</p></div><details><summary>Examples + redaction</summary><p><b>Good examples:</b> ${esc(request.examples || 'Use one representative current-state example.')}</p><p><b>Redact:</b> ${esc(request.redaction_guidance || 'Remove credentials, payment secrets, government IDs, and unrelated personal information.')}</p></details><button type="button" class="btn primary" data-upload-request="${esc(request.id)}" data-upload-title="${esc(request.title)}">Choose this request →</button></article>`).join('')}</div></details>`).join('') : '<div class="nexus-client-clear-state"><b>No file request is waiting.</b><span>Nexus will add one only when evidence is needed.</span></div>'}</section>
    <section class="nexus-client-files-panel"><div class="nexus-client-dropzone" data-room-dropzone tabindex="0" role="button" aria-label="Drop a file here or choose a file below"><span aria-hidden="true">⇩</span><b>Drag a file here</b><small>PDF, DOCX, XLSX, CSV, TXT, PNG or JPG · up to 25 MB</small></div><div id="nexusClientUploadHost"></div></section>
    <details class="nexus-client-evidence-help"><summary>Security, scope and evidence rules</summary><div><p><b>Use representative evidence.</b> A few normal examples usually beat a giant export.</p><p><b>Redact unrelated sensitive data.</b> Never share passwords, MFA codes, API keys, full card data, SSNs, or medical information.</p><p><b>Missing is valid.</b> If something does not exist, tell Nexus instead of manufacturing it.</p></div></details>
    <details class="nexus-client-files-panel nexus-client-shared-files"><summary><span><b>Files already shared</b><small>${recent.length} recent</small></span><span>View</span></summary>${recent.length ? `<div class="nexus-client-file-list">${recent.map(doc => `<div><span><b>${esc(doc.file_name || 'Shared file')}</b><small>${esc(doc.category || 'File')} · ${esc(day(doc.created_at))}</small></span><button type="button" class="btn secondary" data-download-document="${esc(doc.id)}">Download</button></div>`).join('')}</div>` : '<div class="nexus-client-empty-small">No files have been shared yet.</div>'}</details>`;
  mountUploadPanel();
}

function mountUploadPanel() {
  const host = $('nexusClientUploadHost');
  const legacy = document.querySelector('#section-documents .data-room-upload') || document.querySelector('.data-room-upload');
  if (!host || !legacy) return;
  if (legacy.parentElement !== host) host.appendChild(legacy);
  legacy.classList.add('nexus-client-mounted-upload');
  legacy.querySelector('.kicker')?.replaceChildren(document.createTextNode('Secure upload'));
  const title = legacy.querySelector('h2'); if (title) title.textContent = 'Choose a file';
  const help = legacy.querySelector('p.small'); if (help) help.textContent = 'Choose a request above when possible. Nexus will preserve that linkage.';
}

function autoCategorize(file) {
  const category = $('docCategory');
  if (!category || !file) return;
  const name = String(file.name || '').toLowerCase();
  let value = 'General';
  if (/invoice|receipt|bank|payment|revenue|expense|transaction|p&l/.test(name)) value = [...category.options].some(o => o.value === 'Measurement') ? 'Measurement' : 'Client Source';
  else if (/sop|process|workflow|procedure|runbook/.test(name)) value = 'Process Document';
  else if (/report|analysis|summary|export/.test(name)) value = 'Report';
  else if ([...category.options].some(o => o.value === 'Client Source')) value = 'Client Source';
  category.value = value;
  const note = $('docNote'); if (note && !note.value.trim()) note.value = `Representative evidence: ${file.name}`;
  toast?.(`File ready. Categorized as ${value}.`);
}

function handleDrop(event, target) {
  event.preventDefault();
  target.classList.remove('is-dragging');
  const file = event.dataTransfer?.files?.[0];
  const input = $('docFile');
  if (!file || !input) return;
  const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files;
  autoCategorize(file);
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function openUploadForRequest(requestId, title = '') {
  portal.prepareUpload?.({ requestId, title });
  $('nexusClientUploadHost')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  scope.timeout(() => $('docFile')?.focus(), 180);
}

function actionRow(item, mode) {
  const task = item.task;
  if (mode === 'ready') return `<button type="button" class="nexus-client-action-row" data-complete-task="${esc(task.id)}"><div>${statusPill('WAITING_ON_YOU')}<b>${esc(task.title)}</b><span>${esc(task.instructions || task.description || 'Complete this step and submit it to Nexus.')}</span></div><small>${task.due_date ? `Due ${esc(day(task.due_date))}` : 'Ready now'}</small></button>`;
  if (mode === 'upcoming') return `<div class="nexus-client-action-row passive"><div>${statusPill('UPCOMING')}<b>${esc(task.title)}</b><span>Available after “${esc(item.blockedByTitle || 'the prerequisite')}” is complete.</span></div><small>${task.due_date ? esc(day(task.due_date)) : 'Later'}</small></div>`;
  if (mode === 'nexus') return `<div class="nexus-client-action-row passive"><div>${statusPill('NEXUS_WORKING')}<b>${esc(task.title)}</b><span>${esc(task.description || 'Nexus is moving this forward.')}</span></div><small>Nexus</small></div>`;
  return `<div class="nexus-client-action-row passive done"><div>${statusPill('COMPLETE')}<b>${esc(task.title)}</b></div><small>${esc(day(task.completed_at || task.updated_at))}</small></div>`;
}

function renderActionQueue() {
  const root = $('nexus-client-action-queue');
  const context = state.clientContext;
  if (!root || !context) return;
  root.innerHTML = `<header class="nexus-client-page-head compact"><div><div class="eyebrow">Action Queue</div><h1>Only work that is actually ready.</h1><p>Dependencies stay locked until their prerequisite is complete.</p></div><button type="button" class="btn primary" data-open-modal="taskModal">+ Add action</button></header>
    <section class="nexus-client-list-panel"><div class="nexus-client-section-head"><div><div class="kicker">Waiting on you</div><h2>${context.now.length} ready</h2></div></div>${context.now.length ? context.now.map(item => actionRow(item, 'ready')).join('') : '<div class="nexus-client-clear-state"><b>Nothing needs you right now.</b></div>'}</section>
    <details class="nexus-client-list-panel" ${context.next.length ? 'open' : ''}><summary><span><b>Upcoming</b><small>${context.next.length}</small></span><span>View</span></summary>${context.next.map(item => actionRow(item, 'upcoming')).join('') || '<div class="nexus-client-empty-small">No upcoming dependent actions.</div>'}</details>
    <details class="nexus-client-list-panel"><summary><span><b>Nexus working</b><small>${context.nexusWorking.length}</small></span><span>View</span></summary>${context.nexusWorking.map(item => actionRow(item, 'nexus')).join('') || '<div class="nexus-client-empty-small">No Nexus-owned work is visible.</div>'}</details>
    <details class="nexus-client-list-panel"><summary><span><b>Completed</b><small>${context.done.length}</small></span><span>View</span></summary>${context.done.slice(0, 20).map(item => actionRow(item, 'done')).join('') || '<div class="nexus-client-empty-small">Completed actions will appear here.</div>'}</details>`;
}

function renderProjects() {
  const root = $('nexus-client-projects');
  if (!root) return;
  const project = activeProject();
  const miles = arr(state.miles);
  const reports = arr(state.clientReleases).map(serializeReleasedClientReport).filter(Boolean);
  root.innerHTML = `<header class="nexus-client-page-head compact"><div><div class="eyebrow">Projects</div><h1>${esc(project?.name || 'Current engagement')}</h1><p>${esc(project?.summary || project?.service_type || 'The controlled record of what Nexus is implementing with you.')}</p></div></header>
    <section class="nexus-client-project-hero"><div><span>Status</span><b>${esc(project?.status || 'Not configured')}</b></div><div><span>Start</span><b>${esc(day(project?.start_date) || '—')}</b></div><div><span>Target</span><b>${esc(day(project?.target_end_date) || '—')}</b></div></section>
    <section class="nexus-client-list-panel"><div class="nexus-client-section-head"><div><div class="kicker">Milestones</div><h2>Implementation path</h2></div></div>${miles.length ? `<div class="nexus-client-milestones">${miles.map(mile => `<article><span class="nexus-client-status ${esc(String(mile.status || 'planned').toLowerCase())}">${esc(String(mile.status || 'planned').replaceAll('_', ' '))}</span><h3>${esc(mile.title)}</h3><p>${esc(mile.description || '')}</p><small>${esc(day(mile.start_date) || '—')} → ${esc(day(mile.due_date) || '—')}</small></article>`).join('')}</div>` : '<div class="nexus-client-empty-small">No milestones are configured.</div>'}</section>
    <details class="nexus-client-list-panel" ${reports.length ? '' : 'open'}><summary><span><b>Released reports</b><small>${reports.length}</small></span><span>View</span></summary>${reports.length ? `<div class="nexus-client-report-stack">${reports.map(report => `<article class="nexus-client-report"><h3>${esc(report.title || `Nexus report v${report.reportVersion || 1}`)}</h3><small>${report.releasedAt ? `Released ${esc(day(report.releasedAt))}` : ''}</small><p>${esc(report.executive_summary || report.summary || report.overview || 'Open this report in the full release record.')}</p></article>`).join('')}</div>` : '<div class="nexus-client-empty-small">No client-safe report has been released yet.</div>'}</details>
    <details class="nexus-client-boundary"><summary>Planning boundary</summary><p>Portal dates are planning dates unless a signed agreement expressly identifies a binding deadline or service level.</p></details>`;
}

function renderLedger() {
  const root = $('nexus-client-ledger');
  if (!root) return;
  const metrics = arr(state.metrics);
  root.innerHTML = `<header class="nexus-client-page-head compact"><div><div class="eyebrow">Improvement Ledger</div><h1>What is getting better?</h1><p>Baseline → current → target. No vanity dashboard.</p></div><button type="button" class="btn primary" data-open-modal="metricModal">+ Add measurement</button></header>
    <section class="nexus-client-metric-grid">${metrics.length ? metrics.map(metric => `<article><span>${esc(metric.unit || 'metric')}</span><h3>${esc(metric.name)}</h3><div class="nexus-client-metric-values"><div><small>Baseline</small><b>${metric.baseline_value ?? '—'}</b></div><div><small>Current</small><b>${metric.current_value ?? '—'}</b></div><div><small>Target</small><b>${metric.target_value ?? '—'}</b></div></div><details><summary>Measurement method</summary><p>${esc(metric.measurement_method || 'Not documented yet.')}</p></details></article>`).join('') : '<div class="nexus-client-clear-state"><b>No measurements yet.</b><span>Add the first baseline when there is something worth measuring.</span></div>'}</section>
    <details class="nexus-client-boundary"><summary>Measurement rule</summary><p>Movement in a metric does not automatically prove Nexus caused the change. Measurement windows, assumptions, exclusions and attribution should be documented.</p></details>`;
}

function actionableNotifications() {
  const context = state.clientContext;
  const byId = new Map(arr(context?.evaluated).map(item => [item.task.id, item]));
  const inboxRows = arr(state.clientInboxRows);
  const tasks = inboxRows.filter(item => item.kind === 'task' && byId.get(item.related_id)?.state === 'WAITING_ON_YOU');
  const approvals = inboxRows.filter(item => item.kind === 'approval' && item.can_approve);
  const docs = inboxRows.filter(item => item.kind === 'document_request').map(item => ({ ...item, notification_type: 'document_request', id: item.related_id, read_at: null }));
  const docGroups = aggregateNotifications(docs);
  return { tasks, approvals, docGroups };
}

function renderNotifications() {
  const root = $('nexus-client-notifications');
  if (!root) return;
  const { tasks, approvals, docGroups } = actionableNotifications();
  const updates = aggregateNotifications(arr(state.clientInboxRows).filter(item => item.kind === 'update').map(item => ({ ...item, notification_type: item.related_type || 'update', read_at: item.is_unread ? null : new Date().toISOString() })));
  const actionCount = tasks.length + approvals.length + docGroups.length;
  root.innerHTML = `<header class="nexus-client-page-head compact"><div><div class="eyebrow">Notifications</div><h1>${actionCount ? `${actionCount} thing${actionCount === 1 ? '' : 's'} need attention.` : 'Nothing is buried.'}</h1><p>Actionable items first. Informational updates stay separate.</p></div><button type="button" class="btn secondary" data-mark-all-read>Mark all read</button></header>
    <div class="nexus-client-notification-grid"><section class="nexus-client-list-panel"><div class="kicker">Needs action</div>${tasks.map(item => `<button type="button" class="nexus-client-notice" data-complete-task="${esc(item.related_id)}"><b>${esc(item.title)}</b><span>Open action →</span></button>`).join('')}${docGroups.map(group => `<button type="button" class="nexus-client-notice" data-client-go="data-room"><b>${esc(group.title)}</b><span>${group.itemCount} file request${group.itemCount === 1 ? '' : 's'} →</span></button>`).join('')}${approvals.map(item => `<button type="button" class="nexus-client-notice" data-open-approval="${esc(item.approval_chain_id)}"><b>${esc(item.title)}</b><span>Review decision →</span></button>`).join('') || (!actionCount ? '<div class="nexus-client-clear-state"><b>No action required.</b></div>' : '')}</section>
    <section class="nexus-client-list-panel"><div class="kicker">Updates</div>${updates.length ? updates.map(group => `<article class="nexus-client-notice passive"><b>${esc(group.title)}</b><span>${group.itemCount > 1 ? `${group.itemCount} related updates` : esc(group.items[0]?.message || 'Workspace update')}</span></article>`).join('') : '<div class="nexus-client-empty-small">No new updates.</div>'}</section></div>
    <section id="nexusClientPreferencesHost" class="nexus-client-list-panel"></section>`;
  mountNotificationPreferences();
}

function mountNotificationPreferences() {
  const host = $('nexusClientPreferencesHost');
  const panel = $('emailPreferencePanel');
  if (host && panel && panel.parentElement !== host) host.appendChild(panel);
}

function prefillModalDefaults(modalId) {
  const today = new Date().toISOString().slice(0, 10);
  const company = activeCompany();
  const map = {
    taskModal: { taskAssignee: 'client', taskPriority: 'normal', taskDue: today },
    metricModal: {},
    milestoneModal: { milestoneStart: today, milestoneDue: today, milestoneStatus: 'planned' },
    documentRequestModal: { requestDocDue: today, requestDocSensitivity: 'standard' }
  };
  for (const [id, value] of Object.entries(map[modalId] || {})) { const control = $(id); if (control && !control.value) control.value = value; }
  const modal = $(modalId);
  if (modal && company) {
    let context = modal.querySelector('.nexus-modal-context');
    if (!context) { context = document.createElement('p'); context.className = 'small nexus-modal-context'; modal.querySelector('.modal-card .toolbar')?.insertAdjacentElement('afterend', context); }
    if (context) context.textContent = `${company.name} · ${day(today)}`;
  }
}

function openPrimaryModal(modalId, trigger = document.activeElement) {
  if (!['taskModal', 'metricModal', 'milestoneModal', 'documentRequestModal'].includes(modalId)) return;
  prefillModalDefaults(modalId);
  modals.open(modalId, trigger);
}

function ensureActionResponseModal() {
  if ($('nexusClientTaskModal')) return;
  const modal = document.createElement('div');
  modal.id = 'nexusClientTaskModal';
  modal.className = 'nexus-client-modal';
  modal.dataset.nexusModalState = 'CLIENT_ACTION';
  modal.innerHTML = '<div class="nexus-client-modal-card"><div class="nexus-client-modal-head"><div><div class="kicker">Client action</div><h2 id="nexusClientTaskModalTitle">Complete this step</h2></div><button type="button" class="nexus-client-icon-button" data-modal-close aria-label="Close action">×</button></div><div id="nexusClientTaskModalBody"></div></div>';
  document.body.appendChild(modal);
  modals.register(modal, 'level2-client-action');
}

function schemaField(field, existing = {}) {
  const key = String(field.key || field.name || '').trim();
  if (!key) return '';
  const id = `nexus-task-field-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const label = field.label || key.replaceAll('_', ' ');
  const value = existing[key] ?? '';
  const required = field.required ? 'required' : '';
  if (field.type === 'textarea') return `<div class="field"><label for="${esc(id)}">${esc(label)}${field.required ? ' *' : ''}</label><textarea id="${esc(id)}" data-task-field="${esc(key)}" ${required}>${esc(value)}</textarea></div>`;
  if (field.type === 'select' && Array.isArray(field.options)) return `<div class="field"><label for="${esc(id)}">${esc(label)}</label><select id="${esc(id)}" data-task-field="${esc(key)}" ${required}>${field.options.map(option => { const val = typeof option === 'object' ? option.value : option; const text = typeof option === 'object' ? option.label : option; return `<option value="${esc(val)}" ${String(value) === String(val) ? 'selected' : ''}>${esc(text)}</option>`; }).join('')}</select></div>`;
  if (field.type === 'checkbox') return `<label class="nexus-client-checkbox"><input type="checkbox" data-task-field="${esc(key)}" ${value ? 'checked' : ''} ${required}><span>${esc(label)}</span></label>`;
  return `<div class="field"><label for="${esc(id)}">${esc(label)}</label><input id="${esc(id)}" type="${field.type === 'date' ? 'date' : 'text'}" data-task-field="${esc(key)}" value="${esc(value)}" ${required}></div>`;
}

function openTask(taskId) {
  const evaluated = arr(state.clientContext?.evaluated).find(item => item.task.id === taskId);
  if (!evaluated) { toast?.('This action could not be found.'); return; }
  if (evaluated.state !== 'WAITING_ON_YOU') {
    toast?.(evaluated.state === 'UPCOMING' ? `This step becomes available after ${evaluated.blockedByTitle || 'the prerequisite'} is complete.` : 'This step is not waiting on you.');
    return;
  }
  const task = evaluated.task;
  const type = String(task.task_type || '').toLowerCase();
  const routesToFiles = type.includes('upload') || type.includes('evidence') || type === 'preparation_checklist' || /upload|evidence|file|business records/i.test(task.title || '');
  if (routesToFiles) { activateTab('data-room'); toast?.('Use the requested file card to complete this step.'); return; }
  ensureActionResponseModal();
  const body = $('nexusClientTaskModalBody');
  const schema = Array.isArray(task.form_schema) ? task.form_schema : [];
  const existing = task.response_data && typeof task.response_data === 'object' ? task.response_data : {};
  $('nexusClientTaskModalTitle').textContent = task.title || 'Complete this step';
  body.innerHTML = `<div class="nexus-client-task-brief"><div><span>Why Nexus needs it</span><p>${esc(task.description || 'Nexus needs this to move forward without guessing.')}</p></div><div><span>What to provide</span><p>${esc(task.instructions || 'Submit the answer, decision, or completion context Nexus needs.')}</p></div></div><form id="nexusClientTaskForm" data-task-id="${esc(task.id)}">${schema.length ? schema.map(field => schemaField(field, existing)).join('') : `<div class="field"><label for="nexusClientCompletionNote">Your response</label><textarea id="nexusClientCompletionNote" data-task-field="completion_note" required>${esc(existing.completion_note || '')}</textarea></div>`}${type === 'access' ? '<div class="nexus-client-security-note"><b>Security boundary</b><span>Do not enter passwords, MFA codes, API keys or recovery codes.</span></div>' : ''}<div class="actions"><button class="btn primary" type="submit">Submit to Nexus →</button><button class="btn secondary" type="button" data-modal-close>Cancel</button></div></form>`;
  const form = $('nexusClientTaskForm');
  scope.bind(form, 'submit', `task-response:${task.id}`, boundary.wrap('client action submission', submitTaskResponse));
  scope.bind(body.querySelector('[data-modal-close]'), 'click', `task-cancel:${task.id}`, () => modals.close('nexusClientTaskModal'));
  modals.open('nexusClientTaskModal');
}

async function submitTaskResponse(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const taskId = form.dataset.taskId;
  const data = {};
  for (const control of form.querySelectorAll('[data-task-field]')) data[control.dataset.taskField] = control.type === 'checkbox' ? control.checked : control.value.trim();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true; button.textContent = 'Submitting…';
  try {
    const now = new Date().toISOString();
    const result = await sb.from('nexus_tasks').update({ response_data: data, response_updated_at: now, submitted_at: now, status: 'ready_for_review', updated_at: now }).eq('id', taskId).eq('company_id', state.companyId);
    if (result.error) throw result.error;
    await portal.log?.('task_submitted', 'task', taskId, 'Client submitted action for Nexus review');
    modals.close('nexusClientTaskModal');
    toast?.('Submitted to Nexus.');
    await portal.workspace?.();
    await refreshClientShell({ force: true });
  } finally {
    button.disabled = false; button.textContent = 'Submit to Nexus →';
  }
}

function ensureApprovalModal() {
  if ($('nexusClientApprovalModal')) return;
  const modal = document.createElement('div');
  modal.id = 'nexusClientApprovalModal';
  modal.className = 'nexus-client-modal';
  modal.dataset.nexusModalState = 'CLIENT_APPROVAL';
  modal.innerHTML = '<div class="nexus-client-modal-card"><div class="nexus-client-modal-head"><div><div class="kicker">Decision</div><h2 id="nexusClientApprovalTitle">Review decision</h2></div><button type="button" class="nexus-client-icon-button" data-modal-close aria-label="Close decision">×</button></div><div id="nexusClientApprovalBody"></div></div>';
  document.body.appendChild(modal);
  modals.register(modal, 'level2-client-approval');
}

async function openApproval(chainId) {
  if (!chainId) return;
  ensureApprovalModal();
  const body = $('nexusClientApprovalBody');
  body.innerHTML = '<div class="nexus-client-loading">Loading decision…</div>';
  modals.open('nexusClientApprovalModal');
  await boundary.run('approval load', async () => {
    const [chainResult, stepsResult] = await Promise.all([
      sb.from('nexus_approval_chains').select('id,title,description,status,approval_type').eq('id', chainId).single(),
      sb.from('nexus_approval_chain_steps').select('id,step_order,step_name,status,approver_role,instructions,due_at,decision_note').eq('chain_id', chainId).order('step_order')
    ]);
    if (chainResult.error) throw chainResult.error;
    if (stepsResult.error) throw stepsResult.error;
    const chain = chainResult.data;
    const steps = stepsResult.data || [];
    const inbox = arr(state.clientInboxRows).find(item => item.approval_chain_id === chainId);
    const pending = steps.find(step => step.status === 'pending');
    const canApprove = !!inbox?.can_approve && pending?.id === inbox.approval_step_id;
    $('nexusClientApprovalTitle').textContent = chain.title || 'Review decision';
    body.innerHTML = `<p>${esc(chain.description || 'Review this decision before responding.')}</p><div class="nexus-client-approval-route">${steps.map(step => `<div><span>${step.status === 'approved' ? '✓' : step.step_order}</span><div><b>${esc(step.step_name)}</b><small>${esc(String(step.status || '').replaceAll('_', ' '))}</small></div></div>`).join('')}</div>${canApprove ? `<div class="field"><label for="nexusClientApprovalNote">Decision note</label><textarea id="nexusClientApprovalNote"></textarea></div><div class="actions"><button class="btn primary" type="button" data-client-decision="approved" data-step-id="${esc(pending.id)}">Approve</button><button class="btn secondary" type="button" data-client-decision="changes_requested" data-step-id="${esc(pending.id)}">Request changes</button><button class="btn secondary danger" type="button" data-client-decision="rejected" data-step-id="${esc(pending.id)}">Reject</button></div>` : '<div class="nexus-client-empty-small">This decision is not waiting on you.</div>'}`;
    body.querySelectorAll('[data-client-decision]').forEach(button => scope.bind(button, 'click', `approval:${button.dataset.stepId}:${button.dataset.clientDecision}`, boundary.wrap('approval decision', () => decideApproval(button.dataset.stepId, button.dataset.clientDecision))));
  });
}

async function decideApproval(stepId, decision) {
  const note = $('nexusClientApprovalNote')?.value.trim() || null;
  if (decision !== 'approved' && !note) { toast?.('Add a note describing the required change or rejection.'); return; }
  const result = await sb.rpc('nexus_decide_approval_step', { p_step_id: stepId, p_decision: decision, p_note: note });
  if (result.error) throw result.error;
  modals.close('nexusClientApprovalModal');
  toast?.(decision === 'approved' ? 'Decision approved.' : 'Decision recorded.');
  await refreshClientShell({ force: true });
}

async function loadShellData(companyId) {
  const [context, inbox, requests, releaseRows] = await Promise.all([
    getWorkspaceCurrentActionContext(companyId, { sb, tasks: state.tasks }),
    sb.rpc('nexus_get_inbox', { p_company_id: companyId }),
    sb.from('nexus_document_requests').select('id,title,purpose,examples,redaction_guidance,sensitivity,status,due_date,fulfilled_document_id,created_at,updated_at,owner_scope,source_diagnosis_run_id').eq('company_id', companyId).order('created_at', { ascending: false }),
    sb.from('nexus_diagnosis_report_releases').select('id,company_id,project_id,diagnosis_run_id,client_report,status,report_version,released_at,revoked_at,created_at,updated_at').eq('company_id', companyId).eq('status', 'released').is('revoked_at', null).order('released_at', { ascending: false })
  ]);
  if (inbox.error) throw inbox.error;
  if (requests.error) throw requests.error;
  if (releaseRows.error) throw releaseRows.error;
  return { context, inbox: inbox.data || [], requests: requests.data || [], releases: releaseRows.data || [] };
}

async function refreshClientShell({ force = false } = {}) {
  const companyId = state.companyId;
  if (!companyId) return;
  const version = ++refreshVersion;
  await boundary.run('Level Two client shell refresh', async () => {
    const data = await loadShellData(companyId);
    if (version !== refreshVersion || companyId !== state.companyId) return;
    store.patch({
      currentUser: state.user || null,
      clientContext: data.context,
      clientInboxRows: data.inbox,
      clientDocumentRequests: data.requests,
      clientReleases: data.releases,
      evidenceChecklist: computeEvidenceChecklist(state)
    }, 'client-shell:data-ready');
    ensureShell();
    updateMiniContext();
    syncCanonicalState(state, 'client-shell:data-sync');
    activateTab(state.activeTab || 'overview');
    window.dispatchEvent(new CustomEvent('nexus:client-context-ready', { detail: { companyId, primaryTaskId: data.context?.primaryAction?.taskId || null } }));
  }, { silent: !force });
}

store.subscribe((snapshot, meta) => {
  if (meta.reason === 'ui:sync' || meta.reason === 'ui:shell-init' || meta.reason === 'client-shell:data-sync') return;
  if (snapshot.currentUser !== snapshot.user) store.patch({ currentUser: snapshot.user || null }, 'ui:sync');
});

ensureShell();
await refreshClientShell({ force: true });
activateTab(state.activeTab || 'overview');

window.NexusClientShell = Object.freeze({
  refresh: refreshClientShell,
  activateTab,
  activateView: activateTab,
  getCurrentActionContext: () => state.clientContext,
  prefillModalDefaults,
  openPrimaryModal,
  __qa: Object.freeze({ computeEvidenceChecklist, requestCategory, actionableNotifications, tabs: TABS })
});
