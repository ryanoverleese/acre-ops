import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';

export async function POST(request: NextRequest) {
  try {
    const { serial, reason, date, fieldName, operation } = await request.json();

    const title = `Probe Removed – #${serial}`;
    const body = [
      `Serial: ${serial}`,
      `Reason: ${reason}`,
      `Date: ${date}`,
      fieldName ? `Field: ${fieldName}` : null,
      operation ? `Operation: ${operation}` : null,
    ].filter(Boolean).join('\\n');

    const script = `tell application "Notes"
  set targetFolder to missing value
  repeat with f in folders of default account
    if name of f is "Acre Ops" then
      set targetFolder to f
      exit repeat
    end if
  end repeat
  if targetFolder is missing value then
    set targetFolder to make new folder at default account with properties {name:"Acre Ops"}
  end if
  make new note at targetFolder with properties {name:"${title}", body:"${body}"}
end tell`;

    execSync(`osascript -e '${script}'`);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('log-removal error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
