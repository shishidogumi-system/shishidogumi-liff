
// Pages入口の認証と、GAS JSON APIが検証した利用者を受け取ります。
// GAS の iframe 内で LIFF の再初期化や別ユーザーの取得は行いません。
const BOOTSTRAP = window.SHISHIDOGUMI_BOOTSTRAP;
const PAGE = BOOTSTRAP.page;
const idToken = BOOTSTRAP.idToken;
let currentUser = BOOTSTRAP.currentUser;
const titles = {transport: '交通費申請', daily: '日払い申請', report: '日報報告', expense: '経費申請', shift: 'シフト申請'};
const forms = {transport: 'transportForm', daily: 'dailyForm', report: 'reportForm', expense: 'expenseForm', shift: 'shiftForm'};
const pending = {transport: false, calculate: false, daily: false, report: false, expense: false, shift: false};
let transportResult = null;
let transportRequestId = null;
let dailyRequestId = null;
let dailyRequestAmount = null;
const dailySelectedDates_=new Set();let dailySummarySerial_=0,dailySummary_={transportTotal:0,transportUnpaid:0,expenseTotal:0,expenseUnpaid:0};
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
  transportResult.amount=transportResult.tripType==='片道'?transportResult.oneWay:transportResult.roundTrip;
  byId('resultAmount').textContent=Number(transportResult.amount).toLocaleString('ja-JP')+'円（'+transportResult.tripType+'）';
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

async function sendDaily_() {
  if (pending.daily) return;
  clearError(); clearMessage();
  try {
    requireAuthentication();
    const amount = validAmount(byId('dailyAmount').value, '日払い申請金額');
    const workDates=[...dailySelectedDates_].sort();if(!workDates.length)throw new Error('対象勤務日を1日以上追加してください。');
    setBusy('daily', 'dailyButton', '申請中…', '日払いを申請する', ['dailyAmount','dailyWorkDate','dailyAddDate'], true);byId('dailySelectedDates').querySelectorAll('button').forEach(b=>b.disabled=true);
    dailyRequestId=requestFor_('daily',JSON.stringify([workDates,amount]));
    showMessage(await callServer('saveDailyPayment', {idToken: idToken, requestId: dailyRequestId, amount: amount, workDates: workDates}));
    clearRequest_('daily');dailyRequestId = null; dailyRequestAmount = null;
    byId('dailyAmount').value = '';
    dailySelectedDates_.clear();renderDailyDates_();await refreshDailyAmounts_();
  } catch (error) { showError(errorText(error, '日払い申請に失敗しました。')); }
  finally {
    setBusy('daily', 'dailyButton', '申請中…', '日払いを申請する', ['dailyAmount','dailyWorkDate','dailyAddDate'], false);byId('dailySelectedDates').querySelectorAll('button').forEach(b=>b.disabled=false);
    byId('dailyButton').disabled = !idToken || !currentUser;
  }
}

function renderDailyAmounts_(){byId('dailyTransportTotal').textContent=Number(dailySummary_.transportTotal||0).toLocaleString('ja-JP')+'円';byId('dailyTransportUnpaid').textContent='未精算残額 '+Number(dailySummary_.transportUnpaid||0).toLocaleString('ja-JP')+'円';byId('dailyExpenseTotal').textContent=Number(dailySummary_.expenseTotal||0).toLocaleString('ja-JP')+'円';byId('dailyExpenseUnpaid').textContent='未精算残額 '+Number(dailySummary_.expenseUnpaid||0).toLocaleString('ja-JP')+'円';}
function renderDailyDates_(){const list=byId('dailySelectedDates');list.replaceChildren();[...dailySelectedDates_].sort().forEach(date=>{const row=document.createElement('div');row.className='daily-date-chip';const label=document.createElement('span');label.textContent=dateLabel_(date);const remove=document.createElement('button');remove.type='button';remove.className='button secondary';remove.textContent='この日を解除';remove.addEventListener('click',()=>{dailySelectedDates_.delete(date);renderDailyDates_();refreshDailyAmounts_();});row.append(label,remove);list.appendChild(row);});}
async function refreshDailyAmounts_(){const serial=++dailySummarySerial_,dates=[...dailySelectedDates_].sort();if(!dates.length){dailySummary_={transportTotal:0,transportUnpaid:0,expenseTotal:0,expenseUnpaid:0};renderDailyAmounts_();byId('dailySummaryStatus').textContent='対象日を追加すると、登録済みの本人申請だけを表示します。';return;}byId('dailySummaryStatus').textContent='本人の申請額を確認しています…';try{const result=await callServer('dailyApplicationSummary',{idToken:idToken,workDates:dates});if(serial!==dailySummarySerial_)return;dailySummary_=result;renderDailyAmounts_();byId('dailySummaryStatus').textContent=result.days.map(d=>dateLabel_(d.date)).join('、')+' の交通費・経費申請を集計しました。日払い申請額・給与への加算はありません。';}catch(error){if(serial===dailySummarySerial_){dailySummary_={transportTotal:0,transportUnpaid:0,expenseTotal:0,expenseUnpaid:0};renderDailyAmounts_();byId('dailySummaryStatus').textContent='申請額を確認できませんでした。通信状態を確認して再度日付を選んでください。';showError(errorText(error,'本人の申請額を確認できませんでした。'));}}}
function addDailyDate_(){const date=byId('dailyWorkDate').value;if(!date){showError('対象勤務日を選択してください。','dailyWorkDate');return;}clearError();dailySelectedDates_.add(date);renderDailyDates_();refreshDailyAmounts_();}

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
    const fileData = await Promise.all(files.map(readFileAsDataURL));
    const result = await callServer('saveDailyReport', {
      idToken: idToken, requestId: reportRequestId, fileData: fileData,
      fileNames: files.map(function(file) { return file.name; }), note: note
    });
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
  Object.keys(forms).forEach(function(key) { byId(forms[key]).classList.toggle('hidden', key !== PAGE); });
  byId('pageTitle').textContent = titles[PAGE] || '申請';
  byId('userInfo').textContent = '利用者：' + currentUser.name;
  ['dailyButton', 'reportButton', 'expenseButton', 'calculateButton','shiftButton'].forEach(function(id) { byId(id).disabled = false; });
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
function nearError_(text,field){if(!field){if(/100文字|希望内容/.test(text))field='shiftNote';else if(/15日|希望日|各日の/.test(text))field='shiftCalendar';else if(/氏名/.test(text)&&needsStaffRegistration())field='realName';else if(/警備員区分/.test(text))field='guardRole';else if(/利用日/.test(text))field='transportDate';else if(/対象勤務日/.test(text))field=PAGE==='daily'?'dailyWorkDate':'expenseWorkDate';else if(/金額|整数|申請額/.test(text))field=PAGE==='daily'?'dailyAmount':'expenseAmount';else if(/区間|運賃/.test(text))field='route';else if(/写真|添付|レシート/.test(text))field=PAGE==='report'?'reportPhotos':'receipt';else if(/備考/.test(text))field='reportNote';}const target=field&&byId(field);if(target){const node=document.createElement('p');node.className='field-error';node.id='fieldError-'+field;node.textContent=text;node.setAttribute('role','alert');target.setAttribute('aria-invalid','true');target.setAttribute('aria-describedby',node.id);(target.closest('.input-area')||target.parentElement).appendChild(node);node.scrollIntoView({block:'nearest'});}else{const form=needsStaffRegistration()?byId('nameRegistration'):byId(forms[PAGE]);if(form)form.appendChild(byId('error'));}}
function reviewSubmission_(title,rows){if(reviewPending_)return Promise.resolve(false);reviewPending_=true;byId('reviewTitle').textContent=title;const list=byId('reviewList');list.replaceChildren();rows.forEach(function(row){const li=document.createElement('li'),label=document.createElement('strong'),value=document.createElement('span');label.textContent=row[0];value.textContent=String(row[1]);li.append(label,value);list.appendChild(li);});const dialog=byId('reviewDialog');dialog.showModal();return new Promise(function(resolve){function finish(ok){dialog.close();reviewPending_=false;dialog.removeEventListener('cancel',cancel);byId('reviewConfirm').onclick=null;byId('reviewCancel').onclick=null;resolve(ok);}function cancel(e){e.preventDefault();finish(false);}dialog.addEventListener('cancel',cancel);byId('reviewConfirm').onclick=()=>finish(true);byId('reviewCancel').onclick=()=>finish(false);});}
async function submitShift(){if(pending.shift||reviewPending_)return;clearError();clearMessage();try{requireAuthentication();const days=[...shiftSelection_].sort().map(x=>({date:x[0],shift:x[1]})),note=byId('shiftNote').value.trim();if(!days.length)throw new Error('希望日を1日以上選択してください。');if(days.length>15)throw new Error('希望日は15日までです。');if(Array.from(note).length>100)throw new Error('希望内容は100文字以内で入力してください。');if(!await reviewSubmission_('シフト申請内容の確認',days.map(d=>[dateLabel_(d.date),d.shift]).concat([['希望内容',note||'なし']])))return;setBusy('shift','shiftButton','全日分の保存を確認中…','内容を確認して提出',['shiftNote'],true);byId('shiftForm').querySelectorAll('button').forEach(b=>b.disabled=true);const id=requestFor_('shiftbatch',JSON.stringify([days,note])),result=await callServer('saveShiftRequests',{idToken:idToken,requestId:id,days:days,note:note});if(!result||result.complete!==true||result.count!==days.length||!Array.isArray(result.days)||JSON.stringify(result.days)!==JSON.stringify(days))throw new Error('全日分の保存を確認できませんでした。同じ内容で再送してください。');showMessage(result.message);clearRequest_('shiftbatch');shiftSelection_.clear();byId('shiftNote').value='';renderShiftCalendar_();renderShiftSelection_();}catch(error){showError(errorText(error,'全日分の提出を確認できませんでした。同じ内容で再送してください。'));}finally{setBusy('shift','shiftButton','全日分の保存を確認中…','内容を確認して提出',['shiftNote'],false);byId('shiftForm').querySelectorAll('button').forEach(b=>b.disabled=false);byId('shiftButton').disabled=!idToken||!currentUser;}}
function installChoiceInput_(id,values){const input=byId(id);input.style.display='none';input.removeAttribute('required');const host=document.createElement('div');host.id='choiceInput-'+id;input.after(host);function render(){host.replaceChildren(choiceButtons_(values,input.value,function(value){if(input.disabled||registeringName)return;input.value=value;if(id==='transportTripType')selectTransportTrip();render();}));}render();}
async function reviewAndSend_(kind){if(reviewPending_||pending[kind])return;clearError();clearMessage();try{requireAuthentication();let rows=[];if(kind==='transport'){if(!transportResult||transportResult.date!==byId('transportDate').value||transportResult.input!==byId('route').value.trim())throw new Error('先に運賃を計算してください。');rows=[['利用日',dateLabel_(transportResult.date)],['利用区間',transportResult.route],['往復／片道',transportResult.tripType],['交通費',Number(transportResult.amount).toLocaleString('ja-JP')+'円']];}if(kind==='daily'){const amount=validAmount(byId('dailyAmount').value,'日払い申請金額'),dates=[...dailySelectedDates_].sort();if(!dates.length)throw new Error('対象勤務日を1日以上追加してください。');dailySummary_=await callServer('dailyApplicationSummary',{idToken:idToken,workDates:dates});renderDailyAmounts_();rows=dates.map(d=>['対象勤務日',dateLabel_(d)]).concat([['交通費・申請合計',dailySummary_.transportTotal.toLocaleString('ja-JP')+'円'],['交通費・未精算残額',dailySummary_.transportUnpaid.toLocaleString('ja-JP')+'円'],['経費立替・申請合計',dailySummary_.expenseTotal.toLocaleString('ja-JP')+'円'],['経費立替・未精算残額',dailySummary_.expenseUnpaid.toLocaleString('ja-JP')+'円'],['日払い申請額',amount.toLocaleString('ja-JP')+'円']]);}if(kind==='expense'){const file=byId('receipt').files[0];validateFiles(file?[file]:[],false);const amount=validAmount(byId('expenseAmount').value,'経費申請額'),date=byId('expenseWorkDate').value;if(!date)throw new Error('対象勤務日を選択してください。');rows=[['対象勤務日',dateLabel_(date)],['経費申請額',amount.toLocaleString('ja-JP')+'円'],['領収書',file.name]];}if(kind==='report'){const files=Array.from(byId('reportPhotos').files);validateFiles(files,true);const note=byId('reportNote').value.trim();if(note.length>4000)throw new Error('備考は4000文字以内で入力してください。');rows=[['報告日',dateLabel_(BOOTSTRAP.today)],['日報写真',files.length+'枚'],['備考',note||'なし']];}if(await reviewSubmission_(titles[kind]+'の内容確認',rows))await ({transport:sendTransport_,daily:sendDaily_,expense:sendExpense_,report:sendReport_})[kind]();}catch(error){showError(errorText(error,'入力内容を確認してください。'));}}
async function submitTransport(){return reviewAndSend_('transport');}async function submitDaily(){return reviewAndSend_('daily');}async function submitExpense(){return reviewAndSend_('expense');}async function submitReport(){return reviewAndSend_('report');}
async function submitStaffName(){if(registeringName||reviewPending_)return;clearError();try{const name=byId('realName').value.trim(),role=byId('guardRole').value;if(name.length<2||name.length>60)throw new Error('氏名を2〜60文字で入力してください。');if(['一般警備員','資格保有警備員'].indexOf(role)<0)throw new Error('警備員区分を選択してください。');if(await reviewSubmission_('初回登録内容の確認',[['氏名',name],['警備員区分',role]]))await sendStaffName_();}catch(error){showError(errorText(error,'氏名と区分を確認してください。'));}}

function setFileStatus_(id){const input=byId(id),status=byId('fileStatus-'+id);if(!status)return;const files=Array.from(input.files);status.textContent=files.length?files.length+'枚を選択中：\n'+files.map(f=>f.name).join('\n'):'写真は未選択です。';}
function installFileInput_(id,label){const input=byId(id);input.style.display='none';const host=document.createElement('div');host.id='choiceInput-'+id;const button=document.createElement('button');button.type='button';button.className='button secondary';button.textContent=label;button.addEventListener('click',function(){if(!input.disabled)input.click();});const status=document.createElement('p');status.id='fileStatus-'+id;status.className='note';status.style.whiteSpace='pre-wrap';status.setAttribute('aria-live','polite');host.append(button,status);input.after(host);input.addEventListener('change',()=>setFileStatus_(id));setFileStatus_(id);}

function initializeApplication() {
  installFileInput_('reportPhotos','日報写真を選ぶ');installFileInput_('receipt','領収書の写真を選ぶ');
  installChoiceInput_('transportTripType',['往復','片道']);installChoiceInput_('guardRole',['一般警備員','資格保有警備員']);renderShiftCalendar_();renderShiftSelection_();
  byId('pageTitle').textContent = titles[PAGE] || '申請';
  Object.keys(forms).forEach(function(key) { byId(forms[key]).classList.toggle('hidden', key !== PAGE); });
  byId('transportDate').value = BOOTSTRAP.today;
  ['dailyWorkDate','expenseWorkDate'].forEach(function(id){byId(id).value=BOOTSTRAP.today;});
  byId('dailyAddDate').addEventListener('click',addDailyDate_);byId('dailyWorkDate').addEventListener('change',function(){if(dailySelectedDates_.has(byId('dailyWorkDate').value))return;});renderDailyDates_();renderDailyAmounts_();
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
      Object.keys(forms).forEach(function(key) { byId(forms[key]).classList.add('hidden'); });
      byId('nameRegistration').classList.remove('hidden');
      if (currentUser.registered) byId('realName').value = currentUser.name;
      byId('pageTitle').textContent = '初回氏名登録';
      byId('userInfo').textContent = '初回だけ、氏名と警備員区分を登録してください。';
    } else {
      showRegisteredApplication();
    }
  } catch (error) {
    Object.keys(forms).forEach(function(key) { byId(forms[key]).classList.add('hidden'); });
    byId('userInfo').textContent = 'LINEユーザー情報を確認できませんでした。';
    showError(error.message);
  }
}
initializeApplication();

