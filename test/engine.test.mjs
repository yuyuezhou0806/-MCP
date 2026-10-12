import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {inspect,validatePolicy,readWorkspaceFile,assessOperation} from '../engine.mjs';
const policy=validatePolicy(JSON.parse(await fs.readFile(new URL('../policy.json',import.meta.url),'utf8')));
test('detects and removes personal information and credentials without partial exposure',()=>{
  const raw='测试邮箱 test@example.com 手机 13800138000 身份证 110101199001010011\napi_key="synthetic-secret-value"\nAuthorization: Bearer synthetic.token.value';
  const r=inspect(raw,policy);
  assert.equal(r.risk,'critical');
  for(const s of ['test@example.com','13800138000','110101199001010011','synthetic-secret-value','synthetic.token.value']) assert.ok(!r.redactedText.includes(s));
});
test('business lines remove adjacent values, not just keywords',()=>{
  assert.equal(inspect('采购底价：1234.56，客户 A\n公开型号 TPS5430',policy).redactedText,'[已脱敏_1]\n公开型号 TPS5430');
});
test('no match is not a safety approval',()=>{
  const r=inspect('TPS5430 数据手册',policy); assert.equal(r.status,'no_rule_match');assert.equal(r.risk,'unknown');
});
test('oversize input fails rather than silently truncating',()=>assert.throws(()=>inspect('x'.repeat(100001),policy)));
test('overlapping matches and unfinished private keys are removed',()=>{
  const r=inspect('密码: sk-abcdefghijklmnopqrstuv\n-----BEGIN PRIVATE KEY-----\nprivate material',policy);
  assert.ok(!r.redactedText.includes('private material'));assert.ok(!r.redactedText.includes('abcdefghijkl'));
});
test('custom company terms mask whole line',()=>assert.equal(inspect('Acme 项目数量 20',{...policy,companyTerms:['ACME']}).redactedText,'[已脱敏_1]'));
test('outbound actions require human review regardless of claimed public classification',()=>assert.equal(assessOperation('send','external','public').decision,'human_review_required'));
test('file boundary, format, byte limits and symlinks',async()=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'safety-mcp-test-')); const root=path.join(base,'workspace');await fs.mkdir(root);
  try {
    await fs.writeFile(path.join(root,'ok.txt'),'test@example.com');
    assert.ok(!(await readWorkspaceFile(root,'ok.txt',policy)).redactedText.includes('@'));
    await fs.writeFile(path.join(base,'outside.txt'),'outside');
    await assert.rejects(readWorkspaceFile(root,'../outside.txt',policy));
    await assert.rejects(readWorkspaceFile(root,path.join(base,'outside.txt'),policy));
    await fs.writeFile(path.join(root,'bad.pdf'),'pdf');await assert.rejects(readWorkspaceFile(root,'bad.pdf',policy));
    await fs.writeFile(path.join(root,'large.txt'),'x'.repeat(400001));await assert.rejects(readWorkspaceFile(root,'large.txt',policy));
    await fs.writeFile(path.join(root,'bad.txt'),Buffer.from([0xff]));await assert.rejects(readWorkspaceFile(root,'bad.txt',policy));
    // Directory junctions work on Windows without administrator symlink privileges.
    await fs.symlink(base,path.join(root,'escape'),process.platform==='win32'?'junction':'dir');
    await assert.rejects(readWorkspaceFile(root,'escape/outside.txt',policy));
  } finally {await fs.rm(base,{recursive:true,force:true});}
});
