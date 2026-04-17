# Smart Box

Smart Box - kiosk-система для выдачи и возврата MacBook по RFID-карте.

## Что внутри

- `backend/` - Flask API, SQLite, интеграция с Arduino/Serial
- `frontend/` - Vite + React frontend
- `manage_db.py` - CLI для управления БД (пользователи/устройства)

Маршруты:

- `/` - пользовательский kiosk flow
- `/admin` - админ-страница

Docker-образ сам собирает frontend внутри контейнера. Отдельно готовить `frontend/dist` перед запуском не нужно.

## 1) Установка Docker на Ubuntu

Рекомендуется официальный репозиторий Docker Engine.

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Проверка:

```bash
docker --version
docker compose version
```

Чтобы запускать Docker без `sudo`:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

## 2) Установка Git и получение проекта

```bash
sudo apt update
sudo apt install -y git
git clone https://github.com/rusyako/v4_raspberry.git
cd v4_raspberry
```

Обновить проект позже:

```bash
cd ~/v4_raspberry
git pull
```

## 3) Настройка окружения

```bash
cp .env.example .env
nano .env
```

Минимально проверь:

- `FLASK_SECRET_KEY` (замени `change-me`)
- `SERIAL_PORT` (обычно `/dev/ttyACM0`)
- `START_ARDUINO_THREAD=true`
- `ENABLE_LOCAL_DEBUG_SDK=false` (для прод/киоска)

## 4) Сборка и запуск

Из корня проекта:

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f smart-box
```

Открыть:

- `http://<IP_твоего_хоста>:5000/`
- `http://<IP_твоего_хоста>:5000/admin`

Если запускаешь прямо на Raspberry Pi и открываешь локально на нём же, можно использовать:

- `http://localhost:5000/`
- `http://localhost:5000/admin`

## 5) Частые команды Docker

```bash
docker compose up -d
docker compose down
docker compose restart
docker compose ps
docker compose logs -f smart-box
docker compose logs --tail=200 smart-box
```

После `git pull` обычно достаточно:

```bash
docker compose down
docker compose up --build -d
```

## 6) Инициализация БД и тестовые данные

```bash
docker exec smart-box python manage_db.py init-db
docker exec smart-box python manage_db.py add-user --uid "F015ACDA" --name "Ruslan" --email "ruslan@company.kz" --admin
docker exec smart-box python manage_db.py add-user --uid "E02560DB" --name "Operator"
docker exec smart-box python manage_db.py add-laptop --name "MB-001" --barcode "BC-001" --device-number "2000000188706" --status available
docker exec smart-box python manage_db.py list-users
docker exec smart-box python manage_db.py list-laptops
docker exec smart-box python manage_db.py list-borrow-records
```

Логика UID:

- в админке можно ввести UID в `HEX` или `Decimal`
- backend автоматически вычисляет вторую форму
- в базе сохраняются оба поля: `uid_hex` и `uid_dec`
- основной `uid` хранится в HEX-виде
- на фронте у пользователя отображаются обе формы
- при скане карта ищется по `uid`, `uid_hex` и `uid_dec`

Пример:

- `3668710896` -> `F015ACDA`
- `F015ACDA` -> `3668710896`

## 6.1) Логика доступа в админку

- Переход по ссылке `/admin` открывает админку сразу, без PIN.

## 7) Проверка Arduino

`docker-compose.yml` уже пробрасывает serial-устройство внутрь контейнера через переменную `SERIAL_PORT`.
Если у тебя считыватель висит не на `/dev/ttyACM0`, измени это значение в `.env` перед запуском.

Проверить, видит ли Linux устройство:

```bash
ls /dev/ttyACM* /dev/ttyUSB*
dmesg | grep -i -E "tty|usb|arduino|cdc"
```

Проверить, что в логах backend приходят данные:

```bash
docker compose logs -f smart-box
```

Ожидаемый формат скана:

```text
Received: CARDUID:F015ACDA
Received UID: F015ACDA
```

Если Docker пишет `no such file or directory` для `/dev/ttyACM0`, значит:

- устройство не появилось на хосте
- или в `.env` указан неверный `SERIAL_PORT`
- или контейнер был поднят раньше, чем устройство стало доступно

После исправления перезапусти контейнер:

```bash
docker compose down
docker compose up --build -d
```

## 8) Автозапуск после reboot (опционально)

В `docker-compose.yml` уже стоит `restart: unless-stopped`, обычно этого достаточно.

Также убедись, что сервис Docker включен:

```bash
sudo systemctl enable docker
sudo systemctl start docker
```

## 9) Frontend dev (опционально)

Если нужно локально разрабатывать фронт без Docker:

```bash
cd frontend
npm install
npm run dev
```

Production-сборка фронта вручную:

```bash
cd frontend
npm run build
```

Для Docker это не обязательно: production frontend собирается внутри `docker build` автоматически.
