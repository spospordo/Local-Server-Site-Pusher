#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { JSDOM } = require('jsdom');

const repoRoot = path.join(__dirname, '..');
const configDir = path.join(repoRoot, 'config');
const configPath = path.join(configDir, 'config.json');
const houseModulePath = path.join(repoRoot, 'modules', 'house.js');
const adminDashboardHtml = fs.readFileSync(path.join(repoRoot, 'admin', 'dashboard.html'), 'utf8');
const PORT = 3107;
const BASE_HOST = '127.0.0.1';

function loadHouse() {
  delete require.cache[require.resolve(houseModulePath)];
  return require(houseModulePath);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getDateOffset(daysOffset) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysOffset);
  return date.toISOString().slice(0, 10);
}

function createJar() {
  return {};
}

function jarHeader(jar) {
  return Object.entries(jar).map(([name, value]) => `${name}=${value}`).join('; ');
}

function applySetCookie(jar, setCookieHeaders) {
  if (!setCookieHeaders) return;
  setCookieHeaders.forEach(cookieStr => {
    const [pair] = cookieStr.split(';');
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex === -1) return;
    jar[pair.slice(0, separatorIndex).trim()] = pair.slice(separatorIndex + 1).trim();
  });
}

function requestJson(jar, method, urlPath, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const headers = { ...extraHeaders };
    if (payload !== null) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const cookieHeader = jar ? jarHeader(jar) : '';
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    const req = http.request({
      hostname: BASE_HOST,
      port: PORT,
      path: urlPath,
      method,
      headers
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (jar) {
          applySetCookie(jar, res.headers['set-cookie']);
        }

        let json = null;
        try {
          json = data ? JSON.parse(data) : null;
        } catch (error) {
          json = null;
        }

        resolve({ statusCode: res.statusCode, headers: res.headers, body: data, json });
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error(`Request timeout: ${method} ${urlPath}`));
    });

    if (payload !== null) {
      req.write(payload);
    }
    req.end();
  });
}

function waitForServer(maxAttempts = 40) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryOnce = () => {
      attempts += 1;
      const req = http.get({
        hostname: BASE_HOST,
        port: PORT,
        path: '/admin/api/default-credentials-status',
        timeout: 2000
      }, res => {
        res.resume();
        resolve();
      });

      req.on('error', () => {
        if (attempts >= maxAttempts) {
          reject(new Error('Server did not become ready in time'));
        } else {
          setTimeout(tryOnce, 250);
        }
      });

      req.on('timeout', () => {
        req.destroy();
        if (attempts >= maxAttempts) {
          reject(new Error('Server did not become ready in time'));
        } else {
          setTimeout(tryOnce, 250);
        }
      });
    };

    tryOnce();
  });
}

function extractFunctionSource(source, signature) {
  const startIndex = source.indexOf(signature);
  if (startIndex === -1) {
    throw new Error(`Unable to locate ${signature}`);
  }

  const bodyStartIndex = source.indexOf('{', startIndex);
  let depth = 0;
  for (let index = bodyStartIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  throw new Error(`Unable to parse ${signature}`);
}

function cleanup(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

async function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medications-admin-summary-'));
  const dataFilePath = path.join(tempDir, 'house-data.json');
  const configBackup = fs.existsSync(configPath) ? fs.readFileSync(configPath) : null;
  const testConfig = {
    server: {
      port: PORT,
      admin: {
        username: 'admin',
        password: 'admin123'
      }
    },
    homeAssistant: {
      enabled: false,
      mediaPlayers: {
        enabled: false,
        refreshInterval: 5000,
        includeDevices: [],
        excludeDevices: []
      }
    },
    cockpit: {
      enabled: false,
      url: 'http://localhost:9090'
    },
    webContent: {
      directory: './public',
      defaultFile: 'index.html'
    },
    storage: {
      maxTotalSize: '1GB',
      maxFileSizes: {
        image: '50MB',
        video: '500MB',
        document: '100MB',
        other: '10MB'
      }
    },
    usefulLinks: [],
    client: {
      enabled: true,
      requirePassword: false,
      showServerStatus: true,
      showUsefulLinks: true,
      welcomeMessage: 'Welcome to Local Server Site Pusher'
    },
    connectedDevices: [],
    drinkMixer: {
      alcohols: [],
      mixers: [],
      recipes: []
    },
    vidiots: {
      enabled: false,
      outputFile: './public/vidiots/index.html',
      posterDirectory: './public/vidiots/posters',
      posterBaseUrl: '/vidiots/posters/',
      cronSchedule: '0 6,12 * * *',
      forceUpdate: false,
      maxAgeHours: 24,
      githubPages: {
        enabled: false,
        repoOwner: '',
        repoName: '',
        branch: 'main',
        repoLocalPath: '',
        accessToken: '',
        commitMessage: 'Automated vidiots update'
      }
    },
    espresso: {
      enabled: false,
      dataFilePath: './config/espresso-data.json',
      templatePath: '',
      outputPath: './public/espresso/index.html',
      imagePaths: {},
      localRepo: {
        enabled: false,
        outputPath: 'espresso/index.html',
        imagePath: 'espresso/images'
      },
      githubPages: {
        enabled: false,
        repoOwner: '',
        repoName: '',
        branch: 'main',
        repoLocalPath: '',
        accessToken: '',
        remotePath: 'espresso/index.html',
        imageRemotePath: 'espresso/images',
        commitMessage: 'Automated espresso update'
      }
    },
    publicFilesRegeneration: {
      enabled: false,
      delaySeconds: 5,
      runOnStartup: false,
      forceOverwrite: false
    },
    house: {
      dataFilePath
    }
  };

  let serverProcess = null;

  try {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2));

    const house = loadHouse();
    house.init(testConfig);
    const today = getDateOffset(0);
    const yesterday = getDateOffset(-1);

    const morningMedResult = house.addMedication({
      name: 'Morning Med',
      instructions: 'Take with breakfast',
      scheduleFrequency: 'daily',
      pillCount: 30,
      refillDate: getDateOffset(-4),
      alertThresholdDays: 5
    });
    const eveningMedResult = house.addMedication({
      name: 'Evening Med',
      instructions: 'Take before bed',
      scheduleFrequency: 'daily',
      pillCount: 4,
      refillDate: today,
      alertThresholdDays: 5
    });
    const vitaminResult = house.addMedication({
      name: 'Vitamin D',
      instructions: 'Take with lunch',
      scheduleFrequency: 'daily',
      pillCount: 20,
      regimenEffectiveDate: getDateOffset(-10),
      refillDate: today,
      alertThresholdDays: 3
    });

    assert.strictEqual(morningMedResult.success, true, 'morning medication should be created');
    assert.strictEqual(eveningMedResult.success, true, 'evening medication should be created');
    assert.strictEqual(vitaminResult.success, true, 'vitamin medication should be created');

    const portalUserA = house.createMedicationPortalUser({ username: 'Casey', passwordHash: 'salt:hash-a' });
    const portalUserB = house.createMedicationPortalUser({ username: 'Morgan', passwordHash: 'salt:hash-b' });
    assert.strictEqual(portalUserA.success, true, 'Casey portal user should be created');
    assert.strictEqual(portalUserB.success, true, 'Morgan portal user should be created');

    const medsData = house.getMedicationsData();
    const morningMed = medsData.medications.find(item => item.name === 'Morning Med');
    const eveningMed = medsData.medications.find(item => item.name === 'Evening Med');
    const vitamin = medsData.medications.find(item => item.name === 'Vitamin D');
    assert.ok(morningMed && eveningMed && vitamin, 'seed medications should be present');

    const regimenChangeDate = getDateOffset(-2);
    assert.strictEqual(house.updateMedication(morningMed.id, {
      scheduleFrequency: 'twice daily',
      pillsPerDose: 2,
      regimenEffectiveDate: regimenChangeDate
    }).success, true, 'morning medication should support dated regimen changes');
    const updatedMorningMed = house.getMedicationsData().medications.find(item => item.id === morningMed.id);
    assert.ok(updatedMorningMed, 'updated morning medication should still exist');
    assert.strictEqual(updatedMorningMed.regimenHistory.length, 2, 'dated regimen changes should be retained in medication history');

    assert.strictEqual(house.setMedicationAssignments(morningMed.id, [portalUserA.user.id, portalUserB.user.id]).success, true);
    assert.strictEqual(house.setMedicationAssignments(eveningMed.id, [portalUserA.user.id]).success, true);
    assert.strictEqual(house.setMedicationAssignments(vitamin.id, [portalUserB.user.id]).success, true);

    const assignedBeforeWindow = `${getDateOffset(-8)}T08:00:00.000Z`;
    const seededData = house.getMedicationsData();
    seededData.assignments = seededData.assignments.map(assignment => ({
      ...assignment,
      assignedAt: assignedBeforeWindow
    }));
    assert.strictEqual(house.saveMedicationsData(seededData).success, true, 'seed assignments should be backdated into the summary window');

    assert.strictEqual(house.recordMedicationAdherence(portalUserA.user.id, morningMed.id, 'took', today, { pillsTaken: 3 }).success, true);
    assert.strictEqual(house.recordMedicationAdherence(portalUserB.user.id, morningMed.id, 'took', today).success, true);
    assert.strictEqual(house.recordMedicationAdherence(portalUserB.user.id, vitamin.id, 'not_taken', today).success, true);

    serverProcess = spawn(process.execPath, ['server.js'], {
      cwd: repoRoot,
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const serverLogs = [];
    serverProcess.stdout.on('data', chunk => serverLogs.push(chunk.toString()));
    serverProcess.stderr.on('data', chunk => serverLogs.push(chunk.toString()));

    await waitForServer();
    await wait(100);

    const adminJar = createJar();
    const loginResponse = await requestJson(adminJar, 'POST', '/admin/login', {
      username: 'admin',
      password: 'admin123'
    }, {
      Accept: 'application/json'
    });
    assert.ok([200, 302].includes(loginResponse.statusCode), `admin login should succeed: ${loginResponse.body || serverLogs.join('')}`);

    const adminPastRegimenSaveDate = getDateOffset(-1);
    const adminFutureRegimenSaveDate = getDateOffset(3);
    const adminPastSaveResponse = await requestJson(adminJar, 'PUT', `/admin/api/house/medications/${vitamin.id}/regimen`, {
      instructions: 'Take with dinner',
      scheduleFrequency: 'twice daily',
      pillsPerDose: 1.5,
      regimenEffectiveDate: adminPastRegimenSaveDate,
      pillCount: 18
    }, {
      Accept: 'application/json'
    });
    assert.strictEqual(adminPastSaveResponse.statusCode, 200, `admin regimen save should succeed for past dates: ${adminPastSaveResponse.body}`);
    assert.strictEqual(adminPastSaveResponse.json.success, true, `admin regimen save should report success for past dates: ${adminPastSaveResponse.body}`);

    const adminFutureSaveResponse = await requestJson(adminJar, 'PUT', `/admin/api/house/medications/${vitamin.id}/regimen`, {
      instructions: 'Take before bed',
      scheduleFrequency: 'weekly',
      pillsPerDose: 2,
      regimenEffectiveDate: adminFutureRegimenSaveDate,
      pillCount: 12
    }, {
      Accept: 'application/json'
    });
    assert.strictEqual(adminFutureSaveResponse.statusCode, 200, `admin regimen save should succeed for future dates: ${adminFutureSaveResponse.body}`);
    assert.strictEqual(adminFutureSaveResponse.json.success, true, `admin regimen save should report success for future dates: ${adminFutureSaveResponse.body}`);

    const invalidRegimenResponse = await requestJson(adminJar, 'PUT', `/admin/api/house/medications/${vitamin.id}/regimen`, {
      instructions: 'Take with lunch',
      scheduleFrequency: 'three times daily',
      pillsPerDose: 2,
      pillCount: 10,
      regimenEffectiveDate: 'invalid-date'
    }, {
      Accept: 'application/json'
    });
    assert.strictEqual(invalidRegimenResponse.statusCode, 400, `invalid regimen effective dates should be rejected as validation errors: ${invalidRegimenResponse.body}`);
    assert.strictEqual(invalidRegimenResponse.json.error, 'A valid regimen effective date is required', 'invalid regimen saves should return the validation message shown in the admin UI');

    const summaryResponse = await requestJson(adminJar, 'GET', '/admin/api/house/medications', undefined, {
      Accept: 'application/json'
    });
    assert.strictEqual(summaryResponse.statusCode, 200, `admin medications response should succeed: ${summaryResponse.body}`);

    const summaryPayload = summaryResponse.json;
    assert.ok(Array.isArray(summaryPayload.adherenceSummaryWindowDays), 'summary payload should include the adherence window');
    assert.strictEqual(summaryPayload.adherenceSummaryWindowDays.length, 7, 'summary window should default to seven days');
    assert.strictEqual(summaryPayload.adherenceSummaryWindowDays[0], today, 'summary window should start with today');
    const eveningMedicationSummary = summaryPayload.medications.find(medication => medication.name === 'Evening Med');
    const morningMedicationSummary = summaryPayload.medications.find(medication => medication.name === 'Morning Med');
    assert.ok(eveningMedicationSummary, 'medications payload should include the evening medication');
    assert.ok(morningMedicationSummary, 'medications payload should include the morning medication');
    assert.strictEqual(eveningMedicationSummary.alertThresholdPillCount, 5, 'admin medications payload should expose the pill-count alert threshold explicitly');
    assert.strictEqual(eveningMedicationSummary.estimatedRemainingPillCount, 4, 'admin medications payload should expose estimated remaining pill counts');
    assert.strictEqual(eveningMedicationSummary.belowAlertThreshold, true, 'admin medications payload should flag medications that are below the threshold');
    assert.strictEqual(morningMedicationSummary.scheduleFrequency, 'twice daily', 'admin medications payload should expose the current effective regimen');
    assert.strictEqual(morningMedicationSummary.pillsPerDose, 2, 'admin medications payload should expose the current effective pills per dose');
    assert.strictEqual(morningMedicationSummary.regimenHistory.length, 2, 'admin medications payload should include dated regimen history');
    assert.strictEqual(morningMedicationSummary.estimatedRemainingPillCount, 20, 'admin medications payload should forecast across dated regimen changes');
    const vitaminMedicationSummary = summaryPayload.medications.find(medication => medication.name === 'Vitamin D');
    assert.ok(vitaminMedicationSummary, 'admin medications payload should include the updated vitamin medication');
    assert.strictEqual(vitaminMedicationSummary.id, vitamin.id, 'admin medications payload should preserve the medication id when merging current regimen details');
    assert.strictEqual(vitaminMedicationSummary.instructions, 'Take with dinner', 'admin medication saves should persist updated instructions');
    assert.strictEqual(vitaminMedicationSummary.pillCount, 18, 'admin medication saves should persist updated pill counts');
    assert.strictEqual(vitaminMedicationSummary.scheduleFrequency, 'twice daily', 'admin medications payload should expose the current effective regimen after a past-dated save');
    assert.strictEqual(vitaminMedicationSummary.pillsPerDose, 1.5, 'admin medications payload should expose the current effective pills per dose after a past-dated save');
    assert.strictEqual(vitaminMedicationSummary.regimenHistory.length, 3, 'admin medication saves should append both past- and future-dated regimen entries');
    assert.ok(
      vitaminMedicationSummary.regimenHistory.some(entry => entry.effectiveDate === adminPastRegimenSaveDate
        && entry.scheduleFrequency === 'twice daily'
        && Number(entry.pillsPerDose) === 1.5
        && entry.instructions === 'Take with dinner'
        && Number(entry.pillCount) === 18),
      'admin medication saves should persist the past-dated regimen change in regimen history'
    );
    assert.ok(
      vitaminMedicationSummary.regimenHistory.some(entry => entry.effectiveDate === adminFutureRegimenSaveDate
        && entry.scheduleFrequency === 'weekly'
        && Number(entry.pillsPerDose) === 2
        && entry.instructions === 'Take before bed'
        && Number(entry.pillCount) === 12),
      'admin medication saves should persist the future-dated regimen change in regimen history'
    );

    const createMedicationResponse = await requestJson(adminJar, 'POST', '/admin/api/house/medications', {
      name: 'API Created Med',
      description: 'Created through save medication',
      usage: 'Create workflow coverage',
      instructions: 'Take 1 pill once daily',
      scheduleFrequency: 'daily',
      pillsPerDose: 1,
      refillDate: today,
      pillCount: 14,
      refillExpiration: '2027-02-28',
      alertThresholdDays: 2
    }, {
      Accept: 'application/json'
    });
    assert.strictEqual(createMedicationResponse.statusCode, 200, `save medication should create a new medication: ${createMedicationResponse.body}`);
    assert.strictEqual(createMedicationResponse.json.success, true, 'create medication API should report success');

    const summaryAfterCreateResponse = await requestJson(adminJar, 'GET', '/admin/api/house/medications', undefined, {
      Accept: 'application/json'
    });
    assert.strictEqual(summaryAfterCreateResponse.statusCode, 200, `summary should reload after creating a medication: ${summaryAfterCreateResponse.body}`);
    const createdMedicationSummary = summaryAfterCreateResponse.json.medications.find(medication => medication.name === 'API Created Med');
    assert.ok(createdMedicationSummary, 'newly created medications should appear in the admin medications payload');
    assert.strictEqual(createdMedicationSummary.pillCount, 14, 'create workflow should persist the initial bottle pill count');
    assert.strictEqual(createdMedicationSummary.refillDate, today, 'create workflow should persist the initial refill date');
    assert.strictEqual(createdMedicationSummary.refillExpiration, '2027-02-28', 'create workflow should persist the initial refill expiration');
    assert.strictEqual(createdMedicationSummary.regimenHistory.length, 1, 'create workflow should seed regimen history');
    assert.strictEqual(createdMedicationSummary.refillHistory.length, 1, 'create workflow should seed refill history');

    const editMedicationResponse = await requestJson(adminJar, 'PUT', `/admin/api/house/medications/${createdMedicationSummary.id}`, {
      name: 'API Created Med Updated',
      description: 'Updated through save medication',
      usage: 'Edit workflow coverage',
      alertThresholdDays: 4,
      asNeeded: true
    }, {
      Accept: 'application/json'
    });
    assert.strictEqual(editMedicationResponse.statusCode, 200, `save medication should update an existing medication: ${editMedicationResponse.body}`);
    assert.strictEqual(editMedicationResponse.json.success, true, 'edit medication API should report success');

    const refillSaveResponse = await requestJson(adminJar, 'PUT', `/admin/api/house/medications/${morningMed.id}/refill`, {
      refillDate: today,
      pillCount: 40,
      refillExpiration: '2027-01-31'
    }, {
      Accept: 'application/json'
    });
    assert.strictEqual(refillSaveResponse.statusCode, 200, `refill saves should succeed for existing medications: ${refillSaveResponse.body}`);
    assert.strictEqual(refillSaveResponse.json.success, true, 'refill API should report success');

    const summaryAfterRefillResponse = await requestJson(adminJar, 'GET', '/admin/api/house/medications', undefined, {
      Accept: 'application/json'
    });
    assert.strictEqual(summaryAfterRefillResponse.statusCode, 200, `summary should reload after edit and refill saves: ${summaryAfterRefillResponse.body}`);
    const updatedSummaryPayload = summaryAfterRefillResponse.json;
    const updatedCreatedMedicationSummary = updatedSummaryPayload.medications.find(medication => medication.id === createdMedicationSummary.id);
    assert.ok(updatedCreatedMedicationSummary, 'edited medications should remain in the summary payload');
    assert.strictEqual(updatedCreatedMedicationSummary.name, 'API Created Med Updated', 'edit workflow should persist updated medication names');
    assert.strictEqual(updatedCreatedMedicationSummary.description, 'Updated through save medication', 'edit workflow should persist updated medication descriptions');
    assert.strictEqual(updatedCreatedMedicationSummary.usage, 'Edit workflow coverage', 'edit workflow should persist updated medication usage');
    assert.strictEqual(updatedCreatedMedicationSummary.alertThresholdDays, 4, 'edit workflow should persist updated alert thresholds');
    assert.strictEqual(updatedCreatedMedicationSummary.asNeeded, true, 'edit workflow should persist updated as-needed state');
    assert.strictEqual(updatedCreatedMedicationSummary.refillHistory.length, 1, 'editing an existing medication should not behave like the create flow or duplicate refill history');

    const morningMedicationAfterRefill = updatedSummaryPayload.medications.find(medication => medication.id === morningMed.id);
    assert.ok(morningMedicationAfterRefill, 'refilled medication should remain in the summary payload');
    assert.strictEqual(morningMedicationAfterRefill.pillCount, 40, 'refill saves should reset the current bottle pill count');
    assert.strictEqual(morningMedicationAfterRefill.refillDate, today, 'refill saves should persist the new refill date');
    assert.strictEqual(morningMedicationAfterRefill.refillExpiration, '2027-01-31', 'refill saves should persist the refill expiration');
    assert.strictEqual(morningMedicationAfterRefill.refillHistory.length, 2, 'refill saves should append a dated refill history entry');
    assert.strictEqual(morningMedicationAfterRefill.estimatedRemainingPillCount, 40, 'remaining-pill forecasting should reset from the latest refill bottle count');
    assert.ok(
      morningMedicationAfterRefill.refillHistory.some(entry => entry.refillDate === today && Number(entry.pillCount) === 40),
      'refill saves should store the new bottle details in refill history'
    );

    const casey = summaryPayload.portalUsers.find(user => user.username === 'Casey');
    const morgan = summaryPayload.portalUsers.find(user => user.username === 'Morgan');
    assert.ok(casey && morgan, 'portal users should be returned in the summary payload');

    const caseyToday = casey.adherenceSummary.recentDays.find(day => day.date === today);
    const caseyYesterday = casey.adherenceSummary.recentDays.find(day => day.date === yesterday);
    const morganToday = morgan.adherenceSummary.recentDays.find(day => day.date === today);

    assert.strictEqual(casey.adherenceSummary.assignedMedications.length, 2, 'Casey should include all assigned medications');
    assert.strictEqual(caseyToday.status, 'partial', 'Casey should show a partial day when one medication entry is missing');
    assert.strictEqual(caseyToday.missingCount, 1, 'Casey should show one missing medication entry for today');
    assert.ok(caseyToday.alert.includes('Missing 1 medication entry: Evening Med'), 'Casey partial-day alert should name the missing medication');

    const caseyTodayStatuses = new Map(caseyToday.medications.map(entry => [entry.name, entry.status]));
    assert.strictEqual(caseyTodayStatuses.get('Morning Med'), 'took', 'Casey should show the recorded medication status');
    assert.strictEqual(caseyTodayStatuses.get('Evening Med'), 'missing', 'Casey should show the missing medication status');
    const caseyMorningEntry = caseyToday.medications.find(entry => entry.name === 'Morning Med');
    assert.strictEqual(caseyMorningEntry.pillsTaken, 3, 'admin adherence summaries should expose recorded pill counts');

    assert.strictEqual(caseyYesterday.status, 'missing_day', 'Casey should show a missing-day alert when no medications were recorded');
    assert.strictEqual(caseyYesterday.recordedCount, 0, 'Casey missing day should have zero recorded entries');
    assert.strictEqual(caseyYesterday.expectedCount, 2, 'Casey missing day should still show the expected medications');
    assert.strictEqual(caseyYesterday.alert, 'No medication records for this day.', 'Casey missing day should use the full missing-day alert');

    assert.strictEqual(morganToday.status, 'complete', 'Morgan should show a complete day when all scheduled medications are recorded');
    assert.strictEqual(morganToday.recordedCount, 2, 'Morgan complete day should count both recorded medications');

    const dom = new JSDOM(`
      <!DOCTYPE html>
      <div id="medicationAdherenceSummaryOverview"></div>
      <div id="medicationAdherenceSummary"></div>
    `, {
      url: 'http://localhost/admin',
      runScripts: 'dangerously'
    });

    const functionsToLoad = [
      'function escapeHtml(text)',
      'function formatMedicationAdherenceSummaryDate(dateString)',
      'function getMedicationAdherenceSummaryStatusMeta(status)',
      'function getMedicationAdherenceEntryStatusMeta(entry)',
      'function renderMedicationAdherenceSummary()'
    ];

    dom.window.eval(`
      ${functionsToLoad.map(signature => extractFunctionSource(adminDashboardHtml, signature)).join('\n')}
      var medicationPortalUsers = [];
      var medicationAdherenceSummaryWindowDays = [];
    `);

    dom.window.medicationPortalUsers = summaryPayload.portalUsers;
    dom.window.medicationAdherenceSummaryWindowDays = summaryPayload.adherenceSummaryWindowDays;
    dom.window.renderMedicationAdherenceSummary();

    const overviewText = dom.window.document.getElementById('medicationAdherenceSummaryOverview').textContent;
    const summaryText = dom.window.document.getElementById('medicationAdherenceSummary').textContent;

    assert.ok(overviewText.includes('Adherence follow-up needed'), 'summary overview should call out missing or partial days');
    assert.ok(summaryText.includes('Casey'), 'summary UI should render each user group');
    assert.ok(summaryText.includes('Missing day'), 'summary UI should label fully missing days');
    assert.ok(summaryText.includes('Partial'), 'summary UI should label partially recorded days');
    assert.ok(summaryText.includes('No medication records for this day.'), 'summary UI should render missing-day alerts');
    assert.ok(summaryText.includes('Missing 1 medication entry: Evening Med'), 'summary UI should render partial-day medication alerts');
    assert.ok(summaryText.includes('Morgan'), 'summary UI should keep complete users visible for scanning');

    const medicationsDom = new JSDOM(`
      <!DOCTYPE html>
      <div id="medicationsAlertBanner"></div>
      <div id="medicationsList"></div>
    `, {
      url: 'http://localhost/admin',
      runScripts: 'dangerously'
    });
    medicationsDom.window.eval(`
      ${extractFunctionSource(adminDashboardHtml, 'function escapeHtml(text)')}
      ${extractFunctionSource(adminDashboardHtml, 'function formatMedicationRegimenSummary(regimen)')}
      ${extractFunctionSource(adminDashboardHtml, 'function sortMedicationRegimenHistory(history)')}
      ${extractFunctionSource(adminDashboardHtml, 'function formatMedicationRegimenChangeDetails(regimen)')}
      ${extractFunctionSource(adminDashboardHtml, 'function getUpcomingMedicationRegimenEntry(med)')}
      ${extractFunctionSource(adminDashboardHtml, 'function renderMedications()')}
      var houseMedicationsData = [];
      function editMedication() {}
      function deleteMedicationEntry() {}
    `);
    medicationsDom.window.houseMedicationsData = summaryPayload.medications;
    medicationsDom.window.renderMedications();

    const alertBannerText = medicationsDom.window.document.getElementById('medicationsAlertBanner').textContent;
    const renderedTableText = medicationsDom.window.document.getElementById('medicationsList').textContent;
    const highlightedRow = Array.from(medicationsDom.window.document.querySelectorAll('tbody tr'))
      .find(row => row.textContent.includes('Evening Med'));
    const vitaminRow = Array.from(medicationsDom.window.document.querySelectorAll('tbody tr'))
      .find(row => row.textContent.includes('Vitamin D'));

    assert.ok(alertBannerText.includes('Evening Med'), 'admin medications banner should mention low-supply medications by name');
    assert.ok(alertBannerText.includes('4 pill(s) remaining'), 'admin medications banner should show estimated remaining pill counts');
    assert.ok(renderedTableText.includes('Est. Remaining'), 'admin medications table should include the estimated remaining pill count column');
    assert.ok(renderedTableText.includes('Regimen'), 'admin medications table should show the regimen column');
    assert.ok(renderedTableText.includes('dated entries'), 'admin medications table should note when medications have dated regimen history');
    assert.ok(vitaminRow && vitaminRow.textContent.includes(adminFutureRegimenSaveDate), 'admin medications table should surface the saved effective date for future regimen changes');
    assert.ok(vitaminRow && vitaminRow.textContent.includes('Take before bed'), 'admin medications table should surface saved future regimen instructions after refresh');
    assert.ok(highlightedRow && String(highlightedRow.getAttribute('style') || '').includes('#fff8e1'), 'admin medications table should visually highlight low-supply medications');
    assert.ok(adminDashboardHtml.includes('Save Regimen Change'), 'admin medication form should include a dedicated save regimen button');
    assert.ok(adminDashboardHtml.includes('Add Refill'), 'admin medication form should include a dedicated add refill button');

    const medicationFormDomHtml = `
      <!DOCTYPE html>
      <div id="medicationFormContainer" style="display:none;"></div>
      <h3 id="medicationFormTitle"></h3>
      <form id="medicationForm"></form>
      <input id="medicationId">
      <input id="medicationName">
      <input id="medicationDescription">
      <input id="medicationUsage">
      <input id="medicationInstructions">
      <select id="medicationScheduleFrequency">
        <option value=""></option>
        <option value="daily">daily</option>
        <option value="twice daily">twice daily</option>
        <option value="three times daily">three times daily</option>
      </select>
      <input id="medicationPillsPerDose">
      <input id="medicationRefillDate">
      <input id="medicationPillCount">
      <input id="medicationRefillExpiration">
      <input id="medicationAlertThresholdDays">
      <input id="medicationRegimenEffectiveDate">
      <input id="medicationAsNeeded" type="checkbox">
      <div id="medicationRefillHistory"></div>
      <div id="medicationRegimenHistory"></div>
      <button id="saveMedicationRefillButton" style="display:none;"></button>
      <button id="saveMedicationRegimenButton" style="display:none;"></button>
      <div id="medicationRefillActionHint" style="display:none;"></div>
      <div id="medicationRegimenActionHint" style="display:none;"></div>
      <div id="medicationsAlert" class="alert" style="display:none;"></div>
    `;

    const createDom = new JSDOM(medicationFormDomHtml, {
      url: 'http://localhost/admin',
      runScripts: 'dangerously',
      pretendToBeVisual: true
    });
    createDom.window.eval(`
      ${extractFunctionSource(adminDashboardHtml, 'function escapeHtml(text)')}
      ${extractFunctionSource(adminDashboardHtml, 'function showAlert(message, type, containerId)')}
      ${extractFunctionSource(adminDashboardHtml, 'function formatMedicationRegimenSummary(regimen)')}
      ${extractFunctionSource(adminDashboardHtml, 'function sortMedicationRegimenHistory(history)')}
      ${extractFunctionSource(adminDashboardHtml, 'function getCurrentMedicationRegimenEntry(med)')}
      ${extractFunctionSource(adminDashboardHtml, 'function sortMedicationRefillHistory(history)')}
      ${extractFunctionSource(adminDashboardHtml, 'function getCurrentMedicationRefillEntry(med)')}
      ${extractFunctionSource(adminDashboardHtml, 'function formatMedicationRegimenChangeDetails(regimen)')}
      ${extractFunctionSource(adminDashboardHtml, 'function renderMedicationRegimenHistory(med)')}
      ${extractFunctionSource(adminDashboardHtml, 'function renderMedicationRefillHistory(med)')}
      ${extractFunctionSource(adminDashboardHtml, 'function setMedicationRefillActionState(med)')}
      ${extractFunctionSource(adminDashboardHtml, 'function setMedicationRegimenActionState(med)')}
      ${extractFunctionSource(adminDashboardHtml, 'function getMedicationFormMedicationDetailsPayload()')}
      ${extractFunctionSource(adminDashboardHtml, 'function getMedicationFormMedicationPayload()')}
      ${extractFunctionSource(adminDashboardHtml, 'function getMedicationFormRegimenPayload()')}
      ${extractFunctionSource(adminDashboardHtml, 'function getMedicationFormRefillPayload()')}
      ${extractFunctionSource(adminDashboardHtml, 'function normalizeMedicationFormPillCount(value)')}
      ${extractFunctionSource(adminDashboardHtml, 'function hasUnsavedRegimenFormChanges()')}
      ${extractFunctionSource(adminDashboardHtml, 'function hasUnsavedRefillFormChanges()')}
      ${extractFunctionSource(adminDashboardHtml, 'function showMedicationForm(med)')}
      ${extractFunctionSource(adminDashboardHtml, 'async function saveMedicationForm(event)')}
      ${extractFunctionSource(adminDashboardHtml, 'async function saveMedicationRefill()')}
      ${extractFunctionSource(adminDashboardHtml, 'async function saveMedicationRegimenChange()')}
      var currentMedicationFormSnapshot = null;
      var houseMedicationsData = [];
      window.loadCalls = 0;
      window.hideCalls = 0;
      async function loadHouseMedicationsData() { window.loadCalls += 1; }
      function hideMedicationForm() { window.hideCalls += 1; }
      window.fetchCalls = [];
      window.fetch = async (url, options = {}) => {
        window.fetchCalls.push({ url, options });
        return {
          ok: true,
          json: async () => ({ success: true })
        };
      };
    `);
    createDom.window.document.getElementById('medicationName').value = 'Create DOM Med';
    createDom.window.document.getElementById('medicationDescription').value = 'Created in DOM';
    createDom.window.document.getElementById('medicationUsage').value = 'Create flow';
    createDom.window.document.getElementById('medicationInstructions').value = 'Take 1 pill once daily';
    createDom.window.document.getElementById('medicationScheduleFrequency').value = 'daily';
    createDom.window.document.getElementById('medicationPillsPerDose').value = '1';
    createDom.window.document.getElementById('medicationRefillDate').value = today;
    createDom.window.document.getElementById('medicationPillCount').value = '21';
    createDom.window.document.getElementById('medicationRefillExpiration').value = '2027-03-31';
    createDom.window.document.getElementById('medicationAlertThresholdDays').value = '5';
    await createDom.window.saveMedicationForm({ preventDefault() {} });
    assert.strictEqual(createDom.window.fetchCalls.length, 1, 'save medication should submit the create workflow');
    assert.strictEqual(createDom.window.fetchCalls[0].url, '/admin/api/house/medications', 'create workflow should post to the create medication route');
    assert.strictEqual(createDom.window.fetchCalls[0].options.method, 'POST', 'create workflow should use POST');
    const createRequestBody = JSON.parse(createDom.window.fetchCalls[0].options.body);
    assert.strictEqual(createRequestBody.refillDate, today, 'create workflow should include the initial refill date');
    assert.strictEqual(createRequestBody.pillCount, '21', 'create workflow should include the initial bottle pill count');
    assert.strictEqual(createRequestBody.scheduleFrequency, 'daily', 'create workflow should include regimen data for new medications');
    assert.strictEqual(createDom.window.loadCalls, 1, 'successful create saves should reload medication data');
    assert.strictEqual(createDom.window.hideCalls, 1, 'successful create saves should hide the form');

    const editDom = new JSDOM(medicationFormDomHtml, {
      url: 'http://localhost/admin',
      runScripts: 'dangerously',
      pretendToBeVisual: true
    });
    editDom.window.eval(`
      ${extractFunctionSource(adminDashboardHtml, 'function escapeHtml(text)')}
      ${extractFunctionSource(adminDashboardHtml, 'function showAlert(message, type, containerId)')}
      ${extractFunctionSource(adminDashboardHtml, 'function formatMedicationRegimenSummary(regimen)')}
      ${extractFunctionSource(adminDashboardHtml, 'function sortMedicationRegimenHistory(history)')}
      ${extractFunctionSource(adminDashboardHtml, 'function getCurrentMedicationRegimenEntry(med)')}
      ${extractFunctionSource(adminDashboardHtml, 'function sortMedicationRefillHistory(history)')}
      ${extractFunctionSource(adminDashboardHtml, 'function getCurrentMedicationRefillEntry(med)')}
      ${extractFunctionSource(adminDashboardHtml, 'function formatMedicationRegimenChangeDetails(regimen)')}
      ${extractFunctionSource(adminDashboardHtml, 'function renderMedicationRegimenHistory(med)')}
      ${extractFunctionSource(adminDashboardHtml, 'function renderMedicationRefillHistory(med)')}
      ${extractFunctionSource(adminDashboardHtml, 'function setMedicationRefillActionState(med)')}
      ${extractFunctionSource(adminDashboardHtml, 'function setMedicationRegimenActionState(med)')}
      ${extractFunctionSource(adminDashboardHtml, 'function getMedicationFormMedicationDetailsPayload()')}
      ${extractFunctionSource(adminDashboardHtml, 'function getMedicationFormMedicationPayload()')}
      ${extractFunctionSource(adminDashboardHtml, 'function getMedicationFormRegimenPayload()')}
      ${extractFunctionSource(adminDashboardHtml, 'function getMedicationFormRefillPayload()')}
      ${extractFunctionSource(adminDashboardHtml, 'function normalizeMedicationFormPillCount(value)')}
      ${extractFunctionSource(adminDashboardHtml, 'function hasUnsavedRegimenFormChanges()')}
      ${extractFunctionSource(adminDashboardHtml, 'function hasUnsavedRefillFormChanges()')}
      ${extractFunctionSource(adminDashboardHtml, 'function showMedicationForm(med)')}
      ${extractFunctionSource(adminDashboardHtml, 'async function saveMedicationForm(event)')}
      ${extractFunctionSource(adminDashboardHtml, 'async function saveMedicationRefill()')}
      ${extractFunctionSource(adminDashboardHtml, 'async function saveMedicationRegimenChange()')}
      var currentMedicationFormSnapshot = null;
      var houseMedicationsData = [];
      window.loadCalls = 0;
      window.hideCalls = 0;
      window.fetchMode = 'success';
      async function loadHouseMedicationsData() { window.loadCalls += 1; }
      function hideMedicationForm() { window.hideCalls += 1; }
      window.fetchCalls = [];
      window.fetch = async (url, options = {}) => {
        window.fetchCalls.push({ url, options });
        if (window.fetchMode === 'error') {
          return {
            ok: false,
            json: async () => ({ error: 'A valid regimen effective date is required' })
          };
        }
        return {
          ok: true,
          json: async () => ({ success: true })
        };
      };
    `);
    editDom.window.showMedicationForm(vitaminMedicationSummary);
    assert.strictEqual(editDom.window.document.getElementById('medicationId').value, vitamin.id, 'edit form should keep the medication id needed for dedicated regimen saves');
    assert.strictEqual(editDom.window.document.getElementById('medicationInstructions').value, 'Take with dinner', 'edit form should retain saved instructions after refresh');
    assert.strictEqual(editDom.window.document.getElementById('medicationPillCount').value, '18', 'edit form should retain the saved pill count after refresh');
    assert.strictEqual(editDom.window.document.getElementById('medicationScheduleFrequency').value, 'twice daily', 'edit form should preload the latest saved regimen frequency');
    assert.strictEqual(editDom.window.document.getElementById('medicationPillsPerDose').value, '1.5', 'edit form should preload the latest saved pills per dose');
    assert.strictEqual(editDom.window.document.getElementById('saveMedicationRefillButton').style.display, 'inline-flex', 'edit form should expose the dedicated refill save button for existing medications');
    assert.strictEqual(editDom.window.document.getElementById('saveMedicationRegimenButton').style.display, 'inline-flex', 'edit form should expose the dedicated regimen save button for existing medications');
    assert.ok(editDom.window.document.getElementById('medicationRefillActionHint').textContent.includes('Add Refill'), 'edit form should explain the dedicated refill workflow');
    assert.ok(editDom.window.document.getElementById('medicationRegimenActionHint').textContent.includes('Save Regimen Change'), 'edit form should explain the separate regimen workflow');
    assert.ok(editDom.window.document.getElementById('medicationRefillHistory').textContent.includes(today), 'edit form should show the saved refill history');
    assert.ok(editDom.window.document.getElementById('medicationRegimenHistory').textContent.includes(adminPastRegimenSaveDate), 'edit form should show the persisted past-dated effective date in regimen history');
    assert.ok(editDom.window.document.getElementById('medicationRegimenHistory').textContent.includes(adminFutureRegimenSaveDate), 'edit form should show the persisted future-dated effective date in regimen history');
    assert.ok(editDom.window.document.getElementById('medicationRegimenHistory').textContent.includes('Current'), 'edit form should label the current effective regimen');
    assert.ok(editDom.window.document.getElementById('medicationRegimenHistory').textContent.includes('Upcoming'), 'edit form should label upcoming regimen changes');

    editDom.window.fetchCalls.length = 0;
    editDom.window.document.getElementById('medicationDescription').value = 'Updated through the edit DOM';
    await editDom.window.saveMedicationForm({ preventDefault() {} });
    assert.strictEqual(editDom.window.fetchCalls.length, 1, 'save medication should submit detail-only edits for existing medications');
    assert.strictEqual(editDom.window.fetchCalls[0].url, `/admin/api/house/medications/${vitamin.id}`, 'edit workflow should submit to the medication update route');
    assert.strictEqual(editDom.window.fetchCalls[0].options.method, 'PUT', 'edit workflow should use PUT');
    const editRequestBody = JSON.parse(editDom.window.fetchCalls[0].options.body);
    assert.strictEqual(editRequestBody.description, 'Updated through the edit DOM', 'edit workflow should submit changed medication details');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(editRequestBody, 'scheduleFrequency'), false, 'edit workflow should not submit regimen fields through the medication save route');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(editRequestBody, 'refillDate'), false, 'edit workflow should not submit refill fields through the medication save route');
    assert.strictEqual(editDom.window.loadCalls, 1, 'successful edit saves should reload medication data');
    assert.strictEqual(editDom.window.hideCalls, 1, 'successful edit saves should hide the form');

    editDom.window.fetchCalls.length = 0;
    editDom.window.showMedicationForm(vitaminMedicationSummary);
    editDom.window.document.getElementById('medicationRefillDate').value = adminFutureRegimenSaveDate;
    editDom.window.document.getElementById('medicationPillCount').value = '30';
    await editDom.window.saveMedicationForm({ preventDefault() {} });
    assert.strictEqual(editDom.window.fetchCalls.length, 0, 'save medication should not submit refill edits through the medication route');
    assert.ok(editDom.window.document.getElementById('medicationsAlert').textContent.includes('Use Add Refill'), 'save medication should direct admins to the dedicated refill action when refill fields changed');

    editDom.window.fetchCalls.length = 0;
    await editDom.window.saveMedicationRefill();
    assert.strictEqual(editDom.window.fetchCalls.length, 1, 'add refill should submit through the refill route');
    assert.strictEqual(editDom.window.fetchCalls[0].url, `/admin/api/house/medications/${vitamin.id}/refill`, 'add refill should use the dedicated refill route');
    assert.strictEqual(editDom.window.fetchCalls[0].options.method, 'PUT', 'add refill should use PUT');
    const refillRequestBody = JSON.parse(editDom.window.fetchCalls[0].options.body);
    assert.strictEqual(refillRequestBody.refillDate, adminFutureRegimenSaveDate, 'add refill should include the refill date');
    assert.strictEqual(refillRequestBody.pillCount, '30', 'add refill should include the new bottle pill count');

    editDom.window.document.getElementById('medicationScheduleFrequency').value = 'three times daily';
    editDom.window.document.getElementById('medicationPillsPerDose').value = '2';
    editDom.window.fetchCalls.length = 0;
    await editDom.window.saveMedicationForm({ preventDefault() {} });
    assert.strictEqual(editDom.window.fetchCalls.length, 0, 'save medication should not submit regimen edits through the medication route');
    assert.ok(editDom.window.document.getElementById('medicationsAlert').textContent.includes('Use Save Regimen Change'), 'save medication should direct admins to the dedicated regimen action when regimen fields changed');

    editDom.window.document.getElementById('medicationRegimenEffectiveDate').value = '';
    editDom.window.fetchMode = 'error';
    editDom.window.fetchCalls.length = 0;
    await editDom.window.saveMedicationRegimenChange();
    assert.strictEqual(editDom.window.fetchCalls.length, 0, 'regimen saves should require an effective date before issuing a request');
    assert.ok(editDom.window.document.getElementById('medicationsAlert').textContent.includes('Regimen effective date is required'), 'missing regimen effective dates should show a visible validation alert');

    createDom.window.close();
    editDom.window.close();
    medicationsDom.window.close();
    dom.window.close();
    console.log('✅ Medication admin summary payload and UI test passed');
  } finally {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await wait(250);
      if (!serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
    }

    if (configBackup === null) {
      cleanup(configPath);
    } else {
      fs.writeFileSync(configPath, configBackup);
    }

    cleanup(tempDir);
  }
}

run().catch(error => {
  console.error('❌ Medication admin summary test failed:', error);
  process.exitCode = 1;
});
