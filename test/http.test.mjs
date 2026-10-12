import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomBytes,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
test('HTTP auth, protocol, isolation, size, origin and revocation',async()=>{
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'safety-http-'));
  const token=randomBytes(32).toString('base64url');const tokenFile=path.join(tmp,'tokens.json');
  const entries=[{id:'test',enabled:true,expiresAt:new Date(Date.now()+3600000).toISOString(),sha256:createHash('sha256').update(token).digest('hex')}];
  await fs.writeFile(tokenFile,JSON.stringify(entries));
  const child=spawn(process.execPath,[fileURLToPath(new URL('../http.mjs',import.meta.url))],{env:{...process.env,PORT:'14318',SAFETY_TOKENS_FILE:tokenFile},stdio:['ignore','ignore','pipe']});
  const url='http://127.0.0.1:14318/safety-mcp';
  const client=new Client({name:'http-test',version:'1'});
  try {
    await new Promise((resolve,reject)=>{child.stderr.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(new Error(`Early exit ${code}`)));});
    assert.equal((await fetch(url)).status,401);
    assert.equal((await fetch(url,{headers:{Authorization:'Bearer '+randomBytes(32).toString('base64url')}})).status,401);
    const headers={Authorization:'Bearer '+token};
    assert.equal((await fetch(url,{headers:{...headers,Origin:'https://evil.example'}})).status,403);
    assert.equal((await fetch(url+'?token=bad',{headers})).status,400);
    assert.equal((await fetch(url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({text:'a'.repeat(720000)})})).status,413);
    await client.connect(new StreamableHTTPClientTransport(new URL(url),{requestInit:{headers}}));
    const {tools}=await client.listTools();assert.equal(tools.length,4);assert.ok(!tools.some(t=>t.name==='read_redacted_file'));
    const response=await client.callTool({name:'check_text',arguments:{text:'test@example.com'}});assert.equal(JSON.parse(response.content[0].text).risk,'high');
    entries[0].enabled=false;await fs.writeFile(tokenFile,JSON.stringify(entries));
    assert.equal((await fetch(url,{headers})).status,401);
  } finally {await client.close();child.kill();await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));await fs.rm(tmp,{recursive:true,force:true});}
});
