import { supabase } from "../supabaseClient";

/* ---------------------------------------------------------------------
   STOCKLY OPS DATA LAYER — Phase 11

   Real Admin / Shopper / Driver operations data backed by Supabase.
   RLS is the security boundary; this module is the UI-shaped wrapper.
--------------------------------------------------------------------- */

export const RUN_STATUSES = [
  "Requested",
  "Confirmed",
  "Purchasing",
  "Collected",
  "Out for Delivery",
  "Delivered",
  "Cancelled",
];

const NEXT_STATUS = {
  Requested: "Confirmed",
  Confirmed: "Purchasing",
  Purchasing: "Collected",
  Collected: "Out for Delivery",
  "Out for Delivery": "Delivered",
};

const PREVIOUS_STATUS = {
  Confirmed: "Requested",
  Purchasing: "Confirmed",
  Collected: "Purchasing",
  "Out for Delivery": "Collected",
  Delivered: "Out for Delivery",
};

function displayRunNumber(id) {
  return `STK-${String(id).replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

function mapRunItem(item) {
  return {
    id: item.id,
    product: item.product,
    brand: item.brand || "",
    qty: Number(item.qty) || 1,
    unit: item.unit || "Units",
    notes: item.notes || "",
    barcode: item.barcode || "",
    category: item.category || "",
    imageUrl: item.image_url || "",
  };
}

function mapRun(run, items = [], events = []) {
  return {
    dbId: run.id,
    id: displayRunNumber(run.id),
    status: run.status,
    cashAndCarry: run.cash_and_carry || "",
    address: run.delivery_address || "",
    scheduledFor: run.scheduled_for || null,
    date: run.scheduled_for || (run.created_at ? run.created_at.slice(0, 10) : ""),
    notes: run.notes || "",
    items: items.filter(item => item.run_id === run.id).map(mapRunItem),
    serviceFee: Number(run.service_fee) || 0,
    supplierTotal: Number(run.supplier_total) || 0,
    shopper: run.shopper_name || "",
    driver: run.driver_name || "",
    receiptUploaded: Boolean(run.receipt_uploaded),
    podUploaded: Boolean(run.pod_uploaded),
    assignedShopperId: run.assigned_shopper || null,
    assignedDriverId: run.assigned_driver || null,
    customerId: run.customer_id,
    createdAt: run.created_at,
    events: events
      .filter(event => event.run_id === run.id)
      .map(event => ({
        id: event.id,
        type: event.event_type,
        from: event.from_value || null,
        to: event.to_value || null,
        note: event.note || "",
        actor: event.actor_label || "Stockly",
        at: event.created_at,
      })),
  };
}

async function fetchRunsWithDetails(runsQuery) {
  const { data: runs, error: runsError } = await runsQuery;
  if (runsError) throw runsError;
  if (!runs?.length) return [];

  const runIds = runs.map(run => run.id);

  const [itemsResult, eventsResult] = await Promise.all([
    supabase
      .from("run_items")
      .select("*")
      .eq("run_type", "single")
      .in("run_id", runIds),
    supabase
      .from("run_events")
      .select("*")
      .in("run_id", runIds)
      .order("created_at", { ascending: false }),
  ]);

  if (itemsResult.error) throw itemsResult.error;
  if (eventsResult.error) throw eventsResult.error;

  return runs.map(run => mapRun(run, itemsResult.data || [], eventsResult.data || []));
}

export async function fetchAllRuns() {
  return fetchRunsWithDetails(
    supabase
      .from("single_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500)
  );
}

export async function fetchMyAssignedRuns(profileId, role) {
  if (!profileId) throw new Error("Your Stockly operations profile could not be identified.");

  const column = role === "driver" ? "assigned_driver" : "assigned_shopper";

  return fetchRunsWithDetails(
    supabase
      .from("single_runs")
      .select("*")
      .eq(column, profileId)
      .order("created_at", { ascending: false })
      .limit(300)
  );
}

export async function fetchOpsTeam() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, is_admin, is_shopper, is_driver")
    .or("is_shopper.eq.true,is_driver.eq.true,is_admin.eq.true")
    .order("full_name", { nullsFirst: false });

  if (error) throw error;
  return data || [];
}

export async function assignRun(runDbId, { shopperId, driverId }, team = []) {
  const patch = {};

  if (shopperId !== undefined) {
    patch.assigned_shopper = shopperId || null;
    const shopper = team.find(person => person.id === shopperId);
    patch.shopper_name = shopper?.full_name || null;
  }

  if (driverId !== undefined) {
    patch.assigned_driver = driverId || null;
    const driver = team.find(person => person.id === driverId);
    patch.driver_name = driver?.full_name || null;
  }

  if (!Object.keys(patch).length) return;

  const { error } = await supabase
    .from("single_runs")
    .update(patch)
    .eq("id", runDbId);

  if (error) throw error;

  if (shopperId !== undefined) {
    await logRunEvent(
      runDbId,
      "assignment",
      shopperId
        ? `Shopper assigned${patch.shopper_name ? `: ${patch.shopper_name}` : ""}`
        : "Shopper unassigned",
      null
    );
  }

  if (driverId !== undefined) {
    await logRunEvent(
      runDbId,
      "assignment",
      driverId
        ? `Driver assigned${patch.driver_name ? `: ${patch.driver_name}` : ""}`
        : "Driver unassigned",
      null
    );
  }
}

export async function updateRunStatus(runDbId, fromStatus, toStatus, note = "") {
  if (!RUN_STATUSES.includes(fromStatus)) {
    throw new Error(`"${fromStatus}" is not a valid current status.`);
  }

  if (!RUN_STATUSES.includes(toStatus)) {
    throw new Error(`"${toStatus}" is not a valid status.`);
  }

  if (toStatus === fromStatus) return;

  const isForward = NEXT_STATUS[fromStatus] === toStatus;
  const isBackward = PREVIOUS_STATUS[fromStatus] === toStatus;
  const isCancellation =
    toStatus === "Cancelled" &&
    !["Delivered", "Cancelled"].includes(fromStatus);

  if (!isForward && !isBackward && !isCancellation) {
    throw new Error(`Invalid status change: ${fromStatus} → ${toStatus}.`);
  }

  const { data, error } = await supabase
    .from("single_runs")
    .update({ status: toStatus })
    .eq("id", runDbId)
    .eq("status", fromStatus)
    .select("id, status")
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error(
      "This run changed before your update was saved. Refresh the board and try again."
    );
  }

  await logRunEvent(
    runDbId,
    "status",
    toStatus,
    note || null,
    fromStatus
  );
}

export async function logRunEvent(
  runDbId,
  eventType,
  toValue,
  note = null,
  fromValue = null,
  actorLabel = null
) {
  const { error } = await supabase.rpc("log_run_event", {
    p_run_id: runDbId,
    p_event_type: eventType,
    p_to_value: toValue || null,
    p_note: note || null,
    p_actor_label: actorLabel || null,
    p_from_value: fromValue || null,
  });

  if (error) throw error;
}

export async function setRunFlag(runDbId, flag, value, note = "") {
  if (!["receipt", "pod"].includes(flag)) {
    throw new Error("Invalid run upload flag.");
  }

  const column =
    flag === "receipt" ? "receipt_uploaded" : "pod_uploaded";

  const { data, error } = await supabase
    .from("single_runs")
    .update({ [column]: Boolean(value) })
    .eq("id", runDbId)
    .select("id")
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error("You don't have permission to update this run.");
  }

  await logRunEvent(
    runDbId,
    flag,
    value ? `${flag} uploaded` : `${flag} removed`,
    note || null
  );
}

export function buildOpsStats(runs = []) {
  const active = runs.filter(
    run => !["Delivered", "Cancelled"].includes(run.status)
  );

  const month = new Date().toISOString().slice(0, 7);

  return {
    total: runs.length,
    active: active.length,
    requested: runs.filter(
      run => run.status === "Requested"
    ).length,
    outForDelivery: runs.filter(
      run => run.status === "Out for Delivery"
    ).length,
    deliveredThisMonth: runs.filter(
      run =>
        run.status === "Delivered" &&
        run.date?.startsWith(month)
    ).length,
    unassigned: active.filter(
      run =>
        !run.assignedShopperId ||
        !run.assignedDriverId
    ).length,
  };
}
