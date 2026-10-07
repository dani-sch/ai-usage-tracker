window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!=='https://claude.ai'||event.data?.source!=='ai-usage-tracker-claude')return;
  const report=event.data.report;
  if(!report||JSON.stringify(report).length>8192)return;
  chrome.runtime.sendMessage({type:'reading',report}).catch(()=>{});
});
