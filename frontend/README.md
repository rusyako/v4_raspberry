# Frontend Build and Deploy

This frontend is a static multi-page app (no React runtime).

## Project structure

- `src/pages` - HTML source files
- `src/assets` - CSS, JS and image assets
- `dist` - generated build output used by backend runtime

## Build locally

From `frontend` folder:

```bash
npm install
npm run build
```

The command generates `frontend/dist`.

## Runtime behavior

Backend serves:

- pages from `frontend/dist/*.html`
- assets from `/assets/*` mapped to `frontend/dist/assets/*`

## Raspberry deploy flow (recommended)

1. Build frontend on a stronger machine.
2. Copy project with prepared `frontend/dist` to Raspberry.
3. Start container on Raspberry:

```bash
docker compose up --build -d
```

Node build is not required on Raspberry if `frontend/dist` is already included.
