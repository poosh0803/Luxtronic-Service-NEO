// Shows an "in progress" notification on the Luxtronic Portal while a job is
// started, per the portal's Notifications API (Luxtronic-Portal/API.md).
//
// Best-effort by design: a down or slow portal must never affect this app, so
// every function here swallows its own errors and is safe to call without await.
//
// Disabled unless PORTAL_NOTIFICATIONS_URL is set, so a local dev server can
// never post to the live portal by accident.
import pool from '../db.js';

const TIMEOUT_MS = 3000;

const portalUrl = () => process.env.PORTAL_NOTIFICATIONS_URL || '';
const publicBaseUrl = () => (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

// Returns the created notification's id, or null if disabled/failed.
async function postNotification(payload) {
  if (!portalUrl()) return null;
  try {
    const res = await fetch(portalUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()).id || null;
  } catch (error) {
    // Message only - never the payload, which contains customer details.
    console.error('Portal notification failed (ignored):', error.message);
    return null;
  }
}

export async function clearPortalNotification(notificationId) {
  if (!notificationId || !portalUrl()) return;
  try {
    await fetch(`${portalUrl()}/${encodeURIComponent(notificationId)}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    console.error('Clearing portal notification failed (ignored):', error.message);
  }
}

// Notifies once for a started job that has no notification yet.
export async function notifyJobInProgress(formId) {
  if (!portalUrl()) return;
  try {
    const { rows } = await pool.query(
      `SELECT sf.id, sf.brand, sf.model, c.name AS customer_name
       FROM service_forms sf JOIN customers c ON c.id = sf.customer_id
       WHERE sf.id = $1 AND sf.status = 'started' AND sf.portal_notification_id IS NULL`,
      [formId]
    );
    if (rows.length === 0) return;
    const job = rows[0];
    const device = [job.brand, job.model].filter(Boolean).join(' ') || 'device';

    const notificationId = await postNotification({
      source: 'service-form',
      level: 'info',
      title: 'Service in progress',
      message: `${job.id}: ${device} for ${job.customer_name || 'customer'} is in progress`,
      ...(publicBaseUrl() && { url: `${publicBaseUrl()}/service-detail?id=${job.id}` }),
    });
    if (!notificationId) return;

    // The job may have been finished or deleted while we were posting; if so
    // there's nothing to attach the id to, so take the notification back down.
    const saved = await pool.query(
      `UPDATE service_forms SET portal_notification_id = $2
       WHERE id = $1 AND status = 'started' AND portal_notification_id IS NULL`,
      [formId, notificationId]
    );
    if (saved.rowCount === 0) await clearPortalNotification(notificationId);
  } catch (error) {
    console.error('Notifying portal failed (ignored):', error.message);
  }
}

// Removes a job's notification (job finished). Safe if there isn't one.
export async function releaseJobNotification(formId) {
  if (!portalUrl()) return;
  try {
    // Joining the row to itself makes RETURNING give the id as it was before
    // this UPDATE nulled it.
    const { rows } = await pool.query(
      `UPDATE service_forms f SET portal_notification_id = NULL
       FROM service_forms o
       WHERE f.id = $1 AND o.id = f.id
       RETURNING o.portal_notification_id AS previous_id`,
      [formId]
    );
    await clearPortalNotification(rows[0]?.previous_id);
  } catch (error) {
    console.error('Releasing portal notification failed (ignored):', error.message);
  }
}

// Catches up on jobs that are in progress but have no notification: jobs that
// started before this feature existed, or while the portal was unreachable.
export async function syncInProgressNotifications() {
  if (!portalUrl()) return 0;
  try {
    const { rows } = await pool.query(
      `SELECT id FROM service_forms WHERE status = 'started' AND portal_notification_id IS NULL ORDER BY created_at`
    );
    for (const { id } of rows) await notifyJobInProgress(id);
    return rows.length;
  } catch (error) {
    console.error('Syncing portal notifications failed (ignored):', error.message);
    return 0;
  }
}
