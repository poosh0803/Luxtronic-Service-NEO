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

As built — the authoritative version is `docker/init-scripts/001_schema.sql`.

```sql
-- name/phone nullable: the customer row is created when the wizard starts,
-- before step 1 has been answered. "Required" is enforced on submit instead.
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  phone VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE service_forms (
  id VARCHAR(12) PRIMARY KEY,              -- e.g. "SF-2026-0001"
  year INTEGER NOT NULL,
  seq_number INTEGER NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers (id),
  status VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'started', 'finished')),

  -- device (nullable while status = 'draft'; validated by POST /:id/submit)
  service_type VARCHAR(20) CHECK (service_type IN ('new', 'rma', 'repeat')),
  brand VARCHAR(100),
  model VARCHAR(100),
  serial_number VARCHAR(100),
  liquid_damaged BOOLEAN,
  accessories JSONB NOT NULL DEFAULT '[]',  -- e.g. ["charger", "usb_drive"]
  accessories_other TEXT,

  -- reported issue (customer-facing symptoms)
  reported_issues JSONB NOT NULL DEFAULT '[]', -- e.g. ["no_display", "no_charging"]
  issue_notes TEXT,

  -- technician diagnosis + quotation (written up in the same sitting)
  diagnosis_notes TEXT,
  inspection_tests JSONB NOT NULL DEFAULT '[]',  -- e.g. ["memtest", "hdd_test"]; added by 003_add_inspection_tests.sql
  parts_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  labour_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_cost DECIMAL(10,2) NOT NULL DEFAULT 0,  -- parts_cost + labour_cost, kept as a real column (not purely computed) so a printed quote never silently reflows if cost logic changes later
  parts_breakdown TEXT,                          -- free-text line items, same as old system

  wizard_step INTEGER NOT NULL DEFAULT 1,        -- resume point while status = 'draft'

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
- Keeps the old system's year+sequence ID scheme. Instead of a stored procedure, the next number
  is issued by a single atomic upsert on `sequence_counter` (`src/utils/formId.js`). Deleted
  records leave gaps in the numbering — IDs are never reused.
- Known limit: `VARCHAR(12)` fits up to `SF-YYYY-9999`; the 10,000th form in one year would fail
  to insert. Not a realistic concern at current volume, but widen the column if that changes.

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
8. **Tests run** (Memtest / HDD / Power / Display — from the paper form's office-use section) +
   **Diagnosis** — what the technician found, in their own words
9. **Parts cost** + **parts breakdown** (free text line items)
10. **Labour cost** — total auto-calculated and shown live
11. **Photos** (optional, multiple)
12. **Review** — every answer listed by section, each with an "Edit" link back to that step
13. Submit → status flips `draft` → `started` and the page redirects to the **service-detail**
    page, which has the **Print Service Form** button top-right (same layout as Rental-NEO's
    `rental-detail`)

Back/Next navigation on every step; a progress indicator (e.g. "Step 4 of 12") and a
**Delete Draft** button next to it, so an abandoned draft can be removed from inside the wizard.
Drafts are only reachable through the wizard (Records → Drafts filter, or Dashboard → Continue).

## Other pages

- **Records** (`/records`): list of service forms, filter by status (All excl. drafts / Drafts /
  In Progress / Finished), search by customer name/phone/form ID/model, date range, paginated.
  Clicking a draft opens the wizard; anything else opens service-detail.
- **Service detail** (`/service-detail?id=…`): read-only view by default; **Edit** reveals a
  single-page edit form (customer, device, notes, cost) with Save/Cancel; **Delete** next to it.
  **Print Service Form** top-right, photo gallery with **Add Photo(s)**, and a Status panel with
  **Mark as Finished** / **Reopen Job**.
- **Print / Quotation view** (`/print-form?id=…`): `@media print` page, filled from
  `GET /api/service-forms/:id` + `GET /api/config`. Sized to fit one A4 page for normal-length
  notes. The Terms & Disclaimer bullets come from `SERVICE_FORM_DISCLAIMER` in `.env`
  (pipe-separated; a point wrapped in `[brackets]` renders bold without a bullet), followed by the
  paper form's "I UNDERSTAND AND AGREE … authorise Luxtronic Pty Ltd to proceed" statement above the
  signatures. The terms are the shop's paper-form wording, grammar-tidied (2026-09-26).
- **Paper-form items deliberately not carried over**: payment method (Cash/Card/Direct Debit — done
  in Odoo) and the pickup date/signature line. A separate "Note" box is covered by issue notes and
  diagnosis.
- **Analytics dashboard**: same shape as the old one (`analytics.js`) — total services (30-day, %
  change), average daily services, most popular brand/device, monthly trend, popular service days,
  activity heatmap, brand/model distribution — recomputed against the new schema. Drop anything
  that specifically depended on the old 4-state status; a "started vs finished" split can replace
  a "pending/cancelled" breakdown if useful, but not required for v1.

## Tech stack & conventions (per the shared Luxtronic guideline docs)

- Node.js (ESM) + Express, raw `pg` (no ORM) — `LUXTRONIC-API-CONVENTIONS.md`.
- Plain HTML/CSS/JS frontend, no build step, no framework. The wizard is one page
  (`views/service-form.html`) with JS-driven steps (`public/js/serviceForm.js`).
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

## Deployment

Deployed 2026-09-16.

| Setting | Local dev | Production |
|---|---|---|
| App | `localhost:8004` | `192.168.68.255:8004` (LAN server, `/root/Luxtronic-Service-NEO`) |
| Postgres | Docker, `127.0.0.1:5435` | `192.168.68.222:5436` (separate DB host) |
| Postgres DB name | `luxtronic_service_neo_db` | same |
| pm2 process | — | `luxtronic-service-neo` (in pm2 dump; `pm2-root` systemd unit enabled, so it survives reboot) |
| Docker Compose project | `luxtronic-service-neo` | not used — DB is external |

**DB schema on production**: Docker only runs `init-scripts/` on a brand-new volume, and
production isn't Docker-managed, so each schema file is run by hand, in order. **Never run
`002_seed.sql` there** — it inserts fake demo customers.

| File | Production |
|---|---|
| `001_schema.sql` | applied 2026-09-16 |
| `003_add_inspection_tests.sql` | applied 2026-09-26 |

```bash
psql -h 192.168.68.222 -p 5436 -U luxtronic_user -d luxtronic_service_neo_db \
  -v ON_ERROR_STOP=1 -f docker/init-scripts/003_add_inspection_tests.sql
```

Migrations after go-live are forward-only (`ADD COLUMN IF NOT EXISTS`, safe to re-run); don't edit
`001_schema.sql` in place. An existing local Docker DB also needs them run by hand
(`docker exec -i luxtronic_service_neo_db psql -U luxtronic_user -d luxtronic_service_neo_db < file`).

**Updates**: on the LAN server, `git pull && npm ci --omit=dev && pm2 restart luxtronic-service-neo`.

**Local `.env` must point at the local Docker DB** (`DB_HOST=127.0.0.1`, `DB_PORT=5435`), never
at `192.168.68.222`. If it points at production, local testing writes to and deletes from live
data — this happened once on 2026-09-17 (only empty drafts were affected).

## Pre-production checklist

Verified 2026-09-26. Items 1–5 should be done before staff rely on this for real jobs.

**Must do**

1. ~~**Deploy the real terms.**~~ Done 2026-09-26 — production `.env` now has the shop's
   paper-form terms (previous `.env` kept as `.env.bak-20260926` on the server). Note: the print
   fits one A4 page with only ~7% spare height — an unusually long diagnosis can push the
   signatures onto page 2.
2. ~~**Harden photo uploads.**~~ Fixed 2026-09-26 (path escape via a crafted `:id`, any file
   type accepted and served back as HTML, no size limit). Now: `:id`/`:photoId` validated with
   `router.param` before any handler runs; the form must exist before files are accepted; only
   JPEG/PNG/WebP/GIF, max 15 MB each and 10 per upload; the saved extension comes from the MIME
   type, never the client's filename; a rejected batch leaves nothing on disk; `/uploads` is served
   with `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`. Both pages now
   show the rejection message. Verified against each original attack.
3. **Set up backups.** No `pg_dump` job exists on the LAN server, and uploaded photos live only on
   the LAN server's disk (`/root/Luxtronic-Service-NEO/uploads`). Per the privacy guidelines, a
   printed customer-approved quotation may be the only record of that approval. Schedule a daily
   `pg_dump` of `luxtronic_service_neo_db` plus a copy of `uploads/`, to a machine other than
   `192.168.68.222` / `.255`.
4. **Point local `.env` back at the local Docker DB** (see Deployment above).
5. **Stop empty drafts from piling up.** Every visit to *New Service* without a stored draft
   inserts a customer + service-form row and uses up an ID number, even if nothing is typed.
   Production already had three such rows. On a shared tablet, *New Service* also resumes whichever
   draft that device opened last, which may be a different customer's. Fix: only create the draft
   on the first successful *Next* from step 1, and make the nav's *New Service* always start fresh
   (drafts stay resumable from Records/Dashboard).

**Should do**

6. **Guard status transitions.** `POST /:id/submit` on a finished job silently reverts it to
   `started` (confirmed); `POST /:id/finish` works on a draft and skips submit validation. Add
   `AND status = '<expected>'` to each `UPDATE` and return 409 otherwise.
7. **Detail-page edit gaps.** The Edit form can't change the reported-issue or accessory
   checklists (only the "other" free text; the tests checklist *is* editable), and *Liquid Damaged*
   shows "No" when it was never answered.
8. **Surface errors.** Mark as Finished, Reopen, photo delete, and photo upload (wizard and detail
   page) have no error handling — a failure does nothing visible.
9. **Remove `app.use(cors())`.** The pages are same-origin, so it isn't needed; with it, any
   website opened on a shop PC can read and write this API (no auth) from that browser.
10. **Change the production DB password.** Production uses `luxtronic_password`, the same value
    committed in `.env.example`.
11. ~~**Ship the pending work.**~~ Done 2026-09-26 — Delete Draft, tests checklist,
    acknowledgement statement and real terms are live (commit `6298300`).

**Housekeeping**

12. Add this service to the `lan-portal-deploy` skill's service table and to the port registry in
    `LUXTRONIC-INFRA-GUIDELINES.md` (app `8004`; DB `192.168.68.222:5436`).
13. The LAN server runs Node 18, which is end-of-life; `npm ci` warns about one dependency wanting
    Node 20+. Works today, but plan an upgrade. `npm audit` reports 2 moderate issues.

**Verified OK**: all SQL is parameterized (the dynamic `PATCH` columns come from a fixed
whitelist); multi-table writes use transactions; user text is escaped before `innerHTML` (or set via
`textContent` on the print page); production schema matches `001_schema.sql`; the service is online
with 0 restarts and is in the pm2 dump.

## Open questions

1. **Reported-issue and accessory checklist options** — carried over verbatim from the old form;
   confirm with staff after some real use.
2. **`service_type` labels** — New / RMA / Repeat Service; confirm these still cover it.
