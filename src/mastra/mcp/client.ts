import { MCPClient } from '@mastra/mcp';
import type { MastraMCPServerDefinition } from '@mastra/mcp';

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  requireToolApproval?: boolean;
}

export function parseMcpServers(preferences?: Record<string, unknown> | null): Record<string, MastraMCPServerDefinition> {
  const raw = preferences?.mcpServers;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const servers: Record<string, MastraMCPServerDefinition> = {};
  for (const [name, config] of Object.entries(raw as Record<string, unknown>)) {
    const c = config as McpServerConfig;
    if (!c.command) continue;
    servers[name] = {
      command: c.command,
      args: c.args || [],
      env: c.env || {},
      requireToolApproval: c.requireToolApproval ?? false,
      forwardInstructions: true,
      instructionsMaxLength: 300,
    };
  }
  return servers;
}

export function createMcpClient(servers: Record<string, MastraMCPServerDefinition>): MCPClient | null {
  if (Object.keys(servers).length === 0) return null;
  return new MCPClient({
    servers,
    timeout: 15_000,
  });
}

export async function getToolsets(client: MCPClient | null): Promise<Record<string, Record<string, unknown>> | null> {
  if (!client) return null;
  try {
    return await client.listToolsets();
  } catch (err) {
    console.error('[MCP] Failed to list toolsets:', err);
    return null;
  }
}
