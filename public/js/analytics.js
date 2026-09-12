function statCard(label, value, colorClass, sub) {
  return `<div class="stat-card">
    <div class="stat-label">${escapeHtml(label)}</div>
    <div class="stat-number ${colorClass}">${value}</div>
    ${sub ? `<div class="stat-sub">${escapeHtml(sub)}</div>` : ''}
  </div>`;
}

function barRow(label, value, max, color, valueText) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return `<div class="bar-row">
    <div class="bar-label">${escapeHtml(label)}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%; background:${color};"></div></div>
    <div class="bar-value">${valueText !== undefined ? valueText : value}</div>
  </div>`;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const { metrics } = await fetchJSON('/api/analytics');

    document.getElementById('statsGrid').innerHTML = [
      statCard('Services (30 days)', metrics.totalServices.value, 'orange', `${metrics.totalServices.change > 0 ? '+' : ''}${metrics.totalServices.change || 0}% vs prior 30 days`),
      statCard('Avg. Daily Services', metrics.averageDailyServices.value, 'blue', `${metrics.averageDailyServices.change > 0 ? '+' : ''}${metrics.averageDailyServices.change || 0}% vs prior 30 days`),
      statCard('Most Popular Brand', metrics.mostPopularBrand.brand, 'orange', `${metrics.mostPopularBrand.percentage}% of jobs (30 days)`),
      statCard('Most Popular Device', metrics.mostPopularDevice.device, 'blue', `${metrics.mostPopularDevice.percentage}% of jobs (30 days)`),
    ].join('');

    const statusCounts = metrics.statusCounts || { started: 0, finished: 0 };
    const maxStatus = Math.max(1, statusCounts.started, statusCounts.finished);
    document.getElementById('statusBars').innerHTML =
      barRow('In Progress', statusCounts.started, maxStatus, '#1976d2') + barRow('Finished', statusCounts.finished, maxStatus, '#388e3c');

    const brands = metrics.brandDistribution || [];
    const maxBrand = Math.max(1, ...brands.map((b) => parseInt(b.count, 10)));
    document.getElementById('brandBars').innerHTML = brands.length
      ? brands.map((b) => barRow(b.brand, parseInt(b.count, 10), maxBrand, '#dda84b', `${b.count} (${b.percentage}%)`)).join('')
      : '<div class="empty">No data yet.</div>';

    const monthly = metrics.monthlyTrends || [];
    const maxMonthly = Math.max(1, ...monthly.map((m) => parseInt(m.count, 10)));
    document.getElementById('monthlyBars').innerHTML = monthly
      .map((m) => barRow(MONTH_NAMES[m.month - 1], parseInt(m.count, 10), maxMonthly, '#dda84b'))
      .join('');

    const days = metrics.popularServiceDays || [];
    const maxDays = Math.max(1, ...days.map((d) => parseInt(d.count, 10)));
    document.getElementById('dayBars').innerHTML = days.map((d) => barRow(d.day_name, parseInt(d.count, 10), maxDays, '#1976d2')).join('');

    const models = metrics.modelDistribution || [];
    if (models.length === 0) {
      document.getElementById('modelsEmpty').style.display = 'block';
    } else {
      document.getElementById('modelsBody').innerHTML = models
        .map((m) => `<tr><td>${escapeHtml(m.model)}</td><td>${m.count}</td><td>${m.percentage}%</td></tr>`)
        .join('');
    }
  } catch (err) {
    document.getElementById('loadError').innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  }
});
