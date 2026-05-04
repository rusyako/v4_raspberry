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

### Raspberry Pi OS / Debian (рабочий вариант)

Если система основана на `Debian`/`Raspberry Pi OS` и в `apt update` видно `trixie`, не используй Ubuntu-репозиторий Docker из блока выше. Он приведет к ошибке `404 Not Found` для `https://download.docker.com/linux/ubuntu trixie`.

Рабочая установка для Raspberry Pi OS:

```bash
sudo rm -f /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker.io docker-compose
sudo systemctl enable docker
sudo systemctl start docker
```

Проверка:

```bash
docker --version
docker-compose --version
```

Важно: если `docker-compose up` пишет `no configuration file provided: not found`, значит команда запущена не из корня проекта. Перейди в каталог репозитория:

```bash
cd ~/v4_raspberry
sudo docker-compose up --build -d
sudo docker-compose ps
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
- `RFID_READER_MODE=disabled`
- `RC522_RST_GPIO=25`
- `STATION_SIGNAL_MODE=gpio`
- `STATION_SIGNAL_GPIO=24`
- `DOCKER_PRIVILEGED=false`
- `ENABLE_LOCAL_DEBUG_SDK=false` (для прод/киоска)

## 3.1) Подключение RC522 к Raspberry Pi 4

Подключение для прямого чтения RFID без Arduino:

- `SDA (SS)` -> `GPIO8 / CE0`
- `SCK` -> `GPIO11 / SCLK`
- `MOSI` -> `GPIO10`
- `MISO` -> `GPIO9`
- `RST` -> `GPIO25`
- `GND` -> `GND`
- `3.3V` -> `3.3V`

Важно:

- не подключай `RC522` к `5V`, модуль должен питаться от `3.3V`
- на Raspberry Pi должен быть включён `SPI`
- библиотека `mfrc522` ставится только на Linux ARM (`Raspberry Pi`), на обычной локальной машине без GPIO это нормально не использовать

Включить `SPI` можно так:

```bash
sudo raspi-config
```

Дальше:

- `Interface Options`
- `SPI`
- `Enable`

После этого перезагрузи Raspberry Pi и проверь наличие устройства:

```bash
ls /dev/spidev0.0
```

## 4) Сборка и запуск backend в Docker

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

## 7) Проверка RC522 на Raspberry Pi

Надёжная схема для Raspberry Pi такая:

- `smart-box` backend работает в Docker
- `RC522` reader работает на хосте Raspberry Pi отдельным Python-скриптом
- host-скрипт отправляет UID в backend через `http://127.0.0.1:5000/hardware/rfid-scan`

Проверить, что `SPI` доступен на хосте:

```bash
ls /dev/spidev0.0
```

Установить зависимости для host reader script:

```bash
sudo apt update
sudo apt install -y python3-pip python3-dev gcc
python3 -m pip install --break-system-packages RPi.GPIO spidev mfrc522
```

Поднять backend-контейнер:

```bash
docker compose ps
docker compose logs -f smart-box
```

Запустить host reader script:

```bash
python3 scripts/rc522_reader.py
```

Или через helper script с автоподхватом `.env`:

```bash
chmod +x scripts/start-rc522-reader.sh
./scripts/start-rc522-reader.sh
```

При поднесении карты в консоли host reader script должен появиться UID примерно в таком виде:

```text
Card detected: F015ACDA
```

Если UID не читается, проверь:

- включён ли `SPI` через `raspi-config`
- правильно ли подключён `RST` к `GPIO25`
- что модуль питается от `3.3V`, а не от `5V`
- что backend уже запущен на `127.0.0.1:5000`
- что в `.env` не изменены `RC522_SPI_BUS=0` и `RC522_SPI_DEVICE=0` без причины

Если host reader script видит карту, но backend её не принимает, проверь ответ endpoint:

```bash
curl -X POST http://127.0.0.1:5000/hardware/rfid-scan -H 'Content-Type: application/json' -d '{"uid":"F015ACDA"}'
```

Если нужно оставить отдельный serial-контроллер для сигналов станции, включи в `.env`:

```env
ENABLE_SERIAL_CONTROLLER=true
STATION_SIGNAL_MODE=serial
SERIAL_DEVICE_MAPPING=/dev/ttyACM0:/dev/ttyACM0
SERIAL_PORT=/dev/ttyACM0
```

## 7.1) Управление станцией через GPIO Raspberry Pi

Маршруты `/send_arduino_signal` и `/send_arduino_signal_on` сохранены для совместимости с текущим фронтендом, но теперь они могут управлять станцией напрямую через GPIO Raspberry Pi.

Логика такая:

- `/send_arduino_signal` включает управляющий сигнал
- `/send_arduino_signal_on` выключает управляющий сигнал

Настройка в `.env`:

```env
STATION_SIGNAL_MODE=gpio
ENABLE_STATION_SIGNAL=true
STATION_SIGNAL_GPIO=24
STATION_SIGNAL_ACTIVE_LEVEL=low
```

Пояснение:

- `STATION_SIGNAL_GPIO` это GPIO-пин Raspberry Pi, который идёт на реле, замок или другой исполнительный вход
- `STATION_SIGNAL_ACTIVE_LEVEL=low` означает active-low логику, это частый вариант для релейных модулей
- если у тебя модуль включается уровнем `HIGH`, поставь `STATION_SIGNAL_ACTIVE_LEVEL=high`

Если управляющее реле или контроллер станции подключены уже не к `GPIO24`, просто поменяй номер в `.env`.

## 8) Автозапуск после reboot (опционально)

В `docker-compose.yml` уже стоит `restart: unless-stopped`, обычно этого достаточно.

Также убедись, что сервис Docker включен:

```bash
sudo systemctl enable docker
sudo systemctl start docker
```

Для текущего `docker-compose.yml` этого достаточно: у сервиса уже стоит `restart: unless-stopped`, поэтому контейнер `smart-box` поднимется после перезагрузки хоста автоматически.

## 8.1) Синхронизация пользователей из Active Directory

В проекте есть скрипт `scripts/Export_AD_users.py`, который:

- подключается к AD через `ldap3`
- читает пользователей из `AD_SEARCH_BASE`
- нормализует RFID из поля `homePhone`
- записывает или обновляет пользователей в SQLite-базе приложения

Файл настроек для AD хранится отдельно:

```bash
nano .env.ad
```

Пример содержимого:

```env
AD_SERVER=192.168.100.1
AD_USER=hta\sync
AD_PASSWORD=change-me
AD_SEARCH_BASE=OU=Users,OU=Corporate,DC=hta,DC=local
```

Важно: рабочий запуск внутри контейнера должен использовать путь `/app/scripts/Export_AD_users.py`. Если скопировать скрипт в `/app/Export_AD_users.py`, он будет искать `.env.ad` по неправильному пути.

Подготовка и ручной запуск импорта:

```bash
sudo docker exec smart-box mkdir -p /app/scripts
sudo docker cp scripts/Export_AD_users.py smart-box:/app/scripts/Export_AD_users.py
sudo docker cp .env.ad smart-box:/app/.env.ad
sudo docker exec smart-box python /app/scripts/Export_AD_users.py
```

Ожидаемый результат:

```text
[*] Выполняю поиск в OU=Users,OU=Corporate,DC=hta,DC=local...
[*] Найдено объектов в AD: ...
[+] Импорт завершен. Добавлено: ..., обновлено: ..., пропущено: ...
```

Если появляется ошибка `password is mandatory in simple bind`, значит контейнер не прочитал `AD_PASSWORD` из `.env.ad`.

## 8.2) Ночной автосинк AD через cron

Для ежедневного запуска импорта в `02:00` настрой `root`-cron:

```bash
sudo crontab -e
```

Добавь строку:

```cron
0 2 * * * docker exec smart-box python /app/scripts/Export_AD_users.py >> /var/log/ad-sync.log 2>&1
```

Проверка:

```bash
sudo crontab -l
sudo systemctl status cron
sudo tail -n 50 /var/log/ad-sync.log
```

Важно:

- запускать cron лучше от `root`, потому что обычный пользователь может не иметь доступа к Docker socket
- если запускать от `admin`, возможна ошибка `permission denied while trying to connect to the Docker daemon socket`
- файлы, скопированные в контейнер через `docker cp`, могут исчезнуть после пересборки контейнера, поэтому после `docker-compose down` / `up --build` их нужно заново скопировать, если они еще не примонтированы через `volumes`

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
