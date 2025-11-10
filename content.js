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

// Module storage - loaded modules are cached here
const modules = {
  optionsPanel: null
};

// Load a module dynamically (load once, use multiple times)
async function loadModule(moduleName) {
  if (modules[moduleName]) {
    return modules[moduleName]; // Already loaded, return cached version
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const moduleUrl = browserAPI.runtime.getURL(`modules/${moduleName}.js`);
    script.src = moduleUrl;
    script.onload = () => {
      // Module should have exported itself to window
      const moduleMap = {
        'options-panel': window.CanvalierOptionsPanel
      };
      modules[moduleName] = moduleMap[moduleName];
      if (modules[moduleName]) {
        console.log(`✅ Module loaded: ${moduleName}`);
        resolve(modules[moduleName]);
      } else {
        reject(new Error(`Module ${moduleName} did not export correctly`));
      }
    };
    script.onerror = () => reject(new Error(`Failed to load module: ${moduleName}`));
    document.head.appendChild(script);
  });
}

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
function getOpacityForCourse(courseId) {
  // Check if course has custom opacity set
  if (extensionSettings.imageOpacityPerCourse[courseId] !== undefined) {
    return extensionSettings.imageOpacityPerCourse[courseId];
  }
  // Fallback to default
  return 70;
}

// Toggle marked-done status for an assignment
function toggleMarkedDone(courseId, assignmentId, dueDate) {
  const key = `${courseId}_${assignmentId}`;

  console.log('🔄 [MARK-AS-DONE DEBUG]', {
    action: extensionSettings.markedDone[key] ? 'UNMARKING' : 'MARKING',
    courseId,
    assignmentId,
    key,
    dueDate,
    currentState: extensionSettings.markedDone[key] || 'not marked'
  });

  if (extensionSettings.markedDone[key]) {
    // Unmark as done
    delete extensionSettings.markedDone[key];
    log('✓', `Unmarked assignment ${assignmentId} as done`);
  } else {
    // Mark as done
    extensionSettings.markedDone[key] = {
      markedAt: Date.now(),
      dueDate: new Date(dueDate).getTime()
    };
    log('✓', `Marked assignment ${assignmentId} as done`);
  }

  console.log('💾 [MARK-AS-DONE DEBUG] Saving to storage:', {
    key,
    newState: extensionSettings.markedDone[key] || 'removed',
    totalMarkedDone: Object.keys(extensionSettings.markedDone).length,
    allMarkedDone: extensionSettings.markedDone
  });

  saveSetting('markedDone', extensionSettings.markedDone);
}

// Check if an assignment is marked done
function isMarkedDone(courseId, assignmentId) {
  const key = `${courseId}_${assignmentId}`;
  const isDone = extensionSettings.markedDone[key] !== undefined;

  // Only log if it's marked done (to reduce console spam)
  if (isDone) {
    console.log('✓ [MARK-AS-DONE DEBUG] Checking assignment:', {
      courseId,
      assignmentId,
      key,
      isDone,
      data: extensionSettings.markedDone[key]
    });
  }

  return isDone;
}

// Cleanup stale marked-done assignments
async function cleanupMarkedDone() {
  log('🧹', 'Cleaning up graded/deleted marked-done assignments...');
  console.log('🧹 [CLEANUP DEBUG] Starting cleanup with marked-done:', extensionSettings.markedDone);

  const now = Date.now();
  let cleanedCount = 0;

  // We need to check each marked-done assignment against actual Canvas data
  const courseIds = new Set();
  for (const key in extensionSettings.markedDone) {
    const [courseId] = key.split('_');
    courseIds.add(courseId);
  }

  console.log('🧹 [CLEANUP DEBUG] Found courses with marked-done:', Array.from(courseIds));

  // Fetch assignment data for all courses that have marked-done items
  for (const courseId of courseIds) {
    const assignments = await fetchAssignments(courseId);
    console.log(`🧹 [CLEANUP DEBUG] Course ${courseId}: fetched ${assignments.length} assignments`);

    for (const key in extensionSettings.markedDone) {
      const [cid, assignmentId] = key.split('_');
      if (cid !== courseId) continue;

      const markedData = extensionSettings.markedDone[key];
      const assignment = assignments.find(a => a.id.toString() === assignmentId);

      console.log(`🧹 [CLEANUP DEBUG] Checking ${key}:`, {
        assignmentId,
        found: !!assignment,
        assignmentName: assignment?.name,
        markedData,
        nowTimestamp: now,
        daysOld: markedData.dueDate ? (now - markedData.dueDate) / (24 * 60 * 60 * 1000) : 'N/A'
      });

      // REMOVAL CONDITION 1: Assignment no longer exists in Canvas (deleted)
      if (!assignment) {
        console.log(`🗑️ [CLEANUP] REMOVING ${key}:`, {
          reason: 'Assignment deleted (no longer exists in Canvas)',
          assignmentId,
          courseId: cid,
          markedData,
          markedAt: new Date(markedData.markedAt).toISOString(),
          dueDate: new Date(markedData.dueDate).toISOString(),
          daysOld: (now - markedData.dueDate) / (24 * 60 * 60 * 1000)
        });
        delete extensionSettings.markedDone[key];
        cleanedCount++;
        continue;
      }

      // Check if assignment has been graded
      const isGraded = assignment.submission && (
        (assignment.submission.graded_at !== null) ||
        (assignment.submission.workflow_state === 'graded') ||
        (assignment.submission.score !== null && assignment.submission.score !== undefined)
      );

      console.log(`🧹 [CLEANUP DEBUG] ${key} grading check:`, {
        isGraded,
        graded_at: assignment.submission?.graded_at,
        workflow_state: assignment.submission?.workflow_state,
        score: assignment.submission?.score
      });

      // REMOVAL CONDITION 2: Assignment has been graded
      // This indicates the assignment is complete and no longer needs tracking
      if (isGraded) {
        console.log(`🗑️ [CLEANUP] REMOVING ${key}:`, {
          reason: 'Assignment graded (completed and graded by instructor)',
          assignmentId,
          assignmentName: assignment.name,
          courseId: cid,
          markedData,
          markedAt: new Date(markedData.markedAt).toISOString(),
          dueDate: new Date(markedData.dueDate).toISOString(),
          daysOld: (now - markedData.dueDate) / (24 * 60 * 60 * 1000),
          gradingDetails: {
            graded_at: assignment.submission.graded_at,
            workflow_state: assignment.submission.workflow_state,
            score: assignment.submission.score
          }
        });
        delete extensionSettings.markedDone[key];
        cleanedCount++;
        continue;
      }

      // NOTE: We are keeping assignments even if they are:
      // - Past due date
      // - Submitted but not yet graded
      // - Very old (no time-based cleanup)
      // This allows students to track assignments used with external submission systems
      // and maintains the mark-as-done state for overdue/unsubmitted assignments.
      //
      // Future enhancement: Add cleanup for courses marked as "inactive" at semester end.
      // This will require adding course state tracking to the extension settings.

      console.log(`🧹 [CLEANUP DEBUG] Keeping ${key}: assignment exists and not yet graded`);
    }
  }

  console.log('🧹 [CLEANUP DEBUG] Cleanup complete:', {
    cleanedCount,
    remainingMarkedDone: extensionSettings.markedDone
  });

  if (cleanedCount > 0) {
    saveSetting('markedDone', extensionSettings.markedDone);
    log('🧹', `Cleaned up ${cleanedCount} graded/deleted marked-done assignments`);
  } else {
    log('🧹', 'No graded/deleted marked-done assignments to clean up');
  }
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
function parseRgbColor(rgbString) {
  // Parse "rgb(r, g, b)" or "rgba(r, g, b, a)" format
  const match = rgbString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return {
      r: parseInt(match[1]),
      g: parseInt(match[2]),
      b: parseInt(match[3])
    };
  }
  return { r: 0, g: 0, b: 0 }; // Fallback to black
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
  h /= 360;
  s /= 100;
  l /= 100;

  let r, g, b;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

function brightenColor(rgbString, brightnessFactor = 1.5) {
  // Parse RGB
  const rgb = parseRgbColor(rgbString);

  // Convert to HSL
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  // Increase lightness for dark mode (make it brighter)
  // Ensure we don't go below a minimum lightness for visibility
  hsl.l = Math.min(85, Math.max(60, hsl.l * brightnessFactor));

  // Also slightly increase saturation for more vibrant colors in dark mode
  hsl.s = Math.min(100, hsl.s * 1.1);

  // Convert back to RGB
  const brightRgb = hslToRgb(hsl.h, hsl.s, hsl.l);

  return `rgb(${brightRgb.r}, ${brightRgb.g}, ${brightRgb.b})`;
}

function applyTitleColorFromOverlay(card) {
  const hero = card.querySelector('.ic-DashboardCard__header_hero');
  const title = card.querySelector('.ic-DashboardCard__header-title');

  if (!hero || !title) return;

  // Get the overlay color
  const overlayColor = window.getComputedStyle(hero).backgroundColor;

  // Check if dark mode is enabled
  const isDarkMode = document.documentElement.classList.contains('canvalier-dark-mode');

  const colorToApply = isDarkMode ? brightenColor(overlayColor) : overlayColor;

  // Apply to the title element itself
  title.style.setProperty('color', colorToApply, 'important');

  // ALSO apply to all child elements (spans, divs, etc.) inside the title
  // This is necessary because the #content selector catches child elements
  const childElements = title.querySelectorAll('*');
  childElements.forEach(child => {
    child.style.setProperty('color', colorToApply, 'important');
  });
}

// Fetch assignments for a course
async function fetchAssignments(courseId) {
  const cacheKey = `${courseId}_v${CACHE_VERSION}`;

  // Check cache first
  if (assignmentCache.has(cacheKey)) {
    console.log(`💾 Using cached assignments for course ${courseId}`);
    return assignmentCache.get(cacheKey);
  }

  // Check if there's already a pending fetch for this course
  if (pendingFetches.has(cacheKey)) {
    console.log(`⏳ Waiting for pending fetch for course ${courseId}`);
    return pendingFetches.get(cacheKey);
  }

  try {
    const baseUrl = window.location.origin;
    // Include submission data to check if student has submitted
    const url = `${baseUrl}/api/v1/courses/${courseId}/assignments?per_page=100&order_by=due_at&include[]=submission`;
    console.log(`📡 Fetching assignments from: ${url}`);

    // Create the fetch promise and store it
    const fetchPromise = fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    })
    .then(async response => {
      console.log(`📊 API Response status: ${response.status} ${response.statusText} for course ${courseId}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const assignments = await response.json();
      console.log(`✅ Fetched ${assignments.length} total assignments for course ${courseId}`);

      // Cache the results with version
      assignmentCache.set(cacheKey, assignments);

      // Remove from pending fetches
      pendingFetches.delete(cacheKey);

      return assignments;
    })
    .catch(error => {
      console.error(`❌ Error fetching assignments for course ${courseId}:`, error);
      // Remove from pending fetches even on error
      pendingFetches.delete(cacheKey);
      return [];
    });

    // Store the pending promise
    pendingFetches.set(cacheKey, fetchPromise);

    return fetchPromise;
  } catch (error) {
    console.error(`❌ Error setting up fetch for course ${courseId}:`, error);
    pendingFetches.delete(cacheKey);
    return [];
  }
}

// Filter and sort upcoming assignments
function getUpcomingAssignments(assignments) {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // Only show overdue from past week

  // Calculate future cutoff based on setting (11 = show all, otherwise show N weeks)
  const showAll = extensionSettings.assignmentRangeWeeks >= 11;
  const futureWeeks = showAll ? null : extensionSettings.assignmentRangeWeeks;
  const futureCutoff = showAll ? null : new Date(now.getTime() + futureWeeks * 7 * 24 * 60 * 60 * 1000);

  const upcoming = assignments
    .filter(assignment => {
      if (!assignment.due_at) return false;
      const dueDate = new Date(assignment.due_at);

      // Check if assignment has been submitted (multiple checks for robustness)
      const hasSubmission = assignment.submission && (
        // Check if submitted_at exists
        (assignment.submission.submitted_at !== null && assignment.submission.submitted_at !== undefined) ||
        // Check workflow state (submitted, graded, pending_review, etc.)
        (assignment.submission.workflow_state && assignment.submission.workflow_state !== 'unsubmitted') ||
        // Check if there's a score/grade
        (assignment.submission.score !== null && assignment.submission.score !== undefined) ||
        // Check if graded
        (assignment.submission.graded_at !== null && assignment.submission.graded_at !== undefined)
      );

      // Log submission info for debugging (only for past assignments when overdue is enabled)
      if (extensionSettings.showOverdue && dueDate < now && dueDate >= oneWeekAgo) {
        console.log(`📝 Assignment "${assignment.name}" (due ${dueDate.toLocaleDateString()}):`, {
          hasSubmission,
          submitted_at: assignment.submission?.submitted_at,
          workflow_state: assignment.submission?.workflow_state,
          score: assignment.submission?.score,
          graded_at: assignment.submission?.graded_at
        });
      }

      // Include overdue assignments if setting is enabled (only from past week, and NOT submitted)
      if (extensionSettings.showOverdue && dueDate < now && dueDate >= oneWeekAgo) {
        // Don't show as overdue if already submitted
        if (hasSubmission) {
          return false;
        }
        return true;
      }

      // Include upcoming assignments based on user's time range preference
      if (showAll) {
        return dueDate >= now; // Show all future assignments
      } else {
        return dueDate >= now && dueDate <= futureCutoff;
      }
    })
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at));

  const rangeText = showAll ? 'all upcoming' : `${futureWeeks} week${futureWeeks !== 1 ? 's' : ''}`;
  console.log(`📅 Filtered to ${upcoming.length} assignments (range: ${rangeText}, overdue: ${extensionSettings.showOverdue})`);
  return upcoming;
}

// Calculate time remaining until due date
function getTimeRemaining(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = date - now;

  if (diff < 0) {
    // Assignment is overdue, show how long ago
    const absDiff = Math.abs(diff);
    const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
      return `${days} day${days !== 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
      return `${hours} hr${hours !== 1 ? 's' : ''} ago`;
    } else {
      return `${minutes} min ago`;
    }
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days} day${days !== 1 ? 's' : ''}, ${hours} hr${hours !== 1 ? 's' : ''} left`;
  } else if (hours > 0) {
    return `${hours} hr${hours !== 1 ? 's' : ''}, ${minutes} min left`;
  } else {
    return `${minutes} min left`;
  }
}

// Format date for display
function formatDueDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // If showing time remaining, use that instead
  if (extensionSettings.showTimeRemaining) {
    return getTimeRemaining(dateString);
  }

  // Time formatting options based on user preference
  const timeOptions = extensionSettings.use24HourFormat
    ? { hour: '2-digit', minute: '2-digit', hour12: false }
    : { hour: 'numeric', minute: '2-digit', hour12: true };

  // Check if it's today
  if (date.toDateString() === now.toDateString()) {
    return `Today at ${date.toLocaleTimeString('en-US', timeOptions)}`;
  }

  // Check if it's tomorrow
  if (date.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow at ${date.toLocaleTimeString('en-US', timeOptions)}`;
  }

  // Otherwise show date
  const options = { month: 'short', day: 'numeric', ...timeOptions };
  return date.toLocaleString('en-US', options);
}

// Create summary element
function createSummaryElement(assignments, courseId, shouldStartExpanded = false) {
  const summaryDiv = document.createElement('div');
  summaryDiv.className = 'canvas-summary-container';

  if (assignments.length === 0) {
    summaryDiv.innerHTML = `
      <div class="canvas-summary-empty">
        <span class="summary-icon">✓</span> No assignments due soon
      </div>
    `;
    return summaryDiv;
  }

  const summaryHeader = document.createElement('div');
  summaryHeader.className = 'canvas-summary-header';
  summaryHeader.innerHTML = `
    <span class="summary-icon">📋</span>
    <strong>${assignments.length}</strong> assignment${assignments.length !== 1 ? 's' : ''} due soon
  `;
  summaryDiv.appendChild(summaryHeader);

  const assignmentList = document.createElement('div');
  assignmentList.className = 'canvas-summary-list';

  // Function to create assignment item
  const createAssignmentItem = (assignment) => {
    const assignmentItem = document.createElement('div');
    assignmentItem.className = 'canvas-summary-item';

    const now = new Date();
    const dueDate = new Date(assignment.due_at);
    const hoursUntilDue = (dueDate - now) / (1000 * 60 * 60);

    let urgencyClass = '';
    let isOverdue = hoursUntilDue < 0;
    const markedDone = isMarkedDone(courseId, assignment.id);

    // Add classes based on state
    if (markedDone) {
      assignmentItem.classList.add('marked-done');
      // Check if it's marked done but overdue
      if (isOverdue) {
        assignmentItem.classList.add('marked-done-overdue');
      }
    } else if (isOverdue) {
      assignmentItem.classList.add('overdue');
    } else if (hoursUntilDue < 24) {
      urgencyClass = 'urgent';
    } else if (hoursUntilDue < 72) {
      urgencyClass = 'soon';
    }

    const overdueLabel = (isOverdue && !markedDone) ? '<span class="assignment-overdue-label">overdue</span>' : '';
    const markedDoneLabel = markedDone ? '<span class="assignment-marked-done-icon">✓</span>' : '';
    const markedDoneOverdueLabel = (markedDone && isOverdue) ? '<span class="assignment-overdue-label">overdue — marked done</span>' : '';

    assignmentItem.innerHTML = `
      <div class="assignment-title-wrapper">
        ${markedDoneLabel}
        <a href="${assignment.html_url}" target="_blank" rel="noopener noreferrer" class="assignment-title-link">${assignment.name}</a>
      </div>
      <div class="assignment-due ${urgencyClass}">${formatDueDate(assignment.due_at)}${overdueLabel}${markedDoneOverdueLabel}</div>
    `;

    // Add click handler to mark as done (but not on the title link)
    assignmentItem.addEventListener('click', (e) => {
      // Don't toggle if clicking on the title link
      if (e.target.classList.contains('assignment-title-link') || e.target.closest('.assignment-title-link')) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      toggleMarkedDone(courseId, assignment.id, assignment.due_at);

      // Re-render the course card to update the UI
      const card = document.querySelector(`.ic-DashboardCard a[href*="/courses/${courseId}"]`)?.closest('.ic-DashboardCard');
      if (card) {
        addSummaryToCard(card);
      }
    });

    return assignmentItem;
  };

  // Determine how many cards to show in minimized view
  const minimizedCount = extensionSettings.minimizedCardCount >= 11 ? assignments.length : extensionSettings.minimizedCardCount;

  // Show initial assignments (either minimizedCount or all if shouldStartExpanded is true)
  const initialCount = shouldStartExpanded ? assignments.length : Math.min(minimizedCount, assignments.length);
  assignments.slice(0, initialCount).forEach(assignment => {
    assignmentList.appendChild(createAssignmentItem(assignment));
  });

  summaryDiv.appendChild(assignmentList);

  // Add expandable "show more" button only if there are more assignments than minimizedCount
  // and we're not in "expand all" mode (minimizedCardCount >= 11)
  if (assignments.length > minimizedCount && extensionSettings.minimizedCardCount < 11) {
    const moreDiv = document.createElement('div');
    moreDiv.className = 'canvas-summary-more';
    moreDiv.textContent = shouldStartExpanded ? 'Show less' : `+${assignments.length - minimizedCount} more`;

    let isExpanded = shouldStartExpanded;
    moreDiv.addEventListener('click', () => {
      if (!isExpanded) {
        // Show remaining assignments
        assignments.slice(minimizedCount).forEach(assignment => {
          assignmentList.appendChild(createAssignmentItem(assignment));
        });
        moreDiv.textContent = 'Show less';
        isExpanded = true;
      } else {
        // Hide additional assignments
        const items = assignmentList.querySelectorAll('.canvas-summary-item');
        items.forEach((item, index) => {
          if (index >= minimizedCount) {
            item.remove();
          }
        });
        moreDiv.textContent = `+${assignments.length - minimizedCount} more`;
        isExpanded = false;
      }
    });

    summaryDiv.appendChild(moreDiv);
  }

  return summaryDiv;
}

// Insert loading placeholders immediately for instant feedback
function insertLoadingPlaceholders() {
  const cards = document.querySelectorAll('.ic-DashboardCard');
  log('⚡', `Inserting loading placeholders for ${cards.length} courses...`);

  cards.forEach(card => {
    // Skip if already has summary
    if (card.querySelector('.canvas-summary-container')) {
      return;
    }

    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'canvas-summary-container canvas-summary-loading';
    loadingDiv.innerHTML = '<div class="loading-spinner">Loading assignments...</div>';

    const cardHeader = card.querySelector('.ic-DashboardCard__header');
    if (cardHeader) {
      cardHeader.insertAdjacentElement('afterend', loadingDiv);
    } else {
      const cardBody = card.querySelector('.ic-DashboardCard__header_hero');
      if (cardBody) {
        cardBody.insertAdjacentElement('afterend', loadingDiv);
      }
    }
  });

  log('✅', 'Loading placeholders inserted');
}

// Add summary to course card
async function addSummaryToCard(card) {
  const courseId = getCourseId(card);
  if (!courseId) {
    console.warn('⚠️ Could not extract course ID from card, skipping');
    return;
  }

  // Fetch and display assignments
  try {
    const assignments = await fetchAssignments(courseId);
    const upcomingAssignments = getUpcomingAssignments(assignments);

    // Check if the existing summary is expanded before removing it
    const existingSummary = card.querySelector('.canvas-summary-container');
    let wasExpanded = false;
    if (existingSummary) {
      const moreButton = existingSummary.querySelector('.canvas-summary-more');
      if (moreButton && moreButton.textContent === 'Show less') {
        wasExpanded = true;
      }
      existingSummary.remove();
    }

    // Add new summary with actual data, preserving expanded state
    const summaryElement = createSummaryElement(upcomingAssignments, courseId, wasExpanded);
    const cardHeader = card.querySelector('.ic-DashboardCard__header');
    const insertionPoint = cardHeader || card.querySelector('.ic-DashboardCard__header_hero');

    if (insertionPoint) {
      insertionPoint.insertAdjacentElement('afterend', summaryElement);
      console.log(`✅ Summary updated for course ${courseId}`);
    }
  } catch (error) {
    console.error('❌ Error adding summary to card:', error);
  }
}

// Pre-fetch all assignments in parallel
async function prefetchAllAssignments() {
  const cards = document.querySelectorAll('.ic-DashboardCard');
  console.log(`🚀 Pre-fetching assignments for ${cards.length} courses in parallel...`);

  const fetchPromises = [];

  cards.forEach(card => {
    const courseId = getCourseId(card);
    if (courseId) {
      fetchPromises.push(fetchAssignments(courseId));
    }
  });

  await Promise.all(fetchPromises);
  console.log('✅ All assignment data fetched and cached');
}

// Process all course cards
async function processCourseCards() {
  const cards = document.querySelectorAll('.ic-DashboardCard');
  console.log(`🔢 Found ${cards.length} course cards`);

  if (cards.length === 0) {
    console.warn('⚠️ No course cards found. Possible reasons:');
    console.warn('  - Not on the dashboard page');
    console.warn('  - Canvas updated their HTML structure');
    console.warn('  - Cards are still loading');

    // Debug: Log what elements we can find
    console.log('🔍 Debugging: Looking for similar elements...');
    const possibleCards = document.querySelectorAll('[class*="DashboardCard"]');
    console.log(`  Found ${possibleCards.length} elements with "DashboardCard" in class name`);
    possibleCards.forEach((el, i) => {
      console.log(`  ${i + 1}. ${el.className}`);
    });
  }

  for (const card of cards) {
    await addSummaryToCard(card);
  }

  console.log('✅ Finished processing all course cards');

  // Reapply custom images after processing cards
  applyCustomImages();
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
  const cards = document.querySelectorAll('.ic-DashboardCard');
  let changedCount = 0;

  cards.forEach(card => {
    const courseId = getCourseId(card);
    if (!courseId) return;

    const header = card.querySelector('.ic-DashboardCard__header');
    if (!header) return;

    const customImageUrl = extensionSettings.customImages[courseId];
    const currentlyApplied = header.getAttribute('data-canvalier-image-applied');

    if (customImageUrl) {
      // Get opacity for THIS specific course (not global)
      const opacity = getOpacityForCourse(courseId) / 100;

      // Get or create the image div
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

      // Reapply if image changed OR if opacity changed
      const currentOpacity = header.getAttribute('data-canvalier-current-opacity');
      const opacityChanged = currentOpacity !== String(opacity);
      if (currentlyApplied !== customImageUrl || opacityChanged) {
        // Set the background image on our custom image div
        imageDiv.style.backgroundImage = `url('${customImageUrl}')`;

        // Adjust the hero overlay opacity based on per-course setting
        if (hero) {
          hero.style.opacity = String(opacity);
        }

        header.setAttribute('data-canvalier-image-applied', customImageUrl);
        header.setAttribute('data-canvalier-current-opacity', String(opacity));
        changedCount++;
      }
    } else {
      // Remove custom image if it was previously set but now removed
      if (currentlyApplied) {
        // Remove the custom image div entirely
        const imageDiv = header.querySelector('.canvalier-custom-image');
        if (imageDiv) {
          imageDiv.remove();
        }

        // Restore original hero opacity
        const hero = card.querySelector('.ic-DashboardCard__header_hero');
        if (hero) {
          const originalOpacity = hero.getAttribute('data-canvalier-original-opacity');
          const originalColor = hero.getAttribute('data-canvalier-original-color');

          if (originalOpacity) {
            hero.style.opacity = originalOpacity;
          }

          // Only remove the attributes after restoring
          hero.removeAttribute('data-canvalier-original-opacity');
          hero.removeAttribute('data-canvalier-original-color');
        }

        header.removeAttribute('data-canvalier-image-applied');
        header.removeAttribute('data-canvalier-current-opacity');
        changedCount++;
      }
    }

    // Apply title color based on overlay color (for all cards, regardless of custom images)
    applyTitleColorFromOverlay(card);
  });

  if (changedCount > 0) {
    log('🖼️', `Applied/updated ${changedCount} custom images`);
  }
}

// Watch for color changes via Canvas's color picker and maintain opacity
function setupColorChangeObserver() {
  const observer = new MutationObserver((mutations) => {
    // Only observe if Canvalier is enabled
    if (!extensionSettings.canvalierEnabled) {
      return;
    }

    let needsReapply = false;

    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        const hero = mutation.target;
        if (hero.classList.contains('ic-DashboardCard__header_hero')) {
          // Update title color when overlay color changes
          const card = hero.closest('.ic-DashboardCard');
          if (card) {
            // Always update title color on overlay color change
            applyTitleColorFromOverlay(card);

            // Check if the parent card has a custom image applied to reapply images
            const header = card.querySelector('.ic-DashboardCard__header');
            if (header && header.getAttribute('data-canvalier-image-applied')) {
              needsReapply = true;
            }
          }
        }
      }
    });

    if (needsReapply) {
      // Debounce the reapply to avoid too many calls
      clearTimeout(window.canvalierColorChangeTimeout);
      window.canvalierColorChangeTimeout = setTimeout(() => {
        applyCustomImages();
      }, 100);
    }
  });

  // Observe all hero elements for style changes (to maintain opacity when Canvas changes colors)
  const cards = document.querySelectorAll('.ic-DashboardCard');
  cards.forEach(card => {
    const hero = card.querySelector('.ic-DashboardCard__header_hero');
    if (hero) {
      observer.observe(hero, {
        attributes: true,
        attributeFilter: ['style']
      });
    }
  });

  log('👀', 'Color change observer setup complete');
}

// Enhance Canvas's native Color tab with Reset Color button and opacity slider
function enhanceColorTab(popover, courseId) {
  // Check if we've already enhanced this Color tab
  if (popover.querySelector('.canvalier-color-enhancements')) {
    return;
  }

  // Find the Color tab's panel (first tabpanel in the container)
  const panelsContainer = popover.querySelector('.css-18p99wu-tabs__panelsContainer');
  if (!panelsContainer) return;

  const colorPanel = panelsContainer.querySelector('[role="tabpanel"]');
  if (!colorPanel) return;

  // Get the opacity for THIS specific course
  const courseOpacity = getOpacityForCourse(courseId);

  // Create enhancement container
  const enhancementContainer = document.createElement('div');
  enhancementContainer.className = 'canvalier-color-enhancements';
  enhancementContainer.style.marginTop = '16px';
  enhancementContainer.style.paddingTop = '16px';
  enhancementContainer.style.borderTop = '1px solid #C7CDD1';

  enhancementContainer.innerHTML = `
    <div class="ColorPicker__Container">
      <label for="canvalier-opacity-slider-${courseId}" class="css-1i2i0b5-formFieldLayout">
        <span class="css-oj1gve-formFieldLayout__label">Color Overlay Opacity</span>
        <span class="css-j7s35e-formFieldLayout__children">
          <div style="display: flex; align-items: center; gap: 12px;">
            <input
              id="canvalier-opacity-slider-${courseId}"
              type="range"
              min="0"
              max="100"
              value="${courseOpacity}"
              class="canvalier-opacity-slider"
              style="flex: 1;">
            <span class="canvalier-opacity-value" style="min-width: 45px; text-align: right;">${courseOpacity}%</span>
          </div>
        </span>
      </label>
      <div class="ColorPicker__Actions" style="margin-top: 12px;">
        <button dir="ltr" cursor="pointer" type="button" class="css-10t32iw-view--inlineBlock-baseButton canvalier-reset-color-btn">
          <span class="css-nkcj25-baseButton__content">
            <span class="css-131ekwm-baseButton__children">Reset to Original Color</span>
          </span>
        </button>
      </div>
    </div>
  `;

  // Find the panel content div and append our enhancements
  const panelContent = colorPanel.querySelector('.css-1ynk9jn-view-panel__content');
  if (panelContent) {
    panelContent.appendChild(enhancementContainer);
  }

  // Wire up the opacity slider - save per-course
  const opacitySlider = enhancementContainer.querySelector('.canvalier-opacity-slider');
  const opacityValue = enhancementContainer.querySelector('.canvalier-opacity-value');

  opacitySlider.addEventListener('input', (e) => {
    const value = e.target.value;
    opacityValue.textContent = `${value}%`;
    // Save opacity for THIS course specifically
    extensionSettings.imageOpacityPerCourse[courseId] = parseInt(value);
    saveSetting('imageOpacityPerCourse', extensionSettings.imageOpacityPerCourse);
    applyCustomImages();
    log('🎨', `Opacity changed to ${value}% for course ${courseId}`);
  });

  // Wire up the Reset Color button
  const resetColorBtn = enhancementContainer.querySelector('.canvalier-reset-color-btn');
  resetColorBtn.addEventListener('click', () => {
    const card = document.querySelector(`.ic-DashboardCard a[href*="/courses/${courseId}"]`)?.closest('.ic-DashboardCard');
    if (card) {
      const hero = card.querySelector('.ic-DashboardCard__header_hero');
      if (hero) {
        const originalColor = hero.getAttribute('data-canvalier-original-color');
        if (originalColor) {
          hero.style.backgroundColor = originalColor;
          hero.removeAttribute('data-canvalier-original-color');
          // Reapply image with original color if image exists
          if (extensionSettings.customImages[courseId]) {
            applyCustomImages();
          }
          log('🎨', `Color reset to original for course ${courseId}`);
        } else {
          log('⚠️', `No original color saved for course ${courseId}`);
        }
      }
    }
  });

  log('🎨', `Color tab enhanced for course ${courseId}`);
}

// Inject custom image tab into Canvas's course card hamburger menu
function injectCustomImageTab(popover, courseId) {
  // Check if we've already injected the tab
  if (popover.querySelector('.canvalier-custom-image-tab')) {
    return;
  }

  // Find the tab list
  const tabList = popover.querySelector('[role="tablist"]');
  if (!tabList) return;

  // Create the Custom Image tab button
  const customTabId = `tab-canvalier-custom-image-${courseId}`;
  const customPanelId = `panel-canvalier-custom-image-${courseId}`;

  const customTab = document.createElement('div');
  customTab.setAttribute('dir', 'ltr');
  customTab.setAttribute('role', 'tab');
  customTab.setAttribute('id', customTabId);
  customTab.setAttribute('aria-controls', customPanelId);
  customTab.className = 'css-1ql17kx-view-tab canvalier-custom-image-tab';
  customTab.textContent = 'Custom Image';

  // Add click handler for tab
  customTab.addEventListener('click', (e) => {
    // Stop propagation to prevent any Canvas handlers from interfering
    e.stopPropagation();

    // Deselect all tabs (including our custom tab)
    tabList.querySelectorAll('[role="tab"]').forEach(tab => {
      tab.setAttribute('aria-selected', 'false');
      // Only modify classes on non-custom tabs to preserve Canvas's classes
      if (!tab.classList.contains('canvalier-custom-image-tab')) {
        tab.className = 'css-1ql17kx-view-tab';
      } else {
        tab.className = 'css-1ql17kx-view-tab canvalier-custom-image-tab';
      }
      tab.removeAttribute('tabindex');
    });

    // Select this tab
    customTab.setAttribute('aria-selected', 'true');
    customTab.className = 'css-4le449-view-tab canvalier-custom-image-tab';
    customTab.setAttribute('tabindex', '0');

    // Hide all panels
    const panelsContainer = popover.querySelector('.css-18p99wu-tabs__panelsContainer');
    if (panelsContainer) {
      panelsContainer.querySelectorAll('[role="tabpanel"]').forEach(panel => {
        panel.setAttribute('aria-hidden', 'true');
        panel.className = 'css-1y758zy-panel';
      });

      // Show our panel
      const customPanel = panelsContainer.querySelector(`#${customPanelId}`);
      if (customPanel) {
        customPanel.removeAttribute('aria-hidden');
        customPanel.className = 'css-1h24o60-panel';
      }
    }
  });

  // Append the tab to the tab list
  tabList.appendChild(customTab);

  // Add click handlers to existing tabs (Color and Move) to properly hide our custom panel
  const existingTabs = tabList.querySelectorAll('[role="tab"]:not(.canvalier-custom-image-tab)');
  existingTabs.forEach(existingTab => {
    existingTab.addEventListener('click', (e) => {
      // Deselect our custom tab when Canvas's native tabs are clicked
      customTab.setAttribute('aria-selected', 'false');
      customTab.className = 'css-1ql17kx-view-tab canvalier-custom-image-tab';
      customTab.removeAttribute('tabindex');

      // Hide our custom panel
      const panelsContainer = popover.querySelector('.css-18p99wu-tabs__panelsContainer');
      if (panelsContainer) {
        const customPanel = panelsContainer.querySelector(`#${customPanelId}`);
        if (customPanel) {
          customPanel.setAttribute('aria-hidden', 'true');
          customPanel.className = 'css-1y758zy-panel';
        }

        // Ensure the clicked tab's panel is shown (defensive fix for blank panels)
        // Use setTimeout to run after Canvas's handlers
        setTimeout(() => {
          const clickedTabId = existingTab.getAttribute('id');
          const clickedPanelId = existingTab.getAttribute('aria-controls');
          if (clickedPanelId) {
            const clickedPanel = panelsContainer.querySelector(`#${clickedPanelId}`);
            if (clickedPanel) {
              // Make sure the panel is visible
              clickedPanel.removeAttribute('aria-hidden');
              if (!clickedPanel.classList.contains('css-1h24o60-panel')) {
                clickedPanel.className = 'css-1h24o60-panel';
              }
            }
          }

          // If this is the Color tab, ensure enhancements are present
          const tabText = existingTab.textContent.trim();
          if (tabText === 'Color') {
            // Remove the check flag to force re-enhancement
            const existingEnhancements = popover.querySelector('.canvalier-color-enhancements');
            if (!existingEnhancements) {
              console.log('🔧 Color tab clicked but enhancements missing - re-enhancing...');
              enhanceColorTab(popover, courseId);
            }
          }
        }, 0);
      }
    }, true); // Use capture phase to run before Canvas's handlers
  });

  // Create the panel content
  const panelsContainer = popover.querySelector('.css-18p99wu-tabs__panelsContainer');
  if (!panelsContainer) return;

  const currentImageUrl = extensionSettings.customImages[courseId] || '';

  const customPanel = document.createElement('div');
  customPanel.setAttribute('role', 'tabpanel');
  customPanel.setAttribute('tabindex', '0');
  customPanel.setAttribute('id', customPanelId);
  customPanel.setAttribute('aria-labelledby', customTabId);
  customPanel.setAttribute('aria-hidden', 'true');
  customPanel.className = 'css-1y758zy-panel';

  customPanel.innerHTML = `
    <div dir="ltr" class="css-1ynk9jn-view-panel__content transition--fade-entered">
      <div class="DashboardCardMenu__ColorPicker">
        <div class="ColorPicker__Container">
          <label for="canvalier-image-input-${courseId}" class="css-1i2i0b5-formFieldLayout">
            <span class="css-oj1gve-formFieldLayout__label">Custom Image URL</span>
            <span class="css-j7s35e-formFieldLayout__children">
              <span class="css-15ffo05-textInput__facade">
                <input
                  id="canvalier-image-input-${courseId}"
                  placeholder="https://example.com/image.jpg"
                  type="text"
                  class="css-173mqil-textInput"
                  value="${currentImageUrl}">
              </span>
            </span>
          </label>
          <div class="ColorPicker__Actions">
            <button dir="ltr" cursor="pointer" type="button" class="css-10t32iw-view--inlineBlock-baseButton canvalier-clear-image">
              <span class="css-nkcj25-baseButton__content">
                <span class="css-131ekwm-baseButton__children">Clear Image</span>
              </span>
            </button>
            <button dir="ltr" cursor="pointer" type="button" class="css-11xlsbg-view--inlineBlock-baseButton canvalier-apply-image">
              <span class="css-bnmdu0-baseButton__content">
                <span class="css-131ekwm-baseButton__children">Apply</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  panelsContainer.appendChild(customPanel);

  // Add event handlers for the buttons
  const input = customPanel.querySelector(`#canvalier-image-input-${courseId}`);
  const applyButton = customPanel.querySelector('.canvalier-apply-image');
  const clearButton = customPanel.querySelector('.canvalier-clear-image');

  applyButton.addEventListener('click', () => {
    const imageUrl = input.value.trim();
    if (imageUrl) {
      extensionSettings.customImages[courseId] = imageUrl;
      saveSetting('customImages', extensionSettings.customImages);
      applyCustomImages();
      log('🖼️', `Custom image URL saved for course ${courseId}: ${imageUrl}`);
    }
  });

  clearButton.addEventListener('click', () => {
    delete extensionSettings.customImages[courseId];
    saveSetting('customImages', extensionSettings.customImages);
    input.value = '';
    applyCustomImages();
    log('🖼️', `Custom image cleared for course ${courseId}`);
  });

  log('🎨', `Custom Image tab injected for course ${courseId}`);
}

// Setup observer to watch for hamburger menu popovers
function setupCustomImageTabObserver() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check if this is a popover with course card menu tabs
          const popover = node.querySelector ? node.querySelector('[data-position-content]') : null;
          const isPopoverItself = node.hasAttribute && node.hasAttribute('data-position-content');

          const targetPopover = popover || (isPopoverItself ? node : null);

          if (targetPopover) {
            // Check if this popover has the Color/Move tabs (course card menu)
            const tabList = targetPopover.querySelector('[role="tablist"]');
            if (tabList) {
              const tabs = tabList.querySelectorAll('[role="tab"]');
              const hasColorTab = Array.from(tabs).some(tab => tab.textContent.includes('Color'));
              const hasMoveTab = Array.from(tabs).some(tab => tab.textContent.includes('Move'));

              if (hasColorTab && hasMoveTab) {
                // Only inject tabs if Canvalier is enabled
                if (!extensionSettings.canvalierEnabled) {
                  return;
                }

                // This is a course card menu, find the course ID
                // Look for the button that triggered this popover
                const triggerButton = document.querySelector('[data-popover-trigger="true"][aria-expanded="true"]');
                if (triggerButton) {
                  const card = triggerButton.closest('.ic-DashboardCard');
                  if (card) {
                    const courseId = getCourseId(card);
                    if (courseId) {
                      // Enhance the Color tab with our additions
                      enhanceColorTab(targetPopover, courseId);
                      // Inject our Custom Image tab
                      injectCustomImageTab(targetPopover, courseId);
                    }
                  }
                }
              }
            }
          }
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  log('👀', 'Custom image tab observer setup complete');
}

// Options Panel functions (delegate to module)
// These are thin wrappers that call into the dynamically loaded module

function insertOptionsBox() {
  if (modules.optionsPanel) {
    modules.optionsPanel.insertOptionsBox();
  } else {
    console.error('Options panel module not loaded');
  }
}

function setupOptionsBoxObserver() {
  if (modules.optionsPanel) {
    modules.optionsPanel.setupOptionsBoxObserver();
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

// Apply dark mode by adding class to html element
// The CSS is loaded from dark-mode.css via manifest.json
function applyDarkMode() {
  log('🌙', 'Applying dark mode...');
  document.documentElement.classList.add('canvalier-dark-mode');

  // Update all title colors to use brighter versions
  const cards = document.querySelectorAll('.ic-DashboardCard');
  cards.forEach(card => applyTitleColorFromOverlay(card));

  log('✅', 'Dark mode applied');
}

// Remove dark mode by removing class from html element
function removeDarkMode() {
  log('☀️', 'Removing dark mode...');
  document.documentElement.classList.remove('canvalier-dark-mode');

  // Update all title colors back to normal overlay colors
  const cards = document.querySelectorAll('.ic-DashboardCard');
  cards.forEach(card => applyTitleColorFromOverlay(card));

  log('✅', 'Dark mode removed');
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

    // Load and initialize modules (load once, use multiple times)
    if (!modules.optionsPanel) {
      try {
        modules.optionsPanel = await loadModule('options-panel');
        // Initialize module with dependencies
        modules.optionsPanel.init({
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
      } catch (error) {
        console.error('❌ Failed to load options panel module:', error);
      }
    }

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
