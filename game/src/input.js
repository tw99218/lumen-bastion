// Keyboard and mouse, read once per frame. Movement keys are held state;
// confirms, pause and number keys are edge-triggered actions drained by the
// main loop with takeActions(). The mouse position is kept in page pixels;
// main.js converts it to field coordinates through the renderer's transform.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_ONE = 8;
export const ACTION_TWO = 16;
export const ACTION_THREE = 32;

const MOVE_KEYS = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let mouseSeen = false;

  function keyAction(code) {
    if (code === 'Space' || code === 'Enter') return ACTION_CONFIRM;
    if (code === 'Escape' || code === 'KeyP') return ACTION_PAUSE;
    if (code === 'KeyM') return ACTION_MUTE;
    if (code === 'Digit1' || code === 'Numpad1') return ACTION_ONE;
    if (code === 'Digit2' || code === 'Numpad2') return ACTION_TWO;
    if (code === 'Digit3' || code === 'Numpad3') return ACTION_THREE;
    return 0;
  }

  function onKeyDown(event) {
    if (MOVE_KEYS[event.code]) {
      held.add(MOVE_KEYS[event.code]);
      event.preventDefault();
      return;
    }
    if (event.code === 'Space') {
      held.add(' '); // held Space fires; its edge also confirms on menus
      actions |= ACTION_CONFIRM;
      event.preventDefault();
      return;
    }
    const action = keyAction(event.code);
    if (action) {
      actions |= action;
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    if (MOVE_KEYS[event.code]) held.delete(MOVE_KEYS[event.code]);
    if (event.code === 'Space') held.delete(' ');
  }

  function trackMouse(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseSeen = true;
  }

  canvas.addEventListener('mousemove', trackMouse);
  canvas.addEventListener('mousedown', (event) => {
    trackMouse(event);
    mouseDown = true;
    actions |= ACTION_CONFIRM;
  });
  canvas.addEventListener('mouseup', () => { mouseDown = false; });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { held.clear(); mouseDown = false; });

  return {
    /** Normalised movement vector from the held keys, or null when idle. */
    moveVector() {
      let x = 0;
      let y = 0;
      if (held.has('left')) x -= 1;
      if (held.has('right')) x += 1;
      if (held.has('up')) y -= 1;
      if (held.has('down')) y += 1;
      if (x === 0 && y === 0) return null;
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len };
    },
    /** True while the mouse button or Space is held (hold to fire). */
    firing() {
      return mouseDown || held.has(' ');
    },
    mouse() { return { x: mouseX, y: mouseY, seen: mouseSeen }; },
    takeActions() {
      const out = actions;
      actions = 0;
      return out;
    },
    /** A click anywhere counts as a confirm; the main loop clears it. */
    consumeConfirm() {
      actions &= ~ACTION_CONFIRM;
    },
  };
}
