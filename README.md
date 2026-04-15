# Smart Box

Smart Box is a kiosk application for issuing and returning MacBooks.

## Architecture

- `backend/` - Flask API, SQLite logic, Arduino/serial integration
- `frontend/src/` - frontend source files (HTML, CSS, JS, images)
- `frontend/dist/` - built static frontend served by backend
- `main.py` - runtime entrypoint
- `manage_db.py` - SQLite admin CLI (users, devices, seed)

## Runtime flow

1. Frontend is built into `frontend/dist`.
2. Flask serves pages from `frontend/dist`.
3. Flask serves assets from `/assets/*`.
4. SQLite database is stored in `/app/data` (Docker volume).

## Local development

### 1) Build frontend

```bash
cd frontend
npm install
npm run build
```

### 2) Start container

From project root:

```bash
docker compose up --build -d
```

Open:

```text
http://localhost:5000
```

Admin page:

```text
http://localhost:5000/admin
```

## Environment variables

Copy `.env.example` to `.env` and adjust values for your environment.

Important vars:

- `FLASK_HOST`, `FLASK_PORT`, `FLASK_DEBUG`
- `DATA_DIR`, `SQLITE_PATH`, `SEED_PATH`
- `LOG_DIR`, `LOG_FILE`, `LOG_LEVEL`, `LOG_BACKUP_DAYS`
- `ADMIN_PIN`, `ADMIN_SESSION_TIMEOUT_SECONDS`
- `ENABLE_LOCAL_DEBUG_SDK`
- `SERIAL_PORT`, `SERIAL_BAUDRATE`, `SERIAL_TIMEOUT`
- `START_ARDUINO_THREAD`, `ENABLE_WEBVIEW`

## Logs

- Current log file: `logs/smart-box.log`
- Rotation: daily at midnight
- Retention: controlled by `LOG_BACKUP_DAYS` (default 14)
- In Docker, logs are persisted in volume `smart-box-logs`

## Database management

Examples:

```bash
docker exec "smart-box" python manage_db.py init-db
docker exec "smart-box" python manage_db.py seed-db
docker exec "smart-box" python manage_db.py add-user --uid "UID-100" --name "Operator"
docker exec "smart-box" python manage_db.py add-user --uid "ADMIN-UID-1" --name "Admin Card" --admin
docker exec "smart-box" python manage_db.py add-laptop --name "MB-001" --status available
docker exec "smart-box" python manage_db.py list-users
docker exec "smart-box" python manage_db.py list-laptops
```

## Admin access

- Manual access: `http://localhost:5000/admin`
- PIN is controlled by `ADMIN_PIN`
- Session timeout is controlled by `ADMIN_SESSION_TIMEOUT_SECONDS`
- If an admin UID is scanned through SKD, Smart Box automatically redirects to the admin page

## Local SKD debug

When `ENABLE_LOCAL_DEBUG_SDK=true`, you can simulate a UID scan from browser console on localhost:

```js
await smartBoxDebug.scanUid('UID-100')
```

If the UID belongs to a regular user, Smart Box opens the booking flow.
If the UID belongs to an admin user, Smart Box opens `/admin`.

## Raspberry deploy (recommended)

1. Build frontend on a stronger machine (`npm run build` in `frontend`).
2. Copy project with prepared `frontend/dist` to Raspberry.
3. Run:

```bash
docker compose up --build -d
```

This avoids running Node build on Raspberry.
