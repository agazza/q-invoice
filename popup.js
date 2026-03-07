const list = document.getElementById('payment-list');
const badge = document.getElementById('pending-badge');
let currentTab = 'pending';

// Tab switching
document.querySelectorAll('.popup-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.popup-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.tab;
    render();
  });
});

// Reload when storage changes (e.g. a new invoice saved from Gmail tab)
chrome.storage.onChanged.addListener(() => loadAndRender());

function loadAndRender() {
  chrome.storage.local.get(['payments'], ({ payments = [] }) => {
    const pending = payments.filter(p => p.status === 'pending').length;
    if (pending > 0) {
      badge.textContent = pending;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
    renderPayments(payments);
  });
}

function renderPayments(payments) {
  const items = payments
    .filter(p => p.status === (currentTab === 'pending' ? 'pending' : 'paid'))
    .sort((a, b) => {
      if (currentTab === 'pending') {
        // Sort by due date ascending (nulls last)
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      } else {
        // Sort paid by most recent first
        return (b.paidAt || '').localeCompare(a.paidAt || '');
      }
    });

  if (items.length === 0) {
    list.innerHTML = `<p class="popup-empty">${currentTab === 'pending' ? 'Nessuna fattura in sospeso 🎉' : 'Nessuna fattura pagata'}</p>`;
    return;
  }

  list.innerHTML = items.map(p => buildItem(p)).join('');

  // Attach events
  list.querySelectorAll('.btn-copy-iban').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.iban).then(() => {
        const orig = btn.textContent;
        btn.textContent = '✓ Copiato';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
      });
    });
  });

  list.querySelectorAll('.btn-mark-paid').forEach(btn => {
    btn.addEventListener('click', () => {
      markPaid(btn.dataset.id);
    });
  });
}

function buildItem(p) {
  const dueBadge = buildDueBadge(p);
  const ibanShort = p.iban ? p.iban.substring(0, 12) + '…' : '—';
  const amountFormatted = p.amount ? `€${parseFloat(p.amount).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` : '—';

  const actions = p.status === 'pending'
    ? `<button class="btn-copy-iban" data-iban="${escapeAttr(p.iban)}">📋 Copia IBAN</button>
       <button class="btn-mark-paid" data-id="${escapeAttr(p.id)}">✓ Pagata</button>`
    : `<button class="btn-copy-iban" data-iban="${escapeAttr(p.iban)}">📋 Copia IBAN</button>`;

  const paidLine = p.status === 'paid' && p.paidAt
    ? `<span class="payment-paid-date">Pagata il ${formatDate(p.paidAt)}</span>`
    : '';

  return `
    <div class="payment-item" data-id="${escapeAttr(p.id)}">
      <div class="payment-top">
        <span class="payment-name" title="${escapeAttr(p.beneficiary)}">${escapeHtml(p.beneficiary)}</span>
        <span class="payment-amount">${amountFormatted}</span>
      </div>
      <div class="payment-meta">
        <span class="payment-iban">${escapeHtml(ibanShort)}</span>
        ${dueBadge}
        ${paidLine}
      </div>
      <div class="payment-actions">${actions}</div>
    </div>`;
}

function buildDueBadge(p) {
  if (!p.dueDate) return `<span class="payment-due no-date">scadenza n.d.</span>`;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(p.dueDate);
  const diff = Math.round((due - today) / 86400000);
  const label = `scad. ${formatDate(p.dueDate)}`;
  if (diff < 0)  return `<span class="payment-due overdue">${label}</span>`;
  if (diff <= 7) return `<span class="payment-due due-soon">${label}</span>`;
  return `<span class="payment-due due-ok">${label}</span>`;
}

function markPaid(id) {
  chrome.storage.local.get(['payments'], ({ payments = [] }) => {
    const idx = payments.findIndex(p => p.id === id);
    if (idx !== -1) {
      payments[idx].status = 'paid';
      payments[idx].paidAt = new Date().toISOString();
      chrome.storage.local.set({ payments }, () => loadAndRender());
    }
  });
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function escapeAttr(str) {
  return (str || '').replace(/"/g, '&quot;');
}

// Initial load
loadAndRender();
