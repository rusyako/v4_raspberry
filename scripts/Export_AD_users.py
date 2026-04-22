import argparse
import csv
import os
import sqlite3
import uuid

from ldap3 import ALL, SUBTREE, Connection, Server


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.getenv('DATA_DIR', os.path.join(BASE_DIR, 'data'))
DB_PATH = os.getenv('SQLITE_PATH', os.path.join(DATA_DIR, 'smart-box.db'))

# --- Настройки подключения ---
AD_SERVER = os.getenv('AD_SERVER', '192.168.100.1')
AD_USER = os.getenv('AD_USER', 'hta\\sync')
AD_PASSWORD = os.getenv('AD_PASSWORD', '')
SEARCH_BASE = os.getenv('AD_SEARCH_BASE', 'OU=Users,OU=Corporate,DC=hta,DC=local')
EXPORT_CSV_PATH = os.getenv('AD_EXPORT_CSV_PATH', os.path.join(DATA_DIR, 'ad_users_export.csv'))


def reverse_uid_hex_bytes(hex_uid):
    pairs = [hex_uid[index:index + 2] for index in range(0, len(hex_uid), 2)]
    return ''.join(reversed(pairs))


def normalize_uid_value(raw_uid):
    normalized = str(raw_uid or '').strip().upper()
    normalized = ''.join(character for character in normalized if character not in {' ', ':', '-'})
    if normalized.startswith('0X'):
        normalized = normalized[2:]
    return normalized


def build_uid_forms(raw_uid):
    normalized = normalize_uid_value(raw_uid)
    if not normalized:
        return {'raw': '', 'uid_hex': '', 'uid_dec': ''}

    if normalized.isdigit():
        decimal_value = int(normalized, 10)
        if decimal_value < 0 or decimal_value > 0xFFFFFFFF:
            return {'raw': normalized, 'uid_hex': '', 'uid_dec': ''}

        direct_hex = f'{decimal_value:08X}'
        return {
            'raw': normalized,
            'uid_hex': reverse_uid_hex_bytes(direct_hex),
            'uid_dec': str(decimal_value)
        }

    if 1 <= len(normalized) <= 8 and all(character in '0123456789ABCDEF' for character in normalized):
        padded_hex = normalized.rjust(8, '0')
        return {
            'raw': normalized,
            'uid_hex': padded_hex,
            'uid_dec': str(int(reverse_uid_hex_bytes(padded_hex), 16))
        }

    return {'raw': normalized, 'uid_hex': '', 'uid_dec': ''}


def normalize_guid(raw_guid):
    guid_value = str(raw_guid or '').strip().strip('{}')
    if not guid_value:
        return ''

    try:
        return str(uuid.UUID(guid_value)).lower()
    except ValueError:
        return guid_value.lower()


def compose_full_name(first_name, last_name, fallback=''):
    full_name = ' '.join(part for part in (str(first_name or '').strip(), str(last_name or '').strip()) if part)
    return full_name or str(fallback or '').strip()


def get_entry_value(entry, attribute_name):
    value = getattr(entry, attribute_name, '')
    if hasattr(value, 'value'):
        value = value.value
    return str(value or '').strip()


def validate_required_fields(record):
    missing = []
    for field_name in ('guid', 'first_name', 'last_name', 'email'):
        if not record.get(field_name):
            missing.append(field_name)
    return missing


def detect_category(distinguished_name):
    if 'OU=Students' in distinguished_name:
        return 'Students'

    if 'OU=IT Departament' in distinguished_name:
        return 'IT'

    if 'OU=Staff' in distinguished_name:
        parts = distinguished_name.split(',')
        for index, part in enumerate(parts):
            if 'OU=Staff' in part and index > 0:
                return parts[index - 1].replace('OU=', '')
        return 'Staff'

    return 'Other'


def ensure_users_schema(connection):
    cursor = connection.cursor()
    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS users (
            guid TEXT PRIMARY KEY,
            uid TEXT UNIQUE,
            uid_hex TEXT,
            uid_dec TEXT,
            name TEXT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            email TEXT,
            description TEXT,
            category TEXT,
            role TEXT NOT NULL DEFAULT 'user',
            is_admin INTEGER NOT NULL DEFAULT 0
        );
        '''
    )

    for statement in (
        'ALTER TABLE users ADD COLUMN guid TEXT;',
        'ALTER TABLE users ADD COLUMN uid TEXT;',
        'ALTER TABLE users ADD COLUMN uid_hex TEXT;',
        'ALTER TABLE users ADD COLUMN uid_dec TEXT;',
        'ALTER TABLE users ADD COLUMN name TEXT;',
        'ALTER TABLE users ADD COLUMN first_name TEXT;',
        'ALTER TABLE users ADD COLUMN last_name TEXT;',
        'ALTER TABLE users ADD COLUMN email TEXT;',
        'ALTER TABLE users ADD COLUMN description TEXT;',
        'ALTER TABLE users ADD COLUMN category TEXT;',
        "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';",
        'ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;'
    ):
        try:
            cursor.execute(statement)
        except sqlite3.OperationalError:
            pass

    cursor.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_guid ON users (guid);')
    cursor.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_uid ON users (uid);')
    connection.commit()


def upsert_user(connection, user_record):
    cursor = connection.cursor()
    cursor.execute('SELECT guid FROM users WHERE guid = ? LIMIT 1;', (user_record['guid'],))
    existing_user = cursor.fetchone()

    if existing_user:
        cursor.execute(
            '''
            UPDATE users
            SET uid = ?, uid_hex = ?, uid_dec = ?, name = ?, first_name = ?, last_name = ?, email = ?, description = ?, category = ?
            WHERE guid = ?;
            ''',
            (
                user_record['uid'],
                user_record['uid_hex'],
                user_record['uid_dec'],
                user_record['name'],
                user_record['first_name'],
                user_record['last_name'],
                user_record['email'],
                user_record['description'],
                user_record['category'],
                user_record['guid'],
            )
        )
        return 'updated'

    cursor.execute(
        '''
        INSERT INTO users (guid, uid, uid_hex, uid_dec, name, first_name, last_name, email, description, category, role, is_admin)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        ''',
        (
            user_record['guid'],
            user_record['uid'],
            user_record['uid_hex'],
            user_record['uid_dec'],
            user_record['name'],
            user_record['first_name'],
            user_record['last_name'],
            user_record['email'],
            user_record['description'],
            user_record['category'],
            'user',
            0
        )
    )
    return 'inserted'


def write_csv(records, csv_path):
    os.makedirs(os.path.dirname(csv_path), exist_ok=True)
    with open(csv_path, 'w', newline='', encoding='utf-8-sig') as csv_file:
        writer = csv.DictWriter(
            csv_file,
            fieldnames=['guid', 'first_name', 'last_name', 'name', 'email', 'description', 'category', 'uid', 'uid_hex', 'uid_dec']
        )
        writer.writeheader()
        writer.writerows(records)


def build_parser():
    parser = argparse.ArgumentParser(description='Export Active Directory users into Smart Box database or CSV.')
    parser.add_argument('--csv', default='', help='Write normalized AD users to CSV instead of database.')
    parser.add_argument('--db', default=DB_PATH, help='SQLite database path.')
    return parser


def main():
    args = build_parser().parse_args()
    os.makedirs(DATA_DIR, exist_ok=True)

    server = Server(AD_SERVER, get_info=ALL)
    target_db_path = args.db
    export_records = []

    with sqlite3.connect(target_db_path) as connection:
        connection.row_factory = sqlite3.Row
        if not args.csv:
            ensure_users_schema(connection)

        inserted_count = 0
        updated_count = 0
        skipped_count = 0

        with Connection(server, user=AD_USER, password=AD_PASSWORD, auto_bind=True) as conn:
            search_filter = '(&(objectClass=user)(objectCategory=person)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))'
            attrs = [
                'givenName', 'sn', 'mail', 'description', 'homePhone', 'distinguishedName', 'objectGUID'
            ]

            print(f'[*] Выполняю поиск в {SEARCH_BASE}...')
            conn.search(
                search_base=SEARCH_BASE,
                search_filter=search_filter,
                search_scope=SUBTREE,
                attributes=attrs
            )

            print(f'[*] Найдено объектов в AD: {len(conn.entries)}')

            for entry in conn.entries:
                distinguished_name = get_entry_value(entry, 'distinguishedName')
                category = detect_category(distinguished_name)
                if category == 'Other':
                    continue

                guid = normalize_guid(get_entry_value(entry, 'objectGUID'))
                rfid = get_entry_value(entry, 'homePhone')
                first_name = get_entry_value(entry, 'givenName')
                last_name = get_entry_value(entry, 'sn')
                email = get_entry_value(entry, 'mail')
                description = get_entry_value(entry, 'description')

                uid_forms = build_uid_forms(rfid)
                primary_uid = uid_forms['uid_hex'] or uid_forms['raw']

                user_record = {
                    'guid': guid,
                    'uid': primary_uid or None,
                    'uid_hex': uid_forms['uid_hex'] or None,
                    'uid_dec': uid_forms['uid_dec'] or None,
                    'name': compose_full_name(first_name, last_name, guid),
                    'first_name': first_name,
                    'last_name': last_name,
                    'email': email,
                    'description': description or None,
                    'category': description or category
                }

                missing_fields = validate_required_fields(user_record)
                if missing_fields:
                    skipped_count += 1
                    print(f'[!] Пропуск пользователя без обязательных полей ({", ".join(missing_fields)}): {distinguished_name}')
                    continue

                if rfid and not primary_uid:
                    skipped_count += 1
                    print(f'[!] Пропуск пользователя с некорректным RFID в Phone (H): {guid} -> {rfid}')
                    continue

                export_records.append(user_record)

                if args.csv:
                    continue

                result = upsert_user(connection, user_record)
                if result == 'inserted':
                    inserted_count += 1
                else:
                    updated_count += 1

        if args.csv:
            write_csv(export_records, args.csv or EXPORT_CSV_PATH)
        else:
            connection.commit()
        print(
            f'[+] Импорт завершен. Добавлено: {inserted_count}, обновлено: {updated_count}, пропущено: {skipped_count}. База: {target_db_path}'
        )


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'[!] Ошибка: {error}')
