const GREENCHECK_API = 'https://api.thegreenwebfoundation.org/api/v3/greencheck';
const CARBON_API     = 'https://api.websitecarbon.com/data';
const MAX_HISTORY    = 500;
const SETTLE_MS      = 2500; // delay for loading resources

// Sums transferSize across navigation and all resource entries.
// Falls back to encodedBodySize for entries listing 0 bytes
function measureBytes() {
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    let total = 0;

    if (nav) {
      total += nav.transferSize > 0
        ? nav.transferSize
        : (nav.encodedBodySize || 0);
    }

    for (const r of resources) {
      total += r.transferSize > 0
        ? r.transferSize
        : (r.encodedBodySize || 0);
    }

    return total;
  } catch {
    return 0;
  }
}

// Main listener, runs every time a new webpage is navigated to
chrome.webNavigation.onCompleted.addListener(async (details) => {
  // Ignore sub-frames and non-HTTP pages (chrome://, file://, etc.)
  if (details.frameId !== 0) return;
  if (!details.url.startsWith('http')) return;

  // Small delay to let resources finish registering
  await new Promise(r => setTimeout(r, SETTLE_MS));

  // Measures bytes sent with webpage
  let bytes = 0;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: details.tabId, allFrames: false },
      func: measureBytes,
    });
    bytes = result?.result ?? 0;
  } catch {
    // Return if tab was closed
    return;
  }

  if (!bytes) return;

  // Get hostname, just return on error
  let hostname;
  try {
    hostname = new URL(details.url).hostname;
  } catch {
    return;
  }

  // Get green hosting status
  let isGreen  = false;
  let hostedBy = null;
  try {
    const res = await fetch(`${GREENCHECK_API}/${hostname}`);
    if (res.ok) {
      const data = await res.json();
      isGreen  = data.green === true;
      hostedBy = data.hosted_by || null;
    }
  } catch {
    // Green check API failed, we'll just keep the isGreen flag false
  }

  // Calculate carbon emission
  let gco2e = null, rating = null, cleanerThan = null;
  try {
    const res = await fetch(
      `${CARBON_API}?bytes=${bytes}&green=${isGreen ? 1 : 0}`
    );
    if (res.ok) {
      // Fields all sent by the API
      const data = await res.json();
      gco2e      = data.gco2e;
      rating     = data.rating;
      cleanerThan = data.cleanerThan;
    }
  } catch {
    return;
  }

  if (gco2e === null) return;

  // Persist to local storage, no data ever stored server side
  const entry = {
    domain: hostname,
    url: details.url,
    timestamp: Date.now(),
    bytes,
    green: isGreen,
    hostedBy,
    gco2e,
    rating,
    cleanerThan,
  };

  try {
    const stored  = await chrome.storage.local.get('history');
    const history = stored.history || [];
    history.unshift(entry);
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    await chrome.storage.local.set({ history });
  } catch (err) {
    // 10 MB storage, should have ~33,000 pages before we run into any errors
    console.error('CarbonWatch: storage write failed', err);
    return;
  }

  // If popup is already open, update with new entry
  chrome.runtime.sendMessage({ type: 'NEW_ENTRY', entry }).catch(() => {});
});
