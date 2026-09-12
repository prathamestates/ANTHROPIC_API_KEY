import { supabase } from "../supabaseClient";

/* ---------------------------------------------------------------------
   STOCKLY OPS DATA LAYER — Phase 11 (real Admin / Shopper / Driver)

   Replaces the seedOrders()/localStorage mock layer the three ops
   dashboards currently use. Everything is enforced again at the database
   level by the RLS policies in supabase/migrations/0007 — this layer is
   the typed, UI-shaped convenience wrapper.

   Access model:
   - Admin:      sees ALL runs (existing admin RLS policy)
   - Shopper:    sees runs where assigned_shopper = their profile id
   - Driver:     sees runs where assigned_driver  = their profile id
--------------------------------------------------------------------- */

const RUN_STATUSES = [
  "Requested", "Confirmed", "Purchasing", "Collected",
  "Out for Delivery", "Delivered", "Cancelled",
];

function displayRunNumber(id) {
  return "STK-" + id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

function mapRunItem(it) {
  return {
    product: it.product,
    brand: it.brand || "",
    qty: Number(it.qty) || 1,
    unit: it.unit || "Units",
    notes: it.notes || "",
    barcode: it.barcode || "",
    category: it.category || "",
    imageUrl: it.image_url || "",
  };
}

function mapRun(run, items, events) {
  return {
    dbId: run.id,
    id: displayRunNumber(run.id),
    status: run.status,
    cashAndCarry: run.cash_and_carry || "",
    address: run.delivery_address || "",
    scheduledFor: run.scheduled_for || null,
    date: run.scheduled_for || (run.created_at ? run.created_at.slice(0, 10) : ""),
    notes: run.notes || "",
    items: (items || []).filter(i => i.run_id === run.id).map(mapRunItem),
    serviceFee: Number(run.service_fee) || 0,
    supplierTotal: Number(run.supplier_total) || 0,
    shopper: run.shopper_name || "",
    driver: run.driver_name || "",
    receiptUploaded: !!run.receipt_uploaded,
    podUploaded: !!run.pod_uploaded,
    assignedShopperId: run.assigned_shopper || null,
    assignedDriverId: run.assigned_driver || null,
    customerId: run.customer_id,
    createdAt: run.created_at,
    events: (events || [])
      .filter(e => e.run_id === run.id)
      .map(e => ({
        id: e.id,
        type: e.event_type,
        from: e.from_value || null,
        to: e.to_value || null,
        note: e.note || "",
        actor: e.actor_label || "Stockly",
        at: e.created_at,
      })),
  };
}

// Runs + their items + their events, batched into 3 queries (no N+1).
// `mode` = "all" (admin) | "shopper" | "driver" — the query shape differs
// because RLS would otherwise force fetching every run to filter client-side.
async function fetchRunsWithDetails(runsQuery) {
  const { data: runs, error: runsErr } = await runsQuery;
  if (runsErr) throw runsErr;
  if (!runs || runs.length === 0) return [];

  const runIds = runs.map(r => r.id);
  const [{ data: items, error: itemsErr }, { data: events, error: eventsErr }] =
    await Promise.all([
      supabase.from("run_items").select("*").eq("run_type", "single").in("run_id", runIds),
      supabase.from("run_events").select("*").in("run_id", runIds).order("created_at", { ascending: false }),
    ]);
  if (itemsErr) throw itemsErr;
  if (eventsErr) throw eventsErr;

  return runs.map(r => mapRun(r, items || [], events || []));
}

// Admin: every run in the system, newest first.
export async function fetchAllRuns() {
  return fetchRunsWithDetails(
    supabase.from("single_runs").select("*").order("created_at", { ascending: false }).limit(500)
  );
}

// Shopper / Driver: only runs assigned to the signed-in ops user.
export async function fetchMyAssignedRuns(profileId, role) {
  const col = role === "driver" ? "assigned_driver" : "assigned_shopper";
  return fetchRunsWithDetails(
    supabase.from("single_runs").select("*").eq(col, profileId).order("created_at", { ascending: false }).limit(300)
  );
}

// Ops team lists for the admin assignment dropdowns.
export async function fetchOpsTeam() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, is_shopper, is_driver")
    .or("is_shopper.eq.true,is_driver.eq.true")
    .order("full_name");
  if (error) throw error;
  return data || [];
}

// Assign (or unassign, pass null) a shopper and/or driver. Admin only (RLS).
export async function assignRun(runDbId, { shopperId, driverId }) {
  const patch = {};
  if (shopperId !== undefined) patch.assigned_shopper = shopperId;
  if (driverId !== undefined) patch.assigned_driver = driverId;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from("single_runs").update(patch).eq("id", runDbId);
  if (error) throw error;

  if (shopperId !== undefined) {
    await logRunEvent(runDbId, "assignment", shopperId ? "Shopper assigned" : "Shopper unassigned", null);
  }
  if (driverId !== undefined) {
    await logRunEvent(runDbId, "assignment", driverId ? "Driver assigned" : "Driver unassigned", null);
  }
}

// Change a run's status. Validates the transition, writes the run row,
// appends a run_events entry, and (via log_run_event) inserts a customer
// notification. This is the single write path every ops dashboard uses.
export async function updateRunStatus(runDbId, fromStatus, toStatus, note) {
  if (!RUN_STATUSES.includes(toStatus)) {
    throw new Error(`"${toStatus}" is not a valid status.`);
  }
  if (toStatus === fromStatus) return;

  const { error } = await supabase
    .from("single_runs")
    .update({ status: toStatus })
    .eq("id", runDbId)
    .eq("status", fromStatus); // optimistic concurrency: refuses stale writes
  if (error) throw error;

  await logRunEvent(runDbId, "status", toStatus, note || null, null, fromStatus);
}

// Low-level event logger (exposed so assignment + status share one path).
export async function logRunEvent(runDbId, eventType, toValue, note, actorLabel, fromValue) {
  const { error } = await supabase.rpc("log_run_event", {
    p_run_id: runDbId,
    p_event_type: eventType,
    p_to_value: toValue,
    p_note: note || null,
    p_actor_label: actorLabel || null,
  });
  if (error) throw error;
}

// Receipt / POD upload flags, set by shopper/driver after photographing.
export async function setRunFlag(runDbId, flag, value, note) {
  const col = flag === "receipt" ? "receipt_uploaded" : "pod_uploaded";
  const { error } = await supabase.from("single_runs").update({ [col]: !!value }).eq("id", runDbId);
  if (error) throw error;
  await logRunEvent(runDbId, flag, value ? `${flag} uploaded` : `${flag} removed`, note || null);
}

// Real admin stats for the dashboard header cards — computed from the
// same rows the table shows, never a separate (driftable) source.
export function buildOpsStats(runs) {
  const active = runs.filter(r =>
    !["Delivered", "Cancelled"].includes(r.status)
  );
  return {
    total: runs.length,
    active: active.length,
    requested: runs.filter(r => r.status === "Requested").length,
    outForDelivery: runs.filter(r => r.status === "Out for Delivery").length,
    deliveredThisMonth: runs.filter(r =>
      r.status === "Delivered" && r.date && r.date.startsWith(new Date().toISOString().slice(0, 7))
    ).length,
    unassigned: active.filter(r => !r.assignedShopperId).length,
  };
}
