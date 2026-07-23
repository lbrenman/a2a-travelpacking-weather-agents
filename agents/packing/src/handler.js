const {
  uuid,
  ERRORS,
  textMessage,
  buildTask,
  extractText,
  normalizeUserMessage
} = require('../../../shared/src/jsonrpc');

const { parseTrip } = require('./services/parseTrip');
const { buildBaseline, enrich, toSummary } = require('./services/packingList');

/**
 * Handles A2A `message/send` for the packing agent.
 *
 * Tier 1 (buildBaseline) always runs and cannot fail.
 * Tier 2 (weatherClient) is best-effort: getWeather() resolves to null rather
 * than throwing, so the task completes either way.
 */
function createHandleMessageSend({ weatherClient }) {
  return async function handleMessageSend(params) {
    const userMessage = params?.message;
    if (!userMessage || !Array.isArray(userMessage.parts)) {
      return { error: [ERRORS.INVALID_PARAMS, 'params.message with a parts array is required'] };
    }

    const contextId = userMessage.contextId || params.contextId || uuid();
    const normalized = normalizeUserMessage(userMessage, contextId);
    const text = extractText(userMessage);
    const trip = text ? parseTrip(text) : null;

    if (!trip) {
      return {
        task: buildTask({
          contextId,
          state: 'input-required',
          userMessage: normalized,
          agentMessage: textMessage(
            text
              ? `I could not identify a US city and state in "${text}". ` +
                  'Try something like "Boston, MA for 5 days" or "a week in Portland, OR".'
              : 'Please tell me your destination and trip length, for example "Boston, MA for 5 days".',
            'agent',
            contextId
          )
        })
      };
    }

    // Tier 1 — this agent's own function. Always available.
    const baseline = buildBaseline(trip);

    // Tier 2 — optional enrichment. Never blocks completion.
    const weather = await weatherClient.getWeather(trip);
    const enrichment = weather ? enrich(baseline, weather) : null;

    const summary = toSummary(baseline, enrichment);

    return {
      task: buildTask({
        contextId,
        state: 'completed',
        userMessage: normalized,
        agentMessage: textMessage(summary, 'agent', contextId),
        artifacts: [
          {
            artifactId: uuid(),
            name: 'packing-list',
            description: `Packing list for ${trip.city}, ${trip.state} (${trip.days} days)`,
            parts: [
              { kind: 'text', text: summary },
              {
                kind: 'data',
                data: {
                  ...baseline,
                  tripLengthAssumed: !trip.daysWereSpecified,
                  enrichment: enrichment
                    ? {
                        applied: true,
                        source: weather.source,
                        additions: enrichment.additions,
                        notes: enrichment.notes,
                        temperatureRange: enrichment.temperatureRange,
                        forecastSummary: enrichment.forecastSummary
                      }
                    : {
                        applied: false,
                        reason:
                          'Live forecast unavailable — list is based on seasonal climate for the region.',
                        weatherAgent: weatherClient.breakerStatus()
                      },
                  generatedAt: new Date().toISOString()
                }
              }
            ]
          }
        ],
        // Lets a calling agent tell at a glance which tier answered.
        metadata: {
          enrichmentApplied: Boolean(enrichment),
          mode: enrichment ? 'enriched' : 'standalone'
        }
      })
    };
  };
}

module.exports = { createHandleMessageSend };
