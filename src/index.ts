import { config } from 'dotenv';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { search } from '@/domains/sumologic/client.js';
import { parseTimeRange } from '@/utils/time.js';
import * as Sumo from '@/lib/sumologic/client.js';

// Load environment variables from .env file
config();

const sumoClient = Sumo.client({
  endpoint: process.env.ENDPOINT || '',
  sumoApiId: process.env.SUMO_API_ID || '',
  sumoApiKey: process.env.SUMO_API_KEY || '',
});

// Create an MCP server
const server = new McpServer({
  name: 'mcp-sumologic',
  version: '1.0.0',
});

// Add a search tool
server.tool(
  'search_sumologic',
  'Execute a Sumo Logic log search for the given query. Times can be absolute (ISO 8601) or relative like -15m, -2h, -3d, -1w; use "now" as current time. If only from is relative, to defaults to now.',
  {
    query: z.string(),
    from: z.string().optional(),
    to: z.string().optional(),
  },
  async ({ query, from, to }) => {
    try {
      // remove any new lines in the query
      const cleanedQuery = query.replace(/\n/g, '');
      const parsed = parseTimeRange({ from, to });
      const results = await search(sumoClient, cleanedQuery, parsed);

      // Safely stringify the results, handling potential circular references
      const safeStringify = (obj: any) => {
        const seen = new WeakSet();
        return JSON.stringify(
          obj,
          (key, value) => {
            if (typeof value === 'object' && value !== null) {
              if (seen.has(value)) {
                return '[Circular Reference]';
              }
              seen.add(value);
            }
            return value;
          },
          2,
        );
      };

      return {
        content: [
          {
            type: 'text',
            text: safeStringify(results),
          },
        ],
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`,
          },
        ],
      };
    }
  },
);

// Start receiving messages on stdin and sending messages on stdout
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(console.error);

process.stdin.on('close', () => {
  console.error('Sumologic MCP Server closed');
  server.close();
});
