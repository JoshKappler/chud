// 8-bit goblin sprite. Drawn from a character grid plus overlays for eyes, mouth,
// brows, thinking dots and the agent badge. All coordinates are logical pixels.
const Goblin = (() => {
  const canvas = document.getElementById('goblin');
  const ctx = canvas.getContext('2d');
  let S = 4;
  const OY = 1;

  function setScale(n) {
    S = n;
    canvas.width = 28 * S;
    canvas.height = 28 * S;
  }

  const PAL = {
    o: '#131a0c', g: '#57a63f', d: '#37702a', l: '#8fd457',
    e: '#ffd83d', p: '#1b140d', w: '#f5efd7', m: '#33121a',
    t: '#b33a3a', n: '#274d1e', b: '#5b3b6e', B: '#2e1d3f',
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

  function px(x, y, c) {
    ctx.fillStyle = PAL[c];
    ctx.fillRect((x + offX) * S, y * S, S, S);
  }

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
  };

  function drawBruises(dy) {
    for (const lvl of [3, 4, 5]) {
      if (damage < lvl) continue;
      for (const [x, y, c] of BLOTCHES[lvl]) px(x, y + dy, c);
    }
    if (damage >= 4) {
      ctx.clearRect((1 + offX) * S, (5 + dy) * S, S, S);
      ctx.clearRect((2 + offX) * S, (6 + dy) * S, S, S);
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
    ctx.fillRect(21 * S, 21 * S, 5 * S, 7 * S);
    drawMap(DIGITS[text], 22, 22);
  }

  function render(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (now > nextBlink) { blinkUntil = now + 140; nextBlink = now + 2200 + Math.random() * 3800; }
    if (now > nextTwitch) { twitchUntil = now + 160; nextTwitch = now + 3500 + Math.random() * 5000; }
    if (now > nextLook) { look = Math.floor(Math.random() * 3); nextLook = now + 1500 + Math.random() * 3000; }
    if (damage > 0 && now - lastHeal > 180000) { damage--; lastHeal = now; }
    offX = now < shakeUntil ? (Math.random() < 0.5 ? -1 : 1) : 0;

    shownLevel = Math.max(level, shownLevel * 0.75);

    const bobSpeed = state === 'talking' ? 260 : state === 'listening' ? 400 : 900;
    const bob = Math.round(Math.sin(now / bobSpeed) * (state === 'idle' ? 0.6 : 1));
    const earsUp = state === 'listening' || now < twitchUntil;

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
    const rows = damage >= 3 ? m.rows.map((r) => (r[0] === 'w' ? '.' + r.slice(1) : r)) : m.rows;
    drawMap(rows, MOUTH_X, m.y + dy);
    drawBruises(dy);
    drawEmote(now);
    drawBadge();

    requestAnimationFrame(render);
  }

  return {
    setScale,
    start: () => { setScale(S); requestAnimationFrame(render); },
    setState: (s) => { state = s; },
    getState: () => state,
    setLevel: (v) => { level = v; },
    setBadge: (n) => { badge = n; },
    setEmote: (s) => { emote = s; },
    getDamage: () => damage,
    setDamage: (n) => {
      const grew = n > damage;
      damage = Math.max(0, Math.min(5, n));
      lastHeal = performance.now();
      if (grew) shakeUntil = performance.now() + 350;
    },
  };
})();
