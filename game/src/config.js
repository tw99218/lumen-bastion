// Lumen Bastion — every tuning number and colour in one place.
// The playfield is a fixed 1280x800 logical area; the renderer scales it to
// the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 800 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** The last wave. Clearing it (and its boss) wins the game. */
export const FINAL_WAVE = 15;

/** Boss waves: every 5th wave ends in a boss. */
export const BOSS_EVERY = 5;

export const CORE = {
  x: FIELD.width / 2,
  y: FIELD.height / 2,
  radius: 34,
  maxHp: 140,
};

export const PLAYER = {
  radius: 16,
  speed: 305,
  maxHp: 100,
  fireInterval: 0.22,
  bulletSpeed: 640,
  bulletDamage: 12,
  bulletRadius: 5,
  invulnerable: 1.0,
  magnetRadius: 130,
};

export const BULLET = { life: 1.4 };

export const ENEMY = {
  darter: {
    radius: 13, hp: 18, speed: 155, speedPerWave: 7,
    contactDamage: 6, score: 50, shards: [1, 2], color: '#ff4fd8',
  },
  spitter: {
    radius: 15, hp: 30, speed: 82, speedPerWave: 4,
    contactDamage: 10, score: 80, shards: [2, 3], color: '#ffc233',
    holdRange: 300, fireInterval: 2.3, globSpeed: 185, globDamage: 10,
  },
  bulwark: {
    radius: 24, hp: 125, speed: 56, speedPerWave: 3,
    contactDamage: 14, score: 150, shards: [3, 4], color: '#bfe9ff',
    armor: 0.25,
  },
  boss: {
    radius: 46, hp: 600, hpPerBoss: 200, speed: 46,
    contactDamage: 25, score: 1000, shards: [14, 18], color: '#ffd75e',
    burstInterval: 3.1, burstCount: 12, globSpeed: 160, globDamage: 8,
    spawnInterval: 6.5, spawnCount: 3,
  },
};

/** Enemy hit points grow this much per wave, multiplicatively. */
export const HP_PER_WAVE = 0.09;

/** How a wave is built: counts of each enemy kind by wave number. */
export function waveRoster(wave) {
  const roster = [];
  const darters = 4 + wave * 2;
  const spitters = wave >= 2 ? Math.min(5, 1 + Math.floor(wave / 2)) : 0;
  const bulwarks = wave >= 3 ? Math.min(5, Math.floor((wave - 1) / 2)) : 0;
  for (let i = 0; i < darters; i += 1) roster.push('darter');
  for (let i = 0; i < spitters; i += 1) roster.push('spitter');
  for (let i = 0; i < bulwarks; i += 1) roster.push('bulwark');
  if (wave % BOSS_EVERY === 0) roster.push('boss');
  return roster;
}

/** Seconds between spawns at the start of a wave; shrinks as the wave goes on. */
export function spawnInterval(wave, spawned, total) {
  const base = Math.max(0.42, 0.95 - wave * 0.035);
  const progress = total > 0 ? spawned / total : 0;
  return base * (1 - 0.45 * progress);
}

export const COMBO = {
  /** Seconds a kill chain stays alive without another kill. */
  window: 2.5,
  /** Kills per multiplier step; multiplier caps at 8. */
  perStep: 5,
  maxMultiplier: 8,
};

export const SHARD = {
  /** Points each collected shard is worth. */
  score: 10,
  /** Shards needed to reroll the three upgrade cards. */
  rerollCost: 5,
  /** Seconds a dropped shard lies on the field before fading. */
  life: 12,
};

export const PALETTE = {
  backdrop: '#04081a',
  spaceA: '#050914',
  spaceB: '#0a1230',
  grid: 'rgba(64, 140, 255, 0.07)',
  wall: '#1c3a6e',
  wallGlow: '#3f8cff',
  core: '#ffd75e',
  coreRing: '#ffef9e',
  player: '#37e6ff',
  playerDark: '#0e7fa8',
  bullet: '#aef4ff',
  enemyBullet: '#ff9d5c',
  shard: '#ffe066',
  text: '#eef4ff',
  muted: '#8fa3c8',
  danger: '#ff5d7a',
  heal: '#5cff9d',
  panel: 'rgba(8, 16, 40, 0.88)',
  panelEdge: '#2c4d8f',
};

export const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'lumen-bastion.best';
