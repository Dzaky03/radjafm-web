// ============================================================================
// RADJAfm 101.8 FM - Studio Admin Dashboard & Realtime Moderation (js/admin.js)
// ============================================================================

import {
  supabaseClient,
  STORAGE_KEY,
  READ_STATUS_STORAGE_KEY,
  SCHEDULE_META_STORAGE_KEY,
  DEFAULT_ICECAST_STREAM,
  liveBroadcast,
  escapeHtml,
  formatRelativeTime,
  parseAndNormalizeScheduleTime
} from "./config.js";

let knownRequestColumns = null;
let knownScheduleColumns = null;
let studioSyncChannel = null;

export const DEFAULT_DATA = {
  onAir: {
    id: null,
    title: "Semangat Pagi Jik!",
    hosts: "Mas Danu & Mbak Rini",
    description:
      "Menemani aktivitas pagimu di 101.8 FM bersama informasi aktual, info lalu lintas terupdate, dan pilihan lagu pembangkit mood terbaik.",
    streamUrl: DEFAULT_ICECAST_STREAM,
    quality: "HD 128kbps",
    frequency: "101.8 FM"
  },
  requests: [],
  schedules: [
    {
      id: "sch-1",
      dayName: "Setiap Hari",
      time: "06:00 - 09:00 WIB",
      status: "SELESAI",
      isOnAir: false,
      title: "Klinik Rohani Pagi",
      description: "Siraman rohani penyejuk jiwa pembuka hari",
      hosts: "Ust. H. Abdullah",
      genre: "Religi & Inspirasi"
    },
    {
      id: "sch-2",
      dayName: "Setiap Hari",
      time: "09:00 - 12:00 WIB",
      status: "ON AIR",
      isOnAir: true,
      title: "Semangat Pagi Jik!",
      description: "Interaksi pendengar, info lalu lintas, dan hits lagu bersemangat",
      hosts: "Mas Danu & Mbak Rini",
      genre: "Morning Talk & Hits"
    },
    {
      id: "sch-3",
      dayName: "Setiap Hari",
      time: "12:00 - 15:00 WIB",
      status: "BERIKUTNYA",
      isOnAir: false,
      title: "RADJA Hits Siang",
      description: "Koleksi lagu hits favorit, info gaya hidup, dan kuliner terkini",
      hosts: "Kak Siska",
      genre: "Top 40 & Lifestyle"
    },
    {
      id: "sch-4",
      dayName: "Setiap Hari",
      time: "15:00 - 18:00 WIB",
      status: "NANTI",
      isOnAir: false,
      title: "Irama Sore & Request Corner",
      description: "Titip salam hangat dan putar lagu kesayanganmu langsung di radio",
      hosts: "Siti Rahmawati",
      genre: "Request & Interaktif"
    },
    {
      id: "sch-5",
      dayName: "Setiap Hari",
      time: "18:00 - 21:00 WIB",
      status: "NANTI",
      isOnAir: false,
      title: "Senja Pulang Kantor",
      description: "Playlist santai pereda macet sore hari dan podcast ringkas",
      hosts: "Bagus Wicaksono",
      genre: "Acoustic & Traffic"
    },
    {
      id: "sch-6",
      dayName: "Setiap Hari",
      time: "21:00 - 24:00 WIB",
      status: "NANTI",
      isOnAir: false,
      title: "Curhat Malam & Melodi Romansa",
      description: "Sesi cerita cinta, persahabatan, dan ballad syahdu pengantar tidur",
      hosts: "Rania Zahra",
      genre: "Late Night Ballads"
    }
  ],
  announcers: [
    {
      id: "ann-1",
      name: "Mas Danu",
      show: "Semangat Pagi Jik!",
      time: "09:00 - 12:00 WIB",
      bio: "Penuh energi dan humor segar, siap menemani pagi harimu dengan info lalu lintas terkini dan playlist pembangkit semangat.",
      tag: "On Air Pagi",
      social: "@masdanu.onair",
      online: true,
      avatar:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuA-TvNM2ZZPV_JMS5zwOAZe1YItf-Spcs4hdDFpYQKpFgtJys8pMS13JBrbRsq8VjBxcEg_FfcA9YFi6fRALesM5fWrLvIto2Hjs9IkmaK8DweWDwAzltWaboplviRD01jqFDWbNrUlPLnY1Y8rnAi95i77-FA6uZZURSLY6fJXs7kglOGdZNErNTreLAlKboC2zUG1k2d4LFEbt2YH0gh4uy77dWPPP7I86zQcllAl"
    },
    {
      id: "ann-2",
      name: "Mbak Rini",
      show: "Semangat Pagi Jik!",
      time: "09:00 - 12:00 WIB",
      bio: "Suara hangat dan ramah yang selalu siap menyapa pendengar setia, membawakan obrolan inspiratif dan tips gaya hidup santai.",
      tag: "On Air Pagi",
      social: "@rini_radjafm",
      online: true,
      avatar:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuD-5EoQDzjshnhs_Kqb1jwKTnj6a9d_tElKdtrGN3P4xNX8_YdkdjSPKT0AeDFu-7fKAovcTOqwr9dkTjD1ncxgYrJZipo2MrdzTj8PfBIKZVESC-qG1_R0un_LelHsEl-bv6Gw25YKKBDovDMybdfNMncnriZ5MXffqLYe12XbdrSd0YhCcpjvTSHLYMSc38j4kwRQ17EpEo9EzpkdlhZdxaHcN9Jr7s5WC7Ih2xA0"
    },
    {
      id: "ann-3",
      name: "Kak Siska",
      show: "RADJA Hits Siang",
      time: "12:00 - 15:00 WIB",
      bio: "Pencinta musik sejati yang selalu update dengan chart lagu terpopuler dan kabar terbaru dunia pop culture.",
      tag: "Hits Maker",
      social: "@siska.hits",
      online: false,
      avatar:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuA1auKm8uWxRw1Mu0Y0Tnu_5te6phHHcFYRwX_0H1dRNPX62Y3WlGwd-8Yz_H6Q3O1gM8Ax2JgfpAKjMloHRPfqflpIghKQX1eMDkJOVzHcOCBVdiiRj433-SW7R7htcf6IAHPXqtR-IacH2kLd2M6icG0F9VSJauLeR2ZWyiFKUL71JEanvxFnVswuEeja-fPp1cinWc0ohVfic-9bEorWUA29OBlAGqpEi-pOdoY8"
    },
    {
      id: "ann-4",
      name: "Siti Rahmawati",
      show: "Irama Sore & Request Corner",
      time: "15:00 - 18:00 WIB",
      bio: "Sahabat setia perjalanan soremu, siap membacakan salam hangat dan memutar tembang kenangan manis pilihan pendengar.",
      tag: "Request Host",
      social: "@siti.rahmaradio",
      online: false,
      avatar:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuC84xl427csq_-P06yTY3Xzs-A1aoaxDr49qi98owyIY177w511VOinKLXIFcriq7CJcSLBLDVAnTuQ1AdtSiDT5QIfMFFxHMa5vY7Wij95zAbFDVw5u9LgruC63wRzTJPGrB6jGv7NMWl52q-qP_JNH2vVtqj6Gpvr5RmizSU1x3atVNshWIabZ2xGGY3lOqB5eUM3iozXRjhgDyKA104ZTwd8HDPKk12haQzdTefO"
    },
    {
      id: "ann-5",
      name: "Bagus Wicaksono",
      show: "Senja Pulang Kantor",
      time: "18:00 - 21:00 WIB",
      bio: "Penenang penat jalanan ibukota dengan seleksi lagu akustik syahdu dan obrolan santai pengantar senja.",
      tag: "Acoustic Vibes",
      social: "@bagus_wicaksono",
      online: false,
      avatar:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuCTCpiUDdiZozx8mbja4b4jz4OeVzZItv5l51Suud6JguHeJ3C5RISs2U-hWqw_KWg23zzr27JC6TnkT7V2CrrX-petijmmqN9esb8D98m2NrI8S9To7ZmCQybAufZ_6OnaqnDmDcraXpZDbOX0lap_IbMl9ku6gzSIB01XvIPAwYwOUk7CGgvKzCk7Ntvv872CsCDRgkf6GX1-sM9Xoo4tXg6Bq5zzZxvAofTNSQtP"
    },
    {
      id: "ann-6",
      name: "Rania Zahra",
      show: "Curhat Malam & Melodi Romansa",
      time: "21:00 - 24:00 WIB",
      bio: "Teman bicara di keheningan malam, menghadirkan kisah-kisah penuh makna ditemani alunan ballad melankolis.",
      tag: "Night Host",
      social: "@rania.zahra_night",
      online: false,
      avatar:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuABGA-WWrut3j_nkTzOy9LHT1urDFBuqtLnjv7FqlQaTOmHfmoyZbsgzwLQsB_tSUgUWIC3b8O92-4cvkaXkBjq7W-dq52xK4n_bp0iUgaZjiL1Se-9EBhsaSr-DfkIFNkWCOSG9Z4wehNQl6GVM4ajZ8Mf3LAxXzRu90W2Nb4cMywCui8_aVOyx6_1NyEmuYs4mGrccaGBRUEUWi1Ay7PPscMCI9mJwj56yc7doeRI"
    }
  ]
};

// --- Persistence Helpers ---
function loadPersistedData() {
  const base = JSON.parse(JSON.stringify(DEFAULT_DATA));
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (parsed.onAir && typeof parsed.onAir === "object") {
          base.onAir = { ...base.onAir, ...parsed.onAir };
          if (
            base.onAir.streamUrl &&
            base.onAir.streamUrl.includes("stream.zeno.fm/f3wvbbqmdg8uv")
          ) {
            base.onAir.streamUrl = DEFAULT_DATA.onAir.streamUrl;
          }
        }
        if (Array.isArray(parsed.announcers) && parsed.announcers.length > 0) {
          base.announcers = parsed.announcers;
        }
      }
    }
  } catch (err) {
    console.warn("Gagal membaca localStorage:", err);
  }
  return base;
}

function savePersistedData() {
  const payload = {
    onAir: cmsData.onAir,
    announcers: cmsData.announcers,
    updatedAt: Date.now()
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn("Gagal menyimpan ke localStorage:", err);
  }
  if (liveBroadcast) {
    try {
      liveBroadcast.postMessage({ type: "STUDIO_CONFIG_UPDATED", payload });
    } catch (err) {}
  }
  if (studioSyncChannel) {
    try {
      studioSyncChannel.send({
        type: "broadcast",
        event: "studio-config-updated",
        payload
      });
    } catch (err) {}
  }
}

function loadReadStatusMap() {
  try {
    const raw = localStorage.getItem(READ_STATUS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch (e) {}
  return {};
}

function saveReadStatusMap() {
  try {
    localStorage.setItem(READ_STATUS_STORAGE_KEY, JSON.stringify(localReadStatusMap));
  } catch (e) {}
}

function loadScheduleMetaMap() {
  try {
    const raw = localStorage.getItem(SCHEDULE_META_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch (e) {}
  return {};
}

function saveScheduleMetaMap() {
  try {
    localStorage.setItem(
      SCHEDULE_META_STORAGE_KEY,
      JSON.stringify(localScheduleMetaMap)
    );
  } catch (e) {}
  if (liveBroadcast) {
    try {
      liveBroadcast.postMessage({
        type: "SCHEDULE_META_UPDATED",
        payload: localScheduleMetaMap
      });
    } catch (e) {}
  }
}

let cmsData = loadPersistedData();
let currentTab = "dashboard";
let requestFilter = "all";
const localReadStatusMap = loadReadStatusMap();
const localScheduleMetaMap = loadScheduleMetaMap();

// --- Row Normalization ---
function normalizeRequestRow(row) {
  if (row && typeof row === "object") {
    knownRequestColumns = Object.keys(row);
  }
  const key = String(row.id);
  let isRead = false;
  if (typeof localReadStatusMap[key] === "boolean") {
    isRead = localReadStatusMap[key];
  } else if (typeof row.is_read === "boolean") {
    isRead = row.is_read;
  } else if (typeof row.read === "boolean") {
    isRead = row.read;
  } else if (typeof row.sudah_dibaca === "boolean") {
    isRead = row.sudah_dibaca;
  } else if (typeof row.status === "string") {
    const st = row.status.toLowerCase();
    isRead = st === "read" || st === "dibaca" || st === "sudah dibaca";
  }
  return {
    id: row.id,
    name:
      row.nama ??
      row.name ??
      row.pengirim ??
      row.sender_name ??
      row.user_name ??
      "Pendengar",
    location: row.lokasi ?? row.location ?? row.kota ?? row.daerah ?? "",
    song:
      row.lagu ??
      row.judul_lagu ??
      row.artis_lagu ??
      row.song ??
      row.song_title ??
      row.request_lagu ??
      "",
    message:
      row.pesan ??
      row.salam ??
      row.message ??
      row.ucapan ??
      row.isi_pesan ??
      "",
    time: formatRelativeTime(row.created_at ?? row.waktu ?? row.time),
    read: isRead,
    raw: row
  };
}

function normalizeScheduleRow(row, index = 0, activeIndex = -1) {
  if (row && typeof row === "object") {
    knownScheduleColumns = Object.keys(row);
  }
  const savedMeta =
    (row && row.id != null && localScheduleMetaMap[String(row.id)]) || null;
  let timeStr = row.time_slot ?? row.jam_siaran ?? "";
  if (!timeStr && (row.start_time || row.jam_mulai)) {
    const start = String(row.start_time ?? row.jam_mulai ?? "").slice(0, 5);
    const end = String(row.end_time ?? row.jam_selesai ?? "").slice(0, 5);
    timeStr = end ? `${start} - ${end} WIB` : `${start} WIB`;
  }
  if (!timeStr) {
    const rawFallbackTime = row.jam ?? row.waktu ?? row.time ?? "";
    if (rawFallbackTime) {
      timeStr = String(rawFallbackTime).includes("-")
        ? String(rawFallbackTime)
        : `${String(rawFallbackTime).slice(0, 5)} WIB`;
    }
  }
  if (savedMeta && savedMeta.displayTime && (!timeStr || !timeStr.includes("-"))) {
    timeStr = savedMeta.displayTime;
  }
  const isOnAir = Boolean(row.is_on_air);
  let statusLabel =
    savedMeta && savedMeta.status && savedMeta.status !== "ON AIR"
      ? savedMeta.status
      : "NANTI";
  if (isOnAir) {
    statusLabel = "ON AIR";
  } else if (!savedMeta?.status && activeIndex !== -1) {
    if (index < activeIndex) statusLabel = "SELESAI";
    else if (index === activeIndex + 1) statusLabel = "BERIKUTNYA";
  }
  return {
    id: row.id,
    dayName: row.day_name ?? row.hari ?? row.day ?? savedMeta?.dayName ?? "Setiap Hari",
    time: timeStr || "09:00 - 12:00 WIB",
    status: statusLabel,
    isOnAir: isOnAir,
    title:
      row.program_name ??
      row.nama_program ??
      row.title ??
      row.judul_program ??
      row.acara ??
      row.program ??
      row.name ??
      "Program RADJAfm",
    hosts:
      row.announcer ??
      row.penyiar ??
      row.host_name ??
      row.hosts ??
      row.host ??
      row.nama_penyiar ??
      "Penyiar RADJAfm",
    description:
      row.description ??
      row.deskripsi ??
      row.desc ??
      savedMeta?.description ??
      "Menemani aktivitas Anda di 101.8 FM bersama pilihan lagu terbaik.",
    genre:
      row.genre ??
      row.kategori ??
      row.category ??
      row.day_name ??
      savedMeta?.genre ??
      "Siaran Harian",
    raw: row
  };
}

export function showToast(text, isError = false) {
  const toast = document.getElementById("toastAlert");
  if (!toast) return;
  toast.textContent = (isError ? "⚠ " : "✓ ") + text;
  toast.className = isError
    ? "text-xs font-bold bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 rounded-full animate-fadeIn"
    : "text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-full animate-fadeIn";
  toast.classList.remove("hidden");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 3000);
}

// --- Adaptive Supabase Insert / Update Helpers ---
function buildRequestPayload(name, location, song, message) {
  if (Array.isArray(knownRequestColumns) && knownRequestColumns.length > 0) {
    const payload = {};
    const pick = (candidates, val) => {
      const found = candidates.find((c) => knownRequestColumns.includes(c));
      if (found) payload[found] = val;
    };
    pick(["nama", "name", "pengirim", "sender_name", "user_name"], name);
    pick(["lokasi", "location", "kota", "daerah"], location);
    pick(["lagu", "judul_lagu", "artis_lagu", "song", "song_title", "request_lagu"], song);
    pick(["pesan", "salam", "message", "ucapan", "isi_pesan"], message);
    if (Object.keys(payload).length > 0) return payload;
  }
  return {
    nama: name,
    lokasi: location,
    lagu: song,
    pesan: message
  };
}

async function insertRequestToSupabase(name, location, song, message) {
  let payload = buildRequestPayload(name, location, song, message);
  const aliasQueue = {
    lokasi: ["kota", "daerah", "location"],
    lagu: ["judul_lagu", "artis_lagu", "song", "song_title", "request_lagu"],
    pesan: ["salam", "ucapan", "message", "isi_pesan"],
    nama: ["name", "pengirim", "sender_name", "user_name"]
  };
  const valueByGroup = { nama: name, lokasi: location, lagu: song, pesan: message };

  for (let attempt = 0; attempt < 10; attempt++) {
    const { data, error } = await supabaseClient.from("requests").insert([payload]).select();
    if (!error) {
      if (data && data[0]) {
        knownRequestColumns = Object.keys(data[0]);
        const patch = {};
        const ensureCol = (candidates, val) => {
          const col = candidates.find((c) => knownRequestColumns.includes(c));
          if (col && data[0][col] == null && val) patch[col] = val;
        };
        ensureCol(["lokasi", "kota", "daerah", "location"], location);
        ensureCol(["lagu", "judul_lagu", "artis_lagu", "song", "song_title", "request_lagu"], song);
        ensureCol(["pesan", "salam", "ucapan", "message", "isi_pesan"], message);
        if (Object.keys(patch).length > 0) {
          await supabaseClient.from("requests").update(patch).eq("id", data[0].id);
        }
      }
      return { data, error: null };
    }

    const msg = error.message || "";
    const missingMatch = msg.match(/Could not find the '([^']+)' column/);
    const notNullMatch = msg.match(/null value in column "([^"]+)"/);

    if (missingMatch) {
      const badCol = missingMatch[1];
      delete payload[badCol];
      for (const [group, list] of Object.entries(aliasQueue)) {
        if (badCol === group || list.includes(badCol)) {
          const nextCol = list.shift();
          if (nextCol) payload[nextCol] = valueByGroup[group];
          break;
        }
      }
      continue;
    }

    if (notNullMatch) {
      const reqCol = notNullMatch[1];
      if (reqCol.includes("nama") || reqCol.includes("name") || reqCol.includes("pengirim")) {
        payload[reqCol] = name;
      } else if (
        reqCol.includes("pesan") ||
        reqCol.includes("salam") ||
        reqCol.includes("msg") ||
        reqCol.includes("message")
      ) {
        payload[reqCol] = message;
      } else if (
        reqCol.includes("lagu") ||
        reqCol.includes("song") ||
        reqCol.includes("judul") ||
        reqCol.includes("artis")
      ) {
        payload[reqCol] = song || "-";
      } else if (reqCol.includes("lokasi") || reqCol.includes("kota") || reqCol.includes("loc")) {
        payload[reqCol] = location || "Semarang";
      } else {
        payload[reqCol] = "-";
      }
      continue;
    }
    return { data: null, error };
  }
  return { data: null, error: new Error("Gagal menyesuaikan skema tabel requests") };
}

function buildSchedulePayload(sched) {
  const parsedTime = parseAndNormalizeScheduleTime(sched.time);
  const startTime = parsedTime.startSqlTime;
  const endTime = parsedTime.endSqlTime;
  const displayTime = parsedTime.displayTime;

  if (Array.isArray(knownScheduleColumns) && knownScheduleColumns.length > 0) {
    const payload = {};
    const pick = (candidates, val) => {
      const found = candidates.find((c) => knownScheduleColumns.includes(c));
      if (found) payload[found] = val;
    };
    pick(["day_name", "hari", "day"], sched.dayName || sched.genre || "Setiap Hari");
    pick(["is_on_air"], Boolean(sched.isOnAir));
    pick(["time_slot", "jam_siaran"], displayTime);
    pick(["start_time", "jam_mulai"], startTime);
    pick(["end_time", "jam_selesai"], endTime);
    if (
      !payload.time_slot &&
      !payload.jam_siaran &&
      !payload.start_time &&
      !payload.jam_mulai
    ) {
      pick(["jam", "waktu", "time"], displayTime);
    }
    pick(
      ["program_name", "nama_program", "title", "judul_program", "acara", "program", "name"],
      sched.title
    );
    pick(
      ["announcer", "penyiar", "host_name", "hosts", "host", "nama_penyiar"],
      sched.hosts
    );
    pick(["description", "deskripsi", "desc"], sched.description);
    pick(["genre", "kategori", "category"], sched.genre);
    if (Object.keys(payload).length > 0) return payload;
  }

  return {
    day_name: sched.dayName || sched.genre || "Setiap Hari",
    is_on_air: Boolean(sched.isOnAir),
    time_slot: displayTime,
    program_name: sched.title,
    announcer: sched.hosts,
    description: sched.description
  };
}

async function writeScheduleToSupabase(sched, editId = null) {
  const parsedTime = parseAndNormalizeScheduleTime(sched.time);
  const startTime = parsedTime.startSqlTime;
  const endTime = parsedTime.endSqlTime;
  const displayTime = parsedTime.displayTime;

  let payload = buildSchedulePayload(sched);
  const aliasQueue = {
    time_slot: ["jam_siaran", "jam", "waktu", "time", "start_time"],
    program_name: ["nama_program", "title", "judul_program", "acara", "program", "name"],
    announcer: ["penyiar", "host_name", "hosts", "host", "nama_penyiar"],
    description: ["deskripsi", "desc"],
    day_name: ["hari", "day"]
  };
  const valueByGroup = {
    time_slot: displayTime,
    program_name: sched.title,
    announcer: sched.hosts,
    description: sched.description,
    day_name: sched.dayName || sched.genre || "Setiap Hari"
  };

  for (let attempt = 0; attempt < 14; attempt++) {
    let query;
    if (editId) {
      query = supabaseClient.from("schedules").update(payload).eq("id", editId).select();
    } else {
      query = supabaseClient.from("schedules").insert([payload]).select();
    }
    const { data, error } = await query;
    if (!error) {
      if (data && data[0]) {
        knownScheduleColumns = Object.keys(data[0]);
        const savedId = String(data[0].id);
        localScheduleMetaMap[savedId] = {
          description: sched.description,
          genre: sched.genre,
          dayName: sched.dayName,
          status: sched.status,
          displayTime: displayTime
        };
        saveScheduleMetaMap();

        const patch = {};
        const ensureCol = (candidates, val) => {
          const col = candidates.find((c) => knownScheduleColumns.includes(c));
          if (col && data[0][col] == null && val !== undefined) patch[col] = val;
        };
        ensureCol(["time_slot", "jam_siaran"], displayTime);
        ensureCol(["start_time", "jam_mulai"], startTime);
        ensureCol(["end_time", "jam_selesai"], endTime);
        ensureCol(
          ["program_name", "nama_program", "title", "judul_program", "acara", "program", "name"],
          sched.title
        );
        ensureCol(
          ["announcer", "penyiar", "host_name", "hosts", "host", "nama_penyiar"],
          sched.hosts
        );
        ensureCol(["description", "deskripsi", "desc"], sched.description);
        ensureCol(["genre", "kategori", "category"], sched.genre);
        if (Object.keys(patch).length > 0) {
          await supabaseClient.from("schedules").update(patch).eq("id", data[0].id);
        }
      }
      return { data, error: null };
    }

    const msg = error.message || "";
    const missingMatch = msg.match(/Could not find the '([^']+)' column/);
    const notNullMatch = msg.match(/null value in column "([^"]+)"/);
    const invalidTimeMatch = msg.match(/invalid input syntax for type time/i);

    if (invalidTimeMatch) {
      let fixedAny = false;
      for (const k of Object.keys(payload)) {
        if (k.includes("end") || k.includes("selesai")) {
          if (payload[k] !== endTime) {
            payload[k] = endTime;
            fixedAny = true;
          }
        } else if (k.includes("time") || k.includes("jam") || k.includes("waktu")) {
          if (payload[k] !== startTime) {
            payload[k] = startTime;
            fixedAny = true;
          }
        }
      }
      if (fixedAny) continue;
    }

    if (missingMatch) {
      const badCol = missingMatch[1];
      delete payload[badCol];
      for (const [group, list] of Object.entries(aliasQueue)) {
        if (badCol === group || list.includes(badCol)) {
          const nextCol = list.shift();
          if (nextCol) {
            payload[nextCol] = nextCol === "start_time" ? startTime : valueByGroup[group];
          }
          break;
        }
      }
      continue;
    }

    if (notNullMatch) {
      const reqCol = notNullMatch[1];
      if (reqCol.includes("day") || reqCol.includes("hari")) {
        payload[reqCol] = sched.dayName || "Setiap Hari";
      } else if (reqCol.includes("start") || reqCol.includes("mulai")) {
        payload[reqCol] = startTime;
      } else if (reqCol.includes("end") || reqCol.includes("selesai")) {
        payload[reqCol] = endTime;
      } else if (reqCol.includes("time_slot") || reqCol.includes("jam_siaran")) {
        payload[reqCol] = displayTime;
      } else if (reqCol.includes("time") || reqCol.includes("jam") || reqCol.includes("waktu")) {
        payload[reqCol] = startTime;
      } else if (
        reqCol.includes("prog") ||
        reqCol.includes("title") ||
        reqCol.includes("nama") ||
        reqCol.includes("acara")
      ) {
        payload[reqCol] = sched.title;
      } else if (
        reqCol.includes("announcer") ||
        reqCol.includes("penyiar") ||
        reqCol.includes("host")
      ) {
        payload[reqCol] = sched.hosts;
      } else if (reqCol.includes("desc")) {
        payload[reqCol] = sched.description;
      } else {
        payload[reqCol] = "-";
      }
      continue;
    }
    return { data: null, error };
  }
  return { data: null, error: new Error("Gagal menyesuaikan skema tabel schedules") };
}

// --- Fetch Data from Supabase ---
export async function fetchRequestsFromSupabase() {
  try {
    const { data, error } = await supabaseClient
      .from("requests")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      console.warn("Gagal mengambil data requests dari Supabase:", error.message);
      return;
    }
    if (Array.isArray(data)) {
      cmsData.requests = data.map(normalizeRequestRow);
      renderAll();
    }
  } catch (err) {
    console.warn("Error fetchRequestsFromSupabase:", err);
  }
}

export async function fetchSchedulesFromSupabase() {
  try {
    const { data, error } = await supabaseClient
      .from("schedules")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      console.warn("Gagal mengambil data schedules dari Supabase:", error.message);
      return;
    }
    if (Array.isArray(data) && data.length > 0) {
      const rawActiveIdx = data.findIndex((r) => Boolean(r.is_on_air));
      cmsData.schedules = data.map((row, idx) =>
        normalizeScheduleRow(row, idx, rawActiveIdx)
      );
      const activeShow = cmsData.schedules.find((s) => s.isOnAir) || cmsData.schedules[0];
      if (activeShow) {
        cmsData.onAir.id = activeShow.id;
        cmsData.onAir.title = activeShow.title;
        cmsData.onAir.hosts = activeShow.hosts;
        cmsData.onAir.description = activeShow.description;
      }
      const seedBtn = document.getElementById("btnSeedSchedules");
      if (seedBtn) seedBtn.classList.add("hidden");
      renderAll();
    } else {
      const seedBtn = document.getElementById("btnSeedSchedules");
      if (seedBtn) seedBtn.classList.remove("hidden");
      renderAll();
    }
  } catch (err) {
    console.warn("Error fetchSchedulesFromSupabase:", err);
  }
}

// --- Realtime Subscriptions (requests & schedules) ---
function initSupabaseRealtime() {
  supabaseClient
    .channel("admin-requests-realtime")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "requests" },
      (payload) => {
        if (payload && payload.new) {
          const newItem = normalizeRequestRow(payload.new);
          const exists = cmsData.requests.some((r) => String(r.id) === String(newItem.id));
          if (!exists) {
            cmsData.requests.unshift(newItem);
          }
          renderAll();
          showToast("Pesan baru masuk dari " + newItem.name);
        } else {
          fetchRequestsFromSupabase();
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "requests" },
      (payload) => {
        if (payload && payload.new) {
          const updated = normalizeRequestRow(payload.new);
          const idx = cmsData.requests.findIndex((r) => String(r.id) === String(updated.id));
          if (idx !== -1) {
            cmsData.requests[idx] = updated;
          } else {
            cmsData.requests.unshift(updated);
          }
          renderAll();
        } else {
          fetchRequestsFromSupabase();
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "requests" },
      (payload) => {
        if (payload && payload.old && payload.old.id !== undefined) {
          cmsData.requests = cmsData.requests.filter(
            (r) => String(r.id) !== String(payload.old.id)
          );
          renderAll();
        } else {
          fetchRequestsFromSupabase();
        }
      }
    )
    .subscribe();

  supabaseClient
    .channel("admin-schedules-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "schedules" },
      () => {
        fetchSchedulesFromSupabase();
      }
    )
    .subscribe();

  studioSyncChannel = supabaseClient.channel("radjafm-studio-sync");
  studioSyncChannel.subscribe();
}

// --- Tab Navigation ---
export function switchTab(tabName) {
  currentTab = tabName;
  const titles = {
    dashboard: "Dashboard Studio",
    requests: "Moderasi Request & Salam",
    schedule: "Manajemen Jadwal Siaran",
    announcers: "Manajemen Profil Penyiar",
    settings: "Pengaturan Stream & Sistem"
  };
  const pageTitle = document.getElementById("pageTitle");
  if (pageTitle) pageTitle.textContent = titles[tabName] || "Dashboard Studio";

  ["dashboard", "requests", "schedule", "announcers", "settings"].forEach((t) => {
    const sec = document.getElementById("tab-" + t);
    const sideBtn = document.getElementById("side-" + t);
    const mobBtn = document.getElementById("mob-" + t);
    if (!sec) return;

    if (t === tabName) {
      sec.classList.remove("hidden");
      sec.classList.add("block");
      if (sideBtn) {
        sideBtn.className =
          "side-btn w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition bg-brand-500 text-white shadow-sm shadow-brand-500/30";
      }
      if (mobBtn) {
        mobBtn.className =
          "px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap bg-brand-500 text-white";
      }
    } else {
      sec.classList.add("hidden");
      sec.classList.remove("block");
      if (sideBtn) {
        sideBtn.className =
          "side-btn w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold text-gray-300 hover:text-white hover:bg-white/5 transition";
      }
      if (mobBtn) {
        mobBtn.className =
          "px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap text-gray-600 bg-gray-100";
      }
    }
  });
}

// --- Render Functions ---
export function renderAll() {
  const unreadCount = cmsData.requests.filter((r) => !r.read).length;
  const activeAnnCount = cmsData.announcers.filter((a) => a.online).length;

  document.getElementById("sidebarUnreadBadge").textContent = unreadCount;
  document.getElementById("sidebarActiveShow").textContent = cmsData.onAir.title;
  document.getElementById("statOnAirProgram").textContent = cmsData.onAir.title;
  document.getElementById("statOnAirHost").textContent = cmsData.onAir.hosts;
  document.getElementById("statTotalRequests").textContent =
    cmsData.requests.length + " Pesan";
  document.getElementById("statUnreadRequests").textContent =
    unreadCount + " belum dibacakan";
  document.getElementById("statTotalSchedule").textContent =
    cmsData.schedules.length + " Program";
  document.getElementById("statTotalAnnouncers").textContent =
    cmsData.announcers.length + " Penyiar";
  document.getElementById("statActiveAnnouncers").textContent =
    activeAnnCount + " sedang bertugas";

  const activeEl = document.activeElement;
  if (activeEl !== document.getElementById("quickProgramTitle")) {
    document.getElementById("quickProgramTitle").value = cmsData.onAir.title;
  }
  if (activeEl !== document.getElementById("quickProgramHosts")) {
    document.getElementById("quickProgramHosts").value = cmsData.onAir.hosts;
  }
  if (activeEl !== document.getElementById("quickProgramDesc")) {
    document.getElementById("quickProgramDesc").value = cmsData.onAir.description;
  }

  if (activeEl !== document.getElementById("settingStreamUrl")) {
    document.getElementById("settingStreamUrl").value =
      cmsData.onAir.streamUrl || DEFAULT_DATA.onAir.streamUrl;
  }
  if (activeEl !== document.getElementById("settingStreamQuality")) {
    document.getElementById("settingStreamQuality").value =
      cmsData.onAir.quality || "HD 128kbps";
  }
  if (activeEl !== document.getElementById("settingFrequency")) {
    document.getElementById("settingFrequency").value =
      cmsData.onAir.frequency || "101.8 FM";
  }
  updateAdminStreamTypeBadge(document.getElementById("settingStreamUrl").value);

  renderDashboardRequests();
  renderRequestsTab();
  renderScheduleTab();
  renderAnnouncersTab();
}

function extractCleanUrl(rawInput) {
  if (!rawInput) return "";
  let trimmed = String(rawInput).trim();
  const iframeSrc = trimmed.match(/src=["']([^"']+)["']/i);
  if (iframeSrc && iframeSrc[1]) {
    trimmed = iframeSrc[1].trim();
  }
  return trimmed;
}

export function updateAdminStreamTypeBadge(rawVal) {
  const badge = document.getElementById("streamSourceTypeBadge");
  if (!badge) return;
  const val = extractCleanUrl(rawVal);
  if (/youtube\.com|youtu\.be/i.test(val)) {
    badge.className =
      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-600 border border-red-200 text-xs font-bold self-start sm:self-center";
    badge.textContent = "▶️ YouTube Live / Video";
  } else if (/soundcloud\.com/i.test(val)) {
    badge.className =
      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold self-start sm:self-center";
    badge.textContent = "☁️ SoundCloud Audio";
  } else if (/\.m3u8(\?.*)?$/i.test(val)) {
    badge.className =
      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-xs font-bold self-start sm:self-center";
    badge.textContent = "📡 HLS Stream (.m3u8)";
  } else {
    badge.className =
      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 text-brand-700 border border-orange-200 text-xs font-bold self-start sm:self-center";
    badge.textContent = "📻 Icecast / Direct Stream";
  }
}

export function applyPresetStream(url) {
  const input = document.getElementById("settingStreamUrl");
  if (input) {
    input.value = url;
    updateAdminStreamTypeBadge(url);
  }
}

function renderDashboardRequests() {
  const container = document.getElementById("dashboardRecentRequests");
  if (!container) return;
  if (cmsData.requests.length === 0) {
    container.innerHTML = `<p class="text-xs text-gray-400 py-8 text-center">Belum ada pesan masuk di tabel <code class="font-mono">requests</code> Supabase.</p>`;
    return;
  }
  container.innerHTML = cmsData.requests
    .slice(0, 5)
    .map(
      (req) => `
      <div class="p-4 rounded-2xl border ${
        req.read ? "bg-gray-50 border-gray-100 opacity-75" : "bg-orange-50/40 border-orange-200"
      } flex items-start justify-between gap-4">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="font-bold text-sm text-gray-900">${escapeHtml(req.name)}</span>
            <span class="text-xs text-gray-400">(${escapeHtml(req.location || "Indonesia")})</span>
            <span class="text-[10px] font-mono text-gray-400">• ${escapeHtml(req.time)}</span>
          </div>
          ${req.song ? `<div class="text-xs font-semibold text-brand-600">🎵 ${escapeHtml(req.song)}</div>` : ""}
          <p class="text-xs text-gray-700">"${escapeHtml(req.message)}"</p>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button onclick="toggleRequestRead('${req.id}')" class="px-2.5 py-1 rounded-lg text-[11px] font-bold ${
            req.read
              ? "bg-gray-200 text-gray-600"
              : "bg-emerald-500 text-white hover:bg-emerald-600"
          } transition">
            ${req.read ? "Dibaca" : "Tandai Dibaca"}
          </button>
          <button onclick="deleteRequest('${req.id}')" class="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition" title="Hapus">
            🗑️
          </button>
        </div>
      </div>
    `
    )
    .join("");
}

function renderRequestsTab() {
  const container = document.getElementById("adminRequestList");
  if (!container) return;
  let list = cmsData.requests;
  if (requestFilter === "unread") list = list.filter((r) => !r.read);
  if (requestFilter === "read") list = list.filter((r) => r.read);

  if (list.length === 0) {
    container.innerHTML = `<div class="bg-white rounded-3xl p-10 text-center text-sm text-gray-400 border border-gray-100">Tidak ada pesan pada kategori ini.</div>`;
    return;
  }

  container.innerHTML = list
    .map(
      (req) => `
      <div class="bg-white rounded-2xl p-5 border ${
        req.read ? "border-gray-100" : "border-orange-200 ring-1 ring-orange-100"
      } shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="space-y-1.5">
          <div class="flex flex-wrap items-center gap-2">
            <span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
              req.read ? "bg-gray-100 text-gray-500" : "bg-brand-500 text-white"
            }">
              ${req.read ? "Sudah Dibaca" : "Baru"}
            </span>
            <span class="font-bold text-base text-gray-900">${escapeHtml(req.name)}</span>
            <span class="text-xs text-gray-500">• ${escapeHtml(req.location || "Indonesia")}</span>
            <span class="text-xs font-mono text-gray-400">(${escapeHtml(req.time)})</span>
          </div>
          ${
            req.song
              ? `<div class="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 bg-orange-50 border border-orange-200/60 px-2.5 py-0.5 rounded-full">🎵 ${escapeHtml(req.song)}</div>`
              : ""
          }
          <p class="text-sm text-gray-700 leading-relaxed">"${escapeHtml(req.message)}"</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button onclick="toggleRequestRead('${req.id}')" class="px-3.5 py-2 rounded-xl text-xs font-bold ${
            req.read
              ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
              : "bg-emerald-500 text-white hover:bg-emerald-600"
          } transition">
            ${req.read ? "Batal Tandai" : "✓ Tandai Dibaca"}
          </button>
          <button onclick="deleteRequest('${req.id}')" class="px-3 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition">
            Hapus
          </button>
        </div>
      </div>
    `
    )
    .join("");
}

function renderScheduleTab() {
  const container = document.getElementById("adminScheduleList");
  if (!container) return;
  container.innerHTML = cmsData.schedules
    .map((sch) => {
      const isOnAir = Boolean(sch.isOnAir) || sch.status === "ON AIR";
      return `
        <div class="rounded-2xl p-5 border ${
          isOnAir
            ? "bg-orange-50/70 border-brand-500 ring-2 ring-orange-200"
            : "bg-white border-gray-200/80"
        } shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            <div class="flex items-center gap-2 sm:w-48 shrink-0">
              <span class="font-mono font-bold text-xs sm:text-sm ${
                isOnAir
                  ? "text-brand-700 bg-white px-2.5 py-1 rounded-md border border-brand-200"
                  : "text-gray-600"
              }">${escapeHtml(sch.time)}</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                isOnAir
                  ? "bg-brand-500 text-white"
                  : sch.status === "SELESAI"
                  ? "bg-gray-100 text-gray-500"
                  : "bg-blue-50 text-blue-600"
              }">
                ${isOnAir ? "ON AIR" : escapeHtml(sch.status || "JADWAL")}
              </span>
            </div>
            <div>
              <h3 class="font-serif font-bold text-lg text-gray-900">${escapeHtml(sch.title)}</h3>
              <p class="text-xs text-gray-600">${escapeHtml(sch.description)}</p>
              <p class="text-xs font-semibold text-brand-600 mt-1">${escapeHtml(sch.hosts)} <span class="text-gray-400 font-normal">• ${escapeHtml(sch.genre || sch.dayName)}</span></p>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2 shrink-0">
            ${
              !isOnAir
                ? `
              <button onclick="setScheduleOnAir('${sch.id}')" class="px-3 py-1.5 rounded-xl bg-brand-50 hover:bg-brand-500 text-brand-600 hover:text-white border border-brand-200 text-xs font-bold transition">
                Set ON AIR
              </button>
            `
                : `
              <span class="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                ● Mengudara
              </span>
            `
            }
            <button onclick="openScheduleModal('${sch.id}')" class="px-3 py-1.5 rounded-xl border border-gray-200 hover:border-gray-300 text-gray-700 text-xs font-bold bg-white">
              Edit
            </button>
            <button onclick="deleteSchedule('${sch.id}')" class="px-3 py-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold bg-white">
              Hapus
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderAnnouncersTab() {
  const container = document.getElementById("adminAnnouncerGrid");
  if (!container) return;
  container.innerHTML = cmsData.announcers
    .map(
      (ann) => `
      <div class="bg-white rounded-2xl p-6 border border-gray-100 shadow-xs flex flex-col items-center text-center">
        <div class="relative w-20 h-20 mb-3">
          <img src="${escapeHtml(ann.avatar || "https://www.gstatic.com/labs-code/stitch/stitch-placeholder-300x300.svg")}" alt="${escapeHtml(ann.name)}" class="w-full h-full object-cover rounded-full ring-2 ring-orange-200 p-0.5" />
          <span class="absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white ${
            ann.online ? "bg-emerald-500" : "bg-gray-300"
          }"></span>
        </div>
        <h3 class="font-serif text-lg font-bold text-gray-900">${escapeHtml(ann.name)}</h3>
        <span class="text-xs font-semibold text-brand-600 bg-orange-50 px-2.5 py-0.5 rounded-full border border-orange-200/60 mt-1">${escapeHtml(ann.show)}</span>
        <span class="text-[11px] font-mono text-gray-400 mt-1">${escapeHtml(ann.time)}</span>
        <p class="text-xs text-gray-600 mt-2 line-clamp-2">${escapeHtml(ann.bio)}</p>
        <div class="mt-4 pt-3 w-full border-t border-gray-100 flex items-center justify-between gap-2">
          <button onclick="toggleAnnouncerOnline('${ann.id}')" class="px-2.5 py-1 rounded-lg text-[11px] font-bold ${
            ann.online
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-gray-100 text-gray-600"
          }">
            ${ann.online ? "● On Air" : "○ Offline"}
          </button>
          <div class="flex items-center gap-1.5">
            <button onclick="openAnnouncerModal('${ann.id}')" class="px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50">Edit</button>
            <button onclick="deleteAnnouncer('${ann.id}')" class="px-2.5 py-1 rounded-lg border border-red-200 text-xs font-bold text-red-600 hover:bg-red-50">Hapus</button>
          </div>
        </div>
      </div>
    `
    )
    .join("");
}

// --- Actions: On-Air & Settings ---
export async function saveOnAirQuickForm(e) {
  e.preventDefault();
  const title = document.getElementById("quickProgramTitle").value.trim();
  const hosts = document.getElementById("quickProgramHosts").value.trim();
  const description = document.getElementById("quickProgramDesc").value.trim();

  cmsData.onAir.title = title;
  cmsData.onAir.hosts = hosts;
  cmsData.onAir.description = description;
  savePersistedData();

  const activeSch =
    cmsData.schedules.find((s) => s.isOnAir || s.status === "ON AIR") ||
    cmsData.schedules[0];
  if (activeSch && !String(activeSch.id).startsWith("sch-")) {
    const updatedSched = {
      ...activeSch,
      title,
      hosts,
      description,
      isOnAir: true
    };
    const { error } = await writeScheduleToSupabase(updatedSched, activeSch.id);
    if (error) {
      showToast("Gagal update jadwal aktif di Supabase: " + error.message, true);
      return;
    }
    await fetchSchedulesFromSupabase();
    showToast("Info Sedang Mengudara diperbarui di Supabase!");
  } else {
    const { error } = await writeScheduleToSupabase({
      dayName: "Setiap Hari",
      time: "09:00 - 12:00 WIB",
      title,
      hosts,
      description,
      genre: "Live Broadcast",
      isOnAir: true
    });
    if (!error) {
      await fetchSchedulesFromSupabase();
      showToast("Program ON AIR disimpan ke Supabase!");
    } else {
      renderAll();
      showToast("Info Sedang Mengudara diperbarui!");
    }
  }
}

export function saveStreamSettings(e) {
  e.preventDefault();
  const rawUrl = document.getElementById("settingStreamUrl").value.trim();
  cmsData.onAir.streamUrl = extractCleanUrl(rawUrl);
  cmsData.onAir.quality = document.getElementById("settingStreamQuality").value.trim();
  cmsData.onAir.frequency = document.getElementById("settingFrequency").value.trim();
  savePersistedData();
  renderAll();
  showToast("Pengaturan stream disimpan & disinkronkan ke Web Publik!");
}

export async function resetToDefaultData() {
  if (!confirm("Reset pengaturan stream & penyiar ke awal dan muat ulang data Supabase?")) {
    return;
  }
  localStorage.removeItem(STORAGE_KEY);
  cmsData = JSON.parse(JSON.stringify(DEFAULT_DATA));
  savePersistedData();
  await Promise.all([fetchRequestsFromSupabase(), fetchSchedulesFromSupabase()]);
  renderAll();
  showToast("Data berhasil direset & disinkronkan ulang!");
}

// --- Actions: Requests ---
export function setRequestFilter(filter) {
  requestFilter = filter;
  ["all", "unread", "read"].forEach((f) => {
    const btn = document.getElementById("filter-" + f);
    if (!btn) return;
    btn.className =
      f === filter
        ? "px-3.5 py-2 rounded-xl text-xs font-bold bg-brand-500 text-white transition"
        : "px-3.5 py-2 rounded-xl text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition";
  });
  renderRequestsTab();
}

export async function toggleRequestRead(id) {
  const item = cmsData.requests.find((r) => String(r.id) === String(id));
  if (!item) return;
  const nextRead = !item.read;
  item.read = nextRead;
  localReadStatusMap[String(item.id)] = nextRead;
  saveReadStatusMap();
  renderAll();

  if (Array.isArray(knownRequestColumns)) {
    const boolCol = ["is_read", "read", "sudah_dibaca"].find((c) =>
      knownRequestColumns.includes(c)
    );
    if (boolCol) {
      await supabaseClient
        .from("requests")
        .update({ [boolCol]: nextRead })
        .eq("id", item.id);
    } else if (knownRequestColumns.includes("status")) {
      await supabaseClient
        .from("requests")
        .update({ status: nextRead ? "read" : "unread" })
        .eq("id", item.id);
    }
  }
  showToast(nextRead ? "Pesan ditandai sudah dibaca (Tersimpan)" : "Status baca dibatalkan");
}

export async function deleteRequest(id) {
  const prev = [...cmsData.requests];
  cmsData.requests = cmsData.requests.filter((r) => String(r.id) !== String(id));
  delete localReadStatusMap[String(id)];
  saveReadStatusMap();
  renderAll();

  const { error } = await supabaseClient.from("requests").delete().eq("id", id);
  if (error) {
    cmsData.requests = prev;
    renderAll();
    showToast("Gagal menghapus pesan: " + error.message, true);
    return;
  }
  showToast("Pesan dihapus dari Supabase");
}

export function openAddShoutoutModal() {
  document.getElementById("admShoutName").value = "";
  document.getElementById("admShoutLoc").value = "";
  document.getElementById("admShoutSong").value = "";
  document.getElementById("admShoutMsg").value = "";
  openModal("modalShoutout");
}

export async function submitAdminShoutout(e) {
  e.preventDefault();
  const name = document.getElementById("admShoutName").value.trim();
  const location =
    document.getElementById("admShoutLoc").value.trim() || "Studio RADJAfm";
  const song = document.getElementById("admShoutSong").value.trim();
  const message = document.getElementById("admShoutMsg").value.trim();

  const { data, error } = await insertRequestToSupabase(name, location, song, message);
  if (error) {
    showToast("Gagal mengirim salam ke Supabase: " + error.message, true);
    return;
  }
  closeModal("modalShoutout");
  if (data && data[0]) {
    const inserted = normalizeRequestRow(data[0]);
    if (!cmsData.requests.some((r) => String(r.id) === String(inserted.id))) {
      cmsData.requests.unshift(inserted);
    }
    renderAll();
  } else {
    await fetchRequestsFromSupabase();
  }
  showToast("Salam baru ditambahkan ke Supabase Live Feed!");
}

// --- Actions: Schedule ---
export async function seedDefaultSchedulesToSupabase() {
  const btn = document.getElementById("btnSeedSchedules");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Menyimpan ke Supabase...";
  }
  for (const item of DEFAULT_DATA.schedules) {
    await writeScheduleToSupabase(item);
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = "⚡ Isi 6 Jadwal Awal ke Supabase";
  }
  await fetchSchedulesFromSupabase();
  showToast("6 Jadwal awal berhasil disimpan ke Supabase!");
}

export async function setScheduleOnAir(id) {
  const target = cmsData.schedules.find((s) => String(s.id) === String(id));
  if (!target) return;

  if (String(id).startsWith("sch-")) {
    DEFAULT_DATA.schedules.forEach((s) => {
      s.isOnAir = s.id === id;
      s.status = s.isOnAir ? "ON AIR" : "NANTI";
    });
    await seedDefaultSchedulesToSupabase();
    return;
  }

  const { error: resetErr } = await supabaseClient
    .from("schedules")
    .update({ is_on_air: false })
    .eq("is_on_air", true);

  if (resetErr) {
    console.warn("Reset is_on_air warning:", resetErr.message);
  }

  const { error: setErr } = await supabaseClient
    .from("schedules")
    .update({ is_on_air: true })
    .eq("id", id);

  if (setErr) {
    showToast("Gagal mengupdate status ON AIR di Supabase: " + setErr.message, true);
    return;
  }

  await fetchSchedulesFromSupabase();
  showToast('Program "' + target.title + '" sekarang ON AIR di Supabase!');
}

export function openScheduleModal(editId) {
  const modalTitle = document.getElementById("modalScheduleTitle");
  if (editId) {
    const s = cmsData.schedules.find((x) => String(x.id) === String(editId));
    if (!s) return;
    modalTitle.textContent = "Edit Jadwal Siaran";
    document.getElementById("schedEditId").value = s.id;
    document.getElementById("schedTime").value = s.time;
    document.getElementById("schedStatus").value =
      s.isOnAir || s.status === "ON AIR" ? "ON AIR" : s.status || "NANTI";
    document.getElementById("schedTitle").value = s.title;
    document.getElementById("schedHosts").value = s.hosts;
    document.getElementById("schedGenre").value =
      s.genre || s.dayName || "Setiap Hari";
    document.getElementById("schedDesc").value = s.description;
  } else {
    modalTitle.textContent = "Tambah Jadwal Siaran";
    document.getElementById("schedEditId").value = "";
    document.getElementById("schedTime").value = "";
    document.getElementById("schedStatus").value = "NANTI";
    document.getElementById("schedTitle").value = "";
    document.getElementById("schedHosts").value = "";
    document.getElementById("schedGenre").value = "Setiap Hari";
    document.getElementById("schedDesc").value = "";
  }
  openModal("modalSchedule");
}

export async function submitScheduleForm(e) {
  e.preventDefault();
  const editId = document.getElementById("schedEditId").value;
  const statusVal = document.getElementById("schedStatus").value;
  const isOnAir = statusVal === "ON AIR";

  const parsedTime = parseAndNormalizeScheduleTime(
    document.getElementById("schedTime").value
  );
  const schedObj = {
    dayName: document.getElementById("schedGenre").value.trim() || "Setiap Hari",
    time: parsedTime.displayTime,
    status: statusVal,
    isOnAir: isOnAir,
    title: document.getElementById("schedTitle").value.trim(),
    hosts: document.getElementById("schedHosts").value.trim(),
    genre: document.getElementById("schedGenre").value.trim(),
    description: document.getElementById("schedDesc").value.trim()
  };

  if (isOnAir) {
    await supabaseClient
      .from("schedules")
      .update({ is_on_air: false })
      .eq("is_on_air", true);
  }

  const isExistingDbRow = editId && !String(editId).startsWith("sch-");
  const { error } = await writeScheduleToSupabase(
    schedObj,
    isExistingDbRow ? editId : null
  );

  if (error) {
    showToast("Gagal menyimpan jadwal ke Supabase: " + error.message, true);
    return;
  }

  closeModal("modalSchedule");
  await fetchSchedulesFromSupabase();
  showToast("Jadwal siaran disimpan ke Supabase!");
}

export async function deleteSchedule(id) {
  if (String(id).startsWith("sch-")) {
    cmsData.schedules = cmsData.schedules.filter((s) => String(s.id) !== String(id));
    renderAll();
    showToast("Jadwal dihapus");
    return;
  }

  const { error } = await supabaseClient.from("schedules").delete().eq("id", id);
  if (error) {
    showToast("Gagal menghapus jadwal dari Supabase: " + error.message, true);
    return;
  }
  delete localScheduleMetaMap[String(id)];
  saveScheduleMetaMap();
  await fetchSchedulesFromSupabase();
  showToast("Jadwal dihapus dari Supabase!");
}

// --- Actions: Announcers ---
export function toggleAnnouncerOnline(id) {
  const ann = cmsData.announcers.find((a) => a.id === id);
  if (ann) {
    ann.online = !ann.online;
    savePersistedData();
    renderAll();
    showToast("Status penyiar diperbarui & disimpan!");
  }
}

export function openAnnouncerModal(editId) {
  const modalTitle = document.getElementById("modalAnnouncerTitle");
  if (editId) {
    const a = cmsData.announcers.find((x) => x.id === editId);
    if (!a) return;
    modalTitle.textContent = "Edit Profil Penyiar";
    document.getElementById("annEditId").value = a.id;
    document.getElementById("annName").value = a.name;
    document.getElementById("annShow").value = a.show;
    document.getElementById("annTime").value = a.time;
    document.getElementById("annTag").value = a.tag;
    document.getElementById("annSocial").value = a.social;
    document.getElementById("annAvatar").value = a.avatar;
    document.getElementById("annBio").value = a.bio;
    document.getElementById("annOnline").checked = !!a.online;
  } else {
    modalTitle.textContent = "Tambah Penyiar Baru";
    document.getElementById("annEditId").value = "";
    document.getElementById("annName").value = "";
    document.getElementById("annShow").value = "";
    document.getElementById("annTime").value = "";
    document.getElementById("annTag").value = "Host RADJAfm";
    document.getElementById("annSocial").value = "@radjafm";
    document.getElementById("annAvatar").value = "";
    document.getElementById("annBio").value = "";
    document.getElementById("annOnline").checked = false;
  }
  openModal("modalAnnouncer");
}

export function submitAnnouncerForm(e) {
  e.preventDefault();
  const editId = document.getElementById("annEditId").value;
  const defaultAvatar =
    "https://lh3.googleusercontent.com/aida-public/AB6AXuA-TvNM2ZZPV_JMS5zwOAZe1YItf-Spcs4hdDFpYQKpFgtJys8pMS13JBrbRsq8VjBxcEg_FfcA9YFi6fRALesM5fWrLvIto2Hjs9IkmaK8DweWDwAzltWaboplviRD01jqFDWbNrUlPLnY1Y8rnAi95i77-FA6uZZURSLY6fJXs7kglOGdZNErNTreLAlKboC2zUG1k2d4LFEbt2YH0gh4uy77dWPPP7I86zQcllAl";
  const payload = {
    id: editId || "ann-" + Date.now(),
    name: document.getElementById("annName").value.trim(),
    show: document.getElementById("annShow").value.trim(),
    time: document.getElementById("annTime").value.trim(),
    tag: document.getElementById("annTag").value.trim(),
    social: document.getElementById("annSocial").value.trim(),
    avatar: document.getElementById("annAvatar").value.trim() || defaultAvatar,
    bio: document.getElementById("annBio").value.trim(),
    online: document.getElementById("annOnline").checked
  };

  if (editId) {
    const idx = cmsData.announcers.findIndex((x) => x.id === editId);
    if (idx !== -1) cmsData.announcers[idx] = payload;
  } else {
    cmsData.announcers.push(payload);
  }
  savePersistedData();
  closeModal("modalAnnouncer");
  renderAll();
  showToast("Profil penyiar disimpan & disinkronkan ke Web Publik!");
}

export function deleteAnnouncer(id) {
  cmsData.announcers = cmsData.announcers.filter((a) => a.id !== id);
  savePersistedData();
  renderAll();
  showToast("Penyiar dihapus & disimpan!");
}

// --- Modal Helpers ---
export function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("hidden");
  el.classList.add("flex");
}

export function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("hidden");
  el.classList.remove("flex");
}

// --- Initialization & Global Bindings ---
document.addEventListener("DOMContentLoaded", () => {
  renderAll();
  fetchSchedulesFromSupabase();
  fetchRequestsFromSupabase();
  initSupabaseRealtime();
});

Object.assign(window, {
  switchTab,
  saveOnAirQuickForm,
  saveStreamSettings,
  updateAdminStreamTypeBadge,
  applyPresetStream,
  resetToDefaultData,
  setRequestFilter,
  toggleRequestRead,
  deleteRequest,
  openAddShoutoutModal,
  submitAdminShoutout,
  seedDefaultSchedulesToSupabase,
  setScheduleOnAir,
  openScheduleModal,
  submitScheduleForm,
  deleteSchedule,
  toggleAnnouncerOnline,
  openAnnouncerModal,
  submitAnnouncerForm,
  deleteAnnouncer,
  openModal,
  closeModal
});

