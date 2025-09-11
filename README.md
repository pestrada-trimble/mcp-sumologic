# MCP Sumo Logic

A Model Context Protocol (MCP) server that integrates with Sumo Logic's API to perform log searches.

## Features

- Search Sumo Logic logs using custom queries
- Configurable time ranges for searches
- Error handling and detailed logging
- Docker support for easy deployment

## Environment Variables

```env
ENDPOINT=https://api.au.sumologic.com/api/v1  # Sumo Logic API endpoint
SUMO_API_ID=your_api_id                       # Sumo Logic API ID
SUMO_API_KEY=your_api_key                     # Sumo Logic API Key
MASK_SENSITIVE_INFO=true                      # Toggle PII masking (true|false, default true)
```

## Setup

1. Clone the repository
1. Install dependencies:

   ```bash
   npm install
   ```

1. Create a `.env` file with the required environment variables
1. Build the project:

   ```bash
   npm run build
   ```

1. Start the server:

   ```bash
   npm start
   ```

## Docker Setup

1. Build the Docker image:

   ```bash
   docker build -t mcp/sumologic .
   ```

   or

   ```bash
   docker compose build
   ```

1. Run the container (choose one method):

   a. Using environment variables directly:

   ```bash
   docker run -e ENDPOINT=your_endpoint -e SUMO_API_ID=your_api_id -e SUMO_API_KEY=your_api_key mcp/sumologic
   ```

   b. Using a .env file:

   ```bash
   docker run --env-file .env mcp/sumologic
   ```

   or

   ```bash
   docker compose run mcp-sumologic
   ```

   Note: Make sure your .env file contains the required environment variables:

   ```env
   ENDPOINT=your_endpoint
   SUMO_API_ID=your_api_id
   SUMO_API_KEY=your_api_key
   # Optional: disable masking for debugging (NOT recommended in prod)
   MASK_SENSITIVE_INFO=false
   ```

## VS Code MCP Configuration

Add an entry to your VS Code `mcp.json` (or equivalent MCP client configuration) to run this server via Docker. Example snippet:

```jsonc
{
   "MCP_SUMOLOGIC": {
      "command": "docker",
      "args": [
         "run",
         "--rm",
         "-i",
         "--env-file",
         "/${env:HOME}/path/to/your/mcp-sumologic/.env",
         "mcp/sumologic:latest"
      ],
      "type": "stdio"
   }
}
```

Notes:

- Adjust the absolute path to the `.env` file if your project lives elsewhere.
- If you built locally without pushing to a registry, the local `mcp/sumologic:latest` image is used automatically.
- To pin a specific version, retag the image (e.g., `mcp/sumologic:v1`) and update the last argument.

## Usage

The server exposes a `search_sumologic` tool that accepts the following parameters:

- `query` (required): The Sumo Logic search query
- `from` (optional): Start time as ISO 8601 or relative token
- `to` (optional): End time as ISO 8601 or relative token

### Relative Time Format

You can use human-friendly relative offsets instead of full timestamps:

| Token | Meaning              |
|-------|----------------------|
| `-30s`| 30 seconds ago       |
| `-15m`| 15 minutes ago       |
| `-2h` | 2 hours ago          |
| `-3d` | 3 days ago           |
| `-1w` | 1 week ago           |
| `now` | Current time (UTC)   |

Rules:

- If only `from` is a relative token, `to` defaults to `now`.
- If both `from` and `to` are relative they are each resolved relative to now and automatically ordered if reversed.
- Absolute ISO timestamps are still accepted.

### Examples

Absolute range:

```typescript
await search(sumoClient, query, {
   from: '2025-09-09T00:00:00Z',
   to: '2025-09-10T00:00:00Z',
});
```

Last 15 minutes:

```typescript
await search(sumoClient, query, { from: '-15m' }); // to defaults to now
```

Between 2h ago and 30m ago:

```typescript
await search(sumoClient, query, { from: '-2h', to: '-30m' });
```

Past week:

```typescript
await search(sumoClient, query, { from: '-1w' });
```

## Error Handling

The server includes comprehensive error handling and logging:

- API errors are caught and logged with details
- Search job status is monitored and logged
- Network and authentication issues are properly handled

## Development

To run in development mode:

```bash
npm run dev
```

For testing:

```bash
npm test
```
