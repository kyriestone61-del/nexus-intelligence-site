/**
 * Nexus Portal Runtime Core
 * One owner for mutable browser state, event bindings, async boundaries, storage,
 * workspace-load cancellation, modal lifecycle, and scoped cleanup.
 */

export function createStateController(initialState = {}) {
  const source = { ...initialState };
  const subscribers = new Set();
  let revision = 0;

  const notify = (changes, reason = 'state:update') => {
    revision += 1;
    const snapshot = Object.freeze({ ...source });
    for (const listener of [...subscribers]) {
      try { listener(snapshot, { revision, reason, changes }); }
      catch (error) { console.error('Nexus state subscriber failed', error); }
    }
  };

  const state = new Proxy(source, {
    set(target, key, value) {
      const previous = target[key];
      if (Object.is(previous, value)) return true;
      target[key] = value;
      notify({ [key]: { previous, value } }, `state:set:${String(key)}`);
      return true;
    },
    deleteProperty(target, key) {
      if (!(key in target)) return true;
      const previous = target[key];
      delete target[key];
      notify({ [key]: { previous, value: undefined } }, `state:delete:${String(key)}`);
      return true;
    }
  });

  function patch(values, reason = 'state:patch') {
    if (!values || typeof values !== 'object') return;
    const changes = {};
    for (const [key, value] of Object.entries(values)) {
      if (Object.is(source[key], value)) continue;
      changes[key] = { previous: source[key], value };
      source[key] = value;
    }
    if (Object.keys(changes).length) notify(changes, reason);
  }

  function snapshot() { return Object.freeze({ ...source }); }
  function subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); }
  return Object.freeze({ state, patch, snapshot, subscribe, get revision() { return revision; } });
}

export function createSafeStorage(storage = window.localStorage) {
  const report = (operation, key, error) => console.warn(`Nexus storage ${operation} failed for ${key}`, error);
  return Object.freeze({
    get(key, fallback = null) {
      try { const value = storage.getItem(key); return value == null ? fallback : value; }
      catch (error) { report('read', key, error); return fallback; }
    },
    getJSON(key, fallback = null) {
      try { const raw = storage.getItem(key); return raw == null ? fallback : JSON.parse(raw); }
      catch (error) { report('JSON read', key, error); return fallback; }
    },
    set(key, value) {
      try { storage.setItem(key, String(value)); return true; }
      catch (error) { report('write', key, error); return false; }
    },
    setJSON(key, value) {
      try { storage.setItem(key, JSON.stringify(value)); return true; }
      catch (error) { report('JSON write', key, error); return false; }
    },
    remove(key) {
      try { storage.removeItem(key); return true; }
      catch (error) { report('remove', key, error); return false; }
    }
  });
}

function stableEvent(event) {
  if (!(event instanceof Event)) return event;
  const currentTarget = event.currentTarget || event.target || null;
  const target = event.target || currentTarget;
  const submitter = event.submitter || null;
  return Object.freeze({
    type: event.type,
    target,
    currentTarget,
    submitter,
    dataTransfer: event.dataTransfer || null,
    key: event.key,
    shiftKey: !!event.shiftKey,
    preventDefault() {},
    stopPropagation() {},
    stopImmediatePropagation() {}
  });
}

function showRetryToast(message, retry, label = 'action') {
  if (typeof document === 'undefined') return false;
  const el = document.getElementById('toast');
  if (!el || typeof retry !== 'function') return false;
  const text = document.createElement('span');
  text.textContent = String(message || 'Nexus could not complete that action.');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'nexus-toast-retry';
  button.textContent = 'Retry';
  button.setAttribute('aria-label', `Retry ${label}`);
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Retrying…';
    try { await retry(); }
    finally { button.disabled = false; button.textContent = 'Retry'; }
  }, { once: true });
  el.replaceChildren(text, button);
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.classList.add('show');
  clearTimeout(el.__nexusRetryTimer);
  el.__nexusRetryTimer = window.setTimeout(() => el.classList.remove('show'), 8000);
  return true;
}

export function createAsyncBoundary({ notify } = {}) {
  const messageFor = error => error?.message || 'Nexus could not complete that action.';
  async function run(label, operation, options = {}) {
    try { return await operation(); }
    catch (error) {
      console.error(`Nexus ${label} failed`, error);
      if (!options.silent) {
        const message = options.message || messageFor(error);
        const retry = options.retry === false ? null : async () => run(label, operation, { ...options, retry: false });
        if (!showRetryToast(message, retry, label)) notify?.(message);
      }
      if (options.rethrow) throw error;
      return options.fallback;
    }
  }
  function wrap(label, handler, options = {}) {
    return async (...args) => {
      const stableArgs = args.map(stableEvent);
      return run(label, () => handler(...stableArgs), options);
    };
  }
  return Object.freeze({ run, wrap });
}

export function createEventRegistry() {
  const records = new WeakMap();
  const scopes = new Map();

  function bind(element, type, key, handler, options) {
    if (!(element instanceof EventTarget) || !type || !key || typeof handler !== 'function') return () => {};
    let map = records.get(element);
    if (!map) { map = new Map(); records.set(element, map); }
    const token = `${type}:${key}`;
    const existing = map.get(token);
    if (existing) element.removeEventListener(type, existing.handler, existing.options);
    element.addEventListener(type, handler, options);
    map.set(token, { handler, options });
    return () => unbind(element, type, key);
  }

  function delegate(element, type, key, selector, handler, options) {
    return bind(element, type, key, event => {
      const origin = event.target instanceof Element ? event.target : null;
      const target = origin?.closest(selector);
      if (!target || !(element === document || element === window || element.contains?.(target))) return;
      handler(event, target);
    }, options);
  }

  function unbind(element, type, key) {
    const map = records.get(element); if (!map) return;
    const token = `${type}:${key}`, existing = map.get(token); if (!existing) return;
    element.removeEventListener(type, existing.handler, existing.options);
    map.delete(token);
  }

  function clear(element) {
    const map = records.get(element); if (!map) return;
    for (const [token, record] of map) {
      const type = token.slice(0, token.indexOf(':'));
      element.removeEventListener(type, record.handler, record.options);
    }
    records.delete(element);
  }

  function createScope(name) {
    if (scopes.has(name)) scopes.get(name).destroy();
    const cleanups = new Set();
    const timers = new Set();
    let destroyed = false;
    const api = {
      bind(element, type, key, handler, options) {
        if (destroyed) return () => {};
        const cleanup = bind(element, type, `${name}:${key}`, handler, options);
        cleanups.add(cleanup);
        return () => { cleanup(); cleanups.delete(cleanup); };
      },
      delegate(element, type, key, selector, handler, options) {
        if (destroyed) return () => {};
        const cleanup = delegate(element, type, `${name}:${key}`, selector, handler, options);
        cleanups.add(cleanup);
        return () => { cleanup(); cleanups.delete(cleanup); };
      },
      timeout(handler, delay) {
        if (destroyed) return 0;
        const id = window.setTimeout(() => { timers.delete(id); if (!destroyed) handler(); }, delay);
        timers.add(id);
        return id;
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        for (const cleanup of [...cleanups]) cleanup();
        cleanups.clear();
        for (const id of [...timers]) window.clearTimeout(id);
        timers.clear();
        scopes.delete(name);
      }
    };
    scopes.set(name, api);
    return Object.freeze(api);
  }

  function destroyScope(name) { scopes.get(name)?.destroy(); }
  function destroyAllScopes() { for (const scope of [...scopes.values()]) scope.destroy(); }
  return Object.freeze({ bind, delegate, unbind, clear, createScope, destroyScope, destroyAllScopes });
}

export function createLatestRequestController() {
  let version = 0;
  return Object.freeze({
    begin() { version += 1; return version; },
    isCurrent(token) { return token === version; },
    invalidate() { version += 1; },
    get version() { return version; }
  });
}

function ensureLiveRegion() {
  let region = document.getElementById('nexusPortalLiveRegion');
  if (!region) {
    region = document.createElement('div');
    region.id = 'nexusPortalLiveRegion';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    region.className = 'sr-only';
    document.body.appendChild(region);
  }
  return region;
}

export function createModalManager({ events, stateController } = {}) {
  const registry = events || createEventRegistry();
  const state = { active: null, trigger: null, keydown: null };
  const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const modalStateMap = { taskModal: 'ADD_ACTION', metricModal: 'ADD_MEASUREMENT', milestoneModal: 'ADD_MILESTONE', documentRequestModal: 'REQUEST_ITEM' };

  const focusables = modal => [...modal.querySelectorAll(focusableSelector)].filter(node => !node.hidden && node.getAttribute('aria-hidden') !== 'true');
  const unlockBody = () => { if (!state.active) document.body.classList.remove('nexus-modal-open'); };
  const setExpanded = (trigger, expanded) => {
    if (trigger instanceof HTMLElement && trigger.hasAttribute('aria-expanded')) trigger.setAttribute('aria-expanded', String(expanded));
  };
  const announce = text => { const region = ensureLiveRegion(); region.textContent = ''; requestAnimationFrame(() => { region.textContent = text; }); };
  const modalLabel = modal => modal.getAttribute('aria-label') || modal.querySelector('h1,h2,h3')?.textContent?.trim() || 'Dialog';
  const stateName = modal => modal?.dataset?.nexusModalState || modalStateMap[modal?.id] || modal?.id || null;

  function close(modalOrId, { restoreFocus = true } = {}) {
    const modal = typeof modalOrId === 'string' ? document.getElementById(modalOrId) : modalOrId;
    if (!modal) return;
    modal.classList.remove('show', 'open');
    modal.setAttribute('aria-hidden', 'true');
    if (state.keydown) modal.removeEventListener('keydown', state.keydown);
    const trigger = state.active === modal ? state.trigger : null;
    if (state.active === modal) { state.active = null; state.trigger = null; state.keydown = null; }
    setExpanded(trigger, false);
    unlockBody();
    stateController?.patch?.({ modalState: null }, 'modal:close');
    announce(`${modalLabel(modal)} closed.`);
    if (restoreFocus && trigger && document.contains(trigger)) setTimeout(() => trigger.focus?.(), 0);
    modal.dispatchEvent(new CustomEvent('nexus:modal-closed', { bubbles: false, detail: { modalId: modal.id || null } }));
  }

  function open(modalOrId, trigger = document.activeElement) {
    const modal = typeof modalOrId === 'string' ? document.getElementById(modalOrId) : modalOrId;
    if (!modal) return false;
    if (state.active && state.active !== modal) close(state.active, { restoreFocus: false });
    state.active = modal;
    state.trigger = trigger instanceof HTMLElement ? trigger : null;
    setExpanded(state.trigger, true);
    document.body.classList.add('nexus-modal-open');
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    stateController?.patch?.({ modalState: stateName(modal) }, 'modal:open');
    announce(`${modalLabel(modal)} opened.`);
    const handler = event => {
      if (event.key === 'Escape') { event.preventDefault(); close(modal); return; }
      if (event.key !== 'Tab') return;
      const nodes = focusables(modal);
      if (!nodes.length) { event.preventDefault(); modal.focus?.(); return; }
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    state.keydown = handler;
    modal.addEventListener('keydown', handler);
    modal.dispatchEvent(new CustomEvent('nexus:modal-opened', { bubbles: false, detail: { modalId: modal.id || null } }));
    setTimeout(() => focusables(modal)[0]?.focus(), 0);
    return true;
  }

  function register(modal, key = modal?.id || 'modal') {
    if (!modal) return;
    modal.setAttribute('role', modal.getAttribute('role') || 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-hidden', modal.classList.contains('show') ? 'false' : 'true');
    if (modalStateMap[modal.id] && !modal.dataset.nexusModalState) modal.dataset.nexusModalState = modalStateMap[modal.id];
    registry.bind(modal, 'click', `${key}:backdrop`, event => { if (event.target === modal) close(modal); });
    modal.querySelectorAll('.close,[data-modal-close]').forEach((button, index) => registry.bind(button, 'click', `${key}:close:${index}`, () => close(modal)));
  }

  return Object.freeze({ open, close, register, get active() { return state.active; } });
}

export function createViewController({ getById = id => document.getElementById(id) } = {}) {
  return Object.freeze({
    authPane(id) {
      for (const paneId of ['signInPane', 'createPane', 'confirmPane']) getById(paneId)?.classList.toggle('active', paneId === id);
      getById('tabSignIn')?.classList.toggle('active', id === 'signInPane');
      getById('tabCreate')?.classList.toggle('active', id === 'createPane');
    },
    root(view) {
      const visibility = { authView: view === 'auth', onboardView: view === 'onboard', portalApp: view === 'portal' };
      for (const [id, visible] of Object.entries(visibility)) {
        const element = getById(id); if (element) element.style.display = visible ? 'block' : 'none';
      }
    },
    section(sectionName) {
      document.querySelectorAll('.side-nav button[data-section]').forEach(button => {
        const selected = button.dataset.section === sectionName;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-selected', String(selected));
      });
      document.querySelectorAll('.main > .section').forEach(section => section.classList.toggle('active', section.id === `section-${sectionName}`));
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  });
}

export function createPortalRuntime(initialState, options = {}) {
  const stateController = createStateController(initialState);
  const storage = createSafeStorage(options.storage || window.localStorage);
  const events = createEventRegistry();
  const boundary = createAsyncBoundary({ notify: options.notify });
  const modals = createModalManager({ events, stateController });
  const workspaceRequests = createLatestRequestController();
  const views = createViewController({ getById: options.getById });
  return Object.freeze({ stateController, state: stateController.state, storage, events, boundary, modals, workspaceRequests, views });
}
