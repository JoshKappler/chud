// Wires the goblin, the wake word, and the realtime session together.
(async () => {
  const canvas = document.getElementById('goblin');
  const cfg = await window.chud.getConfig();
  const pendingResults = [];
  const Wake = cfg.wakeEngine === 'local' ? WakeLocal : WakeOpenAI;
  window.Wake = Wake;

  Goblin.setScale(cfg.spriteScale || 4);
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

  // Emotes: ? listening, ! answering, ... thinking, ~ agents working, blank idle.
  let agentsRunning = 0;
  function refreshIdleEmote() {
    if (!RT.isConnected()) Goblin.setEmote(agentsRunning > 0 ? '~' : null);
  }

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
    onLevel: (v) => {
      Goblin.setLevel(v);
      if (v > 0.03 && Goblin.getState() !== 'talking') {
        Goblin.setState('talking');
        Goblin.setEmote('!');
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

  // Plays one-shot voice lines (PCM16 24kHz chunks from the main process)
  // and drives the mouth while they play.
  let ttsCtx = null;
  let ttsTime = 0;
  let ttsPlaying = 0;
  window.chud.onTtsPcm((b64) => {
    if (!ttsCtx) ttsCtx = new AudioContext({ sampleRate: 24000 });
    const raw = atob(b64);
    const n = Math.floor(raw.length / 2);
    if (!n) return;
    const f = new Float32Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      let v = raw.charCodeAt(2 * i) | (raw.charCodeAt(2 * i + 1) << 8);
      if (v >= 0x8000) v -= 0x10000;
      f[i] = v / 32768;
      sum += f[i] * f[i];
    }
    const rms = Math.sqrt(sum / n);
    const buf = ttsCtx.createBuffer(1, n, 24000);
    buf.copyToChannel(f, 0);
    const src = ttsCtx.createBufferSource();
    src.buffer = buf;
    src.connect(ttsCtx.destination);
    const start = Math.max(ttsTime, ttsCtx.currentTime + 0.05);
    src.start(start);
    ttsTime = start + buf.duration;
    ttsPlaying++;
    setTimeout(() => {
      if (!RT.isConnected()) {
        Goblin.setState('talking');
        Goblin.setLevel(rms * 2);
      }
    }, Math.max(0, (start - ttsCtx.currentTime) * 1000));
    src.onended = () => {
      ttsPlaying--;
      if (ttsPlaying <= 0 && !RT.isConnected()) {
        Goblin.setLevel(0);
        Goblin.setState(Goblin.getDamage() > 0 ? 'grumpy' : 'idle');
        refreshIdleEmote();
      }
    };
  });

  function punch() {
    const d = Math.min(5, Goblin.getDamage() + 1);
    Goblin.setDamage(d);
    beep([180, 120], 0.09);
    const prompt = `Josh just punched you. That is hit ${d} of 5. React out loud with ONE short goblin voice line, more despairing, broken and pitiful than the last time. No retaliation, just escalating goblin misery.`;
    if (RT.isConnected()) RT.say(prompt);
    else window.chud.oneshot(prompt).catch(() => {});
  }

  // Manual drag keeps click events usable: click toggles the session.
  let down = null;
  let dragged = false;
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    down = { x: e.screenX, y: e.screenY, t: Date.now() };
    dragged = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (!down) return;
    const dx = e.screenX - down.x;
    const dy = e.screenY - down.y;
    if (Math.abs(dx) + Math.abs(dy) > 3 && !dragged) {
      dragged = true;
      window.chud.dragState(true);
    }
    if (dragged) {
      window.chud.moveBy(dx, dy);
      down = { x: e.screenX, y: e.screenY };
    }
  });
  window.addEventListener('mouseup', () => {
    if (down && !dragged && Date.now() - down.t < 400) {
      if (RT.isConnected()) RT.disconnect('click');
      else startSession();
    }
    if (dragged) window.chud.dragState(false);
    down = null;
  });
  // Right click punches him. Hold alt while right clicking for the menu.
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (e.altKey) window.chud.menu({ muted: Wake.isMuted(), connected: RT.isConnected() });
    else punch();
  });

  try {
    await Wake.init(cfg, startSession);
  } catch (err) {
    console.error('wake init failed', err);
    Goblin.setState('grumpy');
  }
})();
