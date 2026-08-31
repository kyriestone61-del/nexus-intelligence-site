(() => {
  const $ = (id) => document.getElementById(id);
  const AUTH_MESSAGE = () => $('authMessage');
  const now = () => Date.now();

  function safeRead(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value.filter(Number.isFinite) : [];
    } catch {
      return [];
    }
  }

  function safeWrite(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function show(message) {
    const el = AUTH_MESSAGE();
    if (!el) return;
    el.textContent = message;
    el.style.color = '#ffb1ba';
  }

  function installThrottle(formId, key, { limit, windowMs, cooldownMs }) {
    const form = $(formId);
    if (!form) return;

    form.addEventListener('submit', (event) => {
      const t = now();
      const attempts = safeRead(key).filter((stamp) => t - stamp < windowMs);
      const latest = attempts.at(-1) || 0;

      if (attempts.length >= limit && t - latest < cooldownMs) {
        const seconds = Math.max(1, Math.ceil((cooldownMs - (t - latest)) / 1000));
        event.preventDefault();
        event.stopImmediatePropagation();
        show(`Too many attempts from this browser. Try again in ${seconds} seconds.`);
        return;
      }

      attempts.push(t);
      safeWrite(key, attempts.slice(-limit));
    }, true);
  }

  const password = $('createPassword');
  if (password) {
    password.minLength = 12;
    password.autocomplete = 'new-password';
    password.setAttribute('aria-describedby', 'nexusPasswordSecurityHelp');

    if (!$('nexusPasswordSecurityHelp')) {
      const help = document.createElement('div');
      help.id = 'nexusPasswordSecurityHelp';
      help.className = 'small';
      help.style.marginTop = '7px';
      help.textContent = 'Use at least 12 characters with both letters and numbers. A password manager-generated password is recommended.';
      password.insertAdjacentElement('afterend', help);
    }

    $('createForm')?.addEventListener('submit', (event) => {
      const value = password.value || '';
      if (value.length < 12 || !/[A-Za-z]/.test(value) || !/\d/.test(value)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        password.setCustomValidity('Use at least 12 characters with both letters and numbers.');
        password.reportValidity();
        password.addEventListener('input', () => password.setCustomValidity(''), { once: true });
      }
    }, true);
  }

  // Defense in depth only. Supabase Auth remains the authoritative server-side rate limiter.
  installThrottle('signInForm', 'nexus_auth_signin_attempts_v1', {
    limit: 6,
    windowMs: 10 * 60 * 1000,
    cooldownMs: 60 * 1000
  });

  installThrottle('createForm', 'nexus_auth_signup_attempts_v1', {
    limit: 3,
    windowMs: 30 * 60 * 1000,
    cooldownMs: 5 * 60 * 1000
  });

  // Avoid exposing account-existence details if an upstream provider returns a specific message.
  const message = AUTH_MESSAGE();
  if (message) {
    const normalize = () => {
      const text = String(message.textContent || '');
      if (/user not found|no user|email not found|invalid login credentials|invalid email or password/i.test(text)) {
        message.textContent = 'Sign-in failed. Check your credentials or try again later.';
      }
    };
    new MutationObserver(normalize).observe(message, { childList: true, subtree: true, characterData: true });
  }
})();
