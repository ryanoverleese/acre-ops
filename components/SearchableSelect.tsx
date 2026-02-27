'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = '—',
  disabled = false,
  style,
  className,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = options.find(o => o.value === value)?.label || '';

  const filtered = search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropdownHeight = Math.min(300, filtered.length * 32 + 44);
    const top = spaceBelow < dropdownHeight && rect.top > dropdownHeight
      ? rect.top - dropdownHeight
      : rect.bottom + 2;
    setDropdownPos({ top, left: rect.left, width: Math.max(rect.width, 180) });
  }, [filtered.length]);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      searchInputRef.current?.focus();
    } else {
      setSearch('');
    }
  }, [isOpen, updatePosition]);

  // Close on scroll/resize
  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = () => setIsOpen(false);
    const handleResize = () => updatePosition();
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, updatePosition]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        className={`searchable-select-trigger ${className || ''}`}
        style={style}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span className="searchable-select-label">
          {selectedLabel || placeholder}
        </span>
        <svg className="searchable-select-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          className="searchable-select-dropdown"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
          onKeyDown={handleKeyDown}
        >
          <div className="searchable-select-search-row">
            <input
              ref={searchInputRef}
              type="text"
              className="searchable-select-search"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  setIsOpen(false);
                  triggerRef.current?.focus();
                }
              }}
            />
            <button
              type="button"
              className="searchable-select-close"
              onClick={() => setIsOpen(false)}
              title="Close"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="searchable-select-options">
            <div
              className={`searchable-select-option ${!value ? 'selected' : ''}`}
              onClick={() => handleSelect('')}
            >
              {placeholder}
            </div>
            {filtered.map(o => (
              <div
                key={o.value}
                className={`searchable-select-option ${o.value === value ? 'selected' : ''}`}
                onClick={() => handleSelect(o.value)}
              >
                {o.label}
              </div>
            ))}
            {filtered.length === 0 && search && (
              <div className="searchable-select-empty">No matches</div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
