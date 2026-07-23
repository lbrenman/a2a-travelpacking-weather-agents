const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { createApiKeyAuth } = require('./auth');
const { createA2ARouter } = require('./a2aRouter');

/**
 * Builds a complete A2A agent Express app.
 *
 * Public (unauthenticated): /health, /.well-known/agent-card.json, /
 * Authenticated:            POST /a2a
 *
 * The agent card must stay public — other agents have to read it to learn how
 * to authenticate in the first place.
 */
function createApp({
  serviceName,
  displayName,
  version,
  apiKey,
  authMode,
  logFormat = 'dev',
  debugBody = false,
  taskTtlMs,
  buildAgentCard,
  handleMessageSend,
  healthCheck, // optional async () => extra health fields
  taskStore
}) {
  const app = express();

  // Required in Codespaces / behind any reverse proxy so the agent card's `url`
  // reflects the public forwarded host rather than localhost.
  app.set('trust proxy', 1);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ exposedHeaders: ['Content-Type'] }));

  // Raw-body logging for diagnosing gateways that mangle requests.
  // Must run before the JSON parser.
  if (debugBody) {
    app.use('/a2a', (req, res, next) => {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', () => {
        console.log(`--- inbound /a2a (${serviceName}) ---`);
        console.log('  content-type  :', JSON.stringify(req.get('content-type')));
        console.log('  content-length:', req.get('content-length'));
        console.log('  x-api-key     :', req.get('x-api-key') ? '(present)' : '(absent)');
        console.log('  raw body      :', raw);
        next();
      });
    });
  }

  // `type: () => true` parses the body regardless of Content-Type. Some API
  // gateways proxy JSON-RPC as text/plain or with no content type at all; the
  // default express.json() would silently skip those, leaving req.body empty
  // and producing a misleading "Invalid JSON-RPC 2.0 request".
  app.use(express.json({ limit: '1mb', type: () => true }));

  // Some proxies deliver the payload as a JSON-encoded string. Unwrap one level.
  app.use((req, res, next) => {
    if (typeof req.body === 'string' && req.body.trim().startsWith('{')) {
      try {
        req.body = JSON.parse(req.body);
      } catch {
        // Leave as-is; the route guard will report it.
      }
    }
    next();
  });

  app.use(morgan(logFormat));

  // --- Public routes ----------------------------------------------------

  app.get('/health', async (req, res) => {
    const base = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version,
      service: serviceName
    };
    if (typeof healthCheck === 'function') {
      try {
        Object.assign(base, await healthCheck());
      } catch (err) {
        base.healthCheckError = err.message;
      }
    }
    res.json(base);
  });

  const serveCard = (req, res) => res.type('application/json').json(buildAgentCard(req));
  // v0.3+ standard path, plus the v0.2.x name as an alias for older clients.
  app.get('/.well-known/agent-card.json', serveCard);
  app.get('/.well-known/agent.json', serveCard);

  app.get('/', (req, res) => {
    res.json({
      name: displayName,
      agentCard: '/.well-known/agent-card.json',
      endpoint: '/a2a',
      health: '/health'
    });
  });

  // --- Authenticated A2A endpoint ---------------------------------------

  const auth = createApiKeyAuth({ apiKey, authMode, agentName: serviceName });
  app.use('/a2a', auth, createA2ARouter({ handleMessageSend, taskStore }));

  // --- Fallbacks --------------------------------------------------------

  app.use((req, res) => {
    res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error: invalid JSON' }
      });
    }
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
