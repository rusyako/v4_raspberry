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

function splitEmployeeName(fullName) {
  if (!fullName) return [];
  
  const parts = String(fullName).trim().split(/\s+/);
  return parts.filter(Boolean);
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
  const [expandedEmployees, setExpandedEmployees] = useState({});

  function toggleEmployeeDevices(employeeUid) {
    setExpandedEmployees((current) => ({
      ...current,
      [employeeUid]: !current[employeeUid]
    }));
  }

  return (
    <>
      <LanguageSwitcher language={language} setLanguage={setLanguage} />
      <aside className="home-sensors-overlay" aria-label={t.kiosk.temperatureSensorsLabel}>
        <article className="home-sensors-overlay-item" aria-label={`${t.kiosk.temperatureSensor1Label}: ${temperature1}`} title={`${t.kiosk.temperatureSensor1Label}: ${temperature1}`}>
          <strong>{formatCompactTemperature(temperature1)}</strong>
        </article>
        <article className="home-sensors-overlay-item" aria-label={`${t.kiosk.temperatureSensor2Label}: ${temperature2}`} title={`${t.kiosk.temperatureSensor2Label}: ${temperature2}`}>
          <strong>{formatCompactTemperature(temperature2)}</strong>
        </article>
      </aside>

      <main className="home-shell">
        <div className="home-content-grid">
          <section className="home-card home-card-borrowed">
            <div className="home-card-header home-card-header-column">
              <h2>{t.kiosk.activeBorrowedTitle}</h2>
            </div>

            {isActiveBorrowedLoading ? (
              <p className="home-borrowed-empty">...</p>
            ) : groupedBorrowedRecords.length ? (
              <ul className="home-borrowed-list home-borrowed-list-three-cols">
                {groupedBorrowedRecords.map((group) => (
                  <li key={group.employeeUid} className="home-borrowed-item">
                    <div className="home-borrowed-person">
                      <div className="home-borrowed-person-name">
                        {splitEmployeeName(group.employeeName).map((part, index) => (
                          <div key={index}>{part}</div>
                        ))}
                      </div>
                      <span className="home-borrowed-count">{group.devices.length}</span>
                    </div>
                    <ul className="home-borrowed-device-list">
                      {(expandedEmployees[group.employeeUid] ? group.devices : group.devices.slice(0, 1)).map((device) => (
                        <li key={device.id} className="home-borrowed-device-item">
                          <p className="home-borrowed-device-name">{device.barcode || '-'}</p>
                          <p className="home-borrowed-device-time">{formatDateTimeGmtPlus5(device.taken_at, { language, compact: true })}</p>
                        </li>
                      ))}
                    </ul>
                    {group.devices.length > 1 ? (
                      <button
                        type="button"
                        className="home-borrowed-more-button"
                        onClick={() => toggleEmployeeDevices(group.employeeUid)}
                      >
                        {expandedEmployees[group.employeeUid]
                          ? t.kiosk.hideMoreDevices
                          : t.kiosk.showMoreDevices.replace('{count}', String(group.devices.length - 1))}
                      </button>
                    ) : null}
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
            </section>

            <section className="home-card home-card-title">
              <div className="home-title-visual">
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
                <strong>{stationCellsStatus}</strong>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

export function KioskActionsView({ onTake, onReturn, onAdmin, isAdminUser, language, setLanguage, t, onBackToHome }) {
  return (
    <section className="actions-shell">
      <button type="button" className="actions-close-btn" onClick={onBackToHome} aria-label={t.common.backHome}>
        ×
      </button>
      <header className="actions-header">
        <p className="actions-kicker">{t.kiosk.sessionConfirmed}</p>
        <h1>{t.kiosk.stationTitle}</h1>
        <p>{t.kiosk.chooseNextAction}</p>
      </header>

      <div className="actions-grid">
        <button type="button" className="actions-card primary" onClick={onTake}>
          <span>{t.kiosk.checkOut}</span>
          <small>{t.kiosk.checkOutHint}</small>
        </button>
        <button type="button" className="actions-card danger" onClick={onReturn}>
          <span>{t.kiosk.return}</span>
          <small>{t.kiosk.returnHint}</small>
        </button>
        {isAdminUser && (
          <button type="button" className="actions-card admin-action" onClick={onAdmin}>
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
        <button type="button" className="session-input-action" onClick={() => inputRef.current?.focus()}>
          {t.common.scan}
        </button>
      </div>

      {mode === 'return' ? (
        <div className="session-return-grid">
          <section className="session-preload-card">
            <div className="session-preload-head">
              <h2>{t.kiosk.returnAssignedTitle.replace('{count}', String(userBorrowedDevices.length))}</h2>
              <span>{userBorrowedDevices.length}</span>
            </div>
            <ul className="session-preload-list">
              {userBorrowedDevices.map((device) => (
                <li key={device.barcode} className={`session-preload-item ${barcodes.includes(device.barcode) ? 'session-preload-scanned' : ''}`}>
                  <span>{device.barcode || device.device_number || '-'}</span>
                  {barcodes.includes(device.barcode) && <span className="session-preload-check">{t.kiosk.returnMarkedLabel}</span>}
                </li>
              ))}
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
