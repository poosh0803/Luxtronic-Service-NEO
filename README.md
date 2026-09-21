# Luxtronic Service NEO

A step-by-step digital service form for Luxtronic's computer service center — one or two questions per page instead of one long form. See [PLAN.md](PLAN.md) for the full design rationale and decisions behind this rebuild.

## Technologies Used

* **Frontend**: HTML, CSS, JavaScript (no build step, no framework)
* **Backend**: Node.js, Express.js
* **Database**: PostgreSQL

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start the database

```bash
cd docker
docker compose up -d
```

Connect with a DB GUI at `localhost:5435`, user/password `luxtronic_user` / `luxtronic_password`, database `luxtronic_service_neo_db`.

### 3. Configure environment

```bash
cp .env.example .env
```

The defaults in `.env.example` match the Docker setup above.

### 4. Start the app

```bash
npm run dev   # auto-restart
npm start     # production
```

The app runs at http://localhost:8004.

## Project Structure

```
Luxtronic-Service-NEO/
├── app.js                 # entry point
├── src/
│   ├── db.js               # the one pg.Pool
│   ├── routes/              # serviceForms.js, analytics.js
│   └── utils/                # formId.js (year+sequence ID generation)
├── views/                  # one .html file per page
├── public/
│   ├── css/                  # style.css (app), print.css (quotation)
│   ├── js/                    # one file per page + common.js
│   └── images/
├── docker/                 # docker-compose.yml + init-scripts
├── uploads/                 # uploaded service photos, gitignored
└── ecosystem.config.cjs
```

## Key concepts

- **Status model**: `draft` (wizard in progress, auto-saved) → `started` (quoted, customer approved, repair in progress) → `finished` (ready for pickup). No `cancelled`.
- **Wizard**: `/service-form` — one page, JS-driven steps, auto-saves each step to a draft record via `PATCH /api/service-forms/:id`.
- **Print**: `/print-form?id=<id>` is a quotation + disclaimer for the customer to sign (physical signature), not a tax invoice — receipts/invoicing stay in Odoo.
- **No authentication** — LAN-only trust model, same as every other Luxtronic in-house tool. Do not expose this off the shop's internal network without adding auth first.

## Before using this for a real customer

The disclaimer text on the printed quotation is a **placeholder** — set `SERVICE_FORM_DISCLAIMER` in `.env` to the shop's actual terms and conditions (pipe-separated bullet points, see `.env.example`) before relying on it for a real signed approval.
