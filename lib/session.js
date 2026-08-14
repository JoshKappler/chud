// Mints an ephemeral Realtime client secret. The real API key never leaves this process.

async function mint(config, toolSchemas) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set. Put it in the environment or in a .env file next to package.json.');

  const body = {
    expires_after: { anchor: 'created_at', seconds: 600 },
    session: {
      type: 'realtime',
      model: config.model,
      instructions: config.instructions,
      output_modalities: ['audio'],
      tools: toolSchemas,
      tool_choice: 'auto',
      audio: {
        input: {
          // Tuned for a noisy office: near-field suppression drops far
          // voices, the threshold gates quiet ones, and a short silence
          // window answers fast once Josh actually stops. semantic_vad
          // waited on "semantic completion" that chatter never granted.
          noise_reduction: { type: 'near_field' },
          turn_detection: {
            type: 'server_vad',
            threshold: (config.vad && config.vad.threshold) || 0.6,
            prefix_padding_ms: 300,
            silence_duration_ms: (config.vad && config.vad.silenceMs) || 400,
          },
        },
        output: { voice: config.voice },
      },
    },
  };

  const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 400);
    throw new Error(`client_secrets ${res.status}: ${text}`);
  }
  const data = await res.json();
  return { clientSecret: data.value, model: config.model };
}

module.exports = { mint };
