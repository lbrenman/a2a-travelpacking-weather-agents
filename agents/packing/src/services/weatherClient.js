/**
 * A2A client for the downstream US Weather Agent.
 *
 * Deliberately defensive: the packing agent must remain fully useful when the
 * weather agent is slow, unreachable, misconfigured, or erroring. Every failure
 * path resolves to `null` rather than throwing, and the caller treats `null` as
 * "no enrichment available".
 *
 * Resilience layers:
 *   1. Discovery       — reads the downstream agent card to find its endpoint
 *                        and API-key header name instead of hardcoding them.
 *   2. Timeout         — every HTTP call is bounded.
 *   3. Circuit breaker — after N consecutive failures, calls pause for a
 *                        cooldown window so requests don't queue behind a dead
 *                        upstream.
 *   4. Cache           — successful lookups are cached briefly per location.
 */

function createWeatherClient(cfg) {
  const {
    agentUrl,
    apiKey,
    enabled = true,
    timeoutMs = 8000,
    cacheTtlMs = 5 * 60 * 1000,
    breakerThreshold = 3,
    breakerCooldownMs = 60 * 1000
  } = cfg;

  const breaker = { consecutiveFailures: 0, openUntil: 0, lastError: null };
  const cache = new Map();
  let discovered = null;

  const breakerIsOpen = () => Date.now() < breaker.openUntil;

  function recordSuccess() {
    breaker.consecutiveFailures = 0;
    breaker.openUntil = 0;
    breaker.lastError = null;
  }

  function recordFailure(err) {
    breaker.consecutiveFailures += 1;
    breaker.lastError = err.message;
    if (breaker.consecutiveFailures >= breakerThreshold) {
      breaker.openUntil = Date.now() + breakerCooldownMs;
      console.warn(
        `Weather agent circuit opened after ${breaker.consecutiveFailures} failures; ` +
          `pausing calls for ${breakerCooldownMs}ms. Last error: ${err.message}`
      );
    }
  }

  function breakerStatus() {
    if (breakerIsOpen()) {
      return {
        state: 'open',
        retryInMs: Math.max(0, breaker.openUntil - Date.now()),
        consecutiveFailures: breaker.consecutiveFailures,
        lastError: breaker.lastError
      };
    }
    return {
      state: breaker.consecutiveFailures > 0 ? 'degraded' : 'closed',
      consecutiveFailures: breaker.consecutiveFailures,
      lastError: breaker.lastError
    };
  }

  const cacheKey = (loc) => `${loc.city.toLowerCase()}|${loc.state}`;

  function cacheGet(loc) {
    const entry = cache.get(cacheKey(loc));
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      cache.delete(cacheKey(loc));
      return null;
    }
    return entry.value;
  }

  function cacheSet(loc, value) {
    cache.set(cacheKey(loc), { value, expiresAt: Date.now() + cacheTtlMs });
  }

  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`weather agent timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Fetch the downstream agent card to learn its endpoint and auth header.
   * Falls back to {base}/a2a so a missing card alone doesn't disable enrichment.
   */
  async function discover() {
    if (discovered) return discovered;
    const base = (agentUrl || '').replace(/\/+$/, '');
    if (!base) return null;

    const fallback = {
      endpoint: `${base}/a2a`,
      apiKeyHeader: 'x-api-key',
      name: 'US Weather Agent (assumed)',
      protocolVersion: null,
      discovered: false
    };

    // v0.3+ path first, then the v0.2.x name.
    for (const path of ['/.well-known/agent-card.json', '/.well-known/agent.json']) {
      try {
        const res = await fetchWithTimeout(`${base}${path}`, {
          headers: { Accept: 'application/json' }
        });
        if (!res.ok) continue;

        const card = await res.json();
        const scheme = Object.values(card.securitySchemes || {}).find(
          (s) => s && s.type === 'apiKey' && s.in === 'header'
        );

        discovered = {
          endpoint: card.url || fallback.endpoint,
          apiKeyHeader: scheme?.name || 'x-api-key',
          name: card.name || 'US Weather Agent',
          protocolVersion: card.protocolVersion || null,
          skills: (card.skills || []).map((s) => s.id),
          discovered: true,
          cardPath: path
        };
        console.log(
          `Discovered downstream agent "${discovered.name}" at ${discovered.endpoint} ` +
            `(protocol ${discovered.protocolVersion || 'unknown'}, via ${path})`
        );
        return discovered;
      } catch {
        // Try the next path.
      }
    }

    console.warn(
      `Could not fetch an agent card from ${base}; assuming ${fallback.endpoint}. ` +
        'Enrichment will still be attempted.'
    );
    discovered = fallback;
    return discovered;
  }

  /** Pull the structured payload out of an A2A Task. */
  function extractWeather(task) {
    if (!task || task.kind !== 'task') return null;

    const state = task.status?.state;
    if (state !== 'completed') {
      throw new Error(`weather agent returned task state "${state || 'unknown'}"`);
    }

    const parts = (task.artifacts || []).flatMap((a) => a.parts || []);
    const dataPart = parts.find((p) => (p.kind || p.type) === 'data' && p.data);
    const textPart = parts.find((p) => (p.kind || p.type) === 'text' && p.text);
    const statusText = task.status?.message?.parts?.find(
      (p) => (p.kind || p.type) === 'text'
    )?.text;

    if (!dataPart && !textPart && !statusText) {
      throw new Error('weather agent response contained no usable parts');
    }

    return { data: dataPart?.data || null, summary: textPart?.text || statusText || null };
  }

  /**
   * Ask the weather agent about a location. Resolves to
   * { data, summary, source } or null. Never throws.
   */
  async function getWeather(location) {
    if (!enabled || !agentUrl) return null;

    const cached = cacheGet(location);
    if (cached) return { ...cached, source: 'cache' };

    if (breakerIsOpen()) {
      console.warn('Weather agent circuit is open; skipping enrichment for this request.');
      return null;
    }

    try {
      const agent = await discover();
      if (!agent) return null;

      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers[agent.apiKeyHeader] = apiKey;

      const res = await fetchWithTimeout(agent.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `packing-${Date.now()}`,
          method: 'message/send',
          params: {
            message: {
              kind: 'message',
              role: 'user',
              messageId: `pk-${Date.now()}`,
              parts: [{ kind: 'text', text: `${location.city}, ${location.state}` }]
            }
          }
        })
      });

      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `weather agent rejected our credentials (HTTP ${res.status}) — ` +
            'check PACKING_WEATHER_AGENT_API_KEY'
        );
      }
      if (!res.ok) throw new Error(`weather agent returned HTTP ${res.status}`);

      const payload = await res.json();
      if (payload.error) {
        throw new Error(
          `weather agent JSON-RPC error ${payload.error.code}: ${payload.error.message}`
        );
      }

      const weather = extractWeather(payload.result);
      recordSuccess();
      cacheSet(location, weather);
      return { ...weather, source: agent.name };
    } catch (err) {
      recordFailure(err);
      console.warn(`Weather enrichment unavailable: ${err.message}`);
      return null;
    }
  }

  /** Lightweight upstream check used by /health. */
  async function probe() {
    if (!agentUrl) {
      return { configured: false, reachable: false, breaker: breakerStatus() };
    }
    if (!enabled) {
      return { configured: true, enabled: false, reachable: false, breaker: breakerStatus() };
    }
    try {
      const agent = await discover();
      return {
        configured: true,
        enabled: true,
        reachable: true,
        endpoint: agent.endpoint,
        cardDiscovered: agent.discovered,
        protocolVersion: agent.protocolVersion,
        breaker: breakerStatus()
      };
    } catch (err) {
      return {
        configured: true,
        enabled: true,
        reachable: false,
        error: err.message,
        breaker: breakerStatus()
      };
    }
  }

  return { getWeather, probe, breakerStatus };
}

module.exports = { createWeatherClient };
