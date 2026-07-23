/**
 * Packing list generation.
 *
 * Two tiers:
 *   buildBaseline()  — works with no external dependencies at all. Uses the
 *                      destination's climate region and the travel month to
 *                      infer a typical seasonal list. This is the agent's own
 *                      function and is always available.
 *   enrich()         — given an actual forecast from the downstream weather
 *                      agent, adds condition-specific items and flags any
 *                      baseline assumptions the real forecast contradicts.
 */

// Rough climate grouping by state — enough to drive seasonal packing advice.
const CLIMATE_REGIONS = {
  cold: ['AK', 'ME', 'VT', 'NH', 'MN', 'ND', 'SD', 'MT', 'WI', 'MI', 'WY', 'ID'],
  temperate: [
    'MA', 'RI', 'CT', 'NY', 'NJ', 'PA', 'OH', 'IN', 'IL', 'IA', 'NE', 'MO',
    'KS', 'DE', 'MD', 'DC', 'VA', 'WV', 'KY', 'CO', 'UT', 'OR', 'WA'
  ],
  hot: ['FL', 'TX', 'AZ', 'NV', 'LA', 'MS', 'AL', 'GA', 'SC', 'HI', 'PR'],
  mild: ['CA', 'NC', 'TN', 'AR', 'OK', 'NM', 'CA']
};

function regionFor(stateAbbr) {
  for (const [region, states] of Object.entries(CLIMATE_REGIONS)) {
    if (states.includes(stateAbbr)) return region;
  }
  return 'temperate';
}

function seasonFor(date = new Date()) {
  const m = date.getMonth() + 1;
  if (m === 12 || m <= 2) return 'winter';
  if (m <= 5) return 'spring';
  if (m <= 8) return 'summer';
  return 'fall';
}

// Items every trip needs regardless of destination or season.
const ESSENTIALS = [
  'Phone and charger',
  'Wallet, ID, and payment cards',
  'Prescription medications',
  'Toiletries kit',
  'Reusable water bottle',
  'Travel documents / confirmations'
];

const SEASONAL = {
  'cold/winter': [
    'Insulated winter coat',
    'Thermal base layers',
    'Wool socks (one pair per day)',
    'Hat, gloves, and scarf',
    'Waterproof boots with grip'
  ],
  'cold/spring': ['Warm jacket', 'Layerable sweaters', 'Waterproof shoes', 'Light gloves'],
  'cold/summer': ['Light jacket for evenings', 'Long-sleeve shirts', 'Insect repellent'],
  'cold/fall': ['Insulated jacket', 'Sweaters and layers', 'Warm socks', 'Closed-toe shoes'],

  'temperate/winter': [
    'Winter coat',
    'Sweaters and layers',
    'Warm socks',
    'Hat and gloves',
    'Water-resistant shoes'
  ],
  'temperate/spring': ['Light jacket', 'Layerable long sleeves', 'Umbrella', 'Comfortable shoes'],
  'temperate/summer': ['Shorts and t-shirts', 'Sunglasses', 'Sunscreen', 'Light layer for A/C'],
  'temperate/fall': ['Medium jacket', 'Long sleeves and sweaters', 'Closed-toe shoes'],

  'mild/winter': ['Medium jacket', 'Long sleeves', 'Light scarf', 'Water-resistant shoes'],
  'mild/spring': ['Light jacket', 'Mix of short and long sleeves', 'Comfortable walking shoes'],
  'mild/summer': ['Lightweight clothing', 'Sunglasses', 'Sunscreen', 'Sandals'],
  'mild/fall': ['Light jacket', 'Long sleeves', 'Comfortable shoes'],

  'hot/winter': ['Light jacket for evenings', 'Long sleeves', 'Comfortable shoes'],
  'hot/spring': ['Lightweight clothing', 'Sunscreen', 'Sunglasses', 'Breathable footwear'],
  'hot/summer': [
    'Lightweight, breathable clothing',
    'High-SPF sunscreen',
    'Wide-brim hat',
    'Sunglasses',
    'Sandals plus one closed-toe pair',
    'Electrolyte packets'
  ],
  'hot/fall': ['Lightweight clothing', 'Sunscreen', 'Light layer for evenings']
};

/**
 * Baseline list — no network calls, always available.
 */
function buildBaseline({ city, state, stateName, days }) {
  const region = regionFor(state);
  const season = seasonFor();
  const key = `${region}/${season}`;
  const seasonal = SEASONAL[key] || SEASONAL['temperate/spring'];

  const clothing = [
    `Tops: about ${Math.min(days + 1, 10)}`,
    `Bottoms: about ${Math.max(2, Math.ceil(days / 2))}`,
    `Underwear and socks: ${days + 1} sets`,
    days > 4 ? 'Laundry bag (trip is long enough to re-wear)' : 'Sleepwear'
  ];

  return {
    destination: { city, state, stateName },
    days,
    basis: {
      climateRegion: region,
      season,
      method: 'seasonal climate heuristics (no live forecast)'
    },
    sections: [
      { name: 'Essentials', items: ESSENTIALS },
      { name: 'Clothing', items: clothing },
      { name: `Typical ${season} in ${stateName}`, items: seasonal }
    ]
  };
}

// --- Enrichment ---------------------------------------------------------

const RAIN_WORDS = /rain|shower|drizzle|thunderstorm|storm/i;
const SNOW_WORDS = /snow|sleet|freezing|ice|blizzard|flurries/i;
const SUN_WORDS = /sunny|clear|mostly sunny/i;

function collectConditionText(weatherData) {
  const bits = [];
  if (weatherData.current?.shortForecast) bits.push(weatherData.current.shortForecast);
  (weatherData.forecast || []).forEach((p) => {
    if (p.shortForecast) bits.push(p.shortForecast);
    if (p.detailedForecast) bits.push(p.detailedForecast);
  });
  return bits.join(' ');
}

function temperatureRange(weatherData) {
  const temps = [];
  if (typeof weatherData.current?.temperature === 'number') {
    temps.push(weatherData.current.temperature);
  }
  (weatherData.forecast || []).forEach((p) => {
    if (typeof p.temperature === 'number') temps.push(p.temperature);
  });
  if (temps.length === 0) return null;
  return { min: Math.min(...temps), max: Math.max(...temps) };
}

/**
 * Given the baseline and a live forecast, produce forecast-driven additions
 * and note where the forecast diverges from the seasonal assumption.
 */
function enrich(baseline, weather) {
  const data = weather.data;
  const additions = [];
  const notes = [];

  if (!data) {
    // Only a text summary came back — still worth surfacing.
    return {
      additions: [],
      notes: ['A forecast summary was available but contained no structured data.'],
      forecastSummary: weather.summary || null,
      temperatureRange: null
    };
  }

  const conditions = collectConditionText(data);
  const range = temperatureRange(data);

  if (RAIN_WORDS.test(conditions)) {
    additions.push(
      { item: 'Compact umbrella', reason: 'Rain is in the forecast' },
      { item: 'Waterproof jacket or shell', reason: 'Rain is in the forecast' },
      { item: 'Water-resistant footwear', reason: 'Rain is in the forecast' }
    );
  }

  if (SNOW_WORDS.test(conditions)) {
    additions.push(
      { item: 'Insulated waterproof boots', reason: 'Snow or ice expected' },
      { item: 'Warm hat and waterproof gloves', reason: 'Snow or ice expected' }
    );
  }

  if (range) {
    if (range.min <= 32) {
      additions.push(
        { item: 'Heavy insulated coat', reason: `Lows near ${range.min}\u00B0F` },
        { item: 'Thermal base layers', reason: `Lows near ${range.min}\u00B0F` }
      );
    } else if (range.min <= 50) {
      additions.push({ item: 'Warm mid-layer', reason: `Lows near ${range.min}\u00B0F` });
    }

    if (range.max >= 85) {
      additions.push(
        { item: 'Extra hydration and electrolytes', reason: `Highs near ${range.max}\u00B0F` },
        { item: 'Breathable, light-colored clothing', reason: `Highs near ${range.max}\u00B0F` }
      );
    }

    if (range.max - range.min >= 25) {
      notes.push(
        `Wide temperature swing (${range.min}\u00B0F to ${range.max}\u00B0F) — pack layers you can shed.`
      );
    }

    // Flag where reality contradicts the seasonal guess.
    const { climateRegion, season } = baseline.basis;
    if (season === 'summer' && range.max < 70) {
      notes.push('Cooler than a typical summer for this region — the seasonal list may over-pack for heat.');
    }
    if (season === 'winter' && range.min > 50) {
      notes.push('Milder than a typical winter for this region — heavy cold-weather gear may be unnecessary.');
    }
    if (climateRegion === 'hot' && range.max < 60) {
      notes.push('Unseasonably cool for this destination — add a warmer layer than usual.');
    }
  }

  if (SUN_WORDS.test(conditions) && (!range || range.max >= 65)) {
    additions.push({ item: 'Sunglasses and sunscreen', reason: 'Clear, sunny conditions expected' });
  }

  const wind = data.current?.windSpeed;
  if (wind && /\b(1[5-9]|[2-9]\d)\s*mph/i.test(wind)) {
    additions.push({ item: 'Windbreaker', reason: `Winds around ${wind}` });
  }

  // De-duplicate by item name, keeping the first reason given.
  const seen = new Set();
  const deduped = additions.filter((a) => {
    const k = a.item.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return {
    additions: deduped,
    notes,
    forecastSummary: weather.summary || null,
    temperatureRange: range
  };
}

/**
 * Render the final human-readable text response.
 */
function toSummary(baseline, enrichment) {
  const lines = [];
  const { city, stateName } = baseline.destination;

  lines.push(`Packing list for ${city}, ${stateName} — ${baseline.days} day${baseline.days === 1 ? '' : 's'}`);
  lines.push('');

  baseline.sections.forEach((section) => {
    lines.push(`${section.name}:`);
    section.items.forEach((item) => lines.push(`  - ${item}`));
    lines.push('');
  });

  if (enrichment && enrichment.additions.length > 0) {
    lines.push('Based on the current forecast, also pack:');
    enrichment.additions.forEach((a) => lines.push(`  - ${a.item}  (${a.reason})`));
    lines.push('');
  }

  if (enrichment && enrichment.notes.length > 0) {
    enrichment.notes.forEach((n) => lines.push(`Note: ${n}`));
    lines.push('');
  }

  if (enrichment) {
    lines.push('Forecast applied from the live weather agent.');
  } else {
    lines.push(
      `Built from typical ${baseline.basis.season} conditions for this region — ` +
        'no live forecast was available, so check conditions before you go.'
    );
  }

  return lines.join('\n').trim();
}

module.exports = { buildBaseline, enrich, toSummary, regionFor, seasonFor };
