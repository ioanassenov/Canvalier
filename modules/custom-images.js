// Custom Images Manager Module
// Handles custom image functionality, opacity control, and color enhancements
// This file loads BEFORE content.js (declared first in manifest.json)

'use strict';

const customImages = {
  deps: null,

  init(dependencies) {
    this.deps = dependencies;
  },

  // Get opacity for a specific course
  getOpacityForCourse(courseId) {
    const { extensionSettings } = this.deps;
    // Check if course has custom opacity set
    if (extensionSettings.imageOpacityPerCourse[courseId] !== undefined) {
      return extensionSettings.imageOpacityPerCourse[courseId];
    }
    // Fallback to default
    return 70;
  },

  // Color utility functions for title color syncing
  parseRgbColor(rgbString) {
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
  },

  rgbToHsl(r, g, b) {
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
  },

  hslToRgb(h, s, l) {
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
  },

  brightenColor(rgbString, brightnessFactor = 1.5) {
    // Parse RGB
    const rgb = this.parseRgbColor(rgbString);

    // Convert to HSL
    const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);

    // Increase lightness for dark mode (make it brighter)
    // Ensure we don't go below a minimum lightness for visibility
    hsl.l = Math.min(85, Math.max(60, hsl.l * brightnessFactor));

    // Also slightly increase saturation for more vibrant colors in dark mode
    hsl.s = Math.min(100, hsl.s * 1.1);

    // Convert back to RGB
    const brightRgb = this.hslToRgb(hsl.h, hsl.s, hsl.l);

    return `rgb(${brightRgb.r}, ${brightRgb.g}, ${brightRgb.b})`;
  },

  applyTitleColorFromOverlay(card) {
    const hero = card.querySelector('.ic-DashboardCard__header_hero');
    const title = card.querySelector('.ic-DashboardCard__header-title');

    if (!hero || !title) return;

    // Get the overlay color
    const overlayColor = window.getComputedStyle(hero).backgroundColor;

    // Check if dark mode is enabled
    const isDarkMode = document.documentElement.classList.contains('canvalier-dark-mode');

    const colorToApply = isDarkMode ? this.brightenColor(overlayColor) : overlayColor;

    // Apply to the title element itself
    title.style.setProperty('color', colorToApply, 'important');

    // ALSO apply to all child elements (spans, divs, etc.) inside the title
    // This is necessary because the #content selector catches child elements
    const childElements = title.querySelectorAll('*');
    childElements.forEach(child => {
      child.style.setProperty('color', colorToApply, 'important');
    });
  },

  applyCustomImages() {
    const { extensionSettings, getCourseId, saveSetting, log } = this.deps;
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
        const opacity = this.getOpacityForCourse(courseId) / 100;

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
      this.applyTitleColorFromOverlay(card);
    });

    if (changedCount > 0) {
      log('🖼️', `Applied/updated ${changedCount} custom images`);
    }
  },

  // Watch for color changes via Canvas's color picker and maintain opacity
  setupColorChangeObserver() {
    const { extensionSettings, log } = this.deps;

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
              this.applyTitleColorFromOverlay(card);

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
          this.applyCustomImages();
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
  },

  // Enhance Canvas's native Color tab with Reset Color button and opacity slider
  enhanceColorTab(popover, courseId) {
    const { extensionSettings, saveSetting, log } = this.deps;

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
    const courseOpacity = this.getOpacityForCourse(courseId);

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
      this.applyCustomImages();
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
              this.applyCustomImages();
            }
            log('🎨', `Color reset to original for course ${courseId}`);
          } else {
            log('⚠️', `No original color saved for course ${courseId}`);
          }
        }
      }
    });

    log('🎨', `Color tab enhanced for course ${courseId}`);
  },

  // Inject custom image tab into Canvas's course card hamburger menu
  injectCustomImageTab(popover, courseId) {
    const { extensionSettings, saveSetting, log } = this.deps;

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
                this.enhanceColorTab(popover, courseId);
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
        this.applyCustomImages();
        log('🖼️', `Custom image URL saved for course ${courseId}: ${imageUrl}`);
      }
    });

    clearButton.addEventListener('click', () => {
      delete extensionSettings.customImages[courseId];
      saveSetting('customImages', extensionSettings.customImages);
      input.value = '';
      this.applyCustomImages();
      log('🖼️', `Custom image cleared for course ${courseId}`);
    });

    log('🎨', `Custom Image tab injected for course ${courseId}`);
  },

  // Setup observer to watch for hamburger menu popovers
  setupCustomImageTabObserver() {
    const { extensionSettings, getCourseId, log } = this.deps;

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
                        this.enhanceColorTab(targetPopover, courseId);
                        // Inject our Custom Image tab
                        this.injectCustomImageTab(targetPopover, courseId);
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
};
