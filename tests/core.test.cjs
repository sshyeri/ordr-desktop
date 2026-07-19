const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../app/core.js');

const units = [
  { id: 1, name: '루피', level: 1, mate_ids: [] },
  { id: 2, name: '조로', level: 1, mate_ids: [] },
  { id: 16, name: '목재', level: 14, mate_ids: [] },
  { id: 325, name: '불사조의 깃털', level: 14, mate_ids: [] },
  { id: 100, name: '결과', level: 5, mate_ids: [1, 1, 2, 16, 325] },
];
const byId = new Map(units.map((u) => [u.id, u]));

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
