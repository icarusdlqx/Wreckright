function inventory(items) {
  const counts = new Map();
  for (const item of items) {
    const key = `${item.kind}:${item.itemId}`;
    counts.set(key, (counts.get(key) ?? 0) + item.count);
  }
  return [...counts].sort(([left], [right]) => left.localeCompare(right));
}

/** A victory can recover nothing; every recorded crate and hull must still reconcile. */
export function checkCampaignHaul({ before, after, check }) {
  const receipt = after.history.at(-1);
  const rewards = receipt.campaignRewards ?? [];
  const expected = inventory([...before.store, ...receipt.salvagedItems, ...rewards.flatMap(reward => reward.items)]);
  const actual = inventory(after.store);
  check('stores match the recorded salvage haul exactly',
    JSON.stringify(actual) === JSON.stringify(expected), JSON.stringify({ expected, actual }));

  const existingIds = new Set(before.mechs.map(mech => mech.id));
  const recovered = after.mechs.filter(mech => !existingIds.has(mech.id));
  const expectedHulls = [...receipt.salvagedChassis, ...rewards.flatMap(reward => reward.hulls.map(hull => hull.designId))].sort();
  const actualHulls = recovered.map(mech => mech.design.id).sort();
  check('recovered hulks match the receipt without duplicating their loose weapons',
    JSON.stringify(actualHulls) === JSON.stringify(expectedHulls)
    && recovered.every(mech => mech.status === 'hulk' && mech.design.mounts.length === 0
      && mech.design.ammo.length === 0 && mech.design.equipment.length === 0),
    JSON.stringify({ expectedHulls, recovered }));
}
