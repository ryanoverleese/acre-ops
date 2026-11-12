import 'server-only';
import {
  describeGrowerActivity,
  formatChicagoTime,
  isGrowerPageViewPath,
  type GrowerActivityEvent,
  type GrowerActivityEventType,
  type GrowerActivityFarm,
} from '../grower-activity-display';
import { isGrowerPilotFarm } from './grower-auth';
import { query } from './database';
import { growerQuery, withGrowerOperation } from './grower';

export type { GrowerActivityEvent, GrowerActivityEventType, GrowerActivityFarm };

/**
 * Record one grower event. Failures are swallowed so sign-in, sign-out, and
 * page loads still succeed when the migration is not applied yet.
 */
export async function recordGrowerActivity(
  operationId: number,
  eventType: GrowerActivityEventType,
  path: string | null,
): Promise<void> {
  if (eventType === 'page_view' && (!path || !isGrowerPageViewPath(path))) return;
  try {
    await withGrowerOperation(operationId, async () => {
      await growerQuery(`SELECT acre_private.log_grower_activity($1, $2)`, [eventType, path]);
    });
  } catch {
    // Activity logging must never block the grower.
  }
}

export async function recordGrowerPageView(operationId: number, path: string): Promise<void> {
  await recordGrowerActivity(operationId, 'page_view', path);
}

function asIso(value: unknown): string | null {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function asCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function asEventType(value: unknown): GrowerActivityEventType {
  if (value === 'login' || value === 'page_view' || value === 'logout') return value;
  return 'page_view';
}

/** Office read of every operation's grower pilot, PIN, and recent activity. */
export async function listGrowerActivityForOffice(): Promise<GrowerActivityFarm[] | null> {
  try {
    const [farms, events] = await Promise.all([
      query<{
        id: unknown;
        name: string;
        pin_set: boolean;
        login_count: unknown;
        view_count: unknown;
        last_login_at: unknown;
      }>(
        `SELECT o.id,
                o.name,
                (o.grower_pin IS NOT NULL) AS pin_set,
                COALESCE(s.login_count, 0) AS login_count,
                COALESCE(s.view_count, 0) AS view_count,
                s.last_login_at
           FROM public.operations AS o
           LEFT JOIN (
             SELECT operation_id,
                    count(*) FILTER (WHERE event_type = 'login') AS login_count,
                    count(*) FILTER (WHERE event_type = 'page_view') AS view_count,
                    max(created_at) FILTER (WHERE event_type = 'login') AS last_login_at
               FROM public.grower_activity_log
              GROUP BY operation_id
           ) AS s ON s.operation_id = o.id
          ORDER BY s.last_login_at DESC NULLS LAST, lower(o.name), o.id`,
      ),
      query<{
        operation_id: unknown;
        event_type: string;
        path: string | null;
        field_id: unknown;
        field_name: string | null;
        created_at: unknown;
      }>(
        `SELECT operation_id, event_type, path, field_id, field_name, created_at
           FROM (
             SELECT l.operation_id,
                    l.event_type,
                    l.path,
                    l.field_id,
                    COALESCE(NULLIF(btrim(l.field_name), ''), f.name) AS field_name,
                    l.created_at,
                    row_number() OVER (
                      PARTITION BY l.operation_id
                      ORDER BY l.created_at DESC, l.id DESC
                    ) AS n
               FROM public.grower_activity_log AS l
               LEFT JOIN public.fields AS f ON f.id = l.field_id
           ) AS recent
          WHERE n <= 6
          ORDER BY created_at DESC, operation_id`,
      ),
    ]);

    const recentByOperation = new Map<number, GrowerActivityEvent[]>();
    for (const row of events) {
      const operationId = Number(row.operation_id);
      if (!Number.isSafeInteger(operationId)) continue;
      const createdAt = asIso(row.created_at);
      if (!createdAt) continue;
      const fieldId = row.field_id == null ? null : Number(row.field_id);
      const event: GrowerActivityEvent = {
        eventType: asEventType(row.event_type),
        path: row.path,
        fieldId: fieldId != null && Number.isSafeInteger(fieldId) ? fieldId : null,
        fieldName: row.field_name?.trim() || null,
        createdAt,
        when: formatChicagoTime(createdAt),
        label: '',
      };
      event.label = describeGrowerActivity(event);
      const list = recentByOperation.get(operationId) ?? [];
      list.push(event);
      recentByOperation.set(operationId, list);
    }

    return farms.map((row) => {
      const id = Number(row.id);
      const lastLoginAt = asIso(row.last_login_at);
      return {
        id,
        name: row.name,
        pilot: isGrowerPilotFarm(id, row.name),
        pinSet: Boolean(row.pin_set),
        loginCount: asCount(row.login_count),
        viewCount: asCount(row.view_count),
        lastLoginAt,
        lastLoginLabel: lastLoginAt ? formatChicagoTime(lastLoginAt) : null,
        recent: recentByOperation.get(id) ?? [],
      };
    });
  } catch {
    return null;
  }
}
