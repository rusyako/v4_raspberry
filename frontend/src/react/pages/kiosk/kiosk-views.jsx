import { useEffect, useRef } from 'react';
import { postJson } from '../../shared/api';
import { LanguageSwitcher } from '../../shared/language-switcher';
import { writeStoredArray } from '../../shared/storage';
import { BARCODE_PATTERN, KIOSK_IMAGES } from './constants';

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

export function KioskHomeView({
  language,
  setLanguage,
  stationCellsStatus,
  activeBorrowedRecords,
  isActiveBorrowedLoading,
  t
}) {
  const groupedBorrowedRecords = groupBorrowedRecordsByEmployee(activeBorrowedRecords);

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
            ) : groupedBorrowedRecords.length ? (
              <ul className="home-borrowed-list">
                {groupedBorrowedRecords.map((group) => (
                  <li key={group.employeeUid} className="home-borrowed-item">
                    <div className="home-borrowed-person">
                      <strong>{group.employeeName}</strong>
                      <span className="home-borrowed-count">{group.devices.length}</span>
                    </div>
                    <ul className="home-borrowed-device-list">
                      {group.devices.map((device) => (
                        <li key={device.id} className="home-borrowed-device-item">
                          <p className="home-borrowed-device-name">{device.device_name || '-'} <span>({device.device_number || '-'})</span></p>
                          <p className="home-borrowed-device-time">{device.taken_at || '-'}</p>
                        </li>
                      ))}
                    </ul>
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
            <section className="home-card home-card-title">
              <div className="home-title-block">
                <img src={KIOSK_IMAGES.kioskLogo} alt="Smart Box" className="home-logo home-hero-logo" />
                <div>
                  <h1>Smart Box</h1>
                  <p>{t.kiosk.subtitle}</p>
                </div>
              </div>
            </section>

            <section className="home-card home-card-info">
              <div className="home-card-header home-card-header-column">
                <h2>{t.kiosk.cardTitle}</h2>
              </div>

              <div className="home-count-card">
                <span>{t.kiosk.stationCellsLabel}</span>
                <strong>{stationCellsStatus}</strong>
              </div>

              <p className="home-card-message">{t.kiosk.accessMessage}</p>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

export function KioskActionsView({ onTake, onReturn, language, setLanguage, t }) {
  return (
    <section className="actions-shell">
      <LanguageSwitcher language={language} setLanguage={setLanguage} />
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
  t
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
    await postJson('/check_laptop', { barcode });
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
      <LanguageSwitcher language={language} setLanguage={setLanguage} />
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

      <div className="session-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>{t.common.cancel}</button>
        <button type="button" className="primary-button" onClick={onSubmit}>{submitLabel}</button>
      </div>
    </section>
  );
}
