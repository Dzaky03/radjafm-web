// ============================================================================
// RADJAfm 101.8 FM - Shared Configuration & Utilities (js/config.js)
// ============================================================================

export const SUPABASE_URL = "https://rnxinwhjdwkmjitzuxse.supabase.co/rest/v1/";
export const SUPABASE_ANON_KEY = "sb_publishable_d44O8y2jBL4qCz3INrtXkg_zNwnYLPG";
export const SUPABASE_PROJECT_URL = SUPABASE_URL.replace(/\/rest\/v1\/?$/, "");

// Single shared Supabase Client instance
export const supabaseClient = window.supabase.createClient(
  SUPABASE_PROJECT_URL,
  SUPABASE_ANON_KEY
);

// Shared LocalStorage & BroadcastChannel Keys
export const STORAGE_KEY = "radjafm_cms_data_v1";
export const READ_STATUS_STORAGE_KEY = "radjafm_read_requests_v1";
export const SCHEDULE_META_STORAGE_KEY = "radjafm_schedule_meta_v1";

// Default Active Icecast Streams
export const DEFAULT_ICECAST_STREAM = "https://ice1.somafm.com/indiepop-128-mp3";
export const BACKUP_ICECAST_STREAMS = [
  "https://ice1.somafm.com/indiepop-128-mp3",
  "https://ice1.somafm.com/poptron-128-mp3",
  "https://ice1.somafm.com/lush-128-mp3"
];

// Cross-tab Realtime Sync Channel
export const liveBroadcast =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("radjafm_live_sync")
    : null;

// Shared Supabase Realtime Channel
export const studioSyncChannel = supabaseClient.channel("radjafm-studio-sync", {
  config: {
    broadcast: { ack: true }
  }
});
studioSyncChannel.subscribe();

/**
 * Safely escape HTML strings before rendering into DOM
 */
export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

/**
 * Format timestamp into Indonesian relative time string
 */
export function formatRelativeTime(dateInput) {
  if (!dateInput) return "Baru saja";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return "Baru saja";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} mnt lalu`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam lalu`;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

/**
 * Normalize user time input (e.g. "09:00-12.00", "09.00 - 12.00 WIB", "21:00 - 24:00")
 * into valid PostgreSQL TIME ("09:00:00", "12:00:00") and display string ("09:00 - 12:00 WIB")
 */
export function parseAndNormalizeScheduleTime(rawInput) {
  const str = String(rawInput || "09:00 - 12:00 WIB").trim();
  const matches = [...str.matchAll(/(\d{1,2})\s*[:.]\s*(\d{1,2})/g)];

  const toValidTimeParts = (hRaw, mRaw, defaultH, defaultM) => {
    let h = parseInt(hRaw, 10);
    let m = parseInt(mRaw, 10);
    if (isNaN(h)) h = defaultH;
    if (isNaN(m)) m = defaultM;
    if (m < 0) m = 0;
    if (m > 59) m = 59;
    const dispH = Math.min(Math.max(h, 0), 24);
    const dispM = dispH === 24 ? 0 : m;
    // PostgreSQL TIME type requires 00:00:00 - 23:59:59 with ':' separator
    const sqlH = dispH >= 24 ? 23 : dispH;
    const sqlM = dispH >= 24 ? 59 : dispM;
    return {
      display: `${String(dispH).padStart(2, "0")}:${String(dispM).padStart(2, "0")}`,
      sql: `${String(sqlH).padStart(2, "0")}:${String(sqlM).padStart(2, "0")}:00`
    };
  };

  let startObj = toValidTimeParts(9, 0, 9, 0);
  let endObj = toValidTimeParts(12, 0, 12, 0);

  if (matches.length >= 2) {
    startObj = toValidTimeParts(matches[0][1], matches[0][2], 9, 0);
    endObj = toValidTimeParts(matches[1][1], matches[1][2], 12, 0);
  } else if (matches.length === 1) {
    startObj = toValidTimeParts(matches[0][1], matches[0][2], 9, 0);
    const nextH = Math.min(parseInt(matches[0][1], 10) + 2, 23);
    endObj = toValidTimeParts(nextH, matches[0][2], 12, 0);
  }

  return {
    startSqlTime: startObj.sql,
    endSqlTime: endObj.sql,
    startShort: startObj.display,
    endShort: endObj.display,
    displayTime: `${startObj.display} - ${endObj.display} WIB`
  };
}

/**
 * Retrieve locally saved schedule metadata (description, genre, status, displayTime)
 */
export function getSavedScheduleMeta(id) {
  if (id == null) return null;
  try {
    const raw = localStorage.getItem(SCHEDULE_META_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return parsed[String(id)] || null;
      }
    }
  } catch (e) {}
  return null;
}

