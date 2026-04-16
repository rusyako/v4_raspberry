import { lazy, Suspense, useEffect, useState } from 'react';
import { deleteJson, postJson, requestJson } from '../shared/api';
import { Toast, useToast } from '../shared/toast';

const UsersPanel = lazy(() => import('./admin-panels').then((module) => ({ default: module.UsersPanel })));
const LaptopsPanel = lazy(() => import('./admin-panels').then((module) => ({ default: module.LaptopsPanel })));

export function AdminPage() {
  const [adminToken, setAdminToken] = useState('');
  const [pinRequired, setPinRequired] = useState(true);
  const [pinHint, setPinHint] = useState('Enter the administrator PIN code.');
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
        if (mounted) {
          setPinRequired(state.admin_pin_required !== false);
          setPinHint(
            state.admin_pin_required === false
              ? 'PIN is disabled. Admin access opens automatically.'
              : state.admin_redirect
                ? 'Admin card detected. Enter PIN 5005 to continue.'
                : 'Enter the administrator PIN code.'
          );
        }

        if (mounted && state.admin_pin_required === false && state.admin_token) {
          setAdminToken(state.admin_token);
          await loadAdminData(state.admin_token);
          return;
        }

        if (mounted && state.admin_redirect && !adminToken) {
          showToast('info', 'Admin card detected', 'Enter PIN 5005 to continue.');
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
            <p>{pinHint}</p>
            {pinRequired ? (
              <label className="admin-field">
                <span>PIN</span>
                <input value={pin} onChange={(event) => setPin(event.target.value)} type="password" inputMode="numeric" autoComplete="off" />
              </label>
            ) : null}
            <div className="admin-actions">
              {pinRequired ? <button type="submit" className="primary-button">Unlock Admin</button> : null}
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
            <Suspense fallback={<div className="admin-panel admin-loading">Loading users panel...</div>}>
              <UsersPanel
                userForm={userForm}
                setUserForm={setUserForm}
                users={users}
                onSubmit={handleAddUser}
                onRemove={removeUser}
              />
            </Suspense>

            <Suspense fallback={<div className="admin-panel admin-loading">Loading devices panel...</div>}>
              <LaptopsPanel
                laptopForm={laptopForm}
                setLaptopForm={setLaptopForm}
                laptops={laptops}
                onSubmit={handleAddLaptop}
                onRemove={removeLaptop}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
