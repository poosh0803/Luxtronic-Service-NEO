function statCard(label, value, colorClass) {
  return `<div class="stat-card">
    <div class="stat-label">${escapeHtml(label)}</div>
    <div class="stat-number ${colorClass}">${value}</div>
  </div>`;
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [{ forms: drafts }, { forms: inProgress }, { metrics }] = await Promise.all([
      fetchJSON('/api/service-forms?status=draft&limit=10'),
      fetchJSON('/api/service-forms?status=started&limit=50'),
      fetchJSON('/api/analytics'),
    ]);

    document.getElementById('statsGrid').innerHTML = [
      statCard('In Progress', inProgress.length, 'blue'),
      statCard('Finished (all time)', metrics.statusCounts.finished || 0, 'green'),
      statCard('Services (30 days)', metrics.totalServices.value, 'orange'),
      statCard('Unfinished Drafts', drafts.length, drafts.length > 0 ? 'grey' : 'green'),
    ].join('');

    if (drafts.length > 0) {
      document.getElementById('draftsSection').style.display = 'block';
      document.getElementById('draftsBody').innerHTML = drafts
        .map(
          (f) => `<tr class="clickable" onclick="location.href='/service-form?id=${f.id}'">
            <td>${escapeHtml(f.id)}</td>
            <td>${escapeHtml(f.customer_name || '-')}</td>
            <td>${escapeHtml([f.brand, f.model].filter(Boolean).join(' ') || '-')}</td>
            <td><a class="btn btn-sm" href="/service-form?id=${f.id}">Continue</a></td>
          </tr>`
        )
        .join('');
    }

    document.getElementById('inProgressCount').textContent = ` (${inProgress.length})`;
    if (inProgress.length === 0) {
      document.getElementById('inProgressEmpty').style.display = 'block';
    } else {
      document.getElementById('inProgressBody').innerHTML = inProgress
        .map(
          (f) => `<tr class="clickable" onclick="location.href='/service-detail?id=${f.id}'">
            <td>${escapeHtml(f.id)}</td>
            <td>${escapeHtml(f.customer_name || '-')}</td>
            <td>${escapeHtml([f.brand, f.model].filter(Boolean).join(' ') || '-')}</td>
            <td>${formatMoney(f.total_cost)}</td>
            <td>${formatDate(f.created_at)}</td>
            <td><a class="btn btn-sm" href="/service-detail?id=${f.id}">View</a></td>
          </tr>`
        )
        .join('');
    }
  } catch (err) {
    document.getElementById('statsGrid').innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  }
});
