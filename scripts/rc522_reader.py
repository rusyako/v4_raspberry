#!/usr/bin/env python3
import json
import logging
import os
import sys
import time
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib import error, request

try:
    import RPi.GPIO as GPIO
    from mfrc522 import MFRC522
except Exception as import_error:
    print(f'Failed to import RC522 dependencies: {import_error}', file=sys.stderr)
    sys.exit(1)


API_URL = os.getenv('SMART_BOX_RFID_API_URL', 'http://127.0.0.1:5000/hardware/rfid-scan').strip()
RC522_SPI_BUS = int(os.getenv('RC522_SPI_BUS', '0'))
RC522_SPI_DEVICE = int(os.getenv('RC522_SPI_DEVICE', '0'))
RC522_RST_GPIO = int(os.getenv('RC522_RST_GPIO', '25'))
RC522_GPIO_MODE = os.getenv('RC522_GPIO_MODE', 'BCM').strip().upper()
RFID_DEBOUNCE_SECONDS = float(os.getenv('RFID_DEBOUNCE_SECONDS', '1.5'))
POST_TIMEOUT_SECONDS = float(os.getenv('SMART_BOX_RFID_POST_TIMEOUT', '3'))
POLL_INTERVAL_SECONDS = float(os.getenv('SMART_BOX_RFID_POLL_INTERVAL', '0.1'))
LOG_LEVEL = os.getenv('SMART_BOX_RFID_LOG_LEVEL', 'INFO').strip().upper()
ENABLE_STATION_SIGNAL = os.getenv('ENABLE_STATION_SIGNAL', 'true').lower() == 'true'
STATION_SIGNAL_GPIO = int(os.getenv('STATION_SIGNAL_GPIO', '24'))
STATION_SIGNAL_ACTIVE_LEVEL = os.getenv('STATION_SIGNAL_ACTIVE_LEVEL', 'low').strip().lower()
ENABLE_DOOR_UNLOCK_ON_RFID = os.getenv('ENABLE_DOOR_UNLOCK_ON_RFID', 'true').lower() == 'true'
DOOR_UNLOCK_DURATION_SECONDS = float(os.getenv('DOOR_UNLOCK_DURATION_SECONDS', '5'))
DOOR_HTTP_PORT = int(os.getenv('SMART_BOX_DOOR_PORT', '5100'))


def configure_logging():
    logging.basicConfig(
        level=getattr(logging, LOG_LEVEL, logging.INFO),
        format='%(asctime)s %(levelname).1s rc522-reader: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )


def get_gpio_mode():
    return GPIO.BCM if RC522_GPIO_MODE == 'BCM' else GPIO.BOARD


def get_active_signal_level():
    return GPIO.LOW if STATION_SIGNAL_ACTIVE_LEVEL == 'low' else GPIO.HIGH


def get_inactive_signal_level():
    active_level = get_active_signal_level()
    return GPIO.HIGH if active_level == GPIO.LOW else GPIO.LOW


def initialize_station_signal():
    current_mode = GPIO.getmode()
    if current_mode is None:
        GPIO.setmode(get_gpio_mode())

    GPIO.setup(STATION_SIGNAL_GPIO, GPIO.OUT, initial=get_inactive_signal_level())


def open_door_now():
    if not ENABLE_STATION_SIGNAL:
        return
    try:
        GPIO.output(STATION_SIGNAL_GPIO, get_active_signal_level())
        logging.info('Door relay OPENED.')
    except Exception as exc:
        logging.error('Failed to open door relay: %s', exc)


def close_door_now():
    if not ENABLE_STATION_SIGNAL:
        return
    try:
        GPIO.output(STATION_SIGNAL_GPIO, get_inactive_signal_level())
        logging.info('Door relay CLOSED.')
    except Exception as exc:
        logging.error('Failed to close door relay: %s', exc)


def unlock_door_blocking():
    if not ENABLE_STATION_SIGNAL or not ENABLE_DOOR_UNLOCK_ON_RFID:
        return

    try:
        GPIO.output(STATION_SIGNAL_GPIO, get_active_signal_level())
        logging.info('Door relay unlocked for %.2f seconds.', DOOR_UNLOCK_DURATION_SECONDS)
        time.sleep(DOOR_UNLOCK_DURATION_SECONDS)
    finally:
        GPIO.output(STATION_SIGNAL_GPIO, get_inactive_signal_level())
        logging.info('Door relay returned to locked state.')


class DoorHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        logging.info('Door HTTP: %s', fmt % args)

    def _send_ok(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'ok')

    def do_POST(self):
        if self.path == '/door/open':
            open_door_now()
            self._send_ok()
        elif self.path == '/door/close':
            close_door_now()
            self._send_ok()
        else:
            self.send_response(404)
            self.end_headers()


def start_door_server():
    if not ENABLE_STATION_SIGNAL:
        logging.info('Door HTTP server disabled (ENABLE_STATION_SIGNAL=false).')
        return

    server = HTTPServer(('127.0.0.1', DOOR_HTTP_PORT), DoorHandler)
    logging.info('Door HTTP server listening on 127.0.0.1:%d', DOOR_HTTP_PORT)
    server.serve_forever()


def normalize_uid(uid_bytes):
    if not uid_bytes or len(uid_bytes) < 4:
        return ''
    return ''.join(f'{part:02X}' for part in uid_bytes[:4])


def read_uid_no_block(reader):
    status, _ = reader.MFRC522_Request(reader.PICC_REQIDL)
    if status != reader.MI_OK:
        return ''

    status, uid = reader.MFRC522_Anticoll()
    if status != reader.MI_OK:
        return ''

    return normalize_uid(uid)


def post_uid(uid):
    payload = json.dumps({'uid': uid}).encode('utf-8')
    http_request = request.Request(
        API_URL,
        data=payload,
        headers={'Content-Type': 'application/json'},
        method='POST'
    )

    try:
        with request.urlopen(http_request, timeout=POST_TIMEOUT_SECONDS) as response:
            body = response.read().decode('utf-8', errors='replace')
            logging.info('UID %s accepted by backend: %s', uid, body)
            return True
    except error.HTTPError as http_error:
        body = http_error.read().decode('utf-8', errors='replace')
        logging.warning('UID %s rejected by backend: %s %s', uid, http_error.code, body)
        return False
    except Exception as request_error:
        logging.error('Failed to deliver UID %s to backend: %s', uid, request_error)
        return False


def build_reader():
    return MFRC522(
        bus=RC522_SPI_BUS,
        device=RC522_SPI_DEVICE,
        pin_mode=get_gpio_mode(),
        pin_rst=RC522_RST_GPIO
    )


def main():
    configure_logging()
    logging.info('Starting RC522 reader for %s', API_URL)

    initialize_station_signal()

    door_thread = threading.Thread(target=start_door_server, daemon=True)
    door_thread.start()

    reader = build_reader()
    last_uid = ''
    last_seen_at = 0.0

    try:
        while True:
            uid = read_uid_no_block(reader)
            now = time.time()

            if uid:
                if uid != last_uid or now - last_seen_at >= RFID_DEBOUNCE_SECONDS:
                    logging.info('Card detected: %s', uid)
                    post_uid(uid)
                    last_uid = uid
                    last_seen_at = now
                time.sleep(0.2)
                continue

            time.sleep(POLL_INTERVAL_SECONDS)
    except KeyboardInterrupt:
        logging.info('Stopping RC522 reader.')
    finally:
        try:
            reader.Close_MFRC522()
        except Exception:
            pass
        GPIO.cleanup()


if __name__ == '__main__':
    main()
