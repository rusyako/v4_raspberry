from flask import Flask, jsonify, request, send_from_directory, session
import atexit
import hashlib
import json
import logging
from logging.handlers import TimedRotatingFileHandler
import os
import sqlite3
import threading
import time

import serial

try:
    import webview
except ImportError:
    webview = None


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIST_DIR = os.getenv('FRONTEND_DIST_DIR', os.path.join(PROJECT_ROOT, 'frontend', 'dist'))
DATA_DIR = os.getenv('DATA_DIR', os.path.join(PROJECT_ROOT, 'data'))
DB_PATH = os.getenv('SQLITE_PATH', os.path.join(DATA_DIR, 'smart-box.db'))
SEED_PATH = os.getenv('SEED_PATH', os.path.join(PROJECT_ROOT, 'seed_data.json'))
LOG_DIR = os.getenv('LOG_DIR', os.path.join(PROJECT_ROOT, 'logs'))
LOG_FILE = os.getenv('LOG_FILE', 'smart-box.log')
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO').upper()
LOG_BACKUP_DAYS = int(os.getenv('LOG_BACKUP_DAYS', '14'))
SERIAL_PORT = os.getenv('SERIAL_PORT', '/dev/ttyACM0')
SERIAL_BAUDRATE = int(os.getenv('SERIAL_BAUDRATE', '9600'))
SERIAL_TIMEOUT = float(os.getenv('SERIAL_TIMEOUT', '0.5'))
FLASK_HOST = os.getenv('FLASK_HOST', '0.0.0.0')
FLASK_PORT = int(os.getenv('FLASK_PORT', '5000'))
FLASK_DEBUG = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
FLASK_SECRET_KEY = os.getenv('FLASK_SECRET_KEY', os.urandom(32).hex())
ENABLE_WEBVIEW = os.getenv('ENABLE_WEBVIEW', 'false').lower() == 'true'
START_ARDUINO_THREAD = os.getenv('START_ARDUINO_THREAD', 'true').lower() == 'true'
ADMIN_PIN = os.getenv('ADMIN_PIN', '1234')
ADMIN_SESSION_TIMEOUT_SECONDS = int(os.getenv('ADMIN_SESSION_TIMEOUT_SECONDS', '1800'))
ENABLE_LOCAL_DEBUG_SDK = os.getenv('ENABLE_LOCAL_DEBUG_SDK', 'true').lower() == 'true'

stop_event = threading.Event()
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)

handler = TimedRotatingFileHandler(
    os.path.join(LOG_DIR, LOG_FILE),
    when='midnight',
    interval=1,
    backupCount=LOG_BACKUP_DAYS,
    encoding='utf-8'
)
handler.setFormatter(logging.Formatter('%(asctime)s %(levelname).1s %(name)s: %(message)s', '%Y-%m-%d %H:%M:%S'))

root_logger = logging.getLogger()
root_logger.handlers.clear()
root_logger.setLevel(LOG_LEVEL)
root_logger.addHandler(handler)

logging.getLogger('werkzeug').setLevel(logging.WARNING)
logging.getLogger('urllib3').setLevel(logging.WARNING)

app = Flask(__name__)
app.secret_key = FLASK_SECRET_KEY

try:
    ser = serial.Serial(SERIAL_PORT, SERIAL_BAUDRATE, timeout=SERIAL_TIMEOUT)
except serial.SerialException as error:
    logging.error(f'Failed to connect to Arduino: {error}')
    ser = None

redirect_to_scan_page = False
laptop_status = '0/0'
last_detected_uid = None
pending_uid_scan = None

GENERIC_ERROR_MESSAGE = 'Что-то пошло не так. Попробуйте снова. / Something went wrong. Please try again.'
SCAN_CARD_MESSAGE = 'Сначала приложите карту доступа. / Please scan your access card first.'
SCAN_BARCODE_MESSAGE = 'Сначала отсканируйте хотя бы один штрихкод. / Please scan at least one barcode.'
FRONTEND_BUILD_MISSING_MESSAGE = (
    'Frontend build not found. Run "npm run build" in the frontend folder first.'
)


def get_db_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def normalize_barcodes(raw_barcodes):
    if not isinstance(raw_barcodes, list):
        return []

    normalized = []
    seen = set()

    for barcode in raw_barcodes:
        if not isinstance(barcode, str):
            continue

        value = barcode.strip()
        if not value or value in seen:
            continue

        normalized.append(value)
        seen.add(value)

    return normalized


def build_home_state():
    return {
        'admin_redirect': bool(session.get('redirect_to_admin_page')),
        'redirect': bool(session.get('redirect_to_hello_page')),
        'laptop_count': laptop_status,
        'last_detected_uid': last_detected_uid
    }


def hash_pin(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def generate_admin_session_token():
    return hashlib.sha256(f'{time.time()}-{os.urandom(16).hex()}'.encode('utf-8')).hexdigest()


def is_admin_session_active(token=None):
    admin_session_token = session.get('admin_session_token')
    admin_session_expires_at = session.get('admin_session_expires_at', 0)

    if not admin_session_token or time.time() > admin_session_expires_at:
        session.pop('admin_session_token', None)
        session.pop('admin_session_expires_at', None)
        return False

    if token is None:
        return True

    return token == admin_session_token


def create_admin_session():
    admin_session_token = generate_admin_session_token()
    session['admin_session_token'] = admin_session_token
    session['admin_session_expires_at'] = time.time() + ADMIN_SESSION_TIMEOUT_SECONDS
    return admin_session_token


def clear_admin_session():
    session.pop('admin_session_token', None)
    session.pop('admin_session_expires_at', None)
    session.pop('redirect_to_admin_page', None)


def clear_user_session():
    session.pop('current_user_uid', None)
    session.pop('redirect_to_hello_page', None)


def activate_user_session(uid, is_admin):
    current_user_uid = session.get('current_user_uid')

    if current_user_uid is not None and current_user_uid != uid:
        return False, 'Сессия уже активна. / A session is already active.'

    session['current_user_uid'] = uid

    if is_admin:
        create_admin_session()
        session['redirect_to_admin_page'] = True
        return True, 'Администратор распознан. / Administrator recognized.'

    session['redirect_to_hello_page'] = True
    return True, 'Пользователь распознан. / User recognized.'


def get_user_by_uid(uid):
    connection = get_db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute('SELECT uid, name, role, is_admin FROM users WHERE uid = ? LIMIT 1;', (uid,))
        row = cursor.fetchone()
        return dict(row) if row else None
    except sqlite3.Error as error:
        logging.error(f'Error loading user: {error}')
        return None
    finally:
        connection.close()


def is_local_request():
    remote_addr = (request.remote_addr or '').strip()
    host = (request.host or '').split(':', 1)[0].strip().lower()

    if host in {'localhost', '127.0.0.1', '::1'}:
        return True

    return remote_addr in {'127.0.0.1', '::1', '::ffff:127.0.0.1'}


def queue_uid_scan(uid):
    global last_detected_uid, pending_uid_scan

    user = get_user_by_uid(uid)
    last_detected_uid = uid

    if not user:
        return False, 'Карта не найдена в системе. / Card was not found in the system.'

    pending_uid_scan = {'uid': uid, 'is_admin': bool(user.get('is_admin'))}
    if user.get('is_admin'):
        return True, 'Администратор распознан. / Administrator recognized.'
    return True, 'Пользователь распознан. / User recognized.'


def apply_uid_scan_for_request(uid):
    global last_detected_uid

    user = get_user_by_uid(uid)
    last_detected_uid = uid

    if not user:
        return False, 'Карта не найдена в системе. / Card was not found in the system.'

    return activate_user_session(uid, bool(user.get('is_admin')))


def consume_pending_uid_scan():
    global pending_uid_scan

    if not pending_uid_scan:
        return

    queued_scan = pending_uid_scan
    pending_uid_scan = None
    activate_user_session(queued_scan['uid'], queued_scan['is_admin'])


def require_admin():
    token = request.headers.get('X-Admin-Token', '').strip()
    if not is_admin_session_active(token):
        return error_response('Требуется вход администратора. / Admin login required.', 401)
    return None


def fetch_admin_dashboard_data():
    connection = get_db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute('SELECT uid, name, role, is_admin FROM users ORDER BY name, uid;')
        users = [dict(row) for row in cursor.fetchall()]
        cursor.execute('SELECT name, barcode, status FROM laptops ORDER BY name;')
        laptops = [dict(row) for row in cursor.fetchall()]
        return users, laptops
    finally:
        connection.close()


def error_response(message, status_code=400):
    return jsonify({'success': False, 'message': message}), status_code


def success_response(message=None, status_code=200, **extra):
    payload = {'success': True}
    if message is not None:
        payload['message'] = message
    payload.update(extra)
    return jsonify(payload), status_code


def recompute_laptop_status(connection=None):
    global laptop_status

    owns_connection = connection is None
    connection = connection or get_db_connection()

    try:
        cursor = connection.cursor()
        cursor.execute('SELECT COUNT(*) FROM laptops;')
        total = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM laptops WHERE status = 'available';")
        available = cursor.fetchone()[0]
        laptop_status = f'{available}/{total}'
        return laptop_status
    finally:
        if owns_connection:
            connection.close()


def seed_database(connection):
    if not os.path.exists(SEED_PATH):
        return

    with open(SEED_PATH, 'r', encoding='utf-8') as seed_file:
        seed_data = json.load(seed_file)

    cursor = connection.cursor()
    cursor.execute('SELECT COUNT(*) FROM users;')
    if cursor.fetchone()[0] == 0:
        users = []
        for user in seed_data.get('users', []):
            uid = (user.get('uid') or '').strip()
            name = (user.get('name') or '').strip() or uid
            role = (user.get('role') or 'user').strip().lower()
            is_admin = 1 if user.get('is_admin', False) or role == 'admin' else 0
            if role not in {'user', 'admin'}:
                role = 'admin' if is_admin else 'user'
            if uid:
                users.append((uid, name, role, is_admin))
        if users:
            cursor.executemany('INSERT INTO users (uid, name, role, is_admin) VALUES (?, ?, ?, ?);', users)

    cursor.execute('SELECT COUNT(*) FROM laptops;')
    if cursor.fetchone()[0] == 0:
        laptops = []
        for laptop in seed_data.get('laptops', []):
            if isinstance(laptop, str):
                name = laptop.strip()
                barcode = name
                status = 'available'
            else:
                name = (laptop.get('name') or '').strip()
                barcode = (laptop.get('barcode') or name).strip()
                status = (laptop.get('status') or 'available').strip().lower()
                if status not in {'available', 'unavailable'}:
                    status = 'available'
            if name:
                laptops.append((name, barcode or name, status))
        if laptops:
            cursor.executemany('INSERT INTO laptops (name, barcode, status) VALUES (?, ?, ?);', laptops)


def init_db():
    connection = get_db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            '''
            CREATE TABLE IF NOT EXISTS users (
                uid TEXT PRIMARY KEY,
                name TEXT,
                role TEXT NOT NULL DEFAULT 'user',
                is_admin INTEGER NOT NULL DEFAULT 0
            );
            '''
        )
        cursor.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';")
    except sqlite3.OperationalError:
        pass
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;")
    except sqlite3.OperationalError:
        pass
    try:
        cursor.execute(
            '''
            CREATE TABLE IF NOT EXISTS laptops (
                name TEXT PRIMARY KEY,
                barcode TEXT UNIQUE,
                status TEXT NOT NULL CHECK(status IN ('available', 'unavailable'))
            );
            '''
        )
        cursor.execute('ALTER TABLE laptops ADD COLUMN barcode TEXT;')
    except sqlite3.OperationalError:
        pass
    try:
        cursor.execute(
            '''
            CREATE TABLE IF NOT EXISTS laptop_bookings (
                uid TEXT NOT NULL,
                laptop_name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (uid, laptop_name),
                FOREIGN KEY (uid) REFERENCES users(uid),
                FOREIGN KEY (laptop_name) REFERENCES laptops(name)
            );
            '''
        )
        cursor.execute(
            '''
            CREATE TABLE IF NOT EXISTS laptop_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uid TEXT NOT NULL,
                laptop_name TEXT NOT NULL,
                action TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            '''
        )
        seed_database(connection)
        cursor.execute("UPDATE users SET is_admin = CASE WHEN role = 'admin' THEN 1 ELSE is_admin END;")
        cursor.execute("UPDATE laptops SET barcode = name WHERE barcode IS NULL OR TRIM(barcode) = '';" )
        connection.commit()
        recompute_laptop_status(connection)
    finally:
        connection.close()


def is_uid_allowed(uid):
    return get_user_by_uid(uid) is not None


def serve_frontend_page(filename):
    file_path = os.path.join(FRONTEND_DIST_DIR, filename)
    if not os.path.exists(file_path):
        return error_response(FRONTEND_BUILD_MISSING_MESSAGE, 503)
    return send_from_directory(FRONTEND_DIST_DIR, filename)


def arduino_thread():
    global redirect_to_scan_page, laptop_status, ser, last_detected_uid

    while not stop_event.is_set():
        try:
            if ser and ser.is_open:
                data = ser.readline().strip()
                if data:
                    data = data.decode().replace(' ', '').upper()
                    print('Received:', data)

                    if data.startswith('UID:'):
                        uid = data[4:]
                        last_detected_uid = uid
                        print('Received UID:', uid)

                        user = get_user_by_uid(uid)

                        if user:
                            success, message = queue_uid_scan(uid)
                            if not success:
                                print(message)
                        else:
                            print('UID not allowed.')
                    elif '/' in data:
                        laptop_status = data
            time.sleep(0.1)
        except serial.SerialException:
            logging.warning('Arduino disconnected. Attempting to reconnect...')
        except Exception as error:
            print(f'Arduino thread error: {error}')


def run_flask():
    app.run(host=FLASK_HOST, port=FLASK_PORT, debug=FLASK_DEBUG, use_reloader=False, threaded=True)


@app.route('/assets/<path:filename>')
def frontend_assets(filename):
    assets_dir = os.path.join(FRONTEND_DIST_DIR, 'assets')
    if not os.path.isdir(assets_dir):
        return error_response(FRONTEND_BUILD_MISSING_MESSAGE, 503)
    return send_from_directory(assets_dir, filename)


@app.route('/submit_scan', methods=['POST'])
def submit_scan():
    current_user_uid = session.get('current_user_uid')

    if not current_user_uid:
        return error_response(SCAN_CARD_MESSAGE)

    data = request.get_json(silent=True) or {}
    barcodes = normalize_barcodes(data.get('barcodes'))
    if not barcodes:
        return error_response(SCAN_BARCODE_MESSAGE)

    connection = get_db_connection()
    try:
        cursor = connection.cursor()
        placeholders = ', '.join('?' for _ in barcodes)
        cursor.execute(f'SELECT name, barcode, status FROM laptops WHERE barcode IN ({placeholders});', barcodes)
        laptop_rows = cursor.fetchall()
        laptops_by_barcode = {row['barcode']: dict(row) for row in laptop_rows}

        missing_barcodes = [barcode for barcode in barcodes if barcode not in laptops_by_barcode]
        if missing_barcodes:
            missing_text = ', '.join(missing_barcodes)
            return error_response(
                f'Эти устройства не найдены: {missing_text}. / These devices were not found: {missing_text}.'
            )

        unavailable_barcodes = [barcode for barcode in barcodes if laptops_by_barcode[barcode]['status'] == 'unavailable']
        if unavailable_barcodes:
            unavailable_text = ', '.join(unavailable_barcodes)
            return error_response(
                f'Эти устройства уже выданы: {unavailable_text}. / These devices are already checked out: {unavailable_text}.'
            )

        device_names = [laptops_by_barcode[barcode]['name'] for barcode in barcodes]
        cursor.executemany("UPDATE laptops SET status = 'unavailable' WHERE barcode = ?;", [(barcode,) for barcode in barcodes])
        cursor.executemany(
            'INSERT INTO laptop_bookings (uid, laptop_name) VALUES (?, ?);',
            [(current_user_uid, device_name) for device_name in device_names]
        )
        cursor.executemany(
            'INSERT INTO laptop_history (uid, laptop_name, action) VALUES (?, ?, ?);',
            [(current_user_uid, device_name, 'booked') for device_name in device_names]
        )

        recompute_laptop_status(connection)
        connection.commit()
        clear_user_session()
        return success_response(
            'Устройства успешно выданы. / Devices checked out successfully.',
            redirect_url='/'
        )
    except Exception as error:
        connection.rollback()
        logging.error(f'Booking error: {error}')
        return error_response(GENERIC_ERROR_MESSAGE, 500)
    finally:
        connection.close()


@app.route('/clear_session', methods=['POST'])
def clear_session():
    clear_user_session()
    return success_response('Сессия очищена. / Session cleared.')


@app.route('/check_laptop', methods=['POST'])
def check_laptop():
    data = request.get_json(silent=True) or {}
    barcode = (data.get('barcode') or '').strip()
    if not barcode:
        return error_response('Отсканируйте или введите штрихкод. / Please scan or enter a barcode.')

    connection = get_db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute('SELECT 1 FROM laptops WHERE barcode = ? LIMIT 1;', (barcode,))
        result = cursor.fetchone()
        if result:
            return success_response('Устройство найдено. / Device found.')
        return error_response('Это устройство не найдено. / This device was not found.')
    except Exception as error:
        logging.error(f'Check laptop error: {error}')
        return error_response(
            'Сейчас не удаётся проверить это устройство. / Unable to check this device right now.',
            500
        )
    finally:
        connection.close()


@app.route('/get_laptop_status', methods=['GET'])
def get_laptop_status():
    recompute_laptop_status()
    return jsonify({'laptop_count': laptop_status})


@app.route('/home_state', methods=['GET'])
def home_state():
    consume_pending_uid_scan()
    recompute_laptop_status()
    return jsonify(build_home_state())


@app.route('/admin_state', methods=['GET'])
def admin_state():
    return jsonify({
        'admin_redirect': bool(session.get('redirect_to_admin_page')),
        'admin_session_active': is_admin_session_active(),
        'last_detected_uid': last_detected_uid
    })


@app.route('/debug/last_scan', methods=['GET'])
def debug_last_scan():
    return jsonify({'success': True, 'last_detected_uid': last_detected_uid})


@app.route('/debug/scan_uid', methods=['POST'])
def debug_scan_uid():
    if not ENABLE_LOCAL_DEBUG_SDK:
        return error_response('Локальная отладка отключена. / Local debug mode is disabled.', 403)

    if not is_local_request():
        return error_response('Разрешено только локально. / Allowed only from localhost.', 403)

    data = request.get_json(silent=True) or {}
    uid = str(data.get('uid') or '').strip()

    if not uid:
        return error_response('Введите UID для симуляции. / Enter a UID to simulate.')

    success, message = apply_uid_scan_for_request(uid)
    if not success:
        return error_response(message, 400)

    return success_response(
        message,
        redirect_admin=bool(session.get('redirect_to_admin_page')),
        redirect_user=bool(session.get('redirect_to_hello_page')),
        last_detected_uid=last_detected_uid
    )


@app.route('/')
def index():
    global redirect_to_scan_page

    consume_pending_uid_scan()
    recompute_laptop_status()
    if session.get('redirect_to_admin_page'):
        return send_from_directory(FRONTEND_DIST_DIR, 'admin.html')
    if redirect_to_scan_page:
        redirect_to_scan_page = False
        return send_from_directory(FRONTEND_DIST_DIR, 'scan_page.html')
    if session.get('redirect_to_hello_page'):
        return send_from_directory(FRONTEND_DIST_DIR, 'hello_page.html')

    clear_user_session()
    session.pop('redirect_to_admin_page', None)
    return serve_frontend_page('index.html')


@app.route('/scan_page')
def scan_page():
    return serve_frontend_page('scan_page.html')


@app.route('/hello_page')
def hello_page():
    session.pop('redirect_to_hello_page', None)
    return serve_frontend_page('hello_page.html')


@app.route('/return_page')
def return_page():
    return serve_frontend_page('return_page.html')


@app.route('/check-redirect')
def check_redirect():
    return jsonify({
        'redirect': bool(session.get('redirect_to_hello_page')),
        'admin_redirect': bool(session.get('redirect_to_admin_page'))
    })


@app.route('/admin')
def admin_page():
    session.pop('redirect_to_admin_page', None)
    return serve_frontend_page('admin.html')


@app.route('/admin/login', methods=['POST'])
def admin_login():
    data = request.get_json(silent=True) or {}
    pin = str(data.get('pin') or '').strip()

    if not pin:
        return error_response('Введите PIN-код. / Enter the PIN code.')

    if hash_pin(pin) != hash_pin(ADMIN_PIN):
        return error_response('Неверный PIN-код. / Invalid PIN code.', 401)

    token = create_admin_session()
    return success_response(
        'Вход администратора выполнен. / Admin login successful.',
        admin_token=token,
        redirect_url='/admin'
    )


@app.route('/admin/logout', methods=['POST'])
def admin_logout():
    clear_admin_session()
    return success_response('Выход выполнен. / Logged out.')


@app.route('/admin/overview', methods=['GET'])
def admin_overview():
    auth_error = require_admin()
    if auth_error:
        return auth_error

    users, laptops = fetch_admin_dashboard_data()
    return jsonify({'success': True, 'users': users, 'laptops': laptops})


@app.route('/admin/users', methods=['POST'])
def admin_add_user():
    auth_error = require_admin()
    if auth_error:
        return auth_error

    data = request.get_json(silent=True) or {}
    uid = str(data.get('uid') or '').strip()
    name = str(data.get('name') or '').strip()
    is_admin = bool(data.get('is_admin'))
    role = 'admin' if is_admin else 'user'

    if not uid:
        return error_response('Введите UID. / Enter UID.')

    connection = get_db_connection()
    try:
        connection.execute(
            'INSERT INTO users (uid, name, role, is_admin) VALUES (?, ?, ?, ?);',
            (uid, name or uid, role, 1 if is_admin else 0)
        )
        connection.commit()
        return success_response('Пользователь добавлен. / User added.')
    except sqlite3.IntegrityError:
        return error_response('Такой UID уже существует. / This UID already exists.')
    finally:
        connection.close()


@app.route('/admin/users/<uid>', methods=['DELETE'])
def admin_delete_user(uid):
    auth_error = require_admin()
    if auth_error:
        return auth_error

    connection = get_db_connection()
    try:
        connection.execute('DELETE FROM laptop_bookings WHERE uid = ?;', (uid,))
        connection.execute('DELETE FROM users WHERE uid = ?;', (uid,))
        connection.commit()
        return success_response('Пользователь удалён. / User deleted.')
    finally:
        connection.close()


@app.route('/admin/laptops', methods=['POST'])
def admin_add_laptop():
    auth_error = require_admin()
    if auth_error:
        return auth_error

    data = request.get_json(silent=True) or {}
    name = str(data.get('name') or '').strip()
    barcode = str(data.get('barcode') or '').strip()
    status = str(data.get('status') or 'available').strip().lower()

    if not name:
        return error_response('Введите имя устройства. / Enter device name.')

    if not barcode:
        return error_response('Введите штрихкод устройства. / Enter device barcode.')

    if status not in {'available', 'unavailable'}:
        status = 'available'

    connection = get_db_connection()
    try:
        connection.execute('INSERT INTO laptops (name, barcode, status) VALUES (?, ?, ?);', (name, barcode, status))
        connection.commit()
        recompute_laptop_status(connection)
        return success_response('Устройство добавлено. / Device added.')
    except sqlite3.IntegrityError:
        return error_response('Такое устройство или штрихкод уже существует. / This device or barcode already exists.')
    finally:
        connection.close()


@app.route('/admin/laptops/<name>', methods=['DELETE'])
def admin_delete_laptop(name):
    auth_error = require_admin()
    if auth_error:
        return auth_error

    connection = get_db_connection()
    try:
        connection.execute('DELETE FROM laptop_bookings WHERE laptop_name = ?;', (name,))
        connection.execute('DELETE FROM laptops WHERE name = ?;', (name,))
        connection.commit()
        recompute_laptop_status(connection)
        return success_response('Устройство удалено. / Device deleted.')
    finally:
        connection.close()


@app.route('/check_user_laptops', methods=['POST'])
def check_user_laptops():
    current_user_uid = session.get('current_user_uid')

    if not current_user_uid:
        return error_response(SCAN_CARD_MESSAGE)

    connection = get_db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute('SELECT COUNT(*) FROM laptop_bookings WHERE uid = ?;', (current_user_uid,))
        result = cursor.fetchone()[0]
        if result > 0:
            return success_response('Найдены выданные устройства. / Borrowed devices found.')
        return error_response(
            'Для этой карты нет выданных устройств. / No borrowed devices were found for this card.'
        )
    except Exception as error:
        logging.error(f'Check user laptops error: {error}')
        return error_response(
            'Сейчас не удаётся проверить выданные устройства. / Unable to check borrowed devices right now.',
            500
        )
    finally:
        connection.close()


@app.route('/return_laptops', methods=['POST'])
def return_laptops():
    current_user_uid = session.get('current_user_uid')

    if not current_user_uid:
        return error_response(SCAN_CARD_MESSAGE)

    data = request.get_json(silent=True) or {}
    barcodes = normalize_barcodes(data.get('barcodes'))
    if not barcodes:
        return error_response(SCAN_BARCODE_MESSAGE)

    connection = get_db_connection()
    try:
        cursor = connection.cursor()
        placeholders = ', '.join('?' for _ in barcodes)
        cursor.execute(
            f'''
            SELECT lb.laptop_name, l.barcode
            FROM laptop_bookings lb
            JOIN laptops l ON l.name = lb.laptop_name
            WHERE lb.uid = ? AND l.barcode IN ({placeholders});
            ''',
            [current_user_uid, *barcodes]
        )
        borrowed_rows = cursor.fetchall()
        borrowed_by_barcode = {row['barcode']: row['laptop_name'] for row in borrowed_rows}
        borrowed_laptops = [barcode for barcode in barcodes if barcode in borrowed_by_barcode]
        not_borrowed_laptops = [barcode for barcode in barcodes if barcode not in borrowed_by_barcode]

        if not_borrowed_laptops:
            not_borrowed_text = ', '.join(not_borrowed_laptops)
            return error_response(
                f'Эти устройства не числятся за этой картой: {not_borrowed_text}. / '
                f'These devices are not checked out on this card: {not_borrowed_text}.'
            )

        returned_names = [borrowed_by_barcode[barcode] for barcode in borrowed_laptops]
        cursor.executemany("UPDATE laptops SET status = 'available' WHERE name = ?;", [(name,) for name in returned_names])
        cursor.executemany(
            'DELETE FROM laptop_bookings WHERE uid = ? AND laptop_name = ?;',
            [(current_user_uid, name) for name in returned_names]
        )
        cursor.executemany(
            'INSERT INTO laptop_history (uid, laptop_name, action) VALUES (?, ?, ?);',
            [(current_user_uid, name, 'returned') for name in returned_names]
        )

        recompute_laptop_status(connection)
        connection.commit()
        clear_user_session()
        return success_response('Устройства успешно возвращены. / Devices returned successfully.')
    except Exception as error:
        connection.rollback()
        logging.error(f'Return laptops error: {error}')
        return error_response(GENERIC_ERROR_MESSAGE, 500)
    finally:
        connection.close()


@app.route('/send_arduino_signal', methods=['POST'])
def send_arduino_signal():
    try:
        if ser and ser.is_open:
            ser.write(b'0\n')
            return success_response('Сигнал отправлен. / Signal sent.')
        return error_response('Контроллер станции не подключён. / Station controller is not connected.', 503)
    except Exception as error:
        logging.error(f'Arduino signal error: {error}')
        return error_response(
            'Не удаётся связаться с контроллером станции. / Unable to contact the station controller.',
            500
        )


@app.route('/send_arduino_signal_on', methods=['POST'])
def send_arduino_signal_on():
    try:
        if ser and ser.is_open:
            ser.write(b'1\n')
            return success_response('Сигнал отправлен. / Signal sent.')
        return error_response('Контроллер станции не подключён. / Station controller is not connected.', 503)
    except Exception as error:
        logging.error(f'Arduino signal error: {error}')
        return error_response(
            'Не удаётся связаться с контроллером станции. / Unable to contact the station controller.',
            500
        )


def cleanup():
    stop_event.set()
    time.sleep(0.2)
    if ser and ser.is_open:
        ser.close()


def start():
    if START_ARDUINO_THREAD:
        arduino_thread_instance = threading.Thread(target=arduino_thread, daemon=True)
        arduino_thread_instance.start()

    if ENABLE_WEBVIEW and webview is not None:
        flask_thread = threading.Thread(target=run_flask, daemon=True)
        flask_thread.start()
        try:
            time.sleep(2)
            webview.create_window('SmartBox', f'http://{FLASK_HOST}:{FLASK_PORT}', fullscreen=True)
            webview.start(gui='qt')
        except KeyboardInterrupt:
            print('Shutting down server.')
    else:
        run_flask()


atexit.register(cleanup)
init_db()
