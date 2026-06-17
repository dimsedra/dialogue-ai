import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const server = new Server(
  { name: 'test-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

const tools = [
  {
    name: 'echo',
    description: 'Echoes back the input message',
    inputSchema: zodToJsonSchema(z.object({
      message: z.string().describe('The message to echo back'),
    })),
  },
  {
    name: 'add',
    description: 'Adds two numbers together',
    inputSchema: zodToJsonSchema(z.object({
      a: z.number().describe('First number'),
      b: z.number().describe('Second number'),
    })),
  },
  {
    name: 'get_date',
    description: 'Returns the current date and time',
    inputSchema: zodToJsonSchema(z.object({})),
  },
  {
    name: 'fail_me',
    description: 'A tool that always fails (for testing error handling)',
    inputSchema: zodToJsonSchema(z.object({
      reason: z.string().optional().describe('Optional custom error message'),
    })),
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'echo':
      return {
        content: [{ type: 'text', text: `Echo: ${args?.message || '(empty)'}` }],
      };
    case 'add': {
      const a = Number(args?.a ?? 0);
      const b = Number(args?.b ?? 0);
      return {
        content: [{ type: 'text', text: `${a} + ${b} = ${a + b}` }],
      };
    }
    case 'get_date':
      return {
        content: [{ type: 'text', text: `Current time: ${new Date().toISOString()}` }],
      };
    case 'fail_me':
      throw new Error(args?.reason || 'Intentional failure for testing');
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
