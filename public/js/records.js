let currentStatus = '';
let currentPage = 1;
let searchTimer = null;

function rowLink(form) {
  if (form.status === 'draft') return `/service-form?id=${form.id}`;
  return `/service-detail?id=${form.id}`;
}

async function loadRecords() {
  const body = document.getElementById('recordsBody');
  const empty = document.getElementById('recordsEmpty');
  const params = new URLSearchParams();
  const q = document.getElementById('searchInput').value.trim();
  const dateFrom = document.getElementById('dateFrom').value;
  const dateTo = document.getElementById('dateTo').value;
  if (q) params.set('q', q);
  if (currentStatus) params.set('status', currentStatus);
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  params.set('page', currentPage);

  try {
    const { forms, pagination } = await fetchJSON(`/api/service-forms?${params.toString()}`);
    empty.style.display = forms.length === 0 ? 'block' : 'none';
    body.innerHTML = forms
      .map(
        (f) => `<tr class="clickable" onclick="location.href='${rowLink(f)}'">
          <td>${escapeHtml(f.id)}</td>
          <td>${escapeHtml(f.customer_name || '-')}</td>
          <td>${escapeHtml([f.brand, f.model].filter(Boolean).join(' ') || '-')}</td>
          <td>${escapeHtml(SERVICE_TYPE_LABELS[f.service_type] || '-')}</td>
          <td>${statusBadge(f.status)}</td>
          <td>${formatMoney(f.total_cost)}</td>
          <td>${formatDate(f.created_at)}</td>
        </tr>`
      )
      .join('');

    const pager = document.getElementById('pagination');
    if (pagination.totalPages > 1) {
      pager.innerHTML = `
        <button class="btn btn-sm" id="prevPage" ${pagination.page <= 1 ? 'disabled' : ''}>Previous</button>
        <span style="align-self:center; font-size:13px; color:var(--muted);">Page ${pagination.page} of ${pagination.totalPages}</span>
        <button class="btn btn-sm" id="nextPage" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>Next</button>
      `;
      document.getElementById('prevPage')?.addEventListener('click', () => {
        currentPage = Math.max(1, currentPage - 1);
        loadRecords();
      });
      document.getElementById('nextPage')?.addEventListener('click', () => {
        currentPage = currentPage + 1;
        loadRecords();
      });
    } else {
      pager.innerHTML = '';
    }
  } catch (err) {
    body.innerHTML = `<tr><td colspan="7"><div class="alert alert-danger">${escapeHtml(err.message)}</div></td></tr>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadRecords();

  document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentPage = 1;
      loadRecords();
    }, 250);
  });
  document.getElementById('dateFrom').addEventListener('change', () => {
    currentPage = 1;
    loadRecords();
  });
  document.getElementById('dateTo').addEventListener('change', () => {
    currentPage = 1;
    loadRecords();
  });

  document.getElementById('statusFilters').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    document.querySelectorAll('#statusFilters .tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentStatus = btn.dataset.status;
    currentPage = 1;
    loadRecords();
  });
});
