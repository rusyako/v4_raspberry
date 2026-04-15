const HOME_STATE_POLL_INTERVAL_MS = 5000;

async function simulateUidScan(uid) {
    const response = await fetch('/debug/scan_uid', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uid })
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
        throw new Error(data.message || 'UID simulation failed.');
    }

    if (data.redirect_admin) {
        window.location.href = '/admin';
        return data;
    }

    if (data.redirect_user) {
        window.location.href = '/hello_page';
        return data;
    }

    return data;
}

window.smartBoxDebug = {
    scanUid: async (uid) => {
        try {
            const data = await simulateUidScan(uid);
            console.info('UID simulated successfully:', data);
            return data;
        } catch (error) {
            console.error('UID simulation failed:', error);
            throw error;
        }
    }
};

async function updateHomeState() {
    try {
        const response = await fetch('/home_state', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Request failed with ${response.status}`);
        }

        const data = await response.json();
        const laptopCountElement = document.getElementById('amount__info-id');

        if (laptopCountElement) {
            laptopCountElement.textContent = data.laptop_count;
        }

        if (data.redirect) {
            window.location.href = '/hello_page';
        }
    } catch (error) {
        console.error('Error fetching home state:', error);
    }
}

if (window.location.pathname === '/') {
    updateHomeState();
    window.setInterval(updateHomeState, HOME_STATE_POLL_INTERVAL_MS);
}
