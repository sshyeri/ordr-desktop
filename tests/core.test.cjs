const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../app/core.js');

const units = [
  { id: 1, name: '루피', level: 1, mate_ids: [] },
  { id: 2, name: '조로', level: 1, mate_ids: [] },
  { id: 16, name: '목재', level: 14, mate_ids: [] },
  { id: 325, name: '불사조의 깃털', level: 14, mate_ids: [] },
  { id: 100, name: '결과', level: 5, mate_ids: [1, 1, 2, 16, 325] },
];
const byId = new Map(units.map((u) => [u.id, u]));

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
  const root = path.join(__dirname, '..');
  const display = JSON.parse(fs.readFileSync(path.join(root, 'data', 'unit-display.json'), 'utf8'));
  assert.equal(display.length, 310);
  for (const id of core.SPECIAL_IDS) {
    const row = display.find((unit) => unit.id === id);
    assert.match(row.group, /^기타/);
  }
  assert.equal(display.filter((unit) => fs.existsSync(path.join(root, 'app', 'assets', 'units', `${unit.id}.png`))).length, 310);
});

test('local unit details contain tooltips and numeric combat effects', () => {
  const root = path.join(__dirname, '..');
  const details = JSON.parse(fs.readFileSync(path.join(root, 'data', 'unit-details.json'), 'utf8'));
  assert.ok(details.length >= 290);
  assert.ok(details.filter((unit) => unit.tooltip).length >= 290);
  assert.ok(details.some((unit) => Number.isFinite(unit.armorReduction)));
  assert.ok(details.some((unit) => Number.isFinite(unit.slow)));
});

test('duplicate recipe materials preserve their required quantity', () => {
  const root = path.join(__dirname, '..');
  const seed = JSON.parse(fs.readFileSync(path.join(root, 'data', 'units.seed.json'), 'utf8'));
  const namiClimaTact = seed.find((unit) => unit.id === 38);
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
