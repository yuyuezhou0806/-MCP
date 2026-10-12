import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const config={mcpServers:{'company-safety-assist':{command:process.execPath,args:[path.join(here,'server.mjs')],env:{SAFETY_WORKSPACE:path.join(here,'workspace')}}}};
await fs.writeFile(path.join(here,'workbuddy.local.json'),JSON.stringify(config,null,2)+'\n');
console.log('已生成 workbuddy.local.json。手动合并到客户端配置，不覆盖现有 MCP。');
