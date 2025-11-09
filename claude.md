# Canvalier - Canvas LMS Chrome Extension

## Project Overview
Canvalier is a Chrome extension that enhances the Canvas LMS dashboard experience by displaying assignment summaries directly on course cards and providing customization options for the Canvas interface.

## Key Features

### Assignment Management
- **Assignment Summaries**: Displays upcoming assignments directly under each course card on the dashboard
- **Smart Filtering**: Shows assignments based on configurable time ranges (1-11 weeks, with 11 = show all)
- **Overdue Tracking**: Optional display of overdue assignments from the past week
- **Mark as Done**: Students can mark assignments as "done" to track completion (especially useful for external submission systems)
- **Auto Cleanup**: Automatically removes marked-done items when assignments are graded or deleted
- **Expandable Cards**: Configurable number of assignments shown per card (1-11, with 11 = expand all)

### Customization Options
- **Custom Course Images**: Replace default course card images with custom URLs
- **Image Opacity Control**: Adjust color overlay opacity on custom images (0-100%)
- **Time Format**: Toggle between 12-hour and 24-hour time formats
- **Time Display**: Switch between showing due dates or time remaining

### UI Hiding Options
- **Hide Announcement Banner**: Remove the carousel banner from dashboard
- **Hide Canvas To Do List**: Hide the default Canvas to-do sidebar
- **Hide Recent Feedback**: Hide the Recent Feedback column
- **Hide Coming Up**: Hide the Coming Up section

### Performance Optimizations
- **Immediate Loading Placeholders**: Shows loading states instantly to prevent UI flash
- **Parallel Prefetching**: Fetches all course assignments concurrently
- **Smart Caching**: Caches assignment data with versioning to avoid redundant API calls
- **Frame-based Persistence**: Uses `requestAnimationFrame` during initial load to catch Canvas re-renders
- **DOM Stabilization**: Waits for Canvas DOM to stabilize before processing

## Technical Architecture

### Files
- **manifest.json**: Chrome extension manifest (v3)
- **content.js**: Main content script with all functionality (~1900 lines)
- **styles.css**: Styling for assignment summaries and options UI
- **icons/**: Extension icons (16px, 48px, 128px)

### Key Technologies
- **Chrome Extension Manifest V3**
- **Canvas LMS API**: Uses `/api/v1/courses/{courseId}/assignments` endpoint
- **Chrome Storage API**: Persists user settings and marked-done state
- **MutationObserver**: Monitors DOM changes for Canvas re-renders and hamburger menu popovers

### Important Implementation Details

#### Settings Storage
All settings are stored in `chrome.storage.local`:
- `use24HourFormat`: Boolean
- `showOverdue`: Boolean
- `showTimeRemaining`: Boolean
- `assignmentRangeWeeks`: Number (1-11)
- `minimizedCardCount`: Number (1-11)
- `hideCanvasToDo`: Boolean
- `hideDashboardHeader`: Boolean
- `hideRecentFeedback`: Boolean
- `hideComingUp`: Boolean
- `customImages`: Object `{ "courseId": "imageUrl" }`
- `imageOpacity`: Number (0-100)
- `markedDone`: Object `{ "courseId_assignmentId": { markedAt, dueDate } }`

#### Custom Images Integration
- Injects a "Custom Image" tab into Canvas's native course card hamburger menu
- Enhances the existing "Color" tab with opacity slider and "Reset to Original Color" button
- Preserves original background images and colors using data attributes
- Watches for Canvas color changes to maintain opacity settings

#### Immediate Banner Hiding
- Banner hiding logic runs in an IIFE at the top of content.js (before main init)
- Uses `requestAnimationFrame` for frame-level checking to hide banner ASAP
- Prevents banner flash on page load

#### Assignment Filtering
Assignments are filtered to show:
1. **Overdue** (if enabled): From past 7 days, not yet submitted
2. **Upcoming**: Based on user's time range setting (1-11 weeks)
3. **Exclusions**: Submitted/graded assignments are filtered out from overdue view

#### Persistence Strategy
Multiple layers ensure summaries persist through Canvas re-renders:
1. **MutationObserver**: Watches dashboard container for DOM changes
2. **Frame-based checking**: During initial load, checks every frame with `requestAnimationFrame`
3. **Polling**: Every 2 seconds checks if summaries are missing (fallback)
4. **Navigation handling**: Re-initializes on Canvas SPA navigation

## Development Notes

### Code Style
- Heavy use of console logging with emoji prefixes for debugging
- Async/await pattern for API calls
- Event-driven architecture with Chrome Storage for state management

### Canvas Selectors (Important)
- Course cards: `.ic-DashboardCard`
- Course card image: `.ic-DashboardCard__header_image`
- Course card overlay: `.ic-DashboardCard__header_hero`
- To Do list: `.Sidebar__TodoListContainer`
- Recent Feedback: `.events_list.recent_feedback`
- Coming Up: `#right-side > div.events_list.coming_up`
- Right sidebar: `#right-side`
- Carousel banner: `iframe[src*="carousel"]` (parent div)

### Cache Versioning
- Assignment cache uses versioned keys: `${courseId}_v${CACHE_VERSION}`
- Increment `CACHE_VERSION` when API query changes to invalidate old cache

### Mark as Done Cleanup Logic
Removes marked-done assignments when:
1. Assignment no longer exists in Canvas (deleted)
2. Assignment has been graded (checked via submission object)

Does NOT remove when:
- Past due date but not graded
- Submitted but not yet graded
- Very old (no time-based cleanup)

This allows tracking of external submission assignments.

## Future Enhancements (Potential)
- Course state tracking for semester-end cleanup
- Bulk mark as done functionality
- Assignment filtering by type (quizzes, discussions, etc.)
- Dark mode support
- Import/export settings
- Sync settings across devices

## Known Constraints
- Only works on Canvas LMS dashboard (`/dashboard` or `/`)
- Requires Canvas API access (authenticated user)
- Chrome extension only (not Firefox/Safari)
- Relies on Canvas DOM structure (may break with Canvas updates)

## Testing Considerations
- Test on different Canvas instances (selectors may vary)
- Test with courses having many assignments (100+)
- Test persistence through Canvas navigation
- Test custom images with various URL formats
- Test mark as done with submission/grading workflows
