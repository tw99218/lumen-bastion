// Lumen Bastion — the simulation: one guardian, one Ember Core, and the
// waves that come for it. Everything here is pure logic over a fixed step;
// drawing lives in render.js, sound in audio.js. The world never reads
// Math.random or the clock: all chance comes from its seeded random source,
// so a fixed seed replays the same game.

import {
  FIELD, STEP, CORE, PLAYER, ENEMY, HP_PER_WAVE, FINAL_WAVE, BOSS_EVERY,
  waveRoster, spawnInterval, COMBO, SHARD,
} from './config.js';
import { rollUpgrades, applyUpgrade } from './upgrades.js';

export const EVENT_NONE = 0;
export const EVENT_CORE_HIT = 1;
export const EVENT_PLAYER_HIT = 2;
export const EVENT_OVER = 4;
export const EVENT_WAVE_CLEAR = 8;
export const EVENT_VICTORY = 16;
export const EVENT_BOSS = 32;
export const EVENT_KILL = 64;
export const EVENT_SHARD = 128;

/** A silent stand-in for audio, used by the deterministic screenshot runs. */
export const NULL_AUDIO = new Proxy({}, { get: () => () => {} });

function baseStats() {
  return {
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    speed: PLAYER.speed,
    fireInterval: PLAYER.fireInterval,
    bulletSpeed: PLAYER.bulletSpeed,
    bulletDamage: PLAYER.bulletDamage,
    bulletRadius: PLAYER.bulletRadius,
    projectiles: 1,
    pierce: 0,
    magnetRadius: PLAYER.magnetRadius,
    shardBonus: 0,
    comboWindow: COMBO.window,
    comboScore: 0,
    shieldPerWave: 0,
  };
}

export function createWorld(random, audio) {
  const state = {
    time: 0,
    phase: 'title', // title | wave | intermission | over
    victory: false,
    wave: 0,
    score: 0,
    combo: 0,
    comboTimer: 0,
    multiplier: 1,
    shards: 0,
    kills: 0,
    shotsFired: 0,
    hits: 0,
    core: { x: CORE.x, y: CORE.y, radius: CORE.radius, hp: CORE.maxHp, maxHp: CORE.maxHp, flash: 0 },
    player: {
      x: FIELD.width / 2, y: FIELD.height - 130, aim: -Math.PI / 2,
      radius: PLAYER.radius,
      fireTimer: 0, invuln: 0, shield: 0, stats: baseStats(),
    },
    enemies: [],
    bullets: [],
    enemyBullets: [],
    particles: [],
    texts: [],
    drops: [],
    spawnQueue: [],
    spawnTimer: 0,
    spawned: 0,
    totalToSpawn: 0,
    offer: null,
    upgradeLevels: {},
    shake: 0,
    banner: null,
    bannerTimer: 0,
    wavesCleared: 0,
    best: 0,
  };

  function reset() {
    random.reset();
    state.time = 0;
    state.phase = 'title';
    state.victory = false;
    state.wave = 0;
    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.multiplier = 1;
    state.shards = 0;
    state.kills = 0;
    state.shotsFired = 0;
    state.hits = 0;
    state.core.hp = CORE.maxHp;
    state.core.flash = 0;
    state.player.x = FIELD.width / 2;
    state.player.y = FIELD.height - 130;
    state.player.aim = -Math.PI / 2;
    state.player.radius = PLAYER.radius;
    state.player.fireTimer = 0;
    state.player.invuln = 0;
    state.player.shield = 0;
    state.player.stats = baseStats();
    state.enemies.length = 0;
    state.bullets.length = 0;
    state.enemyBullets.length = 0;
    state.particles.length = 0;
    state.texts.length = 0;
    state.drops.length = 0;
    state.spawnQueue.length = 0;
    state.spawnTimer = 0;
    state.spawned = 0;
    state.totalToSpawn = 0;
    state.offer = null;
    state.upgradeLevels = {};
    state.shake = 0;
    state.banner = null;
    state.bannerTimer = 0;
    state.wavesCleared = 0;
  }

  function showBanner(text, sub) {
    state.banner = { text, sub: sub || '' };
    state.bannerTimer = 2.6;
  }

  /** Queue wave `n` without changing the phase: the title demo uses this. */
  function primeWave(n) {
    state.wave = n;
    state.player.shield = state.player.stats.shieldPerWave;
    const roster = waveRoster(n);
    // Shuffle the roster, boss last so the wave builds to it.
    const boss = roster.filter((k) => k === 'boss');
    const rest = roster.filter((k) => k !== 'boss');
    for (let i = rest.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random.next() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    state.spawnQueue = rest.concat(boss);
    state.spawned = 0;
    state.totalToSpawn = state.spawnQueue.length;
    state.spawnTimer = 0.8;
    if (boss.length > 0) {
      audio.boss();
      showBanner(`WAVE ${n} — WARDEN OF THE DARK`, 'A boss approaches. Hold the line.');
    } else {
      audio.waveStart();
      showBanner(`WAVE ${n}`, n === FINAL_WAVE ? 'The final wave.' : 'Defend the Ember Core.');
    }
  }

  function startWave(n) {
    primeWave(n);
    state.phase = 'wave';
  }

  function startGame() {
    reset();
    startWave(1);
  }

  function openIntermission() {
    state.phase = 'intermission';
    state.wavesCleared += 1;
    state.offer = rollUpgrades(random, state.upgradeLevels);
    state.score += 100 * state.wave; // wave-clear bonus
    state.core.hp = Math.min(state.core.maxHp, state.core.hp + 15); // the core rekindles
    audio.upgrade();
  }

  function chooseUpgrade(index) {
    if (state.phase !== 'intermission' || !state.offer) return false;
    const card = state.offer[index];
    if (!card) return false;
    applyUpgrade(card, state);
    state.offer = null;
    startWave(state.wave + 1);
    return true;
  }

  function rerollOffer() {
    if (state.phase !== 'intermission' || !state.offer) return false;
    if (state.shards < SHARD.rerollCost) return false;
    state.shards -= SHARD.rerollCost;
    state.offer = rollUpgrades(random, state.upgradeLevels);
    return true;
  }

  function addText(x, y, text, color, size) {
    state.texts.push({ x, y, vy: -46, life: 1.1, maxLife: 1.1, text, color, size: size || 16 });
  }

  function burst(x, y, color, count, speed, size) {
    for (let i = 0; i < count; i += 1) {
      const a = random.next() * Math.PI * 2;
      const s = speed * (0.3 + random.next() * 0.7);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.4 + random.next() * 0.5, maxLife: 0.9,
        size: size * (0.6 + random.next() * 0.8), color,
      });
    }
  }

  function addShake(amount) {
    state.shake = Math.min(18, state.shake + amount);
  }

  function damageCore(amount) {
    state.core.hp -= amount;
    state.core.flash = 1;
    addShake(7);
    audio.coreHit();
    burst(state.core.x, state.core.y, '#ff5d7a', 10, 190, 3);
  }

  function damagePlayer(amount) {
    const p = state.player;
    if (p.invuln > 0) return EVENT_NONE;
    if (p.shield > 0) {
      p.shield -= 1;
      p.invuln = 0.8;
      addText(p.x, p.y - 26, 'SHIELD BLOCK', '#37e6ff', 15);
      audio.hit();
      return EVENT_PLAYER_HIT;
    }
    p.stats.hp -= amount;
    p.invuln = PLAYER.invulnerable;
    addShake(9);
    audio.playerHit();
    burst(p.x, p.y, '#ff5d7a', 14, 220, 3);
    if (p.stats.hp <= 0) {
      p.stats.hp = 0;
      return EVENT_OVER;
    }
    return EVENT_PLAYER_HIT;
  }

  function spawnPoint() {
    // Anywhere on the arena edge, at least 220 away from the player.
    for (let tries = 0; tries < 12; tries += 1) {
      const side = Math.floor(random.next() * 4);
      let x;
      let y;
      if (side === 0) { x = random.range(40, FIELD.width - 40); y = 40; }
      else if (side === 1) { x = random.range(40, FIELD.width - 40); y = FIELD.height - 40; }
      else if (side === 2) { x = 40; y = random.range(40, FIELD.height - 40); }
      else { x = FIELD.width - 40; y = random.range(40, FIELD.height - 40); }
      const dx = x - state.player.x;
      const dy = y - state.player.y;
      if (dx * dx + dy * dy > 220 * 220) return { x, y };
    }
    return { x: 40, y: 40 };
  }

  function spawnEnemy(kind) {
    const def = ENEMY[kind];
    const at = spawnPoint();
    const hpScale = 1 + HP_PER_WAVE * (state.wave - 1);
    const bossScale = kind === 'boss' ? 1 + 0.35 * (Math.floor(state.wave / BOSS_EVERY) - 1) : 1;
    const enemy = {
      kind,
      x: at.x, y: at.y,
      vx: 0, vy: 0,
      radius: def.radius,
      hp: def.hp * hpScale * bossScale,
      maxHp: def.hp * hpScale * bossScale,
      speed: def.speed + (def.speedPerWave || 0) * (state.wave - 1),
      fireTimer: random.range(1, def.fireInterval || 2),
      burstTimer: 2,
      spawnTimer: 4,
      chewTimer: 0,
      flash: 0,
      wobble: random.next() * Math.PI * 2,
    };
    state.enemies.push(enemy);
  }

  /** One kill, scored only when the guardian's fire did it: a hostile that
   * spends itself on the core pays no score and drops no shards. */
  function killEnemy(enemy, byPlayer = true) {
    const def = ENEMY[enemy.kind];
    if (byPlayer) {
      state.kills += 1;
      state.combo += 1;
      state.comboTimer = state.player.stats.comboWindow;
      state.multiplier = Math.min(COMBO.maxMultiplier, 1 + Math.floor(state.combo / COMBO.perStep));
      const gained = Math.round(def.score * state.multiplier * (1 + state.player.stats.comboScore));
      state.score += gained;
      addText(enemy.x, enemy.y - enemy.radius - 6, `+${gained}`, '#ffe066', 15);
      const count = Math.round(random.int(def.shards[0], def.shards[1]) * (1 + state.player.stats.shardBonus));
      for (let i = 0; i < count; i += 1) {
        const a = random.next() * Math.PI * 2;
        state.drops.push({
          x: enemy.x, y: enemy.y,
          vx: Math.cos(a) * 90, vy: Math.sin(a) * 90,
          life: SHARD.life, value: 1,
        });
      }
    }
    burst(enemy.x, enemy.y, def.color, enemy.kind === 'boss' ? 60 : 22, enemy.kind === 'boss' ? 320 : 240, 3.5);
    burst(enemy.x, enemy.y, '#ffffff', 6, 160, 2);
    addShake(enemy.kind === 'boss' ? 14 : 3);
    audio.explode(enemy.kind === 'boss' || enemy.kind === 'bulwark');
  }

  /** Drip the queued wave out on its timer; shared by play and the demo. */
  function spawnStep(dt) {
    if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnEnemy(state.spawnQueue.shift());
        state.spawned += 1;
        state.spawnTimer = spawnInterval(state.wave, state.spawned, state.totalToSpawn);
      }
    }
  }

  function firePlayerBullets() {
    const p = state.player;
    const s = p.stats;
    const n = s.projectiles;
    const spread = 0.13;
    for (let i = 0; i < n; i += 1) {
      const off = (i - (n - 1) / 2) * spread;
      const a = p.aim + off;
      state.bullets.push({
        x: p.x + Math.cos(p.aim) * (p.radius + 6),
        y: p.y + Math.sin(p.aim) * (p.radius + 6),
        vx: Math.cos(a) * s.bulletSpeed,
        vy: Math.sin(a) * s.bulletSpeed,
        damage: s.bulletDamage,
        pierce: s.pierce,
        radius: s.bulletRadius,
        life: BULLET_LIFE,
      });
    }
    state.shotsFired += n;
    p.fireTimer = s.fireInterval;
    audio.shoot();
    burst(p.x + Math.cos(p.aim) * 22, p.y + Math.sin(p.aim) * 22, '#aef4ff', 2, 90, 2);
  }

  const BULLET_LIFE = 1.4;

  function updatePlayer(dt, input) {
    const p = state.player;
    const s = p.stats;
    if (input.move) {
      p.x += input.move.x * s.speed * dt;
      p.y += input.move.y * s.speed * dt;
    }
    p.x = Math.max(24, Math.min(FIELD.width - 24, p.x));
    p.y = Math.max(24, Math.min(FIELD.height - 24, p.y));
    p.aim = Math.atan2(input.aim.y - p.y, input.aim.x - p.x);
    if (p.fireTimer > 0) p.fireTimer -= dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (input.firing && p.fireTimer <= 0) firePlayerBullets();
  }

  function updateEnemies(dt) {
    const c = state.core;
    const p = state.player;
    let events = EVENT_NONE;
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      const def = ENEMY[e.kind];
      if (e.flash > 0) e.flash -= dt * 6;
      const dxC = c.x - e.x;
      const dyC = c.y - e.y;
      const distC = Math.hypot(dxC, dyC) || 1;
      const dxP = p.x - e.x;
      const dyP = p.y - e.y;
      const distP = Math.hypot(dxP, dyP) || 1;

      if (e.kind === 'darter') {
        // Chase the core; veer onto the guardian when close.
        const tx = distP < 120 ? dxP / distP : dxC / distC;
        const ty = distP < 120 ? dyP / distP : dyC / distC;
        e.vx = tx * e.speed;
        e.vy = ty * e.speed;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (distC < c.radius + e.radius) {
          killEnemy(e, false);
          state.enemies.splice(i, 1);
          damageCore(def.contactDamage);
          events |= EVENT_CORE_HIT;
          continue;
        }
        if (distP < p.radius + e.radius) {
          killEnemy(e, false);
          state.enemies.splice(i, 1);
          events |= damagePlayer(def.contactDamage);
          if (events & EVENT_OVER) return events;
          continue;
        }
      } else if (e.kind === 'spitter') {
        // Hold range from the core and spit globs at it (or the guardian).
        const want = distC > def.holdRange ? 1 : -0.4;
        e.vx = (dxC / distC) * e.speed * want;
        e.vy = (dyC / distC) * e.speed * want;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.fireTimer -= dt;
        if (e.fireTimer <= 0) {
          e.fireTimer = def.fireInterval * random.range(0.9, 1.2);
          const target = distP < 240 ? p : c;
          const a = Math.atan2(target.y - e.y, target.x - e.x);
          state.enemyBullets.push({
            x: e.x, y: e.y,
            vx: Math.cos(a) * def.globSpeed, vy: Math.sin(a) * def.globSpeed,
            damage: def.globDamage, radius: 7, life: 5, color: '#ff9d5c',
          });
          burst(e.x, e.y, '#ff9d5c', 3, 80, 2);
        }
        if (distP < p.radius + e.radius) {
          events |= damagePlayer(def.contactDamage);
          if (events & EVENT_OVER) return events;
          e.x -= (dxP / distP) * 30;
          e.y -= (dyP / distP) * 30;
        }
      } else if (e.kind === 'bulwark') {
        // Plod at the core and chew on it once latched.
        e.vx = (dxC / distC) * e.speed;
        e.vy = (dyC / distC) * e.speed;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (distC < c.radius + e.radius + 2) {
          e.chewTimer -= dt;
          if (e.chewTimer <= 0) {
            e.chewTimer = 1;
            damageCore(6);
            events |= EVENT_CORE_HIT;
          }
        }
        if (distP < p.radius + e.radius) {
          events |= damagePlayer(def.contactDamage);
          if (events & EVENT_OVER) return events;
          e.x -= (dxP / distP) * 26;
          e.y -= (dyP / distP) * 26;
        }
      } else if (e.kind === 'boss') {
        e.wobble += dt * 1.4;
        e.vx = (dxC / distC) * e.speed;
        e.vy = (dyC / distC) * e.speed;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.burstTimer -= dt;
        if (e.burstTimer <= 0) {
          e.burstTimer = def.burstInterval;
          for (let k = 0; k < def.burstCount; k += 1) {
            const a = (k / def.burstCount) * Math.PI * 2 + e.wobble;
            state.enemyBullets.push({
              x: e.x, y: e.y,
              vx: Math.cos(a) * def.globSpeed, vy: Math.sin(a) * def.globSpeed,
              damage: def.globDamage, radius: 8, life: 6, color: '#ffd75e',
            });
          }
          audio.explode(false);
        }
        e.spawnTimer -= dt;
        if (e.spawnTimer <= 0) {
          e.spawnTimer = def.spawnInterval;
          for (let k = 0; k < def.spawnCount; k += 1) {
            const at = spawnPoint();
            state.enemies.push({
              kind: 'darter', x: at.x, y: at.y, vx: 0, vy: 0,
              radius: ENEMY.darter.radius,
              hp: ENEMY.darter.hp * (1 + HP_PER_WAVE * (state.wave - 1)),
              maxHp: ENEMY.darter.hp * (1 + HP_PER_WAVE * (state.wave - 1)),
              speed: ENEMY.darter.speed, fireTimer: 0, burstTimer: 0,
              spawnTimer: 0, chewTimer: 0, flash: 0, wobble: 0,
            });
          }
          addText(e.x, e.y - 60, 'THE WARDEN CALLS', '#ffd75e', 16);
        }
        if (distC < c.radius + e.radius) {
          e.chewTimer -= dt;
          if (e.chewTimer <= 0) {
            e.chewTimer = 1;
            damageCore(5);
            events |= EVENT_CORE_HIT;
          }
        }
        if (distP < p.radius + e.radius) {
          events |= damagePlayer(def.contactDamage);
          if (events & EVENT_OVER) return events;
        }
      }

      // Gentle separation so enemies do not stack on one point.
      for (let j = i - 1; j >= 0; j -= 1) {
        const o = state.enemies[j];
        const dx = e.x - o.x;
        const dy = e.y - o.y;
        const d = Math.hypot(dx, dy);
        const min = e.radius + o.radius;
        if (d > 0 && d < min) {
          const push = (min - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          e.x += nx * push;
          e.y += ny * push;
          o.x -= nx * push;
          o.y -= ny * push;
        }
      }
      e.x = Math.max(e.radius, Math.min(FIELD.width - e.radius, e.x));
      e.y = Math.max(e.radius, Math.min(FIELD.height - e.radius, e.y));
    }
    return events;
  }

  function updateBullets(dt) {
    let events = EVENT_NONE;
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < 0 || b.x > FIELD.width || b.y < 0 || b.y > FIELD.height;
      if (!dead) {
        // Guardian fire can shoot enemy globs out of the air.
        for (let k = state.enemyBullets.length - 1; k >= 0; k -= 1) {
          const g = state.enemyBullets[k];
          const dx = g.x - b.x;
          const dy = g.y - b.y;
          const r = g.radius + b.radius;
          if (dx * dx + dy * dy < r * r) {
            state.enemyBullets.splice(k, 1);
            burst(b.x, b.y, '#ff9d5c', 4, 120, 2);
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
          const e = state.enemies[j];
          const dx = e.x - b.x;
          const dy = e.y - b.y;
          const r = e.radius + b.radius;
          if (dx * dx + dy * dy < r * r) {
            const armor = e.kind === 'bulwark' ? ENEMY.bulwark.armor : 0;
            e.hp -= b.damage * (1 - armor);
            e.flash = 1;
            state.hits += 1;
            audio.hit();
            burst(b.x, b.y, '#aef4ff', 3, 120, 2);
            if (e.hp <= 0) {
              killEnemy(e);
              state.enemies.splice(j, 1);
              events |= EVENT_KILL;
            }
            if (b.pierce > 0) {
              b.pierce -= 1;
            } else {
              dead = true;
            }
            break;
          }
        }
      }
      if (dead) state.bullets.splice(i, 1);
    }
    return events;
  }

  function updateEnemyBullets(dt) {
    const c = state.core;
    const p = state.player;
    let events = EVENT_NONE;
    for (let i = state.enemyBullets.length - 1; i >= 0; i -= 1) {
      const b = state.enemyBullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20;
      if (!dead) {
        const dxC = b.x - c.x;
        const dyC = b.y - c.y;
        const rC = c.radius + b.radius;
        if (dxC * dxC + dyC * dyC < rC * rC) {
          damageCore(b.damage);
          events |= EVENT_CORE_HIT;
          dead = true;
        }
        if (!dead && p.invuln <= 0) {
          const dxP = b.x - p.x;
          const dyP = b.y - p.y;
          const rP = p.radius + b.radius;
          if (dxP * dxP + dyP * dyP < rP * rP) {
            events |= damagePlayer(b.damage);
            dead = true;
            if (events & EVENT_OVER) return events;
          }
        }
      }
      if (dead) state.enemyBullets.splice(i, 1);
    }
    return events;
  }

  function updateDrops(dt) {
    const p = state.player;
    for (let i = state.drops.length - 1; i >= 0; i -= 1) {
      const d = state.drops[i];
      d.life -= dt;
      const dx = p.x - d.x;
      const dy = p.y - d.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < p.stats.magnetRadius) {
        const pull = 620 * (1 - dist / (p.stats.magnetRadius + 40));
        d.vx += (dx / dist) * pull * dt * 6;
        d.vy += (dy / dist) * pull * dt * 6;
      }
      d.vx *= 0.92;
      d.vy *= 0.92;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (dist < p.radius + 12) {
        state.drops.splice(i, 1);
        state.shards += d.value;
        state.score += SHARD.score * d.value;
        audio.shard();
        burst(d.x, d.y, '#ffe066', 3, 100, 2);
        continue;
      }
      if (d.life <= 0) state.drops.splice(i, 1);
    }
  }

  function updateFx(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.96;
      pt.vy *= 0.96;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.texts.length - 1; i >= 0; i -= 1) {
      const t = state.texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      if (t.life <= 0) state.texts.splice(i, 1);
    }
    if (state.core.flash > 0) state.core.flash -= dt * 3;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 34);
    if (state.bannerTimer > 0) state.bannerTimer -= dt;
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.combo = 0;
        state.multiplier = 1;
      }
    }
  }

  /**
   * A simple pilot: orbit the core, hold ~260 from the nearest hostile, and
   * fire at where it will be when the bullet arrives (target leading).
   */
  function autopilot() {
    const p = state.player;
    // The Warden outranks everything; spitters outrank darters, because
    // their shells are what kill the core from range. When the core is
    // hurting, defend it directly: hunt what is closest to the core.
    let target = null;
    if (state.core.hp < 40) {
      let bestD = Infinity;
      for (const e of state.enemies) {
        const d = Math.hypot(e.x - state.core.x, e.y - state.core.y);
        if (d < bestD) { bestD = d; target = e; }
      }
    }
    if (!target) {
      for (const e of state.enemies) {
        if (e.kind === 'boss') { target = e; break; }
      }
    }
    if (!target) {
      for (const e of state.enemies) {
        if (e.kind === 'spitter') { target = e; break; }
      }
    }
    let nearest = target;
    let nearestD = target ? Math.hypot(target.x - p.x, target.y - p.y) : Infinity;
    if (!target) {
      for (const e of state.enemies) {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < nearestD) { nearestD = d; nearest = e; }
      }
    }
    const cx = FIELD.width / 2;
    const cy = FIELD.height / 2;
    const dxC = p.x - cx;
    const dyC = p.y - cy;
    const distC = Math.hypot(dxC, dyC) || 1;
    // Orbit tangent around the core, drifting back toward a 230 ring.
    let mx = (-dyC / distC) * 0.7 + (dxC / distC) * (distC > 260 ? -0.5 : distC < 200 ? 0.5 : 0);
    let my = (dxC / distC) * 0.7 + (dyC / distC) * (distC > 260 ? -0.5 : distC < 200 ? 0.5 : 0);
    if (nearest) {
      // Hold range: close in past 300, back off inside 180.
      const toward = nearestD > 300 ? 1 : nearestD < 180 ? -1 : 0;
      mx += ((nearest.x - p.x) / nearestD) * toward * 0.9;
      my += ((nearest.y - p.y) / nearestD) * toward * 0.9;
      // Flee anything about to touch the guardian.
      if (nearestD < 110) {
        mx += (p.x - nearest.x) / nearestD;
        my += (p.y - nearest.y) / nearestD;
      }
    }
    const len = Math.hypot(mx, my);
    const move = len > 0.01 ? { x: mx / len, y: my / len } : null;
    let aim = { x: cx, y: cy - 200 };
    if (nearest) {
      const flight = nearestD / p.stats.bulletSpeed;
      aim = {
        x: nearest.x + (nearest.vx || 0) * flight,
        y: nearest.y + (nearest.vy || 0) * flight,
      };
    }
    return { move, aim, firing: nearest !== null };
  }

  /**
   * Advance the world one fixed step. `input` is { move, aim, firing } in
   * field coordinates, or { autopilot: true } for the demo pilot.
   * Returns an events bitmask.
   */
  function step(dt, input) {
    state.time += dt;
    let events = EVENT_NONE;
    if (state.phase === 'over') {
      updateFx(dt);
      return events;
    }
    const drive = input && input.autopilot ? autopilot() : input;
    if (state.phase === 'title') {
      // The attract demo: the pilot plays while the title sits on top.
      if (state.wave === 0) primeWave(1);
      spawnStep(dt);
      updatePlayer(dt, drive);
      events |= updateEnemies(dt);
      events |= updateBullets(dt);
      events |= updateEnemyBullets(dt);
      updateDrops(dt);
      updateFx(dt);
      if (state.core.hp <= 0 || state.player.stats.hp <= 0) {
        // The demo never ends: restore the field and keep showing it.
        reset();
        primeWave(1);
      } else if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
        primeWave(state.wave + 1 > FINAL_WAVE ? 1 : state.wave + 1);
      }
      return events;
    }
    if (state.phase === 'intermission') {
      updateFx(dt);
      return events;
    }
    // phase === 'wave'
    spawnStep(dt);
    updatePlayer(dt, drive);
    events |= updateEnemies(dt);
    if (events & EVENT_OVER) return finishOver(events);
    events |= updateBullets(dt);
    events |= updateEnemyBullets(dt);
    if (events & EVENT_OVER) return finishOver(events);
    updateDrops(dt);
    updateFx(dt);
    if (state.core.hp <= 0) {
      state.core.hp = 0;
      return finishOver(events | EVENT_OVER);
    }
    if (state.player.stats.hp <= 0) {
      return finishOver(events | EVENT_OVER);
    }
    if (state.spawnQueue.length === 0 && state.enemies.length === 0 && state.enemyBullets.length === 0) {
      if (state.wave >= FINAL_WAVE) {
        state.victory = true;
        return finishOver(events | EVENT_VICTORY);
      }
      openIntermission();
      events |= EVENT_WAVE_CLEAR;
    }
    return events;
  }

  function finishOver(events) {
    state.phase = 'over';
    if (state.victory) {
      audio.victory();
      burst(state.core.x, state.core.y, '#ffd75e', 80, 380, 4);
      burst(state.core.x, state.core.y, '#37e6ff', 60, 300, 4);
    } else {
      audio.defeat();
      burst(state.core.x, state.core.y, '#ff5d7a', 50, 300, 4);
      burst(state.player.x, state.player.y, '#ff5d7a', 40, 280, 4);
    }
    return events | EVENT_OVER;
  }

  return {
    state,
    reset,
    startGame,
    startWave,
    chooseUpgrade,
    rerollOffer,
    step,
    showBanner,
  };
}
