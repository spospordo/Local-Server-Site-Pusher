// Read-only calendar range queries for the AI assistant.
// Unlike the Smart Mirror widget (max 10 events, next ~30 days, no recurrence expansion) this
// service answers arbitrary date ranges, expands recurring events, handles all-day events
// and time zones, and reports stale / failed / incomplete feeds explicitly.

const ical = require('node-ical');

const MAX_RANGE_DAYS = 400;
const MAX_OCCURRENCES_PER_EVENT = 500;
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;

function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch (e) {
    return false;
  }
}

function partsInZone(ms, tz) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const out = {};
  for (const p of fmt.formatToParts(new Date(ms))) out[p.type] = p.value;
  return {
    year: +out.year, month: +out.month, day: +out.day,
    hour: +out.hour % 24, minute: +out.minute, second: +out.second
  };
}

function zoneOffsetMs(ms, tz) {
  const p = partsInZone(ms, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

// UTC instant of a wall-clock time in tz.
function wallToUtc(y, m, d, h, mi, s, tz) {
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  let result = guess - zoneOffsetMs(guess, tz);
  result = guess - zoneOffsetMs(result, tz);
  return result;
}

// UTC instant of local midnight of y-m-d in tz.
function zonedMidnightUtc(y, m, d, tz) {
  return wallToUtc(y, m, d, 0, 0, 0, tz);
}

function pad(n) { return String(n).padStart(2, '0'); }

function localDateString(ms, tz) {
  const p = partsInZone(ms, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function formatLocal(ms, tz) {
  const p = partsInZone(ms, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/**
 * Parse a range boundary. Plain dates are interpreted in `tz` (end dates are inclusive).
 * @returns {number|null} epoch ms (end is exclusive)
 */
function parseBoundary(value, tz, isEnd) {
  const text = String(value || '').trim();
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const startOfDay = zonedMidnightUtc(y, mo, d, tz);
    if (!isEnd) return startOfDay;
    const next = addDays(text, 1).split('-').map(Number);
    return zonedMidnightUtc(next[0], next[1], next[2], tz);
  }
  const t = Date.parse(text);
  return Number.isNaN(t) ? null : t;
}

function strValue(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object' && v.val !== undefined) return String(v.val);
  return String(v);
}

function isAllDayEvent(e) {
  return e.datetype === 'date' || (e.start && e.start.dateOnly === true);
}

// All-day dates are floating calendar dates; node-ical builds them at local midnight.
function floatingDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function expandEvent(e, range, tz) {
  const out = [];
  let truncated = false;
  const allDay = isAllDayEvent(e);
  const start = e.start instanceof Date ? e.start : null;
  if (!start) return { occurrences: out, truncated };
  const end = e.end instanceof Date ? e.end : null;
  const durationMs = end ? Math.max(end - start, 0) : (allDay ? DAY_MS : 0);

  const make = (src, occStart, occEnd) => {
    const title = strValue(src.summary) || strValue(e.summary) || 'Untitled Event';
    const base = {
      title,
      location: strValue(src.location !== undefined ? src.location : e.location),
      description: strValue(src.description !== undefined ? src.description : e.description).slice(0, 500),
      status: strValue(src.status || e.status) || undefined,
      recurring: !!e.rrule || !!e.recurrenceid
    };
    if (allDay) {
      const sd = floatingDate(occStart);
      let ed = floatingDate(occEnd);
      if (ed <= sd) ed = addDays(sd, 1);
      return { ...base, allDay: true, startDate: sd, endDateExclusive: ed, endDate: addDays(ed, -1) };
    }
    const s = occStart.getTime();
    const en = occEnd.getTime();
    return {
      ...base,
      allDay: false,
      start: new Date(s).toISOString(),
      end: new Date(en).toISOString(),
      startLocal: formatLocal(s, tz),
      endLocal: formatLocal(en, tz),
      timeZone: tz,
      eventTimeZone: e.start.tz || undefined,
      durationMinutes: Math.round((en - s) / 60000)
    };
  };

  const rangeStartDate = localDateString(range.start, tz);
  const rangeEndDateExclusive = addDays(localDateString(range.end - 1, tz), 1);
  const overlaps = occ => {
    if (occ.allDay) return occ.startDate < rangeEndDateExclusive && occ.endDateExclusive > rangeStartDate;
    const s = Date.parse(occ.start);
    const en = Date.parse(occ.end);
    return en > s ? (s < range.end && en > range.start) : (s >= range.start && s < range.end);
  };

  const dateMsSet = obj => new Set(Object.values(obj || {}).map(v => (v instanceof Date ? v.getTime() : NaN)));
  const excludedMs = dateMsSet(e.exdate);
  const excludedDays = new Set(Object.values(e.exdate || {}).filter(v => v instanceof Date).map(floatingDate));
  const overrideMs = new Set(Object.values(e.recurrences || {}).map(o => (o && o.recurrenceid instanceof Date ? o.recurrenceid.getTime() : NaN)));
  const overrideDays = new Set(Object.values(e.recurrences || {}).filter(o => o && o.recurrenceid instanceof Date).map(o => floatingDate(o.recurrenceid)));
  const skipInstance = d => (allDay
    ? excludedDays.has(floatingDate(d)) || overrideDays.has(floatingDate(d))
    : excludedMs.has(d.getTime()) || overrideMs.has(d.getTime()));

  if (e.rrule) {
    // Pad the window by the duration so events that started earlier but overlap are caught.
    // All-day instances may be generated at UTC midnight so add a one day margin.
    const windowStart = range.start - durationMs - DAY_MS;
    const windowEnd = range.end + DAY_MS;
    let dates = [];
    try {
      const eventTz = !allDay && e.start.tz && isValidTimeZone(e.start.tz) ? e.start.tz : null;
      if (eventTz) {
        // rrule's tzid support depends on the host time zone, so expand in wall-clock time
        // (as if UTC) and convert each occurrence back using the event's own zone (DST-safe).
        const wall = ms => { const p = partsInZone(ms, eventTz); return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)); };
        const o = e.rrule.origOptions || e.rrule.options;
        const opts = { ...o, tzid: null, dtstart: wall(start.getTime()) };
        if (o.until) opts.until = wall(o.until.getTime());
        const rule = new e.rrule.constructor(opts);
        dates = rule.between(wall(windowStart), wall(windowEnd), true).map(w => new Date(
          wallToUtc(w.getUTCFullYear(), w.getUTCMonth() + 1, w.getUTCDate(), w.getUTCHours(), w.getUTCMinutes(), w.getUTCSeconds(), eventTz)));
      } else {
        dates = e.rrule.between(new Date(windowStart), new Date(windowEnd), true);
      }
    } catch (err) {
      throw new Error(`Could not expand recurrence rule: ${err.message}`);
    }
    if (dates.length > MAX_OCCURRENCES_PER_EVENT) {
      truncated = true;
      dates = dates.slice(0, MAX_OCCURRENCES_PER_EVENT);
    }
    for (const d of dates) {
      if (skipInstance(d)) continue;
      const occ = make(e, d, new Date(d.getTime() + durationMs));
      if (overlaps(occ)) out.push(occ);
    }
    for (const ov of Object.values(e.recurrences || {})) {
      if (!(ov.start instanceof Date)) continue;
      const ovEnd = ov.end instanceof Date ? ov.end : new Date(ov.start.getTime() + durationMs);
      const occ = make(ov, ov.start, ovEnd);
      if (strValue(ov.status).toUpperCase() === 'CANCELLED') continue;
      if (overlaps(occ)) out.push(occ);
    }
  } else {
    const occ = make(e, start, end || new Date(start.getTime() + durationMs));
    if (overlaps(occ)) out.push(occ);
  }
  return { occurrences: out, truncated };
}

function createCalendarService(options = {}) {
  const cache = new Map(); // feedUrl -> { text, fetchedAt }
  const ttlMs = options.ttlMs || DEFAULT_TTL_MS;
  const now = options.now || (() => Date.now());
  const fetchText = options.fetchText;
  const redactError = options.redactError || (m => m);
  const parse = options.parse || (text => ical.sync.parseICS(text));

  async function loadFeed(feed) {
    const t = now();
    const cached = cache.get(feed.url);
    if (cached && t - cached.fetchedAt < ttlMs) {
      return { text: cached.text, status: 'ok', fetchedAt: cached.fetchedAt, fromCache: true };
    }
    try {
      const text = await fetchText(feed.url);
      if (typeof text !== 'string' || !text.includes('BEGIN:VCALENDAR')) {
        throw new Error('Response was not a valid iCalendar feed');
      }
      cache.set(feed.url, { text, fetchedAt: t });
      return { text, status: 'ok', fetchedAt: t, fromCache: false };
    } catch (err) {
      const message = redactError(err.message || String(err));
      if (cached) {
        return { text: cached.text, status: 'stale', fetchedAt: cached.fetchedAt, error: message, fromCache: true };
      }
      return { text: null, status: 'failed', error: message };
    }
  }

  /**
   * @param {Object} params {feeds, start, end, timeZone, calendarIds, text, limit, offset}
   */
  async function queryRange(params) {
    const tz = params.timeZone || options.defaultTimeZone || 'UTC';
    if (!isValidTimeZone(tz)) {
      return { success: false, error: `Invalid IANA time zone: ${tz}` };
    }
    const startMs = parseBoundary(params.start, tz, false);
    const endMs = parseBoundary(params.end, tz, true);
    if (startMs === null || endMs === null) {
      return { success: false, error: 'start and end must be YYYY-MM-DD dates or ISO 8601 date-times' };
    }
    if (endMs <= startMs) return { success: false, error: 'end must be after start' };
    if ((endMs - startMs) / DAY_MS > MAX_RANGE_DAYS) {
      return { success: false, error: `Date range too large (max ${MAX_RANGE_DAYS} days); split the question into smaller ranges` };
    }
    const range = { start: startMs, end: endMs };
    const limit = Math.min(Math.max(parseInt(params.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(params.offset, 10) || 0, 0);
    let feeds = params.feeds || [];
    if (Array.isArray(params.calendarIds) && params.calendarIds.length) {
      feeds = feeds.filter(f => params.calendarIds.includes(f.id));
    }
    if (!feeds.length) {
      return { success: false, error: 'No calendar feeds are configured (or none matched calendar_ids)' };
    }

    const feedStatus = [];
    let events = [];
    for (const feed of feeds) {
      const loaded = await loadFeed(feed);
      const status = {
        calendarId: feed.id, label: feed.label, status: loaded.status,
        fetchedAt: loaded.fetchedAt ? new Date(loaded.fetchedAt).toISOString() : null
      };
      if (loaded.error) status.error = loaded.error;
      if (loaded.status === 'stale') status.note = 'Live fetch failed; results come from an older cached copy and may be out of date.';
      if (loaded.status === 'failed') status.note = 'Feed could not be fetched; its events are missing from the results.';
      if (loaded.text) {
        try {
          const parsed = parse(loaded.text);
          let truncated = false;
          let eventErrors = 0;
          let count = 0;
          for (const item of Object.values(parsed)) {
            if (!item || item.type !== 'VEVENT') continue;
            try {
              const r = expandEvent(item, range, tz);
              truncated = truncated || r.truncated;
              for (const occ of r.occurrences) { occ.calendarId = feed.id; occ.calendar = feed.label; events.push(occ); count++; }
            } catch (err) {
              eventErrors++;
            }
          }
          status.eventCount = count;
          if (truncated) {
            status.status = status.status === 'ok' ? 'incomplete' : status.status;
            status.note = `Some recurring events produced more than ${MAX_OCCURRENCES_PER_EVENT} occurrences and were truncated.`;
          }
          if (eventErrors) {
            status.status = status.status === 'ok' ? 'incomplete' : status.status;
            status.skippedEvents = eventErrors;
            status.note = `${eventErrors} event(s) could not be interpreted and were skipped.`;
          }
        } catch (err) {
          status.status = 'failed';
          status.error = redactError(`Could not parse feed: ${err.message}`);
          status.note = 'Feed content could not be parsed; its events are missing from the results.';
        }
      }
      feedStatus.push(status);
    }

    if (params.text) {
      const needle = String(params.text).toLowerCase();
      events = events.filter(ev => `${ev.title} ${ev.location} ${ev.description}`.toLowerCase().includes(needle));
    }
    const sortKey = ev => (ev.allDay ? `${ev.startDate}T00:00:00` : ev.startLocal);
    events.sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || a.title.localeCompare(b.title));

    // Deterministic summary computed in code
    const perDay = {};
    for (const ev of events) {
      const day = ev.allDay ? ev.startDate : ev.startLocal.slice(0, 10);
      perDay[day] = (perDay[day] || 0) + 1;
    }
    const page = events.slice(offset, offset + limit);
    const complete = feedStatus.every(f => f.status === 'ok');
    return {
      success: true,
      range: {
        start: new Date(startMs).toISOString(), endExclusive: new Date(endMs).toISOString(),
        timeZone: tz, startLocal: formatLocal(startMs, tz), endExclusiveLocal: formatLocal(endMs, tz)
      },
      complete,
      feeds: feedStatus,
      summary: {
        totalEvents: events.length,
        allDayEvents: events.filter(e => e.allDay).length,
        timedEvents: events.filter(e => !e.allDay).length,
        eventsPerDay: perDay
      },
      offset,
      returned: page.length,
      nextOffset: offset + page.length < events.length ? offset + page.length : null,
      truncated: offset + page.length < events.length,
      note: complete ? undefined : 'One or more feeds are stale, failed or incomplete: do not present these results as a complete schedule.',
      events: page
    };
  }

  return { queryRange, loadFeed, _cache: cache };
}

module.exports = {
  createCalendarService, parseBoundary, zonedMidnightUtc, isValidTimeZone, expandEvent,
  MAX_RANGE_DAYS, MAX_OCCURRENCES_PER_EVENT
};
