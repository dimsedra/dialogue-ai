# KPI Tracking & Performance Metrics

## Overview

Transform Dialogue from a simple to-do list into a quantifiable, goal-oriented performance workspace. This feature allows users to designate specific tasks as **Key Performance Indicators (KPIs)**, enabling real-time velocity tracking, agent-led status updates, and analytical discussions about workspace momentum.

Crucially, KPI Tracking operates in deep synergy with **Batch & Complex Planning**. When the AI drafts multi-step roadmaps, it automatically embeds KPI milestones into the staging draft (`stageImplementationPlan`). Upon approval, these metrics flow directly into the user's active KPI dashboard.

## Unified Backend Schema (`convex/schema.ts`)

Extend the `tasks` table to support metric-based tracking seamlessly alongside regular tasks.

```ts
tasks: defineTable({
  // ... existing fields (userId, workspaceId, text, completed, etc.)
  isKpi: v.optional(v.boolean()),           // If true, this task is an active KPI metric
  kpiType: v.optional(v.union(
    v.literal("percentage"),                // 0-100% progress
    v.literal("numeric"),                   // e.g., 6 / 10 lab units completed
    v.literal("boolean")                    // Binary milestone (Done / Not Done)
  )),
  kpiTarget: v.optional(v.number()),         // The goal threshold
  kpiCurrent: v.optional(v.number()),        // Current numeric progress
  kpiUnit: v.optional(v.string()),           // e.g., "labs", "commits", "pages", "calls"
})
```

## Proposed AI Tools

### 1. `updateKpi`

- **Purpose**: Updates the numeric progress of an active KPI task.
- **Parameters**:
  - `taskId`: Unique identifier of the task.
  - `value`: New numeric value for `kpiCurrent`.
  - `comment`: Optional natural language note explaining the progression or blockers.

### 2. `analyzePerformance`

- **Purpose**: Instructs the agent to evaluate all active KPIs and provide a synthesis of current velocity and momentum across projects.
- **Output**: A natural language executive summary paired with a suggested "Visualization Moment" (using `renderChart`).

## UI / UX Integration

### 1. KPI Badging in TaskPanel

- Tasks flagged with `isKpi: true` feature a distinctive gold **Momentum Ring** or **Progress Bar** directly on their list card.
- Hovering or tapping opens a micro-modal showing the delta between `kpiCurrent` and `kpiTarget`.

### 2. Unified Performance & Momentum Dashboard

- Accessible via a dedicated tab in the workspace sidebar.
- Aggregates all KPI tasks into a panoramic velocity chart and milestone scorecard.

## AI Agent Prompt Instructions

Update the agent's persona to actively monitor and reference KPI metrics:

- **Proactive Nudging**: *"Eds, kamu sudah mencapai 80% dari target mingguan 'Latihan Lab CCNA' (8/10 labs). Tinggal 2 lab lagi untuk menyelesaikannya! Mau jadwalkan sesi fokus sore ini?"*
- **Analytical Synthesis**: *"Berdasarkan pelacakan KPI di Proyek E-Commerce, kecepatan belajarmu stabil di angka 2 modul per hari. Puncak produktivitasmu tercatat pada pukul 14:00 - 16:00."*

## Implementation Roadmap

1. **Phase 1: Metric Foundation**: Implement schema extensions and the `updateKpi` tool.
2. **Phase 2: Roadmap Staging Integration**: Connect `stageImplementationPlan` to populate KPI flags during batch roadmap creation.
3. **Phase 3: Visual Momentum UI**: Add progress rings and interactive scorecard components to `TaskPanel.tsx`.
4. **Phase 4: Deep Analytical Charts**: Integrate with `renderChart` to generate dynamic velocity curves over time.
