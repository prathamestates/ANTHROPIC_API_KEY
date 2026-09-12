import React, { useState, useMemo, useEffect } from "react";
import {
  Package, Truck, MapPin, Clock, CheckCircle2, Circle, Users, ChevronRight, ChevronLeft, X, Menu, ArrowRight,
  ShieldCheck, Zap, Building2, RotateCcw, Plus, Trash2, Bell, LogOut, Sparkles,
  AlertCircle, Upload, Navigation, Store, Coffee, Wine, Scissors, UtensilsCrossed,
  ClipboardList, Settings, User, Lock, Mail, Phone, ArrowUpRight,
  PauseCircle, PlayCircle, FileText, PackageCheck,
  Gift, Copy, Loader2, Download,
  ShieldAlert, LayoutDashboard, HelpCircle, Banknote
} from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "./supabaseClient";
import {
  fetchSingleRuns, fetchRecurringRuns, createSingleRun, createRecurringRun,
  setRecurringRunActive, resolveSubstitution, updateProfile, regenerateLoginWord,
  fetchSavedLists, createSavedList, deleteSavedList, buildProductHistory,
} from "./lib/stocklyData";
import {
  RUN_STATUSES, fetchAllRuns, fetchMyAssignedRuns, fetchOpsTeam,
  assignRun, updateRunStatus, setRunFlag, buildOpsStats,
} from "./lib/stocklyOpsData";

/* ---------------------------------------------------------------------
   BUSINESS CONFIG — edit these to update contact details / admin access
--------------------------------------------------------------------- */
const OWNER_EMAIL = "prathamparmar849@gmail.com";
const OWNER_PHONE_DISPLAY = "+44 7951 780857";
const OWNER_PHONE_TEL = "+447951780857";

/* ---------------------------------------------------------------------
   PERSISTENT STORAGE HELPERS (localStorage — survives refresh/reopen)
--------------------------------------------------------------------- */
// The original version of this file used the Claude-artifact-only
// `window.storage` API, which doesn't exist outside claude.ai. For a
// standalone deploy (e.g. Netlify) this uses the browser's localStorage
// instead, namespaced under "stockly:" keys.
function storageKey(key, shared) {
  return `stockly:${shared ? "shared" : "local"}:${key}`;
}
async function storageGet(key, shared = false) {
  try {
    const raw = window.localStorage.getItem(storageKey(key, shared));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
async function storageSet(key, value, shared = false) {
  try {
    window.localStorage.setItem(storageKey(key, shared), JSON.stringify(value));
    return true;
  } catch (e) { return false; }
}
function genId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

/* Records a new signup / order / waitlist submission into local storage so
   it appears on this device's owner feed, and builds a ready-to-send
   WhatsApp message for the owner. WhatsApp's "click to chat" link opens
   WhatsApp with the message pre-filled — the closest free equivalent to a
   real notification until a messaging API is wired up. */
async function notifyOwner({ type, subject, lines }) {
  const notifId = genId("NOTE");
  const record = { id: notifId, type, subject, lines, createdAt: new Date().toISOString(), read: false };
  const existing = (await storageGet("owner-notifications", true)) || [];
  await storageSet("owner-notifications", [record, ...existing].slice(0, 300), true);

  const bodyLines = lines.map(([k, v]) => `${k}: ${v}`).join("\n");
  const fullBody = `${subject}\n\n${bodyLines}`;
  const whatsappNumber = OWNER_PHONE_TEL.replace(/[^0-9]/g, ""); // wa.me needs digits only, no +
  const whatsapp = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(fullBody)}`;

  return { notifId, whatsapp };
}

/* ---------------------------------------------------------------------
   FONTS + BASE STYLE
--------------------------------------------------------------------- */
const FontStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&display=swap');
    .font-display { font-family: 'Space Grotesk', sans-serif; letter-spacing: -0.02em; }
    .font-body { font-family: 'Inter', sans-serif; }
    * { font-family: 'Inter', sans-serif; }
    h1,h2,h3,h4, .font-display { font-family: 'Space Grotesk', sans-serif; }
    .stockly-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
    .stockly-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
    @keyframes stk-pulse { 0%,100% { opacity:1; } 50% { opacity:.45; } }
    .stk-pulse { animation: stk-pulse 1.8s ease-in-out infinite; }
    @keyframes stk-fade-up { from { opacity:0; transform: translateY(10px);} to {opacity:1; transform:translateY(0);} }
    .stk-fade-up { animation: stk-fade-up .5s ease both; }
    :focus-visible { outline: 2px solid #65a30d; outline-offset: 2px; border-radius: 6px; }
    button { cursor: pointer; }
    button:disabled { cursor: not-allowed; }
  `}</style>
);

/* ---------------------------------------------------------------------
   SERVICE DATA
--------------------------------------------------------------------- */
const SERVICE_AREAS = [
  { code: "E1", name: "Whitechapel & Shoreditch" },
  { code: "E2", name: "Bethnal Green" },
  { code: "E3", name: "Bow" },
  { code: "E4", name: "Chingford" },
  { code: "E5", name: "Clapton" },
  { code: "E6", name: "East Ham" },
  { code: "E7", name: "Forest Gate" },
  { code: "E8", name: "Hackney" },
  { code: "E9", name: "Homerton" },
  { code: "E10", name: "Leyton" },
  { code: "E11", name: "Leytonstone" },
  { code: "E12", name: "Manor Park" },
  { code: "E13", name: "Plaistow" },
  { code: "E14", name: "Poplar & Canary Wharf" },
  { code: "E15", name: "Stratford" },
  { code: "E16", name: "Canning Town & Royal Docks" },
  { code: "E17", name: "Walthamstow" },
  { code: "E18", name: "South Woodford" },
  { code: "E20", name: "Olympic Park" },
  { code: "IG1", name: "Ilford" },
  { code: "IG2", name: "Newbury Park" },
  { code: "IG3", name: "Seven Kings & Goodmayes" },
  { code: "IG4", name: "Redbridge" },
  { code: "IG5", name: "Clayhall" },
  { code: "IG6", name: "Barkingside" },
  { code: "IG7", name: "Chigwell" },
  { code: "IG8", name: "Woodford Green" },
  { code: "IG11", name: "Barking" },
  { code: "RM1", name: "Romford" },
  { code: "RM6", name: "Chadwell Heath" },
  { code: "RM8", name: "Dagenham" },
  { code: "RM9", name: "Dagenham (South)" },
  { code: "RM10", name: "Dagenham (Central)" },
];

const CASH_AND_CARRIES = [
  "Bestway Hackney Wick",
  "Bestway Ilford",
  "Booker Bow",
  "Booker Ilford",
  "JJ Foodservice Enfield",
  "Costco Beckton",
  "Dhamecha Barking",
  "Dhamecha Alperton",
  "Today's Cash & Carry Ilford",
  "Freshways Seven Kings",
  "Other / specify",
];

/* ---------------------------------------------------------------------
   STOCKLY FEE PRICING ENGINE
   This is the Stockly *service* fee for finding, buying, and running the
   stock — separate from the price of the products themselves, which the
   business pays the cash & carry directly (see PAYMENT_NOTE below).
--------------------------------------------------------------------- */
const PRICING_CONFIG = {
  MIN_FEE: 10,
  MAX_FEE: 50,
  BASE_FEE: 10,           // starting fee, covers a small simple run
  FREE_ITEM_LINES: 3,     // this many distinct products included in the base fee
  PER_ITEM_LINE: 1.5,     // extra £ per distinct product past the free amount
  FREE_UNITS: 10,         // this many total units (summed quantities) included in the base fee
  PER_UNIT: 0.4,          // extra £ per unit past the free amount
  URGENCY_SURCHARGE: 10,  // added for "as soon as possible" scheduling
  ROUND_TO: 1,            // round the final fee to the nearest £1
};

// First-run and referral incentives — both genuinely applied to the fee.
const FIRST_RUN_DISCOUNT_PERCENT = 20; // % off a brand-new customer's first run
const REFERRAL_REWARD_AMOUNT = 5;      // £ credited to the referrer once the person they referred completes their first run

/** Transparent Stockly service-fee calculation. Always returns a number
 * between PRICING_CONFIG.MIN_FEE and MAX_FEE, plus any opted-in extras. */
function calculateRunFee({ itemCount = 0, totalUnits = 0, urgent = false, extrasTotal = 0 }) {
  const c = PRICING_CONFIG;
  const lineSurcharge = Math.max(0, itemCount - c.FREE_ITEM_LINES) * c.PER_ITEM_LINE;
  const unitSurcharge = Math.max(0, totalUnits - c.FREE_UNITS) * c.PER_UNIT;
  const raw = c.BASE_FEE + lineSurcharge + unitSurcharge + (urgent ? c.URGENCY_SURCHARGE : 0);
  const clamped = Math.min(c.MAX_FEE, Math.max(c.MIN_FEE, raw));
  const rounded = Math.round(clamped / c.ROUND_TO) * c.ROUND_TO;
  return rounded + extrasTotal; // extras are separate opt-ins, added after clamping
}

// Shown wherever a price appears, so it's always clear this is Stockly's
// own fee for the service — not a charge for the products, and not
// taken online.
const PAYMENT_NOTE = "Stockly doesn't take payment online. You pay the cash & carry and the Stockly team directly — by cash or card — when your order is collected or delivered.";

const MEMBERSHIP_PLANS = [
  { id: "none", name: "No membership", price: 0, blurb: "Pay per stock run, no commitment." },
  { id: "essential", name: "Essential", price: 99, blurb: "1 scheduled run a week, standard support." },
  { id: "business", name: "Business", price: 149, blurb: "2 scheduled runs a week, priority scheduling, recurring orders." },
  { id: "pro", name: "Pro", price: 219, blurb: "3 runs a week, multiple locations, priority support & fastest delivery slots." },
];

const CHECKOUT_EXTRAS = [
  { id: "priority", name: "Priority collection", price: 15, blurb: "Move to the front of the shopper queue today." },
  { id: "packaging", name: "Extra packaging & bagging", price: 6, blurb: "Careful boxing for fragile / bulk items." },
  { id: "weekend", name: "Weekend delivery slot", price: 12, blurb: "Saturday or Sunday delivery instead of a weekday." },
  { id: "insurance", name: "Goods protection cover", price: 8, blurb: "Extra cover for high-value or breakable stock." },
];

const BUSINESS_TYPES = [
  { label: "Takeaway", icon: UtensilsCrossed },
  { label: "Restaurant", icon: UtensilsCrossed },
  { label: "Café", icon: Coffee },
  { label: "Convenience Store", icon: Store },
  { label: "Off-Licence", icon: Wine },
  { label: "Caterer", icon: ClipboardList },
  { label: "Salon", icon: Sparkles },
  { label: "Barber", icon: Scissors },
  { label: "Independent Retailer", icon: Building2 },
];

const STATUS_FLOW = ["Requested", "Confirmed", "Purchasing", "Collected", "Out for Delivery", "Delivered"];

/* No demo/seed operational data — every dashboard reads real Supabase rows. */

/* ---------------------------------------------------------------------
   SHARED UI PRIMITIVES + HELPERS
--------------------------------------------------------------------- */
function checkPostcode(raw) {
  const clean = raw.replace(/\s+/g, "").toUpperCase();
  const match = clean.match(/^[A-Z]{1,2}[0-9]{1,2}/);
  if (!match) return { valid: false, found: null };
  const outward = match[0];
  const found = SERVICE_AREAS.find(a => outward.startsWith(a.code));
  return { valid: !!found, found };
}

function StatusPill({ status }) {
  const styles = {
    "New": "bg-slate-100 text-slate-600 border-slate-200",
    "Requested": "bg-slate-100 text-slate-600 border-slate-200",
    "Confirmed": "bg-sky-50 text-sky-700 border-sky-200",
    "Purchasing": "bg-amber-50 text-amber-700 border-amber-200",
    "Collected": "bg-violet-50 text-violet-700 border-violet-200",
    "Out for Delivery": "bg-orange-50 text-orange-700 border-orange-200",
    "Delivered": "bg-lime-50 text-lime-700 border-lime-300",
    "Cancelled": "bg-red-50 text-red-600 border-red-200",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${styles[status] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

/* Visual progress tracker along STATUS_FLOW. Horizontally scrollable on
   small screens so it never forces page overflow on a phone. */
function StatusTracker({ status }) {
  const idx = STATUS_FLOW.indexOf(status);
  if (idx === -1) return null;
  return (
    <div className="w-full overflow-x-auto stockly-scroll pb-1" aria-label={`Run progress: ${status}`}>
      <div className="flex items-center min-w-[460px]">
        {STATUS_FLOW.map((s, i) => (
          <React.Fragment key={s}>
            <div className="flex flex-col items-center flex-shrink-0" style={{ width: 64 }}>
              <div className={`w-3 h-3 rounded-full transition-colors duration-500 ${i <= idx ? "bg-lime-400" : "bg-slate-200"}`} />
              <span className={`text-[9px] mt-1.5 text-center leading-tight transition-colors duration-500 ${i <= idx ? "text-slate-700 font-semibold" : "text-slate-400"}`}>{s}</span>
            </div>
            {i < STATUS_FLOW.length - 1 && <div className={`h-0.5 flex-1 -mt-4 transition-colors duration-500 ${i < idx ? "bg-lime-400" : "bg-slate-200"}`} />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function Badge({ children, tone = "lime" }) {
  const tones = {
    lime: "bg-lime-300 text-slate-950",
    dark: "bg-slate-900 text-lime-300",
    outline: "bg-transparent text-slate-300 border border-slate-600",
    soft: "bg-slate-100 text-slate-700",
  };
  return <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

function StocklyMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#0B1120" />
      <path d="M9 15L20 9L31 15" stroke="#C6FF3D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 25L20 31L31 25" stroke="#C6FF3D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
      <circle cx="20" cy="20" r="2.6" fill="#C6FF3D" />
    </svg>
  );
}

function Logo({ dark = false, size = 32 }) {
  return (
    <div className="flex items-center gap-2.5">
      <StocklyMark size={size} />
      <span className={`font-display font-bold text-xl tracking-tight ${dark ? "text-white" : "text-slate-950"}`}>Stockly</span>
    </div>
  );
}

function Section({ children, className = "", id }) {
  return <section id={id} className={`px-6 md:px-10 lg:px-16 ${className}`}>{children}</section>;
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-6" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto stockly-scroll shadow-2xl stk-fade-up" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h3 className="font-display font-semibold text-lg text-slate-950">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

const inputCls = "w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-lime-300 focus:border-lime-400 transition";
const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5";
const btnPrimary = "inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-lime-300 text-slate-950 font-semibold text-sm hover:bg-lime-200 active:scale-[0.98] transition shadow-sm";
const btnDark = "inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-950 text-white font-semibold text-sm hover:bg-slate-800 active:scale-[0.98] transition";
const btnGhost = "inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 active:scale-[0.98] transition";

/* ---------------------------------------------------------------------
   ANIMATED PIPELINE (signature element)
--------------------------------------------------------------------- */
function PipelineAnimation({ compact = false }) {
  const stages = ["Order received", "Purchasing", "Collected", "Delivering", "Delivered"];
  const [active, setActive] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setActive(a => (a + 1) % stages.length), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className={`w-full ${compact ? "" : ""}`}>
      <div className="flex items-center w-full">
        {stages.map((s, i) => (
          <React.Fragment key={s}>
            <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
              <div className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-500 ${i <= active ? "bg-lime-300 border-lime-300" : "bg-transparent border-slate-600"} ${i === active ? "stk-pulse" : ""}`} />
              <span className={`text-[10px] sm:text-xs text-center leading-tight transition-colors duration-500 ${i <= active ? "text-white font-medium" : "text-slate-500"}`}>{s}</span>
            </div>
            {i < stages.length - 1 && (
              <div className="h-[2px] flex-1 -mt-5 bg-slate-700 relative overflow-hidden rounded-full">
                <div className="h-full bg-lime-300 transition-all duration-700 ease-out" style={{ width: i < active ? "100%" : i === active ? "50%" : "0%" }} />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   NAV
--------------------------------------------------------------------- */
function NavBar({ go, page, loggedIn, role }) {
  const [open, setOpen] = useState(false);
  const links = [
    { key: "how", label: "How it works", target: "home#how" },
    { key: "pricing", label: "Pricing", target: "pricing" },
    { key: "service-area", label: "East London", target: "service-area" },
    { key: "about", label: "About", target: "about" },
  ];
  const dashTarget = role === "admin" ? "admin" : role === "shopper" ? "shopper" : role === "driver" ? "driver" : "dashboard";
  const handle = (target) => {
    setOpen(false);
    if (target.includes("#")) {
      const [p, anchor] = target.split("#");
      go(p, { anchor });
    } else go(target);
  };
  return (
    <div className="sticky top-0 z-50 bg-slate-950/95 backdrop-blur border-b border-slate-800">
      <Section className="flex items-center justify-between h-16">
        <button onClick={() => go("home")} className="shrink-0" aria-label="Stockly home"><Logo dark size={30} /></button>
        <nav className="hidden lg:flex items-center gap-7" aria-label="Main navigation">
          {links.map(l => (
            <button key={l.key} onClick={() => handle(l.target)} className="text-sm font-medium text-slate-300 hover:text-white transition">{l.label}</button>
          ))}
        </nav>
        <div className="hidden lg:flex items-center gap-3">
          {loggedIn ? (
            <button onClick={() => go(dashTarget)} className={btnGhost + " !border-slate-600 !text-slate-200 hover:!bg-slate-900"}>
              <User size={16} /> Dashboard
            </button>
          ) : (
            <button onClick={() => go("login")} className="text-sm font-medium text-slate-300 hover:text-white transition">Log in</button>
          )}
          <button onClick={() => go("book")} className={btnPrimary}>Book a Stock Run</button>
        </div>
        <button className="lg:hidden text-white p-2" onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>{open ? <X size={24} /> : <Menu size={24} />}</button>
      </Section>
      {open && (
        <div className="lg:hidden border-t border-slate-800 px-6 py-4 flex flex-col gap-1 bg-slate-950">
          {links.map(l => (
            <button key={l.key} onClick={() => handle(l.target)} className="text-left text-sm font-medium text-slate-300 py-2">{l.label}</button>
          ))}
          <button onClick={() => handle(loggedIn ? dashTarget : "login")} className="text-left text-sm font-medium text-slate-300 py-2">{loggedIn ? "Dashboard" : "Log in"}</button>
          <button onClick={() => handle("book")} className={btnPrimary + " mt-3"}>Book a Stock Run</button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   FOOTER
--------------------------------------------------------------------- */
function Footer({ go, openLegal }) {
  return (
    <footer className="bg-slate-950 text-slate-400 pt-16 pb-8 border-t border-slate-900">
      <Section>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 pb-12 border-b border-slate-900">
          <div className="col-span-2">
            <Logo dark size={30} />
            <p className="text-sm text-slate-500 mt-4 max-w-xs leading-relaxed">You run the business. We handle the stock run. Currently serving East London, including Ilford & Seven Kings.</p>
            <div className="mt-4"><Badge tone="dark">Currently serving East London</Badge></div>
            <a href={`tel:${OWNER_PHONE_TEL}`} className="flex items-center gap-2 text-sm text-slate-300 hover:text-white mt-4"><Phone size={14} /> {OWNER_PHONE_DISPLAY}</a>
          </div>
          <div>
            <h4 className="text-white text-sm font-semibold mb-3">Product</h4>
            <ul className="space-y-2 text-sm">
              <li><button onClick={() => go("book")} className="hover:text-white">Book a Stock Run</button></li>
              <li><button onClick={() => go("pricing")} className="hover:text-white">Pricing</button></li>
              <li><button onClick={() => go("service-area")} className="hover:text-white">Service area</button></li>
              <li><button onClick={() => go("home", { anchor: "faq" })} className="hover:text-white">FAQ</button></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white text-sm font-semibold mb-3">Company</h4>
            <ul className="space-y-2 text-sm">
              <li><button onClick={() => go("about")} className="hover:text-white">About Stockly</button></li>
              <li><button onClick={() => go("service-area", { anchor: "waitlist" })} className="hover:text-white">Join the waitlist</button></li>
              <li><button onClick={() => go("login")} className="hover:text-white">Log in</button></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white text-sm font-semibold mb-3">Legal</h4>
            <ul className="space-y-2 text-sm">
              {["Terms & Conditions", "Privacy Policy", "Service Terms", "Cancellation Policy", "Refund Policy", "Business Customer Agreement"].map(t => (
                <li key={t}><button onClick={() => openLegal(t)} className="hover:text-white text-left">{t}</button></li>
              ))}
            </ul>
          </div>
        </div>
        <div className="pt-6 text-xs text-slate-600 flex flex-col sm:flex-row justify-between gap-2">
          <span>© 2026 Stockly. Currently operating in selected East London areas only.</span>
          <span>Early-stage service · Not yet a registered company</span>
        </div>
      </Section>
    </footer>
  );
}

/* ---------------------------------------------------------------------
   POSTCODE CHECKER
--------------------------------------------------------------------- */
function PostcodeChecker({ dark = false, onJoinWaitlist }) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState(null);
  const submit = (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    setResult(checkPostcode(value));
  };
  return (
    <div className={`rounded-2xl p-5 sm:p-6 ${dark ? "bg-slate-900 border border-slate-800" : "bg-white border border-slate-200"}`}>
      <div className="flex items-center gap-2 mb-3">
        <MapPin size={18} className={dark ? "text-lime-300" : "text-slate-950"} />
        <h3 className={`font-display font-semibold ${dark ? "text-white" : "text-slate-950"}`}>Check East London availability</h3>
      </div>
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2.5">
        <label htmlFor="pc-check" className="sr-only">Postcode</label>
        <input id="pc-check" value={value} onChange={e => setValue(e.target.value)} placeholder="Enter your postcode, e.g. E8 3RH"
          className={`flex-1 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-lime-300 ${dark ? "bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500" : "bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400"}`} />
        <button type="submit" className={btnPrimary}>Check</button>
      </form>
      {result && (
        <div className={`mt-4 rounded-xl px-4 py-3 text-sm flex items-start gap-2.5 stk-fade-up ${result.valid ? "bg-lime-50 text-lime-800 border border-lime-200" : "bg-amber-50 text-amber-800 border border-amber-200"}`}>
          {result.valid ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <AlertCircle size={18} className="mt-0.5 shrink-0" />}
          <div>
            {result.valid ? (
              <span>Good news — Stockly currently serves <strong>{result.found.name} ({result.found.code})</strong>.</span>
            ) : (
              <div>
                <p>We're not in your area yet. Join the waitlist and we'll let you know when Stockly launches near you.</p>
                {onJoinWaitlist && <button onClick={onJoinWaitlist} className="mt-2 text-amber-900 font-semibold underline underline-offset-2">Join the waitlist →</button>}
              </div>
            )}
          </div>
        </div>
      )}
      <p className={`text-xs mt-3 ${dark ? "text-slate-500" : "text-slate-400"}`}>Serving: {SERVICE_AREAS.map(a => a.code).join(", ")}</p>
    </div>
  );
}

/* ---------------------------------------------------------------------
   HOMEPAGE
--------------------------------------------------------------------- */
function WeeklyDealsSection() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("weekly_deals")
        .select("*")
        .order("week_start", { ascending: false });
      if (!cancelled) {
        setRows(data || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Keep only the most recent image per supplier, so old weeks don't pile up.
  const latestPerSupplier = {};
  rows.forEach(r => {
    if (!latestPerSupplier[r.supplier_name]) latestPerSupplier[r.supplier_name] = r;
  });
  const deals = Object.values(latestPerSupplier);

  if (loading) return null;
  if (deals.length === 0) return null; // Section only appears once real deal images are added.

  return (
    <Section id="deals" className="py-20 bg-white scroll-mt-16">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <Badge tone="soft">This week's deals</Badge>
        <h2 className="font-display font-bold text-3xl text-slate-950 mt-4">Latest deals, by cash & carry</h2>
        <p className="text-slate-500 mt-3">Updated weekly so you know where to send your stock run.</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {deals.map((d, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-md transition">
            <img src={d.image_url} alt={`${d.supplier_name} weekly deals`} className="w-full h-48 object-cover bg-slate-100" loading="lazy" />
            <div className="p-4">
              <p className="font-semibold text-slate-900">{d.supplier_name}</p>
              {d.caption && <p className="text-xs text-slate-500 mt-1">{d.caption}</p>}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function TestimonialsSection() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("testimonials")
        .select("*")
        .order("created_at", { ascending: false });
      if (!cancelled) {
        setRows(data || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return null;
  if (rows.length === 0) return null; // Hidden entirely until real testimonials exist — never shows placeholder/fake quotes.

  return (
    <Section className="py-20 bg-slate-50">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <Badge tone="soft">What customers say</Badge>
        <h2 className="font-display font-bold text-3xl text-slate-950 mt-4">Real businesses, real runs.</h2>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {rows.map((t) => (
          <div key={t.id} className="bg-white border border-slate-200 rounded-2xl p-6">
            <p className="text-slate-700 leading-relaxed">"{t.quote}"</p>
            <p className="font-semibold text-slate-900 text-sm mt-4">{t.customer_name}</p>
            {t.business_name && <p className="text-xs text-slate-500">{t.business_name}</p>}
          </div>
        ))}
      </div>
    </Section>
  );
}

function Home({ go, openLegal, anchor }) {
  const [faqOpen, setFaqOpen] = useState(0);
  useEffect(() => {
    if (anchor) {
      const el = document.getElementById(anchor);
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
  }, [anchor]);

  const faqs = [
    { q: "What does Stockly actually do?", a: "We collect your requested stock from your chosen cash and carry and deliver it to your business." },
    { q: "Do I pay Stockly for the products?", a: "No. Product costs are separate. You pay the supplier directly." },
    { q: "What does Stockly charge for?", a: "Stockly charges for purchasing, collection, transport and delivery." },
    { q: "Do I need a subscription?", a: "No. You can book individual stock runs whenever you need them." },
    { q: "Where does Stockly operate?", a: "Stockly currently operates in selected East London areas." },
    { q: "Can I order the same stock every week?", a: "Yes. Recurring stock runs are supported and can be edited or paused any time." },
    { q: "What if something is unavailable?", a: "Stockly can contact you with a proposed substitution before making any material change." },
    { q: "Can I use my own cash and carry?", a: "Yes, subject to Stockly being able to service that supplier and location." },
  ];

  return (
    <div>
      {/* HERO */}
      <div className="bg-slate-950 relative overflow-hidden">
        <Section className="pt-16 pb-24 grid lg:grid-cols-2 gap-14 items-center relative z-10">
          <div>
            <Badge tone="dark">Currently serving East London</Badge>
            <h1 className="font-display font-bold text-white text-[2.6rem] sm:text-6xl leading-[1.05] mt-5">
              Your stock run. <span className="text-lime-300">Sorted.</span>
            </h1>
            <p className="text-slate-400 text-lg mt-5 max-w-md leading-relaxed">
              Send us your stock list. We collect it from your chosen cash and carry and deliver it directly to your business across East London.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mt-8">
              <button onClick={() => go("book")} className={btnPrimary + " !py-3.5 !px-6 text-base"}>Book a Stock Run <ArrowRight size={17} /></button>
              <button onClick={() => go("home", { anchor: "how" })} className={btnGhost + " !border-slate-700 !text-slate-200 hover:!bg-slate-900 !py-3.5 !px-6 text-base"}>See How It Works</button>
            </div>
            <p className="text-slate-600 text-xs mt-6">We collect your stock from the cash and carry and deliver it to your business.</p>
          </div>

          {/* Animated order card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">Tomorrow's Stock Run</p>
                <p className="text-white font-display font-semibold text-lg mt-0.5">12 products</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-lime-300/10 flex items-center justify-center">
                <Package className="text-lime-300" size={20} />
              </div>
            </div>
            <div className="space-y-2.5 mb-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Cash & Carry</span>
                <span className="text-slate-200 font-medium">Customer selected</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Delivery</span>
                <span className="text-slate-200 font-medium">East London</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Service fee</span>
                <span className="text-lime-300 font-semibold">£10–£50</span>
              </div>
            </div>
            <div className="border-t border-slate-800 pt-5">
              <PipelineAnimation />
            </div>
          </div>
        </Section>
      </div>

      {/* VALUE PROPS */}
      <Section className="py-20 bg-white">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Clock, title: "Save Time", body: "Stop leaving your business to spend hours restocking at the cash and carry." },
            { icon: ShieldCheck, title: "Stay In Control", body: "Choose the cash and carry and the exact products you want, every time." },
            { icon: Truck, title: "We Handle The Run", body: "We collect, transport and deliver your stock, start to finish." },
          ].map((c, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 p-8 hover:border-slate-300 hover:shadow-md transition">
              <div className="w-11 h-11 rounded-xl bg-slate-950 flex items-center justify-center mb-5">
                <c.icon className="text-lime-300" size={20} />
              </div>
              <h3 className="font-display font-semibold text-xl text-slate-950 mb-2">{c.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{c.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* HOW IT WORKS */}
      <Section id="how" className="py-20 bg-slate-50 scroll-mt-16">
        <div className="max-w-2xl mb-12">
          <Badge tone="soft">How it works</Badge>
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-slate-950 mt-4">From stock list to delivery, in four steps.</h2>
        </div>
        <div className="grid md:grid-cols-4 gap-6 mb-12">
          {[
            { n: "01", title: "Send your list", body: "Products, quantities, brands, preferred cash and carry, delivery date and address." },
            { n: "02", title: "We shop", body: "A Stockly shopper goes to your chosen cash and carry and buys exactly what you need." },
            { n: "03", title: "You pay the supplier", body: "You pay the cash and carry directly, using the payment method they accept." },
            { n: "04", title: "We deliver", body: "We collect your products and deliver them straight to your business." },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-2xl p-6 border border-slate-200">
              <span className="font-display text-lime-500 font-bold text-sm">{s.n}</span>
              <h3 className="font-display font-semibold text-lg text-slate-950 mt-2 mb-2">{s.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="bg-slate-950 rounded-2xl p-8 overflow-x-auto stockly-scroll">
          <div className="min-w-[560px]"><PipelineAnimation /></div>
        </div>
        <p className="text-xs text-slate-400 mt-4 max-w-lg">Stockly does not finance your stock purchase — you pay the cash and carry directly for the products you order.</p>
      </Section>

      {/* WHO IT'S FOR */}
      <Section className="py-20 bg-white">
        <div className="max-w-2xl mb-10">
          <Badge tone="soft">Who it's for</Badge>
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-slate-950 mt-4">Built for independent businesses.</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {BUSINESS_TYPES.map((b, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-5 flex flex-col items-center text-center gap-3 hover:border-lime-300 hover:bg-lime-50/40 transition">
              <b.icon size={22} className="text-slate-700" />
              <span className="text-sm font-medium text-slate-800">{b.label}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* SINGLE VS MEMBERSHIP */}
      <Section className="py-20 bg-slate-50">
        <div className="max-w-2xl mb-10">
          <Badge tone="soft">Pricing</Badge>
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-slate-950 mt-4">Pay per run, or on a plan.</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-8">
            <h3 className="font-display font-semibold text-xl text-slate-950">Single Stock Run</h3>
            <p className="text-3xl font-display font-bold text-slate-950 mt-3">£10–£50</p>
            <p className="text-slate-500 text-sm mt-2">Perfect for businesses that only need occasional help. No subscription required — book one run at any time.</p>
            <button onClick={() => go("book")} className={btnDark + " mt-6 w-full sm:w-auto"}>Book a Stock Run</button>
          </div>
          <div className="bg-slate-950 rounded-2xl border border-slate-800 p-8">
            <h3 className="font-display font-semibold text-xl text-white">Stockly Plans</h3>
            <p className="text-3xl font-display font-bold text-white mt-3">From £99<span className="text-base font-medium text-slate-400">/month</span></p>
            <p className="text-slate-400 text-sm mt-2">For businesses that need regular, scheduled stock runs every week.</p>
            <button onClick={() => go("pricing")} className={btnPrimary + " mt-6 w-full sm:w-auto"}>Compare plans</button>
          </div>
        </div>
      </Section>

      {/* RECURRING */}
      <Section className="py-20 bg-white">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <Badge tone="soft">Recurring stock runs</Badge>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-slate-950 mt-4">Set it once. We run it every week.</h2>
            <p className="text-slate-500 mt-4 leading-relaxed">Save your weekly shopping list and choose a day. Edit quantities, pause or resume any time — no need to resubmit your list from scratch.</p>
            <ul className="mt-6 space-y-3 text-sm text-slate-700">
              {["Every Monday, Tuesday, Wednesday…", "Saved weekly stock list", "Edit or pause anytime"].map((t, i) => (
                <li key={i} className="flex items-center gap-2.5"><CheckCircle2 size={16} className="text-lime-500" /> {t}</li>
              ))}
            </ul>
          </div>
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-display font-semibold text-slate-950">Tuesday Takeaway Run</p>
                <p className="text-xs text-slate-500 mt-0.5">Every Tuesday · Bestway Hackney Wick</p>
              </div>
              <span className="text-xs font-semibold text-lime-700 bg-lime-100 px-2.5 py-1 rounded-full">Active</span>
            </div>
            <div className="space-y-2 text-sm text-slate-600 mb-5">
              <div className="flex justify-between"><span>Coca-Cola</span><span>10 cases</span></div>
              <div className="flex justify-between"><span>Pepsi</span><span>5 cases</span></div>
              <div className="flex justify-between"><span>Frozen Fries</span><span>4 boxes</span></div>
              <div className="flex justify-between"><span>Cooking Oil</span><span>3 x 10L</span></div>
            </div>
            <button onClick={() => go("signup")} className="text-sm font-semibold text-slate-950 flex items-center gap-1.5">Create an account to set this up <ArrowRight size={14} /></button>
          </div>
        </div>
      </Section>

      {/* AI STOCK ASSISTANT */}
      <Section className="py-20 bg-slate-950">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="text-lime-300" size={22} />
          <Badge tone="dark">Live now</Badge>
        </div>
        <h2 className="font-display font-bold text-3xl sm:text-4xl text-white max-w-2xl">Ask Stockly to prepare your run.</h2>
        <p className="text-slate-400 mt-4 max-w-xl leading-relaxed">Type something like "same as last time but add 5 cases of Coke" while creating a run — Stockly checks your real past orders and drafts the list for you to review. It never invents an order it doesn't actually have on record.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
          {["Reference your real past orders", "Add or adjust items by request", "Always shown as an editable draft", "Honest when it can't find a match"].map((f, i) => (
            <div key={i} className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">{f}</div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-6">More assistant capabilities — reminders, spending summaries, recurring-run management — are planned but not built yet.</p>
      </Section>

      {/* SERVICE AREA */}
      <Section className="py-20 bg-white">
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          <div>
            <Badge tone="soft">East London launch</Badge>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-slate-950 mt-4">Currently serving East London.</h2>
            <p className="text-slate-500 mt-4 leading-relaxed">Stockly is starting in selected East London postcodes. More areas will be added as we grow — check yours below.</p>
            <div className="flex flex-wrap gap-2 mt-6">
              {SERVICE_AREAS.map(a => (
                <span key={a.code} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-slate-100 text-slate-700">{a.code} — {a.name}</span>
              ))}
            </div>
          </div>
          <PostcodeChecker onJoinWaitlist={() => go("service-area", { anchor: "waitlist" })} />
        </div>
      </Section>

      {/* WEEKLY DEALS */}
      <WeeklyDealsSection />

      {/* TESTIMONIALS */}
      <TestimonialsSection />

      {/* FAQ */}
      <Section id="faq" className="py-20 bg-slate-50 scroll-mt-16">
        <div className="max-w-2xl mb-10">
          <Badge tone="soft">FAQ</Badge>
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-slate-950 mt-4">Questions, answered.</h2>
        </div>
        <div className="max-w-3xl divide-y divide-slate-200 border-t border-b border-slate-200">
          {faqs.map((f, i) => (
            <div key={i}>
              <button onClick={() => setFaqOpen(faqOpen === i ? -1 : i)} className="w-full flex items-center justify-between py-5 text-left gap-4" aria-expanded={faqOpen === i}>
                <span className="font-medium text-slate-900">{f.q}</span>
                <ChevronRight size={18} className={`text-slate-400 transition-transform shrink-0 ${faqOpen === i ? "rotate-90" : ""}`} />
              </button>
              {faqOpen === i && <p className="text-slate-500 text-sm pb-5 leading-relaxed pr-8 stk-fade-up">{f.a}</p>}
            </div>
          ))}
        </div>
      </Section>

      {/* FINAL CTA */}
      <Section className="py-20 bg-slate-950">
        <div className="rounded-3xl bg-slate-900 border border-slate-800 px-8 py-14 text-center">
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-white">Ready to get your time back?</h2>
          <p className="text-slate-400 mt-3 max-w-md mx-auto">Book your first stock run today, or speak to us about a Stockly plan.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
            <button onClick={() => go("book")} className={btnPrimary + " !py-3.5 !px-7 text-base"}>Book a Stock Run</button>
            <button onClick={() => go("pricing")} className={btnGhost + " !border-slate-700 !text-slate-200 hover:!bg-slate-800 !py-3.5 !px-7 text-base"}>View pricing</button>
          </div>
        </div>
      </Section>
    </div>
  );
}

/* ---------------------------------------------------------------------
   PRICING PAGE
--------------------------------------------------------------------- */
function Pricing({ go }) {
  const [tab, setTab] = useState("single");
  const [waitlistPlan, setWaitlistPlan] = useState(null); // the plan object currently being joined, or null
  const [wlForm, setWlForm] = useState({ name: "", business: "", email: "", phone: "" });
  const [wlBusy, setWlBusy] = useState(false);
  const [wlError, setWlError] = useState("");
  const [wlDone, setWlDone] = useState(false);

  const submitWaitlist = async (e) => {
    e.preventDefault();
    setWlError("");
    if (!wlForm.name.trim() || !wlForm.email.trim()) { setWlError("Name and email are required."); return; }
    setWlBusy(true);
    const { whatsapp } = await notifyOwner({
      type: "membership_waitlist",
      subject: `Membership waitlist — ${waitlistPlan.name} — ${wlForm.business || wlForm.name}`,
      lines: [
        ["Plan", `${waitlistPlan.name} (£${waitlistPlan.price}/month proposed)`],
        ["Name", wlForm.name], ["Business", wlForm.business || "—"],
        ["Email", wlForm.email], ["Phone", wlForm.phone || "—"],
      ],
    });
    window.open(whatsapp, "_blank");
    setWlBusy(false);
    setWlDone(true);
  };

  const plans = [
    { name: "Essential", price: 99, features: ["1 scheduled stock run per week", "Order management", "Delivery", "Receipt confirmation", "Customer support"] },
    { name: "Business", price: 149, features: ["2 scheduled stock runs per week", "Priority scheduling", "Recurring orders", "Order history", "Receipt management", "Customer support"], featured: true },
    { name: "Pro", price: 219, features: ["3 scheduled stock runs per week", "Priority service", "Multiple locations", "Recurring orders", "Spending dashboard", "Priority support"] },
  ];
  return (
    <div className="bg-white">
      {waitlistPlan && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={() => { setWaitlistPlan(null); setWlDone(false); }}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-6 sm:p-8" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Join the ${waitlistPlan.name} waitlist`}>
            {wlDone ? (
              <div className="text-center py-6">
                <CheckCircle2 size={40} className="text-lime-500 mx-auto" />
                <h3 className="font-display font-bold text-xl text-slate-950 mt-4">You're on the list!</h3>
                <p className="text-slate-500 text-sm mt-2">Membership billing isn't live yet — we'll reach out to {wlForm.email} to set up {waitlistPlan.name} as soon as it's ready.</p>
                <button onClick={() => { setWaitlistPlan(null); setWlDone(false); setWlForm({ name: "", business: "", email: "", phone: "" }); }} className={btnDark + " w-full mt-6"}>Close</button>
              </div>
            ) : (
              <>
                <h3 className="font-display font-bold text-xl text-slate-950">Join the {waitlistPlan.name} waitlist</h3>
                <p className="text-slate-500 text-sm mt-1.5">Membership is coming soon — Stockly doesn't take payment online yet. Leave your details and we'll contact you to set it up.</p>
                <form onSubmit={submitWaitlist} className="mt-5 space-y-3">
                  <input className={inputCls} placeholder="Your name" aria-label="Your name" value={wlForm.name} onChange={e => setWlForm({ ...wlForm, name: e.target.value })} />
                  <input className={inputCls} placeholder="Business name (optional)" aria-label="Business name" value={wlForm.business} onChange={e => setWlForm({ ...wlForm, business: e.target.value })} />
                  <input type="email" className={inputCls} placeholder="Email" aria-label="Email" value={wlForm.email} onChange={e => setWlForm({ ...wlForm, email: e.target.value })} />
                  <input className={inputCls} placeholder="Phone (optional)" aria-label="Phone" value={wlForm.phone} onChange={e => setWlForm({ ...wlForm, phone: e.target.value })} />
                  {wlError && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{wlError}</p>}
                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={() => setWaitlistPlan(null)} className={btnGhost + " flex-1"}>Cancel</button>
                    <button type="submit" disabled={wlBusy} className={btnPrimary + " flex-1" + (wlBusy ? " opacity-60" : "")}>{wlBusy ? <Loader2 size={16} className="animate-spin" /> : null}Join waitlist</button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
      <div className="bg-slate-950 pt-16 pb-14">
        <Section>
          <Badge tone="dark">Pricing</Badge>
          <h1 className="font-display font-bold text-4xl sm:text-5xl text-white mt-4">Simple, transparent service fees.</h1>
          <p className="text-slate-400 mt-3 max-w-lg">Product costs are always paid directly to the cash and carry. Stockly's service fee is £10–£50 per run depending on the size of the order — larger or more urgent runs cost more.</p>
          <div className="inline-flex bg-slate-900 border border-slate-800 rounded-xl p-1 mt-8" role="tablist" aria-label="Pricing type">
            <button role="tab" aria-selected={tab === "single"} onClick={() => setTab("single")} className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition ${tab === "single" ? "bg-lime-300 text-slate-950" : "text-slate-300"}`}>Single Runs</button>
            <button role="tab" aria-selected={tab === "plans"} onClick={() => setTab("plans")} className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition ${tab === "plans" ? "bg-lime-300 text-slate-950" : "text-slate-300"}`}>Memberships</button>
          </div>
        </Section>
      </div>

      {tab === "single" ? (
        <Section className="py-16">
          <div className="max-w-xl">
            <div className="rounded-2xl border border-slate-200 p-8">
              <h3 className="font-display font-semibold text-2xl text-slate-950">Single Stock Run</h3>
              <p className="text-4xl font-display font-bold text-slate-950 mt-3">£10–£50<span className="text-base font-medium text-slate-500"> per run</span></p>
              <p className="text-slate-500 text-sm mt-2">Perfect for businesses that only need occasional help. No subscription, no commitment.</p>
              <ul className="mt-6 space-y-3 text-sm text-slate-700">
                {["Submit your shopping list", "Choose your preferred cash and carry", "We collect your stock", "You pay the cash and carry directly", "We deliver it to your business", "Receipt confirmation"].map((t, i) => (
                  <li key={i} className="flex items-center gap-2.5"><CheckCircle2 size={16} className="text-lime-500 shrink-0" /> {t}</li>
                ))}
              </ul>
              <div className="mt-6 bg-slate-50 rounded-xl p-4 text-xs text-slate-500 leading-relaxed">
                Product costs are separate — you pay the cash and carry directly. The £10–£50 fee is Stockly's service fee and scales with the number of products and total units on your list. "As soon as possible" runs add £{PRICING_CONFIG.URGENCY_SURCHARGE}. Optional extras (priority collection, weekend delivery…) are added on top, and you always see the exact fee before you confirm.
              </div>
              <button onClick={() => go("book")} className={btnDark + " w-full mt-6"}>Book a Stock Run</button>
            </div>
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-6 flex items-start gap-3">
              <Zap size={18} className="text-slate-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-sm text-slate-900">Emergency "as soon as possible" runs</p>
                <p className="text-xs text-slate-500 mt-1">Add £{PRICING_CONFIG.URGENCY_SURCHARGE} to the service fee and tell us in the booking form — we'll do our best to run it today.</p>
              </div>
            </div>
          </div>
        </Section>
      ) : (
        <Section className="py-16">
          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((p, i) => (
              <div key={i} className={`rounded-2xl p-8 border ${p.featured ? "border-slate-950 bg-slate-950 text-white relative" : "border-slate-200 text-slate-950"}`}>
                {p.featured && <span className="absolute -top-3 left-8 bg-lime-300 text-slate-950 text-xs font-bold px-3 py-1 rounded-full">Most popular</span>}
                <h3 className={`font-display font-semibold text-xl ${p.featured ? "text-white" : "text-slate-950"}`}>{p.name}</h3>
                <p className={`text-3xl font-display font-bold mt-3 ${p.featured ? "text-white" : "text-slate-950"}`}>£{p.price}<span className={`text-base font-medium ${p.featured ? "text-slate-400" : "text-slate-500"}`}>/month</span></p>
                <ul className="mt-6 space-y-3 text-sm">
                  {p.features.map((f, j) => (
                    <li key={j} className={`flex items-center gap-2.5 ${p.featured ? "text-slate-300" : "text-slate-700"}`}><CheckCircle2 size={16} className="text-lime-500 shrink-0" /> {f}</li>
                  ))}
                </ul>
                <button onClick={() => setWaitlistPlan(p)} className={`w-full mt-7 ${p.featured ? btnPrimary : btnDark}`}>Join {p.name} waitlist</button>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-6 max-w-lg">Product costs are not included in the subscription. The customer pays the cash and carry directly. Prices shown are proposed Stockly pricing.</p>
        </Section>
      )}

      <Section className="py-16 bg-slate-50">
        <h2 className="font-display font-bold text-2xl text-slate-950 mb-6">Compare plans</h2>
        <div className="overflow-x-auto stockly-scroll">
          <table className="w-full text-sm border-collapse min-w-[600px]">
            <thead>
              <tr className="text-left border-b border-slate-200">
                <th className="py-3 pr-4 font-semibold text-slate-500">Feature</th>
                <th className="py-3 px-4 font-semibold text-slate-900">Essential</th>
                <th className="py-3 px-4 font-semibold text-slate-900">Business</th>
                <th className="py-3 px-4 font-semibold text-slate-900">Pro</th>
              </tr>
            </thead>
            <tbody className="text-slate-600">
              {[
                ["Scheduled runs / week", "1", "2", "3"],
                ["Priority scheduling", "—", "✓", "✓"],
                ["Recurring orders", "—", "✓", "✓"],
                ["Multiple locations", "—", "—", "✓"],
                ["Spending dashboard", "—", "—", "✓"],
                ["Support", "Standard", "Standard", "Priority"],
              ].map((row, i) => (
                <tr key={i} className="border-b border-slate-200">
                  {row.map((c, j) => <td key={j} className={`py-3 px-4 ${j === 0 ? "pr-4 font-medium text-slate-800" : ""}`}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 mt-6 max-w-lg">All product purchases are paid directly to the supplier and are separate from Stockly service fees.</p>
      </Section>
    </div>
  );
}

/* ---------------------------------------------------------------------
   SERVICE AREA PAGE
--------------------------------------------------------------------- */
function ServiceArea({ go, anchor }) {
  const [wl, setWl] = useState({ name: "", business: "", email: "", phone: "", type: "", postcode: "" });
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (anchor === "waitlist") {
      setTimeout(() => document.getElementById("waitlist")?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [anchor]);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    const { whatsapp } = await notifyOwner({
      type: "waitlist",
      subject: `Waitlist signup — ${wl.business || wl.name}`,
      lines: [
        ["Name", wl.name], ["Business", wl.business], ["Email", wl.email],
        ["Phone", wl.phone], ["Business type", wl.type], ["Postcode", wl.postcode],
      ],
    });
    window.open(whatsapp, "_blank");
  };

  return (
    <div className="bg-white">
      <div className="bg-slate-950 pt-16 pb-14">
        <Section>
          <Badge tone="dark">East London launch</Badge>
          <h1 className="font-display font-bold text-4xl sm:text-5xl text-white mt-4">Stockly East London</h1>
          <p className="text-slate-400 mt-3 max-w-lg">We're launching in selected East London postcodes, with more areas planned as we grow. Enter your postcode to check availability.</p>
        </Section>
      </div>

      <Section className="py-16 grid lg:grid-cols-2 gap-12">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-950 mb-5">Where we serve today</h2>
          <div className="grid grid-cols-2 gap-3">
            {SERVICE_AREAS.map(a => (
              <div key={a.code} className="rounded-xl border border-slate-200 p-4">
                <p className="font-display font-bold text-lg text-slate-950">{a.code}</p>
                <p className="text-xs text-slate-500 mt-0.5">{a.name}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-5">More East London areas are being added as Stockly grows. This list will update over time.</p>
        </div>
        <PostcodeChecker onJoinWaitlist={() => document.getElementById("waitlist")?.scrollIntoView({ behavior: "smooth" })} />
      </Section>

      <Section id="waitlist" className="py-16 bg-slate-50 scroll-mt-16">
        <div className="max-w-lg mx-auto text-center mb-8">
          <h2 className="font-display font-bold text-3xl text-slate-950">We're coming to your area.</h2>
          <p className="text-slate-500 mt-2">Join the waitlist and we'll let you know as soon as Stockly launches near you.</p>
        </div>
        {submitted ? (
          <div className="max-w-lg mx-auto bg-white border border-lime-200 rounded-2xl p-8 text-center stk-fade-up">
            <CheckCircle2 className="text-lime-500 mx-auto mb-3" size={32} />
            <h3 className="font-display font-semibold text-xl text-slate-950">You're on the list.</h3>
            <p className="text-slate-500 text-sm mt-2">We'll let you know when Stockly launches in your area.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="max-w-lg mx-auto bg-white border border-slate-200 rounded-2xl p-7 space-y-4">
            <div>
              <label htmlFor="wl-name" className={labelCls}>Name</label>
              <input id="wl-name" required className={inputCls} value={wl.name} onChange={e => setWl({ ...wl, name: e.target.value })} />
            </div>
            <div>
              <label htmlFor="wl-business" className={labelCls}>Business name</label>
              <input id="wl-business" required className={inputCls} value={wl.business} onChange={e => setWl({ ...wl, business: e.target.value })} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="wl-email" className={labelCls}>Email</label>
                <input id="wl-email" required type="email" autoComplete="email" className={inputCls} value={wl.email} onChange={e => setWl({ ...wl, email: e.target.value })} />
              </div>
              <div>
                <label htmlFor="wl-phone" className={labelCls}>Phone</label>
                <input id="wl-phone" required type="tel" autoComplete="tel" className={inputCls} value={wl.phone} onChange={e => setWl({ ...wl, phone: e.target.value })} />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="wl-type" className={labelCls}>Business type</label>
                <select id="wl-type" required className={inputCls} value={wl.type} onChange={e => setWl({ ...wl, type: e.target.value })}>
                  <option value="">Select type</option>
                  {BUSINESS_TYPES.map(b => <option key={b.label}>{b.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="wl-postcode" className={labelCls}>Postcode</label>
                <input id="wl-postcode" required className={inputCls} value={wl.postcode} onChange={e => setWl({ ...wl, postcode: e.target.value })} />
              </div>
            </div>
            <button type="submit" className={btnPrimary + " w-full !py-3.5"}>Join the Waitlist</button>
          </form>
        )}
      </Section>
    </div>
  );
}

/* ---------------------------------------------------------------------
   ABOUT
--------------------------------------------------------------------- */
function About({ go }) {
  return (
    <div className="bg-white">
      <div className="bg-slate-950 pt-16 pb-16">
        <Section>
          <Badge tone="dark">About Stockly</Badge>
          <h1 className="font-display font-bold text-4xl sm:text-5xl text-white mt-4 max-w-xl">Independent businesses shouldn't lose hours to the stock run.</h1>
        </Section>
      </div>
      <Section className="py-16 max-w-2xl space-y-6 text-slate-600 leading-relaxed">
        <p>Stockly exists because independent businesses lose valuable time when owners or employees have to leave their premises to restock at the cash and carry.</p>
        <p>Stockly handles the physical stock run — from collecting your shopping list, to purchasing at your chosen supplier, to delivering it straight to your door — so you can stay focused on running your business.</p>
        <p>We're starting in East London, working closely with a small number of independent businesses to get the experience right before expanding into more areas based on demand.</p>
        <div className="grid sm:grid-cols-3 gap-4 pt-4">
          {[{ icon: MapPin, t: "East London first", b: "Launching in selected East London postcodes." }, { icon: Users, t: "Built with real businesses", b: "Shaped by feedback from independent operators." }, { icon: ArrowUpRight, t: "Expanding with demand", b: "More areas added as Stockly grows." }].map((c, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-5">
              <c.icon size={18} className="text-slate-700 mb-3" />
              <p className="font-semibold text-slate-900 text-sm">{c.t}</p>
              <p className="text-xs text-slate-500 mt-1">{c.b}</p>
            </div>
          ))}
        </div>
        <div className="pt-6">
          <button onClick={() => go("book")} className={btnDark}>Book your first stock run</button>
        </div>
      </Section>

      <Section className="py-16 bg-slate-50">
        <h2 className="font-display font-bold text-2xl text-slate-950 mb-8">Simple. Transparent. Business-focused.</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { t: "Direct supplier payment", b: "You pay the cash and carry directly." },
            { t: "Transparent service fees", b: "Know exactly what you are paying Stockly for." },
            { t: "Receipt documentation", b: "See exactly what was purchased on your behalf." },
            { t: "Delivery confirmation", b: "Know when your stock arrived." },
            { t: "Order history", b: "Access all your previous stock runs." },
            { t: "Secure accounts", b: "Your business information is kept protected." },
          ].map((c, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
              <ShieldCheck size={18} className="text-lime-500 mb-3" />
              <p className="font-semibold text-slate-900 text-sm">{c.t}</p>
              <p className="text-xs text-slate-500 mt-1">{c.b}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

/* ---------------------------------------------------------------------
   AUTH — real Supabase authentication (password or email one-time code)
--------------------------------------------------------------------- */
function AuthPage({ mode, go, onAuth, prefill, referralFromLink }) {
  const [form, setForm] = useState({
    name: "", business: "", email: prefill?.email || "", phone: "", password: "",
    referralCode: referralFromLink || "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Passwordless login: customer requests a one-time code by email instead
  // of typing a password. Uses Supabase's built-in email OTP.
  const [loginMethod, setLoginMethod] = useState("password"); // "password" | "code"
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");

  const sendLoginCode = async () => {
    setError("");
    if (!form.email.trim()) { setError("Enter your email first."); return; }
    setBusy(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: form.email.trim().toLowerCase(),
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (otpError) { setError(otpError.message || "Couldn't send a code — check the email is right."); return; }
    setCodeSent(true);
  };

  const verifyLoginCode = async (e) => {
    e.preventDefault();
    setError("");
    if (!code.trim()) { setError("Enter the code from your email."); return; }
    setBusy(true);
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email: form.email.trim().toLowerCase(),
      token: code.trim(),
      type: "email",
    });
    if (verifyError) { setError("That code didn't work — check it and try again."); setBusy(false); return; }
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
    onAuth("customer", profile);
    setBusy(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.email.trim() || (loginMethod === "password" && !form.password.trim())) { setError("Email and password are required."); return; }
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!form.name.trim() || !form.business.trim() || !form.phone.trim()) {
          setError("Please fill in your name, business and phone number.");
          setBusy(false);
          return;
        }
        // Real Supabase signup. The DB trigger (see supabase/schema.sql)
        // creates the matching row in `profiles` automatically from this
        // metadata, including generating a referral code.
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: form.email.trim().toLowerCase(),
          password: form.password,
          options: {
            data: {
              full_name: form.name.trim(),
              business_name: form.business.trim(),
              phone: form.phone.trim(),
            },
          },
        });
        if (signUpError) { setError(signUpError.message); setBusy(false); return; }

        // If Supabase is configured to require email confirmation, there's
        // no session yet — tell the customer to check their inbox instead
        // of pretending they're logged in.
        if (!data.session) {
          setBusy(false);
          setForm(f => ({ ...f, checkEmail: true }));
          return;
        }

        if (form.referralCode.trim()) {
          const { data: referrerId } = await supabase.rpc("lookup_referral_code", { code: form.referralCode.trim() });
          if (referrerId) {
            await supabase.from("profiles").update({ referred_by: referrerId }).eq("id", data.user.id);
          }
        }

        const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
        onAuth("customer", profile);
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: form.email.trim().toLowerCase(),
          password: form.password,
        });
        if (signInError) { setError("Incorrect email or password."); setBusy(false); return; }
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
        onAuth("customer", profile);
      }
    } finally {
      setBusy(false);
    }
  };

  if (form.checkEmail) {
    return (
      <div className="min-h-[70vh] bg-slate-50 flex items-center justify-center py-16 px-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center">
          <Mail className="mx-auto text-slate-400 mb-4" size={28} />
          <h1 className="font-display font-bold text-xl text-slate-950">Check your email</h1>
          <p className="text-slate-500 text-sm mt-2">We've sent a confirmation link to <strong>{form.email}</strong>. Click it to activate your account, then come back and log in.</p>
          <button onClick={() => go("login")} className={btnDark + " mt-6"}>Back to log in</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] bg-slate-50 flex items-center justify-center py-16 px-6">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
        <div className="flex justify-center mb-6"><Logo size={30} /></div>
        <h1 className="font-display font-bold text-2xl text-slate-950 text-center">{mode === "signup" ? "Create your account" : "Log in to Stockly"}</h1>
        <p className="text-slate-500 text-sm text-center mt-1.5">{mode === "signup" ? "One account, one dashboard — fill your details in once." : "Welcome back."}</p>

        {mode === "login" && (
          <div className="flex mt-6 bg-slate-100 rounded-xl p-1 text-sm" role="tablist" aria-label="Login method">
            <button type="button" role="tab" aria-selected={loginMethod === "password"} onClick={() => { setLoginMethod("password"); setCodeSent(false); setError(""); }} className={`flex-1 py-2 rounded-lg font-semibold transition ${loginMethod === "password" ? "bg-white shadow-sm text-slate-950" : "text-slate-500"}`}>Password</button>
            <button type="button" role="tab" aria-selected={loginMethod === "code"} onClick={() => { setLoginMethod("code"); setError(""); }} className={`flex-1 py-2 rounded-lg font-semibold transition ${loginMethod === "code" ? "bg-white shadow-sm text-slate-950" : "text-slate-500"}`}>Email code</button>
          </div>
        )}

        {mode === "login" && loginMethod === "code" ? (
          <form onSubmit={codeSent ? verifyLoginCode : (e) => { e.preventDefault(); sendLoginCode(); }} className="mt-6 space-y-4">
            <div>
              <label htmlFor="auth-email-code" className={labelCls}>Email</label>
              <div className="relative"><Mail size={16} className="absolute left-3.5 top-3.5 text-slate-400" aria-hidden="true" /><input id="auth-email-code" type="email" autoComplete="email" disabled={codeSent} className={inputCls + " pl-10"} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@business.co.uk" /></div>
            </div>
            {codeSent && (
              <div>
                <label htmlFor="auth-code" className={labelCls}>6-digit code</label>
                <div className="relative"><Lock size={16} className="absolute left-3.5 top-3.5 text-slate-400" aria-hidden="true" /><input id="auth-code" inputMode="numeric" autoComplete="one-time-code" className={inputCls + " pl-10 tracking-widest"} value={code} onChange={e => setCode(e.target.value)} placeholder="123456" /></div>
                <p className="text-[11px] text-slate-400 mt-1.5">Sent to {form.email}. It expires after a few minutes — didn't get it? <button type="button" onClick={sendLoginCode} className="font-semibold text-slate-600 underline underline-offset-2">Send again</button></p>
              </div>
            )}
            {error && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={busy} className={btnPrimary + " w-full !py-3.5" + (busy ? " opacity-60" : "")}>{busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}{codeSent ? "Verify & log in" : "Send me a code"}</button>
          </form>
        ) : (
        <form onSubmit={submit} className="mt-7 space-y-4">
          {mode === "signup" && (
            <>
              <div>
                <label htmlFor="auth-name" className={labelCls}>Full name</label>
                <div className="relative"><User size={16} className="absolute left-3.5 top-3.5 text-slate-400" aria-hidden="true" /><input id="auth-name" autoComplete="name" className={inputCls + " pl-10"} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Amir Hussain" /></div>
              </div>
              <div>
                <label htmlFor="auth-business" className={labelCls}>Business name</label>
                <div className="relative"><Building2 size={16} className="absolute left-3.5 top-3.5 text-slate-400" aria-hidden="true" /><input id="auth-business" autoComplete="organization" className={inputCls + " pl-10"} value={form.business} onChange={e => setForm({ ...form, business: e.target.value })} placeholder="East London Takeaway" /></div>
              </div>
            </>
          )}
          <div>
            <label htmlFor="auth-email" className={labelCls}>Email</label>
            <div className="relative"><Mail size={16} className="absolute left-3.5 top-3.5 text-slate-400" aria-hidden="true" /><input id="auth-email" type="email" autoComplete="email" className={inputCls + " pl-10"} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@business.co.uk" /></div>
          </div>
          {mode === "signup" && (
            <div>
              <label htmlFor="auth-phone" className={labelCls}>Phone</label>
              <div className="relative"><Phone size={16} className="absolute left-3.5 top-3.5 text-slate-400" aria-hidden="true" /><input id="auth-phone" type="tel" autoComplete="tel" className={inputCls + " pl-10"} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="07..." /></div>
            </div>
          )}
          <div>
            <label htmlFor="auth-password" className={labelCls}>Password</label>
            <div className="relative"><Lock size={16} className="absolute left-3.5 top-3.5 text-slate-400" aria-hidden="true" /><input id="auth-password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} className={inputCls + " pl-10"} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" /></div>
          </div>
          {mode === "signup" && (
            <div>
              <label htmlFor="auth-referral" className={labelCls}>Referral code <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
              <div className="relative"><Gift size={16} className="absolute left-3.5 top-3.5 text-slate-400" aria-hidden="true" /><input id="auth-referral" className={inputCls + " pl-10"} value={form.referralCode} onChange={e => setForm({ ...form, referralCode: e.target.value.toUpperCase() })} placeholder="e.g. AMIR284" /></div>
              <p className="text-[11px] text-slate-400 mt-1.5">Got a code from another business? Enter it — once you place your first order or take a membership, they get rewarded.</p>
            </div>
          )}
          {error && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          {mode === "login" && <button type="button" onClick={() => go("forgot")} className="text-xs font-medium text-slate-500 hover:text-slate-800">Forgot password?</button>}
          <button type="submit" disabled={busy} className={btnPrimary + " w-full !py-3.5" + (busy ? " opacity-60" : "")}>{busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}{mode === "signup" ? "Create account" : "Log in"}</button>
        </form>
        )}
        <p className="text-center text-sm text-slate-500 mt-6">
          {mode === "signup" ? (
            <>Already have an account? <button onClick={() => go("login")} className="text-slate-950 font-semibold">Log in</button></>
          ) : (
            <>New to Stockly? <button onClick={() => go("signup")} className="text-slate-950 font-semibold">Create an account</button></>
          )}
        </p>
        <div className="border-t border-slate-100 mt-6 pt-5 text-center">
          <p className="text-xs text-slate-400">Stockly operations team? Sign in with your ops account — your dashboard opens automatically.</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   BOOKING FLOW — Single Run wizard
   Product input is deliberately text-first: type items field-by-field,
   paste a whole list at once, or ask the AI Stock Assistant to draft the
   list from your real past orders. (Camera/barcode input was removed —
   it was unreliable across devices; text input always works.)
--------------------------------------------------------------------- */
const emptyItem = () => ({ id: Math.random().toString(36).slice(2), product: "", qty: 1, unit: "Cases", brand: "", notes: "" });

/* The AI Stock Assistant — interprets a typed request against the
   customer's REAL past orders (functions/ai-assistant.js). Always returns
   an honest "note" explaining what it did, and never invents order
   history — if recentOrders is empty, the model is told that explicitly
   and will say so rather than pretend to know a "usual" order.
   It NEVER places an order: it only fills in the editable draft below,
   which the customer reviews and confirms themselves. */
async function askStockAssistant(message, recentOrders) {
  const response = await fetch("/ai-assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, recentOrders }),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error || "The assistant couldn't process that right now.");
  }
  return json; // { items, note }
}

function Booking({ go, addOrder, loggedIn, onAuth, account, setAccount, prefillItems, onConsumedPrefill }) {
  // Returning customers shouldn't have to retype their delivery address
  // every single run — remember the last one used on this device and
  // prefill it.
  const lastAddressKey = account?.id ? `stockly-last-address-${account.id}` : null;
  const lastAddress = (() => {
    if (!lastAddressKey) return null;
    try { return JSON.parse(localStorage.getItem(lastAddressKey) || "null"); } catch { return null; }
  })();

  const [step, setStep] = useState(() => {
    // If we already know everything step 1 asks for AND we have a
    // remembered address, skip straight to picking the cash & carry.
    const step1Complete = account?.business_name && account?.full_name && account?.phone;
    if (step1Complete && lastAddress?.address && lastAddress?.postcode) return 3;
    if (step1Complete) return 2;
    return 1;
  });
  const totalSteps = 8;
  const [data, setData] = useState({
    businessName: account?.business_name || account?.business || "", contactName: account?.full_name || account?.name || "", phone: account?.phone || "", email: account?.email || "", businessType: "",
    address: lastAddress?.address || "", postcode: lastAddress?.postcode || "",
    cashAndCarry: "", otherCashAndCarry: "",
    date: "", timeWindow: "", urgency: "standard",
    items: (prefillItems && prefillItems.length) ? prefillItems.map(it => ({ ...emptyItem(), ...it, id: Math.random().toString(36).slice(2) })) : [emptyItem()],
    notes: "",
    membership: account?.membership && account.membership !== "none" ? account.membership : "none",
    extras: [],
  });

  // Prefilled items (from "Repeat Order" / "Buy Again") are only meant for
  // this one visit to the booking form — clear them so a later, unrelated
  // visit to /book doesn't silently reuse a past order's items.
  useEffect(() => { if (prefillItems && prefillItems.length) onConsumedPrefill?.(); }, []);

  const [pcResult, setPcResult] = useState(lastAddress?.postcode ? { valid: true } : null);
  const [done, setDone] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [itemMode, setItemMode] = useState("manual"); // "manual" | "assistant"

  // Real order history for the AI Assistant to reference — fetched once,
  // from this customer's actual past runs, never fabricated.
  const [orderHistory, setOrderHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [assistantText, setAssistantText] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantNote, setAssistantNote] = useState("");
  const [assistantError, setAssistantError] = useState("");
  useEffect(() => {
    if (!account?.id) return;
    let cancelled = false;
    setLoadingHistory(true);
    fetchSingleRuns(account.id)
      .then(runs => { if (!cancelled) setOrderHistory((runs || []).slice(0, 10).map(r => ({ date: r.date, cashAndCarry: r.cashAndCarry, items: r.items }))); })
      .catch(() => { if (!cancelled) setOrderHistory([]); })
      .finally(() => { if (!cancelled) setLoadingHistory(false); });
    return () => { cancelled = true; };
  }, [account?.id]);

  const runAssistant = async () => {
    if (!assistantText.trim()) return;
    setAssistantBusy(true);
    setAssistantError("");
    setAssistantNote("");
    try {
      const result = await askStockAssistant(assistantText.trim(), orderHistory);
      if (Array.isArray(result.items) && result.items.length) {
        const newItems = result.items.map(f => ({
          id: Math.random().toString(36).slice(2),
          product: f.product || "", brand: f.brand || "",
          qty: f.qty || 1, unit: f.unit || "Units", notes: "",
        }));
        const existingBlank = data.items.every(i => !i.product.trim());
        set({ items: existingBlank ? newItems : [...data.items.filter(i => i.product.trim()), ...newItems] });
      }
      setAssistantNote(result.note || (result.items?.length ? "Added those items below — check them over." : "Couldn't find anything to add from that."));
      setAssistantText("");
    } catch (err) {
      setAssistantError(err.message || "Something went wrong. Please try again or add items manually.");
    } finally {
      setAssistantBusy(false);
    }
  };

  const set = (patch) => setData(d => ({ ...d, ...patch }));

  const updateItem = (id, patch) => set({ items: data.items.map(it => it.id === id ? { ...it, ...patch } : it) });
  const addItem = () => set({ items: [...data.items, emptyItem()] });
  const removeItem = (id) => set({ items: data.items.length > 1 ? data.items.filter(it => it.id !== id) : data.items });
  // "Paste a list" — parses free text like "20 coke, 10 crisps, 5 milk" or
  // one item per line into real item rows. A leading number is read as the
  // quantity, the rest as the product name.
  const [quickListText, setQuickListText] = useState("");
  const parseQuickList = () => {
    const pieces = quickListText.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    if (!pieces.length) return;
    const parsed = pieces.map(piece => {
      const m = piece.match(/^(\d+)\s*[xX]?\s*(.+)$/);
      if (m) return { ...emptyItem(), qty: parseInt(m[1], 10) || 1, product: m[2].trim() };
      return { ...emptyItem(), qty: 1, product: piece };
    });
    const existingBlank = data.items.length === 1 && !data.items[0].product.trim();
    set({ items: existingBlank ? parsed : [...data.items, ...parsed] });
    setQuickListText("");
  };

  const toggleExtra = (id) => set({ extras: data.extras.includes(id) ? data.extras.filter(x => x !== id) : [...data.extras, id] });
  // Membership billing isn't live yet, so pressing this joins a genuine
  // waitlist (builds a ready-to-send WhatsApp message with the customer's
  // real details) rather than pretending to activate a paid plan.
  const [membershipJoining, setMembershipJoining] = useState(false);
  const [membershipError, setMembershipError] = useState("");
  const [membershipJoined, setMembershipJoined] = useState(null); // plan id just joined, or null
  const joinMembershipWaitlist = async (plan) => {
    setMembershipError("");
    let activeAccount = account;
    if (!activeAccount?.id) {
      // getUser() actively re-checks with Supabase's servers and refreshes
      // the token if needed — safer than the cached getSession() here.
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
        if (profile) { activeAccount = profile; setAccount(profile); }
      }
    }
    setMembershipJoining(true);
    try {
      const { whatsapp } = await notifyOwner({
        type: "membership_waitlist",
        subject: `Membership waitlist — ${plan.name} — ${activeAccount?.business_name || activeAccount?.full_name || data.businessName || "Unknown"}`,
        lines: [
          ["Plan", `${plan.name} (£${plan.price}/month proposed)`],
          ["Business", activeAccount?.business_name || data.businessName || "—"],
          ["Contact", activeAccount?.full_name || data.contactName || "—"],
          ["Email", activeAccount?.email || data.email || "—"],
          ["Phone", activeAccount?.phone || data.phone || "—"],
        ],
      });
      window.open(whatsapp, "_blank");
      setMembershipJoined(plan.id);
    } catch (err) {
      setMembershipError(err.message || "Something went wrong. Please try again.");
    } finally {
      setMembershipJoining(false);
    }
  };

  const extrasTotal = useMemo(() => data.extras.reduce((s, id) => s + (CHECKOUT_EXTRAS.find(e => e.id === id)?.price || 0), 0), [data.extras]);
  const membershipPlan = MEMBERSHIP_PLANS.find(p => p.id === data.membership) || MEMBERSHIP_PLANS[0];

  const preDiscountFee = useMemo(() => {
    const validItems = data.items.filter(i => i.product.trim());
    const itemCount = validItems.length;
    const totalUnits = validItems.reduce((sum, i) => sum + (Number(i.qty) || 1), 0);
    return calculateRunFee({ itemCount, totalUnits, urgent: data.urgency === "emergency", extrasTotal });
  }, [data.items, data.urgency, extrasTotal]);

  // Real, applied discounts — not just displayed. A brand-new customer
  // (first_run_discount_used is false/unset) gets a genuine percentage off,
  // and any accumulated referral credit on the account is spent here too,
  // capped so it can't push the fee below £0.
  const isFirstRun = !!account && !account.first_run_discount_used;
  const firstRunDiscountAmount = isFirstRun ? Math.round(preDiscountFee * (FIRST_RUN_DISCOUNT_PERCENT / 100) * 100) / 100 : 0;
  const availableCredit = account?.referral_credit ? Number(account.referral_credit) : 0;
  const afterFirstRunDiscount = Math.max(0, preDiscountFee - firstRunDiscountAmount);
  const creditApplied = Math.min(availableCredit, afterFirstRunDiscount);
  const fee = Math.round((afterFirstRunDiscount - creditApplied) * 100) / 100;

  const canNext = () => {
    if (step === 1) return data.businessName && data.contactName && data.phone && data.email && data.businessType;
    if (step === 2) return data.address && data.postcode && pcResult && pcResult.valid;
    if (step === 3) return data.cashAndCarry && (data.cashAndCarry !== "Other / specify" || data.otherCashAndCarry);
    if (step === 4) return data.date;
    if (step === 5) return data.items.some(i => i.product.trim());
    return true;
  };

  const checkPc = () => setPcResult(checkPostcode(data.postcode));

  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const cleanItems = data.items.filter(i => i.product.trim());
    const cashAndCarry = data.cashAndCarry === "Other / specify" ? data.otherCashAndCarry : data.cashAndCarry;
    const deliveryAddress = `${data.address}, ${data.postcode}`;

    setSubmitError("");
    let activeAccount = account;
    if (!activeAccount?.id) {
      // getSession() only reads whatever's cached locally — after the tab
      // has been backgrounded a while (phone locked, switched apps) that
      // can be stale. getUser() actively re-checks with Supabase's servers
      // and refreshes the token if needed.
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
        if (profile) { activeAccount = profile; setAccount(profile); }
      }
    }
    if (!activeAccount?.id) {
      setSubmitError("You've been logged out — please log back in and submit again.");
      return;
    }
    setSubmitting(true);
    let order;
    try {
      // Real persistence: this creates a row in single_runs plus one row
      // per item in run_items (see supabase/schema.sql). Recurring runs
      // are a completely separate table/flow — see Recurring Runs.
      order = await createSingleRun(
        activeAccount.id,
        { cashAndCarry, deliveryAddress, scheduledFor: data.date || null, notes: data.notes, serviceFee: fee },
        cleanItems
      );
    } catch (err) {
      setSubmitError(err.message || "Couldn't save your run — please check your connection and try again.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    addOrder(order);

    // Now that the run genuinely saved, actually apply what was shown on
    // the review screen: mark the first-run discount as used so it can't
    // be reused, spend any referral credit that was applied, and — if this
    // is this customer's first run and they were referred by someone —
    // credit that referrer for real.
    try {
      const patch = {};
      if (isFirstRun) patch.first_run_discount_used = true;
      if (creditApplied > 0) patch.referral_credit = Math.max(0, availableCredit - creditApplied);
      if (Object.keys(patch).length) {
        const updated = await updateProfile(activeAccount.id, patch);
        setAccount(updated);
      }
      if (isFirstRun && activeAccount.referred_by && !activeAccount.referral_reward_given) {
        await supabase.rpc("credit_referrer", { referrer_id: activeAccount.referred_by, amount: REFERRAL_REWARD_AMOUNT });
        await updateProfile(activeAccount.id, { referral_reward_given: true });
      }
    } catch (e) {
      // A discount/credit bookkeeping hiccup should never block an already-
      // saved order — the run itself is safe regardless of this succeeding.
    }

    const itemLines = cleanItems.map(i => `${i.qty} ${i.unit} ${i.product}${i.brand ? ` (${i.brand})` : ""}`).join("; ");
    const extraNames = data.extras.map(exId => CHECKOUT_EXTRAS.find(e => e.id === exId)?.name).filter(Boolean);
    const { whatsapp } = await notifyOwner({
      type: "order",
      subject: `New stock run request ${order.id} — ${data.businessName}`,
      lines: [
        ["Order ID", order.id], ["Business", data.businessName], ["Contact", data.contactName],
        ["Phone", data.phone], ["Email", data.email], ["Delivery address", `${data.address}, ${data.postcode}`],
        ["Cash & carry", order.cashAndCarry], ["Date needed", data.date], ["Time window", data.timeWindow || "No preference"], ["Urgency", data.urgency],
        ["Items requested", itemLines || "See dashboard"], ["Extras", extraNames.join(", ") || "None"],
        ["Membership selected", membershipPlan.name], ["Estimated service fee", `£${fee}`],
        ["Payment", "Not taken online — collect cash/card from the business in person"],
        ["Special instructions", data.notes || "None"],
      ],
    });

    setOrderId(order.id);
    setDone(true);
    window.open(whatsapp, "_blank");
    if (!loggedIn) onAuth("customer", activeAccount);
    // Remember this address so next time this customer starts a run, they
    // don't have to retype it.
    if (activeAccount?.id && data.address && data.postcode) {
      try {
        localStorage.setItem(`stockly-last-address-${activeAccount.id}`, JSON.stringify({ address: data.address, postcode: data.postcode }));
      } catch { /* localStorage unavailable — not worth failing the order over */ }
    }
  };

  if (!loggedIn) {
    return (
      <div className="min-h-[60vh] bg-slate-50 flex items-center justify-center px-6 py-20">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center stk-fade-up">
          <div className="w-14 h-14 rounded-full bg-slate-950 flex items-center justify-center mx-auto mb-5"><User className="text-lime-300" size={26} /></div>
          <h1 className="font-display font-bold text-2xl text-slate-950">Log in to book a stock run</h1>
          <p className="text-slate-500 text-sm mt-2">One account keeps your business details, every order, receipt and delivery update in your own dashboard.</p>
          <div className="flex flex-col gap-2.5 mt-7">
            <button onClick={() => go("login")} className={btnPrimary}>Log in</button>
            <button onClick={() => go("signup")} className={btnDark}>Create my account</button>
          </div>
          <p className="text-xs text-slate-400 mt-6">Questions? Call <a href={`tel:${OWNER_PHONE_TEL}`} className="font-semibold text-slate-600">{OWNER_PHONE_DISPLAY}</a></p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-[70vh] bg-slate-50 flex items-center justify-center px-6 py-20">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center stk-fade-up">
          <div className="w-14 h-14 rounded-full bg-lime-100 flex items-center justify-center mx-auto mb-5"><CheckCircle2 className="text-lime-600" size={28} /></div>
          <h1 className="font-display font-bold text-2xl text-slate-950">Stock run requested.</h1>
          <p className="text-slate-500 text-sm mt-2">Your request <strong>{orderId}</strong> has been received and saved to your dashboard. We'll confirm the final service fee and availability shortly.</p>
          <div className="bg-slate-50 rounded-xl p-4 mt-6 text-left text-sm space-y-1.5">
            <div className="flex justify-between"><span className="text-slate-500">Estimated service fee</span><span className="font-semibold text-slate-900">£{fee}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Cash & carry</span><span className="font-medium text-slate-900">{data.cashAndCarry === "Other / specify" ? data.otherCashAndCarry : data.cashAndCarry}</span></div>
          </div>
          <p className="text-xs text-slate-400 mt-4">A WhatsApp message with your full order has opened, ready to send — if it didn't open, message or call <a href={`tel:${OWNER_PHONE_TEL}`} className="font-semibold text-slate-600">{OWNER_PHONE_DISPLAY}</a> directly and we'll confirm your order.</p>
          <div className="flex flex-col gap-2.5 mt-7">
            <button onClick={() => go("dashboard")} className={btnPrimary}>Go to my dashboard</button>
            <button onClick={() => go("home")} className={btnGhost}>Back to home</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-[70vh]">
      <Section className="py-10 sm:py-14 max-w-2xl mx-auto">
        <div className="mb-8">
          <p className="text-xs font-semibold text-slate-500 mb-2">Step {step} of {totalSteps}</p>
          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={totalSteps}>
            <div className="h-full bg-lime-400 transition-all duration-500" style={{ width: `${(step / totalSteps) * 100}%` }} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 stk-fade-up" key={step}>
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="font-display font-bold text-xl text-slate-950 mb-1">Your business details</h2>
              <p className="text-sm text-slate-500 mb-5">Tell us a little about your business.</p>
              <div><label className={labelCls} htmlFor="bk-business">Business name</label><input id="bk-business" className={inputCls} value={data.businessName} onChange={e => set({ businessName: e.target.value })} placeholder="East London Takeaway" /></div>
              <div><label className={labelCls} htmlFor="bk-contact">Contact name</label><input id="bk-contact" className={inputCls} value={data.contactName} onChange={e => set({ contactName: e.target.value })} placeholder="Amir Hussain" /></div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div><label className={labelCls} htmlFor="bk-phone">Phone</label><input id="bk-phone" className={inputCls} value={data.phone} onChange={e => set({ phone: e.target.value })} placeholder="07..." /></div>
                <div><label className={labelCls} htmlFor="bk-email">Email</label><input id="bk-email" type="email" className={inputCls} value={data.email} onChange={e => set({ email: e.target.value })} placeholder="you@business.co.uk" /></div>
              </div>
              <div>
                <label className={labelCls} htmlFor="bk-type">Business type</label>
                <select id="bk-type" className={inputCls} value={data.businessType} onChange={e => set({ businessType: e.target.value })}>
                  <option value="">Select type</option>
                  {BUSINESS_TYPES.map(b => <option key={b.label}>{b.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="font-display font-bold text-xl text-slate-950 mb-1">Delivery address</h2>
              <p className="text-sm text-slate-500 mb-5">Where should we deliver your stock?</p>
              <div><label className={labelCls} htmlFor="bk-address">Address</label><input id="bk-address" className={inputCls} value={data.address} onChange={e => set({ address: e.target.value })} placeholder="14 Mare Street, Hackney" /></div>
              <div>
                <label className={labelCls} htmlFor="bk-postcode">Postcode</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input id="bk-postcode" className={inputCls} value={data.postcode} onChange={e => { set({ postcode: e.target.value }); setPcResult(null); }} placeholder="E8 3RH" />
                  <button type="button" onClick={checkPc} className={btnGhost + " !px-4 shrink-0"}>Check</button>
                </div>
              </div>
              {pcResult && (
                <div className={`rounded-xl px-4 py-3 text-sm flex items-start gap-2.5 ${pcResult.valid ? "bg-lime-50 text-lime-800 border border-lime-200" : "bg-amber-50 text-amber-800 border border-amber-200"}`}>
                  {pcResult.valid ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" /> : <AlertCircle size={17} className="mt-0.5 shrink-0" />}
                  <span>{pcResult.valid ? `Good news. Stockly currently serves your area (${pcResult.found.name}).` : "We're not in your area yet. Join the waitlist and we'll let you know when Stockly launches near you."}</span>
                </div>
              )}
              {pcResult && !pcResult.valid && (
                <button type="button" onClick={() => go("service-area", { anchor: "waitlist" })} className="text-sm font-semibold text-slate-950 underline underline-offset-2">Join the waitlist instead →</button>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-display font-bold text-xl text-slate-950 mb-1">Choose your cash and carry</h2>
              <p className="text-sm text-slate-500 mb-5">Pick from common East London suppliers, or specify your own.</p>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {CASH_AND_CARRIES.map(c => (
                  <button key={c} type="button" onClick={() => set({ cashAndCarry: c })} className={`text-left px-4 py-3 rounded-xl border text-sm font-medium transition ${data.cashAndCarry === c ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>{c}</button>
                ))}
              </div>
              {data.cashAndCarry === "Other / specify" && (
                <input className={inputCls} value={data.otherCashAndCarry} onChange={e => set({ otherCashAndCarry: e.target.value })} placeholder="Name of cash and carry" aria-label="Name of cash and carry" />
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="font-display font-bold text-xl text-slate-950 mb-1">Delivery date</h2>
              <p className="text-sm text-slate-500 mb-5">Orders submitted before 8 PM can be considered for next-day service, subject to availability. Guaranteed next-day delivery is not promised.</p>
              <div><label className={labelCls} htmlFor="bk-date">Preferred delivery date</label><input id="bk-date" type="date" className={inputCls} value={data.date} onChange={e => set({ date: e.target.value })} /></div>
              <div>
                <label className={labelCls}>Preferred time window</label>
                <div className="grid grid-cols-3 gap-2.5">
                  {["Morning", "Afternoon", "Evening"].map(w => (
                    <button key={w} type="button" onClick={() => set({ timeWindow: w })} className={`px-3 py-3 rounded-xl border text-sm font-medium ${data.timeWindow === w ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 text-slate-700"}`}>{w}</button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">A preference, not a guarantee — the Stockly team will confirm the actual time with you.</p>
              </div>
              <div>
                <label className={labelCls}>Urgency</label>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button type="button" onClick={() => set({ urgency: "standard" })} className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium ${data.urgency === "standard" ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 text-slate-700"}`}>Standard</button>
                  <button type="button" onClick={() => set({ urgency: "emergency" })} className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium ${data.urgency === "emergency" ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 text-slate-700"}`}>As soon as possible (+£{PRICING_CONFIG.URGENCY_SURCHARGE})</button>
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h2 className="font-display font-bold text-xl text-slate-950 mb-1">Your stock list</h2>
              <p className="text-sm text-slate-500 mb-5">Type your list field-by-field, paste it in one go, or ask Stockly to draft it from your past orders.</p>
              <div className="flex gap-2 p-1 bg-slate-100 rounded-xl mb-4" role="tablist" aria-label="How to enter products">
                <button type="button" role="tab" aria-selected={itemMode === "manual"} onClick={() => setItemMode("manual")} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${itemMode === "manual" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}><ClipboardList size={14} className="inline mr-1.5 -mt-0.5" /> Type it out</button>
                <button type="button" role="tab" aria-selected={itemMode === "assistant"} onClick={() => setItemMode("assistant")} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${itemMode === "assistant" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}><Sparkles size={14} className="inline mr-1.5 -mt-0.5" /> Ask Stockly</button>
              </div>

              {itemMode === "assistant" && (
                <div className="rounded-xl border border-slate-200 p-4 mb-4 bg-slate-50">
                  <p className="text-xs font-semibold text-slate-600 mb-2">Tell Stockly what you need — it can use your real past orders to fill in "the usual"</p>
                  <label htmlFor="assistant-input" className="sr-only">Describe what you need</label>
                  <textarea
                    id="assistant-input"
                    className={inputCls + " min-h-[70px] resize-y"}
                    placeholder={loadingHistory ? "Loading your order history…" : 'e.g. "Same as last time but add 5 cases of Coke"'}
                    value={assistantText}
                    onChange={e => setAssistantText(e.target.value)}
                    disabled={assistantBusy}
                  />
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mt-2">
                    <p className="text-[11px] text-slate-400">{orderHistory.length > 0 ? `Using your last ${orderHistory.length} order${orderHistory.length > 1 ? "s" : ""} as context.` : "No past orders yet — the assistant can only work from what you type here."}</p>
                    <button type="button" onClick={runAssistant} disabled={!assistantText.trim() || assistantBusy} className={btnDark + " !py-2 !px-3.5 text-xs disabled:opacity-40"}>{assistantBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}{assistantBusy ? "Thinking…" : "Draft my list"}</button>
                  </div>
                  {assistantNote && (
                    <div className="mt-3 bg-lime-50 border border-lime-200 rounded-lg px-3 py-2.5 text-xs text-slate-700 flex items-start gap-2">
                      <Sparkles size={13} className="text-lime-600 mt-0.5 flex-shrink-0" />
                      <span>{assistantNote}</span>
                    </div>
                  )}
                  {assistantError && (
                    <div role="alert" className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-xs text-red-600">{assistantError}</div>
                  )}
                  <p className="text-[11px] text-slate-400 mt-2">Nothing is ordered from this — it only fills in the editable draft below, which you review and confirm at the end.</p>
                </div>
              )}

              {itemMode === "manual" && (
                <div className="rounded-xl border border-slate-200 p-4 mb-4 bg-slate-50">
                  <p className="text-xs font-semibold text-slate-600 mb-2">Quick paste — type or paste a whole list at once</p>
                  <label htmlFor="quick-list" className="sr-only">Paste your stock list</label>
                  <textarea
                    id="quick-list"
                    className={inputCls + " min-h-[80px] resize-y"}
                    placeholder={"e.g.\n20 coke\n10 crisps\n5 milk"}
                    value={quickListText}
                    onChange={e => setQuickListText(e.target.value)}
                  />
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mt-2">
                    <p className="text-[11px] text-slate-400">One item per line, or comma-separated. A number at the start is read as the quantity.</p>
                    <button type="button" onClick={parseQuickList} disabled={!quickListText.trim()} className={btnDark + " !py-2 !px-3.5 text-xs disabled:opacity-40"}>Add to list</button>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {data.items.map((it) => (
                  <div key={it.id} className="rounded-xl border border-slate-200 p-4 relative">
                    <button type="button" onClick={() => removeItem(it.id)} aria-label="Remove item" className="absolute top-3 right-3 text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div><label className={labelCls}>Product</label><input className={inputCls} value={it.product} onChange={e => updateItem(it.id, { product: e.target.value })} placeholder="Coca-Cola" /></div>
                      <div><label className={labelCls}>Brand / spec</label><input className={inputCls} value={it.brand} onChange={e => updateItem(it.id, { brand: e.target.value })} placeholder="Original 330ml" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div><label className={labelCls}>Quantity</label><input type="number" min="1" className={inputCls} value={it.qty} onChange={e => updateItem(it.id, { qty: e.target.value })} /></div>
                      <div><label className={labelCls}>Unit</label><select className={inputCls} value={it.unit} onChange={e => updateItem(it.id, { unit: e.target.value })}>{["Cases", "Boxes", "Packs", "Bottles", "kg", "L", "Units"].map(u => <option key={u}>{u}</option>)}</select></div>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addItem} className={btnGhost + " w-full !py-2.5"}><Plus size={16} /> Add another product</button>

              {data.items.some(i => i.product.trim()) && (
                <div className="flex items-center justify-between bg-lime-50 border border-lime-200 rounded-xl px-4 py-3 mt-2">
                  <span className="text-sm text-slate-700">Estimated Stockly fee so far</span>
                  <span className="font-display font-bold text-slate-950">£{fee}</span>
                </div>
              )}
            </div>
          )}

          {step === 6 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display font-bold text-xl text-slate-950 mb-1">Extras & membership</h2>
                <p className="text-sm text-slate-500 mb-4">Add anything extra to this run, or register interest in a membership for regular stock runs.</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Add extras to this order</p>
                <div className="space-y-2">
                  {CHECKOUT_EXTRAS.map(ex => (
                    <button key={ex.id} type="button" onClick={() => toggleExtra(ex.id)} aria-pressed={data.extras.includes(ex.id)} className={`w-full text-left flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition ${data.extras.includes(ex.id) ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                      <span>
                        <span className="block text-sm font-semibold">{ex.name}</span>
                        <span className={`block text-xs mt-0.5 ${data.extras.includes(ex.id) ? "text-slate-300" : "text-slate-400"}`}>{ex.blurb}</span>
                      </span>
                      <span className="text-sm font-semibold shrink-0">+£{ex.price}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Membership (optional)</p>
                <p className="text-xs text-slate-400 mb-2.5">Membership billing isn't live yet. Picking a plan here notes it on this order only — press "Join waitlist" on a plan and the Stockly team will contact you to set it up.</p>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {MEMBERSHIP_PLANS.map(p => {
                    const isWaitlisted = membershipJoined === p.id;
                    return (
                    <div key={p.id} className={`text-left px-4 py-3 rounded-xl border transition ${data.membership === p.id ? "border-lime-400 bg-lime-50" : "border-slate-200 hover:border-slate-300"}`}>
                      <button type="button" onClick={() => set({ membership: p.id })} aria-pressed={data.membership === p.id} className="w-full text-left">
                        <span className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-900">{p.name}</span>
                          {p.price > 0 && <span className="text-xs font-semibold text-slate-500">£{p.price}/mo</span>}
                        </span>
                        <span className="block text-xs text-slate-500 mt-1">{p.blurb}</span>
                      </button>
                      {p.id !== "none" && (
                        isWaitlisted ? (
                          <p className="mt-2 text-xs font-semibold text-lime-700 flex items-center gap-1"><CheckCircle2 size={13} /> You're on the waitlist</p>
                        ) : (
                          <button
                            type="button"
                            onClick={() => joinMembershipWaitlist(p)}
                            disabled={membershipJoining}
                            className="mt-2 text-xs font-semibold text-slate-950 underline underline-offset-2 disabled:opacity-50"
                          >
                            {membershipJoining ? "Joining…" : "Join waitlist"}
                          </button>
                        )
                      )}
                    </div>
                    );
                  })}
                </div>
                {membershipError && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2.5">{membershipError}</p>}
                <p className="text-[11px] text-slate-400 mt-2.5">No payment is taken here or anywhere on Stockly yet — joining the waitlist just lets the team know you're interested, and they'll follow up to set up billing.</p>
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display font-bold text-xl text-slate-950 mb-1">Special instructions</h2>
                <p className="text-sm text-slate-500 mb-4">Anything our shopper or driver should know?</p>
                <label htmlFor="bk-notes" className="sr-only">Special instructions</label>
                <textarea id="bk-notes" className={inputCls + " min-h-[100px]"} value={data.notes} onChange={e => set({ notes: e.target.value })} placeholder="e.g. Please call on arrival — side entrance only." />
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Estimated Stockly service fee</p>
                <p className="font-display font-bold text-3xl text-slate-950">£{fee}</p>
                {extrasTotal > 0 && <p className="text-xs text-slate-500 mt-1">Includes £{extrasTotal} of extras.</p>}
                <p className="text-xs text-slate-500 mt-2">Product costs are separate and paid directly to the cash and carry. This estimate may change based on distance, order size, urgency and complexity.</p>
              </div>
            </div>
          )}

          {step === 8 && (
            <div className="space-y-4">
              <h2 className="font-display font-bold text-xl text-slate-950 mb-1">Review & confirm</h2>
              <p className="text-sm text-slate-500 mb-5">Check the details below, then submit your request.</p>
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
                <div className="flex justify-between gap-4 px-4 py-3"><span className="text-slate-500 shrink-0">Business</span><span className="font-medium text-slate-900 text-right">{data.businessName || "—"}</span></div>
                <div className="flex justify-between gap-4 px-4 py-3"><span className="text-slate-500 shrink-0">Delivery</span><span className="font-medium text-slate-900 text-right">{data.address ? `${data.address}, ${data.postcode}` : "—"}</span></div>
                <div className="flex justify-between gap-4 px-4 py-3"><span className="text-slate-500 shrink-0">Cash & carry</span><span className="font-medium text-slate-900 text-right">{data.cashAndCarry === "Other / specify" ? data.otherCashAndCarry : data.cashAndCarry || "—"}</span></div>
                <div className="flex justify-between gap-4 px-4 py-3"><span className="text-slate-500 shrink-0">Date</span><span className="font-medium text-slate-900 text-right">{data.date || "—"}{data.timeWindow ? ` · ${data.timeWindow}` : ""}</span></div>
                <div className="flex justify-between gap-4 px-4 py-3"><span className="text-slate-500 shrink-0">Products</span><span className="font-medium text-slate-900">{data.items.filter(i => i.product.trim()).length} items</span></div>
                <div className="flex justify-between gap-4 px-4 py-3"><span className="text-slate-500 shrink-0">Extras</span><span className="font-medium text-slate-900 text-right">{data.extras.length ? data.extras.map(id => CHECKOUT_EXTRAS.find(e => e.id === id)?.name).join(", ") : "None"}</span></div>
                <div className="flex justify-between gap-4 px-4 py-3"><span className="text-slate-500 shrink-0">Membership</span><span className="font-medium text-slate-900">{membershipPlan.name}</span></div>
                {(firstRunDiscountAmount > 0 || creditApplied > 0) ? (
                  <>
                    <div className="flex justify-between gap-4 px-4 py-3"><span className="text-slate-500">Subtotal</span><span className="text-slate-700">£{preDiscountFee}</span></div>
                    {firstRunDiscountAmount > 0 && (
                      <div className="flex justify-between gap-4 px-4 py-3"><span className="text-lime-700">First-run discount ({FIRST_RUN_DISCOUNT_PERCENT}% off)</span><span className="text-lime-700">−£{firstRunDiscountAmount}</span></div>
                    )}
                    {creditApplied > 0 && (
                      <div className="flex justify-between gap-4 px-4 py-3"><span className="text-lime-700">Referral credit applied</span><span className="text-lime-700">−£{creditApplied}</span></div>
                    )}
                    <div className="flex justify-between gap-4 px-4 py-3 border-t border-slate-100"><span className="font-semibold text-slate-900">Total fee</span><span className="font-bold text-slate-950">£{fee}</span></div>
                  </>
                ) : (
                  <div className="flex justify-between gap-4 px-4 py-3"><span className="text-slate-500">Estimated fee</span><span className="font-semibold text-slate-900">£{fee}</span></div>
                )}
              </div>
              <div className="bg-lime-50 border border-lime-200 text-slate-700 text-xs px-4 py-3 rounded-xl flex items-start gap-2">
                <Banknote size={15} className="text-lime-700 mt-0.5 flex-shrink-0" />
                <span>{PAYMENT_NOTE}</span>
              </div>
              <p className="text-xs text-slate-400">Submitting saves the run to your dashboard and opens WhatsApp with your full order, ready to send to the Stockly team.</p>
              {submitError && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{submitError}</p>}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 mt-6">
          <button onClick={() => step === 1 ? go("home") : setStep(s => s - 1)} className={btnGhost}><ChevronLeft size={16} /> Back</button>
          {step < totalSteps ? (
            <button onClick={() => canNext() && setStep(s => s + 1)} disabled={!canNext()} className={btnPrimary + (canNext() ? "" : " opacity-40 cursor-not-allowed")}>Continue <ChevronRight size={16} /></button>
          ) : (
            <button onClick={submit} disabled={submitting} className={btnPrimary + (submitting ? " opacity-60 cursor-not-allowed" : "")}>{submitting ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : <>Submit request <ArrowRight size={16} /></>}</button>
          )}
        </div>
      </Section>
    </div>
  );
}

/* ---------------------------------------------------------------------
   CUSTOMER DASHBOARD
--------------------------------------------------------------------- */
const PRIMARY_MENU = [
  { label: "Dashboard", tab: "Dashboard", icon: LayoutDashboard },
  { label: "New Single Run", action: "book", icon: Plus },
  { label: "Recurring Runs", tab: "Recurring Runs", icon: RotateCcw },
  { label: "My Runs", tab: "My Runs", icon: ClipboardList },
  { label: "Buy Again", tab: "Buy Again", icon: RotateCcw },
  { label: "Saved Lists", tab: "Saved Lists", icon: FileText },
  { label: "Documents", tab: "Documents", icon: FileText },
  { label: "Business Profile", tab: "Business Profile", icon: User },
  { label: "Settings", tab: "Settings", icon: Settings },
  { label: "Help", tab: "Help", icon: HelpCircle },
];
const SECONDARY_MENU = [
  { label: "Analytics", tab: "Analytics" },
  { label: "Referrals", tab: "Referrals" },
];

function DashLayout({ active, setActive, children, go, customer, onLogout, myOrders = [] }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Real notifications, built from this customer's actual orders — no
  // placeholder/demo entries. Most recently dated orders first.
  const notifs = [...myOrders]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 5)
    .map(o => ({
      t: `${o.status}`,
      b: `${o.id || o.dbId} · ${o.cashAndCarry || "Stock run"}`,
      time: o.date || "",
    }));
  const pick = (item) => {
    setMenuOpen(false);
    if (item.action === "book") go("book");
    else setActive(item.tab);
  };
  return (
    <div className="bg-slate-50 min-h-[80vh] relative">
      <div className="bg-white border-b border-slate-200">
        <Section className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setMenuOpen(true)} aria-label="Open menu" className="p-2 -ml-2 rounded-lg hover:bg-slate-100 text-slate-700"><Menu size={22} /></button>
            <button onClick={() => go("home")} className="hidden sm:block shrink-0" aria-label="Stockly home"><Logo size={26} /></button>
            <span className="text-sm font-semibold text-slate-700 truncate">{active}</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="relative">
              <button onClick={() => setNotifOpen(!notifOpen)} aria-label="Notifications" aria-expanded={notifOpen} className="p-2 rounded-lg hover:bg-slate-100 relative">
                <Bell size={18} className="text-slate-600" />
                {notifs.length > 0 && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-lime-400 rounded-full" />}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-72 max-w-[85vw] bg-white border border-slate-200 rounded-xl shadow-lg p-2 stk-fade-up z-20">
                  {notifs.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-6 px-2">No notifications yet — updates on your stock runs will show up here.</p>
                  )}
                  {notifs.map((n, i) => (
                    <div key={i} className="p-3 rounded-lg hover:bg-slate-50">
                      <p className="text-sm font-medium text-slate-900">{n.t}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{n.b}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{n.time}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="hidden sm:flex items-center gap-2 text-sm text-slate-700 min-w-0">
              <div className="w-8 h-8 rounded-full bg-slate-950 text-lime-300 flex items-center justify-center text-xs font-bold shrink-0">{(customer || "S")[0].toUpperCase()}</div>
              <span className="font-medium truncate max-w-[160px]">{customer}</span>
            </div>
            <button onClick={onLogout} aria-label="Log out" className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><LogOut size={18} /></button>
          </div>
        </Section>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-slate-950/40" onClick={() => setMenuOpen(false)} />
          <div className="relative bg-white w-72 max-w-[85vw] h-full shadow-xl flex flex-col stk-fade-up" role="dialog" aria-label="Dashboard menu">
            <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200">
              <Logo size={24} />
              <button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto py-3">
              {PRIMARY_MENU.map(item => (
                <button key={item.label} onClick={() => pick(item)} className={`w-full flex items-center gap-3 px-5 py-3 text-sm font-medium text-left transition ${active === item.tab ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-slate-100"}`}>
                  <item.icon size={17} /> {item.label}
                </button>
              ))}
              <div className="mt-2 pt-2 border-t border-slate-100">
                <p className="px-5 pt-2 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">More</p>
                {SECONDARY_MENU.map(item => (
                  <button key={item.label} onClick={() => pick(item)} className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium text-left transition ${active === item.tab ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t border-slate-200 p-3">
              <button onClick={() => { setMenuOpen(false); onLogout(); }} className="w-full flex items-center gap-3 px-2 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg"><LogOut size={17} /> Log Out</button>
            </div>
          </div>
        </div>
      )}

      <Section className="py-8">{children}</Section>
    </div>
  );
}

/* Builds a printable/downloadable HTML receipt for an order and
   triggers a real browser download — this is what "save the receipt
   to your files" and "print/email receipts" use under the hood. */
function downloadReceipt(order, account) {
  const itemRows = order.items.map(it => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;">${it.product}${it.brand ? ` (${it.brand})` : ""}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${it.qty} ${it.unit}</td></tr>`).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt ${order.id}</title></head>
  <body style="font-family:Arial,sans-serif;max-width:520px;margin:30px auto;color:#0f172a;">
    <h1 style="font-size:20px;margin-bottom:0;">Stockly — Stock Run Receipt</h1>
    <p style="color:#64748b;font-size:13px;margin-top:4px;">Order ${order.id} · ${order.date}</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;" />
    <p style="font-size:13px;"><strong>Business:</strong> ${account?.business_name || "—"}<br/>
    <strong>Delivered to:</strong> ${order.address}<br/>
    <strong>Cash & carry:</strong> ${order.cashAndCarry}</p>
    <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px;">
      <thead><tr><th style="text-align:left;padding:6px 10px;border-bottom:2px solid #0f172a;">Item</th><th style="text-align:right;padding:6px 10px;border-bottom:2px solid #0f172a;">Qty</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    <table style="width:100%;margin-top:16px;font-size:13px;">
      <tr><td style="padding:4px 10px;">Supplier total</td><td style="padding:4px 10px;text-align:right;">£${(order.supplierTotal || 0).toFixed(2)}</td></tr>
      <tr><td style="padding:4px 10px;">Stockly service fee</td><td style="padding:4px 10px;text-align:right;">£${order.serviceFee.toFixed(2)}</td></tr>
      <tr><td style="padding:4px 10px;font-weight:bold;">Total</td><td style="padding:4px 10px;text-align:right;font-weight:bold;">£${((order.supplierTotal || 0) + order.serviceFee).toFixed(2)}</td></tr>
    </table>
    <p style="color:#94a3b8;font-size:11px;margin-top:24px;">Stockly · ${OWNER_PHONE_DISPLAY} · ${OWNER_EMAIL}</p>
  </body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `Stockly-Receipt-${order.id}.html`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function emailReceipt(order, account) {
  const itemLines = order.items.map(it => `- ${it.qty} ${it.unit} ${it.product}${it.brand ? ` (${it.brand})` : ""}`).join("\n");
  const body = `Receipt for order ${order.id} (${order.date})\n\nBusiness: ${account?.business_name || ""}\nDelivered to: ${order.address}\nCash & carry: ${order.cashAndCarry}\n\nItems:\n${itemLines}\n\nSupplier total: £${(order.supplierTotal || 0).toFixed(2)}\nStockly service fee: £${order.serviceFee.toFixed(2)}\nTotal: £${((order.supplierTotal || 0) + order.serviceFee).toFixed(2)}`;
  window.open(`mailto:${account?.email || ""}?subject=${encodeURIComponent(`Your Stockly receipt — ${order.id}`)}&body=${encodeURIComponent(body)}`, "_blank");
}

function AccountTab({ account, setAccount }) {
  const [form, setForm] = useState({
    business_name: account?.business_name || "",
    full_name: account?.full_name || "",
    phone: account?.phone || "",
    contact_person: account?.contact_person || "",
    business_type: account?.business_type || "",
    delivery_address: account?.delivery_address || "",
    billing_address: account?.billing_address || "",
    vat_number: account?.vat_number || "",
    delivery_instructions: account?.delivery_instructions || "",
    business_notes: account?.business_notes || "",
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!account?.id) return;
    setSaving(true);
    setError("");
    try {
      const updated = await updateProfile(account.id, form);
      setAccount(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(err.message || "Couldn't save your changes — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const field = (key, label, placeholder = "") => (
    <div><label className={labelCls}>{label}</label><input className={inputCls} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder} /></div>
  );

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h3 className="font-display font-semibold text-slate-950">Business profile</h3>
        {field("business_name", "Business name")}
        {field("business_type", "Business type", "e.g. Takeaway, Restaurant, Bar")}
        {field("contact_person", "Contact person")}
        {field("full_name", "Your full name")}
        {field("phone", "Phone")}
        <div><label className={labelCls}>Email</label><input className={inputCls + " opacity-60"} value={account?.email || ""} disabled /></div>
        {field("delivery_address", "Delivery address")}
        {field("billing_address", "Billing address")}
        {field("vat_number", "VAT number")}
        {field("delivery_instructions", "Delivery instructions", "e.g. Side entrance only, ask for the manager")}
        <div>
          <label className={labelCls}>Business notes</label>
          <textarea className={inputCls} rows={3} value={form.business_notes} onChange={e => setForm({ ...form, business_notes: e.target.value })} />
        </div>
        {error && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <button onClick={save} disabled={saving} className={btnDark + (saving ? " opacity-60" : "")}>{saving ? "Saving…" : "Save changes"}</button>
        {saved && <p className="text-xs text-lime-600">Saved.</p>}
      </div>
    </div>
  );
}

const SUBSTITUTION_OPTIONS = [
  { id: "ask", label: "Always ask me" },
  { id: "similar_ok", label: "Similar product is okay" },
  { id: "never", label: "Never substitute" },
  { id: "max_extra", label: "Don't exceed £X extra" },
];

function SettingsTab({ account, setAccount }) {
  const [regenerating, setRegenerating] = useState(false);
  const [pref, setPref] = useState(account?.substitution_preference || "ask");
  const [maxExtra, setMaxExtra] = useState(account?.substitution_max_extra || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const changeLoginWord = async () => {
    if (!account?.id) return;
    setRegenerating(true);
    setError("");
    try {
      const updated = await regenerateLoginWord(account.id);
      setAccount(updated);
    } catch (err) {
      setError(err.message || "Couldn't generate a new Login Word.");
    } finally {
      setRegenerating(false);
    }
  };

  const savePrefs = async () => {
    setSaving(true);
    setError("");
    try {
      const updated = await updateProfile(account.id, {
        substitution_preference: pref,
        substitution_max_extra: pref === "max_extra" ? Number(maxExtra) || 0 : null,
      });
      setAccount(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(err.message || "Couldn't save your preference.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-slate-950 rounded-2xl p-6">
        <p className="text-xs font-semibold text-lime-300 uppercase tracking-wide">Your Stockly Login Word</p>
        <p className="text-slate-400 text-xs mt-1">Use this on a new device instead of typing your password — we'll still verify it's really you.</p>
        <div className="flex items-center gap-2 mt-4 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
          <span className="font-display font-bold text-white text-lg tracking-widest flex-1">{account?.login_word || "—"}</span>
          <button onClick={changeLoginWord} disabled={regenerating} className="text-xs font-semibold text-lime-300 hover:text-lime-200 disabled:opacity-50">{regenerating ? "Generating…" : "Change"}</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h3 className="font-display font-semibold text-slate-950">Substitution preference</h3>
        <p className="text-sm text-slate-500">If a product you ordered is unavailable, this is what we'll do by default.</p>
        <div className="space-y-2">
          {SUBSTITUTION_OPTIONS.map(o => (
            <label key={o.id} className="flex items-center gap-2.5 text-sm text-slate-700">
              <input type="radio" name="subpref" checked={pref === o.id} onChange={() => setPref(o.id)} />
              {o.label}
            </label>
          ))}
        </div>
        {pref === "max_extra" && (
          <div><label className={labelCls}>Maximum extra (£)</label><input type="number" min={0} className={inputCls} value={maxExtra} onChange={e => setMaxExtra(e.target.value)} /></div>
        )}
        {error && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <button onClick={savePrefs} disabled={saving} className={btnDark + (saving ? " opacity-60" : "")}>{saving ? "Saving…" : "Save preference"}</button>
        {saved && <p className="text-xs text-lime-600">Saved.</p>}
      </div>
    </div>
  );
}

function HelpTab() {
  const faqs = [
    { q: "How do I book a stock run?", a: "Use \"New Single Run\" from the menu for a one-off order, or set up a Recurring Run for stock you order on a schedule." },
    { q: "What if a product is unavailable?", a: "We'll show you the closest alternative before buying it — you can set a default in Settings so we don't need to ask every time." },
    { q: "How do I change my delivery address?", a: "Update it any time under Business Profile — it's reused on every future run." },
    { q: "I've lost access to my account", a: "Use your Stockly Login Word from a recognised device, or contact us using the details below and we'll help you back in." },
  ];
  return (
    <div className="max-w-lg space-y-4">
      {faqs.map((f, i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="font-semibold text-slate-900 text-sm">{f.q}</p>
          <p className="text-sm text-slate-500 mt-1.5">{f.a}</p>
        </div>
      ))}
      <div className="bg-slate-950 rounded-2xl p-6">
        <p className="text-sm text-slate-300">Still stuck? Reach the Stockly team directly:</p>
        <a href={`tel:${OWNER_PHONE_TEL}`} className="text-lime-300 font-semibold mt-2 block">{OWNER_PHONE_DISPLAY}</a>
        <p className="text-slate-400 text-xs mt-1">{OWNER_EMAIL}</p>
      </div>
    </div>
  );
}

function BuyAgainTab({ orders, onAddToRun }) {
  const history = buildProductHistory(orders);
  const [selected, setSelected] = useState(() => new Set());

  const toggle = (key) => setSelected(s => {
    const next = new Set(s);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const addAll = () => onAddToRun(history.map(h => ({ product: h.product, brand: h.brand, unit: h.unit, qty: 1 })));
  const addSelected = () => onAddToRun(
    history.filter(h => selected.has(`${h.product}|${h.brand}`)).map(h => ({ product: h.product, brand: h.brand, unit: h.unit, qty: 1 }))
  );

  if (history.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-10">Your frequently ordered products will show up here after your first few runs.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <button onClick={addAll} className={btnDark}><Plus size={16} /> Add all to Single Run</button>
        {selected.size > 0 && <button onClick={addSelected} className={btnGhost}>Add {selected.size} selected</button>}
      </div>
      <div className="space-y-2">
        {history.map(h => {
          const key = `${h.product}|${h.brand}`;
          return (
            <label key={key} className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-4 cursor-pointer">
              <input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 text-sm">{h.product}{h.brand ? ` — ${h.brand}` : ""}</p>
                <p className="text-xs text-slate-500 mt-0.5">Ordered {h.timesOrdered} time{h.timesOrdered === 1 ? "" : "s"}</p>
              </div>
              <button onClick={(e) => { e.preventDefault(); onAddToRun([{ product: h.product, brand: h.brand, unit: h.unit, qty: 1 }]); }} className={btnGhost + " !py-2 !px-3.5 text-xs shrink-0"}>Add to Single Run</button>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function SavedListsTab({ account, onAddToRun }) {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", items: [emptyItem()] });
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    if (!account?.id) return;
    setLoading(true);
    try {
      setLists(await fetchSavedLists(account.id));
      setError("");
    } catch (err) {
      setError(err.message || "Couldn't load your saved lists.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, [account?.id]);

  const updateItem = (id, patch) => setForm(f => ({ ...f, items: f.items.map(it => it.id === id ? { ...it, ...patch } : it) }));
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }));
  const removeItem = (id) => setForm(f => ({ ...f, items: f.items.length > 1 ? f.items.filter(it => it.id !== id) : f.items }));

  const save = async () => {
    const cleanItems = form.items.filter(i => i.product.trim()).map(i => ({ product: i.product, brand: i.brand, qty: i.qty, unit: i.unit }));
    if (!form.name.trim() || !cleanItems.length) { setError("Give it a name and at least one product."); return; }
    setSaving(true);
    setError("");
    try {
      await createSavedList(account.id, form.name.trim(), cleanItems);
      setForm({ name: "", items: [emptyItem()] });
      setCreating(false);
      await reload();
    } catch (err) {
      setError(err.message || "Couldn't save this list.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      await deleteSavedList(id);
      await reload();
    } catch (err) {
      setError(err.message || "Couldn't delete that list.");
    }
  };

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      {loading && <p className="text-sm text-slate-400">Loading your lists…</p>}
      {!loading && lists.map(l => (
        <div key={l.id} className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="font-semibold text-slate-900">{l.name}</p>
              <p className="text-sm text-slate-500 mt-1">{l.items.length} products</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => onAddToRun(l.items)} className={btnPrimary + " !py-2 !px-3.5 text-xs"}>Order this list</button>
              <button onClick={() => remove(l.id)} aria-label={`Delete list ${l.name}`} className="text-slate-400 hover:text-red-500 px-2"><Trash2 size={16} /></button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {l.items.slice(0, 6).map((it, i) => <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">{it.qty} {it.unit} {it.product}</span>)}
          </div>
        </div>
      ))}
      {!loading && lists.length === 0 && !creating && <p className="text-sm text-slate-400">No saved lists yet — build one for products you order the same way every time.</p>}

      {!creating ? (
        <button onClick={() => setCreating(true)} className={btnDark}><Plus size={16} /> Create list</button>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h3 className="font-display font-semibold text-slate-950">New saved list</h3>
          <div><label className={labelCls}>List name</label><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Weekly Essentials" /></div>
          <div>
            <label className={labelCls}>Products</label>
            <div className="space-y-2">
              {form.items.map(it => (
                <div key={it.id} className="flex gap-2">
                  <input className={inputCls} placeholder="Product" value={it.product} onChange={e => updateItem(it.id, { product: e.target.value })} />
                  <input className={inputCls + " w-20 shrink-0"} type="number" min={1} value={it.qty} onChange={e => updateItem(it.id, { qty: Number(e.target.value) || 1 })} />
                  <button onClick={() => removeItem(it.id)} aria-label="Remove product" className="text-slate-400 hover:text-red-500 px-2 shrink-0"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
            <button onClick={addItem} className="text-xs font-semibold text-slate-600 mt-2 flex items-center gap-1"><Plus size={13} /> Add product</button>
          </div>
          {error && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button onClick={() => { setCreating(false); setError(""); }} className={btnGhost}>Cancel</button>
            <button onClick={save} disabled={saving} className={btnPrimary + (saving ? " opacity-60" : "")}>{saving ? "Saving…" : "Save list"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

const FREQUENCIES = [
  { id: "weekly", label: "Every week" },
  { id: "biweekly", label: "Every 2 weeks" },
  { id: "monthly", label: "Every month" },
  { id: "custom", label: "Custom" },
];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function RecurringRunsTab({ account, recurring, reloadRuns, runsError, loadingRuns }) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", frequency: "weekly", dayOfWeek: "Tuesday", cashAndCarry: "", items: [emptyItem()] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const updateItem = (id, patch) => setForm(f => ({ ...f, items: f.items.map(it => it.id === id ? { ...it, ...patch } : it) }));
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }));
  const removeItem = (id) => setForm(f => ({ ...f, items: f.items.length > 1 ? f.items.filter(it => it.id !== id) : f.items }));

  const toggleActive = async (r) => {
    setBusyId(r.dbId);
    try {
      await setRecurringRunActive(r.dbId, !r.active);
      await reloadRuns();
    } catch (err) {
      setError(err.message || "Couldn't update that run.");
    } finally {
      setBusyId(null);
    }
  };

  const createRun = async () => {
    const cleanItems = form.items.filter(i => i.product.trim());
    if (!form.name.trim() || !cleanItems.length) { setError("Give it a name and at least one product."); return; }
    setSaving(true);
    setError("");
    try {
      await createRecurringRun(account.id, {
        name: form.name.trim(),
        frequency: form.frequency,
        dayOfWeek: form.frequency === "monthly" ? null : form.dayOfWeek,
        cashAndCarry: form.cashAndCarry,
      }, cleanItems);
      setForm({ name: "", frequency: "weekly", dayOfWeek: "Tuesday", cashAndCarry: "", items: [emptyItem()] });
      setCreating(false);
      await reloadRuns();
    } catch (err) {
      setError(err.message || "Couldn't save this recurring run — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {runsError && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{runsError}</p>}
      {loadingRuns && <p className="text-sm text-slate-400">Loading your recurring runs…</p>}

      {!loadingRuns && recurring.map(r => (
        <div key={r.dbId} className="bg-white rounded-2xl border border-slate-200 p-6 flex items-center justify-between flex-wrap gap-4">
          <div className="min-w-0">
            <p className="font-display font-semibold text-slate-950">{r.name}</p>
            <p className="text-sm text-slate-500 mt-1">{r.day}{r.cashAndCarry ? ` · ${r.cashAndCarry}` : ""} · {r.items.length} products</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${r.active ? "bg-lime-100 text-lime-700" : "bg-slate-100 text-slate-500"}`}>{r.active ? "Active" : "Paused"}</span>
            <button onClick={() => toggleActive(r)} disabled={busyId === r.dbId} className={btnGhost + " !py-2 !px-3.5 text-xs disabled:opacity-50"}>{r.active ? <><PauseCircle size={13} /> Pause</> : <><PlayCircle size={13} /> Resume</>}</button>
          </div>
        </div>
      ))}
      {!loadingRuns && recurring.length === 0 && !creating && <p className="text-sm text-slate-400">No recurring runs yet — set one up for the stock you order on a schedule.</p>}

      {!creating ? (
        <button onClick={() => setCreating(true)} className={btnDark}><Plus size={16} /> Create recurring run</button>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h3 className="font-display font-semibold text-slate-950">New recurring run</h3>
          <div><label className={labelCls}>Name</label><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Tuesday Takeaway Run" /></div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Frequency</label>
              <select className={inputCls} value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })}>
                {FREQUENCIES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
            {form.frequency !== "monthly" && (
              <div>
                <label className={labelCls}>Day of week</label>
                <select className={inputCls} value={form.dayOfWeek} onChange={e => setForm({ ...form, dayOfWeek: e.target.value })}>
                  {WEEKDAYS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}
          </div>
          <div><label className={labelCls}>Cash & carry / supplier</label><input className={inputCls} value={form.cashAndCarry} onChange={e => setForm({ ...form, cashAndCarry: e.target.value })} /></div>
          <div>
            <label className={labelCls}>Products</label>
            <div className="space-y-2">
              {form.items.map(it => (
                <div key={it.id} className="flex gap-2">
                  <input className={inputCls} placeholder="Product" value={it.product} onChange={e => updateItem(it.id, { product: e.target.value })} />
                  <input className={inputCls + " w-20 shrink-0"} type="number" min={1} value={it.qty} onChange={e => updateItem(it.id, { qty: Number(e.target.value) || 1 })} />
                  <button onClick={() => removeItem(it.id)} aria-label="Remove product" className="text-slate-400 hover:text-red-500 px-2 shrink-0"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
            <button onClick={addItem} className="text-xs font-semibold text-slate-600 mt-2 flex items-center gap-1"><Plus size={13} /> Add product</button>
          </div>
          {error && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button onClick={() => { setCreating(false); setError(""); }} className={btnGhost}>Cancel</button>
            <button onClick={createRun} disabled={saving} className={btnPrimary + (saving ? " opacity-60" : "")}>{saving ? "Saving…" : "Save recurring run"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function MyRunCard({ order: o, onRepeat, onReviewSub }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <button onClick={() => setOpen(!open)} className="w-full text-left" aria-expanded={open}>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{o.id} <span className="text-slate-400 font-normal text-sm">· {o.date} · Single Run</span></p>
            <p className="text-sm text-slate-500 mt-1">{o.cashAndCarry} → {o.address}</p>
          </div>
          <StatusPill status={o.status} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {o.items.slice(0, open ? o.items.length : 4).map((it, i) => <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">{it.qty} {it.unit} {it.product}</span>)}
          {!open && o.items.length > 4 && <span className="text-xs text-slate-400 px-2 py-1">+{o.items.length - 4} more</span>}
        </div>
      </button>

      {open && (
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-3 text-sm">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-500">Supplier total</p><p className="font-semibold text-slate-900 mt-1">£{(o.supplierTotal || 0).toFixed(2)}</p></div>
            <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-500">Service fee</p><p className="font-semibold text-slate-900 mt-1">£{o.serviceFee.toFixed(2)}</p></div>
            <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-500">Total</p><p className="font-semibold text-slate-900 mt-1">£{((o.supplierTotal || 0) + o.serviceFee).toFixed(2)}</p></div>
          </div>
          {o.shopper && <p className="text-slate-500">Shopper: <span className="text-slate-800 font-medium">{o.shopper}</span></p>}
          {o.driver && <p className="text-slate-500">Driver: <span className="text-slate-800 font-medium">{o.driver}</span></p>}
          {o.notes && <p className="text-slate-500">Notes: <span className="text-slate-800">{o.notes}</span></p>}
        </div>
      )}

      {o.substitution && (
        <button onClick={(e) => { e.stopPropagation(); onReviewSub(); }} className="mt-3 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full inline-flex items-center gap-1.5"><AlertCircle size={13} /> Substitution {o.substitution.resolved === "pending" ? "needs review" : o.substitution.resolved}</button>
      )}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100 gap-3">
        <div className="text-sm"><span className="text-slate-500">Service fee</span> <span className="font-semibold text-slate-900">£{o.serviceFee}</span></div>
        <button onClick={onRepeat} className={btnGhost + " !py-2 !px-3.5 text-xs shrink-0"}><RotateCcw size={13} /> Repeat Order</button>
      </div>
    </div>
  );
}

/* Useful empty state for a brand-new customer — explains what Stockly
   will show here and how to get started, instead of a wall of zero
   statistics. */
function DashboardEmptyState({ go, businessName }) {
  return (
    <div className="bg-slate-950 rounded-2xl p-8 sm:p-10 text-white stk-fade-up">
      <Badge tone="dark">Welcome{ businessName ? `, ${businessName}` : "" }</Badge>
      <h2 className="font-display font-bold text-2xl sm:text-3xl mt-4">Your Stockly dashboard is ready.</h2>
      <p className="text-slate-400 mt-3 max-w-lg leading-relaxed">Once you book your first stock run, everything lives here — live run tracking, receipts and documents, your spending analytics, and shortcuts to repeat any past order.</p>
      <div className="grid sm:grid-cols-3 gap-4 mt-8">
        {[
          { n: "1", t: "Book your first run", b: "Send your stock list — we'll collect it from your cash & carry and deliver it to your door." },
          { n: "2", t: "Track it live", b: "Watch each run move from Requested to Delivered, with substitutions flagged for your approval." },
          { n: "3", t: "Repeat in one tap", b: "Reorder your usual list in seconds from My Runs, Buy Again or Saved Lists." },
        ].map((s) => (
          <div key={s.n} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <span className="font-display text-lime-300 font-bold text-sm">{s.n}</span>
            <p className="font-semibold text-white text-sm mt-2">{s.t}</p>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{s.b}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row gap-3 mt-8">
        <button onClick={() => go("book")} className={btnPrimary + " !py-3.5"}>Book your first Stock Run <ArrowRight size={16} /></button>
        <button onClick={() => go("pricing")} className={btnGhost + " !border-slate-700 !text-slate-200 hover:!bg-slate-800 !py-3.5"}>See how pricing works</button>
      </div>
      <p className="text-xs text-slate-500 mt-6">Rather set up a weekly schedule? Open <strong className="text-slate-300">Recurring Runs</strong> from the menu — no order needed first.</p>
    </div>
  );
}

function CustomerDashboard({ go, account, setAccount, onLogout, setBookingPrefill }) {
  const [tab, setTab] = useState("Dashboard");
  const [repeatModal, setRepeatModal] = useState(null);
  const [subModal, setSubModal] = useState(null);
  const [copied, setCopied] = useState(false);
  const [runsSubTab, setRunsSubTab] = useState("Single");

  // Real data: single_runs and recurring_runs, scoped to this customer via
  // Supabase row-level security (see supabase/schema.sql). Both are
  // completely separate tables/lists, per the Single vs Recurring rule.
  const [myOrders, setMyOrders] = useState([]);
  const [myRecurring, setMyRecurring] = useState([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [runsError, setRunsError] = useState("");

  const reloadRuns = async () => {
    if (!account?.id) return;
    setLoadingRuns(true);
    setRunsError("");
    try {
      const [singles, recurrings] = await Promise.all([
        fetchSingleRuns(account.id),
        fetchRecurringRuns(account.id),
      ]);
      setMyOrders(singles);
      setMyRecurring(recurrings);
    } catch (err) {
      setRunsError(err.message || "Couldn't load your runs — please try again shortly.");
    } finally {
      setLoadingRuns(false);
    }
  };

  useEffect(() => { reloadRuns(); }, [account?.id]);

  const thisMonthOrders = myOrders.filter(o => o.date && o.date.startsWith(new Date().toISOString().slice(0, 7)));
  const totalFees = thisMonthOrders.reduce((s, o) => s + o.serviceFee, 0);
  const nextRun = myOrders.find(o => ["Requested", "Confirmed", "Purchasing", "Collected", "Out for Delivery"].includes(o.status));

  // Real analytics, built entirely from this customer's own orders — no
  // demo/placeholder figures.
  const realMonthlySpend = (() => {
    const byMonth = {};
    myOrders.filter(o => o.date).forEach(o => {
      const key = o.date.slice(0, 7); // YYYY-MM
      if (!byMonth[key]) byMonth[key] = { key, fees: 0, runs: 0 };
      byMonth[key].fees += o.serviceFee || 0;
      byMonth[key].runs += 1;
    });
    return Object.values(byMonth)
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-6)
      .map(m => ({
        month: new Date(m.key + "-01").toLocaleDateString("en-GB", { month: "short" }),
        fees: Math.round(m.fees * 100) / 100,
        runs: m.runs,
      }));
  })();

  const realTopProducts = (() => {
    const counts = {};
    myOrders.forEach(o => (o.items || []).forEach(it => {
      const name = it.product || it.name;
      if (!name) return;
      counts[name] = (counts[name] || 0) + (Number(it.qty) || 1);
    }));
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  })();

  const approveSub = async (order, approved) => {
    const resolved = approved ? "approved" : "rejected";
    setMyOrders(myOrders.map(o => o.dbId === order.dbId ? { ...o, substitution: { ...o.substitution, resolved } } : o));
    setSubModal(null);
    try {
      await resolveSubstitution(order.dbId, resolved, order.substitution);
    } catch (err) {
      setRunsError("Couldn't save that decision — please try again.");
    }
  };

  const copyReferral = () => {
    navigator.clipboard?.writeText(account?.referral_code || "").catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const addToRun = (items) => {
    setBookingPrefill(items);
    go("book");
  };

  const isFreshAccount = !loadingRuns && myOrders.length === 0 && myRecurring.length === 0;

  return (
    <DashLayout active={tab} setActive={setTab} go={go} customer={account?.full_name || account?.business_name || "Account"} onLogout={onLogout} myOrders={myOrders}>
      {tab === "Dashboard" && (
        <div className="space-y-6">
          {runsError && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{runsError}</p>}
          {loadingRuns && (
            <div className="space-y-4" aria-label="Loading dashboard">
              <div className="h-28 bg-white rounded-2xl border border-slate-200 animate-pulse" />
              <div className="grid sm:grid-cols-3 gap-5">
                <div className="h-32 bg-white rounded-2xl border border-slate-200 animate-pulse" />
                <div className="h-32 bg-white rounded-2xl border border-slate-200 animate-pulse" />
                <div className="h-32 bg-white rounded-2xl border border-slate-200 animate-pulse" />
              </div>
            </div>
          )}

          {!loadingRuns && isFreshAccount && <DashboardEmptyState go={go} businessName={account?.business_name} />}

          {!loadingRuns && !isFreshAccount && (
            <>
              {myOrders[0] && (
                <button
                  onClick={() => setRepeatModal(myOrders[0])}
                  className="w-full flex items-center justify-between gap-4 bg-slate-950 hover:bg-slate-800 transition text-white rounded-2xl px-6 py-5 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="bg-lime-300 text-slate-950 rounded-full p-2 flex-shrink-0"><RotateCcw size={18} /></div>
                    <div className="min-w-0">
                      <p className="font-display font-semibold">Repeat your last run</p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{myOrders[0].cashAndCarry} · {(myOrders[0].items || []).length} items · {myOrders[0].date}</p>
                    </div>
                  </div>
                  <ArrowRight size={18} className="flex-shrink-0" />
                </button>
              )}

              <div className="grid sm:grid-cols-3 gap-5">
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Next Stock Run</p>
                  {nextRun ? (
                    <>
                      <p className="font-display font-semibold text-xl text-slate-950 mt-2">{nextRun.date}</p>
                      <div className="mt-2"><StatusPill status={nextRun.status} /></div>
                    </>
                  ) : <p className="text-slate-400 text-sm mt-2">No runs scheduled</p>}
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">This Month</p>
                  <p className="font-display font-semibold text-xl text-slate-950 mt-2">{thisMonthOrders.length} stock runs</p>
                  <p className="text-sm text-slate-500 mt-1">£{totalFees} in service fees</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Business</p>
                  <p className="font-display font-semibold text-xl text-slate-950 mt-2 truncate">{account?.business_name || "—"}</p>
                  <p className="text-sm text-slate-500 mt-1 truncate">{account?.email}</p>
                </div>
              </div>

              {nextRun && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tracking {nextRun.id}</p>
                    <StatusPill status={nextRun.status} />
                  </div>
                  <StatusTracker status={nextRun.status} />
                </div>
              )}

              {myOrders.some(o => o.substitution && o.substitution.resolved === "pending") && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center gap-3">
                  <AlertCircle size={18} className="text-amber-600 shrink-0" />
                  <p className="text-sm text-amber-800">A substitution is awaiting your approval — open the run in My Runs to review it.</p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                  <h3 className="font-display font-semibold text-lg text-slate-950">Recent Orders</h3>
                  <button onClick={() => setTab("My Runs")} className="text-xs font-semibold text-slate-700 flex items-center gap-1">View all <ArrowRight size={13} /></button>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
                  {myOrders.slice(0, 4).map(o => (
                    <div key={o.id} className="flex items-center justify-between px-5 py-4 flex-wrap gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-900">{o.id} <span className="text-slate-400 font-normal">· {o.date}</span></p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{o.cashAndCarry}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusPill status={o.status} />
                        <button onClick={() => setRepeatModal(o)} className="text-xs font-semibold text-slate-950 flex items-center gap-1 shrink-0"><RotateCcw size={13} /> Repeat</button>
                      </div>
                    </div>
                  ))}
                  {myOrders.length === 0 && <p className="text-sm text-slate-400 text-center py-10">No single runs yet — <button onClick={() => go("book")} className="font-semibold text-slate-700 underline underline-offset-2">book your first one</button>.</p>}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "My Runs" && (
        <div className="space-y-4">
          <div className="inline-flex bg-slate-100 rounded-xl p-1" role="tablist" aria-label="Run type">
            <button role="tab" aria-selected={runsSubTab === "Single"} onClick={() => setRunsSubTab("Single")} className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${runsSubTab === "Single" ? "bg-white shadow-sm text-slate-950" : "text-slate-500"}`}>Single Runs</button>
            <button role="tab" aria-selected={runsSubTab === "Recurring"} onClick={() => setRunsSubTab("Recurring")} className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${runsSubTab === "Recurring" ? "bg-white shadow-sm text-slate-950" : "text-slate-500"}`}>Recurring Runs</button>
          </div>

          {runsSubTab === "Single" ? (
            <div className="space-y-4">
              {loadingRuns && <p className="text-sm text-slate-400 text-center py-10">Loading your runs…</p>}
              {!loadingRuns && myOrders.map(o => (
                <MyRunCard key={o.id} order={o} onRepeat={() => setRepeatModal(o)} onReviewSub={() => setSubModal(o)} />
              ))}
              {!loadingRuns && myOrders.length === 0 && <p className="text-sm text-slate-400 text-center py-10">No single runs yet — <button onClick={() => go("book")} className="font-semibold text-slate-700 underline underline-offset-2">book your first one</button>.</p>}
            </div>
          ) : (
            <div className="space-y-4">
              {loadingRuns && <p className="text-sm text-slate-400 text-center py-10">Loading your recurring runs…</p>}
              {!loadingRuns && myRecurring.map(r => (
                <div key={r.dbId} className="bg-white rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{r.name} <span className="text-slate-400 font-normal text-sm">· Recurring</span></p>
                      <p className="text-sm text-slate-500 mt-1">{r.day}{r.cashAndCarry ? ` · ${r.cashAndCarry}` : ""}</p>
                    </div>
                    <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${r.active ? "bg-lime-100 text-lime-700" : "bg-slate-100 text-slate-500"}`}>{r.active ? "Active" : "Paused"}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {r.items.map((it, i) => <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">{it.qty} {it.unit} {it.product}</span>)}
                  </div>
                </div>
              ))}
              {!loadingRuns && myRecurring.length === 0 && <p className="text-sm text-slate-400 text-center py-10">No recurring runs yet — set one up from the Recurring Runs page.</p>}
              <p className="text-xs text-slate-400">Note: recurring runs shown here are the standing schedules themselves. Automatic creation of a new run each cycle isn't built yet — for now, each occurrence needs to be actioned by the Stockly team.</p>
            </div>
          )}
        </div>
      )}

      {tab === "Recurring Runs" && (
        <RecurringRunsTab account={account} recurring={myRecurring} reloadRuns={reloadRuns} runsError={runsError} loadingRuns={loadingRuns} />
      )}

      {tab === "Buy Again" && (
        <BuyAgainTab orders={myOrders} onAddToRun={addToRun} />
      )}

      {tab === "Saved Lists" && (
        <SavedListsTab account={account} onAddToRun={addToRun} />
      )}

      {tab === "Documents" && (
        <div className="space-y-4">
          {loadingRuns && <p className="text-sm text-slate-400">Loading your documents…</p>}
          {!loadingRuns && myOrders.map(o => (
            <div key={o.id} className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{o.id} <span className="text-slate-400 font-normal text-sm">· {o.date}</span></p>
                  <p className="text-sm text-slate-500 mt-1">{o.cashAndCarry}</p>
                </div>
                <StatusPill status={o.status} />
              </div>
              <div className="grid sm:grid-cols-3 gap-3 mt-4 text-sm">
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-500">Supplier total</p><p className="font-semibold text-slate-900 mt-1">£{(o.supplierTotal || 0).toFixed(2)}</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-500">Stockly service fee</p><p className="font-semibold text-slate-900 mt-1">£{o.serviceFee.toFixed(2)}</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-500">Status</p><p className={`font-semibold mt-1 flex items-center gap-1 ${o.status === "Delivered" ? "text-lime-600" : "text-slate-500"}`}><CheckCircle2 size={14} /> {o.status}</p></div>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <button onClick={() => downloadReceipt(o, account)} className={btnGhost + " !py-2 !px-3.5 text-xs"}><Download size={13} /> Save to files</button>
                <button onClick={() => emailReceipt(o, account)} className={btnGhost + " !py-2 !px-3.5 text-xs"}><Mail size={13} /> Email receipt</button>
                <button onClick={() => window.print()} className={btnGhost + " !py-2 !px-3.5 text-xs"}><FileText size={13} /> Print</button>
              </div>
            </div>
          ))}
          {!loadingRuns && myOrders.length === 0 && <p className="text-sm text-slate-400 text-center py-10">Documents will appear here after your first stock run.</p>}
          <p className="text-xs text-slate-400">Note: downloads are currently a printable HTML receipt, not a formal PDF invoice — real PDF generation is a later enhancement.</p>
        </div>
      )}

      {tab === "Settings" && (
        <SettingsTab account={account} setAccount={setAccount} />
      )}

      {tab === "Help" && <HelpTab />}

      {tab === "Analytics" && (
        <div className="space-y-6">
          {realMonthlySpend.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
              <p className="text-sm text-slate-400">Analytics will appear here once you've completed some stock runs — figures are based on your real orders, no demo data.</p>
            </div>
          ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h3 className="font-display font-semibold text-slate-950 mb-4">Monthly service fees</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={realMonthlySpend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <Tooltip />
                  <Line type="monotone" dataKey="fees" stroke="#65a30d" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h3 className="font-display font-semibold text-slate-950 mb-4">Stock runs per month</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={realMonthlySpend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="runs" fill="#0f172a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          )}
          {realTopProducts.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="font-display font-semibold text-slate-950 mb-4">Most frequently ordered products</h3>
            <div className="space-y-3">
              {realTopProducts.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-5">{i + 1}</span>
                  <span className="text-sm text-slate-700 flex-1 truncate">{p.name}</span>
                  <div className="w-24 sm:w-32 h-2 bg-slate-100 rounded-full overflow-hidden shrink-0"><div className="h-full bg-lime-400" style={{ width: `${(p.count / (realTopProducts[0]?.count || 1)) * 100}%` }} /></div>
                  <span className="text-xs text-slate-500 w-6 text-right">{p.count}</span>
                </div>
              ))}
            </div>
          </div>
          )}
        </div>
      )}

      {tab === "Referrals" && (
        <div className="space-y-6">
          <div className="bg-slate-950 rounded-2xl p-7">
            <Gift className="text-lime-300 mb-3" size={24} />
            <h3 className="font-display font-bold text-xl text-white">Refer a business, both of you win.</h3>
            <p className="text-slate-400 text-sm mt-2 max-w-md">Share your code. When someone signs up with it and completes their first run, you get £{REFERRAL_REWARD_AMOUNT} credit automatically — it's applied straight to your next order's fee.</p>
            <div className="flex items-center gap-2 mt-5 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 max-w-xs">
              <span className="font-display font-bold text-lime-300 text-lg tracking-widest flex-1">{account?.referral_code || "—"}</span>
              <button onClick={copyReferral} aria-label="Copy referral code" className="text-slate-300 hover:text-white"><Copy size={16} /></button>
            </div>
            {copied && <p className="text-xs text-lime-300 mt-2">Copied!</p>}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Your referral credit</p>
            <p className="font-display font-bold text-3xl text-slate-950 mt-2">£{Number(account?.referral_credit || 0).toFixed(2)}</p>
            <p className="text-sm text-slate-500 mt-2">Applied automatically to your next run's service fee.</p>
          </div>
        </div>
      )}

      {tab === "Business Profile" && (
        <AccountTab account={account} setAccount={setAccount} />
      )}

      <Modal open={!!repeatModal} onClose={() => setRepeatModal(null)} title={repeatModal ? `Repeat ${repeatModal.id}` : ""}>
        {repeatModal && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Your previous list has been loaded into a new Single Run. You can edit quantities and items before submitting.</p>
            <div className="space-y-2 max-h-64 overflow-y-auto stockly-scroll">
              {repeatModal.items.map((it, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-sm gap-3">
                  <span className="text-slate-700 min-w-0">{it.product} {it.brand && <span className="text-slate-400">({it.brand})</span>}</span>
                  <span className="font-medium text-slate-900 shrink-0">{it.qty} {it.unit}</span>
                </div>
              ))}
            </div>
            <button onClick={() => { setBookingPrefill(repeatModal.items); setRepeatModal(null); go("book"); }} className={btnPrimary + " w-full"}>Repeat This Order</button>
          </div>
        )}
      </Modal>

      <Modal open={!!subModal} onClose={() => setSubModal(null)} title="Substitution required">
        {subModal && subModal.substitution && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
              <div className="flex justify-between gap-4 px-4 py-3"><span className="text-slate-500 shrink-0">Requested</span><span className="font-medium text-right">{subModal.substitution.requested}</span></div>
              <div className="flex justify-between gap-4 px-4 py-3"><span className="text-slate-500 shrink-0">Alternative</span><span className="font-medium text-right">{subModal.substitution.alternative}</span></div>
              <div className="flex justify-between gap-4 px-4 py-3"><span className="text-slate-500 shrink-0">Price difference</span><span className="font-medium text-amber-600">+£{subModal.substitution.diff}</span></div>
            </div>
            {subModal.substitution.resolved === "pending" ? (
              <div className="flex flex-col-reverse sm:flex-row gap-3">
                <button onClick={() => approveSub(subModal, false)} className={btnGhost + " flex-1"}>Reject</button>
                <button onClick={() => approveSub(subModal, true)} className={btnPrimary + " flex-1"}>Approve</button>
              </div>
            ) : (
              <p className="text-sm font-medium text-slate-700">This substitution was {subModal.substitution.resolved}.</p>
            )}
          </div>
        )}
      </Modal>
    </DashLayout>
  );
}

/* ---------------------------------------------------------------------
   REAL OPERATIONS DASHBOARDS
--------------------------------------------------------------------- */
function OpsAccessGate({ go, account, requiredRole, children }) {
  const allowed = requiredRole === "admin"
    ? Boolean(account?.is_admin)
    : requiredRole === "shopper"
      ? Boolean(account?.is_shopper || account?.is_admin)
      : Boolean(account?.is_driver || account?.is_admin);

  if (allowed) return children;

  return (
    <div className="min-h-[80vh] bg-slate-950 flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl stk-fade-up">
        <div className="w-12 h-12 rounded-2xl bg-lime-300/10 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="text-lime-300" size={22} />
        </div>
        <h1 className="font-display font-bold text-xl text-white">Operations access</h1>
        <p className="text-slate-400 text-sm mt-2 leading-relaxed">
          This area is available to authorised Stockly operations team members. Sign in with your Stockly ops account to continue.
        </p>
        <div className="flex flex-col-reverse sm:flex-row gap-2 mt-6">
          <button onClick={() => go("home")} className={btnGhost + " flex-1 !border-slate-700 !text-slate-300 hover:!bg-slate-800"}>Back</button>
          <button onClick={() => go("login")} className={btnPrimary + " flex-1"}>Sign in</button>
        </div>
      </div>
    </div>
  );
}

function OpsHeader({ go, account, label }) {
  return (
    <div className="bg-slate-950 border-b border-slate-800">
      <Section className="flex items-center justify-between h-16">
        <div className="flex items-center gap-8 min-w-0">
          <button onClick={() => go("home")} aria-label="Back to Stockly home"><Logo dark size={26} /></button>
          <span className="hidden sm:inline text-sm text-slate-500">/ {label}</span>
        </div>
        <div className="flex items-center gap-3 min-w-0">
          <div className="hidden sm:block text-right">
            <p className="text-xs font-semibold text-slate-200 truncate max-w-[220px]">{account?.full_name || account?.email || "Stockly Ops"}</p>
            <p className="text-[11px] text-slate-500">{account?.is_admin ? "Admin" : account?.is_shopper ? "Shopper" : "Driver"}</p>
          </div>
          <button onClick={() => go("home")} className="text-slate-300 hover:text-white flex items-center gap-1.5 text-sm shrink-0">
            <LogOut size={16} /> Exit
          </button>
        </div>
      </Section>
    </div>
  );
}

function OpsStatCard({ label, value, detail }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="font-display font-bold text-2xl text-slate-950 mt-2">{value}</p>
      {detail && <p className="text-xs text-slate-400 mt-1">{detail}</p>}
    </div>
  );
}

function AdminDashboard({ go, account }) {
  const [orders, setOrders] = useState([]);
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const [runs, opsTeam] = await Promise.all([fetchAllRuns(), fetchOpsTeam()]);
      setOrders(runs);
      setTeam(opsTeam);
    } catch (err) {
      setError(err?.message || "Couldn't load the operations board — please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const stats = buildOpsStats(orders);
  const visible = filter === "active"
    ? orders.filter(o => !["Delivered", "Cancelled"].includes(o.status))
    : filter === "unassigned"
      ? orders.filter(o => !o.assignedShopperId || !o.assignedDriverId)
      : orders;

  const shoppers = team.filter(person => person.is_shopper || person.is_admin);
  const drivers = team.filter(person => person.is_driver || person.is_admin);

  const changeStatus = async (order, direction) => {
    const index = RUN_STATUSES.indexOf(order.status);
    const targetIndex = Math.max(0, Math.min(RUN_STATUSES.length - 2, index + direction));
    const to = RUN_STATUSES[targetIndex];
    if (!to || to === order.status) return;

    setBusyId(order.dbId);
    setError("");
    try {
      await updateRunStatus(order.dbId, order.status, to);
      await reload();
    } catch (err) {
      setError(err?.message || "Couldn't update that run.");
    } finally {
      setBusyId("");
    }
  };

  const cancel = async order => {
    if (!["Delivered", "Cancelled"].includes(order.status) && window.confirm(`Cancel ${order.id}?`)) {
      setBusyId(order.dbId);
      setError("");
      try {
        await updateRunStatus(order.dbId, order.status, "Cancelled", "Cancelled by Stockly admin");
        await reload();
      } catch (err) {
        setError(err?.message || "Couldn't cancel that run.");
      } finally {
        setBusyId("");
      }
    }
  };

  const assign = async (order, kind, value) => {
    setBusyId(order.dbId);
    setError("");
    try {
      await assignRun(
        order.dbId,
        kind === "shopper" ? { shopperId: value || null } : { driverId: value || null },
        team
      );
      await reload();
    } catch (err) {
      setError(err?.message || "Couldn't save the assignment.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <OpsAccessGate go={go} account={account} requiredRole="admin">
      <div className="bg-slate-50 min-h-[80vh]">
        <OpsHeader go={go} account={account} label="Operations" />
        <Section className="py-8">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
            <div>
              <p className="text-xs font-semibold text-lime-700 uppercase tracking-wider">Live operations</p>
              <h1 className="font-display font-bold text-3xl text-slate-950 mt-1">Operations board</h1>
              <p className="text-sm text-slate-500 mt-1">Real Stockly runs from Supabase — no seeded orders.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => go("shopper")} className={btnGhost + " !py-2.5 text-xs"}>Shopper view</button>
              <button onClick={() => go("driver")} className={btnGhost + " !py-2.5 text-xs"}>Driver view</button>
              <button onClick={reload} disabled={loading} className={btnPrimary + " !py-2.5 text-xs" + (loading ? " opacity-60" : "")}>{loading ? "Refreshing…" : "Refresh"}</button>
            </div>
          </div>

          {error && <div role="alert" className="mb-5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>}

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
            <OpsStatCard label="All runs" value={stats.total} />
            <OpsStatCard label="Active" value={stats.active} />
            <OpsStatCard label="Requested" value={stats.requested} />
            <OpsStatCard label="Out for delivery" value={stats.outForDelivery} />
            <OpsStatCard label="Delivered this month" value={stats.deliveredThisMonth} detail={`${stats.unassigned} need assignment`} />
          </div>

          <div className="flex gap-2 mb-5 overflow-x-auto stockly-scroll pb-1" role="tablist" aria-label="Run filter">
            {[['all','All runs'], ['active','Active'], ['unassigned','Needs assignment']].map(([key, label]) => (
              <button key={key} role="tab" aria-selected={filter === key} onClick={() => setFilter(key)} className={`shrink-0 px-4 py-2 rounded-full text-xs font-semibold border transition ${filter === key ? "bg-slate-950 text-white border-slate-950" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}>{label}</button>
            ))}
          </div>

          {loading ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-sm text-slate-400">Loading live runs…</div>
          ) : visible.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center">
              <PackageCheck className="mx-auto text-slate-300" size={30} />
              <p className="font-semibold text-slate-700 mt-3">No runs in this view</p>
              <p className="text-sm text-slate-400 mt-1">New customer runs will appear here automatically.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visible.map(order => {
                const expanded = expandedId === order.dbId;
                const busy = busyId === order.dbId;
                return (
                  <div key={order.dbId} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-display font-bold text-lg text-slate-950">{order.id}</p>
                            <StatusPill status={order.status} />
                          </div>
                          <p className="text-sm text-slate-700 mt-1">{order.cashAndCarry || "Supplier not selected"}</p>
                          <p className="text-xs text-slate-400 mt-1 truncate">{order.address || "No delivery address"}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold text-slate-950">£{order.serviceFee.toFixed(2)}</p>
                          <p className="text-[11px] text-slate-400">Stockly fee</p>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-3 mt-4">
                        <label className="text-xs text-slate-500">
                          <span className="block mb-1 font-semibold">Shopper</span>
                          <select value={order.assignedShopperId || ""} disabled={busy} onChange={e => assign(order, "shopper", e.target.value)} className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-700">
                            <option value="">Unassigned</option>
                            {shoppers.map(person => <option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}
                          </select>
                        </label>
                        <label className="text-xs text-slate-500">
                          <span className="block mb-1 font-semibold">Driver</span>
                          <select value={order.assignedDriverId || ""} disabled={busy} onChange={e => assign(order, "driver", e.target.value)} className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-700">
                            <option value="">Unassigned</option>
                            {drivers.map(person => <option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}
                          </select>
                        </label>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-4">
                        <button disabled={busy || order.status === "Requested" || order.status === "Cancelled"} onClick={() => changeStatus(order, -1)} className={btnGhost + " !py-2 !px-3 text-xs disabled:opacity-40"}><ChevronLeft size={13} /> Previous</button>
                        <button disabled={busy || ["Delivered", "Cancelled"].includes(order.status)} onClick={() => changeStatus(order, 1)} className={btnPrimary + " !py-2 !px-3 text-xs disabled:opacity-40"}>Next <ChevronRight size={13} /></button>
                        <button disabled={busy || ["Delivered", "Cancelled"].includes(order.status)} onClick={() => cancel(order)} className="px-3 py-2 rounded-xl text-xs font-semibold text-red-600 border border-red-100 hover:bg-red-50 disabled:opacity-40">Cancel</button>
                        <button onClick={() => setExpandedId(expanded ? null : order.dbId)} aria-expanded={expanded} className="ml-auto px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50">{expanded ? "Hide details" : "View details"}</button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="border-t border-slate-100 bg-slate-50 p-5 grid lg:grid-cols-2 gap-5">
                        <div>
                          <h3 className="font-semibold text-sm text-slate-800 mb-3">Products</h3>
                          <div className="space-y-2">
                            {order.items.map((item, i) => (
                              <div key={item.id || i} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 flex items-center justify-between gap-3">
                                <div className="min-w-0"><p className="text-sm text-slate-800 truncate">{item.product}</p>{item.brand && <p className="text-[11px] text-slate-400">{item.brand}</p>}</div>
                                <span className="text-xs font-semibold text-slate-600 shrink-0">{item.qty} {item.unit}</span>
                              </div>
                            ))}
                            {!order.items.length && <p className="text-sm text-slate-400">No line items.</p>}
                          </div>
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm text-slate-800 mb-3">Run history</h3>
                          <div className="space-y-2 max-h-64 overflow-y-auto stockly-scroll">
                            {order.events.map(event => (
                              <div key={event.id} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5">
                                <div className="flex justify-between gap-3"><span className="text-xs font-semibold text-slate-700">{event.type}</span><span className="text-[10px] text-slate-400">{event.at ? new Date(event.at).toLocaleString("en-GB") : ""}</span></div>
                                <p className="text-xs text-slate-500 mt-1">{event.from ? `${event.from} → ` : ""}{event.to || ""}</p>
                                {event.note && <p className="text-[11px] text-slate-400 mt-1">{event.note}</p>}
                                <p className="text-[10px] text-slate-400 mt-1">{event.actor}</p>
                              </div>
                            ))}
                            {!order.events.length && <p className="text-sm text-slate-400">No events recorded yet.</p>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </OpsAccessGate>
  );
}

function ShopperDashboard({ go, account }) {
  const [orders, setOrders] = useState([]);
  const [openOrder, setOpenOrder] = useState(null);
  const [checked, setChecked] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try { setOrders(await fetchMyAssignedRuns(account.id, "shopper")); }
    catch (err) { setError(err?.message || "Couldn't load your assigned runs."); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (account?.id) reload(); }, [account?.id]);

  const myOrders = orders.filter(order => ["Confirmed", "Purchasing"].includes(order.status));

  const toggleCheck = (orderId, index) => {
    const key = `${orderId}-${index}`;
    setChecked(current => ({ ...current, [key]: !current[key] }));
  };

  const updateStatus = async (order, toStatus) => {
    setBusy(true); setError("");
    try { await updateRunStatus(order.dbId, order.status, toStatus); await reload(); setOpenOrder(null); }
    catch (err) { setError(err?.message || "Couldn't update this run."); }
    finally { setBusy(false); }
  };

  const uploadReceipt = async order => {
    setBusy(true); setError("");
    try { await setRunFlag(order.dbId, "receipt", true); await reload(); }
    catch (err) { setError(err?.message || "Couldn't save the receipt status."); }
    finally { setBusy(false); }
  };

  return (
    <OpsAccessGate go={go} account={account} requiredRole="shopper">
      <div className="bg-slate-50 min-h-[80vh]">
        <OpsHeader go={go} account={account} label="Shopper" />
        <Section className="py-7 max-w-2xl mx-auto">
          {error && <div role="alert" className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>}
          {!openOrder ? (
            <>
              <div className="flex items-end justify-between gap-3 mb-6">
                <div><p className="text-xs font-semibold text-lime-700 uppercase tracking-wider">Your queue</p><h1 className="font-display font-bold text-3xl text-slate-950 mt-1">Today's stock runs</h1><p className="text-sm text-slate-500 mt-1">{loading ? "Loading…" : `${myOrders.length} assigned to you`}</p></div>
                <button onClick={reload} disabled={loading} className={btnGhost + " !py-2.5 text-xs disabled:opacity-50"}>Refresh</button>
              </div>
              {loading ? <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-400">Loading your queue…</div> : myOrders.length === 0 ? <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center"><PackageCheck className="mx-auto text-slate-300" size={30}/><p className="font-semibold text-slate-700 mt-3">Nothing assigned right now</p><p className="text-sm text-slate-400 mt-1">New runs assigned to you will appear here.</p></div> : <div className="space-y-3">{myOrders.map(order => <button key={order.dbId} onClick={() => setOpenOrder(order)} className="w-full text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-slate-300 hover:-translate-y-0.5 transition"><div className="flex items-center justify-between gap-3"><p className="font-display font-bold text-lg text-slate-950">{order.id}</p><StatusPill status={order.status}/></div><p className="text-sm text-slate-600 mt-1">{order.cashAndCarry || "Supplier not set"}</p><div className="flex items-center gap-4 mt-3 text-xs text-slate-400"><span>{order.items.length} products</span><span>{order.date || "No date"}</span></div></button>)}</div>}
            </>
          ) : (
            <div>
              <button onClick={() => setOpenOrder(null)} className="text-sm text-slate-500 flex items-center gap-1 mb-4"><ChevronLeft size={16}/> Back</button>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-4"><div className="flex items-center justify-between gap-3"><h2 className="font-display font-bold text-2xl text-slate-950">{openOrder.id}</h2><StatusPill status={openOrder.status}/></div><p className="text-sm text-slate-500 mt-1">{openOrder.cashAndCarry}</p>{openOrder.notes && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-3">{openOrder.notes}</p>}</div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-4"><h3 className="font-semibold text-sm text-slate-700 mb-3">Shopping checklist</h3><div className="space-y-2.5">{openOrder.items.map((item, i) => { const key=`${openOrder.id}-${i}`; return <button key={item.id || i} onClick={() => toggleCheck(openOrder.id,i)} className="w-full flex items-center gap-3 text-left"><span className="shrink-0">{checked[key] ? <CheckCircle2 size={19} className="text-lime-600"/> : <Circle size={19} className="text-slate-300"/>}</span><span className={`text-sm ${checked[key] ? "text-slate-400 line-through" : "text-slate-800"}`}>{item.qty} {item.unit} {item.product}{item.brand && <span className="text-slate-400"> ({item.brand})</span>}</span></button>; })}</div></div>
              <div className="grid sm:grid-cols-2 gap-2.5"><button disabled={busy || openOrder.status !== "Confirmed"} onClick={() => updateStatus(openOrder,"Purchasing")} className={btnPrimary + " !py-3 disabled:opacity-40"}>Start purchasing</button><button disabled={busy || !["Confirmed","Purchasing"].includes(openOrder.status)} onClick={() => updateStatus(openOrder,"Collected")} className={btnGhost + " !py-3 disabled:opacity-40"}>Mark collected</button></div>
              <button disabled={busy} onClick={() => uploadReceipt(openOrder)} className={btnGhost + " w-full mt-2.5 !py-3 disabled:opacity-40"}><Upload size={16}/> {openOrder.receiptUploaded ? "Receipt recorded" : "Mark receipt uploaded"}</button>
            </div>
          )}
        </Section>
      </div>
    </OpsAccessGate>
  );
}

function DriverDashboard({ go, account }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const reload = async () => {
    setLoading(true); setError("");
    try { setOrders(await fetchMyAssignedRuns(account.id, "driver")); }
    catch (err) { setError(err?.message || "Couldn't load your deliveries."); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (account?.id) reload(); }, [account?.id]);

  const advance = async order => {
    const next = order.status === "Collected" ? "Out for Delivery" : "Delivered";
    setBusyId(order.dbId); setError("");
    try {
      await updateRunStatus(order.dbId, order.status, next);
      if (next === "Delivered") await setRunFlag(order.dbId, "pod", true);
      await reload();
    } catch (err) { setError(err?.message || "Couldn't update this delivery."); }
    finally { setBusyId(""); }
  };

  const myOrders = orders.filter(order => ["Collected", "Out for Delivery"].includes(order.status));

  return (
    <OpsAccessGate go={go} account={account} requiredRole="driver">
      <div className="bg-slate-50 min-h-[80vh]">
        <OpsHeader go={go} account={account} label="Driver" />
        <Section className="py-7 max-w-2xl mx-auto">
          {error && <div role="alert" className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>}
          <div className="flex items-end justify-between gap-3 mb-6"><div><p className="text-xs font-semibold text-lime-700 uppercase tracking-wider">Your route</p><h1 className="font-display font-bold text-3xl text-slate-950 mt-1">Deliveries</h1><p className="text-sm text-slate-500 mt-1">{loading ? "Loading…" : `${myOrders.length} assigned to you`}</p></div><button onClick={reload} disabled={loading} className={btnGhost + " !py-2.5 text-xs disabled:opacity-50"}>Refresh</button></div>
          {loading ? <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-400">Loading your deliveries…</div> : myOrders.length === 0 ? <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center"><Navigation className="mx-auto text-slate-300" size={30}/><p className="font-semibold text-slate-700 mt-3">No deliveries assigned</p><p className="text-sm text-slate-400 mt-1">Assigned deliveries will appear here.</p></div> : <div className="space-y-4">{myOrders.map(order => <div key={order.dbId} className="bg-white rounded-2xl border border-slate-200 p-5"><div className="flex items-center justify-between gap-3"><p className="font-display font-bold text-lg text-slate-950">{order.id}</p><StatusPill status={order.status}/></div><p className="text-sm text-slate-700 mt-2 font-medium">{order.address || "No delivery address"}</p><p className="text-xs text-slate-400 mt-1">{order.items.length} products · {order.cashAndCarry || "Supplier not set"}</p>{order.notes && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-3">{order.notes}</p>}<div className="flex flex-col sm:flex-row gap-2.5 mt-4"><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address || "")}`} target="_blank" rel="noreferrer" className={btnGhost + " flex-1 !py-2.5 text-xs"}><Navigation size={14}/> Navigate</a><button disabled={busyId===order.dbId} onClick={() => advance(order)} className={btnPrimary + " flex-1 !py-2.5 text-xs disabled:opacity-50"}>{order.status === "Collected" ? "Start delivery" : "Mark delivered"}</button></div>{order.podUploaded && <p className="text-xs text-lime-700 mt-3 font-semibold">✓ Proof of delivery recorded</p>}</div>)}</div>}
        </Section>
      </div>
    </OpsAccessGate>
  );
}

/* ---------------------------------------------------------------------
   LEGAL MODAL CONTENT
--------------------------------------------------------------------- */
const LEGAL_LAST_UPDATED = "11 September 2026";

function LegalSection({ heading, children }) {
  return (
    <div className="mb-5">
      <h4 className="font-semibold text-slate-800 text-sm mb-1.5">{heading}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function LegalPlaceholder({ children }) {
  return <span className="bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 text-xs font-medium">{children}</span>;
}

function LegalModalBody({ title }) {
  const wrap = "text-sm text-slate-500 leading-relaxed";
  const intro = <p className={`${wrap} mb-5`}>Last updated: {LEGAL_LAST_UPDATED}. Stockly is an early-stage service — this document reflects how Stockly genuinely operates today, not aspirational or standard boilerplate text.</p>;

  if (title === "Privacy Policy") return (
    <div className={wrap}>
      {intro}
      <LegalSection heading="What we collect">
        <p>When you create an account or submit a stock run, we collect your name, business name, phone number, email address, delivery address, and the details of the order itself (products, quantities, chosen cash & carry).</p>
      </LegalSection>
      <LegalSection heading="How it's stored">
        <p>Account and order data is stored using Supabase, a third-party database provider. Your login is handled by Supabase's authentication system — Stockly never sees or stores your password directly.</p>
      </LegalSection>
      <LegalSection heading="How it's used">
        <p>Your order details are shared with the Stockly team so your run can be collected and delivered. We don't sell your data or share it with anyone beyond what's needed to fulfil your order.</p>
      </LegalSection>
      <LegalSection heading="Your rights">
        <p>You can ask to see, correct, or delete the personal data Stockly holds about you at any time by contacting <a href={`tel:${OWNER_PHONE_TEL}`} className="text-slate-700 underline">{OWNER_PHONE_DISPLAY}</a> or {OWNER_EMAIL}.</p>
      </LegalSection>
      <LegalSection heading="Data controller">
        <p>Stockly, operated by <LegalPlaceholder>[registered business name/sole trader name to be confirmed]</LegalPlaceholder>, based at <LegalPlaceholder>[registered address to be confirmed]</LegalPlaceholder>.</p>
      </LegalSection>
    </div>
  );

  if (title === "Terms & Conditions") return (
    <div className={wrap}>
      {intro}
      <LegalSection heading="What Stockly does">
        <p>Stockly collects a stock order on your behalf from a cash & carry of your choosing and delivers it to your business. Stockly charges a separate service fee for this — it is not the price of the products themselves.</p>
      </LegalSection>
      <LegalSection heading="Payment">
        <p>Stockly does not take payment online. You pay for the products and the Stockly service fee directly — by cash or card — when your order is collected or delivered.</p>
      </LegalSection>
      <LegalSection heading="Availability">
        <p>Stockly currently operates in selected East London postcodes only, and as an early-stage service, delivery windows and availability are not guaranteed.</p>
      </LegalSection>
      <LegalSection heading="Accuracy of orders">
        <p>We do our best to match every item exactly, but stock availability at the cash & carry can change. Where a substitution is needed, we'll ask you first wherever possible.</p>
      </LegalSection>
      <LegalSection heading="Business details">
        <p>Stockly is operated by <LegalPlaceholder>[registered business name/sole trader name to be confirmed]</LegalPlaceholder>. Company registration number: <LegalPlaceholder>[to be confirmed]</LegalPlaceholder>.</p>
      </LegalSection>
    </div>
  );

  if (title === "Cookie Policy") return (
    <div className={wrap}>
      {intro}
      <LegalSection heading="What Stockly uses">
        <p>Stockly uses only the storage that's essential for the site to work: keeping you logged in (via Supabase's authentication) and remembering basic preferences on your own device, such as your last delivery address.</p>
      </LegalSection>
      <LegalSection heading="What Stockly doesn't use">
        <p>Stockly does not currently use advertising cookies, third-party tracking pixels, or analytics cookies that follow you across other websites.</p>
      </LegalSection>
    </div>
  );

  if (title === "Refund Policy" || title === "Cancellation Policy") return (
    <div className={wrap}>
      {intro}
      <LegalSection heading="Cancelling a run">
        <p>You can cancel a stock run any time before it's been collected by contacting the Stockly team directly on WhatsApp or by phone — there's no charge for cancelling before collection has started.</p>
      </LegalSection>
      <LegalSection heading="Refunds">
        <p>Since Stockly doesn't take payment online, refunds are handled directly between you and the Stockly team on a case-by-case basis — for example, if an item was wrong or the service fee charged doesn't match what was agreed.</p>
      </LegalSection>
    </div>
  );

  if (title === "Business Customer Agreement" || title === "Service Terms") return (
    <div className={wrap}>
      {intro}
      <LegalSection heading="Who this is for">
        <p>This covers businesses (shops, cafes, restaurants and similar) using Stockly on an ongoing basis, including recurring runs.</p>
      </LegalSection>
      <LegalSection heading="Recurring runs">
        <p>A recurring run can be paused or cancelled at any time before the next scheduled collection — there's no minimum commitment period.</p>
      </LegalSection>
      <LegalSection heading="Membership">
        <p>Stockly membership plans are not yet billed automatically — joining the waitlist registers your interest, and the Stockly team will contact you directly to set up billing once membership is live.</p>
      </LegalSection>
    </div>
  );

  return (
    <div className={wrap}>
      {intro}
      <p>This section is intended to be replaced with professionally reviewed legal documentation before wider launch.</p>
    </div>
  );
}

/* ---------------------------------------------------------------------
   ROOT APP
--------------------------------------------------------------------- */
export default function StocklyApp() {
  const [page, setPage] = useState("home");
  const [anchor, setAnchor] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [role, setRole] = useState("customer");
  const [account, setAccount] = useState(null);
  const [legal, setLegal] = useState({ open: false, title: "" });

  const [bookingPrefill, setBookingPrefill] = useState(null);

  // Restore a logged-in session from Supabase's real auth session when the
  // app reopens (this is what makes "stay logged in on this device" work —
  // Supabase persists the session token itself).
  useEffect(() => {
    let unsub;
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.user) {
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
        if (!cancelled && profile) {
          setAccount(profile);
          setLoggedIn(true);
          setRole(profile.is_admin ? "admin" : profile.is_shopper ? "shopper" : profile.is_driver ? "driver" : "customer");
        }
      }
      const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
        // Only treat an explicit, real sign-out as a sign-out. Other
        // events (like a token refresh attempt that briefly reports no
        // session — common right after a phone unlocks or a backgrounded
        // tab wakes up) should NOT wipe a real login.
        if (event === "SIGNED_OUT") {
          setAccount(null); setLoggedIn(false);
          return;
        }
        if (newSession?.user) {
          const { data: profile } = await supabase.from("profiles").select("*").eq("id", newSession.user.id).single();
          if (profile) {
            setAccount(profile);
            setLoggedIn(true);
            setRole(profile.is_admin ? "admin" : profile.is_shopper ? "shopper" : profile.is_driver ? "driver" : "customer");
          }
        }
      });
      unsub = () => listener.subscription.unsubscribe();
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, []);

  const go = (p, opts = {}) => {
    setPage(p);
    setAnchor(opts.anchor || null);
    window.scrollTo(0, 0);
  };

  const onAuth = async (r, acc) => {
    const resolvedRole = acc?.is_admin ? "admin" : acc?.is_shopper ? "shopper" : acc?.is_driver ? "driver" : "customer";
    setLoggedIn(true);
    setRole(resolvedRole);
    if (acc) setAccount(acc);
    go(resolvedRole === "customer" ? "dashboard" : resolvedRole);
  };
  const onLogout = async () => {
    await supabase.auth.signOut(); // clears the real session everywhere
    setLoggedIn(false); setAccount(null); setRole("customer");
    go("home");
  };
  const openLegal = (title) => setLegal({ open: true, title });

  let content;
  if (page === "home") content = <Home go={go} anchor={anchor} openLegal={openLegal} />;
  else if (page === "pricing") content = <Pricing go={go} />;
  else if (page === "service-area") content = <ServiceArea go={go} anchor={anchor} />;
  else if (page === "about") content = <About go={go} />;
  else if (page === "book") content = <Booking go={go} addOrder={() => {}} loggedIn={loggedIn} onAuth={onAuth} account={account} setAccount={setAccount} prefillItems={bookingPrefill} onConsumedPrefill={() => setBookingPrefill(null)} />;
  else if (page === "login") content = <AuthPage mode="login" go={go} onAuth={onAuth} />;
  else if (page === "signup") content = <AuthPage mode="signup" go={go} onAuth={onAuth} />;
  else if (page === "forgot") content = (
    <div className="min-h-[70vh] bg-slate-50 flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center stk-fade-up">
        <Lock className="mx-auto text-slate-400 mb-4" size={28} />
        <h1 className="font-display font-bold text-xl text-slate-950">Reset your password</h1>
        <p className="text-slate-500 text-sm mt-2">Password resets aren't automated yet — call or WhatsApp <a href={`tel:${OWNER_PHONE_TEL}`} className="font-semibold text-slate-700">{OWNER_PHONE_DISPLAY}</a> and the Stockly team will help you back in.</p>
        <button onClick={() => go("login")} className={btnDark + " mt-6"}>Back to log in</button>
      </div>
    </div>
  );
  else if (page === "dashboard") content = <CustomerDashboard go={go} account={account} setAccount={setAccount} onLogout={onLogout} setBookingPrefill={setBookingPrefill} />;
  else if (page === "admin") content = <AdminDashboard go={go} account={account} />;
  else if (page === "shopper") content = <ShopperDashboard go={go} account={account} />;
  else if (page === "driver") content = <DriverDashboard go={go} account={account} />;

  const isOpsView = ["admin", "shopper", "driver", "dashboard"].includes(page);

  return (
    <div className="min-h-screen bg-white font-body overflow-x-clip">
      <FontStyles />
      {!isOpsView && <NavBar go={go} page={page} loggedIn={loggedIn} role={role} />}
      {/* key={page} gives every navigation a smooth, lightweight fade-up
          transition without pulling in a routing/animation library. */}
      <div key={page} className="stk-fade-up">{content}</div>
      {!isOpsView && <Footer go={go} openLegal={openLegal} />}
      <Modal open={legal.open} onClose={() => setLegal({ open: false, title: "" })} title={legal.title}>
        <LegalModalBody title={legal.title} />
      </Modal>
    </div>
  );
}
