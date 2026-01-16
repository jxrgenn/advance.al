# Tutorial Scroll Lock Fix - Remaining Work

## Status
**Completed**: 2/6 files
**Remaining**: 4/6 files

## What Was Fixed
1. **QuickApplyModal.tsx** - Reduced padding, internal spacing, and added margins
2. **JobSeekersPage.tsx** - Implemented proper scroll lock with event prevention

## The Solution

The scroll locking issue was that using only `document.body.style.overflow = 'hidden'` doesn't actually prevent user scroll events (especially mouse wheel, touchmove, and keyboard scrolling).

### Key Changes Made:

1. **Added `useRef` import**
   ```typescript
   import { useState, useEffect, useRef } from "react";
   ```

2. **Replaced state with ref** for scroll lock (refs are synchronously readable by event listeners):
   ```typescript
   // OLD:
   const [isScrollLocked, setIsScrollLocked] = useState(false);

   // NEW:
   const isScrollLockedRef = useRef(false);
   ```

3. **Added event prevention useEffect**:
   ```typescript
   // Proper scroll lock with event prevention (both desktop and mobile)
   useEffect(() => {
     if (!showTutorial) return;

     // Prevent ALL user-initiated scrolling ONLY when scroll is locked
     const preventScroll = (e: Event) => {
       // Check the ref - if scrolling is allowed for tutorial animation, don't prevent
       if (!isScrollLockedRef.current) return;

       e.preventDefault();
       e.stopPropagation();
       return false;
     };

     const preventKeyScroll = (e: KeyboardEvent) => {
       // Check the ref - if scrolling is allowed for tutorial animation, don't prevent
       if (!isScrollLockedRef.current) return;

       // Prevent arrow keys, page up/down, space, home, end from scrolling
       if ([32, 33, 34, 35, 36, 37, 38, 39, 40].includes(e.keyCode)) {
         e.preventDefault();
       }
     };

     // Add listeners with { passive: false } to allow preventDefault
     document.addEventListener('wheel', preventScroll, { passive: false });
     document.addEventListener('touchmove', preventScroll, { passive: false });
     document.addEventListener('keydown', preventKeyScroll, { passive: false });

     return () => {
       document.removeEventListener('wheel', preventScroll);
       document.removeEventListener('touchmove', preventScroll);
       document.removeEventListener('keydown', preventKeyScroll);
     };
   }, [showTutorial]);
   ```

4. **Updated all `setIsScrollLocked` calls to `isScrollLockedRef.current`**:
   ```typescript
   // In startTutorial():
   isScrollLockedRef.current = true; // Lock scrolling using ref

   // In closeTutorial():
   isScrollLockedRef.current = false; // Unlock scrolling using ref
   ```

5. **Added unlock/lock pairs around `scrollIntoView` calls**:
   ```typescript
   // Before scrolling:
   isScrollLockedRef.current = false; // Unlock for tutorial scroll
   document.body.style.overflow = 'auto';

   element.scrollIntoView({
     behavior: 'smooth',
     block: 'center',
     inline: 'center'
   });

   // After scrolling completes (in setTimeout):
   document.body.style.overflow = 'hidden';
   isScrollLockedRef.current = true; // Re-lock after scroll
   ```

## Remaining Files to Fix

The following files need the same pattern applied:

### 1. **frontend/src/pages/EmployersPage.tsx**
   - Has `isScrollLocked` state on line 47
   - Has tutorial scrolling implementation
   - Needs all 5 changes above

### 2. **frontend/src/pages/PostJob.tsx**
   - Has `isScrollLocked` state on line 56
   - Has tutorial scrolling implementation
   - Needs all 5 changes above

### 3. **frontend/src/pages/EmployerDashboard.tsx**
   - Has `isScrollLocked` state on line 69
   - Has tutorial scrolling implementation
   - Needs all 5 changes above

### 4. **frontend/src/pages/Profile.tsx**
   - Different tutorial implementation (check if it has scrolling)
   - May not need fixing if no programmatic scrolling

### 5. **frontend/src/pages/JobDetail.tsx**
   - Different tutorial implementation (check if it has scrolling)
   - May not need fixing if no programmatic scrolling

## How to Apply the Fix

For each file:

1. Add `useRef` to the imports from React
2. Find the `[isScrollLocked, setIsScrollLocked]` line and replace with the ref
3. Add the new useEffect block with event prevention (after the existing scroll cleanup useEffect)
4. Find all `setIsScrollLocked(true)` and replace with `isScrollLockedRef.current = true`
5. Find all `setIsScrollLocked(false)` and replace with `isScrollLockedRef.current = false`
6. Find all `scrollIntoView` calls and add unlock before + lock after pattern

## Testing

After fixing all files, test:
1. Desktop: Try scrolling with mouse wheel during tutorial
2. Desktop: Try scrolling with keyboard (arrows, page up/down)
3. Mobile: Try swiping to scroll during tutorial
4. Verify tutorial CAN still scroll programmatically to highlight elements
5. Verify scrolling works normally after closing tutorial

## Notes

- The ref approach is critical because event listeners can't access React state synchronously
- The `{ passive: false }` option is required to allow `preventDefault()`
- We temporarily unlock scrolling when the tutorial needs to scroll, then immediately re-lock

## Commit Message Template

```
fix: Apply scroll lock fix to remaining tutorial files

- Add useRef-based scroll lock flag for synchronous access
- Implement wheel, touchmove, and keyboard event prevention
- Unlock/relock around programmatic scrolling
- Fixes scroll prevention on desktop and mobile

Files updated:
- [filename]
```
