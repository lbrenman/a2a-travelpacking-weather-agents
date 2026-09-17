/**
 * Trip Packing Agent card (A2A protocol v1.0.0).
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
    const enriched = Boolean(cfg.weatherAgentUrl) && cfg.weatherEnrichment;

    return {
      name: cfg.agentName,
      description:
        'Builds a packing list for a US destination and trip length. Send a message such as ' +
        '"Boston, MA for 5 days" or "a week in Portland, OR". Produces a seasonal list on its ' +
        'own, and refines it with live forecast data when a weather agent is reachable.',

      // A2A 1.0.0: endpoint and transport declared in supportedInterfaces
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
          id: 'trip-packing-list',
          name: 'Trip Packing List',
          description:
            'Given a US city, state, and optional trip length, returns a categorized packing ' +
            'list based on the destination climate and season. Always available.',
          tags: ['packing', 'travel', 'checklist', 'united-states'],
          examples: [
            'Boston, MA for 5 days',
            'a week in Portland, OR',
            'What should I pack for 4 days in Chicago, IL?',
            'long weekend in Denver CO'
          ],
          inputModes: ['application/json', 'text/plain'],
          outputModes: ['application/json', 'text/plain']
        },
        // Advertised only when a downstream weather agent is configured, so
        // callers discovering this agent see its actual current capability.
        ...(enriched
          ? [
              {
                id: 'forecast-aware-packing',
                name: 'Forecast-Aware Packing Advice',
                description:
                  'Augments the packing list with items driven by the actual forecast (rain ' +
                  'gear, cold-weather layers, sun protection) by delegating to a downstream ' +
                  'A2A weather agent. Degrades to the seasonal list if that agent is unavailable.',
                tags: ['packing', 'weather', 'forecast', 'delegation'],
                examples: ['3 days in Seattle, WA', 'Miami, FL for a week'],
                inputModes: ['application/json', 'text/plain'],
                outputModes: ['application/json', 'text/plain']
              }
            ]
          : [])
      ],

    };
  };
}

module.exports = { createBuildAgentCard, PROTOCOL_VERSION };
