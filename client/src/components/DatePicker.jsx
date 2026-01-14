import { useState, useEffect, useCallback } from 'react';
import {
  deserializeDateValue,
  serializeDateValue,
  generateYearOptions,
  MONTH_NAMES
} from '../utils/dateUtils';
import './DatePicker.css';

const YEAR_OPTIONS = generateYearOptions();

function DatePicker({ value, onChange, className }) {
  const [precision, setPrecision] = useState('year');
  const [isRange, setIsRange] = useState(false);
  const [startDate, setStartDate] = useState({ year: '', month: '', day: '' });
  const [endDate, setEndDate] = useState({ year: '', month: '', day: '' });
  const [legacyText, setLegacyText] = useState('');

  // Initialize state from value
  useEffect(() => {
    const state = deserializeDateValue(value);
    setPrecision(state.precision);
    setIsRange(state.isRange);
    setStartDate(state.startDate);
    setEndDate(state.endDate);
    setLegacyText(state.legacyText);
  }, [value]);

  // Notify parent of changes
  const emitChange = useCallback((newPrecision, newIsRange, newStartDate, newEndDate) => {
    const serialized = serializeDateValue(newPrecision, newIsRange, newStartDate, newEndDate);
    onChange(serialized);
  }, [onChange]);

  const handlePrecisionChange = (newPrecision) => {
    setPrecision(newPrecision);
    // Clear lower precision fields when changing precision up
    const newStart = { ...startDate };
    const newEnd = { ...endDate };
    if (newPrecision === 'year') {
      newStart.month = '';
      newStart.day = '';
      newEnd.month = '';
      newEnd.day = '';
    } else if (newPrecision === 'month') {
      newStart.day = '';
      newEnd.day = '';
    }
    setStartDate(newStart);
    setEndDate(newEnd);
    emitChange(newPrecision, isRange, newStart, newEnd);
  };

  const handleRangeToggle = () => {
    const newIsRange = !isRange;
    setIsRange(newIsRange);
    if (!newIsRange) {
      setEndDate({ year: '', month: '', day: '' });
    }
    emitChange(precision, newIsRange, startDate, newIsRange ? endDate : { year: '', month: '', day: '' });
  };

  const handleStartDateChange = (field, val) => {
    const newStart = { ...startDate, [field]: val };
    setStartDate(newStart);
    emitChange(precision, isRange, newStart, endDate);
  };

  const handleEndDateChange = (field, val) => {
    const newEnd = { ...endDate, [field]: val };
    setEndDate(newEnd);
    emitChange(precision, isRange, startDate, newEnd);
  };

  const handleDayInputChange = (dateString, isEnd = false) => {
    if (!dateString) {
      if (isEnd) {
        setEndDate({ year: '', month: '', day: '' });
        emitChange(precision, isRange, startDate, { year: '', month: '', day: '' });
      } else {
        setStartDate({ year: '', month: '', day: '' });
        emitChange(precision, isRange, { year: '', month: '', day: '' }, endDate);
      }
      return;
    }
    const [year, month, day] = dateString.split('-');
    const newDate = { year, month, day };
    if (isEnd) {
      setEndDate(newDate);
      emitChange(precision, isRange, startDate, newDate);
    } else {
      setStartDate(newDate);
      emitChange(precision, isRange, newDate, endDate);
    }
  };

  const convertLegacy = () => {
    setLegacyText('');
    const currentYear = new Date().getFullYear().toString();
    const newStart = { year: currentYear, month: '', day: '' };
    setStartDate(newStart);
    emitChange('year', false, newStart, { year: '', month: '', day: '' });
  };

  const keepLegacy = () => {
    // Just keep the legacy value, don't call onChange since it's already stored
  };

  // Render date inputs based on precision
  const renderDateInputs = (dateValue, handleChange, label) => {
    if (precision === 'day') {
      const dateStr = dateValue.year && dateValue.month && dateValue.day
        ? `${dateValue.year}-${dateValue.month}-${dateValue.day}`
        : '';
      return (
        <div className="date-input-group">
          {label && <span className="date-range-label">{label}</span>}
          <input
            type="date"
            value={dateStr}
            onChange={e => handleChange(e.target.value)}
            className="date-input day-input"
          />
        </div>
      );
    }

    return (
      <div className="date-input-group">
        {label && <span className="date-range-label">{label}</span>}
        <div className="date-selects">
          {precision === 'month' && (
            <select
              value={dateValue.month}
              onChange={e => handleChange('month', e.target.value)}
              className="date-select month-select"
            >
              <option value="">Month</option>
              {MONTH_NAMES.map((name, idx) => (
                <option key={idx} value={String(idx + 1).padStart(2, '0')}>
                  {name}
                </option>
              ))}
            </select>
          )}
          <select
            value={dateValue.year}
            onChange={e => handleChange('year', e.target.value)}
            className="date-select year-select"
          >
            <option value="">Year</option>
            {YEAR_OPTIONS.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  // Show legacy text editor if there's legacy data
  if (legacyText) {
    return (
      <div className={`date-picker date-picker-legacy ${className || ''}`}>
        <div className="legacy-display">
          <span className="legacy-value">{legacyText}</span>
          <span className="legacy-notice">Free-text date</span>
        </div>
        <div className="legacy-actions">
          <button type="button" className="legacy-keep-btn" onClick={keepLegacy}>
            Keep
          </button>
          <button type="button" className="legacy-convert-btn" onClick={convertLegacy}>
            Convert to picker
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`date-picker ${className || ''}`}>
      {/* Precision selector */}
      <div className="date-picker-row">
        <div className="segmented-control">
          <button
            type="button"
            className={`segmented-btn ${precision === 'year' ? 'active' : ''}`}
            onClick={() => handlePrecisionChange('year')}
          >
            Year
          </button>
          <button
            type="button"
            className={`segmented-btn ${precision === 'month' ? 'active' : ''}`}
            onClick={() => handlePrecisionChange('month')}
          >
            Month
          </button>
          <button
            type="button"
            className={`segmented-btn ${precision === 'day' ? 'active' : ''}`}
            onClick={() => handlePrecisionChange('day')}
          >
            Day
          </button>
        </div>
      </div>

      {/* Range toggle */}
      <div className="date-picker-row date-picker-range-row">
        <span className="date-picker-label">Range</span>
        <button
          type="button"
          className={`toggle-btn ${isRange ? 'active' : ''}`}
          onClick={handleRangeToggle}
        >
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
        </button>
      </div>

      {/* Date inputs */}
      <div className="date-picker-inputs">
        {isRange ? (
          <div className="date-range-inputs">
            {precision === 'day' ? (
              <>
                {renderDateInputs(startDate, (val) => handleDayInputChange(val, false), 'From')}
                <span className="date-range-separator">to</span>
                {renderDateInputs(endDate, (val) => handleDayInputChange(val, true), 'To')}
              </>
            ) : (
              <>
                {renderDateInputs(startDate, handleStartDateChange, 'From')}
                <span className="date-range-separator">to</span>
                {renderDateInputs(endDate, handleEndDateChange, 'To')}
              </>
            )}
          </div>
        ) : (
          <div className="date-single-input">
            {precision === 'day'
              ? renderDateInputs(startDate, (val) => handleDayInputChange(val, false))
              : renderDateInputs(startDate, handleStartDateChange)
            }
          </div>
        )}
      </div>
    </div>
  );
}

export default DatePicker;
