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
      if (page) { sessionStorage.setItem('shishidogumi-startup-page',page); return page; }

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
          if (page) { sessionStorage.setItem('shishidogumi-startup-page',page); return page; }
        }
        try {
          const stateUrl = new URL(decoded, window.location.origin);
          page = getAllowedPage(stateUrl.searchParams.get('page'));
          if (page) { sessionStorage.setItem('shishidogumi-startup-page',page); return page; }
        } catch (error) {}
      }
      const saved=sessionStorage.getItem('shishidogumi-startup-page');if(searchParams.has('code')&&searchParams.has('liffClientId')&&getAllowedPage(saved))return saved;return 'transport';
    }


async function pagesRequest_(method,data){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180000);try{const response=await fetch(GAS_URL,{method:'POST',body:new URLSearchParams({api:'pages-v1',payload:JSON.stringify({method:method,data:data})}),credentials:'omit',redirect:'follow',referrerPolicy:'no-referrer',signal:controller.signal});if(!response.ok)throw new Error('受付結果を確認できませんでした。同じ内容で再送してください。');let result;try{result=await response.json();}catch{throw new Error('受付結果を確認できませんでした。同じ内容で再送してください。');}if(!result||result.ok!==true)throw new Error(result&&result.error||'処理を完了できませんでした。');return result.result;}catch(error){if(error.name==='AbortError'||error.name==='TypeError')throw new Error('通信結果を確認できませんでした。入力内容を変更せず、もう一度提出してください。');throw error;}finally{clearTimeout(timer);}}
function installPagesRpc_(){window.google={script:{get run(){let success,failure;return new Proxy({withSuccessHandler(fn){success=fn;return this;},withFailureHandler(fn){failure=fn;return this;}},{get(target,key){if(key in target)return target[key];return data=>pagesRequest_(String(key),data).then(success,failure);}});}}};}
async function startPages_(){const startupStarted=performance.now(),requestedPage=getPage();if(new URLSearchParams(location.search).has('timing')||sessionStorage.getItem('shishidogumi-startup-timing')==='1')sessionStorage.setItem('shishidogumi-startup-timing','1');const status=document.getElementById('startupStatus');try{const lineStarted=performance.now();await liff.init({liffId:LIFF_ID,withLoginOnExternalBrowser:true});if(!liff.isInClient()&&!liff.isLoggedIn()){liff.login({redirectUri:window.location.href});return;}const lineMs=performance.now()-lineStarted;const token=liff.getIDToken();if(!token)throw new Error('LINE本人認証を確認できませんでした。公式LINEから開き直してください。');if(new URLSearchParams(location.search).get('delivery')==='direct'){const form=document.createElement('form');form.method='POST';form.action=GAS_URL;const fields={id_token:token,page:getPage(),started_at:String(performance.timeOrigin),line_ms:String(Math.round(lineMs)),startup_timing:new URLSearchParams(location.search).has('timing')?'1':'0'};Object.entries(fields).forEach(([name,value])=>{const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);});document.body.appendChild(form);form.submit();return;}status.textContent='会社の登録情報を確認しています…';const serverStarted=performance.now();const bootstrap=await pagesRequest_('bootstrap',{idToken:token,page:getPage()});const serverRoundTripMs=performance.now()-serverStarted;window.SHISHIDOGUMI_BOOTSTRAP={...bootstrap,page:getPage(),idToken:token};installPagesRpc_();await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='./app.js?v=shift-sheet-colours-only-20261029-v1';script.onload=resolve;script.onerror=()=>reject(new Error('画面の読み込みに失敗しました。開き直してください。'));document.body.appendChild(script);});if(window.SHISHIDOGUMI_STARTUP_SHELL)window.SHISHIDOGUMI_STARTUP_SHELL.release();status.style.display='none';window.SHISHIDOGUMI_STARTUP_TIMING={shellVisibleMs:window.SHISHIDOGUMI_STARTUP_SHELL?.shownAt,lineMs:Math.round(lineMs),serverRoundTripMs:Math.round(serverRoundTripMs),serverMs:bootstrap.serverMs,authMs:bootstrap.authMs,staffReadMs:bootstrap.staffReadMs,initialDataMs:bootstrap.initialDataMs,entryToReadyMs:Math.round(performance.now()-startupStarted),navigationToReadyMs:Math.round(performance.now())};if(new URLSearchParams(location.search).has('timing')||sessionStorage.getItem('shishidogumi-startup-timing')==='1'){const p=document.createElement('p');p.id='startupTiming';p.style.cssText='white-space:pre-wrap;font-size:14px;padding:10px;background:#eef6ff';p.textContent='起動計測（この画面の遷移開始から）\n'+JSON.stringify(window.SHISHIDOGUMI_STARTUP_TIMING,null,2);document.body.prepend(p);}document.dispatchEvent(new Event('shishidogumi-ready'));}catch(error){if(window.SHISHIDOGUMI_STARTUP_SHELL)window.SHISHIDOGUMI_STARTUP_SHELL.fail();status.textContent=error&&error.message||'本人認証を確認できませんでした。公式LINEから開き直してください。';status.className='field-error';document.getElementById('loading').style.display='none';document.getElementById('userInfo').style.display='none';const retry=document.createElement('button');retry.type='button';retry.className='button';retry.textContent='LINEで再ログイン';retry.onclick=()=>{retry.disabled=true;liff.logout();liff.login({redirectUri:window.location.origin+window.location.pathname+'?page='+getPage()});};status.after(retry);}}
startPages_();


