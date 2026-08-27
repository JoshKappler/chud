// Web build wiring: no Electron, no mic, no live model. He renders on a
// fake desktop, gets flung around, takes hits, and answers from a bank
// of pre-rendered lines.
(async () => {
  const cfg = { spriteScale: 4, healSeconds: 10, voiceFx: { enabled: true, pitch: 0.8, gravel: 0.35 } };
  const canvas = document.getElementById('goblin');
  const field = document.getElementById('field');
  const subtitle = document.getElementById('subtitle');
  const talkBtn = document.getElementById('talk');

  Goblin.setScale(cfg.spriteScale);
  Goblin.setHealSeconds(cfg.healSeconds);
  Goblin.start();

  const clock = document.getElementById('clock');
  const setClock = () => { clock.textContent = new Date().toTimeString().slice(0, 5); };
  setClock();
  setInterval(setClock, 30000);

  const lines = await fetch('lines.json').then((r) => r.json());
  let lineAt = Math.floor(Math.random() * lines.length);

  // Audio waits on the first gesture; browsers refuse an AudioContext
  // before one.
  let audioOn = false;
  function ensureAudio() {
    if (audioOn) return;
    audioOn = true;
    VoiceFX.ensure(cfg);
    for (let band = 1; band <= 4; band++) {
      for (let v = 1; v <= 4; v++) {
        VoiceFX.preload(`assets/grunts/scream${band}-${v}.wav`).catch(() => {});
      }
    }
    for (const l of lines) VoiceFX.preload(`lines/${l.file}`).catch(() => {});

    let quietSince = 0;
    VoiceFX.onLevel((v) => {
      Goblin.setLevel(v);
      if (v > 0.03) {
        quietSince = 0;
        if (Goblin.getState() !== 'talking') Goblin.setState('talking');
      } else if (Goblin.getState() === 'talking') {
        const now = Date.now();
        if (!quietSince) quietSince = now;
        else if (now - quietSince > 350) {
          quietSince = 0;
          Goblin.setState(Goblin.getDamage() > 0 ? 'grumpy' : 'idle');
        }
      }
    });
  }
  field.addEventListener('pointerdown', ensureAudio);

  function crunch() {
    const ctx = VoiceFX.getCtx();
    if (!ctx) return;
    const samples = CrunchCore.renderCrunch(ctx.sampleRate);
    const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buf.copyToChannel(samples, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
  }

  // Same scream picker as the desktop: 4 severity bands x 4 takes, a
  // take rests until two others from its band have played.
  const screamHist = {};
  function pickScream(damage) {
    const band = Math.min(4, Math.max(1, Math.ceil(damage / 5)));
    const hist = screamHist[band] || (screamHist[band] = []);
    const takes = [1, 2, 3, 4].filter((v) => !hist.includes(v));
    const v = takes[Math.floor(Math.random() * takes.length)];
    hist.unshift(v);
    if (hist.length > 2) hist.pop();
    return `scream${band}-${v}.wav`;
  }

  const EDGES = ['left', 'right', 'top', 'bottom'];
  function ouch(fromWall) {
    ensureAudio();
    const d = Math.min(20, Goblin.getDamage() + 1);
    Goblin.setDamage(d);
    if (!fromWall) Goblin.impact(600 + Math.random() * 900, EDGES[Math.floor(Math.random() * 4)], null);
    crunch();
    VoiceFX.playUrl(`assets/grunts/${pickScream(d)}`).catch(() => {});
  }

  Fling.init({
    canvas,
    field,
    hooks: {
      onPunch: () => ouch(false),
      onSlam: (edge, speed, hurt) => {
        Goblin.impact(speed, edge, null);
        if (hurt) ouch(true);
      },
    },
  });

  talkBtn.addEventListener('click', () => {
    ensureAudio();
    const line = lines[lineAt % lines.length];
    lineAt++;
    subtitle.textContent = line.text;
    VoiceFX.playUrl(`lines/${line.file}`).then(() => {
      if (subtitle.textContent === line.text) subtitle.textContent = '';
    }).catch(() => {
      subtitle.textContent = '(he refuses to load)';
    });
  });
})();
