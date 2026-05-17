# Responsive Multi-line Chat Input Bar

## Overview

The chat input bar is the primary conduit for human-to-AI communication in Dialogue-AI. Currently, it is implemented as a single-line `<input type="text">`, which restricts users from composing structured, multi-paragraph prompts, itemized lists, or formatted code snippets.

This specification outlines the architecture for upgrading the chat input to an auto-expanding, multi-line `<textarea>` with distinct ergonomic behaviors tailored for desktop and mobile devices.

## Ergonomic & Responsive Goals

1. **Auto-Expanding Content Adaptation**: The input container must fluidly grow vertically as the user types, maintaining a premium look with rounded corners.
2. **Device-Aware Height Limits**:
   - **Desktop (`>= 768px`)**: Expand up to ~160px (5–6 lines) before becoming scrollable.
   - **Mobile (`< 768px`)**: Expand up to ~84px (max 2 lines) before becoming scrollable, preserving crucial viewport space above the virtual keyboard.
3. **Intuitive Key Bindings**:
   - **Desktop**: Pressing `Enter` sends the message. Pressing `Shift + Enter` inserts a newline.
   - **Mobile / Touch**: Pressing `Return` on the virtual keyboard inserts a newline. Users send messages by tapping the dedicated on-screen Send button.
4. **Visual Scroll Affordance**: When content exceeds the maximum height limit, subtle vertical scroll indicators (e.g., animated chevron arrows and top/bottom inner vignette shadows) appear to signify scrollability.
5. **Instant Reset**: Sending the message or clearing input instantly animates the container back to its 1-row base height (~56px).

## Implementation Plan

### 1. Element Transformation (`Chat.tsx`)

- Replace `<input type="text" value={input} ... />` inside the form container with a custom `<textarea ref={textareaRef} rows={1} ... />`.
- Style with Tailwind classes for seamless dark glassmorphism: `bg-[#1a1814]/90 backdrop-blur-xl border border-[#2a2723] rounded-[2rem] px-5 py-4 resize-none leading-relaxed transition-all duration-200 outline-none`.

### 2. Auto-Height Hook Logic

Create a resize handler that synchronizes textarea height with `scrollHeight`:

```ts
const handleInputResize = () => {
  const el = textareaRef.current;
  if (!el) return;
  
  // Determine device breakpoint limit
  const isMobile = window.innerWidth < 768;
  const maxHeight = isMobile ? 84 : 160;
  
  el.style.height = "auto"; // Reset height to recalculate
  const nextHeight = Math.min(Math.max(el.scrollHeight, 56), maxHeight);
  el.style.height = `${nextHeight}px`;
  
  // Set scrollable state for UI indicators
  setIsScrollable(el.scrollHeight > maxHeight);
};
```

### 3. Keyboard Event Handler

Implement distinct desktop vs. mobile keyboard handling:

```ts
const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
  
  if (e.key === "Enter" && !e.shiftKey && !isTouchDevice) {
    e.preventDefault(); // Prevent inserting newline
    if (input.trim() || selectedFiles.length > 0) {
      handleSend(e as unknown as React.FormEvent);
    }
  }
};
```

### 4. Visual Scroll Indicators

When `isScrollable` is true:

- Render a subtle `ChevronsUpDown` icon on the right inner edge next to the Send button.
- Apply top/bottom inner shadow overlays (`pointer-events-none inset-x-0 h-4 bg-gradient-to-b from-[#1a1814] to-transparent`) to indicate hidden overflow text.

## Success Criteria

- [ ] Users can compose multi-line messages with `Shift + Enter` on desktop and `Return` on mobile virtual keyboards.
- [ ] Textarea height smoothly expands as text is added, up to 2 lines on mobile and 5-6 lines on desktop.
- [ ] When maximum height is reached, content becomes scrollable and displays clear visual indicators.
- [ ] Submitting a message resets the input bar to its single-line base height instantly.
