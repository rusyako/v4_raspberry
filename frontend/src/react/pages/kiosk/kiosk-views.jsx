import { useEffect, useRef, useState } from 'react';
import { postJson } from '../../shared/api';
import { LanguageSwitcher } from '../../shared/language-switcher';
import { writeStoredArray } from '../../shared/storage';
import { formatDateTimeGmtPlus5 } from '../../shared/time';
import { BARCODE_PATTERN, IT_SUPPORT_EMAIL, IT_SUPPORT_PHONE, IT_SUPPORT_REQUEST_URL, KIOSK_IMAGES } from './constants';

function groupBorrowedRecordsByEmployee(records) {
  const groups = new Map();

  records.forEach((record) => {
    const employeeUid = record.employee_uid || 'unknown';
    const existingGroup = groups.get(employeeUid);

    if (existingGroup) {
      existingGroup.devices.push(record);
      return;
    }

    groups.set(employeeUid, {
      employeeUid,
      employeeName: record.employee_name || record.employee_uid,
      devices: [record]
    });
  });

  return Array.from(groups.values()).map((group) => ({
    ...group,
    devices: group.devices.sort((left, right) => String(right.taken_at || '').localeCompare(String(left.taken_at || '')))
  }));
}

function formatCompactTemperature(value) {
  const match = String(value || '').match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return '--';
  }

  return `${Number.parseFloat(match[0]).toFixed(1)}°`;
}

export function KioskHomeView({
  language,
  setLanguage,
  stationCellsStatus,
  temperature1,
  temperature2,
  activeBorrowedRecords,
  isActiveBorrowedLoading,
  t
}) {
  const groupedBorrowedRecords = groupBorrowedRecordsByEmployee(activeBorrowedRecords);
  const [selectedBorrowedGroup, setSelectedBorrowedGroup] = useState(null);
  const isDebugDevicesParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('debug_devices') : '';
  const isDebugDevices = isDebugDevicesParam !== null;
  const isDebugPreview = isDebugDevicesParam === 'preview';
  const displayStationCellsStatus = isDebugDevices ? '10/10' : stationCellsStatus;
  const displayTemperature1 = isDebugDevices ? '59°C' : temperature1;
  const displayTemperature2 = isDebugDevices ? '40°C' : temperature2;

  // --- DEBUG: тестовые карточки пользователей для проверки 1024x600 ---
  const debugRecords = [...groupedBorrowedRecords];
  if (isDebugDevices) {
    const makeDevices = (employeeUid, count, offset = 0) => Array.from({ length: count }, (_, i) => ({
      id: 9000 + offset + i,
      barcode: `2000000047${String(offset + i).padStart(4, '0')}`,
      employee_uid: employeeUid,
      taken_at: new Date(Date.now() - (i + 1 + offset) * 3600000).toISOString()
    }));

    debugRecords.unshift(
      {
        employeeUid: 'TEST-10',
        employeeName: 'Алиев Тимур',
        devices: makeDevices('TEST-10', 10, 0)
      },
      {
        employeeUid: 'TEST-1',
        employeeName: 'Смирнова Анна',
        devices: makeDevices('TEST-1', 1, 20)
      },
      {
        employeeUid: 'TEST-3',
        employeeName: 'Johnson Mark',
        devices: makeDevices('TEST-3', 3, 30)
      },
      {
        employeeUid: 'TEST-2',
        employeeName: 'Касымбек Нуржан',
        devices: makeDevices('TEST-2', 2, 40)
      },
      {
        employeeUid: 'TEST-4',
        employeeName: 'Петров Иван',
        devices: makeDevices('TEST-4', 4, 50)
      },
      {
        employeeUid: 'TEST-5',
        employeeName: 'Chen Lisa',
        devices: makeDevices('TEST-5', 5, 60)
      },
      {
        employeeUid: 'TEST-6',
        employeeName: 'Ибраев Данияр',
        devices: makeDevices('TEST-6', 6, 70)
      },
      {
        employeeUid: 'TEST-7',
        employeeName: 'Kim Sara',
        devices: makeDevices('TEST-7', 7, 80)
      },
      {
        employeeUid: 'TEST-8',
        employeeName: 'Омарова Алия',
        devices: makeDevices('TEST-8', 8, 90)
      },
      {
        employeeUid: 'TEST-9',
        employeeName: 'Brown Alex',
        devices: makeDevices('TEST-9', 9, 100)
      }
    );
  }
  // --- END DEBUG ---

  const sortedDebugRecords = [...debugRecords].sort((a, b) => b.devices.length - a.devices.length);

  useEffect(() => {
    if (isDebugPreview && sortedDebugRecords.length > 0) {
      const previewGroup = sortedDebugRecords.find((g) => g.employeeUid === 'TEST-3') || sortedDebugRecords[0];
      setSelectedBorrowedGroup(previewGroup);
    }
  }, [isDebugPreview, sortedDebugRecords]);

  return (
    <>
      <LanguageSwitcher language={language} setLanguage={setLanguage} />

      <main className="home-shell">
        <div className="home-content-grid">
          <section className="home-card home-card-borrowed">
            <div className="home-card-header home-card-header-column">
              <h2>{t.kiosk.activeBorrowedTitle}</h2>
            </div>

            {isActiveBorrowedLoading ? (
              <p className="home-borrowed-empty">...</p>
            ) : sortedDebugRecords.length ? (
              <ul className="home-borrowed-list home-borrowed-list-three-cols">
                {sortedDebugRecords.map((group) => (
                    <li
                      key={group.employeeUid}
                      className="home-borrowed-item"
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedBorrowedGroup(group)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedBorrowedGroup(group);
                        }
                      }}
                    >
                      <div className="home-borrowed-person-name">
                        {group.employeeName}
                        <span className="home-borrowed-count-inline">{group.devices.length}</span>
                      </div>
                      <div className="home-borrowed-card-time">
                        {formatDateTimeGmtPlus5(group.devices[0]?.taken_at, { language, compact: true })}
                      </div>
                    </li>
                  ))}
              </ul>
            ) : (
              <div className="home-borrowed-empty-state">
                <p className="home-borrowed-empty">{t.kiosk.activeBorrowedEmpty}</p>
              </div>
            )}
          </section>

          <div className="home-sidebar">
            <section className="home-card home-card-flags">
              <LanguageSwitcher language={language} setLanguage={setLanguage} />
              <aside className="home-sensors-overlay" aria-label={t.kiosk.temperatureSensorsLabel}>
                <article className="home-sensors-overlay-item" aria-label={`${t.kiosk.temperatureSensor1Label}: ${displayTemperature1}`} title={`${t.kiosk.temperatureSensor1Label}: ${displayTemperature1}`}>
                  <strong>{formatCompactTemperature(displayTemperature1)}</strong>
                </article>
                <article className="home-sensors-overlay-item" aria-label={`${t.kiosk.temperatureSensor2Label}: ${displayTemperature2}`} title={`${t.kiosk.temperatureSensor2Label}: ${displayTemperature2}`}>
                  <strong>{formatCompactTemperature(displayTemperature2)}</strong>
                </article>
              </aside>
            </section>

            <section className="home-card home-card-title">
              <div className="home-title-visual">
                <h2 className="home-borrowed-section-title">{t.kiosk.accessMessage}</h2>
                {KIOSK_IMAGES.comingSoonGif ? (
                  <img src={KIOSK_IMAGES.comingSoonGif} alt="Coming soon" className="home-coming-soon-image" />
                ) : (
                  <p className="home-title-soon">Скоро...</p>
                )}
              </div>
            </section>

            <section className="home-card home-card-info">
              <div className="home-card-info-content">
                <span>{t.kiosk.stationCellsLabel}</span>
                <strong>{displayStationCellsStatus}</strong>
              </div>
            </section>
          </div>
        </div>
      </main>

      {selectedBorrowedGroup ? (
        <div className="borrowed-modal-backdrop" onClick={() => setSelectedBorrowedGroup(null)}>
          <div className="borrowed-modal" onClick={(e) => e.stopPropagation()}>
            <header className="borrowed-modal-header">
              <div className="borrowed-modal-title" aria-label={selectedBorrowedGroup.employeeName}>{selectedBorrowedGroup.employeeName}</div>
              <span className="borrowed-modal-count">{selectedBorrowedGroup.devices.length}</span>
              <button
                type="button"
                className="borrowed-modal-close"
                onClick={() => setSelectedBorrowedGroup(null)}
                aria-label="Close"
              >
                ×
              </button>
            </header>

            <ul className="borrowed-modal-list">
              {selectedBorrowedGroup.devices.map((device) => (
                <li key={device.id} className="borrowed-modal-item">
                  <span className="borrowed-modal-device-name">{device.barcode || '-'}</span>
                  <span className="borrowed-modal-device-time">{formatDateTimeGmtPlus5(device.taken_at, { language, compact: true })}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ActionDeviceIcon({ type }) {
  const isReturn = type === 'return';

  return (
    <svg className="actions-device-icon" viewBox="0 0 140 140" aria-hidden="true" focusable="false">
      <rect className="actions-device-icon-box" x="34" y="50" width="72" height="58" rx="13" />
      <path className="actions-device-icon-lid" d="M44 50h52l-8-18H52z" />
      <path
        className="actions-device-icon-arrow"
        d={isReturn ? 'M98 42H69c-13 0-23 10-23 23v5' : 'M42 42h29c13 0 23 10 23 23v5'}
      />
      <path
        className="actions-device-icon-arrow"
        d={isReturn ? 'M55 59l-9 11-9-11' : 'M85 59l9 11 9-11'}
      />
      <circle className="actions-device-icon-dot" cx="70" cy="80" r="5" />
    </svg>
  );
}

export function KioskActionsView({ onTake, onReturn, onAdmin, isAdminUser, language, setLanguage, t, onBackToHome }) {
  return (
    <section className="actions-shell">
      <div className="actions-panel">
        <button type="button" className="actions-close-btn" onClick={onBackToHome} aria-label={t.common.backHome}>
          ×
        </button>

        <header className="actions-header">
          <p className="actions-kicker">{t.kiosk.sessionConfirmed}</p>
          <h1>{t.kiosk.stationTitle}</h1>
          <p>{t.kiosk.chooseNextAction}</p>
        </header>

        <div className="actions-grid-2col">
          <div className="actions-card-horiz actions-card-take" onClick={onTake}>
            <div className="actions-card-horiz-image">
              <ActionDeviceIcon type="take" />
            </div>
            <div className="actions-card-horiz-body">
              <span className="actions-card-horiz-title">{t.kiosk.checkOut}</span>
              <small className="actions-card-horiz-hint">{t.kiosk.checkOutHint}</small>
            </div>
          </div>

          <div className="actions-card-horiz actions-card-return" onClick={onReturn}>
            <div className="actions-card-horiz-image">
              <ActionDeviceIcon type="return" />
            </div>
            <div className="actions-card-horiz-body">
              <span className="actions-card-horiz-title">{t.kiosk.return}</span>
              <small className="actions-card-horiz-hint">{t.kiosk.returnHint}</small>
            </div>
          </div>
        </div>

        {isAdminUser && (
          <button type="button" className="actions-card-admin-full" onClick={onAdmin}>
            <span>{t.kiosk.adminPanel}</span>
            <small>{t.kiosk.adminPanelHint}</small>
          </button>
        )}
      </div>
    </section>
  );
}

export function KioskSessionView({
  title,
  description,
  placeholder,
  countLabel,
  submitLabel,
  storageKey,
  barcodes,
  onBarcodesChange,
  onCancel,
  onSubmit,
  showToast,
  language,
  setLanguage,
  t,
  mode = 'take',
  userBorrowedDevices = []
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function focusAndClear() {
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.focus();
    }
  }

  async function checkLaptop(barcode) {
    const data = await postJson('/check_laptop', { barcode });
    if (data.current_borrower && mode === 'take') {
      showToast('info', t.kiosk.deviceBorrowedTitle, t.kiosk.deviceBorrowedText.replace('{name}', data.current_borrower.name));
    }
  }

  async function handleKeyDown(event) {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    const barcode = event.currentTarget.value.trim();

    if (!barcode) {
      focusAndClear();
      return;
    }

    if (!BARCODE_PATTERN.test(barcode)) {
      showToast('error', t.kiosk.invalidBarcodeTitle, t.kiosk.invalidBarcodeText);
      focusAndClear();
      return;
    }

    if (barcodes.includes(barcode)) {
      showToast('info', t.kiosk.duplicateBarcodeTitle, t.kiosk.duplicateBarcodeText);
      focusAndClear();
      return;
    }

    try {
      await checkLaptop(barcode);
      const nextBarcodes = [...barcodes, barcode];
      onBarcodesChange(nextBarcodes);
      writeStoredArray(storageKey, nextBarcodes);
      focusAndClear();
    } catch (error) {
      showToast('error', t.kiosk.checkFailedTitle, error.message);
      focusAndClear();
    }
  }

  function removeBarcode(barcode) {
    const nextBarcodes = barcodes.filter((item) => item !== barcode);
    onBarcodesChange(nextBarcodes);
    writeStoredArray(storageKey, nextBarcodes);
  }

  return (
    <section className="session-shell">
      <button type="button" className="actions-close-btn" onClick={onCancel} aria-label={t.common.backHome}>
        ×
      </button>
      <header className="session-header">
        <h1>{title}</h1>
        <p>{description}</p>
      </header>

      <div className="session-input-wrap">
        <input
          ref={inputRef}
          className="session-input"
          type="text"
          placeholder={placeholder}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      </div>

      {mode === 'return' ? (
        <div className="session-return-grid">
          <section className="session-preload-card">
            <div className="session-preload-head">
              <h2>{t.kiosk.returnAssignedTitle.replace('{count}', String(userBorrowedDevices.length))}</h2>
              <span>{userBorrowedDevices.length}</span>
            </div>
            <ul className="session-preload-list">
              {userBorrowedDevices.map((device) => {
                const isScanned = barcodes.includes(device.barcode);

                return (
                  <li key={device.barcode} className={`session-preload-item ${isScanned ? 'session-preload-scanned' : 'session-preload-unscanned'}`}>
                    <span>{device.barcode || device.device_number || '-'}</span>
                    <span className={`session-preload-check ${isScanned ? 'session-preload-check-scanned' : 'session-preload-check-unscanned'}`}>
                      {isScanned ? t.kiosk.returnMarkedLabel : t.kiosk.returnNotMarkedLabel}
                    </span>
                  </li>
                );
              })}
              {!userBorrowedDevices.length ? <li className="session-preload-empty">{t.kiosk.noDevicesAvailableText}</li> : null}
            </ul>
          </section>

          <section className="session-list-card">
            <div className="session-list-head">
              <h2>{t.kiosk.returnProgressTitle.replace('{done}', String(barcodes.length)).replace('{total}', String(userBorrowedDevices.length))}</h2>
              <span>{barcodes.length}</span>
            </div>
            <ul className="session-list">
              {barcodes.map((barcode, index) => (
                <li key={barcode} className="session-list-item">
                  <span>{index + 1}. {barcode}</span>
                  <button type="button" className="chip-button" onClick={() => removeBarcode(barcode)}>
                    {t.common.remove}
                  </button>
                </li>
              ))}
              {!barcodes.length ? <li className="session-list-empty">{t.kiosk.noDevicesScanned}</li> : null}
            </ul>
          </section>
        </div>
      ) : (
        <section className="session-list-card">
          <div className="session-list-head">
            <h2>{countLabel}</h2>
            <span>{barcodes.length}</span>
          </div>
          <ul className="session-list">
            {barcodes.map((barcode, index) => (
              <li key={barcode} className="session-list-item">
                <span>{index + 1}. {barcode}</span>
                <button type="button" className="chip-button" onClick={() => removeBarcode(barcode)}>
                  {t.common.remove}
                </button>
              </li>
            ))}
            {!barcodes.length ? <li className="session-list-empty">{t.kiosk.noDevicesScanned}</li> : null}
          </ul>
        </section>
      )}

      <div className="session-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>{t.common.cancel}</button>
        <button type="button" className="primary-button" onClick={onSubmit}>{submitLabel}</button>
      </div>
    </section>
  );
}

export function UnknownUserView({ language, setLanguage, t, onBackToHome }) {
  const hasSupportLink = Boolean(IT_SUPPORT_REQUEST_URL);
  const hasSupportEmail = Boolean(IT_SUPPORT_EMAIL);
  const hasSupportPhone = Boolean(IT_SUPPORT_PHONE);

  return (
    <section className="unknown-shell">
      <button type="button" className="actions-close-btn" onClick={onBackToHome} aria-label={t.common.backHome}>
        ×
      </button>
      <div className="unknown-card">
        <h1>{t.kiosk.unknownUserTitle}</h1>
        <p>{t.kiosk.unknownUserText}</p>
        <div className="unknown-actions">
          {hasSupportLink ? (
            <a className="primary-button unknown-link" href={IT_SUPPORT_REQUEST_URL} target="_blank" rel="noreferrer">
              {t.kiosk.unknownUserRequestAction}
            </a>
          ) : null}
          {hasSupportEmail ? (
            <a className="ghost-button unknown-link" href={`mailto:${IT_SUPPORT_EMAIL}`}>
              {t.kiosk.unknownUserEmailAction}: {IT_SUPPORT_EMAIL}
            </a>
          ) : null}
          {hasSupportPhone ? (
            <a className="ghost-button unknown-link" href={`tel:${IT_SUPPORT_PHONE}`}>
              {t.kiosk.unknownUserPhoneAction}: {IT_SUPPORT_PHONE}
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
