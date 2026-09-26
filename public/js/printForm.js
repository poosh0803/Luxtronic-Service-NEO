document.addEventListener('DOMContentLoaded', async () => {
  const id = new URLSearchParams(window.location.search).get('id');
  const status = document.getElementById('toolbarStatus');
  if (!id) {
    status.textContent = 'No form ID given.';
    return;
  }

  try {
    const [{ form }, config] = await Promise.all([
      fetchJSON(`/api/service-forms/${id}`),
      fetch('/api/config').then((r) => r.json()),
    ]);

    status.textContent = `${form.id} - ${form.customer_name || 'Unnamed customer'}`;

    document.getElementById('formId').textContent = form.id;
    document.getElementById('formDate').textContent = formatDate(form.created_at);
    document.getElementById('customerName').textContent = form.customer_name || '';
    document.getElementById('customerPhone').textContent = form.customer_phone || '';

    document.getElementById('businessName').textContent = config.BUSINESS_NAME || '';
    document.getElementById('businessAddress').textContent = config.ADDRESS || '';
    document.getElementById('businessPhone').textContent = config.PHONE || '';
    document.getElementById('businessEmail').textContent = config.EMAIL || '';

    document.getElementById('serviceType').textContent = SERVICE_TYPE_LABELS[form.service_type] || '-';
    document.getElementById('brandModel').textContent = [form.brand, form.model].filter(Boolean).join(' ') || '-';
    document.getElementById('serialNumber').textContent = form.serial_number || '-';

    document.getElementById(form.liquid_damaged ? 'checkLiquidYes' : 'checkLiquidNo').classList.add('checked');

    const accessories = (form.accessories || []).map((a) => ACCESSORY_LABELS[a] || a);
    const accessoriesText = accessories.length ? accessories.join(', ') : 'None';
    document.getElementById('accessoriesLine').textContent = `Accessories: ${accessoriesText}${form.accessories_other ? ' - ' + form.accessories_other : ''}`;

    const issues = (form.reported_issues || []).map((i) => ISSUE_LABELS[i] || i);
    document.getElementById('reportedIssues').textContent = issues.length ? issues.join(', ') : 'No specific issue selected.';
    document.getElementById('issueNotes').textContent = form.issue_notes || '';

    document.getElementById('diagnosisNotes').textContent = form.diagnosis_notes || 'Not yet diagnosed.';
    document.querySelectorAll('[data-test]').forEach((box) => {
      box.classList.toggle('checked', (form.inspection_tests || []).includes(box.dataset.test));
    });

    document.getElementById('partsBreakdownCell').textContent = form.parts_breakdown ? `Parts - ${form.parts_breakdown}` : 'Parts';
    document.getElementById('partsCostCell').textContent = formatMoney(form.parts_cost);
    document.getElementById('labourCostCell').textContent = formatMoney(form.labour_cost);
    document.getElementById('totalCostCell').textContent = formatMoney(form.total_cost);

    const disclaimerPoints = (config.SERVICE_FORM_DISCLAIMER || '')
      .split('|')
      .map((point) => point.trim())
      .filter(Boolean);
    document.getElementById('disclaimerList').innerHTML = disclaimerPoints.length
      ? disclaimerPoints
          .map((point) => {
            const isNotice = point.startsWith('[') && point.endsWith(']');
            return `<li class="${isNotice ? 'notice' : ''}">${escapeHtml(isNotice ? point.slice(1, -1) : point)}</li>`;
          })
          .join('')
      : '<li>No terms configured - set SERVICE_FORM_DISCLAIMER in .env.</li>';
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
  }
});
