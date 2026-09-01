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
const smartMirrorConfigPath = path.join(configDir, 'smartmirror-config.json.enc');
const houseModulePath = path.join(repoRoot, 'modules', 'house.js');
const smartMirrorModulePath = path.join(repoRoot, 'modules', 'smartmirror.js');
const adminDashboardHtml = fs.readFileSync(path.join(repoRoot, 'admin', 'dashboard.html'), 'utf8');
const publicSmartMirrorHtml = fs.readFileSync(path.join(repoRoot, 'public', 'smart-mirror.html'), 'utf8');
const PORT = 3112;
const BASE_HOST = '127.0.0.1';

function loadHouse() {
  delete require.cache[require.resolve(houseModulePath)];
  return require(houseModulePath);
}

function loadSmartMirror() {
  delete require.cache[require.resolve(smartMirrorModulePath)];
  return require(smartMirrorModulePath);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getDateOffset(daysOffset) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysOffset);
  return date.toISOString().slice(0, 10);
}

function requestJson(method, urlPath, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const headers = { ...extraHeaders };
    if (payload !== null) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
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

function requestJsonWithJar(jar, method, urlPath, body, extraHeaders = {}) {
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

function updateMedicationSubWidget(config, overrides) {
  const subWidget = config.widgets.smartWidget.subWidgets.find(entry => entry.type === 'medications');
  assert.ok(subWidget, 'medications sub-widget should exist');
  Object.assign(subWidget, overrides);
}

async function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-widget-medications-'));
  const dataFilePath = path.join(tempDir, 'house-data.json');
  const configBackup = fs.existsSync(configPath) ? fs.readFileSync(configPath) : null;
  const smartMirrorConfigBackup = fs.existsSync(smartMirrorConfigPath) ? fs.readFileSync(smartMirrorConfigPath) : null;
  const today = getDateOffset(0);
  const yesterday = getDateOffset(-1);
  const twoDaysAgo = getDateOffset(-2);
  let serverProcess = null;

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
    parties: [{
      id: 1,
      name: 'Launch Party',
      status: 'scheduled',
      dateTime: {
        date: today,
        startTime: '18:00',
        endTime: '22:00'
      },
      invitees: [],
      menu: [],
      tasks: [],
      events: []
    }],
    house: {
      dataFilePath
    }
  };

  try {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2));
    cleanup(smartMirrorConfigPath);

    let smartMirror = loadSmartMirror();
    smartMirror.init(testConfig);
    const defaultSmartMirrorConfig = smartMirror.loadConfig();
    const defaultMedicationsSubWidget = defaultSmartMirrorConfig.widgets.smartWidget.subWidgets.find(entry => entry.type === 'medications');
    assert.ok(defaultMedicationsSubWidget, 'default smart mirror config should include medications sub-widget');
    assert.deepStrictEqual(defaultMedicationsSubWidget.selectedUserIds, [], 'medications sub-widget should default to no selected users');
    assert.strictEqual(defaultMedicationsSubWidget.hideDuringParties, false, 'medications sub-widget should default to visible during parties');
    assert.strictEqual(defaultMedicationsSubWidget.hideDuringVacations, false, 'medications sub-widget should default to visible during vacations');

    const smartMirrorConfig = JSON.parse(JSON.stringify(defaultSmartMirrorConfig));
    smartMirrorConfig.enabled = true;
    smartMirrorConfig.widgets.smartWidget.enabled = true;
    smartMirrorConfig.widgets.smartWidget.displayMode = 'cycle';
    smartMirrorConfig.widgets.smartWidget.subWidgets.forEach(subWidget => {
      subWidget.enabled = subWidget.type === 'medications';
    });
    smartMirror.saveConfig(smartMirrorConfig);

    const house = loadHouse();
    house.init(testConfig);

    const morningMedResult = house.addMedication({ name: 'Morning Med', instructions: 'Take with breakfast', scheduleFrequency: 'daily', pillCount: 30, refillDate: yesterday, alertThresholdDays: 5 });
    const eveningMedResult = house.addMedication({ name: 'Evening Med', instructions: 'Take before bed', scheduleFrequency: 'daily', pillCount: 4, refillDate: today, alertThresholdDays: 5 });
    const vitaminResult = house.addMedication({ name: 'Vitamin D', instructions: 'Take with lunch', scheduleFrequency: 'daily', pillCount: 20, refillDate: today, alertThresholdDays: 3 });
    assert.strictEqual(morningMedResult.success, true);
    assert.strictEqual(eveningMedResult.success, true);
    assert.strictEqual(vitaminResult.success, true);

    const caseyPortalUser = house.createMedicationPortalUser({ username: 'Casey', passwordHash: 'salt:hash-a' });
    const morganPortalUser = house.createMedicationPortalUser({ username: 'Morgan', passwordHash: 'salt:hash-b' });
    assert.strictEqual(caseyPortalUser.success, true);
    assert.strictEqual(morganPortalUser.success, true);

    const medsData = house.getMedicationsData();
    const morningMed = medsData.medications.find(item => item.name === 'Morning Med');
    const eveningMed = medsData.medications.find(item => item.name === 'Evening Med');
    const vitamin = medsData.medications.find(item => item.name === 'Vitamin D');
    assert.ok(morningMed && eveningMed && vitamin, 'seed medications should exist');

    assert.strictEqual(house.setMedicationAssignments(morningMed.id, [caseyPortalUser.user.id]).success, true);
    assert.strictEqual(house.setMedicationAssignments(eveningMed.id, [caseyPortalUser.user.id]).success, true);
    assert.strictEqual(house.setMedicationAssignments(vitamin.id, [morganPortalUser.user.id]).success, true);

    const seededMedicationData = house.getMedicationsData();
    seededMedicationData.assignments = seededMedicationData.assignments.map(assignment => ({
      ...assignment,
      assignedAt: `${twoDaysAgo}T08:00:00.000Z`
    }));
    assert.strictEqual(house.saveMedicationsData(seededMedicationData).success, true, 'assignments should be backdated into the summary window');

    assert.strictEqual(house.recordMedicationAdherence(caseyPortalUser.user.id, morningMed.id, 'took', today).success, true);
    assert.strictEqual(house.recordMedicationAdherence(morganPortalUser.user.id, vitamin.id, 'took', yesterday).success, true);
    assert.strictEqual(house.recordMedicationAdherence(morganPortalUser.user.id, vitamin.id, 'took', twoDaysAgo).success, true);

    assert.strictEqual(house.addVacationDate({
      destination: 'Test Trip',
      startDate: today,
      endDate: today,
      addToDashboardClock: false
    }).success, true, 'active vacation should be seeded');

    const configuredSmartMirror = loadSmartMirror();
    configuredSmartMirror.init(testConfig);
    const loadedSmartMirrorConfig = configuredSmartMirror.loadConfig();
    updateMedicationSubWidget(loadedSmartMirrorConfig, {
      enabled: true,
      priority: 4,
      cycleTime: 12,
      selectedUserIds: [caseyPortalUser.user.id, morganPortalUser.user.id],
      hideDuringParties: false,
      hideDuringVacations: false
    });
    configuredSmartMirror.saveConfig(loadedSmartMirrorConfig);

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

    const smartWidgetResponse = await requestJson('GET', '/api/smart-mirror/smart-widget');
    assert.strictEqual(smartWidgetResponse.statusCode, 200, `smart widget endpoint should succeed: ${smartWidgetResponse.body || serverLogs.join('')}`);
    assert.strictEqual(smartWidgetResponse.json.success, true, 'smart widget endpoint should report success');
    const medicationsWidget = smartWidgetResponse.json.subWidgets.find(subWidget => subWidget.type === 'medications');
    assert.ok(medicationsWidget, 'medications sub-widget should be returned when selected users have missing days');
    assert.strictEqual(medicationsWidget.data.userAlerts.length, 2, 'multiple selected users should remain grouped in one medications sub-widget');
    assert.strictEqual(medicationsWidget.data.totalMissingDays, 3, 'multiple missing days should be aggregated inside the same medications sub-widget');
    assert.strictEqual(medicationsWidget.data.lowSupplyAlertCount, 1, 'medications sub-widget should include privacy-safe low-supply alert counts');
    assert.ok(medicationsWidget.data.userAlerts.find(user => user.username === 'Casey' && user.missingDays.length === 2), 'Casey should include both missing days');
    assert.ok(medicationsWidget.data.userAlerts.find(user => user.username === 'Morgan' && user.missingDays.length === 1), 'Morgan should include one missing day');
    assert.ok(!JSON.stringify(medicationsWidget.data).includes('Evening Med'), 'medications smart widget should not expose medication names');

    const adminJar = createJar();
    const loginResponse = await requestJsonWithJar(adminJar, 'POST', '/admin/login', {
      username: 'admin',
      password: 'admin123'
    }, {
      Accept: 'application/json'
    });
    assert.ok([200, 302].includes(loginResponse.statusCode), `admin login should succeed: ${loginResponse.body || serverLogs.join('')}`);

    const medicationsAdminResponse = await requestJsonWithJar(adminJar, 'GET', '/admin/api/house/medications', undefined, {
      Accept: 'application/json'
    });
    assert.strictEqual(medicationsAdminResponse.statusCode, 200, 'admin medications endpoint should succeed');
    assert.ok(Array.isArray(medicationsAdminResponse.json.portalUsers), 'admin medications endpoint should include portal users');

    assert.ok(/smartWidgetMedicationsEnabled/.test(adminDashboardHtml), 'dashboard should include medications enable control');
    assert.ok(/smartWidgetMedicationsHideDuringParties/.test(adminDashboardHtml), 'dashboard should include hide-during-parties control');
    assert.ok(/smartWidgetMedicationsHideDuringVacations/.test(adminDashboardHtml), 'dashboard should include hide-during-vacations control');
    assert.ok(/id:\s*'smartWidgetMedicationsEnabled'[\s\S]*name:\s*'Medications'/.test(adminDashboardHtml), 'dashboard grid editor should discover the medications sub-widget');

    const adminDom = new JSDOM(`<!DOCTYPE html><div id="smartWidgetMedicationUsersList"></div><input id="smartWidgetMedicationsSelectedUserIds" value="[]">`, {
      url: 'http://localhost/admin',
      runScripts: 'dangerously'
    });
    adminDom.window.eval(`
      ${extractFunctionSource(adminDashboardHtml, 'function getSmartWidgetMedicationSelectedUserIds()')}
      ${extractFunctionSource(adminDashboardHtml, 'function setSmartWidgetMedicationSelectedUserIds(userIds)')}
      ${extractFunctionSource(adminDashboardHtml, 'function updateSmartWidgetMedicationUserSelection(userId, checked)')}
      ${extractFunctionSource(adminDashboardHtml, 'function renderSmartWidgetMedicationUserOptions()')}
      var medicationPortalUsers = [];
    `);
    adminDom.window.medicationPortalUsers = medicationsAdminResponse.json.portalUsers;
    adminDom.window.setSmartWidgetMedicationSelectedUserIds([caseyPortalUser.user.id]);
    adminDom.window.renderSmartWidgetMedicationUserOptions();
    const adminSelectionText = adminDom.window.document.getElementById('smartWidgetMedicationUsersList').textContent;
    const adminCheckboxes = adminDom.window.document.querySelectorAll('#smartWidgetMedicationUsersList input[type="checkbox"]');
    assert.ok(adminSelectionText.includes('Casey'), 'admin medications selector should list Casey');
    assert.ok(adminSelectionText.includes('Morgan'), 'admin medications selector should list Morgan');
    assert.strictEqual(adminCheckboxes.length, 2, 'admin medications selector should render one checkbox per portal user');
    assert.strictEqual(adminCheckboxes[0].checked, true, 'selected users should remain checked in admin selector');
    adminDom.window.close();

    const mirrorDom = new JSDOM('<!DOCTYPE html><div id="root"></div>', { runScripts: 'dangerously' });
    mirrorDom.window.eval(`${extractFunctionSource(publicSmartMirrorHtml, 'function renderMedications(data)')}`);
    const renderedMedications = mirrorDom.window.renderMedications(medicationsWidget.data);
    assert.ok(renderedMedications, 'public smart mirror renderer should return content for medication alerts');
    mirrorDom.window.document.getElementById('root').appendChild(renderedMedications);
    const mirrorText = mirrorDom.window.document.getElementById('root').textContent;
    assert.ok(mirrorText.includes('Medications'), 'mirror renderer should label the medications widget');
    assert.ok(mirrorText.includes('Casey'), 'mirror renderer should include selected user names');
    assert.ok(mirrorText.includes('Missing days') || mirrorText.includes('Missing day'), 'mirror renderer should only describe missing-day follow-up');
    assert.ok(mirrorText.includes('below the configured alert threshold'), 'mirror renderer should show a privacy-safe low-supply alert');
    assert.ok(!mirrorText.includes('Evening Med'), 'mirror renderer should not reveal medication names');
    mirrorDom.window.close();

    const hiddenDuringPartyConfig = configuredSmartMirror.loadConfig();
    updateMedicationSubWidget(hiddenDuringPartyConfig, { hideDuringParties: true, hideDuringVacations: false });
    configuredSmartMirror.saveConfig(hiddenDuringPartyConfig);
    const hiddenDuringPartyResponse = await requestJson('GET', '/api/smart-mirror/smart-widget');
    assert.strictEqual(hiddenDuringPartyResponse.statusCode, 200, 'smart widget endpoint should still succeed when widget is hidden during a party');
    assert.ok(!hiddenDuringPartyResponse.json.subWidgets.find(subWidget => subWidget.type === 'medications'), 'medications widget should hide on party day when configured to do so');

    const hiddenDuringVacationConfig = configuredSmartMirror.loadConfig();
    updateMedicationSubWidget(hiddenDuringVacationConfig, { hideDuringParties: false, hideDuringVacations: true });
    configuredSmartMirror.saveConfig(hiddenDuringVacationConfig);
    const hiddenDuringVacationResponse = await requestJson('GET', '/api/smart-mirror/smart-widget');
    assert.strictEqual(hiddenDuringVacationResponse.statusCode, 200, 'smart widget endpoint should still succeed when widget is hidden during a vacation');
    assert.ok(!hiddenDuringVacationResponse.json.subWidgets.find(subWidget => subWidget.type === 'medications'), 'medications widget should hide during active vacations when configured to do so');

    const lowSupplyOnlyData = house.getMedicationsData();
    lowSupplyOnlyData.assignments = lowSupplyOnlyData.assignments.map(assignment => ({
      ...assignment,
      assignedAt: `${today}T08:00:00.000Z`
    }));
    assert.strictEqual(house.saveMedicationsData(lowSupplyOnlyData).success, true, 'assignment window should be reset for the low-supply-only scenario');
    assert.strictEqual(house.recordMedicationAdherence(caseyPortalUser.user.id, morningMed.id, 'took', today).success, true);
    assert.strictEqual(house.recordMedicationAdherence(caseyPortalUser.user.id, eveningMed.id, 'took', today).success, true);
    assert.strictEqual(house.recordMedicationAdherence(morganPortalUser.user.id, vitamin.id, 'took', today).success, true);

    const lowSupplyOnlyConfig = configuredSmartMirror.loadConfig();
    updateMedicationSubWidget(lowSupplyOnlyConfig, { hideDuringParties: false, hideDuringVacations: false });
    configuredSmartMirror.saveConfig(lowSupplyOnlyConfig);
    const lowSupplyOnlyResponse = await requestJson('GET', '/api/smart-mirror/smart-widget');
    assert.strictEqual(lowSupplyOnlyResponse.statusCode, 200, 'smart widget endpoint should succeed for low-supply-only medication alerts');
    const lowSupplyOnlyWidget = lowSupplyOnlyResponse.json.subWidgets.find(subWidget => subWidget.type === 'medications');
    assert.ok(lowSupplyOnlyWidget, 'medications widget should render when only low-supply alerts remain');
    assert.strictEqual(lowSupplyOnlyWidget.data.totalMissingDays, 0, 'low-supply-only widget should not fabricate missing-day alerts');
    assert.strictEqual(lowSupplyOnlyWidget.data.userAlerts.length, 0, 'low-supply-only widget should omit user-level missing-day cards');
    assert.strictEqual(lowSupplyOnlyWidget.data.lowSupplyAlertCount, 1, 'low-supply-only widget should preserve the alert count');
    assert.ok(!JSON.stringify(lowSupplyOnlyWidget.data).includes('Evening Med'), 'low-supply-only widget data should remain medication-name free');

    const lowSupplyMirrorDom = new JSDOM('<!DOCTYPE html><div id="root"></div>', { runScripts: 'dangerously' });
    lowSupplyMirrorDom.window.eval(`${extractFunctionSource(publicSmartMirrorHtml, 'function renderMedications(data)')}`);
    const lowSupplyRendered = lowSupplyMirrorDom.window.renderMedications(lowSupplyOnlyWidget.data);
    assert.ok(lowSupplyRendered, 'mirror renderer should return content for low-supply-only alerts');
    lowSupplyMirrorDom.window.document.getElementById('root').appendChild(lowSupplyRendered);
    const lowSupplyMirrorText = lowSupplyMirrorDom.window.document.getElementById('root').textContent;
    assert.ok(lowSupplyMirrorText.includes('low-supply medication alert'), 'mirror renderer should summarize low-supply-only alerts');
    assert.ok(lowSupplyMirrorText.includes('below the configured alert threshold'), 'mirror renderer should explain the privacy-safe low-supply state');
    assert.ok(!lowSupplyMirrorText.includes('Evening Med'), 'low-supply-only renderer should not reveal medication names');
    assert.ok(!lowSupplyMirrorText.includes('Casey'), 'low-supply-only renderer should avoid user-specific details when only the privacy-safe alert is shown');
    lowSupplyMirrorDom.window.close();

    console.log('✅ Smart widget medications test passed');
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

    if (smartMirrorConfigBackup === null) {
      cleanup(smartMirrorConfigPath);
    } else {
      fs.writeFileSync(smartMirrorConfigPath, smartMirrorConfigBackup);
    }

    cleanup(tempDir);
  }
}

run().catch(error => {
  console.error('❌ Smart widget medications test failed:', error);
  process.exitCode = 1;
});
