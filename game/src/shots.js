// The screenshot scenes behind ?shot=start|play|end. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, so the frame
// is what a short game really looks like and the same seed always gives the
// same frame. The play scene is steered by the world's own autopilot; the
// end scene leaves the guardian idle, so the core falls as it would for a
// player who never touches the keys.

import { STEP } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const END_LIMIT_SECONDS = 300;

/** The guardian standing still, never firing: the end scene's input. */
function idleInput(world) {
  const p = world.state.player;
  return { move: null, aim: { x: p.x, y: p.y - 100 }, firing: false };
}

function stagePlay(world) {
  // One continuous run, sampling how busy the field is every step, then a
  // replay to the busiest moment. The autopilot kills faster than the
  // drip-feed spawns, so the liveliest frame is not always the latest one;
  // sampling finds it, and the reset world replays it exactly.
  function drive(seconds) {
    const limit = Math.round(seconds / STEP);
    for (let i = 0; i < limit; i++) {
      if (world.state.phase === 'over') break;
      if (world.state.phase === 'intermission') world.chooseUpgrade(0);
      world.step(STEP, { autopilot: true });
    }
  }
  world.reset();
  world.startGame();
  let bestSteps = 0;
  let bestBusy = -1;
  const total = Math.round(40 / STEP);
  for (let i = 0; i < total; i++) {
    if (world.state.phase === 'over') break;
    if (world.state.phase === 'intermission') world.chooseUpgrade(0);
    world.step(STEP, { autopilot: true });
    if (world.state.phase === 'wave') {
      const s = world.state;
      const busy = s.enemies.length * 10 + s.bullets.length + s.particles.length;
      if (busy > bestBusy) {
        bestBusy = busy;
        bestSteps = i + 1;
      }
    }
  }
  world.reset();
  world.startGame();
  drive(bestSteps * STEP);
  return { screen: SCREEN_PLAY, best: world.state.score };
}

function stageEnd(world) {
  world.reset();
  world.startGame();
  const limit = Math.round(END_LIMIT_SECONDS / STEP);
  for (let i = 0; i < limit; i += 1) {
    if (world.state.phase === 'over') break;
    if (world.state.phase === 'intermission') world.chooseUpgrade(0);
    world.step(STEP, idleInput(world));
  }
  return { screen: SCREEN_OVER, best: world.state.score };
}

/**
 * Set `world` to the named scene (start, play or end; any other name is
 * start) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'play') return stagePlay(world);
  if (name === 'end') return stageEnd(world);
  for (let i = 0; i < Math.round(START_SECONDS / STEP); i += 1) {
    world.step(STEP, { autopilot: true });
  }
  return { screen: SCREEN_TITLE, best: 0 };
}
