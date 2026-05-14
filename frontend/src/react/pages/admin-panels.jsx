import React, { memo, useMemo } from 'react';

function reverseUidHexBytes(hexUid) {
  const pairs = [];
  for (let index = 0; index < hexUid.length; index += 2) {
    pairs.push(hexUid.slice(index, index + 2));
  }
  return pairs.reverse().join('');
}

function normalizeUidValue(rawUid) {
  let normalized = String(rawUid || '').trim().toUpperCase();
  if (!normalized) {
    return '';
  }

  normalized = normalized.replace(/[\s:-]+/g, '');
  if (normalized.startsWith('0X')) {
    normalized = normalized.slice(2);
  }

  return normalized;
}

function buildUidPreview(rawUid) {
  const normalized = normalizeUidValue(rawUid);
  if (!normalized) {
    return { uidHex: '', uidDec: '' };
  }

  if (/^\d+$/.test(normalized)) {
    const decimalValue = Number.parseInt(normalized, 10);
    if (Number.isNaN(decimalValue) || decimalValue < 0 || decimalValue > 0xFFFFFFFF) {
      return { uidHex: '', uidDec: '' };
    }

    const directHex = decimalValue.toString(16).toUpperCase().padStart(8, '0');
    return {
      uidHex: reverseUidHexBytes(directHex),
      uidDec: normalized
    };
  }

  if (/^[0-9A-F]{1,8}$/.test(normalized)) {
    const paddedHex = normalized.padStart(8, '0');
    return {
      uidHex: paddedHex,
      uidDec: Number.parseInt(reverseUidHexBytes(paddedHex), 16).toString(10)
    };
  }

  return { uidHex: '', uidDec: '' };
}

export const UsersPanel = memo(function UsersPanel({
  userForm,
  setUserForm,
  users,
  t,
  onSubmit,
  onRemove,
  onImport,
  onBackToHome
}) {
  const uidPreview = buildUidPreview(userForm.uid);

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <h2>{t.admin.usersTitle}</h2>
        <div className="admin-panel-head-actions">
          <label className="primary-button" style={{ cursor: 'pointer' }}>
            {t.admin.importUsers}
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={onImport}
              style={{ display: 'none' }}
            />
          </label>
          {onBackToHome && <button type="button" className="ghost-button" onClick={onBackToHome}>{t.common.backHome}</button>}
        </div>
      </div>
      <form className="admin-form" onSubmit={onSubmit}>
        <label className="admin-field">
          <span>{t.admin.guidLabel}</span>
          <input
            value={userForm.guid || ''}
            onChange={(event) => setUserForm((current) => ({ ...current, guid: event.target.value }))}
            type="text"
            placeholder="550e8400-e29b-41d4-a716-446655440000"
          />
        </label>
        <label className="admin-field">
          <span>{t.admin.uidLabel}</span>
          <input
            value={userForm.uid}
            onChange={(event) => setUserForm((current) => ({ ...current, uid: event.target.value }))}
            type="text"
            placeholder="F015ACDA"
          />
          {uidPreview.uidHex || uidPreview.uidDec ? (
            <small>
              HEX: {uidPreview.uidHex || '-'} | DEC: {uidPreview.uidDec || '-'}
            </small>
          ) : null}
        </label>
        <label className="admin-field">
          <span>{t.admin.nameLabel}</span>
          <input
            value={userForm.name}
            onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))}
            type="text"
            placeholder="Ruslan"
          />
        </label>
        <label className="admin-field">
          <span>{t.admin.firstNameLabel}</span>
          <input
            value={userForm.first_name || ''}
            onChange={(event) => setUserForm((current) => ({ ...current, first_name: event.target.value }))}
            type="text"
            placeholder="Ruslan"
          />
        </label>
        <label className="admin-field">
          <span>{t.admin.lastNameLabel}</span>
          <input
            value={userForm.last_name || ''}
            onChange={(event) => setUserForm((current) => ({ ...current, last_name: event.target.value }))}
            type="text"
            placeholder="Akhmetov"
          />
        </label>
        <label className="admin-field">
          <span>{t.admin.emailLabel}</span>
          <input
            value={userForm.email || ''}
            onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))}
            type="email"
            placeholder="ruslan@company.kz"
          />
        </label>
        <label className="admin-field">
          <span>{t.admin.descriptionLabel}</span>
          <input
            value={userForm.description || ''}
            onChange={(event) => setUserForm((current) => ({ ...current, description: event.target.value }))}
            type="text"
            placeholder="IT Specialist"
          />
        </label>
        <label className="admin-field">
          <span>{t.admin.categoryLabel}</span>
          <input
            value={userForm.category || ''}
            onChange={(event) => setUserForm((current) => ({ ...current, category: event.target.value }))}
            type="text"
            placeholder="Staff"
          />
        </label>
        <label className="admin-checkbox">
          <input
            checked={userForm.is_admin}
            onChange={(event) => setUserForm((current) => ({ ...current, is_admin: event.target.checked }))}
            type="checkbox"
          />
          <span>{t.admin.adminCardLabel}</span>
        </label>
        <button type="submit" className="primary-button">{t.admin.addUser}</button>
      </form>
      <div className="admin-list">
        {users.length ? users.map((user) => (
          <div key={user.uid} className="admin-list-item">
            <div>
              <strong>{user.name || user.uid}</strong>
              <small>GUID: {user.guid || '-'}</small>
              <small>HEX: {user.uid_hex || user.uid || '-'}</small>
              <small>DEC: {user.uid_dec || '-'}</small>
              <small>{user.description || user.category || '-'}</small>
              <small>{user.email || '-'}</small>
            </div>
            <div className="admin-item-actions">
              {user.is_admin ? <span className="status-badge status-admin">{t.admin.adminBadge}</span> : null}
              <button type="button" className="danger-button small" onClick={() => onRemove(user)}>{t.common.remove}</button>
            </div>
          </div>
        )) : <div className="admin-empty">{t.admin.noUsers}</div>}
      </div>
    </section>
  );
});

export const UsersTable = memo(function UsersTable({ users, t, onRemove }) {
  return (
    <section className="admin-panel users-table-panel">
      <div className="admin-panel-head">
        <h2>{t.admin.registeredUsers}</h2>
      </div>
      <div className="admin-table-wrap users-table-wrap">
        <table className="admin-table users-table">
          <thead>
            <tr>
              <th>{t.admin.columns.name}</th>
              <th>GUID</th>
              <th>RFID HEX</th>
              <th>RFID DEC</th>
              <th>{t.admin.categoryLabel}</th>
              <th>{t.admin.emailLabel}</th>
              <th>{t.admin.columns.status}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.length ? users.map((user) => (
              <tr key={user.guid || user.uid}>
                <td>
                  <strong>{user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || '-'}</strong>
                  <small>{[user.first_name, user.last_name].filter(Boolean).join(' ') || '-'}</small>
                </td>
                <td><code>{user.guid || '-'}</code></td>
                <td><code>{user.uid_hex || user.uid || '-'}</code></td>
                <td><code>{user.uid_dec || '-'}</code></td>
                <td>{user.description || user.category || '-'}</td>
                <td>{user.email || '-'}</td>
                <td>{user.is_admin ? <span className="status-badge status-admin">{t.admin.adminBadge}</span> : '-'}</td>
                <td>
                  <button type="button" className="danger-button small" onClick={() => onRemove(user)}>{t.common.remove}</button>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="8" className="admin-empty">{t.admin.noUsers}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
});

export const AnalysisPanel = memo(function AnalysisPanel({ users, laptops, borrowRecords, t }) {
  const stats = useMemo(() => {
    const total = borrowRecords.length;
    const active = borrowRecords.filter(r => r.status === 'active').length;
    const returned = total - active;
    const availableDevices = laptops.filter(l => l.status === 'available').length;
    const unavailableDevices = laptops.length - availableDevices;

    const userBorrowCounts = {};
    borrowRecords.forEach(r => {
      const key = r.employee_name || r.employee_uid;
      userBorrowCounts[key] = (userBorrowCounts[key] || 0) + 1;
    });
    const topBorrowers = Object.entries(userBorrowCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const deviceBorrowCounts = {};
    borrowRecords.forEach(r => {
      const key = r.device_name || r.barcode || r.device_number;
      deviceBorrowCounts[key] = (deviceBorrowCounts[key] || 0) + 1;
    });
    const topDevices = Object.entries(deviceBorrowCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const monthlyCounts = {};
    borrowRecords.forEach(r => {
      if (!r.taken_at) return;
      const key = String(r.taken_at).slice(0, 7);
      monthlyCounts[key] = (monthlyCounts[key] || 0) + 1;
    });
    const monthly = Object.entries(monthlyCounts).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);

    const activeUsers = new Set(borrowRecords.filter(r => r.status === 'active').map(r => r.employee_uid)).size;
    const returnRate = total > 0 ? Math.round((returned / total) * 100) : 0;
    const avgBorrowDays = (() => {
      const withReturn = borrowRecords.filter(r => r.status === 'returned' && r.taken_at && r.returned_at);
      if (!withReturn.length) return 0;
      const totalDays = withReturn.reduce((sum, r) => {
        const d = (new Date(r.returned_at) - new Date(r.taken_at)) / 86400000;
        return sum + Math.max(0, d);
      }, 0);
      return Math.round(totalDays / withReturn.length);
    })();

    return { total, active, returned, availableDevices, unavailableDevices, topBorrowers, topDevices, monthly, activeUsers, returnRate, avgBorrowDays, laptopsCount: laptops.length, usersCount: users.length };
  }, [users, laptops, borrowRecords]);

  const maxBorrow = stats.topBorrowers.length ? stats.topBorrowers[0][1] : 1;
  const maxDevice = stats.topDevices.length ? stats.topDevices[0][1] : 1;
  const maxMonthly = stats.monthly.length ? Math.max(...stats.monthly.map(m => m[1])) : 1;

  const monthNames = { ru: ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'] };

  return (
    <div className="analysis-panel">
      <div className="analysis-stats-grid">
        <div className="analysis-stat-card">
          <span className="analysis-stat-value">{stats.usersCount}</span>
          <span className="analysis-stat-label">{t.admin.stats.totalUsers}</span>
        </div>
        <div className="analysis-stat-card">
          <span className="analysis-stat-value">{stats.laptopsCount}</span>
          <span className="analysis-stat-label">{t.admin.stats.totalDevices}</span>
        </div>
        <div className="analysis-stat-card">
          <span className="analysis-stat-value">{stats.active}</span>
          <span className="analysis-stat-label">{t.admin.stats.activeLoans}</span>
        </div>
        <div className="analysis-stat-card">
          <span className="analysis-stat-value">{stats.returnRate}%</span>
          <span className="analysis-stat-label">{t.admin.returnRate}</span>
        </div>
      </div>

      <div className="analysis-grid">
        <section className="admin-panel">
          <h3>{t.admin.deviceStatusChart}</h3>
          <div className="analysis-bar-wrap">
            <div className="analysis-bar-row">
              <span>{t.admin.statusAvailable}</span>
              <div className="analysis-bar-track">
                <div className="analysis-bar-fill analysis-bar-green" style={{ width: `${stats.laptopsCount ? (stats.availableDevices / stats.laptopsCount) * 100 : 0}%` }} />
              </div>
              <strong>{stats.availableDevices}</strong>
            </div>
            <div className="analysis-bar-row">
              <span>{t.admin.statusUnavailable}</span>
              <div className="analysis-bar-track">
                <div className="analysis-bar-fill analysis-bar-red" style={{ width: `${stats.laptopsCount ? (stats.unavailableDevices / stats.laptopsCount) * 100 : 0}%` }} />
              </div>
              <strong>{stats.unavailableDevices}</strong>
            </div>
          </div>
        </section>

        <section className="admin-panel">
          <h3>{t.admin.topBorrowers}</h3>
          {stats.topBorrowers.map(([name, count], i) => (
            <div key={name} className="analysis-bar-row">
              <span className="analysis-rank">{i + 1}.</span>
              <span className="analysis-name">{name}</span>
              <div className="analysis-bar-track">
                <div className="analysis-bar-fill analysis-bar-blue" style={{ width: `${(count / maxBorrow) * 100}%` }} />
              </div>
              <strong>{count}</strong>
            </div>
          ))}
          {!stats.topBorrowers.length && <div className="admin-empty">{t.admin.noBorrowRecords}</div>}
        </section>

        <section className="admin-panel">
          <h3>{t.admin.monthlyActivity}</h3>
          <div className="analysis-chart-bars">
            {stats.monthly.map(([month, count]) => {
              const [y, m] = month.split('-');
              const label = `${parseInt(m)}${monthNames.ru[parseInt(m) - 1] ? ' ' + monthNames.ru[parseInt(m) - 1] : ''}`;
              return (
                <div key={month} className="analysis-chart-item">
                  <span className="analysis-chart-value">{count}</span>
                  <div className="analysis-chart-bar" style={{ height: `${(count / maxMonthly) * 100}%` }} />
                  <span className="analysis-chart-label">{label}</span>
                </div>
              );
            })}
            {!stats.monthly.length && <div className="admin-empty">{t.admin.noBorrowRecords}</div>}
          </div>
        </section>

        <section className="admin-panel">
          <h3>{t.admin.topDevices}</h3>
          {stats.topDevices.map(([name, count], i) => (
            <div key={name} className="analysis-bar-row">
              <span className="analysis-rank">{i + 1}.</span>
              <span className="analysis-name">{name}</span>
              <div className="analysis-bar-track">
                <div className="analysis-bar-fill analysis-bar-purple" style={{ width: `${(count / maxDevice) * 100}%` }} />
              </div>
              <strong>{count}</strong>
            </div>
          ))}
          {!stats.topDevices.length && <div className="admin-empty">{t.admin.noBorrowRecords}</div>}
        </section>
      </div>

      <div className="analysis-insights">
        <div className="analysis-insight-card">
          <span>{stats.activeUsers}</span>
          <small>{t.admin.activeUsers}</small>
        </div>
        <div className="analysis-insight-card">
          <span>{stats.avgBorrowDays} дн</span>
          <small>{t.admin.avgBorrowDays}</small>
        </div>
      </div>
    </div>
  );
});

export const LaptopsTable = memo(function LaptopsTable({ laptops, t, onRemove }) {
  return (
    <section className="admin-panel users-table-panel">
      <div className="admin-panel-head">
        <h2>{t.admin.registeredDevices}</h2>
      </div>
      <div className="admin-table-wrap users-table-wrap">
        <table className="admin-table users-table">
          <thead>
            <tr>
              <th>{t.admin.deviceNameLabel}</th>
              <th>{t.admin.barcodeLabel}</th>
              <th>{t.admin.deviceNumberLabel}</th>
              <th>{t.admin.columns.status}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {laptops.length ? laptops.map((laptop) => (
              <tr key={`${laptop.name}:${laptop.barcode}`}>
                <td><strong>{laptop.name || '-'}</strong></td>
                <td><code>{laptop.barcode || '-'}</code></td>
                <td><code>{laptop.device_number || '-'}</code></td>
                <td>
                  <span className={`status-badge ${laptop.status === 'available' ? 'status-available' : 'status-unavailable'}`}>
                    {laptop.status === 'available' ? t.admin.statusAvailable : t.admin.statusUnavailable}
                  </span>
                </td>
                <td>
                  <button type="button" className="danger-button small" onClick={() => onRemove(laptop.name)}>{t.common.remove}</button>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="5" className="admin-empty">{t.admin.noDevices}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
});

export const AdSyncLogPanel = memo(function AdSyncLogPanel({ lines, t }) {
  return (
    <section className="admin-panel users-table-panel">
      <div className="admin-panel-head">
        <h2>{t.admin.adSyncLogTitle}</h2>
      </div>
      <div className="admin-log-viewer">
        {lines.length ? lines.map((line, index) => (
          <div key={`${index}-${line.slice(0, 24)}`} className="admin-log-line">{line}</div>
        )) : <div className="admin-empty">{t.admin.adSyncLogEmpty}</div>}
      </div>
    </section>
  );
});

export const LaptopsPanel = memo(function LaptopsPanel({
  laptopForm,
  setLaptopForm,
  laptops,
  t,
  onSubmit,
  onRemove,
  onBackToHome
}) {
  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <h2>{t.admin.laptopsTitle}</h2>
        {onBackToHome && <button type="button" className="ghost-button" onClick={onBackToHome}>{t.common.backHome}</button>}
      </div>
      <form className="admin-form" onSubmit={onSubmit}>
        <label className="admin-field">
          <span>{t.admin.deviceNameLabel}</span>
          <input
            value={laptopForm.name}
            onChange={(event) => setLaptopForm((current) => ({ ...current, name: event.target.value }))}
            type="text"
            placeholder="MB-001"
          />
        </label>
        <label className="admin-field">
          <span>{t.admin.barcodeLabel}</span>
          <input
            value={laptopForm.barcode}
            onChange={(event) => setLaptopForm((current) => ({ ...current, barcode: event.target.value }))}
            type="text"
            placeholder="BC-001"
          />
        </label>
        <label className="admin-field">
          <span>{t.admin.deviceNumberLabel}</span>
          <input
            value={laptopForm.device_number || ''}
            onChange={(event) => setLaptopForm((current) => ({ ...current, device_number: event.target.value }))}
            type="text"
            placeholder="2000000188706"
          />
        </label>
        <label className="admin-field">
          <span>{t.admin.statusLabel}</span>
          <select
            value={laptopForm.status}
            onChange={(event) => setLaptopForm((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="available">{t.admin.statusAvailable}</option>
            <option value="unavailable">{t.admin.statusUnavailable}</option>
          </select>
        </label>
        <button type="submit" className="primary-button">{t.admin.addDevice}</button>
      </form>
      <div className="admin-list">
        {laptops.length ? laptops.map((laptop) => (
          <div key={`${laptop.name}:${laptop.barcode}`} className="admin-list-item">
            <div>
              <strong>{laptop.name}</strong>
              <small>{t.admin.barcodePrefix}: {laptop.barcode || '-'}</small>
              <small>{t.admin.devicePrefix}: {laptop.device_number || '-'}</small>
            </div>
            <div className="admin-item-actions">
              <span className={`status-badge ${laptop.status === 'available' ? 'status-available' : 'status-unavailable'}`}>
                {laptop.status}
              </span>
              <button type="button" className="danger-button small" onClick={() => onRemove(laptop.name)}>{t.common.remove}</button>
            </div>
          </div>
        )) : <div className="admin-empty">{t.admin.noDevices}</div>}
      </div>
    </section>
  );
});
