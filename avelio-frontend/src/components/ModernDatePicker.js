import React, { useState, useRef, useEffect } from 'react';
import { format, parse, isValid, startOfMonth, endOfMonth, eachDayOfInterval,
         addMonths, subMonths, isSameDay, isAfter, isBefore } from 'date-fns';
import './ModernDatePicker.css';

const ModernDatePicker = ({
  selected,
  onChange,
  placeholder = 'Select date',
  disabled = false,
  minDate,
  maxDate,
  dateFormat = 'dd MMM yyyy'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const containerRef = useRef(null);

  // Convert string date to Date object
  const selectedDate = selected
    ? (typeof selected === 'string' ? parse(selected, 'yyyy-MM-dd', new Date()) : selected)
    : null;

  // Initialize currentMonth to selected date's month
  useEffect(() => {
    if (selectedDate && isValid(selectedDate)) {
      setCurrentMonth(selectedDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDateClick = (date) => {
    onChange(format(date, 'yyyy-MM-dd'));
    setIsOpen(false);
  };

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const getDaysInMonth = () => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  };

  const getStartDayOfWeek = () => {
    return startOfMonth(currentMonth).getDay();
  };

  const isDateDisabled = (date) => {
    if (minDate && isBefore(date, minDate)) return true;
    if (maxDate && isAfter(date, maxDate)) return true;
    return false;
  };

  const days = getDaysInMonth();
  const startDay = getStartDayOfWeek();
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="modern-datepicker-container" ref={containerRef}>
      <button
        type="button"
        className={`modern-date-input ${disabled ? 'disabled' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span className={selectedDate ? 'date-value' : 'date-placeholder'}>
          {selectedDate && isValid(selectedDate) ? format(selectedDate, dateFormat) : placeholder}
        </span>
        <svg className="calendar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </button>

      {isOpen && (
        <div className="modern-datepicker-dropdown">
          <div className="datepicker-header">
            <button type="button" className="nav-btn" onClick={handlePrevMonth}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            <span className="current-month">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <button type="button" className="nav-btn" onClick={handleNextMonth}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </div>

          <div className="datepicker-weekdays">
            {weekDays.map(day => (
              <div key={day} className="weekday">{day}</div>
            ))}
          </div>

          <div className="datepicker-days">
            {/* Empty cells for days before start of month */}
            {Array.from({ length: startDay }).map((_, i) => (
              <div key={`empty-${i}`} className="day-cell empty"></div>
            ))}

            {days.map(date => {
              const isSelected = selectedDate && isSameDay(date, selectedDate);
              const isToday = isSameDay(date, new Date());
              const isDisabled = isDateDisabled(date);

              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  className={`day-cell ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${isDisabled ? 'disabled' : ''}`}
                  onClick={() => !isDisabled && handleDateClick(date)}
                  disabled={isDisabled}
                >
                  {format(date, 'd')}
                </button>
              );
            })}
          </div>

          <div className="datepicker-footer">
            <button
              type="button"
              className="today-btn"
              onClick={() => {
                const today = new Date();
                if (!isDateDisabled(today)) {
                  handleDateClick(today);
                }
              }}
            >
              Today
            </button>
            <button
              type="button"
              className="clear-btn"
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModernDatePicker;
