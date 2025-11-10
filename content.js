// Canvas LMS Assignment Summary Extension
console.log(`🎓 [${new Date().toISOString().slice(11, 23)}] Canvas Assignment Summary Extension: Script loaded`);

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
      runtime: {
        getURL: (path) => browser.runtime.getURL(path),
        lastError: browser.runtime.lastError
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
      runtime: {
        getURL: (path) => chrome.runtime.getURL(path),
        get lastError() {
          return chrome.runtime.lastError;
        }
      }
    };
  }
})();

// IMMEDIATELY apply dark mode class ASAP to prevent white flash on page load
// This runs before settings load, so we check the setting from storage directly
// The dark-mode.css file is already loaded by manifest.json, we just activate it with a class
(async function() {
  const result = await browserAPI.storage.local.get(['darkMode']);
  if (result.darkMode === true) {
    console.log('🌙 Applying dark mode class immediately...');
    // Add the class to html element to activate dark mode CSS
    document.documentElement.classList.add('canvalier-dark-mode');
    console.log('✅ Dark mode class applied immediately');
  }
})();

// IMMEDIATELY start checking for banner to hide it ASAP (before anything else loads)
// This runs before settings load, so we check the setting from storage directly
(async function() {
  const result = await browserAPI.storage.local.get(['canvalierEnabled', 'hideDashboardHeader']);
  // Only hide if Canvalier is enabled (or undefined, meaning first run)
  if ((result.canvalierEnabled === undefined || result.canvalierEnabled === true) && result.hideDashboardHeader === true) {
      console.log('🚀 Starting immediate banner hiding...');

      const hideCarouselBanner = () => {
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
          const src = iframe.src || '';
          if (src.includes('carousel')) {
            const containerDiv = iframe.parentElement;
            if (containerDiv) {
              containerDiv.style.display = 'none';
              console.log('⚡ Banner hidden immediately');
              return true;
            }
          }
        }
        return false;
      };

      // Try immediately
      if (hideCarouselBanner()) {
        return; // Found and hidden, we're done
      }

      // Not found yet, use MutationObserver to watch for it efficiently
      const observer = new MutationObserver(() => {
        if (hideCarouselBanner()) {
          observer.disconnect(); // Stop observing once found
        }
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });

      // Safety timeout to stop observing after 3 seconds
      setTimeout(() => {
        observer.disconnect();
      }, 3000);
    }
})();

// IMMEDIATELY apply custom images ASAP (before main init)
// This prevents flashing of default images
(async function() {
  const result = await browserAPI.storage.local.get(['canvalierEnabled', 'customImages', 'imageOpacityPerCourse', 'imageOpacity']);
  // Only apply if Canvalier is enabled (or undefined, meaning first run)
  if ((result.canvalierEnabled === undefined || result.canvalierEnabled === true) && result.customImages && Object.keys(result.customImages).length > 0) {
      console.log('🚀 Starting immediate custom image application...');

      const applyImages = () => {
        const cards = document.querySelectorAll('.ic-DashboardCard');
        let appliedCount = 0;
        const imageOpacityPerCourse = result.imageOpacityPerCourse || {};

        cards.forEach(card => {
          const courseLink = card.querySelector('a[href*="/courses/"]');
          if (!courseLink) return;

          const match = courseLink.href.match(/\/courses\/(\d+)/);
          if (!match) return;

          const courseId = match[1];
          const header = card.querySelector('.ic-DashboardCard__header');
          if (!header) return;

          const customImageUrl = result.customImages[courseId];
          if (customImageUrl) {
            // Get opacity for THIS specific course (not global)
            const courseOpacity = imageOpacityPerCourse[courseId] !== undefined ? imageOpacityPerCourse[courseId] : 70;
            const opacity = courseOpacity / 100;

            // Get or create the image element
            let imageDiv = header.querySelector('.canvalier-custom-image');
            if (!imageDiv) {
              imageDiv = document.createElement('div');
              imageDiv.className = 'canvalier-custom-image';
              // Insert as first child so it appears behind everything
              header.insertBefore(imageDiv, header.firstChild);
            }

            // Get the hero overlay element to adjust its opacity
            const hero = card.querySelector('.ic-DashboardCard__header_hero');

            // Save original hero opacity and color if this is the first time
            if (hero && !hero.getAttribute('data-canvalier-original-opacity')) {
              const originalOpacity = window.getComputedStyle(hero).opacity;
              hero.setAttribute('data-canvalier-original-opacity', originalOpacity);

              // Also save original background color for reset functionality
              const originalColor = window.getComputedStyle(hero).backgroundColor;
              hero.setAttribute('data-canvalier-original-color', originalColor);
            }

            // Set the background image on our custom image div
            imageDiv.style.backgroundImage = `url('${customImageUrl}')`;

            // Adjust the hero overlay opacity based on per-course setting
            if (hero) {
              hero.style.opacity = String(opacity);
            }

            header.setAttribute('data-canvalier-image-applied', customImageUrl);
            header.setAttribute('data-canvalier-current-opacity', String(opacity));
            appliedCount++;
          }
        });

        return appliedCount > 0;
      };

      // Try immediately - just once, then let main init handle updates
      if (applyImages()) {
        console.log('⚡ Custom images applied immediately');
      }

      // Use a more targeted observer that only watches for the dashboard cards container
      // This prevents excessive re-applying
      const dashboardContainer = document.querySelector('#dashboard-planner, #dashboard, #application');
      if (dashboardContainer) {
        let debounceTimer;
        const observer = new MutationObserver(() => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            const cards = document.querySelectorAll('.ic-DashboardCard');
            if (cards.length > 0) {
              applyImages();
            }
          }, 200); // Debounce to prevent rapid re-applies
        });

        observer.observe(dashboardContainer, {
          childList: true,
          subtree: false // Only watch direct children, not deep changes
        });

        // Stop observing after 3 seconds (main init will take over)
        setTimeout(() => {
          observer.disconnect();
        }, 3000);
      }
    }
})();

// Cache for assignment data to avoid re-fetching
const assignmentCache = new Map();

// Cache for pending fetch promises to prevent duplicate concurrent requests
const pendingFetches = new Map();

// Cache version - increment this when API query changes to invalidate old cache
const CACHE_VERSION = 2;

// Track if we're currently in initial load
let isInitialLoading = false;

// Track if options box observer has been set up (wrapped in object for module access)
const optionsBoxObserverSetup = { value: false };

// Note: optionsPanel is already loaded from modules/options-panel.js
// (declared first in manifest.json, executes before this file)

// Extension settings
const extensionSettings = {
  canvalierEnabled: true, // Default to extension being enabled
  darkMode: false, // Default to dark mode being off
  use24HourFormat: false, // Default to 12-hour format
  showOverdue: true, // Default to showing overdue assignments
  showTimeRemaining: false, // Default to showing due date instead of time remaining
  assignmentRangeWeeks: 2, // Default to showing assignments due within 2 weeks (1-10 weeks, or 11 for "show all")
  minimizedCardCount: 5, // Default to showing 5 cards before "show more" (1-10 cards, or 11 for "expand all")
  hideCanvasToDo: false, // Default to showing Canvas ToDo list
  hideDashboardHeader: false, // Default to showing dashboard header/banner
  hideRecentFeedback: false, // Default to showing Recent Feedback column
  hideComingUp: false, // Default to showing Coming Up section
  customImages: {}, // Store custom image URLs per course: { "courseId": "imageUrl" }
  imageOpacity: 70, // DEPRECATED - kept for migration, use imageOpacityPerCourse instead
  imageOpacityPerCourse: {}, // Store opacity per course: { "courseId": opacity (0-100) }
  markedDone: {} // Store marked-done assignments: { "courseId_assignmentId": { markedAt, dueDate } }
};

// Load settings from browser storage
async function loadSettings() {
  const result = await browserAPI.storage.local.get(['canvalierEnabled', 'darkMode', 'use24HourFormat', 'showOverdue', 'showTimeRemaining', 'assignmentRangeWeeks', 'minimizedCardCount', 'hideCanvasToDo', 'hideDashboardHeader', 'hideRecentFeedback', 'hideComingUp', 'customImages', 'imageOpacityPerCourse', 'markedDone']);

  if (result.canvalierEnabled !== undefined) {
    extensionSettings.canvalierEnabled = result.canvalierEnabled;
  }
  if (result.darkMode !== undefined) {
    extensionSettings.darkMode = result.darkMode;
  }
  if (result.use24HourFormat !== undefined) {
    extensionSettings.use24HourFormat = result.use24HourFormat;
  }
  if (result.showOverdue !== undefined) {
    extensionSettings.showOverdue = result.showOverdue;
  }
  if (result.showTimeRemaining !== undefined) {
    extensionSettings.showTimeRemaining = result.showTimeRemaining;
  }
  if (result.assignmentRangeWeeks !== undefined) {
    extensionSettings.assignmentRangeWeeks = result.assignmentRangeWeeks;
  }
  if (result.minimizedCardCount !== undefined) {
    extensionSettings.minimizedCardCount = result.minimizedCardCount;
  }
  if (result.hideCanvasToDo !== undefined) {
    extensionSettings.hideCanvasToDo = result.hideCanvasToDo;
  }
  if (result.hideDashboardHeader !== undefined) {
    extensionSettings.hideDashboardHeader = result.hideDashboardHeader;
  }
  if (result.hideRecentFeedback !== undefined) {
    extensionSettings.hideRecentFeedback = result.hideRecentFeedback;
  }
  if (result.hideComingUp !== undefined) {
    extensionSettings.hideComingUp = result.hideComingUp;
  }
  if (result.customImages !== undefined) {
    extensionSettings.customImages = result.customImages;
    console.log('📥 [CUSTOM-IMAGES DEBUG] Loaded custom images from storage:', {
      count: Object.keys(result.customImages).length,
      images: result.customImages
    });
  }
  if (result.imageOpacityPerCourse !== undefined) {
    extensionSettings.imageOpacityPerCourse = result.imageOpacityPerCourse;
    console.log('📥 [OPACITY DEBUG] Loaded per-course opacities from storage:', {
      count: Object.keys(result.imageOpacityPerCourse).length,
      opacities: result.imageOpacityPerCourse
    });
  }
  if (result.markedDone !== undefined) {
    extensionSettings.markedDone = result.markedDone;
    console.log('📥 [MARK-AS-DONE DEBUG] Loaded marked-done from storage:', {
      count: Object.keys(result.markedDone).length,
      assignments: result.markedDone
    });
  }
  log('📥', `Settings loaded:`, extensionSettings);
}

// Save settings to browser storage
async function saveSetting(key, value) {
  extensionSettings[key] = value;

  console.log('💾 [SAVE DEBUG] About to save to browser storage:', {
    key,
    value: (key === 'markedDone' || key === 'customImages') ? value : '[other setting]',
    valueType: typeof value,
    stringified: (key === 'markedDone' || key === 'customImages') ? JSON.stringify(value) : '[other setting]'
  });

  try {
    await browserAPI.storage.local.set({ [key]: value });

    if (browserAPI.runtime.lastError) {
      console.error('❌ [SAVE DEBUG] Error saving to storage:', browserAPI.runtime.lastError);
    } else {
      console.log('✅ [SAVE DEBUG] Successfully saved to browser storage:', {
        key,
        valueKeys: (key === 'markedDone' || key === 'customImages') ? Object.keys(value) : '[other setting]'
      });

      // Verify the save by reading it back immediately
      const result = await browserAPI.storage.local.get([key]);
      console.log('🔍 [SAVE DEBUG] Verified saved value:', {
        key,
        savedValue: (key === 'markedDone' || key === 'customImages') ? result[key] : '[other setting]',
        matches: JSON.stringify(result[key]) === JSON.stringify(value)
      });
    }
    log('💾', `Setting saved: ${key}`);
  } catch (error) {
    console.error('❌ [SAVE DEBUG] Error saving to storage:', error);
  }
}

// Get opacity for a specific course (with fallback to default 70)
// Custom Images functions (delegate to module)
function getOpacityForCourse(courseId) {
  return customImages.getOpacityForCourse(courseId);
}

// Assignment functions (delegate to module)
function toggleMarkedDone(courseId, assignmentId, dueDate) {
  assignmentManager.toggleMarkedDone(courseId, assignmentId, dueDate);
}

function isMarkedDone(courseId, assignmentId) {
  return assignmentManager.isMarkedDone(courseId, assignmentId);
}

async function cleanupMarkedDone() {
  return assignmentManager.cleanupMarkedDone();
}

// Helper to log with timestamp
function log(emoji, message) {
  const timestamp = new Date().toISOString().slice(11, 23);
  console.log(`${emoji} [${timestamp}] ${message}`);
}

// Wait for the dashboard to load
function waitForDashboard() {
  return new Promise((resolve) => {
    log('🔍', 'Checking for course cards...');
    if (document.querySelector('.ic-DashboardCard')) {
      log('✅', 'Course cards found immediately');
      resolve();
    } else {
      log('⏳', 'Waiting for course cards to load...');
      const observer = new MutationObserver((mutations, obs) => {
        if (document.querySelector('.ic-DashboardCard')) {
          log('✅', 'Course cards detected');
          obs.disconnect();
          resolve();
        }
      });

      // At document_start, body might not exist yet, so use documentElement
      const targetNode = document.body || document.documentElement;
      observer.observe(targetNode, {
        childList: true,
        subtree: true
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        console.warn('⚠️ Timeout waiting for course cards - they may not exist on this page');
        observer.disconnect();
        resolve();
      }, 10000);
    }
  });
}

// Wait for Canvas to finish re-rendering (DOM stabilization)
function waitForDOMStable() {
  return new Promise((resolve) => {
    console.log('⏳ Waiting for Canvas DOM to stabilize...');
    let debounceTimer;
    let mutationCount = 0;

    const observer = new MutationObserver((mutations) => {
      mutationCount++;
      clearTimeout(debounceTimer);

      // Wait for 300ms of no DOM changes
      debounceTimer = setTimeout(() => {
        console.log(`✅ DOM stable after ${mutationCount} mutations`);
        observer.disconnect();
        resolve();
      }, 300);
    });

    // Watch the dashboard for changes
    const dashboardContainer = document.querySelector('#dashboard, #application, body');
    if (dashboardContainer) {
      observer.observe(dashboardContainer, {
        childList: true,
        subtree: true,
        attributes: false
      });
    }

    // Fallback timeout - if no mutations happen, resolve after 500ms
    setTimeout(() => {
      if (mutationCount === 0) {
        console.log('✅ No mutations detected, proceeding');
        observer.disconnect();
        resolve();
      }
    }, 500);

    // Maximum wait time - 3 seconds
    setTimeout(() => {
      console.log(`⚠️ Max wait time reached after ${mutationCount} mutations`);
      observer.disconnect();
      resolve();
    }, 3000);
  });
}

// Extract course ID from card
function getCourseId(card) {
  const link = card.querySelector('a[href*="/courses/"]');
  if (link) {
    const match = link.href.match(/\/courses\/(\d+)/);
    return match ? match[1] : null;
  }
  return null;
}

// Color utility functions for title color syncing
// Color utility functions (delegate to custom images module)
function parseRgbColor(rgbString) {
  return customImages.parseRgbColor(rgbString);
}

function rgbToHsl(r, g, b) {
  return customImages.rgbToHsl(r, g, b);
}

function hslToRgb(h, s, l) {
  return customImages.hslToRgb(h, s, l);
}

function brightenColor(rgbString, brightnessFactor = 1.5) {
  return customImages.brightenColor(rgbString, brightnessFactor);
}

function applyTitleColorFromOverlay(card) {
  customImages.applyTitleColorFromOverlay(card);
}

async function fetchAssignments(courseId) {
  return assignmentManager.fetchAssignments(courseId);
}

function getUpcomingAssignments(assignments) {
  return assignmentManager.getUpcomingAssignments(assignments);
}

function getTimeRemaining(dateString) {
  return assignmentManager.getTimeRemaining(dateString);
}

function formatDueDate(dateString) {
  return assignmentManager.formatDueDate(dateString);
}

function createSummaryElement(assignments, courseId, shouldStartExpanded = false) {
  return assignmentManager.createSummaryElement(assignments, courseId, shouldStartExpanded);
}

function insertLoadingPlaceholders() {
  assignmentManager.insertLoadingPlaceholders();
}

async function addSummaryToCard(card) {
  return assignmentManager.addSummaryToCard(card);
}

async function prefetchAllAssignments() {
  return assignmentManager.prefetchAllAssignments();
}

async function processCourseCards() {
  return assignmentManager.processCourseCards();
}

// Apply Canvas ToDo list visibility based on setting
function applyCanvasToDoVisibility() {
  const todoContainer = document.querySelector('.Sidebar__TodoListContainer');
  if (todoContainer) {
    if (extensionSettings.hideCanvasToDo) {
      todoContainer.style.display = 'none';
      log('👁️', 'Canvas To Do list hidden');
    } else {
      todoContainer.style.display = '';
      log('👁️', 'Canvas To Do list shown');
    }
  }
}

// Apply Recent Feedback column visibility based on setting
function applyRecentFeedbackVisibility() {
  const recentFeedbackColumn = document.querySelector('.events_list.recent_feedback');
  if (recentFeedbackColumn) {
    if (extensionSettings.hideRecentFeedback) {
      recentFeedbackColumn.style.display = 'none';
      log('👁️', 'Recent Feedback column hidden');
    } else {
      recentFeedbackColumn.style.display = '';
      log('👁️', 'Recent Feedback column shown');
    }
  }
}

// Apply Coming Up section visibility based on setting
function applyComingUpVisibility() {
  const comingUpSection = document.querySelector('#right-side > div.events_list.coming_up');
  if (comingUpSection) {
    if (extensionSettings.hideComingUp) {
      comingUpSection.style.display = 'none';
      log('👁️', 'Coming Up section hidden');
    } else {
      comingUpSection.style.display = '';
      log('👁️', 'Coming Up section shown');
    }
  }
}

// Apply dashboard banner (carousel) visibility based on setting
function applyDashboardHeaderVisibility() {
  // Simple function to find carousel iframe and hide its parent div
  const findAndToggleBanner = () => {
    // Find any iframe with 'carousel' in the src
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      const src = iframe.src || '';
      if (src.includes('carousel')) {
        // Found it! Hide/show the parent div
        const containerDiv = iframe.parentElement;
        if (containerDiv) {
          if (extensionSettings.hideDashboardHeader) {
            containerDiv.style.display = 'none';
            log('👁️', 'Carousel container hidden');
          } else {
            containerDiv.style.display = '';
            log('👁️', 'Carousel container shown');
          }
          console.log('🎯 Found carousel iframe, toggled parent div');
          return true;
        }
      }
    }
    return false; // Not found
  };

  // Try immediately
  if (findAndToggleBanner()) {
    console.log('✅ Banner found and toggled immediately');
    return;
  }

  // If not found and we want to hide it, poll every frame using requestAnimationFrame
  if (extensionSettings.hideDashboardHeader) {
    console.log('🔍 Banner not found yet, checking every frame...');
    let frameCount = 0;
    const maxFrames = 180; // ~3 seconds at 60fps

    const checkEveryFrame = () => {
      frameCount++;
      if (findAndToggleBanner()) {
        console.log(`✅ Banner found and hidden after ${frameCount} frames`);
        return; // Stop checking
      }
      if (frameCount < maxFrames) {
        requestAnimationFrame(checkEveryFrame);
      } else {
        console.warn('⚠️ Carousel banner not found after checking frames');
      }
    };

    requestAnimationFrame(checkEveryFrame);
  }
}

// Apply custom images to course cards
function applyCustomImages() {
  customImages.applyCustomImages();
}

// Watch for color changes via Canvas's color picker and maintain opacity
function setupColorChangeObserver() {
  customImages.setupColorChangeObserver();
}

function enhanceColorTab(popover, courseId) {
  customImages.enhanceColorTab(popover, courseId);
}

function injectCustomImageTab(popover, courseId) {
  customImages.injectCustomImageTab(popover, courseId);
}

function setupCustomImageTabObserver() {
  customImages.setupCustomImageTabObserver();
}

// Options Panel functions (delegate to module)
// These are thin wrappers that call into the dynamically loaded module

function insertOptionsBox() {
  if (optionsPanel) {
    optionsPanel.insertOptionsBox();
  } else {
    console.error('Options panel module not loaded');
  }
}

function setupOptionsBoxObserver() {
  if (optionsPanel) {
    optionsPanel.setupOptionsBoxObserver();
  } else {
    console.error('Options panel module not loaded');
  }
}

// Monitor for Canvas re-renders and re-insert summaries
function setupPersistenceObserver() {
  log('🔄', 'Setting up persistence observer...');

  // Much faster response during initial load - no debounce
  let debounceTimer;
  let lastImageApplyTime = 0;
  const observer = new MutationObserver((mutations) => {
    clearTimeout(debounceTimer);

    // During initial load, respond immediately with no debounce for instant re-insertion
    const debounceTime = isInitialLoading ? 0 : 100;

    debounceTimer = setTimeout(() => {
      // Only reinsert if Canvalier is enabled
      if (!extensionSettings.canvalierEnabled) {
        return;
      }

      // Check if any course cards are missing summaries
      const cards = document.querySelectorAll('.ic-DashboardCard');
      let reinserted = 0;

      cards.forEach(card => {
        if (!card.querySelector('.canvas-summary-container')) {
          if (isInitialLoading) {
            // During initial load, just re-insert loading placeholder
            log('🔧', 'Re-inserting loading placeholder during initial load');
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'canvas-summary-container canvas-summary-loading';
            loadingDiv.innerHTML = '<div class="loading-spinner">Loading assignments...</div>';

            const cardHeader = card.querySelector('.ic-DashboardCard__header');
            const insertionPoint = cardHeader || card.querySelector('.ic-DashboardCard__header_hero');
            if (insertionPoint) {
              insertionPoint.insertAdjacentElement('afterend', loadingDiv);
            }
          } else {
            // After initial load, fetch and insert actual data
            log('🔧', 'Re-inserting summary for card that was re-rendered');
            addSummaryToCard(card);
          }
          reinserted++;
        }
      });

      if (reinserted > 0) {
        log('♻️', `Re-inserted ${reinserted} ${isInitialLoading ? 'loading placeholders' : 'summaries'}`);
      }

      // Reapply custom images, but throttle to max once per 300ms to prevent flashing
      const now = Date.now();
      if (now - lastImageApplyTime > 300) {
        applyCustomImages();
        lastImageApplyTime = now;
      }
    }, debounceTime);
  });

  // Watch the dashboard container for changes
  const dashboardContainer = document.querySelector('#dashboard-planner, #dashboard, #application, body');
  if (dashboardContainer) {
    observer.observe(dashboardContainer, {
      childList: true,
      subtree: true,
      attributes: false
    });
    log('✅', 'Persistence observer active');
  } else {
    console.warn('⚠️ Could not find dashboard container for observer');
  }

  // Ultra-aggressive frame-based checking during initial load using requestAnimationFrame
  // This runs every ~16ms (60fps) to catch Canvas re-renders within a single frame
  let rafId;
  let hasInsertedInitial = false;
  const checkForMissingPlaceholders = () => {
    if (!isInitialLoading) {
      return; // Stop the loop
    }

    // Only insert placeholders if Canvalier is enabled
    if (extensionSettings.canvalierEnabled) {
      const cards = document.querySelectorAll('.ic-DashboardCard');

      cards.forEach(card => {
        if (!card.querySelector('.canvas-summary-container')) {
          if (!hasInsertedInitial) {
            log('⚡', 'Inserting loading placeholders after Canvas stabilized');
            hasInsertedInitial = true;
          }

          const loadingDiv = document.createElement('div');
          loadingDiv.className = 'canvas-summary-container canvas-summary-loading';
          loadingDiv.innerHTML = '<div class="loading-spinner">Loading assignments...</div>';

          const cardHeader = card.querySelector('.ic-DashboardCard__header');
          const insertionPoint = cardHeader || card.querySelector('.ic-DashboardCard__header_hero');
          if (insertionPoint) {
            insertionPoint.insertAdjacentElement('afterend', loadingDiv);
          }
        }
      });
    }

    // Always insert options box if it doesn't exist (needed for toggle control)
    if (!document.getElementById('canvas-extension-options')) {
      insertOptionsBox();
    }

    // Continue checking every frame
    rafId = requestAnimationFrame(checkForMissingPlaceholders);
  };

  // Start the frame-based check loop
  rafId = requestAnimationFrame(checkForMissingPlaceholders);

  // Regular polling for after initial load
  setInterval(() => {
    if (isInitialLoading) {
      return;
    }

    // Only reinsert summaries if Canvalier is enabled
    if (extensionSettings.canvalierEnabled) {
      const cards = document.querySelectorAll('.ic-DashboardCard');
      const summaries = document.querySelectorAll('.canvas-summary-container');

      if (cards.length > 0 && summaries.length === 0) {
        log('🔔', 'POLLING: Summaries missing! Re-inserting...');
        cards.forEach(card => {
          if (!card.querySelector('.canvas-summary-container')) {
            addSummaryToCard(card);
          }
        });
      }
    }

    // Always check if options box is missing (needed for toggle control)
    if (!document.getElementById('canvas-extension-options')) {
      log('🔔', 'POLLING: Options box missing! Re-inserting...');
      insertOptionsBox();
    }
  }, 2000);
}

// Dark mode functions (delegate to module)
function applyDarkMode() {
  darkMode.applyDarkMode();
}

function removeDarkMode() {
  darkMode.removeDarkMode();
}

// Disable all Canvalier effects (restore Canvas to normal state)
function disableCanvalierEffects() {
  log('🛑', 'Disabling Canvalier effects...');

  // Remove all assignment summary containers
  const summaryContainers = document.querySelectorAll('.canvas-summary-container');
  summaryContainers.forEach(container => container.remove());
  log('🗑️', `Removed ${summaryContainers.length} assignment summary containers`);

  // Remove all assignment summaries (backup, in case containers are missing)
  const summaries = document.querySelectorAll('.assignment-summary');
  summaries.forEach(summary => summary.remove());
  log('🗑️', `Removed ${summaries.length} assignment summaries`);

  // Remove all loading placeholders
  const placeholders = document.querySelectorAll('.assignment-summary-loading');
  placeholders.forEach(placeholder => placeholder.remove());
  log('🗑️', `Removed ${placeholders.length} loading placeholders`);

  // Remove custom image tabs from all hamburger menus
  const customImageTabs = document.querySelectorAll('.canvalier-custom-image-tab');
  customImageTabs.forEach(tab => {
    // Also remove the associated panel
    const panelId = tab.getAttribute('aria-controls');
    if (panelId) {
      const panel = document.getElementById(panelId);
      if (panel) {
        panel.remove();
      }
    }
    tab.remove();
  });
  log('🗑️', `Removed ${customImageTabs.length} custom image tabs`);

  // Remove color tab enhancements from all hamburger menus
  const colorEnhancements = document.querySelectorAll('.canvalier-color-enhancements');
  colorEnhancements.forEach(enhancement => enhancement.remove());
  log('🗑️', `Removed ${colorEnhancements.length} color tab enhancements`);

  // Restore Canvas To Do list
  const todoContainer = document.querySelector('.Sidebar__TodoListContainer');
  if (todoContainer) {
    todoContainer.style.display = '';
    log('👁️', 'Canvas To Do list restored');
  }

  // Restore Recent Feedback column
  const recentFeedbackColumn = document.querySelector('.events_list.recent_feedback');
  if (recentFeedbackColumn) {
    recentFeedbackColumn.style.display = '';
    log('👁️', 'Recent Feedback column restored');
  }

  // Restore Coming Up section
  const comingUpSection = document.querySelector('#right-side > div.events_list.coming_up');
  if (comingUpSection) {
    comingUpSection.style.display = '';
    log('👁️', 'Coming Up section restored');
  }

  // Restore dashboard banner/carousel
  const iframes = document.querySelectorAll('iframe');
  for (const iframe of iframes) {
    const src = iframe.src || '';
    if (src.includes('carousel')) {
      const containerDiv = iframe.parentElement;
      if (containerDiv) {
        containerDiv.style.display = '';
        log('👁️', 'Dashboard banner restored');
      }
    }
  }

  // Restore original images and colors on course cards
  const cards = document.querySelectorAll('.ic-DashboardCard');
  let removedImages = 0;
  cards.forEach(card => {
    const header = card.querySelector('.ic-DashboardCard__header');
    const overlay = card.querySelector('.ic-DashboardCard__header_hero');

    // Remove custom image div
    if (header) {
      const imageDiv = header.querySelector('.canvalier-custom-image');
      if (imageDiv) {
        imageDiv.remove();
        removedImages++;
      }

      header.removeAttribute('data-canvalier-image-applied');
      header.removeAttribute('data-canvalier-current-opacity');
    }

    // Restore original opacity and color
    if (overlay) {
      const originalOpacity = overlay.getAttribute('data-canvalier-original-opacity');
      const originalColor = overlay.getAttribute('data-canvalier-original-color');

      if (originalOpacity) {
        overlay.style.opacity = originalOpacity;
        overlay.removeAttribute('data-canvalier-original-opacity');
      }

      if (originalColor) {
        overlay.style.backgroundColor = originalColor;
        overlay.removeAttribute('data-canvalier-original-color');
      }
    }
  });

  if (removedImages > 0) {
    log('🖼️', `Removed ${removedImages} custom image elements and restored original state`);
  }

  // Remove dark mode
  removeDarkMode();

  log('✅', 'All Canvalier effects disabled');
}

// Enable all Canvalier effects (apply based on settings)
async function enableCanvalierEffects() {
  log('🚀', 'Enabling Canvalier effects...');

  // Reapply dark mode if it was enabled (since disableCanvalierEffects removes it)
  if (extensionSettings.darkMode) {
    applyDarkMode();
  } else {
    removeDarkMode();
  }

  // Apply all UI changes
  applyCanvasToDoVisibility();
  applyRecentFeedbackVisibility();
  applyComingUpVisibility();
  applyDashboardHeaderVisibility();
  applyCustomImages();

  // Reprocess all course cards to add assignment summaries
  await processCourseCards();

  log('✅', 'All Canvalier effects enabled');
}

// Initialize extension
async function init() {
  log('🚀', 'Initializing Canvas Assignment Summary Extension...');
  log('📍', `Current URL: ${window.location.href}`);
  log('📂', `Pathname: ${window.location.pathname}`);

  try {
    // Load settings first (needed for both dark mode and dashboard features)
    await loadSettings();

    // Initialize modules with dependencies
    // optionsPanel is already loaded (from modules/options-panel.js in manifest)
    optionsPanel.init({
      extensionSettings,
      browserAPI,
      saveSetting,
      log,
      enableCanvalierEffects,
      disableCanvalierEffects,
      applyDarkMode,
      removeDarkMode,
      applyCanvasToDoVisibility,
      applyRecentFeedbackVisibility,
      applyComingUpVisibility,
      applyDashboardHeaderVisibility,
      applyCustomImages,
      addSummaryToCard,
      optionsBoxObserverSetup
    });
    log('✅', 'Options panel module initialized');

    // customImages is already loaded (from modules/custom-images.js in manifest)
    customImages.init({
      extensionSettings,
      saveSetting,
      log,
      getCourseId
    });
    log('✅', 'Custom images module initialized');

    // assignmentManager is already loaded (from modules/assignment-manager.js in manifest)
    assignmentManager.init({
      extensionSettings,
      saveSetting,
      log,
      getCourseId,
      assignmentCache,
      pendingFetches,
      CACHE_VERSION,
      applyCustomImages
    });
    log('✅', 'Assignment manager module initialized');

    // darkMode is already loaded (from modules/dark-mode.js in manifest)
    darkMode.init({
      log,
      applyTitleColorFromOverlay
    });
    log('✅', 'Dark mode module initialized');

    // Apply dark mode globally (works on all Canvas pages, not just dashboard)
    if (extensionSettings.darkMode) {
      applyDarkMode();
    } else {
      removeDarkMode();
    }

    // Check if we're on the dashboard for Canvalier dashboard features
    if (!window.location.pathname.includes('/dashboard') && window.location.pathname !== '/') {
      log('⏭️', 'Not on dashboard page, skipping dashboard-specific features');
      return;
    }

    log('✅', 'On dashboard page, proceeding with dashboard initialization');

    // Set flag to prevent observer interference during initial load
    isInitialLoading = true;

    // Wait for dashboard to be ready
    await waitForDashboard();

    // ALWAYS insert options box (so users can toggle Canvalier on/off)
    insertOptionsBox();

    // ALWAYS setup options box observer (to keep it visible on dashboard)
    setupOptionsBoxObserver();

    // Check if Canvalier is enabled
    if (extensionSettings.canvalierEnabled) {
      log('✅', 'Canvalier is enabled, applying effects...');

      // IMMEDIATELY show UI - don't wait for ANYTHING else
      applyCanvasToDoVisibility();
      applyRecentFeedbackVisibility();
      applyComingUpVisibility();
      // Note: applyCustomImages() is handled by the immediate IIFE at the top
      // and will be called again by processCourseCards() after loading

      // Kick off ALL background work in parallel - don't await any of it
      cleanupMarkedDone();           // Runs async, doesn't block
      prefetchAllAssignments();      // Runs async, doesn't block
      processCourseCards();          // Runs async, shows loading then fills in data
      setupPersistenceObserver();    // Runs sync, non-blocking
      setupCustomImageTabObserver(); // Runs sync, watches for hamburger menus
      setupColorChangeObserver();    // Runs sync, watches for color changes
    } else {
      log('🛑', 'Canvalier is disabled, skipping effects...');
      // Ensure Canvas is in normal state (in case it was previously enabled)
      disableCanvalierEffects();
    }

    // Mark as done immediately - background work continues on its own
    isInitialLoading = false;

    log('🎉', 'Extension initialization complete!');
  } catch (error) {
    console.error('❌ Error initializing extension:', error);
    isInitialLoading = false;
  }
}

// Run on page load and navigation
init();

// Handle Canvas's single-page navigation
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    setTimeout(init, 1000); // Wait for Canvas to render
  }
}).observe(document, { subtree: true, childList: true });

// Listen for storage changes (for sync between popup and content script)
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.canvalierEnabled) {
      const newValue = changes.canvalierEnabled.newValue;
      if (newValue !== undefined && extensionSettings.canvalierEnabled !== newValue) {
        log('🔄', `Storage changed: Canvalier ${newValue ? 'enabled' : 'disabled'}`);

        // Update local setting
        extensionSettings.canvalierEnabled = newValue;

        // Update the toggle in options box if it exists
        const optionsToggle = document.querySelector('#canvalier-enabled-toggle');
        if (optionsToggle && optionsToggle.checked !== newValue) {
          optionsToggle.checked = newValue;
        }

        // Apply or remove effects
        if (newValue) {
          enableCanvalierEffects();
        } else {
          disableCanvalierEffects();
        }
      }
    }
  });
} else if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.canvalierEnabled) {
      const newValue = changes.canvalierEnabled.newValue;
      if (newValue !== undefined && extensionSettings.canvalierEnabled !== newValue) {
        log('🔄', `Storage changed: Canvalier ${newValue ? 'enabled' : 'disabled'}`);

        // Update local setting
        extensionSettings.canvalierEnabled = newValue;

        // Update the toggle in options box if it exists
        const optionsToggle = document.querySelector('#canvalier-enabled-toggle');
        if (optionsToggle && optionsToggle.checked !== newValue) {
          optionsToggle.checked = newValue;
        }

        // Apply or remove effects
        if (newValue) {
          enableCanvalierEffects();
        } else {
          disableCanvalierEffects();
        }
      }
    }
  });
}
