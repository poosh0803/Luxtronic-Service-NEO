const TOTAL_STEPS = 12;
const DRAFT_KEY = 'luxtronicServiceDraftId';

let currentStep = 1;
let formData = {
  customer_name: '',
  customer_phone: '',
  service_type: null,
  brand: '',
  model: '',
  serial_number: '',
  liquid_damaged: null,
  accessories: [],
  accessories_other: '',
  reported_issues: [],
  issue_notes: '',
  diagnosis_notes: '',
  inspection_tests: [],
  parts_breakdown: '',
  parts_cost: 0,
  labour_cost: 0,
};
let draftId = null;
let photos = [];

function fieldsForStep(step) {
  switch (step) {
    case 1:
      return { customer_name: formData.customer_name, customer_phone: formData.customer_phone };
    case 2:
      return { service_type: formData.service_type };
    case 3:
      return { brand: formData.brand, model: formData.model };
    case 4:
      return { serial_number: formData.serial_number, liquid_damaged: formData.liquid_damaged };
    case 5:
      return { accessories: formData.accessories, accessories_other: formData.accessories_other };
    case 6:
      return { reported_issues: formData.reported_issues };
    case 7:
      return { issue_notes: formData.issue_notes };
    case 8:
      return { diagnosis_notes: formData.diagnosis_notes, inspection_tests: formData.inspection_tests };
    case 9:
      return { parts_breakdown: formData.parts_breakdown, parts_cost: formData.parts_cost };
    case 10:
      return { labour_cost: formData.labour_cost };
    default:
      return {};
  }
}

function readStepInputs(step) {
  switch (step) {
    case 1:
      formData.customer_name = document.getElementById('customerName').value.trim();
      formData.customer_phone = document.getElementById('customerPhone').value.trim();
      break;
    case 3:
      formData.brand = document.getElementById('brand').value;
      formData.model = document.getElementById('model').value.trim();
      break;
    case 4:
      formData.serial_number = document.getElementById('serialNumber').value.trim();
      break;
    case 5:
      formData.accessories_other = document.getElementById('accessoriesOther').value.trim();
      break;
    case 7:
      formData.issue_notes = document.getElementById('issueNotes').value.trim();
      break;
    case 8:
      formData.diagnosis_notes = document.getElementById('diagnosisNotes').value.trim();
      break;
    case 9:
      formData.parts_breakdown = document.getElementById('partsBreakdown').value.trim();
      formData.parts_cost = parseFloat(document.getElementById('partsCost').value) || 0;
      break;
    case 10:
      formData.labour_cost = parseFloat(document.getElementById('labourCost').value) || 0;
      break;
  }
}

function validateStep(step) {
  if (step === 1 && !formData.customer_name) return 'Please enter the customer name.';
  if (step === 2 && !formData.service_type) return 'Please choose a service type.';
  if (step === 3 && (!formData.brand || !formData.model)) return 'Please enter both brand and model.';
  return null;
}

function showStep(step) {
  document.querySelectorAll('.wizard-step').forEach((el) => {
    el.classList.toggle('active', parseInt(el.dataset.step, 10) === step);
  });
  document.getElementById('progressLabel').textContent = `Step ${step} of ${TOTAL_STEPS}`;
  document.getElementById('progressFill').style.width = `${Math.round((step / TOTAL_STEPS) * 100)}%`;
  document.getElementById('backBtn').style.display = step === 1 ? 'none' : 'inline-block';
  document.getElementById('nextBtn').style.display = step === TOTAL_STEPS ? 'none' : 'inline-block';
  document.getElementById('submitBtn').style.display = step === TOTAL_STEPS ? 'inline-block' : 'none';
  document.getElementById('wizardError').innerHTML = '';
  if (step === 10) updateLiveTotal();
  if (step === 12) renderReview();
}

function updateLiveTotal() {
  const total = (formData.parts_cost || 0) + (formData.labour_cost || 0);
  document.getElementById('liveTotal').textContent = formatMoney(total);
}

async function saveStep(step) {
  const fields = fieldsForStep(step);
  await fetchJSON(`/api/service-forms/${draftId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...fields, wizard_step: Math.min(step + 1, TOTAL_STEPS) }),
  });
}

async function goNext() {
  readStepInputs(currentStep);
  const error = validateStep(currentStep);
  if (error) {
    document.getElementById('wizardError').innerHTML = `<div class="alert alert-danger">${escapeHtml(error)}</div>`;
    return;
  }
  try {
    await saveStep(currentStep);
    currentStep = Math.min(currentStep + 1, TOTAL_STEPS);
    showStep(currentStep);
  } catch (err) {
    document.getElementById('wizardError').innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  }
}

function goBack() {
  readStepInputs(currentStep);
  currentStep = Math.max(currentStep - 1, 1);
  showStep(currentStep);
}

function goToStep(step) {
  currentStep = step;
  showStep(step);
}

function renderReview() {
  const rows = [];
  const section = (title, editStep, rowsHtml) => `
    <div class="review-section">
      <div class="review-section-header">
        <h2>${escapeHtml(title)}</h2>
        <a href="#" class="btn btn-sm" data-edit-step="${editStep}">Edit</a>
      </div>
      ${rowsHtml}
    </div>`;

  const row = (label, value) => `<div class="review-row"><span class="review-label">${escapeHtml(label)}</span><span class="review-value">${escapeHtml(value || '-')}</span></div>`;

  rows.push(section('Customer', 1, row('Name', formData.customer_name) + row('Phone', formData.customer_phone)));
  rows.push(section('Service Type', 2, row('Type', SERVICE_TYPE_LABELS[formData.service_type] || '-')));
  rows.push(section('Device', 3, row('Brand', formData.brand) + row('Model', formData.model)));
  rows.push(
    section(
      'Serial & Damage',
      4,
      row('Serial Number', formData.serial_number) + row('Liquid Damaged', formData.liquid_damaged === true ? 'Yes' : formData.liquid_damaged === false ? 'No' : '-')
    )
  );
  rows.push(
    section(
      'Accessories',
      5,
      row('Received', formData.accessories.map((a) => ACCESSORY_LABELS[a] || a).join(', ') || 'None') +
        (formData.accessories_other ? row('Other', formData.accessories_other) : '')
    )
  );
  rows.push(section('Reported Issue', 6, row('Issues', formData.reported_issues.map((i) => ISSUE_LABELS[i] || i).join(', ') || 'None')));
  rows.push(section('Issue Notes', 7, row('Notes', formData.issue_notes)));
  rows.push(
    section(
      'Diagnosis',
      8,
      row('Tests Run', formData.inspection_tests.map((t) => INSPECTION_TEST_LABELS[t] || t).join(', ') || 'None') +
        row('Diagnosis', formData.diagnosis_notes)
    )
  );
  rows.push(section('Parts', 9, row('Breakdown', formData.parts_breakdown) + row('Parts Cost', formatMoney(formData.parts_cost))));
  rows.push(
    section(
      'Cost',
      10,
      row('Labour Cost', formatMoney(formData.labour_cost)) +
        `<div class="cost-summary total"><span>Total Quote</span><span>${formatMoney((formData.parts_cost || 0) + (formData.labour_cost || 0))}</span></div>`
    )
  );
  rows.push(
    section(
      'Photos',
      11,
      photos.length
        ? `<div class="photo-grid">${photos.map((p) => `<img src="/uploads/service-forms/${draftId}/${p.filename}">`).join('')}</div>`
        : row('Photos', 'None attached')
    )
  );

  document.getElementById('reviewContent').innerHTML = rows.join('');
}

const CHOICE_GROUP_FIELDS = {
  serviceTypeChoices: 'service_type',
  liquidChoices: 'liquid_damaged',
  accessoryChoices: 'accessories',
  issueChoices: 'reported_issues',
  testChoices: 'inspection_tests',
};

function selectChoice(groupId, value, multi) {
  const group = document.getElementById(groupId);
  const key = CHOICE_GROUP_FIELDS[groupId];

  if (multi) {
    const arr = formData[key];
    const idx = arr.indexOf(value);
    if (idx === -1) arr.push(value);
    else arr.splice(idx, 1);
  } else if (key === 'liquid_damaged') {
    formData[key] = value === 'true';
  } else {
    formData[key] = value;
  }

  group.querySelectorAll('.choice-btn').forEach((btn) => {
    const btnValue = btn.dataset.value;
    const selected = multi ? formData[key].includes(btnValue) : key === 'liquid_damaged' ? String(formData[key]) === btnValue : formData[key] === btnValue;
    btn.classList.toggle('selected', selected);
  });
}

function bindChoiceGroup(groupId, multi) {
  document.getElementById(groupId).addEventListener('click', (e) => {
    const btn = e.target.closest('.choice-btn');
    if (!btn) return;
    selectChoice(groupId, btn.dataset.value, multi);
  });
}

function populateFormFromDraft(form) {
  formData.customer_name = form.customer_name || '';
  formData.customer_phone = form.customer_phone || '';
  formData.service_type = form.service_type || null;
  formData.brand = form.brand || '';
  formData.model = form.model || '';
  formData.serial_number = form.serial_number || '';
  formData.liquid_damaged = form.liquid_damaged;
  formData.accessories = form.accessories || [];
  formData.accessories_other = form.accessories_other || '';
  formData.reported_issues = form.reported_issues || [];
  formData.issue_notes = form.issue_notes || '';
  formData.diagnosis_notes = form.diagnosis_notes || '';
  formData.inspection_tests = form.inspection_tests || [];
  formData.parts_breakdown = form.parts_breakdown || '';
  formData.parts_cost = parseFloat(form.parts_cost) || 0;
  formData.labour_cost = parseFloat(form.labour_cost) || 0;

  document.getElementById('customerName').value = formData.customer_name;
  document.getElementById('customerPhone').value = formData.customer_phone;
  document.getElementById('brand').value = formData.brand;
  document.getElementById('model').value = formData.model;
  document.getElementById('serialNumber').value = formData.serial_number;
  document.getElementById('accessoriesOther').value = formData.accessories_other;
  document.getElementById('issueNotes').value = formData.issue_notes;
  document.getElementById('diagnosisNotes').value = formData.diagnosis_notes;
  document.getElementById('partsBreakdown').value = formData.parts_breakdown;
  document.getElementById('partsCost').value = formData.parts_cost || '';
  document.getElementById('labourCost').value = formData.labour_cost || '';

  if (formData.service_type) selectChoice('serviceTypeChoices', formData.service_type, false);
  if (formData.liquid_damaged !== null && formData.liquid_damaged !== undefined) selectChoice('liquidChoices', String(formData.liquid_damaged), false);
  formData.accessories.forEach((a) => selectChoice('accessoryChoices', a, true));
  formData.reported_issues.forEach((i) => selectChoice('issueChoices', i, true));
  formData.inspection_tests.forEach((t) => selectChoice('testChoices', t, true));
}

async function uploadPhotos(input) {
  const errorEl = document.getElementById('wizardError');
  errorEl.innerHTML = '';
  const fd = new FormData();
  for (const file of input.files) fd.append('photos', file);
  try {
    const data = await fetchJSON(`/api/service-forms/${draftId}/photos`, { method: 'POST', body: fd });
    photos = photos.concat(data.photos);
    renderPhotoGrid();
  } catch (err) {
    errorEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  } finally {
    input.value = '';
  }
}

function renderPhotoGrid() {
  document.getElementById('photoGrid').innerHTML = photos
    .map((p) => `<div class="photo-item"><img src="/uploads/service-forms/${draftId}/${p.filename}"></div>`)
    .join('');
}

async function initDraft() {
  const urlParams = new URLSearchParams(window.location.search);
  const resumeId = urlParams.get('id');

  try {
    if (resumeId) {
      const { form, photos: existingPhotos } = await fetchJSON(`/api/service-forms/${resumeId}`);
      if (form.status !== 'draft') {
        window.location.href = `/service-detail?id=${resumeId}`;
        return;
      }
      draftId = resumeId;
      photos = existingPhotos;
      localStorage.setItem(DRAFT_KEY, draftId);
      populateFormFromDraft(form);
      currentStep = Math.min(Math.max(form.wizard_step || 1, 1), TOTAL_STEPS);
    } else {
      const storedId = localStorage.getItem(DRAFT_KEY);
      let resumed = false;
      if (storedId) {
        try {
          const { form, photos: existingPhotos } = await fetchJSON(`/api/service-forms/${storedId}`);
          if (form.status === 'draft') {
            draftId = storedId;
            photos = existingPhotos;
            populateFormFromDraft(form);
            currentStep = Math.min(Math.max(form.wizard_step || 1, 1), TOTAL_STEPS);
            resumed = true;
          }
        } catch {
          // stored draft no longer exists - fall through to creating a new one
        }
      }
      if (!resumed) {
        const { form } = await fetchJSON('/api/service-forms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        draftId = form.id;
        localStorage.setItem(DRAFT_KEY, draftId);
        currentStep = 1;
      }
    }

    renderPhotoGrid();
    document.getElementById('wizard').style.display = 'block';
    showStep(currentStep);
  } catch (err) {
    document.getElementById('loadError').innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindChoiceGroup('serviceTypeChoices', false);
  bindChoiceGroup('liquidChoices', false);
  bindChoiceGroup('accessoryChoices', true);
  bindChoiceGroup('issueChoices', true);
  bindChoiceGroup('testChoices', true);

  document.getElementById('nextBtn').addEventListener('click', goNext);
  document.getElementById('backBtn').addEventListener('click', goBack);

  document.getElementById('partsCost').addEventListener('input', (e) => {
    formData.parts_cost = parseFloat(e.target.value) || 0;
  });
  document.getElementById('labourCost').addEventListener('input', (e) => {
    formData.labour_cost = parseFloat(e.target.value) || 0;
    updateLiveTotal();
  });

  document.getElementById('photoInput').addEventListener('change', (e) => {
    if (e.target.files.length) uploadPhotos(e.target);
  });

  document.getElementById('reviewContent').addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit-step]');
    if (!editBtn) return;
    e.preventDefault();
    goToStep(parseInt(editBtn.dataset.editStep, 10));
  });

  document.getElementById('submitBtn').addEventListener('click', async () => {
    try {
      await fetchJSON(`/api/service-forms/${draftId}/submit`, { method: 'POST' });
      localStorage.removeItem(DRAFT_KEY);
      window.location.href = `/service-detail?id=${draftId}`;
    } catch (err) {
      document.getElementById('wizardError').innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
  });

  document.getElementById('deleteDraftBtn').addEventListener('click', async () => {
    if (!draftId) return;
    if (!confirm(`Delete this draft for "${formData.customer_name || 'this customer'}"? This cannot be undone.`)) return;
    try {
      await fetchJSON(`/api/service-forms/${draftId}`, { method: 'DELETE' });
      localStorage.removeItem(DRAFT_KEY);
      window.location.href = '/records';
    } catch (err) {
      document.getElementById('wizardError').innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
  });

  initDraft();
});
