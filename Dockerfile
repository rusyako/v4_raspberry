FROM node:20-bookworm-slim AS frontend-build

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/index.html ./index.html
COPY frontend/vite.config.js ./vite.config.js
COPY frontend/src ./src

RUN npm run build


FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV ENABLE_WEBVIEW=false
ENV FLASK_HOST=0.0.0.0
ENV FLASK_PORT=5000
ENV DATA_DIR=/app/data
ENV SQLITE_PATH=/app/data/smart-box.db
ENV FRONTEND_DIST_DIR=/app/frontend/dist

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY main.py ./main.py
COPY manage_db.py ./manage_db.py
COPY seed_data.json ./seed_data.json
COPY --from=frontend-build /frontend/dist ./frontend/dist

RUN mkdir -p /app/data

EXPOSE 5000

CMD ["python", "main.py"]
