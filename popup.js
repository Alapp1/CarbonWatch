'use strict';

// Maps rating to CSS colors
const RATING_COLORS = {
  A: 'var(--rating-a)',
  B: 'var(--rating-b)',
  C: 'var(--rating-c)',
  D: 'var(--rating-d)',
  E: 'var(--rating-e)',
  F: 'var(--rating-f)',
};

// Format CO2 to proper units
function formatCO2(grams) {
  if (grams === null || grams === undefined) return '—';
  if (grams >= 1000)  return `${(grams / 1000).toFixed(2)} kg`;
  if (grams >= 1)     return `${grams.toFixed(3)} g`;
  return `${(grams * 1000).toFixed(1)} mg`;
}

// Format size of page to proper units
function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / 1048576).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// Get reference to element ID
const $ = id => document.getElementById(id);

// Render the current page
function renderCurrent(entry, tab) {
  const isWebPage = tab?.url?.startsWith('http');
  
  // If not in website, display placeholder null values
  if (!isWebPage) {
    $('domain').textContent      = 'no web page active';
    $('status').textContent      = '—';
    $('status').className        = 'status-pill';
    $('co2').textContent         = '—';
    $('rating').textContent      = '—';
    $('rating').className        = 'rating-badge';
    $('rating').style.color      = '';
    $('green-dot').className     = 'dot';
    $('hosting-label').textContent = '';
    $('cleaner-fill').style.width  = '0%';
    $('cleaner-label').textContent = '';
    $('bytes-label').textContent   = '';
    return;
  }
  
  // Otherwise we are in a website, get the hostname and domain
  const hostname = new URL(tab.url).hostname;
  $('domain').textContent = hostname;
  
  if (!entry) {
    $('status').textContent  = 'scanning…';
    $('status').className    = 'status-pill scanning';
    $('co2').textContent     = '—';
    $('rating').textContent  = '—';
    $('rating').className    = 'rating-badge';
    $('rating').style.color  = '';
    $('green-dot').className = 'dot';
    $('hosting-label').textContent = 'awaiting scan';
    $('cleaner-fill').style.width  = '0%';
    $('cleaner-label').textContent = '';
    $('bytes-label').textContent   = '';
    return;
  }

  // Status pill
  $('status').textContent = 'tracked';
  $('status').className   = 'status-pill tracked';

  // CO2
  $('co2').textContent = formatCO2(entry.gco2e);

  // Rating badge
  const color = RATING_COLORS[entry.rating] || 'var(--text-muted)';
  $('rating').textContent   = entry.rating ?? '—';
  $('rating').className     = 'rating-badge' + (entry.rating ? ' has-data' : '');
  $('rating').style.color   = color;

  // Green dot and hosting
  $('green-dot').className     = 'dot ' + (entry.green ? 'is-green' : 'is-grey');
  $('hosting-label').textContent = entry.green
    ? `green hosted${entry.hostedBy ? ' · ' + entry.hostedBy : ''}`
    : 'standard hosting';

  // Cleaner-than bar
  const pct = Math.round((entry.cleanerThan ?? 0) * 100);
  $('cleaner-fill').style.width  = `${pct}%`;
  $('cleaner-label').textContent = `cleaner than ${pct}% of pages`;

  // Bytes section
  $('bytes-label').textContent = formatBytes(entry.bytes)
    ? `${formatBytes(entry.bytes)} transferred`
    : '';
}

// Render totals strip 
function renderTotals(history) {
  const count     = history.length;
  const totalCO2  = history.reduce((sum, e) => sum + (e.gco2e ?? 0), 0);
  const greenCount = history.filter(e => e.green).length;

  $('total-co2').textContent  = count ? formatCO2(totalCO2) : '—';
  $('total-pages').textContent = count;
  $('green-pct').textContent  = count
    ? `${Math.round(greenCount / count * 100)}%`
    : '—';
}

// Render history list 
function renderHistory(entries) {
  const list = $('history-list');

  if (!entries.length) {
    list.innerHTML = '<div class="empty">no history yet — browse a page!</div>';
    return;
  }

  list.innerHTML = entries.map(e => {
    const color = RATING_COLORS[e.rating] || 'var(--text-muted)';
    return `
      <div class="history-item" title="${e.url}">
        <div class="h-left">
          <span class="h-dot ${e.green ? 'is-green' : 'is-grey'}"></span>
          <span class="h-domain">${e.domain}</span>
        </div>
        <div class="h-right">
          <span class="h-rating" style="color:${color}">${e.rating ?? '—'}</span>
          <span class="h-co2">${formatCO2(e.gco2e)}</span>
        </div>
      </div>
    `;
  }).join('');
}

// Main Render Functoin
async function render() {
  const [tab]          = await chrome.tabs.query({ active: true, currentWindow: true });
  const { history = [] } = await chrome.storage.local.get('history');

  // Find most recent entry for current domain
  let currentEntry = null;
  if (tab?.url?.startsWith('http')) {
    const hostname = new URL(tab.url).hostname;
    currentEntry   = history.find(e => e.domain === hostname) ?? null;
  }

  renderCurrent(currentEntry, tab);
  renderTotals(history);
  renderHistory(history.slice(0, 8));
}

// Clear button - deletes local history and re-renders
$('clear-btn').addEventListener('click', async () => {
  if (!confirm('Clear all CarbonWatch history?')) return;
  await chrome.storage.local.set({ history: [] });
  render();
});

// On every new entry, re-render the extension
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'NEW_ENTRY') render();
});

// Initialize the extension once
render();
