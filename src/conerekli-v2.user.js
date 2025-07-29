// ==UserScript==
// @name         CoNeřekli – Live Telegram Comments (Bazos/Sreality)
// @namespace    https://github.com/user/conerekli
// @version      1.0
// @description  Shows community comments from a public Telegram group next to classified ads; allows adding new comments.
// @author       CoNerekli
// @match        https://*.bazos.cz/*
// @match        https://*.sreality.cz/*
// @icon         https://www.bazos.cz/favicon.ico
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      api.telegram.org
// ==/UserScript==

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * CONFIGURATION – EDIT THESE CONSTANTS
 * ──────────────────────────────────────────────────────────────────────────────
 */

const CONFIG = {
  // Telegram Bot token (create a bot with @BotFather and add it to your public group).
  // IMPORTANT: The bot must be added to the group and have privacy mode DISABLED.
  botToken: '123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',

  // Numeric chat ID of the public group (start with a minus sign for groups, e.g. -1001948723456)
  chatId: '-1001234567890',

  // Telegram message prefix used to tag ads. Keep in sync with share link.
  hashtagPrefix: {
    'bazos.cz': '#bazos_',
    'sreality.cz': '#sreality_'
  },

  // Polling interval (ms) for updates – 30 s is a good default
  pollInterval: 30000,

  // Maximum messages to retrieve per poll
  limit: 100
};

/**
 * UTILITIES
 */

// Extract ad ID from URL based on domain patterns
function extractAdId() {
  const url = new URL(location.href);
  if (url.hostname.endsWith('bazos.cz')) {
    const m = url.pathname.match(/inzerat\/(\d+)/);
    return m ? m[1] : null;
  }
  if (url.hostname.endsWith('sreality.cz')) {
    const m = url.pathname.match(/detail\/\w+\/(\d+)/);
    return m ? m[1] : null;
  }
  return null;
}

// Determine hashtag prefix for current site
function currentPrefix() {
  const host = Object.keys(CONFIG.hashtagPrefix).find(h => location.hostname.endsWith(h));
  return host ? CONFIG.hashtagPrefix[host] : '#ad_';
}

// Build Telegram API URL
function tgApi(method, params = {}) {
  const query = new URLSearchParams(params);
  return `https://api.telegram.org/bot${CONFIG.botToken}/${method}?${query}`;
}

// Simple HTML escaping
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'
  }[ch]));
}

/**
 * STATE
 */
let lastUpdateId = 0;
let adId = extractAdId();
if (!adId) return; // Stop if not on ad page
const hashtag = currentPrefix() + adId;

/**
 * UI COMPONENTS
 */

GM_addStyle(`
#cone-box {font-family: Arial, sans-serif;line-height:1.4;border:1px solid #ccc;background:#f9f9f9;padding:1em;margin:1em 0;}
#cone-box h3{margin:0 0 0.5em;font-size:1.1em;}
#cone-comments{max-height:300px;overflow-y:auto;border-top:1px dashed #ccc;margin-top:0.5em;padding-top:0.5em;}
#cone-comments p{margin:0 0 0.75em;}
#cone-add{display:inline-block;margin-top:0.5em;}
`);

function createBox() {
  const container = document.body;
  const box = document.createElement('div');
  box.id = 'cone-box';
  box.innerHTML = `
    <h3>CoNeřekli – Komentáře k inzerátu #${adId}</h3>
    <div id="cone-comments">Loading comments…</div>
    <a id="cone-add" href="https://t.me/share/url?url=${encodeURIComponent(location.href)}&text=${encodeURIComponent(hashtag + '\n')}" target="_blank">➕ Přidat komentář na Telegramu</a>
  `;

  // Insert box – try to place under main headline; fallback to top
  const target = document.querySelector('h1') || container.firstChild;
  target.parentNode.insertBefore(box, target.nextSibling);
}

/**
 * DATA FETCHING
 */
function fetchUpdates() {
  const params = {
    offset: lastUpdateId + 1,
    limit: CONFIG.limit,
    allowed_updates: 'message',
    timeout: 0 // short polling
  };

  GM_xmlhttpRequest({
    method: 'GET',
    url: tgApi('getUpdates', params),
    onload: resp => {
      try {
        const data = JSON.parse(resp.responseText);
        if (data.ok) {
          const messages = [];
          data.result.forEach(update => {
            lastUpdateId = Math.max(lastUpdateId, update.update_id);
            if (update.message && update.message.chat && String(update.message.chat.id) === CONFIG.chatId) {
              messages.push(update.message);
            }
          });
          if (messages.length) renderComments(messages);
        }
      } catch (e) {console.error('TG parse error', e);}    
    },
    onerror: err => console.error('TG fetch error', err)
  });
}

// Render comments matching current hashtag
function renderComments(messages) {
  const box = document.getElementById('cone-comments');
  if (!box) return;

  const relevant = messages.filter(m => m.text && m.text.includes(hashtag));
  if (relevant.length === 0 && box.dataset.initial === '1') return; // nothing new

  if (relevant.length === 0) {
    box.innerHTML = 'Žádné komentáře k tomuto inzerátu zatím nejsou.';
  } else {
    box.innerHTML = relevant.map(m => `<p>🗨️ ${escapeHtml(m.text.replace(hashtag, '').trim())} <small>— @${escapeHtml(m.from.username || m.from.first_name || 'user')}</small></p>`).join('');
  }
  box.dataset.initial = '1';
}

/**
 * INIT
 */
createBox();
fetchUpdates();
setInterval(fetchUpdates, CONFIG.pollInterval);
