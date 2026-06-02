---
name: input.showPicker() blocked in preview iframe
description: Why scripted showPicker() silently does nothing in the Replit preview, and the native-click pattern that works instead.
---

`HTMLInputElement.showPicker()` throws a SecurityError when called from inside a cross-origin iframe — which is exactly what the Replit workspace preview is. So a "click a label → showPicker()" date/color/file picker silently does nothing in preview (and a `focus()+click()` fallback also doesn't open the native picker).

**Why:** the picker-opening API requires same-origin (or a permission), not just user activation. The error is caught/swallowed so it looks like "click does nothing."

**How to apply:** to get a styled trigger that still opens the native picker in the preview, rely on a NATIVE click on the real control, not scripted showPicker. Pattern used for the planner date cells: keep a real `<input type="date">` filling the cell, hide its value text (`color: transparent`) and stretch its `::-webkit-calendar-picker-indicator` to `inset:0; width/height:100%; opacity:0` so a click anywhere opens the picker; overlay a formatted label with `pointer-events-none` on top. The indicator pseudo-element CSS lives in globals.css (`.abv-date-cell`) because inline styles can't target pseudo-elements.
