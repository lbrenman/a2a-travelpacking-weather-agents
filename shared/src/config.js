/**
 * Configuration for a single agent within the monorepo.
 *
 * Both agents share one root `.env`, so each variable is namespaced by agent:
 *
 *   WEATHER_PORT=3000        PACKING_PORT=3001
 *   WEATHER_API_KEY=...      PACKING_API_KEY=...
 *
 * Resolution order for any key, using the packing agent as an example:
 *   1. PACKING_FOO   — agent-specific
 *   2. FOO           — shared across both agents (e.g. AUTH_MODE, LOG_FORMAT)
 *   3. the supplied default
 *
 * That means common settings can be written once at the root while either
 * agent can still override them individually.
 */

const path = require('path');

// Load the single root .env regardless of which directory node was started from.
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

function createConfig(prefix) {
  const P = prefix.toUpperCase();

  const raw = (key, fallback = undefined) => {
    const scoped = process.env[`${P}_${key}`];
    if (scoped !== undefined && scoped !== '') return scoped;
    const shared = process.env[key];
    if (shared !== undefined && shared !== '') return shared;
    return fallback;
  };

  const num = (key, fallback) => {
    const v = raw(key);
    const n = Number(v);
    return v === undefined || Number.isNaN(n) ? fallback : n;
  };

  const bool = (key, fallback = false) => {
    const v = raw(key);
    if (v === undefined) return fallback;
    return String(v).toLowerCase() === 'true';
  };

  return { raw, num, bool, prefix: P };
}

module.exports = { createConfig };
