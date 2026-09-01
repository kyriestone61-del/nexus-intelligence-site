/**
 * NexusStore — single reactive state facade for client and admin portal modules.
 * The existing stateController remains the sole mutation engine; this module
 * standardizes the state contract and prevents parallel state islands.
 */
const portal = window.NexusPortal;
if (!portal) throw new Error('Nexus portal context is unavailable for NexusStore.');

const { state, stateController } = portal;
const CLIENT_TABS = new Set(['overview', 'intake', 'data-room', 'action-queue', 'roadmap', 'ledger', 'inbox']);
const EMPTY_CLIENT_DATA = Object.freeze({
  intake: null,
  uploadQueue: [],
  auditTrail: [],
  roiMetrics: [],
  roiEstimates: [],
  improvementLedger: [],
  diagnosisReleases: [],
  lifecycle: null
});

function roleFor(snapshot = state) { return snapshot.admin ? 'admin' : 'client'; }
function currentUserFor(snapshot = state) {
  if (!snapshot.user) return null;
  return Object.freeze({
    id: snapshot.user.id,
    email: snapshot.user.email || null,
    role: roleFor(snapshot),
    companyId: snapshot.companyId || null
  });
}
function clientDataFor(value) {
  const input = value && typeof value === 'object' ? value : {};
  return Object.freeze({ ...EMPTY_CLIENT_DATA, ...input });
}
function normalizePatch(values = {}) {
  const next = { ...values };
  if ('activeTab' in next && !CLIENT_TABS.has(next.activeTab)) next.activeTab = 'overview';
  if ('clientData' in next) next.clientData = clientDataFor(next.clientData);
  return next;
}

if (!state.activeTab || !CLIENT_TABS.has(state.activeTab)) stateController.patch({ activeTab: 'overview' }, 'nexus-store:init-tab');
if (!state.clientData || typeof state.clientData !== 'object') stateController.patch({ clientData: clientDataFor() }, 'nexus-store:init-client-data');
if (!('modalState' in state)) stateController.patch({ modalState: null }, 'nexus-store:init-modal');
if (!('currentUser' in state)) stateController.patch({ currentUser: currentUserFor() }, 'nexus-store:init-user');

let syncing = false;
const unsubscribeIdentity = stateController.subscribe((snapshot, meta) => {
  if (syncing || meta.reason?.startsWith('nexus-store:identity')) return;
  const nextUser = currentUserFor(snapshot);
  const previous = snapshot.currentUser;
  const changed = (!previous && !!nextUser) || (!!previous && !nextUser) ||
    (previous && nextUser && (previous.id !== nextUser.id || previous.email !== nextUser.email || previous.role !== nextUser.role || previous.companyId !== nextUser.companyId));
  if (!changed) return;
  syncing = true;
  try { stateController.patch({ currentUser: nextUser }, 'nexus-store:identity-sync'); }
  finally { syncing = false; }
});

const NexusStore = Object.freeze({
  getState: () => stateController.snapshot(),
  subscribe: listener => stateController.subscribe(listener),
  patch(values, reason = 'nexus-store:patch') { stateController.patch(normalizePatch(values), reason); },
  setActiveTab(activeTab) { stateController.patch({ activeTab: CLIENT_TABS.has(activeTab) ? activeTab : 'overview' }, 'nexus-store:active-tab'); },
  setModalState(modalState) { stateController.patch({ modalState: modalState || null }, 'nexus-store:modal-state'); },
  setClientData(partial) {
    const current = clientDataFor(state.clientData);
    stateController.patch({ clientData: clientDataFor({ ...current, ...(partial || {}) }) }, 'nexus-store:client-data');
  },
  setUploadQueue(uploadQueue) {
    const current = clientDataFor(state.clientData);
    stateController.patch({ clientData: clientDataFor({ ...current, uploadQueue: Array.isArray(uploadQueue) ? uploadQueue : [] }) }, 'nexus-store:upload-queue');
  },
  syncIdentity() { stateController.patch({ currentUser: currentUserFor(state) }, 'nexus-store:identity-manual'); },
  destroy() { unsubscribeIdentity(); },
  constants: Object.freeze({ clientTabs: Object.freeze([...CLIENT_TABS]) })
});

Object.defineProperty(window, 'NexusStore', { value: NexusStore, configurable: false, writable: false });
export { NexusStore };
