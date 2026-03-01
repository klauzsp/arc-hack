# Frontend deployment (Railway / Docker)

## Build and run locally

```bash
cd frontend
docker build -t arc-frontend .
docker run -p 3000:3000 arc-frontend
```

## Deploy to Railway

1. **New service** → Deploy from GitHub (or push image). Use **Dockerfile** with root set to the **frontend** folder (e.g. `frontend/Dockerfile` with build context `frontend/`).

2. **Variables** (optional; defaults are in the Dockerfile):
   - `NEXT_PUBLIC_API_URL` – backend URL (default: `https://backend-production-e877.up.railway.app`)
   - `NEXT_PUBLIC_APP_URL` – public URL of this frontend (e.g. `https://your-frontend.up.railway.app`) so redirects work
   - Other `NEXT_PUBLIC_*` as needed (WalletConnect, Circle, etc.)

   Set these in the **Variables** tab. For Docker builds, Railway exposes them as build args so they are inlined at build time.

3. **CORS**: After the frontend is live, add its URL to the **backend** service:
   - Backend → Variables → `BACKEND_CORS_ORIGIN` = `https://your-frontend.up.railway.app` (or comma-separated list including it).

4. **Health**: Railway uses the exposed port; no custom health path needed. The app listens on `PORT` and `0.0.0.0`.

5. **Start command**: The image uses `ENTRYPOINT ["node", "server.js"]` so the app always runs the Next server. If you see "The executable pnpm could not be found", clear any custom **Start Command** in Railway (Settings → Service → Start Command) so Railway uses the image default instead of inferring `pnpm start`.
