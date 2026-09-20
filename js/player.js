// Unifies YouTube playback with native <video> playback (for direct HTTP(S)
// video/stream URLs and local files) behind one seekTo()/play() interface,
// so key-point and transcript click handlers don't need to care which kind
// of source is currently loaded.

let playerMode = null; // 'youtube' | 'html5'
let html5El = null;

function getPlayerMountWrap() {
  return document.getElementById('player-mount-wrap');
}

function teardownPlayer() {
  if (playerMode === 'html5' && html5El) {
    try {
      html5El.pause();
    } catch (e) {
      /* ignore */
    }
    if (html5El._hls) {
      try {
        html5El._hls.destroy();
      } catch (e) {
        /* ignore */
      }
    }
    if (html5El.dataset.blobUrl) {
      try {
        URL.revokeObjectURL(html5El.dataset.blobUrl);
      } catch (e) {
        /* ignore */
      }
    }
  }
  if (playerMode === 'youtube') {
    destroyYtPlayer();
  }
  const wrap = getPlayerMountWrap();
  if (wrap) wrap.innerHTML = '<div id="player-mount"></div>';
  html5El = null;
  playerMode = null;
}

function mountYouTubePlayer(videoId) {
  if (playerMode !== 'youtube') teardownPlayer();
  playerMode = 'youtube';
  loadPlayer(videoId, 'player-mount');
}

function isHlsUrl(url) {
  return /\.m3u8(\?|#|$)/i.test(url);
}

function loadHlsJs() {
  if (window.Hls) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load hls.js'));
    document.head.appendChild(script);
  });
}

// `src` is either a direct http(s) URL or an object URL (blob:) for a local
// file. Pass isBlob:true so the blob URL gets revoked on teardown.
function mountHtml5Player(src, { isBlob = false } = {}) {
  teardownPlayer();
  playerMode = 'html5';
  const mount = document.getElementById('player-mount');
  const video = document.createElement('video');
  video.id = 'html5-player';
  video.controls = true;
  video.playsInline = true;
  video.style.width = '100%';
  video.style.height = '100%';
  video.style.background = '#000';
  mount.appendChild(video);
  html5El = video;
  if (isBlob) video.dataset.blobUrl = src;

  if (isHlsUrl(src) && !video.canPlayType('application/vnd.apple.mpegurl')) {
    loadHlsJs()
      .then(() => {
        const hls = new Hls();
        hls.loadSource(src);
        hls.attachMedia(video);
        video._hls = hls;
      })
      .catch(() => {
        video.src = src;
      });
  } else {
    video.src = src;
  }
}

// Exposes the live <video> element so other modules (audio transcription)
// can tap its decoded audio via Web Audio. Only meaningful in 'html5' mode;
// the YouTube IFrame player is a cross-origin iframe with no accessible
// media element at all.
function getActiveHtml5Element() {
  return playerMode === 'html5' ? html5El : null;
}

function seekTo(seconds) {
  if (playerMode === 'youtube') {
    seekPlayerTo(seconds);
    return;
  }
  if (playerMode === 'html5' && html5El) {
    html5El.currentTime = seconds;
    html5El.play().catch(() => {
      /* autoplay may be blocked until the user interacts; that's fine */
    });
  }
}
