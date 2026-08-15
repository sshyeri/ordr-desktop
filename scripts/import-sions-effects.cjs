const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const SOURCE_URL = 'https://sions.kr/bbs/board.php?bo_table=mk_helper&wr_id=13330';
const root = path.join(__dirname, '..');
const groupMap = new Map([
  ['흔함', '흔함'], ['안흔함', '안흔함'], ['특별함', '특별함'], ['희귀함', '희귀함'],
  ['전설', '전설적인'], ['히든', '히든조합'], ['왜곡', '왜곡됨'], ['랜덤유닛', '랜덤전용'],
  ['변화', '변화된'], ['세라핌 : 단일스턴, 공중이동 가능', '세라핌'], ['제한됨', '제한됨'],
  ['초월함', '초월함'], ['신비함', '신비함'], ['불멸의', '불멸의'], ['영원함', '영원한'],
]);
const aliases = new Map([
  ['희귀함|우솝', 114],
]);

function fetchText(url) {
  return new Promise((resolve, reject) => https.get(url, {headers: {'user-agent': 'ordr-desktop-data-import'}}, (response) => {
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) return resolve(fetchText(new URL(response.headers.location, url)));
    if (response.statusCode !== 200) return reject(new Error(`HTTP ${response.statusCode}`));
    const chunks = []; response.on('data', (chunk) => chunks.push(chunk)); response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))); response.on('error', reject);
  }).on('error', reject));
}

function decodeHtml(value) {
  return value.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
}

function clean(value) { return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); }
function cleanName(value) { return clean(value).replace(/\s*\([QWERASDFG]\)\s*$/i, ''); }

function effect(label, value, raw, enhancedValue) { return {label, value: value || '??', raw, ...(enhancedValue ? {enhancedValue} : {})}; }
function extractEffects(text) {
  const source = clean(text);
  const hasRangeStun = /범위\s*스턴|(?<!단일)(?<!단일\s)스턴/i.test(source);
  if (!hasRangeStun) return [];
  const enhancedAfter = source.match(/(-?\d+(?:\.\d+)?)\s*(?:초)?\s*스턴\s*\(\s*특강시\s*(-?\d+(?:\.\d+)?)/i);
  if (enhancedAfter) return [effect('범위 스턴', enhancedAfter[1], source, enhancedAfter[2])];
  const enhancedInside = source.match(/(-?\d+(?:\.\d+)?)\s*\(\s*특강시\s*(-?\d+(?:\.\d+)?)[^)]*\)\s*스턴/i);
  if (enhancedInside) return [effect('범위 스턴', enhancedInside[1], source, enhancedInside[2])];
  for (const match of source.matchAll(/(-?\d+(?:\.\d+)?)\s*(?:초)?\s*스턴/gi)) {
    const prefix = source.slice(Math.max(0, match.index - 28), match.index);
    if (/발동\s*조건|특강|특포/.test(prefix)) continue;
    return [effect('범위 스턴', match[1], source)];
  }
  return [];
}

async function main() {
  const html = decodeHtml(await fetchText(SOURCE_URL));
  const match = html.match(/<div id="wr_content_json">\s*([\s\S]*?)\s*<\/div>/);
  if (!match) throw new Error('시온스 데이터 영역을 찾지 못했습니다.');
  const source = JSON.parse(match[1]);
  const displayPath = path.join(root, 'data', 'unit-display.json');
  const detailPath = path.join(root, 'data', 'unit-details.json');
  const display = JSON.parse(fs.readFileSync(displayPath, 'utf8'));
  const details = JSON.parse(fs.readFileSync(detailPath, 'utf8'));
  for (const detail of details) {
    const previousLines = (detail.referenceEffects || []).flatMap(({label, value, enhancedValue}) => [`${label} ${value}`, `스턴 수치 ${value}`, `스턴 수치 ${value} (특강시 ${enhancedValue})`]);
    let lines = String(detail.tooltip || '').split('\n');
    const markerIndex = lines.indexOf('시온스 2.310 참고 특성');
    if (markerIndex >= 0) lines = lines.slice(0, markerIndex);
    else while (lines.length && previousLines.includes(lines.at(-1))) lines.pop();
    lines = lines.map((line) => /^범위\s*스턴\s*\(스턴\)\s*$/.test(line.trim()) ? '범위 스턴' : line);
    detail.tooltip = lines.join('\n'); delete detail.referenceEffects;
  }
  const detailById = new Map(details.map((item) => [item.id, item]));
  const targets = display.map((item) => ({...item, cleanName: cleanName(item.name), cleanGroup: clean(item.group).replace(/\s*\(\d+\)$/, '')}));
  let matched = 0; let affected = 0;
  for (const group of source.groups || []) {
    const targetGroup = groupMap.get(clean(group.name)); if (!targetGroup) continue;
    const candidates = targets.filter((item) => item.cleanGroup === targetGroup).sort((a, b) => b.cleanName.length - a.cleanName.length);
    for (const item of group.items || []) {
      const sourceName = cleanName(item.name);
      const alias = [...aliases].find(([key]) => { const [groupName, name] = key.split('|'); return groupName === targetGroup && (sourceName === name || sourceName.startsWith(`${name} `)); });
      const target = alias ? targets.find((candidate) => candidate.id === alias[1]) : candidates.find((candidate) => sourceName === candidate.cleanName || sourceName.startsWith(`${candidate.cleanName} `));
      if (!target) continue; matched++;
      const matchedName = alias ? alias[0].split('|')[1] : target.cleanName;
      const suffix = sourceName.slice(matchedName.length).trim();
      const raw = clean([suffix, item.descr].filter(Boolean).join(' / '));
      const effects = extractEffects(raw); if (!effects.length) continue;
      affected++;
      let detail = detailById.get(target.id);
      if (!detail) { detail = {armorReduction: null, id: target.id, name: target.cleanName, slow: null, tooltip: ''}; details.push(detail); detailById.set(target.id, detail); }
      let baseLines = String(detail.tooltip || '').split('\n');
      detail.referenceEffects = effects.map(({label, value, enhancedValue}) => ({label, value, ...(enhancedValue ? {enhancedValue} : {}), source: '시온스 ORDR 2.310 개인용'}));
      if (effects.some(({label}) => label === '범위 스턴')&&!baseLines.some((line) => line.trim() === '범위 스턴')) baseLines.push('범위 스턴');
      baseLines=baseLines.filter((line)=>!/^스턴 수치\s+/.test(line));
      const stunIndex=baseLines.findIndex((line)=>line.trim()==='범위 스턴');
      const stunDetail=`스턴 수치 ${effects[0].value}${effects[0].enhancedValue?` (특강시 ${effects[0].enhancedValue})`:''}`;
      baseLines.splice(stunIndex+1,0,stunDetail);
      detail.tooltip = baseLines.filter(Boolean).join('\n');
    }
  }
  details.sort((a, b) => a.id - b.id);
  fs.writeFileSync(detailPath, `${JSON.stringify(details, null, 2)}\n`);
  console.log(JSON.stringify({source: SOURCE_URL, sourceVersion: '2.310', sourceItems: source.groups.reduce((sum, group) => sum + group.items.length, 0), matched, affected}, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
