/**
 * Weather lookup.
 *
 * Two free, no-API-key services are used:
 *   1. Open-Meteo Geocoding  — city/state -> latitude/longitude
 *   2. api.weather.gov (NWS) — latitude/longitude -> current conditions + forecast
 *
 * If NWS is unavailable, the Open-Meteo forecast API is used as a fallback.
 */

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const NWS_BASE = 'https://api.weather.gov';
const OPEN_METEO_FORECAST = 'https://api.open-meteo.com/v1/forecast';

// Honor the WEATHER_-prefixed form first for consistency with the monorepo's
// namespaced config, falling back to the bare name.
const TIMEOUT_MS = Number(process.env.WEATHER_HTTP_TIMEOUT_MS || process.env.HTTP_TIMEOUT_MS || 10000);

class WeatherError extends Error {
  constructor(message, code = 'WEATHER_ERROR') {
    super(message);
    this.code = code;
  }
}

async function getJson(url, extraHeaders = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/geo+json, application/json',
        // The NWS API requires a descriptive User-Agent with contact info.
        'User-Agent':
          process.env.WEATHER_NWS_USER_AGENT ||
          process.env.NWS_USER_AGENT ||
          'a2a-weather-agent (contact@example.com)',
        ...extraHeaders
      }
    });
    if (!res.ok) {
      throw new WeatherError(`Upstream request failed (${res.status}) for ${url}`, 'UPSTREAM_ERROR');
    }
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new WeatherError(`Upstream request timed out after ${TIMEOUT_MS}ms`, 'TIMEOUT');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve a US city + state to coordinates.
 */
async function geocode(city, stateAbbr, stateName) {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(city)}&count=25&language=en&format=json&countryCode=US`;
  const data = await getJson(url);
  const results = Array.isArray(data.results) ? data.results : [];

  const inUs = results.filter((r) => r.country_code === 'US');
  if (inUs.length === 0) {
    throw new WeatherError(`Could not find a US city named "${city}".`, 'CITY_NOT_FOUND');
  }

  const match = inUs.find(
    (r) => (r.admin1 || '').toLowerCase() === stateName.toLowerCase()
  );

  if (!match) {
    throw new WeatherError(
      `Could not find "${city}" in ${stateName} (${stateAbbr}).`,
      'CITY_STATE_MISMATCH'
    );
  }

  return {
    name: match.name,
    state: match.admin1,
    county: match.admin2 || null,
    latitude: match.latitude,
    longitude: match.longitude,
    timezone: match.timezone || null
  };
}

/**
 * NWS forecast for a coordinate pair.
 */
async function nwsForecast(lat, lon) {
  const points = await getJson(`${NWS_BASE}/points/${lat.toFixed(4)},${lon.toFixed(4)}`);
  const forecastUrl = points?.properties?.forecast;
  const hourlyUrl = points?.properties?.forecastHourly;
  if (!forecastUrl) {
    throw new WeatherError('NWS did not return a forecast URL for this location.', 'NO_FORECAST');
  }

  const [forecast, hourly] = await Promise.all([
    getJson(forecastUrl),
    hourlyUrl ? getJson(hourlyUrl).catch(() => null) : Promise.resolve(null)
  ]);

  const periods = forecast?.properties?.periods || [];
  if (periods.length === 0) {
    throw new WeatherError('NWS returned an empty forecast.', 'NO_FORECAST');
  }

  const now = hourly?.properties?.periods?.[0] || null;

  return {
    source: 'National Weather Service (api.weather.gov)',
    office: points?.properties?.gridId || null,
    current: now
      ? {
          temperature: now.temperature,
          temperatureUnit: now.temperatureUnit,
          shortForecast: now.shortForecast,
          windSpeed: now.windSpeed,
          windDirection: now.windDirection,
          relativeHumidity: now.relativeHumidity?.value ?? null,
          probabilityOfPrecipitation: now.probabilityOfPrecipitation?.value ?? null
        }
      : null,
    periods: periods.slice(0, 4).map((p) => ({
      name: p.name,
      isDaytime: p.isDaytime,
      temperature: p.temperature,
      temperatureUnit: p.temperatureUnit,
      windSpeed: p.windSpeed,
      windDirection: p.windDirection,
      shortForecast: p.shortForecast,
      detailedForecast: p.detailedForecast
    }))
  };
}

/**
 * Fallback if NWS is down or the location is outside NWS coverage.
 */
async function openMeteoForecast(lat, lon) {
  const url =
    `${OPEN_METEO_FORECAST}?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code' +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=3&timezone=auto';

  const data = await getJson(url);

  return {
    source: 'Open-Meteo (fallback)',
    office: null,
    current: data.current
      ? {
          temperature: Math.round(data.current.temperature_2m),
          temperatureUnit: 'F',
          shortForecast: describeWeatherCode(data.current.weather_code),
          windSpeed: `${Math.round(data.current.wind_speed_10m)} mph`,
          windDirection: null,
          relativeHumidity: data.current.relative_humidity_2m ?? null,
          probabilityOfPrecipitation: null
        }
      : null,
    periods: (data.daily?.time || []).slice(0, 3).map((day, i) => ({
      name: day,
      isDaytime: true,
      temperature: Math.round(data.daily.temperature_2m_max[i]),
      temperatureUnit: 'F',
      windSpeed: null,
      windDirection: null,
      shortForecast: `High ${Math.round(data.daily.temperature_2m_max[i])}F / Low ${Math.round(
        data.daily.temperature_2m_min[i]
      )}F`,
      detailedForecast: `Chance of precipitation ${
        data.daily.precipitation_probability_max?.[i] ?? 0
      }%.`
    }))
  };
}

function describeWeatherCode(code) {
  const map = {
    0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Freezing fog', 51: 'Light drizzle', 53: 'Drizzle',
    55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Rain showers',
    81: 'Rain showers', 82: 'Violent rain showers', 95: 'Thunderstorm',
    96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail'
  };
  return map[code] || 'Unknown conditions';
}

/**
 * Human-readable summary used as the agent's text response.
 */
function toSummary(place, wx) {
  const lines = [];
  lines.push(`Weather for ${place.name}, ${place.state}`);

  if (wx.current) {
    const c = wx.current;
    const bits = [`${c.temperature}\u00B0${c.temperatureUnit}`, c.shortForecast].filter(Boolean);
    let line = `Now: ${bits.join(', ')}`;
    if (c.windSpeed) line += `. Wind ${[c.windDirection, c.windSpeed].filter(Boolean).join(' ')}`;
    if (c.relativeHumidity !== null && c.relativeHumidity !== undefined) {
      line += `. Humidity ${c.relativeHumidity}%`;
    }
    lines.push(`${line}.`);
  }

  wx.periods.forEach((p) => {
    lines.push(`${p.name}: ${p.detailedForecast || p.shortForecast}`);
  });

  lines.push(`Source: ${wx.source}`);
  return lines.join('\n');
}

/**
 * Main entry point: city + state -> { summary, data }
 */
async function getWeather({ city, state, stateName }) {
  const place = await geocode(city, state, stateName);

  let wx;
  try {
    wx = await nwsForecast(place.latitude, place.longitude);
  } catch (err) {
    console.warn(`NWS lookup failed (${err.message}); falling back to Open-Meteo.`);
    wx = await openMeteoForecast(place.latitude, place.longitude);
  }

  return {
    summary: toSummary(place, wx),
    data: {
      location: {
        city: place.name,
        state: place.state,
        stateAbbreviation: state,
        county: place.county,
        latitude: place.latitude,
        longitude: place.longitude,
        timezone: place.timezone
      },
      current: wx.current,
      forecast: wx.periods,
      source: wx.source,
      retrievedAt: new Date().toISOString()
    }
  };
}

module.exports = { getWeather, WeatherError };
