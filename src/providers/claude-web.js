import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { CLAUDE_EXTENSION_ID } from './claude-web-config.js';
import { cleanReport } from '../browser-extension/parse.js';
const authKey=id=>`claude-web:${id}`;
export class ClaudeWebBridge {
  constructor(tracker){this.tracker=tracker;this.server=null;this.starting=null;}
  async start(port=this.tracker.store.data.settings.claudeBridgePort||43979){
    if(this.server)return this.port;if(this.starting)return this.starting;
    this.starting=new Promise((resolve,reject)=>{
      const server=http.createServer((request,response)=>void this.request(request,response));
      server.requestTimeout=10000;server.headersTimeout=10000;
      server.once('error',()=>{this.starting=null;reject(new Error('The local Claude connector could not start. Close other tracker instances and try again.'));});
      server.listen(port,'127.0.0.1',()=>{this.server=server;this.port=server.address().port;this.starting=null;this.tracker.store.data.settings.claudeBridgePort=this.port;this.tracker.store.save();resolve(this.port);});
    });return this.starting;
  }
  async prepare(id){
    const a=this.tracker.store.account(id);if(a.provider!=='claude')throw new Error('Select a Claude account.');
    await this.tracker.inflight.get(id);await this.start();
    const token=randomBytes(32).toString('hex');this.tracker.vault.set(authKey(id),token);
    a.claudeWeb={paired:false,orgId:null,pairExpires:Date.now()+10*60000};a.claudeSignedIn=false;a.claudeLocalLinked=false;a.logPath=null;a.tokens=null;a.quotas=[];a.identity=null;a.status='setup';a.error=null;a.lastSuccess=null;
    this.tracker.store.save();this.tracker.changed();return {code:`${this.port}.${token}`};
  }
  findAccount(token){
    if(!/^[a-f0-9]{64}$/.test(token||''))return null;
    for(const a of this.tracker.store.data.accounts){if(a.provider!=='claude'||!a.claudeWeb||!this.tracker.vault.has(authKey(a.id)))continue;try{const saved=this.tracker.vault.get(authKey(a.id));if(saved.length===token.length&&timingSafeEqual(Buffer.from(saved),Buffer.from(token)))return a;}catch{}}
    return null;
  }
  async request(req,res){
    const send=(status,value)=>{if(!res.destroyed){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}};
    if(req.headers.host!==`127.0.0.1:${this.port}`||req.headers.origin!==`chrome-extension://${CLAUDE_EXTENSION_ID}`)return send(403,{error:'Untrusted origin.'});
    res.setHeader('Access-Control-Allow-Origin',`chrome-extension://${CLAUDE_EXTENSION_ID}`);
    if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','POST');res.setHeader('Access-Control-Allow-Headers','authorization,content-type');return send(204,{});}
    if(req.method!=='POST'||!['/pair','/usage'].includes(req.url))return send(404,{});
    const a=this.findAccount(req.headers.authorization?.replace(/^Bearer /,''));if(!a)return send(401,{error:'Reconnect in the desktop app.'});
    try{
      if(req.url==='/pair'){
        if(!a.claudeWeb.paired&&Date.now()>a.claudeWeb.pairExpires)return send(401,{});
        a.claudeWeb.paired=true;a.status='setup';this.tracker.store.save();this.tracker.changed();return send(200,{label:a.label});
      }
      if(!a.claudeWeb.paired)return send(401,{});
      let body='',size=0;
      for await(const chunk of req){size+=chunk.length;if(size>8192){send(413,{});req.destroy();return;}body+=chunk.toString();}
      const report=cleanReport(JSON.parse(body));
      if(!report.quotas.length)return send(422,{error:'No current usage windows.'});
      if(a.claudeWeb.orgId&&a.claudeWeb.orgId!==report.orgId)return send(409,{error:'Account changed.'});
      await this.tracker.inflight.get(a.id);
      if(this.tracker.store.account(a.id)!==a||this.findAccount(req.headers.authorization?.slice(7))!==a)return send(401,{});
      a.claudeWeb.orgId=report.orgId;a.claudeWeb.lastReceived=Date.now();a.quotas=report.quotas;a.status='ready';a.error=null;a.lastSuccess=Date.now();a.identity='Claude website account';a.note='Usage reported by your Claude browser session. Free readings may update after a normal chat response. Local token and time history is separate.';
      this.tracker.store.save();this.tracker.changed();return send(200,{ok:true});
    }catch{return send(400,{error:'Invalid usage reading.'});}
  }
  close(){this.server?.close();this.server?.closeAllConnections();this.server=null;}
}
export function clearClaudeWeb(tracker,id){tracker.vault.remove(authKey(id));delete tracker.store.account(id).claudeWeb;}
