import React, { memo, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

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
  const COLORS = ['#3cb371', '#d9534f', '#ffd24d', '#1c98ff', '#8e44ad'];
  const monthNames = { ru: ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'] };
  const dayNames = { ru: ['вс','пн','вт','ср','чт','пт','сб'] };

  const stats = useMemo(() => {
    const total = borrowRecords.length;
    const active = borrowRecords.filter(r => r.status === 'active');
    const returned = total - active.length;
    const today = new Date();

    // Device status
    const availableDevices = laptops.filter(l => l.status === 'available').length;
    const unavailableDevices = laptops.length - availableDevices;

    // Daily activity (last 14 days)
    const dailyMap = {};
    const dailyReturnMap = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dailyMap[key] = 0;
      dailyReturnMap[key] = 0;
    }
    borrowRecords.forEach(r => {
      if (!r.taken_at) return;
      const key = String(r.taken_at).slice(0, 10);
      if (dailyMap[key] !== undefined) dailyMap[key]++;
    });
    borrowRecords.forEach(r => {
      if (!r.returned_at) return;
      const key = String(r.returned_at).slice(0, 10);
      if (dailyReturnMap[key] !== undefined) dailyReturnMap[key]++;
    });
    const daily = Object.keys(dailyMap).sort().map(key => {
      const d = new Date(key + 'T00:00:00');
      const dow = d.getDay();
      return {
        name: `${d.getDate()} ${monthNames.ru[d.getMonth()]}`,
        day: dayNames.ru[dow],
        full: key,
        Выдачи: dailyMap[key],
        Возврат: dailyReturnMap[key]
      };
    });

    // User stats
    const userStats = {};
    borrowRecords.forEach(r => {
      const key = r.employee_uid || 'unknown';
      if (!userStats[key]) {
        userStats[key] = { name: r.employee_name || key, uid: key, total: 0, activeNow: 0, lastDate: null };
      }
      userStats[key].total++;
      if (r.status === 'active') userStats[key].activeNow++;
      if (r.taken_at && (!userStats[key].lastDate || r.taken_at > userStats[key].lastDate)) {
        userStats[key].lastDate = r.taken_at;
      }
    });
    const topBorrowers = Object.values(userStats).sort((a, b) => b.total - a.total).slice(0, 5);

    // Device stats
    const devStats = {};
    borrowRecords.forEach(r => {
      const key = r.barcode || r.device_number || r.device_name || 'unknown';
      if (!devStats[key]) {
        devStats[key] = { name: key, total: 0, lastDate: null, deviceNum: r.device_number || '' };
      }
      devStats[key].total++;
      if (r.taken_at && (!devStats[key].lastDate || r.taken_at > devStats[key].lastDate)) {
        devStats[key].lastDate = r.taken_at;
      }
    });
    const topDevices = Object.values(devStats).sort((a, b) => b.total - a.total).slice(0, 5);

    // Transfer stats
    const transferred = borrowRecords.filter(r => Boolean(r.comment));
    const transferCount = transferred.length;

    // Recent events
    const recent = [...borrowRecords].sort((a, b) => {
      const da = a.taken_at || '';
      const db = b.taken_at || '';
      return da < db ? 1 : -1;
    }).slice(0, 8);

    // KPI
    const todayStr = today.toISOString().slice(0, 10);
    const todayBorrows = borrowRecords.filter(r => String(r.taken_at).startsWith(todayStr)).length;
    const todayReturns = borrowRecords.filter(r => r.returned_at && String(r.returned_at).startsWith(todayStr)).length;
    const activeUsers = new Set(active.map(r => r.employee_uid)).size;
    const returnRate = total > 0 ? Math.round((returned / total) * 100) : 0;
    const avgBorrowMinutes = (() => {
      const withReturn = borrowRecords.filter(r => r.status === 'returned' && r.taken_at && r.returned_at);
      if (!withReturn.length) return 0;
      const totalMin = withReturn.reduce((sum, r) => {
        const d = (new Date(r.returned_at) - new Date(r.taken_at)) / 60000;
        return sum + Math.max(0, d);
      }, 0);
      return Math.round(totalMin / withReturn.length);
    })();

    return { total, activeNow: active.length, returned, availableDevices, unavailableDevices, topBorrowers, topDevices, daily, activeUsers, returnRate, avgBorrowMinutes, laptopsCount: laptops.length, usersCount: users.length, todayBorrows, todayReturns, transferCount, recent, transferred };
  }, [users, laptops, borrowRecords]);

  if (!stats.daily.length && !stats.total) {
    return <div style={{ minHeight: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bdd5e5' }}>{t.admin.noBorrowRecords}</div>;
  }

  return (
    <div className="analysis-panel">
      <div className="analysis-stats-grid analysis-stats-2row">
        <div className="analysis-stat-card"><span className="analysis-stat-value">{stats.usersCount}</span><span className="analysis-stat-label">{t.admin.stats.totalUsers}</span></div>
        <div className="analysis-stat-card"><span className="analysis-stat-value">{stats.laptopsCount}</span><span className="analysis-stat-label">{t.admin.stats.totalDevices}</span></div>
        <div className="analysis-stat-card"><span className="analysis-stat-value">{stats.activeNow}</span><span className="analysis-stat-label">{t.admin.stats.activeLoans}</span></div>
        <div className="analysis-stat-card"><span className="analysis-stat-value">{stats.returnRate}%</span><span className="analysis-stat-label">{t.admin.returnRate}</span></div>
        <div className="analysis-stat-card"><span className="analysis-stat-value">{stats.todayBorrows}</span><span className="analysis-stat-label">{t.admin.operBorrows}</span></div>
        <div className="analysis-stat-card"><span className="analysis-stat-value">{stats.todayReturns}</span><span className="analysis-stat-label">{t.admin.operReturns}</span></div>
        <div className="analysis-stat-card"><span className="analysis-stat-value">{stats.transferCount}</span><span className="analysis-stat-label">{t.admin.filterTransferred}</span></div>
        <div className="analysis-stat-card"><span className="analysis-stat-value">{stats.avgBorrowMinutes}м</span><span className="analysis-stat-label">{t.admin.avgBorrowMinutes}</span></div>
      </div>

      <div className="analysis-chart-row">
        <section className="admin-panel analysis-chart-card">
          <h3>{t.admin.dailyActivity}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.daily} margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" tick={{ fill: '#aac7d8', fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fill: '#aac7d8', fontSize: 10 }} tickLine={false} />
              <Tooltip contentStyle={{ background: '#0d2f40', border: '1px solid rgba(152,201,231,0.3)', borderRadius: 8, color: '#eef8ff' }} />
              <Bar dataKey="Выдачи" fill="#1c98ff" radius={[3, 3, 0, 0]} maxBarSize={18} />
              <Bar dataKey="Возврат" fill="#3cb371" radius={[3, 3, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="admin-panel analysis-chart-card">
          <h3>{t.admin.deviceStatusChart}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={[
                { name: t.admin.statusAvailable, value: stats.availableDevices },
                { name: t.admin.statusUnavailable, value: stats.unavailableDevices }
              ]} cx="50%" cy="50%" outerRadius={70} innerRadius={40} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                {[0, 1].map((i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#0d2f40', border: '1px solid rgba(152,201,231,0.3)', borderRadius: 8, color: '#eef8ff' }} />
            </PieChart>
          </ResponsiveContainer>
        </section>
      </div>

      <div className="analysis-3col-grid">
        <section className="admin-panel">
          <h3>{t.admin.topBorrowers}</h3>
          {stats.topBorrowers.map((u, i) => (
            <div key={u.uid} className="analysis-user-row">
              <span className="analysis-rank">{i + 1}.</span>
              <div className="analysis-user-info">
                <strong>{u.name}</strong>
                <small>{t.admin.totalLabel}: {u.total}, {t.admin.stats.activeLoans}: {u.activeNow}</small>
              </div>
              <span className="analysis-user-count">{u.total}</span>
            </div>
          ))}
          {!stats.topBorrowers.length && <div className="admin-empty">{t.admin.noBorrowRecords}</div>}
        </section>

        <section className="admin-panel">
          <h3>{t.admin.topDevices}</h3>
          {stats.topDevices.map((d, i) => {
            const laptop = laptops.find(l => l.barcode === d.name || l.device_number === d.name);
            const isAvailable = laptop?.status === 'available';
            return (
              <div key={d.name} className="analysis-user-row">
                <span className="analysis-rank">{i + 1}.</span>
                <div className="analysis-user-info">
                  <strong>{d.name}</strong>
                  <small>
                    {t.admin.totalLabel}: {d.total}
                    {d.lastDate ? ` · ${t.admin.lastEvent}: ${String(d.lastDate).slice(0, 10)}` : ''}
                  </small>
                </div>
                <span className={`analysis-status-pill ${isAvailable ? 'pill-green' : 'pill-red'}`}>
                  {isAvailable ? t.admin.statusAvailable : t.admin.statusUnavailable}
                </span>
              </div>
            );
          })}
          {!stats.topDevices.length && <div className="admin-empty">{t.admin.noBorrowRecords}</div>}
        </section>

        <section className="admin-panel">
          <h3>{t.admin.recentEvents}</h3>
          {stats.recent.map(r => {
            const action = r.returned_at ? t.admin.statusReturned : r.comment ? t.admin.filterTransferred : t.admin.statusActive;
            const label = r.device_name || r.barcode || r.device_number || '-';
            const person = r.employee_name || r.employee_uid || '-';
            return (
              <div key={r.id} className="analysis-event-row">
                <span className="analysis-event-time">
                  {r.taken_at ? String(r.taken_at).slice(11, 16) : ''}
                  <small>{String(r.taken_at).slice(0, 10)}</small>
                </span>
                <span className="analysis-event-info">
                  <strong>{label}</strong>
                  <small>{person}</small>
                </span>
                <span className={`analysis-status-pill ${action === t.admin.statusReturned ? 'pill-green' : action === t.admin.filterTransferred ? 'pill-yellow' : 'pill-blue'}`}>
                  {action}
                </span>
              </div>
            );
          })}
          {!stats.recent.length && <div className="admin-empty">{t.admin.noBorrowRecords}</div>}
        </section>
      </div>
    </div>
  );
});

export const LaptopsTable = memo(function LaptopsTable({ laptops, t, onRemove, onAction, onSort, sortKey, sortDir }) {
  const sortArrow = (key) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <section className="admin-panel users-table-panel">
      <div className="admin-panel-head">
        <h2>{t.admin.registeredDevices}</h2>
      </div>
      <div className="admin-table-wrap users-table-wrap">
        <table className="admin-table users-table">
          <thead>
            <tr>
              <th onClick={() => onSort && onSort('device_number')} style={{ cursor: 'pointer' }}>{t.admin.columns.id}{sortArrow('device_number')}</th>
              <th onClick={() => onSort && onSort('barcode')} style={{ cursor: 'pointer' }}>{t.admin.barcodeLabel}{sortArrow('barcode')}</th>
              <th onClick={() => onSort && onSort('bookingStatus')} style={{ cursor: 'pointer' }}>{t.admin.columns.status}{sortArrow('bookingStatus')}</th>
              <th onClick={() => onSort && onSort('borrowerName')} style={{ cursor: 'pointer' }}>{t.admin.columns.name}{sortArrow('borrowerName')}</th>
              <th>{t.admin.actionLabel}</th>
            </tr>
          </thead>
          <tbody>
            {laptops.length ? laptops.map((laptop) => (
              <tr key={`${laptop.name}:${laptop.barcode}`}>
                <td><strong>{laptop.device_number || laptop.name || '-'}</strong></td>
                <td><code>{laptop.barcode || '-'}</code></td>
                <td>
                  <span className={`status-badge ${laptop.canAssign ? 'status-active' : 'status-available'}`}>
                    {laptop.bookingStatus}
                  </span>
                </td>
                <td>{laptop.borrowerName || '-'}</td>
                <td>
                  <button type="button" className={`ghost-button small ${!laptop.canAssign ? 'button-disabled' : ''}`} onClick={() => onAction(laptop)} disabled={!laptop.canAssign}>
                    {laptop.canAssign ? t.admin.actionLabel : t.admin.noBookingActionLabel}
                  </button>
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

export const AdSyncLogPanel = memo(function AdSyncLogPanel({ lines, lastModified, t }) {
  return (
    <section className="admin-panel users-table-panel">
      <div className="admin-panel-head">
        <h2>{t.admin.adSyncLogTitle}</h2>
        {lastModified && <small style={{ color: '#aac7d8', fontSize: '12px' }}>{t.admin.lastSyncLabel}: {lastModified}</small>}
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
