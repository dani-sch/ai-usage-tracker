import { cleanReport } from './parse.js';
chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
const note=async text=>chrome.storage.local.set({status:text});
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  const work=async()=>{
    if(message.type==='pair'&&sender.id===chrome.runtime.id&&sender.url===chrome.runtime.getURL('popup.html')){
      const match=typeof message.code==='string'&&message.code.trim().match(/^(\d{1,5})\.([a-f0-9]{64})$/);
      if(!match||Number(match[1])<1024||Number(match[1])>65535)throw new Error('Paste the connection code from the desktop app.');
      const connection={port:Number(match[1]),token:match[2]};
      const response=await fetch(`http://127.0.0.1:${connection.port}/pair`,{method:'POST',headers:{Authorization:`Bearer ${connection.token}`},signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw new Error('Connection code expired or the desktop app is unavailable. Create a new code in the app.');
      const data=await response.json();
      await chrome.storage.local.set({connection,status:`Connected to ${data.label}. Open Claude and use it normally to receive a reading.`});
      await chrome.tabs.create({url:'https://claude.ai/'});return;
    }
    if(message.type==='reading'&&sender.tab&&new URL(sender.url).origin==='https://claude.ai'){
      const {connection}=await chrome.storage.local.get('connection');if(!connection)return;
      const cleaned=cleanReport(message.report);if(!cleaned.quotas.length){await note('Waiting for a usage reading. Free accounts may report it after a normal chat response.');return;}
      const response=await fetch(`http://127.0.0.1:${connection.port}/usage`,{method:'POST',headers:{Authorization:`Bearer ${connection.token}`,'Content-Type':'application/json'},body:JSON.stringify({kind:'usage',orgId:cleaned.orgId,usage:Object.fromEntries(cleaned.quotas.map(q=>[q.key,{utilization:100-q.remainingPercent,resets_at:new Date(q.resetsAt).toISOString()}]))}),signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw new Error(response.status===409?'Claude account changed. Reconnect this account in the tracker.':'Desktop connection unavailable. Open the app or reconnect.');
      await note(`Usage sent at ${new Date().toLocaleTimeString()}. No chat text was sent.`);
    }
  };
  work().then(()=>reply({ok:true})).catch(async e=>{await note(e.message?.includes('fetch')?'Open the desktop app to resume updates.':e.message);reply({ok:false,error:e.message});});return true;
});
