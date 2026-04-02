'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
  className?: string;
  isGroupHeader?: boolean;
  topLevel?: boolean;
}

// Single-select overload
export interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
  autoSort?: boolean;
  multi?: false;
}

// Multi-select overload
export interface SearchableSelectMultiProps {
  value: string[];
  onChange: (value: string[]) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
  autoSort?: boolean;
  multi: true;
}

type CombinedProps = SearchableSelectProps | SearchableSelectMultiProps;

export default function SearchableSelect(props: CombinedProps) {
  const {
    options,
    placeholder = '—',
    disabled = false,
    style,
    className,
    autoSort = false,
  } = props;

  const isMulti = props.multi === true;
  const multiValue: string[] = isMulti ? (props as SearchableSelectMultiProps).value : [];
  const singleValue: string = !isMulti ? (props as SearchableSelectProps).value : '';

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(options.filter(o => o.isGroupHeader).map(o => o.value))
  );
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Apply autoSort: sort options alphabetically within each group (non-header options only)
  const sortedOptions = React.useMemo(() => {
    if (!autoSort) return options;
    // Sort non-group-header options alphabetically, preserving group headers in place
    const result: SelectOption[] = [];
    let currentGroupItems: SelectOption[] = [];
    let currentHeader: SelectOption | null = null;

    const flushGroup = () => {
      if (currentHeader) result.push(currentHeader);
      currentGroupItems.sort((a, b) => a.label.localeCompare(b.label));
      result.push(...currentGroupItems);
      currentGroupItems = [];
      currentHeader = null;
    };

    for (const opt of options) {
      if (opt.isGroupHeader) {
        flushGroup();
        currentHeader = opt;
      } else {
        currentGroupItems.push(opt);
      }
    }
    flushGroup();
    return result;
  }, [options, autoSort]);

  const selectedLabel = sortedOptions.find(o => o.value === singleValue)?.label || '';

  const filtered = search
    ? sortedOptions.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : sortedOptions;

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
      // Don't auto-focus on touch devices — focusing causes iOS to scroll the page,
      // which immediately triggers the scroll-close handler and closes the dropdown.
      const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
      if (!isTouchDevice) {
        searchInputRef.current?.focus();
      }
    } else {
      setSearch('');
    }
  }, [isOpen, updatePosition]);

  // Close on scroll/resize (but not when scrolling inside the dropdown)
  useEffect(() => {
    if (!isOpen) return;
    // Delay scroll listener slightly so the tap/focus-induced scroll on iOS
    // doesn't immediately close the dropdown that was just opened.
    let scrollHandler: ((e: Event) => void) | null = null;
    const timer = setTimeout(() => {
      scrollHandler = (e: Event) => {
        if (dropdownRef.current?.contains(e.target as Node)) return;
        setIsOpen(false);
      };
      window.addEventListener('scroll', scrollHandler, true);
    }, 150);
    const handleResize = () => updatePosition();
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      if (scrollHandler) window.removeEventListener('scroll', scrollHandler, true);
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

  const handleSingleSelect = (val: string) => {
    (props as SearchableSelectProps).onChange(val);
    setIsOpen(false);
  };

  const handleMultiToggle = (val: string) => {
    const onChange = (props as SearchableSelectMultiProps).onChange;
    if (multiValue.includes(val)) {
      onChange(multiValue.filter(v => v !== val));
    } else {
      onChange([...multiValue, val]);
    }
    // Keep dropdown open for multi
  };

  const handleMultiSelectAll = () => {
    const onChange = (props as SearchableSelectMultiProps).onChange;
    const allValues = filtered.filter(o => !o.isGroupHeader).map(o => o.value);
    onChange(allValues);
  };

  const handleMultiClear = () => {
    const onChange = (props as SearchableSelectMultiProps).onChange;
    onChange([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  // Trigger label
  let triggerLabel: React.ReactNode;
  if (isMulti) {
    if (multiValue.length === 0) {
      triggerLabel = placeholder;
    } else if (multiValue.length === 1) {
      const found = sortedOptions.find(o => o.value === multiValue[0]);
      triggerLabel = found?.label || multiValue[0];
    } else {
      triggerLabel = (
        <>
          <span className="searchable-select-count-badge">{multiValue.length}</span>
          {' selected'}
        </>
      );
    }
  } else {
    triggerLabel = selectedLabel || placeholder;
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        className={`searchable-select-trigger ${isMulti && multiValue.length > 0 ? 'has-selection' : ''} ${className || ''}`}
        style={style}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span className="searchable-select-label">
          {triggerLabel}
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
          {isMulti && (
            <div className="searchable-select-multi-actions">
              <button type="button" onClick={handleMultiSelectAll}>Select All</button>
              <button type="button" onClick={handleMultiClear}>Clear</button>
            </div>
          )}
          <div className="searchable-select-options">
            {!isMulti && (
              <div
                className={`searchable-select-option ${!singleValue ? 'selected' : ''}`}
                onClick={() => handleSingleSelect('')}
              >
                {placeholder}
              </div>
            )}
            {(() => {
              let currentGroup: string | null = null;
              const isSearching = !!search;
              return filtered.map(o => {
                if (o.isGroupHeader) {
                  currentGroup = o.value;
                  const isCollapsed = collapsedGroups.has(o.value);
                  // When searching, skip group headers (show all matching options flat)
                  if (isSearching) { currentGroup = null; return null; }
                  return (
                    <div
                      key={`group-${o.value}`}
                      className="searchable-select-group-header"
                      onClick={() => setCollapsedGroups(prev => {
                        const next = new Set(prev);
                        if (next.has(o.value)) next.delete(o.value);
                        else next.add(o.value);
                        return next;
                      })}
                    >
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="12" height="12" style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.15s' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      {o.label}
                    </div>
                  );
                }
                // topLevel options always show outside any group
                if (o.topLevel) currentGroup = null;
                // If in a collapsed group and not searching, hide this option
                if (!isSearching && currentGroup && collapsedGroups.has(currentGroup)) return null;

                if (isMulti) {
                  const checked = multiValue.includes(o.value);
                  return (
                    <div
                      key={o.value}
                      className={`searchable-select-option searchable-select-option-multi ${checked ? 'selected' : ''} ${o.className || ''}`}
                      onClick={() => handleMultiToggle(o.value)}
                    >
                      <input
                        type="checkbox"
                        className="searchable-select-checkbox"
                        checked={checked}
                        onChange={() => handleMultiToggle(o.value)}
                        onClick={e => e.stopPropagation()}
                      />
                      {o.label}
                    </div>
                  );
                }

                return (
                  <div
                    key={o.value}
                    className={`searchable-select-option ${o.value === singleValue ? 'selected' : ''} ${o.className || ''}`}
                    onClick={() => handleSingleSelect(o.value)}
                  >
                    {o.label}
                  </div>
                );
              });
            })()}
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
