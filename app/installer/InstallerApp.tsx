'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import RepairsScreen from './RepairsScreen';
import RemovalsScreen from './RemovalsScreen';
import LoginScreen from './LoginScreen';
import RouteScreen from './RouteScreen';
import FieldScreen from './FieldScreen';
import InstallScreen, { SuccessScreen } from './InstallScreen';
import MapScreen from './MapScreen';
import LoadoutScreen from './LoadoutScreen';
import MeScreen from './MeScreen';
import HistoryScreen from './HistoryScreen';
import MileageScreen from './MileageScreen';
import SettingsScreen from './SettingsScreen';
import SummaryScreen from './SummaryScreen';
import LocationsScreen from './LocationsScreen';
import ProbesScreen from './ProbesScreen';
import {
  clearSession,
  getWorkflowMode,
  loadHiddenTabs,
  loadSession,
  playSuccessSound,
  saveHiddenTabs,
  saveSession,
  saveWorkflowMode,
  type Filter,
  type HideableTab,
  type InstallerAssignment,
  type Screen,
  type Session,
  type SuccessData,
  type WorkflowMode,
} from './installerShared';

// Re-export helpers that RemovalsScreen / tests historically imported from here.
export { compressImage, playSuccessSound } from './installerShared';
export type { InstallerAssignment } from './installerShared';

export default function InstallerApp({ installerNames }: { installerNames: string[] }) {
  const [screen, setScreen] = useState<Screen>('login');
  const [session, setSession] = useState<Session | null>(null);
  const [assignments, setAssignments] = useState<InstallerAssignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [sessionInstalledIds, setSessionInstalledIds] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<InstallerAssignment | null>(null);
  const [filter, setFilter] = useState<Filter>('todo');
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const [activeGroups, setActiveGroups] = useState<Set<number>>(new Set());
  const [initialRepairId, setInitialRepairId] = useState<number | null>(null);
  // Where the Repairs screen should return to on Back ('route' normally,
  // 'map' when a repair was opened by tapping its pin on the map).
  const [repairReturn, setRepairReturn] = useState<Screen>('route');
  // Last map center/zoom, so returning to the map lands you right where you were
  // instead of re-fitting to all stops.
  const mapViewRef = useRef<{ center: [number, number]; zoom: number } | null>(null);
  const [hiddenTabs, setHiddenTabs] = useState<Set<HideableTab>>(new Set());
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>('install');

  useEffect(() => {
    const s = loadSession();
    const mode = getWorkflowMode();
    setWorkflowMode(mode);
    setHiddenTabs(loadHiddenTabs());
    if (s) {
      setSession(s);
      fetchAssignments(s);
      // Remove mode: land on Removals (Route tab is hidden).
      setScreen(mode === 'remove' ? 'removals' : 'route');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleHiddenTabsChange = (tabs: Set<HideableTab>) => {
    setHiddenTabs(tabs);
    saveHiddenTabs(tabs);
  };

  const handleWorkflowModeChange = (mode: WorkflowMode) => {
    setWorkflowMode(mode);
    saveWorkflowMode(mode);
    // Drop the install/remove home tab so Route vs Removals never both mean the same list.
    setScreen(mode === 'remove' ? 'removals' : 'route');
  };

  const fetchAssignments = useCallback(async (s: Session, fresh = false) => {
    setLoadingAssignments(true);
    try {
      const url = `/api/installer/assignments?installer=${encodeURIComponent(s.installer)}&season=${s.season}${fresh ? '&fresh=1' : ''}`;
      const res = await fetch(url, fresh ? { cache: 'no-store' } : undefined);
      if (res.status === 401 || res.status === 403) { clearSession(); setSession(null); setScreen('login'); return; }
      const data = await res.json();
      setAssignments(data.assignments ?? []);
      setSessionInstalledIds(new Set());
    } catch { setAssignments([]); }
    finally { setLoadingAssignments(false); }
  }, []);

  const handleLogin = (s: Session) => {
    const expiring = {...s, expiresAt: Date.now() + 12 * 60 * 60 * 1000};
    setSession(expiring); saveSession(expiring); fetchAssignments(expiring);
    setScreen(getWorkflowMode() === 'remove' ? 'removals' : 'route');
  };
  const handleLogout = () => { clearSession(); setSession(null); setAssignments([]); setScreen('login'); };
  const handleSelectAssignment = (a: InstallerAssignment) => { setSelected(a); setScreen('field'); };
  const handleInstallSuccess = (data: SuccessData, assignmentId: number) => {
    void data;
    playSuccessSound();
    setAssignments(prev => prev.map(a => a.id === assignmentId ? { ...a, status: 'Installed' } : a));
    setSessionInstalledIds(prev => new Set([...prev, assignmentId]));
    setSelected(null);
    setScreen('route');
  };
  const handleBackToRoute = () => { setSelected(null); setSuccessData(null); setScreen('route'); };

  return (
    <div className="af-app" data-theme="standard">
      {/* Screen wrapper — af-screen uses position:absolute inset:0 relative to this */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {screen === 'login' && (
          <LoginScreen installerNames={installerNames} onLogin={handleLogin} />
        )}
        {screen === 'route' && session && (
          <RouteScreen
            session={session}
            assignments={assignments}
            loading={loadingAssignments}
            filter={filter}
            onFilterChange={setFilter}
            onSelect={handleSelectAssignment}
            onLogout={handleLogout}
            onRefresh={() => fetchAssignments(session, true)}
            sessionInstalledIds={sessionInstalledIds}
            activeGroups={activeGroups}
            onActiveGroupsChange={setActiveGroups}
          />
        )}
        {screen === 'map' && session && (
          <MapScreen
            assignments={activeGroups.size > 0 ? assignments.filter(a => a.installGroup != null && activeGroups.has(a.installGroup)) : assignments}
            loading={loadingAssignments}
            onOpenField={(a) => { setSelected(a); setScreen('field'); }}
            onBack={() => setScreen(workflowMode === 'remove' ? 'removals' : 'route')}
            season={session.season}
            installer={session.installer}
            workflowMode={workflowMode}
            savedViewRef={mapViewRef}
            onSelectRepair={(id) => { setInitialRepairId(id); setRepairReturn('map'); setScreen('repairs'); }}
          />
        )}
        {screen === 'loadout' && session && (
          <LoadoutScreen
            session={session}
            assignments={activeGroups.size > 0 ? assignments.filter(a => a.installGroup != null && activeGroups.has(a.installGroup)) : assignments}
          />
        )}
        {screen === 'me' && session && (
          <MeScreen
            session={session}
            assignments={assignments}
            onLogout={handleLogout}
            onOpenHistory={() => setScreen('history')}
            onOpenMileage={() => setScreen('mileage')}
            onOpenSettings={() => setScreen('settings')}
            onOpenSummary={() => setScreen('summary')}
            onOpenProbes={() => setScreen('probes')}
            onOpenLocations={() => setScreen('locations')}
          />
        )}
        {screen === 'history' && session && (
          <HistoryScreen
            session={session}
            onBack={() => setScreen('me')}
          />
        )}
        {screen === 'mileage' && session && (
          <MileageScreen
            session={session}
            onBack={() => setScreen('me')}
          />
        )}
        {screen === 'settings' && session && (
          <SettingsScreen
            session={session}
            onBack={() => setScreen('me')}
            onAdHocInstall={(a) => { setSelected(a); setScreen('field'); }}
            hiddenTabs={hiddenTabs}
            onHiddenTabsChange={handleHiddenTabsChange}
            workflowMode={workflowMode}
            onWorkflowModeChange={handleWorkflowModeChange}
          />
        )}
        {screen === 'summary' && session && (
          <SummaryScreen session={session} onBack={() => setScreen('me')} />
        )}
        {screen === 'repairs' && session && (
          <RepairsScreen
            season={session.season}
            onBack={() => { setInitialRepairId(null); const dest = repairReturn; setRepairReturn('route'); setScreen(dest); }}
            initialRepairId={initialRepairId ?? undefined}
            onClearInitial={() => setInitialRepairId(null)}
          />
        )}
        {screen === 'removals' && session && (
          <RemovalsScreen season={session.season} installer={session.installer} />
        )}
        {screen === 'locations' && session && (
          <LocationsScreen onBack={() => setScreen('me')} />
        )}
        {screen === 'probes' && session && (
          <ProbesScreen onBack={() => setScreen('me')} />
        )}
        {screen === 'field' && selected && (
          <FieldScreen
            assignment={selected}
            onBack={() => setScreen('route')}
            onStartInstall={() => setScreen('install')}
            onUpdateAssignment={(updates) => setSelected(s => s ? { ...s, ...updates } : s)}
          />
        )}
        {screen === 'install' && selected && session && (
          <InstallScreen
            assignment={selected}
            installer={session.installer}
            onBack={() => setScreen('field')}
            onSuccess={handleInstallSuccess}
          />
        )}
        {screen === 'success' && successData && (
          <SuccessScreen data={successData} onBack={handleBackToRoute} />
        )}
      </div>

      {/* Bottom nav — hidden on login */}
      {screen !== 'login' && (
        <BottomBar
          current={screen}
          onNav={setScreen}
          installer={session?.installer ?? ''}
          hiddenTabs={hiddenTabs}
          workflowMode={workflowMode}
        />
      )}
    </div>
  );
}


function BottomBar({ current, onNav, installer, hiddenTabs, workflowMode }: { current: Screen; onNav: (s: Screen) => void; installer: string; hiddenTabs: Set<HideableTab>; workflowMode: WorkflowMode }) {
  const isRoute = current === 'route' || current === 'field' || current === 'install' || current === 'success';
  const isRyan = installer.toLowerCase() === 'ryan';
  const showRoute = workflowMode !== 'remove';
  return (
    <div className="af-bottombar">
      {showRoute && (
      <button className="af-tab" aria-current={isRoute ? 'true' : undefined} onClick={() => onNav('route')}>
        <svg width="22" height="22" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
        Route
      </button>
      )}
      <button className="af-tab" aria-current={current === 'map' ? 'true' : undefined} onClick={() => onNav('map')}>
        <svg width="22" height="22" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
          <line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" />
        </svg>
        Map
      </button>
      {!hiddenTabs.has('loadout') && (
        <button className="af-tab" aria-current={current === 'loadout' ? 'true' : undefined} onClick={() => onNav('loadout')}>
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
          </svg>
          Loadout
        </button>
      )}
      <button className="af-tab" aria-current={current === 'removals' ? 'true' : undefined} onClick={() => onNav('removals')}>
        <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <line x1="12" y1="16" x2="12" y2="4" /><polyline points="6 10 12 4 18 10" />
          <line x1="4" y1="20" x2="20" y2="20" />
        </svg>
        Removals
      </button>
      {isRyan && !hiddenTabs.has('repairs') && (
        <button className="af-tab" aria-current={current === 'repairs' ? 'true' : undefined} onClick={() => onNav('repairs')}>
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
          </svg>
          Repairs
        </button>
      )}
      <button className="af-tab" aria-current={current === 'me' ? 'true' : undefined} onClick={() => onNav('me')}>
        <svg width="22" height="22" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
        </svg>
        Me
      </button>
    </div>
  );
}

