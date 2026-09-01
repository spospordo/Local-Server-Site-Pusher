#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const repoRoot = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(repoRoot, 'public', 'medications.html'), 'utf8');

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getDateOffset(daysOffset) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().slice(0, 10);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function createDom(initialDashboardData) {
  let dashboardPayload = clone(initialDashboardData);

  const dom = new JSDOM(html, {
    url: 'http://localhost/medications',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = async (url, options = {}) => {
        const normalizedUrl = String(url);
        if (normalizedUrl === '/medications/api/session') {
          return {
            ok: true,
            json: async () => ({ authenticated: false, csrfToken: 'csrf-test-token' })
          };
        }

        if (normalizedUrl === '/medications/api/dashboard') {
          return {
            ok: true,
            json: async () => ({
              success: true,
              user: { id: 'user-1', username: 'casey' },
              ...clone(dashboardPayload)
            })
          };
        }

        if (normalizedUrl.startsWith('/medications/api/medications/') && (options.method || 'GET').toUpperCase() === 'POST') {
          const medicationId = normalizedUrl.split('/')[4];
          const body = JSON.parse(options.body || '{}');
          const medication = dashboardPayload.medications.find(item => item.id === medicationId);
          if (!medication) {
            return {
              ok: false,
              json: async () => ({ error: 'Medication not found' })
            };
          }

          const existingRecord = (medication.adherenceHistory || []).find(record => record.date === body.date);
          const record = {
            id: existingRecord?.id || `record-${medicationId}-${body.date}`,
            date: body.date,
            status: body.status,
            recordedAt: new Date().toISOString()
          };

          medication.todayStatus = body.date === dashboardPayload.today ? body.status : medication.todayStatus;
          medication.todayRecordedAt = body.date === dashboardPayload.today ? record.recordedAt : medication.todayRecordedAt;
          medication.adherenceHistory = [
            record,
            ...(medication.adherenceHistory || []).filter(item => item.date !== body.date)
          ];

          return {
            ok: true,
            json: async () => ({ success: true, record })
          };
        }

        throw new Error(`Unexpected fetch call: ${normalizedUrl}`);
      };
    }
  });

  await wait(0);
  return { window: dom.window, setDashboardPayload: value => { dashboardPayload = clone(value); } };
}

function getMedicationCard(document, medicationId) {
  return document.querySelector(`.medication-card [data-medication-id="${medicationId}"]`)?.closest('.medication-card') || null;
}

async function run() {
  const today = getDateOffset(0);
  const yesterday = getDateOffset(-1);
  const initialDashboardData = {
    today,
    waitingForAdmin: false,
    medications: [
      {
        id: 'med-a',
        name: 'Morning Med',
        description: 'Blood pressure support',
        instructions: 'Take 1 pill once daily',
        pillCount: 30,
        estimatedRemainingPillCount: 2,
        alertThresholdDays: 3,
        todayStatus: null,
        todayRecordedAt: null,
        adherenceHistory: []
      },
      {
        id: 'med-b',
        name: 'Evening Med',
        description: 'Night support',
        instructions: 'Take 1 pill once daily',
        pillCount: 30,
        estimatedRemainingPillCount: 12,
        alertThresholdDays: 3,
        todayStatus: 'took',
        todayRecordedAt: `${today}T08:30:00.000Z`,
        adherenceHistory: [
          { id: 'yesterday-b', date: yesterday, status: 'took', recordedAt: `${yesterday}T08:30:00.000Z` },
          { id: 'today-b', date: today, status: 'took', recordedAt: `${today}T08:30:00.000Z` }
        ]
      }
    ]
  };

  const { window, setDashboardPayload } = await createDom(initialDashboardData);
  const { document } = window;

  window.eval(`dashboardData = ${JSON.stringify(initialDashboardData)}; currentDayOffset = 0; renderDashboard(dashboardData);`);

  const feedbackText = document.getElementById('dashboardFeedback').textContent;
  assert.ok(feedbackText.includes('Yesterday still needs 1 medication.'), 'dashboard should alert when the previous day is missing a record');
  const supplyAlertText = document.getElementById('dashboardSupplyAlert').textContent;
  assert.ok(supplyAlertText.includes('Refill alert'), 'dashboard should render a low-supply alert below the medications list');
  assert.ok(supplyAlertText.includes('Morning Med (2 pills remaining)'), 'dashboard should show the estimated remaining pill count for low-supply medications');

  const recordedCard = getMedicationCard(document, 'med-b');
  assert.ok(recordedCard, 'recorded medication card should render');
  assert.ok(recordedCard.textContent.includes('recorded for today'), 'recorded medication should show the persistent recorded state');
  assert.ok(recordedCard.textContent.includes('edit'), 'recorded medication should keep an edit button visible');
  assert.ok(!recordedCard.textContent.includes('I took today'), 'recorded medication should hide the main action buttons');

  const pendingCard = getMedicationCard(document, 'med-a');
  assert.ok(pendingCard, 'pending medication card should render');
  pendingCard.querySelector('[data-action="record-took"]').click();
  await wait(25);

  const updatedPendingCard = getMedicationCard(document, 'med-a');
  assert.ok(updatedPendingCard.textContent.includes('good job!'), 'recording today should briefly show the confirmation state');
  assert.ok(updatedPendingCard.textContent.includes('edit'), 'confirmation state should still offer edit');
  assert.ok(!updatedPendingCard.textContent.includes('I took today'), 'confirmation state should hide the record buttons');

  await wait(1300);
  const settledPendingCard = getMedicationCard(document, 'med-a');
  assert.ok(settledPendingCard.textContent.includes('recorded for today'), 'confirmation state should settle into a persistent recorded message');
  settledPendingCard.querySelector('[data-action="edit-record"]').click();
  await wait(0);

  const editablePendingCard = getMedicationCard(document, 'med-a');
  assert.ok(editablePendingCard.textContent.includes('I took today'), 'edit should restore the main record buttons for corrections');
  assert.ok(editablePendingCard.textContent.includes('Not today'), 'edit should restore both correction actions');

  const allDoneDashboardData = {
    today,
    waitingForAdmin: false,
    medications: initialDashboardData.medications.map(medication => ({
      ...medication,
      todayStatus: 'took',
      todayRecordedAt: `${today}T09:00:00.000Z`,
      adherenceHistory: [
        { id: `today-${medication.id}`, date: today, status: 'took', recordedAt: `${today}T09:00:00.000Z` },
        ...((medication.adherenceHistory || []).filter(record => record.date !== today))
      ]
    }))
  };

  setDashboardPayload(allDoneDashboardData);
  window.eval(`dashboardData = ${JSON.stringify(allDoneDashboardData)}; currentDayOffset = 0; renderDashboard(dashboardData);`);
  const allDoneText = document.getElementById('dashboardFeedback').textContent;
  assert.ok(allDoneText.includes('all done for today'), 'dashboard should show the all-done message when every medication is recorded');

  window.close();
  console.log('✅ Medication dashboard feedback flow test passed');
}

run().catch(error => {
  console.error('❌ Medication dashboard feedback flow test failed:', error);
  process.exitCode = 1;
});
