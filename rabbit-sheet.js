const rabbitDistricts = '개포1동 개포2동 개포3동 개포4동 논현1동 논현2동 대치1동 대치2동 대치4동 도곡1동 도곡2동 삼성1동 삼성2동 세곡동 수서동 신사동 압구정동 역삼1동 역삼2동 일원1동 일원본동 청담동'.split(' ').map((dong,i)=>({dong,code:'강남가'+(101+i)}));
let rabbitRequest = 0, rabbitView = '', rabbitNotice = '';
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
function rabbitResult(){
  const selected=rabbitSelection().filter(a=>a.row?.on);
  const snapshot=rabbitSnapshot?.date===rabbitDate()?rabbitSnapshot:null;
  let message='';
  if(!selected.length) message='담당 구역 선택';
  else if(!snapshot) message=rabbitNotice||'물량 확인 필요';
  const parts=selected.map(({dong,code,row})=>{
    const qty=snapshot?.counts?.[code];
    const pct=estPct(row);
    return {dong,pct,qty,mine:Number.isInteger(qty)?qty*pct/100:null};
  });
  if(!message && parts.some(p=>p.mine===null)) message='아직 물량 미확정';
  const value=message?null:Math.round(parts.reduce((s,p)=>s+p.mine,0)*100)/100;
  return {message,parts,value,snapshot};
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
  rabbitNotice='조회 중';
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
    if(seq!==rabbitRequest)return;
    if(date===sourceDate){
      rabbitSnapshot={date,counts,time:new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false})};
      lsSet('rabbit-sheet-last',JSON.stringify(rabbitSnapshot));
      rabbitNotice='조회 완료';
    }else rabbitNotice='날짜 확인 필요 · 시트 '+sourceDate;
  }catch{ if(seq===rabbitRequest)rabbitNotice='물량 확인 필요'; }
  finally{clearTimeout(timer);if(seq===rabbitRequest)rabbitUpdate();}
}
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
  return [rabbitNotice,r.snapshot?'마지막 확인 '+r.snapshot.time:''].filter(Boolean).join(' · ');
}
function rabbitAmount(){
  const r=rabbitResult();
  return r.value===null?r.message:r.value.toLocaleString()+'건';
}
function rabbitPanel(){
  const areas=rabbitSelection().map(({dong,code,row})=>`<div class="est-res-row">
    <label><input type="checkbox" ${row?.on?'checked':''} ${estStore.lockRatio?'disabled':''} onchange="rabbitChange('${code}','on',this.checked)"> ${dong}</label>
    <label><input type="number" aria-label="${dong} 배정 비율" min="0" max="100" value="${row?estPct(row):100}" ${estStore.lockRatio?'disabled':''} onchange="if(this.value!==''&&this.validity.valid)rabbitChange('${code}','pct',Number(this.value));else this.reportValidity()" style="width:64px;padding:6px"> %</label></div>`).join('');
  return `${estTabsHtml()}${estMiniTotalHtml()}<div class="field"><label>📅 기준 날짜</label><input type="date" value="${rabbitDate()}" onchange="estSetDate(this.value)"></div>
    <div class="est-result-box"><div class="est-box-title">강남가 · 14:30 확정 물량 기준</div><b class="est-res-total" data-rabbit-amount></b>
    <div data-rabbit-parts></div><p class="est-status" data-rabbit-status></p><button class="est-btn blue" onclick="rabbitLoad()">다시 조회</button></div>
    <details class="est-box" ${rabbitResult().parts.length?'':'open'}><summary>담당 구역 설정 · 22개 동</summary>${areas}${estLockBar()}</details>
    ${rbLookupHtml()}<button class="est-btn ghost" onclick="rabbitMode(false)">기존 수동 입력 사용</button>`;
}
function rabbitUpdate(){
  if(tab!=='est'||!rabbitAuto())return;
  const r=rabbitResult(), c=estCalcFor('cj');
  const aligned=estStore.cj.date===rabbitDate();
  const change=(selector,value)=>document.querySelectorAll(selector).forEach(el=>{el.textContent=value;});
  change('[data-rabbit-amount]',rabbitAmount());
  change('[data-rabbit-status]',rabbitStatus());
  change('[data-rabbit-parts]',r.parts.map(p=>p.dong+' '+(p.qty??'—')+'건 × '+p.pct+'%').join(' · '));
  change('[data-rabbit-total]',!aligned?'기준 날짜 확인':r.value===null?'합계 대기':(c.est+r.value).toLocaleString()+'건');
}
