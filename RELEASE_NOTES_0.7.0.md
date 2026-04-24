# Sortlens v0.7.0

## New Features

### Re-apply Previous Tags

- When tagging images sequentially in the lightbox, a new **"Re-apply last tags"** button appears showing tags from the previous image.
- One click applies all previous tags at once — great for batches of similar photos.

### Batch Delete & Move

- Select multiple images with Ctrl+Click / Shift+Click / Ctrl+A, then right-click to **delete or move all selected images** at once.
- Batch toolbar appears when multiple images are selected with Delete and Move to Folder buttons.
- Move to Folder lets you pick or type a destination path and moves all selected files in one operation.

### Lightbox Pagination Fix

- Navigating through images in lightbox preview mode now **pre-fetches the next page** before you hit the boundary.
- No more blank screen or glitches when reaching the end of loaded images — seamlessly loads more.
- Works with both keyboard arrows and on-screen navigation buttons.

### Keyboard Shortcuts

- **Delete / Backspace** — prompt to delete selected image(s)
- **E** — open current image in default editor
- **R** — reveal current image in File Explorer
- **Enter** — open lightbox for focused image
- **Escape** — clear selection or close lightbox
- **Ctrl+A** — select all, **Ctrl+D** — deselect all
- **?** — show keyboard shortcuts reference overlay
- Press the floating keyboard icon in the bottom-right to see all shortcuts at a glance.

### Lightbox Position Counter

- The lightbox info bar now shows your current position (e.g. "42 / 1,203") so you always know where you are in the library.

## Fixes

- Fixed "Re-apply last tags" only applying one tag at a time instead of all tags at once.
