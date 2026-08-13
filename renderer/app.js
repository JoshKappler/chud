// Wires the goblin, the wake word, and the realtime session together.
(async () => {
  const canvas = document.getElementById('goblin');
  const cfg = await window.chud.getConfig();
  const pendingResults = [];

  Goblin.start();

  if (cfg.screenshotMode) {
    Goblin.setState(new URLSearchParams(location.search).get('pose') || 'talking');
    Goblin.setLevel(0.5);
    Goblin.setBadge(Number(new URLSearchParams(location.search).get('badge') || 0));
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

  const hooks = {
    onConnect: () => {
      Goblin.setState('listening');
      flushPending();
    },
    onListening: () => Goblin.setState('listening'),
    onThinking: () => Goblin.setState('thinking'),
    onResponseDone: () => {
      if (RT.isConnected()) Goblin.setState('listening');
    },
    onLevel: (v) => {
      Goblin.setLevel(v);
      if (v > 0.03 && Goblin.getState() !== 'talking') Goblin.setState('talking');
    },
    onToolStart: () => Goblin.setState('thinking'),
    onDisconnect: () => {
      Goblin.setState('idle');
      Goblin.setLevel(0);
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

  // Manual drag keeps click events usable: click toggles the session.
  let down = null;
  let dragged = false;
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    down = { x: e.screenX, y: e.screenY };
    dragged = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (!down) return;
    const dx = e.screenX - down.x;
    const dy = e.screenY - down.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragged = true;
    if (dragged) {
      window.chud.moveBy(dx, dy);
      down = { x: e.screenX, y: e.screenY };
    }
  });
  window.addEventListener('mouseup', () => {
    if (down && !dragged) {
      if (RT.isConnected()) RT.disconnect('click');
      else startSession();
    }
    down = null;
  });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    window.chud.menu({ muted: Wake.isMuted(), connected: RT.isConnected() });
  });

  try {
    await Wake.init(cfg, startSession);
  } catch (err) {
    console.error('wake init failed', err);
    Goblin.setState('grumpy');
  }
})();
