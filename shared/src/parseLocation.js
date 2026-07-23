/**
 * Extracts a US city + state from free-form text.
 *
 * Handles inputs such as:
 *   "Boston, MA"
 *   "Boston MA"
 *   "What is the weather in Austin, Texas?"
 *   "forecast for Salt Lake City, UT"
 *   "New York, New York"
 */

const STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin',
  WY: 'Wyoming', DC: 'District of Columbia', PR: 'Puerto Rico'
};

const NAME_TO_ABBR = Object.entries(STATES).reduce((acc, [abbr, name]) => {
  acc[name.toLowerCase()] = abbr;
  return acc;
}, {});

function cleanup(text) {
  return String(text || '')
    .replace(/[?!.]+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLeadIn(text) {
  // "what's the weather in X" / "forecast for X" / "3 days in X"
  // The leading `.*` is greedy, so this anchors on the LAST preposition —
  // important for phrases like "what should I pack for 4 days in Chicago, IL",
  // where matching the first one would leave "in Chicago" as the city.
  const m = text.match(/^.*\b(?:in|for|at|of)\s+(.+)$/i);
  return m ? m[1].trim() : text;
}

function toState(token) {
  const t = token.trim().replace(/\.$/, '');
  if (!t) return null;
  const upper = t.toUpperCase();
  if (STATES[upper]) return upper;
  const byName = NAME_TO_ABBR[t.toLowerCase()];
  return byName || null;
}

/**
 * @returns {{city: string, state: string, stateName: string} | null}
 */
function parseLocation(rawText) {
  const text = stripLeadIn(cleanup(rawText));
  if (!text) return null;

  // Case 1: comma-separated — "Austin, Texas" (ignore trailing ", USA")
  if (text.includes(',')) {
    let parts = text.split(',').map((p) => p.trim()).filter(Boolean);

    // Drop a trailing country segment: "Boston, MA, USA"
    if (parts.length >= 3 && /^(usa|us|united states)$/i.test(parts[parts.length - 1])) {
      parts = parts.slice(0, -1);
    }

    if (parts.length >= 2) {
      const state = toState(parts[parts.length - 1]);
      if (state) {
        const city = parts.slice(0, -1).join(' ').trim();
        if (city) return { city, state, stateName: STATES[state] };
      }
    }
  }

  // Case 2: no comma — take the last 1-3 words as a candidate state name
  const words = text.split(' ');
  for (let take = Math.min(3, words.length - 1); take >= 1; take -= 1) {
    const candidate = words.slice(words.length - take).join(' ');
    const state = toState(candidate);
    if (state) {
      const city = words.slice(0, words.length - take).join(' ').trim();
      if (city) return { city, state, stateName: STATES[state] };
    }
  }

  return null;
}

module.exports = { parseLocation, STATES };
