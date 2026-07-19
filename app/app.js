const state = {
  units: [], byId: new Map(), owned: new Map(), history: [],
  excludedIds: new Set(), excludedLevels: new Set(), candidateFilter: 'ready',
};
const levelOrder = [1,2,3,4,5,6,7,8,9,10,18,11,12,14,15,19,20,22];
const levelNames = {1:'흔함',2:'안흔함',3:'특별함',4:'희귀함',5:'전설적인',6:'히든조합',7:'왜곡됨',8:'랜덤전용',9:'제한됨',10:'초월함',11:'불멸의',12:'영원한',14:'특수 재료',15:'특수함',18:'신비함',19:'기록지침',20:'연구소',22:'아이템'};
const excludedFromInput = new Set([16,184,280,286,287,301]);
const baseNames = new Map([[1,'루피'],[2,'조로'],[3,'나미'],[4,'우솝'],[5,'상디'],[6,'쵸파'],[7,'칼병'],[8,'총병'],[9,'버기']]);
const $ = (s) => document.querySelector(s);

async function init() {
  const response = await fetch('../data/units.seed.json');
  state.units = (await response.json()).map((u) => baseNames.has(u.id) ? {...u, name:baseNames.get(u.id), level_text:'흔함'} : u)
    .filter((u) => !excludedFromInput.has(u.id) && (u.level !== 14 || ORDRCore.SPECIAL_IDS.has(u.id)));
  state.byId = new Map(state.units.map((u) => [u.id, u]));
  bindEvents(); renderBoard(); renderExclusions(); renderAll();
}

function snapshot() { state.history.push(new Map(state.owned)); if (state.history.length > 50) state.history.shift(); }
function changeCount(id, delta) {
  snapshot(); const next = Math.max(0, (state.owned.get(id) || 0) + delta);
  next ? state.owned.set(id, next) : state.owned.delete(id); renderAll();
}

function renderBoard() {
  const board = $('#unit-board'); board.innerHTML = '';
  for (const level of levelOrder) {
    const units = state.units.filter((u) => u.level === level);
    if (!units.length) continue;
    const section = document.createElement('section'); section.className = `level level-${level}`; section.dataset.level = level;
    section.innerHTML = `<header><span>${levelNames[level] || units[0].level_text}</span><b data-level-count="${level}">0</b><label title="이 등급을 계산에서 제외"><input type="checkbox" data-exclude-level="${level}"> 제외</label></header><div class="unit-grid"></div>`;
    const grid = section.querySelector('.unit-grid');
    for (const unit of units.sort((a,b) => a.name.localeCompare(b.name,'ko'))) {
      const button = document.createElement('button'); button.className = 'unit'; button.dataset.id = unit.id;
      if (ORDRCore.SPECIAL_IDS.has(unit.id)) button.classList.add('special');
      button.innerHTML = `<span class="unit-name">${escapeHtml(unit.name)}</span>${unit.hotkey ? `<kbd>${unit.hotkey}</kbd>` : ''}<strong data-count="${unit.id}">0</strong><i>−</i>`;
      button.addEventListener('click', () => changeCount(unit.id, 1));
      button.addEventListener('contextmenu', (e) => { e.preventDefault(); changeCount(unit.id, -1); });
      button.querySelector('i').addEventListener('click', (e) => { e.stopPropagation(); changeCount(unit.id, -1); });
      grid.append(button);
    }
    board.append(section);
  }
}

function renderAll() {
  document.querySelectorAll('[data-count]').forEach((el) => { const n=state.owned.get(+el.dataset.count)||0; el.textContent=n; el.closest('.unit').classList.toggle('owned',n>0); });
  document.querySelectorAll('[data-level-count]').forEach((el) => { const level=+el.dataset.levelCount; el.textContent=[...state.owned].filter(([id])=>state.byId.get(id)?.level===level).reduce((s,[,n])=>s+n,0); });
  const total=[...state.owned.values()].reduce((a,b)=>a+b,0); $('#owned-total').textContent=total; $('#undo').disabled=!state.history.length;
  updateEffectTotals(); renderCandidates(); updateExcludeCount();
}

function updateEffectTotals() {
  const armor=[...state.owned].filter(([id,n])=>n&&state.byId.get(id)?.skills.includes('shield')).length;
  const slow=[...state.owned].filter(([id,n])=>n&&state.byId.get(id)?.skills.includes('slow')).length;
  $('#armor-total').textContent=armor ? `수치 미입력 · ${armor}유닛` : '—';
  $('#slow-total').textContent=slow ? `수치 미입력 · ${slow}유닛` : '—';
}

function renderCandidates() {
  let items=ORDRCore.buildCandidates(state.units,state.owned,state.excludedIds,state.excludedLevels);
  if(state.candidateFilter==='ready') items=items.filter((x)=>x.ready);
  if(state.candidateFilter==='near') items=items.filter((x)=>!x.ready&&x.missingTotal<=2);
  items=items.slice(0,80); $('#candidate-count').textContent=items.length;
  const list=$('#candidate-list'); list.innerHTML='';
  if(!items.length){list.innerHTML='<div class="empty"><b>표시할 조합이 없습니다</b><span>유닛을 입력하거나 다른 탭을 확인하세요.</span></div>';return;}
  for(const c of items){
    const card=document.createElement('article'); card.className=`candidate ${c.ready?'ready':''} ${c.hasSpecial?'needs-special':''}`;
    const materials=c.materials.map((m)=>`<span class="material ${m.missing?'missing':''} ${m.special?'special':''}">${escapeHtml(m.material?.name||`#${m.id}`)} <b>${m.have}/${m.quantity}</b></span>`).join('');
    card.innerHTML=`<div class="candidate-top"><div><small>${escapeHtml(levelNames[c.unit.level]||c.unit.level_text)}</small><h3>${escapeHtml(c.unit.name)}</h3></div><div class="progress"><strong>${c.progress}%</strong><span>${c.ready?'제작 가능':`부족 ${c.missingTotal}`}</span></div></div>${c.hasSpecial?'<div class="special-alert">◆ 특수 재료 필요</div>':''}<div class="materials">${materials}</div><button class="craft" ${c.ready?'':'disabled'}>조합 실행</button>`;
    card.querySelector('.craft').addEventListener('click',()=>{snapshot(); if(!ORDRCore.craft(c,state.owned))state.history.pop(); renderAll();}); list.append(card);
  }
}

function renderExclusions(){
  const levels=$('#level-exclusions'), materials=$('#material-exclusions');
  levels.innerHTML=levelOrder.filter((l)=>l!==14).map((l)=>`<label><input type="checkbox" value="${l}" data-level-option> ${levelNames[l]||l}</label>`).join('');
  materials.innerHTML=state.units.filter((u)=>ORDRCore.SPECIAL_IDS.has(u.id)).map((u)=>`<label><input type="checkbox" value="${u.id}" data-material-option> ${escapeHtml(u.name)}</label>`).join('');
}

function syncExclusions(){
  state.excludedLevels=new Set([...document.querySelectorAll('[data-level-option]:checked')].map((x)=>+x.value));
  state.excludedIds=new Set([...document.querySelectorAll('[data-material-option]:checked')].map((x)=>+x.value));
  document.querySelectorAll('[data-exclude-level]').forEach((x)=>x.checked=state.excludedLevels.has(+x.dataset.excludeLevel)); renderAll();
}

function updateExcludeCount(){const n=state.excludedIds.size+state.excludedLevels.size;$('#exclude-count').textContent=n;document.body.classList.toggle('has-exclusions',n>0);}
function bindEvents(){
  $('#reset').onclick=()=>{if(!state.owned.size)return;snapshot();state.owned.clear();renderAll();};
  $('#undo').onclick=()=>{if(!state.history.length)return;state.owned=state.history.pop();renderAll();};
  $('#open-exclusions').onclick=()=>$('#exclusion-dialog').showModal();
  $('#exclusion-dialog').addEventListener('close',syncExclusions);
  $('#clear-exclusions').onclick=()=>{document.querySelectorAll('#exclusion-dialog input').forEach((x)=>x.checked=false);};
  document.addEventListener('change',(e)=>{if(e.target.matches('[data-exclude-level]')){const box=document.querySelector(`[data-level-option][value="${e.target.dataset.excludeLevel}"]`);if(box)box.checked=e.target.checked;syncExclusions();}});
  document.querySelectorAll('.tabs button').forEach((b)=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.candidateFilter=b.dataset.filter;renderCandidates();});
  $('#search').addEventListener('keydown',(e)=>{if(e.key==='Enter'){const q=e.target.value.trim().toLocaleLowerCase();const target=[...document.querySelectorAll('.unit')].find((b)=>b.querySelector('.unit-name').textContent.toLocaleLowerCase().includes(q));document.querySelectorAll('.search-hit').forEach(x=>x.classList.remove('search-hit'));if(target){target.classList.add('search-hit');target.scrollIntoView({behavior:'smooth',block:'center'});}}});
  document.addEventListener('keydown',(e)=>{if(e.target.matches('input')||e.ctrlKey||e.altKey||e.metaKey)return;const u=state.units.find((x)=>x.hotkey===e.key.toUpperCase());if(u)changeCount(u.id,e.shiftKey?-1:1);if(e.key.toLowerCase()==='z')$('#undo').click();});
}
function escapeHtml(value){const d=document.createElement('div');d.textContent=value||'';return d.innerHTML;}
init().catch((error)=>{$('#notice').textContent=`데이터를 불러오지 못했습니다: ${error.message}`;$('#notice').classList.add('error');});
