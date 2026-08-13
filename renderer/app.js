// Wires the goblin, the wake word, and the realtime session together.
(async () => {
  const canvas = document.getElementById('goblin');
  const cfg = await window.chud.getConfig();
  const pendingResults = [];
  const Wake = cfg.wakeEngine === 'local' ? WakeLocal : WakeOpenAI;
  window.Wake = Wake;

  Goblin.setScale(cfg.spriteScale || 4);
  Goblin.setHealSeconds(cfg.healSeconds || 180);
  Goblin.start();

  if (cfg.screenshotMode) {
    const q = new URLSearchParams(location.search);
    Goblin.setState(q.get('pose') || 'talking');
    Goblin.setLevel(0.5);
    Goblin.setBadge(Number(q.get('badge') || 0));
    Goblin.setDamage(Number(q.get('damage') || 0));
    Goblin.setEmote(q.get('emote') || null);
    return;
  }

  // 8-bit square wave blips for wake acknowledgment and background events.
  const beepCtx = new AudioContext();
  function beep(freqs, dur = 0.07) {
    let t = beepCtx.currentTime;
    for (const f of freqs) {
      const osc = beepCtx.createOscillator();
      const gain = beepCtx.createGain();
      osc.type = 'square';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(beepCtx.destination);
      osc.start(t);
      osc.stop(t + dur);
      t += dur;
    }
  }

  VoiceFX.ensure(cfg);

  // Emotes: ? listening, ! answering, ... thinking, ~ agents working, blank idle.
  let agentsRunning = 0;
  function refreshIdleEmote() {
    if (!RT.isConnected()) Goblin.setEmote(agentsRunning > 0 ? '~' : null);
  }

  // All of chud's audio flows through VoiceFX; one level loop owns the
  // mouth and the talking state, whatever the source.
  let quietSince = 0;
  VoiceFX.onLevel((v) => {
    Goblin.setLevel(v);
    if (v > 0.03) {
      quietSince = 0;
      if (Goblin.getState() !== 'talking') {
        Goblin.setState('talking');
        if (RT.isConnected()) Goblin.setEmote('!');
      }
      if (RT.isConnected()) RT.poke();
    } else if (Goblin.getState() === 'talking') {
      const now = Date.now();
      if (!quietSince) quietSince = now;
      else if (now - quietSince > 350) {
        quietSince = 0;
        if (RT.isConnected()) {
          Goblin.setState('listening');
          Goblin.setEmote('?');
        } else {
          Goblin.setState(Goblin.getDamage() > 0 ? 'grumpy' : 'idle');
          refreshIdleEmote();
        }
      }
    }
  });

  const hooks = {
    onConnect: () => {
      Goblin.setState('listening');
      Goblin.setEmote('?');
      flushPending();
    },
    onListening: () => {
      Goblin.setState('listening');
      Goblin.setEmote('?');
    },
    onThinking: () => {
      Goblin.setState('thinking');
      Goblin.setEmote('dots');
    },
    onResponseDone: () => {
      if (RT.isConnected()) {
        Goblin.setState('listening');
        Goblin.setEmote('?');
      }
    },
    onToolStart: () => {
      Goblin.setState('thinking');
      Goblin.setEmote('dots');
    },
    onToolEnd: (name, result) => {
      if (name === 'spawn_agent' && result && result.id) agentsRunning++;
    },
    onDisconnect: () => {
      Goblin.setState('idle');
      Goblin.setLevel(0);
      refreshIdleEmote();
      Wake.resume();
    },
    onError: () => {},
  };

  function flushPending() {
    if (!pendingResults.length || !RT.isConnected()) return;
    const lines = pendingResults.splice(0).map(
      (d) => `Agent ${d.id} (${d.model}) is ${d.status}. Task: ${d.task}. Output tail: ${d.summary.slice(-500)}`
    );
    Goblin.setBadge(0);
    RT.say(`Background agent updates arrived while disconnected. Briefly tell Josh: ${lines.join(' | ')}`);
  }

  async function startSession() {
    if (RT.isConnected() || RT.isConnecting()) return;
    beep([660, 880]);
    Goblin.setState('listening');
    Wake.pause();
    try {
      await RT.connect(cfg, hooks);
    } catch (err) {
      console.error('connect failed', err);
      Goblin.setState('grumpy');
      beep([220, 160], 0.12);
      setTimeout(() => {
        if (!RT.isConnected()) Goblin.setState('idle');
      }, 2500);
      Wake.resume();
    }
  }

  window.chud.onAgentDone((d) => {
    agentsRunning = Math.max(0, agentsRunning - 1);
    refreshIdleEmote();
    if (RT.isConnected()) {
      RT.say(`Agent ${d.id} (${d.model}) just finished with status ${d.status}. Task: ${d.task}. Output tail: ${d.summary.slice(-500)}. Give Josh a one or two sentence summary.`);
    } else {
      pendingResults.push(d);
      Goblin.setBadge(pendingResults.length);
      beep([520, 780, 1040], 0.06);
    }
  });

  window.chud.onMenuCmd((cmd) => {
    if (cmd === 'toggle-mute') Wake.setMuted(!Wake.isMuted());
    if (cmd === 'disconnect') RT.disconnect('menu');
  });

  // Wet lettuce-head crunch from lib/crunchcore, randomized per hit.
  function crunch() {
    const samples = CrunchCore.renderCrunch(beepCtx.sampleRate);
    const buf = beepCtx.createBuffer(1, samples.length, beepCtx.sampleRate);
    buf.copyToChannel(samples, 0);
    const src = beepCtx.createBufferSource();
    src.buffer = buf;
    src.connect(beepCtx.destination);
    src.start();
  }

  // Each hit plays the crunch plus the preset grunt for the new damage
  // stage. Punches splat blood behind him; wall bounces splat at the wall
  // (the main process spawns that one at the impact point).
  function ouch(fromBounce) {
    const d = Math.min(20, Goblin.getDamage() + 1);
    Goblin.setDamage(d);
    crunch();
    if (!fromBounce) window.chud.splat();
    const grunt = Math.min(10, Math.ceil(d / 2));
    VoiceFX.playUrl(`chud://app/assets/grunts/hit${grunt}.wav`).catch(() => {});
  }
  window.chud.onBounceHurt(() => ouch(true));

  // Only a clean left tap toggles the session: not a drag, not a fling
  // catch, not anything that just punched him. Grabbing pauses the drift.
  let down = null;
  let dragged = false;
  let lastPunch = 0;
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const d = { x: e.screenX, y: e.screenY, t: Date.now(), wasFlinging: false };
    down = d;
    dragged = false;
    window.chud.grab().then((r) => {
      if (down === d) down.wasFlinging = r.wasFlinging;
    });
  });
  window.addEventListener('mousemove', (e) => {
    if (!down) return;
    const dx = e.screenX - down.x;
    const dy = e.screenY - down.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragged = true;
    if (dragged) {
      window.chud.moveBy(dx, dy);
      down.x = e.screenX;
      down.y = e.screenY;
    }
  });
  window.addEventListener('mouseup', () => {
    if (!down) return;
    const cleanTap = !dragged && Date.now() - down.t < 400
      && !down.wasFlinging && Date.now() - lastPunch > 500;
    window.chud.dragState(false);
    down = null;
    if (cleanTap) {
      if (RT.isConnected()) RT.disconnect('click');
      else startSession();
    }
  });
  // Right click punches him. Hold alt while right clicking for the menu.
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    lastPunch = Date.now();
    if (e.altKey) window.chud.menu({ muted: Wake.isMuted(), connected: RT.isConnected() });
    else ouch();
  });

  try {
    await Wake.init(cfg, startSession);
  } catch (err) {
    console.error('wake init failed', err);
    Goblin.setState('grumpy');
  }
})();
