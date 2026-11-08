/* Save the submission before sending; never persist a LINE token or a stale balance. */
(function(root){
 'use strict';
 const labels={workClockIn:'上番報告',workClockOut:'下番報告',workProvisionalOut:'仮下番報告',saveTransportation:'交通費申請',employeeDailyApply:'日払い申請',saveExpense:'経費申請',saveDailyReport:'警備日報',saveShiftRequests:'シフト申請',registerStaffName:'氏名登録'};
 function createJournal(store){
  const running=new Map();
  async function execute(uid,method,data,send,notify){
   if(!labels[method]||!uid)return send(method,data);
   const payload=JSON.parse(JSON.stringify(data));delete payload.idToken;delete payload.id_token;
   const id=String(data.requestId||data.workId||'registration'),key=JSON.stringify([uid,method,id]);
   if(running.has(key))return running.get(key);
   const job=(async()=>{
    let previous;try{previous=await store.get(key);}catch(e){throw Error('送信内容を端末に保存できませんでした。ブラウザの保存設定を確認してください。申請はまだ送信していません。');}
    if(previous&&previous.state==='pending'&&JSON.stringify(previous.payload)!==JSON.stringify(payload))throw Error('同じ勤務の確認待ちの報告があります。先に「受付確認・同じ内容で再送」で確認してください。');
    const record={key,uid,method,payload,state:'pending',created:previous?.created||Date.now(),updated:Date.now()};
    try{await store.put(record);}catch(e){throw Error('送信内容を端末に保存できませんでした。空き容量やブラウザ設定を確認してください。申請はまだ送信していません。');}
    notify?.('saving',record);
    const timer=typeof root.setTimeout==='function'?root.setTimeout(()=>notify?.('waiting',record),8000):null;
    try{
     const result=await send(method,data);
     if(result===undefined||result===null||result.complete===false)throw Error('保存結果を確認できませんでした。同じ内容で受付を確認してください。');
     const receipt={...record,state:'received',message:typeof result==='string'?result:String(result.message||'受付結果を受信しました。'),receipt:result.receipt||'',updated:Date.now()};delete receipt.payload;
     // A failed local acknowledgement must not turn a server success into a failed application.
     try{await store.put(receipt);}catch(e){notify?.('ack-storage-failed',record);}
     notify?.('received',receipt);return result;
    }catch(e){notify?.('unconfirmed',record);throw e;}finally{if(timer!==null)root.clearTimeout(timer);}
   })();running.set(key,job);try{return await job;}finally{running.delete(key);}
  }
  return {execute,running,list:uid=>store.list(uid),remove:key=>store.remove(key)};
 }
 function browserStore(){
  let opened;
  function open(){if(!opened)opened=new Promise((resolve,reject)=>{
   if(!root.indexedDB)return reject(Error('IndexedDB unavailable'));
   const req=root.indexedDB.open('shishidogumi-submissions-v1',1);
   req.onupgradeneeded=()=>req.result.createObjectStore('submissions',{keyPath:'key'});
   req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();opened=null;};resolve(req.result);};req.onerror=()=>{opened=null;reject(req.error);};req.onblocked=()=>{opened=null;reject(Error('Storage blocked'));};
  });return opened;}
  async function operation(mode,fn){const db=await open();return new Promise((resolve,reject)=>{
   let tx;try{tx=db.transaction('submissions',mode,{durability:'strict'});}catch(e){tx=db.transaction('submissions',mode);}
   let value;const req=fn(tx.objectStore('submissions'));req.onsuccess=()=>value=req.result;tx.oncomplete=()=>resolve(value);tx.onabort=tx.onerror=()=>reject(tx.error||Error('Storage failed'));
  });}
  return {get:key=>operation('readonly',s=>s.get(key)),put:value=>operation('readwrite',s=>s.put(value)),remove:key=>operation('readwrite',s=>s.delete(key)),list:async uid=>(await operation('readonly',s=>s.getAll())).filter(r=>r.uid===uid)};
 }
 const storeForBrowser=browserStore();let config=null,uiBusy=false,journal=createJournal(storeForBrowser);
 function identity(){return config?.userId||root.SHISHIDOGUMI_BOOTSTRAP?.currentUser?.userId||'';}
 function banner(text){if(!root.document?.body)return;let el=root.document.getElementById('submissionSaveStatus');if(!el){el=root.document.createElement('p');el.id='submissionSaveStatus';el.setAttribute('role','status');el.style.cssText='position:sticky;top:0;z-index:10000;background:#fff2c6;color:#4c3600;border:2px solid #d8a400;padding:14px;font-weight:bold;white-space:pre-line';root.document.body.prepend(el);}el.textContent=text;el.hidden=!text;}
 async function render(){
  if(!config||!root.document?.body)return;let rows;try{rows=await journal.list(identity());}catch(e){return;}
  let el=root.document.getElementById('submissionRecovery');if(!el){el=root.document.createElement('section');el.id='submissionRecovery';el.style.cssText='border:2px solid #d8a400;padding:14px;margin:12px 0;background:#fff9e8;border-radius:8px';root.document.body.prepend(el);}
  el.replaceChildren();const pending=rows.filter(r=>r.state==='pending'),recent=rows.filter(r=>r.state==='received'&&r.receipt&&r.method==='saveDailyReport');el.hidden=!pending.length&&!recent.length;
  if(el.hidden)return;const title=root.document.createElement('strong');title.textContent=pending.length?'受付結果を確認できていない申請があります':'保存済み日報の会社名・現場名の確認';el.append(title);
  for(const r of pending.concat(recent.slice(-1))){
   const line=root.document.createElement('p');line.textContent=labels[r.method]+' ／ '+new Date(r.created).toLocaleString('ja-JP')+(r.payload?.amount?' ／ '+Number(r.payload.amount).toLocaleString('ja-JP')+'円':'');el.append(line);
   if(r.state==='pending'){const button=root.document.createElement('button');button.type='button';button.textContent='受付確認・同じ内容で再送';button.disabled=uiBusy||journal.running.has(r.key);button.onclick=async()=>{
    if(uiBusy||journal.running.size||typeof root.applicationSaving_==='function'&&root.applicationSaving_())return;uiBusy=true;button.disabled=true;
    try{const token=config.token();if(!token)throw Error('LINEから開き直してください。');const result=await run(r.method,{...r.payload,idToken:token});root.dispatchEvent(new CustomEvent('shishidogumi-recovered',{detail:{method:r.method,result}}));banner(typeof result==='string'?result:result.message||'受付結果を確認しました。');}
    catch(e){banner(e.message||'受付結果を確認できませんでした。内容は端末に保持されています。');}
    finally{uiBusy=false;render();}
   };el.append(button);}
   else{const button=root.document.createElement('button');button.type='button';button.textContent='日報の会社名・現場名を確認する';button.onclick=()=>root.dispatchEvent(new CustomEvent('shishidogumi-recovered',{detail:{method:r.method,result:{receipt:r.receipt}}}));el.append(button);}
  }
  for(const r of rows)if(r.state==='received'&&Date.now()-r.updated>7*86400000)journal.remove(r.key).catch(()=>{});
 }
 function notify(state){if(state==='saving')banner('送信中です。まだ保存完了ではありません。\n受付結果が表示されるまでお待ちください。');if(state==='waiting')banner('保存の確認に時間がかかっています。まだ完了していません。\n送信内容は端末に保存済みです。画面を閉じた場合は、開き直して受付結果を確認してください。');if(state==='unconfirmed')banner('受付結果を確認できませんでした。送信内容は端末に保持されています。\n「受付確認・同じ内容で再送」で確認してください。');if(state==='received')banner('');render();}
 async function run(method,data,send){return journal.execute(identity(),method,data,send||config.send,notify);}
 function attach(value){config=value;render();}
 async function finishReport(receipt){for(const r of await journal.list(identity()))if(r.state==='received'&&r.receipt===receipt){r.receipt='';await storeForBrowser.put(r);}render();}
 root.SHISHIDOGUMI_RECOVERY={createJournal,browserStore,attach,run,isWrite:method=>!!labels[method],render,isSaving:()=>journal.running.size>0,finishReport};
 root.addEventListener?.('beforeunload',e=>{if(journal.running.size){e.preventDefault();e.returnValue='';}});
 root.document?.addEventListener('visibilitychange',()=>{if(root.document.visibilityState==='visible')render();});
})(typeof window!=='undefined'?window:globalThis);
