import React, { memo } from 'react';

export const UsersPanel = memo(function UsersPanel({
  userForm,
  setUserForm,
  users,
  t,
  onSubmit,
  onRemove
}) {
  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <h2>{t.admin.usersTitle}</h2>
      </div>
      <form className="admin-form" onSubmit={onSubmit}>
        <label className="admin-field">
          <span>{t.admin.uidLabel}</span>
          <input
            value={userForm.uid}
            onChange={(event) => setUserForm((current) => ({ ...current, uid: event.target.value }))}
            type="text"
            placeholder="F015ACDA"
          />
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
          <span>{t.admin.emailLabel}</span>
          <input
            value={userForm.email || ''}
            onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))}
            type="email"
            placeholder="ruslan@company.kz"
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
              <small>{user.uid}</small>
              <small>{user.email || '-'}</small>
            </div>
            <div className="admin-item-actions">
              {user.is_admin ? <span className="status-badge status-admin">{t.admin.adminBadge}</span> : null}
              <button type="button" className="danger-button small" onClick={() => onRemove(user.uid)}>{t.common.remove}</button>
            </div>
          </div>
        )) : <div className="admin-empty">{t.admin.noUsers}</div>}
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
  onRemove
}) {
  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <h2>{t.admin.laptopsTitle}</h2>
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
