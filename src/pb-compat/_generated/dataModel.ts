// PocketBase data model — hand-written types matching pb_migrations/1700000000_init_collections.js.
//
// Why hand-written instead of generated (e.g. pocketbase-typegen)?
//   - Phase 1 of a 6-10 week migration; new tool dependencies are risk.
//   - The migration file is the single source of truth; types mirror it 1:1.
//   - Comments in the migration file reference the Convex field for each PB field,
//     which is a more stable review surface than generated diffs.
//
// Schema fingerprint (must stay in sync with pb_migrations/1700000000_init_collections.js):
//   - 19 app collections (workspaces ... card_state) + 1 new (scheduled_notifications)
//   - 1 users extension (6 fields from @convex-dev/auth)
//   - 4 edge tables kept in LadybugDB (MENTIONS_TASK, MENTIONS_EVENT, MENTIONS_HABIT, BELONGS_TO)
//
// Note: `PbRecordService<T>` is NOT defined in Phase 1. It depends on the
// `pocketbase` npm package, which we deliberately do not add as a dependency
// until Phase 2. Adding the type alias at that point is mechanical.
//
// Run `npm run test` to verify the types compile against the rest of the codebase.

// =============================================================================
// Branded ID type. PB IDs are strings at runtime; this brand gives us
// compile-time checking that we're not putting a workspace ID where a user ID
// belongs. Matches Convex's `Id<T>` semantics.
// =============================================================================

declare const __pbIdBrand: unique symbol;
export type PbId<T extends keyof PbRecordMap = keyof PbRecordMap> =
  string & { readonly [__pbIdBrand]: T };

// Helper for creating a PbId at trust boundaries (e.g. parsing from a URL param).
// The brand is erased at runtime; this is purely a type assertion helper.
export const pbId = <T extends keyof PbRecordMap>(s: string): PbId<T> =>
  s as PbId<T>;

// =============================================================================
// Record shape. PB records have a few system fields (`id`, `collectionId`,
// `collectionName`) plus the user-defined schema fields. We mirror exactly.
// =============================================================================

export interface PbRecord {
  id: PbId;
  _id: PbId;
  collectionId: string;
  collectionName: string;
}

export interface PbUsers extends PbRecord {
  collectionName: "users";
  email: string;
  emailVisibility: boolean;
  verified: boolean;
  // Custom fields from @convex-dev/auth (added in pb_migration):
  name?: string;
  image?: string;
  emailVerificationTime?: number;
  phone?: string;
  phoneVerificationTime?: number;
  isAnonymous?: boolean;
}

export interface PbAgentPersonas extends PbRecord {
  collectionName: "agent_personas";
  user: PbId<"users">;
  name: string;
  prompt: string;
  description?: string;
  isDefault?: boolean;
  createdAt: number;
}

export interface PbWorkspaces extends PbRecord {
  collectionName: "workspaces";
  user: PbId<"users">;
  name: string;
  icon: string;
  color: string;
  context?: string;
  agentName?: string;
  defaultAgentPersona?: PbId<"agent_personas">;
  createdAt: number;
}

export interface PbChatSessions extends PbRecord {
  collectionName: "chat_sessions";
  user: PbId<"users">;
  title?: string;
  workspace?: PbId<"workspaces">;
  agentPersona?: PbId<"agent_personas">;
  timezone?: string;
  createdAt: number;
  lastActivity: number;
  pinned?: boolean;
}

export interface PbMessages extends PbRecord {
  collectionName: "messages";
  session?: PbId<"chat_sessions">;
  text: string;
  author: string;
  timestamp: number;
  timezoneOffset?: number;
  toolCall?: {
    name: string;
    args: unknown;
    result?: unknown;
  };
  toolCalls?: Array<{
    name: string;
    args: unknown;
    result?: unknown;
  }>;
  reasoning?: string;
  storageId?: string; // PB file field — name kept as storageId for Convex parity
  fileType?: string;
  fileName?: string;
  attachments?: Array<{
    storageId: string;
    fileName: string;
    fileType: string;
    extractedText?: string;
  }>;
  scope?: {
    type: "date" | "task" | "event" | "habit";
    id: string;
    title: string;
  };
}

export interface PbTasks extends PbRecord {
  collectionName: "tasks";
  user: PbId<"users">;
  text: string;
  workspace?: PbId<"workspaces">;
  completed: boolean;
  dueDate?: number;
  dueDateStr?: string;
  priority?: "low" | "medium" | "high";
  category?: string;
  notes?: string;
  progress?: number;
  statusHook?: string;
  contextUpdatedAt?: number;
  createdAt: number;
  completedAt?: number;
  resources?: Array<PbResource>;
  reminderOffset?: number;
  scheduledNotificationId?: string;
}

export interface PbUserProfile extends PbRecord {
  collectionName: "user_profile";
  user: PbId<"users">;
  name?: string;
  bio: string;
  preferences: unknown; // v.any() in Convex -> unknown in TS
  weeklyNotesSummaries?: string[];
  monthlyNotesSummaries?: string[];
  behavioralProfile?: string;
  // PB system field, ISO 8601 string. Optional in the type because
  // records seeded outside the SDK (e.g. from fixtures) may not have
  // it. The SDK always populates it on insert.
  created?: string;
}

export interface PbMemories extends PbRecord {
  collectionName: "memories";
  user: PbId<"users">;
  text: string;
  // 384-float vector. PB stores as json; we keep the typed shape because
  // runtime assertions in convex/ai.ts guarantee the length at the boundary.
  embedding: number[];
  hash?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface PbEvents extends PbRecord {
  collectionName: "events";
  user: PbId<"users">;
  title: string;
  description?: string;
  startTime: number;
  endTime?: number;
  eventType?: "interval" | "point";
  location?: string;
  notes?: string;
  outcome?: string;
  statusHook?: string;
  cancelled?: boolean;
  contextUpdatedAt?: number;
  workspace?: PbId<"workspaces">;
  recurrence?: {
    frequency: "daily" | "weekly";
    interval: number;
    daysOfWeek?: number[];
    until?: number;
    untilStr?: string;
    exceptions?: number[];
    exceptionsStr?: string[];
  };
  createdAt: number;
  series?: PbId<"events">;
  resources?: Array<PbResource>;
  reminderOffset?: number;
  scheduledNotificationId?: string;
}

export interface PbReflections extends PbRecord {
  collectionName: "reflections";
  user: PbId<"users">;
  workspace?: PbId<"workspaces">;
  type: "weekly" | "monthly" | "yearly";
  periodStart: number;
  periodStartStr?: string;
  periodEnd: number;
  periodEndStr?: string;
  periodLabel: string;
  summary: string;
  stats: {
    tasksCompleted: number;
    tasksCreated: number;
    eventsAttended: number;
    topCategories?: string[];
    streakDays?: number;
    habitLogsCompleted?: number;
    habitLogsSkipped?: number;
    habitStreakDays?: number;
  };
  userReflection?: string;
  shared?: boolean;
  createdAt: number;
}

export interface PbUserImages extends PbRecord {
  collectionName: "user_images";
  user: PbId<"users">;
  storageId: string; // PB file field
  fileName: string;
  fileType: string;
  createdAt: number;
}

export interface PbHabits extends PbRecord {
  collectionName: "habits";
  user: PbId<"users">;
  workspace?: PbId<"workspaces">;
  name: string;
  description?: string;
  frequency: "daily" | "custom";
  frequencyConfig: {
    daysOfWeek?: number[];
  };
  currentStreak: number;
  longestStreak: number;
  lastLoggedAt?: number;
  lastLoggedDate?: string;
  archived: boolean;
  createdAt: number;
}

export interface PbHabitLogs extends PbRecord {
  collectionName: "habit_logs";
  user: PbId<"users">;
  habit: PbId<"habits">;
  timestamp: number;
  dateString: string;
  status: "completed" | "skipped";
  notes?: string;
}

export interface PbPageSettings extends PbRecord {
  collectionName: "page_settings";
  user: PbId<"users">;
  page: string;
  settings: {
    url?: string;
    storageId?: string;
    opacity: number;
    blur: number;
    grain: number;
    vfxEnabled: boolean;
    vfxColor: string;
    cardBg: string;
    cardOpacity: number;
    cardBlur: number;
    cardBorder: string;
    primaryText: string;
    secondaryText: string;
    accentColor: string;
    cardStyle: "glass" | "solid";
    bubbleStyle?: string;
  };
}

export interface PbSessionSummaries extends PbRecord {
  collectionName: "session_summaries";
  user: PbId<"users">;
  date: string;
  summary: string;
  createdAt: number;
}

export interface PbWeeklyDigests extends PbRecord {
  collectionName: "weekly_digests";
  user: PbId<"users">;
  weekStart: number;
  weekStartStr?: string;
  weekLabel: string;
  digest: string;
  createdAt: number;
}

export interface PbArchivedSummaries extends PbRecord {
  collectionName: "archived_summaries";
  user: PbId<"users">;
  type: "weekly" | "monthly";
  originalDate: number;
  originalDateStr?: string;
  content: string;
  archivedAt: number;
}

export interface PbNotifications extends PbRecord {
  collectionName: "notifications";
  user: PbId<"users">;
  title: string;
  message: string;
  type: "event_remind" | "habit_remind" | "task_remind" | "system";
  read: boolean;
  actionUrl?: string;
  createdAt: number;
}

export interface PbPushSubscriptions extends PbRecord {
  collectionName: "push_subscriptions";
  user: PbId<"users">;
  endpoint: string;
  expirationTime?: number;
  createdAt?: number;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PbCardState extends PbRecord {
  collectionName: "card_state";
  user: PbId<"users">;
  cardType: string;
  cardId?: string;
  dismissedAt?: number;
  snoozedUntil?: number;
  mutedAt?: number;
  lastShownAt?: number;
}

export interface PbScheduledNotifications extends PbRecord {
  collectionName: "scheduled_notifications";
  user: PbId<"users">;
  kind: "event_remind" | "task_remind" | "habit_remind";
  targetId: string;
  triggerAt: number;
  delivered: boolean;
  createdAt: number;
}

// =============================================================================
// Shared nested types.
// =============================================================================

export interface PbResource {
  type: "url" | "document";
  title: string;
  url: string;
  storageId?: string; // PB file field
  summary?: string;
  linkedAt: number;
}

// =============================================================================
// RecordMap. Indexed by collection name. This is the analog of Convex's
// `DataModel` generic parameter; pb-compat hooks use it to type lookups.
// =============================================================================

export interface PbRecordMap {
  users: PbUsers;
  agent_personas: PbAgentPersonas;
  workspaces: PbWorkspaces;
  chat_sessions: PbChatSessions;
  messages: PbMessages;
  tasks: PbTasks;
  user_profile: PbUserProfile;
  memories: PbMemories;
  events: PbEvents;
  reflections: PbReflections;
  user_images: PbUserImages;
  habits: PbHabits;
  habit_logs: PbHabitLogs;
  page_settings: PbPageSettings;
  session_summaries: PbSessionSummaries;
  weekly_digests: PbWeeklyDigests;
  archived_summaries: PbArchivedSummaries;
  notifications: PbNotifications;
  push_subscriptions: PbPushSubscriptions;
  card_state: PbCardState;
  scheduled_notifications: PbScheduledNotifications;
}

export type PbCollectionName = keyof PbRecordMap;

// =============================================================================
// Per-collection RecordService type. NOT defined in Phase 1 — depends on the
// `pocketbase` package, which we add in Phase 2. Re-add as:
//
//   import type { RecordService } from "pocketbase";
//   export type PbRecordService<T extends PbCollectionName> =
//     RecordService<PbRecordMap[T]>;
//
// =============================================================================
