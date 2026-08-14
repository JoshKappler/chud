// 8-bit goblin sprite. Drawn from a character grid plus overlays for eyes, mouth,
// brows, thinking dots and the agent badge. All coordinates are logical pixels.
const Goblin = (() => {
  const canvas = document.getElementById('goblin');
  const ctx = canvas.getContext('2d');
  let S = 4;
  const OY = 1;

  function setScale(n) {
    S = n;
    canvas.width = cellsW * S;
    canvas.height = cellsH * S;
  }

  // Grows the canvas and window to fit the stretched sock and pins the
  // head to the same screen spot by shifting the window origin. lastPX
  // and lastPY absorb the shift so the velocity poll sees no jump.
  function applyGeometry(hx, hy, cw, ch) {
    if (hx === headOX && hy === headOY && cw === cellsW && ch === cellsH) return;
    const mx = (headOX - hx) * S;
    const my = (headOY - hy) * S;
    headOX = hx;
    headOY = hy;
    cellsW = cw;
    cellsH = ch;
    canvas.width = cw * S;
    canvas.height = ch * S;
    window.resizeTo(cw * S, ch * S);
    if (mx || my) {
      window.moveTo(window.screenX + mx, window.screenY + my);
      lastPX += mx;
      lastPY += my;
    }
  }

  const PAL = {
    o: '#131a0c', g: '#57a63f', d: '#37702a', l: '#8fd457',
    e: '#ffd83d', p: '#1b140d', w: '#f5efd7', m: '#33121a',
    t: '#b33a3a', n: '#274d1e', b: '#5b3b6e', B: '#2e1d3f',
    r: '#a11f2f', R: '#6e1420',
  };

  const BASE = [
    '.............oo.............',
    '............olgo............',
    '..........olgggggo..........',
    '.........olggggggdo.........',
    '........olggggggggdo........',
    'oo.....olggggggggggdo.....oo',
    'olggo..olggggggggggdo..oggdo',
    'olgggoolggggggggggggdoogggdo',
    '.ogggoolggggggggggggdooggdo.',
    '..oggoolggggggggggggdooggo..',
    '....ooolggggggggggggdooo....',
    '......olggggggggggggdo......',
    '......olggggggggggggdo......',
    '.......ogggggggggggdo.......',
    '.......ogggggggggggdo.......',
    '........oggggggggggo........',
    '........oggggggggggo........',
    '.........ogggggggdo.........',
    '.........ogggggggdo.........',
    '..........oggggggo..........',
    '...........oggggo...........',
    '............oggo............',
    '.............oo.............',
  ];

  const WARTS = [[9, 6, 'd'], [18, 5, 'd'], [8, 12, 'd'], [19, 12, 'd'], [11, 4, 'l']];

  const PALE = { g: '#75836a', d: '#525f49', l: '#98a58c' };

  const BLOOD = {
    3: [[12, 15, 'r']],
    4: [[9, 8, 'R'], [10, 8, 'r'], [10, 9, 'r']],
    5: [[16, 18, 'r'], [16, 19, 'R']],
    6: [[7, 11, 'r'], [20, 10, 'R'], [11, 3, 'r'], [19, 15, 'r']],
    7: [[8, 13, 'R'], [8, 14, 'r'], [15, 4, 'r'], [15, 5, 'R'], [12, 2, 'r']],
    8: [[10, 11, 'r'], [10, 12, 'R'], [18, 12, 'r'], [18, 13, 'R'], [14, 19, 'r']],
    9: [[11, 2, 'R'], [11, 3, 'r'], [16, 2, 'r'], [16, 3, 'R'], [13, 3, 'r'], [9, 5, 'r'], [18, 6, 'R'], [14, 7, 'r'], [13, 20, 'R']],
  };

  function drawBlood(dy) {
    for (const lvl of [3, 4, 5, 6, 7, 8, 9]) {
      if (damage < lvl) continue;
      for (const [x, y, c] of BLOOD[lvl]) px(x, y + dy, c);
    }
  }

  // Damage 10..19: skin falls away in patches spreading from seed points,
  // each revealed cell painted with what the full skull shows there.
  const DECAY_SEEDS = [[10, 6], [17, 12], [12, 17], [19, 4], [8, 13]];
  let skullMap = null;
  let decayMap = null;

  function buildDecayMaps() {
    skullMap = new Map();
    for (let y = 0; y < BASE.length; y++) {
      for (let x = 0; x < BASE[y].length; x++) {
        const c = BASE[y][x];
        if (c !== '.') skullMap.set(x + ',' + y, c === 'o' ? 'o' : 'w');
      }
    }
    for (let yy = 0; yy < 4; yy++) {
      for (let xx = 0; xx < 4; xx++) {
        skullMap.set((9 + xx) + ',' + (9 + yy), 'p');
        skullMap.set((15 + xx) + ',' + (9 + yy), 'p');
      }
    }
    skullMap.set('10,10', 'e');
    skullMap.set('17,10', 'e');
    skullMap.set('13,13', 'p');
    skullMap.set('14,13', 'p');
    skullMap.set('13,14', 'p');
    skullMap.set('14,14', 'p');
    for (let xx = 10; xx <= 17; xx++) {
      skullMap.set(xx + ',15', 'w');
      skullMap.set(xx + ',16', xx % 2 ? 'o' : 'w');
    }
    skullMap.set('12,3', 'o');
    skullMap.set('13,4', 'o');
    skullMap.set('16,6', 'o');

    decayMap = new Map();
    const ranked = [];
    for (const key of skullMap.keys()) {
      const [x, y] = key.split(',').map(Number);
      let d = Infinity;
      for (const [sx, sy] of DECAY_SEEDS) d = Math.min(d, Math.hypot(x - sx, y - sy));
      let h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      h = ((h ^ (h >> 13)) % 1000) / 1000;
      ranked.push([key, d + (h - 0.5) * 3]);
    }
    ranked.sort((a, b) => a[1] - b[1]);
    ranked.forEach(([key], i) => {
      decayMap.set(key, 1 + Math.floor((i / ranked.length) * 10));
    });
  }

  function drawDecay(dy) {
    if (damage < 10 || damage >= 20) return;
    if (!decayMap) buildDecayMaps();
    const stage = damage - 9;
    for (const [key, thr] of decayMap) {
      if (thr > stage) continue;
      const [x, y] = key.split(',').map(Number);
      px(x, y + dy, skullMap.get(key));
    }
  }

  const MOUTHS = {
    0: { y: 15, rows: ['w......w', '.oooooo.'] },
    1: { y: 15, rows: ['w......w', '.ommmmo.', '..oooo..'] },
    2: { y: 15, rows: ['w......w', 'ommmmmmo', 'ommmmmmo', '.oooooo.'] },
    3: { y: 14, rows: ['w......w', 'ommmmmmo', 'ommmmmmo', 'omttttmo', '.oooooo.'] },
    frown: { y: 16, rows: ['.oooooo.', 'o......o'] },
  };
  const MOUTH_X = 10;

  const EYE_L = { x: 9, y: 9 };
  const EYE_R = { x: 15, y: 9 };

  let state = 'idle';
  let level = 0;
  let shownLevel = 0;
  let badge = 0;
  let blinkUntil = 0;
  let nextBlink = performance.now() + 2000;
  let twitchUntil = 0;
  let nextTwitch = performance.now() + 4000;
  let look = 1;
  let nextLook = performance.now() + 2500;
  let emote = null;
  let damage = 0;
  let lastHeal = performance.now();
  let shakeUntil = 0;
  let offX = 0;
  let healMs = 180000;
  let gvx = 0;
  let gvy = 0;
  let gvManual = false;
  let lastPX = null;
  let lastPY = 0;
  let lastPT = 0;
  let pxTarget = null;
  let headOX = 0;
  let headOY = 0;
  let cellsW = 28;
  let cellsH = 28;
  let gDragging = false;
  let gDirX = 0;
  let gDirY = 0;
  let gDirCand = '';
  let gDirSince = 0;

  function px(x, y, c) {
    if (pxTarget) {
      pxTarget.set(x + ',' + y, c);
      return;
    }
    ctx.fillStyle = tonePal[c] || PAL[c];
    ctx.fillRect((x + offX + headOX) * S, (y + headOY) * S, S, S);
  }

  function lerpHex(a, b, t) {
    const A = parseInt(a.slice(1), 16);
    const B = parseInt(b.slice(1), 16);
    const ch = (sh) => Math.round(((A >> sh) & 255) + (((B >> sh) & 255) - ((A >> sh) & 255)) * t);
    return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
  }

  // Skin tone walks toward corpse gray a step per damage stage.
  let tonePal = {};
  function rebuildTones() {
    const t = Math.min(1, damage / 14);
    tonePal = {};
    for (const k in PALE) tonePal[k] = lerpHex(PAL[k], PALE[k], t);
  }
  rebuildTones();

  function drawMap(rows, ox, oy) {
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const c = rows[y][x];
        if (c !== '.') px(ox + x, oy + y, c);
      }
    }
  }

  function drawEye(anchor, dy, now) {
    const isLeft = anchor === EYE_L;
    const wide = state === 'listening';
    const blinking = now < blinkUntil;
    const top = anchor.y + dy - (wide ? 1 : 0);
    const h = wide ? 4 : 3;

    if (damage >= 5) {
      drawMap(['o..o', '.oo.', 'o..o'], anchor.x, anchor.y + dy);
    } else if (damage >= 2 && !isLeft) {
      for (let x = 0; x < 4; x++) px(anchor.x + x, anchor.y + dy, 'd');
      for (let x = 0; x < 4; x++) px(anchor.x + x, anchor.y + dy + 1, 'e');
      px(anchor.x + 1, anchor.y + dy + 1, 'p');
      px(anchor.x + 2, anchor.y + dy + 1, 'p');
      for (let x = 0; x < 4; x++) px(anchor.x + x, anchor.y + dy + 2, 'd');
    } else if (blinking) {
      for (let x = 0; x < 4; x++) px(anchor.x + x, anchor.y + dy + 1, 'o');
    } else {
      for (let y = 0; y < h; y++)
        for (let x = 0; x < 4; x++) px(anchor.x + x, top + y, 'e');
      let pdx = look === 0 ? 0 : look === 2 ? 2 : 1;
      let pdy = state === 'thinking' ? 0 : Math.floor(h / 2);
      px(anchor.x + pdx, top + pdy, 'p');
      px(anchor.x + pdx + 1, top + pdy, 'p');
    }

    if (damage >= 1 && isLeft) {
      const uy = anchor.y + dy + 3;
      for (let x = 0; x < 4; x++) px(anchor.x + x, uy, 'B');
      px(anchor.x - 1, uy - 1, 'b');
      px(anchor.x + 4, uy - 1, 'b');
    }
    if (damage >= 2 && !isLeft) {
      const uy = anchor.y + dy + 3;
      for (let x = 0; x < 4; x++) px(anchor.x + x, uy, 'b');
    }
  }

  const BLOTCHES = {
    3: [[10, 4, 'b'], [11, 4, 'B'], [17, 14, 'b']],
    4: [[8, 10, 'B'], [9, 10, 'b'], [16, 3, 'b'], [19, 7, 'B']],
    5: [[12, 19, 'b'], [13, 19, 'B'], [18, 17, 'b']],
    6: [[11, 7, 'B'], [12, 7, 'b'], [15, 8, 'B'], [10, 16, 'b'], [16, 16, 'B'], [13, 10, 'b']],
    7: [[9, 8, 'B'], [18, 9, 'b'], [12, 14, 'B'], [14, 17, 'b'], [11, 12, 'B']],
  };

  function drawBruises(dy) {
    for (const lvl of [3, 4, 5, 6, 7]) {
      if (damage < lvl) continue;
      for (const [x, y, c] of BLOTCHES[lvl]) px(x, y + dy, c);
    }
    if (damage >= 4 && !pxTarget) {
      ctx.clearRect((1 + offX) * S, (5 + dy) * S, S, S);
      ctx.clearRect((2 + offX) * S, (6 + dy) * S, S, S);
    }
    if (damage >= 6 && !pxTarget) {
      ctx.clearRect((26 + offX) * S, (5 + dy) * S, S, S);
      ctx.clearRect((25 + offX) * S, (6 + dy) * S, S, S);
    }
  }

  function drawBrows(dy) {
    if (state !== 'grumpy') return;
    drawMap(['..oo', '.o..'], EYE_L.x, EYE_L.y + dy - 2);
    drawMap(['oo..', '..o.'], EYE_R.x, EYE_R.y + dy - 2);
  }

  function drawNose(dy) {
    px(13, 12 + dy, 'l');
    px(14, 12 + dy, 'g');
    px(12, 13 + dy, 'o');
    px(13, 13 + dy, 'g');
    px(14, 13 + dy, 'g');
    px(15, 13 + dy, 'o');
    px(13, 14 + dy, 'n');
    px(14, 14 + dy, 'n');
  }

  function mouthFrame() {
    if (state === 'grumpy') return 'frown';
    if (state === 'talking') {
      if (shownLevel < 0.04) return 0;
      if (shownLevel < 0.12) return 1;
      if (shownLevel < 0.3) return 2;
      return 3;
    }
    if (state === 'thinking') return 1;
    return 0;
  }

  const GLYPHS = {
    '?': ['ooo', '..o', '.oo', '...', '.o.'],
    '!': ['.o.', '.o.', '.o.', '...', '.o.'],
  };

  function drawEmote(now) {
    if (!emote) return;
    for (let y = 1; y <= 7; y++) {
      for (let x = 21; x <= 27; x++) {
        const edge = y === 1 || y === 7 || x === 21 || x === 27;
        px(x, y, edge ? 'o' : 'w');
      }
    }
    px(20, 8, 'w');
    if (emote === 'dots') {
      const phase = Math.floor(now / 350) % 4;
      const xs = [22, 24, 26];
      for (let i = 0; i < phase && i < 3; i++) px(xs[i], 4, 'o');
    } else if (emote === '~') {
      drawMap(['.oo.o', 'o..o.'], 22, 3);
    } else if (GLYPHS[emote]) {
      drawMap(GLYPHS[emote], 23, 2);
    }
  }

  const DIGITS = {
    0: ['www', 'w.w', 'w.w', 'w.w', 'www'], 1: ['.w.', 'ww.', '.w.', '.w.', 'www'],
    2: ['www', '..w', 'www', 'w..', 'www'], 3: ['www', '..w', 'www', '..w', 'www'],
    4: ['w.w', 'w.w', 'www', '..w', '..w'], 5: ['www', 'w..', 'www', '..w', 'www'],
    6: ['www', 'w..', 'www', 'w.w', 'www'], 7: ['www', '..w', '..w', '.w.', '.w.'],
    8: ['www', 'w.w', 'www', 'w.w', 'www'], 9: ['www', 'w.w', 'www', '..w', 'www'],
  };

  function drawBadge() {
    if (!badge) return;
    const text = String(Math.min(badge, 9));
    ctx.fillStyle = PAL.m;
    ctx.fillRect((21 + headOX) * S, (21 + headOY) * S, 5 * S, 7 * S);
    drawMap(DIGITS[text], 22, 22);
  }

  function drawSkullFace(dy, jaw) {
    for (let y = 0; y < BASE.length; y++) {
      for (let x = 0; x < BASE[y].length; x++) {
        const c = BASE[y][x];
        if (c === '.') continue;
        px(x, y + dy + (y >= 15 ? jaw : 0), c === 'o' ? 'o' : 'w');
      }
    }
    for (let yy = 0; yy < 4; yy++) {
      for (let xx = 0; xx < 4; xx++) {
        px(9 + xx, 9 + yy + dy, 'p');
        px(15 + xx, 9 + yy + dy, 'p');
      }
    }
    px(10, 10 + dy, 'e');
    px(17, 10 + dy, 'e');
    px(13, 13 + dy, 'p');
    px(14, 13 + dy, 'p');
    px(13, 14 + dy, 'p');
    px(14, 14 + dy, 'p');
    for (let xx = 10; xx <= 17; xx++) {
      px(xx, 15 + dy + jaw, 'w');
      px(xx, 16 + dy + jaw, xx % 2 ? 'o' : 'w');
    }
    px(12, 3 + dy, 'o');
    px(13, 4 + dy, 'o');
    px(16, 6 + dy, 'o');
  }

  function drawSkin(now, dy, gtier) {
    for (let y = 0; y < BASE.length; y++) {
      for (let x = 0; x < BASE[y].length; x++) {
        const c = BASE[y][x];
        if (c !== '.') px(x, y + dy, c);
      }
    }
    for (const [x, y, c] of WARTS) px(x, y + dy, c);
    drawMap(['..oo', '.oll', 'olll', '.oll', '..oo'], 3, 11 + dy);
    drawMap(['oo..', 'llo.', 'lllo', 'llo.', 'oo..'], 21, 11 + dy);
    for (const anchor of [EYE_L, EYE_R]) {
      for (let yy = 0; yy < 4; yy++)
        for (let xx = 0; xx < 4; xx++) px(anchor.x + xx, anchor.y - 1 + yy + dy, 'e');
      const pdx = Math.abs(gvx) < Math.hypot(gvx, gvy) / 3 ? 1 : gvx > 0 ? 0 : 2;
      px(anchor.x + pdx, anchor.y + 1 + dy, 'p');
      px(anchor.x + pdx + 1, anchor.y + 1 + dy, 'p');
    }
    drawNose(dy);
    if (gtier === 1) {
      drawMap(['.oo.', 'ommo', '.oo.'], 12, 14 + dy);
    } else {
      const flap = MOUTHS[Math.floor(now / 90) % 2 ? 2 : 3];
      drawMap(flap.rows, MOUTH_X, flap.y + dy);
    }
    drawBruises(dy);
    drawBlood(dy);
    drawDecay(dy);
  }

  // Cartoon G-force face. Tier 1: balloon cheeks, pursed mouth, wide eyes
  // with trailing pupils. Tier 2 up: the skin is a sock gripped on the
  // side leading the acceleration, the whole face stretching up to twice
  // its breadth behind, rippling in the wind and fading out at the frame
  // edge; the eyes stay visible with a black sagging gap on their
  // trailing side. At damage 20 the bare skull stretches the same way.
  function drawGForce(now, dy, gspeed, gtier) {
    if (gtier === 1) {
      drawSkin(now, dy, 1);
      return;
    }
    const ux = gvx / gspeed;
    const uy = gvy / gspeed;
    pxTarget = new Map();
    if (damage >= 20) {
      drawSkullFace(dy, 0);
      px(9, 13 + dy, 'r');
      px(9, 14 + dy, 'R');
      px(18, 13 + dy, 'r');
      px(11, 2 + dy, 'r');
      px(17, 3 + dy, 'R');
    } else {
      drawSkin(now, dy, gtier);
      const bx = Math.round(-ux);
      const by = Math.round(-uy);
      for (const anchor of [EYE_L, EYE_R]) {
        if (bx) {
          const gx = bx < 0 ? anchor.x - 1 : anchor.x + 4;
          for (let yy = 0; yy <= 3; yy++) px(gx, anchor.y + yy + dy, 'o');
          if (gtier === 3) {
            for (let yy = 1; yy <= 3; yy++) px(gx + bx, anchor.y + yy + dy, 'o');
          }
        } else {
          const gy = by < 0 ? anchor.y - 2 : anchor.y + 3;
          const temple = anchor === EYE_L ? anchor.x - 1 : anchor.x + 4;
          for (let xx = 0; xx < 4; xx++) px(anchor.x + xx, gy + dy, 'o');
          px(temple, gy + dy, 'o');
          if (gtier === 3) {
            px(anchor.x + 1, gy + by + dy, 'o');
            px(anchor.x + 2, gy + by + dy, 'o');
            px(temple + (anchor === EYE_L ? -1 : 1), gy + dy, 'o');
          }
        }
      }
    }
    const buf = pxTarget;
    pxTarget = null;
    let pMax = -Infinity;
    let pMin = Infinity;
    for (const key of buf.keys()) {
      const [bx, by] = key.split(',').map(Number);
      const p = bx * ux + by * uy;
      if (p > pMax) pMax = p;
      if (p < pMin) pMin = p;
    }
    const f = gtier === 3 ? 1.0 : 0.45;
    const amp = gtier === 3 ? 2.5 : 1;
    const depth = pMax - pMin;
    const span = depth * (1 + f);
    const lin = f * 0.6;
    const k = (f * 0.4) / (depth * depth);
    const xLo = -headOX;
    const xHi = cellsW - headOX;
    const yLo = -headOY;
    const yHi = cellsH - headOY;
    for (let Y = yLo; Y < yHi; Y++) {
      for (let X = xLo; X < xHi; X++) {
        const p = X * ux + Y * uy;
        const dd = pMax - p;
        if (dd < 0 || dd > span) continue;
        const q = dd / span;
        const wave = amp * q * q * Math.sin(now / 70 - q * 4);
        const off = -X * uy + Y * ux - wave;
        let sB = dd / (1 + f);
        for (let i = 0; i < 4; i++) {
          sB -= (sB + lin * sB + k * sB * sB * sB - dd) / (1 + lin + 3 * k * sB * sB);
        }
        const ps = pMax - sB;
        const xs = Math.round(ps * ux - off * uy);
        const ys = Math.round(ps * uy + off * ux);
        const c = buf.get(xs + ',' + ys);
        if (!c) continue;
        const dxe = ux > 0 ? (X - xLo) / ux : ux < 0 ? (X - xHi + 1) / ux : Infinity;
        const dye = uy > 0 ? (Y - yLo) / uy : uy < 0 ? (Y - yHi + 1) / uy : Infinity;
        const edgeDist = Math.min(dxe, dye);
        ctx.globalAlpha = q > 0.25 ? Math.min(1, 0.15 + edgeDist / 5) : 1;
        ctx.fillStyle = tonePal[c] || PAL[c];
        ctx.fillRect((X + offX + headOX) * S, (Y + headOY) * S, S, S);
      }
    }
    ctx.globalAlpha = 1;
  }

  function render(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Window velocity from the window's own screen position, smoothed,
    // feeds the G-force face; setMotion overrides it for test pages.
    if (!gvManual) {
      if (lastPX === null) {
        lastPX = window.screenX;
        lastPY = window.screenY;
        lastPT = now;
      } else if (now > lastPT) {
        const gdt = (now - lastPT) / 1000;
        const a = Math.min(1, gdt * 12);
        gvx += ((window.screenX - lastPX) / gdt - gvx) * a;
        gvy += ((window.screenY - lastPY) / gdt - gvy) * a;
        lastPX = window.screenX;
        lastPY = window.screenY;
        lastPT = now;
      }
    }

    if (now > nextBlink) { blinkUntil = now + 140; nextBlink = now + 2200 + Math.random() * 3800; }
    if (now > nextTwitch) { twitchUntil = now + 160; nextTwitch = now + 3500 + Math.random() * 5000; }
    if (now > nextLook) { look = Math.floor(Math.random() * 3); nextLook = now + 1500 + Math.random() * 3000; }
    if (damage > 0 && now - lastHeal > healMs) { damage--; lastHeal = now; rebuildTones(); }
    offX = now < shakeUntil ? (Math.random() < 0.5 ? -1 : 1) : 0;

    shownLevel = Math.max(level, shownLevel * 0.75);

    const bobSpeed = state === 'talking' ? 260 : state === 'listening' ? 400 : 900;
    const bob = Math.round(Math.sin(now / bobSpeed) * (state === 'idle' ? 0.6 : 1));
    const earsUp = (state === 'listening' || now < twitchUntil) && damage < 10;

    const gspeed = Math.hypot(gvx, gvy);
    const gtier = gspeed > 900 ? 3 : gspeed > 450 ? 2 : gspeed > 150 ? 1 : 0;
    if (damage >= 20 && gtier < 2) {
      const dy = OY + bob;
      const jaw = state === 'talking' && shownLevel > 0.1 ? 1 : 0;
      applyGeometry(0, 0, 28, 28);
      drawSkullFace(dy, jaw);
      px(9, 13 + dy, 'r');
      px(9, 14 + dy, 'R');
      px(18, 13 + dy, 'r');
      px(11, 2 + dy, 'r');
      px(17, 3 + dy, 'R');
      drawEmote(now);
      drawBadge();
      requestAnimationFrame(render);
      return;
    }

    if (gtier >= 2 && gDragging && gspeed > 0) {
      // Tail room is capped to the space between the head and the screen
      // edge: a window edge past the wall would clamp in drift and fire
      // phantom hurts. Quantized to whole 7-cell steps to limit resizes,
      // and the direction must hold 150ms before the geometry flips.
      const tbx = Math.round(-gvx / gspeed);
      const tby = Math.round(-gvy / gspeed);
      if (tbx !== gDirX || tby !== gDirY) {
        const cand = tbx + ',' + tby;
        if (cand !== gDirCand) {
          gDirCand = cand;
          gDirSince = now;
        } else if (now - gDirSince > 150) {
          gDirX = tbx;
          gDirY = tby;
        }
      }
      const scr = window.screen;
      const headSX = window.screenX + headOX * S;
      const headSY = window.screenY + headOY * S;
      let gw = 0;
      let gh = 0;
      if (gDirX < 0) gw = (headSX - scr.availLeft) / S;
      else if (gDirX > 0) gw = (scr.availLeft + scr.availWidth - headSX - 28 * S) / S;
      if (gDirY < 0) gh = (headSY - scr.availTop) / S;
      else if (gDirY > 0) gh = (scr.availTop + scr.availHeight - headSY - 28 * S) / S;
      gw = Math.floor(Math.max(0, Math.min(28, gw)) / 7) * 7;
      gh = Math.floor(Math.max(0, Math.min(28, gh)) / 7) * 7;
      applyGeometry(gDirX < 0 ? gw : 0, gDirY < 0 ? gh : 0, 28 + gw, 28 + gh);
    } else {
      applyGeometry(0, 0, 28, 28);
      gDirX = 0;
      gDirY = 0;
      gDirCand = '';
    }
    if (gtier > 0) {
      drawGForce(now, OY + bob, gspeed, gtier);
      drawEmote(now);
      drawBadge();
      requestAnimationFrame(render);
      return;
    }

    for (let y = 0; y < BASE.length; y++) {
      for (let x = 0; x < BASE[y].length; x++) {
        const c = BASE[y][x];
        if (c === '.') continue;
        const isEar = x <= 6 || x >= 21;
        const dy = OY + bob + (isEar && earsUp && y <= 10 ? -1 : 0);
        px(x, y + dy, c);
      }
    }

    const dy = OY + bob;
    for (const [x, y, c] of WARTS) px(x, y + dy, c);
    drawEye(EYE_L, dy, now);
    drawEye(EYE_R, dy, now);
    drawBrows(dy);
    drawNose(dy);
    const m = MOUTHS[mouthFrame()];
    let rows = damage >= 3 ? m.rows.map((r) => (r[0] === 'w' ? '.' + r.slice(1) : r)) : m.rows;
    if (damage >= 6) rows = rows.map((r) => (r[r.length - 1] === 'w' ? r.slice(0, -1) + '.' : r));
    drawMap(rows, MOUTH_X, m.y + dy);
    drawBruises(dy);
    drawBlood(dy);
    drawDecay(dy);
    drawEmote(now);
    drawBadge();

    requestAnimationFrame(render);
  }

  return {
    setScale,
    start: () => {
      setScale(S);
      canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) gDragging = true;
      });
      window.addEventListener('mouseup', () => {
        gDragging = false;
        applyGeometry(0, 0, 28, 28);
      });
      requestAnimationFrame(render);
    },
    setState: (s) => { state = s; },
    getState: () => state,
    setLevel: (v) => { level = v; },
    setBadge: (n) => { badge = n; },
    setEmote: (s) => { emote = s; },
    setHealSeconds: (s) => { healMs = Math.max(1, s) * 1000; },
    setMotion: (x, y) => { gvManual = true; gvx = x; gvy = y; },
    getDamage: () => damage,
    setDamage: (n) => {
      const grew = n > damage;
      damage = Math.max(0, Math.min(20, n));
      lastHeal = performance.now();
      rebuildTones();
      if (grew) shakeUntil = performance.now() + 350;
    },
  };
})();
