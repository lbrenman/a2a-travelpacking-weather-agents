/**
 * Parses a trip request: a US city/state plus an optional duration.
 *
 * Handles:
 *   "Boston, MA"                       -> 3 days (default)
 *   "Boston, MA for 5 days"
 *   "5 days in Austin, Texas"
 *   "a week in Portland, OR"
 *   "long weekend in Denver CO"
 */

const { parseLocation } = require('../../../../shared/src/parseLocation');

const DEFAULT_DAYS = Number(process.env.PACKING_DEFAULT_TRIP_DAYS || process.env.DEFAULT_TRIP_DAYS || 3);
const MAX_DAYS = 30;

const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, fourteen: 14
};

function extractDays(text) {
  const t = text.toLowerCase();

  if (/\blong weekend\b/.test(t)) return 3;
  if (/\bweekend\b/.test(t)) return 2;

  const weeks = t.match(/\b(?:(\d+)|(a|one|two|three))\s+weeks?\b/);
  if (weeks) {
    const n = weeks[1] ? Number(weeks[1]) : WORD_NUMBERS[weeks[2]] || 1;
    return Math.min(n * 7, MAX_DAYS);
  }

  const digits = t.match(/\b(\d{1,2})\s*(?:days?|nights?)\b/);
  if (digits) return Math.min(Math.max(Number(digits[1]), 1), MAX_DAYS);

  const words = t.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|fourteen)\s+(?:days?|nights?)\b/);
  if (words) return WORD_NUMBERS[words[1]];

  return null;
}

/**
 * Strip duration phrases so the location parser sees a clean string.
 */
function stripDuration(text) {
  return text
    .replace(/\b(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|fourteen|a)\s+(?:days?|nights?|weeks?)\b/gi, ' ')
    .replace(/\b(?:long\s+)?weekend\b/gi, ' ')
    .replace(/\b(?:trip|travel|trav[e]?ll?ing|visit|going|packing list|pack)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    // Removing a duration can leave a dangling preposition ("Boston, MA for"),
    // which would otherwise confuse the location parser. Strip repeatedly so
    // "... for to" collapses fully.
    .replace(/(?:\s*\b(?:for|in|at|of|to|during)\b\s*)+$/i, '')
    .trim();
}

/**
 * @returns {{city,state,stateName,days,daysWereSpecified} | null}
 */
function parseTrip(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return null;

  const days = extractDays(text);
  const location = parseLocation(stripDuration(text));
  if (!location) return null;

  return {
    ...location,
    days: days || DEFAULT_DAYS,
    daysWereSpecified: days !== null
  };
}

module.exports = { parseTrip, DEFAULT_DAYS };
