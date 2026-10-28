let startupDailyConsumed_=false,startupWorkConsumed_=false;
let provisionalBusy_=false,provisionalRefreshAt_=0;

// Pages入口の認証と、GAS JSON APIが検証した利用者を受け取ります。
// GAS の iframe 内で LIFF の再初期化や別ユーザーの取得は行いません。
const BOOTSTRAP = window.SHISHIDOGUMI_BOOTSTRAP;
const PAGE = BOOTSTRAP.page;
const idToken = BOOTSTRAP.idToken;
let currentUser = BOOTSTRAP.currentUser;
const titles = {work:'勤務報告',transport: '交通費申請', daily: '日払い申請', report: '日報報告', expense: '経費申請', shift: 'シフト申請'};
const forms = {work:'workForm',transport: 'transportForm', daily: 'dailyForm', report: 'reportForm', expense: 'expenseForm', shift: 'shiftForm'};
const pending = {transport: false, calculate: false, daily: false, report: false, expense: false, shift: false};
let transportResult = null;
let transportRequestId = null;
let dailyRequestId = null;
let dailyRequestAmount = null;
let dailySummarySerial_=0,dailySummary_=null,dailyBalanceLoading_=false;
let reportRequestId = null;
let previewUrls = [];
let receiptPreviewUrl = null;

function byId(id) { return document.getElementById(id); }
function showError(text,field) {
  nearError_(String(text||'処理を完了できませんでした。'),field);
  byId('error').textContent = String(text || '処理を完了できませんでした。');
  byId('error').style.display = 'block';
  if(!document.querySelector('.field-error'))byId('error').scrollIntoView({behavior: 'smooth', block: 'nearest'});
}
function clearError() { document.querySelectorAll('.field-error').forEach(n=>n.remove());document.querySelectorAll('[aria-invalid]').forEach(n=>{n.removeAttribute('aria-invalid');n.removeAttribute('aria-describedby');}); byId('error').textContent = ''; byId('error').style.display = 'none'; }
function clearMessage() { byId('message').textContent = ''; byId('message').style.display = 'none'; }
function showMessage(result) {
  // saveDailyReport の戻り値をそのまま表示。会社名・工事名を固定文で消しません。
  if (typeof result !== 'string' || !result.trim()) throw new Error('受付結果を確認できませんでした。会社側で保存状況を確認してください。');
  byId('message').textContent = result;
  byId('message').style.display = 'block';
  byId('message').scrollIntoView({behavior: 'smooth', block: 'nearest'});
}
function requireAuthentication() {
  if (needsStaffRegistration()) throw new Error('最初に氏名と警備員区分を登録してください。');
  if (!idToken || !currentUser || !currentUser.registered) {
    throw new Error('LINEユーザー情報を確認できませんでした。LINEから画面を開き直してください。');
  }
}
function needsStaffRegistration() { return !!currentUser && (!currentUser.registered || !currentUser.name || currentUser.needsNameRegistration || ['一般警備員','資格保有警備員'].indexOf(currentUser.guardRole) < 0); }
function errorText(error, fallback) { return error && error.message || fallback; }
function callServer(method, data) {
  requireAuthentication();
  if(BOOTSTRAP.ownerDailyPreview){const routes={employeeDailyBalance:'employeeDailyOwnerPreviewBalance',employeeDailyApply:'employeeDailyOwnerPreviewApply',workProvisionalOut:'employeeDailyOwnerPreviewProvisional'};if(!routes[method])return Promise.reject(new Error('検証画面では日払いだけを確認できます。'));method=routes[method];}
  return new Promise(function(resolve, reject) {
    google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[method](data);
  });
}
function setBusy(key, buttonId, busyText, idleText, fields, busy) {
  pending[key] = busy;
  byId(buttonId).disabled = busy;
  byId(buttonId).textContent = busy ? busyText : idleText;
  fields.forEach(function(id) { byId(id).disabled = busy;const host=byId('choiceInput-'+id);if(host)host.querySelectorAll('button').forEach(b=>b.disabled=busy); });
}
function validAmount(value, label) {
  const text = String(value || '').trim();
  const amount = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(label + 'は1円以上の整数で入力してください。');
  }
  return amount;
}
function normalizeRoute(value) {
  return String(value || '').normalize('NFKC').trim()
    .replace(/\s*(ー|−|―|—|-|～|〜|~|・|、|,|→|⇒|➡|➜|>|\/|から)\s*/g, '|')
    .replace(/\s+/g, '|').replace(/\|+/g, '|');
}
function requestFor_(kind,signature) {
  const key='shishidogumi-request:'+currentUser.userId+':'+kind;
  try {const old=JSON.parse(sessionStorage.getItem(key)||'null');if(old&&old.signature===signature)return old.id;const id=newRequestId();sessionStorage.setItem(key,JSON.stringify({id:id,signature:signature}));return id;}catch(error){return newRequestId();}
}
function clearRequest_(kind) {try{sessionStorage.removeItem('shishidogumi-request:'+currentUser.userId+':'+kind);}catch(error){}}
function selectTransportTrip() {
  if(!transportResult)return;
  transportResult.tripType=byId('transportTripType').value;
  transportResult.actual=transportResult.tripType==='片道'?transportResult.oneWay:transportResult.roundTrip;transportResult.amount=Math.max(0,transportResult.actual-500);
  byId('resultAmount').textContent='会社支給額'+Number(transportResult.amount).toLocaleString('ja-JP')+'円';byId('resultAmount').style.color=transportResult.amount===0?'#c00000':'';byId('resultRoute').textContent=transportResult.route+'\n'+transportResult.tripType+'運賃'+transportResult.actual.toLocaleString('ja-JP')+'円';byId('resultRoute').style.whiteSpace='pre-line';
  transportRequestId=null;
}
function invalidateTransport() {
  transportResult = null;
  transportRequestId = null;
  byId('resultBox').style.display = 'none';
  byId('transportButton').disabled = true;
}

async function calculateFare() {
  if (pending.calculate || pending.transport) return;
  clearError(); clearMessage(); invalidateTransport();
  try {
    requireAuthentication();
    const raw = byId('route').value.trim();
    const date = byId('transportDate').value;
    if (!raw) throw new Error('利用区間を入力してください。');
    if (!date) throw new Error('利用日を選択してください。');
    const route = normalizeRoute(raw);
    setBusy('calculate', 'calculateButton', '運賃を計算中…', '運賃を計算する', ['route', 'transportDate', 'transportTripType'], true);
    const result = await callServer('calculateTransportFare', {idToken: idToken, route: route, date: date});
    if (!result || typeof result.routeDisplay !== 'string' || !Number.isFinite(result.oneWayFare) ||
        !Number.isFinite(result.roundTripFare) || result.oneWayFare < 0 || result.roundTripFare < 0) {
      throw new Error('運賃を取得できませんでした。');
    }
    if (byId('route').value.trim() !== raw || byId('transportDate').value !== date) {
      throw new Error('利用区間または利用日が変更されました。もう一度運賃を計算してください。');
    }
    transportResult = {date:date,input:raw,route:result.routeDisplay,oneWay:result.oneWayFare,roundTrip:result.roundTripFare};
    byId('resultRoute').textContent = result.routeDisplay;
    selectTransportTrip();
    byId('resultBox').style.display = 'block';
    byId('transportButton').disabled = false;
  } catch (error) { showError(errorText(error, '運賃計算に失敗しました。')); }
  finally {
    setBusy('calculate', 'calculateButton', '運賃を計算中…', '運賃を計算する', ['route', 'transportDate', 'transportTripType'], false);
    byId('calculateButton').disabled = !idToken || !currentUser;
  }
}

async function sendTransport_() {
  if (pending.transport || pending.calculate) return;
  clearError(); clearMessage();
  try {
    requireAuthentication();
    if (!transportResult || transportResult.date !== byId('transportDate').value ||
        transportResult.input !== byId('route').value.trim()) {
      invalidateTransport();
      throw new Error('先に運賃を計算してください。');
    }
    setBusy('transport', 'transportButton', '申請中…', '交通費を申請する', ['route', 'transportDate', 'transportTripType', 'calculateButton'], true);
    transportRequestId=requestFor_('transport',JSON.stringify([transportResult.date,transportResult.route,transportResult.tripType]));
    const result = await callServer('saveTransportation', {
      idToken: idToken, requestId: transportRequestId, date: transportResult.date, route: transportResult.route, tripType: transportResult.tripType
    });
    showMessage(result);clearRequest_('transport');
    byId('route').value = '';
    invalidateTransport();
  } catch (error) { showError(errorText(error, '交通費申請に失敗しました。')); }
  finally {
    setBusy('transport', 'transportButton', '申請中…', '交通費を申請する', ['route', 'transportDate', 'transportTripType', 'calculateButton'], false);
    byId('transportButton').disabled = !transportResult || !idToken || !currentUser;
  }
}

function dailyMoney_(value){return Number(value).toLocaleString('ja-JP')+'円';}
function renderDailyAllowances_(){const panel=byId('dailyAllowancePanel'),list=byId('dailyAllowanceList');panel.style.cssText='background:#FFF8DB;color:#111;border:1px solid #E8D58B;border-radius:12px;padding:16px;margin:20px 0';const heading=panel.querySelector('h3');if(heading)heading.style.marginTop='0';let hint=panel.querySelector('.daily-allowance-hint')||panel.querySelector('p.note');if(!hint){hint=document.createElement('p');list.before(hint);}hint.className='note daily-allowance-hint';hint.style.color='#111';hint.textContent='申請中の手当は、日払い可能額に含まれていません';list.replaceChildren();const requests=dailySummary_&&dailySummary_.allowanceRequests||[];panel.hidden=!requests.length;requests.forEach(a=>{const card=document.createElement('div'),heading=document.createElement('p');heading.textContent='勤務日 '+a.date+' ／ '+(a.status||'申請中');card.appendChild(heading);[['運転手当',a.driver],['その他手当',a.other]].forEach(([label,amount])=>{if(!amount)return;const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=dailyMoney_(amount);row.append(dt,dd);const dl=document.createElement('dl');dl.className='daily-balance-list';dl.appendChild(row);card.appendChild(dl);});if(a.note){const note=document.createElement('p');note.textContent='備考 '+a.note;card.appendChild(note);}list.appendChild(card);});}
function renderDailyAmounts_(){
 renderDailyAllowances_();
 if(dailySummary_){const r=dailySummary_.reserve;const values={dailyLoanDue:-r.currentLoanPending,dailyInsuranceDue:-r.currentInsurancePending,dailyCarry:-r.carry,dailySettledDeduction:-r.settled,dailyLoanRemaining:r.loanRemaining,dailyReserveTotal:r.deductionTotal,dailySignedAvailable:Math.max(0,-dailySummary_.signedAvailable)};Object.entries(values).forEach(([id,value])=>{const el=byId(id);el.textContent=Number(value===0?0:value).toLocaleString('ja-JP')+'円';el.style.color=id==='dailySignedAvailable'||value<0?'#c00000':'';});}else{['dailyLoanDue','dailyInsuranceDue','dailyCarry','dailySettledDeduction','dailyLoanRemaining','dailyReserveTotal','dailySignedAvailable'].forEach(id=>{byId(id).textContent='—';byId(id).style.color='';});}
 const fields={dailyWageRemaining:'wageRemaining',dailyExpenseRemaining:'expenseRemaining',dailyTransportRemaining:'transportRemaining',dailyAvailable:'available',dailyLifetimeTotal:'lifetimeTotal',dailyReceivedTotal:'receivedTotal'};
 Object.keys(fields).forEach(id=>byId(id).textContent=dailySummary_?dailyMoney_(dailySummary_[fields[id]]):'—');

 ['dailyLoanDue','dailyInsuranceDue','dailyCarry','dailySettledDeduction','dailyLoanRemaining','dailyReserveTotal','dailySignedAvailable','dailyWageRemaining','dailyExpenseRemaining','dailyTransportRemaining','dailyAvailable','dailyLifetimeTotal','dailyReceivedTotal'].forEach(id=>{const el=byId(id);el.parentElement.hidden=id!=='dailyAvailable'&&!!dailySummary_&&Number(el.textContent.replace(/[^0-9.-]/g,''))===0;});
 const enabled=Boolean(dailySummary_&&!dailyBalanceLoading_&&!pending.daily&&idToken&&currentUser),available=dailySummary_?dailySummary_.available:0;
 byId('dailyFullButton').disabled=!enabled||available<=0;byId('dailyButton').disabled=!enabled||available<=0;byId('dailyAmount').disabled=!enabled||available<=0;
 byId('dailyRefresh').disabled=dailyBalanceLoading_||pending.daily;
 byId('dailyAmount').max=String(available);byId('dailyFullButton').textContent=pending.daily?'申請中…':dailySummary_?'全額で申請（'+dailyMoney_(available)+'）':'全額で申請';
 byId('dailyButton').textContent=pending.daily?'申請中…':'入力した金額で申請';
 renderProvisionalPanel_('daily',dailySummary_&&dailySummary_.provisionalWork);
}
async function refreshDailyAmounts_(){
 if(pending.daily||provisionalBusy_)return;const serial=++dailySummarySerial_;dailyBalanceLoading_=true;dailySummary_=null;renderDailyAmounts_();byId('dailySummaryStatus').textContent='残高を確認しています…';
 try{const started=Date.now();const initial=!startupDailyConsumed_&&BOOTSTRAP.initialDailyBalance;startupDailyConsumed_=true;const result=initial?await Promise.resolve(initial):await callServer('employeeDailyBalance',{idToken:idToken});if(serial!==dailySummarySerial_)return;validateDailyBalance_(result);if(result.serverNow)workClockOffset_=result.serverNow-(started+Date.now())/2;dailySummary_=result;byId('dailyDate').textContent=result.today.replace(/-/g,'/');byId('dailySummaryStatus').textContent='残業代・手当等は、会社承認後に加算されます';}
 catch(error){if(serial===dailySummarySerial_){dailySummary_=null;byId('dailySummaryStatus').textContent='残高を確認できませんでした。「残高を更新」で再確認してください。';showError(errorText(error,'残高を確認できませんでした。'));}}
 finally{if(serial===dailySummarySerial_){dailyBalanceLoading_=false;renderDailyAmounts_();}}
}
function validateDailyBalance_(b){const keys=['wageRemaining','expenseRemaining','transportRemaining','available','lifetimeTotal','receivedTotal'];if(!b||keys.some(k=>!Number.isSafeInteger(b[k])||b[k]<0)||!b.reserve||['deductionTotal','currentLoanPending','currentInsurancePending','carry','settled','loanRemaining'].some(k=>!Number.isSafeInteger(b.reserve[k])||b.reserve[k]<0)||b.wageRemaining+b.expenseRemaining+b.transportRemaining!==b.grossAvailable||b.lifetimeTotal-b.receivedTotal!==b.grossAvailable||b.signedAvailable!==b.grossAvailable-b.reserve.deductionTotal||b.available!==Math.max(0,b.signedAvailable)||typeof b.version!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.today))throw new Error('残高の内訳を確認できませんでした。残高を更新してください。');}
async function sendDaily_(mode){
 if(pending.daily||dailyBalanceLoading_||provisionalBusy_)return;clearError();clearMessage();
 try{requireAuthentication();if(!dailySummary_)throw new Error('先に残高を更新してください。');const snapshot=dailySummary_,amount=mode==='full'?snapshot.available:validAmount(byId('dailyAmount').value,'日払い申請金額');if(!Number.isSafeInteger(amount)||amount<=0||amount>snapshot.available)throw new Error('申請金額は1円以上、残高合計以下で入力してください。');
 pending.daily=true;renderDailyAmounts_();const requestId=requestFor_('daily-balance',JSON.stringify([snapshot.version,amount]));
 const result=await callServer('employeeDailyApply',{idToken:idToken,requestId:requestId,mode:mode,amount:amount,version:snapshot.version});
 if(!result||result.complete!==true||result.amount!==amount)throw new Error('受付結果を確認できませんでした。同じ内容で再送してください。');validateDailyBalance_(result.balance);dailySummary_=result.balance;byId('dailyAmount').value='';byId('dailySummaryStatus').textContent='残業代・手当等は、会社承認後に加算されます';showMessage(result.message);
 }catch(error){showError(errorText(error,'日払い申請に失敗しました。'));}
 finally{pending.daily=false;renderDailyAmounts_();}
}
async function submitDailyFull(){return sendDaily_('full');}


function validateFiles(files, report) {
  if (!files.length) throw new Error(report ? '日報写真を1枚以上添付してください。' : 'レシート・領収書の写真を添付してください。');
  if (report && files.length > BOOTSTRAP.maxReportFiles) throw new Error('写真は1回につき' + BOOTSTRAP.maxReportFiles + '枚までです。');
  let total = 0;
  files.forEach(function(file) {
    if (file.type && !file.type.startsWith('image/') && file.type !== 'application/octet-stream') {
      throw new Error('写真ファイルを選択してください。');
    }
    if (!file.size || file.size > BOOTSTRAP.maxImageBytes) throw new Error('写真1枚のサイズは10MB以内にしてください。');
    total += file.size;
  });
  if (total > BOOTSTRAP.maxTotalImageBytes) throw new Error('写真の合計サイズは20MB以内にしてください。');
}

function previewReportPhotos() {
  setFileStatus_('reportPhotos');
  previewUrls.forEach(function(url) { URL.revokeObjectURL(url); });
  previewUrls = [];
  byId('reportPreview').replaceChildren();
  reportRequestId = null;
  clearError();
  const files = Array.from(byId('reportPhotos').files);
  if (!files.length) return;
  try {
    validateFiles(files, true);
    files.forEach(function(file) {
      const url = URL.createObjectURL(file);
      previewUrls.push(url);
      const img = document.createElement('img');
      img.src = url; img.alt = '日報写真';
      byId('reportPreview').appendChild(img);
      prepareReportPhoto_(file).catch(function(){/* 送信時に再試行してエラー表示 */});
    });
  } catch (error) { showError(error.message); }
}

function previewReceipt() {
  setFileStatus_('receipt');
  if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
  receiptPreviewUrl = null;
  byId('receiptPreview').style.display = 'none';
  byId('receiptPreview').removeAttribute('src');
  const file = byId('receipt').files[0];
  if (!file) return;
  try {
    validateFiles([file], false);
    receiptPreviewUrl = URL.createObjectURL(file);
    byId('receiptPreview').src = receiptPreviewUrl;
    byId('receiptPreview').style.display = 'block';
  } catch (error) { showError(error.message); }
}

function readFileAsDataURL(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onload = function(event) { resolve(event.target.result); };
    reader.onerror = function() { reject(new Error('写真の読み込みに失敗しました。')); };
    reader.onabort = function() { reject(new Error('写真の読み込みが中断されました。')); };
    reader.readAsDataURL(file);
  });
}

function newRequestId() {
  return window.crypto && typeof window.crypto.randomUUID === 'function'
    ? window.crypto.randomUUID() : Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
}

// 写真の選択時に準備し、再送時は同じデータを使用する。
const preparedReportPhotos_=new WeakMap();
function prepareReportPhoto_(file){if(preparedReportPhotos_.has(file))return preparedReportPhotos_.get(file);const task=(async function(){const original=await readFileAsDataURL(file);if(!/^image\/(jpeg|png|webp)$/i.test(file.type)||file.size<500000)return original;try{const image=await new Promise(function(resolve,reject){const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=original;});const max=2560,scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));if(!image.naturalWidth||!image.naturalHeight)return original;const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));const ctx=canvas.getContext('2d');if(!ctx)return original;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);const result=canvas.toDataURL('image/jpeg',0.9);return result.length<original.length?result:original;}catch(error){return original;}})();preparedReportPhotos_.set(file,task);task.catch(()=>preparedReportPhotos_.delete(file));return task;}

async function sendReport_() {
  if (pending.report) return;
  clearError(); clearMessage();
  try {
    requireAuthentication();
    const files = Array.from(byId('reportPhotos').files);
    const note = byId('reportNote').value.trim();
    validateFiles(files, true);
    if (note.length > 4000) throw new Error('備考は4000文字以内で入力してください。');
    setBusy('report', 'reportButton', '日報を送信中…', '日報を報告する', ['reportPhotos', 'reportNote'], true);
    if (!reportRequestId) reportRequestId = newRequestId();
    const started=performance.now();
    const fileData = await Promise.all(files.map(prepareReportPhoto_));
    byId('reportButton').textContent='写真を保存しています…';
    const result = await callServer('saveDailyReport', {
      idToken: idToken, requestId: reportRequestId, fileData: fileData,
      fileNames: files.map(function(file) { return file.name; }), note: note
    });
    console.info('daily-report-submit',{durationMs:Math.round(performance.now()-started),photos:files.length});
    showMessage(result);
    byId('reportPhotos').value = '';
    byId('reportNote').value = '';
    previewReportPhotos();
  } catch (error) {
    // 写真と受付IDを保持。保存済みの画像は同じ再送で二重登録しません。
    showError(errorText(error, '日報送信に失敗しました。写真を変更せず、もう一度送信してください。'));
  } finally {
    setBusy('report', 'reportButton', '日報を送信中…', '日報を報告する', ['reportPhotos', 'reportNote'], false);
    byId('reportButton').disabled = !idToken || !currentUser;
  }
}

async function sendExpense_() {
  if (pending.expense) return;
  clearError(); clearMessage();
  try {
    requireAuthentication();
    const file = byId('receipt').files[0];
    validateFiles(file ? [file] : [], false);
    const amount = validAmount(byId('expenseAmount').value, '経費申請額');
    const workDate=byId('expenseWorkDate').value;if(!workDate)throw new Error('対象勤務日を選択してください。');
    setBusy('expense', 'expenseButton', '申請中…', '経費を申請する', ['receipt', 'expenseAmount','expenseWorkDate'], true);
    const fileData = await readFileAsDataURL(file);
    expenseRequestId=requestFor_('expense',JSON.stringify([workDate,amount,file.name,file.size,file.lastModified]));
    showMessage(await callServer('saveExpense', {idToken: idToken, requestId: expenseRequestId, amount: amount, workDate: workDate, fileData: fileData, fileName: file.name}));
    clearRequest_('expense');expenseRequestId = null;
    byId('receipt').value = ''; byId('expenseAmount').value = '';
    previewReceipt();
  } catch (error) { showError(errorText(error, '経費申請に失敗しました。')); }
  finally {
    setBusy('expense', 'expenseButton', '申請中…', '経費を申請する', ['receipt', 'expenseAmount','expenseWorkDate'], false);
    byId('expenseButton').disabled = !idToken || !currentUser;
  }
}

let expenseRequestId = null;
let registeringName = false;
function showRegisteredApplication() {
  requireAuthentication();
  byId('nameRegistration').classList.add('hidden');
  Object.keys(forms).forEach(function(key) { if(!byId(forms[key]))return;byId(forms[key]).classList.toggle('hidden', key !== PAGE); });
  byId('pageTitle').textContent = titles[PAGE] || '申請';
  byId('userInfo').textContent = '利用者：' + currentUser.name;
  if(PAGE==='daily')refreshDailyAmounts_();
  ['reportButton', 'expenseButton', 'calculateButton','shiftButton'].forEach(function(id) { byId(id).disabled = false; });
}
async function sendStaffName_() {
  if (registeringName) return;
  clearError(); clearMessage();
  try {
    if (!idToken || !currentUser || !needsStaffRegistration()) throw new Error('LINEから画面を開き直してください。');
    const realName = byId('realName').value.trim();
    const guardRole = byId('guardRole').value;
    if (['一般警備員','資格保有警備員'].indexOf(guardRole) < 0) throw new Error('警備員区分を選択してください。');
    if (realName.length < 2 || realName.length > 60) throw new Error('氏名を2〜60文字で入力してください。');
    registeringName = true;
    byId('registerNameButton').disabled = true;
    byId('realName').disabled = true;
    byId('registerNameButton').textContent = '登録中…';
    // 申請用RPCの登録チェックを通さず、サーバーがLINEトークンを個別に検証します。
    const user = await new Promise(function(resolve, reject) {
      google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)
        .registerStaffName({idToken: idToken, realName: realName, guardRole: guardRole});
    });
    if (!user || !user.registered || user.needsNameRegistration) throw new Error('登録結果を確認できませんでした。もう一度登録してください。');
    currentUser = user;
    byId('realName').value = '';
    showRegisteredApplication();
    if(PAGE==='work')refreshWorkReport_();
  } catch (error) { showError(errorText(error, '氏名の登録に失敗しました。もう一度登録してください。')); }
  finally {
    registeringName = false;
    byId('registerNameButton').disabled = false;
    byId('realName').disabled = false;
    byId('registerNameButton').textContent = '氏名を登録して申請へ進む';
  }
}

const shiftSelection_=new Map();let shiftMonth_=BOOTSTRAP.today.slice(0,7),reviewPending_=false;
const shiftChoices_=['日勤','夜勤','どちらでも'];
function dateLabel_(date){const p=date.split('-').map(Number),d=new Date(p[0],p[1]-1,p[2]);return p[0]+'年'+p[1]+'月'+p[2]+'日（'+['日','月','火','水','木','金','土'][d.getDay()]+'）';}
function choiceButtons_(choices,current,onChange){const wrap=document.createElement('div');wrap.className='choice-buttons'+(choices.length===2?' two':'');choices.forEach(function(value){const b=document.createElement('button');b.type='button';b.className='choice-button';b.dataset.value=value;b.setAttribute('aria-pressed',String(value===current));b.textContent=value;if(value===current){const mark=document.createElement('span');mark.className='selected-indicator';mark.textContent='選択中';b.appendChild(mark);}b.addEventListener('click',function(){if(pending.shift)return;onChange(value);});wrap.appendChild(b);});return wrap;}
function renderShiftSelection_(){byId('shiftCount').textContent='選択中：'+shiftSelection_.size+'／15日';const list=byId('shiftSelected');list.replaceChildren();[...shiftSelection_].sort().forEach(function(entry){const date=entry[0],value=entry[1],card=document.createElement('section');card.className='shift-day-card';const heading=document.createElement('div');heading.className='shift-day-heading';heading.textContent=dateLabel_(date);card.appendChild(heading);card.appendChild(choiceButtons_(shiftChoices_,value,function(v){shiftSelection_.set(date,v);renderShiftSelection_();}));const remove=document.createElement('button');remove.type='button';remove.className='shift-remove';remove.textContent='この日を選択解除';remove.addEventListener('click',function(){toggleShiftDate_(date);});card.appendChild(remove);list.appendChild(card);});}
function toggleShiftDate_(date){if(pending.shift||reviewPending_)return;clearError();if(shiftSelection_.has(date))shiftSelection_.delete(date);else if(shiftSelection_.size>=15){showError('一度に選択できるのは15日までです。選択中の日を押すと解除できます。','shiftCalendar');return;}else shiftSelection_.set(date,'どちらでも');renderShiftCalendar_();renderShiftSelection_();}
function setAllShiftChoices_(value){if(pending.shift||reviewPending_)return;for(const date of shiftSelection_.keys())shiftSelection_.set(date,value);renderShiftSelection_();byId('shiftBulkStatus').textContent='全選択日に「'+value+'」を設定しました。日ごとに変更できます。';}
function moveShiftMonth_(delta){if(pending.shift||reviewPending_)return;const p=shiftMonth_.split('-').map(Number),d=new Date(p[0],p[1]-1+delta,1);shiftMonth_=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');renderShiftCalendar_();}
function renderShiftCalendar_(){const p=shiftMonth_.split('-').map(Number),first=new Date(p[0],p[1]-1,1),count=new Date(p[0],p[1],0).getDate();byId('shiftMonthTitle').textContent=p[0]+'年'+p[1]+'月';const grid=byId('shiftCalendar');grid.replaceChildren();for(let i=0;i<first.getDay();i++){const empty=document.createElement('span');empty.className='calendar-blank';grid.appendChild(empty);}for(let day=1;day<=count;day++){const date=shiftMonth_+'-'+String(day).padStart(2,'0'),b=document.createElement('button');b.type='button';b.className='calendar-day';b.dataset.date=date;b.setAttribute('aria-label',dateLabel_(date)+(shiftSelection_.has(date)?' 選択中':''));b.setAttribute('aria-pressed',String(shiftSelection_.has(date)));b.textContent=String(day);const weekday=document.createElement('span');weekday.className='calendar-weekday';weekday.textContent=['日','月','火','水','木','金','土'][new Date(p[0],p[1]-1,day).getDay()]+'曜日';b.appendChild(weekday);if(shiftSelection_.has(date)){const mark=document.createElement('span');mark.className='selected-indicator';mark.textContent='選択';b.appendChild(mark);}b.addEventListener('click',function(){toggleShiftDate_(date);});grid.appendChild(b);}}
function nearError_(text,field){if(!field){if(/100文字|希望内容/.test(text))field='shiftNote';else if(/15日|希望日|各日の/.test(text))field='shiftCalendar';else if(/氏名/.test(text)&&needsStaffRegistration())field='realName';else if(/警備員区分/.test(text))field='guardRole';else if(/利用日/.test(text))field='transportDate';else if(/対象勤務日/.test(text))field=PAGE==='daily'?'dailyAmount':'expenseWorkDate';else if(/金額|整数|申請額/.test(text))field=PAGE==='daily'?'dailyAmount':'expenseAmount';else if(/区間|運賃/.test(text))field='route';else if(/写真|添付|レシート/.test(text))field=PAGE==='report'?'reportPhotos':'receipt';else if(/備考/.test(text))field='reportNote';}const target=field&&byId(field);if(target){const node=document.createElement('p');node.className='field-error';node.id='fieldError-'+field;node.textContent=text;node.setAttribute('role','alert');target.setAttribute('aria-invalid','true');target.setAttribute('aria-describedby',node.id);(target.closest('.input-area')||target.parentElement).appendChild(node);node.scrollIntoView({block:'nearest'});}else{const form=needsStaffRegistration()?byId('nameRegistration'):byId(forms[PAGE]);if(form)form.appendChild(byId('error'));}}
function reviewSubmission_(title,rows){if(reviewPending_)return Promise.resolve(false);reviewPending_=true;byId('reviewTitle').textContent=title;const list=byId('reviewList');list.replaceChildren();rows.forEach(function(row){const li=document.createElement('li'),label=document.createElement('strong'),value=document.createElement('span');label.textContent=row[0];value.textContent=String(row[1]);if(row[0]==='会社支給額'&&row[1]==='0円')value.style.color='#c00000';li.append(label,value);list.appendChild(li);});const dialog=byId('reviewDialog');dialog.showModal();return new Promise(function(resolve){function finish(ok){dialog.close();reviewPending_=false;dialog.removeEventListener('cancel',cancel);byId('reviewConfirm').onclick=null;byId('reviewCancel').onclick=null;resolve(ok);}function cancel(e){e.preventDefault();finish(false);}dialog.addEventListener('cancel',cancel);byId('reviewConfirm').onclick=()=>finish(true);byId('reviewCancel').onclick=()=>finish(false);});}
async function submitShift(){if(pending.shift||reviewPending_)return;clearError();clearMessage();try{requireAuthentication();const days=[...shiftSelection_].sort().map(x=>({date:x[0],shift:x[1]})),note=byId('shiftNote').value.trim();if(!days.length)throw new Error('希望日を1日以上選択してください。');if(days.length>15)throw new Error('希望日は15日までです。');if(Array.from(note).length>100)throw new Error('希望内容は100文字以内で入力してください。');if(!await reviewSubmission_('シフト申請内容の確認',days.map(d=>[dateLabel_(d.date),d.shift]).concat([['希望内容',note||'なし']])))return;setBusy('shift','shiftButton','全日分の保存を確認中…','内容を確認して提出',['shiftNote'],true);byId('shiftForm').querySelectorAll('button').forEach(b=>b.disabled=true);const id=requestFor_('shiftbatch',JSON.stringify([days,note])),result=await callServer('saveShiftRequests',{idToken:idToken,requestId:id,days:days,note:note});if(!result||result.complete!==true||result.count!==days.length||!Array.isArray(result.days)||JSON.stringify(result.days)!==JSON.stringify(days))throw new Error('全日分の保存を確認できませんでした。同じ内容で再送してください。');showMessage(result.message);clearRequest_('shiftbatch');shiftSelection_.clear();byId('shiftNote').value='';renderShiftCalendar_();renderShiftSelection_();}catch(error){showError(errorText(error,'全日分の提出を確認できませんでした。同じ内容で再送してください。'));}finally{setBusy('shift','shiftButton','全日分の保存を確認中…','内容を確認して提出',['shiftNote'],false);byId('shiftForm').querySelectorAll('button').forEach(b=>b.disabled=false);byId('shiftButton').disabled=!idToken||!currentUser;}}
function installChoiceInput_(id,values){const input=byId(id);input.style.display='none';input.removeAttribute('required');const host=document.createElement('div');host.id='choiceInput-'+id;input.after(host);function render(){host.replaceChildren(choiceButtons_(values,input.value,function(value){if(input.disabled||registeringName)return;input.value=value;if(id==='transportTripType')selectTransportTrip();render();}));}render();}
async function reviewAndSend_(kind){if(reviewPending_||pending[kind])return;clearError();clearMessage();try{requireAuthentication();let rows=[];if(kind==='transport'){if(!transportResult||transportResult.date!==byId('transportDate').value||transportResult.input!==byId('route').value.trim())throw new Error('先に運賃を計算してください。');rows=[['利用日',dateLabel_(transportResult.date)],['利用区間',transportResult.route],[transportResult.tripType+'運賃',Number(transportResult.actual).toLocaleString('ja-JP')+'円'],['会社支給額',Number(transportResult.amount).toLocaleString('ja-JP')+'円']];}if(kind==='expense'){const file=byId('receipt').files[0];validateFiles(file?[file]:[],false);const amount=validAmount(byId('expenseAmount').value,'経費申請額'),date=byId('expenseWorkDate').value;if(!date)throw new Error('対象勤務日を選択してください。');rows=[['対象勤務日',dateLabel_(date)],['経費申請額',amount.toLocaleString('ja-JP')+'円'],['領収書',file.name]];}if(kind==='report'){const files=Array.from(byId('reportPhotos').files);validateFiles(files,true);const note=byId('reportNote').value.trim();if(note.length>4000)throw new Error('備考は4000文字以内で入力してください。');rows=[['報告日',dateLabel_(BOOTSTRAP.today)],['日報写真',files.length+'枚'],['備考',note||'なし']];}if(await reviewSubmission_(titles[kind]+'の内容確認',rows))await ({transport:sendTransport_,daily:sendDaily_,expense:sendExpense_,report:sendReport_})[kind]();}catch(error){showError(errorText(error,'入力内容を確認してください。'));}}
async function submitTransport(){return reviewAndSend_('transport');}async function submitDaily(){return sendDaily_('custom');}async function submitExpense(){return reviewAndSend_('expense');}async function submitReport(){return reviewAndSend_('report');}
async function submitStaffName(){if(registeringName||reviewPending_)return;clearError();try{const name=byId('realName').value.trim(),role=byId('guardRole').value;if(name.length<2||name.length>60)throw new Error('氏名を2〜60文字で入力してください。');if(['一般警備員','資格保有警備員'].indexOf(role)<0)throw new Error('警備員区分を選択してください。');if(await reviewSubmission_('初回登録内容の確認',[['氏名',name],['警備員区分',role]]))await sendStaffName_();}catch(error){showError(errorText(error,'氏名と区分を確認してください。'));}}

function setFileStatus_(id){const input=byId(id),status=byId('fileStatus-'+id);if(!status)return;const files=Array.from(input.files);status.textContent=files.length?files.length+'枚を選択中：\n'+files.map(f=>f.name).join('\n'):'写真は未選択です。';}
function installFileInput_(id,label){const input=byId(id);input.style.display='none';const host=document.createElement('div');host.id='choiceInput-'+id;const button=document.createElement('button');button.type='button';button.className='button secondary';button.textContent=label;button.addEventListener('click',function(){if(!input.disabled)input.click();});const status=document.createElement('p');status.id='fileStatus-'+id;status.className='note';status.style.whiteSpace='pre-wrap';status.setAttribute('aria-live','polite');host.append(button,status);input.after(host);input.addEventListener('change',()=>setFileStatus_(id));setFileStatus_(id);}

function initializeApplication() {
  installFileInput_('reportPhotos','日報写真を選ぶ');installFileInput_('receipt','領収書の写真を選ぶ');
  installChoiceInput_('transportTripType',['往復','片道']);installChoiceInput_('guardRole',['一般警備員','資格保有警備員']);renderShiftCalendar_();renderShiftSelection_();
  byId('pageTitle').textContent = titles[PAGE] || '申請';
  Object.keys(forms).forEach(function(key) { if(!byId(forms[key]))return;byId(forms[key]).classList.toggle('hidden', key !== PAGE); });
  byId('transportDate').value = BOOTSTRAP.today;
  byId('expenseWorkDate').value=BOOTSTRAP.today;
  renderDailyAmounts_();
  ['dailyDate', 'reportDate', 'expenseDate'].forEach(function(id) {
    byId(id).textContent = BOOTSTRAP.today.replace(/-/g, '/');
  });
  byId('loading').style.display = 'none';
  byId('calculateButton').disabled = true;
  byId('route').addEventListener('input', invalidateTransport);
  byId('transportDate').addEventListener('change', invalidateTransport);
  byId('reportNote').addEventListener('input', function() { reportRequestId = null; });
  byId('receipt').addEventListener('change', function(){ expenseRequestId = null; });
  byId('expenseAmount').addEventListener('input', function(){ expenseRequestId = null; });
  byId('nameRegistration').addEventListener('submit', function(event) { event.preventDefault(); submitStaffName(); });
  try {
    if (idToken && needsStaffRegistration()) {
      Object.keys(forms).forEach(function(key) { if(!byId(forms[key]))return;byId(forms[key]).classList.add('hidden'); });
      byId('nameRegistration').classList.remove('hidden');
      if (currentUser.registered) byId('realName').value = currentUser.name;
      byId('pageTitle').textContent = '初回氏名登録';
      byId('userInfo').textContent = '初回だけ、氏名と警備員区分を登録してください。';
    } else {
      showRegisteredApplication();
    }
  } catch (error) {
    Object.keys(forms).forEach(function(key) { if(!byId(forms[key]))return;byId(forms[key]).classList.add('hidden'); });
    byId('userInfo').textContent = 'LINEユーザー情報を確認できませんでした。';
    showError(error.message);
  }
}
initializeApplication();




let workClockOffset_=0;
function workNow_(){return new Date(Date.now()+workClockOffset_);}
function workNowText_(){return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(workNow_());}
function workNowDate_(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(workNow_());}
function updateWorkClock_(){if(byId('workCurrentTime'))byId('workCurrentTime').textContent=(workReportState_.active?'下番':'上番')+'現在時刻（日本時間）\n'+workNowText_();updateProvisionalAvailability_();}
let workAllowanceLoadedId_=null;let workReportState_={active:null,history:[]},workReportBusy_=false;
function workAllowanceText_(a){if(!a)return '';const lines=[],state=a.status||'申請中';if(a.driver)lines.push('運転手当 '+Number(a.driver).toLocaleString('ja-JP')+'円（'+state+'）');if(a.other)lines.push('その他手当 '+Number(a.other).toLocaleString('ja-JP')+'円（'+state+'）');if((a.driver||a.other)&&a.note)lines.push('手当備考 '+a.note);return lines.length?'\n'+lines.join('\n'):'';}
function renderWorkReport_(){const active=workReportState_.active;if(active&&workAllowanceLoadedId_!==active.id){workAllowanceLoadedId_=active.id;fillWorkAllowance_('Out',active.allowance);}if(!active)workAllowanceLoadedId_=null;for(const phase of ['In','Out'])for(const suffix of ['Toggle','Driver','Other','Note'])byId('workAllowance'+phase+suffix).disabled=workReportBusy_||provisionalBusy_;byId('workClockInPanel').hidden=!!active;byId('workClockOutPanel').hidden=!active;if(active)byId('workActiveInfo').textContent=active.date+' '+active.shift+'\n'+(active.site?active.site+'\n':'')+'上番 '+active.clockIn+(active.provisional&&active.provisional.reportedAt?'\n仮下番 '+active.provisional.reportedAt+'（正式下番待ち）':'')+workAllowanceText_(active.allowance);byId('workReportHistory').replaceChildren();workReportState_.history.forEach(function(w){const card=document.createElement('p');card.textContent=w.date+' '+w.shift+'　'+w.status+'\n上番 '+w.clockIn+(w.clockOut?'\n下番 '+w.clockOut+'　残業'+w.minutes+'分':'')+(w.provisional&&w.provisional.reportedAt?'\n仮下番 '+w.provisional.reportedAt:'')+workAllowanceText_(w.allowance)+(w.reflected?'\n給与 '+w.reflected:'');byId('workReportHistory').appendChild(card);});byId('workClockInButton').disabled=workReportBusy_||!!active;byId('workClockOutButton').disabled=workReportBusy_||!active;byId('workRefreshButton').disabled=workReportBusy_||provisionalBusy_;renderProvisionalPanel_('work',active);}
async function refreshWorkReport_(){if(workReportBusy_||provisionalBusy_)return;workReportBusy_=true;renderWorkReport_();try{const started=Date.now();const initial=!startupWorkConsumed_&&BOOTSTRAP.initialWorkState;startupWorkConsumed_=true;workReportState_=initial?await Promise.resolve(initial):await callServer('workReportState',{idToken:idToken});if(workReportState_.serverNow)workClockOffset_=workReportState_.serverNow-(started+Date.now())/2;updateWorkClock_();byId('workReportStatus').textContent=workReportState_.active?'上番中です。勤務終了後に下番を報告してください。':'日勤・夜勤を選び、上番を報告してください。';}catch(error){showError(errorText(error,'勤務情報を確認できませんでした。'));}finally{workReportBusy_=false;renderWorkReport_();}}
async function submitWorkReport_(out){if(workReportBusy_||provisionalBusy_)return;clearError();clearMessage();try{requireAuthentication();const active=workReportState_.active,shift=byId('workShift').value,site=byId('workSite').value.trim(),minutes=byId('workHasOvertime').checked?byId('workOvertime').value:'0',note=byId('workNote').value.trim(),allowance=readWorkAllowance_(out?'Out':'In');if(out&&!active)throw new Error('先に勤務情報を更新してください。');if(!out&&['日勤','夜勤'].indexOf(shift)<0)throw new Error('日勤または夜勤を選択してください。');if(out&&minutes==='')throw new Error('残業時間を選択してください。');const rows=out?[['勤務日（上番日）',active.date],['下番現在時刻',workNowText_()],['勤務区分',active.shift],['残業時間',minutes+'分'],['備考',note||'なし']]:[['勤務日（上番日）',workNowDate_()],['上番現在時刻',workNowText_()],['勤務区分',shift],['現場名',site||'未入力']];rows.push(['運転手当',allowance.driver?'1,000円':'なし'],['その他手当',allowance.other?'500円':'なし'],['手当の備考',allowance.note||'なし']);if(!await reviewSubmission_(out?'下番報告の確認':'上番報告の確認',rows))return;workReportBusy_=true;renderWorkReport_();byId('workReportStatus').textContent=out?'下番を保存しています…':'上番を保存しています…';const result=await callServer(out?'workClockOut':'workClockIn',out?{idToken:idToken,workId:active.id,minutes:Number(minutes),note:note,allowance:allowance}:{idToken:idToken,shift:shift,site:site,allowance:allowance});showMessage(result.message.replace('日給を自動反映します。残業代は会社承認後に加算します。','残業代は会社承認後に加算されます。'));workReportState_.history=workReportState_.history.filter(w=>w.id!==result.work.id);workReportState_.history.unshift(result.work);workReportState_.active=result.work.status==='上番中'?result.work:null;byId('workReportStatus').textContent=out?'残業代は会社承認後に加算されます。':'上番を受け付けました。';if(out){byId('workOvertime').value='';byId('workHasOvertime').checked=false;byId('workOvertimeFields').hidden=true;byId('workNote').value='';fillWorkAllowance_('In');fillWorkAllowance_('Out');}}catch(error){showError(errorText(error,'勤務報告を保存できませんでした。'));}finally{workReportBusy_=false;renderWorkReport_();}}
function initializeWorkReport_(){if(!byId('workForm'))return;initializeWorkAllowance_();updateWorkClock_();setInterval(updateWorkClock_,1000);byId('workHasOvertime').addEventListener('change',function(){byId('workOvertimeFields').hidden=!this.checked;if(!this.checked)byId('workOvertime').value='';});for(let n=30;n<=720;n+=30){const option=document.createElement('option');option.value=String(n);option.textContent=Math.floor(n/60)+'時間'+(n%60? '30分':'');byId('workOvertime').appendChild(option);}byId('workClockInButton').addEventListener('click',()=>submitWorkReport_(false));byId('workClockOutButton').addEventListener('click',()=>submitWorkReport_(true));byId('workRefreshButton').addEventListener('click',refreshWorkReport_);if(PAGE==='work'&&currentUser&&currentUser.registered&&!needsStaffRegistration())refreshWorkReport_();}
initializeWorkReport_();



function renderProvisionalPanel_(prefix,work){
 const panel=byId(prefix+'ProvisionalPanel');if(!panel)return;const info=work&&work.provisional;
 panel.hidden=!(info&&(info.eligible||info.complete)&&!work.clockOut);
 byId(prefix+'ProvisionalInfo').textContent=!work?'':work.date+' '+work.shift+'\n'+work.site+(info&&info.complete?'\n仮下番済み '+info.reportedAt+'\n日給は反映済みです。':'\n仮下番を報告できます。');
 const button=byId(prefix+'ProvisionalButton');button.hidden=!!(info&&info.complete);button.disabled=provisionalBusy_||!info||!info.eligible||prefix==='daily'&&(dailyBalanceLoading_||pending.daily)||prefix==='work'&&workReportBusy_;button.textContent=provisionalBusy_?'日給の反映を確認中…':'仮下番を報告する';
}
async function submitProvisionalOut_(prefix){
 if(provisionalBusy_||pending.daily||dailyBalanceLoading_||workReportBusy_)return;clearError();clearMessage();
 try{requireAuthentication();const work=prefix==='daily'?dailySummary_&&dailySummary_.provisionalWork:workReportState_.active;if(!work||!work.provisional||!work.provisional.eligible)throw new Error('勤務情報を更新してから仮下番を報告してください。');
 provisionalBusy_=true;renderProvisionalPanel_(prefix,work);if(prefix==='daily'){byId('dailyFullButton').disabled=true;byId('dailyButton').disabled=true;byId('dailyAmount').disabled=true;byId('dailyRefresh').disabled=true;}else{byId('workClockOutButton').disabled=true;byId('workClockInButton').disabled=true;byId('workRefreshButton').disabled=true;}
 const result=await callServer('workProvisionalOut',{idToken:idToken,workId:work.id});if(!result||!result.complete||!result.work||result.work.id!==work.id)throw new Error('仮下番の反映を確認できませんでした。同じ勤務で再送してください。');validateDailyBalance_(result.balance);dailySummary_=result.balance;
 workReportState_.active=result.work;workReportState_.history=workReportState_.history.filter(w=>w.id!==work.id);workReportState_.history.unshift(result.work);showMessage(result.message);
 }catch(error){showError(errorText(error,'仮下番を保存できませんでした。'));}
 finally{provisionalBusy_=false;if(prefix==='daily')renderDailyAmounts_();else renderWorkReport_();}
}

function updateProvisionalAvailability_(){
 if(PAGE!=='daily'&&PAGE!=='work'||provisionalBusy_||pending.daily||dailyBalanceLoading_||workReportBusy_)return;
 const work=PAGE==='daily'?dailySummary_&&dailySummary_.provisionalWork:workReportState_.active,info=work&&work.provisional,now=Date.now()+workClockOffset_;
 if(info&&info.target&&!info.complete&&!info.eligible&&!work.clockOut&&Number.isFinite(info.availableAt)&&now>=info.availableAt&&Date.now()-provisionalRefreshAt_>30000){provisionalRefreshAt_=Date.now();if(PAGE==='daily')refreshDailyAmounts_();else refreshWorkReport_();}
}

if(BOOTSTRAP.directStartupTiming)Promise.resolve().then(function(){const t=BOOTSTRAP.directStartupTiming,p=document.createElement('p');p.id='startupTiming';p.style.cssText='white-space:pre-wrap;font-size:14px;padding:10px;background:#eef6ff';p.textContent='直接表示の起動計測\n'+JSON.stringify({navigationToReadyMs:Date.now()-t.clientStartedAt,lineMs:t.lineMs,serverMs:t.serverMs},null,2);document.body.prepend(p);});

function readWorkAllowance_(phase){const driver=byId('workAllowance'+phase+'Driver').checked,other=byId('workAllowance'+phase+'Other').checked,note=byId('workAllowance'+phase+'Note').value.trim();if(other&&!note)throw new Error('その他手当を選んだ場合は、手当の備考を入力してください。');return {driver,other,note};}
function fillWorkAllowance_(phase,a){a=a||{};byId('workAllowance'+phase+'Driver').checked=!!a.driver;byId('workAllowance'+phase+'Other').checked=!!a.other;byId('workAllowance'+phase+'Note').value=a.note||'';byId('workAllowance'+phase+'Note').required=!!a.other;byId('workAllowance'+phase+'Panel').hidden=!(a.driver||a.other||a.note);byId('workAllowance'+phase+'Toggle').setAttribute('aria-expanded',String(!byId('workAllowance'+phase+'Panel').hidden));}
function initializeWorkAllowance_(){for(const phase of ['In','Out']){byId('workAllowance'+phase+'Toggle').addEventListener('click',function(){const panel=byId('workAllowance'+phase+'Panel');panel.hidden=!panel.hidden;this.setAttribute('aria-expanded',String(!panel.hidden));});byId('workAllowance'+phase+'Other').addEventListener('change',function(){byId('workAllowance'+phase+'Note').required=this.checked;});}}
