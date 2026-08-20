#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const house = require(path.join(repoRoot, 'modules', 'house.js'));

function cleanup(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function log(message) {
  console.log(message);
}

function getDateOffset(daysOffset) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().slice(0, 10);
}

function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medications-portal-test-'));
  const dataFilePath = path.join(tempDir, 'house-data.json');

  try {
    house.init({ house: { dataFilePath } });

    const initialData = house.getMedicationsData();
    assert.deepStrictEqual(initialData.medications, [], 'default medications list should exist');
    assert.deepStrictEqual(initialData.portalUsers, [], 'default medication portal users list should exist');
    assert.deepStrictEqual(initialData.assignments, [], 'default assignments list should exist');
    assert.deepStrictEqual(initialData.adherenceRecords, [], 'default adherence list should exist');
    log('✅ Default house medication data includes portal users, assignments, and adherence records');

    const addMedicationResult = house.addMedication({
      name: 'Lisinopril 10mg',
      description: 'Blood pressure medication',
      usage: 'Blood pressure support',
      instructions: 'Take 1 pill once daily',
      pillCount: 30,
      refillDate: '2026-08-01',
      refillExpiration: '2026-12-31'
    });
    assert.strictEqual(addMedicationResult.success, true, 'addMedication should succeed');

    const medication = house.getMedicationsData().medications[0];
    assert.strictEqual(medication.usage, 'Blood pressure support', 'medication usage should be stored');
    log('✅ Medication entries store the new usage field');

    const createUserResult = house.createMedicationPortalUser({
      username: 'Casey',
      passwordHash: 'salt:hash'
    });
    assert.strictEqual(createUserResult.success, true, 'createMedicationPortalUser should succeed');
    assert.strictEqual(createUserResult.user.username, 'Casey', 'user should be returned without password hash');

    const duplicateUserResult = house.createMedicationPortalUser({
      username: 'casey',
      passwordHash: 'salt:hash2'
    });
    assert.strictEqual(duplicateUserResult.success, false, 'duplicate usernames should be rejected case-insensitively');
    assert(house.getMedicationPortalUserByUsername('CASEY'), 'username lookup should be case-insensitive');
    log('✅ Medication portal accounts enforce unique usernames');

    const secondUserResult = house.createMedicationPortalUser({
      username: 'Morgan',
      passwordHash: 'salt:hash3'
    });
    assert.strictEqual(secondUserResult.success, true, 'second user should be created');

    const assignmentResult = house.setMedicationAssignments(medication.id, [
      createUserResult.user.id,
      secondUserResult.user.id
    ]);
    assert.strictEqual(assignmentResult.success, true, 'setMedicationAssignments should succeed');
    assert.strictEqual(house.getAssignedMedicationsForUser(createUserResult.user.id).length, 1, 'assigned user should receive the medication');
    log('✅ Admin assignment data maps medications to portal users');

    const yesterday = getDateOffset(-1);
    const today = getDateOffset(0);

    const recordYesterday = house.recordMedicationAdherence(createUserResult.user.id, medication.id, 'took', yesterday);
    assert.strictEqual(recordYesterday.success, true, 'backdated adherence should be recorded');
    assert.strictEqual(recordYesterday.record.date, yesterday, 'backdated adherence should use the requested date');
    assert(recordYesterday.record.recordedAt, 'adherence records should capture the submission timestamp');

    const recordToday = house.recordMedicationAdherence(createUserResult.user.id, medication.id, 'not_taken', today);
    assert.strictEqual(recordToday.success, true, 'today adherence should be recorded');

    const updateToday = house.recordMedicationAdherence(createUserResult.user.id, medication.id, 'took', today);
    assert.strictEqual(updateToday.success, true, 'existing day adherence should be updatable');

    const history = house.getMedicationAdherenceHistory(createUserResult.user.id, medication.id);
    assert.strictEqual(history.length, 2, 'updating a day should not create duplicate records');
    assert.strictEqual(history[0].date, today, 'history should be sorted newest-first');
    assert.strictEqual(history[0].status, 'took', 'updated adherence status should be stored');
    log('✅ Medication adherence supports today and previous-day updates with timestamps');

    const deleteMedicationResult = house.deleteMedication(medication.id);
    assert.strictEqual(deleteMedicationResult.success, true, 'deleteMedication should succeed');
    assert.strictEqual(house.getMedicationAssignments().length, 0, 'deleting medication should remove assignments');
    assert.strictEqual(house.getMedicationAdherenceRecords().length, 0, 'deleting medication should remove adherence records');
    log('✅ Deleting a medication cleans up linked portal data');
  } finally {
    cleanup(tempDir);
  }
}

run();
