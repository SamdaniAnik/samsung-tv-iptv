/**
 * Samsung Smart TV IPTV Application Controller
 * Designed for Tizen OS (3.0+) & Standard Web Browsers
 */

(function () {
  'use strict';

  var CONFIG = window.IPTV_CONFIG || {};

  var STORAGE_KEYS = {
    favorites: 'iptv.favorites',
    lastChannel: 'iptv.lastChannel',
    lastCategory: 'iptv.lastCategory',
    channelCache: 'iptv.channelCache',
    channelNumbers: 'iptv.channelNumbers',
    serverUrl: 'iptv.serverUrl'
  };

  function readStorage(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {}
  }

  var SERVER_URL = String(readStorage(STORAGE_KEYS.serverUrl, null) || CONFIG.serverUrl || 'http://172.20.5.50').replace(/\/+$/, '');

  // Application State
  var state = {
    channels: [],
    filteredChannels: [],
    categories: [],
    activeCategory: CONFIG.defaultCategory || 'All',
    currentChannel: null,
    previousChannel: null,
    favorites: [],
    channelsSignature: '',
    uiReady: false,
    resumeAttempted: false,
    isPlaying: false,
    isPaused: false,
    playbackError: false,
    drawerOpen: false,
    drawerCategory: 'All',
    drawerChannels: [],
    drawerIndex: 0,
    currentZone: 'GRID', // 'GRID', 'CATEGORIES', 'PLAYER', 'PLAYER_DRAWER', 'EXIT_DIALOG'
    focusIndex: 0,
    catFocusIndex: 0,
    exitFocusIndex: 1,
    osdTimer: null,
    dialBuffer: '',
    dialTimer: null,
    playerHintShown: false
  };

  // Tizen Key Codes
  var TV_KEYS = {
    ENTER: 13,
    RETURN: 10009,
    ESCAPE: 27,
    BACKSPACE: 8,
    LEFT: 37,
    UP: 38,
    RIGHT: 39,
    DOWN: 40,
    CH_UP: 427,
    CH_DOWN: 428,
    PLAY: 415,
    PAUSE: 19,
    PLAY_PAUSE: 10252,
    STOP: 413,
    RED: 403,
    GREEN: 404,
    BLUE: 406,
    PREV_CH: 10190,
    KEY_F: 70,
    KEY_P: 80,
    KEY_V: 86
  };

  function isBackKey(code) {
    return code === TV_KEYS.RETURN || code === TV_KEYS.ESCAPE || code === TV_KEYS.BACKSPACE;
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function decodeEntities(value) {
    return String(value || '')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  function padNumber(num) {
    return num < 10 ? '0' + num : String(num);
  }

  // DOM Elements
  var DOM = {
    clock: document.getElementById('tv-clock'),
    brandSubtitle: document.getElementById('brand-subtitle'),
    catBar: document.getElementById('category-bar'),
    grid: document.getElementById('channels-grid'),
    channelCount: document.getElementById('channel-count'),
    playerContainer: document.getElementById('player-container'),
    streamVideo: document.getElementById('stream-video'),
    streamIframe: document.getElementById('stream-iframe'),
    playerOsd: document.getElementById('player-osd'),
    osdChNum: document.getElementById('osd-ch-num'),
    osdChLogo: document.getElementById('osd-ch-logo'),
    osdChName: document.getElementById('osd-ch-name'),
    osdChCat: document.getElementById('osd-ch-cat'),
    osdClock: document.getElementById('osd-clock'),
    dialOverlay: document.getElementById('channel-dial-overlay'),
    dialDigits: document.getElementById('dial-digits'),
    toast: document.getElementById('tv-toast'),
    toastMsg: document.getElementById('toast-msg'),
    playerStatus: document.getElementById('player-status'),
    playerStatusTitle: document.getElementById('player-status-title'),
    playerStatusDetail: document.getElementById('player-status-detail'),
    channelDrawer: document.getElementById('channel-drawer'),
    drawerCategory: document.getElementById('drawer-category'),
    drawerList: document.getElementById('drawer-list'),
    exitDialog: document.getElementById('exit-dialog')
  };

  var hlsInstance = null;
  var isTizenApp = !!(window.tizen && tizen.application);

  // Register Tizen TV Remote Keys (volume keys stay with the TV so its own volume OSD and mute work)
  function registerTizenKeys() {
    if (window.tizen && tizen.tvinputdevice) {
      var keys = [
        'MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop',
        'ChannelUp', 'ChannelDown', 'PreviousChannel',
        'ColorF0Red', 'ColorF1Green', 'ColorF3Blue',
        '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
      ];
      keys.forEach(function (keyName) {
        try {
          tizen.tvinputdevice.registerKey(keyName);
        } catch (e) {
          console.warn('Could not register Tizen key:', keyName, e);
        }
      });
    }
  }

  // Clock Update (minutes only — avoids a repaint every second)
  function updateClock() {
    var now = new Date();
    var timeStr = padNumber(now.getHours()) + ':' + padNumber(now.getMinutes());
    if (DOM.clock && DOM.clock.textContent !== timeStr) DOM.clock.textContent = timeStr;
    if (DOM.osdClock && DOM.osdClock.textContent !== timeStr) DOM.osdClock.textContent = timeStr;
  }
  setInterval(updateClock, 10000);
  updateClock();

  // Toast Notification
  var toastTimer = null;
  function showToast(msg) {
    if (!DOM.toast) return;
    if (DOM.toastMsg) DOM.toastMsg.textContent = msg;
    DOM.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      DOM.toast.classList.remove('show');
    }, 2800);
  }

  function canUseApiProxy() {
    return !isTizenApp && window.location.protocol.indexOf('http') === 0;
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var opts = options || {};
    if (ctrl) opts.signal = ctrl.signal;
    var timer = setTimeout(function () {
      if (ctrl) ctrl.abort();
    }, timeoutMs);
    return fetch(url, opts).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res;
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  // Stream URL lookup (cached so a channel switch doesn't re-scrape the player page; retries always refetch)
  var M3U8_CACHE_TTL_MS = 5 * 60 * 1000;
  var m3u8Cache = {};

  function parseM3u8FromPlayerHtml(html) {
    if (!html) return null;
    var m = html.match(/primarySource\s*=\s*'([^']+)'/);
    return m ? m[1] : null;
  }

  function resolveM3u8Url(channel, fresh) {
    var key = String(channel.id);
    var cached = m3u8Cache[key];
    if (!fresh && cached && Date.now() - cached.at < M3U8_CACHE_TTL_MS) {
      return Promise.resolve(cached.url);
    }
    delete m3u8Cache[key];
    var request = canUseApiProxy()
      ? fetchWithTimeout('api.php?action=stream&id=' + encodeURIComponent(channel.id), null, 5000)
          .then(function (res) { return res.json(); })
          .then(function (data) { return data && data.m3u8 ? data.m3u8 : null; })
      : fetchWithTimeout(channel.playerUrl, { cache: 'no-store' }, 5000)
          .then(function (res) { return res.text(); })
          .then(parseM3u8FromPlayerHtml);
    return request.then(function (url) {
      if (url) m3u8Cache[key] = { url: url, at: Date.now() };
      return url;
    }).catch(function () { return null; });
  }

  // Playback engine: Samsung AVPlay on the TV, hls.js / native <video> elsewhere, server web player as last resort.
  var PLAYBACK_START_TIMEOUT_MS = 8000;
  var PLAYBACK_STALL_TIMEOUT_MS = 10000;
  var PLAYBACK_MAX_RETRIES = 2;
  var playback = {
    token: 0,
    engine: null, // 'avplay' | 'video' | 'iframe'
    attempt: 0,
    started: false,
    avplayFailed: false,
    startTimer: null,
    stallTimer: null
  };

  function getAvplay() {
    var av = window.webapis && webapis.avplay;
    return av && typeof av.open === 'function' ? av : null;
  }

  function destroyHls() {
    if (hlsInstance) {
      try {
        hlsInstance.destroy();
      } catch (err) {}
      hlsInstance = null;
    }
  }

  function clearPlaybackTimers() {
    clearTimeout(playback.startTimer);
    clearTimeout(playback.stallTimer);
    playback.startTimer = null;
    playback.stallTimer = null;
  }

  function stopAvplay() {
    var av = getAvplay();
    if (av) {
      try { av.stop(); } catch (err) {}
      try { av.close(); } catch (err) {}
    }
    document.documentElement.classList.remove('avplay-active');
  }

  function stopStreamMedia() {
    clearPlaybackTimers();
    if (playback.engine === 'avplay') stopAvplay();
    destroyHls();
    if (DOM.streamVideo) {
      DOM.streamVideo.pause();
      DOM.streamVideo.removeAttribute('src');
      DOM.streamVideo.classList.remove('active');
      try {
        DOM.streamVideo.load();
      } catch (err) {}
    }
    if (DOM.streamIframe) {
      DOM.streamIframe.onload = null;
      DOM.streamIframe.src = 'about:blank';
      DOM.streamIframe.classList.remove('active');
      DOM.streamIframe.hidden = true;
    }
    playback.engine = null;
    state.isPaused = false;
  }

  function setPlayerStatus(mode, title, detail) {
    if (!DOM.playerStatus) return;
    DOM.playerStatus.hidden = mode === 'hidden';
    DOM.playerStatus.className = 'player-status status-' + mode;
    DOM.playerStatusTitle.textContent = title || '';
    DOM.playerStatusDetail.textContent = detail || '';
  }

  function markPlaybackStarted(token) {
    if (token !== playback.token || playback.started) return;
    playback.started = true;
    playback.attempt = 0;
    clearPlaybackTimers();
    setPlayerStatus('hidden');
  }

  function markBuffering(token, isBuffering) {
    if (token !== playback.token) return;
    if (!playback.started) {
      if (!isBuffering && playback.engine === 'avplay') markPlaybackStarted(token);
      return;
    }
    clearTimeout(playback.stallTimer);
    if (isBuffering) {
      setPlayerStatus('buffering', 'Buffering…');
      playback.stallTimer = setTimeout(function () {
        handlePlaybackFailure(token, 'Stream stalled');
      }, PLAYBACK_STALL_TIMEOUT_MS);
    } else {
      setPlayerStatus('hidden');
    }
  }

  function handlePlaybackFailure(token, reason) {
    if (token !== playback.token || !state.isPlaying || !state.currentChannel) return;
    console.warn('Playback failed:', reason);
    playback.attempt++;
    if (playback.attempt <= PLAYBACK_MAX_RETRIES) {
      if (playback.engine === 'avplay' && playback.attempt === PLAYBACK_MAX_RETRIES) {
        playback.avplayFailed = true;
      }
      startPlayback(state.currentChannel, true);
      return;
    }
    showPlaybackError();
  }

  function showPlaybackError() {
    playback.token++;
    stopStreamMedia();
    state.playbackError = true;
    setPlayerStatus('error', 'Channel unavailable',
      state.currentChannel.name + ' is not responding right now.');
    showOSD();
  }

  function startPlayback(channel, isRetry) {
    var token = ++playback.token;
    stopStreamMedia();
    state.playbackError = false;
    if (!isRetry) {
      playback.attempt = 0;
      playback.avplayFailed = false;
    }
    playback.started = false;
    setPlayerStatus('loading', channel.name,
      isRetry ? 'Reconnecting… (attempt ' + (playback.attempt + 1) + ' of ' + (PLAYBACK_MAX_RETRIES + 1) + ')' : 'Connecting…');
    playback.startTimer = setTimeout(function () {
      handlePlaybackFailure(token, 'Stream did not start');
    }, PLAYBACK_START_TIMEOUT_MS);

    resolveM3u8Url(channel, !!isRetry).then(function (m3u8) {
      if (token !== playback.token) return;
      if (!m3u8) {
        playIframeFallback(channel, token);
        return;
      }
      if (!playback.avplayFailed && playWithAvplay(m3u8, token)) return;
      if (playM3u8InVideo(m3u8, token)) return;
      playIframeFallback(channel, token);
    });
  }

  function playWithAvplay(m3u8Url, token) {
    var av = getAvplay();
    if (!av) return false;
    try {
      playback.engine = 'avplay';
      document.documentElement.classList.add('avplay-active');
      av.open(m3u8Url);
      av.setDisplayRect(0, 0, 1920, 1080);
      try { av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX'); } catch (err) {}
      av.setListener({
        onbufferingstart: function () { markBuffering(token, true); },
        onbufferingcomplete: function () { markBuffering(token, false); },
        oncurrentplaytime: function () { markPlaybackStarted(token); },
        onstreamcompleted: function () { handlePlaybackFailure(token, 'Stream ended'); },
        onerror: function (err) { handlePlaybackFailure(token, 'AVPlay error: ' + err); },
        onevent: function () {}
      });
      av.prepareAsync(function () {
        if (token !== playback.token) return;
        try {
          av.play();
        } catch (err) {
          handlePlaybackFailure(token, 'AVPlay play failed');
        }
      }, function (err) {
        handlePlaybackFailure(token, 'AVPlay prepare failed: ' + err);
      });
      return true;
    } catch (err) {
      console.warn('AVPlay unavailable, using HTML5 video', err);
      stopAvplay();
      playback.engine = null;
      playback.avplayFailed = true;
      return false;
    }
  }

  function pausePlayback() {
    var ok = false;
    if (playback.engine === 'avplay') {
      try { getAvplay().pause(); ok = true; } catch (err) {}
    } else if (playback.engine === 'video' && DOM.streamVideo) {
      DOM.streamVideo.pause();
      ok = true;
    }
    if (ok) {
      state.isPaused = true;
      setPlayerStatus('paused', 'Paused', 'Press PLAY to continue live');
    }
    return ok;
  }

  function resumePlayback() {
    if (!state.isPaused) return false;
    // A paused live stream falls behind, so reconnect to the live edge instead of resuming.
    if (state.currentChannel) startPlayback(state.currentChannel);
    return true;
  }

  function bindVideoHealthEvents() {
    var video = DOM.streamVideo;
    if (!video) return;
    video.addEventListener('playing', function () {
      if (playback.engine !== 'video') return;
      if (playback.started) {
        markBuffering(playback.token, false);
      } else {
        markPlaybackStarted(playback.token);
      }
    });
    video.addEventListener('waiting', function () {
      if (playback.engine === 'video') markBuffering(playback.token, true);
    });
    video.addEventListener('error', function () {
      if (playback.engine === 'video' && !hlsInstance && video.getAttribute('src')) {
        handlePlaybackFailure(playback.token, 'Video error');
      }
    });
  }

  function showNativeVideoControls() {
    var video = DOM.streamVideo;
    if (!video || !video.classList.contains('active')) return;
    video.controls = true;
    try {
      video.focus();
    } catch (err) {}
    try {
      video.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        clientX: video.clientWidth / 2,
        clientY: video.clientHeight - 48
      }));
    } catch (err) {
      video.dispatchEvent(new Event('mousemove', { bubbles: true }));
    }
  }

  function playM3u8InVideo(m3u8Url, token) {
    var video = DOM.streamVideo;
    if (!video || !m3u8Url) return false;

    if (DOM.streamIframe) {
      DOM.streamIframe.classList.remove('active');
      DOM.streamIframe.hidden = true;
    }
    video.classList.add('active');
    video.controls = true;
    playback.engine = 'video';

    destroyHls();

    if (window.Hls && Hls.isSupported()) {
      hlsInstance = new Hls({ debug: false, enableWorker: true, lowLatencyMode: false });
      hlsInstance.on(Hls.Events.ERROR, function (event, data) {
        if (data && data.fatal) handlePlaybackFailure(token, 'HLS error: ' + data.details);
      });
      hlsInstance.loadSource(m3u8Url);
      hlsInstance.attachMedia(video);
      hlsInstance.on(Hls.Events.MEDIA_ATTACHED, function () {
        video.muted = false;
        var playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          // Browsers block unmuted autoplay until the user interacts; start muted rather than not at all.
          playPromise.catch(function () {
            video.muted = true;
            video.play().catch(function () {});
          });
        }
        setTimeout(showNativeVideoControls, 400);
      });
      return true;
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = m3u8Url;
      video.muted = false;
      video.load();
      video.play().catch(function () {});
      setTimeout(showNativeVideoControls, 400);
      return true;
    }

    playback.engine = null;
    return false;
  }

  function playIframeFallback(channel, token) {
    if (!DOM.streamIframe) return;
    // The web player's own health can't be observed, so stop watching once it loads.
    clearPlaybackTimers();
    playback.engine = 'iframe';
    if (DOM.streamVideo) {
      DOM.streamVideo.classList.remove('active');
      destroyHls();
    }
    DOM.streamIframe.onload = function () {
      if (DOM.streamIframe.src !== 'about:blank') markPlaybackStarted(token);
      keepRemoteFocus();
    };
    playback.startTimer = setTimeout(function () {
      markPlaybackStarted(token);
    }, 8000);
    DOM.streamIframe.hidden = false;
    DOM.streamIframe.classList.add('active');
    DOM.streamIframe.src = 'about:blank';
    DOM.streamIframe.src = channel.playerUrl;
    showToast('Using web player');
  }

  // Remote keys go to whichever frame has focus; the web player must never take it, or RETURN stops working.
  function keepRemoteFocus() {
    if (playback.engine !== 'iframe') return;
    try {
      if (document.activeElement === DOM.streamIframe) DOM.streamIframe.blur();
      window.focus();
    } catch (err) {}
  }

  function scrollFocusIntoView(el) {
    if (!el || !el.scrollIntoView) return;
    try {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    } catch (e) {
      el.scrollIntoView(false);
    }
  }

  // ---------- Channel list ----------

  var FAVORITES = 'Favorites';
  var CATEGORY_ORDER = ['Bangla', 'News', 'Sports', 'English', 'Hindi', 'Kids', 'Islamic'];
  var NAME_FIXES = CONFIG.nameFixes || {};
  var NEWS_CHANNELS = (CONFIG.newsChannels || []).map(function (n) { return n.toUpperCase(); });

  function encodeUrlPath(url) {
    // Server logo file names contain spaces; encode them without double-encoding existing escapes.
    return String(url || '').replace(/ /g, '%20');
  }

  // Channel numbers are tied to the stream id, so a new channel on the server never shifts existing numbers.
  function loadNumberMap() {
    var map = readStorage(STORAGE_KEYS.channelNumbers, null);
    if (!map || typeof map !== 'object') map = {};
    (window.CHANNELS_DATA || []).forEach(function (c) {
      var id = String(c.id);
      if (!map[id] && c.number) map[id] = c.number;
    });
    return map;
  }

  function normalizeChannels(list) {
    var numberMap = loadNumberMap();
    var used = {};
    var maxNumber = 0;
    Object.keys(numberMap).forEach(function (id) {
      used[numberMap[id]] = true;
      if (numberMap[id] > maxNumber) maxNumber = numberMap[id];
    });
    var mapChanged = false;
    var seen = {};
    var channels = [];

    list.forEach(function (raw) {
      if (!raw || raw.id === undefined || raw.id === null) return;
      var id = String(raw.id);
      if (seen[id]) return;
      seen[id] = true;
      var name = String(raw.name || ('Channel ' + id)).trim();
      if (NAME_FIXES[name]) name = NAME_FIXES[name];
      var category = raw.category || 'General';
      if (NEWS_CHANNELS.indexOf(name.toUpperCase()) !== -1) category = 'News';
      var number = numberMap[id];
      if (!number) {
        number = ++maxNumber;
        while (used[number]) number = ++maxNumber;
        numberMap[id] = number;
        used[number] = true;
        mapChanged = true;
      }
      channels.push({
        number: number,
        id: id,
        name: name,
        category: category,
        logo: encodeUrlPath(raw.logo),
        playerUrl: raw.playerUrl || (SERVER_URL + '/player.php?stream=' + id)
      });
    });

    if (mapChanged) writeStorage(STORAGE_KEYS.channelNumbers, numberMap);
    channels.sort(function (a, b) { return a.number - b.number; });
    return channels;
  }

  function channelsSignature(list) {
    return list.map(function (c) {
      return [c.id, c.name, c.category, c.logo].join('|');
    }).join('\n');
  }

  function parseChannelsHtml(html) {
    var marker = html.indexOf('id="vidlink"');
    var part = marker === -1 ? html : html.slice(marker);
    var re = /<li class="([^"]+)">\s*<a[^>]*stream=(\d+)[^>]*>([\s\S]*?)<\/li>/g;
    var channels = [];
    var m;
    while ((m = re.exec(part)) !== null) {
      var classes = m[1].split(/\s+/).filter(function (c) {
        return c && ['All', 'channel', 'nav-item'].indexOf(c) === -1;
      });
      var img = /src="([^"]+)"/.exec(m[3]);
      var alt = /alt="([^"]*)"/.exec(m[3]);
      var src = img ? decodeEntities(img[1]) : '';
      var name = alt && alt[1].trim() ? decodeEntities(alt[1].trim()) : 'Channel ' + m[2];
      channels.push({
        id: m[2],
        name: name,
        category: classes[0] || 'General',
        logo: /^https?:\/\//.test(src) ? src : SERVER_URL + '/' + src.replace(/^\/+/, ''),
        playerUrl: SERVER_URL + '/player.php?stream=' + m[2]
      });
    }
    return channels;
  }

  function fetchRemoteChannels() {
    if (canUseApiProxy()) {
      return fetchWithTimeout('api.php?action=channels', null, 6000)
        .then(function (res) { return res.json(); })
        .then(function (data) { return Array.isArray(data) ? data : null; });
    }
    if (!isTizenApp) return Promise.resolve(null);
    return fetchWithTimeout(SERVER_URL + '/', { cache: 'no-store' }, 6000)
      .then(function (res) { return res.text(); })
      .then(parseChannelsHtml);
  }

  // Show the cached (or bundled) list instantly, then refresh from the server in the background.
  function loadChannels() {
    var cached = readStorage(STORAGE_KEYS.channelCache, null);
    var initial = cached && Array.isArray(cached.channels) && cached.channels.length
      ? cached.channels
      : (window.CHANNELS_DATA || []);
    if (initial.length) setChannels(normalizeChannels(initial));

    fetchRemoteChannels().then(function (list) {
      if (!list || !list.length) return;
      writeStorage(STORAGE_KEYS.channelCache, { savedAt: Date.now(), channels: list });
      var fresh = normalizeChannels(list);
      if (channelsSignature(fresh) !== state.channelsSignature) {
        setChannels(fresh);
        if (state.uiReady) showToast('Channel list updated');
      }
    }).catch(function (err) {
      console.warn('Channel refresh failed, using saved list', err);
    });
  }

  function buildCategories() {
    var present = {};
    state.channels.forEach(function (c) { present[c.category] = true; });
    var cats = [FAVORITES, 'All'];
    CATEGORY_ORDER.forEach(function (c) {
      if (present[c]) cats.push(c);
    });
    Object.keys(present).sort().forEach(function (c) {
      if (cats.indexOf(c) === -1) cats.push(c);
    });
    return cats;
  }

  function findChannelById(id) {
    if (id === null || id === undefined) return null;
    var key = String(id);
    return state.channels.find(function (c) { return c.id === key; }) || null;
  }

  function setChannels(channels) {
    var focusedId = state.uiReady && state.filteredChannels[state.focusIndex]
      ? state.filteredChannels[state.focusIndex].id : null;
    state.channels = channels;
    state.channelsSignature = channelsSignature(channels);
    state.categories = buildCategories();
    if (state.currentChannel) state.currentChannel = findChannelById(state.currentChannel.id) || state.currentChannel;
    if (state.previousChannel) state.previousChannel = findChannelById(state.previousChannel.id) || state.previousChannel;
    if (DOM.channelCount) DOM.channelCount.textContent = channels.length + ' Channels';

    if (!state.uiReady) {
      var savedCat = readStorage(STORAGE_KEYS.lastCategory, null);
      if (savedCat && state.categories.indexOf(savedCat) !== -1) state.activeCategory = savedCat;
      if (state.categories.indexOf(state.activeCategory) === -1) state.activeCategory = 'All';
      state.uiReady = true;
      renderCategories();
      filterCategory(state.activeCategory);
      resumeLastChannel();
      return;
    }

    // Refresh in place without losing the user's position.
    if (state.categories.indexOf(state.activeCategory) === -1) state.activeCategory = 'All';
    renderCategories();
    state.filteredChannels = channelsInCategory(state.activeCategory);
    var idx = focusedId ? state.filteredChannels.findIndex(function (c) { return c.id === focusedId; }) : -1;
    state.focusIndex = idx === -1 ? Math.min(state.focusIndex, Math.max(0, state.filteredChannels.length - 1)) : idx;
    state.catFocusIndex = Math.max(0, Math.min(state.catFocusIndex, state.categories.length - 1));
    renderGrid();
    if (!state.isPlaying) updateFocus();
    if (state.drawerOpen) {
      setDrawerCategory(state.categories.indexOf(state.drawerCategory) === -1 ? 'All' : state.drawerCategory);
      renderDrawer();
    }
  }

  // ---------- Categories & favorites ----------

  function isFavorite(channel) {
    return !!channel && state.favorites.indexOf(String(channel.id)) !== -1;
  }

  function channelsInCategory(cat) {
    if (cat === 'All') return state.channels;
    if (cat === FAVORITES) return state.channels.filter(isFavorite);
    return state.channels.filter(function (c) { return c.category === cat; });
  }

  function focusedGridChannel() {
    return state.currentZone === 'GRID' ? state.filteredChannels[state.focusIndex] : null;
  }

  function updateCategoryBadges() {
    var tabs = DOM.catBar.querySelectorAll('.cat-tab');
    for (var i = 0; i < tabs.length; i++) {
      var badge = tabs[i].querySelector('.tab-badge');
      if (badge) badge.textContent = channelsInCategory(tabs[i].getAttribute('data-category')).length;
    }
  }

  function toggleFavorite(channel) {
    if (!channel) return;
    var id = String(channel.id);
    var idx = state.favorites.indexOf(id);
    if (idx === -1) {
      state.favorites.push(id);
      showToast('★ ' + channel.name + ' added to Favorites');
    } else {
      state.favorites.splice(idx, 1);
      showToast(channel.name + ' removed from Favorites');
    }
    writeStorage(STORAGE_KEYS.favorites, state.favorites);
    updateCategoryBadges();

    if (state.activeCategory === FAVORITES) {
      state.filteredChannels = channelsInCategory(FAVORITES);
      state.focusIndex = Math.max(0, Math.min(state.focusIndex, state.filteredChannels.length - 1));
      renderGrid();
    } else {
      // Only this card changed; avoid rebuilding the whole grid.
      var card = DOM.grid.querySelector('.channel-card[data-id="' + id.replace(/"/g, '') + '"]');
      if (card) {
        card.classList.toggle('is-favorite', isFavorite(channel));
        var title = card.querySelector('.channel-title');
        if (title) title.innerHTML = channelTitleHtml(channel);
      }
    }

    if (state.isPlaying) {
      if (state.currentChannel && state.currentChannel.id === id) {
        updateOsdMeta(state.currentChannel);
      }
      if (state.drawerOpen) {
        var keepIndex = state.drawerIndex;
        if (!channelsInCategory(state.drawerCategory).length) {
          setDrawerCategory('All');
        } else {
          state.drawerChannels = channelsInCategory(state.drawerCategory);
          state.drawerIndex = Math.max(0, Math.min(keepIndex, state.drawerChannels.length - 1));
        }
        renderDrawer();
      } else {
        showOSD();
      }
    } else {
      if (state.currentZone === 'GRID' && state.filteredChannels.length === 0) {
        state.currentZone = 'CATEGORIES';
        state.catFocusIndex = state.categories.indexOf(state.activeCategory);
      }
      updateFocus();
    }
  }

  function playPreviousChannel() {
    // From the grid, PRE-CH returns to whatever was last on screen.
    if (!state.isPlaying && state.currentChannel) {
      playChannel(state.currentChannel);
      return;
    }
    if (!state.previousChannel) {
      showToast('No previous channel yet');
      return;
    }
    playChannel(state.previousChannel);
  }

  // Channel requested by the "My Home" launcher (Tizen app control) or ?channel=<id> in a browser
  var handledLaunchRequest = null;

  function launchRequest() {
    if (isTizenApp) {
      try {
        var req = tizen.application.getCurrentApplication().getRequestedAppControl();
        var data = (req && req.appControl && req.appControl.data) || [];
        var values = {};
        data.forEach(function (d) {
          if (d.value && d.value.length) values[d.key] = String(d.value[0]);
        });
        if (values.channel) return { channel: values.channel, id: values.requestId || values.channel };
      } catch (err) {}
      return null;
    }
    var match = /[?&]channel=([^&]+)/.exec(window.location.search);
    return match ? { channel: decodeURIComponent(match[1]), id: 'url' } : null;
  }

  function takeLaunchChannel() {
    var req = launchRequest();
    if (!req || req.id === handledLaunchRequest) return null;
    handledLaunchRequest = req.id;
    return findChannelById(req.channel);
  }

  function showAndPlay(channel) {
    if (state.categories.indexOf(channel.category) !== -1) {
      filterCategory(channel.category);
    }
    playChannel(channel);
  }

  function resumeLastChannel() {
    if (state.resumeAttempted) return;
    state.resumeAttempted = true;
    var launched = takeLaunchChannel();
    if (launched) {
      showAndPlay(launched);
      return;
    }
    // Resume inside the remembered category so CH+/− keeps the same channel list as last time.
    var channel = findChannelById(readStorage(STORAGE_KEYS.lastChannel, null));
    if (channel) playChannel(channel);
  }

  function playRequestedChannel() {
    var channel = takeLaunchChannel();
    if (!channel) return false;
    showAndPlay(channel);
    return true;
  }

  function renderCategories() {
    DOM.catBar.innerHTML = '';
    state.categories.forEach(function (cat, idx) {
      var btn = document.createElement('button');
      btn.className = 'cat-tab' + (cat === state.activeCategory ? ' active' : '');
      btn.setAttribute('data-category', cat);
      btn.setAttribute('data-index', idx);
      btn.setAttribute('tabindex', '-1');

      var label = cat === FAVORITES ? '★ ' + cat : cat;
      btn.innerHTML = escapeHtml(label) + ' <span class="tab-badge">' + channelsInCategory(cat).length + '</span>';
      btn.onclick = function () {
        state.catFocusIndex = idx;
        filterCategory(cat);
      };
      DOM.catBar.appendChild(btn);
    });
  }

  function filterCategory(cat) {
    state.activeCategory = cat;
    writeStorage(STORAGE_KEYS.lastCategory, cat);
    state.catFocusIndex = Math.max(0, state.categories.indexOf(cat));

    var tabs = DOM.catBar.querySelectorAll('.cat-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('active', tabs[i].getAttribute('data-category') === cat);
    }

    state.filteredChannels = channelsInCategory(cat);
    state.focusIndex = 0;
    renderGrid();
    updateFocus();
  }

  // ---------- Grid ----------

  var gridColumnsCache = null;

  function channelTitleHtml(ch) {
    return (isFavorite(ch) ? '<span class="channel-fav-star">★</span> ' : '') + escapeHtml(ch.name);
  }

  function renderGrid() {
    gridColumnsCache = null;
    var html = '';
    state.filteredChannels.forEach(function (ch, idx) {
      html += '<div class="channel-card' + (isFavorite(ch) ? ' is-favorite' : '') + '" data-index="' + idx + '" data-id="' + escapeHtml(ch.id) + '">' +
        '<div class="channel-card-top">' +
          '<span class="channel-number-badge">CH ' + padNumber(ch.number) + '</span>' +
          '<span class="channel-cat-tag">' + escapeHtml(ch.category) + '</span>' +
        '</div>' +
        '<div class="channel-logo-wrap">' +
          '<img class="channel-logo" data-logo="' + escapeHtml(ch.logo) + '" alt="' + escapeHtml(ch.name) + '" decoding="async" ' +
            'onerror="this.style.display=\'none\'; if(this.nextElementSibling) this.nextElementSibling.style.display=\'block\';" />' +
          '<div class="channel-logo-fallback">📺</div>' +
        '</div>' +
        '<div class="channel-card-footer">' +
          '<div class="channel-title">' + channelTitleHtml(ch) + '</div>' +
        '</div>' +
      '</div>';
    });
    if (state.activeCategory === FAVORITES && state.filteredChannels.length === 0) {
      html += '<div class="grid-empty"><div class="grid-empty-icon">★</div>' +
        '<div>No favorites yet</div>' +
        '<div class="grid-empty-hint">Highlight a channel and press the <span class="key-pill key-red">RED</span> button to add it here.</div></div>';
    }
    DOM.grid.innerHTML = html;
    hydrateVisibleLogos();
  }

  // One delegated click handler instead of one per card (mouse / pointer remote).
  function bindGridClicks() {
    DOM.grid.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el !== DOM.grid && !(el.classList && el.classList.contains('channel-card'))) el = el.parentNode;
      if (!el || el === DOM.grid) return;
      var idx = parseInt(el.getAttribute('data-index'), 10);
      var ch = state.filteredChannels[idx];
      if (!ch) return;
      state.focusIndex = idx;
      playChannel(ch);
    });
  }

  function hydrateLogoImg(img) {
    if (!img || img.getAttribute('src') || !img.getAttribute('data-logo')) return;
    img.src = img.getAttribute('data-logo');
  }

  function hydrateVisibleLogos() {
    var cards = DOM.grid.querySelectorAll('.channel-card');
    var cols = getGridColumns();
    var start = Math.max(0, state.focusIndex - cols * 2);
    var end = Math.min(cards.length, state.focusIndex + cols * 4);
    for (var i = start; i < end; i++) {
      hydrateLogoImg(cards[i].querySelector('.channel-logo'));
    }
  }

  // Focus Management
  function updateFocus() {
    var focused = document.querySelectorAll('.focused');
    for (var i = 0; i < focused.length; i++) focused[i].classList.remove('focused');

    if (state.currentZone === 'CATEGORIES') {
      var tabs = DOM.catBar.querySelectorAll('.cat-tab');
      if (tabs[state.catFocusIndex]) {
        tabs[state.catFocusIndex].classList.add('focused');
        scrollFocusIntoView(tabs[state.catFocusIndex]);
      }
    } else if (state.currentZone === 'GRID') {
      var cards = DOM.grid.querySelectorAll('.channel-card');
      if (cards[state.focusIndex]) {
        cards[state.focusIndex].classList.add('focused');
        scrollFocusIntoView(cards[state.focusIndex]);
        hydrateVisibleLogos();
      }
    }
  }

  function getGridColumns() {
    if (gridColumnsCache) return gridColumnsCache;
    var cards = DOM.grid.querySelectorAll('.channel-card');
    if (cards.length < 2) return 1;
    var firstTop = cards[0].offsetTop;
    var cols = cards.length;
    for (var i = 1; i < cards.length; i++) {
      if (cards[i].offsetTop > firstTop) {
        cols = i;
        break;
      }
    }
    // Only cache once laid out (hidden grids report every card at offsetTop 0).
    if (cards[0].offsetWidth > 0) gridColumnsCache = cols;
    return cols;
  }

  // ---------- Player ----------

  function updateOsdMeta(channel) {
    DOM.osdChCat.textContent = channel.category + ' • LIVE' + (isFavorite(channel) ? ' • ★ Favorite' : '');
  }

  function playChannel(channel) {
    if (!channel) return;
    if (state.currentChannel && state.currentChannel.id !== channel.id) {
      state.previousChannel = state.currentChannel;
    }
    state.currentChannel = channel;
    state.isPlaying = true;
    state.currentZone = 'PLAYER';
    writeStorage(STORAGE_KEYS.lastChannel, channel.id);

    DOM.osdChNum.textContent = 'CH ' + padNumber(channel.number);
    if (DOM.osdChLogo) {
      DOM.osdChLogo.src = channel.logo;
      DOM.osdChLogo.style.display = '';
    }
    DOM.osdChName.textContent = channel.name;
    updateOsdMeta(channel);

    closeDrawer();
    DOM.playerContainer.classList.add('active');
    startPlayback(channel);

    showOSD();
    if (!state.playerHintShown) {
      state.playerHintShown = true;
      showToast('OK: channel list • ◀ ▶: change channel • RETURN: back');
    }
  }

  function stopPlayer() {
    state.isPlaying = false;
    state.playbackError = false;
    playback.token++;
    stopStreamMedia();
    closeDrawer();
    setPlayerStatus('hidden');
    DOM.playerContainer.classList.remove('active');
    state.currentZone = 'GRID';
    clearTimeout(state.osdTimer);
    var watchedIdx = state.currentChannel
      ? state.filteredChannels.findIndex(function (c) { return c.id === state.currentChannel.id; })
      : -1;
    if (watchedIdx !== -1) {
      state.focusIndex = watchedIdx;
    } else if (state.filteredChannels.length === 0) {
      state.currentZone = 'CATEGORIES';
      state.catFocusIndex = state.categories.indexOf(state.activeCategory);
    }
    gridColumnsCache = null;
    updateFocus();
  }

  function showOSD() {
    DOM.playerOsd.classList.remove('hidden');
    clearTimeout(state.osdTimer);
    state.osdTimer = setTimeout(function () {
      DOM.playerOsd.classList.add('hidden');
    }, 2800);
  }

  // CH+/− and ◀ ▶ stay inside the category being browsed (e.g. Favorites); otherwise go through all channels.
  function zapList() {
    var cur = state.currentChannel;
    var list = state.filteredChannels;
    if (cur && list.length > 1 && list.some(function (c) { return c.id === cur.id; })) return list;
    return state.channels;
  }

  function stepChannel(step) {
    var list = zapList();
    if (!list.length) return;
    var cur = state.currentChannel;
    var idx = cur ? list.findIndex(function (c) { return c.id === cur.id; }) : -1;
    var next = idx === -1 ? 0 : (idx + step + list.length) % list.length;
    playChannel(list[next]);
  }

  function nextChannel() { stepChannel(1); }
  function prevChannel() { stepChannel(-1); }

  // Quick channel list shown over the video
  var DRAWER_IDLE_MS = 10000;
  var drawerTimer = null;

  function drawerCategories() {
    return state.categories.filter(function (c) { return channelsInCategory(c).length > 0; });
  }

  function drawerFocusedChannel() {
    return state.drawerOpen ? state.drawerChannels[state.drawerIndex] : null;
  }

  function armDrawerIdleTimer() {
    clearTimeout(drawerTimer);
    drawerTimer = setTimeout(closeDrawer, DRAWER_IDLE_MS);
  }

  function setDrawerCategory(cat) {
    state.drawerCategory = cat;
    state.drawerChannels = channelsInCategory(cat);
    var currentId = state.currentChannel && state.currentChannel.id;
    var idx = state.drawerChannels.findIndex(function (c) { return c.id === currentId; });
    state.drawerIndex = idx === -1 ? 0 : idx;
  }

  function renderDrawer() {
    if (!DOM.drawerList) return;
    DOM.drawerCategory.textContent = state.drawerCategory === FAVORITES ? '★ ' + FAVORITES : state.drawerCategory;
    var currentId = state.currentChannel && state.currentChannel.id;
    var html = '';
    state.drawerChannels.forEach(function (ch, idx) {
      var classes = 'drawer-item' +
        (idx === state.drawerIndex ? ' focused' : '') +
        (ch.id === currentId ? ' playing' : '');
      html += '<div class="' + classes + '" data-index="' + idx + '">' +
        '<span class="drawer-num">' + padNumber(ch.number) + '</span>' +
        '<span class="drawer-logo-wrap"><img class="drawer-logo" data-logo="' + escapeHtml(ch.logo) + '" alt="" onerror="this.style.visibility=\'hidden\'"></span>' +
        '<span class="drawer-name">' + channelTitleHtml(ch) + '</span>' +
        (ch.id === currentId ? '<span class="drawer-playing">LIVE</span>' : '') +
        '</div>';
    });
    DOM.drawerList.innerHTML = html;
    updateDrawerFocus();
  }

  function updateDrawerFocus() {
    var items = DOM.drawerList.querySelectorAll('.drawer-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('focused', i === state.drawerIndex);
    }
    var start = Math.max(0, state.drawerIndex - 6);
    var end = Math.min(items.length, state.drawerIndex + 12);
    for (var j = start; j < end; j++) {
      hydrateLogoImg(items[j].querySelector('.drawer-logo'));
    }
    scrollFocusIntoView(items[state.drawerIndex]);
  }

  function openDrawer() {
    if (!state.isPlaying || !DOM.channelDrawer) return;
    var cats = drawerCategories();
    var cat = state.activeCategory;
    var current = state.currentChannel;
    var inActive = current && channelsInCategory(cat).some(function (c) { return c.id === current.id; });
    if (!inActive) {
      cat = current && cats.indexOf(current.category) !== -1 ? current.category : 'All';
    }
    state.drawerOpen = true;
    state.currentZone = 'PLAYER_DRAWER';
    setDrawerCategory(cat);
    DOM.channelDrawer.classList.add('open');
    DOM.playerOsd.classList.add('hidden');
    renderDrawer();
    armDrawerIdleTimer();
  }

  function closeDrawer() {
    clearTimeout(drawerTimer);
    if (!state.drawerOpen) return;
    state.drawerOpen = false;
    if (DOM.channelDrawer) DOM.channelDrawer.classList.remove('open');
    if (state.isPlaying) state.currentZone = 'PLAYER';
  }

  function handleDrawerKey(code) {
    armDrawerIdleTimer();
    var total = state.drawerChannels.length;
    if (code === TV_KEYS.UP && total) {
      state.drawerIndex = (state.drawerIndex - 1 + total) % total;
      updateDrawerFocus();
    } else if (code === TV_KEYS.DOWN && total) {
      state.drawerIndex = (state.drawerIndex + 1) % total;
      updateDrawerFocus();
    } else if (code === TV_KEYS.LEFT || code === TV_KEYS.RIGHT) {
      var cats = drawerCategories();
      var pos = cats.indexOf(state.drawerCategory);
      var step = code === TV_KEYS.RIGHT ? 1 : -1;
      setDrawerCategory(cats[(pos + step + cats.length) % cats.length]);
      renderDrawer();
    } else if (code === TV_KEYS.ENTER) {
      var ch = drawerFocusedChannel();
      if (ch && state.currentChannel && ch.id === state.currentChannel.id && !state.playbackError) {
        closeDrawer();
        showOSD();
      } else if (ch) {
        playChannel(ch);
      }
    } else if (isBackKey(code)) {
      closeDrawer();
      showOSD();
    } else if (code === TV_KEYS.CH_UP || code === TV_KEYS.CH_DOWN) {
      closeDrawer();
      if (code === TV_KEYS.CH_UP) nextChannel(); else prevChannel();
    }
  }

  // ---------- Number dialling ----------

  function dialWidth() {
    var max = 0;
    state.channels.forEach(function (c) { if (c.number > max) max = c.number; });
    return Math.max(2, String(max).length);
  }

  function commitDial() {
    clearTimeout(state.dialTimer);
    var buffer = state.dialBuffer;
    state.dialBuffer = '';
    DOM.dialOverlay.classList.remove('active');
    if (!buffer) return;
    var targetNum = parseInt(buffer, 10);
    if (!playChannelNumber(targetNum)) {
      showToast('Channel ' + targetNum + ' not found');
    }
  }

  function handleDigit(digit) {
    state.dialBuffer += digit;
    DOM.dialOverlay.classList.add('active');
    DOM.dialDigits.textContent = state.dialBuffer;
    clearTimeout(state.dialTimer);

    var buffer = state.dialBuffer;
    // Switch immediately when no longer number could start with what was typed (e.g. "9" when the max is 92 → wait; "93" → go).
    var canExtend = buffer.length < dialWidth() && (buffer.charAt(0) === '0' || state.channels.some(function (c) {
      var n = String(c.number);
      return n.length > buffer.length && n.indexOf(buffer) === 0;
    }));
    if (!canExtend) {
      commitDial();
      return;
    }
    state.dialTimer = setTimeout(commitDial, 1500);
  }

  function playChannelNumber(num) {
    var found = state.channels.find(function (c) { return c.number === num; });
    if (found) playChannel(found);
    return !!found;
  }

  // ---------- Exit confirmation ----------

  function showExitDialog() {
    if (!isTizenApp || !DOM.exitDialog) return;
    state.currentZone = 'EXIT_DIALOG';
    state.exitFocusIndex = 1;
    DOM.exitDialog.hidden = false;
    updateExitFocus();
  }

  function hideExitDialog() {
    if (DOM.exitDialog) DOM.exitDialog.hidden = true;
    state.currentZone = 'CATEGORIES';
    updateFocus();
  }

  function updateExitFocus() {
    var buttons = DOM.exitDialog.querySelectorAll('.exit-btn');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('focused', i === state.exitFocusIndex);
    }
  }

  function exitApp() {
    try {
      tizen.application.getCurrentApplication().exit();
    } catch (err) {
      hideExitDialog();
    }
  }

  function handleExitDialogKey(code) {
    if (code === TV_KEYS.LEFT || code === TV_KEYS.RIGHT) {
      state.exitFocusIndex = state.exitFocusIndex === 0 ? 1 : 0;
      updateExitFocus();
    } else if (code === TV_KEYS.ENTER) {
      if (state.exitFocusIndex === 0) exitApp(); else hideExitDialog();
    } else if (isBackKey(code)) {
      hideExitDialog();
    }
  }

  // Voice Control: Bixby (webapis.voiceinteraction) on the TV, Web Speech API in desktop browsers
  var VOICE_VERB_PREFIX = /^(please\s+)?(search for|search|find|play|watch|open|show me|show|switch to|change to|go to|put on|tune to|turn on|start)\s+/;
  var VOICE_APP_SUFFIX = /\s+(on|in)\s+(samsung\s+)?(smart\s+)?iptv$/;
  var speechRecognizer = null;
  var NUMBER_WORDS = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
    seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90
  };

  function numberWordsToDigits(text) {
    return text
      .replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety) (one|two|three|four|five|six|seven|eight|nine)\b/g,
        function (m, tens, unit) { return String(NUMBER_WORDS[tens] + NUMBER_WORDS[unit]); })
      .replace(/\b[a-z]+\b/g, function (word) {
        return Object.prototype.hasOwnProperty.call(NUMBER_WORDS, word) ? String(NUMBER_WORDS[word]) : word;
      });
  }

  function normalizeVoiceText(text) {
    var cleaned = String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    return numberWordsToDigits(cleaned);
  }

  function compactChannelName(text) {
    return normalizeVoiceText(text).replace(/\b(hd|tv)\b/g, '').replace(/\s+/g, '');
  }

  function findChannelByName(query, exactOnly) {
    var q = compactChannelName(query);
    if (!q) return null;
    var exact = state.channels.find(function (c) { return compactChannelName(c.name) === q; });
    if (exact || exactOnly || q.length < 3) return exact || null;
    var partial = state.channels.filter(function (c) {
      var n = compactChannelName(c.name);
      return n.indexOf(q) !== -1 || (n.length >= 3 && q.indexOf(n) !== -1);
    });
    partial.sort(function (a, b) { return a.name.length - b.name.length; });
    return partial[0] || null;
  }

  function findCategoryByVoice(text) {
    var spoken = text.replace(/\s+channels?$/, '').replace(/^favourites?$|^favorite$/, 'favorites');
    return state.categories.find(function (c) { return c.toLowerCase() === spoken; }) || null;
  }

  function showCategoryByVoice(cat) {
    if (state.isPlaying) stopPlayer();
    filterCategory(cat);
    if (state.filteredChannels.length === 0) {
      state.currentZone = 'CATEGORIES';
      state.catFocusIndex = state.categories.indexOf(cat);
    } else {
      state.currentZone = 'GRID';
    }
    updateFocus();
  }

  function setFavoriteByVoice(wantFavorite) {
    var target = state.isPlaying ? state.currentChannel : focusedGridChannel();
    if (!target) return false;
    if (isFavorite(target) === wantFavorite) {
      showToast(target.name + (wantFavorite ? ' is already a favorite' : ' is not in Favorites'));
    } else {
      toggleFavorite(target);
    }
    return true;
  }

  function runVoiceCommand(raw) {
    var text = normalizeVoiceText(raw).replace(VOICE_APP_SUFFIX, '');
    if (!text) return false;
    var cmd = text.replace(VOICE_VERB_PREFIX, '');
    var match;

    if (/^(previous|last) channel$|^go back$/.test(text)) { playPreviousChannel(); return true; }
    if (/^(next channel|channel up)$/.test(cmd)) { nextChannel(); return true; }
    if (/^channel down$/.test(cmd)) { prevChannel(); return true; }
    if (/\b(add|save)\b.*\bfavou?rites?\b|^favou?rite this( channel)?$/.test(text)) return setFavoriteByVoice(true);
    if (/\b(remove|delete)\b.*\bfavou?rites?\b/.test(text)) return setFavoriteByVoice(false);
    if (/^(stop|exit|close|back)( (tv|channel|video|player|watching))?$/.test(text)) {
      if (state.isPlaying) stopPlayer();
      return true;
    }
    if (/^(play|resume)$/.test(text)) {
      if (state.isPlaying) {
        resumePlayback();
      } else {
        playChannel(focusedGridChannel() || state.currentChannel);
      }
      return true;
    }
    if (/^pause$/.test(text)) return state.isPlaying && pausePlayback();

    // "Channel 24" is also a channel name, so only "number 24" or a bare number always dials.
    if ((match = cmd.match(/^(?:channel\s+)?number\s+(\d+)$|^(\d+)$/))) return playChannelNumber(parseInt(match[1] || match[2], 10));
    var exact = findChannelByName(cmd, true);
    if (exact) { playChannel(exact); return true; }
    if ((match = cmd.match(/^channel\s+(\d+)$/))) return playChannelNumber(parseInt(match[1], 10));

    var cat = findCategoryByVoice(cmd);
    if (cat) { showCategoryByVoice(cat); return true; }

    var partial = findChannelByName(cmd, false);
    if (partial) { playChannel(partial); return true; }
    return false;
  }

  function handleVoiceText(candidates) {
    var list = (Array.isArray(candidates) ? candidates : [candidates]).filter(function (t) {
      return t && String(t).trim();
    });
    if (!list.length) return false;
    showToast('🎤 "' + list[0] + '"');
    for (var i = 0; i < list.length; i++) {
      if (runVoiceCommand(list[i])) return true;
    }
    showToast('🎤 No channel found for "' + list[0] + '"');
    return false;
  }

  function sendNavigationKey(keyCode) {
    handleKeyDown({ keyCode: keyCode, preventDefault: function () {} });
  }

  function buildVoiceContentContext(vi) {
    var items = [];
    if (!state.isPlaying) {
      var cols = getGridColumns();
      items = state.filteredChannels.map(function (ch, idx) {
        var shortName = ch.name.replace(/\s+HD$/i, '');
        return vi.buildVoiceInteractionContentContextItem(
          (idx % cols) + 1,
          Math.floor(idx / cols) + 1,
          ch.name,
          shortName !== ch.name ? [shortName] : [],
          state.currentZone === 'GRID' && idx === state.focusIndex
        );
      });
    }
    return vi.buildVoiceInteractionContentContextResponse(items);
  }

  function setupBixbyVoice() {
    var vi = window.webapis && webapis.voiceinteraction;
    if (!vi || typeof vi.setCallback !== 'function') return false;

    function searchTermCandidates(term) {
      return ['SEARCH_TERM_TITLE', 'SEARCH_TERM_UTTERANCE', 'SEARCH_TERM_GENRE'].map(function (field) {
        try {
          return vi.getDataFromSearchTerm(term, field);
        } catch (err) {
          return '';
        }
      });
    }

    try {
      vi.setCallback({
        onupdatestate: function () {
          return state.isPlaying ? 'Player' : 'List';
        },
        onsearch: function (term) {
          return handleVoiceText(searchTermCandidates(term));
        },
        ontitleselection: function (title) {
          return handleVoiceText(title);
        },
        onselection: function (index) {
          if (state.isPlaying) return false;
          var ch = index === -1
            ? state.filteredChannels[state.filteredChannels.length - 1]
            : state.filteredChannels[index - 1];
          if (!ch) return false;
          playChannel(ch);
          return true;
        },
        onnavigation: function (nav) {
          if (state.isPlaying) {
            if (nav === 'NAV_NEXT' || nav === 'NAV_UP') { nextChannel(); return true; }
            if (nav === 'NAV_PREVIOUS' || nav === 'NAV_DOWN') { prevChannel(); return true; }
            return false;
          }
          var navKeys = {
            NAV_LEFT: TV_KEYS.LEFT, NAV_PREVIOUS: TV_KEYS.LEFT,
            NAV_RIGHT: TV_KEYS.RIGHT, NAV_NEXT: TV_KEYS.RIGHT,
            NAV_UP: TV_KEYS.UP, NAV_DOWN: TV_KEYS.DOWN, NAV_SHOW_MORE: TV_KEYS.DOWN
          };
          if (!navKeys[nav]) return false;
          sendNavigationKey(navKeys[nav]);
          return true;
        },
        onplay: function () {
          return runVoiceCommand('play');
        },
        onpause: function () {
          return state.isPlaying && pausePlayback();
        },
        onstop: function () {
          if (!state.isPlaying) return false;
          stopPlayer();
          return true;
        },
        onexit: function () {
          if (!state.isPlaying) return false;
          stopPlayer();
          return true;
        },
        onchangenexttrack: function () {
          nextChannel();
          return true;
        },
        onchangeprevioustrack: function () {
          prevChannel();
          return true;
        },
        onrequestcontentcontext: function () {
          return buildVoiceContentContext(vi);
        }
      });
      vi.listen();
      return true;
    } catch (err) {
      console.warn('Bixby voice interaction unavailable', err);
      return false;
    }
  }

  function toggleSpeechListening() {
    var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      showToast(isTizenApp
        ? '🎤 Hold the mic button on your remote and say a channel name'
        : '🎤 Voice control is not supported in this browser');
      return;
    }
    if (speechRecognizer) {
      speechRecognizer.abort();
      return;
    }
    var rec = new Recognition();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    rec.onresult = function (e) {
      var result = e.results[0];
      var alternatives = [];
      for (var i = 0; i < result.length; i++) alternatives.push(result[i].transcript);
      handleVoiceText(alternatives);
    };
    rec.onerror = function (e) {
      if (e.error !== 'aborted' && e.error !== 'no-speech') showToast('🎤 Voice error: ' + e.error);
    };
    rec.onend = function () {
      speechRecognizer = null;
    };
    speechRecognizer = rec;
    try {
      rec.start();
      showToast('🎤 Listening… say a channel name');
    } catch (err) {
      speechRecognizer = null;
      showToast('🎤 Could not start the microphone');
    }
  }

  function handleMediaKey(code) {
    if (!state.isPlaying) return false;
    if (code === TV_KEYS.STOP) {
      stopPlayer();
      return true;
    }
    if (code === TV_KEYS.PAUSE) {
      if (!state.isPaused) pausePlayback();
      return true;
    }
    if (code === TV_KEYS.PLAY) {
      if (state.isPaused) resumePlayback();
      else if (state.playbackError) startPlayback(state.currentChannel);
      return true;
    }
    if (code === TV_KEYS.PLAY_PAUSE) {
      if (state.isPaused) resumePlayback(); else pausePlayback();
      return true;
    }
    return false;
  }

  function handleKeyDown(e) {
    var code = e.keyCode;

    if ([TV_KEYS.UP, TV_KEYS.DOWN, TV_KEYS.LEFT, TV_KEYS.RIGHT, TV_KEYS.BACKSPACE].indexOf(code) !== -1) {
      e.preventDefault();
    }

    if (state.currentZone === 'EXIT_DIALOG') {
      handleExitDialogKey(code);
      return;
    }

    if (code >= 48 && code <= 57) {
      handleDigit(String(code - 48));
      return;
    }

    if (code === TV_KEYS.RED || code === TV_KEYS.KEY_F) {
      toggleFavorite(state.isPlaying ? (drawerFocusedChannel() || state.currentChannel) : focusedGridChannel());
      return;
    }

    if (code === TV_KEYS.PREV_CH || code === TV_KEYS.GREEN || code === TV_KEYS.KEY_P) {
      playPreviousChannel();
      return;
    }

    if (code === TV_KEYS.BLUE || code === TV_KEYS.KEY_V) {
      toggleSpeechListening();
      return;
    }

    if (handleMediaKey(code)) return;

    if (state.isPlaying) {
      if (state.drawerOpen) {
        handleDrawerKey(code);
        return;
      }

      showOSD();

      if (isBackKey(code)) {
        stopPlayer();
        return;
      }

      if (code === TV_KEYS.ENTER) {
        if (state.playbackError || state.isPaused) {
          startPlayback(state.currentChannel);
        } else {
          openDrawer();
        }
        return;
      }

      if (code === TV_KEYS.DOWN) {
        if (playback.engine === 'video' && !isTizenApp) {
          showNativeVideoControls();
        } else {
          openDrawer();
        }
        return;
      }

      if (code === TV_KEYS.CH_UP || code === TV_KEYS.RIGHT) {
        nextChannel();
        return;
      }

      if (code === TV_KEYS.CH_DOWN || code === TV_KEYS.LEFT) {
        prevChannel();
        return;
      }

      return;
    }

    if (state.currentZone === 'CATEGORIES') {
      var tabsCount = state.categories.length;

      if (code === TV_KEYS.LEFT) {
        state.catFocusIndex = (state.catFocusIndex - 1 + tabsCount) % tabsCount;
        updateFocus();
      } else if (code === TV_KEYS.RIGHT) {
        state.catFocusIndex = (state.catFocusIndex + 1) % tabsCount;
        updateFocus();
      } else if (code === TV_KEYS.ENTER) {
        filterCategory(state.categories[state.catFocusIndex]);
      } else if (code === TV_KEYS.DOWN) {
        if (state.filteredChannels.length > 0) {
          state.currentZone = 'GRID';
          state.focusIndex = 0;
          updateFocus();
        }
      } else if (isBackKey(code)) {
        showExitDialog();
      }
      return;
    }

    if (state.currentZone === 'GRID') {
      if (isBackKey(code)) {
        state.currentZone = 'CATEGORIES';
        state.catFocusIndex = Math.max(0, state.categories.indexOf(state.activeCategory));
        updateFocus();
        return;
      }

      var total = state.filteredChannels.length;
      if (total === 0) return;

      var cols = getGridColumns();

      if (code === TV_KEYS.RIGHT) {
        if (state.focusIndex < total - 1) {
          state.focusIndex++;
          updateFocus();
        }
      } else if (code === TV_KEYS.LEFT) {
        if (state.focusIndex > 0) {
          state.focusIndex--;
          updateFocus();
        }
      } else if (code === TV_KEYS.DOWN) {
        if (state.focusIndex + cols < total) {
          state.focusIndex += cols;
          updateFocus();
        } else if (state.focusIndex < total - 1) {
          state.focusIndex = total - 1;
          updateFocus();
        }
      } else if (code === TV_KEYS.UP) {
        if (state.focusIndex - cols >= 0) {
          state.focusIndex -= cols;
          updateFocus();
        } else {
          state.currentZone = 'CATEGORIES';
          state.catFocusIndex = Math.max(0, state.categories.indexOf(state.activeCategory));
          updateFocus();
        }
      } else if (code === TV_KEYS.ENTER) {
        var ch = state.filteredChannels[state.focusIndex];
        if (ch) playChannel(ch);
      }
    }
  }

  window.addEventListener('load', function () {
    if (isTizenApp) {
      document.body.classList.add('tv-device');
    }
    if (DOM.brandSubtitle) {
      DOM.brandSubtitle.textContent = 'Live BDIX Channels • ' + SERVER_URL.replace(/^https?:\/\//, '');
    }
    registerTizenKeys();
    var savedFavorites = readStorage(STORAGE_KEYS.favorites, []);
    state.favorites = Array.isArray(savedFavorites) ? savedFavorites.map(String) : [];
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', function () { gridColumnsCache = null; });
    // If the embedded web player grabs focus, take it back so the remote keeps working.
    window.addEventListener('blur', function () { setTimeout(keepRemoteFocus, 0); });
    // Live streams can't be resumed where they left off, so reconnect instead of suspending the player.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && state.channels.length && playRequestedChannel()) return;
      if (!state.isPlaying || !state.currentChannel) return;
      if (document.hidden) {
        playback.token++;
        stopStreamMedia();
      } else {
        startPlayback(state.currentChannel);
      }
    });
    window.addEventListener('appcontrol', function () {
      if (state.channels.length) playRequestedChannel();
    });
    bindGridClicks();
    bindVideoHealthEvents();
    loadChannels();
    setupBixbyVoice();
  });

})();
