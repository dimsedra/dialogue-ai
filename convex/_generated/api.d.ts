/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as ai_action from "../ai_action.js";
import type * as ai_providers from "../ai_providers.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as dailySummary from "../dailySummary.js";
import type * as dateMigration from "../dateMigration.js";
import type * as encryption from "../encryption.js";
import type * as events from "../events.js";
import type * as habits from "../habits.js";
import type * as http from "../http.js";
import type * as images from "../images.js";
import type * as messages from "../messages.js";
import type * as messages_internal from "../messages_internal.js";
import type * as migrations from "../migrations.js";
import type * as notes from "../notes.js";
import type * as notifications from "../notifications.js";
import type * as ocean from "../ocean.js";
import type * as ocean_queries from "../ocean_queries.js";
import type * as pageSettings from "../pageSettings.js";
import type * as personas from "../personas.js";
import type * as reflections from "../reflections.js";
import type * as seed from "../seed.js";
import type * as tasks from "../tasks.js";
import type * as timezones from "../timezones.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  ai_action: typeof ai_action;
  ai_providers: typeof ai_providers;
  auth: typeof auth;
  crons: typeof crons;
  dailySummary: typeof dailySummary;
  dateMigration: typeof dateMigration;
  encryption: typeof encryption;
  events: typeof events;
  habits: typeof habits;
  http: typeof http;
  images: typeof images;
  messages: typeof messages;
  messages_internal: typeof messages_internal;
  migrations: typeof migrations;
  notes: typeof notes;
  notifications: typeof notifications;
  ocean: typeof ocean;
  ocean_queries: typeof ocean_queries;
  pageSettings: typeof pageSettings;
  personas: typeof personas;
  reflections: typeof reflections;
  seed: typeof seed;
  tasks: typeof tasks;
  timezones: typeof timezones;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
