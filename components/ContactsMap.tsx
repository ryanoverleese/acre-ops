'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import the map component with SSR disabled
const ContactsMapInner = dynamic(() => import('./ContactsMapInner'), {
  ssr: false,
  loading: () => (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card)' }}>
      <div className="loading">Loading map...</div>
    </div>
  ),
});

interface ContactData {
  id: number;
  name: string;
  address: string;
  phone: string;
  email: string;
  operationNames: string[];
  customerType: string[];
  lat: number;
  lng: number;
}

interface ContactsMapProps {
  contacts: ContactData[];
  visible: boolean;
  colorBy?: 'none' | 'type' | 'operation';
  onContactClick?: (contactId: number) => void;
}

export default function ContactsMap({ contacts, visible, colorBy = 'none', onContactClick }: ContactsMapProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient || !visible) {
    return null;
  }

  return (
    <div className="fields-map" style={{ display: 'block', minHeight: '400px', height: '60vh' }}>
      <ContactsMapInner
        contacts={contacts}
        colorBy={colorBy}
        onContactClick={onContactClick}
      />
    </div>
  );
}
