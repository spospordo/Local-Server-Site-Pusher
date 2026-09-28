#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const repoRoot = path.join(__dirname, '..');
const dashboardHtml = fs.readFileSync(path.join(repoRoot, 'admin', 'dashboard.html'), 'utf8');

function extractBlock(source, startToken, endToken) {
  const startIndex = source.indexOf(startToken);
  if (startIndex === -1) {
    throw new Error(`Unable to find block start: ${startToken}`);
  }

  const endIndex = source.indexOf(endToken, startIndex);
  if (endIndex === -1) {
    throw new Error(`Unable to find block end: ${endToken}`);
  }

  return source.slice(startIndex, endIndex);
}

function extractFunctionSource(source, functionName) {
  const patterns = [`async function ${functionName}(`, `function ${functionName}(`];
  const startPattern = patterns.find(pattern => source.includes(pattern));
  if (!startPattern) {
    throw new Error(`Unable to find function: ${functionName}`);
  }

  const startIndex = source.indexOf(startPattern);
  const bodyStart = source.indexOf('{', startIndex);
  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
    } else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  throw new Error(`Unable to parse function: ${functionName}`);
}

function createEnvironment() {
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <body>
      <div class="server-vidiots-section hidden">
        <select id="vidiotsEnabled"><option value="false">Disabled</option><option value="true">Enabled</option></select>
        <input id="vidiotsOutputFile" value="">
        <input id="vidiotsPosterDirectory" value="">
        <input id="vidiotsPosterBaseUrl" value="">
        <input id="vidiotsMaxAgeHours" value="">
        <select id="vidiotsForceUpdate"><option value="false">Disabled</option><option value="true">Enabled</option></select>
        <select id="vidiotsGithubEnabled"><option value="false">Disabled</option><option value="true">Enabled</option></select>
        <input id="vidiotsRepoOwner" value="">
        <input id="vidiotsRepoName" value="">
        <input id="vidiotsRepoBranch" value="">
        <input id="vidiotsRepoLocalPath" value="">
        <input id="vidiotsCommitMessage" value="">
        <input id="vidiotsAccessToken" value="">
        <div id="githubPagesConfig"></div>
      </div>
      <div class="server-github-section">
        <select id="serverGithubEnabled"><option value="false">Disabled</option><option value="true">Enabled</option></select>
        <input id="serverGithubRepoOwner" value="">
        <input id="serverGithubRepoName" value="">
        <input id="serverGithubRepoBranch" value="">
        <input id="serverGithubRepoLocalPath" value="">
        <input id="serverGithubCommitMessage" value="">
        <input id="serverGithubAccessToken" value="">
        <div id="github-repository-settings"></div>
      </div>
      <div id="vidiotsAlert"></div>
    </body>
  `, { url: 'http://localhost/admin' });

  const context = {
    window: dom.window,
    document: dom.window.document,
    console,
    setTimeout,
    clearTimeout,
    loadVidiotsSchedule: () => {},
    getVidiotsScheduleConfig: () => ({ frequency: 'daily', times: [{ hour: 6, minute: 0 }] }),
    scheduleToCron: () => '0 6 * * *',
    showAlert: () => {},
    markSaved: () => {},
    loadVidiotsStatus: () => {},
    fetch: async () => {
      throw new Error('fetch not stubbed');
    }
  };

  vm.createContext(context);

  const helperBlock = extractBlock(
    dashboardHtml,
    'const GITHUB_PAGES_FIELD_IDS = {',
    '\n        // Vidiots Functions'
  );

  const script = [
    helperBlock,
    extractFunctionSource(dashboardHtml, 'loadVidiotsConfig'),
    extractFunctionSource(dashboardHtml, 'toggleGitHubConfig'),
    extractFunctionSource(dashboardHtml, 'saveVidiotsConfig')
  ].join('\n');

  vm.runInContext(script, context);
  return { context, dom };
}

async function testLoadReflectsPersistedState(enabled) {
  const { context, dom } = createEnvironment();
  const persistedConfig = {
    enabled: false,
    schedule: { frequency: 'daily', times: [{ hour: 6, minute: 0 }] },
    outputFile: './public/vidiots/index.html',
    posterDirectory: './public/vidiots/posters',
    posterBaseUrl: '/vidiots/posters/',
    maxAgeHours: 24,
    forceUpdate: false,
    githubPages: {
      enabled,
      repoOwner: enabled ? 'octo' : 'disabled-owner',
      repoName: 'octo.github.io',
      branch: 'main',
      repoLocalPath: '/repo/path',
      commitMessage: 'Automated vidiots update',
      accessToken: enabled ? 'token-value' : ''
    }
  };

  context.fetch = async url => {
    assert.strictEqual(url, '/admin/api/vidiots/config');
    return {
      json: async () => ({ success: true, config: persistedConfig })
    };
  };

  await context.loadVidiotsConfig();

  assert.strictEqual(dom.window.document.getElementById('serverGithubEnabled').value, enabled ? 'true' : 'false');
  assert.strictEqual(dom.window.document.getElementById('vidiotsGithubEnabled').value, enabled ? 'true' : 'false');
  assert.strictEqual(
    dom.window.document.getElementById('serverGithubRepoOwner').value,
    persistedConfig.githubPages.repoOwner
  );
  assert.strictEqual(
    dom.window.document.getElementById('github-repository-settings').style.display,
    enabled ? 'block' : 'none'
  );
  assert.strictEqual(
    dom.window.document.getElementById('serverGithubAccessToken').dataset.hasToken,
    enabled ? 'true' : 'false'
  );

  dom.window.close();
}

async function testSaveUsesVisibleGitHubTab(enabled) {
  const { context, dom } = createEnvironment();
  let savedBody = null;
  let persistedConfig = null;

  dom.window.document.getElementById('serverGithubEnabled').value = enabled ? 'true' : 'false';
  dom.window.document.getElementById('serverGithubRepoOwner').value = enabled ? 'visible-owner' : 'disabled-owner';
  dom.window.document.getElementById('serverGithubRepoName').value = 'visible.github.io';
  dom.window.document.getElementById('serverGithubRepoBranch').value = 'main';
  dom.window.document.getElementById('serverGithubRepoLocalPath').value = '/visible/repo';
  dom.window.document.getElementById('serverGithubCommitMessage').value = 'Visible commit message';

  dom.window.document.getElementById('vidiotsGithubEnabled').value = enabled ? 'false' : 'true';
  dom.window.document.getElementById('vidiotsRepoOwner').value = 'hidden-owner';
  dom.window.document.getElementById('vidiotsRepoName').value = 'hidden.github.io';

  context.fetch = async (url, options = {}) => {
    if (url === '/admin/api/vidiots/config' && (options.method || 'GET') === 'POST') {
      savedBody = JSON.parse(options.body);
      persistedConfig = savedBody.vidiots;
      return {
        json: async () => ({ success: true, message: 'saved' })
      };
    }

    if (url === '/admin/api/vidiots/config') {
      return {
        json: async () => ({ success: true, config: persistedConfig })
      };
    }

    throw new Error(`Unexpected fetch call: ${url}`);
  };

  await context.saveVidiotsConfig();

  assert.ok(savedBody, 'save should post configuration');
  assert.strictEqual(savedBody.vidiots.githubPages.enabled, enabled);
  assert.strictEqual(savedBody.vidiots.githubPages.repoOwner, enabled ? 'visible-owner' : 'disabled-owner');
  assert.strictEqual(dom.window.document.getElementById('serverGithubEnabled').value, enabled ? 'true' : 'false');
  assert.strictEqual(dom.window.document.getElementById('vidiotsGithubEnabled').value, enabled ? 'true' : 'false');

  dom.window.close();
}

async function run() {
  const primaryToggleMatches = dashboardHtml.match(/id="vidiotsGithubEnabled"/g) || [];
  assert.strictEqual(primaryToggleMatches.length, 1, 'Vidiots GitHub toggle id should only appear once');
  assert.ok(dashboardHtml.includes('id="serverGithubEnabled"'), 'GitHub tab should use its own field ids');

  await testLoadReflectsPersistedState(true);
  await testLoadReflectsPersistedState(false);
  await testSaveUsesVisibleGitHubTab(true);
  await testSaveUsesVisibleGitHubTab(false);

  console.log('✅ GitHub Pages dashboard persistence regression test passed');
}

run().catch(error => {
  console.error('❌ GitHub Pages dashboard persistence regression test failed:', error);
  process.exitCode = 1;
});
