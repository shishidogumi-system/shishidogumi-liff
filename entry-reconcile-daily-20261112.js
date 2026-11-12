'use strict';
const LIFF_ID='2011785712-iKJrxFMX';
const GAS_URL='https://script.google.com/macros/s/AKfycbwOWN-SCM1YsM-UgTDYYHQUAag5WZI0J4OMgtQZNnzuVjaafc98ZbEdfa8hIfUMQ3F16A/exec';
    function getAllowedPage(value) {
      const allowed = ['transport', 'daily', 'report', 'expense', 'shift', 'work'];
      return allowed.includes(value) ? value : null;
    }

    function getPage() {
      const searchParams = new URLSearchParams(window.location.search);
      let page = getAllowedPage(searchParams.get('page'));
      if (page) { startupStorage_('shishidogumi-startup-page',page); return page; }

      const state = searchParams.get('liff.state');
      if (state) {
        let decoded = state;
        for (let i = 0; i < 3; i++) {
          try {
            const next = decodeURIComponent(decoded);
            if (next === decoded) break;
            decoded = next;
          } catch (error) {
            break;
          }
        }
        const match = decoded.match(
          /(?:[?&]|%3F|%26)page(?:=|%3D)(transport|daily|report|expense|shift|work)/
        );
        if (match) {
          page = getAllowedPage(match[1]);
          if (page) { startupStorage_('shishidogumi-startup-page',page); return page; }
        }
        try {
          const stateUrl = new URL(decoded, window.location.origin);
          page = getAllowedPage(stateUrl.searchParams.get('page'));
          if (page) { startupStorage_('shishidogumi-startup-page',page); return page; }
        } catch (error) {}
      }
      const saved=startupStorage_('shishidogumi-startup-page');if(searchParams.has('code')&&searchParams.has('liffClientId')&&getAllowedPage(saved))return saved;return 'transport';
    }


function startupStorage_(key,value){try{if(arguments.length>1)sessionStorage.setItem(key,value);else return sessionStorage.getItem(key);}catch(e){}return null;}
const retryableReads_=new Set(['employeeDailySummary','employeePayDetails','workSubmissionReceipt','bootstrap','employeeShiftState','workReportState','employeeDailyBalance','dailyApplicationSummary','reportNamesStatus','reportNamesPhoto']);
const inFlightReads_=new Map();let readEpoch_=0;
async function pagesRequest_(method,data){
 const recovery=typeof window!=='undefined'&&window.SHISHIDOGUMI_RECOVERY;
 if(retryableReads_.has(method)){
  const key=readEpoch_+':'+method+':'+JSON.stringify(data);
  if(inFlightReads_.has(key))return inFlightReads_.get(key);
  const promise=pagesRequestRaw_(method,data).finally(()=>{if(inFlightReads_.get(key)===promise)inFlightReads_.delete(key);});
  inFlightReads_.set(key,promise);return promise;
 }
 // A read begun before a save must never satisfy a refresh after that save.
 readEpoch_++;inFlightReads_.clear();
 try{return await (recovery&&recovery.isWrite(method)?recovery.run(method,data,pagesRequestRaw_):pagesRequestRaw_(method,data));}
 finally{readEpoch_++;inFlightReads_.clear();}
}
async function pagesRequestTransport_(method,data){
 const readOnly=retryableReads_.has(method),body=new URLSearchParams({api:'pages-v1',payload:JSON.stringify({method:method,data:data})});
 for(let attempt=0;attempt<6;attempt++){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),readOnly?25000:180000);
  try{
   const response=await fetch(GAS_URL,{method:'POST',body:body,credentials:'omit',redirect:'follow',referrerPolicy:'no-referrer',signal:controller.signal});
   if(!response.ok){const e=new Error('通信結果を確認できませんでした。');e.transient=response.status===429||response.status>=500;throw e;}
   let result;try{result=await response.json();}catch(e){const failure=new Error('通信結果を確認できませんでした。');failure.transient=true;throw failure;}
   if(!result||result.ok!==true){const failure=new Error(result&&result.error||'処理を完了できませんでした。');failure.safeRetry=result&&result.code==='SAVE_BUSY';failure.transient=result&&result.code==='TEMPORARY_FAILURE'||/ロックのタイムアウト|Lock timeout|Service unavailable|Service Spreadsheets timed out|Internal error|サーバー エラーが発生|しばらくしてからもう一度/i.test(failure.message);throw failure;}
   return result.result;
  }catch(error){
   const transient=error.safeRetry||error.transient||error.name==='AbortError'||error.name==='TypeError';
   if(!readOnly&&error.safeRetry&&attempt<5){clearTimeout(timer);await new Promise(resolve=>setTimeout(resolve,Math.min(10000,700*2**attempt)+Math.floor(Math.random()*1000)));continue;}
   if(readOnly&&transient&&attempt<2){clearTimeout(timer);await new Promise(resolve=>setTimeout(resolve,attempt===0?350:1500));continue;}
   if(transient){const failure=new Error(readOnly?'通信が不安定なため読み込めませんでした。ログインし直さず、もう一度更新してください。':'受付結果を確認できませんでした。入力内容を変更せず、もう一度送信してください。');failure.uncertain=true;throw failure;}
   throw error;
  }finally{clearTimeout(timer);}
 }
}
// Automatic reconciliation is restricted to the existing idempotent attendance paths.
async function pagesRequestRaw_(method,data){
 const eligible=method==='workClockIn'&&/^[A-Za-z0-9_-]{12,100}$/.test(String(data.requestId||''))||method==='workClockOut'&&data.workId&&(!data.outcome||data.outcome==='normal');
 if(!eligible)return pagesRequestTransport_(method,data);
 const original=JSON.parse(JSON.stringify(data)),day=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'}),startedDay=day();let last;
 for(let n=0;n<3;n++){
  try{const result=await pagesRequestTransport_(method,original);if(result&&result.work&&result.work.id)return result;const e=new Error('勤務の保存結果を確認しています。');e.uncertain=true;throw e;}
  catch(e){if(!e.uncertain)throw e;last=e;
   const submission={...original};delete submission.idToken;
   try{const receipt=await pagesRequestTransport_('workSubmissionReceipt',{idToken:original.idToken,method,submission});if(receipt&&receipt.found&&receipt.result&&receipt.result.work)return receipt.result;if(receipt&&receipt.conflict)throw Object.assign(new Error('保存された勤務内容が異なります。勤務情報を更新して会社へ確認してください。'),{attendanceConflict:true});}
   catch(check){if(check.attendanceConflict)throw check;}
   // Clock-in IDs contain the server's calendar day. Never automatically resend
   // across midnight; reconciliation above may still recover yesterday's receipt.
   if(n===2||method==='workClockIn'&&day()!==startedDay)throw last;
   await new Promise(resolve=>setTimeout(resolve,n===0?350:1000));
  }
 }
 throw last;
}
let startupRunning_=false,liffInitialization_=null;
function installPagesRpc_(){window.google={script:{get run(){let success,failure;return new Proxy({withSuccessHandler(fn){success=fn;return this;},withFailureHandler(fn){failure=fn;return this;}},{get(target,key){if(key in target)return target[key];return data=>pagesRequest_(String(key),data).then(success,failure);}});}}};}
async function startPages_(){if(startupRunning_)return;startupRunning_=true;document.getElementById('startupRetry')?.remove();const startupStarted=performance.now(),requestedPage=getPage();if(new URLSearchParams(location.search).has('timing')||startupStorage_('shishidogumi-startup-timing')==='1')startupStorage_('shishidogumi-startup-timing','1');const status=document.getElementById('startupStatus');status.className='';status.style.display='block';document.getElementById('userInfo').style.display='';try{const lineStarted=performance.now();if(!liffInitialization_)liffInitialization_=liff.init({liffId:LIFF_ID,withLoginOnExternalBrowser:true}).catch(error=>{liffInitialization_=null;throw error;});await liffInitialization_;if(!liff.isInClient()&&!liff.isLoggedIn()){liff.login({redirectUri:window.location.href});return;}const lineMs=performance.now()-lineStarted;const token=liff.getIDToken();if(!token)throw new Error('LINE本人認証を確認できませんでした。公式LINEから開き直してください。');if(new URLSearchParams(location.search).get('delivery')==='direct'){const form=document.createElement('form');form.method='POST';form.action=GAS_URL;const fields={id_token:token,page:getPage(),started_at:String(performance.timeOrigin),line_ms:String(Math.round(lineMs)),startup_timing:new URLSearchParams(location.search).has('timing')?'1':'0'};Object.entries(fields).forEach(([name,value])=>{const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);});document.body.appendChild(form);form.submit();return;}status.textContent='会社の登録情報を確認しています…';const serverStarted=performance.now();const bootstrap=await pagesRequest_('bootstrap',{idToken:token,page:getPage(),summaryMode:true});const serverRoundTripMs=performance.now()-serverStarted;window.SHISHIDOGUMI_BOOTSTRAP={...bootstrap,page:getPage(),idToken:token};window.SHISHIDOGUMI_RECOVERY?.attach({userId:bootstrap.currentUser?.userId,token:()=>liff.getIDToken(),send:pagesRequestRaw_});installPagesRpc_();await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='./app-reconcile-daily-20261112.js?v=1';script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('画面の読み込みに失敗しました。もう一度読み込んでください。'));};document.body.appendChild(script);});if(window.SHISHIDOGUMI_STARTUP_SHELL)window.SHISHIDOGUMI_STARTUP_SHELL.release();status.style.display='none';window.SHISHIDOGUMI_STARTUP_TIMING={shellVisibleMs:window.SHISHIDOGUMI_STARTUP_SHELL?.shownAt,lineMs:Math.round(lineMs),serverRoundTripMs:Math.round(serverRoundTripMs),serverMs:bootstrap.serverMs,authMs:bootstrap.authMs,staffReadMs:bootstrap.staffReadMs,initialDataMs:bootstrap.initialDataMs,entryToReadyMs:Math.round(performance.now()-startupStarted),navigationToReadyMs:Math.round(performance.now())};if(new URLSearchParams(location.search).has('timing')||startupStorage_('shishidogumi-startup-timing')==='1'){const p=document.createElement('p');p.id='startupTiming';p.style.cssText='white-space:pre-wrap;font-size:14px;padding:10px;background:#eef6ff';p.textContent='起動計測（この画面の遷移開始から）\n'+JSON.stringify(window.SHISHIDOGUMI_STARTUP_TIMING,null,2);document.body.prepend(p);}document.dispatchEvent(new Event('shishidogumi-ready'));}catch(error){if(window.SHISHIDOGUMI_STARTUP_SHELL)window.SHISHIDOGUMI_STARTUP_SHELL.fail();status.textContent=error&&error.message||'本人認証を確認できませんでした。公式LINEから開き直してください。';if(error?.message==='このアカウントは現在利用できません。'){for(const id of ['transportForm','dailyForm','reportForm','expenseForm','shiftForm','workForm','nameRegistration'])document.getElementById(id)?.classList.add('hidden');document.querySelector('nav[aria-label="申請メニュー"]')?.style.setProperty('display','none');document.getElementById('pageTitle').textContent='利用停止';}status.className='field-error';document.getElementById('loading').style.display='none';document.getElementById('userInfo').style.display='none';const retry=document.createElement('button');retry.type='button';retry.className='button';retry.id='startupRetry';retry.textContent='もう一度読み込む';retry.onclick=()=>{retry.disabled=true;startPages_();};status.after(retry);}finally{startupRunning_=false;}}
startPages_();