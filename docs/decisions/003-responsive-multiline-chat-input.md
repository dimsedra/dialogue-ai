# Architectural Decision Record: Responsive Multi-line Chat Input Bar

- **ID**: ADR-003
- **Status**: Accepted & Implemented
- **Date**: 2026-05-17
- **Target Component**: `src/components/Chat.tsx`
- **Specification Document**: `docs/future-impl/multiline_chat_bar.md`
- **Related Commit**: `3e224c4` (*feat: implement responsive multiline chat input with pristine UI and mobile autofill suppression*)

---

## 1. Architectural Context & Motivation

### 1.1 Problem Statement

The Dialogue application previously utilized a standard single-line `<input type="text" />` element for chat message composition. As user interactions grew to include complex multi-paragraph instructions, code snippets, and structured prompts, a single-line input became highly restrictive. Users could not preview long queries effectively or insert explicit line breaks.

### 1.2 Design Requirements

To preserve the sleek, minimalist aesthetic while expanding capability, the input bar required an intelligent auto-expanding mechanism with strict ergonomic boundaries:

- **Adaptive Height**: Smoothly expand as content is typed, maintaining a base single-line height of 56px when empty.
- **Device-Aware Thresholds**: Lock at a maximum height of 160px (5-6 lines) on desktop and 84px (2 lines) on mobile to prevent virtual keyboards from occluding the workspace.
- **Ergonomic Button Anchoring**: Fixed action buttons (Add file `+` and Send) must remain anchored at the vertical midpoint of the initial row (`top-[28px]`), ensuring stable positioning as the text column grows downward.
- **Clean Overflow Affordance**: Eliminate blocky native scrollbars that collide with right-side action buttons and avoid text column shadow overlays that darken typing lines, instead relying on animated chevron indicators.

---

## 2. Technical Implementation Details

### 2.1 DOM Structure & Styling

The standard `<input type="text" />` was replaced with an auto-expanding `<textarea>` element:

```tsx
<textarea
  ref={textareaRef}
  name="dialogue-chat-input"
  autoComplete="off"
  autoCorrect="off"
  autoCapitalize="sentences"
  rows={1}
  value={input}
  onChange={(e) => {
    setInput(e.target.value);
    setTimeout(handleInputResize, 0);
  }}
  onKeyDown={handleKeyDown}
  placeholder={!activeSessionId ? "Select a conversation" : isUploading ? "Uploading file..." : "Ask Dialogue..."}
  disabled={!activeSessionId || isUploading}
  style={{ minHeight: "56px" }}
  className="relative w-full bg-[#1a1814]/90 backdrop-blur-xl border border-[#2a2723] text-[#f2efeb] pl-12 lg:pl-14 pr-16 lg:pr-20 py-4 rounded-[2rem] focus:outline-none focus:border-[#d4a373]/40 focus:ring-1 focus:ring-[#d4a373]/20 transition-shadow duration-300 placeholder:text-[#a8a29e]/30 text-sm lg:text-[15px] shadow-2xl resize-none leading-relaxed outline-none scrollbar-none [&::-webkit-scrollbar]:hidden"
/>
```

### 2.2 Dynamic Height Adjustment Hook

A performant `useCallback` hook manages vertical resizing and scroll state evaluation:

```ts
const handleInputResize = useCallback(() => {
  const el = textareaRef.current;
  if (!el) return;
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const maxHeight = isMobile ? 84 : 160;
  el.style.height = "auto";
  const nextHeight = Math.min(Math.max(el.scrollHeight, 56), maxHeight);
  el.style.height = `${nextHeight}px`;
  setIsScrollable(el.scrollHeight > maxHeight);
}, []);
```

### 2.3 Scroll Collision Prevention

When standard Webkit/Windows scrollbars render inside a padded container (`pr-16 lg:pr-20`), they occupy the far right margin where absolute action buttons are positioned. By applying `scrollbar-none [&::-webkit-scrollbar]:hidden`, native scrollbars are completely suppressed. Users navigate smoothly via mousewheel, trackpad drag, or touch swipe, guided strictly by an animated `ChevronsUpDown` icon without intrusive shadow overlays darkening active typing lines.

---

## 3. Verification & Compliance

### 3.1 Compilation & Type Safety

Execution of `npx tsc --noEmit` completed with zero type errors (`Exit code: 0`), confirming robust event handling and ref type definitions.

### 3.2 Success Criteria Attainment

All requirements in `docs/future-impl/multiline_chat_bar.md` have been fully validated and marked as completed.
