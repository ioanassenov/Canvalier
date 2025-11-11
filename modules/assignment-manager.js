// Assignment Manager Module
// Handles all assignment-related functionality including fetching, filtering, display, and mark-as-done
// This file loads BEFORE content.js (declared first in manifest.json)

'use strict';

const assignmentManager = {
  deps: null,

  init(dependencies) {
    this.deps = dependencies;
  },

  // Toggle marked-done status for an assignment
  toggleMarkedDone(courseId, assignmentId, dueDate) {
    const { extensionSettings, saveSetting, log } = this.deps;
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
  },

  // Check if an assignment is marked done
  isMarkedDone(courseId, assignmentId) {
    const { extensionSettings } = this.deps;
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
  },

  // Cleanup stale marked-done assignments
  async cleanupMarkedDone() {
    const { extensionSettings, saveSetting, log } = this.deps;
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
      const assignments = await this.fetchAssignments(courseId);
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
  },

  // Fetch assignments for a course
  async fetchAssignments(courseId) {
    const { assignmentCache, pendingFetches, CACHE_VERSION } = this.deps;
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
  },

  // Filter and sort upcoming assignments
  getUpcomingAssignments(assignments) {
    const { extensionSettings } = this.deps;
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
  },

  // Calculate time remaining until due date
  getTimeRemaining(dateString) {
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
  },

  // Format date for display
  formatDueDate(dateString) {
    const { extensionSettings } = this.deps;
    const date = new Date(dateString);
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // If showing time remaining, use that instead
    if (extensionSettings.showTimeRemaining) {
      return this.getTimeRemaining(dateString);
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
  },

  // Create summary element
  createSummaryElement(assignments, courseId, shouldStartExpanded = false) {
    const { extensionSettings } = this.deps;
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
      const markedDone = this.isMarkedDone(courseId, assignment.id);

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
        <div class="assignment-due ${urgencyClass}">${this.formatDueDate(assignment.due_at)}${overdueLabel}${markedDoneOverdueLabel}</div>
      `;

      // Add click handler to mark as done (but not on the title link)
      assignmentItem.addEventListener('click', (e) => {
        // Don't toggle if clicking on the title link
        if (e.target.classList.contains('assignment-title-link') || e.target.closest('.assignment-title-link')) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        this.toggleMarkedDone(courseId, assignment.id, assignment.due_at);

        // Re-render the course card to update the UI
        const card = document.querySelector(`.ic-DashboardCard a[href*="/courses/${courseId}"]`)?.closest('.ic-DashboardCard');
        if (card) {
          this.addSummaryToCard(card);
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
  },

  // Insert loading placeholders immediately for instant feedback
  insertLoadingPlaceholders() {
    const { log } = this.deps;
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
  },

  // Add summary to course card
  async addSummaryToCard(card) {
    const { getCourseId } = this.deps;
    const courseId = getCourseId(card);
    if (!courseId) {
      console.warn('⚠️ Could not extract course ID from card, skipping');
      console.warn('   Card classes:', card.className);
      console.warn('   Has course link:', !!card.querySelector('a[href*="/courses/"]'));
      return;
    }

    // Fetch and display assignments
    try {
      const assignments = await this.fetchAssignments(courseId);
      const upcomingAssignments = this.getUpcomingAssignments(assignments);

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
      const summaryElement = this.createSummaryElement(upcomingAssignments, courseId, wasExpanded);
      const cardHeader = card.querySelector('.ic-DashboardCard__header');
      const insertionPoint = cardHeader || card.querySelector('.ic-DashboardCard__header_hero');

      if (insertionPoint) {
        insertionPoint.insertAdjacentElement('afterend', summaryElement);
        console.log(`✅ Summary updated for course ${courseId}`);
      }
    } catch (error) {
      console.error('❌ Error adding summary to card:', error);
    }
  },

  // Pre-fetch all assignments in parallel
  async prefetchAllAssignments() {
    const { getCourseId } = this.deps;
    const cards = document.querySelectorAll('.ic-DashboardCard');
    console.log(`🚀 Pre-fetching assignments for ${cards.length} courses in parallel...`);

    const fetchPromises = [];

    cards.forEach(card => {
      const courseId = getCourseId(card);
      if (courseId) {
        fetchPromises.push(this.fetchAssignments(courseId));
      }
    });

    await Promise.all(fetchPromises);
    console.log('✅ All assignment data fetched and cached');
  },

  // Process all course cards
  async processCourseCards() {
    const { applyCustomImages } = this.deps;
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
      await this.addSummaryToCard(card);
    }

    console.log('✅ Finished processing all course cards');

    // Reapply custom images after processing cards
    applyCustomImages();
  }
};
