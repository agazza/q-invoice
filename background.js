// Service worker: keeps the extension badge in sync with pending payments

function updateBadge() {
  chrome.storage.local.get(['payments'], ({ payments = [] }) => {
    const pending = payments.filter(p => p.status === 'pending').length;
    chrome.action.setBadgeText({ text: pending > 0 ? String(pending) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#d93025' });
  });
}

chrome.storage.onChanged.addListener(updateBadge);
chrome.runtime.onInstalled.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);
