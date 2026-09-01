#!/usr/bin/env node
/**
 * Integration test for medication page/API route authentication.
 *
 * Spawns the real server (server.js) and exercises the HTTP endpoints to
 * confirm:
 *  - No anonymous access to medication pages/APIs
 *  - Cross-user access to another user's medication data is blocked
 *  - All medication endpoints are guarded (401 when unauthenticated,
 *    403 when CSRF is missing/invalid)
 */

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const PORT = 3000;
const BASE_HOST = 'localhost';

let testsPassed = 0;
let testsFailed = 0;

function log(message, type = 'info') {
  const symbols = { success: '✅', error: '❌', info: 'ℹ️ ' };
  console.log(`${symbols[type] || ''} ${message}`);
}

async function test(description, testFn) {
  try {
    await testFn();
    log(`PASS: ${description}`, 'success');
    testsPassed++;
  } catch (err) {
    log(`FAIL: ${description}`, 'error');
    log(`  ${err.message}`, 'error');
    testsFailed++;
  }
}

// ---- Minimal cookie-jar aware HTTP client ----

function createJar() {
  return {};
}

function jarHeader(jar) {
  const pairs = Object.entries(jar).map(([name, value]) => `${name}=${value}`);
  return pairs.join('; ');
}

function applySetCookie(jar, setCookieHeaders) {
  if (!setCookieHeaders) return;
  setCookieHeaders.forEach(cookieStr => {
    const [pair] = cookieStr.split(';');
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) return;
    const name = pair.slice(0, eqIndex).trim();
    const value = pair.slice(eqIndex + 1).trim();
    jar[name] = value;
  });
}

function requestJson(jar, method, urlPath, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const headers = Object.assign({}, extraHeaders);
    if (payload !== null) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (jar) {
      const cookieHeader = jarHeader(jar);
      if (cookieHeader) headers['Cookie'] = cookieHeader;
    }

    const req = http.request({
      hostname: BASE_HOST,
      port: PORT,
      path: urlPath,
      method,
      headers
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (jar) applySetCookie(jar, res.headers['set-cookie']);
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch (e) { parsed = null; }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: data, json: parsed });
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error(`Request timeout: ${method} ${urlPath}`));
    });

    if (payload !== null) req.write(payload);
    req.end();
  });
}

function waitForServer(maxAttempts = 40) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryOnce = () => {
      attempts++;
      const req = http.get({ hostname: BASE_HOST, port: PORT, path: '/admin/api/default-credentials-status', timeout: 2000 }, res => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (attempts >= maxAttempts) {
          reject(new Error('Server did not become ready in time'));
        } else {
          setTimeout(tryOnce, 500);
        }
      });
      req.on('timeout', () => {
        req.destroy();
        if (attempts >= maxAttempts) {
          reject(new Error('Server did not become ready in time'));
        } else {
          setTimeout(tryOnce, 500);
        }
      });
    };
    tryOnce();
  });
}

async function fetchCsrfToken(jar) {
  const res = await requestJson(jar, 'GET', '/medications/api/session');
  return res.json.csrfToken;
}

async function registerPortalUser(username, password) {
  const jar = createJar();
  const csrfToken = await fetchCsrfToken(jar);
  const res = await requestJson(jar, 'POST', '/medications/api/register', { username, password }, {
    'x-medications-csrf-token': csrfToken
  });
  assert.strictEqual(res.statusCode, 201, `registration should succeed for ${username}: ${res.body}`);
  return { jar, user: res.json.user, csrfToken: res.json.csrfToken };
}

async function run() {
  const configBackupPaths = ['config.json', 'house-data.json'].map(name => path.join(repoRoot, 'config', name));
  const backups = configBackupPaths.map(p => (fs.existsSync(p) ? fs.readFileSync(p) : null));

  const serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: repoRoot,
    env: Object.assign({}, process.env, { NODE_ENV: 'test' }),
    stdio: 'ignore'
  });

  let serverExitedEarly = false;
  serverProcess.on('exit', () => { serverExitedEarly = true; });

  try {
    await waitForServer();
    if (serverExitedEarly) throw new Error('Server process exited before becoming ready');

    log('Starting medication authentication integration tests...\n');

    // ---- No anonymous access to medication APIs ----
    await test('Unauthenticated dashboard request is rejected with 401', async () => {
      const res = await requestJson(createJar(), 'GET', '/medications/api/dashboard');
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json.success, false);
      assert.strictEqual(res.json.code, 'UNAUTHORIZED');
    });

    await test('Unauthenticated adherence recording is rejected with 401', async () => {
      const res = await requestJson(createJar(), 'POST', '/medications/api/medications/does-not-matter/adherence', { status: 'took' });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json.success, false);
    });

    await test('Unauthenticated admin medications list is rejected with 401', async () => {
      const res = await requestJson(createJar(), 'GET', '/admin/api/house/medications', undefined, { Accept: 'application/json' });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json.success, false);
    });

    await test('Invalid medication access token is rejected with 401', async () => {
      const res = await requestJson(createJar(), 'POST', '/medications/api/access/verify', { token: 'not-a-real-token' });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json.success, false);
    });

    await test('Portal login/register without CSRF token is rejected with 403', async () => {
      const jar = createJar();
      await fetchCsrfToken(jar); // establishes a session with a csrf token, but we won't send it
      const res = await requestJson(jar, 'POST', '/medications/api/login', { username: 'nobody', password: 'irrelevant' });
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.json.code, 'INVALID_CSRF_TOKEN');
    });

    // ---- Set up two portal users and an admin session ----
    const userAName = `AuthTestUserA${Date.now()}`;
    const userBName = `AuthTestUserB${Date.now()}`;
    const { jar: jarA, user: userA, csrfToken: csrfA } = await registerPortalUser(userAName, 'S3curePass!');
    const { jar: jarB, user: userB, csrfToken: csrfB } = await registerPortalUser(userBName, 'S3curePass!');

    const adminJar = createJar();
    let medicationId;

    await test('Admin login succeeds with configured credentials', async () => {
      const res = await requestJson(adminJar, 'POST', '/admin/login', { username: 'admin', password: 'admin123' }, { Accept: 'application/json' });
      assert.ok([200, 302].includes(res.statusCode), `unexpected admin login status ${res.statusCode}`);
    });

    await test('Admin can create a medication and assign it to a single user', async () => {
      const addRes = await requestJson(adminJar, 'POST', '/admin/api/house/medications', {
        name: `AuthTestMed${Date.now()}`,
        pillCount: 30
      });
      assert.strictEqual(addRes.json.success, true, `add medication failed: ${addRes.body}`);

      const listRes = await requestJson(adminJar, 'GET', '/admin/api/house/medications');
      const created = listRes.json.medications.find(m => m.assignedUserIds && m.assignedUserIds.length === 0 && m.name.startsWith('AuthTestMed'));
      assert.ok(created, 'created medication should be present in admin listing');
      medicationId = created.id;

      const assignRes = await requestJson(adminJar, 'PUT', `/admin/api/house/medications/${medicationId}/assignments`, {
        userIds: [userA.id]
      });
      assert.strictEqual(assignRes.json.success, true, `assignment failed: ${assignRes.body}`);
    });

    await test('Assigned user sees the medication on their own dashboard', async () => {
      const res = await requestJson(jarA, 'GET', '/medications/api/dashboard');
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.json.medications.some(m => m.id === medicationId), 'assigned medication should appear for user A');
    });

    await test('Unassigned user does NOT see another user\'s medication (authorization enforced)', async () => {
      const res = await requestJson(jarB, 'GET', '/medications/api/dashboard');
      assert.strictEqual(res.statusCode, 200);
      assert.ok(!res.json.medications.some(m => m.id === medicationId), 'medication assigned to user A must not be visible to user B');
    });

    await test('Assigned user can record their own adherence status', async () => {
      const res = await requestJson(jarA, 'POST', `/medications/api/medications/${medicationId}/adherence`, { status: 'took' }, {
        'x-medications-csrf-token': csrfA
      });
      assert.strictEqual(res.statusCode, 200, `expected success recording adherence: ${res.body}`);
      assert.strictEqual(res.json.success, true);
    });

    await test('Cross-user adherence recording is blocked for a medication not assigned to the requester', async () => {
      const res = await requestJson(jarB, 'POST', `/medications/api/medications/${medicationId}/adherence`, { status: 'took' }, {
        'x-medications-csrf-token': csrfB
      });
      assert.notStrictEqual(res.statusCode, 200, 'cross-user adherence write must not succeed');
      assert.strictEqual(res.json.success, false);
    });

    await test('Adherence recording without a CSRF token is rejected with 403', async () => {
      const res = await requestJson(jarA, 'POST', `/medications/api/medications/${medicationId}/adherence`, { status: 'took' });
      assert.strictEqual(res.statusCode, 403);
    });

  } finally {
    await new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      serverProcess.once('exit', finish);
      serverProcess.kill('SIGTERM');
      setTimeout(() => {
        if (!settled) serverProcess.kill('SIGKILL');
        setTimeout(finish, 200);
      }, 3000);
    });

    configBackupPaths.forEach((p, idx) => {
      if (backups[idx] === null) {
        if (fs.existsSync(p)) fs.rmSync(p);
      } else {
        fs.writeFileSync(p, backups[idx]);
      }
    });
  }

  console.log(`\n${testsPassed} passed, ${testsFailed} failed`);
  if (testsFailed > 0) {
    process.exitCode = 1;
  }
}

run().catch(err => {
  console.error('Fatal error running medication auth integration tests:', err);
  process.exitCode = 1;
});
