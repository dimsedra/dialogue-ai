import { describe, expect, test } from 'vitest';
import { parseMarkdownFile, serializeMarkdownFile } from './parser';
import { resolveEntityFromPath } from './sync';

describe('Markdown Parser & Serializer', () => {
  test('parses markdown with YAML frontmatter correctly', () => {
    const content = `---
id: task-123
title: Buy milk
completed: false
dueDate: 2026-06-12T00:00:00.000Z
priority: high
progress: 42
---
This is the markdown body.
It has multiple lines.
`;
    const parsed = parseMarkdownFile(content);
    expect(parsed.metadata.id).toBe('task-123');
    expect(parsed.metadata.title).toBe('Buy milk');
    expect(parsed.metadata.completed).toBe(false);
    expect(parsed.metadata.priority).toBe('high');
    expect(parsed.metadata.progress).toBe(42);
    expect(parsed.body.trim()).toBe('This is the markdown body.\nIt has multiple lines.');
  });

  test('parses markdown without frontmatter correctly', () => {
    const content = 'This is a simple file without frontmatter.';
    const parsed = parseMarkdownFile(content);
    expect(parsed.metadata).toEqual({});
    expect(parsed.body).toBe(content);
  });

  test('serializes metadata and body back to markdown correctly', () => {
    const metadata = {
      id: 'task-123',
      title: 'Buy milk',
      completed: false,
      priority: 'high',
      progress: 42,
    };
    const body = 'This is the markdown body.';
    const serialized = serializeMarkdownFile(metadata, body);
    expect(serialized).toContain('---');
    expect(serialized).toContain('id: task-123');
    expect(serialized).toContain('title: Buy milk');
    expect(serialized).toContain('completed: false');
    expect(serialized).toContain('priority: high');
    expect(serialized).toContain('progress: 42');
    expect(serialized.trim().endsWith(body)).toBe(true);
  });
});

describe('Path to Entity Resolver', () => {
  const folioRoot = 'C:/Users/user/Dialogue Folio';

  test('resolves global tasks', () => {
    const resolved = resolveEntityFromPath(
      'C:/Users/user/Dialogue Folio/tasks/task-lh7p5oqw2n8xxyz.md',
      folioRoot
    );
    expect(resolved).toEqual({
      id: 'lh7p5oqw2n8xxyz',
      collectionName: 'tasks',
      workspaceId: null,
    });
  });

  test('resolves workspace events', () => {
    const resolved = resolveEntityFromPath(
      'C:/Users/user/Dialogue Folio/work-123/events/event-lh7p5oqw2n8xxyz.md',
      folioRoot
    );
    expect(resolved).toEqual({
      id: 'lh7p5oqw2n8xxyz',
      collectionName: 'events',
      workspaceId: 'work-123',
    });
  });

  test('ignores files outside tasks/events', () => {
    const resolved = resolveEntityFromPath(
      'C:/Users/user/Dialogue Folio/notes/note-123.md',
      folioRoot
    );
    expect(resolved).toBeNull();
  });
});
