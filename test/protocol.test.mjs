import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
test('real MCP initialization, discovery, calls and validation',async()=>{
  const client=new Client({name:'safety-assist-test',version:'1.0.0'});
  const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../server.mjs',import.meta.url))],stderr:'pipe'});
  try {
    await client.connect(transport);
    const {tools}=await client.listTools();assert.equal(tools.length,5);
    const read=async(name,args={})=>JSON.parse((await client.callTool({name,arguments:args})).content[0].text);
    assert.equal((await read('get_safety_policy')).mode,'local-stdio');
    const report=await read('check_text',{text:'api_key="synthetic-secret-value"'});
    assert.equal(report.risk,'critical');assert.ok(!JSON.stringify(report).includes('synthetic-secret-value'));assert.ok(!('redactedText' in report));
    assert.equal((await read('redact_text',{text:'test@example.com'})).redactedText,'[已脱敏_1]');
    assert.equal((await read('assess_operation',{operation:'upload',destination:'external',classification:'unknown'})).decision,'human_review_required');
    const missing=await client.callTool({name:'read_redacted_file',arguments:{relativePath:'../outside.txt'}});assert.equal(missing.isError,true);
    const invalid=await client.callTool({name:'assess_operation',arguments:{operation:'approve'}});assert.equal(invalid.isError,true);
  } finally {await client.close();}
});
