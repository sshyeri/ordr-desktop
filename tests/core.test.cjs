const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../app/core.js');
const root = path.join(__dirname, '..');
const seedData = JSON.parse(fs.readFileSync(path.join(root, 'data', 'units.seed.json'), 'utf8'));
const displayData = JSON.parse(fs.readFileSync(path.join(root, 'data', 'unit-display.json'), 'utf8'));
const mapPatchData = JSON.parse(fs.readFileSync(path.join(root, 'data', 'map-patches.json'), 'utf8'));
const displayById = new Map(displayData.map((unit) => [unit.id, unit]));
const allUnits = seedData.map((unit) => ({ ...unit, ...displayById.get(unit.id), mate_ids: unit.mate_ids || [] }));
for (const patch of mapPatchData.units) {
  const unit = allUnits.find((item) => item.id === patch.id);
  if (patch.name) unit.name = patch.name;
  if (patch.removeMateIds) unit.mate_ids = unit.mate_ids.filter((id) => !patch.removeMateIds.includes(id));
  const skills = new Set(unit.skills || []);
  for (const skill of patch.removeSkills || []) skills.delete(skill);
  for (const skill of patch.addSkills || []) skills.add(skill);
  unit.skills = [...skills];
}
const allById = new Map(allUnits.map((unit) => [unit.id, unit]));

const units = [
  { id: 1, name: '루피', level: 1, mate_ids: [] },
  { id: 2, name: '조로', level: 1, mate_ids: [] },
  { id: 16, name: '목재', level: 14, mate_ids: [] },
  { id: 325, name: '불사조의 깃털', level: 14, mate_ids: [] },
  { id: 100, name: '결과', level: 5, mate_ids: [1, 1, 2, 16, 325] },
];
const byId = new Map(units.map((u) => [u.id, u]));

test('ORDR 2.314 data patch updates recipe and skill metadata', () => {
  assert.equal(mapPatchData.mapVersion, '2.314');
  assert.equal(mapPatchData.updatedAt, '2026-08-15');
  assert.equal(allById.get(298).mate_ids.includes(367), false);
  assert.equal(allById.get(283).skills.includes('docking'), false);
  assert.equal(allById.get(283).skills.includes('mshield'), true);
  assert.equal(allById.get(114).name, '우솝 임팩트 다이얼');
  assert.equal(mapPatchData.units.length, 5);
  assert.ok(mapPatchData.units.every((patch) => !patch.notes));
  assert.equal(mapPatchData.units.find((patch) => patch.id === 305).rangeStun, 1);
  assert.equal(mapPatchData.units.find((patch) => patch.id === 306).rangeStun, 1);
});

test('reference range stun effects contain numeric values only', () => {
  const details = JSON.parse(fs.readFileSync(path.join(root, 'data', 'unit-details.json'), 'utf8'));
  const effects = details.flatMap((detail) => detail.referenceEffects || []);
  assert.ok(effects.length > 0);
  assert.ok(effects.every((effect) => effect.label === '범위 스턴'));
  assert.ok(effects.every((effect) => /^-?\d+(?:\.\d+)?$/.test(String(effect.value))));
  assert.equal(details.find((detail) => detail.id === 114).referenceEffects.find((effect) => effect.label === '범위 스턴').value, '0.17');
  assert.ok(details.find((detail) => detail.id === 114).tooltip.includes('범위 스턴\n스턴 수치 0.17'));
  assert.deepEqual(details.find((detail) => detail.id === 179).referenceEffects.find((effect) => effect.label === '범위 스턴'), {label:'범위 스턴',value:'1.1',enhancedValue:'1.8',source:'시온스 ORDR 2.310 개인용'});
  assert.ok(details.find((detail) => detail.id === 222).tooltip.includes('범위 스턴\n스턴 수치 0.8 (특강시 1.1)'));
  assert.ok(details.every((detail) => !detail.tooltip.includes('시온스 2.310 참고 특성')));
  assert.ok(details.every((detail) => !/범위\s*스턴\s*\(스턴\)/.test(detail.tooltip)));
  assert.ok(details.filter((detail) => detail.referenceEffects?.some((effect) => effect.label === '범위 스턴')).every((detail) => detail.tooltip.split('\n').includes('범위 스턴')));
});

test('zombie is excluded from special and calculation material sets', () => {
  assert.equal(core.SPECIAL_IDS.has(31), false);
  assert.equal(core.DEFAULT_EXCLUDED_IDS.has(31), true);
});

test('unlisted miscellaneous materials do not affect progress', () => {
  const otherUnits = [
    { id: 1, name: '루피', level: 1, group: '흔함', mate_ids: [] },
    { id: 188, name: '초월쿠마', level: 10, group: '기타', mate_ids: [] },
    { id: 500, name: '목표 유닛', level: 11, group: '불멸의', mate_ids: [1, 188] },
  ];
  const otherById = new Map(otherUnits.map((unit) => [unit.id, unit]));
  const result = core.analyzeRecipe(otherUnits[2], new Map([[1, 1]]), new Set(), new Set(), otherById);
  assert.equal(result.progress, 100);
  assert.equal(result.ready, true);
  assert.equal(result.materials.some((material) => material.id === 188), false);
});

test('default materials are excluded and special materials are counted', () => {
  const owned = new Map([[1, 2], [2, 1]]);
  const result = core.analyzeRecipe(units[4], owned, new Set(), new Set(), byId);
  assert.equal(result.missingTotal, 1);
  assert.equal(result.hasSpecial, true);
  assert.equal(result.materials.some((m) => m.id === 16), false);
});

test('manual material exclusion changes the calculation', () => {
  const owned = new Map([[1, 2], [2, 1]]);
  const result = core.analyzeRecipe(units[4], owned, new Set([325]), new Set(), byId);
  assert.equal(result.ready, true);
});

test('craft consumes materials and adds the result', () => {
  const owned = new Map([[1, 2], [2, 1], [325, 1]]);
  const result = core.analyzeRecipe(units[4], owned, new Set(), new Set(), byId);
  assert.equal(core.craft(result, owned), true);
  assert.equal(owned.get(1), 0);
  assert.equal(owned.get(100), 1);
});

test('selection wisp covers missing common materials and is consumed', () => {
  const owned = new Map([[1, 1], [2, 1], [325, 1], [core.WISP_ID, 1]]);
  const result = core.analyzeRecipe(units[4], owned, new Set(), new Set(), byId);
  assert.equal(result.ready, true);
  assert.equal(result.progress, 100);
  assert.equal(result.wispUsed, 1);
  assert.equal(core.craft(result, owned), true);
  assert.equal(owned.get(core.WISP_ID), 0);
});

test('selection wisps act as multiple common-unit wildcards', () => {
  const wildcardUnits = [
    { id: 3, name: '나미', level: 1, mate_ids: [] },
    { id: 38, name: '나미 크리마텍트', level: 3, mate_ids: [3, 3, 3] },
  ];
  const wildcardById = new Map(wildcardUnits.map((unit) => [unit.id, unit]));
  const owned = new Map([[3, 1], [core.WISP_ID, 2]]);
  const result = core.analyzeRecipe(wildcardUnits[1], owned, new Set(), new Set(), wildcardById);
  assert.equal(result.ready, true);
  assert.equal(result.progress, 100);
  assert.equal(result.wispUsed, 2);
  assert.equal(core.craft(result, owned), true);
  assert.equal(owned.get(3), 0);
  assert.equal(owned.get(core.WISP_ID), 0);
});

test('common units raise progress through every recipe tier', () => {
  const recursiveUnits = [
    { id: 1, name: '흔함', level: 1, mate_ids: [] },
    { id: 10, name: '특별함', level: 3, mate_ids: [1, 1] },
    { id: 20, name: '희귀함', level: 4, mate_ids: [10, 10] },
    { id: 30, name: '전설적인', level: 5, mate_ids: [20] },
  ];
  const recursiveById = new Map(recursiveUnits.map((unit) => [unit.id, unit]));
  const result = core.analyzeRecipe(recursiveUnits[3], new Map([[1, 1]]), new Set(), new Set(), recursiveById);
  assert.equal(result.progress, 25);
  assert.equal(result.ready, false);
});

test('owned intermediate units are consumed before their lower materials', () => {
  const recursiveUnits = [
    { id: 1, name: '흔함', level: 1, mate_ids: [] },
    { id: 10, name: '특별함', level: 3, mate_ids: [1, 1] },
    { id: 20, name: '희귀함', level: 4, mate_ids: [10, 10] },
  ];
  const recursiveById = new Map(recursiveUnits.map((unit) => [unit.id, unit]));
  const owned = new Map([[10, 1], [1, 2]]);
  const result = core.analyzeRecipe(recursiveUnits[2], owned, new Set(), new Set(), recursiveById);
  assert.equal(result.progress, 100);
  assert.equal(result.ready, true);
  assert.equal(core.craft(result, owned), true);
  assert.equal(owned.get(10), 0);
  assert.equal(owned.get(1), 0);
});

test('display metadata keeps source grouping and every unit has a local icon', () => {
  const display = displayData;
  assert.equal(display.length, 310);
  for (const id of core.SPECIAL_IDS) {
    const row = display.find((unit) => unit.id === id);
    assert.match(row.group, /^기타/);
  }
  assert.equal(display.filter((unit) => fs.existsSync(path.join(root, 'app', 'assets', 'units', `${unit.id}.png`))).length, 310);
});

test('local unit details contain tooltips and numeric combat effects', () => {
  const details = JSON.parse(fs.readFileSync(path.join(root, 'data', 'unit-details.json'), 'utf8'));
  assert.ok(details.length >= 290);
  assert.ok(details.filter((unit) => unit.tooltip).length >= 290);
  assert.ok(details.some((unit) => Number.isFinite(unit.armorReduction)));
  assert.ok(details.some((unit) => Number.isFinite(unit.slow)));
});

test('duplicate recipe materials preserve their required quantity', () => {
  const namiClimaTact = seedData.find((unit) => unit.id === 38);
  assert.equal(namiClimaTact.mate_ids.filter((id) => id === 3).length, 3);
});

test('candidate shortages are reported as lowest common materials', () => {
  const candidateUnits = [
    { id: 3, name: '나미', level: 1, group: '흔함', mate_ids: [] },
    { id: 38, name: '나미 크리마텍트', level: 3, group: '특별함', mate_ids: [3, 3, 3] },
  ];
  const candidateById = new Map(candidateUnits.map((unit) => [unit.id, unit]));
  const result = core.analyzeRecipe(candidateUnits[1], new Map(), new Set(), new Set(), candidateById);
  assert.equal(result.lackedMaterials.get(3), 3);
  assert.equal(result.missingTotal, 3);
});

test('every recipe references valid units without self references or cycles', () => {
  assert.equal(allUnits.length, allById.size);
  for (const unit of allUnits) {
    for (const materialId of unit.mate_ids) {
      assert.ok(allById.has(materialId), `${unit.name} has unknown material ${materialId}`);
      assert.notEqual(String(materialId), String(unit.id), `${unit.name} references itself`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(unit) {
    if (visited.has(unit.id)) return;
    assert.equal(visiting.has(unit.id), false, `${unit.name} has a cyclic recipe`);
    visiting.add(unit.id);
    unit.mate_ids.forEach((id) => visit(allById.get(id)));
    visiting.delete(unit.id);
    visited.add(unit.id);
  }
  allUnits.forEach(visit);
});

test('every complete recipe reaches 100 percent and crafts without negative inventory', () => {
  const recipes = allUnits.filter((unit) => unit.mate_ids.length);
  assert.equal(recipes.length, 247);

  for (const unit of recipes) {
    const empty = core.analyzeRecipe(unit, new Map(), new Set(), new Set(), allById);
    assert.ok(empty.materials.length > 0, `${unit.name} has no effective materials`);
    assert.ok(empty.progress >= 0 && empty.progress <= 100, `${unit.name} has invalid progress`);

    const owned = new Map(empty.materials.map(({ id, quantity }) => [id, quantity]));
    const complete = core.analyzeRecipe(unit, owned, new Set(), new Set(), allById);
    assert.equal(complete.progress, 100, `${unit.name} does not reach 100%`);
    assert.equal(complete.ready, true, `${unit.name} is not craftable with all materials`);
    assert.equal(core.craft(complete, owned), true, `${unit.name} craft was rejected`);
    assert.equal(owned.get(unit.id), 1, `${unit.name} result was not added`);
    for (const [id, count] of owned) assert.ok(count >= 0, `${unit.name} made material ${id} negative`);
  }
});

test('removing one required material prevents 100 percent completion', () => {
  for (const unit of allUnits.filter((candidate) => candidate.mate_ids.length)) {
    const empty = core.analyzeRecipe(unit, new Map(), new Set(), new Set(), allById);
    const owned = new Map(empty.materials.map(({ id, quantity }) => [id, quantity]));
    const removed = empty.materials[0];
    owned.set(removed.id, Math.max(0, removed.quantity - 1));
    const incomplete = core.analyzeRecipe(unit, owned, new Set(), new Set(), allById);
    assert.ok(incomplete.progress < 100, `${unit.name} reached 100% while missing ${removed.material?.name}`);
    assert.equal(incomplete.ready, false, `${unit.name} became craftable with a missing material`);
  }
});
