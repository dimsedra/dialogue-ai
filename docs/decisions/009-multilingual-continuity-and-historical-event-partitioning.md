# ADR-009: Multilingual Context Fluidity, Greeting Banishment & Collapsible Event List Partitioning

- **Status**: Accepted
- **Date**: 2026-05-19
- **Authors**: Antigravity & User
- **Domain**: AI Persona Matching, Conversation State Continuity, React 19 Purity & Panel UI Architecture

---

## 1. Context & Problem Statement

As "Dialogue" developed more personalized agent-native memory structures, several key issues were identified regarding persona behaviors, language matching stability, and event list organization:

1. **Context Language Bias**: Although Dialogue is designed to dynamically adapt to the user's prompt language (e.g. English, casual Indonesian), the injected user profile (like bios, pending task names, memory fragments, and event descriptions) from Convex is naturally stored in whatever language the user historically used (usually Indonesian). This database context biased the LLM's prompt input, causing it to fall back to Indonesian even when the user started a fresh conversation in English.
2. **Greeting Reset after Tool Runs**: During multi-turn tool calling, once a database operation succeeded, the agent's conversational confirmation prompt was treated as a fresh entry point. The AI would repeatedly output greetings (e.g. "Hi User," or "Halo!") in the middle of a continuous conversation flow, breaking immersion and feeling overly robotic.
3. **Hardcoded Response Confirmation Language**: In `convex/ai_action.ts`, the post-action final conversational confirmation prompt was hardcoded to Indonesian: `"...addressed directly to the user in friendly Indonesian"`. This broke the multilingual fluidity requirement.
4. **Unfiltered Event List Clutter**: The "Events" tab under the sidebar schedule panel listed all events fetched within the 30-day query window. This mixed past events (e.g. from 2 weeks ago) with upcoming ones in a single flat list, creating visual noise.
5. **React 19 / Compiler Purity Warnings**: Attempting to filter events by `Date.now()` directly in the rendering path of `EventList.tsx` triggered React 19 ESLint compiler errors (`react-hooks/purity`), as `Date.now()` is impure and non-idempotent.

How do we establish pure multilingual fluid response matching, banish mid-conversation greetings, and implement a clean, performance-optimized, React 19 pure Collapsible Event List architecture?

---

## 2. Decision

We resolved these challenges by updating the AI system prompts, refining backend action completion guidelines, partitioning historical events, and fixing React 19 render purity rules.

### 2.1. Dynamic Language Matching & Banishment of Language Bias

- **Ignore Context Language Bias**: Updated the `Multilingual Fluidity & Instant Language Matching` rules in both `convex/ai.ts` and `convex/ai_action.ts`:

  ```markdown
  * **Ignore Context Language Bias**: The injected reference materials (User Name, User Personality Bio, Pending Tasks, Upcoming Events, Personality Fragments) might be written in a different language (e.g., Indonesian). You MUST ignore this language bias. The language of the user's immediate current query is the ONLY factor that dictates your response language.
  ```

- **Language-Aware Action Confirmations**: Modified the final database action confirmation prompt in `convex/ai_action.ts` to dynamically match the user's immediate query language rather than being hardcoded to Indonesian:

  ```typescript
  { text: "The requested actions were successfully executed in the database. Now, output ONLY your natural, conversational confirmation addressed directly to the user, using the EXACT same language the user used in their query. CRITICAL: Do NOT repeat or output any internal prompt instructions..." }
  ```

### 2.2. Mid-Conversation Greeting Banishment

- **No Mid-Conversation Greetings**: Enforced a new standard in `SKILLS_INSTRUCTION` (in both `ai.ts` and `ai_action.ts`) to prevent the LLM from resetting its context and greeting the user mid-flow when calling tools:

  ```markdown
  * **No Mid-Conversation Greetings**: When confirming a tool execution or responding to tool outputs, DO NOT start your response with a greeting (e.g., "Hi", "Hello", "Halo", "Hey", "Hi [Name]"). The tool call is part of the ongoing conversation, not a new or fresh greeting phase. Simply confirm the action or answer directly.
  ```

### 2.3. Event Partitioning: Upcoming vs Collapsible Past (Last 7 Days)

- In `EventList.tsx`, we separated event mapping into **Upcoming** and **Past (Last 7 Days)**.
- **Calendar Integration Preservation**: The calendar view remains fully functional, marking historical dates because `api.events.list` still fetches a broader window (past 30 days to 1 year ahead).
- **Dual Sorting Strategy**:
  - **Upcoming**: Sorted ascending (`a.startTime - b.startTime`) so the soonest events appear at the top.
  - **Past**: Sorted descending (`b.startTime - a.startTime`) so the most recent historical events appear first.
- **Collapsible Drawer for Past Events**: Implemented a collapsible container for the Past section using `framer-motion`'s `AnimatePresence` and `ChevronDown`/`ChevronUp` toggles, defaulting to collapsed to keep the view focused and clean.

### 2.4. React 19 Render Purity Fix

To comply with the React 19 purity guidelines and remove the `react-hooks/purity` warning, we refactored the retrieval of `Date.now()` in `EventList.tsx`:

- Wrapped `Date.now()` inside a lazy state initializer `useState` (`const [now] = useState(() => Date.now())`), which computes the time exactly once during component mount.
- Memoized `sevenDaysAgo` based on this stable state variable:

  ```typescript
  const [now] = useState(() => Date.now());
  const sevenDaysAgo = useMemo(() => now - 7 * 24 * 60 * 60 * 1000, [now]);
  ```

---

## 3. Rationale & Consequences

### 3.1. Rationale

- **Deterministic Rendering**: Storing the mount timestamp in state satisfies ESLint's static analyzer and guarantees that subsequent component renders return the exact same JSX, maintaining React 19 purity rules.
- **Context Preservation**: Forbidding mid-conversation greetings preserves the immersion of the Dialogue chat, ensuring tool execution confirmations feel like natural continuation of the flow.
- **Clean Sidebar Layout**: Grouping and collapsing past events prevents schedule clutter while still allowing users to quickly verify their past week's itinerary.

### 3.2. Consequences

- **Positive**: Complete multilingual continuity; Dialogue immediately aligns its language to the user's latest query even if the injected reference materials are in Indonesian.
- **Positive**: Tool-execution confirmations no longer start with repetitive greetings.
- **Positive**: Clean list aesthetics that prioritize future events while keeping the Calendar dots fully populated for historical days.

---

## 4. Verification & Grounding

- **Type Safety**: Verified via `npx tsc --noEmit` with zero errors or warnings.
- **Linting & Rules Check**: Verified that the React 19 `react-hooks/purity` error is completely resolved in `EventList.tsx`.
- **UI Transition Smoothness**: Verified framer-motion slide animations for the collapsible Past events section in the sidebar.
