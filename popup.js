// Browser API compatibility layer for Chrome, Firefox, and Safari
const browserAPI = (() => {
  if (typeof browser !== 'undefined') {
    // Firefox/Safari - use native browser API (promise-based)
    return {
      storage: {
        local: {
          get: (keys) => browser.storage.local.get(keys),
          set: (items) => browser.storage.local.set(items)
        }
      },
      tabs: {
        query: (queryInfo) => browser.tabs.query(queryInfo),
        sendMessage: (tabId, message) => browser.tabs.sendMessage(tabId, message)
      }
    };
  } else {
    // Chrome - wrap callback-based API to use promises
    return {
      storage: {
        local: {
          get: (keys) => new Promise((resolve) => {
            chrome.storage.local.get(keys, resolve);
          }),
          set: (items) => new Promise((resolve) => {
            chrome.storage.local.set(items, resolve);
          })
        }
      },
      tabs: {
        query: (queryInfo) => new Promise((resolve) => {
          chrome.tabs.query(queryInfo, resolve);
        }),
        sendMessage: (tabId, message) => new Promise((resolve) => {
          chrome.tabs.sendMessage(tabId, message, resolve);
        })
      }
    };
  }
})();

// DOM elements
const toggle = document.getElementById('canvalier-toggle');
const statusIndicator = document.getElementById('status-indicator');

// Load the current state of the toggle
async function loadToggleState() {
  try {
    const result = await browserAPI.storage.local.get(['canvalierEnabled']);
    const isEnabled = result.canvalierEnabled !== undefined ? result.canvalierEnabled : true;

    toggle.checked = isEnabled;
    updateStatusIndicator(isEnabled);

    console.log('Popup loaded, Canvalier enabled:', isEnabled);
  } catch (error) {
    console.error('Error loading toggle state:', error);
  }
}

// Update the status indicator
function updateStatusIndicator(isEnabled) {
  if (isEnabled) {
    statusIndicator.classList.remove('disabled');
  } else {
    statusIndicator.classList.add('disabled');
  }
}

// Save the toggle state and notify content script
async function saveToggleState(isEnabled) {
  try {
    // Save to storage
    await browserAPI.storage.local.set({ canvalierEnabled: isEnabled });

    console.log('Popup saved, Canvalier enabled:', isEnabled);

    // Update status indicator
    updateStatusIndicator(isEnabled);

    // Notify all Canvas tabs to refresh
    const tabs = await browserAPI.tabs.query({ url: 'https://*.instructure.com/*' });

    for (const tab of tabs) {
      try {
        await browserAPI.tabs.sendMessage(tab.id, {
          type: 'canvalierToggleChanged',
          enabled: isEnabled
        });
      } catch (error) {
        // Tab might not have content script loaded, ignore
        console.log('Could not send message to tab:', tab.id);
      }
    }
  } catch (error) {
    console.error('Error saving toggle state:', error);
  }
}

// Handle toggle change
toggle.addEventListener('change', async (e) => {
  const isEnabled = e.target.checked;
  await saveToggleState(isEnabled);
});

// Listen for storage changes (in case the toggle is changed from content script)
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.canvalierEnabled) {
      const newValue = changes.canvalierEnabled.newValue;
      if (newValue !== undefined && toggle.checked !== newValue) {
        toggle.checked = newValue;
        updateStatusIndicator(newValue);
      }
    }
  });
} else if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.canvalierEnabled) {
      const newValue = changes.canvalierEnabled.newValue;
      if (newValue !== undefined && toggle.checked !== newValue) {
        toggle.checked = newValue;
        updateStatusIndicator(newValue);
      }
    }
  });
}

// Initialize
loadToggleState();
