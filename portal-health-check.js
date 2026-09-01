/**
 * Nexus Level Two browser health check.
 * Developer-invoked only. It restores the active tab, workspace, form values and modal state.
 */
const portal = window.NexusPortal;
if (!portal) throw new Error('Nexus portal context is unavailable for health check.');

const { state, runtime } = portal;
const $ = id => document.getElementById(id);
const modalCases = Object.freeze([
  ['ADD_ACTION', 'taskModal'],
  ['ADD_MEASUREMENT', 'metricModal'],
  ['ADD_MILESTONE', 'milestoneModal'],
  ['REQUEST_ITEM', 'documentRequestModal']
]);
const tabCases = Object.freeze(['overview', 'data-room', 'action-queue', 'projects', 'ledger', 'notifications']);
const formCases = Object.freeze([
  ['Add Action', 'taskForm', 'taskTitle'],
  ['Add Measurement', 'metricForm', 'metricName'],
  ['Add Milestone', 'milestoneForm', 'milestoneTitle'],
  ['Request Item', 'documentRequestForm', 'requestDocTitle']
]);

function record(matrix, group, test, passed, detail = '') {
  matrix.push({ group, test, result: passed ? 'PASSED' : 'FAILED', detail });
  return passed;
}
function snapshotForm(form) {
  return [...form.elements].filter(control => control.name || control.id).map(control => ({ control, value: control.value, checked: control.checked }));
}
function restoreForm(rows) {
  for (const row of rows) { row.control.value = row.value; if ('checked' in row.control) row.control.checked = row.checked; }
}
function waitForWorkspace(scope, expectedId, timeout = 8000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = scope.bind(window, 'nexus:workspace-ready', `wait:${expectedId}:${Date.now()}`, event => {
      if (event.detail?.companyId !== expectedId || settled) return;
      settled = true; cleanup(); resolve(true);
    });
    scope.timeout(() => { if (!settled) { settled = true; cleanup(); reject(new Error(`Workspace ${expectedId} did not finish loading.`)); } }, timeout);
  });
}
async function switchCompany(scope, select, companyId) {
  if (!companyId || select.value === companyId) return true;
  const ready = waitForWorkspace(scope, companyId);
  select.value = companyId;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await ready;
  return state.companyId === companyId;
}

window.__NEXUS_HEALTH_CHECK = async function __NEXUS_HEALTH_CHECK() {
  const matrix = [];
  const consoleErrors = [];
  const originalConsoleError = console.error;
  const shell = window.NexusClientShell;
  const store = window.NexusStore;
  const scope = runtime.events.createScope(`health-check-${Date.now()}`);
  const originalTab = state.activeTab || 'overview';
  const select = $('companySelect');
  const originalCompany = state.companyId;
  const originalSelectValue = select?.value || null;

  console.error = (...args) => { consoleErrors.push(args.map(value => value instanceof Error ? value.message : String(value)).join(' ')); originalConsoleError(...args); };
  try {
    record(matrix, 'Architecture', 'NexusStore available', !!store?.getState && !!store?.patch && !!store?.subscribe, 'Reactive store façade');
    record(matrix, 'Architecture', 'Scoped event registry available', typeof runtime.events.createScope === 'function' && typeof runtime.events.delegate === 'function', 'Lifecycle-safe events');

    for (const [stateName, modalId] of modalCases) {
      const modal = $(modalId);
      if (!modal) { record(matrix, 'Modals', modalId, false, 'Modal missing'); continue; }
      shell?.prefillModalDefaults?.(modalId);
      runtime.modals.open(modalId, document.activeElement);
      await new Promise(resolve => requestAnimationFrame(resolve));
      const openPassed = modal.classList.contains('show') && modal.getAttribute('aria-hidden') === 'false' && document.body.classList.contains('nexus-modal-open') && state.modalState === stateName;
      runtime.modals.close(modalId, { restoreFocus: false });
      await new Promise(resolve => requestAnimationFrame(resolve));
      const closePassed = !modal.classList.contains('show') && modal.getAttribute('aria-hidden') === 'true' && !document.body.classList.contains('nexus-modal-open') && state.modalState == null;
      record(matrix, 'Modals', `${stateName} open/close`, openPassed && closePassed, `${modalId}: open=${openPassed}, close=${closePassed}`);
    }

    if (!shell?.activateTab) {
      for (const tab of tabCases) record(matrix, 'Navigation', tab, false, 'Client shell API missing');
    } else {
      for (const tab of tabCases) {
        shell.activateTab(tab);
        await new Promise(resolve => requestAnimationFrame(resolve));
        const button = document.querySelector(`#nexusClientPrimaryNav [data-client-view="${CSS.escape(tab)}"]`);
        const panel = $(`nexus-client-${tab}`);
        const passed = state.activeTab === tab && button?.getAttribute('aria-selected') === 'true' && !!panel?.classList.contains('active') && !panel?.hidden;
        record(matrix, 'Navigation', tab, passed, passed ? 'Selected state, ARIA and panel agree' : `activeTab=${state.activeTab}`);
      }
    }

    if (!select || select.options.length < 2) {
      record(matrix, 'Workspace', 'Company selector', true, select ? 'Single workspace: stable without a switch' : 'Selector intentionally unavailable');
    } else {
      const alternate = [...select.options].find(option => option.value && option.value !== originalCompany)?.value;
      let passed = false;
      let detail = '';
      try {
        passed = await switchCompany(scope, select, alternate);
        detail = passed ? 'Alternate workspace loaded without page refresh' : 'Alternate workspace state mismatch';
      } catch (error) { detail = error.message; }
      record(matrix, 'Workspace', 'Company selector', passed, detail);
      if (originalCompany && state.companyId !== originalCompany) {
        try { await switchCompany(scope, select, originalCompany); }
        catch (error) { record(matrix, 'Workspace', 'Restore company', false, error.message); }
      }
    }

    for (const [label, formId, requiredId] of formCases) {
      const form = $(formId), required = $(requiredId);
      if (!form || !required) { record(matrix, 'Validation', label, false, 'Form or required control missing'); continue; }
      const snapshot = snapshotForm(form);
      required.value = '';
      const rejectsBlank = !form.checkValidity();
      required.value = 'Nexus health-check value';
      const acceptsRequired = form.checkValidity();
      restoreForm(snapshot);
      record(matrix, 'Validation', label, rejectsBlank && acceptsRequired, `blank rejected=${rejectsBlank}, minimum valid=${acceptsRequired}`);
    }

    const uploadForm = $('uploadForm'), fileInput = $('docFile'), category = $('docCategory');
    record(matrix, 'Data Room', 'Upload pipeline anchors', !!uploadForm && !!fileInput && !!category && !!document.querySelector('[data-room-dropzone]'), 'Form, file input, category and dropzone');
    record(matrix, 'Accessibility', 'Live status region', !!document.querySelector('[role="status"][aria-live="polite"]'), 'Polite status announcements available');
  } catch (error) {
    record(matrix, 'Health Check', 'Unexpected exception', false, error?.stack || error?.message || String(error));
  } finally {
    try { shell?.activateTab?.(originalTab); } catch (error) { consoleErrors.push(`Restore tab: ${error.message}`); }
    if (select && originalSelectValue && select.value !== originalSelectValue && state.companyId === originalCompany) select.value = originalSelectValue;
    runtime.modals.active && runtime.modals.close(runtime.modals.active, { restoreFocus: false });
    scope.destroy();
    console.error = originalConsoleError;
  }

  record(matrix, 'Console', 'No console errors during check', consoleErrors.length === 0, consoleErrors.length ? consoleErrors.join(' | ').slice(0, 600) : '0 errors');
  const failed = matrix.filter(row => row.result === 'FAILED');
  const report = Object.freeze({ status: failed.length ? 'FAILED' : 'PASSED', passed: matrix.length - failed.length, failed: failed.length, total: matrix.length, matrix, consoleErrors });
  console.group(`NEXUS HEALTH CHECK: ${report.status}`);
  console.table(matrix);
  console.log(`${report.passed}/${report.total} checks passed; ${consoleErrors.length} console errors.`);
  console.groupEnd();
  return report;
};
