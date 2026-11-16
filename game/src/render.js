// Lumen Bastion — everything on screen: the arena, the core, the ships,
// the particles, the HUD and the four screens. Drawing is a pure function
// of the world state plus the screen name, so the same state always paints
// the same frame (the shake offset is a sine of the world's own clock, not
// a fresh random draw).

import { FIELD, PALETTE, FONT, FINAL_WAVE, ENEMY } from './config.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

// The star field never changes: fixed seed, generated once.
const STARS = (() => {
  const rng = createRandom(20261116);
  const stars = [];
  for (let i = 0; i < 110; i += 1) {
    stars.push({ x: rng.range(0, FIELD.width), y: rng.range(0, FIELD.height), r: rng.range(0.6, 2.1), tw: rng.range(0.4, 1.6) });
  }
  return stars;
})();

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function glowCircle(ctx, x, y, radius, color, blur) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, ox: 0, oy: 0, w: FIELD.width, h: FIELD.height };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || FIELD.width;
    const h = canvas.clientHeight || FIELD.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    view.w = w;
    view.h = h;
    view.scale = Math.min(w / FIELD.width, h / FIELD.height);
    view.ox = (w - FIELD.width * view.scale) / 2;
    view.oy = (h - FIELD.height * view.scale) / 2;
    view.dpr = dpr;
  }

  function screenToWorld(px, py) {
    return { x: (px - view.ox) / view.scale, y: (py - view.oy) / view.scale };
  }

  function drawBackground(state) {
    const g = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    g.addColorStop(0, PALETTE.spaceA);
    g.addColorStop(1, PALETTE.spaceB);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    for (const s of STARS) {
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(state.time * s.tw + s.x));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#cfe4ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = PALETTE.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 80; x < FIELD.width; x += 80) { ctx.moveTo(x, 0); ctx.lineTo(x, FIELD.height); }
    for (let y = 80; y < FIELD.height; y += 80) { ctx.moveTo(0, y); ctx.lineTo(FIELD.width, y); }
    ctx.stroke();
    // Arena wall: a glowing rounded frame.
    ctx.save();
    ctx.strokeStyle = PALETTE.wall;
    ctx.shadowColor = PALETTE.wallGlow;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 3;
    rr(ctx, 14, 14, FIELD.width - 28, FIELD.height - 28, 26);
    ctx.stroke();
    ctx.restore();
  }

  function drawCore(state) {
    const c = state.core;
    const pulse = 1 + 0.06 * Math.sin(state.time * 2.4);
    const hpFrac = Math.max(0, c.hp / c.maxHp);
    ctx.save();
    // Halo.
    const halo = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 150);
    halo.addColorStop(0, 'rgba(255, 215, 94, 0.28)');
    halo.addColorStop(1, 'rgba(255, 215, 94, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 150, 0, Math.PI * 2);
    ctx.fill();
    // Orbit ring.
    ctx.strokeStyle = 'rgba(255, 239, 158, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 14]);
    ctx.lineDashOffset = -state.time * 22;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.radius + 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Body.
    glowCircle(ctx, c.x, c.y, c.radius * pulse, c.flash > 0.3 ? '#ff5d7a' : PALETTE.core, 34);
    ctx.fillStyle = '#fff6c9';
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.radius * 0.45 * pulse, 0, Math.PI * 2);
    ctx.fill();
    // Integrity arc.
    ctx.strokeStyle = hpFrac > 0.35 ? PALETTE.heal : PALETTE.danger;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.radius + 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpFrac);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayer(state) {
    const p = state.player;
    const s = p.stats;
    if (p.invuln > 0 && Math.floor(state.time * 14) % 2 === 0) return; // blink while invulnerable
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.aim);
    ctx.shadowColor = PALETTE.player;
    ctx.shadowBlur = 20;
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(-14, 13);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-14, -13);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#eafcff';
    ctx.beginPath();
    ctx.arc(4, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (p.shield > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(55, 230, 255, 0.75)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.lineDashOffset = -state.time * 30;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // Hull pips under the ship.
    const frac = Math.max(0, s.hp / s.maxHp);
    ctx.save();
    ctx.fillStyle = 'rgba(8, 16, 40, 0.8)';
    rr(ctx, p.x - 22, p.y + 24, 44, 6, 3);
    ctx.fill();
    ctx.fillStyle = frac > 0.35 ? PALETTE.player : PALETTE.danger;
    rr(ctx, p.x - 21, p.y + 25, 42 * frac, 4, 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEnemy(e, state) {
    const def = ENEMY[e.kind];
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 16;
    if (e.flash > 0.25) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#ffffff';
    } else {
      ctx.fillStyle = def.color;
      ctx.strokeStyle = def.color;
    }
    if (e.kind === 'darter') {
      const a = Math.atan2(state.core.y - e.y, state.core.x - e.x);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-10, 10);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-10, -10);
      ctx.closePath();
      ctx.fill();
    } else if (e.kind === 'spitter') {
      ctx.beginPath();
      for (let k = 0; k < 6; k += 1) {
        const a = (k / 6) * Math.PI * 2 + state.time * 0.8;
        const px = Math.cos(a) * e.radius;
        const py = Math.sin(a) * e.radius;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#3a2400';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === 'bulwark') {
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-e.radius * 0.72, -e.radius * 0.72, e.radius * 1.44, e.radius * 1.44);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#0a1230';
      ctx.lineWidth = 3;
      ctx.strokeRect(-e.radius * 0.72, -e.radius * 0.72, e.radius * 1.44, e.radius * 1.44);
      ctx.fillStyle = '#0a1230';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Boss: a slow-turning eight-point warden star.
      ctx.rotate(e.wobble * 0.4);
      ctx.beginPath();
      for (let k = 0; k < 16; k += 1) {
        const a = (k / 16) * Math.PI * 2;
        const r = k % 2 === 0 ? e.radius : e.radius * 0.55;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#3a2400';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Health bar for anything hurt (boss always shows one).
    if (e.hp < e.maxHp || e.kind === 'boss') {
      const w = e.kind === 'boss' ? 90 : 34;
      const frac = Math.max(0, e.hp / e.maxHp);
      ctx.save();
      ctx.fillStyle = 'rgba(8, 16, 40, 0.85)';
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 14, w, 5);
      ctx.fillStyle = frac > 0.35 ? def.color : PALETTE.danger;
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 14, w * frac, 5);
      ctx.restore();
    }
  }

  function drawBullets(state) {
    ctx.save();
    for (const b of state.bullets) {
      glowCircle(ctx, b.x, b.y, b.radius + 1, PALETTE.bullet, 10);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const b of state.enemyBullets) {
      glowCircle(ctx, b.x, b.y, b.radius, b.color, 14);
    }
    ctx.restore();
  }

  function drawDrops(state) {
    ctx.save();
    for (const d of state.drops) {
      const blink = d.life < 3 ? (Math.floor(state.time * 6) % 2 === 0 ? 0.35 : 1) : 1;
      ctx.globalAlpha = blink;
      ctx.shadowColor = PALETTE.shard;
      ctx.shadowBlur = 10;
      ctx.fillStyle = PALETTE.shard;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(state.time * 3 + d.x);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawParticles(state) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const pt of state.particles) {
      const frac = Math.max(0, pt.life / pt.maxLife);
      ctx.globalAlpha = frac;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * frac + 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTexts(state) {
    ctx.save();
    ctx.textAlign = 'center';
    for (const t of state.texts) {
      const frac = Math.max(0, t.life / t.maxLife);
      ctx.globalAlpha = Math.min(1, frac * 1.6);
      ctx.font = `700 ${t.size}px ${FONT}`;
      ctx.fillStyle = t.color;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 8;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  function bar(x, y, w, h, frac, color, label) {
    ctx.save();
    ctx.fillStyle = 'rgba(8, 16, 40, 0.85)';
    rr(ctx, x, y, w, h, 5);
    ctx.fill();
    ctx.fillStyle = color;
    if (frac > 0) {
      rr(ctx, x + 1, y + 1, Math.max(4, (w - 2) * frac), h - 2, 4);
      ctx.fill();
    }
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1;
    rr(ctx, x, y, w, h, 5);
    ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 12px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 8, y + h / 2 + 0.5);
    ctx.restore();
  }

  function drawHUD(state, best) {
    const p = state.player;
    ctx.save();
    ctx.textBaseline = 'middle';
    // Left: core and hull integrity.
    bar(30, 28, 240, 20, Math.max(0, state.core.hp / state.core.maxHp), state.core.hp > 35 ? PALETTE.core : PALETTE.danger, `CORE ${Math.max(0, Math.ceil(state.core.hp))}`);
    bar(30, 54, 240, 20, Math.max(0, p.stats.hp / p.stats.maxHp), p.stats.hp > 35 ? PALETTE.player : PALETTE.danger, `HULL ${Math.max(0, Math.ceil(p.stats.hp))}`);
    // Centre: wave and hostiles left.
    const left = state.enemies.length + state.spawnQueue.length;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 22px ${FONT}`;
    ctx.fillText(`WAVE ${Math.max(1, state.wave)} / ${FINAL_WAVE}`, FIELD.width / 2, 38);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText(left > 0 ? `${left} HOSTILE${left === 1 ? '' : 'S'} REMAIN` : 'WAVE CLEAR', FIELD.width / 2, 62);
    // Right: score, combo, shards, best.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 22px ${FONT}`;
    ctx.fillText(`${state.score.toLocaleString('en-US')}`, FIELD.width - 30, 38);
    ctx.font = `600 13px ${FONT}`;
    ctx.fillStyle = state.multiplier > 1 ? PALETTE.shard : PALETTE.muted;
    ctx.fillText(`COMBO x${state.multiplier}   ◆ ${state.shards}   BEST ${Math.max(best, state.score).toLocaleString('en-US')}`, FIELD.width - 30, 62);
    ctx.restore();
  }

  function drawBanner(state) {
    if (!state.banner || state.bannerTimer <= 0) return;
    const a = Math.min(1, state.bannerTimer / 0.6);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = `800 40px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    ctx.shadowColor = PALETTE.wallGlow;
    ctx.shadowBlur = 24;
    ctx.fillText(state.banner.text, FIELD.width / 2, 150);
    if (state.banner.sub) {
      ctx.font = `600 16px ${FONT}`;
      ctx.fillStyle = PALETTE.muted;
      ctx.shadowBlur = 0;
      ctx.fillText(state.banner.sub, FIELD.width / 2, 182);
    }
    ctx.restore();
  }

  function dim(alpha) {
    ctx.save();
    ctx.fillStyle = `rgba(3, 6, 18, ${alpha})`;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.restore();
  }

  function panel(x, y, w, h) {
    ctx.save();
    ctx.fillStyle = PALETTE.panel;
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.shadowColor = PALETTE.wallGlow;
    ctx.shadowBlur = 22;
    rr(ctx, x, y, w, h, 16);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawTitle(state, best) {
    dim(0.55);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.core;
    ctx.font = `800 84px ${FONT}`;
    ctx.shadowColor = PALETTE.core;
    ctx.shadowBlur = 34;
    ctx.fillText('LUMEN BASTION', FIELD.width / 2, 250);
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 21px ${FONT}`;
    ctx.fillText('Hold the light. Guard the Ember Core. Survive all 15 waves.', FIELD.width / 2, 300);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `500 16px ${FONT}`;
    ctx.fillText('WASD / arrows — move      Mouse — aim      Click / Space — fire      P — pause      M — mute', FIELD.width / 2, 344);
    ctx.fillText('Darters rush the core. Spitters shell it from range. Bulwarks chew through it.', FIELD.width / 2, 372);
    ctx.fillText('Clear a wave, pick 1 of 3 upgrades, and face the Warden every 5th wave.', FIELD.width / 2, 400);
    const shown = best;
    if (shown > 0) {
      ctx.fillStyle = PALETTE.shard;
      ctx.font = `700 18px ${FONT}`;
      ctx.fillText(`BEST SCORE  ${shown.toLocaleString('en-US')}`, FIELD.width / 2, 448);
    }
    ctx.fillStyle = PALETTE.player;
    ctx.font = `800 24px ${FONT}`;
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 4);
    ctx.globalAlpha = pulse;
    ctx.fillText('— CLICK OR PRESS SPACE TO START —', FIELD.width / 2, 512);
    ctx.restore();
  }

  // Upgrade cards: three across, centred. The renderer owns the rects so the
  // main loop can answer clicks on them.
  const CARD_W = 300;
  const CARD_H = 210;
  const CARD_Y = 268;
  const CARD_GAP = 28;
  const REROLL = { x: FIELD.width / 2 - 130, y: 540, w: 260, h: 46 };

  function cardRect(index) {
    const total = CARD_W * 3 + CARD_GAP * 2;
    return { x: (FIELD.width - total) / 2 + index * (CARD_W + CARD_GAP), y: CARD_Y, w: CARD_W, h: CARD_H };
  }

  function cardAt(wx, wy) {
    for (let i = 0; i < 3; i += 1) {
      const r = cardRect(i);
      if (wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h) return i;
    }
    return -1;
  }

  function rerollAt(wx, wy) {
    return wx >= REROLL.x && wx <= REROLL.x + REROLL.w && wy >= REROLL.y && wy <= REROLL.y + REROLL.h;
  }

  function drawUpgrade(state) {
    dim(0.62);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 38px ${FONT}`;
    ctx.shadowColor = PALETTE.wallGlow;
    ctx.shadowBlur = 18;
    ctx.fillText(`WAVE ${state.wave} CLEAR`, FIELD.width / 2, 150);
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 17px ${FONT}`;
    ctx.fillText('Choose one upgrade — or reroll the three for 5 shards.', FIELD.width / 2, 188);
    ctx.fillStyle = PALETTE.shard;
    ctx.font = `700 16px ${FONT}`;
    ctx.fillText(`◆ ${state.shards} shards`, FIELD.width / 2, 216);
    const offer = state.offer || [];
    for (let i = 0; i < 3; i += 1) {
      const r = cardRect(i);
      const card = offer[i];
      panel(r.x, r.y, r.w, r.h);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `700 13px ${FONT}`;
      ctx.fillText(`PRESS ${i + 1}`, r.x + r.w / 2, r.y + 30);
      if (card) {
        ctx.fillStyle = PALETTE.player;
        ctx.font = `800 22px ${FONT}`;
        ctx.fillText(card.name, r.x + r.w / 2, r.y + 70);
        ctx.fillStyle = PALETTE.text;
        ctx.font = `500 15px ${FONT}`;
        const words = card.desc.split(' ');
        let line = '';
        let ly = r.y + 106;
        for (const word of words) {
          const test = line ? `${line} ${word}` : word;
          if (ctx.measureText(test).width > r.w - 44 && line) {
            ctx.fillText(line, r.x + r.w / 2, ly);
            line = word;
            ly += 22;
          } else {
            line = test;
          }
        }
        if (line) ctx.fillText(line, r.x + r.w / 2, ly);
        const level = state.upgradeLevels[card.id] || 0;
        ctx.fillStyle = PALETTE.shard;
        ctx.font = `700 14px ${FONT}`;
        ctx.fillText(`LEVEL ${level} → ${level + 1}  (max ${card.max})`, r.x + r.w / 2, r.y + CARD_H - 26);
      }
    }
    const canReroll = state.shards >= 5;
    ctx.save();
    ctx.globalAlpha = canReroll ? 1 : 0.45;
    panel(REROLL.x, REROLL.y, REROLL.w, REROLL.h);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 16px ${FONT}`;
    ctx.fillText('REROLL — 5 SHARDS', REROLL.x + REROLL.w / 2, REROLL.y + REROLL.h / 2 + 1);
    ctx.restore();
    ctx.restore();
  }

  function drawPaused() {
    dim(0.6);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 52px ${FONT}`;
    ctx.shadowColor = PALETTE.wallGlow;
    ctx.shadowBlur = 22;
    ctx.fillText('PAUSED', FIELD.width / 2, 360);
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText('Press P, Esc or click to resume.', FIELD.width / 2, 410);
    ctx.restore();
  }

  function drawOver(state, best) {
    dim(0.6);
    const won = state.victory;
    const acc = state.shotsFired > 0 ? Math.round((100 * state.hits) / state.shotsFired) : 0;
    const minutes = Math.floor(state.time / 60);
    const seconds = Math.floor(state.time % 60).toString().padStart(2, '0');
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = won ? PALETTE.core : PALETTE.danger;
    ctx.font = `800 56px ${FONT}`;
    ctx.shadowColor = won ? PALETTE.core : PALETTE.danger;
    ctx.shadowBlur = 28;
    ctx.fillText(won ? 'VICTORY — THE CORE ENDURES' : 'THE CORE HAS FALLEN', FIELD.width / 2, 220);
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText(won ? 'All 15 waves broken. The light holds.' : 'The bastion is dark — but the light can be rekindled.', FIELD.width / 2, 262);
    panel(FIELD.width / 2 - 260, 300, 520, 210);
    const rows = [
      ['SCORE', state.score.toLocaleString('en-US')],
      ['BEST', Math.max(best, state.score).toLocaleString('en-US')],
      ['WAVE REACHED', `${state.wave} / ${FINAL_WAVE}`],
      ['KILLS', `${state.kills}`],
      ['ACCURACY', `${acc}%`],
      ['TIME', `${minutes}:${seconds}`],
    ];
    ctx.font = `600 18px ${FONT}`;
    rows.forEach(([label, value], i) => {
      const y = 338 + i * 30;
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.muted;
      ctx.fillText(label, FIELD.width / 2 - 230, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(value, FIELD.width / 2 + 230, y);
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.player;
    ctx.font = `800 24px ${FONT}`;
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 4);
    ctx.globalAlpha = pulse;
    ctx.fillText('— CLICK OR PRESS SPACE TO PLAY AGAIN —', FIELD.width / 2, 580);
    ctx.restore();
  }

  function drawWorld(state) {
    drawBackground(state);
    drawCore(state);
    drawDrops(state);
    for (const e of state.enemies) drawEnemy(e, state);
    drawPlayer(state);
    drawBullets(state);
    drawParticles(state);
    drawTexts(state);
  }

  /** Paint one frame. `screen` is one of the SCREEN_* names. */
  function draw(state, screen, best) {
    resize();
    const dpr = view.dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, view.w, view.h);
    // Deterministic shake: a sine of the world's own clock.
    const sh = state.shake;
    const shx = sh > 0 ? Math.sin(state.time * 61) * sh * 0.55 : 0;
    const shy = sh > 0 ? Math.cos(state.time * 53) * sh * 0.55 : 0;
    ctx.save();
    ctx.translate(view.ox + shx * view.scale, view.oy + shy * view.scale);
    ctx.scale(view.scale, view.scale);
    drawWorld(state);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_UPGRADE) {
      drawHUD(state, best);
      drawBanner(state);
    }
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_UPGRADE) drawUpgrade(state);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(state, best);
    ctx.restore();
  }

  return { draw, resize, screenToWorld, cardAt, rerollAt };
}
