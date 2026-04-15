# Frontend Build and Deploy

This frontend is a Vite + React app with two runtime pages:

- `/` - kiosk app (home + action + checkout + return flow in one page)
- `/admin` - admin panel

## Project structure

- `index.html` - kiosk entry page
- `admin.html` - admin entry page
- `src/react/pages` - React page components
- `src/react/shared` - shared helpers/components
- `src/react/styles` - modular CSS styles
- `dist` - production build output used by backend runtime

## Build locally

From `frontend` folder:

```bash
npm install
npm run build
```

The command generates `frontend/dist`.

## Runtime behavior

Backend serves:

- `frontend/dist/index.html` for `/`
- `frontend/dist/admin.html` for `/admin`
- built assets from `/assets/*` mapped to `frontend/dist/assets/*`

## Raspberry deploy flow (recommended)

1. Build frontend on a stronger machine.
2. Copy project with prepared `frontend/dist` to Raspberry.
3. Start container on Raspberry:

```bash
docker compose up --build -d
```

Node build is not required on Raspberry if `frontend/dist` is already included.
