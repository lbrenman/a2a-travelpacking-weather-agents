/**
 * US Weather Agent card (A2A protocol v1.0.0).
 */
const PROTOCOL_VERSION = '1.0';

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
      name: cfg.agentName,
      description:
        'Returns the current conditions and short-term forecast for any US city and state. ' +
        'Send a message such as "Boston, MA" or "What is the weather in Austin, Texas?".',

      // A2A 1.0.0: url still required by validator; endpoint also declared in supportedInterfaces
      url: endpoint,
      supportedInterfaces: [
        {
          url: endpoint,
          protocolBinding: 'JSONRPC',
          protocolVersion: PROTOCOL_VERSION,
        },
      ],

      version: cfg.agentVersion,
      documentationUrl: `${base}/`,
      provider: { organization: cfg.agentOrg, url: cfg.agentOrgUrl || base },
      capabilities: {
        streaming: false,
        pushNotifications: false,
        extendedAgentCard: false,
      },

      defaultInputModes: ['application/json', 'text/plain'],
      defaultOutputModes: ['application/json', 'text/plain'],

      // A2A 1.0.0: SecurityScheme discriminated union + securityRequirements with StringList
      securitySchemes: {
        apiKey: {
          apiKeySecurityScheme: {
            location: 'header',
            name: 'x-api-key',
            description: 'Static API key issued by the agent operator.',
          },
        },
      },
      securityRequirements: [
        { schemes: { apiKey: { list: [] } } },
      ],

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
          outputModes: ['application/json', 'text/plain'],
        },
      ],
    };
  };
}

module.exports = { createBuildAgentCard, PROTOCOL_VERSION };
