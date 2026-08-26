import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Package, Truck, MapPin, Clock, CheckCircle2, Circle, ShoppingCart, Calendar,
  BarChart3, Receipt, Users, ChevronRight, ChevronLeft, X, Menu, ArrowRight,
  ShieldCheck, Zap, Building2, RotateCcw, Plus, Trash2, Bell, LogOut, Sparkles,
  AlertCircle, Upload, Navigation, Store, Coffee, Wine, Scissors, UtensilsCrossed,
  Home as HomeIcon, ClipboardList, Settings, User, Lock, Mail, Phone, ArrowUpRight,
  CircleDot, PauseCircle, PlayCircle, FileText, PackageCheck, PackageSearch,
  Camera, Gift, Copy, Loader2, ImagePlus, Download, Percent, CreditCard, ShieldAlert,
  LayoutDashboard, HelpCircle
} from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "./supabaseClient";
import { lookupBarcodeProduct } from "./lib/barcode";
import {
  fetchSingleRuns, fetchRecurringRuns, createSingleRun, createRecurringRun,
  setRecurringRunActive, resolveSubstitution, updateProfile, regenerateLoginWord,
  fetchSavedLists, createSavedList, deleteSavedList, buildProductHistory,
} from "./lib/stocklyData";

/* ---------------------------------------------------------------------
   BUSINESS CONFIG — edit these to update contact details / admin access
--------------------------------------------------------------------- */
const OWNER_EMAIL = "prathamparmar849@gmail.com";
const OWNER_PHONE_DISPLAY = "+44 7951 780857";
const OWNER_PHONE_TEL = "+447951780857";
// Change this before launch — this is the passcode that gates the /admin dashboard.
const ADMIN_PASSCODE = "Stockly2026";

/* ---------------------------------------------------------------------
   PERSISTENT STORAGE HELPERS (window.storage — survives refresh/reopen)
   Accounts, orders and notifications are saved here so the business
   owner's dashboard is real and persists between visits.
--------------------------------------------------------------------- */
// NOTE: the original version of this file used the Claude-artifact-only
// `window.storage` API. That API doesn't exist outside claude.ai, so for a
// standalone deploy (e.g. Netlify) this uses the browser's localStorage
// instead. "shared" data and "personal" data are just namespaced under
// different key prefixes here — on a real deploy, all visitors share the
// same browser storage only on their own device (localStorage is per
// browser, not a real backend). For genuinely shared/multi-user data
// (e.g. the admin dashboard seeing every customer's orders) you'll want a
// real backend/database — see the note at the end of this chat.
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
function genReferralCode(name) {
  const base = (name || "STOCKLY").replace(/[^a-zA-Z]/g, "").slice(0, 5).toUpperCase() || "STK";
  return `${base}${Math.floor(100 + Math.random() * 900)}`;
}

/* Records a new signup / order / waitlist submission into SHARED storage
   so it appears live on the password-protected admin dashboard, and
   builds a pre-filled email so the owner gets notified. True silent
   server-side email delivery needs a backend/email API (see note in
   chat) — this opens a ready-to-send email + logs it for the dashboard. */
async function notifyOwner({ type, subject, lines, photoNote }) {
  const notifId = genId("NOTE");
  const record = { id: notifId, type, subject, lines, photoNote: photoNote || null, createdAt: new Date().toISOString(), read: false };
  const existing = (await storageGet("owner-notifications", true)) || [];
  await storageSet("owner-notifications", [record, ...existing].slice(0, 300), true);

  const bodyLines = lines.map(([k, v]) => `${k}: ${v}`).join("\n");
  const fullBody = `${bodyLines}${photoNote ? `\n\nPhoto note: ${photoNote}` : ""}\n\n— Sent automatically from the Stockly website.`;
  const mailto = `mailto:${OWNER_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(fullBody)}`;
  return { notifId, mailto };
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
    @keyframes stk-move { 0% { transform: translateX(0); } 100% { transform: translateX(calc(100% + 8px)); } }
    @keyframes stk-fade-up { from { opacity:0; transform: translateY(10px);} to {opacity:1; transform:translateY(0);} }
    .stk-fade-up { animation: stk-fade-up .5s ease both; }
  `}</style>
);

/* ---------------------------------------------------------------------
   DEMO DATA
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

/* Membership / plan and checkout add-on options — used at checkout so
   customers can add extras or take out a membership on any order. */
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

const DEMO_CUSTOMER = { business: "East London Takeaway", contact: "Amir Hussain", email: "amir@eastldntakeaway.co.uk" };

const seedOrders = () => ([
  {
    id: "STK-1048", date: "2026-08-25", cashAndCarry: "Bestway Hackney Wick",
    address: "14 Mare Street, Hackney, E8 3RH", status: "Confirmed", shopper: "Priya N.", driver: "",
    items: [
      { product: "Coca-Cola", qty: 10, unit: "Cases", brand: "Original 330ml" },
      { product: "Pepsi", qty: 5, unit: "Cases", brand: "Original 330ml" },
      { product: "Frozen Fries", qty: 4, unit: "Boxes", brand: "" },
      { product: "Cooking Oil", qty: 3, unit: "x 10L", brand: "" },
      { product: "Takeaway Packaging", qty: 2, unit: "Boxes", brand: "" },
    ],
    serviceFee: 68, supplierTotal: 412.50, receiptUploaded: false, podUploaded: false,
    substitution: null, notes: "Please call on arrival — side entrance only.",
  },
  {
    id: "STK-1047", date: "2026-08-18", cashAndCarry: "Booker Bow",
    address: "14 Mare Street, Hackney, E8 3RH", status: "Delivered", shopper: "Priya N.", driver: "Marcus O.",
    items: [
      { product: "Coca-Cola", qty: 10, unit: "Cases", brand: "Original 330ml" },
      { product: "Rice", qty: 6, unit: "x 20kg", brand: "Basmati" },
      { product: "Napkins", qty: 8, unit: "Packs", brand: "" },
    ],
    serviceFee: 58, supplierTotal: 301.20, receiptUploaded: true, podUploaded: true,
    substitution: null, notes: "",
  },
  {
    id: "STK-1046", date: "2026-08-11", cashAndCarry: "JJ Foodservice Enfield",
    address: "14 Mare Street, Hackney, E8 3RH", status: "Delivered", shopper: "Priya N.", driver: "Marcus O.",
    items: [
      { product: "Cooking Oil", qty: 5, unit: "x 10L", brand: "" },
      { product: "Chicken Thighs", qty: 12, unit: "x 2kg", brand: "" },
    ],
    serviceFee: 65, supplierTotal: 388.00, receiptUploaded: true, podUploaded: true,
    substitution: { requested: "10L Cooking Oil", unavailable: true, alternative: "15L Cooking Oil", diff: 4, resolved: "approved" },
    notes: "",
  },
  {
    id: "STK-1045", date: "2026-08-04", cashAndCarry: "Bestway Hackney Wick",
    address: "14 Mare Street, Hackney, E8 3RH", status: "Delivered", shopper: "Priya N.", driver: "Marcus O.",
    items: [
      { product: "Coca-Cola", qty: 8, unit: "Cases", brand: "Original 330ml" },
      { product: "Kitchen Roll", qty: 6, unit: "Packs", brand: "" },
    ],
    serviceFee: 52, supplierTotal: 214.60, receiptUploaded: true, podUploaded: true,
    substitution: null, notes: "",
  },
  {
    id: "STK-1044", date: "2026-08-24", cashAndCarry: "Costco Beckton",
    address: "220 High Street, Stratford, E15 2NE", status: "New", shopper: "", driver: "",
    items: [
      { product: "Toilet Roll", qty: 10, unit: "Packs", brand: "" },
      { product: "Cleaning Spray", qty: 6, unit: "Bottles", brand: "" },
    ],
    serviceFee: 55, supplierTotal: 176.30, receiptUploaded: false, podUploaded: false,
    substitution: null, notes: "Leave with front-of-house manager.",
  },
  {
    id: "STK-1043", date: "2026-08-24", cashAndCarry: "Dhamecha Barking",
    address: "9 Chatsworth Road, Clapton, E5 0LH", status: "Purchasing", shopper: "Priya N.", driver: "",
    items: [
      { product: "Vodka", qty: 6, unit: "x 70cl", brand: "Smirnoff" },
      { product: "Mixers", qty: 12, unit: "Cases", brand: "" },
    ],
    serviceFee: 71, supplierTotal: 502.00, receiptUploaded: false, podUploaded: false,
    substitution: null, notes: "",
  },
  {
    id: "STK-1042", date: "2026-08-25", cashAndCarry: "Booker Bow",
    address: "3 Roman Road, Bow, E3 5LU", status: "Collected", shopper: "Priya N.", driver: "Marcus O.",
    items: [
      { product: "Flour", qty: 10, unit: "x 16kg", brand: "" },
      { product: "Yeast", qty: 4, unit: "Packs", brand: "" },
    ],
    serviceFee: 60, supplierTotal: 245.00, receiptUploaded: true, podUploaded: false,
    substitution: null, notes: "",
  },
]);

const monthlySpend = [
  { month: "Mar", fees: 210, runs: 3 },
  { month: "Apr", fees: 245, runs: 4 },
  { month: "May", fees: 232, runs: 3 },
  { month: "Jun", fees: 268, runs: 4 },
  { month: "Jul", fees: 251, runs: 4 },
  { month: "Aug", fees: 260, runs: 4 },
];

const topProducts = [
  { name: "Coca-Cola (cases)", count: 34 },
  { name: "Cooking Oil (10L)", count: 21 },
  { name: "Frozen Fries", count: 18 },
  { name: "Takeaway Packaging", count: 15 },
  { name: "Kitchen Roll", count: 12 },
];

/* ---------------------------------------------------------------------
   HELPERS
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
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${styles[status] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status}
    </span>
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

function StocklyMark({ size = 32, dark = false }) {
  // Original abstract mark: two chevrons forming a stacked "S" / route-arrow motif
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="10" fill={dark ? "#0B1120" : "#0B1120"} />
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
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto stockly-scroll shadow-2xl stk-fade-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h3 className="font-display font-semibold text-lg text-slate-950">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X size={18} /></button>
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
                <div className={`h-full bg-lime-300 transition-all duration-700 ease-out`} style={{ width: i < active ? "100%" : i === active ? "50%" : "0%" }} />
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
        <button onClick={() => go("home")} className="shrink-0"><Logo dark size={30} /></button>
        <nav className="hidden lg:flex items-center gap-7">
          {links.map(l => (
            <button key={l.key} onClick={() => handle(l.target)} className="text-sm font-medium text-slate-300 hover:text-white transition">{l.label}</button>
          ))}
        </nav>
        <div className="hidden lg:flex items-center gap-3">
          {loggedIn ? (
            <button onClick={() => go(role === "admin" ? "admin" : role === "shopper" ? "shopper" : role === "driver" ? "driver" : "dashboard")} className={btnGhost + " !border-slate-600 !text-slate-200 hover:!bg-slate-900"}>
              <User size={16} /> Dashboard
            </button>
          ) : (
            <button onClick={() => go("login")} className="text-sm font-medium text-slate-300 hover:text-white transition">Log in</button>
          )}
          <button onClick={() => go("book")} className={btnPrimary}>Book a Stock Run</button>
        </div>
        <button className="lg:hidden text-white" onClick={() => setOpen(!open)}>{open ? <X size={24} /> : <Menu size={24} />}</button>
      </Section>
      {open && (
        <div className="lg:hidden border-t border-slate-800 px-6 py-4 flex flex-col gap-3 bg-slate-950">
          {links.map(l => (
            <button key={l.key} onClick={() => handle(l.target)} className="text-left text-sm font-medium text-slate-300 py-1.5">{l.label}</button>
          ))}
          <button onClick={() => handle(loggedIn ? "dashboard" : "login")} className="text-left text-sm font-medium text-slate-300 py-1.5">{loggedIn ? "Dashboard" : "Log in"}</button>
          <button onClick={() => handle("book")} className={btnPrimary + " mt-2"}>Book a Stock Run</button>
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
            <Badge tone="dark">Currently serving East London</Badge>
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
          <span>© 2026 Stockly Ltd. Currently operating in selected East London areas only.</span>
          <span>Registered in England & Wales · Demo MVP environment</span>
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
        <input value={value} onChange={e => setValue(e.target.value)} placeholder="Enter your postcode, e.g. E8 3RH"
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
                <span className="text-lime-300 font-semibold">£65 (est.)</span>
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
        <div className="bg-slate-950 rounded-2xl p-8">
          <PipelineAnimation />
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
            <p className="text-3xl font-display font-bold text-slate-950 mt-3">From £50</p>
            <p className="text-slate-500 text-sm mt-2">Perfect for businesses that only need occasional help. No subscription required.</p>
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
            <button onClick={() => go("book")} className="text-sm font-semibold text-slate-950 flex items-center gap-1.5">Repeat this order <ArrowRight size={14} /></button>
          </div>
        </div>
      </Section>

      {/* DASHBOARD PREVIEW */}
      <Section className="py-20 bg-slate-50">
        <div className="max-w-2xl mb-10">
          <Badge tone="soft">Your dashboard</Badge>
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-slate-950 mt-4">A serious tool for a serious operation.</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Next Stock Run</p>
            <p className="font-display font-semibold text-xl text-slate-950 mt-2">Tuesday, 25 August</p>
            <StatusPill status="Confirmed" />
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">This Month</p>
            <p className="font-display font-semibold text-xl text-slate-950 mt-2">4 stock runs</p>
            <p className="text-sm text-slate-500 mt-1">£260 in service fees</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Recent Order</p>
            <p className="font-display font-semibold text-xl text-slate-950 mt-2">STK-1048</p>
            <p className="text-sm text-slate-500 mt-1">Bestway Hackney Wick</p>
          </div>
        </div>
        <button onClick={() => go("login")} className={btnDark + " mt-8"}>View the dashboard <ArrowUpRight size={16} /></button>
      </Section>

      {/* AI COMING SOON */}
      <Section className="py-20 bg-slate-950">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="text-lime-300" size={22} />
          <Badge tone="dark">Coming Soon</Badge>
        </div>
        <h2 className="font-display font-bold text-3xl sm:text-4xl text-white max-w-2xl">AI Stock Assistant</h2>
        <p className="text-slate-400 mt-4 max-w-xl leading-relaxed">"Same order as last Tuesday, but add 5 cases of Coke." The assistant will understand your previous orders and prepare a new stock run in seconds.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
          {["Predict stock requirements", "Suggest reorder quantities", "Analyse receipts automatically", "Detect unusual spending", "Suggest substitutions", "Build weekly shopping lists", "Identify frequent products", "Flag price changes"].map((f, i) => (
            <div key={i} className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">{f}</div>
          ))}
        </div>
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

      {/* FAQ */}
      <Section id="faq" className="py-20 bg-slate-50 scroll-mt-16">
        <div className="max-w-2xl mb-10">
          <Badge tone="soft">FAQ</Badge>
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-slate-950 mt-4">Questions, answered.</h2>
        </div>
        <div className="max-w-3xl divide-y divide-slate-200 border-t border-b border-slate-200">
          {faqs.map((f, i) => (
            <div key={i}>
              <button onClick={() => setFaqOpen(faqOpen === i ? -1 : i)} className="w-full flex items-center justify-between py-5 text-left">
                <span className="font-medium text-slate-900">{f.q}</span>
                <ChevronRight size={18} className={`text-slate-400 transition-transform ${faqOpen === i ? "rotate-90" : ""}`} />
              </button>
              {faqOpen === i && <p className="text-slate-500 text-sm pb-5 leading-relaxed pr-8 stk-fade-up">{f.a}</p>}
            </div>
          ))}
        </div>
      </Section>

      {/* FINAL CTA */}
      <Section className="py-20 bg-slate-950">
        <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 px-8 py-14 text-center">
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-white">Ready to get your time back?</h2>
          <p className="text-slate-400 mt-3 max-w-md mx-auto">Book your first stock run today, or speak to us about a Stockly plan.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
            <button onClick={() => go("book")} className={btnPrimary + " !py-3.5 !px-7 text-base"}>Book a Stock Run</button>
            <button onClick={() => go("pricing")} className={btnGhost + " !border-slate-700 !text-slate-200 hover:!bg-slate-900 !py-3.5 !px-7 text-base"}>View pricing</button>
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
  const plans = [
    { name: "Essential", price: 99, features: ["1 scheduled stock run per week", "Order management", "Delivery", "Receipt confirmation", "Customer support"] },
    { name: "Business", price: 199, features: ["2 scheduled stock runs per week", "Priority scheduling", "Recurring orders", "Order history", "Receipt management", "Customer support"], featured: true },
    { name: "Pro", price: 349, features: ["3 scheduled stock runs per week", "Priority service", "Multiple locations", "Recurring orders", "Spending dashboard", "Priority support"] },
  ];
  return (
    <div className="bg-white">
      <div className="bg-slate-950 pt-16 pb-14">
        <Section>
          <Badge tone="dark">Pricing</Badge>
          <h1 className="font-display font-bold text-4xl sm:text-5xl text-white mt-4">Simple, transparent service fees.</h1>
          <p className="text-slate-400 mt-3 max-w-lg">Product costs are always paid directly to the cash and carry. These are Stockly's proposed service fees — actual pricing may vary based on distance, order size and requirements.</p>
          <div className="inline-flex bg-slate-900 border border-slate-800 rounded-xl p-1 mt-8">
            <button onClick={() => setTab("single")} className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition ${tab === "single" ? "bg-lime-300 text-slate-950" : "text-slate-300"}`}>Single Runs</button>
            <button onClick={() => setTab("plans")} className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition ${tab === "plans" ? "bg-lime-300 text-slate-950" : "text-slate-300"}`}>Memberships</button>
          </div>
        </Section>
      </div>

      {tab === "single" ? (
        <Section className="py-16">
          <div className="max-w-xl">
            <div className="rounded-2xl border border-slate-200 p-8">
              <h3 className="font-display font-semibold text-2xl text-slate-950">Single Stock Run</h3>
              <p className="text-4xl font-display font-bold text-slate-950 mt-3">From £50</p>
              <p className="text-slate-500 text-sm mt-2">Perfect for businesses that only need occasional help.</p>
              <ul className="mt-6 space-y-3 text-sm text-slate-700">
                {["Submit your shopping list", "Choose your preferred cash and carry", "We collect your stock", "You pay the cash and carry directly", "We deliver it to your business", "Receipt confirmation"].map((t, i) => (
                  <li key={i} className="flex items-center gap-2.5"><CheckCircle2 size={16} className="text-lime-500 shrink-0" /> {t}</li>
                ))}
              </ul>
              <div className="mt-6 bg-slate-50 rounded-xl p-4 text-xs text-slate-500 leading-relaxed">
                Product costs are separate. You pay the cash and carry directly. The £50+ fee is Stockly's service fee and may change based on distance, order size, urgency, number of locations and complexity.
              </div>
              <button onClick={() => go("book")} className={btnDark + " w-full mt-6"}>Book a Stock Run</button>
            </div>
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-6 flex items-start gap-3">
              <Zap size={18} className="text-slate-500 mt-0.5" />
              <div>
                <p className="font-semibold text-sm text-slate-900">Emergency runs from £100</p>
                <p className="text-xs text-slate-500 mt-1">Proposed Stockly pricing — may vary based on distance and requirements.</p>
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
                <button onClick={() => go("book")} className={`w-full mt-7 ${p.featured ? btnPrimary : btnDark}`}>Choose {p.name}</button>
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
    const { mailto } = await notifyOwner({
      type: "waitlist",
      subject: `Waitlist signup — ${wl.business || wl.name}`,
      lines: [
        ["Name", wl.name], ["Business", wl.business], ["Email", wl.email],
        ["Phone", wl.phone], ["Business type", wl.type], ["Postcode", wl.postcode],
      ],
    });
    window.open(mailto, "_blank");
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
              <label className={labelCls}>Name</label>
              <input required className={inputCls} value={wl.name} onChange={e => setWl({ ...wl, name: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Business name</label>
              <input required className={inputCls} value={wl.business} onChange={e => setWl({ ...wl, business: e.target.value })} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Email</label>
                <input required type="email" className={inputCls} value={wl.email} onChange={e => setWl({ ...wl, email: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input required className={inputCls} value={wl.phone} onChange={e => setWl({ ...wl, phone: e.target.value })} />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Business type</label>
                <select required className={inputCls} value={wl.type} onChange={e => setWl({ ...wl, type: e.target.value })}>
                  <option value="">Select type</option>
                  {BUSINESS_TYPES.map(b => <option key={b.label}>{b.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Postcode</label>
                <input required className={inputCls} value={wl.postcode} onChange={e => setWl({ ...wl, postcode: e.target.value })} />
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
   AUTH (demo)
--------------------------------------------------------------------- */
function AuthPage({ mode, go, onAuth, prefill, referralFromLink }) {
  const [form, setForm] = useState({
    name: "", business: "", email: prefill?.email || "", phone: "", password: "",
    referralCode: referralFromLink || "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.email.trim() || !form.password.trim()) { setError("Email and password are required."); return; }
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
          setError("");
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
        <form onSubmit={submit} className="mt-7 space-y-4">
          {mode === "signup" && (
            <>
              <div>
                <label className={labelCls}>Full name</label>
                <div className="relative"><User size={16} className="absolute left-3.5 top-3.5 text-slate-400" /><input className={inputCls + " pl-10"} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Amir Hussain" /></div>
              </div>
              <div>
                <label className={labelCls}>Business name</label>
                <div className="relative"><Building2 size={16} className="absolute left-3.5 top-3.5 text-slate-400" /><input className={inputCls + " pl-10"} value={form.business} onChange={e => setForm({ ...form, business: e.target.value })} placeholder="East London Takeaway" /></div>
              </div>
            </>
          )}
          <div>
            <label className={labelCls}>Email</label>
            <div className="relative"><Mail size={16} className="absolute left-3.5 top-3.5 text-slate-400" /><input type="email" className={inputCls + " pl-10"} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@business.co.uk" /></div>
          </div>
          {mode === "signup" && (
            <div>
              <label className={labelCls}>Phone</label>
              <div className="relative"><Phone size={16} className="absolute left-3.5 top-3.5 text-slate-400" /><input className={inputCls + " pl-10"} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="07..." /></div>
            </div>
          )}
          <div>
            <label className={labelCls}>Password</label>
            <div className="relative"><Lock size={16} className="absolute left-3.5 top-3.5 text-slate-400" /><input type="password" className={inputCls + " pl-10"} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" /></div>
          </div>
          {mode === "signup" && (
            <div>
              <label className={labelCls}>Referral code <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
              <div className="relative"><Gift size={16} className="absolute left-3.5 top-3.5 text-slate-400" /><input className={inputCls + " pl-10"} value={form.referralCode} onChange={e => setForm({ ...form, referralCode: e.target.value.toUpperCase() })} placeholder="e.g. AMIR284" /></div>
              <p className="text-[11px] text-slate-400 mt-1.5">Got a code from another business? Enter it — once you place your first order or take a membership, they get rewarded.</p>
            </div>
          )}
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          {mode === "login" && <button type="button" onClick={() => go("forgot")} className="text-xs font-medium text-slate-500 hover:text-slate-800">Forgot password?</button>}
          <button type="submit" disabled={busy} className={btnPrimary + " w-full !py-3.5" + (busy ? " opacity-60" : "")}>{busy ? <Loader2 size={16} className="animate-spin" /> : null}{mode === "signup" ? "Create account" : "Log in"}</button>
        </form>
        <p className="text-center text-sm text-slate-500 mt-6">
          {mode === "signup" ? (
            <>Already have an account? <button onClick={() => go("login")} className="text-slate-950 font-semibold">Log in</button></>
          ) : (
            <>New to Stockly? <button onClick={() => go("signup")} className="text-slate-950 font-semibold">Create an account</button></>
          )}
        </p>
        <div className="border-t border-slate-100 mt-6 pt-5 text-center">
          <p className="text-xs text-slate-400">Business owner? Manage operations from the <button onClick={() => go("admin")} className="font-semibold text-slate-600 underline underline-offset-2">password-protected ops dashboard</button>.</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   BOOKING FLOW
--------------------------------------------------------------------- */
const emptyItem = () => ({ id: Math.random().toString(36).slice(2), product: "", qty: 1, unit: "Cases", brand: "", notes: "" });

/* Sends a photo to a Netlify Function (netlify/functions/recognize-items.js)
   which holds a real Anthropic API key server-side and does the actual
   vision call — this is what powers "take a photo, we'll add the items".
   The browser never sees the API key. */
async function recognizeItemsFromPhoto(base64Data, mediaType) {
  const response = await fetch("/.netlify/functions/recognize-items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64Data, mediaType }),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error || "Couldn't read that photo right now.");
  }
  return json.items;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

/* Live camera barcode scanning using the browser's native BarcodeDetector
   API (supported in Chrome/Edge on Android and desktop as of this
   writing). Where it isn't supported, we say so plainly and let the
   customer type the barcode number instead — we never fake a scan. */
function LiveBarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [error, setError] = useState("");
  const supported = typeof window !== "undefined" && "BarcodeDetector" in window;

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    let detector;
    (async () => {
      try {
        detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
      } catch {
        setError("This browser can't detect the barcode formats we need.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setError("Couldn't access the camera — check your browser's camera permission for this site.");
        return;
      }

      const tick = async () => {
        if (cancelled || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) {
            onDetected(codes[0].rawValue);
            return; // stop polling — parent will close us
          }
        } catch {
          // transient decode errors are normal while framing the barcode — keep polling
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [supported]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
      <div className="flex items-center justify-between px-5 h-14 shrink-0">
        <p className="text-white font-semibold text-sm">Scan Barcode</p>
        <button onClick={onClose} className="text-slate-300 hover:text-white p-2"><X size={22} /></button>
      </div>
      <div className="flex-1 relative flex items-center justify-center">
        {supported && !error ? (
          <>
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
            <div className="absolute w-4/5 max-w-sm aspect-[3/1] border-2 border-lime-300 rounded-xl pointer-events-none" />
          </>
        ) : (
          <div className="text-center px-8">
            <p className="text-slate-300 text-sm">{error || "Live barcode scanning isn't supported in this browser — try Chrome on Android or desktop, or type the barcode number instead."}</p>
          </div>
        )}
      </div>
      <p className="text-slate-400 text-xs text-center pb-6 px-8">Hold the barcode steady inside the frame.</p>
    </div>
  );
}

function Booking({ go, addOrder, loggedIn, onAuth, account, prefillItems, onConsumedPrefill }) {
  const [step, setStep] = useState(1);
  const totalSteps = 8;
  const [data, setData] = useState({
    businessName: account?.business_name || account?.business || "", contactName: account?.full_name || account?.name || "", phone: account?.phone || "", email: account?.email || "", businessType: "",
    address: "", postcode: "",
    cashAndCarry: "", otherCashAndCarry: "",
    date: "", urgency: "standard",
    items: (prefillItems && prefillItems.length) ? prefillItems.map(it => ({ ...emptyItem(), ...it, id: Math.random().toString(36).slice(2) })) : [emptyItem()],
    notes: "",
    membership: account?.membership && account.membership !== "none" ? account.membership : "none",
    extras: [],
  });

  // Prefilled items (from "Repeat Order") are only meant for this one
  // visit to the booking form — clear them so a later, unrelated visit
  // to /book doesn't silently reuse a past order's items.
  useEffect(() => { if (prefillItems && prefillItems.length) onConsumedPrefill?.(); }, []);
  const [pcResult, setPcResult] = useState(null);
  const [done, setDone] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [itemMode, setItemMode] = useState("manual"); // "manual" | "photo" | "barcode"
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [photoPreview, setPhotoPreview] = useState(null);
  const fileInputRef = useRef(null);

  const set = (patch) => setData(d => ({ ...d, ...patch }));

  const updateItem = (id, patch) => set({ items: data.items.map(it => it.id === id ? { ...it, ...patch } : it) });
  const addItem = () => set({ items: [...data.items, emptyItem()] });
  const removeItem = (id) => set({ items: data.items.length > 1 ? data.items.filter(it => it.id !== id) : data.items });

  // Barcode scanning (Stage 6): scan/type a barcode → look it up → show a
  // confirmation the customer must explicitly accept before it's added.
  const [scannerOpen, setScannerOpen] = useState(false);
  const [barcodeManual, setBarcodeManual] = useState("");
  const [barcodeBusy, setBarcodeBusy] = useState(false);
  const [barcodeError, setBarcodeError] = useState("");
  const [barcodeDraft, setBarcodeDraft] = useState(null); // { barcode, product, brand, category, packSize, imageUrl, qty, notFound }

  const runBarcodeLookup = async (code) => {
    setScannerOpen(false);
    setBarcodeBusy(true);
    setBarcodeError("");
    setBarcodeDraft(null);
    try {
      const found = await lookupBarcodeProduct(code);
      setBarcodeDraft(found ? { ...found, qty: 1, notFound: false } : { barcode: code.replace(/\D/g, ""), product: "", brand: "", category: "", packSize: "", imageUrl: "", qty: 1, notFound: true });
    } catch (err) {
      setBarcodeError("Couldn't look that barcode up right now — you can still add it manually below.");
      setBarcodeDraft({ barcode: code.replace(/\D/g, ""), product: "", brand: "", category: "", packSize: "", imageUrl: "", qty: 1, notFound: true });
    } finally {
      setBarcodeBusy(false);
    }
  };

  const confirmBarcodeDraft = () => {
    if (!barcodeDraft.product.trim()) { setBarcodeError("Add a product name before confirming."); return; }
    set({
      items: [
        ...data.items.filter(i => i.product.trim()),
        {
          id: Math.random().toString(36).slice(2),
          product: barcodeDraft.product, brand: barcodeDraft.brand,
          qty: barcodeDraft.qty || 1, unit: "Units",
          notes: barcodeDraft.packSize ? `Pack size: ${barcodeDraft.packSize}` : "",
          barcode: barcodeDraft.barcode, category: barcodeDraft.category, imageUrl: barcodeDraft.imageUrl,
        },
      ],
    });
    setBarcodeDraft(null);
    setBarcodeManual("");
    setBarcodeError("");
  };

  const toggleExtra = (id) => set({ extras: data.extras.includes(id) ? data.extras.filter(x => x !== id) : [...data.extras, id] });

  const extrasTotal = useMemo(() => data.extras.reduce((s, id) => s + (CHECKOUT_EXTRAS.find(e => e.id === id)?.price || 0), 0), [data.extras]);
  const membershipPlan = MEMBERSHIP_PLANS.find(p => p.id === data.membership) || MEMBERSHIP_PLANS[0];

  const fee = useMemo(() => {
    const base = 50;
    const extra = Math.max(0, data.items.filter(i => i.product.trim()).length - 5) * 4;
    const urgencyAdj = data.urgency === "emergency" ? 40 : 0;
    return Math.round((base + extra + urgencyAdj) / 5) * 5 + extrasTotal;
  }, [data.items, data.urgency, extrasTotal]);

  const canNext = () => {
    if (step === 1) return data.businessName && data.contactName && data.phone && data.email && data.businessType;
    if (step === 2) return data.address && data.postcode && pcResult && pcResult.valid;
    if (step === 3) return data.cashAndCarry && (data.cashAndCarry !== "Other / specify" || data.otherCashAndCarry);
    if (step === 4) return data.date;
    if (step === 5) return data.items.some(i => i.product.trim());
    return true;
  };

  const checkPc = () => setPcResult(checkPostcode(data.postcode));

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError("");
    setPhotoBusy(true);
    setPhotoPreview(URL.createObjectURL(file));
    try {
      const base64 = await fileToBase64(file);
      const found = await recognizeItemsFromPhoto(base64, file.type || "image/jpeg");
      if (Array.isArray(found) && found.length) {
        const newItems = found.map(f => ({
          id: Math.random().toString(36).slice(2),
          product: f.product || "", brand: f.brand || "",
          qty: f.qty || 1, unit: f.unit || "Units", notes: "",
        }));
        const existingBlank = data.items.every(i => !i.product.trim());
        set({ items: existingBlank ? newItems : [...data.items.filter(i => i.product.trim()), ...newItems] });
      } else {
        setPhotoError("Couldn't identify any products in that photo — try a clearer shot or add items manually.");
      }
    } catch (err) {
      setPhotoError(err.message || "Something went wrong reading that photo. Please try again or add items manually.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const cleanItems = data.items.filter(i => i.product.trim());
    const cashAndCarry = data.cashAndCarry === "Other / specify" ? data.otherCashAndCarry : data.cashAndCarry;
    const deliveryAddress = `${data.address}, ${data.postcode}`;

    setSubmitError("");
    setSubmitting(true);
    let order;
    try {
      // Real persistence: this creates a row in single_runs plus one row
      // per item in run_items (see supabase/schema.sql). Recurring runs
      // are a completely separate table/flow — see the Recurring Runs tab.
      order = await createSingleRun(
        account.id,
        { cashAndCarry, deliveryAddress, scheduledFor: data.date || null, notes: data.notes, serviceFee: fee },
        cleanItems
      );
    } catch (err) {
      setSubmitError(err.message || "Couldn't save your run — please try again.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    addOrder(order);

    // NOTE: referral credit rewards (Stage 9) aren't wired up yet — the
    // schema has `referred_by` / `first_run_discount_used` on profiles but
    // no ledger for accumulated credit. Flagging rather than faking it.

    const itemLines = cleanItems.map(i => `${i.qty} ${i.unit} ${i.product}${i.brand ? ` (${i.brand})` : ""}`).join("; ");
    const extraNames = data.extras.map(exId => CHECKOUT_EXTRAS.find(e => e.id === exId)?.name).filter(Boolean);
    const { mailto } = await notifyOwner({
      type: "order",
      subject: `New stock run request ${order.id} — ${data.businessName}`,
      lines: [
        ["Order ID", order.id], ["Business", data.businessName], ["Contact", data.contactName],
        ["Phone", data.phone], ["Email", data.email], ["Delivery address", `${data.address}, ${data.postcode}`],
        ["Cash & carry", order.cashAndCarry], ["Date needed", data.date], ["Urgency", data.urgency],
        ["Items requested", itemLines || "See attached"], ["Extras", extraNames.join(", ") || "None"],
        ["Membership selected", membershipPlan.name], ["Estimated service fee", `£${fee}`],
        ["Special instructions", data.notes || "None"],
      ],
      photoNote: photoPreview ? "Customer attached a photo of the items — open their dashboard to view it, or ask them to resend it by email/WhatsApp if you need the original image file." : null,
    });

    setOrderId(order.id);
    setDone(true);
    window.open(mailto, "_blank");
    if (!loggedIn) onAuth("customer");
  };

  if (!loggedIn) {
    return (
      <div className="min-h-[60vh] bg-slate-50 flex items-center justify-center px-6 py-20">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center stk-fade-up">
          <div className="w-14 h-14 rounded-full bg-slate-950 flex items-center justify-center mx-auto mb-5"><User className="text-lime-300" size={26} /></div>
          <h1 className="font-display font-bold text-2xl text-slate-950">Create your account to book a stock run</h1>
          <p className="text-slate-500 text-sm mt-2">You only fill in your business details once — after that, every order, receipt and update lives in your own dashboard.</p>
          <div className="flex flex-col gap-2.5 mt-7">
            <button onClick={() => go("signup")} className={btnPrimary}>Create my account</button>
            <button onClick={() => go("login")} className={btnGhost}>I already have an account — log in</button>
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
          <p className="text-slate-500 text-sm mt-2">Your request <strong>{orderId}</strong> has been received. We'll confirm the final service fee and availability shortly.</p>
          <div className="bg-slate-50 rounded-xl p-4 mt-6 text-left text-sm space-y-1.5">
            <div className="flex justify-between"><span className="text-slate-500">Estimated service fee</span><span className="font-semibold text-slate-900">£{fee}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Cash & carry</span><span className="font-medium text-slate-900">{data.cashAndCarry === "Other / specify" ? data.otherCashAndCarry : data.cashAndCarry}</span></div>
          </div>
          <p className="text-xs text-slate-400 mt-4">A confirmation email tab has opened for the Stockly team — if it didn't, call/WhatsApp <a href={`tel:${OWNER_PHONE_TEL}`} className="font-semibold text-slate-600">{OWNER_PHONE_DISPLAY}</a> and we'll confirm your order.</p>
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
          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-lime-400 transition-all duration-500" style={{ width: `${(step / totalSteps) * 100}%` }} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 stk-fade-up" key={step}>
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="font-display font-bold text-xl text-slate-950 mb-1">Your business details</h2>
              <p className="text-sm text-slate-500 mb-5">Tell us a little about your business.</p>
              <div><label className={labelCls}>Business name</label><input className={inputCls} value={data.businessName} onChange={e => set({ businessName: e.target.value })} placeholder="East London Takeaway" /></div>
              <div><label className={labelCls}>Contact name</label><input className={inputCls} value={data.contactName} onChange={e => set({ contactName: e.target.value })} placeholder="Amir Hussain" /></div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div><label className={labelCls}>Phone</label><input className={inputCls} value={data.phone} onChange={e => set({ phone: e.target.value })} placeholder="07..." /></div>
                <div><label className={labelCls}>Email</label><input className={inputCls} value={data.email} onChange={e => set({ email: e.target.value })} placeholder="you@business.co.uk" /></div>
              </div>
              <div>
                <label className={labelCls}>Business type</label>
                <select className={inputCls} value={data.businessType} onChange={e => set({ businessType: e.target.value })}>
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
              <div><label className={labelCls}>Address</label><input className={inputCls} value={data.address} onChange={e => set({ address: e.target.value })} placeholder="14 Mare Street, Hackney" /></div>
              <div>
                <label className={labelCls}>Postcode</label>
                <div className="flex gap-2">
                  <input className={inputCls} value={data.postcode} onChange={e => { set({ postcode: e.target.value }); setPcResult(null); }} placeholder="E8 3RH" />
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
                <input className={inputCls} value={data.otherCashAndCarry} onChange={e => set({ otherCashAndCarry: e.target.value })} placeholder="Name of cash and carry" />
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="font-display font-bold text-xl text-slate-950 mb-1">Delivery date</h2>
              <p className="text-sm text-slate-500 mb-5">Orders submitted before 8 PM can be considered for next-day service, subject to availability. Guaranteed next-day delivery is not promised.</p>
              <div><label className={labelCls}>Preferred delivery date</label><input type="date" className={inputCls} value={data.date} onChange={e => set({ date: e.target.value })} /></div>
              <div>
                <label className={labelCls}>Urgency</label>
                <div className="flex gap-2.5">
                  <button type="button" onClick={() => set({ urgency: "standard" })} className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium ${data.urgency === "standard" ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 text-slate-700"}`}>Standard</button>
                  <button type="button" onClick={() => set({ urgency: "emergency" })} className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium ${data.urgency === "emergency" ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 text-slate-700"}`}>Emergency (from £100)</button>
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h2 className="font-display font-bold text-xl text-slate-950 mb-1">Your stock list</h2>
              <p className="text-sm text-slate-500 mb-5">Type your list, take a photo, or scan barcodes — whatever's easiest.</p>
              <div className="flex gap-2 p-1 bg-slate-100 rounded-xl mb-4">
                <button type="button" onClick={() => setItemMode("manual")} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${itemMode === "manual" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}><ClipboardList size={14} className="inline mr-1.5 -mt-0.5" /> Type it out</button>
                <button type="button" onClick={() => setItemMode("photo")} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${itemMode === "photo" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}><Camera size={14} className="inline mr-1.5 -mt-0.5" /> Take a photo</button>
                <button type="button" onClick={() => setItemMode("barcode")} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${itemMode === "barcode" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}><PackageSearch size={14} className="inline mr-1.5 -mt-0.5" /> Scan barcode</button>
              </div>

              {itemMode === "photo" && (
                <div className="rounded-xl border-2 border-dashed border-slate-300 p-6 text-center mb-4">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Uploaded stock" className="max-h-48 mx-auto rounded-lg mb-3 object-contain" />
                  ) : (
                    <ImagePlus size={30} className="mx-auto text-slate-300 mb-2" />
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={photoBusy} className={btnDark + " mx-auto"}>
                    {photoBusy ? <><Loader2 size={16} className="animate-spin" /> Reading photo…</> : <><Camera size={16} /> {photoPreview ? "Retake / choose another photo" : "Take or upload a photo"}</>}
                  </button>
                  <p className="text-xs text-slate-400 mt-3">Snap the products, a shelf, or a handwritten list — AI will read it and add the items below so you can check quantities.</p>
                  {photoError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">{photoError}</p>}
                </div>
              )}

              {itemMode === "barcode" && (
                <div className="rounded-xl border-2 border-dashed border-slate-300 p-6 text-center mb-4">
                  {!barcodeDraft ? (
                    <>
                      <PackageSearch size={30} className="mx-auto text-slate-300 mb-2" />
                      <button type="button" onClick={() => setScannerOpen(true)} disabled={barcodeBusy} className={btnDark + " mx-auto"}>
                        <Camera size={16} /> Open camera scanner
                      </button>
                      <p className="text-xs text-slate-400 mt-3 mb-3">Or type the barcode number (EAN/UPC) if scanning isn't working:</p>
                      <div className="flex gap-2 max-w-xs mx-auto">
                        <input className={inputCls} placeholder="e.g. 5000112548167" value={barcodeManual} onChange={e => setBarcodeManual(e.target.value)} />
                        <button type="button" onClick={() => barcodeManual.trim() && runBarcodeLookup(barcodeManual.trim())} disabled={barcodeBusy || !barcodeManual.trim()} className={btnGhost}>{barcodeBusy ? <Loader2 size={16} className="animate-spin" /> : "Look up"}</button>
                      </div>
                      {barcodeError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">{barcodeError}</p>}
                    </>
                  ) : (
                    <div className="text-left max-w-sm mx-auto">
                      <p className="font-semibold text-slate-900 text-sm mb-3">{barcodeDraft.notFound ? "Couldn't find that barcode — add the details manually:" : "Is this the product you want?"}</p>
                      <div className="flex gap-3">
                        {barcodeDraft.imageUrl && <img src={barcodeDraft.imageUrl} alt="" className="w-16 h-16 object-contain rounded-lg border border-slate-200 shrink-0" />}
                        <div className="flex-1 space-y-2">
                          <input className={inputCls} placeholder="Product name" value={barcodeDraft.product} onChange={e => setBarcodeDraft({ ...barcodeDraft, product: e.target.value })} />
                          <input className={inputCls} placeholder="Brand" value={barcodeDraft.brand} onChange={e => setBarcodeDraft({ ...barcodeDraft, brand: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <input className={inputCls} placeholder="Category" value={barcodeDraft.category} onChange={e => setBarcodeDraft({ ...barcodeDraft, category: e.target.value })} />
                        <input className={inputCls} placeholder="Pack size" value={barcodeDraft.packSize} onChange={e => setBarcodeDraft({ ...barcodeDraft, packSize: e.target.value })} />
                      </div>
                      <p className="text-xs text-slate-400 mt-2">Barcode: {barcodeDraft.barcode}</p>
                      <div className="flex items-center gap-2 mt-3">
                        <label className={labelCls}>Qty</label>
                        <input type="number" min="1" className={inputCls + " w-20"} value={barcodeDraft.qty} onChange={e => setBarcodeDraft({ ...barcodeDraft, qty: Number(e.target.value) || 1 })} />
                      </div>
                      {barcodeError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">{barcodeError}</p>}
                      <div className="flex gap-2 mt-4">
                        <button type="button" onClick={confirmBarcodeDraft} className={btnPrimary}>Confirm & add</button>
                        <button type="button" onClick={() => { setBarcodeDraft(null); setBarcodeError(""); }} className={btnGhost}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {scannerOpen && <LiveBarcodeScanner onDetected={runBarcodeLookup} onClose={() => setScannerOpen(false)} />}

              <div className="space-y-3">
                {data.items.map((it, idx) => (
                  <div key={it.id} className="rounded-xl border border-slate-200 p-4 relative">
                    <button type="button" onClick={() => removeItem(it.id)} className="absolute top-3 right-3 text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
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
            </div>
          )}

          {step === 6 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display font-bold text-xl text-slate-950 mb-1">Extras & membership</h2>
                <p className="text-sm text-slate-500 mb-4">Add anything extra to this run, or take out a membership for regular stock runs.</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Add extras to this order</p>
                <div className="space-y-2">
                  {CHECKOUT_EXTRAS.map(ex => (
                    <button key={ex.id} type="button" onClick={() => toggleExtra(ex.id)} className={`w-full text-left flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition ${data.extras.includes(ex.id) ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>
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
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {MEMBERSHIP_PLANS.map(p => (
                    <button key={p.id} type="button" onClick={() => set({ membership: p.id })} className={`text-left px-4 py-3 rounded-xl border transition ${data.membership === p.id ? "border-lime-400 bg-lime-50" : "border-slate-200 hover:border-slate-300"}`}>
                      <span className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-900">{p.name}</span>
                        {p.price > 0 && <span className="text-xs font-semibold text-slate-500">£{p.price}/mo</span>}
                      </span>
                      <span className="block text-xs text-slate-500 mt-1">{p.blurb}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display font-bold text-xl text-slate-950 mb-1">Special instructions</h2>
                <p className="text-sm text-slate-500 mb-4">Anything our shopper or driver should know?</p>
                <textarea className={inputCls + " min-h-[100px]"} value={data.notes} onChange={e => set({ notes: e.target.value })} placeholder="e.g. Please call on arrival — side entrance only." />
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
                <div className="flex justify-between px-4 py-3"><span className="text-slate-500">Business</span><span className="font-medium text-slate-900">{data.businessName || "—"}</span></div>
                <div className="flex justify-between px-4 py-3"><span className="text-slate-500">Delivery</span><span className="font-medium text-slate-900 text-right">{data.address ? `${data.address}, ${data.postcode}` : "—"}</span></div>
                <div className="flex justify-between px-4 py-3"><span className="text-slate-500">Cash & carry</span><span className="font-medium text-slate-900">{data.cashAndCarry === "Other / specify" ? data.otherCashAndCarry : data.cashAndCarry || "—"}</span></div>
                <div className="flex justify-between px-4 py-3"><span className="text-slate-500">Date</span><span className="font-medium text-slate-900">{data.date || "—"}</span></div>
                <div className="flex justify-between px-4 py-3"><span className="text-slate-500">Products</span><span className="font-medium text-slate-900">{data.items.filter(i => i.product.trim()).length} items</span></div>
                <div className="flex justify-between px-4 py-3"><span className="text-slate-500">Extras</span><span className="font-medium text-slate-900 text-right">{data.extras.length ? data.extras.map(id => CHECKOUT_EXTRAS.find(e => e.id === id)?.name).join(", ") : "None"}</span></div>
                <div className="flex justify-between px-4 py-3"><span className="text-slate-500">Membership</span><span className="font-medium text-slate-900">{membershipPlan.name}</span></div>
                <div className="flex justify-between px-4 py-3"><span className="text-slate-500">Estimated fee</span><span className="font-semibold text-slate-900">£{fee}</span></div>
              </div>
              <p className="text-xs text-slate-400">Submitting will email the Stockly team your full order, including quantities and address, and save it to your dashboard.</p>
              {submitError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{submitError}</p>}
            </div>
          )}
        </div>

        <div className="flex justify-between mt-6">
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
  { label: "My Runs", tab: "My Runs", icon: Receipt },
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

function DashLayout({ active, setActive, children, go, title = "Dashboard", customer, onLogout }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const notifs = [
    { t: "Order confirmed", b: "STK-1048 has been confirmed.", time: "2h ago" },
    { t: "Shopper assigned", b: "Priya N. is shopping your order.", time: "1d ago" },
    { t: "Delivered", b: "STK-1047 was delivered.", time: "6d ago" },
  ];
  const pick = (item) => {
    setMenuOpen(false);
    if (item.action === "book") go("book");
    else setActive(item.tab);
  };
  return (
    <div className="bg-slate-50 min-h-[80vh] relative">
      <div className="bg-white border-b border-slate-200">
        <Section className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <button onClick={() => setMenuOpen(true)} aria-label="Open menu" className="p-2 -ml-2 rounded-lg hover:bg-slate-100 text-slate-700"><Menu size={22} /></button>
            <button onClick={() => go("home")} className="hidden sm:block"><Logo size={26} /></button>
            <span className="text-sm font-semibold text-slate-700">{active}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <button onClick={() => setNotifOpen(!notifOpen)} className="p-2 rounded-lg hover:bg-slate-100 relative">
                <Bell size={18} className="text-slate-600" />
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-lime-400 rounded-full" />
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-2 stk-fade-up z-20">
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
            <div className="hidden sm:flex items-center gap-2 text-sm text-slate-700">
              <div className="w-8 h-8 rounded-full bg-slate-950 text-lime-300 flex items-center justify-center text-xs font-bold">{customer?.[0]?.toUpperCase() || "S"}</div>
              <span className="font-medium">{customer}</span>
            </div>
            <button onClick={onLogout} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><LogOut size={18} /></button>
          </div>
        </Section>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-slate-950/40" onClick={() => setMenuOpen(false)} />
          <div className="relative bg-white w-72 max-w-[85vw] h-full shadow-xl flex flex-col stk-fade-up">
            <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200">
              <Logo size={24} />
              <button onClick={() => setMenuOpen(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><X size={20} /></button>
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
    <p style="color:#94a3b8;font-size:11px;margin-top:24px;">Stockly Ltd · ${OWNER_PHONE_DISPLAY} · ${OWNER_EMAIL}</p>
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
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
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
          <button onClick={changeLoginWord} disabled={regenerating} className="text-xs font-semibold text-lime-300 hover:text-lime-200">{regenerating ? "Generating…" : "Change"}</button>
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
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
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
        <p className="text-lime-300 font-semibold mt-2">{OWNER_EMAIL}</p>
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
              <div className="flex-1">
                <p className="font-semibold text-slate-900 text-sm">{h.product}{h.brand ? ` — ${h.brand}` : ""}</p>
                <p className="text-xs text-slate-500 mt-0.5">Ordered {h.timesOrdered} time{h.timesOrdered === 1 ? "" : "s"}</p>
              </div>
              <button onClick={(e) => { e.preventDefault(); onAddToRun([{ product: h.product, brand: h.brand, unit: h.unit, qty: 1 }]); }} className={btnGhost + " !py-2 !px-3.5 text-xs"}>Add to Single Run</button>
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
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
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
              <button onClick={() => remove(l.id)} className="text-slate-400 hover:text-red-500 px-2"><Trash2 size={16} /></button>
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
                  <input className={inputCls + " w-20"} type="number" min={1} value={it.qty} onChange={e => updateItem(it.id, { qty: Number(e.target.value) || 1 })} />
                  <button onClick={() => removeItem(it.id)} className="text-slate-400 hover:text-red-500 px-2"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
            <button onClick={addItem} className="text-xs font-semibold text-slate-600 mt-2 flex items-center gap-1"><Plus size={13} /> Add product</button>
          </div>
          <div className="flex gap-3">
            <button onClick={save} disabled={saving} className={btnPrimary}>{saving ? "Saving…" : "Save list"}</button>
            <button onClick={() => { setCreating(false); setError(""); }} className={btnGhost}>Cancel</button>
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
      {runsError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{runsError}</p>}
      {loadingRuns && <p className="text-sm text-slate-400">Loading your recurring runs…</p>}

      {!loadingRuns && recurring.map(r => (
        <div key={r.dbId} className="bg-white rounded-2xl border border-slate-200 p-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="font-display font-semibold text-slate-950">{r.name}</p>
            <p className="text-sm text-slate-500 mt-1">{r.day}{r.cashAndCarry ? ` · ${r.cashAndCarry}` : ""} · {r.items.length} products</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${r.active ? "bg-lime-100 text-lime-700" : "bg-slate-100 text-slate-500"}`}>{r.active ? "Active" : "Paused"}</span>
            <button onClick={() => toggleActive(r)} disabled={busyId === r.dbId} className={btnGhost + " !py-2 !px-3.5 text-xs"}>{r.active ? <><PauseCircle size={13} /> Pause</> : <><PlayCircle size={13} /> Resume</>}</button>
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
                  <input className={inputCls + " w-20"} type="number" min={1} value={it.qty} onChange={e => updateItem(it.id, { qty: Number(e.target.value) || 1 })} />
                  <button onClick={() => removeItem(it.id)} className="text-slate-400 hover:text-red-500 px-2"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
            <button onClick={addItem} className="text-xs font-semibold text-slate-600 mt-2 flex items-center gap-1"><Plus size={13} /> Add product</button>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3">
            <button onClick={createRun} disabled={saving} className={btnPrimary}>{saving ? "Saving…" : "Save recurring run"}</button>
            <button onClick={() => { setCreating(false); setError(""); }} className={btnGhost}>Cancel</button>
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
      <button onClick={() => setOpen(!open)} className="w-full text-left">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
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
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
        <div className="text-sm"><span className="text-slate-500">Service fee</span> <span className="font-semibold text-slate-900">£{o.serviceFee}</span></div>
        <button onClick={onRepeat} className={btnGhost + " !py-2 !px-3.5 text-xs"}><RotateCcw size={13} /> Repeat Order</button>
      </div>
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
      setRunsError(err.message || "Couldn't load your runs — pull to refresh or try again shortly.");
    } finally {
      setLoadingRuns(false);
    }
  };

  useEffect(() => { reloadRuns(); }, [account?.id]);

  const thisMonthOrders = myOrders.filter(o => o.date && o.date.startsWith(new Date().toISOString().slice(0, 7)));
  const totalFees = thisMonthOrders.reduce((s, o) => s + o.serviceFee, 0);
  const nextRun = myOrders.find(o => ["Requested", "Confirmed", "Purchasing", "Collected", "Out for Delivery"].includes(o.status));

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

  return (
    <DashLayout active={tab} setActive={setTab} go={go} title="Dashboard" customer={account?.full_name || account?.business_name || "Account"} onLogout={onLogout}>
      {tab === "Dashboard" && (
        <div className="space-y-6">
          {runsError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{runsError}</p>}
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
              <p className="font-display font-semibold text-xl text-slate-950 mt-2">{account?.business_name || "—"}</p>
              <p className="text-sm text-slate-500 mt-1">{account?.email}</p>
            </div>
          </div>

          {myOrders.some(o => o.substitution && o.substitution.resolved === "pending") && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">Substitution awaiting approval.</div>
          )}

          <div>
            <h3 className="font-display font-semibold text-lg text-slate-950 mb-4">Recent Orders</h3>
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
              {myOrders.slice(0, 4).map(o => (
                <div key={o.id} className="flex items-center justify-between px-5 py-4 flex-wrap gap-2">
                  <div>
                    <p className="font-semibold text-sm text-slate-900">{o.id} <span className="text-slate-400 font-normal">· {o.date}</span></p>
                    <p className="text-xs text-slate-500 mt-0.5">{o.cashAndCarry}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusPill status={o.status} />
                    <button onClick={() => setRepeatModal(o)} className="text-xs font-semibold text-slate-950 flex items-center gap-1"><RotateCcw size={13} /> Repeat</button>
                  </div>
                </div>
              ))}
              {loadingRuns && <p className="text-sm text-slate-400 text-center py-10">Loading your runs…</p>}
              {!loadingRuns && myOrders.length === 0 && <p className="text-sm text-slate-400 text-center py-10">No stock runs yet — <button onClick={() => go("book")} className="font-semibold text-slate-700 underline underline-offset-2">book your first one</button>.</p>}
            </div>
          </div>
        </div>
      )}

      {tab === "My Runs" && (
        <div className="space-y-4">
          <div className="inline-flex bg-slate-100 rounded-xl p-1">
            <button onClick={() => setRunsSubTab("Single")} className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${runsSubTab === "Single" ? "bg-white shadow-sm text-slate-950" : "text-slate-500"}`}>Single Runs</button>
            <button onClick={() => setRunsSubTab("Recurring")} className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${runsSubTab === "Recurring" ? "bg-white shadow-sm text-slate-950" : "text-slate-500"}`}>Recurring Runs</button>
          </div>

          {runsSubTab === "Single" ? (
            <div className="space-y-4">
              {myOrders.map(o => (
                <MyRunCard key={o.id} order={o} onRepeat={() => setRepeatModal(o)} onReviewSub={() => setSubModal(o)} />
              ))}
              {!loadingRuns && myOrders.length === 0 && <p className="text-sm text-slate-400 text-center py-10">No single runs yet — <button onClick={() => go("book")} className="font-semibold text-slate-700 underline underline-offset-2">book your first one</button>.</p>}
            </div>
          ) : (
            <div className="space-y-4">
              {myRecurring.map(r => (
                <div key={r.dbId} className="bg-white rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
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
          {myOrders.map(o => (
            <div key={o.id} className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
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
          {myOrders.length === 0 && <p className="text-sm text-slate-400 text-center py-10">Documents will appear here after your first stock run.</p>}
          <p className="text-xs text-slate-400">Note: downloads are currently a printable HTML receipt, not a formal PDF invoice — real PDF generation is a later enhancement.</p>
        </div>
      )}

      {tab === "Settings" && (
        <SettingsTab account={account} setAccount={setAccount} />
      )}

      {tab === "Help" && <HelpTab />}

      {tab === "Analytics" && (
        <div className="space-y-6">
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-2.5 rounded-xl inline-block">Demo data shown below — not real spending figures.</div>
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h3 className="font-display font-semibold text-slate-950 mb-4">Monthly service fees</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={monthlySpend}>
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
                <BarChart data={monthlySpend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="runs" fill="#0f172a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="font-display font-semibold text-slate-950 mb-4">Most frequently ordered products</h3>
            <div className="space-y-3">
              {topProducts.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-5">{i + 1}</span>
                  <span className="text-sm text-slate-700 flex-1">{p.name}</span>
                  <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-lime-400" style={{ width: `${(p.count / 34) * 100}%` }} /></div>
                  <span className="text-xs text-slate-500 w-6 text-right">{p.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "Referrals" && (
        <div className="space-y-6">
          <div className="bg-slate-950 rounded-2xl p-7">
            <Gift className="text-lime-300 mb-3" size={24} />
            <h3 className="font-display font-bold text-xl text-white">Refer a business, both of you win.</h3>
            <p className="text-slate-400 text-sm mt-2 max-w-md">Share your code. When someone signs up with it and places their first order, you get 10% off your next bill. If they take out a membership, you get 20% off instead — or ask us for a faster delivery slot.</p>
            <div className="flex items-center gap-2 mt-5 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 max-w-xs">
              <span className="font-display font-bold text-lime-300 text-lg tracking-widest flex-1">{account?.referral_code || "—"}</span>
              <button onClick={copyReferral} className="text-slate-300 hover:text-white"><Copy size={16} /></button>
            </div>
            {copied && <p className="text-xs text-lime-300 mt-2">Copied!</p>}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Referral credit</p>
            <p className="text-sm text-slate-500 mt-2">Credit tracking isn't automated yet — the Stockly team applies referral rewards to your bill manually for now. Automatic tracking is coming in a future update.</p>
          </div>
        </div>
      )}

      {tab === "Business Profile" && (
        <AccountTab account={account} setAccount={setAccount} />
      )}

      <Modal open={!!repeatModal} onClose={() => setRepeatModal(null)} title={repeatModal ? `Repeat ${repeatModal.id}` : ""}>
        {repeatModal && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Your previous list has been loaded. Edit quantities before submitting.</p>
            <div className="space-y-2">
              {repeatModal.items.map((it, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-sm">
                  <span className="text-slate-700">{it.product} {it.brand && <span className="text-slate-400">({it.brand})</span>}</span>
                  <span className="font-medium text-slate-900">{it.qty} {it.unit}</span>
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
              <div className="flex justify-between px-4 py-3"><span className="text-slate-500">Requested</span><span className="font-medium">{subModal.substitution.requested}</span></div>
              <div className="flex justify-between px-4 py-3"><span className="text-slate-500">Alternative</span><span className="font-medium">{subModal.substitution.alternative}</span></div>
              <div className="flex justify-between px-4 py-3"><span className="text-slate-500">Price difference</span><span className="font-medium text-amber-600">+£{subModal.substitution.diff}</span></div>
            </div>
            {subModal.substitution.resolved === "pending" ? (
              <div className="flex gap-3">
                <button onClick={() => approveSub(subModal, true)} className={btnPrimary + " flex-1"}>Approve</button>
                <button onClick={() => approveSub(subModal, false)} className={btnGhost + " flex-1"}>Reject</button>
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
   ADMIN / OPS DASHBOARD
--------------------------------------------------------------------- */
function AdminPasswordGate({ children }) {
  const [unlocked, setUnlocked] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const submit = (e) => {
    e.preventDefault();
    if (code === ADMIN_PASSCODE) { setUnlocked(true); setError(""); }
    else setError("Incorrect passcode.");
  };
  if (unlocked) return children;
  return (
    <div className="min-h-[80vh] bg-slate-950 flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-lime-300/10 flex items-center justify-center mx-auto mb-4"><ShieldAlert className="text-lime-300" size={22} /></div>
        <h1 className="font-display font-bold text-xl text-white">Operations dashboard</h1>
        <p className="text-slate-400 text-sm mt-2">This area is restricted to the Stockly team. Enter the passcode to continue.</p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input type="password" value={code} onChange={e => setCode(e.target.value)} placeholder="Passcode" className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-lime-300" />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button type="submit" className={btnPrimary + " w-full"}>Unlock</button>
        </form>
      </div>
    </div>
  );
}

function AdminDashboard({ go, orders, setOrders }) {
  const shoppers = ["Priya N.", "Jordan K.", "Sam T."];
  const drivers = ["Marcus O.", "Leah W.", "Tomás R."];
  const [notifs, setNotifs] = useState([]);
  const [showNotifs, setShowNotifs] = useState(true);

  useEffect(() => {
    (async () => setNotifs((await storageGet("owner-notifications", true)) || []))();
  }, []);

  const move = (order, dir) => {
    const idx = STATUS_FLOW.indexOf(order.status);
    const next = STATUS_FLOW[Math.min(STATUS_FLOW.length - 1, Math.max(0, idx + dir))];
    setOrders(orders.map(o => o.id === order.id ? { ...o, status: next } : o));
  };
  const assign = (order, field, value) => setOrders(orders.map(o => o.id === order.id ? { ...o, [field]: value } : o));

  return (
    <AdminPasswordGate>
    <div className="bg-slate-50 min-h-[80vh]">
      <div className="bg-slate-950 border-b border-slate-800">
        <Section className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <button onClick={() => go("home")}><Logo dark size={26} /></button>
            <span className="hidden sm:inline text-sm text-slate-500">/ Operations</span>
          </div>
          <div className="flex items-center gap-4">
            <a href={`tel:${OWNER_PHONE_TEL}`} className="hidden sm:flex items-center gap-1.5 text-sm text-slate-300 hover:text-white"><Phone size={14} /> {OWNER_PHONE_DISPLAY}</a>
            <button onClick={() => go("home")} className="text-slate-300 hover:text-white flex items-center gap-1.5 text-sm"><LogOut size={16} /> Exit</button>
          </div>
        </Section>
      </div>
      <Section className="py-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="font-display font-bold text-2xl text-slate-950">Operations board</h1>
            <p className="text-sm text-slate-500">{orders.length} active stock runs across East London</p>
          </div>
          <div className="flex gap-2 text-xs">
            <button onClick={() => go("shopper")} className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 font-semibold hover:bg-slate-200">Shopper view →</button>
            <button onClick={() => go("driver")} className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 font-semibold hover:bg-slate-200">Driver view →</button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 mb-6">
          <button onClick={() => setShowNotifs(!showNotifs)} className="w-full flex items-center justify-between px-5 py-4">
            <span className="font-display font-semibold text-slate-950 flex items-center gap-2"><Bell size={16} /> Website submissions {notifs.length ? `(${notifs.length})` : ""}</span>
            <ChevronRight size={16} className={`text-slate-400 transition-transform ${showNotifs ? "rotate-90" : ""}`} />
          </button>
          {showNotifs && (
            <div className="border-t border-slate-100 max-h-80 overflow-y-auto stockly-scroll divide-y divide-slate-100">
              {notifs.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No signups or orders yet — new website activity will appear here instantly.</p>}
              {notifs.map(n => (
                <div key={n.id} className="px-5 py-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">{n.subject}</span>
                    <span className="text-[11px] text-slate-400">{new Date(n.createdAt).toLocaleString("en-GB")}</span>
                  </div>
                  <div className="mt-2 grid sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
                    {n.lines.map(([k, v], i) => <div key={i}><span className="text-slate-400">{k}:</span> <span className="text-slate-700">{v}</span></div>)}
                  </div>
                  {n.photoNote && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">{n.photoNote}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-4 overflow-x-auto stockly-scroll pb-4">
          {STATUS_FLOW.map(status => (
            <div key={status} className="min-w-[280px] w-[280px] shrink-0">
              <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="font-semibold text-sm text-slate-700">{status}</h3>
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{orders.filter(o => o.status === status).length}</span>
              </div>
              <div className="space-y-3">
                {orders.filter(o => o.status === status).map(o => (
                  <div key={o.id} className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-sm text-slate-900">{o.id}</p>
                      <span className="text-xs text-slate-400">£{o.serviceFee}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{o.cashAndCarry}</p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{o.address}</p>
                    <div className="flex flex-wrap gap-1 mt-2.5">
                      <select value={o.shopper} onChange={e => assign(o, "shopper", e.target.value)} className="text-[11px] border border-slate-200 rounded-md px-1.5 py-1 text-slate-600 max-w-[110px]">
                        <option value="">Shopper</option>
                        {shoppers.map(s => <option key={s}>{s}</option>)}
                      </select>
                      <select value={o.driver} onChange={e => assign(o, "driver", e.target.value)} className="text-[11px] border border-slate-200 rounded-md px-1.5 py-1 text-slate-600 max-w-[110px]">
                        <option value="">Driver</option>
                        {drivers.map(d => <option key={d}>{d}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-1.5 mt-3">
                      <button onClick={() => move(o, -1)} className="flex-1 text-xs py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><ChevronLeft size={12} className="inline" /></button>
                      <button onClick={() => move(o, 1)} className="flex-1 text-xs py-1.5 rounded-lg bg-slate-950 text-white hover:bg-slate-800">Next <ChevronRight size={12} className="inline" /></button>
                    </div>
                  </div>
                ))}
                {orders.filter(o => o.status === status).length === 0 && (
                  <div className="text-xs text-slate-300 border border-dashed border-slate-200 rounded-xl p-6 text-center">No orders</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
    </AdminPasswordGate>
  );
}

/* ---------------------------------------------------------------------
   SHOPPER DASHBOARD
--------------------------------------------------------------------- */
function ShopperDashboard({ go, orders, setOrders }) {
  const [openOrder, setOpenOrder] = useState(null);
  const myOrders = orders.filter(o => ["Confirmed", "Purchasing"].includes(o.status));
  const [checked, setChecked] = useState({});

  const toggleCheck = (orderId, idx) => {
    const key = `${orderId}-${idx}`;
    setChecked({ ...checked, [key]: !checked[key] });
  };

  const markCollected = (order) => {
    setOrders(orders.map(o => o.id === order.id ? { ...o, status: "Collected" } : o));
    setOpenOrder(null);
  };
  const uploadReceipt = (order) => setOrders(orders.map(o => o.id === order.id ? { ...o, receiptUploaded: true } : o));

  return (
    <div className="bg-slate-50 min-h-[80vh]">
      <div className="bg-slate-950 border-b border-slate-800">
        <Section className="flex items-center justify-between h-16">
          <button onClick={() => go("home")}><Logo dark size={26} /></button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">Priya N. · Shopper</span>
            <button onClick={() => go("home")} className="text-slate-300 hover:text-white"><LogOut size={16} /></button>
          </div>
        </Section>
      </div>
      <Section className="py-6 max-w-lg mx-auto">
        {!openOrder ? (
          <>
            <h1 className="font-display font-bold text-2xl text-slate-950 mb-1">Today's Stock Runs</h1>
            <p className="text-sm text-slate-500 mb-6">{myOrders.length} assigned</p>
            <div className="space-y-3">
              {myOrders.map(o => (
                <button key={o.id} onClick={() => setOpenOrder(o)} className="w-full text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-slate-300 transition">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-900">{o.id}</p>
                    <StatusPill status={o.status} />
                  </div>
                  <p className="text-sm text-slate-500 mt-2">{DEMO_CUSTOMER.business}</p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Store size={13} /> {o.cashAndCarry}</span>
                    <span className="flex items-center gap-1"><PackageSearch size={13} /> {o.items.length} products</span>
                  </div>
                </button>
              ))}
              {myOrders.length === 0 && <p className="text-sm text-slate-400 text-center py-10">No stock runs assigned right now.</p>}
            </div>
          </>
        ) : (
          <div>
            <button onClick={() => setOpenOrder(null)} className="text-sm text-slate-500 flex items-center gap-1 mb-4"><ChevronLeft size={16} /> Back</button>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-bold text-xl text-slate-950">{openOrder.id}</h2>
                <StatusPill status={openOrder.status} />
              </div>
              <p className="text-sm text-slate-500 mt-1">{openOrder.cashAndCarry}</p>
              {openOrder.notes && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">{openOrder.notes}</p>}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-4">
              <h3 className="font-semibold text-sm text-slate-700 mb-3">Checklist</h3>
              <div className="space-y-2.5">
                {openOrder.items.map((it, i) => {
                  const key = `${openOrder.id}-${i}`;
                  return (
                    <button key={i} onClick={() => toggleCheck(openOrder.id, i)} className="w-full flex items-center gap-3 text-left">
                      {checked[key] ? <CheckCircle2 size={19} className="text-lime-500 shrink-0" /> : <Circle size={19} className="text-slate-300 shrink-0" />}
                      <span className={`text-sm ${checked[key] ? "text-slate-400 line-through" : "text-slate-800"}`}>{it.qty} {it.unit} {it.product} {it.brand && <span className="text-slate-400">({it.brand})</span>}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              {openOrder.status !== "Collected" && <button onClick={() => markCollected(openOrder)} className={btnPrimary}><PackageCheck size={16} /> Mark collected</button>}
              <button onClick={() => uploadReceipt(openOrder)} className={btnGhost}><Upload size={16} /> {openOrder.receiptUploaded ? "Receipt uploaded ✓" : "Upload receipt"}</button>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

/* ---------------------------------------------------------------------
   DRIVER DASHBOARD
--------------------------------------------------------------------- */
function DriverDashboard({ go, orders, setOrders }) {
  const myOrders = orders.filter(o => ["Collected", "Out for Delivery"].includes(o.status));
  const advance = (o) => {
    const next = o.status === "Collected" ? "Out for Delivery" : "Delivered";
    setOrders(orders.map(x => x.id === o.id ? { ...x, status: next, podUploaded: next === "Delivered" ? true : x.podUploaded } : x));
  };
  return (
    <div className="bg-slate-50 min-h-[80vh]">
      <div className="bg-slate-950 border-b border-slate-800">
        <Section className="flex items-center justify-between h-16">
          <button onClick={() => go("home")}><Logo dark size={26} /></button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">Marcus O. · Driver</span>
            <button onClick={() => go("home")} className="text-slate-300 hover:text-white"><LogOut size={16} /></button>
          </div>
        </Section>
      </div>
      <Section className="py-6 max-w-lg mx-auto">
        <h1 className="font-display font-bold text-2xl text-slate-950 mb-1">Deliveries</h1>
        <p className="text-sm text-slate-500 mb-6">{myOrders.length} assigned to you</p>
        <div className="space-y-4">
          {myOrders.map(o => (
            <div key={o.id} className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-900">{o.id}</p>
                <StatusPill status={o.status} />
              </div>
              <p className="text-sm text-slate-700 mt-2 font-medium">{DEMO_CUSTOMER.business}</p>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><MapPin size={13} /> {o.address}</p>
              <p className="text-xs text-slate-500 mt-1">{o.items.length} products</p>
              {o.notes && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">{o.notes}</p>}
              <div className="flex gap-2.5 mt-4">
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address)}`} target="_blank" rel="noreferrer" className={btnGhost + " flex-1 !py-2.5 text-xs"}><Navigation size={14} /> Navigate</a>
                <button onClick={() => advance(o)} className={btnPrimary + " flex-1 !py-2.5 text-xs"}>{o.status === "Collected" ? "Start delivery" : "Mark delivered"}</button>
              </div>
            </div>
          ))}
          {myOrders.length === 0 && <p className="text-sm text-slate-400 text-center py-10">No deliveries assigned right now.</p>}
        </div>
      </Section>
    </div>
  );
}

/* ---------------------------------------------------------------------
   LEGAL MODAL CONTENT
--------------------------------------------------------------------- */
function LegalModalBody({ title }) {
  return (
    <div className="text-sm text-slate-500 leading-relaxed space-y-3">
      <p>This is a placeholder for Stockly's <strong>{title}</strong>.</p>
      <p>This section is intended to be replaced with professionally reviewed legal documentation before launch.</p>
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

  // NOTE: `orders` here is still the mock/demo dataset used only by the
  // Admin/Shopper/Driver ops dashboards (Phase 11 — not yet wired to
  // Supabase). The real customer dashboard no longer reads from this; it
  // fetches single_runs/recurring_runs straight from Supabase itself.
  const [orders, setOrders] = useState(seedOrders());
  const [bookingPrefill, setBookingPrefill] = useState(null);

  // Restore a logged-in customer session from Supabase's real auth session
  // when the app reopens (this is what makes "stay logged in on this
  // device" actually work — Supabase persists the session token itself).
  useEffect(() => {
    let unsub;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
        if (profile) { setAccount(profile); setLoggedIn(true); setRole(profile.is_admin ? "admin" : "customer"); }
      }
      const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
        if (!newSession?.user) {
          setAccount(null); setLoggedIn(false);
          return;
        }
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", newSession.user.id).single();
        if (profile) { setAccount(profile); setLoggedIn(true); setRole(profile.is_admin ? "admin" : "customer"); }
      });
      unsub = () => listener.subscription.unsubscribe();
    })();
    return () => unsub && unsub();
  }, []);

  const go = (p, opts = {}) => {
    setPage(p);
    setAnchor(opts.anchor || null);
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  };

  const addOrder = (order) => setOrders(o => [order, ...o]);
  const onAuth = async (r, acc) => {
    setLoggedIn(true); setRole(r);
    if (acc) setAccount(acc);
    go(r === "customer" ? "dashboard" : r);
  };
  const onLogout = async () => {
    await supabase.auth.signOut(); // clears the real session everywhere
    setLoggedIn(false); setAccount(null);
    go("home");
  };
  const openLegal = (title) => setLegal({ open: true, title });

  let content;
  if (page === "home") content = <Home go={go} anchor={anchor} openLegal={openLegal} />;
  else if (page === "pricing") content = <Pricing go={go} />;
  else if (page === "service-area") content = <ServiceArea go={go} anchor={anchor} />;
  else if (page === "about") content = <About go={go} />;
  else if (page === "book") content = <Booking go={go} addOrder={addOrder} loggedIn={loggedIn} onAuth={onAuth} account={account} prefillItems={bookingPrefill} onConsumedPrefill={() => setBookingPrefill(null)} />;
  else if (page === "login") content = <AuthPage mode="login" go={go} onAuth={onAuth} />;
  else if (page === "signup") content = <AuthPage mode="signup" go={go} onAuth={onAuth} />;
  else if (page === "forgot") content = (
    <div className="min-h-[70vh] bg-slate-50 flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center">
        <Lock className="mx-auto text-slate-400 mb-4" size={28} />
        <h1 className="font-display font-bold text-xl text-slate-950">Reset your password</h1>
        <p className="text-slate-500 text-sm mt-2">Password resets aren't automated yet — call or WhatsApp <a href={`tel:${OWNER_PHONE_TEL}`} className="font-semibold text-slate-700">{OWNER_PHONE_DISPLAY}</a> and the Stockly team will help you back in.</p>
        <button onClick={() => go("login")} className={btnDark + " mt-6"}>Back to log in</button>
      </div>
    </div>
  );
  else if (page === "dashboard") content = <CustomerDashboard go={go} account={account} setAccount={setAccount} onLogout={onLogout} setBookingPrefill={setBookingPrefill} />;
  else if (page === "admin") content = <AdminDashboard go={go} orders={orders} setOrders={setOrders} />;
  else if (page === "shopper") content = <ShopperDashboard go={go} orders={orders} setOrders={setOrders} />;
  else if (page === "driver") content = <DriverDashboard go={go} orders={orders} setOrders={setOrders} />;

  const isOpsView = ["admin", "shopper", "driver", "dashboard"].includes(page);

  return (
    <div className="min-h-screen bg-white font-body">
      <FontStyles />
      {!isOpsView && <NavBar go={go} page={page} loggedIn={loggedIn} role={role} />}
      {content}
      {!isOpsView && <Footer go={go} openLegal={openLegal} />}
      <Modal open={legal.open} onClose={() => setLegal({ open: false, title: "" })} title={legal.title}>
        <LegalModalBody title={legal.title} />
      </Modal>
    </div>
  );
}
