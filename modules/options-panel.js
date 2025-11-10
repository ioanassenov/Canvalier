// Options Panel Module
// Handles creation, insertion, and management of the Canvalier options box

(function() {
  'use strict';

  // This module will be initialized with dependencies from content.js
  const OptionsPanel = {
    // Dependencies (set by init)
    deps: null,

    // Initialize with dependencies
    init(dependencies) {
      this.deps = dependencies;
    },

    // Create options box element
    createOptionsBox() {
      const { extensionSettings, browserAPI, saveSetting, log, enableCanvalierEffects, disableCanvalierEffects, applyDarkMode, removeDarkMode, applyCanvasToDoVisibility, applyRecentFeedbackVisibility, applyComingUpVisibility, applyDashboardHeaderVisibility, applyCustomImages, addSummaryToCard } = this.deps;

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
            <div class="canvas-option-item">
              <span class="canvas-option-label" style="font-weight: bold;">Dark Mode</span>
              <label class="canvas-toggle-switch">
                <input type="checkbox" id="dark-mode-toggle" ${extensionSettings.darkMode ? 'checked' : ''}>
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

        // Note: Popup sync happens automatically via storage change listener
        // No need to send messages - storage change events will propagate

        if (isEnabled) {
          // Enable all Canvalier effects
          await enableCanvalierEffects();
        } else {
          // Disable all Canvalier effects
          disableCanvalierEffects();
        }
      });

      // Add dark mode toggle functionality
      const darkModeToggle = optionsBox.querySelector('#dark-mode-toggle');
      darkModeToggle.addEventListener('change', async (e) => {
        const isDarkMode = e.target.checked;
        await saveSetting('darkMode', isDarkMode);
        log('🌙', `Dark mode ${isDarkMode ? 'enabled' : 'disabled'}`);

        if (isDarkMode) {
          applyDarkMode();
        } else {
          removeDarkMode();
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
    },

    // Insert options box above the To Do section
    insertOptionsBox() {
      const { log } = this.deps;

      // Check if options box already exists
      if (document.getElementById('canvas-extension-options')) {
        return;
      }

      // Find the right sidebar (where To Do list is located)
      const rightSidebar = document.querySelector('#right-side');

      if (rightSidebar) {
        const optionsBox = this.createOptionsBox();
        // Insert as first child inside the right sidebar
        rightSidebar.insertAdjacentElement('afterbegin', optionsBox);
        log('✅', 'Options box inserted at top of right sidebar (above To Do)');
      } else {
        log('⚠️', 'Could not find right sidebar (#right-side) for options box');
      }
    },

    // Setup observer to ensure options box always exists on dashboard
    setupOptionsBoxObserver() {
      const { optionsBoxObserverSetup, log } = this.deps;

      // Only set up once
      if (optionsBoxObserverSetup.value) {
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
          this.insertOptionsBox();
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
            this.insertOptionsBox();
          }
        }
      });

      bodyObserver.observe(document.body, {
        childList: true,
        subtree: true
      });

      log('✅', 'Options box body observer active');
      optionsBoxObserverSetup.value = true;
    }
  };

  // Export the module
  window.CanvalierOptionsPanel = OptionsPanel;
})();
