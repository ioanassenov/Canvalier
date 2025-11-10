'use strict';

const darkMode = {
  deps: null,

  init(dependencies) {
    this.deps = dependencies;
  },

  // Apply dark mode by adding class to html element
  // The CSS is loaded from dark-mode.css via manifest.json
  applyDarkMode() {
    const { log, applyTitleColorFromOverlay } = this.deps;

    log('🌙', 'Applying dark mode...');
    document.documentElement.classList.add('canvalier-dark-mode');

    // Update all title colors to use brighter versions
    const cards = document.querySelectorAll('.ic-DashboardCard');
    cards.forEach(card => applyTitleColorFromOverlay(card));

    log('✅', 'Dark mode applied');
  },

  // Remove dark mode by removing class from html element
  removeDarkMode() {
    const { log, applyTitleColorFromOverlay } = this.deps;

    log('☀️', 'Removing dark mode...');
    document.documentElement.classList.remove('canvalier-dark-mode');

    // Update all title colors back to normal overlay colors
    const cards = document.querySelectorAll('.ic-DashboardCard');
    cards.forEach(card => applyTitleColorFromOverlay(card));

    log('✅', 'Dark mode removed');
  }
};
