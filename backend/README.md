# Arc Payroll Backend

Node/TypeScript API for the Dayforce-style payroll frontend and the Arc payroll contract flow.

## What is implemented

- Wallet challenge/verify auth with session tokens
- Recipient CRUD, schedules, holidays, time tracking, earnings, pay runs, treasury, and policies
- Mock-by-default chain execution service with live contract env hooks for `Core`, `PayRun`, and `Rebalance`
- SQLite persistence in `backend/data/payroll.sqlite` by default
- Background job entrypoint for auto-rebalance and payday policy evaluation
- Arc Testnet deployment record in `contracts/deployments/arc-testnet.json`

## Run

```bash
pnpm install
pnpm backend:dev
```

The server listens on `http://127.0.0.1:3001` by default.

## Verify

```bash
pnpm backend:build
pnpm backend:test
pnpm forge:test
```

## Main routes

- `POST /auth/challenge`
- `POST /auth/verify`
- `GET /dashboard`
- `GET/POST/PATCH/DELETE /recipients`
- `GET/POST/PATCH /schedules`
- `GET/POST/PATCH /holidays`
- `GET /me`
- `GET /me/earnings`
- `GET /me/time-entries`
- `POST /me/time-entries/clock-in`
- `POST /me/time-entries/clock-out`
- `GET /pay-runs`
- `POST /pay-runs`
- `POST /pay-runs/:id/approve`
- `POST /pay-runs/:id/execute`
- `GET /treasury/balances`
- `POST /treasury/rebalance`
- `GET/POST /treasury/auto-policy`
- `GET/POST/PATCH /policies`
- `POST /jobs/run`
