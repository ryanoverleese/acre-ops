'use client';

import React from 'react';

/**
 * SavedIndicator - Shows a brief "Saved" confirmation with checkmark
 */
interface SavedIndicatorProps {
  show: boolean;
  text?: string;
}

export function SavedIndicator({ show, text = 'Saved' }: SavedIndicatorProps) {
  if (!show) return null;

  return (
    <span className="saved-indicator">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      {text}
    </span>
  );
}

/**
 * ContentCard - Reusable card container with consistent styling
 */
interface ContentCardProps {
  children: React.ReactNode;
  className?: string;
}

export function ContentCard({ children, className = '' }: ContentCardProps) {
  return (
    <div className={`content-card ${className}`.trim()}>
      {children}
    </div>
  );
}

/**
 * SectionHeader - Header for content sections with optional actions
 */
interface SectionHeaderProps {
  title: string;
  actions?: React.ReactNode;
  description?: string;
}

export function SectionHeader({ title, actions, description }: SectionHeaderProps) {
  return (
    <>
      <div className="section-header">
        <h3>{title}</h3>
        {actions && <div className="section-header-actions">{actions}</div>}
      </div>
      {description && <p className="section-description">{description}</p>}
    </>
  );
}

/**
 * PageHeader - Top-level page header
 */
interface PageHeaderProps {
  title: string;
  description?: string;
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="page-header">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

/**
 * ColumnTag - Removable tag for column selection
 */
interface ColumnTagProps {
  label: string;
  locked?: boolean;
  onRemove?: () => void;
}

export function ColumnTag({ label, locked = false, onRemove }: ColumnTagProps) {
  return (
    <span className={`column-tag ${locked ? 'locked' : ''}`}>
      {label}
      {!locked && onRemove && (
        <button
          className="column-tag-remove"
          onClick={onRemove}
          title="Remove column"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}

/**
 * ColumnTagsContainer - Container for column tags
 */
interface ColumnTagsContainerProps {
  children: React.ReactNode;
}

export function ColumnTagsContainer({ children }: ColumnTagsContainerProps) {
  return (
    <div className="column-tags-container">
      {children}
    </div>
  );
}

/**
 * FormFieldRow - Horizontal row of form fields
 */
interface FormFieldRowProps {
  children: React.ReactNode;
  className?: string;
}

export function FormFieldRow({ children, className = '' }: FormFieldRowProps) {
  return (
    <div className={`form-field-row ${className}`.trim()}>
      {children}
    </div>
  );
}

/**
 * DateInputGroup - Labeled date input
 */
interface DateInputGroupProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function DateInputGroup({ label, value, onChange }: DateInputGroupProps) {
  return (
    <div className="date-input-group">
      <label>{label}</label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/**
 * NotesField - Editable notes field with click-to-edit behavior
 */
interface NotesFieldProps {
  value: string;
  placeholder?: string;
  isEditing: boolean;
  isSaving?: boolean;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onChange: (value: string) => void;
}

export function NotesField({
  value,
  placeholder = 'Click to add notes...',
  isEditing,
  isSaving = false,
  onStartEdit,
  onSave,
  onCancel,
  onChange,
}: NotesFieldProps) {
  if (isEditing) {
    return (
      <div className="notes-edit-form">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Add notes..."
        />
        <div className="notes-edit-actions">
          <button
            className="btn btn-primary btn-sm"
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? '...' : 'Save'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`notes-field ${!value ? 'empty' : ''}`}
      onClick={onStartEdit}
    >
      {value || placeholder}
    </div>
  );
}

/**
 * EntityCard - Expandable card for billing entities
 */
interface EntityCardProps {
  children: React.ReactNode;
  className?: string;
}

export function EntityCard({ children, className = '' }: EntityCardProps) {
  return (
    <div className={`entity-card ${className}`.trim()}>
      {children}
    </div>
  );
}

/**
 * EntityHeader - Header for expandable entity cards
 */
interface EntityHeaderProps {
  title: string;
  subtitle?: string;
  isExpanded: boolean;
  onToggle: () => void;
  rightContent?: React.ReactNode;
}

export function EntityHeader({ title, subtitle, isExpanded, onToggle, rightContent }: EntityHeaderProps) {
  return (
    <div className="entity-header" onClick={onToggle}>
      <div className="entity-header-left">
        <svg
          className={`entity-expand-icon ${isExpanded ? 'expanded' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          width="18"
          height="18"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <div>
          <div className="entity-title">{title}</div>
          {subtitle && <div className="entity-subtitle">{subtitle}</div>}
        </div>
      </div>
      {rightContent && (
        <div className="entity-header-right">
          {rightContent}
        </div>
      )}
    </div>
  );
}

/**
 * EntityContent - Content area for expanded entity
 */
interface EntityContentProps {
  children: React.ReactNode;
}

export function EntityContent({ children }: EntityContentProps) {
  return (
    <div className="entity-content">
      {children}
    </div>
  );
}

/**
 * EntityFooter - Footer area for entity (notes, dates, etc.)
 */
interface EntityFooterProps {
  children: React.ReactNode;
}

export function EntityFooter({ children }: EntityFooterProps) {
  return (
    <div className="entity-footer">
      {children}
    </div>
  );
}
