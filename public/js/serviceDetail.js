let currentForm = null;

function getId() {
  return new URLSearchParams(window.location.search).get('id');
}

function renderDetailsView(form) {
  const accessories = (form.accessories || []).map((a) => ACCESSORY_LABELS[a] || a);
  const issues = (form.reported_issues || []).map((i) => ISSUE_LABELS[i] || i);
  const tests = (form.inspection_tests || []).map((t) => INSPECTION_TEST_LABELS[t] || t);

  document.getElementById('detailsView').innerHTML = `
    <div class="grid-2">
      <div>
        <h2 style="font-size:14px; color:var(--muted);">Customer</h2>
        <div><strong>Name:</strong> ${escapeHtml(form.customer_name) || '-'}</div>
        <div><strong>Phone:</strong> ${escapeHtml(form.customer_phone) || '-'}</div>
      </div>
      <div>
        <h2 style="font-size:14px; color:var(--muted);">Device</h2>
        <div><strong>Service Type:</strong> ${SERVICE_TYPE_LABELS[form.service_type] || '-'}</div>
        <div><strong>Brand / Model:</strong> ${escapeHtml([form.brand, form.model].filter(Boolean).join(' ')) || '-'}</div>
        <div><strong>Serial:</strong> ${escapeHtml(form.serial_number) || '-'}</div>
        <div><strong>Liquid Damaged:</strong> ${form.liquid_damaged ? 'Yes' : 'No'}</div>
        <div><strong>Accessories:</strong> ${accessories.length ? escapeHtml(accessories.join(', ')) : 'None'}${form.accessories_other ? ' - ' + escapeHtml(form.accessories_other) : ''}</div>
      </div>
    </div>
    <div style="margin-top:16px;">
      <h2 style="font-size:14px; color:var(--muted);">Reported Issue</h2>
      <div>${issues.length ? escapeHtml(issues.join(', ')) : 'None selected'}</div>
      <div>${escapeHtml(form.issue_notes) || '-'}</div>
    </div>
    <div style="margin-top:16px;">
      <h2 style="font-size:14px; color:var(--muted);">Diagnosis</h2>
      <div><strong>Tests Run:</strong> ${tests.length ? escapeHtml(tests.join(', ')) : 'None'}</div>
      <div>${escapeHtml(form.diagnosis_notes) || '-'}</div>
    </div>
    <div style="margin-top:16px;">
      <h2 style="font-size:14px; color:var(--muted);">Cost</h2>
      <div><strong>Parts:</strong> ${escapeHtml(form.parts_breakdown) || '-'} (${formatMoney(form.parts_cost)})</div>
      <div><strong>Labour:</strong> ${formatMoney(form.labour_cost)}</div>
      <div><strong>Total Quote:</strong> ${formatMoney(form.total_cost)}</div>
    </div>
  `;
}

function renderPhotos(photos) {
  document.getElementById('photoGrid').innerHTML =
    photos
      .map(
        (p) => `<div class="photo-item">
          <img src="/uploads/service-forms/${currentForm.id}/${p.filename}">
          <button type="button" class="photo-delete-btn" title="Delete photo" data-photo-id="${p.id}">&times;</button>
        </div>`
      )
      .join('') || '<div class="empty">No photos attached.</div>';
}

async function load() {
  const id = getId();
  if (!id) {
    document.getElementById('loadError').innerHTML = `<div class="alert alert-danger">No record ID given.</div>`;
    return;
  }
  document.getElementById('printLink').href = `/print-form?id=${id}`;

  try {
    const { form, photos } = await fetchJSON(`/api/service-forms/${id}`);
    currentForm = form;

    document.getElementById('pageTitle').textContent = `Service Form: ${form.id}`;
    document.getElementById('formSubtitle').innerHTML = `Created ${formatDate(form.created_at)} &middot; ${statusBadge(form.status)}`;
    document.getElementById('detailsEditForm').style.display = 'none';

    renderDetailsView(form);
    renderPhotos(photos);

    document.getElementById('finishBtn').style.display = form.status === 'started' ? 'inline-block' : 'none';
    document.getElementById('reopenBtn').style.display = form.status === 'finished' ? 'inline-block' : 'none';

    document.getElementById('detail').style.display = 'block';
  } catch (err) {
    document.getElementById('loadError').innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  load();

  document.getElementById('editBtn').addEventListener('click', () => {
    if (!currentForm) return;
    document.getElementById('editCustomerName').value = currentForm.customer_name || '';
    document.getElementById('editCustomerPhone').value = currentForm.customer_phone || '';
    document.getElementById('editServiceType').value = currentForm.service_type || 'new';
    document.getElementById('editLiquidDamaged').value = currentForm.liquid_damaged ? 'true' : 'false';
    document.getElementById('editBrand').value = currentForm.brand || '';
    document.getElementById('editModel').value = currentForm.model || '';
    document.getElementById('editSerialNumber').value = currentForm.serial_number || '';
    document.getElementById('editAccessoriesOther').value = currentForm.accessories_other || '';
    document.getElementById('editIssueNotes').value = currentForm.issue_notes || '';
    document.getElementById('editDiagnosisNotes').value = currentForm.diagnosis_notes || '';
    document.querySelectorAll('#editInspectionTests input').forEach((box) => {
      box.checked = (currentForm.inspection_tests || []).includes(box.value);
    });
    document.getElementById('editPartsBreakdown').value = currentForm.parts_breakdown || '';
    document.getElementById('editPartsCost').value = currentForm.parts_cost || 0;
    document.getElementById('editLabourCost').value = currentForm.labour_cost || 0;
    document.getElementById('editError').innerHTML = '';
    document.getElementById('detailsEditForm').style.display = 'block';
  });

  document.getElementById('cancelEditBtn').addEventListener('click', () => {
    document.getElementById('detailsEditForm').style.display = 'none';
  });

  document.getElementById('saveBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('editError');
    errorEl.innerHTML = '';
    const payload = {
      customer_name: document.getElementById('editCustomerName').value.trim(),
      customer_phone: document.getElementById('editCustomerPhone').value.trim(),
      service_type: document.getElementById('editServiceType').value,
      liquid_damaged: document.getElementById('editLiquidDamaged').value === 'true',
      brand: document.getElementById('editBrand').value.trim(),
      model: document.getElementById('editModel').value.trim(),
      serial_number: document.getElementById('editSerialNumber').value.trim(),
      accessories_other: document.getElementById('editAccessoriesOther').value.trim(),
      issue_notes: document.getElementById('editIssueNotes').value.trim(),
      diagnosis_notes: document.getElementById('editDiagnosisNotes').value.trim(),
      inspection_tests: [...document.querySelectorAll('#editInspectionTests input:checked')].map((box) => box.value),
      parts_breakdown: document.getElementById('editPartsBreakdown').value.trim(),
      parts_cost: parseFloat(document.getElementById('editPartsCost').value) || 0,
      labour_cost: parseFloat(document.getElementById('editLabourCost').value) || 0,
    };
    try {
      await fetchJSON(`/api/service-forms/${getId()}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      load();
    } catch (err) {
      errorEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
  });

  document.getElementById('finishBtn').addEventListener('click', async () => {
    await fetchJSON(`/api/service-forms/${getId()}/finish`, { method: 'POST' });
    load();
  });
  document.getElementById('reopenBtn').addEventListener('click', async () => {
    await fetchJSON(`/api/service-forms/${getId()}/reopen`, { method: 'POST' });
    load();
  });
  document.getElementById('deleteBtn').addEventListener('click', async () => {
    if (!currentForm) return;
    if (!confirm(`Delete service form ${currentForm.id} for "${currentForm.customer_name || 'this customer'}"? This cannot be undone.`)) return;
    const errorEl = document.getElementById('deleteError');
    errorEl.innerHTML = '';
    try {
      await fetchJSON(`/api/service-forms/${getId()}`, { method: 'DELETE' });
      window.location.href = '/records';
    } catch (err) {
      errorEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
  });

  document.getElementById('addPhotoBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('photoError');
    errorEl.innerHTML = '';
    const input = document.getElementById('addPhotoInput');
    const files = input.files;
    if (!files || files.length === 0) {
      errorEl.innerHTML = `<div class="alert alert-danger">Choose one or more photos first.</div>`;
      return;
    }
    try {
      const fd = new FormData();
      for (const file of files) fd.append('photos', file);
      await fetchJSON(`/api/service-forms/${getId()}/photos`, { method: 'POST', body: fd });
      input.value = '';
      load();
    } catch (err) {
      errorEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
  });

  document.getElementById('photoGrid').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-photo-id]');
    if (!btn) return;
    if (!confirm('Delete this photo?')) return;
    await fetchJSON(`/api/service-forms/${getId()}/photos/${btn.dataset.photoId}`, { method: 'DELETE' });
    load();
  });
});
