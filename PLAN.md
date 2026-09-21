# Luxtronic Service NEO — Project Plan

A ground-up rebuild of the digital service form, replacing `Luxtronic-Digital-ServiceForm`'s
one-long-page intake with a step-by-step wizard (1–2 questions per page) that matches how the
job actually gets written up in the shop.

## Why this exists

The old system's intake page (`service-form.html`) is a single scroll of ~25 fields across four
card sections. It works, but it's not fast to fill out on a tablet mid-repair. This rebuild keeps
the same underlying data (customer, device, issue, diagnosis, cost) but delivers it as a guided
flow, and simplifies the job-status model to match actual shop workflow (no "pending/cancelled"
states that don't get used).

This is a **new, standalone project** — own repo, own Postgres database, own deployment — not a
new frontend bolted onto the old backend. The old app keeps running as-is; there is no data
migration.

## Real-world workflow this app needs to fit

1. Technician inspects the machine **first** (before touching this app) and works out the fix and
   the price.
2. Technician fills out the form **in one sitting**: customer details, device details, reported
   issue, diagnosis, parts + labour cost. Saving it sets status **`started`**.
3. The form is printed — it doubles as a **quotation + disclaimer**. The customer signs the
   printed copy (physical signature, pen and paper) to approve the job before work proceeds.
4. Technician does the repair. Occasionally reopens the record to add a part/cost that came up
   mid-job — the record stays editable at any time, no locking.
5. When the repair is done and the device is ready for pickup, technician marks it **`finished`**.
6. Actual invoicing/receipt happens separately in Odoo — **out of scope** for this app. This app's
   printed output is the quotation/disclaimer only, not a tax invoice.

## Scope

**In scope (v1):**
- Step-by-step intake wizard (see flow below), auto-saving as a draft per step so a closed tab /
  tablet reboot mid-fill doesn't lose progress.
- Final review/summary page before committing to `started` — lists every answer with a per-section
  "Edit" link back into the wizard.
- Search / records list (find by customer name, phone, form ID; filter by status and date range).
- A "Complete Job" action from a record's detail view to flip `started` → `finished` (no separate
  wizard needed for this — see Status model below).
- Photo upload attached to a record (device condition photos).
- Printable quotation + disclaimer page (browser print, no PDF pipeline — matches
  `LUXTRONIC-API-CONVENTIONS.md`'s printable-document pattern).
- Analytics dashboard (adapted from the old one — see Analytics section).

**Explicitly out of scope for v1** (per your answers — flag to revisit later if wanted):
- The clickable SVG damage-diagram — replaced by free-text damage notes + photos.
- Any staff login/auth — LAN-only, no-login, same trust model as every sibling app.
- Data migration from the old system.
- Invoicing/receipts — stays in Odoo.
- E-signature capture — the printed form is signed on paper.

## Status model

Three states (simpler than the old `pending/in progress/completed/cancelled`):

| Status | Meaning |
|---|---|
| `draft` | Wizard in progress, not yet reviewed/submitted. Auto-saved step by step. Not shown in normal search results (or shown in a separate "Drafts" filter) since it's not a real job yet. |
| `started` | Quotation written up, customer has approved, repair in progress. |
| `finished` | Repair complete, device ready for / already at pickup. |

No `cancelled` — per your note it essentially never happens; if it's ever needed later, add it as a
fourth `CHECK` value (cheap migration, per `LUXTRONIC-DATABASE-CONVENTIONS.md`'s "enum via CHECK"
convention).

Any record, in any status, stays editable — no read-only locking.

## Data model (Postgres, following `LUXTRONIC-DATABASE-CONVENTIONS.md`)

```sql
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE service_forms (
  id VARCHAR(12) PRIMARY KEY,              -- e.g. "SF-2026-0001", generated like the old system's year+sequence scheme
  year INTEGER NOT NULL,
  seq_number INTEGER NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers (id),
  status VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'started', 'finished')),

  -- device
  service_type VARCHAR(20) NOT NULL CHECK (service_type IN ('new', 'rma', 'repeat')),
  brand VARCHAR(100),
  model VARCHAR(100),
  serial_number VARCHAR(100),
  liquid_damaged BOOLEAN,
  accessories JSONB NOT NULL DEFAULT '[]',  -- e.g. ["charger", "usb_drive"]

  -- reported issue (customer-facing symptoms)
  reported_issues JSONB NOT NULL DEFAULT '[]', -- e.g. ["no_display", "no_charging"]
  issue_notes TEXT,

  -- technician diagnosis + quotation (written up in the same sitting)
  diagnosis_notes TEXT,
  parts_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  labour_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_cost DECIMAL(10,2) NOT NULL DEFAULT 0,  -- parts_cost + labour_cost, kept as a real column (not purely computed) so a printed quote never silently reflows if cost logic changes later
  parts_breakdown TEXT,                          -- free-text line items, same as old system

  wizard_step INTEGER NOT NULL DEFAULT 1,        -- resume point while status = 'draft'

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
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

CREATE TABLE sequence_counter (
  year INTEGER PRIMARY KEY,
  current_value INTEGER NOT NULL DEFAULT 0
);
```

Notes:
- `reported_issues` / `accessories` as JSONB checklists rather than a comma-joined string (the old
  system's `issue TEXT` / `accessory VARCHAR` approach) — per the DB conventions' JSONB-for-flexible-
  attributes guidance, and it's trivial to re-render as checkboxes when editing.
- `total_cost` is stored (not view-computed) since it's the number printed on a customer-signed
  quotation — it must not silently change if the cost formula changes later. Recomputed and
  re-saved server-side any time `parts_cost`/`labour_cost` change.
- Keeping the old system's year+sequence ID scheme (`sequence_counter` table + a small Postgres
  function/procedure to atomically issue the next number) for familiarity — copy the pattern from
  `Luxtronic-Digital-ServiceForm/docker/init-scripts/02-create-procedure.sql`.

## Wizard flow (intake, one sitting, `draft` → `started`)

Each step below is one page. Every step's answer auto-saves immediately (`PATCH` on the draft
record) so navigating away and back resumes at `wizard_step`.

1. **Customer name** + **phone number**
2. **Service type** — New / RMA / Repeat Service
3. **Brand** + **Model**
4. **Serial number** + **Liquid damaged?** (Y/N)
5. **Accessories received** — checklist (charger, USB/HDD, other + free text)
6. **Reported issue(s)** — checklist (no display, no charging, no post, blue screen, overheating,
   needs fan clean, network issue, OS issue, other) — same set as the old form
7. **Issue notes** — free text, optional elaboration
8. **Diagnosis** — what the technician found, in their own words
9. **Parts cost** + **parts breakdown** (free text line items)
10. **Labour cost** — total auto-calculated and shown live
11. **Photos** (optional, multiple)
12. **Review** — every answer listed by section, each with an "Edit" link back to that step
13. Submit → status flips `draft` → `started`, form ID is finalized/shown, offers **Print**
    (quotation + disclaimer) immediately for the customer to sign

Back/Next navigation on every step; a progress indicator (e.g. "Step 4 of 12") per the guidelines'
compact, no-nonsense UI style.

## Other pages

- **Records / Search** (`/search` or `/records`): list of service forms, filter by status
  (draft/started/finished), search by customer name/phone/form ID, date range. Table view per
  `LUXTRONIC-DESIGN-GUIDELINES.md` (no vertical borders, muted header row). Clicking a row opens
  the record detail.
- **Record detail**: read/edit view of all fields (not the step wizard — a normal single-page edit
  form, since editing an existing record doesn't need the guided one-question-at-a-time treatment),
  a **Print** button, a **Mark as Finished** / **Reopen** status toggle, photo gallery.
- **Print / Quotation view**: `views/print-form.html` styled for `@media print`, populated from
  `GET /api/service-forms/:id/print-data`. Shows shop details (from `/api/config`), customer +
  device info, diagnosis, itemized parts + labour + total, and a disclaimer/terms block with a
  signature line. Content of the disclaimer text is a placeholder to be filled in with the shop's
  actual wording — flag this for you to supply before go-live.
- **Analytics dashboard**: same shape as the old one (`analytics.js`) — total services (30-day, %
  change), average daily services, most popular brand/device, monthly trend, popular service days,
  activity heatmap, brand/model distribution — recomputed against the new schema. Drop anything
  that specifically depended on the old 4-state status; a "started vs finished" split can replace
  a "pending/cancelled" breakdown if useful, but not required for v1.

## Tech stack & conventions (per the shared Luxtronic guideline docs)

- Node.js (ESM) + Express, raw `pg` (no ORM) — `LUXTRONIC-API-CONVENTIONS.md`.
- Plain HTML/CSS/JS frontend, no build step, no framework. Each wizard step could be its own
  `views/*.html` page (simplest, matches convention) **or** one `views/service-form.html` with
  client-side step-switching driven by `public/js/serviceForm.js` — pick during implementation
  based on how auto-save-per-step feels; a single page keeps state simpler, separate pages keep
  each page's JS small. Leaning toward **one page, JS-driven steps**, since auto-save and back/next
  navigation are much simpler without full page reloads.
- Folder layout, response shape (`{success, ...}` / `{success:false, message}`), and transaction
  pattern for multi-table writes: exactly as in `LUXTRONIC-API-CONVENTIONS.md`.
- Design: amber/cream theme, two-row header+nav, dark-mode toggle, Font Awesome icons — copy
  `Luxtronic-Rental-NEO/public/css/style.css` + `common.js` as the starting point, per
  `LUXTRONIC-DESIGN-GUIDELINES.md`. Since this is used on a tablet at the counter, keep touch
  targets on wizard Next/Back buttons and checklist options generously sized (bigger than the old
  form's default Bootstrap checkboxes).
- No authentication — LAN-only trust model, consistent with `LUXTRONIC-PRIVACY-DATA-GUIDELINES.md`
  (valid only as long as this never gets exposed off the shop LAN).
- Photos live in `uploads/`, gitignored, never logged; customer PII never leaves the LAN Postgres
  DB — per the privacy guidelines.

## Deployment (per `LUXTRONIC-INFRA-GUIDELINES.md`)

Provisional values — confirm against the live port registry before deploying, since the doc notes
the registry can drift from what's actually running:

| Setting | Value |
|---|---|
| Project slug | `luxtronic-service-neo` |
| App `PORT` | `8004` (originally planned as `3003`; moved to the 8000+ range to match the deployed LAN server) |
| `DB_PORT` | `5435` (next free per the registry) |
| Postgres DB name | `luxtronic_service_neo_db` |
| Docker Compose project name | `luxtronic-service-neo` |
| pm2 process name | `luxtronic-service-neo` |

Add a row to `LUXTRONIC-INFRA-GUIDELINES.md`'s port table once these are actually assigned, and add
this project to the `lan-portal-deploy` skill's known service list before it can be deployed via
that flow.

## Open items for you to confirm before/while building

1. **Disclaimer/terms wording** for the printed quotation — needs the shop's actual legal text.
2. **Reported-issue and accessory checklist options** — carried over verbatim from the old form;
   flag now if any should be added/removed/renamed.
3. **`service_type` labels** — kept as New/RMA/Repeat Service; confirm these three still cover it.
4. Whether the **Records/Search page needs a "Drafts" view** at all, or whether an abandoned draft
   should just silently sit there until someone finishes or deletes it manually.

## Suggested build order

1. Scaffold repo (folder layout, `db.js`, `.env.example`, Docker Compose with correct project name
   per the infra doc), schema migration, `ecosystem.config.cjs`.
2. Shared shell: header/nav/dark-mode (copied from Rental-NEO), `common.js` (`fetchJSON`,
   `escapeHtml`, nav-highlight, dark mode).
3. Wizard: steps 1–12 with auto-save, then the review + submit step.
4. Record detail view (edit form, Mark-as-Finished, print button).
5. Print/quotation page.
6. Records/Search page.
7. Analytics dashboard.
8. Deploy to the LAN server, add to `lan-portal-deploy`'s service list and the infra port table.
