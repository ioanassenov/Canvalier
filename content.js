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

// Track if options box observer has been set up
let optionsBoxObserverSetup = false;

// Extension settings
const extensionSettings = {
  canvalierEnabled: true, // Default to extension being enabled
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
  const result = await browserAPI.storage.local.get(['canvalierEnabled', 'use24HourFormat', 'showOverdue', 'showTimeRemaining', 'assignmentRangeWeeks', 'minimizedCardCount', 'hideCanvasToDo', 'hideDashboardHeader', 'hideRecentFeedback', 'hideComingUp', 'customImages', 'imageOpacityPerCourse', 'markedDone']);

  if (result.canvalierEnabled !== undefined) {
    extensionSettings.canvalierEnabled = result.canvalierEnabled;
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
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        console.warn('⚠️ Timeout waiting for course cards - they may not exist on this page');
        obs.disconnect();
        resolve();
      }, 10000);
    }
  });
}

// Wait for Canvas to finish re-rendering (DOM stabilization)
// Uses frame-based polling instead of setTimeout for precise timing
function waitForDOMStable() {
  return new Promise((resolve) => {
    console.log('⏳ Waiting for Canvas DOM to stabilize...');
    let framesSinceLastMutation = 0;
    const STABLE_FRAME_COUNT = 10; // Wait for 10 consecutive frames (~167ms at 60fps) of no changes
    let mutationDetected = false;
    let totalFrames = 0;
    const MAX_FRAMES = 180; // Maximum 3 seconds at 60fps

    const observer = new MutationObserver((mutations) => {
      // Reset frame counter when we detect a mutation
      framesSinceLastMutation = 0;
      mutationDetected = true;
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

    // Use requestAnimationFrame to count stable frames (frame-by-frame polling)
    const checkStability = () => {
      totalFrames++;

      if (mutationDetected) {
        framesSinceLastMutation++;

        // Check if we've had enough stable frames
        if (framesSinceLastMutation >= STABLE_FRAME_COUNT) {
          console.log(`✅ DOM stable after ${framesSinceLastMutation} consecutive frames without mutations (total ${totalFrames} frames elapsed)`);
          observer.disconnect();
          resolve();
          return;
        }
      }

      // Check if we've exceeded max wait time
      if (totalFrames >= MAX_FRAMES) {
        console.log(`⚠️ Max wait time reached after ${totalFrames} frames, proceeding anyway`);
        observer.disconnect();
        resolve();
        return;
      }

      // If no mutation detected within first 60 frames (~1s), assume stable
      if (totalFrames >= 60 && !mutationDetected) {
        console.log(`✅ No mutations detected within ${totalFrames} frames, assuming stable`);
        observer.disconnect();
        resolve();
        return;
      }

      // Continue checking next frame
      requestAnimationFrame(checkStability);
    };

    // Start the frame-based stability check
    requestAnimationFrame(checkStability);
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
          // Check if the parent card has a custom image applied
          const card = hero.closest('.ic-DashboardCard');
          if (card) {
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

// Create options box element
function createOptionsBox() {
  const optionsBox = document.createElement('div');
  optionsBox.className = 'canvas-options-box';
  optionsBox.id = 'canvas-extension-options';

  // Helper function to get label for assignment range slider
  const getRangeLabel = (weeks) => {
    if (weeks >= 11) return 'Show assignments due within ∞ weeks';
    return `Show assignments due within ${weeks} week${weeks !== 1 ? 's' : ''}`;
  };

  // Helper function to get label for card count slider
  const getCardCountLabel = (count) => {
    if (count >= 11) return 'Expand all cards';
    return `Number of cards to show: ${count}`;
  };

  optionsBox.innerHTML = `
    <div class="canvas-options-header">
      <div class="canvas-options-title">
        <img src="${browserAPI.runtime.getURL('icons/icon16.png')}" alt="Canvalier" class="canvas-options-icon">
        <span>Canvalier Options</span>
      </div>
      <span class="canvas-options-toggle-icon">▼</span>
    </div>
    <div class="canvas-options-content">
      <div class="canvas-options-inner">
        <div class="canvas-option-item canvas-option-master-toggle">
          <span class="canvas-option-label" style="font-weight: bold;">Enable Canvalier</span>
          <label class="canvas-toggle-switch">
            <input type="checkbox" id="canvalier-enabled-toggle" ${extensionSettings.canvalierEnabled ? 'checked' : ''}>
            <span class="canvas-toggle-slider"></span>
          </label>
        </div>
        <div class="canvas-option-item canvas-option-slider-item">
          <div class="canvas-slider-container">
            <label class="canvas-option-label" id="assignment-range-label">${getRangeLabel(extensionSettings.assignmentRangeWeeks)}</label>
            <input type="range" id="assignment-range-slider" class="canvas-range-slider" min="1" max="11" step="1" value="${extensionSettings.assignmentRangeWeeks}">
          </div>
        </div>
        <div class="canvas-option-item canvas-option-slider-item">
          <div class="canvas-slider-container">
            <label class="canvas-option-label" id="card-count-label">${getCardCountLabel(extensionSettings.minimizedCardCount)}</label>
            <input type="range" id="card-count-slider" class="canvas-range-slider" min="1" max="11" step="1" value="${extensionSettings.minimizedCardCount}">
          </div>
        </div>
        <div class="canvas-option-item">
          <span class="canvas-option-label">24-Hour Time Format</span>
          <label class="canvas-toggle-switch">
            <input type="checkbox" id="time-format-toggle" ${extensionSettings.use24HourFormat ? 'checked' : ''}>
            <span class="canvas-toggle-slider"></span>
          </label>
        </div>
        <div class="canvas-option-item">
          <span class="canvas-option-label">Show Overdue</span>
          <label class="canvas-toggle-switch">
            <input type="checkbox" id="show-overdue-toggle" ${extensionSettings.showOverdue ? 'checked' : ''}>
            <span class="canvas-toggle-slider"></span>
          </label>
        </div>
        <div class="canvas-option-item">
          <span class="canvas-option-label">Show Time Remaining</span>
          <label class="canvas-toggle-switch">
            <input type="checkbox" id="time-remaining-toggle" ${extensionSettings.showTimeRemaining ? 'checked' : ''}>
            <span class="canvas-toggle-slider"></span>
          </label>
        </div>
        <div class="canvas-option-item">
          <span class="canvas-option-label">Hide Announcement Banner</span>
          <label class="canvas-toggle-switch">
            <input type="checkbox" id="hide-header-toggle" ${extensionSettings.hideDashboardHeader ? 'checked' : ''}>
            <span class="canvas-toggle-slider"></span>
          </label>
        </div>
        <div class="canvas-option-item">
          <span class="canvas-option-label">Hide Canvas To Do List</span>
          <label class="canvas-toggle-switch">
            <input type="checkbox" id="hide-todo-toggle" ${extensionSettings.hideCanvasToDo ? 'checked' : ''}>
            <span class="canvas-toggle-slider"></span>
          </label>
        </div>
        <div class="canvas-option-item">
          <span class="canvas-option-label">Hide Recent Feedback</span>
          <label class="canvas-toggle-switch">
            <input type="checkbox" id="hide-recent-feedback-toggle" ${extensionSettings.hideRecentFeedback ? 'checked' : ''}>
            <span class="canvas-toggle-slider"></span>
          </label>
        </div>
        <div class="canvas-option-item">
          <span class="canvas-option-label">Hide Coming Up</span>
          <label class="canvas-toggle-switch">
            <input type="checkbox" id="hide-coming-up-toggle" ${extensionSettings.hideComingUp ? 'checked' : ''}>
            <span class="canvas-toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>
  `;

  // Add expand/collapse functionality
  const header = optionsBox.querySelector('.canvas-options-header');
  header.addEventListener('click', () => {
    optionsBox.classList.toggle('expanded');
    log('🔧', `Options box ${optionsBox.classList.contains('expanded') ? 'expanded' : 'collapsed'}`);
  });

  // Add Canvalier enabled/disabled toggle functionality
  const canvalierEnabledToggle = optionsBox.querySelector('#canvalier-enabled-toggle');
  canvalierEnabledToggle.addEventListener('change', async (e) => {
    const isEnabled = e.target.checked;
    await saveSetting('canvalierEnabled', isEnabled);
    log('🎚️', `Canvalier ${isEnabled ? 'enabled' : 'disabled'}`);

    // Notify popup to update its toggle (if it's open)
    try {
      await browserAPI.storage.local.set({ canvalierEnabled: isEnabled });
    } catch (error) {
      console.error('Error syncing toggle state:', error);
    }

    if (isEnabled) {
      // Enable all Canvalier effects
      await enableCanvalierEffects();
    } else {
      // Disable all Canvalier effects
      disableCanvalierEffects();
    }
  });

  // Add 24-hour format toggle functionality
  const timeFormatToggle = optionsBox.querySelector('#time-format-toggle');
  timeFormatToggle.addEventListener('change', async (e) => {
    const use24Hour = e.target.checked;
    saveSetting('use24HourFormat', use24Hour);
    log('🕐', `Time format changed to ${use24Hour ? '24-hour' : '12-hour'}`);

    // Only apply if Canvalier is enabled
    if (extensionSettings.canvalierEnabled) {
      // Refresh all assignment summaries to show new time format
      const cards = document.querySelectorAll('.ic-DashboardCard');
      for (const card of cards) {
        await addSummaryToCard(card);
      }
    }
  });

  // Add show overdue toggle functionality
  const showOverdueToggle = optionsBox.querySelector('#show-overdue-toggle');
  showOverdueToggle.addEventListener('change', async (e) => {
    const showOverdue = e.target.checked;
    saveSetting('showOverdue', showOverdue);
    log('📅', `Show overdue: ${showOverdue}`);

    // Only apply if Canvalier is enabled
    if (extensionSettings.canvalierEnabled) {
      // Refresh all assignment summaries to show/hide overdue
      const cards = document.querySelectorAll('.ic-DashboardCard');
      for (const card of cards) {
        await addSummaryToCard(card);
      }
    }
  });

  // Add time remaining toggle functionality
  const timeRemainingToggle = optionsBox.querySelector('#time-remaining-toggle');
  timeRemainingToggle.addEventListener('change', async (e) => {
    const showTimeRemaining = e.target.checked;
    saveSetting('showTimeRemaining', showTimeRemaining);
    log('⏱️', `Show time remaining: ${showTimeRemaining}`);

    // Only apply if Canvalier is enabled
    if (extensionSettings.canvalierEnabled) {
      // Refresh all assignment summaries to show time remaining
      const cards = document.querySelectorAll('.ic-DashboardCard');
      for (const card of cards) {
        await addSummaryToCard(card);
      }
    }
  });

  // Add assignment range slider functionality
  const rangeSlider = optionsBox.querySelector('#assignment-range-slider');
  const rangeLabel = optionsBox.querySelector('#assignment-range-label');
  rangeSlider.addEventListener('input', async (e) => {
    const weeks = parseInt(e.target.value);
    rangeLabel.textContent = getRangeLabel(weeks);
    saveSetting('assignmentRangeWeeks', weeks);

    const rangeText = weeks >= 11 ? 'all upcoming assignments' : `${weeks} week${weeks !== 1 ? 's' : ''}`;
    log('📆', `Assignment range changed to: ${rangeText}`);

    // Only apply if Canvalier is enabled
    if (extensionSettings.canvalierEnabled) {
      // Refresh all assignment summaries with new range
      const cards = document.querySelectorAll('.ic-DashboardCard');
      for (const card of cards) {
        await addSummaryToCard(card);
      }
    }
  });

  // Add card count slider functionality
  const cardCountSlider = optionsBox.querySelector('#card-count-slider');
  const cardCountLabel = optionsBox.querySelector('#card-count-label');
  cardCountSlider.addEventListener('input', async (e) => {
    const count = parseInt(e.target.value);
    cardCountLabel.textContent = getCardCountLabel(count);
    saveSetting('minimizedCardCount', count);

    const countText = count >= 11 ? 'expand all cards' : `show ${count} card${count !== 1 ? 's' : ''}`;
    log('🔢', `Card count changed to: ${countText}`);

    // Only apply if Canvalier is enabled
    if (extensionSettings.canvalierEnabled) {
      // Refresh all assignment summaries with new card count
      const cards = document.querySelectorAll('.ic-DashboardCard');
      for (const card of cards) {
        await addSummaryToCard(card);
      }
    }
  });

  // Add hide Canvas ToDo toggle functionality
  const hideToDoToggle = optionsBox.querySelector('#hide-todo-toggle');
  hideToDoToggle.addEventListener('change', (e) => {
    const hideToDo = e.target.checked;
    saveSetting('hideCanvasToDo', hideToDo);
    log('📋', `Hide Canvas To Do: ${hideToDo}`);
    // Only apply if Canvalier is enabled
    if (extensionSettings.canvalierEnabled) {
      applyCanvasToDoVisibility();
    }
  });

  // Add hide dashboard header toggle functionality
  const hideHeaderToggle = optionsBox.querySelector('#hide-header-toggle');
  hideHeaderToggle.addEventListener('change', (e) => {
    const hideHeader = e.target.checked;
    saveSetting('hideDashboardHeader', hideHeader);
    log('🎯', `Hide Dashboard Header: ${hideHeader}`);
    // Only apply if Canvalier is enabled
    if (extensionSettings.canvalierEnabled) {
      applyDashboardHeaderVisibility();
    }
  });

  // Add hide recent feedback toggle functionality
  const hideRecentFeedbackToggle = optionsBox.querySelector('#hide-recent-feedback-toggle');
  hideRecentFeedbackToggle.addEventListener('change', (e) => {
    const hideRecentFeedback = e.target.checked;
    saveSetting('hideRecentFeedback', hideRecentFeedback);
    log('📝', `Hide Recent Feedback: ${hideRecentFeedback}`);
    // Only apply if Canvalier is enabled
    if (extensionSettings.canvalierEnabled) {
      applyRecentFeedbackVisibility();
    }
  });

  // Add hide coming up toggle functionality
  const hideComingUpToggle = optionsBox.querySelector('#hide-coming-up-toggle');
  hideComingUpToggle.addEventListener('change', (e) => {
    const hideComingUp = e.target.checked;
    saveSetting('hideComingUp', hideComingUp);
    log('📅', `Hide Coming Up: ${hideComingUp}`);
    // Only apply if Canvalier is enabled
    if (extensionSettings.canvalierEnabled) {
      applyComingUpVisibility();
    }
  });

  return optionsBox;
}

// Insert options box above the To Do section
function insertOptionsBox() {
  // Check if options box already exists
  if (document.getElementById('canvas-extension-options')) {
    return;
  }

  // Find the right sidebar (where To Do list is located)
  const rightSidebar = document.querySelector('#right-side');

  if (rightSidebar) {
    const optionsBox = createOptionsBox();
    // Insert as first child inside the right sidebar
    rightSidebar.insertAdjacentElement('afterbegin', optionsBox);
    log('✅', 'Options box inserted at top of right sidebar (above To Do)');
  } else {
    log('⚠️', 'Could not find right sidebar (#right-side) for options box');
  }
}

// Setup observer to ensure options box always exists on dashboard
function setupOptionsBoxObserver() {
  // Only set up once
  if (optionsBoxObserverSetup) {
    log('⏭️', 'Options box observer already set up, skipping...');
    return;
  }

  log('🔄', 'Setting up options box observer...');

  // Observe the right sidebar for any DOM changes
  const observer = new MutationObserver((mutations) => {
    // Check if we're still on the dashboard
    if (!window.location.pathname.includes('/dashboard') && window.location.pathname !== '/') {
      return; // Not on dashboard, don't insert
    }

    // Check if options box is missing
    if (!document.getElementById('canvas-extension-options')) {
      log('🔧', 'OBSERVER: Options box missing! Re-inserting...');
      insertOptionsBox();
    }
  });

  // Watch the right sidebar for changes
  const rightSidebar = document.querySelector('#right-side');
  if (rightSidebar) {
    observer.observe(rightSidebar, {
      childList: true,
      subtree: false // Only watch direct children of sidebar
    });
    log('✅', 'Options box observer active on right sidebar');
  }

  // Also watch the body for when the right sidebar itself might be re-created
  const bodyObserver = new MutationObserver((mutations) => {
    // Check if we're still on the dashboard
    if (!window.location.pathname.includes('/dashboard') && window.location.pathname !== '/') {
      return;
    }

    // Check if options box is missing
    if (!document.getElementById('canvas-extension-options')) {
      const rightSidebar = document.querySelector('#right-side');
      if (rightSidebar) {
        log('🔧', 'BODY OBSERVER: Options box missing! Re-inserting...');
        insertOptionsBox();
      }
    }
  });

  bodyObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  log('✅', 'Options box body observer active');
  optionsBoxObserverSetup = true;
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

  log('✅', 'All Canvalier effects disabled');
}

// Enable all Canvalier effects (apply based on settings)
async function enableCanvalierEffects() {
  log('🚀', 'Enabling Canvalier effects...');

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

  // Check if we're on the dashboard
  if (!window.location.pathname.includes('/dashboard') && window.location.pathname !== '/') {
    log('⏭️', 'Not on dashboard page, extension will not run');
    return;
  }

  log('✅', 'On dashboard page, proceeding with initialization');

  try {
    // Set flag to prevent observer interference during initial load
    isInitialLoading = true;

    // ONLY await what we absolutely need before showing UI
    await Promise.all([
      loadSettings(),      // Required: other code reads extensionSettings
      waitForDashboard()   // Required: need course cards to exist
    ]);

    // Wait for Canvas to finish its initial re-render before inserting anything
    // This prevents the flash where Canvas removes our elements
    await waitForDOMStable();

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

// Listen for messages from popup
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'canvalierToggleChanged') {
      log('📬', `Received toggle change message from popup: ${message.enabled}`);

      // Update the setting
      extensionSettings.canvalierEnabled = message.enabled;

      // Update the toggle in options box if it exists
      const optionsToggle = document.querySelector('#canvalier-enabled-toggle');
      if (optionsToggle) {
        optionsToggle.checked = message.enabled;
      }

      // Apply or remove effects
      if (message.enabled) {
        enableCanvalierEffects();
      } else {
        disableCanvalierEffects();
      }

      sendResponse({ success: true });
    }
  });
} else if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.onMessage) {
  browser.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'canvalierToggleChanged') {
      log('📬', `Received toggle change message from popup: ${message.enabled}`);

      // Update the setting
      extensionSettings.canvalierEnabled = message.enabled;

      // Update the toggle in options box if it exists
      const optionsToggle = document.querySelector('#canvalier-enabled-toggle');
      if (optionsToggle) {
        optionsToggle.checked = message.enabled;
      }

      // Apply or remove effects
      if (message.enabled) {
        enableCanvalierEffects();
      } else {
        disableCanvalierEffects();
      }

      return Promise.resolve({ success: true });
    }
  });
}
