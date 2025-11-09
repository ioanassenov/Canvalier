# Canvalier for Canvas

A Chrome extension that integrates with Canvas LMS to display assignment summaries directly under course cards on your dashboard.

## Features

- **Automatic Assignment Detection**: Fetches assignments from Canvas API for each course
- **Smart Filtering**: Shows assignments due within the next 2 weeks
- **Visual Urgency Indicators**: Color-coded due dates (red for < 24 hours, yellow for < 72 hours)
- **Clean Integration**: Matches Canvas LMS design language
- **Real-time Updates**: Works with Canvas's single-page navigation

## What You'll See

Under each course card on your Canvas dashboard, you'll see:
- Number of upcoming assignments
- Assignment names
- Due dates with smart formatting (Today, Tomorrow, or specific date/time)
- Visual indicators for urgent assignments

## Installation

### Step 1: Prepare the Extension

1. Make sure all files are in the same directory:
   - `manifest.json`
   - `content.js`
   - `styles.css`
   - `icons/` folder

2. **Add Icons** (optional but recommended):
   - Create or download three icon images:
     - `icons/icon16.png` (16x16 pixels)
     - `icons/icon48.png` (48x48 pixels)
     - `icons/icon128.png` (128x128 pixels)
   - Or remove the icons section from `manifest.json` if you skip this step

### Step 2: Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in the top right corner)
3. Click "Load unpacked"
4. Select the folder containing the extension files
5. The extension should now appear in your extensions list

### Step 3: Use the Extension

1. Navigate to your Canvas LMS dashboard (usually at `https://[your-school].instructure.com/`)
2. The extension will automatically detect course cards and display assignment summaries
3. Refresh the page if you don't see summaries immediately

## How It Works

The extension:
1. Detects when you're on the Canvas dashboard
2. Identifies course cards using Canvas's CSS classes
3. Extracts course IDs from the cards
4. Fetches assignments using the Canvas API (`/api/v1/courses/{id}/assignments`)
5. Filters for assignments due within 2 weeks
6. Injects a summary UI element under each course card

## Customization

### Change the Time Window

Edit `content.js` line 49 to modify how far ahead to check for assignments:

```javascript
// Current: 14 days (2 weeks)
const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

// Example: 7 days (1 week)
const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
```

### Change Maximum Displayed Assignments

Edit `content.js` line 97 to show more or fewer assignments:

```javascript
// Current: 5 assignments
assignments.slice(0, 5).forEach(assignment => {

// Example: 10 assignments
assignments.slice(0, 10).forEach(assignment => {
```

### Modify Urgency Thresholds

Edit `content.js` lines 100-105 to adjust when assignments are marked as urgent:

```javascript
// Current thresholds
if (hoursUntilDue < 24) {  // Less than 1 day
  urgencyClass = 'urgent';
} else if (hoursUntilDue < 72) {  // Less than 3 days
  urgencyClass = 'soon';
}
```

### Style Customization

Edit `styles.css` to change colors, spacing, or any visual elements. Key variables:
- Background color: `.canvas-summary-container { background-color: #f5f5f5; }`
- Border color: `.canvas-summary-item { border-left: 3px solid #0374b5; }`
- Urgent color: `.assignment-due.urgent { color: #d32f2f; }`
- Soon color: `.assignment-due.soon { color: #f57c00; }`

## Troubleshooting

### Extension Not Working

1. **Check Console**: Right-click on the page → Inspect → Console tab. Look for any error messages.
2. **Verify Canvas URL**: Make sure your Canvas URL matches the pattern in `manifest.json` (`https://*.instructure.com/*`)
3. **Reload Extension**: Go to `chrome://extensions/` and click the reload icon for this extension

### Summaries Not Showing

1. **Verify Course Cards**: Make sure you're on the dashboard with visible course cards
2. **Check API Access**: The extension uses Canvas's public API endpoints. If your institution restricts API access, the extension may not work
3. **Refresh Page**: Try refreshing the Canvas dashboard page

### Wrong Canvas Domain

If your Canvas instance uses a different domain (not `.instructure.com`), edit `manifest.json`:

```json
"host_permissions": [
  "https://your-canvas-domain.com/*"
],
"content_scripts": [
  {
    "matches": ["https://your-canvas-domain.com/*"],
    ...
  }
]
```

## Privacy & Permissions

This extension:
- Only runs on Canvas LMS pages (*.instructure.com)
- Uses local storage for caching (if implemented)
- Makes API requests to your Canvas instance only
- Does not collect or send data to external servers
- Does not modify or submit any Canvas data

## Future Enhancements

Potential features to add:
- Filter by assignment type (quizzes, homework, etc.)
- Show point values
- Add completion status indicators
- Click to navigate directly to assignments
- Customizable color themes
- Support for missing assignments
- Notification badges

## License

MIT License - Feel free to modify and distribute as needed.

## Contributing

To contribute or report issues:
1. Test the extension on your Canvas instance
2. Document any bugs or feature requests
3. Submit pull requests with improvements

## Technical Details

- **Manifest Version**: 3
- **Canvas API Version**: v1
- **Compatible**: Chrome, Edge, and other Chromium-based browsers
- **Canvas Compatibility**: Tested with modern Canvas LMS instances
