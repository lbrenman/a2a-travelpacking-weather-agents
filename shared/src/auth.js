/**
 * API key authentication middleware factory.
 *
 * Accepts the key as either `x-api-key: <key>` or `Authorization: Bearer <key>`.
 *
 * Per A2A spec section 4, identity lives at the HTTP transport layer rather
 * than inside the JSON-RPC payload, so rejections use HTTP 401 with a
 * WWW-Authenticate header. The reserved A2A error codes (-32001 TaskNotFound,
 * -32002 TaskNotCancelable, ...) are deliberately NOT reused for auth failures.
 *
 * When `logAuth` is true, every auth decision on a request is logged in full,
 * including the provided and expected keys. This is a DEBUGGING aid — the keys
 * are printed verbatim so you can eyeball exactly what an external caller sent.
 * Enable it while diagnosing, then turn it off: do not leave it on in a shared
 * or production environment where logs may be retained.
 */
function createApiKeyAuth({ apiKey, authMode = 'apikey', agentName = 'agent', logAuth = false }) {
  return function apiKeyAuth(req, res, next) {
    const mode = String(authMode).toLowerCase();

    const log = (verdict, detail) => {
      if (!logAuth) return;
      console.log(
        `[auth] ${agentName} ${req.method} ${req.originalUrl} -> ${verdict}` +
          (detail ? ` | ${detail}` : '')
      );
    };

    if (mode === 'none') {
      log('ALLOW', 'AUTH_MODE=none (auth disabled)');
      return next();
    }

    if (!apiKey) {
      log('ERROR', 'server has no API key configured');
      return res.status(500).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: `Server misconfigured: no API key set for ${agentName}` }
      });
    }

    const xApiKey = req.get('x-api-key');
    const authHeader = req.get('authorization') || '';
    const hasBearer = authHeader.toLowerCase().startsWith('bearer ');
    const bearer = hasBearer ? authHeader.slice(7).trim() : null;

    // Which channel did the caller use? This alone catches a lot of external
    // integration bugs (key in the wrong header, "Bearer" prefix duplicated,
    // a gateway stripping x-api-key, etc.).
    const channel = xApiKey
      ? 'x-api-key'
      : hasBearer
        ? 'authorization: Bearer'
        : authHeader
          ? 'authorization (non-Bearer scheme)'
          : '(no auth header)';

    const provided = xApiKey || bearer;

    const reject = (message, detail) => {
      log('REJECT 401', detail);
      res.set('WWW-Authenticate', 'ApiKey realm="a2a", header="x-api-key"');
      return res.status(401).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message }
      });
    };

    if (!provided) {
      return reject(
        'Unauthorized: missing API key (send the x-api-key header)',
        `channel=${channel}; no usable key found. ` +
          `Headers seen: x-api-key=${xApiKey ? `"${xApiKey}"` : 'unset'}, ` +
          `authorization=${authHeader ? `"${authHeader}"` : 'unset'}`
      );
    }

    if (provided !== apiKey) {
      // Print both keys verbatim plus a length note. A length mismatch usually
      // means truncation or an extra prefix/whitespace; equal length but
      // different content usually means a stale or wrong key.
      const lengthNote =
        String(provided).length === String(apiKey).length
          ? 'lengths match (likely a wrong/stale key)'
          : `length differs (got ${String(provided).length}, expected ${String(apiKey).length} — ` +
            'possible truncation or an extra prefix/whitespace)';
      return reject(
        'Unauthorized: invalid API key',
        `channel=${channel}; provided="${provided}" expected="${apiKey}"; ${lengthNote}`
      );
    }

    log('ALLOW', `channel=${channel}; key="${provided}" matched`);
    return next();
  };
}

module.exports = { createApiKeyAuth };
