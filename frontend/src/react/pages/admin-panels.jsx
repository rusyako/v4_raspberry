import React, { memo } from 'react';

export const UsersPanel = memo(function UsersPanel({
  userForm,
  setUserForm,
  users,
  onSubmit,
  onRemove
}) {
  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <h2>Users / UID</h2>
      </div>
      <form className="admin-form" onSubmit={onSubmit}>
        <label className="admin-field">
          <span>UID</span>
          <input
            value={userForm.uid}
            onChange={(event) => setUserForm((current) => ({ ...current, uid: event.target.value }))}
            type="text"
            placeholder="F015ACDA"
          />
        </label>
        <label className="admin-field">
          <span>Name</span>
          <input
            value={userForm.name}
            onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))}
            type="text"
            placeholder="Ruslan"
          />
        </label>
        <label className="admin-checkbox">
          <input
            checked={userForm.is_admin}
            onChange={(event) => setUserForm((current) => ({ ...current, is_admin: event.target.checked }))}
            type="checkbox"
          />
          <span>Admin card</span>
        </label>
        <button type="submit" className="primary-button">Add User</button>
      </form>
      <div className="admin-list">
        {users.length ? users.map((user) => (
          <div key={user.uid} className="admin-list-item">
            <div>
              <strong>{user.name || user.uid}</strong>
              <small>{user.uid}</small>
            </div>
            <div className="admin-item-actions">
              {user.is_admin ? <span className="status-badge status-admin">Admin</span> : null}
              <button type="button" className="danger-button small" onClick={() => onRemove(user.uid)}>Delete</button>
            </div>
          </div>
        )) : <div className="admin-empty">No users yet.</div>}
      </div>
    </section>
  );
});

export const LaptopsPanel = memo(function LaptopsPanel({
  laptopForm,
  setLaptopForm,
  laptops,
  onSubmit,
  onRemove
}) {
  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <h2>MacBooks</h2>
      </div>
      <form className="admin-form" onSubmit={onSubmit}>
        <label className="admin-field">
          <span>Device name</span>
          <input
            value={laptopForm.name}
            onChange={(event) => setLaptopForm((current) => ({ ...current, name: event.target.value }))}
            type="text"
            placeholder="MB-001"
          />
        </label>
        <label className="admin-field">
          <span>Barcode</span>
          <input
            value={laptopForm.barcode}
            onChange={(event) => setLaptopForm((current) => ({ ...current, barcode: event.target.value }))}
            type="text"
            placeholder="BC-001"
          />
        </label>
        <label className="admin-field">
          <span>Status</span>
          <select
            value={laptopForm.status}
            onChange={(event) => setLaptopForm((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </label>
        <button type="submit" className="primary-button">Add Device</button>
      </form>
      <div className="admin-list">
        {laptops.length ? laptops.map((laptop) => (
          <div key={`${laptop.name}:${laptop.barcode}`} className="admin-list-item">
            <div>
              <strong>{laptop.name}</strong>
              <small>Barcode: {laptop.barcode || '-'}</small>
            </div>
            <div className="admin-item-actions">
              <span className={`status-badge ${laptop.status === 'available' ? 'status-available' : 'status-unavailable'}`}>
                {laptop.status}
              </span>
              <button type="button" className="danger-button small" onClick={() => onRemove(laptop.name)}>Delete</button>
            </div>
          </div>
        )) : <div className="admin-empty">No devices yet.</div>}
      </div>
    </section>
  );
});
