'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useResizableColumns } from '@/hooks/useResizableColumns';
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
  { key: 'billingEntity', label: 'Billing Entity', sortable: true },
  { key: 'role', label: 'Role', sortable: false },
  { key: 'email', label: 'Email', sortable: true },
  { key: 'phone', label: 'Phone', sortable: true },
  { key: 'address', label: 'Address', sortable: true },
  { key: 'customerType', label: 'Type', sortable: true },
  { key: 'notes', label: 'Notes', sortable: false },
];

type ColumnKey = 'name' | 'operation' | 'billingEntity' | 'role' | 'email' | 'phone' | 'address' | 'customerType' | 'notes';

const DEFAULT_VISIBLE_COLUMNS: ColumnKey[] = ['name', 'operation', 'role', 'phone', 'customerType'];
const LOCAL_STORAGE_KEY = 'contacts-visible-columns';
const COLUMN_WIDTHS_STORAGE_KEY = 'contacts-column-widths';

// Default column widths in pixels
const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  name: 180,
  operation: 150,
  billingEntity: 150,
  role: 100,
  email: 180,
  phone: 130,
  address: 200,
  customerType: 200,
  notes: 150,
};

const ACTIONS_COLUMN_WIDTH = 80;

const initialForm = {
  name: '',
  email: '',
  phone: '',
  address: '',
  address_lat: '' as string,
  address_lng: '' as string,
  customer_type: [] as string[],
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
  const [newBillingEntityForm, setNewBillingEntityForm] = useState({ name: '', address: '', notes: '', sameAddressAsContact: true });
  const [savingBillingEntity, setSavingBillingEntity] = useState(false);

  // Billing entity creation options
  type BillingEntityChoiceType = 'none' | 'use_contact_name' | 'different_name' | 'existing';
  const [billingEntityChoice, setBillingEntityChoice] = useState<BillingEntityChoiceType>('none');

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

  // Resizable columns
  const { columnWidths, resizingColumn, handleResizeStart, handleResetColumnWidth } = useResizableColumns<ColumnKey>({
    defaultWidths: DEFAULT_COLUMN_WIDTHS,
    storageKey: COLUMN_WIDTHS_STORAGE_KEY,
  });

  // Inline editing state
  const [editingCell, setEditingCell] = useState<{ contactId: number; field: string } | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [editingTypes, setEditingTypes] = useState<string[]>([]);
  const typePickerRef = useRef<HTMLDivElement>(null);
  const [copiedEmails, setCopiedEmails] = useState(false);

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

  }, []);

  // Save column preferences to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(visibleColumns));
    } catch (e) {
      console.error('Failed to save column preferences:', e);
    }
  }, [visibleColumns]);

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

  // Filter billing entities to exclude already selected ones
  const availableBillingEntities = useMemo(() => {
    const selectedIds = new Set(selectedBillingEntities.map((be) => be.id));
    return billingEntitiesList.filter((be) => !selectedIds.has(be.id));
  }, [billingEntitiesList, selectedBillingEntities]);

  const filteredContacts = useMemo(() => {
    let filtered = contacts;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.email.toLowerCase().includes(query) ||
          c.phone.toLowerCase().includes(query) ||
          c.operationNames.some((op) => op.toLowerCase().includes(query)) ||
          c.customerType.some((t) => t.toLowerCase().includes(query))
      );
    }

    if (filterType !== 'all') {
      filtered = filtered.filter((c) => c.customerType.includes(filterType));
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
        case 'billingEntity': aVal = a.billingEntityNames.join(',').toLowerCase(); bVal = b.billingEntityNames.join(',').toLowerCase(); break;
        case 'customerType': aVal = a.customerType.join(', ').toLowerCase(); bVal = b.customerType.join(', ').toLowerCase(); break;
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
    setSavingBillingEntity(true);
    try {
      const response = await fetch('/api/billing-entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newBillingEntityForm.name }),
      });
      if (response.ok) {
        const newBe = await response.json();
        const newBillingEntityOption: BillingEntityOption = {
          id: newBe.id,
          name: newBe.name || '',
        };
        setBillingEntitiesList([...billingEntitiesList, newBillingEntityOption]);
        // Add to selected billing entities
        setSelectedBillingEntities([...selectedBillingEntities, { id: newBe.id, name: newBe.name || '' }]);
        setShowAddBillingEntityModal(false);
        setNewBillingEntityForm({ name: '', address: '', notes: '', sameAddressAsContact: true });
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


  // Remove billing entity from selection
  const handleRemoveBillingEntity = (beId: number) => {
    setSelectedBillingEntities(selectedBillingEntities.filter((be) => be.id !== beId));
  };

  const handleAddContact = async () => {
    if (!form.name.trim()) {
      alert('Name is required');
      return;
    }

    // Validate billing entity name if creating with different name
    if (billingEntityChoice === 'different_name' && !newBillingEntityForm.name.trim()) {
      alert('Please enter a billing entity name');
      return;
    }

    setSaving(true);
    try {
      // Build list of billing entity IDs to link
      let billingEntityIds = selectedBillingEntities.map((be) => be.id);

      // Create new billing entity if needed
      if (billingEntityChoice === 'use_contact_name' || billingEntityChoice === 'different_name') {
        const beName = billingEntityChoice === 'use_contact_name' ? form.name : newBillingEntityForm.name;

        const beResponse = await fetch('/api/billing-entities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: beName }),
        });

        if (beResponse.ok) {
          const newBe = await beResponse.json();
          billingEntityIds.push(newBe.id);
          // Also add to the list so it's available
          setBillingEntitiesList([...billingEntitiesList, { id: newBe.id, name: newBe.name || beName }]);
        } else {
          console.error('Failed to create billing entity');
        }
      }

      const payload: Record<string, unknown> = { name: form.name };
      if (form.email) payload.email = form.email;
      if (form.phone) payload.phone = form.phone;
      if (form.address) payload.address = form.address;
      if (form.address_lat) payload.address_lat = parseFloat(form.address_lat);
      if (form.address_lng) payload.address_lng = parseFloat(form.address_lng);
      if (form.customer_type.length > 0) payload.customer_type = form.customer_type;
      if (form.notes) payload.notes = form.notes;
      if (form.operations.length > 0) payload.operations = form.operations.map((id) => parseInt(id));
      payload.is_main_contact = form.is_main_contact;
      if (billingEntityIds.length > 0) payload.billing_entity = billingEntityIds;

      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
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

    // Validate billing entity name if creating with different name
    if (billingEntityChoice === 'different_name' && !newBillingEntityForm.name.trim()) {
      alert('Please enter a billing entity name');
      return;
    }

    setSaving(true);
    try {
      // Build list of billing entity IDs to link
      let billingEntityIds = selectedBillingEntities.map((be) => be.id);

      // Create new billing entity if needed
      if (billingEntityChoice === 'use_contact_name' || billingEntityChoice === 'different_name') {
        const beName = billingEntityChoice === 'use_contact_name' ? form.name : newBillingEntityForm.name;

        const beResponse = await fetch('/api/billing-entities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: beName }),
        });

        if (beResponse.ok) {
          const newBe = await beResponse.json();
          billingEntityIds.push(newBe.id);
          // Also add to the list so it's available
          setBillingEntitiesList([...billingEntitiesList, { id: newBe.id, name: newBe.name || beName }]);
        } else {
          console.error('Failed to create billing entity');
        }
      }

      const payload: Record<string, unknown> = { name: form.name };
      payload.email = form.email || null;
      payload.phone = form.phone || null;
      payload.address = form.address || null;
      payload.address_lat = form.address_lat ? parseFloat(form.address_lat) : null;
      payload.address_lng = form.address_lng ? parseFloat(form.address_lng) : null;
      payload.customer_type = form.customer_type.length > 0 ? form.customer_type : [];
      payload.notes = form.notes || null;
      payload.operations = form.operations.map((id) => parseInt(id));
      payload.is_main_contact = form.is_main_contact;
      payload.billing_entity = billingEntityIds;

      const response = await fetch(`/api/contacts/${selectedContact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
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

  // Inline editing handlers
  const startEditing = (contact: ProcessedContact, field: string) => {
    let value = '';
    switch (field) {
      case 'name': value = contact.name; break;
      case 'email': value = contact.email; break;
      case 'phone': value = contact.phone; break;
      case 'address': value = contact.address; break;
      case 'notes': value = contact.notes; break;
      case 'operation': value = contact.operationIds[0]?.toString() || ''; break;
    }
    setEditingCell({ contactId: contact.id, field });
    setEditingValue(value);
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setEditingValue('');
  };

  // Type tag editing handlers
  const startTypeEditing = (contact: ProcessedContact) => {
    setEditingCell({ contactId: contact.id, field: 'customerType' });
    setEditingTypes([...contact.customerType]);
  };

  const saveTypeEdit = async (contactId: number, types: string[]) => {
    setEditingCell(null);
    try {
      const response = await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_type: types }),
      });
      if (response.ok) {
        setContacts((prev) =>
          prev.map((c) => c.id === contactId ? { ...c, customerType: types } : c)
        );
      } else {
        alert('Failed to save changes');
      }
    } catch {
      alert('Failed to save changes');
    }
  };

  // Click-outside handler for type picker
  useEffect(() => {
    if (!editingCell || editingCell.field !== 'customerType') return;
    const handleClickOutside = (e: MouseEvent) => {
      if (typePickerRef.current && !typePickerRef.current.contains(e.target as Node)) {
        saveTypeEdit(editingCell.contactId, editingTypes);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editingCell, editingTypes]);

  const saveInlineEdit = async (contactId: number, field: string, value: string) => {
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) return;

    // Map field names to API field names
    const fieldMap: Record<string, string> = {
      name: 'name',
      email: 'email',
      phone: 'phone',
      address: 'address',
      notes: 'notes',
      operation: 'operations',
    };

    const apiField = fieldMap[field];
    if (!apiField) return;

    // Prepare the payload
    let payload: Record<string, unknown> = {};
    if (field === 'operation') {
      payload[apiField] = value ? [parseInt(value)] : [];
    } else {
      payload[apiField] = value || null;
    }

    try {
      const response = await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        // Update local state
        setContacts((prev) =>
          prev.map((c) => {
            if (c.id !== contactId) return c;
            const updated = { ...c };
            switch (field) {
              case 'name': updated.name = value; break;
              case 'email': updated.email = value; break;
              case 'phone': updated.phone = value; break;
              case 'address': updated.address = value; break;
              case 'notes': updated.notes = value; break;
              case 'operation':
                const opId = value ? parseInt(value) : null;
                updated.operationIds = opId ? [opId] : [];
                const op = operationsList.find((o) => o.id === opId);
                updated.operationNames = op ? [op.name] : [];
                break;
            }
            return updated;
          })
        );
      } else {
        alert('Failed to save changes');
      }
    } catch (error) {
      console.error('Error saving:', error);
      alert('Failed to save changes');
    }

    setEditingCell(null);
    setEditingValue('');
  };

  const handleInlineKeyDown = (e: React.KeyboardEvent, contactId: number, field: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveInlineEdit(contactId, field, editingValue);
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  };

  const openAddModal = () => {
    setForm(initialForm);
    setSelectedBillingEntities([]);
    setBillingEntityChoice('none');
    setNewBillingEntityForm({ name: '', address: '', notes: '', sameAddressAsContact: true });
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
    // Pre-populate billing entities from contact's linked billing entities
    const contactBillingEntities = contact.billingEntityIds.map((id, idx) => ({
      id,
      name: contact.billingEntityNames[idx] || '',
    }));
    setSelectedBillingEntities(contactBillingEntities);
    // Set billing entity choice based on existing billing entities
    setBillingEntityChoice(contactBillingEntities.length > 0 ? 'existing' : 'none');
    setNewBillingEntityForm({ name: '', address: '', notes: '', sameAddressAsContact: true });
    setShowEditModal(true);
  };

  const typeColorMap: Record<string, string> = {
    'Current Customer': 'installed',
    'Past Customer': 'needs-probe',
    'Weather Station Only': 'pending',
    'Agronomist': 'in-stock',
    'Landlord': 'assigned',
    'Retired': 'needs-probe',
    'Prospect': 'pending',
  };

  const getTypeBadge = (type: string) => {
    const badgeClass = typeColorMap[type] || 'needs-probe';
    return type ? (
      <span className={`status-badge ${badgeClass}`}>
        <span className="status-dot"></span>
        {type}
      </span>
    ) : (
      <span className="text-muted">—</span>
    );
  };

  const getTypeBadges = (types: string[]) => {
    if (types.length === 0) return <span className="text-muted">—</span>;
    return (
      <div className="contacts-type-badges">
        {types.map((type) => (
          <span key={type} className={`status-badge ${typeColorMap[type] || 'needs-probe'}`}>
            <span className="status-dot"></span>
            {type}
          </span>
        ))}
      </div>
    );
  };

  // Render an editable text cell
  const renderEditableCell = (contact: ProcessedContact, field: string, displayValue: string) => {
    const isEditing = editingCell?.contactId === contact.id && editingCell?.field === field;

    if (isEditing) {
      return (
        <input
          type="text"
          value={editingValue}
          onChange={(e) => setEditingValue(e.target.value)}
          onBlur={() => saveInlineEdit(contact.id, field, editingValue)}
          onKeyDown={(e) => handleInlineKeyDown(e, contact.id, field)}
          autoFocus
          className="contacts-inline-edit"
        />
      );
    }

    return (
      <div
        onClick={() => startEditing(contact, field)}
        className="contacts-editable-cell"
        title={displayValue || 'Click to edit'}
      >
        {displayValue || <span className="text-muted">—</span>}
      </div>
    );
  };

  // Render an editable multi-select cell for customer type
  const renderEditableTypeCell = (contact: ProcessedContact) => {
    const isEditing = editingCell?.contactId === contact.id && editingCell?.field === 'customerType';

    if (isEditing) {
      return (
        <div className="contacts-type-picker" ref={typePickerRef}>
          {CUSTOMER_TYPE_OPTIONS.map((type) => {
            const isSelected = editingTypes.includes(type);
            return (
              <label
                key={type}
                className={`contacts-type-option${isSelected ? ' selected' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  setEditingTypes((prev) =>
                    prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
                  );
                }}
              >
                <span className={`status-badge ${typeColorMap[type] || 'needs-probe'}`}>
                  <span className="status-dot"></span>
                  {type}
                </span>
              </label>
            );
          })}
        </div>
      );
    }

    return (
      <div
        onClick={() => startTypeEditing(contact)}
        className="contacts-clickable-cell"
        title="Click to edit types"
      >
        {getTypeBadges(contact.customerType)}
      </div>
    );
  };

  // Render an editable select cell for operation
  const renderEditableOperationCell = (contact: ProcessedContact) => {
    const isEditing = editingCell?.contactId === contact.id && editingCell?.field === 'operation';

    if (isEditing) {
      return (
        <select
          value={editingValue}
          onChange={(e) => {
            setEditingValue(e.target.value);
            saveInlineEdit(contact.id, 'operation', e.target.value);
          }}
          onBlur={() => cancelEditing()}
          autoFocus
          className="contacts-inline-edit"
        >
          <option value="">Select operation...</option>
          {sortedOperations.map((op) => (
            <option key={op.id} value={op.id}>{op.name}</option>
          ))}
        </select>
      );
    }

    const displayValue = contact.operationNames.length > 0 ? contact.operationNames.join(', ') : '';

    return (
      <div
        onClick={() => startEditing(contact, 'operation')}
        className="contacts-editable-cell"
        title={displayValue || 'Click to edit'}
      >
        {displayValue || <span className="text-muted">—</span>}
      </div>
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
            // Clear billing entities and reset choice when operation changes
            setSelectedBillingEntities([]);
            setBillingEntityChoice('none');
            setNewBillingEntityForm({ name: '', address: '', notes: '', sameAddressAsContact: true });
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

  const renderBillingEntitiesField = () => {
    const selectedOp = operationsList.find((op) => op.id.toString() === form.operations[0]);
    const hasExistingEntities = availableBillingEntities.length > 0 || selectedBillingEntities.length > 0;

    return (
      <div className="form-group">
        <label>Billing Entity</label>

        {/* Show question: How would you like to handle billing? */}
        {!form.operations[0] ? (
          <p className="contacts-modal-hint-italic">
            Select an operation first
          </p>
        ) : (
          <>
            <p className="contacts-billing-choice-prompt">
              For billing, would you like to:
            </p>

            {/* Radio options */}
            <div className="contacts-billing-choice-group">
              {/* Option 1: Use contact's name */}
              <label
                className={`contacts-billing-choice-option${billingEntityChoice === 'use_contact_name' ? ' selected' : ''}`}
                onClick={() => {
                  setBillingEntityChoice('use_contact_name');
                  setSelectedBillingEntities([]);
                }}
              >
                <input
                  type="radio"
                  name="billingEntityChoice"
                  checked={billingEntityChoice === 'use_contact_name'}
                  onChange={() => {
                    setBillingEntityChoice('use_contact_name');
                    setSelectedBillingEntities([]);
                  }}
                />
                <div>
                  <span className="contacts-billing-choice-title">Use contact&apos;s name</span>
                  <p className="contacts-billing-choice-desc">
                    Create a billing entity named &quot;{form.name || 'Contact Name'}&quot;
                  </p>
                </div>
              </label>

              {/* Option 2: Different name */}
              <label
                className={`contacts-billing-choice-option${billingEntityChoice === 'different_name' ? ' selected' : ''}`}
                onClick={() => {
                  setBillingEntityChoice('different_name');
                  setSelectedBillingEntities([]);
                }}
              >
                <input
                  type="radio"
                  name="billingEntityChoice"
                  checked={billingEntityChoice === 'different_name'}
                  onChange={() => {
                    setBillingEntityChoice('different_name');
                    setSelectedBillingEntities([]);
                  }}
                />
                <div>
                  <span className="contacts-billing-choice-title">Create with a different name</span>
                  <p className="contacts-billing-choice-desc">
                    Specify a custom name for the billing entity (e.g., LLC name)
                  </p>
                </div>
              </label>

              {/* Option 3: Connect to existing (only show if there are existing entities) */}
              {hasExistingEntities && (
                <label
                  className={`contacts-billing-choice-option${billingEntityChoice === 'existing' ? ' selected' : ''}`}
                  onClick={() => setBillingEntityChoice('existing')}
                >
                  <input
                    type="radio"
                    name="billingEntityChoice"
                    checked={billingEntityChoice === 'existing'}
                    onChange={() => setBillingEntityChoice('existing')}
                  />
                  <div>
                    <span className="contacts-billing-choice-title">Connect to an existing billing entity</span>
                    <p className="contacts-billing-choice-desc">
                      Link this contact to a billing entity that already exists
                    </p>
                  </div>
                </label>
              )}

              {/* Option: No billing entity */}
              <label
                className={`contacts-billing-choice-option${billingEntityChoice === 'none' ? ' selected' : ''}`}
                onClick={() => {
                  setBillingEntityChoice('none');
                  setSelectedBillingEntities([]);
                }}
              >
                <input
                  type="radio"
                  name="billingEntityChoice"
                  checked={billingEntityChoice === 'none'}
                  onChange={() => {
                    setBillingEntityChoice('none');
                    setSelectedBillingEntities([]);
                  }}
                />
                <div>
                  <span className="contacts-billing-choice-title">Skip for now</span>
                  <p className="contacts-billing-choice-desc">
                    Don&apos;t create or link a billing entity
                  </p>
                </div>
              </label>
            </div>

            {/* Show address option when creating new billing entity */}
            {(billingEntityChoice === 'use_contact_name' || billingEntityChoice === 'different_name') && (
              <div className="contacts-billing-detail-panel">
                {billingEntityChoice === 'different_name' && (
                  <div className="contacts-billing-name-field">
                    <label className="contacts-billing-field-label">
                      Billing Entity Name
                    </label>
                    <input
                      type="text"
                      value={newBillingEntityForm.name}
                      onChange={(e) => setNewBillingEntityForm({ ...newBillingEntityForm, name: e.target.value })}
                      placeholder="e.g., Smith Farm LLC"
                      className="contacts-full-width"
                    />
                  </div>
                )}

                <label className="contacts-billing-address-heading">
                  Billing Address
                </label>
                <div className="contacts-billing-address-options">
                  <label className="contacts-billing-address-label">
                    <input
                      type="radio"
                      name="billingAddress"
                      checked={newBillingEntityForm.sameAddressAsContact}
                      onChange={() => setNewBillingEntityForm({ ...newBillingEntityForm, sameAddressAsContact: true, address: '' })}
                    />
                    Same address as contact
                    {form.address && (
                      <span className="contacts-billing-address-hint">
                        ({form.address.substring(0, 30)}{form.address.length > 30 ? '...' : ''})
                      </span>
                    )}
                  </label>
                  <label className="contacts-billing-address-label">
                    <input
                      type="radio"
                      name="billingAddress"
                      checked={!newBillingEntityForm.sameAddressAsContact}
                      onChange={() => setNewBillingEntityForm({ ...newBillingEntityForm, sameAddressAsContact: false })}
                    />
                    Different address
                  </label>
                  {!newBillingEntityForm.sameAddressAsContact && (
                    <textarea
                      value={newBillingEntityForm.address}
                      onChange={(e) => setNewBillingEntityForm({ ...newBillingEntityForm, address: e.target.value })}
                      placeholder="Enter billing address..."
                      rows={2}
                      className="contacts-billing-address-textarea"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Show existing entities dropdown when that option is selected */}
            {billingEntityChoice === 'existing' && (
              <div className="contacts-billing-indent">
                {/* Show selected billing entities as chips */}
                {selectedBillingEntities.length > 0 && (
                  <div className="contacts-billing-chips">
                    {selectedBillingEntities.map((be) => (
                      <span
                        key={be.id}
                        className="contacts-billing-chip"
                      >
                        {be.name}
                        <button
                          type="button"
                          onClick={() => handleRemoveBillingEntity(be.id)}
                          className="contacts-billing-chip-remove"
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

                {/* Dropdown to select existing */}
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      const be = billingEntitiesList.find((b) => b.id === parseInt(e.target.value));
                      if (be && !selectedBillingEntities.some((s) => s.id === be.id)) {
                        setSelectedBillingEntities([...selectedBillingEntities, { id: be.id, name: be.name }]);
                      }
                    }
                  }}
                >
                  <option value="">
                    {selectedBillingEntities.length === 0 ? 'Select billing entity...' : '+ Add another...'}
                  </option>
                  {availableBillingEntities.map((be) => (
                    <option key={be.id} value={be.id}>{be.name}</option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="table-container">
        <div className="table-header">
          <h3 className="table-title">All Contacts ({filteredContacts.length})</h3>
          <div className="table-actions">
            <div className="search-box contacts-search-box">
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
            {(() => {
              const emailCount = filteredContacts.filter((c) => c.email.trim()).length;
              return emailCount > 0 ? (
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    const emails = [...new Set(filteredContacts.map((c) => c.email.trim()).filter(Boolean))];
                    navigator.clipboard.writeText(emails.join(', '));
                    setCopiedEmails(true);
                    setTimeout(() => setCopiedEmails(false), 2000);
                  }}
                  title={`Copy ${emailCount} email addresses to clipboard`}
                >
                  {copiedEmails ? 'Copied!' : `Copy Emails (${emailCount})`}
                </button>
              ) : null;
            })()}
            {showMap && (
              <select value={mapColorBy} onChange={(e) => setMapColorBy(e.target.value as 'none' | 'type' | 'operation')}>
                <option value="none">Default Markers</option>
                <option value="type">Color by Type</option>
                <option value="operation">Color by Operation</option>
              </select>
            )}
            {/* Column Picker Dropdown */}
            {!showMap && (
              <div ref={columnPickerRef} className="contacts-column-picker">
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
                  <div className="contacts-column-dropdown">
                    <div className="contacts-column-dropdown-header">
                      <span className="contacts-column-dropdown-label">Show Columns</span>
                    </div>
                    {COLUMN_DEFINITIONS.map((col) => (
                      <label
                        key={col.key}
                        className={`contacts-column-dropdown-item${col.alwaysVisible ? ' always-visible' : ''}`}
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
                        />
                        {col.label}
                        {col.alwaysVisible && <span className="contacts-required-tag">(required)</span>}
                      </label>
                    ))}
                    <div className="contacts-column-dropdown-footer">
                      <button
                        className="btn btn-secondary contacts-column-reset-btn"
                        onClick={() => setVisibleColumns([...DEFAULT_VISIBLE_COLUMNS])}
                      >
                        Reset to Defaults
                      </button>
                    </div>
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
                  className="btn btn-secondary contacts-geocode-bulk-btn"
                  onClick={handleBulkGeocode}
                  disabled={bulkGeocoding}
                  title={`Geocode ${needsGeocode} contacts with addresses but no coordinates`}
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
                <span className="contacts-map-count">({mappableContacts.length})</span>
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
          className="desktop-table contacts-table"
          style={{
            display: showMap ? 'none' : undefined,
            userSelect: resizingColumn ? 'none' : undefined,
          }}
        >
          <colgroup>
            {isColumnVisible('name') && <col style={{ width: columnWidths.name }} />}
            {isColumnVisible('operation') && <col style={{ width: columnWidths.operation }} />}
            {isColumnVisible('billingEntity') && <col style={{ width: columnWidths.billingEntity }} />}
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
                <th className="sortable th-resizable" onClick={() => handleSort('name')}>
                  <span className="th-content">
                    Name
                    {sortColumn === 'name' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </span>
                  <div
                    onMouseDown={(e) => handleResizeStart('name', e)}
                    onDoubleClick={() => handleResetColumnWidth('name')}
                    className={`resize-handle${resizingColumn === 'name' ? ' active' : ''}`}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
              )}
              {isColumnVisible('operation') && (
                <th className="sortable th-resizable" onClick={() => handleSort('operation')}>
                  <span className="th-content">
                    Operation
                    {sortColumn === 'operation' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </span>
                  <div
                    onMouseDown={(e) => handleResizeStart('operation', e)}
                    onDoubleClick={() => handleResetColumnWidth('operation')}
                    className={`resize-handle${resizingColumn === 'operation' ? ' active' : ''}`}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
              )}
              {isColumnVisible('billingEntity') && (
                <th className="sortable th-resizable" onClick={() => handleSort('billingEntity')}>
                  <span className="th-content">
                    Billing Entity
                    {sortColumn === 'billingEntity' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </span>
                  <div
                    onMouseDown={(e) => handleResizeStart('billingEntity', e)}
                    onDoubleClick={() => handleResetColumnWidth('billingEntity')}
                    className={`resize-handle${resizingColumn === 'billingEntity' ? ' active' : ''}`}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
              )}
              {isColumnVisible('role') && (
                <th className="th-resizable">
                  <span className="th-content">Role</span>
                  <div
                    onMouseDown={(e) => handleResizeStart('role', e)}
                    onDoubleClick={() => handleResetColumnWidth('role')}
                    className={`resize-handle${resizingColumn === 'role' ? ' active' : ''}`}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
              )}
              {isColumnVisible('email') && (
                <th className="sortable th-resizable" onClick={() => handleSort('email')}>
                  <span className="th-content">
                    Email
                    {sortColumn === 'email' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </span>
                  <div
                    onMouseDown={(e) => handleResizeStart('email', e)}
                    onDoubleClick={() => handleResetColumnWidth('email')}
                    className={`resize-handle${resizingColumn === 'email' ? ' active' : ''}`}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
              )}
              {isColumnVisible('phone') && (
                <th className="sortable th-resizable" onClick={() => handleSort('phone')}>
                  <span className="th-content">
                    Phone
                    {sortColumn === 'phone' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </span>
                  <div
                    onMouseDown={(e) => handleResizeStart('phone', e)}
                    onDoubleClick={() => handleResetColumnWidth('phone')}
                    className={`resize-handle${resizingColumn === 'phone' ? ' active' : ''}`}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
              )}
              {isColumnVisible('address') && (
                <th className="sortable th-resizable" onClick={() => handleSort('address')}>
                  <span className="th-content">
                    Address
                    {sortColumn === 'address' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </span>
                  <div
                    onMouseDown={(e) => handleResizeStart('address', e)}
                    onDoubleClick={() => handleResetColumnWidth('address')}
                    className={`resize-handle${resizingColumn === 'address' ? ' active' : ''}`}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
              )}
              {isColumnVisible('customerType') && (
                <th className="sortable th-resizable" onClick={() => handleSort('customerType')}>
                  <span className="th-content">
                    Type
                    {sortColumn === 'customerType' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </span>
                  <div
                    onMouseDown={(e) => handleResizeStart('customerType', e)}
                    onDoubleClick={() => handleResetColumnWidth('customerType')}
                    className={`resize-handle${resizingColumn === 'customerType' ? ' active' : ''}`}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
              )}
              {isColumnVisible('notes') && (
                <th className="th-resizable">
                  <span className="th-content">Notes</span>
                  <div
                    onMouseDown={(e) => handleResizeStart('notes', e)}
                    onDoubleClick={() => handleResetColumnWidth('notes')}
                    className={`resize-handle${resizingColumn === 'notes' ? ' active' : ''}`}
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
                <td colSpan={visibleColumns.length + 1} className="contacts-empty-row">
                  No contacts found.
                </td>
              </tr>
            ) : (
              filteredContacts.map((contact) => (
                <tr key={contact.id}>
                  {isColumnVisible('name') && (
                    <td className="operation-name">
                      {renderEditableCell(contact, 'name', contact.name)}
                    </td>
                  )}
                  {isColumnVisible('operation') && (
                    <td>
                      {renderEditableOperationCell(contact)}
                    </td>
                  )}
                  {isColumnVisible('billingEntity') && (
                    <td>
                      <div
                        className="contacts-cell-truncate"
                        title={contact.billingEntityNames.join(', ') || undefined}
                      >
                        {contact.billingEntityNames.length > 0 ? (
                          contact.billingEntityNames.join(', ')
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </div>
                    </td>
                  )}
                  {isColumnVisible('role') && (
                    <td>
                      <div className="contacts-role-badges">
                        {contact.isMainContact && (
                          <span className="contacts-role-badge-main">Main</span>
                        )}
                        {contact.billingEntityIds.length > 0 && (
                          <span className="contacts-role-badge-billing">Billing</span>
                        )}
                        {!contact.isMainContact && contact.billingEntityIds.length === 0 && (
                          <span className="text-muted">—</span>
                        )}
                      </div>
                    </td>
                  )}
                  {isColumnVisible('email') && (
                    <td>
                      {renderEditableCell(contact, 'email', contact.email)}
                    </td>
                  )}
                  {isColumnVisible('phone') && (
                    <td>
                      {renderEditableCell(contact, 'phone', contact.phone)}
                    </td>
                  )}
                  {isColumnVisible('address') && (
                    <td>
                      {renderEditableCell(contact, 'address', contact.address)}
                    </td>
                  )}
                  {isColumnVisible('customerType') && (
                    <td>
                      {renderEditableTypeCell(contact)}
                    </td>
                  )}
                  {isColumnVisible('notes') && (
                    <td>
                      {renderEditableCell(contact, 'notes', contact.notes)}
                    </td>
                  )}
                  <td>
                    <div className="contacts-action-buttons">
                      <button className="action-btn" title="More options" onClick={() => openEditModal(contact)}>
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
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
                    <div className="contacts-role-badges">
                      {contact.isMainContact && (
                        <span className="contacts-role-badge-main">Main</span>
                      )}
                      {contact.billingEntityIds.length > 0 && (
                        <span className="contacts-role-badge-billing">Billing</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="mobile-card-body">
                  {isColumnVisible('operation') && contact.operationNames.length > 0 && (
                    <div className="mobile-card-row"><span>Operation:</span> {contact.operationNames.join(', ')}</div>
                  )}
                  {isColumnVisible('billingEntity') && contact.billingEntityNames.length > 0 && (
                    <div className="mobile-card-row"><span>Billing Entity:</span> {contact.billingEntityNames.join(', ')}</div>
                  )}
                  {isColumnVisible('phone') && contact.phone && <div className="mobile-card-row"><span>Phone:</span> {contact.phone}</div>}
                  {isColumnVisible('email') && contact.email && <div className="mobile-card-row"><span>Email:</span> {contact.email}</div>}
                  {isColumnVisible('address') && contact.address && <div className="mobile-card-row"><span>Address:</span> {contact.address}</div>}
                  {isColumnVisible('customerType') && contact.customerType.length > 0 && (
                    <div className="mobile-card-row"><span>Type:</span> {getTypeBadges(contact.customerType)}</div>
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
                  <div className="contacts-geocode-actions">
                    <button
                      type="button"
                      className="btn btn-secondary contacts-btn-inline"
                      onClick={handleGeocode}
                      disabled={geocoding || !form.address.trim()}
                    >
                      {geocoding ? 'Geocoding...' : 'Convert to Lat/Lng'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary contacts-btn-inline"
                      onClick={() => setShowLocationPicker(true)}
                    >
                      Pick on Map
                    </button>
                    {form.address_lat && form.address_lng && (
                      <button
                        type="button"
                        className="btn btn-secondary contacts-btn-inline"
                        onClick={handleClearLocation}
                      >
                        Clear Location
                      </button>
                    )}
                  </div>
                  {geocodeError && (
                    <p className="contacts-geocode-error">
                      {geocodeError}
                    </p>
                  )}
                  {form.address_lat && form.address_lng && (
                    <p className="contacts-geocode-success">
                      Location: {form.address_lat}, {form.address_lng}
                    </p>
                  )}
                </div>
                <div className="form-group">
                  <label>Customer Type</label>
                  <div className="contacts-type-checkboxes">
                    {CUSTOMER_TYPE_OPTIONS.map((type) => (
                      <label
                        key={type}
                        className={`contacts-type-checkbox-label${form.customer_type.includes(type) ? ' selected' : ''}`}
                        onClick={(e) => {
                          e.preventDefault();
                          setForm({
                            ...form,
                            customer_type: form.customer_type.includes(type)
                              ? form.customer_type.filter((t) => t !== type)
                              : [...form.customer_type, type],
                          });
                        }}
                      >
                        <span className={`status-badge ${typeColorMap[type] || 'needs-probe'}`}>
                          <span className="status-dot"></span>
                          {type}
                        </span>
                      </label>
                    ))}
                  </div>
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
                  <div className="contacts-geocode-actions">
                    <button
                      type="button"
                      className="btn btn-secondary contacts-btn-inline"
                      onClick={handleGeocode}
                      disabled={geocoding || !form.address.trim()}
                    >
                      {geocoding ? 'Geocoding...' : 'Convert to Lat/Lng'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary contacts-btn-inline"
                      onClick={() => setShowLocationPicker(true)}
                    >
                      Pick on Map
                    </button>
                    {form.address_lat && form.address_lng && (
                      <button
                        type="button"
                        className="btn btn-secondary contacts-btn-inline"
                        onClick={handleClearLocation}
                      >
                        Clear Location
                      </button>
                    )}
                  </div>
                  {geocodeError && (
                    <p className="contacts-geocode-error">
                      {geocodeError}
                    </p>
                  )}
                  {form.address_lat && form.address_lng && (
                    <p className="contacts-geocode-success">
                      Location: {form.address_lat}, {form.address_lng}
                    </p>
                  )}
                </div>
                <div className="form-group">
                  <label>Customer Type</label>
                  <div className="contacts-type-checkboxes">
                    {CUSTOMER_TYPE_OPTIONS.map((type) => (
                      <label
                        key={type}
                        className={`contacts-type-checkbox-label${form.customer_type.includes(type) ? ' selected' : ''}`}
                        onClick={(e) => {
                          e.preventDefault();
                          setForm({
                            ...form,
                            customer_type: form.customer_type.includes(type)
                              ? form.customer_type.filter((t) => t !== type)
                              : [...form.customer_type, type],
                          });
                        }}
                      >
                        <span className={`status-badge ${typeColorMap[type] || 'needs-probe'}`}>
                          <span className="status-dot"></span>
                          {type}
                        </span>
                      </label>
                    ))}
                  </div>
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
        <div className="detail-panel-overlay contacts-nested-overlay" onClick={() => setShowAddOperationModal(false)}>
          <div className="detail-panel contacts-nested-panel" onClick={(e) => e.stopPropagation()}>
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
        <div className="detail-panel-overlay contacts-nested-overlay" onClick={() => setShowAddBillingEntityModal(false)}>
          <div className="detail-panel contacts-nested-panel" onClick={(e) => e.stopPropagation()}>
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
                <p className="contacts-billing-entity-info">
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
                  <div>
                    <label className="contacts-billing-checkbox-label">
                      <input
                        type="checkbox"
                        checked={newBillingEntityForm.sameAddressAsContact}
                        onChange={(e) => setNewBillingEntityForm({ ...newBillingEntityForm, sameAddressAsContact: e.target.checked, address: '' })}
                      />
                      Same address as contact
                    </label>
                  </div>
                  {newBillingEntityForm.sameAddressAsContact ? (
                    <div className="contacts-billing-same-address-display">
                      {form.address ? (
                        <span>Will use: <strong>{form.address}</strong></span>
                      ) : (
                        <span className="contacts-billing-same-address-empty">No address entered for contact yet</span>
                      )}
                    </div>
                  ) : (
                    <textarea
                      value={newBillingEntityForm.address}
                      onChange={(e) => setNewBillingEntityForm({ ...newBillingEntityForm, address: e.target.value })}
                      placeholder="Enter mailing address..."
                      rows={2}
                    />
                  )}
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
