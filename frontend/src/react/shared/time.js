const GMT_PLUS_5_OFFSET_MS = 5 * 60 * 60 * 1000;

function parseIsoAsUtc(isoString) {
  const normalized = String(isoString || '').trim();
  if (!normalized) {
    return null;
  }

  const prepared = normalized.includes('T') ? normalized : normalized.replace(' ', 'T');
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(prepared) ? prepared : `${prepared}Z`;
  const timestamp = Date.parse(withZone);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return new Date(timestamp + GMT_PLUS_5_OFFSET_MS);
}

export function formatDateTimeGmtPlus5(isoString, { language = 'ru', compact = false } = {}) {
  const date = parseIsoAsUtc(isoString);
  if (!date) {
    return '--';
  }

  const day = date.getUTCDate();
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');

  const monthNames = {
    ru: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    kz: ['қаң', 'ақп', 'нау', 'сәу', 'мам', 'мау', 'шіл', 'там', 'қыр', 'қаз', 'қар', 'жел']
  };

  const monthName = monthNames[language] ? monthNames[language][month] : monthNames.en[month];
  if (compact) {
    return `${day} ${monthName} • ${hours}:${minutes}`;
  }

  return `${day} ${monthName} ${year}, ${hours}:${minutes} (GMT+5)`;
}
