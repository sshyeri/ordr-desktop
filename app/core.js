(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ORDRCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SPECIAL_IDS = new Set([124, 144, 168, 304, 307, 322, 325, 332, 361]);
  const DEFAULT_EXCLUDED_IDS = new Set([16, 31, 184, 280, 286, 287, 301]);
  const WISP_ID = 'wisp';
  const LEVEL_PRIORITY = [1,2,3,4,5,6,7,8,9,10,18,11,12,14,15,19,20,22];

  function countMaterials(ids) {
    const counts = new Map();
    ids.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
    return counts;
  }

  function isExcludedMaterial(id, material, excludedIds, excludedLevels) {
    const group = String(material?.group || '').replace(/\s*\(\d+\)$/, '');
    return DEFAULT_EXCLUDED_IDS.has(id) || (group === '기타' && !SPECIAL_IDS.has(id)) || excludedIds.has(id) || (material && excludedLevels.has(material.level));
  }

  function analyzeRecipe(unit, owned, excludedIds = new Set(), excludedLevels = new Set(), byId = new Map()) {
    const required = countMaterials(unit.mate_ids || []);
    const materials = [];
    for (const [id, quantity] of required) {
      const material = byId.get(id);
      const excluded = isExcludedMaterial(id, material, excludedIds, excludedLevels);
      if (excluded) continue;
      const have = owned.get(id) || 0;
      const missing = Math.max(0, quantity - have);
      materials.push({ id, quantity, have, missing, coveredByWisp: 0, special: SPECIAL_IDS.has(id), material });
    }
    const plan = buildRecursivePlan(unit, owned, excludedIds, excludedLevels, byId);
    return {
      unit,
      materials,
      missingTotal: plan.missingTotal,
      ready: plan.total > 0 && plan.missingTotal === 0,
      progress: plan.total ? Math.floor((plan.covered / plan.total) * 100) : 0,
      hasSpecial: materials.some((m) => m.special),
      wispUsed: plan.wispUsed,
      consumption: plan.consumption,
      lackedMaterials: plan.lackedMaterials,
    };
  }

  function buildRecursivePlan(unit, owned, excludedIds, excludedLevels, byId) {
    const nodes = [];
    function makeNode(id, parent, visiting) {
      const material = byId.get(id);
      if (isExcludedMaterial(id, material, excludedIds, excludedLevels)) return null;
      const node = { id, material, parent, children: [], covered: false, weight: 0 };
      nodes.push(node);
      if (material?.mate_ids?.length && !visiting.has(id)) {
        const next = new Set(visiting); next.add(id);
        for (const childId of material.mate_ids) { const child = makeNode(childId, node, next); if (child) node.children.push(child); }
      }
      return node;
    }
    const roots = [];
    for (const id of unit.mate_ids || []) { const node = makeNode(id, null, new Set([unit.id])); if (node) roots.push(node); }
    function weight(node) { if (node.weight) return node.weight; node.weight = node.children.length ? node.children.reduce((sum, child) => sum + weight(child), 0) : 1; return node.weight; }
    roots.forEach(weight);
    const consumption = new Map();
    const inventory = [...owned].filter(([id, count]) => id !== WISP_ID && String(id) !== String(unit.id) && count > 0)
      .sort(([a], [b]) => (LEVEL_PRIORITY.indexOf(byId.get(b)?.level) - LEVEL_PRIORITY.indexOf(byId.get(a)?.level)));
    const ancestorCovered = (node) => { for (let parent = node.parent; parent; parent = parent.parent) if (parent.covered) return true; return false; };
    for (const [id, available] of inventory) {
      let remaining = available;
      for (const node of nodes) {
        if (remaining <= 0) break;
        if (String(node.id) !== String(id) || node.covered || ancestorCovered(node)) continue;
        node.covered = true; remaining -= 1; consumption.set(id, (consumption.get(id) || 0) + 1);
      }
    }
    let total = 0, covered = 0; const openLeaves = [];
    function measure(node) {
      total += weight(node);
      if (node.covered) { covered += weight(node); return; }
      if (node.children.length) node.children.forEach(measureChild);
      else openLeaves.push(node);
    }
    function measureChild(node) {
      if (node.covered) { covered += weight(node); return; }
      if (node.children.length) node.children.forEach(measureChild);
      else openLeaves.push(node);
    }
    roots.forEach(measure);
    let wispRemaining = owned.get(WISP_ID) || 0, wispUsed = 0; const lackedMaterials = new Map();
    for (const leaf of openLeaves) {
      if (leaf.material?.level === 1 && wispRemaining > 0) { wispRemaining -= 1; wispUsed += 1; covered += 1; continue; }
      lackedMaterials.set(leaf.id, (lackedMaterials.get(leaf.id) || 0) + 1);
    }
    if (wispUsed) consumption.set(WISP_ID, wispUsed);
    return { total, covered, missingTotal: total - covered, wispUsed, consumption, lackedMaterials };
  }

  function buildCandidates(units, owned, excludedIds, excludedLevels) {
    const byId = new Map(units.map((u) => [u.id, u]));
    return units.filter((u) => u.mate_ids?.length).map((u) => analyzeRecipe(u, owned, excludedIds, excludedLevels, byId))
      .sort((a, b) => Number(b.ready) - Number(a.ready) || a.missingTotal - b.missingTotal || b.progress - a.progress || b.unit.level - a.unit.level);
  }

  function canCraft(candidate, owned) {
    return candidate.missingTotal === 0 && candidate.materials.length > 0;
  }

  function craft(candidate, owned) {
    if (!canCraft(candidate, owned)) return false;
    if (candidate.consumption) candidate.consumption.forEach((count, id) => owned.set(id, Math.max(0, (owned.get(id) || 0) - count)));
    else candidate.materials.forEach((m) => { const actualUsed = Math.min(m.quantity, owned.get(m.id) || 0); owned.set(m.id, (owned.get(m.id) || 0) - actualUsed); });
    owned.set(candidate.unit.id, (owned.get(candidate.unit.id) || 0) + 1);
    return true;
  }

  return { SPECIAL_IDS, DEFAULT_EXCLUDED_IDS, WISP_ID, countMaterials, analyzeRecipe, buildCandidates, canCraft, craft };
});
