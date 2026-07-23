/**
 * API key authentication middleware factory.
 *
 * Accepts the key as either `x-api-key: <key>` or `Authorization: Bearer <key>`.
 *
 * Per A2A spec section 4, identity lives at the HTTP transport layer rather
 * than inside the JSON-RPC payload, so rejections use HTTP 401 with a
 * WWW-Authenticate header. The reserved A2A error codes (-32001 TaskNotFound,
 * -32002 TaskNotCancelable, ...) are deliberately NOT reused for auth failures.
 */
function createApiKeyAuth({ apiKey, authMode = 'apikey', agentName = 'agent' }) {
  return function apiKeyAuth(req, res, next) {
    if (String(authMode).toLowerCase() === 'none') return next();

    if (!apiKey) {
      return res.status(500).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: `Server misconfigured: no API key set for ${agentName}` }
      });
    }

    const authHeader = req.get('authorization') || '';
    const bearer = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : null;

    const provided = req.get('x-api-key') || bearer;

    const reject = (message) => {
      res.set('WWW-Authenticate', 'ApiKey realm="a2a", header="x-api-key"');
      return res.status(401).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message }
      });
    };

    if (!provided) return reject('Unauthorized: missing API key (send the x-api-key header)');
    if (provided !== apiKey) return reject('Unauthorized: invalid API key');

    return next();
  };
}

module.exports = { createApiKeyAuth };
