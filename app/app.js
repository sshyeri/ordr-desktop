const state = {
  units: [], allUnits: [], byId: new Map(), owned: new Map(), history: [], future: [],
  excludedIds: new Set(), excludedLevels: new Set(), details: new Map(), collapsedCandidateGroups: new Set(), collapsedUnitGroups: new Set(), activeSkill: '', upgradePathHistory: [],
};
const skillNames={damageb:'공격력 버프',speedb:'공격속도 버프',sky:'공중 공격',sstun:'단일 스턴',slow:'이동속도 감소',shield:'방어력 감소',stun:'범위 스턴',boss:'보스 피해',berserk:'광폭화',splash:'스플래시',last:'끝딜',rangetlpd:'범위 체력 비례 피해',blink:'순간이동',armorbreak:'아머브레이크',single:'단일 피해',regen:'회복',ignore:'방어 무시',docking:'마법 피해 증폭',life:'생명력',bombup:'폭발 피해',mshield:'마법 방어력 감소',udelete:'유닛 삭제',rangellpd:'범위 최대 체력 피해',rangenlpd:'범위 현재 체력 피해',singlelost:'단일 잃은 체력 피해',prefmagic:'마딜',prefphysical:'물딜',prefstory:'스토리'};
const preferenceFilterCodes=['prefmagic','prefphysical','prefstory'];
const boardColumns = [
  ['흔함','안흔함'], ['특별함'], ['희귀함'], ['전설적인'],
  ['히든조합','왜곡됨','랜덤전용'], ['변화된','세라핌','제한됨'],
  ['초월함','신비함'], ['불멸의','영원한','기타'],
];
const levelOrder = [1,2,3,4,5,6,7,8,9,10,18,11,12,14,15,19,20,22];
const levelNames = {1:'흔함',2:'안흔함',3:'특별함',4:'희귀함',5:'전설적인',6:'히든조합',7:'왜곡됨',8:'랜덤전용',9:'제한됨',10:'초월함',11:'불멸의',12:'영원한',14:'특수 재료',15:'특수함',18:'신비함',19:'기록지침',20:'연구소',22:'아이템'};
const excludedFromInput = new Set([16,184,280,286,287,301]);
const terminalUpgradeGroups = new Set(['왜곡됨','신비함']);
const baseNames = new Map([[1,'루피'],[2,'조로'],[3,'나미'],[4,'우솝'],[5,'상디'],[6,'쵸파'],[7,'칼병'],[8,'총병'],[9,'버기']]);
const $ = (s) => document.querySelector(s);

async function init() {
  const [seedResponse, displayResponse, detailResponse] = await Promise.all([fetch('../data/units.seed.json'), fetch('../data/unit-display.json'), fetch('../data/unit-details.json')]);
  const seed = await seedResponse.json();
  const display = await displayResponse.json();
  const details = await detailResponse.json(); state.details=new Map(details.map((item)=>[item.id,item]));
  const seedById = new Map(seed.map((u) => [u.id, u]));
  state.allUnits = display.map((meta) => {
    const source = seedById.get(meta.id) || {};
    const group = meta.group.replace(/\s*\(\d+\)$/, '');
    const name = (baseNames.get(meta.id) || meta.name).replace(/\s*\([QWERASDFG]\)$/, '');
    return {...source, ...meta, name, group, image:`assets/units/${meta.id}.png`};
  });
  state.allUnits.unshift({id:ORDRCore.WISP_ID,name:'흔함선택위습',group:'흔함',level:1,level_text:'흔함',mate_ids:[],skills:[],hotkey:'V',image:'assets/units/wisp.png'});
  state.units = state.allUnits.filter((u) => !excludedFromInput.has(u.id) && (u.group !== '기타' || ORDRCore.SPECIAL_IDS.has(u.id)) && boardColumns.flat().includes(u.group));
  state.byId = new Map(state.allUnits.map((u) => [u.id, u]));
  renderSkillFilter(); renderExtraUnits(); bindEvents(); bindUpdater(); renderBoard(); renderExclusions(); renderAll(); updateZoomLabel(await window.ordrDesktop.zoom.get()); requestAnimationFrame(updateStickyLayout);
}

function bindUpdater(){
  const button=$('#update-status'),label=$('#update-label');
  let status='checking';
  const setStatus=(payload)=>{
    status=payload.status; button.dataset.state=status; button.style.setProperty('--update-progress',`${payload.percent||0}%`);
    const labels={
      checking:'업데이트 확인 중',
      loading:'로딩 중…',
      available:`v${payload.version} 업데이트`,
      downloading:`다운로드 ${payload.percent||0}%`,
      downloaded:`v${payload.version} 설치하기`,
      'not-available':'최신 버전',
      error:'업데이트 재확인',
    };
    label.textContent=labels[status]||'업데이트 확인';
    button.disabled=status==='checking'||status==='loading'||status==='downloading';
    button.title=status==='available'?'클릭하여 업데이트 다운로드':status==='downloaded'?'클릭하여 재시작 후 설치':status==='not-available'?'클릭하여 업데이트 다시 확인':status==='error'?'확인에 실패했습니다. 클릭하여 다시 시도':'업데이트 상태';
  };
  window.ordrDesktop.updater.onStatus(setStatus);
  button.addEventListener('click',()=>{
    if(status==='available'){
      setStatus({status:'loading'});
      window.ordrDesktop.updater.download().catch(()=>setStatus({status:'error'}));
    }
    else if(status==='downloaded'){
      setStatus({status:'loading'});
      setTimeout(()=>window.ordrDesktop.updater.install(),80);
    }
    else if(status==='not-available'||status==='error'){setStatus({status:'checking'});window.ordrDesktop.updater.check().catch(()=>{});}
  });
  window.ordrDesktop.updater.check().catch(()=>{});
}

function snapshot() { state.history.push(new Map(state.owned)); state.future=[]; if (state.history.length > 50) state.history.shift(); }
function changeCount(id, delta) {
  snapshot(); const next = Math.max(0, (state.owned.get(id) || 0) + delta);
  next ? state.owned.set(id, next) : state.owned.delete(id); renderAll();
}

function renderBoard() {
  const board = $('#unit-board'); board.innerHTML = '';
  for (const groups of boardColumns) {
    const column = document.createElement('div'); column.className = 'board-column';
    for (const group of groups) {
      const units = state.units.filter((u) => u.group === group);
      if (!units.length) continue;
      const level = units[0].level;
      const section = document.createElement('section'); section.className = `level level-${level}`; section.dataset.level = level; section.dataset.group=group;
      if(state.collapsedUnitGroups.has(group))section.classList.add('collapsed');
      const excludeControl = group === '기타'
        ? `<label title="기타 재료 전체를 계산에서 제외"><input type="checkbox" data-exclude-group="기타"> 제외</label>`
        : `<label title="이 등급을 계산에서 제외"><input type="checkbox" data-exclude-level="${level}"> 제외</label>`;
      section.innerHTML = `<header><button type="button" class="level-collapse" aria-expanded="${!section.classList.contains('collapsed')}" title="${escapeHtml(group)} 접기/펼치기"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 10l5-5 5 5"/></svg></button><span>${group}</span>${excludeControl}</header><div class="unit-grid"></div>`;
      section.querySelector('.level-collapse').addEventListener('click',(event)=>{
        event.stopPropagation(); const collapsed=section.classList.toggle('collapsed');
        state.collapsedUnitGroups[collapsed?'add':'delete'](group);
        event.currentTarget.setAttribute('aria-expanded',String(!collapsed));
      });
      const grid = section.querySelector('.unit-grid');
      for (const unit of units) {
      const row = document.createElement('div'); row.className = 'unit'; row.dataset.id = unit.id;
      if (ORDRCore.SPECIAL_IDS.has(unit.id)) row.classList.add('special');
      const shortcut = unit.hotkey ? `<kbd title="${escapeHtml(unit.hotkey)}: +1 / Shift+${escapeHtml(unit.hotkey)}: -1">${escapeHtml(unit.hotkey)}</kbd>` : '';
      const canShowUpgrades=Number(unit.level)>=3&&!terminalUpgradeGroups.has(unit.group);
      row.classList.toggle('no-upgrade-route',!canShowUpgrades);
      row.innerHTML = `<span class="unit-progress-fill"></span><span class="unit-image"><img src="${unit.image}" alt=""></span><span class="unit-name"><em data-progress="${unit.id}"></em>${escapeHtml(unit.name)}${shortcut}<i class="special-dot" title="기타 재료 필요"></i></span><button class="unit-action combine" title="조합">✓</button><button class="unit-action subtract" title="빼기">−</button>${canShowUpgrades?`<button class="unit-action upgrade-route" title="상위 조합 보기" aria-label="${escapeHtml(unit.name)} 상위 조합 보기">↗</button>`:''}<strong data-count="${unit.id}">0</strong>`;
      row.addEventListener('click', (event) => { if(event.target.closest('.unit-image,.unit-name'))changeCount(unit.id, 1); });
      row.querySelector('.subtract').addEventListener('click', (e) => { e.stopPropagation(); changeCount(unit.id, -1); });
      row.querySelector('.combine').addEventListener('click', (e) => { e.stopPropagation(); craftUnit(unit.id); });
      if(canShowUpgrades)row.querySelector('.upgrade-route').addEventListener('click',(e)=>{e.stopPropagation();openUpgradePaths(unit);});
      row.addEventListener('mouseenter',()=>showUnitTooltip(row,unit));
      row.addEventListener('mousemove',(event)=>positionUnitTooltip(event));
      row.addEventListener('mouseleave',hideUnitTooltip);
      row.addEventListener('contextmenu', (e) => { e.preventDefault(); if(e.target.closest('.unit-image,.unit-name'))changeCount(unit.id, -1); });
      grid.append(row);
      }
      column.append(section);
    }
    board.append(column);
  }
}

function renderAll() {
  document.querySelectorAll('[data-count]').forEach((el) => { const id=parseUnitId(el.dataset.count); const n=state.owned.get(id)||0; el.textContent=n; el.closest('.unit').classList.toggle('owned',n>0); });
  document.querySelectorAll('[data-extra-count]').forEach((el)=>{const count=state.owned.get(+el.dataset.extraCount)||0;el.textContent=count;el.closest('.extra-unit').classList.toggle('owned',count>0);});
  document.querySelectorAll('[data-extra-group-count]').forEach((el)=>{const level=+el.dataset.extraGroupCount;el.textContent=[...state.owned].filter(([id])=>state.byId.get(id)?.level===level).reduce((sum,[,count])=>sum+count,0);});
  $('#undo').disabled=!state.history.length; $('#redo').disabled=!state.future.length;
  const candidates=currentCandidates(); renderOwnedUpper(); updateEffectTotals(); updateUnitProgress(candidates); renderCandidates(candidates); updateExcludeCount(); applyUnitSkillFilter();
}
function renderSkillFilter(){
  const options=$('#skill-filter-options');
  const skills=[...new Set([...state.allUnits.flatMap((unit)=>unit.skills||[]),...preferenceFilterCodes])].sort((a,b)=>(skillNames[a]||a).localeCompare(skillNames[b]||b,'ko'));
  options.innerHTML=`<label><input type="radio" name="skill-filter" value="" checked> 전체</label>${skills.map((code)=>`<label><input type="radio" name="skill-filter" value="${escapeHtml(code)}"> ${escapeHtml(skillNames[code]||code)}</label>`).join('')}`;
}
function renderExtraUnits(){
  const list=$('#extra-units-list'); list.innerHTML='';
  for(const level of [15,19,20,22]){
    const units=state.allUnits.filter((unit)=>unit.level===level).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
    const section=document.createElement('section'); section.className='extra-unit-group';
    section.innerHTML=`<header><span>${escapeHtml(levelNames[level])}</span><b data-extra-group-count="${level}">0</b></header><div class="extra-unit-items"></div>`;
    const items=section.querySelector('.extra-unit-items');
    for(const unit of units){
      const row=document.createElement('div'); row.className='extra-unit'; row.dataset.id=unit.id;
      row.innerHTML=`<img src="${unit.image}" alt=""><span>${escapeHtml(unit.name)}</span><strong data-extra-count="${unit.id}">0</strong><button type="button" class="extra-subtract" title="빼기">−</button>`;
      row.addEventListener('click',(event)=>{if(!event.target.closest('[data-extra-count]'))changeCount(unit.id,1);});
      row.addEventListener('contextmenu',(event)=>{event.preventDefault();if(!event.target.closest('[data-extra-count]'))changeCount(unit.id,-1);});
      row.querySelector('.extra-subtract').addEventListener('click',(event)=>{event.stopPropagation();changeCount(unit.id,-1);});
      row.addEventListener('mouseenter',()=>showUnitTooltip(row,unit)); row.addEventListener('mousemove',positionUnitTooltip); row.addEventListener('mouseleave',hideUnitTooltip);
      items.append(row);
    }
    list.append(section);
  }
}
function collectUpgradeTargets(source){
  const sourceRank=categoryRank(source), depths=new Map([[source.id,0]]), queue=[source.id];
  while(queue.length){
    const materialId=queue.shift(), nextDepth=depths.get(materialId)+1;
    for(const unit of state.units){
      if(categoryRank(unit)<=sourceRank||!(unit.mate_ids||[]).includes(materialId))continue;
      if(depths.has(unit.id)&&depths.get(unit.id)<=nextDepth)continue;
      depths.set(unit.id,nextDepth); queue.push(unit.id);
    }
  }
  return [...depths].filter(([id])=>id!==source.id).map(([id,depth])=>({unit:state.byId.get(id),depth})).filter((item)=>item.unit)
    .sort((a,b)=>categoryRank(a.unit)-categoryRank(b.unit)||a.depth-b.depth||a.unit.name.localeCompare(b.unit.name,'ko'));
}
function openUpgradePaths(source){state.upgradePathHistory=[];showUpgradePaths(source);}
function showUpgradePaths(source){
  const dialog=$('#upgrade-path-dialog'), sourceBox=$('#upgrade-path-source'), viewport=$('#upgrade-path-list');
  const backButton=$('#upgrade-path-back'); backButton.hidden=!state.upgradePathHistory.length;
  if($('#unit-tooltip').parentElement!==dialog)dialog.append($('#unit-tooltip'));
  $('#upgrade-path-title').textContent=`${source.name} - ${source.group||source.level_text||'상위 조합'}`;
  renderUpgradeSummary(sourceBox,source);
  const targets=collectUpgradeTargets(source); viewport.innerHTML='';
  if(!targets.length){viewport.innerHTML='<div class="upgrade-path-empty">이어지는 상위 조합이 없습니다.</div>';if(!dialog.open)dialog.showModal();return;}
  const nodes=[{unit:source,depth:0},...targets], nodeIds=new Set(nodes.map(({unit})=>unit.id));
  const edges=new Map();
  for(const {unit} of targets)for(const materialId of new Set(unit.mate_ids||[]))if(nodeIds.has(materialId))edges.set(`${materialId}-${unit.id}`,{from:materialId,to:unit.id});
  const rows=new Map();
  for(const node of nodes){if(!rows.has(node.depth))rows.set(node.depth,[]);rows.get(node.depth).push(node);}
  for(const row of rows.values())row.sort((a,b)=>categoryRank(a.unit)-categoryRank(b.unit)||a.unit.name.localeCompare(b.unit.name,'ko'));
  const nodeWidth=50,nodeHeight=42,siblingGap=9,branchGap=38,rowGap=66,sidePadding=24,topPadding=36;
  const nodeById=new Map(nodes.map((node)=>[node.unit.id,node])),primaryChildren=new Map(nodes.map((node)=>[node.unit.id,[]])),primaryParent=new Map();
  const normalizedName=(name)=>String(name||'').replace(/[^가-힣a-z0-9]/gi,'').toLowerCase();
  for(const node of nodes.filter((item)=>item.depth>0).sort((a,b)=>a.depth-b.depth)){
    const candidates=[...edges.values()].filter((edge)=>edge.to===node.unit.id&&nodeById.get(edge.from)?.depth===node.depth-1).map((edge)=>edge.from);
    candidates.sort((a,b)=>{
      const childName=normalizedName(node.unit.name),aName=normalizedName(nodeById.get(a)?.unit.name),bName=normalizedName(nodeById.get(b)?.unit.name);
      const aMatch=aName&&(childName.includes(aName)||aName.includes(childName))?aName.length:0,bMatch=bName&&(childName.includes(bName)||bName.includes(childName))?bName.length:0;
      return bMatch-aMatch||(primaryChildren.get(a)?.length||0)-(primaryChildren.get(b)?.length||0)||String(a).localeCompare(String(b));
    });
    const parent=candidates[0]??source.id; primaryParent.set(node.unit.id,parent); primaryChildren.get(parent)?.push(node.unit.id);
  }
  for(const children of primaryChildren.values())children.sort((a,b)=>categoryRank(nodeById.get(a).unit)-categoryRank(nodeById.get(b).unit)||nodeById.get(a).unit.name.localeCompare(nodeById.get(b).unit.name,'ko'));
  const subtreeWidths=new Map();
  const measureSubtree=(id)=>{
    const children=primaryChildren.get(id)||[]; if(!children.length){subtreeWidths.set(id,nodeWidth);return nodeWidth;}
    const gap=id===source.id?branchGap:siblingGap,total=children.reduce((sum,child)=>sum+measureSubtree(child),0)+gap*(children.length-1);
    const width=Math.max(nodeWidth,total); subtreeWidths.set(id,width); return width;
  };
  const rootWidth=measureSubtree(source.id),canvasWidth=Math.max(1080,sidePadding*2+rootWidth);
  const canvas=document.createElement('div'); canvas.className='upgrade-graph-canvas';
  canvas.style.width=`${canvasWidth}px`;
  const positions=new Map();
  const placeSubtree=(id,left)=>{
    const node=nodeById.get(id),width=subtreeWidths.get(id)||nodeWidth,children=primaryChildren.get(id)||[],gap=id===source.id?branchGap:siblingGap;
    let cursor=left;
    for(const child of children){placeSubtree(child,cursor);cursor+=(subtreeWidths.get(child)||nodeWidth)+gap;}
    positions.set(id,{x:left+(width-nodeWidth)/2,y:topPadding+node.depth*(nodeHeight+rowGap),node});
  };
  placeSubtree(source.id,(canvasWidth-rootWidth)/2);
  const maxDepth=Math.max(...rows.keys());
  canvas.style.height=`${topPadding+(maxDepth+1)*nodeHeight+maxDepth*rowGap+38}px`;
  const displayEdges=[...edges.values()].filter((edge)=>primaryParent.get(edge.to)===edge.from);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.classList.add('upgrade-graph-lines'); svg.setAttribute('width',canvas.style.width); svg.setAttribute('height',canvas.style.height);
  for(const {from,to} of displayEdges){
    const a=positions.get(from),b=positions.get(to); if(!a||!b)continue;
    const startX=a.x+nodeWidth/2,startY=a.y+nodeHeight,endX=b.x+nodeWidth/2,endY=b.y,midY=startY+(endY-startY)/2;
    const path=document.createElementNS('http://www.w3.org/2000/svg','path'); path.setAttribute('d',`M ${startX} ${startY} V ${midY} H ${endX} V ${endY}`); path.dataset.from=from; path.dataset.to=to; svg.append(path);
  }
  canvas.append(svg);
  for(const [id,{x,y,node}] of positions){
    const item=document.createElement('button'); item.type='button'; item.className=`upgrade-graph-node${id===source.id?' source':''}`; item.dataset.id=id; item.style.left=`${x}px`; item.style.top=`${y}px`;
    item.setAttribute('aria-label',`${node.unit.name} - ${node.unit.group||node.unit.level_text||''}`);
    item.innerHTML=`<img src="${node.unit.image}" alt="">`;
    if(id!==source.id)item.addEventListener('click',()=>{hideUnitTooltip();state.upgradePathHistory.push(source.id);showUpgradePaths(node.unit);});
    item.addEventListener('mouseenter',(event)=>{focusUpgradeGraph(canvas,id);showUnitTooltip(item,node.unit);positionUnitTooltip(event);});
    item.addEventListener('mousemove',positionUnitTooltip);
    item.addEventListener('mouseleave',()=>{focusUpgradeGraph(canvas,null);hideUnitTooltip();});
    canvas.append(item);
  }
  viewport.append(canvas);
  if(!dialog.open)dialog.showModal();
  requestAnimationFrame(()=>centerUpgradeGraph(viewport,positions.get(source.id),nodeWidth,nodeHeight));
}
function renderUpgradeSummary(container,unit){
  const analysis=ORDRCore.analyzeRecipe(unit,state.owned,state.excludedIds,state.excludedLevels,state.byId);
  const emptyAnalysis=ORDRCore.analyzeRecipe(unit,new Map(),state.excludedIds,state.excludedLevels,state.byId);
  const commonRequirements=[...emptyAnalysis.lackedMaterials].filter(([id])=>state.byId.get(id)?.level===1);
  const common=commonRequirements.length?commonRequirements.map(([id,quantity])=>{
    const material=state.byId.get(id),missing=analysis.lackedMaterials.get(id)||0,covered=Math.max(0,quantity-missing);
    return `<span class="upgrade-requirement${covered<quantity?' missing':' complete'}">${escapeHtml(material.name)} <b>${covered}/${quantity}</b></span>`;
  }).join('<i>/</i>'):'<span class="upgrade-summary-empty">필요한 흔함 유닛 없음</span>';
  const upperRequirements=analysis.materials.length?analysis.materials.map(({material,quantity,special})=>{
    if(!material)return `<span class="upgrade-upper-requirement">알 수 없음 <b>×${quantity}</b></span>`;
    const content=`${escapeHtml(material.name)} <b>×${quantity}</b>`,className=`upgrade-upper-requirement${special?' special':''}`;
    return Number(material.level)===1?`<span class="${className}">${content}</span>`:`<button type="button" class="${className}" data-upgrade-summary-unit="${escapeHtml(String(material.id))}">${content}</button>`;
  }).join('<i>/</i>'):'<span class="upgrade-summary-empty">필요한 조합 유닛 없음</span>';
  const tooltip=state.details.get(Number(unit.id))?.tooltip||'';
  const traits=(unit.skills||[]).map((code)=>{
    const name=skillNames[code]||code,effects=parseEffectKinds(tooltip,name);
    const values=[...new Set(effects.map(({value})=>`${/감소/.test(name)?'-':''}${value}`))];
    return `<span>${escapeHtml(name)}${values.length?` <b>${escapeHtml(values.join(' / '))}</b>`:''}</span>`;
  }).join('')||'<em>보유 특성 없음</em>';
  container.innerHTML=`<img class="upgrade-summary-image" src="${unit.image}" alt=""><div class="upgrade-summary-content"><div class="upgrade-summary-title"><strong>${escapeHtml(unit.name)}</strong><span>${escapeHtml(unit.group||unit.level_text||'')}</span></div><div class="upgrade-upper-requirements">${upperRequirements}</div><div class="upgrade-requirements"><label>흔함 유닛</label>${common}</div><div class="upgrade-traits">${traits}</div></div>`;
  container.querySelectorAll('[data-upgrade-summary-unit]').forEach((button)=>button.addEventListener('click',()=>{
    const target=state.byId.get(parseUnitId(button.dataset.upgradeSummaryUnit));
    if(!target)return;
    hideUnitTooltip(); state.upgradePathHistory.push(unit.id); showUpgradePaths(target);
  }));
}
function centerUpgradeGraph(viewport,position,nodeWidth,nodeHeight){
  if(!position)return;
  viewport.scrollTo({
    left:Math.max(0,position.x+nodeWidth/2-viewport.clientWidth/2),
    top:Math.max(0,position.y-36),
    behavior:'auto'
  });
}
function bindUpgradeGraphPan(){
  const viewport=$('#upgrade-path-list'),dialog=$('#upgrade-path-dialog');
  let drag=null;
  viewport.addEventListener('pointerdown',(event)=>{
    if(event.button!==0||event.target.closest('.upgrade-graph-node'))return;
    drag={x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop,moved:false};
    viewport.setPointerCapture(event.pointerId); viewport.classList.add('panning');
  });
  viewport.addEventListener('pointermove',(event)=>{
    if(!drag)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(Math.abs(dx)+Math.abs(dy)>3)drag.moved=true;
    viewport.scrollLeft=drag.left-dx; viewport.scrollTop=drag.top-dy;
  });
  const stop=(event)=>{
    if(!drag)return;
    const moved=drag.moved;
    if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);
    drag=null; viewport.classList.remove('panning');
    if(moved){dialog.dataset.justPanned='true';setTimeout(()=>delete dialog.dataset.justPanned,0);}
  };
  viewport.addEventListener('pointerup',stop);
  viewport.addEventListener('pointercancel',stop);
}
function focusUpgradeGraph(canvas,id){
  const paths=[...canvas.querySelectorAll('.upgrade-graph-lines path')];
  const connected=new Set([String(id)]);
  paths.forEach((path)=>{const active=id!==null&&(path.dataset.from===String(id)||path.dataset.to===String(id));path.classList.toggle('active',active);path.classList.toggle('dimmed',id!==null&&!active);if(active){connected.add(path.dataset.from);connected.add(path.dataset.to);}});
  canvas.querySelectorAll('.upgrade-graph-node').forEach((node)=>node.classList.toggle('dimmed',id!==null&&!connected.has(node.dataset.id)));
}
function applyUnitSkillFilter(){
  document.querySelectorAll('.unit').forEach((row)=>{
    const unit=state.byId.get(parseUnitId(row.dataset.id));
    const preferenceMatch=preferenceFilterCodes.includes(state.activeSkill)&&preferenceTags(state.details.get(Number(unit?.id))?.tooltip).has(state.activeSkill);
    const matched=!state.activeSkill||(unit?.skills||[]).includes(state.activeSkill)||preferenceMatch;
    row.classList.toggle('skill-filter-miss',!matched);
    row.classList.toggle('skill-filter-hit',Boolean(state.activeSkill&&matched));
  });
}
function renderOwnedUpper(){
  const list=$('#owned-upper-list');
  const owned=[...state.owned]
    .filter(([id,count])=>count>0&&state.byId.get(id)&&Number(state.byId.get(id).level)>3&&state.byId.get(id).group!=='기타')
    .sort(([idA],[idB])=>categoryRank(state.byId.get(idA))-categoryRank(state.byId.get(idB))||state.byId.get(idA).name.localeCompare(state.byId.get(idB).name,'ko'));
  if(!owned.length){list.innerHTML='<span class="owned-upper-empty">보유 중인 상위 유닛 없음</span>';return;}
  list.innerHTML='';
  const groups=new Map();
  for(const entry of owned){const group=state.byId.get(entry[0]).group;if(!groups.has(group))groups.set(group,[]);groups.get(group).push(entry);}
  for(const [groupName,entries] of groups){
    const group=document.createElement('div'); group.className='owned-upper-group';
    group.innerHTML=`<span class="owned-upper-label">${escapeHtml(groupName)}</span><div class="owned-upper-items"></div>`;
    const items=group.querySelector('.owned-upper-items');
    for(const [id,count] of entries){
      const unit=state.byId.get(id); const item=document.createElement('div'); item.className='owned-upper-unit'; item.dataset.id=unit.id; item.setAttribute('aria-label',`${unit.name} ×${count}`);
      item.innerHTML=`<img src="${unit.image}" alt="${escapeHtml(unit.name)}"><b>${count}</b>`;
      item.addEventListener('mouseenter',()=>showUnitTooltip(item,unit));
      item.addEventListener('mousemove',positionUnitTooltip);
      item.addEventListener('mouseleave',hideUnitTooltip);
      items.append(item);
    }
    list.append(group);
  }
}

function currentCandidates(){return ORDRCore.buildCandidates(state.allUnits,state.owned,state.excludedIds,state.excludedLevels);}
function updateUnitProgress(candidateItems){
  const candidates=new Map(candidateItems.map((candidate)=>[String(candidate.unit.id),candidate]));
  document.querySelectorAll('.unit').forEach((row)=>{
    const candidate=candidates.get(row.dataset.id);
    const progress=candidate?.progress||0;
    row.style.setProperty('--progress',`${progress}%`);
    row.classList.toggle('has-recipe',Boolean(candidate));
    row.classList.toggle('ready-to-combine',Boolean(candidate?.ready));
    row.classList.toggle('progress-high',progress>=90&&progress<100);
    row.classList.toggle('progress-complete',progress===100);
    row.classList.toggle('needs-special',Boolean(candidate?.hasSpecial));
    const label=row.querySelector('[data-progress]'); if(label)label.textContent=candidate?`${progress}% `:'';
    const combine=row.querySelector('.combine'); if(combine)combine.disabled=!candidate?.ready;
  });
}
function craftUnit(id){
  const candidate=currentCandidates().find((item)=>String(item.unit.id)===String(id));
  if(!candidate?.ready)return;
  snapshot(); if(!ORDRCore.craft(candidate,state.owned))state.history.pop(); renderAll();
}

function updateEffectTotals() {
  const armorKinds=new Map(),slowKinds=new Map(),traits=new Map();
  for(const [id,count] of state.owned){
    const unit=state.byId.get(id); const detail=state.details.get(Number(id)); const tooltip=detail?.tooltip;
    for(const effect of parseEffectKinds(tooltip,'방어력 감소'))armorKinds.set(effect.kind,(armorKinds.get(effect.kind)||0)+effect.value*count);
    for(const effect of parseEffectKinds(tooltip,'이동속도 감소'))slowKinds.set(effect.kind,(slowKinds.get(effect.kind)||0)+effect.value*count);
    for(const skill of unit?.skills||[])traits.set(skill,(traits.get(skill)||0)+count);
  }
  const armor=[...armorKinds.values()].reduce((a,b)=>a+b,0),slow=[...slowKinds.values()].reduce((a,b)=>a+b,0);
  $('#armor-total').textContent=armor||'—'; $('#slow-total').textContent=slow||'—'; renderEffectBreakdown('#armor-summary',armorKinds); renderEffectBreakdown('#slow-summary',slowKinds);
  const traitList=$('#trait-list');
  traitList.innerHTML=traits.size?[...traits].sort((a,b)=>b[1]-a[1]).map(([code,count])=>`<b data-trait-code="${escapeHtml(code)}">${escapeHtml(skillNames[code]||code)}${count>1?` ×${count}`:''}</b>`).join(''):'<i>없음</i>';
  traitList.querySelectorAll('[data-trait-code]').forEach((badge)=>{
    badge.addEventListener('mouseenter',()=>highlightTraitUnits(badge.dataset.traitCode));
    badge.addEventListener('mouseleave',clearTraitUnitHighlight);
  });
}
function highlightTraitUnits(code){
  document.querySelectorAll('.owned-upper-unit').forEach((item)=>{
    const unit=state.byId.get(parseUnitId(item.dataset.id));
    item.classList.toggle('trait-highlight',(unit?.skills||[]).includes(code));
  });
}
function clearTraitUnitHighlight(){document.querySelectorAll('.owned-upper-unit.trait-highlight').forEach((item)=>item.classList.remove('trait-highlight'));}
function parseEffectKinds(tooltip,label){
  if(!tooltip)return[]; const lines=tooltip.split('\n'); const effects=[];
  for(let index=0;index<lines.length;index++){
    if(!lines[index].includes(label))continue;
    for(let cursor=index+1;cursor<Math.min(lines.length,index+4);cursor++){
      const match=lines[cursor].match(/(.+?형식)(?:\s+최대)?\s*(-?\d+(?:\.\d+)?)/);
      if(match){effects.push({kind:match[1].replace(/\s*형식$/,'').trim(),value:Math.abs(Number(match[2]))});break;}
      if(/\([^)]*\)/.test(lines[cursor])&&!lines[cursor].includes('형식'))break;
    }
  }
  return effects;
}
function renderEffectBreakdown(selector,kinds){
  const target=$(selector); const total=[...kinds.values()].reduce((a,b)=>a+b,0);
  target.innerHTML=`<strong>${total}</strong>${[...kinds].map(([kind,value])=>`<b title="${escapeHtml(kind)}">${escapeHtml(kind)} ${value}</b>`).join('')}`;
}

function showUnitTooltip(row,unit){
  const tooltip=$('#unit-tooltip'); const detail=state.details.get(Number(unit.id));
  const content=detail?.tooltip?.trim()||((unit.skills||[]).map((code)=>skillNames[code]||code).join('\n'));
  if(!content){hideUnitTooltip();return;}
  tooltip.classList.toggle('named-tooltip',row.classList.contains('upgrade-graph-node')||row.classList.contains('owned-upper-unit'));
  tooltip.querySelector('img').src=unit.image; tooltip.querySelector('strong').textContent=unit.name; tooltip.querySelector('.tooltip-head span').textContent=unit.group||unit.level_text||'';
  const body=tooltip.querySelector('.tooltip-body'); renderTooltipBody(body,content);
  tooltip.hidden=false; row.setAttribute('aria-describedby','unit-tooltip');
}
function positionUnitTooltip(event){
  const tooltip=$('#unit-tooltip'); if(tooltip.hidden)return; const gap=14; let left=event.clientX+gap,top=event.clientY+gap;
  const rect=tooltip.getBoundingClientRect(); if(left+rect.width>innerWidth-8)left=event.clientX-rect.width-gap; if(top+rect.height>innerHeight-8)top=innerHeight-rect.height-8;
  tooltip.style.left=`${Math.max(8,left)}px`; tooltip.style.top=`${Math.max(8,top)}px`;
}
function hideUnitTooltip(){const tooltip=$('#unit-tooltip');tooltip.hidden=true;document.querySelector('[aria-describedby="unit-tooltip"]')?.removeAttribute('aria-describedby');}
function preferenceTag(line){
  const value=Number(line.match(/-?\d+/)?.[0]);
  if(!Number.isFinite(value))return null;
  if(line.includes('스토리')&&value>=5)return{label:'#스토리',kind:'story'};
  if((line.includes('마법')||line.includes('마딜'))&&value>=10)return{label:'#마딜',kind:'magic'};
  if((line.includes('물리')||line.includes('물딜'))&&value>=10)return{label:'#물딜',kind:'physical'};
  return null;
}
function preferenceTags(text=''){
  const codes={story:'prefstory',magic:'prefmagic',physical:'prefphysical'};
  return new Set(text.split('\n').map(preferenceTag).filter(Boolean).map(({kind})=>codes[kind]));
}
function renderTooltipBody(body,text){
  const lines=text.split('\n').filter(Boolean); body.innerHTML='';
  lines.forEach((line,index)=>{
    const displayLine=line.replace(/^(해적선(?:x\d+)?) \(히든조합\)$/,'$1 (기타)');
    const isPreference=/좋아요\s*-?\d+/.test(displayLine),preference=isPreference?preferenceTag(displayLine):null;
    if(isPreference&&!preference)return;
    const item=document.createElement('div'); item.textContent=preference?.label||displayLine;
    if(/\((흔함|안흔함|특별함|희귀함|전설적인|히든조합|변화된|제한됨|초월함|불멸의|영원함|기타)\)$/.test(displayLine)){
      item.className='tooltip-material';
      if([...ORDRCore.SPECIAL_IDS].some((id)=>displayLine.includes(state.byId.get(id)?.name)))item.classList.add('tooltip-special-material');
    }
    else if(preference)item.className=`tooltip-preference ${preference.kind}`;
    else if(/\([a-z][a-z0-9 _-]*\)$/i.test(displayLine))item.className='tooltip-command';
    else if(/형식/.test(displayLine))item.className='tooltip-detail';
    else item.className='tooltip-trait';
    if(item.classList.contains('tooltip-preference')&&!body.lastElementChild?.classList.contains('tooltip-preference'))item.classList.add('section-start');
    if(index>0&&item.className==='tooltip-trait'&&body.lastElementChild?.className!=='tooltip-trait')item.classList.add('section-start');
    body.append(item);
  });
}

function renderCandidates(candidateItems) {
  let items=[...candidateItems];
  items=items.filter((item)=>item.progress>=80&&(item.unit.group||item.unit.level_text)!=='변화된').sort((a,b)=>categoryRank(b.unit)-categoryRank(a.unit)||b.progress-a.progress||a.unit.name.localeCompare(b.unit.name,'ko'));
  $('#candidate-count').textContent=items.length;
  const list=$('#candidate-list'); list.innerHTML='';
  if(!items.length){list.innerHTML='<div class="empty"><b>표시할 조합이 없습니다</b><span>진행률 80% 이상인 조합이 표시됩니다.</span></div>';return;}
  const groups=new Map();
  for(const item of items){const name=item.unit.group||levelNames[item.unit.level]||item.unit.level_text;if(!groups.has(name))groups.set(name,[]);groups.get(name).push(item);}
  for(const [groupName,candidates] of groups){
    const section=document.createElement('section'); const collapsed=state.collapsedCandidateGroups.has(groupName); section.className=`candidate-group ${collapsed?'collapsed':''}`;
    section.innerHTML=`<button class="candidate-group-head" aria-expanded="${!collapsed}"><span>${escapeHtml(groupName)}</span><b>${candidates.length}</b><i>⌃</i></button><div class="candidate-group-list"></div>`;
    section.querySelector('.candidate-group-head').addEventListener('click',()=>{const next=section.classList.toggle('collapsed');state.collapsedCandidateGroups[next?'add':'delete'](groupName);section.querySelector('.candidate-group-head').setAttribute('aria-expanded',String(!next));});
    const groupList=section.querySelector('.candidate-group-list');
    for(const c of candidates){
      const card=document.createElement('article'); card.className=`candidate ${c.ready?'ready':''} ${c.hasSpecial?'needs-special':''}`;
      const lacked=[...(c.lackedMaterials||new Map())];
      const materials=lacked.length?lacked.map(([id,quantity])=>{const material=state.byId.get(id);return `<span class="material missing ${ORDRCore.SPECIAL_IDS.has(id)?'special':''}">${escapeHtml(material?.name||`#${id}`)} <b>×${quantity}</b></span>`;}).join(''):'<span class="material fulfilled">재료 충족</span>';
      const wispUsage=c.wispUsed?`<span class="material wisp-used">선택 위습 <b>×${c.wispUsed}</b></span>`:'';
      card.innerHTML=`<div class="candidate-top"><div><h3>${escapeHtml(c.unit.name)}</h3></div><div class="progress"><strong>${c.progress}%</strong><span>${c.ready?'제작 가능':`부족 ${c.missingTotal}`}</span></div></div>${c.hasSpecial?'<div class="special-alert">◆ 기타 재료 필요</div>':''}<div class="materials">${materials}${wispUsage}</div><button class="craft" ${c.ready?'':'disabled'}>조합 실행</button>`;
      card.querySelector('.craft').addEventListener('click',()=>{snapshot(); if(!ORDRCore.craft(c,state.owned))state.history.pop(); renderAll();}); groupList.append(card);
    }
    list.append(section);
  }
}
function categoryRank(unit){const index=levelOrder.indexOf(unit.level);return index<0?-1:index;}

function renderExclusions(){
  const levels=$('#level-exclusions'), materials=$('#material-exclusions');
  levels.innerHTML=levelOrder.filter((l)=>l!==14).map((l)=>`<label><input type="checkbox" value="${l}" data-level-option> ${levelNames[l]||l}</label>`).join('');
  materials.innerHTML=state.allUnits.filter((u)=>ORDRCore.SPECIAL_IDS.has(u.id)).map((u)=>`<label><input type="checkbox" value="${u.id}" data-material-option> ${escapeHtml(u.name)}</label>`).join('');
}

function syncExclusions(){
  state.excludedLevels=new Set([...document.querySelectorAll('[data-level-option]:checked')].map((x)=>+x.value));
  state.excludedIds=new Set([...document.querySelectorAll('[data-material-option]:checked')].map((x)=>+x.value));
  document.querySelectorAll('[data-exclude-level]').forEach((x)=>x.checked=state.excludedLevels.has(+x.dataset.excludeLevel));
  const groupBox=document.querySelector('[data-exclude-group="기타"]');
  if(groupBox){const included=[...ORDRCore.SPECIAL_IDS];const selected=included.filter((id)=>state.excludedIds.has(id)).length;groupBox.checked=selected===included.length;groupBox.indeterminate=selected>0&&selected<included.length;}
  renderAll();
}

function updateExcludeCount(){const n=state.excludedIds.size+state.excludedLevels.size;$('#exclude-count').textContent=n;document.body.classList.toggle('has-exclusions',n>0);}
function bindEvents(){
  $('#open-help').onclick=()=>$('#help-dialog').showModal();
  $('#help-dialog').addEventListener('click',(event)=>{
    const dialog=event.currentTarget,rect=dialog.getBoundingClientRect();
    if(event.target===dialog&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))dialog.close();
  });
  $('#support-developer').onclick=()=>$('#support-dialog').showModal();
  $('#upgrade-path-back').onclick=()=>{const id=state.upgradePathHistory.pop();if(id!==undefined){hideUnitTooltip();showUpgradePaths(state.byId.get(id));}};
  $('#support-dialog').addEventListener('click',(event)=>{
    const dialog=event.currentTarget,rect=dialog.getBoundingClientRect();
    if(event.target===dialog&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))dialog.close();
  });
  $('#reset').onclick=()=>{if(!state.owned.size)return;snapshot();state.owned.clear();renderAll();};
  $('#undo').onclick=()=>{if(!state.history.length)return;state.future.push(new Map(state.owned));state.owned=state.history.pop();renderAll();};
  $('#redo').onclick=()=>{if(!state.future.length)return;state.history.push(new Map(state.owned));state.owned=state.future.pop();renderAll();};
  $('#zoom-out').onclick=()=>changeZoom('out');
  $('#zoom-reset').onclick=()=>changeZoom('reset');
  $('#zoom-in').onclick=()=>changeZoom('in');
  document.querySelectorAll('[data-toggle-status]').forEach((button)=>button.onclick=()=>{
    const hidden=document.body.classList.toggle('status-hidden'); updateStatusToggleButtons(hidden); requestAnimationFrame(updateStickyLayout);
  });
  updateStatusToggleButtons(false);
  $('#toggle-skill-filter').onclick=()=>{const collapsed=document.body.classList.toggle('skill-filter-collapsed');$('#toggle-skill-filter').setAttribute('aria-expanded',String(!collapsed));requestAnimationFrame(updateStickyLayout);};
  $('#toggle-recommendations').onclick=()=>{
    const collapsed=document.body.classList.toggle('recommendations-collapsed');
    const button=$('#toggle-recommendations');
    button.setAttribute('aria-expanded',String(!collapsed));
    button.title=collapsed?'조합 후보 펼치기':'조합 후보 접기';
    button.textContent=collapsed?'‹':'›';
  };
  bindRecommendationResize();
  $('#open-extra-units').onclick=()=>$('#extra-units-dialog').showModal();
  $('#open-exclusions').onclick=()=>$('#exclusion-dialog').showModal();
  $('#upgrade-path-dialog').addEventListener('click',(event)=>{
    const dialog=event.currentTarget,rect=dialog.getBoundingClientRect();
    if(dialog.dataset.justPanned||event.target!==dialog)return;
    const inside=event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom;
    if(!inside)dialog.close();
  });
  $('#upgrade-path-dialog').addEventListener('close',()=>{state.upgradePathHistory=[];hideUnitTooltip();document.body.append($('#unit-tooltip'));});
  bindUpgradeGraphPan();
  $('#exclusion-dialog').addEventListener('close',syncExclusions);
  $('#clear-exclusions').onclick=()=>{document.querySelectorAll('#exclusion-dialog input').forEach((x)=>x.checked=false);};
  $('#skill-filter-options').addEventListener('click',(e)=>{
    if(!e.target.matches('[name="skill-filter"]')||!e.target.value||state.activeSkill!==e.target.value)return;
    setTimeout(()=>{
      $('#skill-filter-options input[value=""]').checked=true;
      state.activeSkill='';
      $('#skill-filter-current').textContent='전체';
      applyUnitSkillFilter();
    },0);
  });
  document.addEventListener('change',(e)=>{
    if(e.target.matches('[name="skill-filter"]')){state.activeSkill=e.target.value;$('#skill-filter-current').textContent=state.activeSkill?(skillNames[state.activeSkill]||state.activeSkill):'전체';applyUnitSkillFilter();}
    if(e.target.matches('[data-exclude-level]')){const box=document.querySelector(`[data-level-option][value="${e.target.dataset.excludeLevel}"]`);if(box)box.checked=e.target.checked;syncExclusions();}
    if(e.target.matches('[data-exclude-group="기타"]')){document.querySelectorAll('[data-material-option]').forEach((box)=>box.checked=e.target.checked);syncExclusions();}
  });
  $('#search').addEventListener('keydown',(e)=>{
    if(e.key!=='Enter'||e.isComposing)return;
    const q=e.target.value.trim().toLocaleLowerCase();
    const rows=[...document.querySelectorAll('.unit')];
    rows.forEach((row)=>row.classList.remove('search-hit'));
    if(!q)return;
    const matches=rows.filter((row)=>row.querySelector('.unit-name').textContent.toLocaleLowerCase().includes(q));
    matches.forEach((row)=>row.classList.add('search-hit'));
    matches[0]?.scrollIntoView({behavior:'smooth',block:'center'});
  });
  document.addEventListener('keydown',(e)=>{
    if(e.ctrlKey||e.metaKey){if(['+','=','-','0'].includes(e.key)){e.preventDefault();changeZoom(e.key==='-'?'out':e.key==='0'?'reset':'in');}return;}
    if(e.key==='Escape'){
      const openDialogs=[...document.querySelectorAll('dialog[open]')];
      if(openDialogs.length){e.preventDefault();openDialogs.at(-1).close();return;}
    }
    if(e.key==='Escape'&&state.activeSkill){
      e.preventDefault();
      $('#skill-filter-options input[value=""]').checked=true;
      state.activeSkill='';
      $('#skill-filter-current').textContent='전체';
      applyUnitSkillFilter();
      return;
    }
    if(e.target.matches('input')||e.altKey)return;
    if(e.key.toLowerCase()==='t'){e.preventDefault();e.shiftKey?$('#undo').click():$('#reset').click();return;}
    if(e.key.toLowerCase()==='z'){e.shiftKey?$('#redo').click():$('#undo').click();return;}
    const pressedHotkey=e.code.startsWith('Key')?e.code.slice(3):e.key.toUpperCase();
    const u=state.units.find((x)=>x.hotkey===pressedHotkey);
    if(u){e.preventDefault();changeCount(u.id,e.shiftKey?-1:1);}
  });
  window.addEventListener('resize',updateStickyLayout);
}
function bindRecommendationResize(){
  const handle=$('#recommendations-resizer');
  handle.addEventListener('pointerdown',(event)=>{
    if(document.body.classList.contains('recommendations-collapsed'))return;
    event.preventDefault(); handle.setPointerCapture(event.pointerId); document.body.classList.add('resizing-recommendations');
    const startX=event.clientX; const startWidth=$('.recommendations').getBoundingClientRect().width;
    const move=(e)=>document.documentElement.style.setProperty('--recommendations-width',`${Math.max(190,Math.min(600,startWidth+startX-e.clientX))}px`);
    const stop=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',stop);handle.removeEventListener('pointercancel',stop);document.body.classList.remove('resizing-recommendations');};
    handle.addEventListener('pointermove',move); handle.addEventListener('pointerup',stop); handle.addEventListener('pointercancel',stop);
  });
}
async function changeZoom(action){updateZoomLabel(await window.ordrDesktop.zoom.change(action));}
function updateZoomLabel(factor){$('#zoom-label').textContent=`${Math.round(factor*100)}%`;}
function updateStatusToggleButtons(hidden){
  const title=hidden?'현재 상태 창 보이기':'현재 상태 창 안 보이기';
  const icon=hidden
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.2A10.5 10.5 0 0112 4c6 0 9 8 9 8a15.2 15.2 0 01-2.1 3.3M6.6 6.6C4.2 8.2 3 12 3 12s3 8 9 8a9.8 9.8 0 004.1-.9"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3-8 9-8 9 8 9 8-3 8-9 8-9-8-9-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  document.querySelectorAll('[data-toggle-status]').forEach((button)=>{button.innerHTML=icon;button.title=title;button.setAttribute('aria-label',title);button.setAttribute('aria-pressed',String(hidden));});
}
function updateStickyLayout(){const panels=document.querySelector('.top-panels');if(!panels)return;document.documentElement.style.setProperty('--recommendations-top',`${Math.ceil(panels.getBoundingClientRect().bottom+9)}px`);}
function escapeHtml(value){const d=document.createElement('div');d.textContent=value||'';return d.innerHTML;}
function parseUnitId(value){return value===ORDRCore.WISP_ID?ORDRCore.WISP_ID:+value;}
init().catch((error)=>{$('#owned-upper-list').innerHTML=`<span class="owned-upper-error">데이터를 불러오지 못했습니다: ${escapeHtml(error.message)}</span>`;});
