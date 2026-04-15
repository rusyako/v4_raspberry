import { useEffect, useState } from 'react';
import { deleteJson, postJson, requestJson } from '../shared/api';
import { ADMIN_TOKEN_STORAGE_KEY } from '../shared/storage';
import { Toast, useToast } from '../shared/toast';

function getStoredAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '';
}

function setStoredAdminToken(token) {
  if (token) {
    localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  }
}

export function AdminPage() {
  const [adminToken, setAdminToken] = useState(getStoredAdminToken());
  const [pin, setPin] = useState('');
  const [users, setUsers] = useState([]);
  const [laptops, setLaptops] = useState([]);
  const [userForm, setUserForm] = useState({ uid: '', name: '', is_admin: false });
  const [laptopForm, setLaptopForm] = useState({ name: '', barcode: '', status: 'available' });
  const { toast, showToast, clearToast } = useToast();

  function authHeaders() {
    return adminToken ? { 'X-Admin-Token': adminToken } : {};
  }

  async function loadAdminData(nextToken = adminToken) {
    const data = await requestJson('/admin/overview', {
      method: 'GET',
      headers: nextToken ? { 'X-Admin-Token': nextToken } : {}
    });
    setUsers(data.users || []);
    setLaptops(data.laptops || []);
  }

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        const state = await requestJson('/admin_state', { method: 'GET' });
        if (mounted && state.admin_redirect && !adminToken) {
          showToast('info', 'Admin card detected', 'Enter the PIN to continue.');
        }
      } catch {
        return;
      }

      if (!adminToken) {
        return;
      }

      try {
        await loadAdminData(adminToken);
      } catch (error) {
        if (mounted) {
          setStoredAdminToken('');
          setAdminToken('');
          showToast('error', 'Admin login required', error.message);
        }
      }
    }

    bootstrap();
    return () => {
      mounted = false;
    };
  }, [adminToken, showToast]);

  async function handleLogin(event) {
    event.preventDefault();
    try {
      const data = await postJson('/admin/login', { pin: pin.trim() });
      setStoredAdminToken(data.admin_token);
      setAdminToken(data.admin_token);
      setPin('');
      await loadAdminData(data.admin_token);
      showToast('success', 'Admin unlocked', data.message);
    } catch (error) {
      showToast('error', 'PIN failed', error.message);
    }
  }

  async function handleLogout() {
    try {
      await postJson('/admin/logout', {}, authHeaders());
    } catch {
      // Ignore logout transport errors and clear local state anyway.
    }
    setStoredAdminToken('');
    setAdminToken('');
    setUsers([]);
    setLaptops([]);
  }

  async function handleAddUser(event) {
    event.preventDefault();
    try {
      const data = await postJson('/admin/users', userForm, authHeaders());
      setUserForm({ uid: '', name: '', is_admin: false });
      await loadAdminData();
      showToast('success', 'User added', data.message);
    } catch (error) {
      showToast('error', 'Admin error', error.message);
    }
  }

  async function handleAddLaptop(event) {
    event.preventDefault();
    try {
      const data = await postJson('/admin/laptops', laptopForm, authHeaders());
      setLaptopForm({ name: '', barcode: '', status: 'available' });
      await loadAdminData();
      showToast('success', 'Device added', data.message);
    } catch (error) {
      showToast('error', 'Admin error', error.message);
    }
  }

  async function removeUser(uid) {
    try {
      const data = await deleteJson(`/admin/users/${encodeURIComponent(uid)}`, authHeaders());
      await loadAdminData();
      showToast('success', 'User removed', data.message);
    } catch (error) {
      showToast('error', 'Admin error', error.message);
    }
  }

  async function removeLaptop(name) {
    try {
      const data = await deleteJson(`/admin/laptops/${encodeURIComponent(name)}`, authHeaders());
      await loadAdminData();
      showToast('success', 'Device removed', data.message);
    } catch (error) {
      showToast('error', 'Admin error', error.message);
    }
  }

  return (
    <div className="admin-screen">
      <Toast toast={toast} onClose={clearToast} />
      {!adminToken ? (
        <div className="admin-login-wrap">
          <form className="admin-login-panel" onSubmit={handleLogin}>
            <h1>Admin Access</h1>
            <p>Enter the administrator PIN code.</p>
            <label className="admin-field">
              <span>PIN</span>
              <input value={pin} onChange={(event) => setPin(event.target.value)} type="password" inputMode="numeric" autoComplete="off" />
            </label>
            <div className="admin-actions">
              <button type="submit" className="primary-button">Unlock Admin</button>
              <button type="button" className="ghost-button" onClick={() => { window.location.href = '/'; }}>Back Home</button>
            </div>
          </form>
        </div>
      ) : (
        <div className="admin-page">
          <header className="admin-hero">
            <div>
              <p className="admin-eyebrow">Smart Box control room</p>
              <h1>Admin Panel</h1>
              <p>Manage access cards and MacBook inventory from one dashboard.</p>
            </div>
            <div className="admin-actions">
              <button type="button" className="ghost-button" onClick={() => loadAdminData()}>Refresh</button>
              <button type="button" className="danger-button" onClick={handleLogout}>Logout</button>
            </div>
          </header>

          <div className="admin-grid">
            <section className="admin-panel">
              <div className="admin-panel-head">
                <h2>Users / UID</h2>
              </div>
              <form className="admin-form" onSubmit={handleAddUser}>
                <label className="admin-field">
                  <span>UID</span>
                  <input value={userForm.uid} onChange={(event) => setUserForm((current) => ({ ...current, uid: event.target.value }))} type="text" placeholder="F015ACDA" />
                </label>
                <label className="admin-field">
                  <span>Name</span>
                  <input value={userForm.name} onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))} type="text" placeholder="Ruslan" />
                </label>
                <label className="admin-checkbox">
                  <input checked={userForm.is_admin} onChange={(event) => setUserForm((current) => ({ ...current, is_admin: event.target.checked }))} type="checkbox" />
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
                      <button type="button" className="danger-button small" onClick={() => removeUser(user.uid)}>Delete</button>
                    </div>
                  </div>
                )) : <div className="admin-empty">No users yet.</div>}
              </div>
            </section>

            <section className="admin-panel">
              <div className="admin-panel-head">
                <h2>MacBooks</h2>
              </div>
              <form className="admin-form" onSubmit={handleAddLaptop}>
                <label className="admin-field">
                  <span>Device name</span>
                  <input value={laptopForm.name} onChange={(event) => setLaptopForm((current) => ({ ...current, name: event.target.value }))} type="text" placeholder="MB-001" />
                </label>
                <label className="admin-field">
                  <span>Barcode</span>
                  <input value={laptopForm.barcode} onChange={(event) => setLaptopForm((current) => ({ ...current, barcode: event.target.value }))} type="text" placeholder="BC-001" />
                </label>
                <label className="admin-field">
                  <span>Status</span>
                  <select value={laptopForm.status} onChange={(event) => setLaptopForm((current) => ({ ...current, status: event.target.value }))}>
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
                      <button type="button" className="danger-button small" onClick={() => removeLaptop(laptop.name)}>Delete</button>
                    </div>
                  </div>
                )) : <div className="admin-empty">No devices yet.</div>}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
