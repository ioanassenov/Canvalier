# Troubleshooting Guide

If the extension isn't working, follow these steps to diagnose the issue.

## Step 1: Open the Browser Console

1. Go to your Canvas dashboard
2. Right-click anywhere on the page and select **Inspect** (or press `F12` / `Cmd+Option+I` on Mac)
3. Click on the **Console** tab
4. Look for messages starting with emojis like 🎓, 🔍, ✅, ⚠️, or ❌

## Step 2: Check What the Console Shows

### Expected Output (Everything Working)

You should see messages like:
```
🎓 Canvas Assignment Summary Extension: Script loaded
🚀 Initializing Canvas Assignment Summary Extension...
📍 Current URL: https://yourschool.instructure.com/
✅ On dashboard page, proceeding with initialization
🔍 Checking for course cards...
✅ Course cards found immediately
🔢 Found 5 course cards
📚 Course ID extracted: 12345 from https://...
✅ Found card header, inserting loading state
📡 Fetching assignments from: https://...
📊 API Response status: 200 OK
✅ Fetched 15 total assignments for course 12345
📅 Filtered to 3 assignments due within 2 weeks
✅ Summary element inserted successfully
...
🎉 Extension initialization complete!
```

### Common Issues and Solutions

#### Issue 1: Extension Script Not Loading
**Console shows:** Nothing at all, or no message starting with "🎓 Canvas Assignment Summary Extension"

**Solution:**
1. Go to `chrome://extensions/`
2. Find "Canvas LMS Assignment Summary"
3. Make sure it's **enabled** (toggle should be blue/on)
4. Check if there are any errors shown in red under the extension
5. Click the **Reload** button (circular arrow icon)
6. Refresh your Canvas page

---

#### Issue 2: Not on Dashboard Page
**Console shows:**
```
⏭️ Not on dashboard page, extension will not run
```

**Solution:**
- Navigate to your Canvas dashboard (usually the home page after logging in)
- The URL should contain `/dashboard` or be just `https://yourschool.instructure.com/`
- The extension only works on the dashboard page where course cards are displayed

---

#### Issue 3: Wrong Canvas Domain
**Console shows:** Script loads but nothing happens

**Solution:**
If your Canvas URL is NOT `*.instructure.com` (e.g., `canvas.yourschool.edu`):

1. Open `manifest.json`
2. Update both permissions sections:
```json
"host_permissions": [
  "https://canvas.yourschool.edu/*"
],
"content_scripts": [
  {
    "matches": ["https://canvas.yourschool.edu/*"],
    ...
  }
]
```
3. Reload the extension in `chrome://extensions/`

---

#### Issue 4: No Course Cards Found
**Console shows:**
```
⚠️ No course cards found. Possible reasons:
  - Not on the dashboard page
  - Canvas updated their HTML structure
  - Cards are still loading
🔍 Debugging: Looking for similar elements...
  Found 0 elements with "DashboardCard" in class name
```

**Solutions:**

**A) Canvas Updated Their HTML Structure**
Canvas may have changed their CSS classes. Look at the console debugging output:
1. If it shows elements with similar names, note the exact class names
2. Update `content.js` line 8 and 233 to use the new class name:
```javascript
// Change this line:
if (document.querySelector('.ic-DashboardCard')) {

// To use the new class you found:
if (document.querySelector('.NewClassName')) {
```

**B) Check Your Dashboard View**
1. Make sure you're viewing courses as **cards**, not as a list
2. Look for a view toggle button on your dashboard (cards icon vs list icon)
3. Switch to card view if you're in list view

**C) Manually Inspect the Page**
1. Right-click on a course card
2. Select "Inspect"
3. Look at the HTML for class names containing "card" or "course"
4. Note the exact class name and update the extension code accordingly

---

#### Issue 5: API Permission Error
**Console shows:**
```
📊 API Response status: 401 Unauthorized
❌ Error fetching assignments for course 12345
```

**Solution:**
- Your Canvas instance may require authentication for API access
- Make sure you're logged into Canvas
- Some institutions restrict API access - contact your IT department
- Try logging out and back into Canvas

---

#### Issue 6: API Not Found Error
**Console shows:**
```
📊 API Response status: 404 Not Found
❌ Error fetching assignments for course 12345
```

**Solution:**
- The Canvas API endpoint might be different for your institution
- Your institution might have disabled the assignments API
- Contact your Canvas administrator

---

#### Issue 7: No Assignments Due
**Console shows:**
```
✅ Fetched 10 total assignments for course 12345
📅 Filtered to 0 assignments due within 2 weeks
✅ Summary element inserted successfully
```

**What you'll see:** A message saying "No assignments due soon"

**This is normal if:**
- You have no assignments due in the next 2 weeks
- All your assignments are past due
- Assignments don't have due dates set

**To test with different timeframes:**
Edit `content.js` line 79 to check further ahead:
```javascript
// Change from 14 days to 30 days:
const twoWeeksFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
```

---

#### Issue 8: Summary Appears But Looks Wrong
**Console shows:** Everything successful

**Solution:**
- The CSS might not be loading properly
- Go to `chrome://extensions/`
- Reload the extension
- Hard refresh Canvas (Ctrl+Shift+R or Cmd+Shift+R on Mac)
- Check that `styles.css` is in the same folder as `manifest.json`

---

## Step 3: Advanced Debugging

### View All Elements on Page
Run this in the console to see all course-related elements:
```javascript
console.log('All elements with "course" in class:',
  document.querySelectorAll('[class*="course"]')
);
console.log('All elements with "card" in class:',
  document.querySelectorAll('[class*="card"]')
);
console.log('All dashboard elements:',
  document.querySelectorAll('[class*="dashboard"]')
);
```

### Manually Test API
Run this in the console (replace 12345 with a real course ID from your Canvas):
```javascript
fetch(window.location.origin + '/api/v1/courses/12345/assignments')
  .then(r => r.json())
  .then(data => console.log('API Response:', data))
  .catch(err => console.error('API Error:', err));
```

### Check Extension Permissions
1. Go to `chrome://extensions/`
2. Click **Details** on the Canvas extension
3. Scroll to **Site access**
4. Make sure it says "On specific sites" with your Canvas domain listed
5. Or change it to "On all sites" (less secure but good for testing)

---

## Step 4: Still Not Working?

### Create a Detailed Bug Report

Include the following information:

1. **Canvas URL format** (e.g., `*.instructure.com` or `canvas.school.edu`)
2. **Full console output** (copy/paste everything from the Console tab)
3. **Screenshot of your dashboard** showing the course cards
4. **Extension details:**
   - Go to `chrome://extensions/`
   - Click **Details**
   - Screenshot the permissions section
5. **Browser version:** Chrome version number (chrome://version/)

### Quick Test: Create a Simple Test File

Create a file called `test.html` and open it in Chrome:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Extension Test</title>
</head>
<body>
  <h1>Extension Test Page</h1>
  <div class="ic-DashboardCard">
    <div class="ic-DashboardCard__header">
      <a href="https://yourschool.instructure.com/courses/12345">Test Course</a>
    </div>
  </div>

  <script>
    console.log('Test page loaded');
    console.log('Course card element:', document.querySelector('.ic-DashboardCard'));
  </script>
</body>
</html>
```

If the extension doesn't work on this test page either, the issue is with the extension installation.

---

## Common Quick Fixes Checklist

- [ ] Extension is enabled in `chrome://extensions/`
- [ ] You're on the Canvas dashboard page
- [ ] You've refreshed the page after installing/updating the extension
- [ ] Your Canvas URL matches the pattern in `manifest.json`
- [ ] Console shows the "🎓" message confirming script loaded
- [ ] You're viewing courses in **card view** not list view
- [ ] You're logged into Canvas
- [ ] You've reloaded the extension after making any code changes

---

## Need More Help?

If you've tried all these steps and it's still not working, the issue might be:
- Canvas has significantly changed their page structure
- Your institution has customized Canvas
- There's a conflict with another extension
- Your Canvas instance has restricted permissions

Try disabling other extensions one by one to check for conflicts, or try the extension in an incognito window with no other extensions enabled.
