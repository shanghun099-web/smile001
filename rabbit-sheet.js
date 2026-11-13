/* 🐰 딜리래빗 강남가 확정 물량 자동 조회 — 구글 시트 '강남가' 탭(A 동·B 코드·E 물량·R2 날짜)을 읽어 담당 구역 × 비율로 합산 */
const rabbitDistricts = '개포1동 개포2동 개포3동 개포4동 논현1동 논현2동 대치1동 대치2동 대치4동 도곡1동 도곡2동 삼성1동 삼성2동 세곡동 수서동 신사동 압구정동 역삼1동 역삼2동 일원1동 일원본동 청담동'.split(' ').map((dong,i)=>({dong,code:'강남가'+(101+i)}));
let rabbitRequest = 0, rabbitView = '', rabbitNotice = '', rabbitBusy = false, rabbitFailed = false;
let rabbitSnapshot = null;
function rabbitRestoreCache(){ try { rabbitSnapshot = JSON.parse(lsGet('rabbit-sheet-last','null')); } catch {} }
function rabbitAuto(){ return estStore.rabbit.sheetMode !== false; }
function rabbitSelection(){
  return rabbitDistricts.map(area=>{
    const row=estStore.rabbit.rows.find(r=>r.code===area.code)||estStore.rabbit.rows.find(r=>r.dong===area.dong);
    return {...area,row};
  });
}
function rabbitDate(){ return estStore.rabbit.date; }
/* 계산 — 수동 입력과 같은 방식: 동별은 반올림해서 보여 주고, 합계는 비율 곱한 값을 모두 더한 뒤 반올림, 실측 보정은 그 위에 */
function rabbitResult(){
  const selected=rabbitSelection().filter(a=>a.row?.on);
  const snapshot=rabbitSnapshot?.date===rabbitDate()?rabbitSnapshot:null;
  let message='';
  if(!selected.length) message='담당 구역 선택';
  else if(!snapshot) message=rabbitBusy?'조회 중…':(rabbitNotice||'물량 확인 필요');
  const parts=selected.map(({dong,code,row})=>{
    const qty=snapshot?.counts?.[code];
    const pct=estPct(row);
    return {dong,pct,qty,exact:Number.isInteger(qty)?qty*pct/100:null};
  });
  if(!message && parts.some(p=>p.exact===null)) message='아직 물량 미확정';
  parts.forEach(p=>{ p.mine=p.exact===null?null:Math.round(p.exact); });
  let raw=null, value=null, adj=null;
  if(!message){
    raw=Math.round(parts.reduce((s,p)=>s+p.exact,0));
    adj=estUseRbAdj()?estAdj('rabbit'):null;
    value=adj?Math.round(raw*adj):raw;
  }
  return {message,parts,raw,value,adj,snapshot};
}
function rabbitTrackView(){
  const relevant=tab==='est'&&rabbitAuto()&&['rabbit','both'].includes(estStore.set);
  const view=relevant?estStore.set+rabbitDate():'';
  if(view===rabbitView)return;
  rabbitView=view;
  rabbitRequest++;
  if(view) rabbitLoad();
}
async function rabbitLoad(){
  const seq=++rabbitRequest, date=rabbitDate();
  rabbitBusy=true; rabbitFailed=false; rabbitNotice='';
  rabbitUpdate();
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),10000);
  try{
    const url=new URL('https://docs.google.com/spreadsheets/d/1I9yORjwp3K0g2QGapABW56SXfRwb7cCdtYN7o5PbujE/gviz/tq');
    url.search=new URLSearchParams({sheet:'강남가',range:'A1:R100',headers:'0',tq:'select A,B,E,R'});
    const res=await fetch(url,{signal:controller.signal,cache:'no-store',credentials:'omit'});
    if(!res.ok)throw Error();
    const raw=await res.text(), data=JSON.parse(raw.slice(raw.indexOf('{'),raw.lastIndexOf('}')+1));
    if(data.status!=='ok'||data.table.cols.map(c=>c.id).join()!=='A,B,E,R')throw Error();
    const rows=data.table.rows.map(r=>r.c);
    const match=/^Date\((\d{4}),(\d+),(\d+)\)$/.exec(rows[1]?.[3]?.v);
    if(!match)throw Error();
    const sourceDate=match[1]+'-'+String(+match[2]+1).padStart(2,'0')+'-'+match[3].padStart(2,'0');
    const counts={};
    for(const cells of rows){
      const code=cells[1]?.v;
      if(!rabbitDistricts.some(a=>a.code===code&&a.dong===cells[0]?.v))continue;
      const qty=cells[2]?.v;
      if(Object.hasOwn(counts,code)||(qty!=null&&(!Number.isSafeInteger(qty)||qty<0)))throw Error();
      counts[code]=qty??null;
    }
    if(!Object.keys(counts).length)throw Error();
    /* 강남가 전체 물량 — 시트 맨 아래 TOTAL 줄(E칸), 없으면 22개 동을 더함(다 확정됐을 때만) */
    const totalRow=rows.find(cells=>String(cells[0]?.v??'').trim().toUpperCase()==='TOTAL');
    const vals=Object.values(counts);
    const total=Number.isSafeInteger(totalRow?.[2]?.v)?totalRow[2].v
      :vals.every(Number.isInteger)?vals.reduce((s,v)=>s+v,0):null;
    if(seq!==rabbitRequest)return;
    if(date===sourceDate){
      rabbitSnapshot={date,counts,total,time:new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false})};
      lsSet('rabbit-sheet-last',JSON.stringify(rabbitSnapshot));
      rabbitNotice='조회 완료';
    }else{ rabbitNotice='날짜 다름 · 시트는 '+sourceDate.slice(5).replace('-','/')+' 물량'; rabbitFailed=true; }
  }catch{ if(seq===rabbitRequest){ rabbitNotice='조회 실패 · 인터넷 연결 확인'; rabbitFailed=true; } }
  finally{clearTimeout(timer);if(seq===rabbitRequest){ rabbitBusy=false; rabbitUpdate(); }}
}
/* 앱을 다시 열었을 때(다른 앱 갔다 옴) 오늘 물량이 아직 없으면 자동으로 다시 읽기 */
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible'||!rabbitView||rabbitBusy)return;
  const r=rabbitResult();
  if(r.value===null&&r.parts.length) rabbitLoad();
});
function rabbitMode(auto){estStore.rabbit.sheetMode=auto;saveEst();render();}
function rabbitChange(code,field,value){
  const area=rabbitSelection().find(a=>a.code===code);
  if(!area||estStore.lockRatio)return;
  let row=area.row;
  if(!row){row={dong:area.dong,code,qty:'',on:false,pct:100};estStore.rabbit.rows.push(row);}
  row[field]=value;saveEst();rabbitUpdate();
}
function rabbitStatus(){
  const r=rabbitResult();
  if(rabbitBusy) return '시트에서 읽는 중…';
  const time=r.snapshot?'마지막 확인 '+r.snapshot.time:'';
  /* 큰 숫자 자리에 이미 나온 문구는 아래 줄에 되풀이하지 않음 */
  const notice=rabbitNotice&&rabbitNotice!==r.message?rabbitNotice:'';
  return [notice,time].filter(Boolean).join(' · ');
}
/* 오늘 날짜의 강남가 전체 물량 (없으면 null) */
function rabbitAllTotal(){
  const s=rabbitSnapshot;
  return s&&s.date===rabbitDate()&&Number.isInteger(s.total)?s.total:null;
}
function rabbitAmount(){
  const r=rabbitResult();
  return r.value===null?r.message:r.value.toLocaleString()+'건';
}
function rabbitPanel(){
  const sel=rabbitSelection(), locked=estStore.lockRatio;
  const areas=sel.map(({dong,code,row})=>`<div class="rb-area${row?.on?' on':''}">
    <label class="rb-area-chk"><input type="checkbox" ${row?.on?'checked':''} ${locked?'disabled':''} onchange="this.closest('.rb-area').classList.toggle('on',this.checked);rabbitChange('${code}','on',this.checked)"><span>${dong}</span></label>
    <label class="rb-area-pct"><input type="number" inputmode="numeric" aria-label="${dong} 담당 비율" min="0" max="100" value="${row?estPct(row):100}" ${locked?'disabled':''} onchange="if(this.value!==''&&this.validity.valid)rabbitChange('${code}','pct',Number(this.value));else this.reportValidity()"><span>%</span></label></div>`).join('');
  const nOn=sel.filter(a=>a.row?.on).length;
  return `${estTabsHtml()}${estMiniTotalHtml()}<div class="field"><label>📅 기준 날짜</label><input type="date" value="${rabbitDate()}" onchange="estSetDate(this.value)"></div>
    <div class="est-result-box rb-box">
      <div class="rb-head"><div class="est-box-title">🐰 강남가 · 14:30 확정 물량 기준</div><div class="rb-all" data-rabbit-all hidden></div></div>
      <div class="rb-total" data-rabbit-amount role="status" aria-live="polite"></div>
      <div data-rabbit-parts></div>
      <p class="rb-status" data-rabbit-status></p>
      <button class="est-btn blue rb-retry" onclick="rabbitLoad()" data-rabbit-retry>🔄 다시 조회</button>
    </div>
    <details class="est-box rb-areas" ${nOn?'':'open'}><summary>📍 담당 구역 설정 <span class="rb-count" data-rabbit-count>${nOn}개 선택</span></summary>${areas}${estLockBar()}</details>
    ${rbLookupHtml()}<button class="est-btn ghost rb-mode" onclick="rabbitMode(false)">✍️ 기존 수동 입력으로 바꾸기</button>`;
}
function rabbitPartsHtml(r){
  if(!r.parts.length) return '<div class="rb-part rb-empty">아래 📍 담당 구역 설정에서 맡은 동을 골라 주세요</div>';
  const rows=r.parts.map(p=>`<div class="rb-part"><span>⭐ ${p.dong} ${p.qty??'—'}건 × ${p.pct}%</span><b>${p.mine===null?'—':p.mine.toLocaleString()+'건'}</b></div>`).join('');
  const sub=r.value===null||!r.adj?'':`<div class="rb-sub">단순 합계 ${r.raw.toLocaleString()}건 · 실측 보정 ×${r.adj.toFixed(2)} 적용</div>`;
  return rows+sub;
}
function rabbitUpdate(){
  if(tab!=='est'||!rabbitAuto())return;
  const r=rabbitResult(), c=estCalcFor('cj');
  const aligned=estStore.cj.date===rabbitDate();
  const each=(selector,fn)=>document.querySelectorAll(selector).forEach(fn);
  const ok=r.value!==null;
  each('[data-rabbit-amount]',el=>{ el.textContent=rabbitAmount(); el.classList.toggle('wait',!ok); });
  each('[data-rabbit-status]',el=>{ el.textContent=rabbitStatus(); el.classList.toggle('err',rabbitFailed&&!rabbitBusy); });
  each('[data-rabbit-parts]',el=>{ el.innerHTML=rabbitPartsHtml(r); });
  const all=rabbitAllTotal();
  each('[data-rabbit-all]',el=>{ el.hidden=all===null; el.innerHTML=all===null?'':`<span>강남가 전체</span><b>${all.toLocaleString()}건</b>`; });
  each('[data-rabbit-count]',el=>{ el.textContent=r.parts.length+'개 선택'; });
  each('[data-rabbit-retry]',el=>{ el.disabled=rabbitBusy; el.textContent=rabbitBusy?'⏳ 조회 중…':'🔄 다시 조회'; });
  each('[data-rabbit-total]',el=>{
    const txt=!aligned?'날짜 확인':!ok?'합계 대기':(c.est+r.value).toLocaleString()+'건';
    el.textContent=txt; el.classList.toggle('wait',!aligned||!ok);
  });
}
