// Folio display & directory constants.
//
// The "Folio" is the user's personal data directory — the filesystem layer
// that holds tasks, events, notes, memories, personas, and playbooks as
// plain Markdown files with YAML frontmatter.
//
// The *directory name* is a system constant (too dangerous to let users
// change from UI). The *display name* is configurable from Settings and
// surfaced in agent tool descriptions, the README, and any user-facing
// prose.

/** Default on-disk directory name (used when DEV_LOCAL_PATH is unset). */
export const DEFAULT_FOLIO_DIR = 'dialogue-folio';

/** Default display name when no custom name or user name is available. */
export const FOLIO_DISPLAY_DEFAULT = 'Folio';

/**
 * Derive the user-facing Folio display name.
 *
 * Priority: explicit custom name > "{userName}'s Folio" > "Folio".
 */
export function getFolioDisplayName(
  folioName?: string | null,
  userName?: string | null,
): string {
  if (folioName && folioName.trim()) return folioName.trim();
  if (userName) return `${userName}'s Folio`;
  return FOLIO_DISPLAY_DEFAULT;
}
