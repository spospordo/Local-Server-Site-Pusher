// Application output collection and unified log querying for the AI assistant.
//
// Captures process stdout/stderr (output that bypasses the central logger) into a bounded,
// redacted, age-limited store and exposes one query interface across all retained log
// sources: the central logger, the public-files regenerator and captured app output.
// No privileged host / Docker-socket access is needed: only this process's own output is
// collected, and only from the moment capture is installed.

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  maxEntries: 5000,          // in-memory ring size
  retentionHours: 72,        // entries older than this are dropped
  maxFileBytes: 2 * 1024 * 1024, // on-disk file is rotated (one backup) beyond this
  maxMessageChars: 2000
};

const LEVEL_ORDER = ['DEBUG', 'INFO', 'SUCCESS', 'WARNING', 'ERROR'];

function normalizeLevel(level) {
  const l = String(level || 'INFO').toUpperCase();
  if (l === 'WARN') return 'WARNING';
  return l;
}

function guessLevel(line, stream) {
  if (/❌|\berror\b|\bfailed\b|\bexception\b|\bfatal\b/i.test(line)) return 'ERROR';
  if (/⚠️|\bwarn(ing)?\b/i.test(line)) return 'WARNING';
  if (/✅/.test(line)) return 'SUCCESS';
  return stream === 'stderr' ? 'ERROR' : 'INFO';
}

class AppOutputStore {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.entries = []; // oldest -> newest
    this.filePath = options.filePath || null;
    this.redact = options.redact || (text => text);
    this.isDuplicate = options.isDuplicate || (() => false);
    this.installedAt = null;
    this.restoredFromDisk = 0;
    this.droppedCount = 0;
    this.installed = false;
    this.partial = { stdout: '', stderr: '' };
    this.originalWrites = null;
    this.writingToDisk = false;
  }

  // Load previous retained entries so history survives restarts.
  restore() {
    if (!this.filePath) return;
    try {
      const files = [`${this.filePath}.1`, this.filePath];
      const loaded = [];
      for (const file of files) {
        if (!fs.existsSync(file)) continue;
        for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
          if (!line) continue;
          try {
            const entry = JSON.parse(line);
            if (entry && entry.timestamp && entry.message !== undefined) loaded.push(entry);
          } catch (e) { /* skip corrupt line */ }
        }
      }
      this.entries = loaded;
      this.restoredFromDisk = loaded.length;
      this.prune();
    } catch (err) {
      // Restoration failures only reduce retained history; reported through status().
      this.restoreError = err.message;
    }
  }

  prune(now = Date.now()) {
    const cutoff = now - this.options.retentionHours * 3600 * 1000;
    const before = this.entries.length;
    this.entries = this.entries.filter(e => Date.parse(e.timestamp) >= cutoff);
    if (this.entries.length > this.options.maxEntries) {
      this.entries = this.entries.slice(this.entries.length - this.options.maxEntries);
    }
    this.droppedCount += before - this.entries.length;
  }

  add(stream, text, nowMs = Date.now()) {
    const message = String(this.redact(text)).slice(0, this.options.maxMessageChars);
    if (!message.trim()) return null;
    const entry = {
      timestamp: new Date(nowMs).toISOString(),
      source: 'app_output',
      stream,
      level: guessLevel(message, stream),
      category: stream,
      message,
      viaCentralLogger: !!this.isDuplicate()
    };
    this.entries.push(entry);
    if (this.entries.length > this.options.maxEntries) {
      this.entries.shift();
      this.droppedCount++;
    }
    this.persist(entry);
    return entry;
  }

  persist(entry) {
    if (!this.filePath || this.writingToDisk) return;
    this.writingToDisk = true;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.appendFileSync(this.filePath, JSON.stringify(entry) + '\n', { mode: 0o600 });
      this.writeCount = (this.writeCount || 0) + 1;
      if (this.writeCount % 100 === 0) this.rotateIfNeeded();
    } catch (err) {
      this.persistError = err.message;
    } finally {
      this.writingToDisk = false;
    }
  }

  rotateIfNeeded() {
    try {
      if (fs.statSync(this.filePath).size > this.options.maxFileBytes) {
        fs.renameSync(this.filePath, `${this.filePath}.1`);
      }
    } catch (e) { /* ignore */ }
  }

  feed(stream, chunk) {
    this.partial[stream] += chunk;
    let idx;
    while ((idx = this.partial[stream].indexOf('\n')) !== -1) {
      const line = this.partial[stream].slice(0, idx).replace(/\r$/, '');
      this.partial[stream] = this.partial[stream].slice(idx + 1);
      this.add(stream, line);
    }
    if (this.partial[stream].length > 20000) {
      this.add(stream, this.partial[stream]);
      this.partial[stream] = '';
    }
  }

  // Wrap process.stdout/stderr.write. Safe to call once; output is still forwarded unchanged.
  install(stdout = process.stdout, stderr = process.stderr) {
    if (this.installed) return;
    this.installed = true;
    this.installedAt = new Date().toISOString();
    this.originalWrites = { stdout: stdout.write, stderr: stderr.write, stdoutStream: stdout, stderrStream: stderr };
    const wrap = (name, target) => {
      const original = target.write;
      const self = this;
      target.write = function (chunk, ...rest) {
        try {
          self.feed(name, Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
        } catch (e) { /* never break application output */ }
        return original.call(target, chunk, ...rest);
      };
    };
    wrap('stdout', stdout);
    wrap('stderr', stderr);
  }

  uninstall() {
    if (!this.installed) return;
    this.originalWrites.stdoutStream.write = this.originalWrites.stdout;
    this.originalWrites.stderrStream.write = this.originalWrites.stderr;
    this.installed = false;
  }

  status() {
    this.prune();
    return {
      source: 'app_output',
      description: 'Application stdout/stderr captured by this process (includes output that bypasses the central logger). Redacted before storage.',
      available: true,
      entryCount: this.entries.length,
      oldest: this.entries.length ? this.entries[0].timestamp : null,
      newest: this.entries.length ? this.entries[this.entries.length - 1].timestamp : null,
      captureStartedAt: this.installedAt,
      retention: {
        maxEntries: this.options.maxEntries,
        maxAgeHours: this.options.retentionHours,
        persistedToDisk: !!this.filePath,
        restoredFromDiskOnStart: this.restoredFromDisk,
        droppedEntries: this.droppedCount
      },
      note: 'Output produced before capture was first enabled, or already discarded by retention limits, cannot be recovered.',
      error: this.persistError || this.restoreError || null
    };
  }

  getEntries() {
    this.prune();
    return this.entries;
  }
}

/**
 * Build the list of retained log sources, each producing normalized entries
 * {timestamp, source, level, category, message}.
 */
function buildLogSources({ logger, regenerator, appOutput, redact }) {
  const sources = {};

  if (logger) {
    sources.central_logger = {
      description: 'Central logger (all categories, in memory, newest 500 entries, lost on restart).',
      load() {
        const entries = logger.getLogs(null, null).map(e => ({
          timestamp: e.timestamp, source: 'central_logger', level: normalizeLevel(e.level),
          category: e.category, message: e.message
        }));
        const stamps = entries.map(e => e.timestamp).sort();
        return {
          entries,
          status: {
            available: true,
            entryCount: entries.length,
            oldest: stamps[0] || null,
            newest: stamps[stamps.length - 1] || null,
            categories: Object.values(logger.getCategories ? logger.getCategories() : {}),
            retention: { maxEntries: logger.maxLogs || 500, persistedToDisk: false, note: 'In-memory ring buffer; cleared on restart or when an admin clears logs.' }
          }
        };
      }
    };
  }

  if (regenerator) {
    sources.public_files_regenerator = {
      description: 'Public files regenerator log (in memory, newest 500 entries, reset on restart).',
      load() {
        const entries = (regenerator.getLogs() || []).map(e => ({
          timestamp: e.timestamp, source: 'public_files_regenerator', level: normalizeLevel(e.level),
          category: e.action || 'Regenerator', message: e.details || ''
        }));
        return {
          entries,
          status: {
            available: true,
            entryCount: entries.length,
            oldest: entries.length ? entries[0].timestamp : null,
            newest: entries.length ? entries[entries.length - 1].timestamp : null,
            retention: { maxEntries: 500, persistedToDisk: false, note: 'In-memory; reset on restart or when cleared.' }
          }
        };
      }
    };
  }

  if (appOutput) {
    sources.app_output = {
      description: appOutput.status().description,
      load() {
        return { entries: appOutput.getEntries(), status: appOutput.status() };
      }
    };
  }

  return sources;
}

function encodeCursor(offset, filterKey) {
  return Buffer.from(JSON.stringify({ o: offset, f: filterKey })).toString('base64url');
}
function decodeCursor(cursor) {
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (Number.isInteger(parsed.o) && parsed.o >= 0) return parsed;
  } catch (e) { /* fallthrough */ }
  return null;
}

/**
 * Query across sources. Newest first, filtered, paginated.
 */
function queryLogs(sources, params = {}, redactFn = t => t) {
  const limit = Math.min(Math.max(parseInt(params.limit, 10) || 50, 1), 200);
  const wanted = params.source && params.source !== 'all' ? [params.source] : Object.keys(sources);
  const errors = [];
  const sourceStatus = [];
  let pool = [];

  for (const name of Object.keys(sources)) {
    if (!wanted.includes(name)) continue;
    try {
      const { entries, status } = sources[name].load();
      sourceStatus.push({ source: name, ...status });
      pool = pool.concat(entries);
    } catch (err) {
      sourceStatus.push({ source: name, available: false, error: redactFn(err.message) });
    }
  }
  for (const name of wanted) {
    if (!sources[name]) {
      sourceStatus.push({ source: name, available: false, error: 'Unknown or unavailable log source' });
      errors.push(`Unknown log source: ${name}`);
    }
  }

  const since = params.since ? Date.parse(params.since) : null;
  const until = params.until ? Date.parse(params.until) : null;
  const minLevel = params.level ? normalizeLevel(params.level) : null;
  const exactLevel = params.exact_level === true;
  const category = params.category ? String(params.category).toLowerCase() : null;
  const text = params.text ? String(params.text).toLowerCase() : null;
  const includeDuplicates = params.include_duplicates === true;

  const filtered = pool.filter(e => {
    const t = Date.parse(e.timestamp);
    if (since !== null && t < since) return false;
    if (until !== null && t > until) return false;
    if (minLevel) {
      const li = LEVEL_ORDER.indexOf(e.level);
      const mi = LEVEL_ORDER.indexOf(minLevel);
      if (exactLevel || li === -1 || mi === -1) { if (e.level !== minLevel) return false; }
      else if (li < mi) return false;
    }
    if (category && !String(e.category || '').toLowerCase().includes(category)) return false;
    if (text && !String(e.message).toLowerCase().includes(text)) return false;
    if (!includeDuplicates && e.source === 'app_output' && e.viaCentralLogger) return false;
    return true;
  });
  filtered.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const filterKey = JSON.stringify([wanted, params.since, params.until, params.level, params.category, params.text, includeDuplicates]);
  let offset = 0;
  if (params.cursor) {
    const decoded = decodeCursor(params.cursor);
    if (!decoded || decoded.f !== filterKey) {
      return { success: false, error: 'Invalid or mismatched cursor; repeat the query without a cursor.' };
    }
    offset = decoded.o;
  }

  const page = filtered.slice(offset, offset + limit).map(e => ({
    timestamp: e.timestamp,
    source: e.source,
    level: e.level,
    category: e.category,
    message: redactFn(String(e.message)).slice(0, 1000)
  }));
  const nextOffset = offset + page.length;
  const hasMore = nextOffset < filtered.length;

  const incomplete = sourceStatus.filter(s => !s.available || s.error).map(s => s.source);
  return {
    success: true,
    order: 'newest_first',
    totalMatched: filtered.length,
    returned: page.length,
    nextCursor: hasMore ? encodeCursor(nextOffset, filterKey) : null,
    truncated: hasMore,
    messageTruncatedAt: 1000,
    sources: sourceStatus,
    incompleteSources: incomplete,
    complete: incomplete.length === 0,
    note: 'Only retained entries are searchable; entries already discarded by retention limits cannot be recovered. app_output entries echoed by the central logger are hidden unless include_duplicates=true.',
    entries: page,
    errors: errors.length ? errors : undefined
  };
}

function createLogService(sources, redactFn = t => t) {
  return {
    listSources() {
      const statuses = [];
      for (const [name, src] of Object.entries(sources)) {
        try {
          const { status } = src.load();
          statuses.push({ source: name, description: src.description, ...status });
        } catch (err) {
          statuses.push({ source: name, description: src.description, available: false, error: redactFn(err.message) });
        }
      }
      return {
        sources: statuses,
        note: 'Logs outside these sources (e.g. host or Docker daemon logs) are not accessible. Entries discarded by retention limits cannot be recovered.'
      };
    },
    query: params => queryLogs(sources, params, redactFn)
  };
}

module.exports = { AppOutputStore, buildLogSources, queryLogs, createLogService, LEVEL_ORDER, DEFAULTS };
