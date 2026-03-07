// Fineco autofill content script
// Detects a bonifico form on banca.fineco.it and offers to fill it from pending payments

(function () {
  'use strict';

  // Generic field selectors — ordered by specificity (first match wins)
  const FIELD_SELECTORS = {
    beneficiary: [
      'input[id*="beneficiar" i]', 'input[name*="beneficiar" i]',
      'input[placeholder*="beneficiar" i]', 'input[placeholder*="intestatar" i]',
      'input[id*="receiver" i]', 'input[name*="receiver" i]'
    ],
    iban: [
      'input[id*="iban" i]', 'input[name*="iban" i]',
      'input[placeholder*="iban" i]', 'input[autocomplete*="iban" i]'
    ],
    amount: [
      'input[id*="importo" i]', 'input[name*="importo" i]',
      'input[placeholder*="importo" i]', 'input[id*="amount" i]',
      'input[name*="amount" i]', 'input[type="number"]'
    ],
    reference: [
      'input[id*="causale" i]', 'input[name*="causale" i]',
      'input[placeholder*="causale" i]', 'input[id*="descrizione" i]',
      'input[id*="motivo" i]', 'input[id*="reference" i]',
      'textarea[id*="causale" i]', 'textarea[name*="causale" i]'
    ]
  };

  let floatingBtn = null;
  let dropdown = null;
  let detectedFields = {};

  // Fill a React/Angular/Vue-managed input by bypassing their value setter
  function fillField(el, value) {
    if (!el) return;
    try {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      nativeSetter.call(el, value);
    } catch (_) {
      el.value = value;
    }
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  }

  function findField(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function detectFormFields() {
    const fields = {};
    for (const [key, selectors] of Object.entries(FIELD_SELECTORS)) {
      fields[key] = findField(selectors);
    }
    return fields;
  }

  function hasMinimumFields(fields) {
    return !!(fields.iban || fields.amount);
  }

  // Build/update the floating button
  function showFloatingButton(pendingCount) {
    if (!floatingBtn) {
      floatingBtn = document.createElement('button');
      floatingBtn.className = 'fineco-autofill-btn';
      floatingBtn.addEventListener('click', toggleDropdown);
      document.body.appendChild(floatingBtn);
    }
    floatingBtn.innerHTML = `💼 Compila da fattura (${pendingCount})`;
  }

  function removeFloatingButton() {
    if (floatingBtn) { floatingBtn.remove(); floatingBtn = null; }
    closeDropdown();
  }

  function toggleDropdown() {
    if (dropdown) { closeDropdown(); return; }
    chrome.storage.local.get(['payments'], ({ payments = [] }) => {
      const pending = payments.filter(p => p.status === 'pending');
      openDropdown(pending);
    });
  }

  function openDropdown(pending) {
    closeDropdown();
    dropdown = document.createElement('div');
    dropdown.className = 'fineco-dropdown';

    if (pending.length === 0) {
      dropdown.innerHTML = `
        <div class="fineco-dropdown-header">Fatture pendenti</div>
        <div class="fineco-empty">Nessuna fattura in sospeso</div>`;
    } else {
      dropdown.innerHTML = `<div class="fineco-dropdown-header">Seleziona fattura da compilare</div>` +
        pending.map(p => `
          <div class="fineco-payment-option" data-id="${p.id}">
            <div class="fineco-payment-name">${escapeHtml(p.beneficiary)}</div>
            <div class="fineco-payment-detail">
              €${parseFloat(p.amount || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
              · ${escapeHtml(p.iban || '—')}
              ${p.dueDate ? `· scad. ${formatDate(p.dueDate)}` : ''}
            </div>
          </div>`).join('');

      dropdown.querySelectorAll('.fineco-payment-option').forEach(opt => {
        opt.addEventListener('click', () => {
          const id = opt.dataset.id;
          chrome.storage.local.get(['payments'], ({ payments = [] }) => {
            const p = payments.find(x => x.id === id);
            if (p) fillForm(p);
          });
          closeDropdown();
        });
      });
    }

    document.body.appendChild(dropdown);

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', onOutsideClick);
    }, 0);
  }

  function onOutsideClick(e) {
    if (dropdown && !dropdown.contains(e.target) && e.target !== floatingBtn) {
      closeDropdown();
    }
  }

  function closeDropdown() {
    if (dropdown) { dropdown.remove(); dropdown = null; }
    document.removeEventListener('click', onOutsideClick);
  }

  function fillForm(payment) {
    const fields = detectedFields;
    if (fields.beneficiary) fillField(fields.beneficiary, payment.beneficiary);
    if (fields.iban)        fillField(fields.iban, payment.iban);
    if (fields.amount)      fillField(fields.amount, payment.amount);
    if (fields.reference)   fillField(fields.reference, payment.reference);

    // Visual feedback: briefly highlight filled fields
    Object.values(fields).forEach(el => {
      if (!el) return;
      el.style.transition = 'background 0.3s';
      el.style.background = '#e6f4ea';
      setTimeout(() => { el.style.background = ''; }, 2000);
    });
  }

  // Watch DOM for the bonifico form appearing (SPA navigation)
  function checkForForm() {
    const fields = detectFormFields();
    if (hasMinimumFields(fields)) {
      detectedFields = fields;
      chrome.storage.local.get(['payments'], ({ payments = [] }) => {
        const pending = payments.filter(p => p.status === 'pending').length;
        if (pending > 0) {
          showFloatingButton(pending);
        } else {
          removeFloatingButton();
        }
      });
    } else {
      removeFloatingButton();
    }
  }

  // Update button count when storage changes
  chrome.storage.onChanged.addListener(() => {
    if (floatingBtn) {
      chrome.storage.local.get(['payments'], ({ payments = [] }) => {
        const pending = payments.filter(p => p.status === 'pending').length;
        if (pending > 0) {
          floatingBtn.innerHTML = `💼 Compila da fattura (${pending})`;
        } else {
          removeFloatingButton();
        }
      });
    }
  });

  const observer = new MutationObserver(() => checkForForm());
  observer.observe(document.body, { childList: true, subtree: true });

  // Initial check
  checkForForm();

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }
})();
