# ERP + CRM Backend — Fundsroom Infotech Assignment

A REST API backend for a mini internal ERP/CRM tool used by a wholesale/distribution company's sales, warehouse, and accounts teams. Built as a take-home technical assignment.

**Live API:** https://fundsroom-erp-crm-backend-production.up.railway.app
**Frontend repo:** https://github.com/CodesWithManthan/fundsroom-erp-crm-frontend
**Live app:** https://fundsroom-erp-crm-frontend.vercel.app

## Tech Stack

- Node.js + TypeScript + Express
- PostgreSQL (hosted on Render)
- JWT authentication + bcrypt password hashing
- Deployed on Railway

## Architecture Overview

Four modules, kept as a flat, boring folder structure on purpose (no service/repository layers) — appropriate for this project's size, and avoids over-engineering under a tight deadline.

- **Auth** — login endpoint issues a JWT containing `{ userId, role }`. `authMiddleware` verifies the token on protected routes; `requireRole` middleware gates specific routes by role.
- **Customers** — CRUD + a separate `customer_notes` table for follow-up history (kept as an append-only log rather than a single overwritable field, since follow-ups happen over time).
- **Products** — CRUD + a `stock_movements` table that logs every stock change (IN/OUT, reason, who did it). `products.current_stock` is a synced cached counter for fast reads; `stock_movements` is the full audit trail.
- **Challans** — the centerpiece module. Create as Draft (stock untouched), Confirm (stock reduced transactionally with row-level locking, insufficient-stock rejected with a 409, all-or-nothing), Cancel. Line items store a snapshot of product name/SKU/price at time of sale, not just a live foreign key — so a later price change doesn't retroactively alter historical challans.

### Why role-based access is split the way it is

- Customers: create/edit → admin, sales (sales people manage the relationship)
- Products: create/edit/stock adjust → admin, warehouse (warehouse owns physical stock)
- Challans: create/confirm/cancel → admin, sales (sales owns the sale)
- All `GET` routes are open to any authenticated role — everyone can view, only the relevant role can act.

This mirrors how these roles actually work in a real wholesale business, not an arbitrary permission scheme.

## Database Schema

7 tables: `users`, `customers`, `customer_notes`, `products`, `stock_movements`, `challans`, `challan_items`. CHECK constraints are used instead of Postgres ENUM types (easier to extend later without `ALTER TYPE`). Full schema SQL is in `/schema.sql` (or paste your DBeaver-exported schema file here if you have one — otherwise remove this line).

## Environment Variables

Create a `.env` file in the project root:
"DATABASE_URL=postgresql://username:password@host:5432/dbname
JWT_SECRET=your_long_random_secret_string
PORT=5000"

In production (Railway), `NODE_ENV=production` is also set — this activates SSL on the database connection (`src/config/db.ts`), which Render's managed Postgres requires for external connections.

## Running Locally

```bash
git clone https://github.com/CodesWithManthan/fundsroom-erp-crm-backend.git
cd fundsroom-erp-crm-backend
npm install
```

Create your `.env` file as shown above, pointing `DATABASE_URL` at your own local or hosted Postgres instance. Run the schema SQL against that database to create the 7 tables, then seed the 4 test users (see Test Credentials below for the accounts you'll need — seed script/inserts based on `src/modules/auth/auth.controller.ts`'s bcrypt hashing).

```bash
npm run dev
```

Visit `http://localhost:5000/health` — should return `{"status":"ok"}`.

## Deployment

- **Database:** Render PostgreSQL (free tier)
- **Backend:** Railway (free tier, deployed from this repo's `main` branch)
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Environment variables set in Railway's dashboard: `DATABASE_URL` (Render Postgres external connection string), `JWT_SECRET`, `NODE_ENV=production`

**Note on why Railway instead of Render for the backend service itself:** Render's free web-service tier occasionally prompts new accounts for payment card verification before allowing deployment, despite the free tier not requiring one. Railway offers an equivalent no-card free trial credit and was used as a drop-in alternative — the database stayed on Render since that part worked without issue.

## Test Credentials (all 4 roles)

| Role      | Email              | Password    |
| --------- | ------------------ | ----------- |
| Admin     | admin@test.com     | password123 |
| Sales     | sales@test.com     | password123 |
| Warehouse | warehouse@test.com | password123 |
| Accounts  | accounts@test.com  | password123 |

These are intentionally simple, seeded test credentials for reviewer convenience. In a production system, these would be strong, unique per-user, and never documented in a public README.

## API Documentation

A Postman collection covering all endpoints (with example requests/responses) is included in the `/postman` folder of this repo — import it into Postman and set the `token` environment variable after logging in via the Auth folder's login request.

## Known Limitations

- Free-tier hosting means the backend may take 20-30 seconds to respond on the first request after a period of inactivity (cold start).
- Free-tier Postgres (Render) has a storage cap and may expire after a fixed window — if the live demo link stops responding after some time, this is why.
- Pagination is basic (limit/offset) and only applied where trivial; not exhaustive across every list endpoint.
- No automated test suite — testing was done manually via Postman during development, covering the main flows and key edge cases (insufficient stock, double-confirm, missing token, invalid role).
- No refresh tokens / password reset / signup UI — explicitly out of scope per the assignment brief; users are seeded directly into the database.
