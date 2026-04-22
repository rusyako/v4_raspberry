import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { deleteJson, postJson, requestJson } from '../shared/api';
import { LanguageSwitcher } from '../shared/language-switcher';
import { LANGUAGE_STORAGE_KEY } from '../shared/storage';
import { Toast, useToast } from '../shared/toast';
import { getTranslations, resolveLanguage } from '../shared/translations';

const UsersPanel = lazy(() => import('./admin-panels').then((module) => ({ default: module.UsersPanel })));
const LaptopsPanel = lazy(() => import('./admin-panels').then((module) => ({ default: module.LaptopsPanel })));

export function AdminPage() {
  const [adminToken, setAdminToken] = useState('');
  const [language, setLanguage] = useState(resolveLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'en'));
  const [users, setUsers] = useState([]);
  const [laptops, setLaptops] = useState([]);
  const [borrowRecords, setBorrowRecords] = useState([]);
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
    const data = await requestJson('/admin/overview', {
      method: 'GET',
      headers: nextToken ? { 'X-Admin-Token': nextToken } : {}
    });
    setUsers(data.users || []);
    setLaptops(data.laptops || []);
    setBorrowRecords(data.borrow_records || []);
  }, [adminToken]);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        const state = await requestJson('/admin_state', { method: 'GET' });

        if (mounted && state.admin_redirect && !state.admin_session_active) {
          showToast('info', t.admin.toasts.adminDetectedTitle, t.admin.toasts.adminDetectedText);
        }

        if (mounted && state.admin_session_active && state.admin_token) {
          setAdminToken(state.admin_token);
          await loadAdminData(state.admin_token);
          return;
        }

        if (mounted && state.admin_redirect && !state.admin_session_active) {
          try {
            const login = await postJson('/admin/login', {});
            if (!mounted) {
              return;
            }

            setAdminToken(login.admin_token || '');
            await loadAdminData(login.admin_token || '');
            return;
          } catch (error) {
            if (!mounted) {
              return;
            }

            showToast('error', t.admin.toasts.adminRequiredTitle, error.message);
          }
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
          showToast('error', t.admin.toasts.adminRequiredTitle, error.message);
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
      await loadAdminData();
      showToast('success', t.admin.toasts.deviceAddedTitle, data.message);
    } catch (error) {
      showToast('error', t.admin.toasts.adminErrorTitle, error.message);
    }
  }

  async function removeUser(uid) {
    try {
      const data = await deleteJson(`/admin/users/${encodeURIComponent(uid)}`, authHeaders());
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
              <button type="button" className="ghost-button" onClick={() => loadAdminData()}>{t.common.refresh}</button>
              <button type="button" className="danger-button" onClick={handleLogout}>{t.common.logout}</button>
            </div>
          </header>

          <div className="admin-grid">
            <Suspense fallback={<div className="admin-panel admin-loading">Loading users panel...</div>}>
              <UsersPanel
                userForm={userForm}
                setUserForm={setUserForm}
                users={users}
                t={t}
                onSubmit={handleAddUser}
                onRemove={removeUser}
              />
            </Suspense>

            <Suspense fallback={<div className="admin-panel admin-loading">Loading devices panel...</div>}>
              <LaptopsPanel
                laptopForm={laptopForm}
                setLaptopForm={setLaptopForm}
                laptops={laptops}
                t={t}
                onSubmit={handleAddLaptop}
                onRemove={removeLaptop}
              />
            </Suspense>
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
                  {borrowRecords.length ? borrowRecords.map((record) => (
                    <tr key={record.id}>
                      <td>{record.id}</td>
                      <td>{record.employee_uid}</td>
                      <td>{record.employee_name || '-'}</td>
                      <td>{record.employee_email || '-'}</td>
                      <td>{record.device_number || '-'}</td>
                      <td>{record.device_name || '-'}</td>
                      <td>{record.barcode || '-'}</td>
                      <td>{record.taken_at || '-'}</td>
                      <td>{record.returned_at || '-'}</td>
                      <td>
                        <span className={`status-badge ${record.status === 'active' ? 'status-available' : 'status-unavailable'}`}>
                          {record.status}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="10" className="admin-empty">{t.admin.noBorrowRecords}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
