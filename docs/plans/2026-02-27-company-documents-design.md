# Company Documents — Design

**Goal:** A shared document library where admins upload reference material (price lists, manuals, etc.) and all users can view/download.

**Route:** `/documents` under Admin nav section (between AI Chat and Settings)

## Data Layer

New Baserow table `documents` with fields:
- `name` (text) — display name, e.g. "Davis 2026 Price List"
- `file` (file field) — the actual document, uploaded via Baserow file API
- `uploaded_by` (text) — who uploaded it
- `uploaded_at` (date) — when
- `description` (long text, optional) — notes about the doc

## UI

Single page with:
- Search box filtering by name
- Upload button (admin only) opens modal: name, file picker, optional description
- Document list as table (desktop) / cards (mobile): name, file type icon, uploaded by, date, description
- Click row to download/open file in new tab
- Delete button per row (admin only)

## File Handling

- Accept PDF, images, spreadsheets, Word docs
- Reuse Baserow file upload pattern from install photos (`uploadFileToBaserow`)
- Compress images (same `compressImage` utility), pass-through other types

## Access Control

- All logged-in users see Documents nav item, can view and download
- Upload and delete buttons only render for non-installer roles (admin/manager)

## Technical Approach

- Server component `app/documents/page.tsx` fetches rows from Baserow
- Client component `app/documents/DocumentsClient.tsx` for upload modal, search, delete
- API route `app/api/documents/route.ts` for GET (list), POST (upload + create row), DELETE
- Extract `uploadFileToBaserow` from install route into shared `lib/baserow.ts` utility
- Add nav item to `components/AppShell.tsx` in Admin section
