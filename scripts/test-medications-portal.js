#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.MEDICATION_ACCESS_TOKEN_SECRET = process.env.MEDICATION_ACCESS_TOKEN_SECRET || 'medications-test-secret';

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

    const accessUserResult = house.createMedicationPortalUser({
      username: 'AccessUser',
      passwordHash: 'salt:accesshash'
    });
    assert.strictEqual(accessUserResult.success, true, 'access user should be created');

    const accessTokenResult = house.issueMedicationAccessToken(accessUserResult.user.id, {
      scope: 'medication:access',
      ttlMs: 60 * 1000
    });
    assert.strictEqual(accessTokenResult.success, true, 'issueMedicationAccessToken should succeed');
    assert.ok(accessTokenResult.token.length >= 32, 'issued token should be high entropy');
    assert.ok(!Object.prototype.hasOwnProperty.call(accessTokenResult.record, 'rawToken'), 'raw token should not be stored in metadata');
    assert.ok(accessTokenResult.record.tokenHash, 'token hash should be stored instead of plaintext');
    assert.strictEqual(accessTokenResult.record.scope, 'medication:access', 'access token should be scoped to medication access');
    assert.strictEqual(house.getMedicationAccessTokens().length >= 1, true, 'issued access token should be persisted');

    const validResult = house.verifyMedicationAccessToken(accessTokenResult.token, { scope: 'medication:access' });
    assert.strictEqual(validResult.valid, true, 'valid medication access token should authenticate the intended user');
    assert.strictEqual(validResult.user.id, accessUserResult.user.id, 'token should resolve to the intended portal user');
    assert.ok(validResult.usedAt, 'token should be marked used after verification');

    const duplicateResult = house.verifyMedicationAccessToken(accessTokenResult.token, { scope: 'medication:access' });
    assert.strictEqual(duplicateResult.valid, false, 'used medication access token should be rejected');
    assert.strictEqual(duplicateResult.reason, 'used_token', 'used token should fail with used_token reason');

    const expiredTokenResult = house.issueMedicationAccessToken(accessUserResult.user.id, {
      scope: 'medication:access',
      ttlMs: -1
    });
    assert.strictEqual(expiredTokenResult.success, true, 'expired token should be created for validation');
    const expiredResult = house.validateMedicationAccessToken(expiredTokenResult.token, { scope: 'medication:access' });
    assert.strictEqual(expiredResult.valid, false, 'expired token should be rejected');
    assert.strictEqual(expiredResult.reason, 'expired_token', 'expired tokens should be rejected explicitly');

    const revokedTokenResult = house.issueMedicationAccessToken(accessUserResult.user.id, { scope: 'medication:access', ttlMs: 60 * 1000 });
    assert.strictEqual(revokedTokenResult.success, true, 'revoked token should be created');
    const revokeResult = house.revokeMedicationAccessToken(revokedTokenResult.token, { scope: 'medication:access' });
    assert.strictEqual(revokeResult.success, true, 'revocation should succeed');
    const revokedResult = house.validateMedicationAccessToken(revokedTokenResult.token, { scope: 'medication:access' });
    assert.strictEqual(revokedResult.valid, false, 'revoked token should be rejected');
    assert.strictEqual(revokedResult.reason, 'revoked_token', 'revoked tokens should fail with revoked_token');

    const missingResult = house.validateMedicationAccessToken('definitely-not-real', { scope: 'medication:access' });
    assert.strictEqual(missingResult.valid, false, 'invalid token should be rejected');
    assert.strictEqual(missingResult.reason, 'invalid_token', 'invalid tokens should fail with invalid_token');
    log('✅ Medication access links are secure, scoped, expiring, single-use, and hashed');
  } finally {
    cleanup(tempDir);
  }
}

run();
