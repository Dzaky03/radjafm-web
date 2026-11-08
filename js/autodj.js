// ============================================================================
// RADJAfm 101.8 FM - Web-based AutoDJ & Local Playlist Manager (js/autodj.js)
// Connects Supabase Storage ('radio_audio') + Table ('playlist') + HTML5 <audio>
// ============================================================================

import {
  supabaseClient,
  DEFAULT_ICECAST_STREAM,
  liveBroadcast,
  studioSyncChannel,
  escapeHtml,
  formatRelativeTime
} from "./config.js";
import { showToast, openModal, closeModal } from "./admin.js";

const BROADCAST_MODE_KEY = "radjafm_broadcast_mode_v1";
const AUTODJ_SESSION_KEY = "radjafm_autodj_playback_session_v1";
const AUTODJ_BUCKET = "radio_audio";
const PLAYLIST_TABLE = "playlist";

let sessionRestored = false;

export const autoDjState = {
  broadcastMode: localStorage.getItem(BROADCAST_MODE_KEY) || "stream", // 'stream' | 'autodj'
  tracks: [],
  currentIndex: -1,
  isPlaying: false,
  isLoop: true,
  isShuffle: false,
  volume: 90,
  audioBound: false,
  realtimeBound: false,
  remoteBound: false
};

export function getAutoDjSession() {
  try {
    const raw = localStorage.getItem(AUTODJ_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function saveAutoDjSession(overrideProps = {}) {
  try {
    const audio = getAutoDjAudio();
    const total = autoDjState.tracks.length;
    const activeTrack =
      autoDjState.currentIndex >= 0 && autoDjState.currentIndex < total
        ? autoDjState.tracks[autoDjState.currentIndex]
        : null;

    if (!activeTrack) return;

    const isPlaying =
      typeof overrideProps.isPlaying === "boolean"
        ? overrideProps.isPlaying
        : autoDjState.isPlaying;

    const currentTime =
      typeof overrideProps.currentTime === "number"
        ? overrideProps.currentTime
        : audio && !isNaN(audio.currentTime)
        ? audio.currentTime
        : 0;

    const duration =
      typeof overrideProps.duration === "number"
        ? overrideProps.duration
        : audio && !isNaN(audio.duration) && isFinite(audio.duration)
        ? audio.duration
        : 0;

    const startedAt = isPlaying
      ? Date.now() - Math.round(currentTime * 1000)
      : null;

    const pausedAt = !isPlaying ? currentTime : null;

    const sessionData = {
      trackId: activeTrack.id,
      trackIndex: autoDjState.currentIndex,
      fileUrl: activeTrack.file_url,
      title: activeTrack.title,
      artist: activeTrack.artist,
      isPlaying: isPlaying,
      currentTime: currentTime,
      duration: duration,
      startedAt: startedAt,
      pausedAt: pausedAt,
      updatedAt: Date.now(),
      ...overrideProps
    };

    localStorage.setItem(AUTODJ_SESSION_KEY, JSON.stringify(sessionData));
  } catch (err) {
    console.warn("Gagal menyimpan sesi AutoDJ:", err);
  }
}

function formatDuration(sec) {
  if (!sec || isNaN(sec) || !isFinite(sec)) return "00:00";
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getAutoDjAudio() {
  return document.getElementById("adminAutoDjAudio");
}

// --- 1. Broadcast Source Sync to Supabase & Listeners ---
export async function syncBroadcastSourceToPublic(mode, trackOverride = null) {
  try {
    const targetMode = mode || autoDjState.broadcastMode || "stream";
    let targetStreamUrl = "";
    let trackPayload = null;

    if (targetMode === "autodj") {
      const activeTrack =
        trackOverride ||
        (autoDjState.currentIndex >= 0 && autoDjState.tracks[autoDjState.currentIndex]
          ? autoDjState.tracks[autoDjState.currentIndex]
          : autoDjState.tracks[0]);

      if (activeTrack && activeTrack.file_url) {
        targetStreamUrl = activeTrack.file_url;
        trackPayload = {
          id: activeTrack.id,
          title: activeTrack.title,
          artist: activeTrack.artist
        };
      } else {
        return;
      }
    } else {
      // Ambil stream URL tersimpan (Icecast / relay eksternal)
      targetStreamUrl =
        localStorage.getItem("radjafm_saved_stream_url") ||
        document.getElementById("settingStreamUrl")?.value?.trim() ||
        DEFAULT_ICECAST_STREAM;
    }

    // 1. Simpan ke Supabase tabel 'studio_settings'
    const settingsPayload = {
      id: 1,
      stream_url: targetStreamUrl,
      quality:
        targetMode === "autodj"
          ? autoDjState.isPlaying
            ? "AutoDJ HD"
            : "AutoDJ Paused"
          : "HD 128kbps",
      frequency: "101.8 FM",
      updated_at: new Date().toISOString()
    };

    try {
      await supabaseClient.from("studio_settings").upsert([settingsPayload]);
    } catch (dbErr) {
      console.warn("Gagal update studio_settings di Supabase:", dbErr);
    }

    // 2. Broadcast via Supabase Realtime channel 'radjafm-studio-sync'
    const broadcastData = {
      onAir: {
        streamUrl: targetStreamUrl,
        quality: settingsPayload.quality,
        frequency: "101.8 FM",
        sourceMode: targetMode,
        autodjTrack: trackPayload
      }
    };

    try {
      studioSyncChannel.send({
        type: "broadcast",
        event: "studio-config-updated",
        payload: broadcastData
      });
    } catch (bcErr) {
      console.warn("Gagal broadcast via Supabase Realtime channel:", bcErr);
    }

    // 3. Broadcast lokal antar tab via BroadcastChannel
    if (liveBroadcast) {
      liveBroadcast.postMessage({
        type: "STUDIO_CONFIG_UPDATED",
        payload: broadcastData
      });
    }
  } catch (err) {
    console.warn("Error syncBroadcastSourceToPublic:", err);
  }
}

// --- Live Audio Playback Synchronizer (Play, Pause, Seek Sync) ---
export function broadcastAutoDjPlaybackSync(customProps = {}) {
  const audio = getAutoDjAudio();
  const total = autoDjState.tracks.length;
  const activeTrack =
    autoDjState.currentIndex >= 0 && autoDjState.currentIndex < total
      ? autoDjState.tracks[autoDjState.currentIndex]
      : autoDjState.tracks[0];

  if (!activeTrack) return;

  const isPlaying =
    typeof customProps.isPlaying === "boolean"
      ? customProps.isPlaying
      : autoDjState.isPlaying;

  const currentTime =
    typeof customProps.currentTime === "number"
      ? customProps.currentTime
      : audio
      ? audio.currentTime
      : 0;

  const payload = {
    sender: "admin",
    sourceMode: "autodj",
    trackId: activeTrack.id,
    streamUrl: activeTrack.file_url,
    title: activeTrack.title,
    artist: activeTrack.artist,
    isPlaying: isPlaying,
    currentTime: currentTime,
    timestamp: Date.now(),
    ...customProps
  };

  // 1. Broadcast lewat Supabase Realtime channel
  try {
    studioSyncChannel.send({
      type: "broadcast",
      event: "autodj-playback-sync",
      payload: payload
    });
  } catch (e) {
    console.warn("Gagal broadcast autodj-playback-sync via Supabase:", e);
  }

  // 2. Broadcast lokal antar tab via BroadcastChannel
  if (liveBroadcast) {
    liveBroadcast.postMessage({
      type: "AUTODJ_PLAYBACK_SYNC",
      payload: payload
    });
  }
}

// --- Broadcast Source Mode Switcher ("stream" vs "autodj") ---
export async function setBroadcastSourceMode(mode, silent = false) {
  autoDjState.broadcastMode = mode === "autodj" ? "autodj" : "stream";
  try {
    localStorage.setItem(BROADCAST_MODE_KEY, autoDjState.broadcastMode);
  } catch (e) {}

  const btnStream = document.getElementById("btnSourceModeStream");
  const btnAutoDj = document.getElementById("btnSourceModeAutoDj");
  const tagStream = document.getElementById("tagModeStream");
  const tagAutoDj = document.getElementById("tagModeAutoDj");
  const badge = document.getElementById("broadcastModeActiveBadge");
  const badgeText = document.getElementById("broadcastModeActiveText");

  if (autoDjState.broadcastMode === "autodj") {
    if (btnAutoDj) {
      btnAutoDj.className =
        "p-4 rounded-2xl border-2 border-emerald-500 bg-emerald-50/50 text-left transition flex items-start gap-3.5 cursor-pointer";
    }
    if (btnStream) {
      btnStream.className =
        "p-4 rounded-2xl border border-gray-200 bg-white hover:border-orange-200 text-left transition flex items-start gap-3.5 cursor-pointer";
    }
    if (tagAutoDj) tagAutoDj.classList.remove("hidden");
    if (tagStream) tagStream.classList.add("hidden");
    if (badge) {
      badge.className =
        "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold self-start md:self-center shrink-0";
    }
    if (badgeText) badgeText.textContent = "Mode: AutoDJ Supabase (Siaran Publik Aktif)";

    if (autoDjState.tracks.length > 0) {
      if (autoDjState.currentIndex < 0) {
        autoDjState.currentIndex = 0;
      }
      const audio = getAutoDjAudio();
      const activeTrack = autoDjState.tracks[autoDjState.currentIndex];
      if (audio && activeTrack && !audio.src) {
        audio.src = activeTrack.file_url;
        audio.volume = autoDjState.volume / 100;
      }
      await syncBroadcastSourceToPublic("autodj");
      updateAutoDjDeckUI();
      renderPlaylistTable();
      if (!silent) {
        showToast("Sumber siaran dialihkan ke AutoDJ Supabase. Tekan 'Putar AutoDJ' untuk memulai musik.");
      }
    } else {
      if (!silent) {
        showToast("Mode AutoDJ diaktifkan. Silakan unggah lagu MP3 untuk disiarkan ke pendengar.", true);
      }
    }
  } else {
    if (btnStream) {
      btnStream.className =
        "p-4 rounded-2xl border-2 border-brand-500 bg-orange-50/60 text-left transition flex items-start gap-3.5 cursor-pointer";
    }
    if (btnAutoDj) {
      btnAutoDj.className =
        "p-4 rounded-2xl border border-gray-200 bg-white hover:border-orange-200 text-left transition flex items-start gap-3.5 cursor-pointer";
    }
    if (tagStream) tagStream.classList.remove("hidden");
    if (tagAutoDj) tagAutoDj.classList.add("hidden");
    if (badge) {
      badge.className =
        "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-50 text-brand-700 border border-orange-200 text-xs font-bold self-start md:self-center shrink-0";
    }
    if (badgeText) badgeText.textContent = "Mode: URL Stream (Icecast Aktif)";

    // Hentikan pemutaran AutoDJ studio di admin
    const audio = getAutoDjAudio();
    if (audio) {
      audio.pause();
      autoDjState.isPlaying = false;
      updateAutoDjDeckUI();
      renderPlaylistTable();
    }

    await syncBroadcastSourceToPublic("stream");
    const savedStreamUrl =
      localStorage.getItem("radjafm_saved_stream_url") ||
      document.getElementById("settingStreamUrl")?.value?.trim() ||
      DEFAULT_ICECAST_STREAM;

    try {
      studioSyncChannel.send({
        type: "broadcast",
        event: "autodj-playback-sync",
        payload: { sourceMode: "stream", streamUrl: savedStreamUrl }
      });
    } catch (e) {}

    if (liveBroadcast) {
      liveBroadcast.postMessage({
        type: "AUTODJ_PLAYBACK_SYNC",
        payload: { sourceMode: "stream", streamUrl: savedStreamUrl }
      });
    }

    if (!silent) {
      showToast("Sumber siaran dialihkan ke URL Stream (Icecast)! Pendengar kembali mendengarkan relay stream.");
    }
  }
}

// --- 2. Fetch & Render Playlist Table from Supabase ---
export async function fetchPlaylistFromSupabase() {
  try {
    let { data, error } = await supabaseClient
      .from(PLAYLIST_TABLE)
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      const fallback = await supabaseClient.from(PLAYLIST_TABLE).select("*");
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.warn("Gagal mengambil tabel playlist:", error.message);
      renderPlaylistTable();
      return;
    }

    if (Array.isArray(data)) {
      autoDjState.tracks = data.map((row) => ({
        id: row.id,
        title: row.title || "Tanpa Judul",
        artist: row.artist || "Artis Tidak Diketahui",
        file_path: row.file_path || "",
        file_url: row.file_url || "",
        created_at: row.created_at
      }));

      if (autoDjState.tracks.length === 0) {
        autoDjState.currentIndex = -1;
        autoDjState.isPlaying = false;
        renderPlaylistTable();
        updateAutoDjDeckUI();
        return;
      }

      const audio = getAutoDjAudio();

      if (!sessionRestored) {
        sessionRestored = true;
        const savedSession = getAutoDjSession();

        let targetIdx = 0;
        let targetTime = 0;
        let shouldResume = false;

        if (savedSession) {
          const matchedIdx = autoDjState.tracks.findIndex(
            (t) =>
              String(t.id) === String(savedSession.trackId) ||
              (t.file_url && t.file_url === savedSession.fileUrl)
          );
          if (matchedIdx !== -1) {
            targetIdx = matchedIdx;
          } else if (
            typeof savedSession.trackIndex === "number" &&
            savedSession.trackIndex >= 0 &&
            savedSession.trackIndex < autoDjState.tracks.length
          ) {
            targetIdx = savedSession.trackIndex;
          }

          if (savedSession.isPlaying) {
            shouldResume = true;
            if (savedSession.startedAt) {
              const elapsed = (Date.now() - savedSession.startedAt) / 1000;
              targetTime = Math.max(0, elapsed);
            } else {
              targetTime = savedSession.currentTime || 0;
            }
          } else {
            shouldResume = false;
            targetTime = savedSession.pausedAt ?? savedSession.currentTime ?? 0;
          }
        }

        autoDjState.currentIndex = targetIdx;
        const activeTrack = autoDjState.tracks[targetIdx];

        if (audio && activeTrack && activeTrack.file_url) {
          if (audio.src !== activeTrack.file_url) {
            audio.src = activeTrack.file_url;
          }
          audio.volume = autoDjState.volume / 100;
        }

        // Tampilkan langsung di DOM timer dan seek slider (Cegah tampilan kedip 00:00)
        const curEl = document.getElementById("autoDjCurrentTime");
        const durEl = document.getElementById("autoDjDuration");
        const slider = document.getElementById("autoDjSeekSlider");
        if (curEl) curEl.textContent = formatDuration(targetTime);
        if (savedSession && savedSession.duration > 0) {
          if (durEl) durEl.textContent = formatDuration(savedSession.duration);
          if (slider) {
            slider.value = Math.min(
              100,
              Math.max(0, (targetTime / savedSession.duration) * 100)
            ).toFixed(1);
          }
        }

        autoDjState.isPlaying = shouldResume;
        renderPlaylistTable();
        updateAutoDjDeckUI();

        const restorePlaybackState = () => {
          if (!audio) return;

          // Jika durasi terlampaui saat tab lama tertutup, lompat ke lagu berikutnya
          if (audio.duration && targetTime >= audio.duration) {
            if (autoDjState.isLoop || autoDjState.currentIndex < autoDjState.tracks.length - 1) {
              nextAutoDjTrack(true);
              return;
            }
          }

          if (targetTime > 0) {
            try {
              audio.currentTime = targetTime;
            } catch (e) {}
          }

          if (curEl) curEl.textContent = formatDuration(audio.currentTime);
          if (durEl && audio.duration) durEl.textContent = formatDuration(audio.duration);
          if (slider && audio.duration > 0) {
            slider.value = ((audio.currentTime / audio.duration) * 100).toFixed(1);
          }

          if (shouldResume && autoDjState.broadcastMode === "autodj") {
            const playPromise = audio.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  autoDjState.isPlaying = true;
                  updateAutoDjDeckUI();
                  renderPlaylistTable();
                  saveAutoDjSession({
                    isPlaying: true,
                    currentTime: audio.currentTime
                  });
                  syncBroadcastSourceToPublic("autodj", activeTrack);
                  broadcastAutoDjPlaybackSync({
                    isPlaying: true,
                    currentTime: audio.currentTime
                  });
                })
                .catch((err) => {
                  console.warn("Browser autoplay policy menahan resume otomatis:", err);
                  // Tetap pertahankan menit lagu yang akurat, tampilkan indikator standby siap lanjut
                  autoDjState.isPlaying = false;
                  updateAutoDjDeckUI();
                  renderPlaylistTable();

                  const statusBadge = document.getElementById("autoDjStatusBadge");
                  if (statusBadge) {
                    statusBadge.textContent = "AUTODJ ON AIR • KLIK UNTUK LANJUTKAN";
                    statusBadge.className =
                      "text-[11px] font-extrabold uppercase tracking-widest text-amber-400 animate-pulse";
                  }

                  const resumeOnFirstClick = () => {
                    window.removeEventListener("click", resumeOnFirstClick);
                    if (audio.paused && !autoDjState.isPlaying) {
                      toggleAutoDjPlay();
                    }
                  };
                  window.addEventListener("click", resumeOnFirstClick, { once: true });
                });
            }
          } else {
            autoDjState.isPlaying = false;
            updateAutoDjDeckUI();
            renderPlaylistTable();
          }
        };

        if (audio && audio.readyState >= 1) {
          restorePlaybackState();
        } else if (audio) {
          audio.addEventListener("loadedmetadata", restorePlaybackState, { once: true });
        }
      } else {
        // Pembaruan realtime latar belakang saat lagu sudah jalan di memori
        const currentPlayingId =
          autoDjState.currentIndex >= 0 && autoDjState.tracks[autoDjState.currentIndex]
            ? autoDjState.tracks[autoDjState.currentIndex].id
            : null;

        if (currentPlayingId !== null) {
          const foundIdx = autoDjState.tracks.findIndex(
            (t) => String(t.id) === String(currentPlayingId)
          );
          autoDjState.currentIndex = foundIdx !== -1 ? foundIdx : 0;
        } else if (autoDjState.currentIndex < 0) {
          autoDjState.currentIndex = 0;
        }

        renderPlaylistTable();
        updateAutoDjDeckUI();
      }
    }
  } catch (err) {
    console.warn("Error fetchPlaylistFromSupabase:", err);
  }
}

export function renderPlaylistTable() {
  const badge = document.getElementById("sidebarPlaylistBadge");
  if (badge) badge.textContent = autoDjState.tracks.length;

  const tbody = document.getElementById("autoDjPlaylistTableBody");
  if (!tbody) return;

  if (autoDjState.tracks.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="py-12 text-center text-xs text-gray-400">
          Belum ada lagu MP3 di tabel <code class="font-mono">playlist</code>. Silakan upload lagu MP3 pada form di atas.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = autoDjState.tracks
    .map((track, idx) => {
      const isCurrent = idx === autoDjState.currentIndex;
      const isPlayingNow = isCurrent && autoDjState.isPlaying;
      return `
        <tr class="transition ${
          isCurrent ? "bg-orange-50/80 font-semibold" : "hover:bg-gray-50/80"
        }">
          <td class="py-3.5 px-3 font-mono text-xs ${
            isCurrent ? "text-brand-600 font-bold" : "text-gray-400"
          }">
            ${
              isPlayingNow
                ? `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-500 text-white text-[10px] animate-pulse">▶</span>`
                : idx + 1
            }
          </td>
          <td class="py-3.5 px-3">
            <div class="flex items-center gap-2">
              <span class="text-gray-900 font-bold">${escapeHtml(track.title)}</span>
              ${
                isCurrent
                  ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      isPlayingNow
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-orange-100 text-brand-700"
                    }">${isPlayingNow ? "Sedang Diputar" : "Siap"}</span>`
                  : ""
              }
            </div>
          </td>
          <td class="py-3.5 px-3 text-gray-600 text-xs sm:text-sm">
            ${escapeHtml(track.artist)}
          </td>
          <td class="py-3.5 px-3 text-xs font-mono text-gray-400 hidden md:table-cell">
            ${escapeHtml(formatRelativeTime(track.created_at))}
          </td>
          <td class="py-3.5 px-3 text-right">
            <div class="inline-flex items-center justify-end gap-1.5">
              <button type="button" onclick="playAutoDjTrackByIndex(${idx})"
                class="px-3 py-1.5 rounded-xl text-xs font-bold ${
                  isPlayingNow
                    ? "bg-amber-500 hover:bg-amber-600 text-white"
                    : "bg-brand-500 hover:bg-brand-600 text-white"
                } transition cursor-pointer">
                ${isPlayingNow ? "⏸ Jeda" : "▶ Putar"}
              </button>
              <button type="button" onclick="openEditPlaylistModal('${track.id}')"
                class="px-2.5 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-100 text-xs font-bold text-gray-700 transition cursor-pointer">
                Edit
              </button>
              <button type="button" onclick="deletePlaylistTrack('${track.id}')"
                class="px-2.5 py-1.5 rounded-xl border border-red-200 hover:bg-red-50 text-xs font-bold text-red-600 transition cursor-pointer">
                Hapus
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

// --- 3. Upload MP3 to Bucket 'radio_audio' & Insert to 'playlist' ---
export function handleAutoDjFileSelected(e) {
  const file = e.target?.files?.[0];
  if (!file) return;

  const titleInp = document.getElementById("autoDjInputTitle");
  const artistInp = document.getElementById("autoDjInputArtist");
  const sizeHint = document.getElementById("autoDjFileSelectedSize");

  const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
  if (sizeHint) {
    sizeHint.textContent = `Ukuran: ${sizeMb} MB`;
    sizeHint.classList.remove("hidden");
    if (file.size > 50 * 1024 * 1024) {
      sizeHint.className = "font-bold text-red-600";
    } else {
      sizeHint.className = "font-bold text-emerald-600";
    }
  }

  if (file.size > 50 * 1024 * 1024) {
    showToast(
      `Perhatian: File ini berukuran ${sizeMb} MB (melebihi batas maksimal 50 MB Supabase Free Tier). Unggah akan gagal jika tidak dikompres atau dipecah per-lagu.`,
      true
    );
  }

  // Auto-parse "Artis - Judul.mp3" atau "Judul.mp3" jika input masih kosong
  const baseName = file.name.replace(/\.[^/.]+$/, "").trim();
  if (baseName.includes(" - ")) {
    const parts = baseName.split(" - ");
    if (artistInp && !artistInp.value.trim()) artistInp.value = parts[0].trim();
    if (titleInp && !titleInp.value.trim()) titleInp.value = parts.slice(1).join(" - ").trim();
  } else if (titleInp && !titleInp.value.trim()) {
    titleInp.value = baseName;
  }
}

export async function handleUploadPlaylistTrack(e) {
  e.preventDefault();
  const fileInp = document.getElementById("autoDjInputFile");
  const titleInp = document.getElementById("autoDjInputTitle");
  const artistInp = document.getElementById("autoDjInputArtist");
  const sizeHint = document.getElementById("autoDjFileSelectedSize");
  const statusBox = document.getElementById("autoDjUploadStatus");
  const statusText = document.getElementById("autoDjUploadStatusText");
  const submitBtn = document.getElementById("btnSubmitAutoDjUpload");

  const file = fileInp?.files?.[0];
  const title = (titleInp?.value || "").trim();
  const artist = (artistInp?.value || "").trim();

  if (!file) {
    showToast("Pilih file MP3 terlebih dahulu!", true);
    return;
  }
  if (!title || !artist) {
    showToast("Judul lagu dan nama artis wajib diisi!", true);
    return;
  }

  const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
  if (file.size > 50 * 1024 * 1024) {
    showToast(
      `File audio terlalu besar (${sizeMb} MB)! Batas maksimal per file di Supabase Storage Free Tier adalah 50 MB. Mohon gunakan file per-lagu atau kompres terlebih dahulu.`,
      true
    );
    return;
  }

  // Sanitasi nama file agar aman disimpan di Supabase Storage
  const safeFileName = file.name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "_")
    .replace(/_+/g, "_");
  const filePath = `tracks/${Date.now()}_${safeFileName}`;

  if (statusBox) statusBox.classList.remove("hidden");
  if (statusText) {
    statusText.innerHTML = `
      <span class="w-3.5 h-3.5 rounded-full border-2 border-brand-600 border-t-transparent animate-spin inline-block"></span>
      <span>Mengunggah "${escapeHtml(file.name)}" (${sizeMb} MB) ke bucket ${AUTODJ_BUCKET}...</span>
    `;
  }
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add("opacity-60");
  }

  try {
    // 1. Upload file ke Supabase Storage bucket 'radio_audio'
    const { error: uploadError } = await supabaseClient.storage
      .from(AUTODJ_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "audio/mpeg"
      });

    if (uploadError) {
      const errMsg = uploadError.message || "";
      if (errMsg.toLowerCase().includes("exceeded the maximum allowed size")) {
        throw new Error(
          `Ukuran file (${sizeMb} MB) melebihi batas bucket Supabase. Buka Dashboard Supabase > Storage > Buckets > radio_audio > Edit Bucket > atur "File size limit" ke 50 MB, atau unggah file berukuran lebih kecil.`
        );
      }
      throw new Error("Gagal upload ke bucket radio_audio: " + errMsg);
    }

    // 2. Ambil Public URL dari bucket 'radio_audio'
    const { data: pubUrlData } = supabaseClient.storage
      .from(AUTODJ_BUCKET)
      .getPublicUrl(filePath);

    const fileUrl = pubUrlData?.publicUrl;
    if (!fileUrl) {
      throw new Error("Gagal mendapatkan Public URL dari bucket radio_audio.");
    }

    if (statusText) {
      statusText.innerHTML = `
        <span class="w-3.5 h-3.5 rounded-full border-2 border-brand-600 border-t-transparent animate-spin inline-block"></span>
        <span>Menyimpan metadata lagu ke tabel playlist...</span>
      `;
    }

    // 3. Simpan metadata ke tabel 'playlist'
    const { error: insertError } = await supabaseClient.from(PLAYLIST_TABLE).insert([
      {
        title,
        artist,
        file_path: filePath,
        file_url: fileUrl
      }
    ]);

    if (insertError) {
      // Rollback file di storage jika insert ke tabel gagal
      await supabaseClient.storage.from(AUTODJ_BUCKET).remove([filePath]);
      throw new Error("Gagal menyimpan ke tabel playlist: " + insertError.message);
    }

    // Reset form & muat ulang playlist
    if (fileInp) fileInp.value = "";
    if (titleInp) titleInp.value = "";
    if (artistInp) artistInp.value = "";
    if (sizeHint) {
      sizeHint.textContent = "";
      sizeHint.classList.add("hidden");
    }

    await fetchPlaylistFromSupabase();
    showToast(`Lagu "${title}" berhasil diunggah ke Playlist AutoDJ!`);
  } catch (err) {
    console.error("Upload AutoDJ error:", err);
    showToast(err.message || "Gagal mengunggah lagu MP3", true);
  } finally {
    if (statusBox) statusBox.classList.add("hidden");
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove("opacity-60");
    }
  }
}

// --- 4. Edit & Delete Track on 'playlist' Table + 'radio_audio' Bucket ---
export function openEditPlaylistModal(id) {
  const track = autoDjState.tracks.find((t) => String(t.id) === String(id));
  if (!track) return;

  document.getElementById("editPlaylistId").value = track.id;
  document.getElementById("editPlaylistTitle").value = track.title;
  document.getElementById("editPlaylistArtist").value = track.artist;
  openModal("modalEditPlaylist");
}

export async function submitEditPlaylistForm(e) {
  e.preventDefault();
  const id = document.getElementById("editPlaylistId").value;
  const title = document.getElementById("editPlaylistTitle").value.trim();
  const artist = document.getElementById("editPlaylistArtist").value.trim();
  if (!id || !title || !artist) return;

  const { error } = await supabaseClient
    .from(PLAYLIST_TABLE)
    .update({ title, artist })
    .eq("id", id);

  if (error) {
    showToast("Gagal memperbarui lagu: " + error.message, true);
    return;
  }

  closeModal("modalEditPlaylist");
  await fetchPlaylistFromSupabase();
  showToast("Informasi lagu berhasil diperbarui!");
}

export async function deletePlaylistTrack(id) {
  const track = autoDjState.tracks.find((t) => String(t.id) === String(id));
  if (!track) return;

  if (!confirm(`Hapus lagu "${track.title} - ${track.artist}" dari Playlist & Storage?`)) {
    return;
  }

  const deletingIndex = autoDjState.tracks.findIndex((t) => String(t.id) === String(id));
  const wasPlayingDeleted =
    deletingIndex === autoDjState.currentIndex && autoDjState.isPlaying;

  // 1. Hapus record dari tabel 'playlist'
  const { error: dbError } = await supabaseClient
    .from(PLAYLIST_TABLE)
    .delete()
    .eq("id", id);

  if (dbError) {
    showToast("Gagal menghapus lagu dari database: " + dbError.message, true);
    return;
  }

  // 2. Hapus file dari bucket 'radio_audio' jika ada file_path
  if (track.file_path) {
    try {
      await supabaseClient.storage.from(AUTODJ_BUCKET).remove([track.file_path]);
    } catch (e) {
      console.warn("Gagal menghapus file dari bucket radio_audio:", e);
    }
  }

  if (wasPlayingDeleted) {
    const audio = getAutoDjAudio();
    if (audio) audio.pause();
    autoDjState.isPlaying = false;
    autoDjState.currentIndex = -1;
    try {
      localStorage.removeItem(AUTODJ_SESSION_KEY);
    } catch (e) {}
  }

  await fetchPlaylistFromSupabase();
  showToast("Lagu berhasil dihapus dari Playlist & Storage!");
}

// --- 5. AutoDJ Audio Engine & Auto-Next Logic ---
export function updateAutoDjDeckUI() {
  const statusDot = document.getElementById("autoDjStatusDot");
  const statusBadge = document.getElementById("autoDjStatusBadge");
  const counterEl = document.getElementById("autoDjTrackCounter");
  const titleEl = document.getElementById("autoDjCurrentTitle");
  const artistEl = document.getElementById("autoDjCurrentArtist");
  const playIcon = document.getElementById("iconAutoDjPlay");
  const pauseIcon = document.getElementById("iconAutoDjPause");
  const playLabel = document.getElementById("labelAutoDjPlayPause");
  const discIcon = document.getElementById("autoDjDiscIcon");
  const loopBtn = document.getElementById("btnAutoDjLoop");
  const shuffleBtn = document.getElementById("btnAutoDjShuffle");

  const total = autoDjState.tracks.length;
  const activeTrack =
    autoDjState.currentIndex >= 0 && autoDjState.currentIndex < total
      ? autoDjState.tracks[autoDjState.currentIndex]
      : null;

  if (counterEl) {
    counterEl.textContent = activeTrack
      ? `Track ${autoDjState.currentIndex + 1} / ${total}`
      : `Track 0 / ${total}`;
  }

  if (titleEl) {
    titleEl.textContent = activeTrack ? activeTrack.title : "Belum Ada Lagu Dipilih";
  }
  if (artistEl) {
    artistEl.textContent = activeTrack
      ? activeTrack.artist
      : total > 0
      ? "Klik tombol Putar untuk memulai antrean AutoDJ"
      : "Pilih atau unggah lagu MP3 pada daftar playlist di bawah";
  }

  if (autoDjState.isPlaying) {
    if (statusDot) statusDot.className = "w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping";
    if (statusBadge) {
      statusBadge.textContent = "ON AIR • AUTODJ PLAYING";
      statusBadge.className = "text-[11px] font-extrabold uppercase tracking-widest text-emerald-400";
    }
    if (playIcon) playIcon.classList.add("hidden");
    if (pauseIcon) pauseIcon.classList.remove("hidden");
    if (playLabel) playLabel.textContent = "Jeda AutoDJ";
    if (discIcon) discIcon.classList.add("animate-spin");
  } else {
    if (statusDot) statusDot.className = "w-2.5 h-2.5 rounded-full bg-gray-400";
    if (statusBadge) {
      statusBadge.textContent = activeTrack ? "AUTODJ PAUSED" : "AUTODJ STANDBY";
      statusBadge.className = "text-[11px] font-extrabold uppercase tracking-widest text-orange-300";
    }
    if (playIcon) playIcon.classList.remove("hidden");
    if (pauseIcon) pauseIcon.classList.add("hidden");
    if (playLabel) playLabel.textContent = "Putar AutoDJ";
    if (discIcon) discIcon.classList.remove("animate-spin");
  }

  if (loopBtn) {
    loopBtn.className = autoDjState.isLoop
      ? "px-3 h-10 rounded-xl bg-brand-500/25 border border-brand-500 text-orange-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
      : "px-3 h-10 rounded-xl bg-white/10 border border-white/10 text-gray-400 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer";
  }

  if (shuffleBtn) {
    shuffleBtn.className = autoDjState.isShuffle
      ? "px-3 h-10 rounded-xl bg-brand-500/25 border border-brand-500 text-orange-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
      : "px-3 h-10 rounded-xl bg-white/10 border border-white/10 text-gray-400 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer";
  }
}

export async function playAutoDjTrackByIndex(index) {
  const audio = getAutoDjAudio();
  if (!audio || autoDjState.tracks.length === 0) {
    showToast("Playlist masih kosong! Unggah lagu MP3 terlebih dahulu.", true);
    return;
  }

  if (index < 0 || index >= autoDjState.tracks.length) {
    index = 0;
  }

  const targetTrack = autoDjState.tracks[index];
  if (!targetTrack || !targetTrack.file_url) {
    showToast("URL lagu tidak valid", true);
    return;
  }

  // Jika mengklik tombol pada lagu yang sedang aktif, toggle play/pause
  if (autoDjState.currentIndex === index && audio.src === targetTrack.file_url) {
    toggleAutoDjPlay();
    return;
  }

  autoDjState.currentIndex = index;
  audio.src = targetTrack.file_url;
  audio.volume = autoDjState.volume / 100;

  try {
    await audio.play();
    autoDjState.isPlaying = true;
    saveAutoDjSession({ isPlaying: true, currentTime: 0 });
    if (autoDjState.broadcastMode === "autodj") {
      await syncBroadcastSourceToPublic("autodj", targetTrack);
      broadcastAutoDjPlaybackSync({ isPlaying: true, currentTime: 0 });
    } else {
      await setBroadcastSourceMode("autodj", true);
    }
  } catch (err) {
    console.warn("Gagal memutar lagu AutoDJ:", err);
    autoDjState.isPlaying = false;
    saveAutoDjSession({ isPlaying: false, currentTime: 0 });
    showToast("Gagal memutar file audio: " + (err.message || "Format tidak didukung"), true);
  }

  renderPlaylistTable();
  updateAutoDjDeckUI();
}

export async function toggleAutoDjPlay() {
  const audio = getAutoDjAudio();
  if (!audio) return;

  if (autoDjState.tracks.length === 0) {
    showToast("Playlist masih kosong! Silakan upload lagu MP3 terlebih dahulu.", true);
    return;
  }

  if (autoDjState.currentIndex < 0 || !audio.src) {
    await playAutoDjTrackByIndex(0);
    return;
  }

  if (audio.paused) {
    try {
      await audio.play();
      autoDjState.isPlaying = true;
      saveAutoDjSession({ isPlaying: true, currentTime: audio.currentTime });
      if (autoDjState.broadcastMode === "autodj") {
        await syncBroadcastSourceToPublic("autodj");
        broadcastAutoDjPlaybackSync({ isPlaying: true, currentTime: audio.currentTime });
      } else {
        await setBroadcastSourceMode("autodj", true);
      }
    } catch (err) {
      showToast("Gagal melanjutkan pemutaran: " + err.message, true);
    }
  } else {
    audio.pause();
    autoDjState.isPlaying = false;
    saveAutoDjSession({ isPlaying: false, currentTime: audio.currentTime });
    if (autoDjState.broadcastMode === "autodj") {
      await syncBroadcastSourceToPublic("autodj");
      broadcastAutoDjPlaybackSync({ isPlaying: false, currentTime: audio.currentTime });
    }
  }

  renderPlaylistTable();
  updateAutoDjDeckUI();
}

export function nextAutoDjTrack(isAutoEnded = false) {
  const total = autoDjState.tracks.length;
  if (total === 0) return;

  let nextIdx = 0;
  if (autoDjState.isShuffle && total > 1) {
    do {
      nextIdx = Math.floor(Math.random() * total);
    } while (nextIdx === autoDjState.currentIndex);
  } else {
    nextIdx = autoDjState.currentIndex + 1;
    if (nextIdx >= total) {
      if (isAutoEnded && !autoDjState.isLoop) {
        const audio = getAutoDjAudio();
        if (audio) audio.pause();
        autoDjState.isPlaying = false;
        saveAutoDjSession({ isPlaying: false, currentTime: 0 });
        renderPlaylistTable();
        updateAutoDjDeckUI();
        return;
      }
      nextIdx = 0;
    }
  }

  const audio = getAutoDjAudio();
  if (audio) audio.src = ""; // paksa muat ulang jika hanya ada 1 lagu di playlist
  playAutoDjTrackByIndex(nextIdx);
}

export function prevAutoDjTrack() {
  const total = autoDjState.tracks.length;
  if (total === 0) return;

  const audio = getAutoDjAudio();
  if (audio && audio.currentTime > 4) {
    audio.currentTime = 0;
    saveAutoDjSession({ currentTime: 0 });
    return;
  }

  let prevIdx = autoDjState.currentIndex - 1;
  if (prevIdx < 0) prevIdx = total - 1;

  if (audio) audio.src = "";
  playAutoDjTrackByIndex(prevIdx);
}

export function toggleAutoDjLoop() {
  autoDjState.isLoop = !autoDjState.isLoop;
  updateAutoDjDeckUI();
  showToast(
    autoDjState.isLoop
      ? "Loop Playlist diaktifkan (Putar terus 24/7)"
      : "Loop Playlist dinonaktifkan"
  );
}

export function toggleAutoDjShuffle() {
  autoDjState.isShuffle = !autoDjState.isShuffle;
  updateAutoDjDeckUI();
  showToast(
    autoDjState.isShuffle
      ? "Mode Acak (Shuffle) diaktifkan"
      : "Mode Berurutan diaktifkan"
  );
}

export function changeAutoDjVolume(val) {
  const v = Math.min(Math.max(parseInt(val, 10) || 0, 0), 100);
  autoDjState.volume = v;
  const audio = getAutoDjAudio();
  if (audio) audio.volume = v / 100;
  const volText = document.getElementById("autoDjVolumeText");
  if (volText) volText.textContent = `${v}%`;
}

export function seekAutoDjAudio(percentVal) {
  const audio = getAutoDjAudio();
  if (!audio || !audio.duration || isNaN(audio.duration)) return;
  const pct = parseFloat(percentVal) || 0;
  audio.currentTime = (pct / 100) * audio.duration;
  saveAutoDjSession({ currentTime: audio.currentTime });
  if (autoDjState.broadcastMode === "autodj") {
    broadcastAutoDjPlaybackSync({ currentTime: audio.currentTime });
  }
}

function bindAutoDjAudioEvents() {
  if (autoDjState.audioBound) return;
  const audio = getAutoDjAudio();
  if (!audio) return;
  autoDjState.audioBound = true;

  audio.volume = autoDjState.volume / 100;

  audio.addEventListener("timeupdate", () => {
    const curEl = document.getElementById("autoDjCurrentTime");
    const durEl = document.getElementById("autoDjDuration");
    const slider = document.getElementById("autoDjSeekSlider");
    if (curEl) curEl.textContent = formatDuration(audio.currentTime);
    if (durEl && audio.duration) durEl.textContent = formatDuration(audio.duration);
    if (slider && audio.duration > 0) {
      slider.value = ((audio.currentTime / audio.duration) * 100).toFixed(1);
    }

    // Throttle simpan status sesi setiap ~2 detik agar saat refresh menit lagu tetap presisi
    const now = Date.now();
    if (!audio._lastSessionSave || now - audio._lastSessionSave > 2000) {
      audio._lastSessionSave = now;
      saveAutoDjSession();
    }
  });

  audio.addEventListener("loadedmetadata", () => {
    const durEl = document.getElementById("autoDjDuration");
    if (durEl) durEl.textContent = formatDuration(audio.duration);
  });

  audio.addEventListener("play", () => {
    autoDjState.isPlaying = true;
    saveAutoDjSession({ isPlaying: true, currentTime: audio.currentTime });
    renderPlaylistTable();
    updateAutoDjDeckUI();
  });

  audio.addEventListener("pause", () => {
    if (!audio.ended) {
      autoDjState.isPlaying = false;
      saveAutoDjSession({ isPlaying: false, currentTime: audio.currentTime });
      renderPlaylistTable();
      updateAutoDjDeckUI();
    }
  });

  // Simpan segera saat tab admin hendak di-refresh atau ditutup
  window.addEventListener("beforeunload", () => {
    saveAutoDjSession();
  });

  // EVENT 'ended': Otomatis mainkan urutan lagu berikutnya di tabel playlist!
  audio.addEventListener("ended", () => {
    nextAutoDjTrack(true);
  });

  audio.addEventListener("error", () => {
    console.warn("Lagu gagal dimuat, melompat ke lagu berikutnya...");
    if (autoDjState.tracks.length > 1) {
      setTimeout(() => nextAutoDjTrack(true), 1200);
    }
  });
}

function initPlaylistRealtime() {
  if (autoDjState.realtimeBound) return;
  autoDjState.realtimeBound = true;

  supabaseClient
    .channel("admin-playlist-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: PLAYLIST_TABLE },
      () => {
        fetchPlaylistFromSupabase();
      }
    )
    .subscribe();
}

export function initAutoDjManager() {
  setBroadcastSourceMode(autoDjState.broadcastMode, true);
  bindAutoDjAudioEvents();
  fetchPlaylistFromSupabase();
  initPlaylistRealtime();
}

