# Remove Antenna/Battery from Season Setup Columns — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Force-remove `antenna` and `battery` columns from the Season Setup tab for all users, including those with cached column preferences in localStorage.

**Architecture:** The column preferences are stored in `localStorage` under key `fields-tab-columns`. When a user has previously visited the Fields page, their column selections are cached and override `TAB_DEFAULT_COLUMNS`. We already removed `antenna` and `battery` from the defaults, but existing users still see them. The fix is a one-time migration in the localStorage loading logic that strips these columns from `seasonSetup`.

**Tech Stack:** Next.js (React), localStorage

---

### Task 1: Add column migration to localStorage loader

**Files:**
- Modify: `app/fields/FieldsClient.tsx:222-242`

**Step 1: Add migration logic after loading saved columns from localStorage**

In the `useEffect` that loads column preferences (line 222), after the validation loop but before `setTabColumns`, strip `antenna` and `battery` from the `seasonSetup` tab:

```typescript
// Load column preferences from localStorage on mount
useEffect(() => {
  try {
    const saved = localStorage.getItem(FIELD_COLUMNS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Record<TabView, FieldColumnKey[]>;
      // Validate and merge with defaults
      const validated: Record<TabView, FieldColumnKey[]> = { ...TAB_DEFAULT_COLUMNS };
      for (const tab of TAB_INFO.map(t => t.key)) {
        if (parsed[tab] && Array.isArray(parsed[tab])) {
          const valid = parsed[tab].filter((col: string) => ALL_COLUMN_DEFINITIONS.some((def) => def.key === col));
          if (!valid.includes('field')) valid.unshift('field');
          validated[tab] = valid as FieldColumnKey[];
        }
      }
      // Migration: antenna/battery moved to probe_assignments, remove from seasonSetup
      validated.seasonSetup = validated.seasonSetup.filter(col => col !== 'antenna' && col !== 'battery');
      setTabColumns(validated);
    }
  } catch (e) {
    console.error('Failed to load column preferences:', e);
  }
}, []);
```

**Step 2: Verify build passes**

Run: `npx next build`
Expected: Compiled successfully

**Step 3: Commit**

```bash
git add app/fields/FieldsClient.tsx
git commit -m "Force-remove antenna/battery from Season Setup saved column preferences"
git push
```

### Task 2: Verify fix

1. Open Fields page in browser
2. Go to Season Setup tab
3. Antenna and Battery columns should be gone — even without clearing localStorage
4. The Columns picker should still list them (they remain in `ALL_COLUMN_DEFINITIONS`) in case anyone wants to re-add them manually
