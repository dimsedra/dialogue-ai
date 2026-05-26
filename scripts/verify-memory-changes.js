// Verification commands for memory features
//
// Step 1: Get this week's timestamps
//   node scripts/compute-week.js
//   → outputs periodStart and periodEnd numbers
//
// Step 2: Replace <periodStart> and <periodEnd> below, then run:

// =============================================
// 1. Verify reflection stats (includes habits)
// =============================================
npx convex run --prod reflections:compileReflectionStats '{ "type": "weekly", "periodStart": <periodStart>, "periodEnd": <periodEnd> }'
// Expected: returns { tasksCompleted, habitLogsCompleted, habitStreakDays, ... }

// =============================================
// 2. Check your taskModels config
// =============================================
npx convex run --prod ai:getProfile '{}'
// Expected: preferences.taskModels contains reflection, ocr, title

// =============================================
// 3. Check habit logs with timestamped notes
// =============================================
npx convex run --prod habits:getHabits '{ "todayDateString": "2026-05-26" }'
// Expected: notes fields start with [YYYY-MM-DD HH:mm]

// =============================================
// 4. Check cancelled recurring events
// =============================================
npx convex run --prod events:list '{}'
// Expected: cancelled occurrences appear with cancelled: true
