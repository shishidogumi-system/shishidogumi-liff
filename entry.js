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
const retryableReads_=new Set(['bootstrap','employeeShiftState','workReportState','employeeDailyBalance','dailyApplicationSummary']);
const inFlightReads_=new Map();
async function pagesRequest_(method,data){
 const recovery=typeof window!=='undefined'&&window.SHISHIDOGUMI_RECOVERY;
 if(recovery&&recovery.isWrite(method))return recovery.run(method,data,pagesRequestRaw_);
 if(!retryableReads_.has(method))return pagesRequestRaw_(method,data);
 const key=method+':'+JSON.stringify(data);if(inFlightReads_.has(key))return inFlightReads_.get(key);
 const promise=pagesRequestRaw_(method,data).finally(()=>inFlightReads_.delete(key));inFlightReads_.set(key,promise);return promise;
}
async function pagesRequestRaw_(method,data){
 const readOnly=retryableReads_.has(method),body=new URLSearchParams({api:'pages-v1',payload:JSON.stringify({method:method,data:data})});
 for(let attempt=0;attempt<6;attempt++){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),readOnly?25000:180000);
  try{
   const response=await fetch(GAS_URL,{method:'POST',body:body,credentials:'omit',redirect:'follow',referrerPolicy:'no-referrer',signal:controller.signal});
   if(!response.ok){const e=new Error('通信結果を確認できませんでした。');e.transient=response.status===429||response.status>=500;throw e;}
   let result;try{result=await response.json();}catch(e){const failure=new Error('通信結果を確認できませんでした。');failure.transient=true;throw failure;}
   if(!result||result.ok!==true){const failure=new Error(result&&result.error||'処理を完了できませんでした。');failure.safeRetry=result&&result.code==='SAVE_BUSY';failure.transient=/ロックのタイムアウト|Lock timeout|Service unavailable|Service Spreadsheets timed out|Internal error|サーバー エラーが発生|しばらくしてからもう一度/i.test(failure.message);throw failure;}
   return result.result;
  }catch(error){
   const transient=error.safeRetry||error.transient||error.name==='AbortError'||error.name==='TypeError';
   if(!readOnly&&error.safeRetry&&attempt<5){clearTimeout(timer);await new Promise(resolve=>setTimeout(resolve,Math.min(10000,700*2**attempt)+Math.floor(Math.random()*1000)));continue;}
   if(readOnly&&transient&&attempt<2){clearTimeout(timer);await new Promise(resolve=>setTimeout(resolve,attempt===0?350:1500));continue;}
   if(transient)throw new Error(readOnly?'通信が不安定なため読み込めませんでした。ログインし直さず、もう一度更新してください。':'受付結果を確認できませんでした。入力内容を変更せず、もう一度送信してください。');
   throw error;
  }finally{clearTimeout(timer);}
 }
}
let startupRunning_=false,liffInitialization_=null;
function installPagesRpc_(){window.google={script:{get run(){let success,failure;return new Proxy({withSuccessHandler(fn){success=fn;return this;},withFailureHandler(fn){failure=fn;return this;}},{get(target,key){if(key in target)return target[key];return data=>pagesRequest_(String(key),data).then(success,failure);}});}}};}
async function startPages_(){if(startupRunning_)return;startupRunning_=true;document.getElementById('startupRetry')?.remove();const startupStarted=performance.now(),requestedPage=getPage();if(new URLSearchParams(location.search).has('timing')||startupStorage_('shishidogumi-startup-timing')==='1')startupStorage_('shishidogumi-startup-timing','1');const status=document.getElementById('startupStatus');status.className='';status.style.display='block';document.getElementById('userInfo').style.display='';try{const lineStarted=performance.now();if(!liffInitialization_)liffInitialization_=liff.init({liffId:LIFF_ID,withLoginOnExternalBrowser:true}).catch(error=>{liffInitialization_=null;throw error;});await liffInitialization_;if(!liff.isInClient()&&!liff.isLoggedIn()){liff.login({redirectUri:window.location.href});return;}const lineMs=performance.now()-lineStarted;const token=liff.getIDToken();if(!token)throw new Error('LINE本人認証を確認できませんでした。公式LINEから開き直してください。');if(new URLSearchParams(location.search).get('delivery')==='direct'){const form=document.createElement('form');form.method='POST';form.action=GAS_URL;const fields={id_token:token,page:getPage(),started_at:String(performance.timeOrigin),line_ms:String(Math.round(lineMs)),startup_timing:new URLSearchParams(location.search).has('timing')?'1':'0'};Object.entries(fields).forEach(([name,value])=>{const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);});document.body.appendChild(form);form.submit();return;}status.textContent='会社の登録情報を確認しています…';const serverStarted=performance.now();const bootstrap=await pagesRequest_('bootstrap',{idToken:token,page:getPage()});const serverRoundTripMs=performance.now()-serverStarted;window.SHISHIDOGUMI_BOOTSTRAP={...bootstrap,page:getPage(),idToken:token};window.SHISHIDOGUMI_RECOVERY?.attach({userId:bootstrap.currentUser?.userId,token:()=>liff.getIDToken(),send:pagesRequestRaw_});installPagesRpc_();await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='./app.js?v=operations-recovery-20261108-v1';script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('画面の読み込みに失敗しました。もう一度読み込んでください。'));};document.body.appendChild(script);});if(window.SHISHIDOGUMI_STARTUP_SHELL)window.SHISHIDOGUMI_STARTUP_SHELL.release();status.style.display='none';window.SHISHIDOGUMI_STARTUP_TIMING={shellVisibleMs:window.SHISHIDOGUMI_STARTUP_SHELL?.shownAt,lineMs:Math.round(lineMs),serverRoundTripMs:Math.round(serverRoundTripMs),serverMs:bootstrap.serverMs,authMs:bootstrap.authMs,staffReadMs:bootstrap.staffReadMs,initialDataMs:bootstrap.initialDataMs,entryToReadyMs:Math.round(performance.now()-startupStarted),navigationToReadyMs:Math.round(performance.now())};if(new URLSearchParams(location.search).has('timing')||startupStorage_('shishidogumi-startup-timing')==='1'){const p=document.createElement('p');p.id='startupTiming';p.style.cssText='white-space:pre-wrap;font-size:14px;padding:10px;background:#eef6ff';p.textContent='起動計測（この画面の遷移開始から）\n'+JSON.stringify(window.SHISHIDOGUMI_STARTUP_TIMING,null,2);document.body.prepend(p);}document.dispatchEvent(new Event('shishidogumi-ready'));}catch(error){if(window.SHISHIDOGUMI_STARTUP_SHELL)window.SHISHIDOGUMI_STARTUP_SHELL.fail();status.textContent=error&&error.message||'本人認証を確認できませんでした。公式LINEから開き直してください。';status.className='field-error';document.getElementById('loading').style.display='none';document.getElementById('userInfo').style.display='none';const retry=document.createElement('button');retry.type='button';retry.className='button';retry.id='startupRetry';retry.textContent='もう一度読み込む';retry.onclick=()=>{retry.disabled=true;startPages_();};status.after(retry);}finally{startupRunning_=false;}}
startPages_();




