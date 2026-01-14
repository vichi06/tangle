const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/**
 * Parse a date value from storage format
 * Returns { type: 'structured', data: {...} } or { type: 'freetext', value: '...' }
 */
export function parseDateValue(dateString) {
  if (!dateString) return null;

  try {
    const parsed = JSON.parse(dateString);
    if (parsed && typeof parsed === 'object' && parsed.precision) {
      return { type: 'structured', data: parsed };
    }
    return { type: 'freetext', value: dateString };
  } catch {
    return { type: 'freetext', value: dateString };
  }
}

/**
 * Format a structured date for display
 * @param {string} dateString - The stored date value
 * @param {boolean} short - Use short month names
 */
export function formatDateForDisplay(dateString, short = false) {
  const parsed = parseDateValue(dateString);

  if (!parsed) return '';

  if (parsed.type === 'freetext') {
    return parsed.value;
  }

  const { data } = parsed;
  const monthNames = short ? MONTH_NAMES_SHORT : MONTH_NAMES;

  const formatSingleDate = (value, precision) => {
    if (precision === 'year') {
      return value;
    }
    if (precision === 'month') {
      const [year, month] = value.split('-');
      return `${monthNames[parseInt(month, 10) - 1]} ${year}`;
    }
    if (precision === 'day') {
      const [year, month, day] = value.split('-');
      return `${monthNames[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`;
    }
    return value;
  };

  if (data.range) {
    const start = formatSingleDate(data.start, data.precision);
    const end = formatSingleDate(data.end, data.precision);
    return `${start} - ${end}`;
  }

  return formatSingleDate(data.value, data.precision);
}

/**
 * Serialize date picker state to storage format (JSON string)
 */
export function serializeDateValue(precision, isRange, startDate, endDate) {
  const formatValue = (dateObj) => {
    if (precision === 'year') return dateObj.year;
    if (precision === 'month') return `${dateObj.year}-${dateObj.month}`;
    if (precision === 'day') return `${dateObj.year}-${dateObj.month}-${dateObj.day}`;
    return '';
  };

  if (!startDate.year) return '';

  // For month precision, require month
  if (precision === 'month' && !startDate.month) return '';
  // For day precision, require month and day
  if (precision === 'day' && (!startDate.month || !startDate.day)) return '';

  const result = { precision };

  if (isRange) {
    if (!endDate.year) return '';
    if (precision === 'month' && !endDate.month) return '';
    if (precision === 'day' && (!endDate.month || !endDate.day)) return '';

    result.range = true;
    result.start = formatValue(startDate);
    result.end = formatValue(endDate);
  } else {
    result.value = formatValue(startDate);
  }

  return JSON.stringify(result);
}

/**
 * Deserialize storage format to date picker state
 */
export function deserializeDateValue(dateString) {
  const parsed = parseDateValue(dateString);

  const emptyState = {
    precision: 'year',
    isRange: false,
    startDate: { year: '', month: '', day: '' },
    endDate: { year: '', month: '', day: '' },
    legacyText: ''
  };

  if (!parsed) return emptyState;

  if (parsed.type === 'freetext') {
    return { ...emptyState, legacyText: parsed.value };
  }

  const { data } = parsed;

  const parseValue = (value) => {
    if (!value) return { year: '', month: '', day: '' };
    const parts = value.split('-');
    return {
      year: parts[0] || '',
      month: parts[1] || '',
      day: parts[2] || ''
    };
  };

  return {
    precision: data.precision,
    isRange: !!data.range,
    startDate: data.range ? parseValue(data.start) : parseValue(data.value),
    endDate: data.range ? parseValue(data.end) : { year: '', month: '', day: '' },
    legacyText: ''
  };
}

/**
 * Generate year options from 2000 to current year + 1
 */
export function generateYearOptions() {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let year = currentYear + 1; year >= 2000; year--) {
    years.push(year.toString());
  }
  return years;
}

export { MONTH_NAMES, MONTH_NAMES_SHORT };
