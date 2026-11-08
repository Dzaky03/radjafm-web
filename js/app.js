// ============================================================================
// RADJAfm 101.8 FM - Public Web SPA, Supabase Feed & Schedule Logic (js/app.js)
// ============================================================================

import {
  supabaseClient,
  STORAGE_KEY,
  SCHEDULE_META_STORAGE_KEY,
  liveBroadcast,
  escapeHtml,
  formatRelativeTime,
  getSavedScheduleMeta
} from "./config.js";

import {
  initPlayer,
  configurePlayerStream
} from "./player.js";

const appState = {
  currentView: "beranda",
  mobileMenuOpen: false
};

let knownRequestColumns = null;

function getAppDom() {
  return {
    views: {
      beranda: document.getElementById("view-beranda"),
      request: document.getElementById("view-request"),
      penyiar: document.getElementById("view-penyiar")
    },
    navButtons: {
      beranda: document.getElementById("nav-beranda"),
      request: document.getElementById("nav-request"),
      penyiar: document.getElementById("nav-penyiar")
    },
    mobNavButtons: {
      beranda: document.getElementById("mob-nav-beranda"),
      request: document.getElementById("mob-nav-request"),
      penyiar: document.getElementById("mob-nav-penyiar")
    },
    shoutoutFeed: document.getElementById("shoutoutFeed"),
    mobileMenuDropdown: document.getElementById("mobileMenuDropdown"),
    menuIconOpen: document.getElementById("menuIconOpen"),
    menuIconClose: document.getElementById("menuIconClose")
  };
}

// --- Client-Side Routing (SPA) ---
export function navigate(viewName, updateHash = true) {
  const { views, navButtons, mobNavButtons } = getAppDom();
  if (!views[viewName]) return;
  appState.currentView = viewName;

  if (updateHash) {
    history.replaceState(null, "", `#${viewName}`);
  }

  Object.keys(views).forEach((key) => {
    if (!views[key]) return;
    if (key === viewName) {
      views[key].classList.remove("hidden");
      views[key].classList.add("block");
    } else {
      views[key].classList.add("hidden");
      views[key].classList.remove("block");
    }
  });

  Object.keys(navButtons).forEach((key) => {
    const btn = navButtons[key];
    if (!btn) return;
    if (key === viewName) {
      btn.className =
        "nav-tab px-4 py-2.5 text-sm font-semibold rounded-lg transition-all border-b-2 border-brand-500 text-brand-600 bg-orange-50/50";
    } else {
      btn.className =
        "nav-tab px-4 py-2.5 text-sm font-semibold rounded-lg transition-all border-b-2 border-transparent text-gray-600 hover:text-brand-500 hover:bg-gray-50";
    }
  });

  Object.keys(mobNavButtons).forEach((key) => {
    const mobBtn = mobNavButtons[key];
    if (!mobBtn) return;
    if (key === viewName) {
      mobBtn.className =
        "mob-tab w-full text-left px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-between text-brand-600 bg-orange-50 border-l-4 border-brand-500";
    } else {
      mobBtn.className =
        "mob-tab w-full text-left px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-between text-gray-700 hover:text-brand-600 hover:bg-gray-50 border-l-4 border-transparent";
    }
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function toggleMobileMenu(forceState) {
  const { mobileMenuDropdown, menuIconOpen, menuIconClose } = getAppDom();
  if (typeof forceState === "boolean") {
    appState.mobileMenuOpen = forceState;
  } else {
    appState.mobileMenuOpen = !appState.mobileMenuOpen;
  }

  if (!mobileMenuDropdown || !menuIconOpen || !menuIconClose) return;

  if (appState.mobileMenuOpen) {
    mobileMenuDropdown.classList.remove("hidden");
    menuIconOpen.classList.add("hidden");
    menuIconClose.classList.remove("hidden");
  } else {
    mobileMenuDropdown.classList.add("hidden");
    menuIconOpen.classList.remove("hidden");
    menuIconClose.classList.add("hidden");
  }
}

// --- Data Normalization ---
function normalizeRequestRow(row) {
  if (row && typeof row === "object") {
    knownRequestColumns = Object.keys(row);
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
    time: formatRelativeTime(row.created_at ?? row.waktu ?? row.time)
  };
}

function normalizeScheduleRow(row) {
  const savedMeta = getSavedScheduleMeta(row && row.id);
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
  return {
    id: row.id,
    dayName: row.day_name ?? row.hari ?? row.day ?? savedMeta?.dayName ?? "Setiap Hari",
    time: timeStr || "09:00 - 12:00 WIB",
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
    status: savedMeta?.status || null,
    isOnAir: Boolean(row.is_on_air)
  };
}

// --- Adaptive Supabase Request Insert ---
function buildRequestInsertPayload(name, location, song, message) {
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
  let payload = buildRequestInsertPayload(name, location, song, message);
  const aliasQueue = {
    lokasi: ["kota", "daerah", "location"],
    lagu: ["judul_lagu", "artis_lagu", "song", "song_title", "request_lagu"],
    pesan: ["salam", "ucapan", "message", "isi_pesan"],
    nama: ["name", "pengirim", "sender_name", "user_name"]
  };
  const valueByGroup = { nama: name, lokasi: location, lagu: song, pesan: message };

  for (let attempt = 0; attempt < 10; attempt++) {
    // Gunakan .insert([payload]) tanpa .select() agar tetap lolos jika role 'anon'
    // pada RLS Supabase hanya diizinkan melakukan INSERT (tanpa SELECT/RETURNING).
    const { error } = await supabaseClient.from("requests").insert([payload]);
    if (!error) {
      return {
        id: "local-" + Date.now(),
        nama: name,
        lokasi: location,
        lagu: song,
        pesan: message,
        created_at: new Date().toISOString()
      };
    }

    const unknownMatch =
      error.message && error.message.match(/Could not find the '([^']+)' column/);
    if (unknownMatch) {
      const badCol = unknownMatch[1];
      delete payload[badCol];
      for (const group of Object.keys(aliasQueue)) {
        if (badCol === group || aliasQueue[group].includes(badCol)) {
          const nextCol = aliasQueue[group].shift();
          if (nextCol) payload[nextCol] = valueByGroup[group];
          break;
        }
      }
      continue;
    }

    const notNullMatch = error.message && error.message.match(/column "([^"]+)"/);
    if (error.code === "23502" && notNullMatch) {
      const reqCol = notNullMatch[1];
      const lower = reqCol.toLowerCase();
      if (lower.includes("nam") || lower.includes("user") || lower.includes("pengirim")) {
        payload[reqCol] = name;
      } else if (
        lower.includes("lok") ||
        lower.includes("loc") ||
        lower.includes("kota") ||
        lower.includes("daerah")
      ) {
        payload[reqCol] = location || "Indonesia";
      } else if (
        lower.includes("lagu") ||
        lower.includes("song") ||
        lower.includes("judul") ||
        lower.includes("artis")
      ) {
        payload[reqCol] = song || "-";
      } else {
        payload[reqCol] = message;
      }
      continue;
    }

    throw error;
  }
}

export async function handleRequestSubmit(e) {
  e.preventDefault();
  const nameInput = document.getElementById("userName");
  const locationInput = document.getElementById("userLocation");
  const songInput = document.getElementById("userSong");
  const messageInput = document.getElementById("userMessage");
  const submitBtn = document.getElementById("submitBtn");

  const name = nameInput.value.trim();
  const location = locationInput.value.trim();
  const song = songInput.value.trim();
  const message = messageInput.value.trim();

  if (!name || !message) return;

  const originalHTML = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span>Mengirim...</span>`;

  try {
    const insertedRow = await insertRequestToSupabase(name, location, song, message);

    submitBtn.classList.remove("bg-orange-500", "hover:bg-orange-600");
    submitBtn.classList.add("bg-emerald-600", "hover:bg-emerald-700");
    submitBtn.innerHTML = `
      <svg class="w-4 h-4 animate-bounce" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
      <span>✓ Pesan Terkirim!</span>
    `;

    nameInput.value = "";
    locationInput.value = "";
    songInput.value = "";
    messageInput.value = "";

    if (insertedRow) {
      prependOrUpdateRequestDOM(normalizeRequestRow(insertedRow));
    } else {
      await loadRequestsFromSupabase();
    }
  } catch (err) {
    console.error("Gagal mengirim request ke Supabase:", err);
    alert("Gagal mengirim pesan: " + (err.message || "Terjadi kesalahan jaringan"));
  } finally {
    setTimeout(() => {
      submitBtn.disabled = false;
      submitBtn.classList.remove("bg-emerald-600", "hover:bg-emerald-700");
      submitBtn.classList.add("bg-orange-500", "hover:bg-orange-600");
      submitBtn.innerHTML = originalHTML;
    }, 2500);
  }
}

// --- Live Shoutout Feed DOM Rendering ---
function createShoutoutCardHTML(req) {
  const locText = req.location ? `(${escapeHtml(req.location)})` : "";
  return `
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="font-bold text-sm text-gray-900">${escapeHtml(req.name)} <span class="font-normal text-gray-500 text-xs">${locText}</span></span>
      </div>
      <span class="text-[11px] text-brand-600 font-bold font-mono bg-white px-2 py-0.5 rounded-md border border-orange-200">${escapeHtml(req.time)}</span>
    </div>
    ${
      req.song
        ? `
      <div class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-700 bg-orange-100/60 border border-orange-200/60 rounded-full px-2.5 py-0.5 w-fit">
        🎵 ${escapeHtml(req.song)}
      </div>
    `
        : ""
    }
    <p class="text-xs sm:text-sm text-gray-800 leading-relaxed font-medium">
      "${escapeHtml(req.message)}"
    </p>
  `;
}

function prependOrUpdateRequestDOM(req) {
  const { shoutoutFeed } = getAppDom();
  if (!shoutoutFeed) return;
  const emptyPlaceholder = shoutoutFeed.querySelector("[data-empty-feed]");
  if (emptyPlaceholder) emptyPlaceholder.remove();

  const existing =
    req.id !== undefined ? shoutoutFeed.querySelector(`[data-req-id="${req.id}"]`) : null;
  if (existing) {
    existing.innerHTML = createShoutoutCardHTML(req);
    return;
  }

  const card = document.createElement("div");
  if (req.id !== undefined) card.setAttribute("data-req-id", req.id);
  card.className =
    "bg-gray-50 border border-orange-200 rounded-2xl p-4 hover:border-orange-300 transition shadow-sm flex flex-col gap-2 animate-fadeIn";
  card.innerHTML = createShoutoutCardHTML(req);
  shoutoutFeed.insertBefore(card, shoutoutFeed.firstChild);
  shoutoutFeed.scrollTop = 0;
}

function removeRequestDOM(id) {
  const { shoutoutFeed } = getAppDom();
  if (!shoutoutFeed || id === undefined) return;
  const el = shoutoutFeed.querySelector(`[data-req-id="${id}"]`);
  if (el) el.remove();
}

export async function loadRequestsFromSupabase() {
  const { shoutoutFeed } = getAppDom();
  if (!shoutoutFeed) return;
  try {
    let { data, error } = await supabaseClient
      .from("requests")
      .select("*")
      .order("id", { ascending: false })
      .limit(30);

    if (error) {
      const fallback = await supabaseClient.from("requests").select("*").limit(30);
      data = fallback.data;
      error = fallback.error;
    }
    if (error) throw error;

    if (Array.isArray(data) && data.length > 0) {
      shoutoutFeed.innerHTML = "";
      data.forEach((row) => {
        const req = normalizeRequestRow(row);
        const card = document.createElement("div");
        if (req.id !== undefined) card.setAttribute("data-req-id", req.id);
        card.className =
          "bg-gray-50 border border-gray-100 rounded-2xl p-4 hover:border-orange-200 transition shadow-xs flex flex-col gap-2";
        card.innerHTML = createShoutoutCardHTML(req);
        shoutoutFeed.appendChild(card);
      });
    } else if (Array.isArray(data) && data.length === 0) {
      shoutoutFeed.innerHTML = `
        <div data-empty-feed="true" class="text-center py-12 text-xs text-gray-400">
          Belum ada request lagu atau salam masuk. Jadilah yang pertama mengirim salam!
        </div>
      `;
    }
  } catch (err) {
    console.warn("Gagal memuat data requests dari Supabase:", err);
  }
}

// --- Schedules & On-Air Hero Banner ---
export async function loadSchedulesFromSupabase() {
  try {
    let { data, error } = await supabaseClient
      .from("schedules")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      const fallback = await supabaseClient.from("schedules").select("*");
      data = fallback.data;
      error = fallback.error;
    }
    if (error) throw error;

    if (!Array.isArray(data) || data.length === 0) return;

    const schedules = data.map(normalizeScheduleRow);
    const onAirProgram = schedules.find((s) => s.isOnAir) || schedules[0];

    if (onAirProgram) {
      const heroTitle = document.getElementById("heroProgramTitle");
      const heroHosts = document.getElementById("heroProgramHosts");
      const heroDesc = document.getElementById("heroProgramDesc");
      const playerTitle = document.getElementById("playerTrackTitle");
      const playerHosts = document.getElementById("playerAnnouncerInfo");

      if (heroTitle) heroTitle.textContent = onAirProgram.title;
      if (heroHosts) heroHosts.textContent = onAirProgram.hosts;
      if (heroDesc) heroDesc.textContent = onAirProgram.description;
      if (playerTitle) playerTitle.textContent = `${onAirProgram.title} - RADJAfm`;
      if (playerHosts) playerHosts.textContent = onAirProgram.hosts;
    }

    const schedContainer = document.getElementById("scheduleListStack");
    if (schedContainer) {
      const onAirIdx = schedules.findIndex((s) => s.isOnAir);
      schedContainer.innerHTML = schedules
        .map((sch, idx) => {
          if (sch.isOnAir) {
            return `
              <div class="bg-orange-50/70 rounded-2xl p-4 sm:p-5 border-2 border-brand-500 shadow-md relative overflow-hidden ring-2 ring-orange-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div class="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                  <div class="flex items-center gap-2 sm:w-44 shrink-0">
                    <span class="font-mono font-bold text-xs sm:text-sm text-brand-700 bg-white/90 px-2.5 py-1 rounded-md border border-brand-200">${escapeHtml(sch.time)}</span>
                    <span class="flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-500 text-white text-[10px] font-black tracking-wider uppercase shadow-sm">
                      <span class="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                      ON AIR
                    </span>
                  </div>
                  <div>
                    <div class="flex items-center gap-2">
                      <h3 class="font-serif font-bold text-base sm:text-xl text-gray-900">${escapeHtml(sch.title)}</h3>
                      <span class="text-xs text-brand-600 font-bold hidden sm:inline">• Sedang Berlangsung</span>
                    </div>
                    <p class="text-xs text-gray-700 mt-0.5">${escapeHtml(sch.description)}</p>
                  </div>
                </div>
                <div class="text-xs md:text-right flex items-center md:flex-col justify-between pt-2 md:pt-0 border-t md:border-t-0 border-orange-200/60">
                  <span class="font-bold text-brand-700">${escapeHtml(sch.hosts)}</span>
                  <span class="text-[11px] text-brand-600 font-semibold">${escapeHtml(sch.dayName)}</span>
                </div>
              </div>
            `;
          }

          const isPast =
            sch.status === "SELESAI" || (!sch.status && onAirIdx !== -1 && idx < onAirIdx);
          const isNext =
            sch.status === "BERIKUTNYA" ||
            (!sch.status && onAirIdx !== -1 && idx === onAirIdx + 1);
          const statusLabel = isPast
            ? "SELESAI"
            : isNext
            ? "BERIKUTNYA"
            : sch.status || "JADWAL";
          const badgeClass = isPast
            ? "bg-gray-100 text-gray-500"
            : isNext
            ? "bg-blue-50 text-blue-600"
            : "bg-gray-100 text-gray-600";

          return `
            <div class="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/80 shadow-sm ${
              isPast ? "opacity-80 hover:opacity-100" : "hover:border-orange-200 hover:shadow-md"
            } transition flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div class="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                <div class="flex items-center gap-2 sm:w-44 shrink-0">
                  <span class="font-mono font-semibold text-xs sm:text-sm ${
                    isPast ? "text-gray-400" : "text-gray-600"
                  }">${escapeHtml(sch.time)}</span>
                  <span class="px-2 py-0.5 rounded ${badgeClass} text-[10px] font-bold">${statusLabel}</span>
                </div>
                <div>
                  <h3 class="font-serif font-bold text-base sm:text-lg ${
                    isPast ? "text-gray-800" : "text-gray-900"
                  }">${escapeHtml(sch.title)}</h3>
                  <p class="text-xs text-gray-500">${escapeHtml(sch.description)}</p>
                </div>
              </div>
              <div class="text-xs text-gray-500 md:text-right flex items-center md:flex-col justify-between pt-2 md:pt-0 border-t md:border-t-0 border-gray-100">
                <span class="font-semibold text-gray-800">${escapeHtml(sch.hosts)}</span>
                <span class="text-[11px] text-gray-400">${escapeHtml(sch.dayName)}</span>
              </div>
            </div>
          `;
        })
        .join("");
    }
  } catch (err) {
    console.warn("Gagal memuat jadwal dari Supabase:", err);
  }
}

// --- Studio Config & Announcers Sync ---
function applyStudioConfig(data) {
  if (!data || typeof data !== "object") return;

  if (data.onAir) {
    if (data.onAir.streamUrl) {
      configurePlayerStream(data.onAir.streamUrl);
    }
    if (data.onAir.quality) {
      const qBadge = document.getElementById("streamQualityBadge");
      if (qBadge) qBadge.textContent = data.onAir.quality;
    }
  }

  if (Array.isArray(data.announcers) && data.announcers.length > 0) {
    const announcerGrid =
      document.getElementById("announcerGridContainer") ||
      document.querySelector("#view-penyiar .grid");
    const countBadge = document.getElementById("announcerCountBadge");
    if (countBadge) {
      countBadge.textContent = `${data.announcers.length} Penyiar Utama`;
    }
    if (announcerGrid) {
      announcerGrid.innerHTML = data.announcers
        .map(
          (a) => `
          <div class="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md hover:border-orange-200 transition text-center flex flex-col items-center group">
            <div class="relative w-24 h-24 mb-4">
              <div class="w-full h-full rounded-full ring-4 ring-orange-100 group-hover:ring-brand-500 transition-all p-1 bg-white overflow-hidden shadow-inner">
                <img alt="${escapeHtml(a.name)}" class="w-full h-full object-cover rounded-full group-hover:scale-105 transition-transform duration-300" src="${escapeHtml(a.avatar)}" />
              </div>
              <span class="absolute bottom-0 right-1 w-5 h-5 ${
                a.online ? "bg-emerald-500" : "bg-gray-300"
              } border-2 border-white rounded-full" title="${a.online ? "On Air" : "Offline"}"></span>
            </div>
            <h3 class="font-serif text-xl font-bold text-gray-900 group-hover:text-brand-600 transition-colors">${escapeHtml(a.name)}</h3>
            <div class="mt-2 mb-1 flex items-center justify-center gap-2">
              <span class="text-xs font-semibold text-brand-600 bg-orange-50 px-3 py-1 rounded-full border border-orange-200/60">${escapeHtml(a.show)}</span>
            </div>
            <span class="text-[11px] font-mono text-gray-400 font-semibold">${escapeHtml(a.time)}</span>
            <p class="text-xs text-gray-600 mt-3 leading-relaxed">
              ${escapeHtml(a.bio)}
            </p>
            <div class="mt-5 pt-4 w-full border-t border-gray-100 flex items-center justify-between text-[11px]">
              <span class="font-medium text-brand-600 bg-orange-50/70 px-2.5 py-0.5 rounded-full">${escapeHtml(a.tag)}</span>
              <span class="font-mono text-gray-400">${escapeHtml(a.social)}</span>
            </div>
          </div>
        `
        )
        .join("");
    }
  }
}

export async function loadStudioSettingsAndAnnouncersFromSupabase() {
  try {
    const [settingsRes, announcersRes] = await Promise.all([
      supabaseClient.from("studio_settings").select("*").limit(1),
      supabaseClient.from("announcers").select("*").order("id", { ascending: true })
    ]);

    const configUpdate = {};
    if (!settingsRes.error && Array.isArray(settingsRes.data) && settingsRes.data[0]) {
      const row = settingsRes.data[0];
      configUpdate.onAir = {
        streamUrl: row.stream_url || row.streamUrl,
        quality: row.quality || "HD 128kbps",
        frequency: row.frequency || "101.8 FM"
      };
    }

    if (!announcersRes.error && Array.isArray(announcersRes.data) && announcersRes.data.length > 0) {
      configUpdate.announcers = announcersRes.data.map((a) => ({
        id: String(a.id),
        name: a.name ?? a.nama ?? "Penyiar RADJAfm",
        show: a.show ?? a.program ?? "Program RADJAfm",
        time: a.time ?? a.jam_siaran ?? "09:00 - 12:00 WIB",
        bio: a.bio ?? a.deskripsi ?? "",
        tag: a.tag ?? a.role ?? "Host RADJAfm",
        social: a.social ?? a.sosmed ?? "@radjafm",
        online: Boolean(a.online ?? a.is_online),
        avatar: a.avatar ?? a.foto ?? "https://www.gstatic.com/labs-code/stitch/stitch-placeholder-300x300.svg"
      }));
    }

    if (configUpdate.onAir || configUpdate.announcers) {
      applyStudioConfig(configUpdate);
    }
  } catch (e) {
    // Fallback otomatis ke localStorage jika tabel opsional belum dibuat di Supabase
  }
}

function loadStudioConfigAndAnnouncers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      applyStudioConfig(JSON.parse(raw));
    }
  } catch (err) {
    console.warn("Gagal memuat konfigurasi studio lokal:", err);
  }
  loadStudioSettingsAndAnnouncersFromSupabase();

  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        applyStudioConfig(JSON.parse(e.newValue));
      } catch (err) {}
    } else if (e.key === SCHEDULE_META_STORAGE_KEY) {
      loadSchedulesFromSupabase();
    }
  });

  if (liveBroadcast) {
    liveBroadcast.addEventListener("message", (e) => {
      if (e.data && e.data.type === "STUDIO_CONFIG_UPDATED" && e.data.payload) {
        applyStudioConfig(e.data.payload);
      } else if (e.data && e.data.type === "SCHEDULE_META_UPDATED") {
        loadSchedulesFromSupabase();
      }
    });
  }
}

// --- Supabase Realtime Subscriptions ---
function setupRealtimeSubscriptions() {
  supabaseClient
    .channel("public:requests:feed")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "requests" },
      (payload) => {
        if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
          prependOrUpdateRequestDOM(normalizeRequestRow(payload.new));
        } else if (payload.eventType === "DELETE" && payload.old) {
          removeRequestDOM(payload.old.id);
        }
      }
    )
    .subscribe();

  supabaseClient
    .channel("public:schedules:live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "schedules" },
      () => {
        loadSchedulesFromSupabase();
      }
    )
    .subscribe();

  supabaseClient
    .channel("public:studio-config:live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "studio_settings" },
      () => {
        loadStudioSettingsAndAnnouncersFromSupabase();
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "announcers" },
      () => {
        loadStudioSettingsAndAnnouncersFromSupabase();
      }
    )
    .subscribe();

  supabaseClient
    .channel("radjafm-studio-sync")
    .on("broadcast", { event: "studio-config-updated" }, (payload) => {
      if (payload && payload.payload) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(payload.payload));
        } catch (e) {}
        applyStudioConfig(payload.payload);
      }
    })
    .subscribe();
}

// --- Initialization & Global Bindings ---
document.addEventListener("DOMContentLoaded", () => {
  initPlayer();
  loadStudioConfigAndAnnouncers();
  loadSchedulesFromSupabase();
  loadRequestsFromSupabase();
  setupRealtimeSubscriptions();

  const { views } = getAppDom();
  const hash = window.location.hash.replace("#", "");
  if (views[hash]) {
    navigate(hash, false);
  }
});

window.addEventListener("hashchange", () => {
  const { views } = getAppDom();
  const hash = window.location.hash.replace("#", "");
  if (views[hash] && appState.currentView !== hash) {
    navigate(hash, false);
  }
});

window.navigate = navigate;
window.toggleMobileMenu = toggleMobileMenu;
window.handleRequestSubmit = handleRequestSubmit;

