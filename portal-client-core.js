/**
 * Nexus Client Core
 * Canonical client-side state engine for dependency evaluation, notification rollups,
 * report serialization, and workspace-current-action context.
 */

const COMPLETE_RAW = new Set(['complete', 'completed', 'done', 'resolved', 'approved', 'released', 'implemented', 'closed']);
const BLOCKED_RAW = new Set(['blocked', 'failed', 'delayed', 'attention', 'action_required']);
const REVIEW_RAW = new Set(['ready_for_review', 'in_review', 'pending_review', 'submitted', 'reviewing']);

/**
 * @typedef {Object} TaskRecord
 * @property {string} id
 * @property {string} company_id
 * @property {string|null} project_id
 * @property {string} title
 * @property {string|null} description
 * @property {'client'|'nexus'|string} assignee
 * @property {string} status
 * @property {string|null} priority
 * @property {string|null} due_date
 * @property {string|null} dependency_task_id
 * @property {string|null} task_type
 * @property {string|null} phase
 * @property {string|null} instructions
 * @property {Object|null} form_schema
 * @property {Object|null} response_data
 * @property {string|null} completed_at
 * @property {string|null} created_at
 * @property {string|null} updated_at
 */

/**
 * @typedef {Object} TaskDependency
 * @property {string} taskId
 * @property {string} parentTaskId
 * @property {number} depth
 * @property {boolean} complete
 * @property {string} parentTitle
 * @property {string} parentStatus
 */

function normalizeRawStatus(value) {
  return String(value || '').trim().toLowerCase().replaceAll(' ', '_');
}

export function canonicalTaskStatus(value) {
  const raw = normalizeRawStatus(value);
  if (COMPLETE_RAW.has(raw)) return 'COMPLETE';
  if (BLOCKED_RAW.has(raw)) return 'BLOCKED';
  if (REVIEW_RAW.has(raw)) return 'READY_TO_REVIEW';
  return 'OPEN';
}

function priorityWeight(priority) {
  return ({ critical: 0, high: 1, normal: 2, low: 3 })[String(priority || 'normal').toLowerCase()] ?? 2;
}

function dueTime(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(String(value).length === 10 ? `${value}T23:59:59` : value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function taskSort(a, b) {
  return priorityWeight(a.task.priority) - priorityWeight(b.task.priority)
    || dueTime(a.task.due_date) - dueTime(b.task.due_date)
    || String(a.task.created_at || '').localeCompare(String(b.task.created_at || ''));
}

/**
 * DAG dependency evaluator. A client-owned task is WAITING_ON_YOU only when every
 * ancestor is canonically COMPLETE. Any incomplete/missing parent forces UPCOMING.
 * Cycles are never actionable.
 * @param {TaskRecord[]} tasks
 */
export function evaluateClientActionState(tasks) {
  const rows = Array.isArray(tasks) ? tasks.filter(Boolean) : [];
  const byId = new Map(rows.map(task => [String(task.id), task]));

  function dependencyChain(task) {
    const dependencies = [];
    const seen = new Set([String(task.id)]);
    let parentId = task.dependency_task_id ? String(task.dependency_task_id) : null;
    let depth = 0;
    let cycleDetected = false;
    while (parentId) {
      depth += 1;
      if (depth > 100 || seen.has(parentId)) { cycleDetected = true; break; }
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) {
        dependencies.push({ taskId: String(task.id), parentTaskId: parentId, depth, complete: false, parentTitle: 'Required prerequisite', parentStatus: 'MISSING' });
        break;
      }
      const complete = canonicalTaskStatus(parent.status) === 'COMPLETE';
      dependencies.push({ taskId: String(task.id), parentTaskId: String(parent.id), depth, complete, parentTitle: parent.title || 'Required prerequisite', parentStatus: canonicalTaskStatus(parent.status) });
      parentId = parent.dependency_task_id ? String(parent.dependency_task_id) : null;
    }
    return { dependencies, cycleDetected };
  }

  return rows.map(task => {
    const rawCanonical = canonicalTaskStatus(task.status);
    const { dependencies, cycleDetected } = dependencyChain(task);
    const firstIncomplete = dependencies.find(dep => !dep.complete) || null;
    const prerequisitesSatisfied = !cycleDetected && !firstIncomplete;
    let state;
    if (rawCanonical === 'COMPLETE') state = 'COMPLETE';
    else if (rawCanonical === 'BLOCKED') state = 'BLOCKED';
    else if (String(task.assignee || '').toLowerCase() !== 'client') state = rawCanonical === 'READY_TO_REVIEW' ? 'READY_TO_REVIEW' : 'NEXUS_WORKING';
    else if (!prerequisitesSatisfied) state = 'UPCOMING';
    else if (rawCanonical === 'READY_TO_REVIEW') state = 'NEXUS_WORKING';
    else state = 'WAITING_ON_YOU';
    return { task, state, dependencies, prerequisitesSatisfied, blockedByTaskId: firstIncomplete?.parentTaskId || null, blockedByTitle: cycleDetected ? 'Dependency cycle requires Nexus review' : firstIncomplete?.parentTitle || null, cycleDetected };
  });
}

export function clientStatusLabel(state) {
  return ({ WAITING_ON_YOU: 'Waiting on you', UPCOMING: 'Upcoming', NEXUS_WORKING: 'Nexus working', READY_TO_REVIEW: 'Ready to review', COMPLETE: 'Complete', BLOCKED: 'Blocked' })[state] || 'Nexus working';
}

function inferNotificationCategory(record) {
  if (record.parent_initiative_id) return `initiative:${record.parent_initiative_id}`;
  if (record.category) return String(record.category).toLowerCase();
  const text = `${record.title || ''} ${record.message || ''}`.toLowerCase();
  if (/square|stripe|novo|american express|amex|bank|profit.?and.?loss|p&l|financial|payment|reconciliation|revenue|expense/.test(text)) return 'financial';
  if (/acuity|email marketing|crm|system|software|tool|integration|reminder|calendar|scheduling/.test(text)) return 'systems';
  if (/process owner|decision maker|owner|people|stakeholder|approval|permissions/.test(text)) return 'people';
  if (/legal|contract|policy|compliance|privacy/.test(text)) return 'legal';
  if (/document|evidence|file|upload|record/.test(text)) return 'evidence';
  return 'general';
}

function groupTitle(category, sample) {
  const titles = { financial: 'Financial pilot information requested', systems: 'Systems information requested', people: 'People & approval information requested', legal: 'Legal information requested', evidence: 'Supporting evidence requested', general: 'Nexus workspace updates' };
  if (String(category).startsWith('initiative:')) return sample?.initiative_title || 'Nexus initiative';
  return titles[category] || 'Nexus workspace updates';
}

function stableDisplayKey(row) {
  return btoa(unescape(encodeURIComponent(`${row.title || ''}|${row.created_at || ''}`))).replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
}
function isUnread(row) { return typeof row.is_unread === 'boolean' ? row.is_unread : !row.read_at; }
function isCompleteNotification(row) { return COMPLETE_RAW.has(normalizeRawStatus(row.status)) || !!row.fulfilled_document_id; }

/**
 * Display-only notification rollup. Underlying raw rows are never mutated.
 */
export function aggregateNotifications(notifications) {
  const rows = (Array.isArray(notifications) ? notifications : []).filter(Boolean);
  const groups = new Map();
  const singles = [];
  for (const row of rows) {
    const kind = String(row.kind || row.notification_type || row.related_type || '').toLowerCase();
    const isDocumentLike = kind.includes('document') || /document requested|evidence requested/i.test(row.title || '');
    if (!isDocumentLike) {
      singles.push({ id: `single:${row.id || row.related_id || stableDisplayKey(row)}`, category: kind || 'update', title: row.title || 'Nexus update', itemCount: 1, completedCount: isCompleteNotification(row) ? 1 : 0, unreadCount: isUnread(row) ? 1 : 0, relatedIds: [row.related_id || row.id].filter(Boolean), items: [row], cta: row.kind === 'approval' ? 'Review decision →' : row.kind === 'task' ? 'Open action →' : 'View update →', newestAt: row.created_at || '' });
      continue;
    }
    const category = inferNotificationCategory(row);
    const key = row.parent_initiative_id ? `initiative:${row.parent_initiative_id}` : `category:${category}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const grouped = [...groups.entries()].map(([key, items]) => {
    const newest = [...items].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0];
    const category = inferNotificationCategory(newest);
    return { id: key, category, title: groupTitle(category, newest), itemCount: items.length, completedCount: items.filter(isCompleteNotification).length, unreadCount: items.filter(isUnread).length, relatedIds: items.map(x => x.related_id || x.id).filter(Boolean), items: [...items], cta: 'Review request →', newestAt: newest?.created_at || '' };
  });
  return [...grouped, ...singles].sort((a, b) => String(b.newestAt || '').localeCompare(String(a.newestAt || '')));
}

function actionWhy(task) { return task.description || 'Nexus needs this information or decision to move the engagement forward without making assumptions.'; }
function actionProvide(task) {
  if (task.instructions) return task.instructions;
  const type = String(task.task_type || '').toLowerCase();
  if (type.includes('upload') || type.includes('evidence')) return 'Provide the requested representative evidence in Files. Redact anything Nexus does not need.';
  if (type === 'approval') return 'Review the decision, confirm the allowed boundary, and submit your response.';
  if (type === 'access') return 'Confirm the approved access boundary. Never place passwords, MFA codes, API keys, or secrets in a Nexus response.';
  if (type === 'decision') return 'State the business decision clearly so Nexus does not infer it from incomplete context.';
  return 'Complete the requested action and submit any context Nexus needs to review it.';
}
function actionAfter(task, evaluated, allEvaluated) {
  const child = allEvaluated.find(x => x.task.dependency_task_id === task.id && x.state !== 'COMPLETE');
  if (child) return `Nexus will review this step. Once accepted, “${child.task.title}” can move forward.`;
  if (evaluated.state === 'WAITING_ON_YOU') return 'Nexus will review your submission and advance the engagement to the next controlled step.';
  return 'Nexus will update the workspace when the next step becomes available.';
}

export function buildWorkspaceContextFromTasks(tasks) {
  const evaluated = evaluateClientActionState(tasks);
  const clientTasks = evaluated.filter(x => String(x.task.assignee || '').toLowerCase() === 'client');
  const now = clientTasks.filter(x => x.state === 'WAITING_ON_YOU').sort(taskSort);
  const next = clientTasks.filter(x => x.state === 'UPCOMING').sort(taskSort);
  const done = clientTasks.filter(x => x.state === 'COMPLETE').sort((a, b) => String(b.task.completed_at || b.task.updated_at || '').localeCompare(String(a.task.completed_at || a.task.updated_at || '')));
  const nexusWorking = evaluated.filter(x => String(x.task.assignee || '').toLowerCase() === 'nexus' && x.state !== 'COMPLETE').sort(taskSort);
  const primary = now[0] || null;
  const primaryAction = primary ? { taskId: primary.task.id, title: primary.task.title, why: actionWhy(primary.task), provide: actionProvide(primary.task), afterward: actionAfter(primary.task, primary, evaluated), dueDate: primary.task.due_date || null, taskType: primary.task.task_type || null, raw: primary.task } : null;
  return { evaluated, now, next, done, nexusWorking, primaryAction, secondaryActionable: now.slice(1) };
}

/**
 * Single asynchronous consumer for Home, Inbox, Guide, email jobs, and mobile notification producers.
 */
export async function getWorkspaceCurrentActionContext(clientId, options = {}) {
  const sb = options.sb || window.NexusPortal?.sb;
  if (!clientId) throw new Error('Client/company id is required.');
  if (!sb && !Array.isArray(options.tasks)) throw new Error('Nexus data client is unavailable.');
  let tasks = Array.isArray(options.tasks) ? options.tasks : null;
  if (sb) {
    try {
      const { error } = await sb.rpc('nexus_get_client_action_context', { p_company_id: clientId });
      if (error) console.warn('Canonical dependency RPC unavailable; evaluating locally.', error.message);
    } catch (error) { console.warn('Canonical dependency RPC unavailable; evaluating locally.', error); }
  }
  if (!tasks && sb) {
    const { data, error } = await sb.from('nexus_tasks').select('*').eq('company_id', clientId);
    if (error) throw error;
    tasks = data || [];
  }
  return buildWorkspaceContextFromTasks(tasks || []);
}

const CLIENT_REPORT_ALLOWED_KEYS = new Set(['title', 'executive_summary', 'summary', 'overview', 'findings', 'recommendations', 'priorities', 'opportunities', 'risks', 'next_steps', 'implementation_plan', 'expected_outcomes', 'metrics', 'baseline', 'client_actions', 'nexus_actions', 'appendix', 'generated_at', 'report_date']);
const INTERNAL_KEY_PATTERN = /(agent|evidence[_ -]?score|confidence[_ -]?score|release[_ -]?queue|review[_ -]?state|ranking|orchestrat|internal|raw[_ -]?analysis|analysis[_ -]?packet|prompt|token|system[_ -]?message|model[_ -]?trace)/i;
function sanitizeReportValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeReportValue);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, val] of Object.entries(value)) { if (!INTERNAL_KEY_PATTERN.test(key)) output[key] = sanitizeReportValue(val); }
  return output;
}
export function serializeReleasedClientReport(releaseRecord) {
  if (!releaseRecord || normalizeRawStatus(releaseRecord.status) !== 'released' || releaseRecord.revoked_at) return null;
  const source = releaseRecord.client_report && typeof releaseRecord.client_report === 'object' ? releaseRecord.client_report : {};
  const safe = {};
  for (const [key, value] of Object.entries(source)) {
    if (!CLIENT_REPORT_ALLOWED_KEYS.has(key) || INTERNAL_KEY_PATTERN.test(key)) continue;
    safe[key] = sanitizeReportValue(value);
  }
  return { id: releaseRecord.id, reportVersion: releaseRecord.report_version, releasedAt: releaseRecord.released_at, ...safe };
}

export const NexusClientCore = Object.freeze({ canonicalTaskStatus, evaluateClientActionState, clientStatusLabel, aggregateNotifications, buildWorkspaceContextFromTasks, getWorkspaceCurrentActionContext, serializeReleasedClientReport });
window.NexusClientCore = NexusClientCore;