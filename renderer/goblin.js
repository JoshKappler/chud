// 8-bit goblin on a spring-loaded skinbag. The face is drawn from a
// character grid into a 28x28 offscreen texture, then rendered through a
// WebGL quad grid whose vertices chase the window's motion on an
// underdamped spring: accelerate and the skin stretches out behind him,
// stop and it snaps back, overshoots and wobbles; hard reversals squash
// him flat before he rebounds. The head sits centered in a fixed window
// padded by PAD cells on every side so the tail always fits.
const Goblin = (() => {
  const canvas = document.getElementById('goblin');
  const HEAD = 28;
  const PAD = 28;
  const GRID = HEAD + 2 * PAD;
  let S = 4;
  const OY = 1;

  const face = document.createElement('canvas');
  face.width = HEAD;
  face.height = HEAD;
  const faceCtx = face.getContext('2d');
  const over = document.createElement('canvas');
  over.width = HEAD;
  over.height = HEAD;
  const overCtx = over.getContext('2d');
  let target = faceCtx;
  let overDrawn = false;

  const PAL = {
    o: '#131a0c', g: '#57a63f', d: '#37702a', l: '#8fd457',
    e: '#ffd83d', p: '#1b140d', w: '#f5efd7', m: '#33121a',
    t: '#b33a3a', n: '#274d1e', b: '#5b3b6e', B: '#2e1d3f',
    r: '#b00e22', R: '#7c0817', W: '#cfc6aa',
  };

  const BASE = [
    '.............oo.............',
    '............olgo............',
    '..........olgggggo..........',
    '.........olggggggdo.........',
    '........olggggggggdo........',
    'oo.....olggggggggggdo.....oo',
    'olggo..olggggggggggdo..oggdo',
    'olggggglggggggggggggggggggdo',
    '.oggggglgggggggggggggggggdo.',
    '..ogggglgggggggggggggggggo..',
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

  // One skull map drives both the stage-20 face and the decay reveal:
  // brow ridge, temple hollows, cheekbones and gum line in shaded bone,
  // a forked crack across the crown, a triangular nasal aperture, and a
  // gap-toothed grin with one tooth knocked out.
  function buildSkull() {
    skullMap = new Map();
    const put = (x, y, c) => skullMap.set(x + ',' + y, c);
    for (let y = 0; y < BASE.length; y++) {
      for (let x = 0; x < BASE[y].length; x++) {
        const c = BASE[y][x];
        if (c !== '.') put(x, y, c === 'o' ? 'o' : 'w');
      }
    }
    for (let xx = 8; xx <= 12; xx++) put(xx, 8, 'W');
    for (let xx = 15; xx <= 19; xx++) put(xx, 8, 'W');
    const SHADES = [[8, 7], [7, 8], [19, 7], [20, 8], [7, 11], [8, 12],
      [20, 11], [19, 12], [8, 14], [19, 14], [13, 18], [14, 18]];
    for (const [x, y] of SHADES) put(x, y, 'W');
    for (let yy = 0; yy < 4; yy++) {
      for (let xx = 0; xx < 4; xx++) {
        put(9 + xx, 9 + yy, 'p');
        put(15 + xx, 9 + yy, 'p');
      }
    }
    put(10, 10, 'e');
    put(17, 10, 'e');
    for (let xx = 9; xx <= 12; xx++) put(xx, 13, 'W');
    for (let xx = 15; xx <= 18; xx++) put(xx, 13, 'W');
    put(13, 11, 'p');
    put(13, 12, 'p');
    put(14, 12, 'p');
    for (const xx of [12, 13, 14, 15]) put(xx, 13, 'p');
    put(13, 14, 'p');
    put(14, 14, 'p');
    for (const xx of [10, 11, 12, 15, 16, 17]) put(xx, 14, 'W');
    for (let xx = 9; xx <= 18; xx++) {
      put(xx, 15, 'w');
      put(xx, 16, xx % 2 ? 'o' : 'w');
    }
    for (const xx of [11, 14, 17]) put(xx, 15, 'o');
    put(12, 15, 'p');
    put(12, 16, 'p');
    const CRACK = [[12, 2], [12, 3], [13, 4], [13, 5], [14, 6], [16, 5], [16, 6], [17, 7]];
    for (const [x, y] of CRACK) put(x, y, 'o');
  }

  function buildDecayMaps() {
    if (!skullMap) buildSkull();
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
  let lastFrameT = 0;

  // Skin state comes from lib/skinphys: the lag vector rides the
  // base-excited spring on the motion's real derivative chain, squash
  // pumps on braking, flutter reads snap, crackle and pop.
  const skin = SkinPhys.createSkin();
  let lagX = 0, lagY = 0;
  let sq = 0;
  let flutter = 0;
  let dirX = 0, dirY = 1;
  let impactAt = -1e9;
  let impactK = 0;

  // Damage 15+: the eyes hang out of their sockets on optic threads,
  // each a damped pendulum blown around by the same skin lag; different
  // frequencies keep the two from swinging in sync.
  const pendL = { th: 0.4, w: 0 };
  const pendR = { th: -0.3, w: 0 };
  function stepPend(p, dt, wf) {
    const targ = Math.atan2(lagX * 0.008, 22 + lagY * 0.008);
    p.w += (-wf * wf * Math.sin(p.th - targ) - 1.7 * p.w) * dt;
    p.th += p.w * dt;
  }

  // Stretch grows continuously with the lag magnitude: a hint past a slow
  // drag, a full extra head-length around 1500 px/s, capped at 1.2 extra
  // (about 2.2x total breadth) when flung hard.
  function extension(sp) {
    return Math.min(1.2, Math.pow(Math.max(0, sp - 100) / 1400, 1.25));
  }

  function smooth(a, b, v) {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function px(x, y, c) {
    target.fillStyle = tonePal[c] || PAL[c];
    target.fillRect(x + offX, y, 1, 1);
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
    if (damage >= 4) {
      faceCtx.clearRect(1 + offX, 5 + dy, 1, 1);
      faceCtx.clearRect(2 + offX, 6 + dy, 1, 1);
    }
    if (damage >= 6) {
      faceCtx.clearRect(26 + offX, 5 + dy, 1, 1);
      faceCtx.clearRect(25 + offX, 6 + dy, 1, 1);
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
    overDrawn = true;
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
    overDrawn = true;
    const text = String(Math.min(badge, 9));
    overCtx.fillStyle = PAL.m;
    overCtx.fillRect(21, 21, 5, 7);
    drawMap(DIGITS[text], 22, 22);
  }

  function drawSkullFace(dy, jaw) {
    if (!skullMap) buildSkull();
    for (const [key, c] of skullMap) {
      const [x, y] = key.split(',').map(Number);
      px(x, y + dy + (y >= 15 ? jaw : 0), c);
    }
  }

  function drawMouth(dy) {
    const m = MOUTHS[mouthFrame()];
    let rows = damage >= 3 ? m.rows.map((r) => (r[0] === 'w' ? '.' + r.slice(1) : r)) : m.rows;
    if (damage >= 6) rows = rows.map((r) => (r[r.length - 1] === 'w' ? r.slice(0, -1) + '.' : r));
    drawMap(rows, MOUTH_X, m.y + dy);
  }

  // Black sagging gaps trail each eye. Direction weights crossfade the
  // side placement so a swung angle blends instead of snapping.
  function drawGaps(dy, gA, deepA) {
    const wH = dirX * dirX;
    const wV = dirY * dirY;
    for (const anchor of [EYE_L, EYE_R]) {
      if (wH > 0.02) {
        faceCtx.globalAlpha = gA * wH;
        const gx = dirX < 0 ? anchor.x - 1 : anchor.x + 4;
        for (let yy = 0; yy <= 3; yy++) px(gx, anchor.y + yy + dy, 'o');
        if (deepA > 0.02) {
          faceCtx.globalAlpha = gA * wH * deepA;
          const gx2 = gx + (dirX < 0 ? -1 : 1);
          for (let yy = 1; yy <= 3; yy++) px(gx2, anchor.y + yy + dy, 'o');
        }
      }
      if (wV > 0.02) {
        faceCtx.globalAlpha = gA * wV;
        const gy = dirY < 0 ? anchor.y - 2 : anchor.y + 3;
        const temple = anchor === EYE_L ? anchor.x - 1 : anchor.x + 4;
        for (let xx = 0; xx < 4; xx++) px(anchor.x + xx, gy + dy, 'o');
        px(temple, gy + dy, 'o');
        if (deepA > 0.02) {
          faceCtx.globalAlpha = gA * wV * deepA;
          px(anchor.x + 1, gy + (dirY < 0 ? -1 : 1) + dy, 'o');
          px(anchor.x + 2, gy + (dirY < 0 ? -1 : 1) + dy, 'o');
          px(temple + (anchor === EYE_L ? -1 : 1), gy + dy, 'o');
        }
      }
    }
    faceCtx.globalAlpha = 1;
  }

  function drawDanglingEyes(dy) {
    for (const [anchor, p] of [[EYE_L, pendL], [EYE_R, pendR]]) {
      for (let yy = 0; yy < 3; yy++)
        for (let xx = 0; xx < 4; xx++) px(anchor.x + xx, anchor.y + yy + dy, 'p');
      px(anchor.x, anchor.y + 3 + dy, 'R');
      px(anchor.x + 3, anchor.y + 3 + dy, 'R');
      const pivX = anchor.x + 1.5;
      const pivY = anchor.y + 1 + dy;
      const ex = pivX + Math.sin(p.th) * 4.5;
      const ey = pivY + Math.cos(p.th) * 4.5;
      for (let i = 1; i <= 4; i++) {
        px(Math.round(pivX + (ex - pivX) * (i / 4)), Math.round(pivY + (ey - pivY) * (i / 4)), 'R');
      }
      const bx = Math.round(ex - 1);
      const by = Math.round(ey);
      for (let yy = 0; yy < 3; yy++)
        for (let xx = 0; xx < 3; xx++) px(bx + xx, by + yy, 'e');
      const pdx = p.th > 0.25 ? 2 : p.th < -0.25 ? 0 : 1;
      px(bx + pdx, by + 2, 'p');
    }
  }

  // Ears shear toward the tip by the spring lag, so a yank flops them
  // and the snapback overshoot wobbles them.
  function drawEars(dy, earsUp) {
    const flop = damage >= 10 ? 0
      : Math.max(-3.5, Math.min(3.5, lagY * 0.009 + Math.min(2.5, Math.abs(lagX) * 0.005)));
    for (let y = 0; y <= 10; y++) {
      for (let x = 0; x < BASE[y].length; x++) {
        if (x > 6 && x < 21) continue;
        const c = BASE[y][x];
        if (c === '.') continue;
        const t = x <= 6 ? (6 - x) / 6 : (x - 21) / 6;
        px(x, y + dy + (earsUp ? -1 : 0) + Math.round(t * flop), c);
      }
    }
  }

  // Every feature scales with the smoothed lag, so nothing pops at a
  // speed threshold: wide eyes and a pursed mouth come in first, then
  // flapping lips and the eye gaps as the stretch deepens.
  function drawFace(now) {
    faceCtx.clearRect(0, 0, HEAD, HEAD);
    target = faceCtx;
    const bobSpeed = state === 'talking' ? 260 : state === 'listening' ? 400 : 900;
    const bob = Math.round(Math.sin(now / bobSpeed) * (state === 'idle' ? 0.6 : 1));
    const dy = OY + bob;
    if (damage >= 20) {
      const jaw = state === 'talking' && shownLevel > 0.1 ? 1 : 0;
      drawSkullFace(dy, jaw);
      px(9, 13 + dy, 'r');
      px(9, 14 + dy, 'R');
      px(18, 13 + dy, 'r');
      px(11, 2 + dy, 'r');
      px(17, 3 + dy, 'R');
      return;
    }

    const sp = Math.hypot(lagX, lagY);
    const E = extension(sp);
    const earsUp = (state === 'listening' || now < twitchUntil) && damage < 10;
    for (let y = 0; y < BASE.length; y++) {
      for (let x = 0; x < BASE[y].length; x++) {
        const c = BASE[y][x];
        if (c === '.' || ((x <= 6 || x >= 21) && y <= 10)) continue;
        px(x, y + dy, c);
      }
    }
    for (const [x, y, c] of WARTS) px(x, y + dy, c);
    drawEars(dy, earsUp);

    const dangling = damage >= 15;
    if (!dangling) {
      drawEye(EYE_L, dy, now);
      drawEye(EYE_R, dy, now);
    }
    const wideA = dangling ? 0 : smooth(220, 430, sp);
    if (wideA > 0.02) {
      faceCtx.globalAlpha = wideA;
      for (const anchor of [EYE_L, EYE_R]) {
        for (let yy = 0; yy < 4; yy++)
          for (let xx = 0; xx < 4; xx++) px(anchor.x + xx, anchor.y - 1 + yy + dy, 'e');
        const pdx = Math.abs(lagX) < sp / 3 ? 1 : lagX < 0 ? 0 : 2;
        px(anchor.x + pdx, anchor.y + 1 + dy, 'p');
        px(anchor.x + pdx + 1, anchor.y + 1 + dy, 'p');
      }
      faceCtx.globalAlpha = 1;
    }
    if (wideA < 0.98) {
      faceCtx.globalAlpha = 1 - wideA;
      drawBrows(dy);
      faceCtx.globalAlpha = 1;
    }
    drawNose(dy);

    const flapA = smooth(0.26, 0.48, E);
    if (wideA < 0.98) {
      faceCtx.globalAlpha = 1 - wideA;
      drawMouth(dy);
      faceCtx.globalAlpha = 1;
    }
    if (wideA > 0.02 && flapA < 0.98) {
      faceCtx.globalAlpha = wideA * (1 - flapA);
      drawMap(['.oo.', 'ommo', '.oo.'], 12, 14 + dy);
      faceCtx.globalAlpha = 1;
    }
    if (flapA > 0.02) {
      const flap = MOUTHS[Math.floor(now / 90) % 2 ? 2 : 3];
      faceCtx.globalAlpha = flapA;
      drawMap(flap.rows, MOUTH_X, flap.y + dy);
      faceCtx.globalAlpha = 1;
    }

    drawBruises(dy);
    drawBlood(dy);
    drawDecay(dy);

    const gapA = smooth(0.16, 0.36, E);
    if (gapA > 0.02 && !dangling) drawGaps(dy, gapA, smooth(0.7, 1.0, E));
    if (dangling) drawDanglingEyes(dy);
  }

  function drawOverlay(now) {
    overCtx.clearRect(0, 0, HEAD, HEAD);
    overDrawn = false;
    target = overCtx;
    drawEmote(now);
    drawBadge();
    target = faceCtx;
  }

  // WebGL: one quad per sprite cell, positions computed per frame in JS,
  // nearest-neighbor sampling keeps the pixel art crisp.
  let gl = null;
  let glLost = false;
  let posBuf = null;
  let faceTex = null;
  let overTex = null;
  const VN = HEAD + 1;
  const verts = new Float32Array(VN * VN * 2);
  const ident = new Float32Array(VN * VN * 2);
  const uvArr = new Float32Array(VN * VN * 2);
  const idxArr = new Uint16Array(HEAD * HEAD * 6);
  for (let j = 0; j < VN; j++) {
    for (let i = 0; i < VN; i++) {
      const n = j * VN + i;
      ident[n * 2] = PAD + i;
      ident[n * 2 + 1] = PAD + j;
      uvArr[n * 2] = i / HEAD;
      uvArr[n * 2 + 1] = j / HEAD;
    }
  }
  {
    let k = 0;
    for (let j = 0; j < HEAD; j++) {
      for (let i = 0; i < HEAD; i++) {
        const a = j * VN + i;
        idxArr[k++] = a; idxArr[k++] = a + 1; idxArr[k++] = a + VN;
        idxArr[k++] = a + 1; idxArr[k++] = a + VN + 1; idxArr[k++] = a + VN;
      }
    }
  }

  function makeTex() {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  function initGL() {
    gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true });
    if (!gl) {
      console.error('goblin: webgl unavailable, nothing will render');
      return;
    }
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, 'attribute vec2 aPos; attribute vec2 aUV; varying vec2 vUV;'
      + 'void main() { vUV = aUV; gl_Position = vec4(aPos.x / ' + (GRID / 2)
      + '.0 - 1.0, 1.0 - aPos.y / ' + (GRID / 2) + '.0, 0.0, 1.0); }');
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, 'precision mediump float; varying vec2 vUV; uniform sampler2D uTex;'
      + 'void main() { gl_FragColor = texture2D(uTex, vUV); }');
    gl.compileShader(fs);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);
    posBuf = gl.createBuffer();
    const uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, uvArr, gl.STATIC_DRAW);
    const aUV = gl.getAttribLocation(prog, 'aUV');
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxArr, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    faceTex = makeTex();
    overTex = makeTex();
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function glDraw() {
    if (!gl || glLost) return;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D, faceTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, face);
    gl.drawElements(gl.TRIANGLES, idxArr.length, gl.UNSIGNED_SHORT, 0);
    if (!overDrawn) return;
    gl.bufferData(gl.ARRAY_BUFFER, ident, gl.DYNAMIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D, overTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, over);
    gl.drawElements(gl.TRIANGLES, idxArr.length, gl.UNSIGNED_SHORT, 0);
  }

  // Sock deformation: the side leading the acceleration stays gripped,
  // the trailing side lags on a 60/40 linear-cubic profile, rippling and
  // thinning toward the tip. When the tail outgrows the pad the whole
  // sock advances a little instead of clipping. A wall impact goes water
  // balloon: everything within the plaster distance lands flat ON the
  // wall plane, the rest packs into the remaining sliver (3.5 cells at a
  // full-speed slam), and the mass bulges sideways up to double breadth,
  // widest right at the glass.
  function deform(now) {
    const sp = Math.hypot(lagX, lagY);
    const E = extension(sp);
    const it = now - impactAt;
    const squish = it >= 0 && it < 700
      ? impactK * Math.min(1, it / 40) * Math.exp(-Math.max(0, it - 90) / 150)
      : 0;
    if (E < 0.01 && Math.abs(sq) < 0.01 && flutter < 0.05 && squish < 0.01) {
      verts.set(ident);
      return;
    }
    const ux = dirX;
    const uy = dirY;
    const c = PAD + HEAD / 2;
    const adv = Math.max(0, E * HEAD - (PAD - 2));
    const amp = Math.min(2.5, 2.2 * E);
    const axS = 1 - 0.35 * sq;
    const offS = 1 + 0.3 * sq;
    const mix = Math.min(1, squish * 8);
    const plaster = 9.5 * squish;
    const depth = HEAD * (1 - 0.875 * squish);
    const packK = depth / (HEAD - plaster);
    for (let n = 0; n < VN * VN; n++) {
      const bx = ident[n * 2] - c;
      const by = ident[n * 2 + 1] - c;
      const p = -(bx * ux + by * uy);
      const o = bx * uy - by * ux;
      const a = Math.min(1, Math.max(0, (14 - p) / HEAD));
      const ease = a * (0.6 + 0.4 * a * a);
      const disp = (E * HEAD * ease - adv) * (1 - squish);
      const wave = amp * a * a * Math.sin(now / 70 - a * 5)
        + flutter * 1.1 * Math.sin(now / 24 + a * 7 + o * 0.9);
      let p2 = p * axS;
      let spread = 1;
      if (mix) {
        const d2 = Math.max(0, (14 - p) - plaster) * packK;
        p2 = (14 - d2) * mix + p2 * (1 - mix);
        spread = 1 + mix * squish * (1 - 0.65 * Math.min(1, d2 / depth));
      }
      p2 -= disp;
      const o2 = (o + wave) * offS * (1 - 0.18 * E * a * a) * spread;
      const wx = c - ux * p2 + uy * o2;
      const wy = c - uy * p2 - ux * o2;
      verts[n * 2] = Math.min(GRID - 0.5, Math.max(0.5, wx));
      verts[n * 2 + 1] = Math.min(GRID - 0.5, Math.max(0.5, wy));
    }
  }

  function setScale(n) {
    S = n;
    canvas.width = GRID * S;
    canvas.height = GRID * S;
    if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function render(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameT) / 1000));
    lastFrameT = now;

    // Raw window velocity from the window's own screen position; the
    // skinphys filter chain owns all smoothing so a yank reaches the
    // skin the frame it happens. setMotion overrides for test pages.
    if (!gvManual) {
      if (lastPX === null) {
        lastPX = window.screenX;
        lastPY = window.screenY;
        lastPT = now;
      } else if (now > lastPT) {
        const gdt = (now - lastPT) / 1000;
        gvx = (window.screenX - lastPX) / gdt;
        gvy = (window.screenY - lastPY) / gdt;
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

    const sk = skin.step(gvx, gvy, dt);
    lagX = sk.lagX;
    lagY = sk.lagY;
    sq = sk.sq;
    flutter = sk.flutter;
    dirX = sk.dirX;
    dirY = sk.dirY;
    if (damage >= 15 && damage < 20) {
      stepPend(pendL, dt, 7.5);
      stepPend(pendR, dt, 8.7);
    }
    drawFace(now);
    drawOverlay(now);
    deform(now);
    glDraw();

    requestAnimationFrame(render);
  }

  return {
    setScale,
    start: () => {
      initGL();
      setScale(S);
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); glLost = true; });
      canvas.addEventListener('webglcontextrestored', () => { glLost = false; initGL(); });
      requestAnimationFrame(render);
    },
    setState: (s) => { state = s; },
    getState: () => state,
    setLevel: (v) => { level = v; },
    setBadge: (n) => { badge = n; },
    setEmote: (s) => { emote = s; },
    setHealSeconds: (s) => { healMs = Math.max(1, s) * 1000; },
    setMotion: (x, y) => { gvManual = true; gvx = x; gvy = y; },
    impact: (speed) => {
      impactAt = performance.now();
      impactK = Math.min(1, Math.max(0.2, ((speed || 900) - 300) / 2300));
      skin.impulse(Math.min(9, (speed || 900) / 320));
    },
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
