# SmartBox

Автоматизированная станция выдачи и возврата MacBook по RFID-картам на Raspberry Pi.

## Что внутри

| Компонент | Технология |
|-----------|-----------|
| Backend | Python 3.11 + Flask |
| Frontend | React 18 + Vite |
| База данных | SQLite |
| RFID | MFRC522 (SPI) |
| Дверь/реле | GPIO Raspberry Pi |
| Инфраструктура | Docker + systemd |
| Звук | WAV воспроизведение в браузере |

## Оглавление

- [Быстрый старт (обычный ПК)](#быстрый-старт-обычный-пк)
- [Установка на Raspberry Pi](#установка-на-raspberry-pi)
- [Структура проекта](#структура-проекта)
- [Пользовательский сценарий](#пользовательский-сценарий)
- [Управление через CLI (manage_db.py)](#управление-через-cli)
- [Systemd автозапуск](#systemd-автозапуск)
- [Команды Raspberry Pi (шпаргалка)](#команды-raspberry-pi-шпаргалка)
- [Архитектура двери и реле](#архитектура-двери-и-реле)
- [Звуковая система](#звуковая-система)
- [Админ-панель](#админ-панель)
- [Переменные окружения](#переменные-окружения)
- [Устранение неполадок](#устранение-неполадок)

---

## Быстрый старт (обычный ПК)

Без Raspberry Pi, без RC522, без реле — только Docker.

```bash
git clone https://github.com/rusyako/v4_raspberry.git
cd v4_raspberry
cp .env.example .env
# отредактируй FLASK_SECRET_KEY в .env
docker compose up --build -d
```

Открыть:
- `http://localhost:5000/` — киоск
- `http://localhost:5000/admin` — админка

Для доступа к админке без карты поставь в `.env`:

```env
ENABLE_LOCAL_DEBUG_SDK=true
```

---

## Установка на Raspberry Pi

### 1. Системные пакеты

```bash
sudo apt update
sudo apt install -y git docker.io docker-compose python3-pip python3-venv
sudo systemctl enable docker
sudo systemctl start docker
```

### 2. Клонирование и настройка

```bash
cd ~
git clone https://github.com/rusyako/v4_raspberry.git
cd v4_raspberry
cp .env.example .env
nano .env
```

**Обязательно замени:**
- `FLASK_SECRET_KEY=change-me` → любой случайный текст

**Для первого запуска удобно:**
- `ENABLE_LOCAL_DEBUG_SDK=true` — доступ к админке без карты

### 3. Виртуальное окружение для RC522

```bash
cd ~/v4_raspberry
python3 -m venv venv
source venv/bin/activate
pip install mfrc522 RPi.GPIO spidev
deactivate
```

### 4. Docker образ

```bash
cd ~/v4_raspberry
sudo docker-compose build
sudo docker-compose up -d
```

### 5. Инициализация БД и тестовые данные

```bash
sudo docker exec smart-box python manage_db.py init-db
sudo docker exec smart-box python manage_db.py add-user --uid "F015ACDA" --name "Ruslan" --email "ruslan@company.kz" --admin
sudo docker exec smart-box python manage_db.py add-laptop --name "MB-001" --barcode "BC-001" --device-number "2000000188706" --status available
```

### 6. Включение SPI

```bash
sudo raspi-config
# Interface Options → SPI → Enable
sudo reboot
```

После перезагрузки:

```bash
ls /dev/spidev0.0  # должен существовать
```

### 7. Запуск RC522 reader

```bash
cd ~/v4_raspberry
sudo venv/bin/python3 scripts/rc522_reader.py &
```

### 8. Проверка

```bash
# Статус контейнера
sudo docker-compose ps

# Дверь (реле должно щёлкать)
curl -X POST http://127.0.0.1:5100/door/open
sleep 2
curl -X POST http://127.0.0.1:5100/door/close
```

Открыть в браузере:
- `http://<IP>:5000/` — киоск
- `http://<IP>:5000/admin` — админка

---

## Структура проекта

```
v4_raspberry/
├── backend/
│   ├── app.py              # Flask API (все endpoint'ы)
│   └── notification.py     # Email-уведомления
├── frontend/
│   ├── public/audio/       # WAV-заглушки (ru/kz/en)
│   └── src/react/          # React SPA
│       ├── pages/          # kiosk-page, admin-page, admin-panels
│       ├── kiosk/          # kiosk-views, use-kiosk-controller, constants
│       └── shared/         # api, toast, modal, use-sound, translations, storage
├── scripts/
│   ├── rc522_reader.py             # RC522 + HTTP дверной сервер
│   ├── generate-sounds.py          # Генератор WAV-заглушек
│   ├── Export_AD_users.py          # AD → SQLite синхронизация
│   ├── start-rc522-reader.sh       # Лаунчер RC522 из venv
│   ├── smart-box.service           # systemd: Docker Compose
│   ├── smart-box-rc522-reader.service  # systemd: RC522 reader
│   └── install_autostart.sh        # Установщик всех сервисов
├── main.py                  # Точка входа Flask
├── manage_db.py             # CLI для управления БД
├── Dockerfile               # Multi-stage Node + Python
├── docker-compose.yml       # Основной compose-файл
└── .env.example             # Шаблон переменных окружения
```

---

## Пользовательский сценарий

```
┌─────────────────────────────────────────────────────┐
│ 1. Главный экран                                   │
│    Отображает температуру, выданные устройства,     │
│    "Приложите карту доступа"                       │
└────────────────────┬────────────────────────────────┘
                     │ Скан RFID
                     ▼
┌─────────────────────────────────────────────────────┐
│ 2. Карта распознана?                               │
│    ✅ Да → Панель действий (дверь закрыта)          │
│    ❌ Нет → "Вас нет в базе" (15 сек)               │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ 3. Панель действий                                 │
│    [Выдать] [Вернуть] [Админ-панель]                │
│    Дверь всё ещё закрыта                            │
└──────┬──────────────────────┬───────────────────────┘
       │                      │
  Нажал "Выдать"         Нажал "Вернуть"
       │                      │
       ▼                      ▼
┌──────────────┐    ┌──────────────────┐
│ 4a. Выдача   │    │ 4b. Возврат      │
│ Дверь ──► ON │    │ Дверь ──► ON     │
│ Скан штрих-  │    │ Список устройств │
│ кодов уст-в  │    │ Скан штрихкодов  │
│ Нажать Выдать│    │ Нажать Вернуть   │
│              │    │                  │
│ ✅ Успешно   │    │ ✅ Успешно       │
│ Дверь ──► OFF│    │ Дверь ──► OFF   │
└──────────────┘    └──────────────────┘
```

---

## Управление через CLI

Все команды выполняются через `docker exec smart-box`:

### Пользователи

```bash
# Добавить обычного пользователя
sudo docker exec smart-box python manage_db.py add-user --uid "F015ACDA" --name "Имя" --email "mail@company.kz"

# Добавить админа
sudo docker exec smart-box python manage_db.py add-user --uid "AABBCCDD" --name "Admin" --email "admin@company.kz" --admin

# Удалить пользователя
sudo docker exec smart-box python manage_db.py remove-user --uid "F015ACDA"

# Список всех пользователей
sudo docker exec smart-box python manage_db.py list-users
```

### Устройства

```bash
# Добавить устройство
sudo docker exec smart-box python manage_db.py add-laptop --name "MB-001" --barcode "BC-001" --device-number "2000000188706" --status available

# Удалить устройство
sudo docker exec smart-box python manage_db.py remove-laptop --name "MB-001"

# Список устройств
sudo docker exec smart-box python manage_db.py list-laptops
```

### Просмотр данных

```bash
sudo docker exec smart-box python manage_db.py list-users
sudo docker exec smart-box python manage_db.py list-laptops
sudo docker exec smart-box python manage_db.py list-bookings
sudo docker exec smart-box python manage_db.py list-borrow-records
sudo docker exec smart-box python manage_db.py list-history
```

### Сброс базы

```bash
sudo docker exec smart-box python manage_db.py reset-db
```

---

## Systemd автозапуск

После настройки все сервисы стартуют автоматически при загрузке Raspberry Pi.

### Установка всех сервисов одной командой

```bash
cd ~/v4_raspberry
chmod +x scripts/install_autostart.sh
sudo ./scripts/install_autostart.sh
```

### Сервисы

| Сервис | Что делает | Автозапуск |
|--------|-----------|------------|
| `smart-box.service` | Docker Compose up | ✅ |
| `smart-box-rc522-reader.service` | RC522 RFID reader | ✅ |
| `smart-box-ad-sync.timer` | AD синхронизация (02:00) | ✅ |
| `smart-box-reminder.timer` | Email напоминания (16:30) | ✅ |

### Ручное управление сервисами

```bash
sudo systemctl status smart-box.service
sudo systemctl status smart-box-rc522-reader.service

sudo systemctl restart smart-box.service
sudo systemctl restart smart-box-rc522-reader.service

sudo systemctl stop smart-box-rc522-reader.service
sudo systemctl start smart-box-rc522-reader.service
```

### Логи сервисов

```bash
sudo journalctl -u smart-box.service -f
sudo journalctl -u smart-box-rc522-reader.service -f
sudo journalctl -u smart-box-rc522-reader.service --since "5 min ago"
```

---

## Команды Raspberry Pi (шпаргалка)

### Дверь / Реле

```bash
# Открыть дверь (через HTTP мост)
curl -X POST http://127.0.0.1:5100/door/open

# Закрыть дверь
curl -X POST http://127.0.0.1:5100/door/close

# Открыть на 2 секунды и закрыть
curl -X POST http://127.0.0.1:5100/door/open && sleep 2 && curl -X POST http://127.0.0.1:5100/door/close

# Проверить что дверной сервер жив
curl -X POST http://127.0.0.1:5100/door/open && echo " OK"
```

### Docker

```bash
# Статус контейнера
sudo docker-compose ps

# Логи контейнера
sudo docker-compose logs -f smart-box
sudo docker-compose logs --tail=50 smart-box

# Перезапустить контейнер
sudo docker-compose restart smart-box

# Остановить
sudo docker-compose down

# Пересобрать и запустить (после git pull)
sudo docker-compose down && sudo docker-compose build && sudo docker-compose up -d

# Проверить env внутри контейнера
sudo docker exec smart-box env | grep -i station

# Проверить связь с дверным сервером из контейнера
sudo docker exec smart-box python3 -c "
import urllib.request
r = urllib.request.Request('http://host.docker.internal:5100/door/open', data=b'', method='POST')
resp = urllib.request.urlopen(r, timeout=3)
print(resp.read().decode())
"
```

### RC522 Reader

```bash
# Запустить вручную
sudo ~/v4_raspberry/venv/bin/python3 ~/v4_raspberry/scripts/rc522_reader.py

# Запустить в фоне
sudo ~/v4_raspberry/venv/bin/python3 ~/v4_raspberry/scripts/rc522_reader.py &

# Найти PID процесса
pgrep -f rc522_reader.py

# Остановить
sudo kill $(pgrep -f rc522_reader.py)

# Проверить SPI
ls /dev/spidev0.0
```

### Обновление проекта

```bash
cd ~/v4_raspberry
git pull origin main
sudo docker-compose down && sudo docker-compose build && sudo docker-compose up -d
sudo systemctl restart smart-box-rc522-reader.service
```

### Сеть

```bash
# Узнать IP Raspberry Pi
hostname -I

# Проверить что порт 5000 слушает
sudo ss -tlnp | grep 5000

# Проверить что порт 5100 (дверь) слушает
sudo ss -tlnp | grep 5100
```

### Звук

```bash
# Проверить звуковые карты
aplay -l

# Проверить громкость
amixer sget PCM

# Включить на 100%
amixer sset PCM 100% unmute

# Тестовый тон
speaker-test -t sine -f 440 -l 1

# Выбрать выход (HDMI или 3.5mm)
sudo raspi-config
# System Options → Audio → Headphones / HDMI
```

### Отладка

```bash
# Протестировать эндпоинт RFID
curl -X POST http://127.0.0.1:5000/hardware/rfid-scan \
  -H 'Content-Type: application/json' \
  -d '{"uid":"F015ACDA"}'

# Протестировать открытие через бэкенд
curl -X POST http://127.0.0.1:5000/send_arduino_signal

# Протестировать закрытие через бэкенд
curl -X POST http://127.0.0.1:5000/send_arduino_signal_on

# Показать последние 20 строк логов бэкенда
sudo docker-compose logs --tail=20 smart-box

# Проверить env переменные контейнера
sudo docker-compose config | grep -i station
```

---

## Архитектура двери и реле

```
┌─────────────────────────────────────────────────┐
│                   БРАУЗЕР                       │
│  Нажатие "Выдать"/"Вернуть"                     │
│       ↓ fetch POST                              │
│  /send_arduino_signal                           │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│               DOCKER КОНТЕЙНЕР                  │
│  Flask: set_station_signal(True)                │
│       ↓                                         │
│  POST http://host.docker.internal:5100/door/open│
└──────────────────┬──────────────────────────────┘
                   │ 172.17.0.1:5100
┌──────────────────▼──────────────────────────────┐
│            HOST RASPBERRY PI                     │
│  rc522_reader.py: HTTP сервер (порт 5100)       │
│       ↓                                         │
│  GPIO.output(24, LOW)  — active-low реле        │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│              ФИЗИЧЕСКОЕ РЕЛЕ                    │
│  GPIO24 → IN реле                               │
│  5V    → VCC реле                               │
│  GND   → GND реле                               │
│  COM + NO → магнит двери                        │
└─────────────────────────────────────────────────┘
```

**Ключевые моменты:**

- Flask внутри Docker **не может** трогать GPIO напрямую
- RC522 reader на хосте слушает HTTP-запросы на порту 5100
- Flask делегирует открытие/закрытие через HTTP → rc522_reader
- `ENABLE_STATION_SIGNAL=true` включает управление дверью
- `STATION_SIGNAL_GPIO=24` — пин реле
- `STATION_SIGNAL_ACTIVE_LEVEL=low` — для большинства релейных модулей
- Docker использует `host.docker.internal` для связи с хостом (добавлен `extra_hosts`)

### Подключение реле к GPIO

```
Relay IN   → Raspberry Pi GPIO24 (pin 18)
Relay VCC  → Raspberry Pi 5V (pin 2 или 4)
Relay GND  → Raspberry Pi GND (pin 6)
```

---

## Звуковая система

### 8 звуковых эффектов

| Файл | Тон | Когда играет |
|------|-----|-------------|
| `access-granted.wav` | C5→E5→G5 ↑ | Карта распознана → панель действий |
| `access-denied.wav` | G4→E4→C4 ↓ | Неизвестная карта |
| `select-action.wav` | C5 ·· E5 | Выбор действия |
| `take-scan.wav` | G4 | Режим выдачи |
| `return-scan.wav` | E4 | Режим возврата |
| `success-take.wav` | C5 E5 G5 ↑ | Успешная выдача |
| `success-return.wav` | G5 E5 C5 ↓ | Успешный возврат |
| `close-door.wav` | C4 | Дверь закрывается (через 2с после успеха) |

### Генерация WAV-файлов

```bash
cd ~/v4_raspberry
python3 scripts/generate-sounds.py
# Создаст 24 файла в frontend/public/audio/{ru,kz,en}/
```

### Замена на реальную речь

Замени файлы в `frontend/public/audio/{ru,kz,en}/`, сохранив те же имена. После этого:

```bash
sudo docker-compose build && sudo docker-compose up -d
```

### Настройки звука в админке

Админ-панель → «Настройки звука»:
- Вкл/Выкл
- Громкость (0–100%)
- Выпадающий список для теста
- Кнопка «▶ Тест»

---

## Админ-панель

Доступ: `http://<IP>:5000/admin`

### Функции

| Раздел | Возможности |
|--------|-----------|
| **Дашборд** | Статистика: пользователи, устройства, активные выдачи |
| **Журнал выдач** | Таблица с фильтрами (статус, дата, поиск), экспорт CSV |
| **Пользователи** | Добавление, удаление, GUID/UID, импорт Excel/CSV |
| **Устройства** | Добавление (в т.ч. сканером), удаление, перенос между админами |
| **Анализ** | Графики (дневная активность, статус устройств), топ-5 пользователей, KPI |
| **AD Management** | Загрузка из Active Directory, удаление неактивных, просмотр лога |
| **Настройки звука** | Вкл/выкл, громкость, тест звуков |

---

## Переменные окружения

Ключевые переменные в `.env`:

| Переменная | По умолчанию | Описание |
|-----------|-------------|----------|
| `FLASK_SECRET_KEY` | `change-me` | **Обязательно заменить** |
| `STATION_SIGNAL_GPIO` | `24` | Пин реле двери |
| `STATION_SIGNAL_ACTIVE_LEVEL` | `low` | Уровень открытия (low/high) |
| `ENABLE_STATION_SIGNAL` | `true` | Вкл/выкл управление дверью |
| `ENABLE_DOOR_UNLOCK_ON_RFID` | `true` | Автооткрытие при валидной карте |
| `ENABLE_LOCAL_DEBUG_SDK` | `false` | Доступ к админке без карты |
| `DOOR_HTTP_URL` | `http://host.docker.internal:5100` | URL дверного HTTP сервера |
| `SMART_BOX_DOOR_PORT` | `5100` | Порт дверного HTTP сервера |

Полный список в `.env.example`.

---

## Устранение неполадок

### Контейнер не стартует (Exit 128/255)

```bash
sudo docker-compose logs --tail=30 smart-box
```

Частые причины:
- `FLASK_SECRET_KEY=change-me` не заменён
- `.env.ad` — директория вместо файла
- `.env` не существует (создать: `cp .env.example .env`)

### Дверь не открывается

```bash
# 1. Проверить что сервис RC522 запущен
sudo systemctl status smart-box-rc522-reader.service

# 2. Проверить что порт 5100 слушает
sudo ss -tlnp | grep 5100

# 3. Проверить связь Docker → хост
sudo docker exec smart-box python3 -c "
import urllib.request
r = urllib.request.Request('http://host.docker.internal:5100/door/open', data=b'', method='POST')
print(urllib.request.urlopen(r, timeout=3).read().decode())
"

# 4. Проверить env
sudo docker-compose config | grep -i enable_station
# Должно быть: ENABLE_STATION_SIGNAL: "true"
```

### Нет звука в браузере

```bash
# Есть ли звуковая карта
aplay -l

# Включить звук
sudo nano /boot/firmware/config.txt
# Добавить: dtparam=audio=on

# Громкость
amixer sset PCM 100% unmute

# Проверить что WAV файлы доступны
curl -I http://localhost:5000/audio/ru/access-granted.wav
```

### 404 на /audio/ файлах

Контейнер собран без аудиофайлов. Пересобрать:

```bash
cd ~/v4_raspberry
sudo docker-compose build && sudo docker-compose up -d
```

### Штрихкод-сканер не пишет текст при добавлении устройства

Поле штрихкода теперь имеет автофокус — просто наведи сканер. Enter автоматически отправляет форму.

---

## Лицензия

MIT
