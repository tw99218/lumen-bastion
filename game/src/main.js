// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens:
// title, play, upgrade, paused and game over.
//
// ?seed=N fixes the random pattern. ?shot=start|play|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, NULL_AUDIO, EVENT_OVER } from './world.js';
import { createAudio } from './audio.js';
import {
  ACTION_CONFIRM, ACTION_PAUSE, ACTION_MUTE, ACTION_ONE, ACTION_TWO, ACTION_THREE, createInput,
} from './input.js';
import {
  createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = shot ? NULL_AUDIO : createAudio();
const world = createWorld(createRandom(seed), audio);
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  window.__lumen = { world, state: world.state, screen: scene.screen };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  window.__lumen = {
    world,
    get state() { return world.state; },
    get screen() { return screen; },
  };

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.startGame();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Wave 1. Defend the Ember Core.`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(world.state.victory
      ? `Victory. Score ${world.state.score}. Best ${best}.`
      : `Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function handleConfirm() {
    audio.unlock();
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER) {
      startGame();
      return;
    }
    if (screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
      return;
    }
    if (screen === SCREEN_UPGRADE) {
      const mouse = input.mouse();
      if (!mouse.seen) return;
      const w = renderer.screenToWorld(mouse.x, mouse.y);
      const card = renderer.cardAt(w.x, w.y);
      if (card >= 0) {
        if (world.chooseUpgrade(card)) {
          screen = SCREEN_PLAY;
          announce(`Wave ${world.state.wave}.`);
        }
        return;
      }
      if (renderer.rerollAt(w.x, w.y)) world.rerollOffer();
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) handleConfirm();
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (screen === SCREEN_UPGRADE) {
      if (actions & ACTION_ONE && world.chooseUpgrade(0)) screen = SCREEN_PLAY;
      else if (actions & ACTION_TWO && world.chooseUpgrade(1)) screen = SCREEN_PLAY;
      else if (actions & ACTION_THREE && world.chooseUpgrade(2)) screen = SCREEN_PLAY;
    }
  }

  function step() {
    if (screen === SCREEN_OVER) {
      // The over screen keeps its particles drifting, nothing else moves.
      world.step(STEP, { move: null, aim: { x: 0, y: 0 }, firing: false });
      return;
    }
    const mouse = input.mouse();
    const aim = mouse.seen
      ? renderer.screenToWorld(mouse.x, mouse.y)
      : { x: world.state.player.x, y: world.state.player.y - 200 };
    const drive = {
      move: input.moveVector(),
      aim,
      firing: input.firing(),
    };
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { autopilot: true });
      return;
    }
    const events = world.step(STEP, drive);
    if (events & EVENT_OVER) endGame();
    else if (world.state.phase === 'intermission' && screen === SCREEN_PLAY) {
      screen = SCREEN_UPGRADE;
      announce('Wave clear. Choose an upgrade.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_OVER) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_OVER)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  window.addEventListener('resize', () => renderer.resize());
  announce('Lumen Bastion. Click or press Space to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
