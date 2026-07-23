/**
 * US Weather Agent card (A2A protocol v0.3.0).
 */
const PROTOCOL_VERSION = '0.3.0';

function baseUrl(req, publicUrl) {
  if (publicUrl) return publicUrl.replace(/\/+$/, '');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${proto}://${host}`;
}

function createBuildAgentCard(cfg) {
  return function buildAgentCard(req) {
    const base = baseUrl(req, cfg.publicUrl);
    const endpoint = `${base}/a2a`;

    return {
      protocolVersion: PROTOCOL_VERSION,
      name: cfg.agentName,
      description:
        'Returns the current conditions and short-term forecast for any US city and state. ' +
        'Send a message such as "Boston, MA" or "What is the weather in Austin, Texas?".',

      // Spec 5.6.1: preferredTransport is REQUIRED and must be what's at `url`.
      url: endpoint,
      preferredTransport: 'JSONRPC',
      // Spec 5.6.2: should include an entry matching the main url/transport.
      additionalInterfaces: [{ url: endpoint, transport: 'JSONRPC' }],

      version: cfg.agentVersion,
      documentationUrl: `${base}/`,
      provider: { organization: cfg.agentOrg, url: cfg.agentOrgUrl || base },
      capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false
      },

      // JSON-RPC transport is always application/json; text/plain describes
      // the media type of individual message parts.
      defaultInputModes: ['application/json', 'text/plain'],
      defaultOutputModes: ['application/json', 'text/plain'],

      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'Static API key issued by the agent operator.'
        }
      },
      security: [{ apiKey: [] }],

      skills: [
        {
          id: 'us-weather-lookup',
          name: 'US Weather Lookup',
          description:
            'Given a US city and state, returns current conditions and a short-term forecast ' +
            'from the National Weather Service.',
          tags: ['weather', 'forecast', 'united-states', 'nws'],
          examples: [
            'Boston, MA',
            'What is the weather in Austin, Texas?',
            'Forecast for Portland, OR',
            'Denver CO'
          ],
          inputModes: ['application/json', 'text/plain'],
          outputModes: ['application/json', 'text/plain']
        }
      ],

      supportsAuthenticatedExtendedCard: false
    };
  };
}

module.exports = { createBuildAgentCard, PROTOCOL_VERSION };
