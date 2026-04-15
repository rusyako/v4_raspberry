const RETURN_BARCODES_STORAGE_KEY = 'returnScannedBarcodes';

const barcodeInput = document.getElementById('stylish-input');
const barcodeList = document.getElementById('barcodeList');

let scannedBarcodes = [];

const UI_TEXT = {
    invalidBarcodeTitle: 'Неверный штрихкод / Invalid barcode',
    invalidBarcodeText: 'Отсканируйте или введите корректный штрихкод. / Please scan or enter a valid barcode.',
    duplicateDeviceTitle: 'Устройство уже добавлено / Device already added',
    duplicateDeviceText: 'Это устройство уже есть в списке. / This device is already in the list.',
    deviceCheckFailedTitle: 'Ошибка проверки устройства / Device check failed',
    sessionResetFailedTitle: 'Ошибка сброса сессии / Session reset failed',
    sessionResetFailedText: 'Не удалось очистить сессию. / Unable to clear the session.',
    noDevicesSelectedTitle: 'Нет выбранных устройств / No devices selected',
    noDevicesSelectedText: 'Сначала отсканируйте хотя бы один штрихкод. / Scan at least one barcode first.',
    returnFailedTitle: 'Ошибка возврата / Return failed',
    returnSuccessTitle: 'Возврат выполнен / Return successful',
    returnSuccessText: 'Устройства успешно возвращены. / Devices were returned successfully.',
    returnSubmitFailedText: 'Не удалось отправить список на возврат. / Unable to submit the return list.'
};

function saveScannedBarcodes() {
    localStorage.setItem(RETURN_BARCODES_STORAGE_KEY, JSON.stringify(scannedBarcodes));
}

function removeScannedBarcode(barcode) {
    scannedBarcodes = scannedBarcodes.filter((item) => item !== barcode);
    saveScannedBarcodes();
    renderScannedBarcodes();
}

function createListItem(barcode, index) {
    const listItem = document.createElement('li');
    listItem.classList.add('list-item');
    listItem.textContent = `${index + 1}. ${barcode}`;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'X';
    removeButton.style.marginLeft = '10px';
    removeButton.classList.add('cancel-button');
    removeButton.addEventListener('click', () => removeScannedBarcode(barcode));

    listItem.appendChild(removeButton);
    return listItem;
}

function renderScannedBarcodes() {
    barcodeList.innerHTML = '';
    scannedBarcodes.forEach((barcode, index) => {
        barcodeList.appendChild(createListItem(barcode, index));
    });
}

function loadScannedBarcodes() {
    try {
        const savedBarcodes = JSON.parse(localStorage.getItem(RETURN_BARCODES_STORAGE_KEY) || '[]');
        scannedBarcodes = Array.isArray(savedBarcodes) ? savedBarcodes : [];
    } catch (error) {
        console.error('Error reading stored barcodes:', error);
        scannedBarcodes = [];
    }

    renderScannedBarcodes();
}

function isValidBarcode(barcode) {
    return /^[a-zA-Z0-9-\s]+$/.test(barcode);
}

function focusBarcodeInput() {
    if (barcodeInput) {
        barcodeInput.value = '';
        barcodeInput.focus();
    }
}

function showToast(icon, title, text) {
    Swal.fire({
        icon,
        title,
        text,
        timer: 5000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
    });
}

async function checkLaptop(barcode) {
    const response = await fetch('/check_laptop', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ barcode })
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.message || 'Unable to check this device right now.');
    }

    return data;
}

async function handleBarcodeSubmit(event) {
    if (event.key !== 'Enter') {
        return;
    }

    event.preventDefault();

    const barcode = barcodeInput.value.trim();
    if (!isValidBarcode(barcode)) {
        showToast('error', UI_TEXT.invalidBarcodeTitle, UI_TEXT.invalidBarcodeText);
        focusBarcodeInput();
        return;
    }

    if (!barcode) {
        focusBarcodeInput();
        return;
    }

    if (scannedBarcodes.includes(barcode)) {
        showToast('info', UI_TEXT.duplicateDeviceTitle, UI_TEXT.duplicateDeviceText);
        focusBarcodeInput();
        return;
    }

    try {
        const data = await checkLaptop(barcode);
        scannedBarcodes.push(barcode);
        saveScannedBarcodes();
        renderScannedBarcodes();
        buttonContainer.scrollIntoView({ behavior: 'smooth' });
        focusBarcodeInput();
    } catch (error) {
        console.error('Error:', error);
        showToast('error', UI_TEXT.deviceCheckFailedTitle, error.message || UI_TEXT.invalidBarcodeText);
        focusBarcodeInput();
    }
}

async function clearSessionAndGoHome() {
    try {
        const response = await fetch('/clear_session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Unable to clear the session.');
        }

        scannedBarcodes = [];
        localStorage.removeItem(RETURN_BARCODES_STORAGE_KEY);
        renderScannedBarcodes();
        fetch('/send_arduino_signal_on', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        console.error('Error clearing session:', error);
        showToast('error', UI_TEXT.sessionResetFailedTitle, error.message || UI_TEXT.sessionResetFailedText);
        focusBarcodeInput();
    }
}

async function submitReturnedBarcodes(event) {
    event.preventDefault();

    if (scannedBarcodes.length === 0) {
        showToast('info', UI_TEXT.noDevicesSelectedTitle, UI_TEXT.noDevicesSelectedText);
        return;
    }

    try {
        const response = await fetch('/return_laptops', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ barcodes: scannedBarcodes })
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            showToast('error', UI_TEXT.returnFailedTitle, data.message);
            return;
        }

        showToast('success', UI_TEXT.returnSuccessTitle, data.message || UI_TEXT.returnSuccessText);
        scannedBarcodes = [];
        localStorage.removeItem(RETURN_BARCODES_STORAGE_KEY);
        renderScannedBarcodes();
        fetch('/send_arduino_signal_on', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        console.error('Error returning laptops:', error);
        showToast('error', UI_TEXT.returnFailedTitle, UI_TEXT.returnSubmitFailedText);
    }
}

const buttonContainer = document.createElement('div');
buttonContainer.id = 'buttonContainer';
buttonContainer.style.display = 'flex';
buttonContainer.style.justifyContent = 'space-between';
buttonContainer.style.alignItems = 'center';
buttonContainer.style.marginTop = '10px';

const cancelButton = document.createElement('button');
cancelButton.type = 'button';
cancelButton.textContent = 'Cancel';
cancelButton.id = 'cancelButton';
cancelButton.style.marginLeft = '10px';

const returnButton = document.createElement('button');
returnButton.type = 'button';
returnButton.textContent = 'Return';
returnButton.id = 'submitButton';

buttonContainer.appendChild(returnButton);
buttonContainer.appendChild(cancelButton);
barcodeList.parentNode.insertBefore(buttonContainer, barcodeList.nextSibling);

document.addEventListener('DOMContentLoaded', () => {
    loadScannedBarcodes();
    barcodeInput?.addEventListener('keydown', handleBarcodeSubmit);
    returnButton.addEventListener('click', submitReturnedBarcodes);
    cancelButton.addEventListener('click', clearSessionAndGoHome);
    barcodeInput?.focus();
});
