const {
  createConfig,
  createTaskStore,
  createApp,
  logStartup
} = require('../../../shared');

const { createBuildAgentCard } = require('./agentCard');
const { createHandleMessageSend } = require('./handler');
const { createWeatherClient } = require('./services/weatherClient');

const c = createConfig('PACKING');
const weatherCfg = createConfig('WEATHER');

// In this monorepo both agents usually run side by side, so default the
// downstream URL to the weather agent's local port and reuse its API key.
// Either can still be overridden explicitly — set PACKING_WEATHER_AGENT_URL to
// point at a weather agent running elsewhere.
const weatherPort = weatherCfg.num('PORT', 3000);
const defaultWeatherUrl = `http://localhost:${weatherPort}`;

const cfg = {
  port: c.num('PORT', 3001),
  apiKey: c.raw('API_KEY'),
  authMode: c.raw('AUTH_MODE', 'apikey'),
  logFormat: c.raw('LOG_FORMAT', 'dev'),
  debugBody: c.bool('DEBUG_BODY', false),
  taskTtlMs: c.num('TASK_TTL_MS', 15 * 60 * 1000),
  publicUrl: c.raw('PUBLIC_URL'),
  agentName: c.raw('AGENT_NAME', 'Trip Packing Agent'),
  agentVersion: c.raw('AGENT_VERSION', '1.0.0'),
  agentOrg: c.raw('AGENT_ORG', 'Example Org'),
  agentOrgUrl: c.raw('AGENT_ORG_URL'),

  // Downstream weather agent
  weatherAgentUrl: c.raw('WEATHER_AGENT_URL', defaultWeatherUrl),
  weatherAgentApiKey: c.raw('WEATHER_AGENT_API_KEY') || weatherCfg.raw('API_KEY'),
  weatherEnrichment: String(c.raw('WEATHER_ENRICHMENT', 'on')).toLowerCase() !== 'off',
  weatherTimeoutMs: c.num('WEATHER_TIMEOUT_MS', 8000),
  weatherCacheTtlMs: c.num('WEATHER_CACHE_TTL_MS', 5 * 60 * 1000),
  weatherBreakerThreshold: c.num('WEATHER_BREAKER_THRESHOLD', 3),
  weatherBreakerCooldownMs: c.num('WEATHER_BREAKER_COOLDOWN_MS', 60 * 1000)
};

const weatherClient = createWeatherClient({
  agentUrl: cfg.weatherAgentUrl,
  apiKey: cfg.weatherAgentApiKey,
  enabled: cfg.weatherEnrichment,
  timeoutMs: cfg.weatherTimeoutMs,
  cacheTtlMs: cfg.weatherCacheTtlMs,
  breakerThreshold: cfg.weatherBreakerThreshold,
  breakerCooldownMs: cfg.weatherBreakerCooldownMs
});

const taskStore = createTaskStore({ ttlMs: cfg.taskTtlMs });

const app = createApp({
  serviceName: 'a2a-packing-agent',
  displayName: cfg.agentName,
  version: cfg.agentVersion,
  apiKey: cfg.apiKey,
  authMode: cfg.authMode,
  logFormat: cfg.logFormat,
  debugBody: cfg.debugBody,
  buildAgentCard: createBuildAgentCard(cfg),
  handleMessageSend: createHandleMessageSend({ weatherClient }),
  taskStore,
  // `status` stays "ok" even when the weather agent is down — an unreachable
  // upstream is a degraded feature, not an outage of this service.
  healthCheck: async () => {
    const upstream = await weatherClient.probe();
    return {
      mode: upstream.configured && upstream.reachable ? 'enriched' : 'standalone',
      dependencies: { weatherAgent: upstream }
    };
  }
});

app.listen(cfg.port, () => {
  const extraLines = [];

  if (!cfg.weatherEnrichment) {
    extraLines.push('Mode       : standalone (PACKING_WEATHER_ENRICHMENT=off)');
  } else if (cfg.weatherAgentUrl) {
    extraLines.push(`Mode       : enriched — delegating to ${cfg.weatherAgentUrl}`);
    if (!cfg.weatherAgentApiKey) {
      extraLines.push(
        'WARNING    : no downstream API key resolved; the weather agent will likely return 401.'
      );
    }
  } else {
    extraLines.push('Mode       : standalone — no weather agent configured');
  }

  logStartup({
    displayName: cfg.agentName,
    port: cfg.port,
    authMode: cfg.authMode,
    debugBody: cfg.debugBody,
    extraLines
  });
});
