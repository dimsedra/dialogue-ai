/**
 * Zero-dependency YAML frontmatter parser and serializer for Markdown files.
 * Designed to handle simple key-value attributes for tasks and events.
 */

export interface ParsedMarkdown {
  metadata: Record<string, any>;
  body: string;
}

/**
 * Parses a markdown string with optional YAML frontmatter.
 */
export function parseMarkdownFile(content: string): ParsedMarkdown {
  const normalized = content.replace(/\r\n/g, '\n');
  
  if (!normalized.startsWith('---\n')) {
    return { metadata: {}, body: normalized };
  }

  const lines = normalized.split('\n');
  const frontmatterLines: string[] = [];
  let bodyStartIndex = -1;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      bodyStartIndex = i + 1;
      break;
    }
    frontmatterLines.push(lines[i]);
  }

  if (bodyStartIndex === -1) {
    // No closing frontmatter boundary found
    return { metadata: {}, body: normalized };
  }

  const body = lines.slice(bodyStartIndex).join('\n');
  const metadata: Record<string, any> = {};

  for (const line of frontmatterLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue; // Skip comments/empty lines

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    let valStr = trimmed.slice(colonIndex + 1).trim();

    // Clean up quotes if present
    if ((valStr.startsWith('"') && valStr.endsWith('"')) || (valStr.startsWith("'") && valStr.endsWith("'"))) {
      valStr = valStr.slice(1, -1);
    }

    // Cast simple types
    let value: any = valStr;
    if (valStr.toLowerCase() === 'null') {
      value = null;
    } else if (valStr.toLowerCase() === 'true') {
      value = true;
    } else if (valStr.toLowerCase() === 'false') {
      value = false;
    } else if (!isNaN(Number(valStr)) && valStr !== '') {
      value = Number(valStr);
    }

    metadata[key] = value;
  }

  return { metadata, body };
}

/**
 * Serializes metadata and body back to a markdown string with frontmatter.
 */
export function serializeMarkdownFile(metadata: Record<string, any>, body: string): string {
  const yamlLines = ['---'];
  
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) continue;
    
    let valStr = '';
    if (value === null) {
      valStr = 'null';
    } else if (typeof value === 'string') {
      // Escape strings containing special characters or newlines
      if (value.includes(':') || value.includes('#') || value.includes('"') || value.includes('\n')) {
        valStr = `"${value.replace(/"/g, '\\"')}"`;
      } else {
        valStr = value;
      }
    } else {
      valStr = String(value);
    }
    
    yamlLines.push(`${key}: ${valStr}`);
  }
  
  yamlLines.push('---');
  
  const trimmedBody = body.replace(/^\n+/, ''); // strip leading newlines from body
  return yamlLines.join('\n') + '\n' + trimmedBody;
}
