import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {createSafetyServer} from './service.mjs';
await createSafetyServer().connect(new StdioServerTransport());
