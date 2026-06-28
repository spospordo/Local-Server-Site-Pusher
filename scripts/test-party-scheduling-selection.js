#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractFunction(source, signature) {
  const signatureRegex = new RegExp(`${signature}[\\s\\S]*?\\{`);
  const signatureMatch = source.match(signatureRegex);
  if (!signatureMatch || signatureMatch.index === undefined) {
    throw new Error(`Could not find function signature: ${signature}`);
  }
  const start = signatureMatch.index;

  let i = start + signatureMatch[0].length - 1;
  let depth = 0;

  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  throw new Error(`Could not parse function body for: ${signature}`);
}

function extractNamedAsyncFunction(source, name) {
  return extractFunction(source, `async function ${name}\\s*\\([^)]*\\)\\s*`);
}

async function run() {
  const NONEXISTENT_PARTY_ID = 999;
  const dashboardPath = path.join(__dirname, '..', 'admin', 'dashboard.html');
  const dashboard = fs.readFileSync(dashboardPath, 'utf8');

  const loadPartiesFn = extractNamedAsyncFunction(dashboard, 'loadParties');
  const loadPartyFn = extractNamedAsyncFunction(dashboard, 'loadParty');
  const saveSchedulingDataFn = extractNamedAsyncFunction(dashboard, 'saveSchedulingData');

  const elementMap = {
    currentPartySelector: { style: { display: 'none' } },
    currentPartyName: { textContent: '' },
    partyStatusSelect: { value: 'scheduled' },
    partyName: { value: 'Future Party' },
    partyDate: { value: '2099-01-01' },
    partyStartTime: { value: '18:00' },
    partyEndTime: { value: '22:00' }
  };

  const parties = [
    { id: 1, name: 'Past Party', status: 'scheduled', date: '2020-01-01', inviteeCount: 2 },
    { id: 2, name: 'Future Party', status: 'scheduled', date: '2099-01-01', inviteeCount: 4 }
  ];

  const fetchGetPartyIds = [];

  const context = {
    allParties: [],
    currentPartyId: null,
    currentSchedulingData: { invitees: [], menu: [], tasks: [], events: [] },
    renderPartyList: () => {},
    showEmptyPartyState: () => {},
    renderInvitees: () => {},
    renderMenu: () => {},
    renderTasks: () => {},
    renderEvents: () => {},
    showAlert: () => {},
    console,
    document: {
      getElementById(id) {
        return elementMap[id];
      }
    },
    fetch: async (url, requestOptions) => {
      if (url === '/admin/api/parties') {
        return { json: async () => ({ parties }) };
      }

      const getMatch = url.match(/^\/admin\/api\/parties\/(\d+)$/);
      if (getMatch && !requestOptions) {
        const partyId = Number(getMatch[1]);
        fetchGetPartyIds.push(partyId);
        const party = parties.find(p => p.id === partyId);
        return {
          json: async () => ({
            id: party.id,
            name: party.name,
            status: party.status,
            dateTime: {
              date: party.date,
              startTime: '18:00',
              endTime: '22:00'
            },
            invitees: [],
            menu: [],
            tasks: [],
            events: []
          })
        };
      }

      if (getMatch && requestOptions && requestOptions.method === 'PUT') {
        const partyId = Number(getMatch[1]);
        return {
          json: async () => ({
            success: true,
            party: {
              id: partyId,
              name: elementMap.partyName.value,
              status: 'scheduled',
              dateTime: {
                date: elementMap.partyDate.value,
                startTime: elementMap.partyStartTime.value,
                endTime: elementMap.partyEndTime.value
              },
              invitees: [],
              menu: [],
              tasks: [],
              events: []
            }
          })
        };
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    }
  };

  vm.createContext(context);
  vm.runInContext(`${loadPartiesFn}\n${loadPartyFn}\n${saveSchedulingDataFn}`, context);

  await context.loadParties();
  assert.strictEqual(context.currentPartyId, 1, 'Initial load should pick first active party');

  await context.loadParty(2);
  assert.strictEqual(context.currentPartyId, 2, 'Manual selection should switch to future party');

  await context.saveSchedulingData();
  assert.strictEqual(
    context.currentPartyId,
    2,
    'Saving selected future party should not switch selection back to another party'
  );
  assert.strictEqual(
    fetchGetPartyIds[fetchGetPartyIds.length - 1],
    2,
    'Reload after save should load the currently selected party by ID'
  );

  context.currentPartyId = NONEXISTENT_PARTY_ID;
  await context.loadParties({ preserveCurrentSelection: true });
  assert.strictEqual(
    context.currentPartyId,
    1,
    'If selected party is missing, reload should gracefully fall back to first active party'
  );

  console.log('✅ Party scheduling selection stability test passed');
}

run().catch((err) => {
  console.error('❌ Party scheduling selection stability test failed');
  console.error(err);
  process.exit(1);
});
