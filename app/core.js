(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ORDRCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SPECIAL_IDS = new Set([31, 124, 144, 168, 304, 307, 322, 325, 332, 361]);
  const DEFAULT_EXCLUDED_IDS = new Set([16, 184, 280, 286, 287, 301]);

  function countMaterials(ids) {
    const counts = new Map();
    ids.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
    return counts;
  }

  function analyzeRecipe(unit, owned, excludedIds = new Set(), excludedLevels = new Set(), byId = new Map()) {
    const required = countMaterials(unit.mate_ids || []);
    const materials = [];
    let requiredTotal = 0;
    let availableTotal = 0;
    let missingTotal = 0;
    for (const [id, quantity] of required) {
      const material = byId.get(id);
      const excluded = DEFAULT_EXCLUDED_IDS.has(id) || excludedIds.has(id) || (material && excludedLevels.has(material.level));
      if (excluded) continue;
      const have = owned.get(id) || 0;
      const missing = Math.max(0, quantity - have);
      requiredTotal += quantity;
      availableTotal += Math.min(quantity, have);
      missingTotal += missing;
      materials.push({ id, quantity, have, missing, special: SPECIAL_IDS.has(id), material });
    }
    return {
      unit,
      materials,
      missingTotal,
      ready: missingTotal === 0 && materials.length > 0,
      progress: requiredTotal ? Math.round((availableTotal / requiredTotal) * 100) : 0,
      hasSpecial: materials.some((m) => m.special),
    };
  }

  function buildCandidates(units, owned, excludedIds, excludedLevels) {
    const byId = new Map(units.map((u) => [u.id, u]));
    return units.filter((u) => u.mate_ids?.length).map((u) => analyzeRecipe(u, owned, excludedIds, excludedLevels, byId))
      .sort((a, b) => Number(b.ready) - Number(a.ready) || a.missingTotal - b.missingTotal || b.progress - a.progress || b.unit.level - a.unit.level);
  }

  function canCraft(candidate, owned) {
    return candidate.materials.every((m) => (owned.get(m.id) || 0) >= m.quantity);
  }

  function craft(candidate, owned) {
    if (!canCraft(candidate, owned)) return false;
    candidate.materials.forEach((m) => owned.set(m.id, (owned.get(m.id) || 0) - m.quantity));
    owned.set(candidate.unit.id, (owned.get(candidate.unit.id) || 0) + 1);
    return true;
  }

  return { SPECIAL_IDS, DEFAULT_EXCLUDED_IDS, countMaterials, analyzeRecipe, buildCandidates, canCraft, craft };
});
