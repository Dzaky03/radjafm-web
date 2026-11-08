// ============================================================================
// RADJAfm 101.8 FM - Universal Multi-Source Audio Player (js/player.js)
// Supports Icecast / Shoutcast / Direct Audio, HLS (.m3u8), SoundCloud & YouTube
// ============================================================================

import {
  DEFAULT_ICECAST_STREAM,
  BACKUP_ICECAST_STREAMS,
  liveBroadcast,
  studioSyncChannel
} from "./config.js";

export const playerState = {
  isPlaying: false,
  listenerActive: false,
  volume: 80,
  isMuted: false,
  prevVolume: 80,
  activeStreamUrl: DEFAULT_ICECAST_STREAM,
  activeSourceType: "audio", // 'audio' | 'youtube' | 'soundcloud'
  currentYouTubeId: null,
  currentScUrl: null,
  studioAutoDjOnAir: false
};

let ytPlayer = null;
let ytApiReady = false;
let ytPendingPlay = false;
let ytEmbedBlocked = false;
let ytWatchdog = null;

let scWidget = null;
let scApiReady = false;
let scPendingPlay = false;
let hlsInstance = null;

function getPlayerDom() {
  return {
    audioElement: document.getElementById("audioElement"),
    iconPlay: document.getElementById("icon-play"),
    iconPause: document.getElementById("icon-pause"),
    visualizer: document.getElementById("visualizer"),
    audioStateLabel: document.getElementById("audioStateLabel"),
    heroBtnText: document.getElementById("hero-btn-text"),
    heroBtnIcon: document.getElementById("hero-btn-icon"),
    volumeSlider: document.getElementById("volumeSlider"),
    volumeLevelText: document.getElementById("volumeLevelText"),
    volumeIconPath: document.getElementById("volumeIconPath"),
    dock: document.getElementById("externalMediaDock"),
    dockTitle: document.getElementById("externalMediaDockTitle"),
    ytHost: document.getElementById("ytPlayerHost"),
    scHost: document.getElementById("scPlayerHost"),
    scIframe: document.getElementById("scWidgetIframe")
  };
}

export function extractYouTubeId(url) {
  if (!url) return null;
  const str = String(url).trim();
  try {
    const parsed = new URL(str);
    const host = parsed.hostname.toLowerCase();
    if (host.includes("youtu.be")) {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id.slice(0, 11))) return id.slice(0, 11);
    }
    if (host.includes("youtube.com") || host.includes("youtube-nocookie.com")) {
      const vParam = parsed.searchParams.get("v");
      if (vParam && /^[A-Za-z0-9_-]{11}$/.test(vParam.slice(0, 11))) return vParam.slice(0, 11);
      const parts = parsed.pathname.split("/").filter(Boolean);
      const markerIdx = parts.findIndex((p) => ["embed", "live", "shorts", "v"].includes(p));
      if (markerIdx !== -1 && parts[markerIdx + 1]) {
        const candidate = parts[markerIdx + 1].slice(0, 11);
        if (/^[A-Za-z0-9_-]{11}$/.test(candidate)) return candidate;
      }
    }
  } catch (e) {}
  const m = str.match(/(?:v=|youtu\.be\/|embed\/|live\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function detectStreamType(url) {
  if (!url) return { type: "audio", url: DEFAULT_ICECAST_STREAM };
  const str = String(url).trim();
  if (!str || str.includes("stream.zeno.fm/f3wvbbqmdg8uv")) {
    return { type: "audio", url: DEFAULT_ICECAST_STREAM };
  }

  // Extract src if user pasted an <iframe> embed snippet
  const iframeSrcMatch = str.match(/src=["']([^"']+)["']/i);
  const targetUrl = iframeSrcMatch ? iframeSrcMatch[1] : str;

  // 1. YouTube
  const ytId = extractYouTubeId(targetUrl);
  if (ytId) {
    return { type: "youtube", url: targetUrl, ytId };
  }

  // 2. SoundCloud
  if (/soundcloud\.com/i.test(targetUrl)) {
    let cleanSc = targetUrl;
    try {
      const u = new URL(targetUrl);
      if (u.hostname.includes("w.soundcloud.com") && u.searchParams.get("url")) {
        cleanSc = u.searchParams.get("url");
      } else {
        u.search = "";
        cleanSc = u.toString();
      }
    } catch (e) {}
    return { type: "soundcloud", url: cleanSc };
  }

  // 3. Icecast / Shoutcast / HLS / Direct Audio Stream
  return { type: "audio", url: targetUrl };
}

export async function resolveIcecastStreamUrl(rawUrl) {
  const url = String(rawUrl || "").trim();
  if (!url || url.includes("stream.zeno.fm/f3wvbbqmdg8uv")) return DEFAULT_ICECAST_STREAM;

  // Resolve .m3u, .pls, or .xspf playlist links from Icecast/Shoutcast directories
  if (/\.(m3u|pls|xspf)(\?.*)?$/i.test(url)) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const text = await resp.text();
        const match = text.match(/https?:\/\/[^\s"'<>]+/i);
        if (match && match[0]) return match[0].trim();
      }
    } catch (e) {
      // Fallback: strip playlist extension to hit Icecast mountpoint directly
    }
    return url.replace(/\.(m3u|pls|xspf)(\?.*)?$/i, "");
  }
  return url;
}

export function stopAllOtherPlayers(exceptType) {
  const { audioElement } = getPlayerDom();
  if (exceptType !== "audio" && audioElement) {
    try {
      audioElement.pause();
    } catch (e) {}
  }
  if (exceptType !== "youtube") {
    clearTimeout(ytWatchdog);
    if (ytPlayer && typeof ytPlayer.pauseVideo === "function") {
      try {
        ytPlayer.pauseVideo();
      } catch (e) {}
    }
  }
  if (exceptType !== "soundcloud") {
    if (scWidget && typeof scWidget.pause === "function") {
      try {
        scWidget.pause();
      } catch (e) {}
    }
  }
}

export function fallbackToBackupIcecast() {
  const { audioElement } = getPlayerDom();
  if (!audioElement) return;
  audioElement.src = BACKUP_ICECAST_STREAMS[0];
  audioElement.volume = playerState.isMuted ? 0 : playerState.volume / 100;
  audioElement
    .play()
    .then(() => {
      playerState.isPlaying = true;
      updateAudioUI();
    })
    .catch(() => {
      playerState.isPlaying = true;
      updateAudioUI();
    });
}

export async function playIcecastOrDirectAudio(targetUrl) {
  const { audioElement } = getPlayerDom();
  if (!audioElement) return;

  stopAllOtherPlayers("audio");
  const resolvedUrl = await resolveIcecastStreamUrl(targetUrl || playerState.activeStreamUrl);
  audioElement.volume = playerState.isMuted ? 0 : playerState.volume / 100;

  // HLS (.m3u8) handling
  if (/\.m3u8(\?.*)?$/i.test(resolvedUrl)) {
    if (audioElement.canPlayType("application/vnd.apple.mpegurl")) {
      audioElement.src = resolvedUrl;
      audioElement
        .play()
        .then(() => {
          playerState.isPlaying = true;
          updateAudioUI();
        })
        .catch(() => fallbackToBackupIcecast());
      return;
    }
    if (!window.Hls) {
      await new Promise((resolve) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/hls.js@latest";
        s.onload = resolve;
        s.onerror = resolve;
        document.head.appendChild(s);
      });
    }
    if (window.Hls && window.Hls.isSupported()) {
      if (hlsInstance) hlsInstance.destroy();
      hlsInstance = new window.Hls();
      hlsInstance.loadSource(resolvedUrl);
      hlsInstance.attachMedia(audioElement);
      hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, () => {
        audioElement
          .play()
          .then(() => {
            playerState.isPlaying = true;
            updateAudioUI();
          })
          .catch(() => fallbackToBackupIcecast());
      });
      return;
    }
  }

  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }

  if (audioElement.getAttribute("src") !== resolvedUrl) {
    audioElement.src = resolvedUrl;
  }

  const isLocalAutoDj =
    resolvedUrl.includes("/radio_audio/") ||
    (playerState.activeStreamUrl && playerState.activeStreamUrl.includes("/radio_audio/"));

  try {
    await audioElement.play();
    playerState.isPlaying = true;
    updateAudioUI();
  } catch (err1) {
    // Retry dengan Shoutcast v1 semicolon suffix HANYA untuk stream relay Icecast/Shoutcast
    if (!isLocalAutoDj && !resolvedUrl.endsWith(";")) {
      try {
        audioElement.src = resolvedUrl.replace(/\/?$/, "/;");
        await audioElement.play();
        playerState.isPlaying = true;
        updateAudioUI();
        return;
      } catch (err2) {}
    }
    if (!isLocalAutoDj) {
      console.warn("Stream utama gagal diputar, mengalihkan ke Icecast cadangan:", err1);
      fallbackToBackupIcecast();
    } else {
      console.warn("Audio AutoDJ ditahan kebijakan autoplay browser (menunggu klik pendengar):", err1);
      playerState.isPlaying = false;
      updateAudioUI();
    }
  }
}

// --- SoundCloud Widget Player ---
function ensureSoundCloudApi() {
  return new Promise((resolve) => {
    if (window.SC && window.SC.Widget) {
      scApiReady = true;
      resolve();
      return;
    }
    const existing = document.getElementById("sc-widget-api-script");
    if (existing) {
      existing.addEventListener("load", () => {
        scApiReady = true;
        resolve();
      });
      return;
    }
    const tag = document.createElement("script");
    tag.id = "sc-widget-api-script";
    tag.src = "https://w.soundcloud.com/player/api.js";
    tag.onload = () => {
      scApiReady = true;
      resolve();
    };
    document.head.appendChild(tag);
  });
}

export async function initOrPlaySoundCloud(scUrl, autoPlay = false) {
  stopAllOtherPlayers("soundcloud");
  const { dock, dockTitle, ytHost, scHost, scIframe } = getPlayerDom();

  if (dockTitle) dockTitle.textContent = "SoundCloud Live Audio";
  if (ytHost) ytHost.classList.add("hidden");
  if (scHost) scHost.classList.remove("hidden");
  if (dock) dock.classList.remove("hidden");

  await ensureSoundCloudApi();
  const widgetSrc =
    "https://w.soundcloud.com/player/?url=" +
    encodeURIComponent(scUrl) +
    "&auto_play=" +
    (autoPlay ? "true" : "false") +
    "&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=false&color=%23ff7a00";

  if (playerState.currentScUrl !== scUrl || !scWidget) {
    playerState.currentScUrl = scUrl;
    scPendingPlay = autoPlay;
    if (scIframe) {
      scIframe.src = widgetSrc;
      scWidget = window.SC.Widget(scIframe);
      scWidget.bind(window.SC.Widget.Events.READY, () => {
        scWidget.setVolume(playerState.isMuted ? 0 : playerState.volume);
        if (scPendingPlay) {
          scPendingPlay = false;
          scWidget.play();
          playerState.isPlaying = true;
          updateAudioUI();
        }
      });
      scWidget.bind(window.SC.Widget.Events.PLAY, () => {
        playerState.isPlaying = true;
        updateAudioUI();
      });
      scWidget.bind(window.SC.Widget.Events.PAUSE, () => {
        playerState.isPlaying = false;
        updateAudioUI();
      });
      scWidget.bind(window.SC.Widget.Events.ERROR, () => {
        console.warn("SoundCloud track tidak dapat di-embed, beralih ke Icecast.");
        fallbackToBackupIcecast();
      });
    }
  } else {
    scWidget.setVolume(playerState.isMuted ? 0 : playerState.volume);
    if (autoPlay) {
      scWidget.play();
      playerState.isPlaying = true;
      updateAudioUI();
    }
  }
}

// --- YouTube IFrame Player ---
function ensureYouTubeApiLoaded() {
  if (window.YT && window.YT.Player) {
    ytApiReady = true;
    return;
  }
  if (!document.getElementById("yt-iframe-api-script")) {
    const tag = document.createElement("script");
    tag.id = "yt-iframe-api-script";
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  }
}

function startYouTubeWatchdog() {
  clearTimeout(ytWatchdog);
  ytWatchdog = setTimeout(() => {
    if (playerState.activeSourceType !== "youtube" || ytEmbedBlocked) return;
    let pState = -1;
    if (ytPlayer && typeof ytPlayer.getPlayerState === "function") {
      try {
        pState = ytPlayer.getPlayerState();
      } catch (e) {}
    }
    if (pState !== 1 && pState !== 3) {
      console.warn(
        "Video YouTube ini membatasi embed di luar YouTube (state=" +
          pState +
          "), memutar stream radio cadangan."
      );
      ytEmbedBlocked = true;
      const { dock } = getPlayerDom();
      if (dock) dock.classList.add("hidden");
      fallbackToBackupIcecast();
    }
  }, 3000);
}

export function initOrPlayYouTube(videoId, autoPlay = false) {
  stopAllOtherPlayers("youtube");
  ytEmbedBlocked = false;
  const { dock, dockTitle, ytHost, scHost } = getPlayerDom();

  if (dockTitle) dockTitle.textContent = "YouTube Stream";
  if (scHost) scHost.classList.add("hidden");
  if (ytHost) ytHost.classList.remove("hidden");
  if (dock) dock.classList.remove("hidden");

  if (!ytApiReady || !window.YT || !window.YT.Player) {
    ytPendingPlay = autoPlay;
    ensureYouTubeApiLoaded();
    if (autoPlay) startYouTubeWatchdog();
    return;
  }

  if (ytPlayer && typeof ytPlayer.loadVideoById === "function") {
    if (autoPlay) {
      ytPlayer.loadVideoById(videoId);
      if (!playerState.isMuted && typeof ytPlayer.unMute === "function") ytPlayer.unMute();
      ytPlayer.setVolume(playerState.isMuted ? 0 : playerState.volume);
      startYouTubeWatchdog();
    } else {
      ytPlayer.cueVideoById(videoId);
    }
    return;
  }

  ytPlayer = new window.YT.Player("ytPlayerContainer", {
    height: "100%",
    width: "100%",
    videoId: videoId,
    playerVars: {
      autoplay: autoPlay ? 1 : 0,
      controls: 1,
      rel: 0,
      playsinline: 1
    },
    events: {
      onReady: (event) => {
        if (!playerState.isMuted && typeof event.target.unMute === "function") {
          event.target.unMute();
        }
        event.target.setVolume(playerState.isMuted ? 0 : playerState.volume);
        if (autoPlay || ytPendingPlay) {
          ytPendingPlay = false;
          event.target.playVideo();
          startYouTubeWatchdog();
        }
      },
      onStateChange: (event) => {
        if (event.data === window.YT.PlayerState.PLAYING) {
          clearTimeout(ytWatchdog);
          ytEmbedBlocked = false;
          playerState.isPlaying = true;
          updateAudioUI();
        } else if (
          event.data === window.YT.PlayerState.PAUSED ||
          event.data === window.YT.PlayerState.ENDED
        ) {
          if (!ytEmbedBlocked) {
            playerState.isPlaying = false;
            updateAudioUI();
          }
        }
      },
      onError: () => {
        clearTimeout(ytWatchdog);
        ytEmbedBlocked = true;
        if (dock) dock.classList.add("hidden");
        if (playerState.isPlaying || ytPendingPlay) {
          ytPendingPlay = false;
          fallbackToBackupIcecast();
        }
      }
    }
  });
}

export function configurePlayerStream(rawStreamUrl) {
  if (!rawStreamUrl) return;
  const detected = detectStreamType(rawStreamUrl);
  if (
    detected.url === playerState.activeStreamUrl &&
    detected.type === playerState.activeSourceType
  ) {
    return;
  }

  const wasPlaying = playerState.isPlaying;
  playerState.activeStreamUrl = detected.url;
  playerState.activeSourceType = detected.type;
  playerState.currentYouTubeId = detected.ytId || null;
  playerState.currentScUrl = detected.type === "soundcloud" ? detected.url : null;
  ytEmbedBlocked = false;

  const { audioElement, dock } = getPlayerDom();

  if (playerState.activeSourceType === "youtube" && playerState.currentYouTubeId) {
    stopAllOtherPlayers("youtube");
    initOrPlayYouTube(playerState.currentYouTubeId, wasPlaying);
  } else if (playerState.activeSourceType === "soundcloud" && playerState.currentScUrl) {
    stopAllOtherPlayers("soundcloud");
    initOrPlaySoundCloud(playerState.currentScUrl, wasPlaying);
  } else {
    stopAllOtherPlayers("audio");
    if (dock) dock.classList.add("hidden");

    const isAutoDj = detected.url.includes("/radio_audio/");
    if (isAutoDj) {
      // Jika beralih ke AutoDJ, periksa apakah studio sedang ON AIR
      if (playerState.studioAutoDjOnAir && playerState.listenerActive) {
        playIcecastOrDirectAudio(playerState.activeStreamUrl);
      } else {
        if (audioElement) {
          audioElement.pause();
          audioElement.src = playerState.activeStreamUrl;
        }
        playerState.isPlaying = false;
      }
    } else {
      // Beralih ke URL Stream (Icecast)
      if (wasPlaying && playerState.listenerActive) {
        playIcecastOrDirectAudio(playerState.activeStreamUrl);
      } else if (audioElement) {
        audioElement.src = playerState.activeStreamUrl;
      }
    }
  }
  updateAudioUI();
}

export function showListenerToast(msg, duration = 3500) {
  const toast = document.getElementById("listenerToast");
  const text = document.getElementById("listenerToastText");
  if (!toast || !text) return;
  text.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.add("hidden");
  }, duration);
}

export function syncPlaybackState(isPlaying, currentTime) {
  const { audioElement } = getPlayerDom();
  if (!audioElement) return;

  if (isPlaying === false) {
    audioElement.pause();
    playerState.isPlaying = false;
    playerState.studioAutoDjOnAir = false;
    if (typeof currentTime === "number" && !isNaN(currentTime)) {
      try {
        audioElement.currentTime = currentTime;
      } catch (e) {}
    }
    updateAudioUI();
  } else if (isPlaying === true) {
    playerState.studioAutoDjOnAir = true;
    if (playerState.activeStreamUrl && audioElement.getAttribute("src") !== playerState.activeStreamUrl) {
      audioElement.src = playerState.activeStreamUrl;
    }
    if (typeof currentTime === "number" && !isNaN(currentTime)) {
      if (Math.abs(audioElement.currentTime - currentTime) > 2) {
        try {
          audioElement.currentTime = currentTime;
        } catch (e) {}
      }
    }
    // HANYA putar suara di pendengar jika pendengar sedang dalam status AKTIF mendengarkan!
    // Jika pendengar sedang pause lokal, biarkan tetap diam tanpa memutar audio tiba-tiba.
    if (playerState.listenerActive) {
      audioElement
        .play()
        .then(() => {
          playerState.isPlaying = true;
          updateAudioUI();
        })
        .catch((e) => {
          console.warn("Autoplay gesture blocked on listener client:", e);
        });
    } else {
      audioElement.pause();
      playerState.isPlaying = false;
      updateAudioUI();
    }
  }
}

export function toggleAudio() {
  const { dock } = getPlayerDom();
  const isAutoDj =
    playerState.activeStreamUrl &&
    playerState.activeStreamUrl.includes("/radio_audio/");

  // JIKA MODE AUTODJ DAN STUDIO SEDANG JEDA / STANDBY:
  // BLOKIR PENDENGAR! Kontrol penuh ada pada Admin. Pendengar tidak diizinkan memutar sendiri.
  if (isAutoDj && !playerState.studioAutoDjOnAir) {
    showListenerToast("⚠️ Siaran AutoDJ sedang JEDA di Studio Admin. Menunggu Admin memulai siaran.");
    return;
  }

  if (!playerState.isPlaying) {
    playerState.listenerActive = true; // Pendengar secara sadar ingin mendengarkan
    playerState.isPlaying = true;
    updateAudioUI();
    if (
      playerState.activeSourceType === "youtube" &&
      playerState.currentYouTubeId &&
      !ytEmbedBlocked
    ) {
      if (ytPlayer && typeof ytPlayer.playVideo === "function") {
        if (dock) dock.classList.remove("hidden");
        if (!playerState.isMuted && typeof ytPlayer.unMute === "function") ytPlayer.unMute();
        ytPlayer.setVolume(playerState.isMuted ? 0 : playerState.volume);
        ytPlayer.playVideo();
        startYouTubeWatchdog();
      } else {
        initOrPlayYouTube(playerState.currentYouTubeId, true);
      }
    } else if (playerState.activeSourceType === "soundcloud" && playerState.currentScUrl) {
      initOrPlaySoundCloud(playerState.currentScUrl, true);
    } else {
      playIcecastOrDirectAudio(playerState.activeStreamUrl);
    }
  } else {
    // Pendengar menjeda speakernya sendiri secara lokal (TIDAK mempengaruhi Admin!)
    playerState.listenerActive = false; // Tandai bahwa pendengar memilih untuk tidak mendengar
    clearTimeout(ytWatchdog);
    playerState.isPlaying = false;
    updateAudioUI();
    stopAllOtherPlayers("none");
  }
}

export function updateAudioUI() {
  const {
    iconPlay,
    iconPause,
    visualizer,
    audioStateLabel,
    heroBtnText,
    heroBtnIcon
  } = getPlayerDom();

  if (!iconPlay || !iconPause || !visualizer || !audioStateLabel) return;

  if (playerState.isPlaying) {
    iconPlay.classList.add("hidden");
    iconPause.classList.remove("hidden");
    visualizer.classList.add("playing");
    audioStateLabel.textContent = "ON AIR";
    audioStateLabel.classList.remove("text-gray-400");
    audioStateLabel.classList.add("text-brand-500");
    if (heroBtnText) heroBtnText.textContent = "Jeda Siaran";
    if (heroBtnIcon) heroBtnIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path>';
  } else {
    iconPlay.classList.remove("hidden");
    iconPause.classList.add("hidden");
    visualizer.classList.remove("playing");
    audioStateLabel.textContent = "PAUSED";
    audioStateLabel.classList.remove("text-brand-500");
    audioStateLabel.classList.add("text-gray-400");
    if (heroBtnText) heroBtnText.textContent = "Dengarkan Siaran";
    if (heroBtnIcon) heroBtnIcon.innerHTML = '<path d="M8 5v14l11-7z"></path>';
  }
}

export function updateVolumeIcon(isMuted) {
  const { volumeIconPath } = getPlayerDom();
  if (!volumeIconPath) return;
  if (isMuted) {
    volumeIconPath.setAttribute(
      "d",
      "M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l4-4m0 4l-4-4"
    );
  } else {
    volumeIconPath.setAttribute(
      "d",
      "M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
    );
  }
}

export function handleVolumeChange(val) {
  const { audioElement, volumeLevelText } = getPlayerDom();
  playerState.volume = parseInt(val, 10);
  if (audioElement) audioElement.volume = playerState.volume / 100;
  if (ytPlayer && typeof ytPlayer.setVolume === "function") {
    if (playerState.volume > 0 && typeof ytPlayer.unMute === "function") ytPlayer.unMute();
    ytPlayer.setVolume(playerState.volume);
  }
  if (scWidget && typeof scWidget.setVolume === "function") {
    scWidget.setVolume(playerState.volume);
  }
  if (volumeLevelText) volumeLevelText.textContent = `${playerState.volume}%`;

  if (playerState.volume === 0) {
    playerState.isMuted = true;
    updateVolumeIcon(true);
  } else {
    playerState.isMuted = false;
    updateVolumeIcon(false);
  }
}

export function toggleMute() {
  const { audioElement, volumeSlider, volumeLevelText } = getPlayerDom();
  if (playerState.isMuted) {
    playerState.isMuted = false;
    playerState.volume = playerState.prevVolume || 80;
  } else {
    playerState.prevVolume = playerState.volume;
    playerState.isMuted = true;
    playerState.volume = 0;
  }
  if (audioElement) audioElement.volume = playerState.volume / 100;
  if (ytPlayer && typeof ytPlayer.setVolume === "function") {
    if (playerState.isMuted && typeof ytPlayer.mute === "function") ytPlayer.mute();
    else if (!playerState.isMuted && typeof ytPlayer.unMute === "function") ytPlayer.unMute();
    ytPlayer.setVolume(playerState.volume);
  }
  if (scWidget && typeof scWidget.setVolume === "function") {
    scWidget.setVolume(playerState.volume);
  }
  if (volumeSlider) volumeSlider.value = playerState.volume;
  if (volumeLevelText) volumeLevelText.textContent = `${playerState.volume}%`;
  updateVolumeIcon(playerState.isMuted);
}

export function initPlayer() {
  const { audioElement } = getPlayerDom();
  if (audioElement) {
    audioElement.volume = playerState.volume / 100;
    audioElement.addEventListener("ended", () => {
      // Jika lagu MP3 selesai (mode AutoDJ), sinkronkan ulang pengaturan studio
      if (typeof window.loadStudioSettingsAndAnnouncersFromSupabase === "function") {
        window.loadStudioSettingsAndAnnouncersFromSupabase();
      }
    });
  }
  updateAudioUI();
}

// Expose global callbacks for YouTube IFrame API & inline HTML attributes
window.onYouTubeIframeAPIReady = function () {
  ytApiReady = true;
  if (playerState.activeSourceType === "youtube" && playerState.currentYouTubeId) {
    initOrPlayYouTube(playerState.currentYouTubeId, ytPendingPlay || playerState.isPlaying);
  }
};

window.toggleAudio = toggleAudio;
window.handleVolumeChange = handleVolumeChange;
window.toggleMute = toggleMute;

