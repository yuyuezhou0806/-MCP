import express from 'express';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {createSafetyServer} from './service.mjs';

// No request body, authorization header or model output is logged.
const tokenFile=process.env.SAFETY_TOKENS_FILE;
if(!tokenFile) throw new Error('SAFETY_TOKENS_FILE required');
const port=Number(process.env.PORT??4318);
const host=process.env.SAFETY_PUBLIC_HOST??'tools.mapleai.top';
const app=express(); app.disable('x-powered-by');
const buckets=new Map();let globalWindow=0,globalCount=0;
app.use(async(req,res,next)=>{
  res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');
  if(req.path!=='/safety-mcp') return res.sendStatus(404);
  if(req.headers.host!==host && req.headers.host!==`127.0.0.1:${port}`) return res.sendStatus(403);
  if(req.headers.origin && req.headers.origin!==`https://${host}`) return res.sendStatus(403);
  if(req.url.includes('?')) return res.status(400).json({error:'Use Authorization header, not URL parameters'});
  const now=Math.floor(Date.now()/60000);
  if(globalWindow!==now){globalWindow=now;globalCount=0;buckets.clear();}
  if(++globalCount>1200) return res.status(429).set('Retry-After','60').end();
  const bearer=req.headers.authorization;
  if(!bearer || !/^Bearer [A-Za-z0-9_-]{40,100}$/.test(bearer)) return res.status(401).set('WWW-Authenticate','Bearer').end();
  let entry;
  try {
    const list=JSON.parse(await fs.readFile(tokenFile,'utf8'));
    const digest=createHash('sha256').update(bearer.slice(7)).digest('hex');
    entry=list.find(t=>t.sha256===digest && t.enabled===true && Date.parse(t.expiresAt)>Date.now());
  } catch {return res.sendStatus(503);}
  if(!entry) return res.status(401).set('WWW-Authenticate','Bearer').end();
  const count=(buckets.get(entry.id)??0)+1;buckets.set(entry.id,count);
  if(count>60) return res.status(429).set('Retry-After','60').end();
  next();
});
app.use(express.json({limit:'700kb',strict:true}));
app.post('/safety-mcp',async(req,res)=>{
  const server=createSafetyServer({remote:true});
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  res.on('close',()=>{void transport.close();void server.close();});
  try {await server.connect(transport);await transport.handleRequest(req,res,req.body);}
  catch {if(!res.headersSent)res.status(500).json({error:'Request failed; no safety approval'});}
});
app.all('/safety-mcp',(_req,res)=>res.status(405).set('Allow','POST').end());
app.use((err,_req,res,_next)=>res.status(err.type==='entity.too.large'?413:400).json({error:'Invalid request; check not completed'}));
const listener=app.listen(port,'127.0.0.1',()=>console.error('Safety MCP listening on loopback'));
listener.requestTimeout=30000;listener.headersTimeout=10000;
process.on('SIGTERM',()=>{listener.close(()=>process.exit(0));setTimeout(()=>process.exit(0),10000).unref();});
