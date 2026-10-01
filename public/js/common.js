// Shared helpers used across pages.

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data;
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-AU', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatMoney(value) {
  const n = Number(value || 0);
  return `$${n.toFixed(2)}`;
}

const STATUS_LABELS = {
  draft: 'Draft',
  started: 'In Progress',
  finished: 'Finished',
};

function statusBadge(status) {
  const label = STATUS_LABELS[status] || status;
  return `<span class="badge badge-${status}">${label}</span>`;
}

const SERVICE_TYPE_LABELS = {
  new: 'New',
  rma: 'RMA',
  repeat: 'Repeat Service',
};

const ACCESSORY_LABELS = {
  charger: 'Charger',
  usb_drive: 'USB Drive / HDD',
  other: 'Other',
};

const ISSUE_LABELS = {
  no_display: 'No Display',
  no_charging: 'No Charging',
  no_post: 'No Post',
  blue_screen: 'Blue Screen',
  overheating: 'Overheating',
  fan_clean: 'Needs Fan Clean',
  network: 'Network Related',
  os: 'OS Issue',
  other: 'Other',
};

const INSPECTION_TEST_LABELS = {
  memtest: 'Memtest',
  hdd_test: 'HDD Test',
  power_test: 'Power Test',
  display_test: 'Display Test',
};

// Summed in integer cents so e.g. 0.1 + 0.2 doesn't print as $0.30000000000000004.
function sumParts(parts) {
  return (parts || []).reduce((cents, part) => cents + Math.round((Number(part.cost) || 0) * 100), 0) / 100;
}

// Editable parts list (one row per part: description + cost), shared by the
// wizard and the service-detail edit form. onChange fires on every edit.
function initPartsEditor(container, onChange) {
  container.classList.add('parts-editor');
  container.innerHTML = `
    <div class="parts-rows"></div>
    <button type="button" class="btn btn-sm parts-add"><i class="fas fa-plus"></i> Add part</button>
    <div class="cost-summary"><span>Parts subtotal</span><span class="parts-subtotal">$0.00</span></div>`;

  const changed = () => {
    container.querySelector('.parts-subtotal').textContent = formatMoney(sumParts(readPartsEditor(container).parts));
    if (onChange) onChange();
  };
  container.querySelector('.parts-add').addEventListener('click', () => {
    addPartRow(container, { description: '', cost: '' }).querySelector('.part-desc').focus();
    changed();
  });
  container.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.part-remove');
    if (!removeBtn) return;
    removeBtn.closest('.part-row').remove();
    if (!container.querySelector('.part-row')) addPartRow(container, { description: '', cost: '' });
    changed();
  });
  container.addEventListener('input', changed);
  container._partsChanged = changed;
  setPartsEditorValue(container, []);
}

function addPartRow(container, part) {
  const row = document.createElement('div');
  row.className = 'part-row';
  row.innerHTML = `
    <input type="text" class="part-desc" maxlength="200" placeholder="Part, e.g. Display cable" aria-label="Part description">
    <input type="number" class="part-cost" step="0.01" min="0" inputmode="decimal" placeholder="0.00" aria-label="Part cost ($)">
    <button type="button" class="btn part-remove" aria-label="Remove part">&times;</button>`;
  row.querySelector('.part-desc').value = part.description || '';
  row.querySelector('.part-cost').value = part.cost === '' || part.cost === undefined ? '' : part.cost;
  container.querySelector('.parts-rows').appendChild(row);
  return row;
}

function setPartsEditorValue(container, parts) {
  container.querySelector('.parts-rows').innerHTML = '';
  (parts.length ? parts : [{ description: '', cost: '' }]).forEach((part) => addPartRow(container, part));
  container._partsChanged();
}

// Returns only complete rows; blank rows are ignored. `error` flags a row that
// has a cost but no description, or a cost that isn't a valid amount.
function readPartsEditor(container) {
  const parts = [];
  let error = null;
  container.querySelectorAll('.part-row').forEach((row) => {
    const description = row.querySelector('.part-desc').value.trim();
    const costInput = row.querySelector('.part-cost');
    const costText = costInput.value.trim();
    if (!description && !costText && !costInput.validity.badInput) return;
    const cost = costText === '' ? 0 : Number(costText);
    if (!description) error = error || 'Each part needs a description.';
    else if (costInput.validity.badInput || !Number.isFinite(cost) || cost < 0) error = error || `"${description}" needs a valid cost.`;
    else parts.push({ description, cost });
  });
  return { parts, error };
}

function highlightNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-bar a.nav-item[href]').forEach((a) => {
    if (a.getAttribute('href') === path) a.classList.add('active');
  });
}

function initDarkMode() {
  const toggle = document.getElementById('darkModeToggle');
  const icon = document.getElementById('themeIcon');
  const applyTheme = (dark) => {
    document.body.classList.toggle('dark-mode', dark);
    if (icon) {
      icon.classList.toggle('fa-moon', !dark);
      icon.classList.toggle('fa-sun', dark);
    }
  };
  applyTheme(localStorage.getItem('theme') === 'dark');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const dark = !document.body.classList.contains('dark-mode');
      localStorage.setItem('theme', dark ? 'dark' : 'light');
      applyTheme(dark);
    });
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
  highlightNav();
  initDarkMode();
});
