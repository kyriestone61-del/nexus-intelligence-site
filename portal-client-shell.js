import {
  aggregateNotifications,
  clientStatusLabel,
  getWorkspaceCurrentActionContext,
  serializeReleasedClientReport
} from '/portal-client-core.js';

const portal = window.NexusPortal;
if (!portal) throw new Error('Nexus portal context is unavailable.');
const { sb, state, toast } = portal;
if (state.admin) throw new Error('Client Shell must not load in the Nexus admin workspace.');

document.body.classList.add('portal-client-mode', 'nexus-client-shell-mode');

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const arr = value => Array.isArray(value) ? value : [];
const terminal = new Set(['complete', 'completed', 'done', 'closed', 'resolved', 'cancelled', 'canceled', 'archived']);
const day = value => {
  if (!value) return '';
  try { return new Date(String(value).length === 10 ? `${value}T00:00:00` : value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return ''; }
};

let currentContext = null;
let inboxRows = [];
let documentRequests = [];
let releases = [];
let activeView = 'home';
let inboxTab = 'action';
let lastFocus = null;
let refreshInFlight = null;

const FIVE_VIEWS = [['home', 'Home'], ['files', 'Files'], ['reports', 'Reports'], ['progress', 'Progress'], ['help', 'Help']];

function activeCompany() { return state.companies?.find(company => company.id === state.companyId) || null; }
function activeProject() { return [...arr(state.projects)].find(project => !terminal.has(String(project.status || '').toLowerCase())) || arr(state.projects)[0] || null; }

function ensureShell() {
  const portalApp = $('portalApp');
  const main = document.querySelector('.main');
  const sidebar = document.querySelector('.sidebar');
  const topbar = document.querySelector('.topbar');
  if (!portalApp || !main || !sidebar || !topbar) throw new Error('Nexus client shell anchors are missing.');

  document.querySelectorAll('.main > .section').forEach(section => section.classList.add('nexus-client-legacy-section'));
  const legacyNav = sidebar.querySelector('.side-nav');
  if (legacyNav) legacyNav.classList.add('nexus-client-legacy-nav');
  const legacyMini = $('companyMini');
  if (legacyMini) legacyMini.classList.add('nexus-client-legacy-mini');

  let nav = $('nexusClientPrimaryNav');
  if (!nav) {
    nav = document.createElement('nav');
    nav.id = 'nexusClientPrimaryNav';
    nav.className = 'nexus-client-primary-nav';
    nav.setAttribute('aria-label', 'Client workspace');
    nav.innerHTML = FIVE_VIEWS.map(([key, label]) => `<button type="button" data-client-view="${key}"><span aria-hidden="true"></span><b>${label}</b></button>`).join('');
    sidebar.prepend(nav);
    nav.querySelectorAll('[data-client-view]').forEach(button => button.addEventListener('click', () => activateView(button.dataset.clientView)));
  }

  let context = $('nexusClientMiniContext');
  if (!context) {
    context = document.createElement('div');
    context.id = 'nexusClientMiniContext';
    context.className = 'nexus-client-mini-context';
    sidebar.prepend(context);
  }

  for (const [key] of FIVE_VIEWS) {
    if ($(`nexus-client-${key}`)) continue;
    const section = document.createElement('section');
    section.id = `nexus-client-${key}`;
    section.className = 'section nexus-client-shell-section';
    section.dataset.clientView = key;
    main.appendChild(section);
  }

  let inboxButton = $('nexusClientInboxButton');
  if (!inboxButton) {
    inboxButton = document.createElement('button');
    inboxButton.id = 'nexusClientInboxButton';
    inboxButton.type = 'button';
    inboxButton.className = 'btn secondary nexus-client-inbox-button';
    inboxButton.setAttribute('aria-haspopup', 'dialog');
    inboxButton.setAttribute('aria-expanded', 'false');
    inboxButton.innerHTML = '<span>Inbox</span><b id="nexusClientInboxCount" aria-label="0 items">0</b>';
    const signOut = $('signOutBtn');
    topbar.insertBefore(inboxButton, signOut || null);
    inboxButton.addEventListener('click', openInbox);
  }

  if (!$('nexusClientInboxDrawer')) {
    const drawer = document.createElement('aside');
    drawer.id = 'nexusClientInboxDrawer';
    drawer.className = 'nexus-client-inbox-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-labelledby', 'nexusClientInboxTitle');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML = `<div class="nexus-client-inbox-head"><div><div class="kicker">Inbox</div><h2 id="nexusClientInboxTitle">What needs attention?</h2></div><button type="button" class="nexus-client-icon-button" data-close-client-inbox aria-label="Close Inbox">×</button></div><div class="nexus-client-inbox-tabs" role="tablist" aria-label="Inbox views"><button type="button" class="active" role="tab" data-client-inbox-tab="action">Needs action <b data-client-inbox-tab-count="action">0</b></button><button type="button" role="tab" data-client-inbox-tab="update">Updates <b data-client-inbox-tab-count="update">0</b></button></div><div id="nexusClientInboxBody" class="nexus-client-inbox-body"></div>`;
    document.body.appendChild(drawer);
    drawer.querySelector('[data-close-client-inbox]').addEventListener('click', closeInbox);
    drawer.querySelectorAll('[data-client-inbox-tab]').forEach(button => button.addEventListener('click', () => {
      inboxTab = button.dataset.clientInboxTab;
      drawer.querySelectorAll('[data-client-inbox-tab]').forEach(tab => tab.classList.toggle('active', tab === button));
      renderInbox();
    }));
  }

  ensureTaskModal();
  ensureApprovalModal();
  ensureGuide();
  mountNotificationPreferences();
  updateMiniContext();
}

function updateMiniContext() {
  const host = $('nexusClientMiniContext');
  const company = activeCompany();
  if (!host) return;
  host.innerHTML = `<div class="kicker">Client workspace</div><b>${esc(company?.name || 'Nexus workspace')}</b><span>${esc(company?.industry || company?.website || 'Private client workspace')}</span>`;
}

function activateView(view) {
  if (!FIVE_VIEWS.some(([key]) => key === view)) view = 'home';
  activeView = view;
  document.querySelectorAll('.nexus-client-shell-section').forEach(section => section.classList.toggle('active', section.dataset.clientView === view));
  document.querySelectorAll('#nexusClientPrimaryNav [data-client-view]').forEach(button => {
    const selected = button.dataset.clientView === view;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-current', selected ? 'page' : 'false');
  });
  if (view === 'files') renderFiles();
  else if (view === 'reports') renderReports();
  else if (view === 'progress') renderProgress();
  else if (view === 'help') renderHelp();
  else renderHome();
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
}

function shellStatus(stateName) {
  const label = clientStatusLabel(stateName);
  return `<span class="nexus-client-status ${String(stateName).toLowerCase().replaceAll('_', '-')}">${esc(label)}</span>`;
}

function renderHome() {
  const root = $('nexus-client-home');
  if (!root || !currentContext) return;
  const primary = currentContext.primaryAction;
  const secondary = currentContext.secondaryActionable;
  const working = currentContext.nexusWorking.slice(0, 3);
  const milestone = [...arr(state.miles)].filter(item => !terminal.has(String(item.status || '').toLowerCase())).sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')))[0] || null;
  const done = currentContext.done.slice(0, 3);

  root.innerHTML = `<header class="nexus-client-page-head"><div><div class="eyebrow">Home</div><h1>What do you need to do?</h1><p>One next step. Everything else stays out of the way until it is ready.</p></div><button class="btn secondary" type="button" data-open-guide-question="What do I need to do next?">Need help?</button></header><section class="nexus-client-primary-action"><div class="nexus-client-primary-label">YOUR NEXT STEP</div>${primary ? `<div class="nexus-client-primary-top"><div><h2>${esc(primary.title)}</h2>${primary.dueDate ? `<span class="nexus-client-due">Due ${esc(day(primary.dueDate))}</span>` : ''}</div>${shellStatus('WAITING_ON_YOU')}</div><div class="nexus-client-primary-grid"><div><span>Why Nexus Needs It</span><p>${esc(primary.why)}</p></div><div><span>What You Need to Provide</span><p>${esc(primary.provide)}</p></div><div><span>What Happens Afterward</span><p>${esc(primary.afterward)}</p></div></div><button class="btn primary nexus-client-primary-cta" type="button" data-complete-task="${esc(primary.taskId)}">Complete this step →</button>` : `<div class="nexus-client-clear-state"><b>You are clear right now.</b><span>No dependency-cleared client action is waiting on you. Nexus will place the next required step here automatically.</span></div>`}</section><details class="nexus-client-up-next"><summary><span>UP NEXT — ${secondary.length}</span><span>Show</span></summary><div>${secondary.length ? secondary.map(item => `<button type="button" class="nexus-client-secondary-task" data-complete-task="${esc(item.task.id)}"><span>${shellStatus(item.state)}<b>${esc(item.task.title)}</b></span><small>${item.task.due_date ? `Due ${esc(day(item.task.due_date))}` : 'Ready when you are'}</small></button>`).join('') : '<div class="nexus-client-empty-small">No additional dependency-cleared actions are waiting.</div>'}</div></details><div class="nexus-client-home-grid"><section class="nexus-client-soft-panel"><div class="kicker">Nexus is working on</div><h2>No guessing required</h2>${working.length ? working.map(item => `<div class="nexus-client-line-item">${shellStatus('NEXUS_WORKING')}<div><b>${esc(item.task.title)}</b><span>${esc(item.task.description || item.task.instructions || 'Nexus is moving this work forward.')}</span></div></div>`).join('') : '<div class="nexus-client-empty-small">No active Nexus-owned work is visible right now.</div>'}</section><section class="nexus-client-soft-panel"><div class="kicker">Next milestone</div><h2>${esc(milestone?.title || 'No milestone is waiting')}</h2><p>${esc(milestone?.description || 'Nexus will show the next milestone here once it is scheduled.')}</p>${milestone?.due_date ? `<span class="nexus-client-muted">Target ${esc(day(milestone.due_date))}</span>` : ''}<button class="btn secondary" type="button" data-client-go="progress">See Progress →</button></section></div><section class="nexus-client-soft-panel nexus-client-recent-done"><div class="nexus-client-section-head"><div><div class="kicker">Recently completed</div><h2>What moved forward</h2></div><button class="btn secondary" type="button" data-client-go="progress">See all progress</button></div>${done.length ? `<div class="nexus-client-done-grid">${done.map(item => `<div><span aria-hidden="true">✓</span><b>${esc(item.task.title)}</b><small>${esc(day(item.task.completed_at || item.task.updated_at))}</small></div>`).join('')}</div>` : '<div class="nexus-client-empty-small">Completed client steps will collect here.</div>'}</section>`;
  bindCommon(root);
}

function requestCategory(request) {
  const text = `${request.title || ''} ${request.purpose || ''}`.toLowerCase();
  if (/square|stripe|novo|american express|amex|bank|profit.?and.?loss|p&l|financial|payment|reconciliation|revenue|expense/.test(text)) return 'Financial';
  if (/acuity|email|crm|system|software|tool|integration|reminder|calendar|scheduling/.test(text)) return 'Systems';
  if (/contract|legal|policy|compliance|privacy/.test(text)) return 'Legal';
  if (/owner|decision maker|stakeholder|people|role/.test(text)) return 'People';
  return 'General';
}

function renderFiles() {
  const root = $('nexus-client-files');
  if (!root) return;
  const requested = documentRequests.filter(request => String(request.status || '').toLowerCase() === 'requested' && (request.owner_scope || 'client') === 'client');
  const categories = new Map();
  requested.forEach(request => { const category = requestCategory(request); if (!categories.has(category)) categories.set(category, []); categories.get(category).push(request); });
  const recentDocs = arr(state.docs).slice(0, 12);
  root.innerHTML = `<header class="nexus-client-page-head"><div><div class="eyebrow">Files</div><h1>Give Nexus only what it needs.</h1><p>Representative evidence beats a giant data dump. Redact anything unrelated to the question Nexus is trying to answer.</p></div><button class="btn secondary" type="button" data-open-guide-question="What should I upload?">Need help?</button></header><div class="nexus-client-evidence-guide"><article><b>Why evidence is needed</b><span>It verifies how the operation actually works and reduces diagnosis assumptions.</span></article><article><b>Acceptable examples</b><span>A few normal exports, screenshots, reports, SOPs, or representative records are usually enough.</span></article><article><b>Redaction rules</b><span>Remove passwords, MFA codes, API keys, full payment-card data, SSNs, medical information, and unrelated personal data.</span></article><article><b>If it does not exist</b><span>Do not manufacture a document. Tell Nexus it is missing so the gap can become part of the work.</span></article></div><section class="nexus-client-files-panel"><div class="nexus-client-section-head"><div><div class="kicker">Requested from you</div><h2>${requested.length} open ${requested.length === 1 ? 'request' : 'requests'}</h2></div></div>${categories.size ? [...categories.entries()].map(([category, items], index) => `<details class="nexus-client-file-group" ${index === 0 ? 'open' : ''}><summary><span><b>${esc(category)}</b><small>${items.length} ${items.length === 1 ? 'item' : 'items'}</small></span><span>View</span></summary><div class="nexus-client-file-request-list">${items.map(request => `<article class="nexus-client-file-request"><div><span class="nexus-client-status waiting-on-you">Waiting on you</span><h3>${esc(request.title)}</h3><p>${esc(request.purpose || 'Nexus requested this evidence to continue.')}</p></div><details><summary>What counts + what to redact</summary><p><b>Good examples:</b> ${esc(request.examples || 'Use a representative current-state example.')}</p><p><b>Redact:</b> ${esc(request.redaction_guidance || 'Remove credentials, payment secrets, government IDs, and unrelated personal information.')}</p></details><button type="button" class="btn primary" data-upload-request="${esc(request.id)}">Upload file →</button></article>`).join('')}</div></details>`).join('') : '<div class="nexus-client-clear-state"><b>No file request is waiting.</b><span>Nexus will add a request here only when evidence is needed.</span></div>'}</section><section id="nexusClientUploadHost" class="nexus-client-files-panel"></section><section class="nexus-client-files-panel"><div class="nexus-client-section-head"><div><div class="kicker">Files already shared</div><h2>Workspace files</h2></div></div>${recentDocs.length ? `<div class="nexus-client-file-list">${recentDocs.map(doc => `<div><span><b>${esc(doc.file_name || 'Shared file')}</b><small>${esc(doc.category || 'File')} · ${esc(day(doc.created_at))}</small></span><button type="button" class="btn secondary" data-download-document="${esc(doc.id)}">Download</button></div>`).join('')}</div>` : '<div class="nexus-client-empty-small">No files have been shared yet.</div>'}</section>`;
  mountLegacyUploadPanel();
  bindCommon(root);
  root.querySelectorAll('[data-upload-request]').forEach(button => button.addEventListener('click', () => openUploadForRequest(button.dataset.uploadRequest)));
  root.querySelectorAll('[data-download-document]').forEach(button => button.addEventListener('click', () => portal.downloadDocument?.(button.dataset.downloadDocument)));
}

function mountLegacyUploadPanel() {
  const host = $('nexusClientUploadHost');
  const legacy = document.querySelector('#section-documents .data-room-upload') || document.querySelector('.data-room-upload');
  if (!host || !legacy) return;
  if (legacy.parentElement !== host) host.appendChild(legacy);
  legacy.classList.add('nexus-client-mounted-upload');
  const title = legacy.querySelector('h2');
  if (title) title.textContent = 'Share a file securely';
}

function openUploadForRequest(requestId) {
  const hiddenButton = document.querySelector(`.upload-request[data-id="${CSS.escape(requestId)}"]`);
  if (hiddenButton) hiddenButton.click();
  $('nexusClientUploadHost')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => $('docFile')?.focus(), 250);
}

function reportSectionMarkup(key, value) {
  const title = String(key || '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase());
  if (value == null || value === '') return '';
  if (Array.isArray(value)) return `<section class="nexus-client-report-section"><h3>${esc(title)}</h3><div class="nexus-client-report-list">${value.map(item => typeof item === 'object' ? `<article>${objectToMarkup(item)}</article>` : `<div>${esc(item)}</div>`).join('')}</div></section>`;
  if (typeof value === 'object') return `<section class="nexus-client-report-section"><h3>${esc(title)}</h3>${objectToMarkup(value)}</section>`;
  return `<section class="nexus-client-report-section"><h3>${esc(title)}</h3><p>${esc(value)}</p></section>`;
}

function objectToMarkup(value) {
  if (!value || typeof value !== 'object') return `<p>${esc(value)}</p>`;
  return `<dl class="nexus-client-report-dl">${Object.entries(value).map(([key, val]) => `<div><dt>${esc(String(key).replaceAll('_', ' '))}</dt><dd>${Array.isArray(val) ? val.map(item => typeof item === 'object' ? objectToMarkup(item) : `<span>${esc(item)}</span>`).join('') : typeof val === 'object' ? objectToMarkup(val) : esc(val)}</dd></div>`).join('')}</dl>`;
}

function renderReports() {
  const root = $('nexus-client-reports');
  if (!root) return;
  const safeReports = releases.map(serializeReleasedClientReport).filter(Boolean);
  root.innerHTML = `<header class="nexus-client-page-head"><div><div class="eyebrow">Reports</div><h1>Released findings only.</h1><p>Internal Nexus drafts, evidence scoring, agent traces, release queues, review states, and ranking logic never appear here.</p></div><button class="btn secondary" type="button" data-open-guide-question="Where is my Nexus report?">Need help?</button></header>${safeReports.length ? `<div class="nexus-client-report-stack">${safeReports.map(report => `<article class="nexus-client-report"><div class="nexus-client-report-head"><div><span class="nexus-client-status complete">Released</span><h2>${esc(report.title || `Nexus report v${report.reportVersion || 1}`)}</h2><small>${report.releasedAt ? `Released ${esc(day(report.releasedAt))}` : ''}</small></div></div>${Object.entries(report).filter(([key]) => !['id', 'reportVersion', 'releasedAt', 'title'].includes(key)).map(([key, value]) => reportSectionMarkup(key, value)).join('')}</article>`).join('')}</div>` : '<div class="nexus-client-clear-state"><b>No released report is available yet.</b><span>Internal drafts stay private until Nexus deliberately releases a client-safe report.</span></div>'}`;
  bindCommon(root);
}

function taskRow(item, mode) {
  const task = item.task;
  if (mode === 'next') return `<div class="nexus-client-progress-row upcoming"><div>${shellStatus('UPCOMING')}<b>${esc(task.title)}</b><span>Available after Nexus completes “${esc(item.blockedByTitle || 'the required prerequisite')}”.</span></div><small>${task.due_date ? esc(day(task.due_date)) : 'Future step'}</small></div>`;
  if (mode === 'done') return `<div class="nexus-client-progress-row done"><div>${shellStatus('COMPLETE')}<b>${esc(task.title)}</b><span>${esc(task.description || 'Completed client obligation.')}</span></div><small>${esc(day(task.completed_at || task.updated_at))}</small></div>`;
  return `<button type="button" class="nexus-client-progress-row now" data-complete-task="${esc(task.id)}"><div>${shellStatus('WAITING_ON_YOU')}<b>${esc(task.title)}</b><span>${esc(task.description || task.instructions || 'Complete this action to continue.')}</span></div><small>${task.due_date ? esc(day(task.due_date)) : 'Ready now'}</small></button>`;
}

function renderProgress() {
  const root = $('nexus-client-progress');
  if (!root || !currentContext) return;
  const project = activeProject();
  const decisions = inboxRows.filter(item => item.kind === 'approval');
  const milestones = [...arr(state.miles)].sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')));
  const metrics = arr(state.metrics).slice(0, 8);
  root.innerHTML = `<header class="nexus-client-page-head"><div><div class="eyebrow">Progress</div><h1>Now, next, and done.</h1><p>Current actions are separated from future work so you are never asked to act before Nexus is ready.</p></div><button class="btn secondary" type="button" data-open-guide-question="Where can I see project progress?">Need help?</button></header><section class="nexus-client-progress-section"><div class="nexus-client-section-head"><div><div class="kicker">Now</div><h2>${currentContext.now.length} ready ${currentContext.now.length === 1 ? 'action' : 'actions'}</h2></div></div>${currentContext.now.length ? `<div class="nexus-client-progress-list">${currentContext.now.map(item => taskRow(item, 'now')).join('')}</div>` : '<div class="nexus-client-clear-state"><b>Nothing needs you right now.</b><span>Future tasks remain in Next until their prerequisites are complete.</span></div>'}</section><section class="nexus-client-progress-section"><div class="nexus-client-section-head"><div><div class="kicker">Next</div><h2>${currentContext.next.length} known future ${currentContext.next.length === 1 ? 'action' : 'actions'}</h2></div></div>${currentContext.next.length ? `<div class="nexus-client-progress-list">${currentContext.next.map(item => taskRow(item, 'next')).join('')}</div>` : '<div class="nexus-client-empty-small">No dependency-blocked client actions are scheduled.</div>'}</section><section class="nexus-client-progress-section"><div class="nexus-client-section-head"><div><div class="kicker">Done</div><h2>Recently completed</h2></div></div>${currentContext.done.length ? `<div class="nexus-client-progress-list">${currentContext.done.slice(0, 12).map(item => taskRow(item, 'done')).join('')}</div>` : '<div class="nexus-client-empty-small">Completed client work will appear here.</div>'}</section><section class="nexus-client-progress-section"><div class="nexus-client-section-head"><div><div class="kicker">Decisions</div><h2>${decisions.filter(item => item.can_approve).length} ready for review</h2></div></div>${decisions.length ? `<div class="nexus-client-progress-list">${decisions.map(item => `<button type="button" class="nexus-client-progress-row now" data-open-approval="${esc(item.approval_chain_id)}"><div>${shellStatus(item.can_approve ? 'READY_TO_REVIEW' : 'NEXUS_WORKING')}<b>${esc(item.title || 'Decision')}</b><span>${esc(item.message || 'Review the decision and its consequences.')}</span></div><small>${item.due_at ? esc(day(item.due_at)) : ''}</small></button>`).join('')}</div>` : '<div class="nexus-client-empty-small">No decision is waiting.</div>'}</section><section class="nexus-client-progress-section"><div class="nexus-client-section-head"><div><div class="kicker">Project plan</div><h2>${esc(project?.name || 'Nexus engagement')}</h2></div></div>${milestones.length ? `<div class="nexus-client-milestones">${milestones.map((milestone, index) => `<div class="${terminal.has(String(milestone.status || '').toLowerCase()) ? 'complete' : ''}"><span>${terminal.has(String(milestone.status || '').toLowerCase()) ? '✓' : index + 1}</span><div><b>${esc(milestone.title || 'Milestone')}</b><small>${milestone.due_date ? esc(day(milestone.due_date)) : esc(milestone.status || 'Planned')}</small></div></div>`).join('')}</div>` : '<div class="nexus-client-empty-small">Project milestones will appear here once scheduled.</div>'}</section><section class="nexus-client-progress-section"><div class="nexus-client-section-head"><div><div class="kicker">Results</div><h2>Measured improvement</h2></div></div>${metrics.length ? `<div class="nexus-client-metric-grid">${metrics.map(metric => `<article><b>${esc(metric.name || 'Measurement')}</b><div><span>Baseline<strong>${esc(metric.baseline_value ?? '—')} ${esc(metric.unit || '')}</strong></span><span>Current<strong>${esc(metric.current_value ?? '—')} ${esc(metric.unit || '')}</strong></span><span>Target<strong>${esc(metric.target_value ?? '—')} ${esc(metric.unit || '')}</strong></span></div></article>`).join('')}</div>` : '<div class="nexus-client-empty-small">Measured results will appear once a baseline and follow-up measurement exist.</div>'}</section>`;
  bindCommon(root);
  root.querySelectorAll('[data-open-approval]').forEach(button => button.addEventListener('click', () => openApproval(button.dataset.openApproval)));
}

const FAQS = [['What do I need to do next?', 'Home shows exactly one primary action. Progress separates ready work from future work.'], ['What should I upload?', 'Upload only requested representative evidence. Redact anything Nexus does not need.'], ['What if I do not have the requested file?', 'Do not create a fake document. Tell Nexus the item does not exist so the gap can become part of the work.'], ['Where is my report?', 'Released client-safe findings appear in Reports. Internal drafts never appear there.'], ['What is Nexus working on?', 'Home shows a short list of Nexus-owned work. You do not need to act on it unless the state changes.'], ['What does Upcoming mean?', 'The task is known, but one or more prerequisite Nexus steps are incomplete. It is intentionally unclickable until those prerequisites clear.']];

function renderHelp() {
  const root = $('nexus-client-help');
  if (!root) return;
  root.innerHTML = `<header class="nexus-client-page-head"><div><div class="eyebrow">Help</div><h1>Get an answer without hunting around.</h1><p>Ask Nexus in plain language or use the short client FAQ.</p></div><button class="btn primary" type="button" data-open-guide>Ask Nexus</button></header><section class="nexus-client-help-panel"><div class="kicker">Client FAQ</div><div class="nexus-client-faq-list">${FAQS.map(([q, a]) => `<details><summary><span>${esc(q)}</span><span aria-hidden="true">+</span></summary><p>${esc(a)}</p></details>`).join('')}</div></section><section class="nexus-client-help-panel"><div class="kicker">Notifications</div><h2>How Nexus contacts you</h2><div id="nexusClientPreferencesHost"></div></section>`;
  mountNotificationPreferences();
  bindCommon(root);
}

function mountNotificationPreferences() { const host = $('nexusClientPreferencesHost'); const panel = $('emailPreferencePanel'); if (host && panel && panel.parentElement !== host) host.appendChild(panel); }
function bindCommon(root) {
  root.querySelectorAll('[data-client-go]').forEach(button => button.addEventListener('click', () => activateView(button.dataset.clientGo)));
  root.querySelectorAll('[data-complete-task]').forEach(button => button.addEventListener('click', () => openTask(button.dataset.completeTask)));
  root.querySelectorAll('[data-open-guide]').forEach(button => button.addEventListener('click', () => openGuide()));
  root.querySelectorAll('[data-open-guide-question]').forEach(button => button.addEventListener('click', () => openGuide(button.dataset.openGuideQuestion)));
}

function ensureTaskModal() {
  if ($('nexusClientTaskModal')) return;
  const modal = document.createElement('div');
  modal.id = 'nexusClientTaskModal';
  modal.className = 'nexus-client-modal';
  modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'nexusClientTaskModalTitle'); modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `<div class="nexus-client-modal-card"><div class="nexus-client-modal-head"><div><div class="kicker">Client action</div><h2 id="nexusClientTaskModalTitle">Complete this step</h2></div><button type="button" class="nexus-client-icon-button" data-close-client-modal aria-label="Close action">×</button></div><div id="nexusClientTaskModalBody"></div></div>`;
  document.body.appendChild(modal);
  modal.querySelector('[data-close-client-modal]').addEventListener('click', () => closeModal(modal));
  modal.addEventListener('mousedown', event => { if (event.target === modal) closeModal(modal); });
}

function renderSchemaField(field, existing = {}) {
  const key = String(field.key || field.name || '').trim(); if (!key) return '';
  const id = `nexus-task-field-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const label = field.label || key.replaceAll('_', ' '); const value = existing[key] ?? ''; const required = field.required ? 'required' : '';
  if (field.type === 'textarea') return `<div class="field"><label for="${esc(id)}">${esc(label)}${field.required ? ' *' : ''}</label><textarea id="${esc(id)}" data-task-field="${esc(key)}" placeholder="${esc(field.placeholder || '')}" ${required}>${esc(value)}</textarea></div>`;
  if (field.type === 'select' && Array.isArray(field.options)) return `<div class="field"><label for="${esc(id)}">${esc(label)}${field.required ? ' *' : ''}</label><select id="${esc(id)}" data-task-field="${esc(key)}" ${required}>${field.options.map(option => { const val = typeof option === 'object' ? option.value : option; const text = typeof option === 'object' ? option.label : option; return `<option value="${esc(val)}" ${String(value) === String(val) ? 'selected' : ''}>${esc(text)}</option>`; }).join('')}</select></div>`;
  if (field.type === 'checkbox') return `<label class="nexus-client-checkbox"><input type="checkbox" data-task-field="${esc(key)}" ${value ? 'checked' : ''} ${required}><span>${esc(label)}</span></label>`;
  return `<div class="field"><label for="${esc(id)}">${esc(label)}${field.required ? ' *' : ''}</label><input id="${esc(id)}" type="${field.type === 'date' ? 'date' : 'text'}" data-task-field="${esc(key)}" value="${esc(value)}" placeholder="${esc(field.placeholder || '')}" ${required}></div>`;
}

function openTask(taskId) {
  const evaluated = currentContext?.evaluated.find(item => item.task.id === taskId);
  if (!evaluated) return toast?.('This action could not be found. Refresh the workspace.');
  if (evaluated.state !== 'WAITING_ON_YOU') return toast?.(evaluated.state === 'UPCOMING' ? `This step is available after Nexus completes ${evaluated.blockedByTitle || 'the required prerequisite'}.` : 'This step is not waiting on you right now.');
  const task = evaluated.task; const type = String(task.task_type || '').toLowerCase();
  const routesToFiles = type === 'workflow_evidence' || type === 'preparation_checklist' || /upload requested|business records securely|evidence/i.test(task.title || '');
  if (routesToFiles) { activateView('files'); toast?.('Use the requested file cards below to complete this step.'); return; }
  const modal = $('nexusClientTaskModal'); const body = $('nexusClientTaskModalBody'); const schema = Array.isArray(task.form_schema) ? task.form_schema : []; const existing = task.response_data && typeof task.response_data === 'object' ? task.response_data : {};
  $('nexusClientTaskModalTitle').textContent = task.title || 'Complete this step';
  body.innerHTML = `<div class="nexus-client-task-brief"><div><span>Why Nexus Needs It</span><p>${esc(task.description || 'Nexus needs this information or decision to move the engagement forward without making assumptions.')}</p></div><div><span>What You Need to Provide</span><p>${esc(task.instructions || 'Complete the requested action and submit the context Nexus needs to review it.')}</p></div></div><form id="nexusClientTaskForm" data-task-id="${esc(task.id)}">${schema.length ? schema.map(field => renderSchemaField(field, existing)).join('') : `<div class="field"><label for="nexusClientCompletionNote">Your response</label><textarea id="nexusClientCompletionNote" data-task-field="completion_note" required placeholder="Add the answer, decision, confirmation, or completion context Nexus needs to review.">${esc(existing.completion_note || '')}</textarea></div>`}${type === 'access' ? '<div class="nexus-client-security-note"><b>Security boundary</b><span>Do not enter passwords, MFA codes, API keys, recovery codes, or private secrets here.</span></div>' : ''}<div class="actions"><button class="btn primary" type="submit">Submit to Nexus →</button><button class="btn secondary" type="button" data-close-client-modal>Cancel</button></div></form>`;
  body.querySelector('[data-close-client-modal]')?.addEventListener('click', () => closeModal(modal));
  $('nexusClientTaskForm')?.addEventListener('submit', submitTask); openModal(modal);
}

async function submitTask(event) {
  event.preventDefault(); const form = event.currentTarget; const taskId = form.dataset.taskId; const data = {};
  for (const control of form.querySelectorAll('[data-task-field]')) data[control.dataset.taskField] = control.type === 'checkbox' ? control.checked : control.value.trim();
  const button = form.querySelector('button[type="submit"]'); button.disabled = true; button.textContent = 'Submitting…';
  try {
    const now = new Date().toISOString();
    const { error } = await sb.from('nexus_tasks').update({ response_data: data, response_updated_at: now, submitted_at: now, status: 'ready_for_review', updated_at: now }).eq('id', taskId).eq('company_id', state.companyId);
    if (error) throw error;
    await portal.log?.('task_submitted', 'task', taskId, 'Client submitted action for Nexus review');
    closeModal($('nexusClientTaskModal')); toast?.('Submitted to Nexus. The next step will appear only when it is actually ready.');
    await portal.workspace?.(); await refreshClientShell({ force: true });
  } catch (error) { console.error('Client action submission failed', error); toast?.(error.message || 'This action could not be submitted.'); }
  finally { button.disabled = false; button.textContent = 'Submit to Nexus →'; }
}

function ensureApprovalModal() {
  if ($('nexusClientApprovalModal')) return;
  const modal = document.createElement('div'); modal.id = 'nexusClientApprovalModal'; modal.className = 'nexus-client-modal';
  modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'nexusClientApprovalTitle'); modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `<div class="nexus-client-modal-card"><div class="nexus-client-modal-head"><div><div class="kicker">Decision</div><h2 id="nexusClientApprovalTitle">Review decision</h2></div><button type="button" class="nexus-client-icon-button" data-close-approval-modal aria-label="Close decision">×</button></div><div id="nexusClientApprovalBody"></div></div>`;
  document.body.appendChild(modal); modal.querySelector('[data-close-approval-modal]').addEventListener('click', () => closeModal(modal)); modal.addEventListener('mousedown', event => { if (event.target === modal) closeModal(modal); });
}

async function openApproval(chainId) {
  if (!chainId) return;
  const modal = $('nexusClientApprovalModal'); const body = $('nexusClientApprovalBody'); body.innerHTML = '<div class="nexus-client-loading">Loading decision…</div>'; openModal(modal);
  try {
    const [chainResult, stepsResult] = await Promise.all([sb.from('nexus_approval_chains').select('id,title,description,status,approval_type').eq('id', chainId).single(), sb.from('nexus_approval_chain_steps').select('id,step_order,step_name,status,approver_role,instructions,due_at,decision_note').eq('chain_id', chainId).order('step_order')]);
    if (chainResult.error) throw chainResult.error; if (stepsResult.error) throw stepsResult.error;
    const chain = chainResult.data; const steps = stepsResult.data || []; const inbox = inboxRows.find(item => item.approval_chain_id === chainId); const pending = steps.find(step => step.status === 'pending'); const canApprove = !!inbox?.can_approve && pending?.id === inbox.approval_step_id;
    $('nexusClientApprovalTitle').textContent = chain.title || 'Review decision';
    body.innerHTML = `<p>${esc(chain.description || 'Review the decision and its stated consequence before responding.')}</p><div class="nexus-client-approval-route">${steps.map(step => `<div><span>${step.status === 'approved' ? '✓' : step.step_order}</span><div><b>${esc(step.step_name)}</b><small>${esc(String(step.status || '').replaceAll('_', ' '))}${step.due_at ? ` · ${esc(day(step.due_at))}` : ''}</small>${step.instructions ? `<p>${esc(step.instructions)}</p>` : ''}</div></div>`).join('')}</div>${canApprove ? `<div class="field"><label for="nexusClientApprovalNote">Decision note <span class="small">(required for changes or rejection)</span></label><textarea id="nexusClientApprovalNote" placeholder="Add the decision basis or exact changes required."></textarea></div><div class="actions"><button class="btn primary" type="button" data-client-decision="approved" data-step-id="${esc(pending.id)}">Approve</button><button class="btn secondary" type="button" data-client-decision="changes_requested" data-step-id="${esc(pending.id)}">Request changes</button><button class="btn secondary danger" type="button" data-client-decision="rejected" data-step-id="${esc(pending.id)}">Reject</button></div>` : '<div class="nexus-client-empty-small">This decision is not waiting on you right now.</div>'}`;
    body.querySelectorAll('[data-client-decision]').forEach(button => button.addEventListener('click', () => decideApproval(button.dataset.stepId, button.dataset.clientDecision)));
  } catch (error) { body.innerHTML = `<div class="nexus-client-data-warning"><b>Decision could not load.</b><span>${esc(error.message || 'Refresh and try again.')}</span></div>`; }
}

async function decideApproval(stepId, decision) {
  const note = $('nexusClientApprovalNote')?.value.trim() || null;
  if (decision !== 'approved' && !note) return toast?.('Add a note describing the required changes or rejection reason.');
  try {
    const { error } = await sb.rpc('nexus_decide_approval_step', { p_step_id: stepId, p_decision: decision, p_note: note }); if (error) throw error;
    closeModal($('nexusClientApprovalModal')); toast?.(decision === 'approved' ? 'Decision approved.' : decision === 'changes_requested' ? 'Changes requested.' : 'Decision rejected.'); await refreshClientShell({ force: true });
  } catch (error) { toast?.(error.message || 'Decision could not be saved.'); }
}

function ensureGuide() {
  if ($('nexusClientGuideButton')) return;
  const button = document.createElement('button'); button.id = 'nexusClientGuideButton'; button.className = 'nexus-client-guide-button'; button.type = 'button'; button.setAttribute('aria-haspopup', 'dialog'); button.innerHTML = '<span aria-hidden="true">N</span><b>Ask Nexus</b>'; document.body.appendChild(button); button.addEventListener('click', () => openGuide());
  const drawer = document.createElement('aside'); drawer.id = 'nexusClientGuideDrawer'; drawer.className = 'nexus-client-guide-drawer'; drawer.setAttribute('role', 'dialog'); drawer.setAttribute('aria-modal', 'true'); drawer.setAttribute('aria-labelledby', 'nexusClientGuideTitle'); drawer.setAttribute('aria-hidden', 'true');
  drawer.innerHTML = `<div class="nexus-client-guide-head"><div><div class="kicker">Nexus Guide</div><h2 id="nexusClientGuideTitle">Ask in plain language.</h2><p>The Guide uses the same dependency-aware action context as Home and Inbox.</p></div><button type="button" class="nexus-client-icon-button" data-close-client-guide aria-label="Close Nexus Guide">×</button></div><div id="nexusClientGuideMessages" class="nexus-client-guide-messages" aria-live="polite"></div><div class="nexus-client-guide-quick"><button type="button">What do I need to do?</button><button type="button">What is Nexus working on?</button><button type="button">What should I upload?</button><button type="button">Where is my report?</button></div><form id="nexusClientGuideForm" class="nexus-client-guide-form"><label for="nexusClientGuideInput">Your question</label><div><input id="nexusClientGuideInput" maxlength="1000" autocomplete="off" placeholder="Ask Nexus…"><button type="submit">Send</button></div></form>`;
  document.body.appendChild(drawer); drawer.querySelector('[data-close-client-guide]').addEventListener('click', closeGuide); drawer.querySelectorAll('.nexus-client-guide-quick button').forEach(item => item.addEventListener('click', () => askGuide(item.textContent))); $('nexusClientGuideForm').addEventListener('submit', event => { event.preventDefault(); const input = $('nexusClientGuideInput'); const value = input.value.trim(); if (!value) return; input.value = ''; askGuide(value); });
}

function openGuide(prefill = '') {
  const drawer = $('nexusClientGuideDrawer'); lastFocus = document.activeElement; drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false');
  if (!$('nexusClientGuideMessages').children.length) addGuideMessage('bot', 'Tell me what you are trying to do. I will use the same workspace state that drives Home.');
  const input = $('nexusClientGuideInput'); if (prefill) input.value = prefill; setTimeout(() => input.focus(), 20); bindFocusTrap(drawer, closeGuide);
}
function closeGuide() { const drawer = $('nexusClientGuideDrawer'); drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); unbindFocusTrap(drawer); restoreLastFocus(); }
function addGuideMessage(role, content) { const host = $('nexusClientGuideMessages'); const node = document.createElement('div'); node.className = `nexus-client-guide-message ${role}`; node.innerHTML = content; host.appendChild(node); host.scrollTop = host.scrollHeight; node.querySelectorAll('[data-guide-go]').forEach(button => button.addEventListener('click', () => { closeGuide(); activateView(button.dataset.guideGo); })); }
function askGuide(question) {
  openGuide(); addGuideMessage('user', esc(question)); const q = question.toLowerCase();
  if (/what.*(need|do)|what.*next|my next|needs me/.test(q)) { const primary = currentContext?.primaryAction; addGuideMessage('bot', primary ? `<b>Your next step is “${esc(primary.title)}.”</b><p>${esc(primary.provide)}</p><button type="button" data-guide-go="home">Show my Home →</button>` : '<b>You are clear right now.</b><p>No dependency-cleared client action is waiting on you.</p><button type="button" data-guide-go="home">Open Home →</button>'); return; }
  if (/nexus.*working|what.*nexus.*doing/.test(q)) { const work = currentContext?.nexusWorking.slice(0, 3) || []; addGuideMessage('bot', work.length ? `<b>Nexus is currently working on:</b><ol>${work.map(item => `<li>${esc(item.task.title)}</li>`).join('')}</ol><p>You do not need to act on these until Home says a client step is ready.</p>` : '<b>No active Nexus-owned work is visible right now.</b>'); return; }
  if (/upload|file|evidence|document/.test(q)) { addGuideMessage('bot', '<b>Use Files.</b><p>Open the exact requested item, review what counts and what to redact, then upload only representative evidence.</p><button type="button" data-guide-go="files">Go to Files →</button>'); return; }
  if (/report|diagnosis|findings/.test(q)) { const count = releases.filter(item => String(item.status || '').toLowerCase() === 'released' && !item.revoked_at).length; addGuideMessage('bot', count ? `<b>${count} released ${count === 1 ? 'report is' : 'reports are'} available.</b><p>Only client-safe released findings appear there.</p><button type="button" data-guide-go="reports">Open Reports →</button>` : '<b>No released report is available yet.</b><p>Internal drafts remain private until Nexus deliberately releases them.</p><button type="button" data-guide-go="reports">Open Reports →</button>'); return; }
  if (/upcoming|future|blocked|prerequisite|dependency/.test(q)) { addGuideMessage('bot', '<b>Upcoming means the task is known but not actionable yet.</b><p>Nexus has not completed every prerequisite. The task stays muted and unclickable until those prerequisites clear.</p><button type="button" data-guide-go="progress">Open Progress →</button>'); return; }
  const faq = FAQS.find(([questionText]) => questionText.toLowerCase().split(' ').some(word => word.length > 4 && q.includes(word.toLowerCase()))); if (faq) { addGuideMessage('bot', `<b>${esc(faq[0])}</b><p>${esc(faq[1])}</p>`); return; }
  addGuideMessage('bot', '<b>I do not have a confident workspace answer for that.</b><p>Use Help to contact Nexus rather than relying on a guess.</p><button type="button" data-guide-go="help">Open Help →</button>');
}

function openInbox() { const drawer = $('nexusClientInboxDrawer'); lastFocus = document.activeElement; drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); $('nexusClientInboxButton')?.setAttribute('aria-expanded', 'true'); renderInbox(); setTimeout(() => drawer.querySelector('[data-client-inbox-tab].active')?.focus(), 20); bindFocusTrap(drawer, closeInbox); }
function closeInbox() { const drawer = $('nexusClientInboxDrawer'); drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); $('nexusClientInboxButton')?.setAttribute('aria-expanded', 'false'); unbindFocusTrap(drawer); restoreLastFocus(); }

function actionableInboxItems() {
  const evaluatedById = new Map((currentContext?.evaluated || []).map(item => [item.task.id, item]));
  const tasks = inboxRows.filter(item => item.kind === 'task').filter(item => evaluatedById.get(item.related_id)?.state === 'WAITING_ON_YOU').map(item => ({ type: 'task', item, id: `task:${item.related_id}` }));
  const approvals = inboxRows.filter(item => item.kind === 'approval' && item.can_approve).map(item => ({ type: 'approval', item, id: `approval:${item.approval_chain_id}` }));
  const documentItems = inboxRows.filter(item => item.kind === 'document_request').map(item => ({ ...item, notification_type: 'document_request', id: item.related_id, read_at: null }));
  const documentGroups = aggregateNotifications(documentItems).map(group => ({ type: 'document-group', group, id: group.id }));
  return [...tasks, ...approvals, ...documentGroups];
}
function updateInboxItems() {
  const rawUpdates = inboxRows.filter(item => item.kind === 'update').filter(item => !['task', 'document_request'].includes(String(item.related_type || '').toLowerCase())).map(item => ({ ...item, notification_type: item.related_type || 'update', read_at: item.is_unread ? null : new Date().toISOString() }));
  return aggregateNotifications(rawUpdates);
}
function inboxCard(entry) {
  if (entry.type === 'task') return `<button type="button" class="nexus-client-inbox-card" data-inbox-task="${esc(entry.item.related_id)}"><span class="nexus-client-status waiting-on-you">Waiting on you</span><h3>${esc(entry.item.title)}</h3><p>${esc(entry.item.message || 'Complete this client action.')}</p><b>Open action →</b></button>`;
  if (entry.type === 'approval') return `<button type="button" class="nexus-client-inbox-card" data-inbox-approval="${esc(entry.item.approval_chain_id)}"><span class="nexus-client-status ready-to-review">Ready to review</span><h3>${esc(entry.item.title)}</h3><p>${esc(entry.item.message || 'Nexus needs your decision.')}</p><b>Review decision →</b></button>`;
  const group = entry.group; return `<button type="button" class="nexus-client-inbox-card" data-inbox-files><span class="nexus-client-status waiting-on-you">Waiting on you</span><h3>${esc(group.title)}</h3><p>${group.itemCount} ${group.itemCount === 1 ? 'item' : 'items'} · ${group.completedCount} of ${group.itemCount} provided</p><b>Review request →</b></button>`;
}
function updateCard(group) { return `<article class="nexus-client-inbox-card update"><span class="nexus-client-status nexus-working">Update</span><h3>${esc(group.title)}</h3><p>${group.itemCount > 1 ? `${group.itemCount} related updates` : esc(group.items[0]?.message || 'Workspace update')}</p><small>${group.newestAt ? esc(day(group.newestAt)) : ''}</small></article>`; }
function renderInbox() {
  const body = $('nexusClientInboxBody'); if (!body) return; const actions = actionableInboxItems(); const updates = updateInboxItems(); const selected = inboxTab === 'action' ? actions : updates;
  body.innerHTML = selected.length ? (inboxTab === 'action' ? selected.map(inboxCard).join('') : selected.map(updateCard).join('')) : `<div class="nexus-client-clear-state"><b>${inboxTab === 'action' ? 'Nothing needs action.' : 'No new updates.'}</b><span>${inboxTab === 'action' ? 'Home will show the next client step when it is ready.' : 'Nexus updates will collect here without cluttering the main navigation.'}</span></div>`;
  body.querySelectorAll('[data-inbox-task]').forEach(button => button.addEventListener('click', () => { closeInbox(); openTask(button.dataset.inboxTask); }));
  body.querySelectorAll('[data-inbox-approval]').forEach(button => button.addEventListener('click', () => { closeInbox(); openApproval(button.dataset.inboxApproval); }));
  body.querySelectorAll('[data-inbox-files]').forEach(button => button.addEventListener('click', () => { closeInbox(); activateView('files'); }));
  document.querySelector('[data-client-inbox-tab-count="action"]').textContent = actions.length; document.querySelector('[data-client-inbox-tab-count="update"]').textContent = updates.length;
  const count = actions.length + updates.reduce((sum, group) => sum + (group.unreadCount > 0 ? 1 : 0), 0); const badge = $('nexusClientInboxCount'); if (badge) { badge.textContent = count; badge.setAttribute('aria-label', `${count} Inbox ${count === 1 ? 'item' : 'items'}`); badge.hidden = count === 0; }
}

function ensureFocusables(container) { return [...container.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(element => !element.hidden && element.offsetParent !== null); }
const trapHandlers = new WeakMap();
function bindFocusTrap(container, closeFn) {
  unbindFocusTrap(container);
  const handler = event => {
    if (event.key === 'Escape') { event.preventDefault(); closeFn(); return; }
    if (event.key !== 'Tab') return;
    const focusables = ensureFocusables(container); if (!focusables.length) { event.preventDefault(); container.focus?.(); return; }
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  container.addEventListener('keydown', handler); trapHandlers.set(container, handler);
}
function unbindFocusTrap(container) { const handler = trapHandlers.get(container); if (handler) container.removeEventListener('keydown', handler); trapHandlers.delete(container); }
function restoreLastFocus() { const target = lastFocus; lastFocus = null; if (target && typeof target.focus === 'function' && document.contains(target)) setTimeout(() => target.focus(), 0); }
function openModal(modal) { lastFocus = document.activeElement; modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); document.body.classList.add('nexus-client-modal-open'); bindFocusTrap(modal, () => closeModal(modal)); setTimeout(() => ensureFocusables(modal)[0]?.focus(), 20); }
function closeModal(modal) { if (!modal) return; modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); document.body.classList.remove('nexus-client-modal-open'); unbindFocusTrap(modal); restoreLastFocus(); }

async function loadShellData() {
  const companyId = state.companyId; if (!companyId) throw new Error('Client company context is unavailable.');
  const [context, inbox, requests, releaseRows] = await Promise.all([getWorkspaceCurrentActionContext(companyId, { sb, tasks: state.tasks }), sb.rpc('nexus_get_inbox', { p_company_id: companyId }), sb.from('nexus_document_requests').select('id,title,purpose,examples,redaction_guidance,sensitivity,status,due_date,fulfilled_document_id,created_at,updated_at,owner_scope,source_diagnosis_run_id').eq('company_id', companyId).order('created_at', { ascending: false }), sb.from('nexus_diagnosis_report_releases').select('id,company_id,project_id,diagnosis_run_id,client_report,status,report_version,released_at,revoked_at,created_at,updated_at').eq('company_id', companyId).eq('status', 'released').is('revoked_at', null).order('released_at', { ascending: false })]);
  if (inbox.error) throw inbox.error; if (requests.error) throw requests.error; if (releaseRows.error) throw releaseRows.error;
  currentContext = context; inboxRows = inbox.data || []; documentRequests = requests.data || []; releases = releaseRows.data || [];
}

async function refreshClientShell({ force = false } = {}) {
  if (refreshInFlight && !force) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      await loadShellData(); ensureShell(); updateMiniContext(); renderInbox(); activateView(activeView);
      window.dispatchEvent(new CustomEvent('nexus:client-context-ready', { detail: { companyId: state.companyId, primaryTaskId: currentContext?.primaryAction?.taskId || null } }));
    } catch (error) {
      console.error('Nexus Client Shell refresh failed', error); const root = $(`nexus-client-${activeView}`) || $('nexus-client-home');
      if (root) root.innerHTML = `<div class="nexus-client-data-warning"><b>Nexus could not verify the live client workspace.</b><span>${esc(error.message || 'Refresh and try again.')}</span><button class="btn secondary" type="button" data-shell-retry>Refresh</button></div>`;
      root?.querySelector('[data-shell-retry]')?.addEventListener('click', () => refreshClientShell({ force: true }));
    }
  })();
  try { await refreshInFlight; } finally { refreshInFlight = null; }
}

$('companySelect')?.addEventListener('change', () => setTimeout(() => refreshClientShell({ force: true }), 300));
window.addEventListener('focus', () => setTimeout(() => refreshClientShell(), 100));
window.addEventListener('nexus:diagnosis-changed', () => setTimeout(() => refreshClientShell({ force: true }), 120));

ensureShell();
await refreshClientShell({ force: true });
activateView('home');

window.NexusClientShell = Object.freeze({ refresh: refreshClientShell, activateView, getCurrentActionContext: () => currentContext, openInbox, openGuide, __qa: { actionableInboxItems, updateInboxItems, requestCategory, focusables: ensureFocusables } });