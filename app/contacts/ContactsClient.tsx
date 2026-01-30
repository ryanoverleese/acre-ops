'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { ProcessedContact, OperationOption, BillingEntityOption } from './page';

// Dynamically import map components with SSR disabled
const ContactsMap = dynamic(() => import('@/components/ContactsMap'), {
  ssr: false,
  loading: () => <div className="map-loading">Loading map...</div>,
});

const LocationPicker = dynamic(() => import('@/components/LocationPicker'), {
  ssr: false,
});

interface ContactsClientProps {
  initialContacts: ProcessedContact[];
  operations: OperationOption[];
  billingEntities: BillingEntityOption[];
}

interface SelectedBillingEntity {
  id: number;
  name: string;
}

const CUSTOMER_TYPE_OPTIONS = ['Current Customer', 'Past Customer', 'Weather Station Only', 'Agronomist', 'Landlord', 'Retired', 'Prospect'];

// Column definitions for the table
interface ColumnDefinition {
  key: string;
  label: string;
  sortable: boolean;
  alwaysVisible?: boolean;
}

const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  { key: 'name', label: 'Name', sortable: true, alwaysVisible: true },
  { key: 'operation', label: 'Operation', sortable: true },
  { key: 'role', label: 'Role', sortable: false },
  { key: 'email', label: 'Email', sortable: true },
  { key: 'phone', label: 'Phone', sortable: true },
  { key: 'address', label: 'Address', sortable: true },
  { key: 'customerType', label: 'Type', sortable: true },
  { key: 'notes', label: 'Notes', sortable: false },
];

type ColumnKey = 'name' | 'operation' | 'role' | 'email' | 'phone' | 'address' | 'customerType' | 'notes';

const DEFAULT_VISIBLE_COLUMNS: ColumnKey[] = ['name', 'operation', 'role', 'phone', 'customerType'];
const LOCAL_STORAGE_KEY = 'contacts-visible-columns';
const COLUMN_WIDTHS_STORAGE_KEY = 'contacts-column-widths';

// Default column widths in pixels
const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  name: 180,
  operation: 150,
  role: 100,
  email: 180,
  phone: 130,
  address: 200,
  customerType: 140,
  notes: 150,
};

const MIN_COLUMN_WIDTH = 60;
const ACTIONS_COLUMN_WIDTH = 80;

const initialForm = {
  name: '',
  email: '',
  phone: '',
  address: '',
  address_lat: '' as string,
  address_lng: '' as string,
  customer_type: '',
  notes: '',
  operations: [] as string[],
  is_main_contact: 'No',
};

export default function ContactsClient({ initialContacts, operations, billingEntities }: ContactsClientProps) {
  const [contacts, setContacts] = useState(initialContacts);
  const [operationsList, setOperationsList] = useState(operations);
  const [billingEntitiesList, setBillingEntitiesList] = useState(billingEntities);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ProcessedContact | null>(null);
  const [form, setForm] = useState(initialForm);
  const [selectedBillingEntities, setSelectedBillingEntities] = useState<SelectedBillingEntity[]>([]);
  const [saving, setSaving] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Nested modal state for creating new operation
  const [showAddOperationModal, setShowAddOperationModal] = useState(false);
  const [newOperationForm, setNewOperationForm] = useState({ name: '', notes: '' });
  const [savingOperation, setSavingOperation] = useState(false);

  // Nested modal state for creating new billing entity
  const [showAddBillingEntityModal, setShowAddBillingEntityModal] = useState(false);
  const [newBillingEntityForm, setNewBillingEntityForm] = useState({ name: '', address: '', notes: '' });
  const [savingBillingEntity, setSavingBillingEntity] = useState(false);

  // Map and location picker state
  const [showMap, setShowMap] = useState(false);
  const [mapColorBy, setMapColorBy] = useState<'none' | 'type' | 'operation'>('none');
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);

  // Bulk geocoding state
  const [bulkGeocoding, setBulkGeocoding] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(DEFAULT_VISIBLE_COLUMNS);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const columnPickerRef = useRef<HTMLDivElement>(null);

  // Column width state for resizable columns
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(DEFAULT_COLUMN_WIDTHS);
  const [resizingColumn, setResizingColumn] = useState<ColumnKey | null>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);

  // Load column preferences from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ColumnKey[];
        // Validate that all saved columns are valid
        const valid = parsed.filter((col) => COLUMN_DEFINITIONS.some((def) => def.key === col));
        // Always include 'name' column
        if (!valid.includes('name')) valid.unshift('name');
        setVisibleColumns(valid);
      }
    } catch (e) {
      console.error('Failed to load column preferences:', e);
    }

    // Load column widths
    try {
      const savedWidths = localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
      if (savedWidths) {
        const parsed = JSON.parse(savedWidths) as Record<string, number>;
        setColumnWidths((prev) => ({ ...prev, ...parsed }));
      }
    } catch (e) {
      console.error('Failed to load column widths:', e);
    }
  }, []);

  // Save column preferences to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(visibleColumns));
    } catch (e) {
      console.error('Failed to save column preferences:', e);
    }
  }, [visibleColumns]);

  // Save column widths to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(columnWidths));
    } catch (e) {
      console.error('Failed to save column widths:', e);
    }
  }, [columnWidths]);

  // Close column picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnPickerRef.current && !columnPickerRef.current.contains(event.target as Node)) {
        setShowColumnPicker(false);
      }
    };
    if (showColumnPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColumnPicker]);

  const toggleColumn = (columnKey: ColumnKey) => {
    const column = COLUMN_DEFINITIONS.find((col) => col.key === columnKey);
    if (column?.alwaysVisible) return; // Can't toggle always-visible columns

    setVisibleColumns((prev) =>
      prev.includes(columnKey) ? prev.filter((c) => c !== columnKey) : [...prev, columnKey]
    );
  };

  const isColumnVisible = (columnKey: ColumnKey) => visibleColumns.includes(columnKey);

  // Column resize handlers
  const handleResizeStart = (columnKey: ColumnKey, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(columnKey);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = columnWidths[columnKey];
  };

  // Handle mouse move and mouse up for resize
  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - resizeStartX.current;
      const newWidth = Math.max(MIN_COLUMN_WIDTH, resizeStartWidth.current + diff);
      setColumnWidths((prev) => ({ ...prev, [resizingColumn]: newWidth }));
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn]);

  // Reset column width to default on double-click
  const handleResetColumnWidth = (columnKey: ColumnKey) => {
    setColumnWidths((prev) => ({ ...prev, [columnKey]: DEFAULT_COLUMN_WIDTHS[columnKey] }));
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Sort operations alphabetically
  const sortedOperations = useMemo(() => {
    return [...operationsList].sort((a, b) => a.name.localeCompare(b.name));
  }, [operationsList]);

  // Filter billing entities by selected operation, excluding already selected ones
  const availableBillingEntities = useMemo(() => {
    const selectedOpId = form.operations[0] ? parseInt(form.operations[0]) : null;
    const selectedIds = new Set(selectedBillingEntities.map((be) => be.id));
    let filtered = billingEntitiesList.filter((be) => !selectedIds.has(be.id));
    if (selectedOpId) {
      filtered = filtered.filter((be) => be.operationId === selectedOpId);
    }
    return filtered;
  }, [billingEntitiesList, form.operations, selectedBillingEntities]);

  const filteredContacts = useMemo(() => {
    let filtered = contacts;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.email.toLowerCase().includes(query) ||
          c.phone.toLowerCase().includes(query) ||
          c.operationNames.some((op) => op.toLowerCase().includes(query))
      );
    }

    if (filterType !== 'all') {
      filtered = filtered.filter((c) => c.customerType === filterType);
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      let aVal = '';
      let bVal = '';

      switch (sortColumn) {
        case 'name': aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break;
        case 'email': aVal = a.email.toLowerCase(); bVal = b.email.toLowerCase(); break;
        case 'phone': aVal = a.phone.toLowerCase(); bVal = b.phone.toLowerCase(); break;
        case 'address': aVal = a.address.toLowerCase(); bVal = b.address.toLowerCase(); break;
        case 'operation': aVal = a.operationNames.join(',').toLowerCase(); bVal = b.operationNames.join(',').toLowerCase(); break;
        case 'customerType': aVal = a.customerType.toLowerCase(); bVal = b.customerType.toLowerCase(); break;
        default: aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [contacts, searchQuery, filterType, sortColumn, sortDirection]);

  // Prepare contacts data for map
  const mappableContacts = useMemo(() => {
    return contacts
      .filter((c) => c.addressLat != null && c.addressLng != null)
      .map((c) => ({
        id: c.id,
        name: c.name,
        address: c.address,
        phone: c.phone,
        email: c.email,
        operationNames: c.operationNames,
        customerType: c.customerType,
        lat: c.addressLat!,
        lng: c.addressLng!,
      }));
  }, [contacts]);

  // Geocode address using Census Bureau API
  const handleGeocode = async () => {
    if (!form.address.trim()) {
      setGeocodeError('Please enter an address first');
      return;
    }
    setGeocoding(true);
    setGeocodeError(null);
    try {
      const response = await fetch(`/api/geocode?address=${encodeURIComponent(form.address)}`);
      const data = await response.json();
      if (response.ok) {
        setForm({
          ...form,
          address_lat: data.lat.toString(),
          address_lng: data.lng.toString(),
        });
        setGeocodeError(null);
      } else {
        setGeocodeError(data.error || 'Geocoding failed');
      }
    } catch (error) {
      console.error('Geocode error:', error);
      setGeocodeError('Failed to geocode address');
    } finally {
      setGeocoding(false);
    }
  };

  // Handle location picker selection
  const handleLocationSelect = (lat: number, lng: number) => {
    // Round to 6 decimal places
    const roundedLat = Math.round(lat * 1000000) / 1000000;
    const roundedLng = Math.round(lng * 1000000) / 1000000;
    setForm({
      ...form,
      address_lat: roundedLat.toString(),
      address_lng: roundedLng.toString(),
    });
    setShowLocationPicker(false);
    setGeocodeError(null);
  };

  // Clear lat/lng
  const handleClearLocation = () => {
    setForm({
      ...form,
      address_lat: '',
      address_lng: '',
    });
  };

  // Bulk geocode all contacts that have an address but no lat/lng
  const handleBulkGeocode = async () => {
    const contactsToGeocode = contacts.filter(
      (c) => c.address && c.address.trim().length > 5 && (c.addressLat == null || c.addressLng == null)
    );

    if (contactsToGeocode.length === 0) {
      alert('No contacts need geocoding. All contacts with addresses already have coordinates.');
      return;
    }

    if (!confirm(`Geocode ${contactsToGeocode.length} contacts? This may take a while.`)) {
      return;
    }

    setBulkGeocoding(true);
    setBulkProgress({ current: 0, total: contactsToGeocode.length, success: 0, failed: 0 });

    let success = 0;
    let failed = 0;
    const failedContacts: string[] = [];

    for (let i = 0; i < contactsToGeocode.length; i++) {
      const contact = contactsToGeocode[i];
      setBulkProgress({ current: i + 1, total: contactsToGeocode.length, success, failed });

      try {
        // Geocode the address
        const geoResponse = await fetch(`/api/geocode?address=${encodeURIComponent(contact.address)}`);
        const geoData = await geoResponse.json();

        if (geoResponse.ok && geoData.lat && geoData.lng) {
          // Round to 6 decimal places
          const lat = Math.round(geoData.lat * 1000000) / 1000000;
          const lng = Math.round(geoData.lng * 1000000) / 1000000;

          // Update the contact in Baserow
          const updateResponse = await fetch(`/api/contacts/${contact.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address_lat: lat, address_lng: lng }),
          });

          if (updateResponse.ok) {
            // Update local state
            setContacts((prev) =>
              prev.map((c) =>
                c.id === contact.id ? { ...c, addressLat: lat, addressLng: lng } : c
              )
            );
            success++;
            console.log(`✓ Geocoded: ${contact.name}`);
          } else {
            failed++;
            failedContacts.push(`${contact.name}: Failed to save to database`);
            console.error(`✗ Failed to save: ${contact.name}`, await updateResponse.text());
          }
        } else {
          failed++;
          const reason = geoData.error || 'No match found';
          failedContacts.push(`${contact.name}: ${reason}`);
          console.error(`✗ Geocode failed: ${contact.name} - ${reason}`);
        }
      } catch (error) {
        console.error(`✗ Error geocoding ${contact.name}:`, error);
        failed++;
        failedContacts.push(`${contact.name}: Network error`);
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    setBulkProgress({ current: contactsToGeocode.length, total: contactsToGeocode.length, success, failed });
    setBulkGeocoding(false);

    let message = `Geocoding complete!\n\nSuccess: ${success}\nFailed: ${failed}`;
    if (failedContacts.length > 0 && failedContacts.length <= 10) {
      message += `\n\nFailed contacts:\n${failedContacts.join('\n')}`;
    } else if (failedContacts.length > 10) {
      message += `\n\nFirst 10 failed:\n${failedContacts.slice(0, 10).join('\n')}\n...and ${failedContacts.length - 10} more (check browser console)`;
    }
    alert(message);
  };

  // Handler to create a new operation inline
  const handleAddOperation = async () => {
    if (!newOperationForm.name.trim()) {
      alert('Operation name is required');
      return;
    }
    setSavingOperation(true);
    try {
      const response = await fetch('/api/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOperationForm),
      });
      if (response.ok) {
        const newOp = await response.json();
        const newOperationOption: OperationOption = { id: newOp.id, name: newOp.name };
        setOperationsList([...operationsList, newOperationOption]);
        // Auto-select the new operation and clear billing entities (new operation has none)
        setForm({ ...form, operations: [newOp.id.toString()] });
        setSelectedBillingEntities([]);
        setShowAddOperationModal(false);
        setNewOperationForm({ name: '', notes: '' });
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create operation');
      }
    } catch (error) {
      console.error('Create operation error:', error);
      alert('Failed to create operation');
    } finally {
      setSavingOperation(false);
    }
  };

  // Handler to create a new billing entity inline
  const handleAddBillingEntity = async () => {
    if (!newBillingEntityForm.name.trim()) {
      alert('Billing entity name is required');
      return;
    }
    const selectedOpId = form.operations[0] ? parseInt(form.operations[0]) : null;
    if (!selectedOpId) {
      alert('Please select an operation first');
      return;
    }
    setSavingBillingEntity(true);
    try {
      const payload: Record<string, unknown> = {
        name: newBillingEntityForm.name,
        operation: [selectedOpId],
      };
      if (newBillingEntityForm.address) payload.address = newBillingEntityForm.address;
      if (newBillingEntityForm.notes) payload.notes = newBillingEntityForm.notes;

      const response = await fetch('/api/billing-entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const newBe = await response.json();
        const newBillingEntityOption: BillingEntityOption = {
          id: newBe.id,
          name: newBe.name || '',
          operationId: selectedOpId,
        };
        setBillingEntitiesList([...billingEntitiesList, newBillingEntityOption]);
        // Add to selected billing entities
        setSelectedBillingEntities([...selectedBillingEntities, { id: newBe.id, name: newBe.name || '' }]);
        setShowAddBillingEntityModal(false);
        setNewBillingEntityForm({ name: '', address: '', notes: '' });
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create billing entity');
      }
    } catch (error) {
      console.error('Create billing entity error:', error);
      alert('Failed to create billing entity');
    } finally {
      setSavingBillingEntity(false);
    }
  };

  // Add existing billing entity to selection
  const handleSelectBillingEntity = (beId: string) => {
    if (beId === 'add_new') {
      setShowAddBillingEntityModal(true);
      return;
    }
    const be = billingEntitiesList.find((b) => b.id === parseInt(beId));
    if (be && !selectedBillingEntities.some((s) => s.id === be.id)) {
      setSelectedBillingEntities([...selectedBillingEntities, { id: be.id, name: be.name }]);
    }
  };

  // Remove billing entity from selection
  const handleRemoveBillingEntity = (beId: number) => {
    setSelectedBillingEntities(selectedBillingEntities.filter((be) => be.id !== beId));
  };

  const handleAddContact = async () => {
    if (!form.name.trim()) {
      alert('Name is required');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { name: form.name };
      if (form.email) payload.email = form.email;
      if (form.phone) payload.phone = form.phone;
      if (form.address) payload.address = form.address;
      if (form.address_lat) payload.address_lat = parseFloat(form.address_lat);
      if (form.address_lng) payload.address_lng = parseFloat(form.address_lng);
      if (form.customer_type) payload.customer_type = form.customer_type;
      if (form.notes) payload.notes = form.notes;
      if (form.operations.length > 0) payload.operations = form.operations.map((id) => parseInt(id));
      payload.is_main_contact = form.is_main_contact;

      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const newContact = await response.json();

        // Link each selected billing entity to this contact as invoice_contact
        if (selectedBillingEntities.length > 0) {
          await Promise.all(
            selectedBillingEntities.map((be) =>
              fetch(`/api/billing-entities/${be.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invoice_contact: [newContact.id] }),
              })
            )
          );
        }

        // Reload to get the updated data with operation names
        window.location.reload();
      } else {
        alert('Failed to create contact');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to create contact');
    } finally {
      setSaving(false);
    }
  };

  const handleEditContact = async () => {
    if (!selectedContact) return;
    if (!form.name.trim()) {
      alert('Name is required');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { name: form.name };
      payload.email = form.email || null;
      payload.phone = form.phone || null;
      payload.address = form.address || null;
      payload.address_lat = form.address_lat ? parseFloat(form.address_lat) : null;
      payload.address_lng = form.address_lng ? parseFloat(form.address_lng) : null;
      payload.customer_type = form.customer_type || null;
      payload.notes = form.notes || null;
      payload.operations = form.operations.map((id) => parseInt(id));
      payload.is_main_contact = form.is_main_contact;

      const response = await fetch(`/api/contacts/${selectedContact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        // Link each selected billing entity to this contact as invoice_contact
        if (selectedBillingEntities.length > 0) {
          await Promise.all(
            selectedBillingEntities.map((be) =>
              fetch(`/api/billing-entities/${be.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invoice_contact: [selectedContact.id] }),
              })
            )
          );
        }

        // Reload to get the updated data with operation names
        window.location.reload();
      } else {
        alert('Failed to update contact');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to update contact');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contact: ProcessedContact) => {
    if (!confirm(`Delete contact "${contact.name}"? This cannot be undone.`)) return;
    try {
      const response = await fetch(`/api/contacts/${contact.id}`, { method: 'DELETE' });
      if (response.ok) {
        setContacts(contacts.filter((c) => c.id !== contact.id));
      } else {
        alert('Failed to delete contact');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to delete contact');
    }
  };

  const openAddModal = () => {
    setForm(initialForm);
    setSelectedBillingEntities([]);
    setGeocodeError(null);
    setShowAddModal(true);
  };

  const openEditModal = (contact: ProcessedContact) => {
    setSelectedContact(contact);
    setForm({
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      address: contact.address,
      address_lat: contact.addressLat?.toString() || '',
      address_lng: contact.addressLng?.toString() || '',
      customer_type: contact.customerType,
      notes: contact.notes,
      operations: contact.operationIds.map((id) => id.toString()),
      is_main_contact: contact.isMainContact ? 'Yes' : 'No',
    });
    setGeocodeError(null);
    // Pre-populate billing entities where this contact is the invoice contact
    const contactBillingEntities = billingEntitiesList
      .filter((be) => {
        // We'd need to know which billing entities have this contact as invoice_contact
        // For now, start with empty - user can add if needed
        return false;
      });
    setSelectedBillingEntities(contactBillingEntities.map((be) => ({ id: be.id, name: be.name })));
    setShowEditModal(true);
  };

  const getTypeBadge = (type: string) => {
    const colorMap: Record<string, string> = {
      'Current Customer': 'installed',
      'Past Customer': 'needs-probe',
      'Weather Station Only': 'pending',
      'Agronomist': 'in-stock',
      'Landlord': 'assigned',
      'Retired': 'needs-probe',
      'Prospect': 'pending',
    };
    const badgeClass = colorMap[type] || 'needs-probe';
    return type ? (
      <span className={`status-badge ${badgeClass}`}>
        <span className="status-dot"></span>
        {type}
      </span>
    ) : (
      <span style={{ color: 'var(--text-muted)' }}>—</span>
    );
  };

  // Reusable form fields for operation and billing entity
  const renderOperationField = () => (
    <div className="form-group">
      <label>Operation</label>
      <select
        value={form.operations[0] || ''}
        onChange={(e) => {
          if (e.target.value === 'add_new') {
            setShowAddOperationModal(true);
          } else {
            setForm({ ...form, operations: e.target.value ? [e.target.value] : [] });
            // Clear billing entities when operation changes
            setSelectedBillingEntities([]);
          }
        }}
      >
        <option value="">Select operation...</option>
        {sortedOperations.map((op) => (
          <option key={op.id} value={op.id}>{op.name}</option>
        ))}
        <option value="add_new">+ Add New Operation...</option>
      </select>
    </div>
  );

  const renderBillingEntitiesField = () => (
    <div className="form-group">
      <label>Billing Entities (Invoice Contact)</label>

      {/* Show selected billing entities as chips */}
      {selectedBillingEntities.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
          {selectedBillingEntities.map((be) => (
            <span
              key={be.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                background: 'var(--accent-blue-dim, rgba(59, 130, 246, 0.2))',
                color: 'var(--accent-blue, #3b82f6)',
                borderRadius: '4px',
                fontSize: '13px',
              }}
            >
              {be.name}
              <button
                type="button"
                onClick={() => handleRemoveBillingEntity(be.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '0',
                  cursor: 'pointer',
                  color: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Remove"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown to add more */}
      <select
        value=""
        onChange={(e) => handleSelectBillingEntity(e.target.value)}
        disabled={!form.operations[0]}
      >
        <option value="">
          {selectedBillingEntities.length === 0 ? 'Select billing entity...' : '+ Add another billing entity...'}
        </option>
        {availableBillingEntities.map((be) => (
          <option key={be.id} value={be.id}>{be.name}</option>
        ))}
        <option value="add_new">+ Create New Billing Entity...</option>
      </select>

      {form.operations[0] && availableBillingEntities.length === 0 && selectedBillingEntities.length === 0 && (
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
          No billing entities for this operation yet
        </p>
      )}
    </div>
  );

  return (
    <>
      <div className="table-container">
        <div className="table-header">
          <h3 className="table-title">All Contacts ({filteredContacts.length})</h3>
          <div className="table-actions">
            <div className="search-box" style={{ width: '200px' }}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="all">All Types</option>
              {CUSTOMER_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            {showMap && (
              <select value={mapColorBy} onChange={(e) => setMapColorBy(e.target.value as 'none' | 'type' | 'operation')}>
                <option value="none">Default Markers</option>
                <option value="type">Color by Type</option>
                <option value="operation">Color by Operation</option>
              </select>
            )}
            {/* Column Picker Dropdown */}
            {!showMap && (
              <div ref={columnPickerRef} style={{ position: 'relative' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowColumnPicker(!showColumnPicker)}
                  title="Select columns to display"
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                  </svg>
                  Columns
                </button>
                {showColumnPicker && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: '4px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                      zIndex: 100,
                      minWidth: '180px',
                      padding: '8px 0',
                    }}
                  >
                    <div style={{ padding: '4px 12px 8px', borderBottom: '1px solid var(--border)', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Show Columns</span>
                    </div>
                    {COLUMN_DEFINITIONS.map((col) => (
                      <label
                        key={col.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 12px',
                          cursor: col.alwaysVisible ? 'not-allowed' : 'pointer',
                          opacity: col.alwaysVisible ? 0.6 : 1,
                          fontSize: '13px',
                        }}
                        onClick={(e) => {
                          if (!col.alwaysVisible) {
                            e.preventDefault();
                            toggleColumn(col.key as ColumnKey);
                          }
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isColumnVisible(col.key as ColumnKey)}
                          disabled={col.alwaysVisible}
                          onChange={() => {}}
                          style={{ cursor: col.alwaysVisible ? 'not-allowed' : 'pointer' }}
                        />
                        {col.label}
                        {col.alwaysVisible && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>(required)</span>}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Temporary bulk geocode button */}
            {(() => {
              const needsGeocode = contacts.filter(
                (c) => c.address && c.address.trim().length > 5 && (c.addressLat == null || c.addressLng == null)
              ).length;
              return needsGeocode > 0 ? (
                <button
                  className="btn btn-secondary"
                  onClick={handleBulkGeocode}
                  disabled={bulkGeocoding}
                  title={`Geocode ${needsGeocode} contacts with addresses but no coordinates`}
                  style={{ fontSize: '12px' }}
                >
                  {bulkGeocoding ? (
                    `Geocoding ${bulkProgress.current}/${bulkProgress.total}...`
                  ) : (
                    `Geocode All (${needsGeocode})`
                  )}
                </button>
              ) : null;
            })()}
            <button
              className={`btn ${showMap ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowMap(!showMap)}
              title={showMap ? 'Show table' : 'Show map'}
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                {showMap ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                )}
              </svg>
              {showMap ? 'Table' : 'Map'}
              {!showMap && mappableContacts.length > 0 && (
                <span style={{ marginLeft: '4px', fontSize: '11px', opacity: 0.8 }}>({mappableContacts.length})</span>
              )}
            </button>
            <button className="btn btn-primary" onClick={openAddModal}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Contact
            </button>
          </div>
        </div>

        {/* Map View */}
        <ContactsMap
          contacts={mappableContacts}
          visible={showMap}
          colorBy={mapColorBy}
          onContactClick={(contactId) => {
            const contact = contacts.find((c) => c.id === contactId);
            if (contact) openEditModal(contact);
          }}
        />

        {/* Desktop Table */}
        <table
          className="desktop-table"
          style={{
            display: showMap ? 'none' : undefined,
            tableLayout: 'fixed',
            width: '100%',
            userSelect: resizingColumn ? 'none' : undefined,
          }}
        >
          <colgroup>
            {isColumnVisible('name') && <col style={{ width: columnWidths.name }} />}
            {isColumnVisible('operation') && <col style={{ width: columnWidths.operation }} />}
            {isColumnVisible('role') && <col style={{ width: columnWidths.role }} />}
            {isColumnVisible('email') && <col style={{ width: columnWidths.email }} />}
            {isColumnVisible('phone') && <col style={{ width: columnWidths.phone }} />}
            {isColumnVisible('address') && <col style={{ width: columnWidths.address }} />}
            {isColumnVisible('customerType') && <col style={{ width: columnWidths.customerType }} />}
            {isColumnVisible('notes') && <col style={{ width: columnWidths.notes }} />}
            <col style={{ width: ACTIONS_COLUMN_WIDTH }} />
          </colgroup>
          <thead>
            <tr>
              {isColumnVisible('name') && (
                <th className="sortable" onClick={() => handleSort('name')} style={{ position: 'relative' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', paddingRight: '8px' }}>
                    Name
                    {sortColumn === 'name' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </span>
                  <div
                    onMouseDown={(e) => handleResizeStart('name', e)}
                    onDoubleClick={() => handleResetColumnWidth('name')}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '6px',
                      cursor: 'col-resize',
                      background: resizingColumn === 'name' ? 'var(--accent-blue)' : 'transparent',
                    }}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
              )}
              {isColumnVisible('operation') && (
                <th className="sortable" onClick={() => handleSort('operation')} style={{ position: 'relative' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', paddingRight: '8px' }}>
                    Operation
                    {sortColumn === 'operation' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </span>
                  <div
                    onMouseDown={(e) => handleResizeStart('operation', e)}
                    onDoubleClick={() => handleResetColumnWidth('operation')}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '6px',
                      cursor: 'col-resize',
                      background: resizingColumn === 'operation' ? 'var(--accent-blue)' : 'transparent',
                    }}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
              )}
              {isColumnVisible('role') && (
                <th style={{ position: 'relative' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', paddingRight: '8px' }}>Role</span>
                  <div
                    onMouseDown={(e) => handleResizeStart('role', e)}
                    onDoubleClick={() => handleResetColumnWidth('role')}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '6px',
                      cursor: 'col-resize',
                      background: resizingColumn === 'role' ? 'var(--accent-blue)' : 'transparent',
                    }}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
              )}
              {isColumnVisible('email') && (
                <th className="sortable" onClick={() => handleSort('email')} style={{ position: 'relative' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', paddingRight: '8px' }}>
                    Email
                    {sortColumn === 'email' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </span>
                  <div
                    onMouseDown={(e) => handleResizeStart('email', e)}
                    onDoubleClick={() => handleResetColumnWidth('email')}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '6px',
                      cursor: 'col-resize',
                      background: resizingColumn === 'email' ? 'var(--accent-blue)' : 'transparent',
                    }}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
              )}
              {isColumnVisible('phone') && (
                <th className="sortable" onClick={() => handleSort('phone')} style={{ position: 'relative' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', paddingRight: '8px' }}>
                    Phone
                    {sortColumn === 'phone' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </span>
                  <div
                    onMouseDown={(e) => handleResizeStart('phone', e)}
                    onDoubleClick={() => handleResetColumnWidth('phone')}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '6px',
                      cursor: 'col-resize',
                      background: resizingColumn === 'phone' ? 'var(--accent-blue)' : 'transparent',
                    }}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
              )}
              {isColumnVisible('address') && (
                <th className="sortable" onClick={() => handleSort('address')} style={{ position: 'relative' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', paddingRight: '8px' }}>
                    Address
                    {sortColumn === 'address' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </span>
                  <div
                    onMouseDown={(e) => handleResizeStart('address', e)}
                    onDoubleClick={() => handleResetColumnWidth('address')}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '6px',
                      cursor: 'col-resize',
                      background: resizingColumn === 'address' ? 'var(--accent-blue)' : 'transparent',
                    }}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
              )}
              {isColumnVisible('customerType') && (
                <th className="sortable" onClick={() => handleSort('customerType')} style={{ position: 'relative' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', paddingRight: '8px' }}>
                    Type
                    {sortColumn === 'customerType' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </span>
                  <div
                    onMouseDown={(e) => handleResizeStart('customerType', e)}
                    onDoubleClick={() => handleResetColumnWidth('customerType')}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '6px',
                      cursor: 'col-resize',
                      background: resizingColumn === 'customerType' ? 'var(--accent-blue)' : 'transparent',
                    }}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
              )}
              {isColumnVisible('notes') && (
                <th style={{ position: 'relative' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', paddingRight: '8px' }}>Notes</span>
                  <div
                    onMouseDown={(e) => handleResizeStart('notes', e)}
                    onDoubleClick={() => handleResetColumnWidth('notes')}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '6px',
                      cursor: 'col-resize',
                      background: resizingColumn === 'notes' ? 'var(--accent-blue)' : 'transparent',
                    }}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
              )}
              <th style={{ width: ACTIONS_COLUMN_WIDTH }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredContacts.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 1} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  No contacts found.
                </td>
              </tr>
            ) : (
              filteredContacts.map((contact) => (
                <tr key={contact.id}>
                  {isColumnVisible('name') && (
                    <td className="operation-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={contact.name}>
                      {contact.name}
                    </td>
                  )}
                  {isColumnVisible('operation') && (
                    <td style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={contact.operationNames.join(', ')}>
                      {contact.operationNames.length > 0 ? contact.operationNames.join(', ') : '—'}
                    </td>
                  )}
                  {isColumnVisible('role') && (
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {contact.isMainContact && (
                          <span style={{ fontSize: '10px', background: 'var(--accent-green-dim)', color: 'var(--accent-green)', padding: '2px 6px', borderRadius: '4px' }}>Main</span>
                        )}
                        {contact.isInvoiceContact && (
                          <span style={{ fontSize: '10px', background: 'var(--accent-blue-dim, rgba(59, 130, 246, 0.2))', color: 'var(--accent-blue, #3b82f6)', padding: '2px 6px', borderRadius: '4px' }}>Invoice</span>
                        )}
                        {!contact.isMainContact && !contact.isInvoiceContact && (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </div>
                    </td>
                  )}
                  {isColumnVisible('email') && (
                    <td style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={contact.email || ''}>
                      {contact.email || '—'}
                    </td>
                  )}
                  {isColumnVisible('phone') && (
                    <td style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={contact.phone || ''}>
                      {contact.phone || '—'}
                    </td>
                  )}
                  {isColumnVisible('address') && (
                    <td style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={contact.address || ''}>
                      {contact.address || '—'}
                    </td>
                  )}
                  {isColumnVisible('customerType') && <td>{getTypeBadge(contact.customerType)}</td>}
                  {isColumnVisible('notes') && (
                    <td style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={contact.notes || ''}>
                      {contact.notes || '—'}
                    </td>
                  )}
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="action-btn" title="Edit" onClick={() => openEditModal(contact)}>
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button className="action-btn" title="Delete" onClick={() => handleDelete(contact)}>
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Mobile Cards */}
        <div className="mobile-cards" style={{ display: showMap ? 'none' : undefined }}>
          {filteredContacts.length === 0 ? (
            <div className="empty-state">No contacts found.</div>
          ) : (
            filteredContacts.map((contact) => (
              <div key={contact.id} className="mobile-card">
                <div className="mobile-card-header">
                  <span className="mobile-card-title">{contact.name}</span>
                  {isColumnVisible('role') && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {contact.isMainContact && (
                        <span style={{ fontSize: '10px', background: 'var(--accent-green-dim)', color: 'var(--accent-green)', padding: '2px 6px', borderRadius: '4px' }}>Main</span>
                      )}
                      {contact.isInvoiceContact && (
                        <span style={{ fontSize: '10px', background: 'var(--accent-blue-dim, rgba(59, 130, 246, 0.2))', color: 'var(--accent-blue, #3b82f6)', padding: '2px 6px', borderRadius: '4px' }}>Invoice</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="mobile-card-body">
                  {isColumnVisible('operation') && contact.operationNames.length > 0 && (
                    <div className="mobile-card-row"><span>Operation:</span> {contact.operationNames.join(', ')}</div>
                  )}
                  {isColumnVisible('phone') && contact.phone && <div className="mobile-card-row"><span>Phone:</span> {contact.phone}</div>}
                  {isColumnVisible('email') && contact.email && <div className="mobile-card-row"><span>Email:</span> {contact.email}</div>}
                  {isColumnVisible('address') && contact.address && <div className="mobile-card-row"><span>Address:</span> {contact.address}</div>}
                  {isColumnVisible('customerType') && contact.customerType && (
                    <div className="mobile-card-row"><span>Type:</span> {getTypeBadge(contact.customerType)}</div>
                  )}
                  {isColumnVisible('notes') && contact.notes && (
                    <div className="mobile-card-row"><span>Notes:</span> {contact.notes}</div>
                  )}
                </div>
                <div className="mobile-card-actions">
                  <button className="btn btn-secondary" onClick={() => openEditModal(contact)}>Edit</button>
                  <button className="btn btn-secondary" onClick={() => handleDelete(contact)}>Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Contact Modal */}
      {showAddModal && (
        <div className="detail-panel-overlay" onClick={() => setShowAddModal(false)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Add Contact</h3>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Name *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Contact name" />
                </div>
                {renderOperationField()}
                {renderBillingEntitiesField()}
                <div className="form-group">
                  <label>Main Contact?</label>
                  <select value={form.is_main_contact} onChange={(e) => setForm({ ...form, is_main_contact: e.target.value })}>
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 555-5555" />
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Enter address..." rows={2} />
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleGeocode}
                      disabled={geocoding || !form.address.trim()}
                      style={{ fontSize: '12px', padding: '4px 8px' }}
                    >
                      {geocoding ? 'Geocoding...' : 'Convert to Lat/Lng'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowLocationPicker(true)}
                      style={{ fontSize: '12px', padding: '4px 8px' }}
                    >
                      Pick on Map
                    </button>
                    {form.address_lat && form.address_lng && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleClearLocation}
                        style={{ fontSize: '12px', padding: '4px 8px' }}
                      >
                        Clear Location
                      </button>
                    )}
                  </div>
                  {geocodeError && (
                    <p style={{ fontSize: '12px', color: 'var(--accent-red, #ef4444)', marginTop: '4px' }}>
                      {geocodeError}
                    </p>
                  )}
                  {form.address_lat && form.address_lng && (
                    <p style={{ fontSize: '12px', color: 'var(--accent-green)', marginTop: '4px' }}>
                      Location: {form.address_lat}, {form.address_lng}
                    </p>
                  )}
                </div>
                <div className="form-group">
                  <label>Customer Type</label>
                  <select value={form.customer_type} onChange={(e) => setForm({ ...form, customer_type: e.target.value })}>
                    <option value="">Select type...</option>
                    {CUSTOMER_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Enter notes..." rows={3} />
                </div>
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddContact} disabled={saving}>
                {saving ? 'Creating...' : 'Create Contact'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Contact Modal */}
      {showEditModal && selectedContact && (
        <div className="detail-panel-overlay" onClick={() => setShowEditModal(false)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Edit Contact</h3>
              <button className="close-btn" onClick={() => setShowEditModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Name *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                {renderOperationField()}
                {renderBillingEntitiesField()}
                <div className="form-group">
                  <label>Main Contact?</label>
                  <select value={form.is_main_contact} onChange={(e) => setForm({ ...form, is_main_contact: e.target.value })}>
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} />
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleGeocode}
                      disabled={geocoding || !form.address.trim()}
                      style={{ fontSize: '12px', padding: '4px 8px' }}
                    >
                      {geocoding ? 'Geocoding...' : 'Convert to Lat/Lng'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowLocationPicker(true)}
                      style={{ fontSize: '12px', padding: '4px 8px' }}
                    >
                      Pick on Map
                    </button>
                    {form.address_lat && form.address_lng && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleClearLocation}
                        style={{ fontSize: '12px', padding: '4px 8px' }}
                      >
                        Clear Location
                      </button>
                    )}
                  </div>
                  {geocodeError && (
                    <p style={{ fontSize: '12px', color: 'var(--accent-red, #ef4444)', marginTop: '4px' }}>
                      {geocodeError}
                    </p>
                  )}
                  {form.address_lat && form.address_lng && (
                    <p style={{ fontSize: '12px', color: 'var(--accent-green)', marginTop: '4px' }}>
                      Location: {form.address_lat}, {form.address_lng}
                    </p>
                  )}
                </div>
                <div className="form-group">
                  <label>Customer Type</label>
                  <select value={form.customer_type} onChange={(e) => setForm({ ...form, customer_type: e.target.value })}>
                    <option value="">Select type...</option>
                    {CUSTOMER_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
                </div>
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleEditContact} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Operation Modal (nested) */}
      {showAddOperationModal && (
        <div className="detail-panel-overlay" style={{ zIndex: 1001 }} onClick={() => setShowAddOperationModal(false)}>
          <div className="detail-panel" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Add New Operation</h3>
              <button className="close-btn" onClick={() => setShowAddOperationModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Operation Name *</label>
                  <input
                    type="text"
                    value={newOperationForm.name}
                    onChange={(e) => setNewOperationForm({ ...newOperationForm, name: e.target.value })}
                    placeholder="e.g., Smith Farm"
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={newOperationForm.notes}
                    onChange={(e) => setNewOperationForm({ ...newOperationForm, notes: e.target.value })}
                    placeholder="Optional notes..."
                    rows={2}
                  />
                </div>
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddOperationModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddOperation} disabled={savingOperation}>
                {savingOperation ? 'Creating...' : 'Create Operation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Billing Entity Modal (nested) */}
      {showAddBillingEntityModal && (
        <div className="detail-panel-overlay" style={{ zIndex: 1001 }} onClick={() => setShowAddBillingEntityModal(false)}>
          <div className="detail-panel" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Add New Billing Entity</h3>
              <button className="close-btn" onClick={() => setShowAddBillingEntityModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  This billing entity will be linked to: <strong>{operationsList.find((op) => op.id.toString() === form.operations[0])?.name}</strong>
                </p>
                <div className="form-group">
                  <label>Billing Entity Name *</label>
                  <input
                    type="text"
                    value={newBillingEntityForm.name}
                    onChange={(e) => setNewBillingEntityForm({ ...newBillingEntityForm, name: e.target.value })}
                    placeholder="e.g., Smith Farm LLC"
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label>Mailing Address</label>
                  <textarea
                    value={newBillingEntityForm.address}
                    onChange={(e) => setNewBillingEntityForm({ ...newBillingEntityForm, address: e.target.value })}
                    placeholder="Enter mailing address..."
                    rows={2}
                  />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={newBillingEntityForm.notes}
                    onChange={(e) => setNewBillingEntityForm({ ...newBillingEntityForm, notes: e.target.value })}
                    placeholder="Optional notes..."
                    rows={2}
                  />
                </div>
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddBillingEntityModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddBillingEntity} disabled={savingBillingEntity}>
                {savingBillingEntity ? 'Creating...' : 'Create Billing Entity'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Location Picker Modal */}
      {showLocationPicker && (
        <LocationPicker
          lat={form.address_lat ? parseFloat(form.address_lat) : null}
          lng={form.address_lng ? parseFloat(form.address_lng) : null}
          onLocationChange={handleLocationSelect}
          onClose={() => setShowLocationPicker(false)}
        />
      )}
    </>
  );
}
