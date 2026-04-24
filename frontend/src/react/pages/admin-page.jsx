import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { deleteJson, postJson, requestJson } from '../shared/api';
import { LanguageSwitcher } from '../shared/language-switcher';
import { Modal } from '../shared/modal';
import { LANGUAGE_STORAGE_KEY } from '../shared/storage';
import { Toast, useToast } from '../shared/toast';
import { getTranslations, resolveLanguage } from '../shared/translations';

const UsersPanel = lazy(() => import('./admin-panels').then((module) => ({ default: module.UsersPanel })));
const UsersTable = lazy(() => import('./admin-panels').then((module) => ({ default: module.UsersTable })));
const LaptopsPanel = lazy(() => import('./admin-panels').then((module) => ({ default: module.LaptopsPanel })));

export function AdminPage() {
  const [adminToken, setAdminToken] = useState('');
  const [language, setLanguage] = useState(resolveLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'en'));
  const [users, setUsers] = useState([]);
  const [laptops, setLaptops] = useState([]);
  const [borrowRecords, setBorrowRecords] = useState([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [showUsersListModal, setShowUsersListModal] = useState(false);
  const emptyUserForm = { guid: '', uid: '', first_name: '', last_name: '', name: '', email: '', description: '', category: '', is_admin: false };
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [laptopForm, setLaptopForm] = useState({ name: '', barcode: '', device_number: '', status: 'available' });
  const { toast, showToast, clearToast } = useToast();
  const t = useMemo(() => getTranslations(language), [language]);

  useEffect(() => {
    const resolvedLanguage = resolveLanguage(language);
    if (resolvedLanguage !== language) {
      setLanguage(resolvedLanguage);
      return;
    }
    localStorage.setItem(LANGUAGE_STORAGE_KEY, resolvedLanguage);
  }, [language]);

  function authHeaders() {
    return adminToken ? { 'X-Admin-Token': adminToken } : {};
  }

  const loadAdminData = useCallback(async (nextToken = adminToken) => {
    const data = await requestJson('/admin/overview', authHeaders());
    setUsers(data.users || []);
    setLaptops(data.laptops || []);
    setBorrowRecords(data.borrow_records || []);
  }, [adminToken]);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        const state = await requestJson('/admin_state');
        if (!mounted) return;

        if (state.admin_session_active && state.admin_token) {
          setAdminToken(state.admin_token);
          await loadAdminData(state.admin_token);
        } else if (state.admin_redirect) {
          try {
            const loginData = await postJson('/admin/login', {});
            if (!mounted) return;
            if (loginData.admin_token) {
              setAdminToken(loginData.admin_token);
              await loadAdminData(loginData.admin_token);
            }
          } catch (error) {
            if (mounted) {
              showToast('error', t.admin.toasts.adminErrorTitle, error.message);
            }
          }
        }
      } catch (error) {
        if (mounted) {
          showToast('error', t.admin.toasts.adminErrorTitle, error.message);
        }
      }
    }

    bootstrap();
    return () => {
      mounted = false;
    };
  }, [adminToken, loadAdminData, showToast, t]);

  async function handleLogout() {
    try {
      await postJson('/admin/logout', {}, authHeaders());
    } catch {
      // Ignore logout transport errors and clear local state anyway.
    }
    setAdminToken('');
    setUsers([]);
    setLaptops([]);
    setBorrowRecords([]);
    window.location.href = '/';
  }

  async function handleAddUser(event) {
    event.preventDefault();
    try {
      const data = await postJson('/admin/users', userForm, authHeaders());
      setUserForm(emptyUserForm);
      setShowUserModal(false);
      await loadAdminData();
      showToast('success', t.admin.toasts.userAddedTitle, data.message);
    } catch (error) {
      showToast('error', t.admin.toasts.adminErrorTitle, error.message);
    }
  }

  async function handleAddLaptop(event) {
    event.preventDefault();
    try {
      const data = await postJson('/admin/laptops', laptopForm, authHeaders());
      setLaptopForm({ name: '', barcode: '', device_number: '', status: 'available' });
      setShowDeviceModal(false);
      await loadAdminData();
      showToast('success', t.admin.toasts.deviceAddedTitle, data.message);
    } catch (error) {
      showToast('error', t.admin.toasts.adminErrorTitle, error.message);
    }
  }

  async function handleImportUsers(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/admin/users/import', {
        method: 'POST',
        headers: authHeaders(),
        body: formData
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Import failed');
      }

      await loadAdminData();
      showToast('success', t.admin.toasts.importSuccessTitle, data.message);
    } catch (error) {
      showToast('error', t.admin.toasts.adminErrorTitle, error.message);
    } finally {
      event.target.value = '';
    }
  }

  async function removeUser(user) {
    try {
      const uid = typeof user === 'string' ? user : user?.uid;
      const guid = typeof user === 'string' ? '' : user?.guid;
      const path = uid
        ? `/admin/users/${encodeURIComponent(uid)}`
        : `/admin/users/by-guid/${encodeURIComponent(guid)}`;
      const data = await deleteJson(path, authHeaders());
      await loadAdminData();
      showToast('success', t.admin.toasts.userRemovedTitle, data.message);
    } catch (error) {
      showToast('error', t.admin.toasts.adminErrorTitle, error.message);
    }
  }

  async function removeLaptop(name) {
    try {
      const data = await deleteJson(`/admin/laptops/${encodeURIComponent(name)}`, authHeaders());
      await loadAdminData();
      showToast('success', t.admin.toasts.deviceRemovedTitle, data.message);
    } catch (error) {
      showToast('error', t.admin.toasts.adminErrorTitle, error.message);
    }
  }

  return (
    <div className="admin-screen">
      <Toast toast={toast} onClose={clearToast} />
      {!adminToken ? (
        <div className="admin-login-wrap">
          <div className="admin-login-panel">
            <LanguageSwitcher language={language} setLanguage={setLanguage} />
            <h1>{t.admin.accessTitle}</h1>
            <p>{t.admin.connectingText}</p>
            <div className="admin-actions">
              <button type="button" className="ghost-button" onClick={() => { window.location.href = '/'; }}>{t.common.backHome}</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="admin-page">
          <LanguageSwitcher language={language} setLanguage={setLanguage} />
          <header className="admin-hero">
            <div>
              <p className="admin-eyebrow">{t.admin.controlRoom}</p>
              <h1>{t.admin.panelTitle}</h1>
              <p>{t.admin.panelSubtitle}</p>
            </div>
            <div className="admin-actions">
              <button type="button" className="primary-button" onClick={() => setShowUserModal(true)}>{t.admin.addUser}</button>
              <button type="button" className="primary-button" onClick={() => setShowDeviceModal(true)}>{t.admin.addDevice}</button>
              <button type="button" className="ghost-button" onClick={() => setShowUsersListModal(true)}>{t.admin.viewUsers}</button>
              <button type="button" className="ghost-button" onClick={() => loadAdminData()}>{t.common.refresh}</button>
              <button type="button" className="danger-button" onClick={handleLogout}>{t.common.logout}</button>
            </div>
          </header>

          <div className="admin-stats-grid">
            <div className="admin-stat-card">
              <span className="admin-stat-value">{users.length}</span>
              <span className="admin-stat-label">{t.admin.stats.totalUsers}</span>
            </div>
            <div className="admin-stat-card">
              <span className="admin-stat-value">{laptops.length}</span>
              <span className="admin-stat-label">{t.admin.stats.totalDevices}</span>
            </div>
            <div className="admin-stat-card">
              <span className="admin-stat-value">{borrowRecords.filter(r => r.status === 'active').length}</span>
              <span className="admin-stat-label">{t.admin.stats.activeLoans}</span>
            </div>
          </div>

          <section className="admin-panel admin-wide-panel">
            <div className="admin-panel-head">
              <h2>{t.admin.borrowRecordsTitle}</h2>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t.admin.columns.id}</th>
                    <th>{t.admin.columns.uid}</th>
                    <th>{t.admin.columns.name}</th>
                    <th>{t.admin.columns.email}</th>
                    <th>{t.admin.columns.deviceNumber}</th>
                    <th>{t.admin.columns.device}</th>
                    <th>{t.admin.columns.barcode}</th>
                    <th>{t.admin.columns.taken}</th>
                    <th>{t.admin.columns.returned}</th>
                    <th>{t.admin.columns.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {borrowRecords.length === 0 ? (
                    <tr>
                      <td colSpan="10" style={{ textAlign: 'center', padding: '20px', color: '#aac7d8' }}>
                        {t.admin.noBorrowRecords}
                      </td>
                    </tr>
                  ) : (
                    borrowRecords.map((record) => (
                      <tr key={record.id}>
                        <td>{record.id}</td>
                        <td>{record.employee_uid}</td>
                        <td>{record.employee_name}</td>
                        <td>{record.employee_email || '-'}</td>
                        <td>{record.device_number}</td>
                        <td>{record.device_name || '-'}</td>
                        <td>{record.barcode || '-'}</td>
                        <td>{record.taken_at ? new Date(record.taken_at).toLocaleString() : '-'}</td>
                        <td>{record.returned_at ? new Date(record.returned_at).toLocaleString() : '-'}</td>
                        <td>
                          <span className={`status-badge ${record.status === 'active' ? 'status-admin' : 'status-available'}`}>
                            {record.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <Modal isOpen={showUserModal} onClose={() => setShowUserModal(false)} title={t.admin.addUser}>
            <Suspense fallback={<div>Loading...</div>}>
              <UsersPanel
                userForm={userForm}
                setUserForm={setUserForm}
                users={[]}
                t={t}
                onSubmit={handleAddUser}
                onRemove={() => {}}
                onImport={handleImportUsers}
              />
            </Suspense>
          </Modal>

          <Modal isOpen={showDeviceModal} onClose={() => setShowDeviceModal(false)} title={t.admin.addDevice}>
            <Suspense fallback={<div>Loading...</div>}>
              <LaptopsPanel
                laptopForm={laptopForm}
                setLaptopForm={setLaptopForm}
                laptops={[]}
                t={t}
                onSubmit={handleAddLaptop}
                onRemove={() => {}}
              />
            </Suspense>
          </Modal>

          <Modal isOpen={showUsersListModal} onClose={() => setShowUsersListModal(false)} title={t.admin.registeredUsers} fullscreen>
            <Suspense fallback={<div>Loading...</div>}>
              <UsersTable
                users={users}
                t={t}
                onRemove={removeUser}
              />
            </Suspense>
          </Modal>
        </div>
      )}
    </div>
  );
}
