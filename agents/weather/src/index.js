const {
  createConfig,
  createTaskStore,
  createApp,
  logStartup
} = require('../../../shared');

const { createBuildAgentCard } = require('./agentCard');
const { createHandleMessageSend } = require('./handler');

const c = createConfig('WEATHER');

const cfg = {
  port: c.num('PORT', 3000),
  apiKey: c.raw('API_KEY'),
  authMode: c.raw('AUTH_MODE', 'apikey'),
  logFormat: c.raw('LOG_FORMAT', 'dev'),
  debugBody: c.bool('DEBUG_BODY', false),
  taskTtlMs: c.num('TASK_TTL_MS', 15 * 60 * 1000),
  publicUrl: c.raw('PUBLIC_URL'),
  agentName: c.raw('AGENT_NAME', 'US Weather Agent'),
  agentVersion: c.raw('AGENT_VERSION', '1.0.0'),
  agentOrg: c.raw('AGENT_ORG', 'Example Org'),
  agentOrgUrl: c.raw('AGENT_ORG_URL')
};

const taskStore = createTaskStore({ ttlMs: cfg.taskTtlMs });

const app = createApp({
  serviceName: 'a2a-weather-agent',
  displayName: cfg.agentName,
  version: cfg.agentVersion,
  apiKey: cfg.apiKey,
  authMode: cfg.authMode,
  logFormat: cfg.logFormat,
  debugBody: cfg.debugBody,
  buildAgentCard: createBuildAgentCard(cfg),
  handleMessageSend: createHandleMessageSend(),
  taskStore
});

app.listen(cfg.port, () => {
  logStartup({
    displayName: cfg.agentName,
    port: cfg.port,
    authMode: cfg.authMode,
    debugBody: cfg.debugBody
  });
});
