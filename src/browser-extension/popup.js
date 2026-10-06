const status=document.querySelector('#status');
chrome.storage.local.get('status').then(data=>status.textContent=data.status||'Not connected.');
document.querySelector('#pair').addEventListener('submit',async event=>{event.preventDefault();const input=document.querySelector('#code'),code=input.value;input.value='';const result=await chrome.runtime.sendMessage({type:'pair',code});status.textContent=result.ok?'Connected. Sign in on the Claude tab.':result.error;});
document.querySelector('#disconnect').addEventListener('click',async()=>{await chrome.storage.local.clear();status.textContent='Disconnected. You can also revoke this connection in the desktop app.';});
