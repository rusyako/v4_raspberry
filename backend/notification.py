import logging
import os
import smtplib
import sqlite3
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

DB_PATH = os.getenv('SQLITE_PATH', os.path.join(os.path.dirname(__file__), '..', 'data', 'smart-box.db'))
SMTP_HOST = os.getenv('SMTP_HOST', '').strip()
SMTP_PORT = int(os.getenv('SMTP_PORT', '587'))
SMTP_USER = os.getenv('SMTP_USER', '').strip()
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD', '').strip()
SMTP_FROM = os.getenv('SMTP_FROM', 'noreply@smart-box.local').strip()

logger = logging.getLogger('reminder')


def get_db_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def send_email(recipients, subject, body):
    if not SMTP_HOST:
        for recipient in recipients:
            logger.info(f'[NOTIFICATION] To: {recipient} | Subject: {subject}')
            logger.info(f'[NOTIFICATION] Body:\n{body}')
        return

    try:
        msg = MIMEMultipart()
        msg['From'] = SMTP_FROM
        msg['To'] = ', '.join(recipients)
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain', 'utf-8'))

        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15)
        server.starttls()
        if SMTP_USER and SMTP_PASSWORD:
            server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_FROM, recipients, msg.as_string())
        server.quit()
        logger.info(f'Sent reminder to {recipients}: {subject}')
    except Exception as error:
        logger.error(f'Failed to send email to {recipients}: {error}')


def run_daily_reminder():
    connection = get_db_connection()
    try:
        cursor = connection.cursor()

        cursor.execute(
            '''
            SELECT employee_uid, employee_name, employee_email, device_number, barcode, device_name
            FROM borrow_records
            WHERE status = 'active'
            ORDER BY employee_name;
            '''
        )
        active = [dict(row) for row in cursor.fetchall()]
        if not active:
            logger.info('No active borrows. Skipping reminder.')
            return

        # Group by employee
        user_devices = {}
        for record in active:
            uid = record['employee_uid'] or 'unknown'
            if uid not in user_devices:
                user_devices[uid] = {
                    'name': record['employee_name'] or uid,
                    'email': record['employee_email'] or '',
                    'devices': []
                }
            user_devices[uid]['devices'].append(record)

        # Send to each user
        for uid, info in user_devices.items():
            if not info['email']:
                logger.info(f'Skipping {uid} ({info["name"]}) — no email')
                continue

            device_list = '\n'.join(
                f'- {d["barcode"] or d["device_number"] or d["device_name"]}'
                for d in info['devices']
            )
            body = (
                f'Здравствуйте, {info["name"]}.\n\n'
                f'По нашим данным, следующие устройства до сих пор числятся за Вами:\n'
                f'{device_list}\n\n'
                f'Пожалуйста, верните их при первой возможности.\n'
                f'Если Вы уже вернули устройства — проигнорируйте это сообщение.\n\n'
                f'SmartBox'
            )
            send_email(
                [info['email']],
                'SmartBox — напоминание о возврате устройств',
                body
            )

        # Send summary to watchers
        cursor.execute(
            "SELECT name, email FROM users WHERE notify_reminder = 1 AND email IS NOT NULL AND TRIM(email) != '';"
        )
        watchers = [dict(row) for row in cursor.fetchall()]

        if not watchers:
            logger.info('No watchers configured.')
            return

        summary_lines = []
        for idx, (uid, info) in enumerate(user_devices.items(), 1):
            if not info['email']:
                continue
            device_list = ', '.join(
                d['barcode'] or d['device_number'] or d['device_name']
                for d in info['devices']
            )
            summary_lines.append(
                f'{idx}. {info["name"]} — {len(info["devices"])} устройств({info["email"]}): {device_list}'
            )

        if summary_lines:
            watcher_emails = [w['email'] for w in watchers]
            summary_body = (
                'Здравствуйте.\n\n'
                'Следующие пользователи не вернули устройства:\n\n'
                + '\n'.join(summary_lines) +
                '\n\nSmartBox'
            )
            send_email(
                watcher_emails,
                'SmartBox — пользователи с невозвращёнными устройствами',
                summary_body
            )
    finally:
        connection.close()


def main():
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s %(levelname).1s reminder: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    run_daily_reminder()


if __name__ == '__main__':
    main()
