let dailyBreakdownRequest_=0,dailyBreakdownData_=null,dailyHistorySerial_=0;
function renderDailyAmounts_(){
 const b=dailySummary_,blocked=!!b?.pendingPayrollDates?.length;
 byId('dailyGrossCompact').textContent=b?dailyMoney_(b.grossAvailable):'—';
 byId('dailyAvailable').textContent=blocked?'更新中…':b?dailyMoney_(b.available):'—';
 const enabled=!!(b&&!blocked&&!dailyBalanceLoading_&&!pending.daily&&idToken&&currentUser);
 for(const id of ['dailyFullButton','dailyButton','dailyAmount'])byId(id).disabled=!enabled||b.available<=0;
 byId('dailyAmount').max=String(b?.available||0);byId('dailyRefresh').disabled=dailyBalanceLoading_||pending.daily;
 byId('dailyFullButton').textContent=pending.daily?'申請中…':blocked?'日給を更新しています…':b?'全額で申請（'+dailyMoney_(b.available)+'）':'全額で申請';
 byId('dailyButton').textContent=pending.daily?'申請中…':'入力した金額で申請';
 renderProvisionalPanel_('daily',b?.provisionalWork);
 byId('dailyProcessingCompact').textContent=b?.processing?.message||'';
 if(dailyBreakdownData_&&b&&dailyBreakdownData_.version!==b.version){dailyBreakdownData_=null;dailyBreakdownRequest_++;byId('dailyBreakdownBody').replaceChildren();byId('dailyBreakdownStatus').textContent='残高が変わりました。「内訳を更新」で確認してください。';}
}
async function toggleDailyBreakdown_(){
 const panel=byId('dailyBreakdownPanel');panel.hidden=!panel.hidden;byId('dailyDetailsButton').textContent=panel.hidden?'詳細を確認':'詳細を閉じる';byId('dailyDetailsButton').setAttribute('aria-expanded',String(!panel.hidden));
 if(!panel.hidden)await refreshDailyBreakdown_();else{dailyBreakdownRequest_++;dailyHistorySerial_++;}
}
function appendDailyDetailLine_(parent,label,value,color){const row=document.createElement('p'),title=document.createElement('span'),amount=document.createElement('strong');row.style.cssText='display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;border-bottom:1px solid #dce5ee;padding:12px 0';title.textContent=label;amount.textContent=value;if(color)amount.style.color=color;row.append(title,amount);parent.append(row);}
async function refreshDailyBreakdown_(){
 const serial=++dailyBreakdownRequest_,status=byId('dailyBreakdownStatus');status.textContent='内訳を読み込んでいます…';
 try{const b=await callServer('employeeDailyBalance',{idToken});if(serial!==dailyBreakdownRequest_||byId('dailyBreakdownPanel').hidden)return;validateDailyBalance_(b);dailySummary_=b;dailyBreakdownData_=b;
  const body=byId('dailyBreakdownBody');body.replaceChildren();const add=(label,value,color)=>appendDailyDetailLine_(body,label,dailyMoney_(value===0?0:value),color),a=b.approvedAllowances||{};
  add('給与額',b.dailyBaseWageRemaining??b.wageRemaining);add('交通費',b.dailyTransportRemaining??b.transportRemaining);if(b.expenseRemaining)add('経費・立替金',b.dailyExpenseRemaining??b.expenseRemaining);
  for(const [key,label] of [['driver','運転手当'],['qualification','資格者現場配置手当'],['other','その他手当'],['training','研修手当']])if(a[key])add(label,a[key],key==='training'?'#1565c0':null);
  const insurance=insuranceDisplay_(b);add('社会保険料',insurance.fixed);add('充当済み',insurance.applied);add('充当残額',-insurance.totalUnfunded,insurance.totalUnfunded?'#c00000':null);
  if(b.training){add('研修手当の総額',b.training.total,'#1565c0');add('研修手当の加算済み',b.training.allocated,'#1565c0');add('研修手当の残り',b.training.remaining,'#1565c0');}
  const r=b.reserve;if(r.loanTotal||r.loanRemaining||r.currentLoanPending){add('貸付総額',r.loanTotal||0);add('貸付の未返済残額',r.loanRemaining);add('今回の返済分',-r.currentLoanPending);}
  for(const s of b.salarySchedules||[])add(s.month+'月締め・'+s.payDate+'給与支払い分',s.amount);
  for(const x of b.allowanceRequests||[]){const p=document.createElement('p');p.style.cssText='background:#fff8db;padding:12px';p.textContent=(x.date||'')+' 手当 '+(x.status||'承認待ち')+'／運転 '+dailyMoney_(x.driver||0)+'・その他 '+dailyMoney_(x.other||0);body.append(p);}
  const month=byId('dailyHistoryMonth');month.max=b.today.slice(0,7);if(!month.value)month.value=month.max;status.textContent='最新の内訳を表示しています。';renderDailyAmounts_();
 }catch(e){if(serial===dailyBreakdownRequest_)status.textContent='内訳を取得できませんでした。「内訳を更新」で再確認できます。';}
}
async function loadDailyHistory_(){
 const serial=++dailyHistorySerial_,month=byId('dailyHistoryMonth').value,status=byId('dailyHistoryStatus'),body=byId('dailyHistoryBody');
 if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month)||month>(dailySummary_?.today||'').slice(0,7)){status.textContent='当月以前の月を選択してください。';return;}
 status.textContent='履歴を読み込んでいます…';body.replaceChildren();
 try{let offset=0,total=0;do{const r=await callServer('employeePayDetails',{idToken,month,offset});if(serial!==dailyHistorySerial_||byId('dailyBreakdownPanel').hidden)return;if(r.month!==month||!Array.isArray(r.items))throw Error('履歴を確認できません。');
  for(const item of r.items){const p=document.createElement('p');p.style.whiteSpace='pre-line';p.textContent=item.date+' '+item.kind+'\n'+dailyDetailLines_(item).join('\n');body.append(p);}total+=r.items.length;status.textContent=r.from+' ～ '+r.to+'／'+total+'件';offset=r.nextOffset;
 }while(offset!==null);}catch(e){if(serial===dailyHistorySerial_)status.textContent='履歴を取得できませんでした。もう一度お試しください。';}
}

function dailyDetailLines_(r){
 const yen=n=>Number(n||0).toLocaleString('ja-JP')+'円';
 if(r.kind!=='勤務')return [r.route||'',r.kind==='交通費'?'申請額：'+yen(r.amount):yen(r.amount),r.status].filter(Boolean);
 const lines=[r.shift+(r.completed?'／下番報告済み':'／上番中')];
 if(r.cancelled)lines.push(r.status);else if(r.completed)lines.push(r.base===null?'給与：反映待ち':'給与：'+yen(r.base));
 if(r.overtimeMinutes>0)lines.push('残業 '+r.overtimeMinutes+'分／'+(r.overtimeApproved?yen(r.overtimePay):'承認待ち'));
 for(const [label,key] of [['運転手当','driver'],['その他手当','other']])if(r[key]>0)lines.push(label+' '+yen(r[key])+'／'+(r.allowanceStatus==='承認済み'?'承認済み':r.allowanceStatus==='削除済み'?'削除済み':'承認待ち'));
 if(r.qualification>0)lines.push('資格者現場配置手当 '+yen(r.qualification));if(r.training>0)lines.push('研修手当 '+yen(r.training));return lines;
}

let startupDailyConsumed_=false,startupWorkConsumed_=false;
let provisionalBusy_=false,provisionalRefreshAt_=0;

// Pages入口の認証と、GAS JSON APIが検証した利用者を受け取ります。
// GAS の iframe 内で LIFF の再初期化や別ユーザーの取得は行いません。
const BOOTSTRAP = window.SHISHIDOGUMI_BOOTSTRAP;
let PAGE = BOOTSTRAP.page;
const idToken = BOOTSTRAP.idToken;
let currentUser = BOOTSTRAP.currentUser;
const titles = {work:'勤務報告',transport: '交通費申請', daily: '日払い申請', report: '日報報告', expense: '経費申請', shift: 'シフト申請'};
const forms = {work:'workForm',transport: 'transportForm', daily: 'dailyForm', report: 'reportForm', expense: 'expenseForm', shift: 'shiftForm'};
const pending = {transport: false, calculate: false, daily: false, report: false, expense: false, shift: false};
let transportResult = null;
let transportRequestId = null;
let dailyRequestId = null;
let dailyRequestAmount = null;
let dailySummarySerial_=0,dailySummary_=null,dailyBalanceLoading_=false,dailyPayrollTimer_=null,dailyPayrollPolls_=0;
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
  if(BOOTSTRAP.ownerShiftPreview){const routes={employeeShiftState:'employeeOwnerShiftState',saveShiftRequests:'employeeOwnerShiftApply'};if(!routes[method])return Promise.reject(new Error('検証画面ではシフトだけを確認できます。'));method=routes[method];}
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
 const key='shishidogumi-request:'+currentUser.userId+':'+kind,memory=requestFor_.memory_||(requestFor_.memory_=Object.create(null));
 let old=memory[key];if(!Object.prototype.hasOwnProperty.call(memory,key))try{old=JSON.parse(sessionStorage.getItem(key)||'null');}catch(e){}
 if(old&&old.signature===signature){memory[key]=old;return old.id;}
 const item={id:newRequestId(),signature:signature};memory[key]=item;try{sessionStorage.setItem(key,JSON.stringify(item));}catch(e){}return item.id;
}
function clearRequest_(kind){const key='shishidogumi-request:'+currentUser.userId+':'+kind;(requestFor_.memory_||(requestFor_.memory_=Object.create(null)))[key]=null;try{sessionStorage.removeItem(key);}catch(e){}}
function selectTransportTrip() {
  if(!transportResult)return;
  transportResult.tripType=byId('transportTripType').value;
  transportResult.actual=transportResult.tripType==='片道'?transportResult.oneWay:transportResult.roundTrip;transportResult.amount=Math.max(0,transportResult.actual-500);
  byId('resultAmount').textContent='会社支給額'+Number(transportResult.amount).toLocaleString('ja-JP')+'円';byId('resultAmount').style.color=transportResult.amount===0?'#c00000':'';byId('resultRoute').textContent=transportResult.route+'\n'+transportResult.tripType+'運賃'+transportResult.actual.toLocaleString('ja-JP')+'円';byId('resultRoute').style.whiteSpace='pre-line';
  transportRequestId=null;
}
function showStationChoices_(choices){
 let box=byId('stationChoices');if(!box){box=document.createElement('div');box.id='stationChoices';box.setAttribute('role','status');box.style.cssText='color:#c00000;white-space:pre-line;margin-top:20px;font-weight:700';byId('transportForm').appendChild(box);}
 box.textContent=(choices||[]).map(x=>x.position+'：同じ名前の駅があります\n'+x.candidates.map(c=>c.name+(c.prefecture&&!c.name.includes(c.prefecture)?'（'+c.prefecture+'）':'')).join('\n')+(x.selected?'\n今回の計算：'+x.selected:'')+'\n府県名＋駅名で指定できます（例：兵庫県尼崎駅）。').join('\n\n');box.hidden=!(choices||[]).length;
}
function invalidateTransport() {
  transportResult = null;
  transportRequestId = null;
  showStationChoices_([]);
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
    showStationChoices_(result&&result.stationChoices||[]);
    if(result&&result.needsStationSelection){byId('stationChoices').scrollIntoView({behavior:'smooth',block:'nearest'});return;}
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
function renderDailyAllowances_(){const panel=byId('dailyAllowancePanel'),list=byId('dailyAllowanceList');panel.style.cssText='background:#FFF8DB;color:#111;border:1px solid #E8D58B;border-radius:12px;padding:16px;margin:20px 0';const heading=panel.querySelector('h3');if(heading)heading.style.marginTop='0';let hint=panel.querySelector('.daily-allowance-hint')||panel.querySelector('p.note');if(!hint){hint=document.createElement('p');list.before(hint);}hint.className='note daily-allowance-hint';hint.style.color='#111';hint.textContent='承認待ちの手当は、日払い可能額に含まれていません';list.replaceChildren();const requests=(dailySummary_&&dailySummary_.allowanceRequests||[]).filter(a=>(a.driver||a.other)&&!['承認済み','削除済み'].includes(a.status));panel.hidden=!requests.length;requests.forEach(a=>{const card=document.createElement('div'),heading=document.createElement('p');heading.textContent='勤務日 '+a.date+' ／ '+employeeApprovalText_(a.status);card.appendChild(heading);[['運転手当',a.driver],['その他手当',a.other]].forEach(([label,amount])=>{if(!amount)return;const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=dailyMoney_(amount);row.append(dt,dd);const dl=document.createElement('dl');dl.className='daily-balance-list';dl.appendChild(row);card.appendChild(dl);});if(a.note){const note=document.createElement('p');note.textContent='備考 '+a.note;card.appendChild(note);}list.appendChild(card);});}
function renderSalarySchedules_(){
 let panel=byId('monthlySalaryPanel');if(!panel){panel=document.createElement('section');panel.id='monthlySalaryPanel';panel.setAttribute('aria-label','給与振込予定');panel.style.cssText='background:#eef6ff;border:1px solid #a8bfd7;border-radius:12px;padding:16px;margin:20px 0';byId('dailyAllowancePanel').before(panel);}
 panel.replaceChildren();const schedules=dailySummary_&&dailySummary_.salarySchedules||[],pendingMonths=dailySummary_&&dailySummary_.pendingSalaryMonths||[],items=schedules.map(s=>({...s,status:s.confirmed===false?'review':'closed'})).concat(pendingMonths.map(s=>({...s,status:'pending'}))).sort((a,b)=>a.month.localeCompare(b.month));panel.hidden=!items.length;
 if(!items.length)return;const h=document.createElement('h3');h.textContent='給与振込予定';h.style.marginTop='0';panel.appendChild(h);
 items.forEach(s=>{const card=document.createElement('section'),heading=document.createElement('h4'),date=document.createElement('p'),status=document.createElement('p'),[year,month]=s.month.split('-').map(Number),[py,pm,pd]=s.payDate.split('-').map(Number);card.style.cssText='padding:12px 0;border-top:1px solid #cbd9e8';heading.textContent=year+'年'+month+'月末締め';heading.style.margin='0 0 8px';date.textContent=py+'年'+pm+'月'+pd+'日 振込予定';card.append(heading,date);
 if(s.status==='closed'){status.textContent='締め完了';const label=document.createElement('p'),amount=document.createElement('strong');label.textContent='振込予定額（未払い分）';amount.textContent=dailyMoney_(s.amount);amount.style.cssText='display:block;font-size:1.65em;color:#174e7c;margin:8px 0';card.append(status,label,amount);const note=document.createElement('p');note.className='note';note.textContent='この金額は日払い申請できません。日払い可能額には含まれていません。';card.appendChild(note);}else{status.textContent=s.status==='review'?'会社が締め内容を確認中':'会社の締め処理待ち';card.appendChild(status);const note=document.createElement('p');note.className='note';note.textContent='会社の締め処理が完了すると、振込予定額を表示します。';card.appendChild(note);}panel.appendChild(card);});
}
function renderApprovedAllowanceBalances_(){
 const values=dailySummary_&&dailySummary_.approvedAllowances||{},items=[['Driver','運転手当','driver'],['Qualification','資格者現場配置手当','qualification'],['Other','その他手当','other'],['Training','研修手当','training']];let anchor=byId('dailyTransportRemaining').parentElement;
 items.forEach(([suffix,label,key])=>{const id='dailyApproved'+suffix;let value=byId(id),row;if(!value){row=document.createElement('div');const dt=document.createElement('dt');value=document.createElement('dd');value.id=id;dt.textContent=label;row.append(dt,value);anchor.after(row);}else row=value.parentElement;row.querySelector('dt').textContent=label;const amount=Number(values[key]||0);value.textContent=dailySummary_?dailyMoney_(amount):'—';row.hidden=!dailySummary_||!amount;if(key==='training'){row.style.color='#1565c0';value.style.color='#1565c0';}anchor=row;});
}
function installDailyBalanceGroups_(){
 for(const [id,label] of [['dailyWageRemaining','給与額'],['dailyExpenseRemaining','経費・立替金'],['dailyTransportRemaining','交通費']])byId(id).parentElement.querySelector('dt').textContent=label;
 const totalList=byId('dailyAvailable').parentElement.parentElement;
 function group(id,title){let section=byId(id);if(!section){section=document.createElement('section');section.id=id;section.setAttribute('aria-label',title);const h=document.createElement('h3');h.textContent=title;h.style.cssText='margin:0 0 12px;font-size:1.05em';const dl=document.createElement('dl');dl.className='daily-balance-list';section.append(h,dl);totalList.before(section);}section.setAttribute('aria-label',title);section.querySelector('h3').textContent=title;return section;}
 const income=group('dailyIncomeSection','給与・交通費・手当'),deductions=group('dailyDeductionsSection','充当残額');deductions.style.cssText='border-top:1px solid #d6e0e8;padding-top:16px;margin:20px 0';
 ['dailyWageRemaining','dailyExpenseRemaining','dailyTransportRemaining','dailyApprovedDriver','dailyApprovedQualification','dailyApprovedOther','dailyApprovedTraining'].forEach(id=>{const el=byId(id);if(el)income.querySelector('dl').appendChild(el.parentElement);});
 for(const [id,style] of [['dailyContributionBasis','font-size:.85em;color:#555;line-height:1.6;margin:8px 0'],['dailyContributionApplied','font-size:.95em;margin:12px 0']]){if(!byId(id)){const p=document.createElement('p');p.id=id;p.style.cssText=style;deductions.insertBefore(p,deductions.querySelector('dl'));}}
 deductions.querySelector('dl').appendChild(byId('dailySignedAvailable').parentElement);
 let progress=byId('dailyDeductionProgress');if(!progress){progress=document.createElement('section');progress.id='dailyDeductionProgress';deductions.appendChild(progress);}progress.hidden=true;
 progress.appendChild(byId('dailyInsuranceUnfunded').parentElement);progress.appendChild(byId('dailyInsuranceHint'));
 let reference=byId('dailyDeductionReference');if(!reference){reference=document.createElement('details');reference.id='dailyDeductionReference';reference.style.margin='12px 0';const summary=document.createElement('summary'),dl=document.createElement('dl');summary.textContent='貸付残高・控除履歴（参考）';dl.className='daily-balance-list';reference.append(summary,dl);totalList.before(reference);}
 ['dailyInsuranceDue','dailyLoanDue','dailyCarry','dailyLoanRemaining','dailySettledDeduction'].forEach(id=>reference.querySelector('dl').appendChild(byId(id).parentElement));
 byId('dailyLoanDue').parentElement.querySelector('dt').textContent='貸付の返済（当月）';byId('dailyCarry').parentElement.querySelector('dt').textContent='前月からの繰越分';
 reference.hidden=!!dailySummary_&&!dailySummary_.reserve.loanRemaining&&!dailySummary_.reserve.settled&&!dailySummary_.reserve.carry&&!dailySummary_.reserve.currentLoanPending;
 income.hidden=!!dailySummary_&&!(dailySummary_.dailyWageRemaining===undefined?dailySummary_.wageRemaining:dailySummary_.dailyWageRemaining)&&!(dailySummary_.dailyTransportRemaining===undefined?dailySummary_.transportRemaining:dailySummary_.dailyTransportRemaining)&&!(dailySummary_.dailyExpenseRemaining===undefined?dailySummary_.expenseRemaining:dailySummary_.dailyExpenseRemaining);
}
function renderContributionAmounts_(){
 const data=insuranceDisplay_(dailySummary_),basis=byId('dailyContributionBasis'),applied=byId('dailyContributionApplied'),remaining=byId('dailySignedAvailable');
 byId('dailyReserveTotal').parentElement.hidden=true;byId('dailyInsuranceUnfunded').parentElement.hidden=true;byId('dailyDeductionProgress').hidden=true;byId('dailyInsuranceHint').hidden=true;
 byId('dailyDeductionsSection').hidden=!!data&&data.required===0;
 remaining.parentElement.hidden=false;remaining.style.fontSize='1.25em';remaining.style.color=data&&data.totalUnfunded>0?'#c00000':'';
 remaining.textContent=data?dailyMoney_(data.totalUnfunded?-data.totalUnfunded:0):'—';
 if(!data){basis.textContent='社会保険料・返済額を確認しています…';applied.textContent='充当済み：—';return;}
 basis.textContent=[['社会保険料',data.fixed],['返済（当月）',data.loan],['前月からの繰越分',data.carry],['その他の差引分',data.otherRequired]].filter(([,v])=>v>0).map(([label,v])=>label+'：'+dailyMoney_(v)).join(' ／ ');
 applied.textContent='充当済み：'+dailyMoney_(data.applied);
}
function insuranceDisplay_(balance){
 if(!balance)return null;const r=balance.reserve,fixed=r.currentInsurance===undefined?r.currentInsurancePending:r.currentInsurance,shortfall=Math.max(0,-balance.signedAvailable),unfunded=Math.min(r.currentInsurancePending,shortfall);
 const loan=Number(r.currentLoan===undefined?r.currentLoanPending||0:r.currentLoan),carry=Number(r.carry||0),required=Math.max(shortfall,fixed+loan+carry);
 return {fixed,loan,carry,required,applied:required-shortfall,otherRequired:required-fixed-loan-carry,unfunded,otherUnfunded:shortfall-unfunded,totalUnfunded:shortfall};
}
function installInsuranceDisplay_(){
 const due=byId('dailyInsuranceDue');due.parentElement.querySelector('dt').textContent='社会保険料';
 if(!byId('dailyInsuranceUnfunded')){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent='社会保険料の未充当額';dd.id='dailyInsuranceUnfunded';dd.textContent='—';row.append(dt,dd);due.parentElement.after(row);}
 if(!byId('dailyInsuranceHint')){const p=document.createElement('p');p.id='dailyInsuranceHint';p.className='note';p.hidden=true;byId('dailyReserveTotal').parentElement.parentElement.after(p);}
 byId('dailySignedAvailable').parentElement.querySelector('dt').textContent='充当残額';
}
function renderDailyAmountsLegacy_(){
 installInsuranceDisplay_();
 renderApprovedAllowanceBalances_();
 installDailyBalanceGroups_();
 renderSalarySchedules_();

 renderDailyAllowances_();
 if(dailySummary_){const r=dailySummary_.reserve,insurance=insuranceDisplay_(dailySummary_);const values={dailyLoanDue:-r.currentLoanPending,dailyInsuranceDue:-insurance.fixed,dailyInsuranceUnfunded:-insurance.unfunded,dailyCarry:-r.carry,dailySettledDeduction:-r.settled,dailyLoanRemaining:r.loanRemaining,dailyReserveTotal:dailySummary_.dailyReservedDeduction===undefined?r.deductionTotal:dailySummary_.dailyReservedDeduction,dailySignedAvailable:-insurance.totalUnfunded};Object.entries(values).forEach(([id,value])=>{const el=byId(id);el.textContent=Number(value===0?0:value).toLocaleString('ja-JP')+'円';el.style.color=id==='dailySignedAvailable'&&value<0?'#c00000':'';});}else{['dailyLoanDue','dailyInsuranceDue','dailyInsuranceUnfunded','dailyCarry','dailySettledDeduction','dailyLoanRemaining','dailyReserveTotal','dailySignedAvailable'].forEach(id=>{byId(id).textContent='—';byId(id).style.color='';});}
 const fields={dailyWageRemaining:'wageRemaining',dailyExpenseRemaining:'expenseRemaining',dailyTransportRemaining:'transportRemaining',dailyAvailable:'available',dailyLifetimeTotal:'lifetimeTotal',dailyReceivedTotal:'receivedTotal'};
 Object.keys(fields).forEach(id=>{const key=id==='dailyWageRemaining'&&dailySummary_&&dailySummary_.dailyBaseWageRemaining!==undefined?'dailyBaseWageRemaining':['dailyWageRemaining','dailyExpenseRemaining','dailyTransportRemaining'].includes(id)&&dailySummary_&&dailySummary_[id]!==undefined?id:fields[id];byId(id).textContent=dailySummary_?dailyMoney_(dailySummary_[key]):'—';});

 ['dailyLoanDue','dailyInsuranceDue','dailyInsuranceUnfunded','dailyCarry','dailySettledDeduction','dailyLoanRemaining','dailyReserveTotal','dailySignedAvailable','dailyWageRemaining','dailyExpenseRemaining','dailyTransportRemaining','dailyAvailable','dailyLifetimeTotal','dailyReceivedTotal'].forEach(id=>{const el=byId(id);el.parentElement.hidden=id!=='dailyAvailable'&&!!dailySummary_&&Number(el.textContent.replace(/[^0-9.-]/g,''))===0;});
 renderContributionAmounts_();renderDailyCancellation_();renderTrainingAndProcessing_();
 const payrollPending=!!(dailySummary_&&dailySummary_.pendingPayrollDates&&dailySummary_.pendingPayrollDates.length);if(payrollPending)['dailyWageRemaining','dailyAvailable','dailyLifetimeTotal'].forEach(id=>{byId(id).textContent='更新中…';byId(id).parentElement.hidden=false;});
 const enabled=Boolean(dailySummary_&&!payrollPending&&!dailyBalanceLoading_&&!pending.daily&&idToken&&currentUser),available=dailySummary_?dailySummary_.available:0;
 byId('dailyFullButton').disabled=!enabled||available<=0;byId('dailyButton').disabled=!enabled||available<=0;byId('dailyAmount').disabled=!enabled||available<=0;
 byId('dailyRefresh').disabled=dailyBalanceLoading_||pending.daily;
 byId('dailyAmount').max=String(available);byId('dailyFullButton').textContent=pending.daily?'申請中…':dailySummary_?'全額で申請（'+dailyMoney_(available)+'）':'全額で申請';
 if(payrollPending)byId('dailyFullButton').textContent='日給を更新しています…';
 byId('dailyButton').textContent=pending.daily?'申請中…':'入力した金額で申請';
 renderProvisionalPanel_('daily',dailySummary_&&dailySummary_.provisionalWork);renderDailyCompact_();
}
async function refreshDailyAmounts_(automatic){
 if(pending.daily||provisionalBusy_||dailyBalanceLoading_)return;if(dailyPayrollTimer_){clearTimeout(dailyPayrollTimer_);dailyPayrollTimer_=null;}if(automatic!==true)dailyPayrollPolls_=0;const serial=++dailySummarySerial_;dailyBalanceLoading_=true;dailySummary_=null;renderDailyAmounts_();byId('dailySummaryStatus').textContent='残高を確認しています…';
 try{const started=Date.now();const initial=!startupDailyConsumed_&&BOOTSTRAP.initialDailyBalance;startupDailyConsumed_=true;const result=initial?await Promise.resolve(initial):await callServer('employeeDailySummary',{idToken:idToken});if(serial!==dailySummarySerial_)return;validateDailyBalance_(result);if(result.serverNow)workClockOffset_=result.serverNow-(started+Date.now())/2;dailySummary_=result;byId('dailyDate').textContent=result.today.replace(/-/g,'/');if(result.pendingPayrollDates&&result.pendingPayrollDates.length){byId('dailySummaryStatus').textContent=dailyPayrollPolls_<12?'下番した勤務の日給を更新しています。自動で残高を再確認します。':'日給の更新に時間がかかっています。「残高を更新」で再確認してください。';if(dailyPayrollPolls_<12){dailyPayrollPolls_++;dailyPayrollTimer_=setTimeout(()=>{dailyPayrollTimer_=null;if(document.visibilityState!=='hidden')return refreshDailyAmounts_(true);},Math.min(30000,1000*2**Math.min(dailyPayrollPolls_,5))+Math.floor(Math.random()*1000));}}else{dailyPayrollPolls_=0;byId('dailySummaryStatus').textContent='残業代・手当等は、会社承認後に加算されます';}}
 catch(error){if(serial===dailySummarySerial_){dailySummary_=null;const updating=/最新の申請内容を反映しています|給与・交通費・経費の反映を確認中/.test(errorText(error,''));if(updating&&dailyPayrollPolls_<3){dailyPayrollPolls_++;byId('dailySummaryStatus').textContent='申請内容を反映しています…';dailyPayrollTimer_=setTimeout(()=>{dailyPayrollTimer_=null;if(document.visibilityState!=='hidden')refreshDailyAmounts_(true);},1000);}else{byId('dailySummaryStatus').textContent='残高を確認できませんでした。「残高を更新」で再確認してください。';showError(errorText(error,'残高を確認できませんでした。'));}}}
 finally{if(serial===dailySummarySerial_){dailyBalanceLoading_=false;renderDailyAmounts_();}}
}
function validateDailyBalance_(b){
 if(b&&b.compact){if(!Number.isSafeInteger(b.grossAvailable)||b.grossAvailable<0||!Number.isSafeInteger(b.available)||b.available<0||b.available>b.grossAvailable||typeof b.version!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.today)||!Array.isArray(b.pendingPayrollDates))throw new Error('残高を確認できませんでした。');return;}
 const keys=['wageRemaining','expenseRemaining','transportRemaining','available','lifetimeTotal','receivedTotal'],scheduled=b&&b.scheduledSalaryTotal!==undefined?b.scheduledSalaryTotal:0;
 if(!b||keys.some(k=>!Number.isSafeInteger(b[k])||b[k]<0)||!Number.isSafeInteger(scheduled)||scheduled<0||!b.reserve||['deductionTotal','currentLoanPending','currentInsurancePending','carry','settled','loanRemaining'].some(k=>!Number.isSafeInteger(b.reserve[k])||b.reserve[k]<0)||b.wageRemaining+b.expenseRemaining+b.transportRemaining!==b.grossAvailable||b.lifetimeTotal-b.receivedTotal!==b.grossAvailable||b.signedAvailable!==b.grossAvailable-b.reserve.deductionTotal-scheduled||b.available!==Math.max(0,b.signedAvailable)||typeof b.version!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.today))throw new Error('残高の内訳を確認できませんでした。残高を更新してください。');
 if(b.pendingSalaryMonths!==undefined&&(!Array.isArray(b.pendingSalaryMonths)||b.pendingSalaryMonths.some(s=>!/^20\d\d-(0[1-9]|1[0-2])$/.test(s.month)||s.payDate!==new Date(Date.UTC(Number(s.month.slice(0,4)),Number(s.month.slice(5)),10)).toISOString().slice(0,10)||'amount' in s)))throw new Error('給与締め状況を確認できませんでした。');
 if(b.approvedAllowances!==undefined){const a=b.approvedAllowances;if(!a||['driver','qualification','other'].some(k=>!Number.isSafeInteger(a[k])||a[k]<0)||!Number.isSafeInteger(b.dailyBaseWageRemaining)||b.dailyBaseWageRemaining<0||b.dailyBaseWageRemaining+a.driver+a.qualification+a.other+(a.training||0)!==b.dailyWageRemaining)throw new Error('手当残高の内訳を確認できませんでした。');}
 if(b.salarySchedules){if(!Array.isArray(b.salarySchedules)||b.salarySchedules.some(s=>{if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(s.month)||!Number.isSafeInteger(s.amount)||s.amount<=0)return true;const [y,m]=s.month.split('-').map(Number);return s.payDate!==new Date(Date.UTC(y,m,10)).toISOString().slice(0,10);})||b.salarySchedules.reduce((n,s)=>n+s.amount,0)!==scheduled||['dailyWageRemaining','dailyExpenseRemaining','dailyTransportRemaining'].some(k=>!Number.isSafeInteger(b[k])||b[k]<0))throw new Error('給与日支払い分を確認できませんでした。残高を更新してください。');}
}
async function sendDaily_(mode){
 if(pending.daily||dailyBalanceLoading_||provisionalBusy_)return;clearError();clearMessage();
 try{requireAuthentication();if(!dailySummary_)throw new Error('先に残高を更新してください。');const snapshot=dailySummary_,amount=mode==='full'?snapshot.available:validAmount(byId('dailyAmount').value,'日払い申請金額');if(!Number.isSafeInteger(amount)||amount<=0||amount>snapshot.available)throw new Error('申請金額は1円以上、残高合計以下で入力してください。');
 pending.daily=true;renderDailyAmounts_();const requestId=requestFor_('daily-balance',JSON.stringify([snapshot.version,amount]));
 const result=await callServer('employeeDailyApply',{idToken:idToken,requestId:requestId,mode:mode,amount:amount,version:snapshot.version});
 if(!result||result.complete!==true||result.amount!==amount)throw new Error('受付結果を確認できませんでした。同じ内容で再送してください。');validateDailyBalance_(result.balance);dailySummary_=result.balance;byId('dailyAmount').value='';byId('dailySummaryStatus').textContent='残業代・手当等は、会社承認後に加算されます';showMessage(result.message+(result.balance.processing?'\n'+result.balance.processing.message:''));
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


let reportSites_=[],reportOptionsBusy_=false,reportOptionsReady_=false;
const reportInputIds_=['reportWorkDate','reportCompany','reportSite','reportShift','reportCountA','reportCountB','reportQualifiedPlacement','reportQualifiedNames','reportSiteCars','reportSiteDrivers','reportOwnCars','reportOwnDrivers'];
function loadReportOptions_(){byId('reportOptionsStatus').textContent='現場の事前登録は不要です。最後の確認画面で「提出」または「修正」を選んでください。提出後の再確認は不要です。';const receipt=reportNameStorage_();if(receipt&&!reportNamesReceipt_)beginReportNames_(receipt);}
function updateReportSites_(){}
function toggleReportQualified_(){const checked=byId('reportQualifiedPlacement').checked;byId('reportQualifiedFields').hidden=!checked;byId('reportCountA').disabled=!checked;byId('reportQualifiedNames').disabled=!checked;if(!checked){byId('reportCountA').value='0';byId('reportQualifiedNames').value='';}else if(Number(byId('reportCountA').value)===0)byId('reportCountA').value='1';byId('reportTotal').textContent='合計：'+(Number(byId('reportCountA').value||0)+Number(byId('reportCountB').value||0))+'名';}
function reportNumbers_(){const get=id=>{const s=byId(id).value;if(!/^\d{1,3}$/.test(s))throw new Error('人数・台数は0〜999の整数で入力してください。');return Number(s);};const x={workDate:byId('reportWorkDate').value,company:byId('reportCompany').value,site:byId('reportSite').value,shift:byId('reportShift').value,countA:get('reportCountA'),countB:get('reportCountB'),siteCars:get('reportSiteCars'),siteDrivers:get('reportSiteDrivers'),ownCars:get('reportOwnCars'),ownDrivers:get('reportOwnDrivers')};if(!x.workDate||x.workDate>BOOTSTRAP.today)throw new Error('勤務日は今日以前の日付を選択してください。');x.company=x.company.trim();x.site=x.site.trim();if(x.company.length<2||x.company.length>150||x.site.length<2||x.site.length>150)throw new Error('会社名・現場名を2〜150文字で入力してください。');if(!['日勤','夜勤'].includes(x.shift))throw new Error('日勤・夜勤を選択してください。');if(x.countA+x.countB<1||x.countA+x.countB>999)throw new Error('警備員の合計人数は1〜999名で入力してください。');x.qualifiedPlacement=byId('reportQualifiedPlacement').checked;x.qualifiedNames=x.qualifiedPlacement?byId('reportQualifiedNames').value.split(/[\r\n、,，]+/).map(n=>n.trim()).filter(Boolean):[];if(x.qualifiedPlacement&&(x.countA<1||x.qualifiedNames.length!==x.countA))throw new Error('資格者配置の人数と氏名の数を一致させてください。');if(!x.qualifiedPlacement&&x.countA!==0)throw new Error('資格者配置のチェックがない場合、警備員Aは0名です。');if(new Set(x.qualifiedNames.map(n=>n.normalize('NFKC').replace(/\s/g,''))).size!==x.qualifiedNames.length)throw new Error('資格者配置の氏名が重複しています。');return x;}
function reportReviewRows_(x){return [['勤務日',dateLabel_(x.workDate)],['会社名',x.company],['現場名',x.site],['勤務区分',x.shift],['警備員A',x.countA+'名'+(x.countA?'（'+x.qualifiedNames.join('・')+'）':'')],['警備員B',x.countB+'名'],['合計人数',(x.countA+x.countB)+'名'],['現場側の規制車',x.siteCars+'台／運転 '+x.siteDrivers+'名'],['宍戸組所有の規制車',x.ownCars+'台／運転 '+x.ownDrivers+'名']];}
function initializeReportBilling_(){byId('reportWorkDate').value=BOOTSTRAP.today;byId('reportWorkDate').max=BOOTSTRAP.today;byId('reportCompany').addEventListener('change',updateReportSites_);for(const id of reportInputIds_)byId(id).addEventListener('input',()=>{reportRequestId=null;byId('reportTotal').textContent='合計：'+(Number(byId('reportCountA').value||0)+Number(byId('reportCountB').value||0))+'名';byId('reportWeekday').textContent=byId('reportWorkDate').value?dateLabel_(byId('reportWorkDate').value):'';});byId('reportWeekday').textContent=dateLabel_(BOOTSTRAP.today);}



function renderReportPhotoButtons_(out){let area=byId('reportNamePhotoArea');if(!area){area=document.createElement('div');area.id='reportNamePhotoArea';byId('reportNamesEvidence').after(area);}area.replaceChildren();for(let i=0;i<5;i++){const button=document.createElement('button');button.type='button';button.textContent='日報写真'+(i+1)+'を確認';if(i>0)button.hidden=true;button.onclick=async()=>{button.disabled=true;try{const photo=await callServer('reportNamesPhoto',{idToken,receipt:out.receipt,index:i});let img=byId('reportNamePhoto');if(!img){img=document.createElement('img');img.id='reportNamePhoto';img.style.cssText='width:100%;height:auto;display:block;margin:12px 0';area.appendChild(img);}img.alt='申請した日報写真'+(i+1);img.src=photo.dataUrl;if(i<4)area.querySelectorAll('button')[i+1].hidden=false;}catch(e){showError(errorText(e,'写真を表示できませんでした。'));}finally{button.disabled=false;}};area.appendChild(button);}}

let reportNamesReceipt_=null,reportNamesView_=null,reportNamesBusy_=false,reportNamesTimer_=null,reportNamesPolls_=0;
function reportNameStorage_(value){try{if(value===null)localStorage.removeItem('report-name-receipt');else if(value!==undefined)localStorage.setItem('report-name-receipt',value);else return localStorage.getItem('report-name-receipt');}catch(e){}return value;}
function renderReportNames_(out){if(out.confirmed||out.excluded)window.SHISHIDOGUMI_RECOVERY?.finishReport(out.receipt||reportNamesReceipt_).catch(()=>{});reportNamesView_=out;if(out.confirmed){byId('reportNamesCard').hidden=true;reportNameStorage_(null);return;}renderReportPhotoButtons_(out);const card=byId('reportNamesCard');card.hidden=false;const ready=out.state==='確認待ち'||out.state==='読取不可';byId('reportNamesState').textContent=out.confirmed?'名称を確認し、会社・現場別の人数集計へ反映しました。':out.excluded?'重複・取消のため集計対象外です。会社へ確認してください。':ready?'写真の照合が終わりました。会社名・現場名を確認してください。':'人数・写真は保存済みです。写真の会社名・現場名を照合しています。';byId('reportNamesEvidence').textContent=['入力：'+out.inputCompany+' ／ '+out.inputSite,'写真からの候補：'+(out.ocrCompany||'会社名を判別できません')+' ／ '+(out.ocrSite||'現場名を判別できません'),out.warning||''].join('\n');byId('reportNamesEvidence').style.whiteSpace='pre-line';for(const [id,values] of [['reportCompanyCandidates',out.companyCandidates],['reportSiteCandidates',out.siteCandidates]]){byId(id).replaceChildren();(values||[]).forEach(v=>byId(id).appendChild(new Option(v,v)));}if(!reportNamesBusy_){byId('reportConfirmCompany').value=out.company;byId('reportConfirmSite').value=out.site;}byId('reportNamesConfirm').disabled=!(ready&&!out.confirmed&&!out.excluded);if(out.confirmed||out.excluded)reportNameStorage_(null);}
async function refreshReportNames_(prepare){if(reportNamesBusy_||!reportNamesReceipt_)return;reportNamesBusy_=true;byId('reportNamesRefresh').disabled=true;try{const out=await callServer(prepare?'prepareReportNames':'reportNamesStatus',{idToken,receipt:reportNamesReceipt_});reportNamesBusy_=false;renderReportNames_(out);if(!out.confirmed&&!out.excluded&&['照合待ち','照合中'].includes(out.state)&&reportNamesPolls_++<20){clearTimeout(reportNamesTimer_);reportNamesTimer_=setTimeout(()=>refreshReportNames_(false),2000);}}catch(e){showError(errorText(e,'照合状況を確認できませんでした。人数と写真の受付は保持されています。'));}finally{reportNamesBusy_=false;byId('reportNamesRefresh').disabled=false;}}
async function confirmReportNames_(){if(reportNamesBusy_||!reportNamesView_)return;const company=byId('reportConfirmCompany').value.trim(),site=byId('reportConfirmSite').value.trim();if(company.length<2||site.length<2){showError('会社名・現場名を2文字以上で入力してください。');return;}reportNamesBusy_=true;byId('reportNamesConfirm').disabled=true;try{const out=await callServer('confirmReportNames',{idToken,receipt:reportNamesReceipt_,version:reportNamesView_.version,company,site});reportNamesBusy_=false;renderReportNames_(out);showMessage('会社名・現場名を確定しました。人数集計に反映しました。');}catch(e){reportNamesBusy_=false;showError(errorText(e,'名称を確定できませんでした。'));await refreshReportNames_(false);}finally{reportNamesBusy_=false;}}
function beginReportNames_(receipt){reportNamesReceipt_=receipt;reportNamesView_=null;reportNameStorage_(receipt);reportNamesPolls_=0;byId('reportNamesCard').hidden=false;byId('reportNamesState').textContent='人数は保存済みです。写真を照合しています…';refreshReportNames_(true);}

async function sendReport_(reviewed) {
  if(reviewed!==true)return reviewAndSend_('report');
  if (pending.report) return;
  clearError(); clearMessage();
  try {
    if(reportNamesReceipt_&&(!reportNamesView_||!reportNamesView_.confirmed&&!reportNamesView_.excluded))throw new Error('先ほどの日報の会社名・現場名を確認してから、次の日報を送信してください。');
    requireAuthentication();
    const files = Array.from(byId('reportPhotos').files);
    const note = byId('reportNote').value.trim();
    const reportData=reportNumbers_();
    validateFiles(files, true);
    if (note.length > 4000) throw new Error('備考は4000文字以内で入力してください。');
    setBusy('report', 'reportButton', '日報を送信中…', '日報を報告する', ['reportPhotos', 'reportNote',...reportInputIds_], true);
    reportRequestId=requestFor_('daily-report',JSON.stringify([reportData,note,files.map(f=>[f.name,f.size,f.lastModified])]));
    const started=performance.now();
    const fileData = await Promise.all(files.map(prepareReportPhoto_));
    byId('reportButton').textContent='写真を保存しています…';
    const result = await callServer('saveDailyReport', {
      ...reportData, confirmNamesOnSubmit:true, idToken: idToken, requestId: reportRequestId, fileData: fileData,
      fileNames: files.map(function(file) { return file.name; }), note: note
    });
    console.info('daily-report-submit',{durationMs:Math.round(performance.now()-started),photos:files.length});
    showMessage(typeof result==='string'?result:result.message);
    if(result&&result.namesConfirmed===true){reportNamesReceipt_=null;reportNamesView_=null;reportNameStorage_(null);clearTimeout(reportNamesTimer_);byId('reportNamesCard').hidden=true;await window.SHISHIDOGUMI_RECOVERY?.finishReport(result.receipt).catch(()=>{});}else if(result&&result.receipt)beginReportNames_(result.receipt);
    clearRequest_('daily-report');reportRequestId=null;
    byId('reportPhotos').value = '';
    byId('reportNote').value = '';
    previewReportPhotos();
  } catch (error) {
    // 写真と受付IDを保持。保存済みの画像は同じ再送で二重登録しません。
    showError(errorText(error, '日報送信に失敗しました。写真を変更せず、もう一度送信してください。'));
  } finally {
    setBusy('report', 'reportButton', '日報を送信中…', '日報を報告する', ['reportPhotos', 'reportNote',...reportInputIds_], false);
    byId('reportButton').disabled = !idToken || !currentUser;toggleReportQualified_();
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
  requireAuthentication();applyQualificationVisibility_();
  byId('nameRegistration').classList.add('hidden');
  Object.keys(forms).forEach(function(key) { if(!byId(forms[key]))return;byId(forms[key]).classList.toggle('hidden', key !== PAGE); });
  byId('pageTitle').textContent = titles[PAGE] || '申請';
  byId('userInfo').textContent = '利用者：' + currentUser.name;
  if(PAGE==='daily')refreshDailyAmounts_();if(PAGE==='shift')refreshShiftState_(true);if(PAGE==='report')loadReportOptions_();
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
        .registerStaffName({idToken: idToken, realName: realName, guardRole: guardRole, page: PAGE});
    });
    if (!user || !user.registered || user.needsNameRegistration) throw new Error('登録結果を確認できませんでした。もう一度登録してください。');
    currentUser = user;
    for(const key of ['initialWorkState','initialDailyBalance','initialShiftState'])if(user[key])BOOTSTRAP[key]=user[key];
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


let submittedShiftDays_=new Map((BOOTSTRAP.initialShiftState&&BOOTSTRAP.initialShiftState.days||[]).map(d=>[d.date,d])),shiftStateReady_=!!BOOTSTRAP.initialShiftState,shiftStateLoading_=false,shiftInitialConsumed_=false;
function installShiftLegend_(){if(byId('shiftLegend'))return;const p=document.createElement('p');p.id='shiftLegend';p.className='note';p.textContent='毎週水曜日までに翌週水曜日までのシフトを提出してください。変更時は直接宍戸組営業LINEへご相談ください。';byId('shiftForm').querySelector('.calendar-toolbar').before(p);const b=document.createElement('button');b.id='shiftStateRefresh';b.type='button';b.className='button secondary';b.textContent='提出状況を更新';b.addEventListener('click',()=>refreshShiftState_(false));p.before(b);const info=document.createElement('p');info.id='shiftStateStatus';info.className='note';info.setAttribute('role','status');p.after(info);}
function acceptShiftState_(state){if(!state||!Array.isArray(state.days))throw new Error('提出済みシフトを確認できませんでした。');submittedShiftDays_=new Map(state.days.map(d=>[d.date,d]));shiftSelection_.forEach((_,date)=>{if(submittedShiftDays_.has(date))shiftSelection_.delete(date);});shiftStateReady_=true;renderShiftCalendar_();renderShiftSelection_();}
async function refreshShiftState_(initial){if(shiftStateLoading_||pending.shift||reviewPending_)return;installShiftLegend_();shiftStateLoading_=true;byId('shiftStateStatus').textContent='提出済みシフトを確認しています…';byId('shiftButton').disabled=true;try{const useInitial=initial!==false&&!shiftInitialConsumed_&&BOOTSTRAP.initialShiftState;shiftInitialConsumed_=true;const state=useInitial||await callServer('employeeShiftState',{idToken:idToken});if(initial===false){shiftSelection_.clear();clearRequest_('shiftbatch');}acceptShiftState_(state);byId('shiftStateStatus').textContent='未提出の日を選択してください。';}catch(error){shiftStateReady_=false;showError(errorText(error,'提出済みシフトを読み込めませんでした。'));byId('shiftStateStatus').textContent='提出状況を更新してから選択してください。';}finally{shiftStateLoading_=false;byId('shiftStateRefresh').disabled=false;byId('shiftButton').disabled=!shiftStateReady_;renderShiftCalendar_();}}

const shiftSelection_=new Map();let shiftMonth_=BOOTSTRAP.today.slice(0,7),reviewPending_=false;
const shiftChoices_=['日勤','夜勤','どちらでも'];
function dateLabel_(date){const p=date.split('-').map(Number),d=new Date(p[0],p[1]-1,p[2]);return p[0]+'年'+p[1]+'月'+p[2]+'日（'+['日','月','火','水','木','金','土'][d.getDay()]+'）';}
function choiceButtons_(choices,current,onChange){const wrap=document.createElement('div');wrap.className='choice-buttons'+(choices.length===2?' two':'');choices.forEach(function(value){const b=document.createElement('button');b.type='button';b.className='choice-button';b.dataset.value=value;b.setAttribute('aria-pressed',String(value===current));b.textContent=value;if(value===current){const mark=document.createElement('span');mark.className='selected-indicator';mark.textContent='選択中';b.appendChild(mark);}b.addEventListener('click',function(){if(pending.shift)return;onChange(value);});wrap.appendChild(b);});return wrap;}
function renderShiftSelection_(){byId('shiftCount').textContent='選択中：'+shiftSelection_.size+'／15日';const list=byId('shiftSelected');list.replaceChildren();[...shiftSelection_].sort().forEach(function(entry){const date=entry[0],value=entry[1],card=document.createElement('section');card.className='shift-day-card';const heading=document.createElement('div');heading.className='shift-day-heading';heading.textContent=dateLabel_(date);card.appendChild(heading);card.appendChild(choiceButtons_(shiftChoices_,value,function(v){shiftSelection_.set(date,v);renderShiftSelection_();renderShiftCalendar_();}));const remove=document.createElement('button');remove.type='button';remove.className='shift-remove';remove.textContent='この日を選択解除';remove.addEventListener('click',function(){toggleShiftDate_(date);});card.appendChild(remove);list.appendChild(card);});}
function toggleShiftDate_(date){if(pending.shift||reviewPending_||shiftStateLoading_||!shiftStateReady_||date<BOOTSTRAP.today||submittedShiftDays_.has(date))return;clearError();if(shiftSelection_.has(date))shiftSelection_.delete(date);else if(shiftSelection_.size>=15){showError('一度に選択できるのは15日までです。選択中の日を押すと解除できます。','shiftCalendar');return;}else shiftSelection_.set(date,submittedShiftDays_.get(date)?.shift||'どちらでも');renderShiftCalendar_();renderShiftSelection_();}
function setAllShiftChoices_(value){if(pending.shift||reviewPending_)return;for(const date of shiftSelection_.keys())shiftSelection_.set(date,value);renderShiftSelection_();byId('shiftBulkStatus').textContent='全選択日に「'+value+'」を設定しました。日ごとに変更できます。';}
function moveShiftMonth_(delta){if(pending.shift||reviewPending_)return;const p=shiftMonth_.split('-').map(Number),d=new Date(p[0],p[1]-1+delta,1);shiftMonth_=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');renderShiftCalendar_();}
function renderSubmittedShiftList_(){const list=byId('shiftSubmittedList'),heading=byId('shiftSubmittedMonth');if(!list||!heading)return;list.replaceChildren();heading.textContent=byId('shiftMonthTitle').textContent+'のシフト内容';if(!shiftStateReady_){const p=document.createElement('li');p.textContent='提出状況を更新すると確認できます。';list.appendChild(p);return;}const days=[...submittedShiftDays_.values()].filter(d=>d.date.slice(0,7)===shiftMonth_).sort((a,b)=>a.date.localeCompare(b.date));if(!days.length){const p=document.createElement('li');p.textContent='この月の提出済みシフトはありません。';list.appendChild(p);return;}days.forEach(d=>{const p=document.createElement('li');p.style.margin='12px 0';p.textContent=dateLabel_(d.date)+'：'+d.shift+(d.companySpecified?'（会社指定）':'')+(d.note?' ／ 希望内容：'+d.note:'');list.appendChild(p);});}
function renderShiftCalendar_(){installShiftLegend_();const p=shiftMonth_.split('-').map(Number),first=new Date(p[0],p[1]-1,1),count=new Date(p[0],p[1],0).getDate();byId('shiftMonthTitle').textContent=p[0]+'年'+p[1]+'月';const grid=byId('shiftCalendar');grid.replaceChildren();for(let i=0;i<first.getDay();i++){const empty=document.createElement('span');empty.className='calendar-blank';grid.appendChild(empty);}for(let day=1;day<=count;day++){const date=shiftMonth_+'-'+String(day).padStart(2,'0'),saved=submittedShiftDays_.get(date),selected=!saved&&shiftSelection_.has(date),b=document.createElement('button');b.type='button';b.className='calendar-day';b.dataset.date=date;b.setAttribute('aria-label',dateLabel_(date)+(saved?' '+(saved.companySpecified?'会社指定':'提出済み')+' '+saved.shift:'')+(selected?' 今回の選択中':''));b.setAttribute('aria-pressed',String(selected));b.textContent=String(day);b.disabled=pending.shift||shiftStateLoading_||!shiftStateReady_||date<BOOTSTRAP.today||!!saved;b.setAttribute('aria-disabled',String(b.disabled));if(saved){b.title=(saved.companySpecified?'会社指定のため':'提出済みのため')+'選択できません。変更時は直接宍戸組営業LINEへご相談ください。';const colors=saved.shift==='日勤'?['#DFF3FF','#123C58','#94BDD4']:saved.shift==='夜勤'?['#FFF3B0','#584900','#D6BC58']:['#F1F3F5','#333','#BFC6CD'];b.style.background=colors[0];b.style.color=colors[1];b.style.border='3px solid '+colors[2];}if(selected){b.style.background='#174A7E';b.style.color='#FFFFFF';b.style.border='3px solid #092C50';}const weekday=document.createElement('span');weekday.className='calendar-weekday';weekday.textContent=['日','月','火','水','木','金','土'][new Date(p[0],p[1]-1,day).getDay()]+'曜日';b.appendChild(weekday);if(saved||selected){const mark=document.createElement('span');mark.className='selected-indicator';mark.style.color='inherit';mark.textContent=selected?'今回選択':(saved.companySpecified?'会社指定':'提出済')+'・'+saved.shift;b.appendChild(mark);}if(!saved)b.addEventListener('click',()=>toggleShiftDate_(date));grid.appendChild(b);}renderSubmittedShiftList_();}
function nearError_(text,field){if(!field){if(/100文字|希望内容/.test(text))field='shiftNote';else if(/15日|希望日|各日の/.test(text))field='shiftCalendar';else if(/氏名/.test(text)&&needsStaffRegistration())field='realName';else if(/警備員区分/.test(text))field='guardRole';else if(/利用日/.test(text))field='transportDate';else if(/対象勤務日/.test(text))field=PAGE==='daily'?'dailyAmount':'expenseWorkDate';else if(/金額|整数|申請額/.test(text))field=PAGE==='daily'?'dailyAmount':'expenseAmount';else if(/区間|運賃/.test(text))field='route';else if(/写真|添付|レシート/.test(text))field=PAGE==='report'?'reportPhotos':'receipt';else if(/備考/.test(text))field='reportNote';}const target=field&&byId(field);if(target){const node=document.createElement('p');node.className='field-error';node.id='fieldError-'+field;node.textContent=text;node.setAttribute('role','alert');target.setAttribute('aria-invalid','true');target.setAttribute('aria-describedby',node.id);(target.closest('.input-area')||target.parentElement).appendChild(node);node.scrollIntoView({block:'nearest'});}else{const form=needsStaffRegistration()?byId('nameRegistration'):byId(forms[PAGE]);if(form)form.appendChild(byId('error'));}}
function reviewSubmission_(title,rows,options){if(reviewPending_)return Promise.resolve(false);reviewPending_=true;byId('reviewConfirm').textContent=options?.confirm||'この内容で提出する';byId('reviewCancel').textContent=options?.cancel||'戻って修正する';byId('reviewTitle').textContent=title;const list=byId('reviewList');list.replaceChildren();rows.forEach(function(row){const li=document.createElement('li'),label=document.createElement('strong'),value=document.createElement('span');label.textContent=row[0];value.textContent=String(row[1]);if(row[0]==='会社支給額'&&row[1]==='0円')value.style.color='#c00000';li.append(label,value);list.appendChild(li);});const dialog=byId('reviewDialog');dialog.showModal();return new Promise(function(resolve){function finish(ok){dialog.close();reviewPending_=false;dialog.removeEventListener('cancel',cancel);byId('reviewConfirm').onclick=null;byId('reviewCancel').onclick=null;resolve(ok);}function cancel(e){e.preventDefault();finish(false);}dialog.addEventListener('cancel',cancel);byId('reviewConfirm').onclick=()=>finish(true);byId('reviewCancel').onclick=()=>finish(false);});}
async function submitShift(){if(pending.shift||reviewPending_||shiftStateLoading_)return;clearError();clearMessage();try{requireAuthentication();if(!shiftStateReady_)throw new Error('先に提出状況を更新してください。');const days=[...shiftSelection_].sort().map(x=>({date:x[0],shift:x[1]})),versions=Object.fromEntries(days.map(d=>[d.date,submittedShiftDays_.get(d.date)?.version||''])),note=byId('shiftNote').value.trim();if(!days.length)throw new Error('希望日を1日以上選択してください。');if(days.length>15)throw new Error('希望日は15日までです。');if(Array.from(note).length>100)throw new Error('希望内容は100文字以内で入力してください。');if(!await reviewSubmission_('シフト申請の確認',days.map(d=>[dateLabel_(d.date),(submittedShiftDays_.has(d.date)?submittedShiftDays_.get(d.date).shift+' → ':'')+d.shift]).concat([['希望内容',note||'提出済みの備考を維持（新規日はなし）']])))return;setBusy('shift','shiftButton','全日分の保存を確認中…','内容を確認して提出',['shiftNote'],true);byId('shiftForm').querySelectorAll('button').forEach(b=>b.disabled=true);const id=requestFor_('shiftbatch',JSON.stringify([days,note,versions])),result=await callServer('saveShiftRequests',{idToken:idToken,requestId:id,days:days,note:note,versions:versions});if(!result||result.complete!==true||result.count!==days.length||!Array.isArray(result.days)||JSON.stringify(result.days)!==JSON.stringify(days)||!result.state)throw new Error('全日分の保存を確認できませんでした。同じ内容で再送してください。');showMessage(result.message);clearRequest_('shiftbatch');shiftSelection_.clear();byId('shiftNote').value='';acceptShiftState_(result.state);if(byId('shiftSubmittedDetails'))byId('shiftSubmittedDetails').open=true;}catch(error){showError(errorText(error,'全日分の提出を確認できませんでした。同じ内容で再送してください。'));}finally{setBusy('shift','shiftButton','全日分の保存を確認中…','内容を確認して提出',['shiftNote'],false);byId('shiftForm').querySelectorAll('button').forEach(b=>b.disabled=false);byId('shiftButton').disabled=!idToken||!currentUser||!shiftStateReady_;renderShiftCalendar_();}}
function installChoiceInput_(id,values){const input=byId(id);input.style.display='none';input.removeAttribute('required');const host=document.createElement('div');host.id='choiceInput-'+id;input.after(host);function render(){host.replaceChildren(choiceButtons_(values,input.value,function(value){if(input.disabled||registeringName)return;input.value=value;if(id==='transportTripType')selectTransportTrip();render();}));}render();}
async function reviewAndSend_(kind){if(reviewPending_||pending[kind])return;clearError();clearMessage();try{requireAuthentication();let rows=[];if(kind==='transport'){if(!transportResult||transportResult.date!==byId('transportDate').value||transportResult.input!==byId('route').value.trim())throw new Error('先に運賃を計算してください。');rows=[['利用日',dateLabel_(transportResult.date)],['利用区間',transportResult.route],[transportResult.tripType+'運賃',Number(transportResult.actual).toLocaleString('ja-JP')+'円'],['会社支給額',Number(transportResult.amount).toLocaleString('ja-JP')+'円']];}if(kind==='expense'){const file=byId('receipt').files[0];validateFiles(file?[file]:[],false);const amount=validAmount(byId('expenseAmount').value,'経費申請額'),date=byId('expenseWorkDate').value;if(!date)throw new Error('対象勤務日を選択してください。');rows=[['対象勤務日',dateLabel_(date)],['経費申請額',amount.toLocaleString('ja-JP')+'円'],['領収書',file.name]];}if(kind==='report'){const files=Array.from(byId('reportPhotos').files);validateFiles(files,true);const note=byId('reportNote').value.trim();if(note.length>4000)throw new Error('備考は4000文字以内で入力してください。');rows=[...reportReviewRows_(reportNumbers_()),['日報写真',files.length+'枚'],['備考',note||'なし']];}if(await reviewSubmission_(titles[kind]+(kind==='report'?'の最終確認':'の内容確認'),rows,kind==='report'?{confirm:'提出',cancel:'修正'}:undefined)){if(kind==='report')await sendReport_(true);else await ({transport:sendTransport_,daily:sendDaily_,expense:sendExpense_})[kind]();}}catch(error){showError(errorText(error,'入力内容を確認してください。'));}}
async function submitTransport(){return reviewAndSend_('transport');}async function submitDaily(){return sendDaily_('custom');}async function submitExpense(){return reviewAndSend_('expense');}async function submitReport(){return reviewAndSend_('report');}
async function submitStaffName(){if(registeringName||reviewPending_)return;clearError();try{const name=byId('realName').value.trim(),role=byId('guardRole').value;if(name.length<2||name.length>60)throw new Error('氏名を2〜60文字で入力してください。');if(['一般警備員','資格保有警備員'].indexOf(role)<0)throw new Error('警備員区分を選択してください。');if(await reviewSubmission_('初回登録内容の確認',[['氏名',name],['警備員区分',role]]))await sendStaffName_();}catch(error){showError(errorText(error,'氏名と区分を確認してください。'));}}

function setFileStatus_(id){const input=byId(id),status=byId('fileStatus-'+id);if(!status)return;const files=Array.from(input.files);status.textContent=files.length?files.length+'枚を選択中：\n'+files.map(f=>f.name).join('\n'):'写真は未選択です。';}
function installFileInput_(id,label){const input=byId(id);input.style.display='none';const host=document.createElement('div');host.id='choiceInput-'+id;const button=document.createElement('button');button.type='button';button.className='button secondary';button.textContent=label;button.addEventListener('click',function(){if(!input.disabled)input.click();});const status=document.createElement('p');status.id='fileStatus-'+id;status.className='note';status.style.whiteSpace='pre-wrap';status.setAttribute('aria-live','polite');host.append(button,status);input.after(host);input.addEventListener('change',()=>setFileStatus_(id));setFileStatus_(id);}

function initializeApplication() {
  initializeReportBilling_();
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
let workStateReady_=false;let workAllowanceLoadedId_=null;let workReportState_={active:null,history:[]},workReportBusy_=false;
function employeeApprovalText_(status){return !status||['申請中','承認','承認待ち'].includes(status)?'承認待ち':status;}
function workOvertimeText_(w){return '残業'+w.minutes+'分'+(Number(w.minutes)>0?'（'+(w.status==='残業承認済み'?'承認済み':w.status==='差戻し'?'差戻し':'承認待ち')+'）':'');}
function workAllowanceText_(a){if(!a)return '';const lines=[],state=employeeApprovalText_(a.status);if(a.driver)lines.push('運転手当 '+Number(a.driver).toLocaleString('ja-JP')+'円（'+state+'）');if(a.other)lines.push('その他手当 '+Number(a.other).toLocaleString('ja-JP')+'円（'+state+'）');if(a.qualification)lines.push('資格者 現場配置手当 '+Number(a.qualification).toLocaleString('ja-JP')+'円');if((a.driver||a.other||a.qualification)&&a.note)lines.push('手当備考 '+a.note);return lines.length?'\n'+lines.join('\n'):'';}
function renderWorkReport_(){updateWorkOutcomeUI_();const active=workReportState_.active;if(active&&workAllowanceLoadedId_!==active.id){workAllowanceLoadedId_=active.id;fillWorkAllowance_('Out',active.allowance);}if(!active)workAllowanceLoadedId_=null;for(const phase of ['In','Out'])for(const suffix of ['Toggle','Driver','Other','Qualified','Note'])byId('workAllowance'+phase+suffix).disabled=workReportBusy_||provisionalBusy_;byId('workClockInPanel').hidden=!!active;byId('workClockOutPanel').hidden=!active;if(active)byId('workActiveInfo').textContent=active.date+' '+active.shift+'\n'+(active.site?active.site+'\n':'')+'上番 '+active.clockIn+(active.provisional&&active.provisional.reportedAt?'\n仮下番 '+active.provisional.reportedAt+'（正式下番待ち）':'')+workAllowanceText_(active.allowance);byId('workReportHistory').replaceChildren();workReportState_.history.forEach(function(w){const card=document.createElement('p');card.textContent=w.date+' '+w.shift+'　'+(w.status==='残業承認待ち'?'下番報告済み':w.status)+'\n上番 '+w.clockIn+(w.clockOut?(w.cancellation?'\n中止報告 '+w.clockOut:'\n下番 '+w.clockOut+'　'+workOvertimeText_(w)):'')+(w.provisional&&w.provisional.reportedAt?'\n仮下番 '+w.provisional.reportedAt:'')+workAllowanceText_(w.allowance)+(w.reflected?'\n給与 '+w.reflected:'');if(w.allowance&&w.allowance.training){const line=document.createElement('span');line.style.cssText='display:block;color:#1565c0;font-weight:bold';line.textContent='研修手当 '+Number(w.allowance.training).toLocaleString('ja-JP')+'円';card.append(line);}byId('workReportHistory').appendChild(card);});byId('workClockInButton').disabled=!workStateReady_||workReportBusy_||!!active;byId('workClockOutButton').disabled=!workStateReady_||workReportBusy_||!active;byId('workRefreshButton').disabled=workReportBusy_||provisionalBusy_;renderProvisionalPanel_('work',active);applyQualificationVisibility_();}
function acceptWorkState_(state,started){if(!state||!Array.isArray(state.history)||!Object.prototype.hasOwnProperty.call(state,'active')||(state.active&&(!state.active.id||state.active.status!=='上番中')))throw new Error('勤務情報を確認できませんでした。もう一度更新してください。');workReportState_=state;workStateReady_=true;if(state.serverNow)workClockOffset_=state.serverNow-(started+Date.now())/2;updateWorkClock_();byId('workReportStatus').textContent=state.active?'上番中です。勤務終了後に下番を報告してください。':'日勤・夜勤を選び、上番を報告してください。';}
async function refreshWorkReport_(){
 if(workReportBusy_||provisionalBusy_)return;
 const started=Date.now(),initial=!startupWorkConsumed_&&BOOTSTRAP.initialWorkState;startupWorkConsumed_=true;
 workReportBusy_=true;workStateReady_=false;
 try{if(initial){acceptWorkState_(initial,started);}else{byId('workReportStatus').textContent='最新の勤務情報を確認しています…';renderWorkReport_();acceptWorkState_(await callServer('workReportState',{idToken:idToken}),started);}}
 catch(error){workStateReady_=false;byId('workReportStatus').textContent='勤務情報を確認できませんでした。「勤務情報を更新」を押してください。';showError(errorText(error,'勤務情報を確認できませんでした。'));}
 finally{workReportBusy_=false;renderWorkReport_();}
}
async function submitWorkReport_(out){
 if(workReportBusy_||provisionalBusy_)return;clearError();clearMessage();try{
  requireAuthentication();if(!workStateReady_)throw new Error('勤務情報を更新してから報告してください。');const active=workReportState_.active,mode=out?byId('workOutcome').value:'normal',normal=mode==='normal',shift=byId('workShift').value,site=byId('workSite').value.trim(),minutes=out&&normal&&byId('workHasOvertime').checked?byId('workOvertime').value:'0',note=mode==='withdraw'?'':byId('workNote').value.trim(),allowance=!out||normal?readWorkAllowance_(out?'Out':'In'):{};
  if(out&&!active)throw new Error('先に勤務情報を更新してください。');if(!out&&!['日勤','夜勤'].includes(shift))throw new Error('日勤または夜勤を選択してください。');if(out&&normal&&minutes==='')throw new Error('残業時間を選択してください。');
  const rows=out?[['勤務日（上番日）',active.date],['報告内容',mode==='siteCancelled'?'上番後の現場中止（承認必要）':mode==='withdraw'?'上番取りやめ（承認不要）':'通常の下番'],['報告時刻',workNowText_()],['勤務区分',active.shift]]:[['勤務日（上番日）',workNowDate_()],['上番現在時刻',workNowText_()],['勤務区分',shift],['現場名',site||'未入力']];
  if(!out||normal){if(out)rows.push(['残業時間',minutes+'分']);rows.push(['資格者 現場配置手当',allowance.qualified?'2,000円':'なし'],['運転手当',allowance.driver?'1,000円':'なし'],['その他手当',allowance.other?'500円':'なし'],['手当の備考',allowance.note||'なし']);}else rows.push(['取扱い',mode==='withdraw'?'勤務報告の履歴に残しません。交通費などの申請履歴は残します。':'支給する日給・交通費と金額は会社が決定します。']);if(mode!=='withdraw')rows.push(['備考',note||'なし']);
  if(!await reviewSubmission_(out?(mode==='withdraw'?'上番取りやめの確認':mode==='siteCancelled'?'現場中止報告の確認':'下番報告の確認'):'上番報告の確認',rows))return;
  workReportBusy_=true;renderWorkReport_();byId('workReportStatus').textContent='報告内容を保存しています…';if(!out)workClockInRequest_=requestFor_('work-clock-in',JSON.stringify([BOOTSTRAP.today,shift,site,allowance]));
  const result=await callServer(out?'workClockOut':'workClockIn',out?{idToken,workId:active.id,outcome:mode,minutes:Number(minutes),note,allowance}:{idToken,requestId:workClockInRequest_,shift,site,allowance});showMessage(result.message);clearRequest_('work-clock-in');
  if(result.withdrawn){workReportState_.history=workReportState_.history.filter(w=>w.id!==result.id);workReportState_.active=null;workClockInRequest_=null;byId('workReportStatus').textContent='上番を取りやめました。';}
  else{workReportState_.history=workReportState_.history.filter(w=>w.id!==result.work.id);workReportState_.history.unshift(result.work);workReportState_.active=result.work.status==='上番中'?result.work:null;byId('workReportStatus').textContent=out?(mode==='siteCancelled'?'現場中止を報告しました。支給内容は会社が確認します。':'下番を受け付けました。'):'上番を受け付けました。';if(!out){clearRequest_('work-clock-in');workClockInRequest_=null;}}
  if(out){byId('workOutcome').value='normal';byId('workOvertime').value='';byId('workHasOvertime').checked=false;byId('workOvertimeFields').hidden=true;byId('workNote').value='';fillWorkAllowance_('In');fillWorkAllowance_('Out');}
 }catch(error){showError(errorText(error,'勤務報告を保存できませんでした。'));}finally{workReportBusy_=false;renderWorkReport_();}
}

function initializeWorkReport_(){if(!byId('workForm'))return;initializeWorkAllowance_();byId('workOutcome').addEventListener('change',updateWorkOutcomeUI_);updateWorkClock_();setInterval(updateWorkClock_,1000);byId('workHasOvertime').addEventListener('change',function(){byId('workOvertimeFields').hidden=!this.checked;if(!this.checked)byId('workOvertime').value='';});for(let n=30;n<=720;n+=30){const option=document.createElement('option');option.value=String(n);option.textContent=Math.floor(n/60)+'時間'+(n%60? '30分':'');byId('workOvertime').appendChild(option);}byId('workClockInButton').addEventListener('click',()=>submitWorkReport_(false));byId('workClockOutButton').addEventListener('click',()=>submitWorkReport_(true));byId('workRefreshButton').addEventListener('click',refreshWorkReport_);if(PAGE==='work'&&currentUser&&currentUser.registered&&!needsStaffRegistration())refreshWorkReport_();}
initializeWorkReport_();



function renderProvisionalPanel_(prefix,work){
 const panel=byId(prefix+'ProvisionalPanel');if(!panel)return;const info=work&&work.provisional;
 panel.hidden=!(info&&(info.eligible||info.complete)&&!work.clockOut);
 byId(prefix+'ProvisionalInfo').textContent=!work?'':work.date+' '+work.shift+'\n'+work.site+(info&&info.complete?'\n仮下番済み '+info.reportedAt+'\n日給は反映済みです。':'\n仮下番を報告できます。');
 const button=byId(prefix+'ProvisionalButton');button.hidden=!!(info&&info.complete);button.disabled=provisionalBusy_||!info||!info.eligible||prefix==='daily'&&(dailyBalanceLoading_||pending.daily)||prefix==='work'&&(workReportBusy_||!workStateReady_);button.textContent=provisionalBusy_?'日給の反映を確認中…':'仮下番を報告する';
}
async function submitProvisionalOut_(prefix){
 if(provisionalBusy_||pending.daily||dailyBalanceLoading_||workReportBusy_)return;clearError();clearMessage();
 try{requireAuthentication();if(prefix==='work'&&!workStateReady_)throw new Error('勤務情報を更新してから報告してください。');const work=prefix==='daily'?dailySummary_&&dailySummary_.provisionalWork:workReportState_.active;if(!work||!work.provisional||!work.provisional.eligible)throw new Error('勤務情報を更新してから仮下番を報告してください。');
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

function canRequestQualification_(){return !!currentUser&&currentUser.guardRole==='資格保有警備員';}
function applyQualificationVisibility_(){const allowed=canRequestQualification_();for(const phase of ['In','Out']){const input=byId('workAllowance'+phase+'Qualified');if(!input)continue;input.closest('label').hidden=!allowed;if(!allowed){input.checked=false;input.disabled=true;}}}
function readWorkAllowance_(phase){const driver=byId('workAllowance'+phase+'Driver').checked,other=byId('workAllowance'+phase+'Other').checked,note=byId('workAllowance'+phase+'Note').value.trim(),qualified=canRequestQualification_()&&byId('workAllowance'+phase+'Qualified').checked;if(other&&!note)throw new Error('その他手当を選んだ場合は、手当の備考を入力してください。');return {driver,other,qualified,note};}
function fillWorkAllowance_(phase,a){a=a||{};byId('workAllowance'+phase+'Driver').checked=!!a.driver;byId('workAllowance'+phase+'Other').checked=!!a.other;byId('workAllowance'+phase+'Qualified').checked=!!a.qualification;byId('workAllowance'+phase+'Note').value=a.note||'';byId('workAllowance'+phase+'Note').required=!!a.other;byId('workAllowance'+phase+'Panel').hidden=!(a.driver||a.other||a.qualification||a.note);byId('workAllowance'+phase+'Toggle').setAttribute('aria-expanded',String(!byId('workAllowance'+phase+'Panel').hidden));}
function initializeWorkAllowance_(){for(const phase of ['In','Out']){if(!byId('workAllowance'+phase+'Qualified')){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.id='workAllowance'+phase+'Qualified';input.style.width='auto';label.append(input,document.createTextNode('資格者 現場配置手当（2,000円）'));byId('workAllowance'+phase+'Other').closest('label').before(label);}const qualified=byId('workAllowance'+phase+'Qualified'),qualifiedLabel=qualified.closest('label');qualifiedLabel.replaceChildren(qualified,document.createTextNode('資格者 現場配置手当（2,000円）'));byId('workAllowance'+phase+'Toggle').addEventListener('click',function(){const panel=byId('workAllowance'+phase+'Panel');panel.hidden=!panel.hidden;this.setAttribute('aria-expanded',String(!panel.hidden));});byId('workAllowance'+phase+'Other').addEventListener('change',function(){byId('workAllowance'+phase+'Note').required=this.checked;});}applyQualificationVisibility_();}



let workClockInRequest_=null;
function updateWorkOutcomeUI_(){
 const select=byId('workOutcome');if(!select)return;if(!workReportState_.active)select.value='normal';const mode=select.value,normal=mode==='normal';select.disabled=workReportBusy_||provisionalBusy_;byId('workNormalEnd').hidden=!normal;byId('workNormalAllowances').hidden=!normal;byId('workNoteLabel').hidden=mode==='withdraw';byId('workNote').hidden=mode==='withdraw';
 byId('workOutcomeHint').textContent=mode==='siteCancelled'?'日給・交通費の支給内容と金額は会社が決定します。社員側で金額の選択・申請は行いません。':mode==='withdraw'?'上番の記録を取り消し、勤務報告の履歴に残しません。交通費などの申請履歴は残ります。':'残業がなければ、そのまま下番を報告できます。';
 byId('workClockOutButton').textContent=mode==='siteCancelled'?'現場中止を報告する':mode==='withdraw'?'上番を取りやめる':'下番を報告する';byId('workClosingHint').textContent=normal?'日給・資格者配置手当は下番後に自動反映します。残業・運転手当・その他手当は会社承認後に加算します。':'';
}
function renderDailyCancellation_(){
 const anchor=byId('dailyAvailable');if(!anchor)return;let note=byId('dailyCancellationNotice');if(!note){note=document.createElement('p');note.id='dailyCancellationNotice';note.style.cssText='background:#fff8db;border:1px solid #e8d58b;border-radius:10px;padding:12px;line-height:1.7';anchor.closest('dl').after(note);}const dates=dailySummary_&&dailySummary_.cancellationPendingDates||[];note.hidden=!dates.length;note.textContent='現場中止：'+dates.join('、')+'。支給内容は会社が確認中です。この勤務分は、確認完了まで日払い可能額に含まれません。';
}

document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){if(dailyPayrollTimer_){clearTimeout(dailyPayrollTimer_);dailyPayrollTimer_=null;}return;}if(PAGE==='daily'&&idToken&&currentUser&&currentUser.registered&&!needsStaffRegistration())refreshDailyAmounts_();});

// Do not abandon a submission while its durable receipt is outstanding.
function applicationSaving_(){return registeringName||workReportBusy_||provisionalBusy_||['transport','daily','report','expense','shift'].some(k=>pending[k]);}
window.addEventListener('beforeunload',event=>{if(applicationSaving_()){event.preventDefault();event.returnValue='';}});
document.addEventListener('click',event=>{const link=event.target.closest?.('a[href]');if(link&&applicationSaving_()){event.preventDefault();event.stopImmediatePropagation();showError('送信中です。受付結果が表示されるまで、この画面でお待ちください。');}},true);

function renderDailyAccountingClosures_(){
 const full=byId('dailyFullButton');if(!full)return;let panel=byId('dailyClosureNotice');if(!panel){panel=document.createElement('section');panel.id='dailyClosureNotice';panel.setAttribute('aria-label','経理休業日のお知らせ');panel.style.cssText='background:#fff4da;border:1px solid #dfbd6b;border-radius:10px;padding:14px;margin:16px 0;line-height:1.7;color:#111';full.before(panel);}const info=dailySummary_&&dailySummary_.accountingClosures,lines=info?(info.available?(info.periods||[]).map(r=>r.text):[info.message]):[];panel.hidden=!lines.length;const signature=JSON.stringify(lines);if(panel.dataset.signature===signature)return;panel.dataset.signature=signature;panel.replaceChildren();if(!lines.length)return;const title=document.createElement('strong');title.textContent='経理休業日のお知らせ';panel.append(title);lines.forEach(text=>{const p=document.createElement('p');p.textContent=text;p.style.margin='6px 0';panel.append(p);});const note=document.createElement('p');note.textContent='日払い申請は受け付けます。お振込みは休業明けの営業日より順次対応いたします。';note.style.margin='8px 0 0';panel.append(note);
}

function renderTrainingAndProcessing_(){
 renderDailyAccountingClosures_();
 const form=byId('dailyForm');if(!form)return;let training=byId('dailyTrainingProgress');if(!training){training=document.createElement('section');training.id='dailyTrainingProgress';training.style.cssText='color:#1565c0;white-space:pre-line;border:1px solid #bbd7f4;padding:16px;margin:18px 0;border-radius:8px';byId('dailyAvailable').parentElement.parentElement.after(training);}const t=dailySummary_&&dailySummary_.training;training.hidden=!t;training.textContent=t?'研修手当\n総額：'+dailyMoney_(t.total)+'\n給与に加算済み：'+dailyMoney_(t.allocated)+'（'+t.count+'／'+t.installments+'回）\n残り：'+dailyMoney_(t.remaining):'';
 let notice=byId('dailyProcessingNotice');if(!notice){notice=document.createElement('p');notice.id='dailyProcessingNotice';notice.setAttribute('role','status');notice.style.cssText='white-space:pre-line;background:#fff6dc;padding:16px;margin-top:20px;border-radius:8px';form.append(notice);}const info=dailySummary_&&dailySummary_.processing;notice.hidden=!info;notice.textContent=info?'現在申請した場合\n'+info.message+'\n日勤は原則翌営業日。夜勤は下番日の朝6:55までの申請が当日手続きの対象です。土日祝・経理休業日は次の営業日となります。':'';
}

// Reuse the authenticated application when moving to work; always read fresh work state.
function openWorkWithoutReload_(event){
 if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||applicationSaving_()||needsStaffRegistration()||!currentUser?.registered)return;
 const link=event.target.closest?.('a[href]');if(!link)return;
 let url;try{url=new URL(link.href);}catch(e){return;}
 if(url.origin!=='https://liff.line.me'||url.pathname!=='/2011785712-iKJrxFMX'||!['work','daily'].includes(url.searchParams.get('page')))return;
 const targetPage=url.searchParams.get('page');event.preventDefault();clearError();clearMessage();
 if(PAGE!==targetPage){const here=new URL(location.href);here.searchParams.set('page',targetPage);history.pushState({applicationNavigation:true},'',here);}
 PAGE=targetPage;try{sessionStorage.setItem('shishidogumi-startup-page',targetPage);}catch(e){}
 startupWorkConsumed_=true;startupDailyConsumed_=true;workStateReady_=false;showRegisteredApplication();if(targetPage==='work')refreshWorkReport_();
}
document.addEventListener('click',openWorkWithoutReload_);
window.addEventListener('popstate',()=>{const page=new URL(location.href).searchParams.get('page');if(!forms[page]||applicationSaving_())return;PAGE=page;startupDailyConsumed_=true;clearError();clearMessage();showRegisteredApplication();if(page==='work'){startupWorkConsumed_=true;workStateReady_=false;refreshWorkReport_();}});

function clearRecoveredRequest_(method){
 const kind={workClockIn:'work-clock-in',workClockOut:'work-clock-in',saveTransportation:'transport',employeeDailyApply:'daily-balance',saveExpense:'expense',saveDailyReport:'daily-report',saveShiftRequests:'shiftbatch'}[method];
 if(kind)clearRequest_(kind);
 if(method==='workClockIn'||method==='workClockOut')workClockInRequest_=null;
 if(method==='saveTransportation')transportRequestId=null;
 if(method==='saveExpense')expenseRequestId=null;
 if(method==='saveDailyReport')reportRequestId=null;
}
window.addEventListener('shishidogumi-recovered',async event=>{
 const {method,result}=event.detail;clearRecoveredRequest_(method);clearError();if(result.message)showMessage(result.message);
 if(method==='saveDailyReport'&&result.namesConfirmed===true){reportNamesReceipt_=null;reportNamesView_=null;reportNameStorage_(null);clearTimeout(reportNamesTimer_);byId('reportNamesCard').hidden=true;await window.SHISHIDOGUMI_RECOVERY?.finishReport(result.receipt).catch(()=>{});showMessage(result.message||'日報の提出を確認しました。');return;}
 if(method==='saveDailyReport'&&result.receipt){if(PAGE!=='report'){showError('警備日報の画面を開いてから、もう一度「日報の会社名・現場名を確認する」を押してください。');return;}beginReportNames_(result.receipt);}
 if(PAGE==='work')await refreshWorkReport_();if(PAGE==='daily')await refreshDailyAmounts_();if(PAGE==='shift')await refreshShiftState_(false);
 if(method==='registerStaffName')location.reload();
});



