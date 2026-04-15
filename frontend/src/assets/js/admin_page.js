const ADMIN_TOKEN_STORAGE_KEY = 'smartBoxAdminToken';

const loginView = document.getElementById('loginView');
const adminView = document.getElementById('adminView');
const loginForm = document.getElementById('adminLoginForm');
const adminPinInput = document.getElementById('adminPin');
const backHomeButton = document.getElementById('backHomeButton');
const logoutButton = document.getElementById('logoutButton');
const refreshButton = document.getElementById('refreshButton');
const userForm = document.getElementById('userForm');
const laptopForm = document.getElementById('laptopForm');
const usersList = document.getElementById('usersList');
const laptopsList = document.getElementById('laptopsList');

function getAdminToken() {
    return localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '';
}

function setAdminToken(token) {
    if (token) {
        localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
    } else {
        localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    }
}

function showToast(icon, title, text) {
    Swal.fire({
        icon,
        title,
        text,
        timer: 4500,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
    });
}

async function adminFetch(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'X-Admin-Token': getAdminToken(),
        ...(options.headers || {})
    };

    const response = await fetch(url, { ...options, headers });
    const data = await response.json();

    if (!response.ok || !data.success) {
        const error = new Error(data.message || 'Admin request failed.');
        error.status = response.status;
        throw error;
    }

    return data;
}

function toggleViews(isAdmin) {
    loginView.classList.toggle('hidden', isAdmin);
    adminView.classList.toggle('hidden', !isAdmin);
}

function renderUsers(users) {
    usersList.innerHTML = '';
    if (!users.length) {
        usersList.innerHTML = '<div class="list-item"><span>No users yet.</span></div>';
        return;
    }

    users.forEach((user) => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <div class="item-meta">
                <strong>${user.name || user.uid}</strong>
                <small>${user.uid}</small>
                ${user.is_admin ? '<span class="badge admin">Admin</span>' : ''}
            </div>
        `;

        const removeButton = document.createElement('button');
        removeButton.className = 'danger-btn';
        removeButton.type = 'button';
        removeButton.textContent = 'Delete';
        removeButton.addEventListener('click', async () => {
            try {
                await adminFetch(`/admin/users/${encodeURIComponent(user.uid)}`, { method: 'DELETE' });
                showToast('success', 'User removed', 'Пользователь удалён. / User deleted.');
                await loadAdminData();
            } catch (error) {
                handleAdminError(error);
            }
        });

        item.appendChild(removeButton);
        usersList.appendChild(item);
    });
}

function renderLaptops(laptops) {
    laptopsList.innerHTML = '';
    if (!laptops.length) {
        laptopsList.innerHTML = '<div class="list-item"><span>No devices yet.</span></div>';
        return;
    }

    laptops.forEach((laptop) => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <div class="item-meta">
                <strong>${laptop.name}</strong>
                <small>Barcode: ${laptop.barcode || '-'}</small>
                <span class="badge ${laptop.status}">${laptop.status}</span>
            </div>
        `;

        const removeButton = document.createElement('button');
        removeButton.className = 'danger-btn';
        removeButton.type = 'button';
        removeButton.textContent = 'Delete';
        removeButton.addEventListener('click', async () => {
            try {
                await adminFetch(`/admin/laptops/${encodeURIComponent(laptop.name)}`, { method: 'DELETE' });
                showToast('success', 'Device removed', 'Устройство удалено. / Device deleted.');
                await loadAdminData();
            } catch (error) {
                handleAdminError(error);
            }
        });

        item.appendChild(removeButton);
        laptopsList.appendChild(item);
    });
}

function handleAdminError(error) {
    console.error(error);

    if (error.status === 401) {
        setAdminToken('');
        toggleViews(false);
        showToast('error', 'Admin login required', error.message);
        adminPinInput?.focus();
        return;
    }

    showToast('error', 'Admin error', error.message || 'Request failed.');
}

async function loadAdminData() {
    try {
        const data = await adminFetch('/admin/overview', { method: 'GET' });
        renderUsers(data.users || []);
        renderLaptops(data.laptops || []);
        toggleViews(true);
    } catch (error) {
        handleAdminError(error);
    }
}

async function attemptTokenLogin() {
    if (!getAdminToken()) {
        toggleViews(false);
        return;
    }

    await loadAdminData();
}

loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
        const response = await fetch('/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: adminPinInput.value.trim() })
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Unable to log in.');
        }

        setAdminToken(data.admin_token);
        adminPinInput.value = '';
        showToast('success', 'Admin unlocked', data.message);
        await loadAdminData();
    } catch (error) {
        showToast('error', 'PIN failed', error.message || 'Unable to log in.');
        adminPinInput.focus();
    }
});

backHomeButton?.addEventListener('click', () => {
    window.location.href = '/';
});

logoutButton?.addEventListener('click', async () => {
    try {
        await adminFetch('/admin/logout', { method: 'POST' });
    } catch (error) {
        console.error(error);
    }

    setAdminToken('');
    toggleViews(false);
    adminPinInput.focus();
});

refreshButton?.addEventListener('click', () => {
    loadAdminData();
});

userForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const uid = document.getElementById('userUid').value.trim();
    const name = document.getElementById('userName').value.trim();
    const isAdmin = document.getElementById('userIsAdmin').checked;

    try {
        const data = await adminFetch('/admin/users', {
            method: 'POST',
            body: JSON.stringify({ uid, name, is_admin: isAdmin })
        });
        userForm.reset();
        showToast('success', 'User added', data.message);
        await loadAdminData();
    } catch (error) {
        handleAdminError(error);
    }
});

laptopForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const name = document.getElementById('laptopName').value.trim();
    const barcode = document.getElementById('laptopBarcode').value.trim();
    const status = document.getElementById('laptopStatus').value;

    try {
        const data = await adminFetch('/admin/laptops', {
            method: 'POST',
            body: JSON.stringify({ name, barcode, status })
        });
        laptopForm.reset();
        showToast('success', 'Device added', data.message);
        await loadAdminData();
    } catch (error) {
        handleAdminError(error);
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    const response = await fetch('/admin_state');
    const state = await response.json();

    if (state.admin_redirect && !getAdminToken()) {
        showToast('info', 'Admin card detected', 'Приложите PIN для входа. / Enter the PIN to continue.');
    }

    await attemptTokenLogin();
    adminPinInput?.focus();
});
