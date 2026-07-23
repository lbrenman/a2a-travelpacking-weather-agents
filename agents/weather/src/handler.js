const {
  uuid,
  ERRORS,
  textMessage,
  buildTask,
  extractText,
  normalizeUserMessage
} = require('../../../shared/src/jsonrpc');
const { parseLocation } = require('../../../shared/src/parseLocation');

const { getWeather } = require('./services/weather');

/**
 * Handles A2A `message/send` for the weather agent.
 */
function createHandleMessageSend() {
  return async function handleMessageSend(params) {
    const userMessage = params?.message;
    if (!userMessage || !Array.isArray(userMessage.parts)) {
      return { error: [ERRORS.INVALID_PARAMS, 'params.message with a parts array is required'] };
    }

    const contextId = userMessage.contextId || params.contextId || uuid();
    const normalized = normalizeUserMessage(userMessage, contextId);
    const text = extractText(userMessage);

    if (!text) {
      return {
        task: buildTask({
          contextId,
          state: 'input-required',
          userMessage: normalized,
          agentMessage: textMessage(
            'Please send a US city and state, for example "Boston, MA".',
            'agent',
            contextId
          )
        })
      };
    }

    const location = parseLocation(text);

    if (!location) {
      return {
        task: buildTask({
          contextId,
          state: 'input-required',
          userMessage: normalized,
          agentMessage: textMessage(
            `I could not identify a US city and state in "${text}". ` +
              'Try a format like "Boston, MA" or "Austin, Texas".',
            'agent',
            contextId
          )
        })
      };
    }

    try {
      const { summary, data } = await getWeather(location);

      return {
        task: buildTask({
          contextId,
          state: 'completed',
          userMessage: normalized,
          agentMessage: textMessage(summary, 'agent', contextId),
          artifacts: [
            {
              artifactId: uuid(),
              name: 'weather-report',
              description: `Weather for ${data.location.city}, ${data.location.stateAbbreviation}`,
              parts: [
                { kind: 'text', text: summary },
                { kind: 'data', data }
              ]
            }
          ]
        })
      };
    } catch (err) {
      console.error('Weather lookup failed:', err);
      const message =
        err.code === 'CITY_STATE_MISMATCH' || err.code === 'CITY_NOT_FOUND'
          ? err.message
          : `Sorry, the weather lookup failed: ${err.message}`;

      return {
        task: buildTask({
          contextId,
          state: 'failed',
          userMessage: normalized,
          agentMessage: textMessage(message, 'agent', contextId)
        })
      };
    }
  };
}

module.exports = { createHandleMessageSend };
