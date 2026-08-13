const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const agents = new Map();
let nextId = 1;
let notify = () => {};

function setNotify(fn) { notify = fn; }

function expand(p) {
  if (!p) return os.homedir();
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

function run(cmd, args, timeoutMs = 5000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || err || '') });
    });
  });
}

function schemas() {
  return [
    {
      type: 'function',
      name: 'spawn_agent',
      description: 'Spin up a coding/research agent (Claude Code) to do real work in the background. Returns an id immediately; the result is announced when the agent finishes. Speed tiers: fast = quick lookups and tiny edits, standard = normal coding tasks, deep = hard multi-step work.',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'Full task description for the agent, self-contained.' },
          speed: { type: 'string', enum: ['fast', 'standard', 'deep'], description: 'Speed/quality tier. Default standard.' },
          model: { type: 'string', description: 'Optional explicit model override, e.g. haiku, sonnet, opus, fable.' },
        },
        required: ['task'],
      },
    },
    {
      type: 'function',
      name: 'agent_status',
      description: 'List all agents spawned this session with their status.',
      parameters: { type: 'object', properties: {} },
    },
    {
      type: 'function',
      name: 'agent_result',
      description: 'Get the output of a finished agent by id.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    {
      type: 'function',
      name: 'open_path',
      description: 'Open a file or folder on the Mac with its default app.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Absolute path, ~ allowed.' } },
        required: ['path'],
      },
    },
    {
      type: 'function',
      name: 'reveal_path',
      description: 'Reveal a file or folder in Finder.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
    {
      type: 'function',
      name: 'open_app',
      description: 'Open or focus a Mac application by name, e.g. Slack, Safari, Terminal.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
    },
    {
      type: 'function',
      name: 'open_url',
      description: 'Open a URL in the default browser.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
      },
    },
    {
      type: 'function',
      name: 'end_session',
      description: 'Hang up the voice session. Call this when Josh says thanks chud, thank you chud, or is clearly done talking.',
      parameters: { type: 'object', properties: {} },
    },
    {
      type: 'function',
      name: 'find_files',
      description: 'Search the Mac file index (Spotlight) by file name.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number', description: 'Max results, default 10.' },
        },
        required: ['query'],
      },
    },
  ];
}

function spawnAgent(args, config) {
  const speed = args.speed || 'standard';
  const model = args.model || config.speeds[speed] || config.speeds.standard;
  const id = String(nextId++);
  const rec = { id, task: args.task, model, status: 'running', output: '', started: Date.now() };

  let child;
  try {
    child = spawn(config.claudeBin, ['-p', args.task, '--model', model, ...config.claudeArgs], {
      cwd: expand(config.workspaceDir),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    return { error: `could not start agent: ${err.message}` };
  }

  const timer = setTimeout(() => {
    rec.status = 'timeout';
    child.kill('SIGTERM');
  }, config.agentTimeoutMinutes * 60 * 1000);

  child.stdout.on('data', (d) => { rec.output += d; });
  child.stderr.on('data', (d) => { rec.stderr = ((rec.stderr || '') + d).slice(-2000); });
  child.on('error', (err) => {
    clearTimeout(timer);
    rec.status = 'failed';
    rec.output += `\nspawn error: ${err.message}`;
    rec.finished = Date.now();
    notify(summarize(rec));
  });
  child.on('close', (code) => {
    clearTimeout(timer);
    if (rec.status === 'running') rec.status = code === 0 ? 'done' : 'failed';
    rec.finished = Date.now();
    notify(summarize(rec));
  });

  agents.set(id, rec);
  return { id, model, status: 'running' };
}

function summarize(rec) {
  return {
    id: rec.id,
    task: rec.task.slice(0, 120),
    model: rec.model,
    status: rec.status,
    summary: (rec.output || rec.stderr || '').slice(-1500),
  };
}

async function execute(name, args, config) {
  switch (name) {
    case 'spawn_agent':
      return spawnAgent(args, config);
    case 'agent_status':
      return [...agents.values()].map((r) => ({
        id: r.id,
        task: r.task.slice(0, 100),
        model: r.model,
        status: r.status,
        minutes: Math.round((Date.now() - r.started) / 60000),
      }));
    case 'agent_result': {
      const r = agents.get(String(args.id));
      if (!r) return { error: 'no agent with that id' };
      return { id: r.id, status: r.status, output: (r.output || r.stderr || '').slice(-4000) };
    }
    case 'open_path': {
      const p = expand(args.path);
      if (!fs.existsSync(p)) return { error: `no such path: ${p}` };
      const r = await run('open', [p]);
      return r.ok ? { ok: true, opened: p } : { error: r.stderr.slice(0, 200) };
    }
    case 'reveal_path': {
      const p = expand(args.path);
      if (!fs.existsSync(p)) return { error: `no such path: ${p}` };
      const r = await run('open', ['-R', p]);
      return r.ok ? { ok: true, revealed: p } : { error: r.stderr.slice(0, 200) };
    }
    case 'open_app': {
      const r = await run('open', ['-a', String(args.name)]);
      return r.ok ? { ok: true } : { error: `could not open app: ${args.name}` };
    }
    case 'open_url': {
      const url = String(args.url || '');
      if (!/^https?:\/\//.test(url)) return { error: 'only http(s) urls' };
      const r = await run('open', [url]);
      return r.ok ? { ok: true } : { error: r.stderr.slice(0, 200) };
    }
    case 'end_session':
      return { ok: true };
    case 'find_files': {
      const r = await run('mdfind', ['-name', String(args.query)], 5000);
      if (!r.ok && !r.stdout) return { error: 'search failed' };
      const limit = Math.min(Number(args.limit) || 10, 25);
      return { results: r.stdout.split('\n').filter(Boolean).slice(0, limit) };
    }
    default:
      return { error: `unknown tool: ${name}` };
  }
}

module.exports = { schemas, execute, setNotify };
