-- Customers: kept intentionally loose (name/phone nullable) because a
-- service form's customer row is created up front when the wizard starts,
-- before the customer info step has actually been answered.
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  phone VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Atomically issues the next sequence number for a given year (see
-- src/utils/formId.js) - avoids two technicians ever getting the same ID.
CREATE TABLE sequence_counter (
  year INTEGER PRIMARY KEY,
  current_value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE service_forms (
  id VARCHAR(12) PRIMARY KEY,          -- e.g. "SF-2026-0001"
  year INTEGER NOT NULL,
  seq_number INTEGER NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers (id),

  -- draft: wizard in progress (auto-saved, not a real job yet)
  -- started: quotation written up, customer approved, repair in progress
  -- finished: repair complete, ready for / at pickup
  status VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'started', 'finished')),

  -- Most fields below are nullable because the wizard fills them in one
  -- step at a time; "required" is enforced in application code only when
  -- submitting a draft to 'started' (see POST /api/service-forms/:id/submit).
  service_type VARCHAR(20) CHECK (service_type IN ('new', 'rma', 'repeat')),
  brand VARCHAR(100),
  model VARCHAR(100),
  serial_number VARCHAR(100),
  liquid_damaged BOOLEAN,
  accessories JSONB NOT NULL DEFAULT '[]',
  accessories_other TEXT,

  reported_issues JSONB NOT NULL DEFAULT '[]',
  issue_notes TEXT,

  diagnosis_notes TEXT,
  parts_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  labour_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  parts_breakdown TEXT,

  wizard_step INTEGER NOT NULL DEFAULT 1,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (year, seq_number)
);
CREATE INDEX idx_service_forms_customer ON service_forms (customer_id);
CREATE INDEX idx_service_forms_status ON service_forms (status);

CREATE TABLE service_photos (
  id SERIAL PRIMARY KEY,
  form_id VARCHAR(12) NOT NULL REFERENCES service_forms (id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_service_photos_form ON service_photos (form_id);
