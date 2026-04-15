import argparse
import json
import os
import sqlite3


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.getenv('DATA_DIR', os.path.join(BASE_DIR, 'data'))
DB_PATH = os.getenv('SQLITE_PATH', os.path.join(DATA_DIR, 'smart-box.db'))
SEED_PATH = os.getenv('SEED_PATH', os.path.join(BASE_DIR, 'seed_data.json'))

os.makedirs(DATA_DIR, exist_ok=True)


def get_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    connection = get_connection()
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
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';")
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;")
        except sqlite3.OperationalError:
            pass
        cursor.execute(
            '''
            CREATE TABLE IF NOT EXISTS laptops (
                name TEXT PRIMARY KEY,
                barcode TEXT UNIQUE,
                status TEXT NOT NULL CHECK(status IN ('available', 'unavailable'))
            );
            '''
        )
        try:
            cursor.execute('ALTER TABLE laptops ADD COLUMN barcode TEXT;')
        except sqlite3.OperationalError:
            pass
        cursor.execute("UPDATE laptops SET barcode = name WHERE barcode IS NULL OR TRIM(barcode) = '';" )
        cursor.execute(
            '''
            CREATE TABLE IF NOT EXISTS laptop_bookings (
                uid TEXT NOT NULL,
                laptop_name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (uid, laptop_name)
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
        connection.commit()
    finally:
        connection.close()


def load_seed():
    if not os.path.exists(SEED_PATH):
        raise FileNotFoundError(f'Seed file not found: {SEED_PATH}')

    with open(SEED_PATH, 'r', encoding='utf-8') as seed_file:
        return json.load(seed_file)


def seed_db():
    data = load_seed()
    users = data.get('users', [])
    laptops = data.get('laptops', [])

    connection = get_connection()
    try:
        cursor = connection.cursor()

        for user in users:
            uid = (user.get('uid') or '').strip()
            name = (user.get('name') or '').strip() or uid
            role = (user.get('role') or 'user').strip().lower()
            is_admin = 1 if user.get('is_admin', False) or role == 'admin' else 0
            if role not in {'user', 'admin'}:
                role = 'admin' if is_admin else 'user'
            if uid:
                cursor.execute(
                    'INSERT OR IGNORE INTO users (uid, name, role, is_admin) VALUES (?, ?, ?, ?);',
                    (uid, name, role, is_admin)
                )

        for laptop in laptops:
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
                cursor.execute(
                    'INSERT OR IGNORE INTO laptops (name, barcode, status) VALUES (?, ?, ?);',
                    (name, barcode or name, status)
                )

        connection.commit()
    finally:
        connection.close()


def reset_db():
    connection = get_connection()
    try:
        cursor = connection.cursor()
        cursor.execute('DELETE FROM laptop_history;')
        cursor.execute('DELETE FROM laptop_bookings;')
        cursor.execute('DELETE FROM laptops;')
        cursor.execute('DELETE FROM users;')
        connection.commit()
    finally:
        connection.close()


def add_user(uid, name, is_admin=False):
    connection = get_connection()
    try:
        connection.execute(
            'INSERT INTO users (uid, name, role, is_admin) VALUES (?, ?, ?, ?);',
            (uid.strip(), (name or uid).strip(), 'admin' if is_admin else 'user', 1 if is_admin else 0)
        )
        connection.commit()
    finally:
        connection.close()


def remove_user(uid):
    connection = get_connection()
    try:
        connection.execute('DELETE FROM users WHERE uid = ?;', (uid.strip(),))
        connection.commit()
    finally:
        connection.close()


def add_laptop(name, barcode, status):
    connection = get_connection()
    try:
        connection.execute(
            'INSERT INTO laptops (name, barcode, status) VALUES (?, ?, ?);',
            (name.strip(), (barcode or name).strip(), status)
        )
        connection.commit()
    finally:
        connection.close()


def remove_laptop(name):
    connection = get_connection()
    try:
        connection.execute('DELETE FROM laptop_bookings WHERE laptop_name = ?;', (name.strip(),))
        connection.execute('DELETE FROM laptops WHERE name = ?;', (name.strip(),))
        connection.commit()
    finally:
        connection.close()


def list_table(table_name):
    connection = get_connection()
    try:
        rows = connection.execute(f'SELECT * FROM {table_name} ORDER BY 1;').fetchall()
        for row in rows:
            print(dict(row))
        if not rows:
            print(f'No rows in {table_name}.')
    finally:
        connection.close()


def build_parser():
    parser = argparse.ArgumentParser(description='Manage the smart-box SQLite database.')
    subparsers = parser.add_subparsers(dest='command', required=True)

    subparsers.add_parser('init-db')
    subparsers.add_parser('seed-db')
    subparsers.add_parser('reset-db')

    add_user_parser = subparsers.add_parser('add-user')
    add_user_parser.add_argument('--uid', required=True)
    add_user_parser.add_argument('--name', default='')
    add_user_parser.add_argument('--admin', action='store_true')

    remove_user_parser = subparsers.add_parser('remove-user')
    remove_user_parser.add_argument('--uid', required=True)

    add_laptop_parser = subparsers.add_parser('add-laptop')
    add_laptop_parser.add_argument('--name', required=True)
    add_laptop_parser.add_argument('--barcode', default='')
    add_laptop_parser.add_argument('--status', default='available', choices=['available', 'unavailable'])

    remove_laptop_parser = subparsers.add_parser('remove-laptop')
    remove_laptop_parser.add_argument('--name', required=True)

    list_users_parser = subparsers.add_parser('list-users')
    list_users_parser.set_defaults(table='users')

    list_laptops_parser = subparsers.add_parser('list-laptops')
    list_laptops_parser.set_defaults(table='laptops')

    list_bookings_parser = subparsers.add_parser('list-bookings')
    list_bookings_parser.set_defaults(table='laptop_bookings')

    list_history_parser = subparsers.add_parser('list-history')
    list_history_parser.set_defaults(table='laptop_history')

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    if args.command == 'init-db':
        init_db()
    elif args.command == 'seed-db':
        init_db()
        seed_db()
    elif args.command == 'reset-db':
        init_db()
        reset_db()
    elif args.command == 'add-user':
        add_user(args.uid, args.name, args.admin)
    elif args.command == 'remove-user':
        remove_user(args.uid)
    elif args.command == 'add-laptop':
        add_laptop(args.name, args.barcode, args.status)
    elif args.command == 'remove-laptop':
        remove_laptop(args.name)
    elif args.command.startswith('list-'):
        list_table(args.table)


if __name__ == '__main__':
    main()
