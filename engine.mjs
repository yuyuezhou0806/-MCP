import fs from 'node:fs/promises';
import path from 'node:path';

export const LIMITATION = '辅助检查，不是安全认证或审批。规则可能漏报和误报；未命中不代表安全。不能拦截其他工具或撤回已交给模型的数据。';
export function validatePolicy(p) {
  for (const k of ['sensitiveTerms', 'companyTerms']) {
    if (!Array.isArray(p[k]) || p[k].length > 500 || p[k].some(x => typeof x !== 'string' || !x.trim() || x.length > 100)) throw new Error('Invalid policy terms');
  }
  if (typeof p.version !== 'string' || !Number.isInteger(p.maxCharacters) || p.maxCharacters < 1 || p.maxCharacters > 100000 || !Number.isInteger(p.maxFileBytes) || p.maxFileBytes < 1 || p.maxFileBytes > 400000) throw new Error('Invalid policy limits');
  return p;
}
const patterns = [
  ['private_key', 'critical', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|$)/g],
  ['credential', 'critical', /\b(?:AKID[A-Za-z0-9]{12,}|sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g],
  ['credential_assignment', 'critical', /(?:["']?\b(?:api[_-]?key|secret(?:[_-]?key|[_-]?id)?|access[_-]?token|refresh[_-]?token|password|passwd|authorization)\b["']?|密码|密钥|令牌)\s*[:=：]\s*(?:"[^"\r\n]+"|'[^'\r\n]+'|[^\s,;，；}\]]+)/gi],
  ['bearer_token', 'critical', /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi],
  ['identity_number', 'high', /(?<!\d)[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)/g],
  ['phone', 'high', /(?<!\d)(?:\+?86[- .]?)?1[3-9]\d[- .]?\d{4}[- .]?\d{4}(?!\d)/g],
  ['email', 'high', /[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/gi],
];
export function inspect(text, policy) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('请输入非空文本');
  if (text.length > policy.maxCharacters) throw new Error('文本超出检查上限，请缩小任务；未执行检查');
  const hits = [];
  for (const [kind, severity, regex] of patterns) {
    for (const m of text.matchAll(new RegExp(regex.source, regex.flags))) hits.push({ kind, severity, start: m.index, end: m.index + m[0].length });
  }
  // A sensitive keyword makes its entire line sensitive: removing the word alone leaves prices/names exposed.
  let offset = 0;
  for (const line of text.split('\n')) {
    const lower = line.toLocaleLowerCase();
    if ([...policy.sensitiveTerms, ...policy.companyTerms].some(term => lower.includes(term.toLocaleLowerCase()))) hits.push({kind:'business_sensitive_line', severity:'high', start:offset, end:offset+line.length});
    offset += line.length + 1;
  }
  const summary = {};
  for (const h of hits) summary[h.kind] = (summary[h.kind] ?? 0) + 1;
  const ranges = [];
  for (const h of [...hits].sort((a,b) => a.start-b.start || b.end-a.end)) {
    const last = ranges.at(-1);
    if (last && h.start <= last.end) last.end = Math.max(last.end, h.end);
    else ranges.push({start:h.start,end:h.end});
  }
  let redacted = '', cursor = 0;
  for (const [i,r] of ranges.entries()) { redacted += text.slice(cursor,r.start) + `[已脱敏_${i+1}]`; cursor=r.end; }
  redacted += text.slice(cursor);
  return {
    policyVersion: policy.version,
    status: hits.length ? 'review_required' : 'no_rule_match',
    risk: hits.some(h=>h.severity==='critical') ? 'critical' : hits.length ? 'high' : 'unknown',
    findings: summary,
    redactedText: redacted,
    limitation: LIMITATION,
    nextStep: hits.length ? '暂停对外发送，检查脱敏结果与上下文；真实泄露的凭据应由本人撤销。' : '仅完成规则检查，仍需人工确认资料分类、用途和接收方。'
  };
}
export function assessOperation(operation, destination, classification) {
  const sensitive = classification !== 'public';
  const consequential = ['send','upload','delete','overwrite','payment','execute'].includes(operation);
  return { decision: consequential || sensitive ? 'human_review_required' : 'advisory_only',
    operation, destination, classification,
    reasons: [ ...(sensitive ? ['内部、保密或未知分类的资料需确认授权范围'] : []), ...(consequential ? ['发送、上传、破坏性修改、付款或命令执行需本人确认'] : []) ],
    limitation: '该结果只给建议，不授予权限、不记录审批、不执行或阻断操作。用途与分类由调用方提供，不能视为可信事实。' };
}
export async function readWorkspaceFile(root, relativePath, policy) {
  if (!relativePath || path.isAbsolute(relativePath) || /^[A-Za-z]:/.test(relativePath) || relativePath.includes(':')) throw new Error('只接受工作目录内相对路径');
  const actualRoot = await fs.realpath(root);
  const target = await fs.realpath(path.resolve(actualRoot,relativePath));
  const rel = path.relative(actualRoot,target);
  if (!rel || rel === '..' || rel.startsWith('..'+path.sep) || path.isAbsolute(rel)) throw new Error('路径超出工作目录');
  if (!['.txt','.md','.csv','.json'].includes(path.extname(target).toLowerCase())) throw new Error('仅支持 UTF-8 txt/md/csv/json；PDF、Office、图片未检查');
  const handle = await fs.open(target, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > policy.maxFileBytes) throw new Error('文件类型或大小不符合限制');
    const buffer=Buffer.alloc(policy.maxFileBytes+1);
    let total=0;
    while(total<buffer.length) {const {bytesRead}=await handle.read(buffer,total,buffer.length-total,null);if(!bytesRead)break;total+=bytesRead;}
    if(total>policy.maxFileBytes) throw new Error('文件超过大小上限');
    const text = new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,total));
    if(text.includes('\0')) throw new Error('不支持二进制文件');
    return inspect(text, policy);
  } finally { await handle.close(); }
}
