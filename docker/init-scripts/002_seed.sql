-- Obviously-fake demo data for local development only.
INSERT INTO customers (name, phone) VALUES
  ('Demo Customer One', '0400000001'),
  ('Demo Customer Two', '0400000002');

INSERT INTO sequence_counter (year, current_value) VALUES (EXTRACT(YEAR FROM now())::int, 2);

INSERT INTO service_forms (
  id, year, seq_number, customer_id, status, service_type, brand, model, serial_number,
  liquid_damaged, accessories, reported_issues, issue_notes, diagnosis_notes,
  parts_cost, labour_cost, total_cost, parts_breakdown, wizard_step
) VALUES (
  'SF-' || EXTRACT(YEAR FROM now())::int || '-0001', EXTRACT(YEAR FROM now())::int, 1, 1,
  'finished', 'new', 'Dell', 'XPS 15', 'DEMO-SERIAL-001',
  false, '["charger"]', '["no_display"]', 'Screen stays black on power on.',
  'Faulty display cable, replaced.', 45.00, 60.00, 105.00, 'Display cable x1 - $45', 12
), (
  'SF-' || EXTRACT(YEAR FROM now())::int || '-0002', EXTRACT(YEAR FROM now())::int, 2, 2,
  'started', 'rma', 'Apple', 'MacBook Air M2', 'DEMO-SERIAL-002',
  false, '[]', '["no_charging"]', 'Not charging at all, tried multiple chargers.',
  'Charging port has visible corrosion, needs board-level repair.', 120.00, 80.00, 200.00,
  'Charging port repair - $120', 12
);
