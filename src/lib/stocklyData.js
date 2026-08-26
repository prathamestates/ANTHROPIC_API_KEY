import { supabase } from "../supabaseClient";

/* ---------------------------------------------------------------------
   STOCKLY DATA LAYER — Phase 3
   Real persistence for Single Runs, Recurring Runs, and Business Profile,
   backed by the tables in supabase/schema.sql (single_runs, recurring_runs,
   run_items, profiles). Everything here is scoped to the logged-in
   customer via Supabase's row-level security — a customer can only ever
   read/write rows where customer_id = auth.uid().
--------------------------------------------------------------------- */

// A short, human-friendly run number derived from the row's real uuid —
// avoids needing a separate sequence/column just to show "STK-XXXXXX".
function displayRunNumber(id) {
  return "STK-" + id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

function mapSingleRun(run, items) {
  return {
    dbId: run.id,
    id: displayRunNumber(run.id),
    type: "single",
    date: run.scheduled_for || (run.created_at ? run.created_at.slice(0, 10) : ""),
    cashAndCarry: run.cash_and_carry || "",
    address: run.delivery_address || "",
    status: run.status,
    shopper: run.shopper_name || "",
    driver: run.driver_name || "",
    items: (items || []).map(mapRunItem),
    serviceFee: Number(run.service_fee) || 0,
    supplierTotal: Number(run.supplier_total) || 0,
    receiptUploaded: !!run.receipt_uploaded,
    podUploaded: !!run.pod_uploaded,
    substitution: run.substitution || null,
    notes: run.notes || "",
    discountApplied: run.discount_applied || null,
    discountAmount: Number(run.discount_amount) || 0,
    createdAt: run.created_at,
  };
}

function mapRecurringRun(run, items) {
  return {
    dbId: run.id,
    id: run.id,
    name: run.name,
    frequency: run.frequency,
    day: run.day_of_week ? `Every ${run.day_of_week}` : (run.frequency || ""),
    cashAndCarry: run.cash_and_carry || "",
    active: !!run.active,
    items: (items || []).map(mapRunItem),
  };
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

// Fetches every single_run for a customer plus their line items in two
// queries (avoids an N+1 query per run) and groups items back onto runs.
export async function fetchSingleRuns(customerId) {
  const { data: runs, error: runsErr } = await supabase
    .from("single_runs")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (runsErr) throw runsErr;
  if (!runs || runs.length === 0) return [];

  const { data: items, error: itemsErr } = await supabase
    .from("run_items")
    .select("*")
    .eq("run_type", "single")
    .in("run_id", runs.map(r => r.id));
  if (itemsErr) throw itemsErr;

  return runs.map(r => mapSingleRun(r, (items || []).filter(i => i.run_id === r.id)));
}

export async function fetchRecurringRuns(customerId) {
  const { data: runs, error: runsErr } = await supabase
    .from("recurring_runs")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (runsErr) throw runsErr;
  if (!runs || runs.length === 0) return [];

  const { data: items, error: itemsErr } = await supabase
    .from("run_items")
    .select("*")
    .eq("run_type", "recurring")
    .in("run_id", runs.map(r => r.id));
  if (itemsErr) throw itemsErr;

  return runs.map(r => mapRecurringRun(r, (items || []).filter(i => i.run_id === r.id)));
}

// Creates a single run + its line items, then returns the same
// UI-shaped object the dashboard already knows how to render.
export async function createSingleRun(customerId, { cashAndCarry, deliveryAddress, scheduledFor, notes, serviceFee, discountApplied, discountAmount }, items) {
  const { data: run, error: runErr } = await supabase
    .from("single_runs")
    .insert({
      customer_id: customerId,
      status: "Requested",
      cash_and_carry: cashAndCarry,
      delivery_address: deliveryAddress,
      scheduled_for: scheduledFor || null,
      notes: notes || "",
      service_fee: serviceFee || 0,
      supplier_total: 0,
      discount_applied: discountApplied || null,
      discount_amount: discountAmount || 0,
    })
    .select("*")
    .single();
  if (runErr) throw runErr;

  if (items && items.length) {
    const { error: itemsErr } = await supabase.from("run_items").insert(
      items.map(it => ({
        run_type: "single",
        run_id: run.id,
        product: it.product,
        brand: it.brand || null,
        qty: it.qty || 1,
        unit: it.unit || "Units",
        notes: it.notes || null,
        barcode: it.barcode || null,
        category: it.category || null,
        image_url: it.imageUrl || null,
      }))
    );
    if (itemsErr) throw itemsErr;
  }

  return mapSingleRun(run, items.map(it => ({ ...it, image_url: it.imageUrl })));
}

export async function createRecurringRun(customerId, { name, frequency, dayOfWeek, cashAndCarry }, items) {
  const { data: run, error: runErr } = await supabase
    .from("recurring_runs")
    .insert({
      customer_id: customerId,
      name,
      frequency,
      day_of_week: dayOfWeek || null,
      cash_and_carry: cashAndCarry || null,
      active: true,
    })
    .select("*")
    .single();
  if (runErr) throw runErr;

  if (items && items.length) {
    const { error: itemsErr } = await supabase.from("run_items").insert(
      items.map(it => ({
        run_type: "recurring",
        run_id: run.id,
        product: it.product,
        brand: it.brand || null,
        qty: it.qty || 1,
        unit: it.unit || "Units",
      }))
    );
    if (itemsErr) throw itemsErr;
  }

  return mapRecurringRun(run, items);
}

export async function setRecurringRunActive(dbId, active) {
  const { error } = await supabase.from("recurring_runs").update({ active }).eq("id", dbId);
  if (error) throw error;
}

// Substitution decisions are stored as jsonb on the run row itself.
export async function resolveSubstitution(dbId, resolved, currentSubstitution) {
  const { error } = await supabase
    .from("single_runs")
    .update({ substitution: { ...currentSubstitution, resolved } })
    .eq("id", dbId);
  if (error) throw error;
}

export async function updateProfile(id, patch) {
  const { data, error } = await supabase.from("profiles").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function regenerateLoginWord(id) {
  const words = ["BLUE", "RED", "GOLD", "SILVER", "GREEN", "SWIFT", "BRAVE", "QUICK"];
  const animals = ["TIGER", "FALCON", "OTTER", "HERON", "LYNX", "RAVEN", "WOLF", "HAWK"];
  const word = `${words[Math.floor(Math.random() * words.length)]}-${animals[Math.floor(Math.random() * animals.length)]}-${Math.floor(100 + Math.random() * 900)}`;
  return updateProfile(id, { login_word: word });
}

/* -----------------------------------------------------------------
   SAVED SHOPPING LISTS (Stage 8)
----------------------------------------------------------------- */
export async function fetchSavedLists(customerId) {
  const { data, error } = await supabase
    .from("saved_lists")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createSavedList(customerId, name, items) {
  const { data, error } = await supabase
    .from("saved_lists")
    .insert({ customer_id: customerId, name, items })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSavedList(id) {
  const { error } = await supabase.from("saved_lists").delete().eq("id", id);
  if (error) throw error;
}

/* -----------------------------------------------------------------
   BUY AGAIN / PRODUCT HISTORY (Stage 7)
   Derived entirely from single-run history already fetched for this
   customer — no separate table needed for a first version of this.
----------------------------------------------------------------- */
export function buildProductHistory(singleRuns) {
  const byProduct = new Map();
  for (const run of singleRuns) {
    for (const item of run.items) {
      const key = `${item.product.trim().toLowerCase()}|${(item.brand || "").trim().toLowerCase()}`;
      const existing = byProduct.get(key);
      if (existing) {
        existing.timesOrdered += 1;
        if (run.createdAt && (!existing.lastOrdered || run.createdAt > existing.lastOrdered)) {
          existing.lastOrdered = run.createdAt;
        }
      } else {
        byProduct.set(key, {
          product: item.product, brand: item.brand, unit: item.unit,
          timesOrdered: 1, lastOrdered: run.createdAt || null,
        });
      }
    }
  }
  return [...byProduct.values()].sort((a, b) => b.timesOrdered - a.timesOrdered);
}
