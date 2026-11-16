// The between-wave upgrades: a pool of stackable cards, three rolled at
// random each intermission. Each card knows its own level cap and how to
// apply itself to the world's player stats; the world owns the levels.

export const UPGRADE_POOL = [
  {
    id: 'split', name: 'Split Shot', max: 3,
    desc: '+1 projectile per shot, fanned out.',
    apply(stats) { stats.projectiles += 1; },
  },
  {
    id: 'rapid', name: 'Rapid Trigger', max: 5,
    desc: '+18% fire rate.',
    apply(stats) { stats.fireInterval *= 0.85; },
  },
  {
    id: 'heavy', name: 'Heavy Rounds', max: 5,
    desc: '+25% bullet damage.',
    apply(stats) { stats.bulletDamage *= 1.25; },
  },
  {
    id: 'thrusters', name: 'Ion Thrusters', max: 4,
    desc: '+12% move speed.',
    apply(stats) { stats.speed *= 1.12; },
  },
  {
    id: 'plating', name: 'Aegis Plating', max: 4,
    desc: '+30 max hull and repair 30 hull.',
    apply(stats) { stats.maxHp += 30; stats.hp = Math.min(stats.maxHp, stats.hp + 30); },
  },
  {
    id: 'mend', name: 'Core Mend', max: 5,
    desc: 'Restore 45 core integrity.',
    apply(stats, world) { world.core.hp = Math.min(world.core.maxHp, world.core.hp + 45); },
  },
  {
    id: 'magnet', name: 'Magnet Coil', max: 3,
    desc: '+60% shard pickup radius.',
    apply(stats) { stats.magnetRadius *= 1.6; },
  },
  {
    id: 'pierce', name: 'Piercing Rounds', max: 3,
    desc: 'Bullets punch through +1 enemy.',
    apply(stats) { stats.pierce += 1; },
  },
  {
    id: 'overclock', name: 'Overclock', max: 4,
    desc: '+15% bullet speed, +10% fire rate.',
    apply(stats) { stats.bulletSpeed *= 1.15; stats.fireInterval *= 0.91; },
  },
  {
    id: 'siphon', name: 'Shard Siphon', max: 3,
    desc: '+50% shards from kills.',
    apply(stats) { stats.shardBonus += 0.5; },
  },
  {
    id: 'surge', name: 'Combo Surge', max: 3,
    desc: 'Combo lasts +1s and pays +25% score.',
    apply(stats) { stats.comboWindow += 1; stats.comboScore += 0.25; },
  },
  {
    id: 'nova', name: 'Nova Shield', max: 2,
    desc: 'A shield that blocks one hit each wave.',
    apply(stats) { stats.shieldPerWave += 1; },
  },
];

/** Roll three distinct cards the player has not maxed out yet. */
export function rollUpgrades(random, levels) {
  const available = UPGRADE_POOL.filter((u) => (levels[u.id] || 0) < u.max);
  const picks = [];
  const bag = available.slice();
  while (picks.length < 3 && bag.length > 0) {
    const index = Math.floor(random.next() * bag.length);
    picks.push(bag.splice(index, 1)[0]);
  }
  // If nearly everything is maxed, top the offer up with a repair card.
  while (picks.length < 3) picks.push(UPGRADE_POOL.find((u) => u.id === 'mend'));
  return picks;
}

/** Apply a card to the world and record its level. */
export function applyUpgrade(card, world) {
  world.upgradeLevels[card.id] = (world.upgradeLevels[card.id] || 0) + 1;
  card.apply(world.player.stats, world);
}
