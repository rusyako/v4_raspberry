# Smart Box

Smart Box - kiosk-система для выдачи и возврата MacBook по RFID-карте.

## Что внутри

- `backend/` - Flask API, SQLite, интеграция с serial и host RFID relay flow
- `frontend/` - Vite + React frontend
- `manage_db.py` - CLI для управления БД (пользователи/устройства)

Маршруты:

- `/` - пользовательский kiosk flow
- `/admin` - админ-страница

Docker-образ сам собирает frontend внутри контейнера. Отдельно готовить `frontend/dist` перед запуском не нужно.

Проект поддерживает 2 режима запуска:

- обычный Docker-режим на любом устройстве без Raspberry Pi hardware
- Raspberry Pi kiosk-режим с `RC522` и реле двери на host side

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

Если нужно открыть `/admin` для всех устройств в локальной сети без admin-card, включи:

```env
ENABLE_LOCAL_DEBUG_SDK=true
```

В этом режиме доступ к `/admin` будет автоматически разрешён для запросов из `localhost` и private LAN ranges, например:

- `192.168.x.x`
- `10.x.x.x`
- `172.16.x.x` - `172.31.x.x`

Важно: это снижает защиту админки. Используй только в доверенной локальной сети.

## 3.0) Быстрый запуск на обычном устройстве без Raspberry Pi hardware

Если нужно просто поднять проект на другом компьютере без `RC522`, реле и GPIO, достаточно Docker.

Минимальный сценарий:

```bash
git clone https://github.com/rusyako/v4_raspberry.git
cd v4_raspberry
cp .env.example .env
docker compose up --build -d
docker compose ps
docker compose logs -f smart-box
```

В таком режиме:

- backend и frontend работают в Docker
- RFID reader не нужен
- door relay не нужен
- можно пользоваться UI, админкой, БД, импортом и остальной backend-логикой

Открыть:

- `http://localhost:5000/`
- `http://localhost:5000/admin`

Если нужна только локальная отладка админки на обычном компьютере, можно временно включить:

```env
ENABLE_LOCAL_DEBUG_SDK=true
```

Тогда локальный доступ к `/admin` с того же устройства будет работать без admin-card.

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

## 3.2) Как RFID теперь работает

Схема работы после перехода с Arduino такая:

- `smart-box` backend работает в Docker-контейнере
- `RC522` подключён напрямую к `Raspberry Pi`
- отдельный host-скрипт `scripts/rc522_reader.py` запускается на самой Raspberry Pi, а не в Docker
- host-скрипт читает UID карты через `SPI/GPIO`
- после чтения UID отправляется в backend по локальному адресу `http://127.0.0.1:5000/hardware/rfid-scan`

Это сделано специально, потому что `RPi.GPIO` и `mfrc522` нестабильно работают внутри Docker даже на настоящем Raspberry Pi, а на хосте Raspberry Pi работают надёжно.

## 3.3) Реле двери и логика магнита

Если используется готовый релейный модуль для удерживающего магнита двери, подключение к Raspberry Pi такое:

```text
Relay IN   -> Raspberry Pi GPIO24 (physical pin 18)
Relay VCC  -> Raspberry Pi 5V (physical pin 2 or 4)
Relay GND  -> Raspberry Pi GND (physical pin 6)
```

Логика в проекте такая:

- host RFID reader script читает UID карты
- backend проверяет, есть ли карта в базе пользователей
- если карта распознана, host RFID reader script временно переводит реле двери в состояние `unlock`
- через несколько секунд тот же host RFID reader script автоматически возвращает реле в состояние `lock`

Настройки в `.env`:

```env
STATION_SIGNAL_MODE=gpio
ENABLE_STATION_SIGNAL=true
STATION_SIGNAL_GPIO=24
STATION_SIGNAL_ACTIVE_LEVEL=low
ENABLE_DOOR_UNLOCK_ON_RFID=true
DOOR_UNLOCK_DURATION_SECONDS=5
```

Пояснение:

- `STATION_SIGNAL_GPIO=24` соответствует подключению `IN -> GPIO24`
- `STATION_SIGNAL_ACTIVE_LEVEL=low` подходит для большинства active-low relay modules
- `ENABLE_DOOR_UNLOCK_ON_RFID=true` включает автоматическое отпускание магнита после валидной карты на стороне Raspberry Pi host script
- `DOOR_UNLOCK_DURATION_SECONDS=5` означает, что дверь будет отпущена на 5 секунд

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
- Время в админке (`taken_at`, `returned_at`) отображается во фронтенде в часовом поясе `GMT+5`.

## 7) Проверка RC522 на Raspberry Pi

Надёжная схема для Raspberry Pi такая:

- `smart-box` backend работает в Docker
- `RC522` reader работает на хосте Raspberry Pi отдельным Python-скриптом
- host-скрипт отправляет UID в backend через `http://127.0.0.1:5000/hardware/rfid-scan`

Проверить, что `SPI` доступен на хосте:

```bash
ls /dev/spidev0.0
```

Проверить, что модуль подключён именно так:

```text
RC522 SDA(SS) -> Raspberry Pi GPIO8 / CE0
RC522 SCK     -> Raspberry Pi GPIO11 / SCLK
RC522 MOSI    -> Raspberry Pi GPIO10
RC522 MISO    -> Raspberry Pi GPIO9
RC522 RST     -> Raspberry Pi GPIO25
RC522 GND     -> Raspberry Pi GND
RC522 3.3V    -> Raspberry Pi 3.3V
```

Важно:

- не подключай `RC522` к `5V`
- `RST` в текущей конфигурации должен быть на `GPIO25`
- `SPI` должен быть включён через `raspi-config`

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

Полный минимальный сценарий запуска после reboot:

```bash
cd ~/v4_raspberry
sudo docker compose -f docker-compose.yml up --build -d
python3 scripts/rc522_reader.py
```

## 7.1) Автозапуск Docker, RC522 и AD sync через systemd

В репозитории теперь есть готовая схема автозапуска для Raspberry Pi:

- `scripts/smart-box.service` - поднимает Docker Compose stack после reboot
- `scripts/smart-box-rc522-reader.service` - запускает host RC522 reader
- `scripts/smart-box-ad-sync.timer` - запускает ночной AD sync каждый день в `02:00`
- `scripts/smart-box-ad-sync.service` - one-shot service для импорта AD
- `scripts/install_autostart.sh` - ставит и включает все unit-файлы сразу

Ночной сценарий работает так:

1. В `02:00` timer запускает `scripts/sync_ad_users.sh`
2. Скрипт сначала выполняет `Export_AD_users.py --prune-only`
3. Затем тем же запуском выполняет обычный импорт `Export_AD_users.py`

Это означает:

- сначала удаляются обычные пользователи без активной техники
- затем из AD снова подтягиваются актуальные пользователи из разрешённых OU

Установка:

```bash
cd ~/v4_raspberry
chmod +x scripts/install_autostart.sh
./scripts/install_autostart.sh
```

Если нужно поставить сервисы от другого пользователя, укажи его явно:

```bash
SMART_BOX_SERVICE_USER=admin ./scripts/install_autostart.sh
```

Проверка:

```bash
sudo systemctl status smart-box.service
sudo systemctl status smart-box-rc522-reader.service
sudo systemctl status smart-box-ad-sync.timer
sudo systemctl list-timers smart-box-ad-sync.timer
```

Логи:

```bash
sudo journalctl -u smart-box.service -f
sudo journalctl -u smart-box-rc522-reader.service -f
tail -f logs/ad-sync.log
```

Ожидаемое поведение:

- после загрузки Raspberry Pi Docker stack поднимается автоматически
- `smart-box-rc522-reader.service` автоматически стартует
- ночью в `02:00` выполняется импорт `scripts/Export_AD_users.py`

## 7.2) Автозапуск RC522 reader через systemd

Чтобы Raspberry Pi работала автономно после перезагрузки, host reader script лучше запускать как `systemd`-service.

В репозитории уже есть готовый unit-файл:

- `scripts/smart-box-rc522-reader.service`

Текущая версия рассчитана на пользователя `admin` и путь проекта:

- `/home/admin/v4_raspberry`

Если у тебя другой пользователь или проект лежит в другом каталоге, сначала поправь строки `User=`, `WorkingDirectory=` и `ExecStart=` в этом файле.

Установка сервиса:

```bash
cd ~/v4_raspberry
sudo cp scripts/smart-box-rc522-reader.service /etc/systemd/system/smart-box-rc522-reader.service
sudo systemctl daemon-reload
sudo systemctl enable smart-box-rc522-reader.service
sudo systemctl start smart-box-rc522-reader.service
```

Проверка статуса:

```bash
sudo systemctl status smart-box-rc522-reader.service
```

Просмотр логов сервиса:

```bash
sudo journalctl -u smart-box-rc522-reader.service -f
```

Ожидаемое поведение:

- после загрузки Raspberry Pi backend можно поднять через Docker
- `smart-box-rc522-reader.service` автоматически стартует
- при поднесении карты в `journalctl` появится строка вроде `Card detected: F015ACDA`

Полезные команды управления сервисом:

```bash
sudo systemctl restart smart-box-rc522-reader.service
sudo systemctl stop smart-box-rc522-reader.service
sudo systemctl disable smart-box-rc522-reader.service
```

Если хочешь, чтобы и backend в Docker тоже гарантированно поднимался после reboot, убедись, что Docker включён:

```bash
sudo systemctl enable docker
sudo systemctl start docker
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

Если host reader script вообще не стартует, проверь установку зависимостей на самой Raspberry Pi:

```bash
python3 -m pip show RPi.GPIO spidev mfrc522
```

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

## 8.2) Ночной автосинк AD

Рекомендуемый вариант теперь `systemd timer`, а не `cron`, потому что он лучше интегрирован с автозапуском сервисов и переживает пропущенное время через `Persistent=true`.

Ручной запуск sync:

```bash
./scripts/sync_ad_users.sh
```

Принудительный запуск systemd job:

```bash
sudo systemctl start smart-box-ad-sync.service
tail -n 50 logs/ad-sync.log
```

Старый вариант через `cron` можно оставить только если он уже используется.

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

## 10) Быстрый сценарий для новой Raspberry Pi

Этот раздел нужен для повторяемой установки на несколько Raspberry Pi без ручной донастройки каждый раз.

Что уже умеет проект:

- backend и frontend поднимаются через Docker Compose
- Docker stack стартует после reboot через `smart-box.service`
- host RC522 reader стартует через `smart-box-rc522-reader.service`
- ночной импорт AD запускается каждый день в `02:00` через `smart-box-ad-sync.timer`

### 10.1) Первый запуск на новой Raspberry Pi

```bash
cd ~
git clone https://github.com/rusyako/v4_raspberry.git
cd v4_raspberry
cp .env.example .env
nano .env
```

Проверь минимум:

- `FLASK_SECRET_KEY`
- `RC522_RST_GPIO=25`
- `STATION_SIGNAL_GPIO=24`
- `ENABLE_LOCAL_DEBUG_SDK=false`

Если используется Arduino на `/dev/ttyACM0`, создай локальный `docker-compose.override.yml`:

```bash
cat > docker-compose.override.yml <<'EOF'
services:
  smart-box:
    environment:
      ENABLE_SERIAL_CONTROLLER: "true"
      ENABLE_STATION_SIGNAL: "false"
      SERIAL_PORT: "/dev/ttyACM0"
    privileged: true
    devices:
      - "/dev/ttyACM0:/dev/ttyACM0"
EOF
```

Проверить устройство:

```bash
ls -l /dev/ttyACM*
```

### 10.2) Подготовка host Python для RC522

Если `scripts/rc522_reader.py` запускается на хосте Raspberry Pi, а не в Docker, установи зависимости в локальное виртуальное окружение:

```bash
cd ~/v4_raspberry
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install mfrc522 RPi.GPIO spidev
deactivate
```

Проверка `SPI`:

```bash
ls -l /dev/spidev*
```

### 10.3) Сборка и включение автозапуска

```bash
cd ~/v4_raspberry
sudo docker compose down
sudo docker compose up --build -d
chmod +x scripts/install_autostart.sh
SMART_BOX_SERVICE_USER=root ./scripts/install_autostart.sh
```

Проверка:

```bash
sudo systemctl status smart-box.service --no-pager
sudo systemctl status smart-box-rc522-reader.service --no-pager
sudo systemctl status smart-box-ad-sync.timer --no-pager
sudo systemctl list-timers smart-box-ad-sync.timer
sudo docker compose logs --tail=100 smart-box
```

Ожидаемое состояние:

- `smart-box.service` -> `active (exited)`
- `smart-box-rc522-reader.service` -> `active (running)`
- `smart-box-ad-sync.timer` -> `active (waiting)`

### 10.3.1) Автооткрытие сайта в Chromium kiosk mode

Рекомендуемый вариант для Raspberry Pi kiosk:

- Docker и backend поднимаются через `smart-box.service`
- RFID reader поднимается через `smart-box-rc522-reader.service`
- Raspberry Pi загружается в Desktop с autologin
- Chromium автоматически открывает `http://localhost:5000` в fullscreen kiosk mode

Для Raspberry Pi OS / Debian `trixie` обычно нужен пакет `chromium`, а не `chromium-browser`:

```bash
sudo apt update
sudo apt install -y chromium unclutter
which chromium
```

Включи автологин в Desktop:

```bash
sudo raspi-config
```

Дальше:

- `System Options`
- `Boot / Auto Login`
- `Desktop Autologin`

Создай autostart-файл:

```bash
mkdir -p /home/admin/.config/lxsession/LXDE-pi
cat > /home/admin/.config/lxsession/LXDE-pi/autostart <<'EOF'
@xset s off
@xset -dpms
@xset s noblank
@unclutter -idle 0
@bash -c 'sleep 10; chromium --kiosk --incognito --disable-infobars --noerrdialogs --disable-session-crashed-bubble http://localhost:5000'
EOF
```

Что делает этот autostart:

- отключает screen saver и blank screen
- прячет курсор мыши
- ждёт `10` секунд, пока backend поднимется
- открывает Smart Box в полном экране без браузерных панелей

Перезагрузка для проверки:

```bash
sudo reboot
```

Если Chromium открывается слишком рано, увеличь задержку, например до `15` секунд:

```text
@bash -c 'sleep 15; chromium --kiosk --incognito --disable-infobars --noerrdialogs --disable-session-crashed-bubble http://localhost:5000'
```

### 10.4) Обновление уже установленной Raspberry Pi

Если локально изменён `docker-compose.override.yml`, перед `git pull` временно убери его в stash:

```bash
cd ~/v4_raspberry
git stash push -m "local override backup" -- docker-compose.override.yml
git pull
git stash pop
```

После обновления:

```bash
sudo docker compose down
sudo docker compose up --build -d
SMART_BOX_SERVICE_USER=root ./scripts/install_autostart.sh
```

### 10.5) Полезные проверки

Проверить, что сервис Arduino виден контейнеру:

```bash
sudo docker compose exec smart-box ls -l /dev/ttyACM0
```

Проверить логи RC522:

```bash
sudo journalctl -u smart-box-rc522-reader.service -f
```

Проверить ручной запуск AD sync:

```bash
sudo systemctl start smart-box-ad-sync.service
tail -n 50 ~/v4_raspberry/logs/ad-sync.log
```

Если `smart-box-rc522-reader.service` падает с ошибкой `No module named 'mfrc522'`, значит зависимости установлены не в тот Python. В этом случае заново установи пакеты в `~/v4_raspberry/venv` и перезапусти сервис.
