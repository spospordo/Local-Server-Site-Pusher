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

    assert.ok(alertBannerText.includes('Evening Med'), 'admin medications banner should mention low-supply medications by name');
    assert.ok(alertBannerText.includes('4 pill(s) remaining'), 'admin medications banner should show estimated remaining pill counts');
    assert.ok(renderedTableText.includes('Est. Remaining'), 'admin medications table should include the estimated remaining pill count column');
    assert.ok(renderedTableText.includes('Regimen'), 'admin medications table should show the regimen column');
    assert.ok(renderedTableText.includes('dated entries'), 'admin medications table should note when medications have dated regimen history');
    assert.ok(highlightedRow && String(highlightedRow.getAttribute('style') || '').includes('#fff8e1'), 'admin medications table should visually highlight low-supply medications');

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
