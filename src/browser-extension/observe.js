(() => {
  const original=window.fetch;
  let org=null,lastPoll=0;
  const valid=/^[a-f0-9-]{36}$/i;
  const windowFields=w=>w&&typeof w==='object'?{utilization:w.utilization,resets_at:w.resets_at}:null;
  function send(kind,id,raw){
    if(!valid.test(id)||!raw||typeof raw!=='object')return;
    const usage=kind==='usage'?Object.fromEntries(['five_hour','seven_day','seven_day_sonnet','seven_day_opus'].map(k=>[k,windowFields(raw[k])])):{windows:{'5h':windowFields(raw.windows?.['5h']),'7d':windowFields(raw.windows?.['7d'])},resolved:{limit:{percent:raw.resolved?.limit?.percent,resets_at:raw.resolved?.limit?.resets_at}}};
    window.postMessage({source:'ai-usage-tracker-claude',report:{kind,orgId:id,usage}},'https://claude.ai');
  }
  async function readJSON(response,id){
    if(!response.ok)return;
    const reader=response.body?.getReader();if(!reader)return;let text='',bytes=0;const decoder=new TextDecoder();
    try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>32768)return;text+=decoder.decode(value,{stream:true});}send('usage',id,JSON.parse(text));}catch{}finally{void reader.cancel().catch(()=>{});}
  }
  async function readStream(response,id){
    const reader=response.body?.getReader();if(!reader)return;
    const decoder=new TextDecoder();let buffer='',skipping=false,bytes=0;
    const line=text=>{if(!text.startsWith('data:'))return;try{const data=JSON.parse(text.slice(5));if(data?.type==='message_limit')send('message_limit',id,data.message_limit);}catch{}};
    try{while(true){const {done,value}=await reader.read();if(done){if(buffer&&!skipping)line(buffer);break;}bytes+=value.byteLength;if(bytes>32*1024*1024)return;buffer+=decoder.decode(value,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){const row=buffer.slice(0,end).trimEnd();buffer=buffer.slice(end+1);if(!skipping&&row.length<=16384)line(row);skipping=false;}if(buffer.length>16384){buffer='';skipping=true;}}}catch{}finally{void reader.cancel().catch(()=>{});}
  }
  async function poll(){
    if(!org||document.hidden||Date.now()-lastPoll<300000)return;
    lastPoll=Date.now();try{const response=await original.call(window,`/api/organizations/${org}/usage`,{credentials:'same-origin',signal:AbortSignal.timeout(15000)});await readJSON(response,org);}catch{}
  }
  window.fetch=async function(...args){
    const response=await original.apply(this,args);
    try {
      const url=new URL(typeof args[0]==='string'?args[0]:args[0].url||args[0].href,location.href);
      if(url.origin!==location.origin)return response;
      const match=url.pathname.match(/^\/api\/organizations\/([a-f0-9-]{36})(?:\/|$)/i);
      if(!match)return response;
      if(org!==match[1]){org=match[1];lastPoll=0;}
      if(url.pathname.endsWith('/usage'))void readJSON(response.clone(),match[1]);
      else if(/\/(?:completion|retry_completion)$/.test(url.pathname)&&response.headers.get('content-type')?.includes('event-stream'))void readStream(response.clone(),match[1]);
      else void poll();
    }catch{}return response;
  };
  setInterval(()=>void poll(),60000);
  document.addEventListener('visibilitychange',()=>void poll());
})();
