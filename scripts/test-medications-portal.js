#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const repoRoot = path.join(__dirname, '..');
const houseModulePath = path.join(repoRoot, 'modules', 'house.js');
const publicMedicationsHtml = fs.readFileSync(path.join(repoRoot, 'public', 'medications.html'), 'utf8');

function loadHouse() {
  delete require.cache[require.resolve(houseModulePath)];
  return require(houseModulePath);
}

function extractFunctionSource(source, signature) {
  const startIndex = source.indexOf(signature);
  if (startIndex === -1) {
    throw new Error(`Unable to locate ${signature} in public/medications.html`);
  }

  const bodyStartIndex = source.indexOf('{', startIndex);
  let depth = 0;
  for (let index = bodyStartIndex; index < source.length; index++) {
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

  throw new Error(`Unable to parse ${signature} in public/medications.html`);
}

function extractAccessLinkToken(value, origin = 'https://portal.example') {
  const context = {
    URL,
    window: { location: { origin } }
  };
  vm.createContext(context);
  vm.runInContext(`${extractFunctionSource(publicMedicationsHtml, 'function extractAccessLinkToken(value)')}\nthis.extractAccessLinkToken = extractAccessLinkToken;`, context);
  return context.extractAccessLinkToken(value);
}

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
  const originalMedicationAccessTokenSecret = process.env.MEDICATION_ACCESS_TOKEN_SECRET;
  let house = loadHouse();

  try {
    delete process.env.MEDICATION_ACCESS_TOKEN_SECRET;
    house.init({ house: { dataFilePath } });
    const yesterday = getDateOffset(-1);
    const today = getDateOffset(0);

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
      refillDate: yesterday,
      alertThresholdDays: 29,
      refillExpiration: '2026-12-31'
    });
    assert.strictEqual(addMedicationResult.success, true, 'addMedication should succeed');

    const medication = house.getMedicationsData().medications[0];
    assert.strictEqual(medication.usage, 'Blood pressure support', 'medication usage should be stored');
    const forecast = house.computeMedicationForecast(medication);
    assert.strictEqual(forecast.alertThresholdPillCount, 29, 'forecast should expose the configured pill-count threshold explicitly');
    assert.strictEqual(forecast.estimatedRemainingPillCount, 29, 'forecast should estimate remaining pills from refill date and daily usage');
    assert.strictEqual(forecast.daysUntilEmpty, 29, 'forecast should update remaining days based on estimated pills');
    assert.strictEqual(forecast.belowAlertThreshold, true, 'forecast should flag medications at or below the configured threshold');
    log('✅ Medication entries store the new usage field');

    assert.ok(Array.isArray(medication.regimenHistory), 'medications should persist regimen history');
    assert.strictEqual(medication.regimenHistory.length, 1, 'new medications should start with one regimen history entry');

    const retroMedicationResult = house.addMedication({
      name: 'Transition Med',
      instructions: 'Take 1 pill once daily',
      scheduleFrequency: 'daily',
      pillsPerDose: 1,
      pillCount: 20,
      refillDate: getDateOffset(-4),
      alertThresholdDays: 5
    });
    assert.strictEqual(retroMedicationResult.success, true, 'retro medication should be created');
    const retroMedication = house.getMedicationsData().medications.find(entry => entry.name === 'Transition Med');
    const regimenUpdateResult = house.updateMedication(retroMedication.id, {
      scheduleFrequency: 'twice daily',
      pillsPerDose: 2,
      regimenEffectiveDate: getDateOffset(-2)
    });
    assert.strictEqual(regimenUpdateResult.success, true, 'dated regimen updates should succeed');
    const updatedRetroMedication = house.getMedicationsData().medications.find(entry => entry.id === retroMedication.id);
    assert.strictEqual(updatedRetroMedication.regimenHistory.length, 2, 'dated regimen changes should append to history');
    assert.strictEqual(house.getMedicationRegimenForDate(updatedRetroMedication, getDateOffset(-3)).scheduleFrequency, 'daily', 'historical dates should keep the prior regimen');
    assert.strictEqual(house.getMedicationRegimenForDate(updatedRetroMedication, getDateOffset(-1)).scheduleFrequency, 'twice daily', 'later dates should use the updated regimen');
    assert.strictEqual(
      house.computeMedicationForecast(updatedRetroMedication, { asOfDate: today }).estimatedRemainingPillCount,
      10,
      'forecasting should apply the correct regimen for each historical date range'
    );
    log('✅ Medication regimen history supports dated historical changes');

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
    assert.strictEqual(history[0].pillsTaken, 1, 'took records should default to the scheduled pill count');
    log('✅ Medication adherence supports today and previous-day updates with timestamps');

    const doseEditMedicationResult = house.addMedication({
      name: 'Dose Edit Med',
      instructions: 'Take 1 pill once daily',
      scheduleFrequency: 'daily',
      pillsPerDose: 1,
      pillCount: 10,
      refillDate: yesterday
    });
    assert.strictEqual(doseEditMedicationResult.success, true, 'dose edit medication should be created');
    const doseEditMedication = house.getMedicationsData().medications.find(entry => entry.name === 'Dose Edit Med');
    assert.strictEqual(house.setMedicationAssignments(doseEditMedication.id, [createUserResult.user.id]).success, true, 'dose edit medication should be assigned');
    const customDoseRecord = house.recordMedicationAdherence(createUserResult.user.id, doseEditMedication.id, 'took', yesterday, { pillsTaken: 3 });
    assert.strictEqual(customDoseRecord.success, true, 'custom pill counts should be accepted');
    assert.strictEqual(customDoseRecord.record.pillsTaken, 3, 'custom pill counts should be persisted on the adherence record');
    const updatedDoseRecord = house.recordMedicationAdherence(createUserResult.user.id, doseEditMedication.id, 'took', yesterday, { pillsTaken: 1.5 });
    assert.strictEqual(updatedDoseRecord.success, true, 'existing adherence records should support pill-count edits');
    assert.strictEqual(updatedDoseRecord.record.pillsTaken, 1.5, 'edited pill counts should overwrite the saved quantity');
    const doseEditHistory = house.getMedicationAdherenceHistory(createUserResult.user.id, doseEditMedication.id);
    assert.strictEqual(doseEditHistory.length, 1, 'editing a pill count should reuse the existing daily record');
    assert.strictEqual(doseEditHistory[0].pillsTaken, 1.5, 'adherence history should expose the edited pill count');
    assert.strictEqual(
      house.computeMedicationForecast(doseEditMedication, {
        asOfDate: today,
        adherenceRecords: house.getMedicationAdherenceRecords().filter(record => record.medicationId === doseEditMedication.id)
      }).estimatedRemainingPillCount,
      8,
      'forecasts should use actual recorded pill counts when they are available'
    );
    log('✅ Medication adherence records keep editable actual pill counts');

    const deleteMedicationResult = house.deleteMedication(medication.id);
    assert.strictEqual(deleteMedicationResult.success, true, 'deleteMedication should succeed');
    assert.strictEqual(
      house.getMedicationAssignments().filter(assignment => assignment.medicationId === medication.id).length,
      0,
      'deleting medication should remove assignments for that medication'
    );
    assert.strictEqual(
      house.getMedicationAdherenceRecords().filter(record => record.medicationId === medication.id).length,
      0,
      'deleting medication should remove adherence records for that medication'
    );
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

    const explicitExpirationTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const explicitExpirationResult = house.issueMedicationAccessToken(accessUserResult.user.id, {
      scope: 'medication:access',
      expiresAt: explicitExpirationTime,
      expiration: '1_day',
      expirationLabel: '1 day'
    });
    assert.strictEqual(explicitExpirationResult.success, true, 'issueMedicationAccessToken should support explicit expiration timestamps');
    assert.strictEqual(explicitExpirationResult.record.expiresAt, explicitExpirationTime, 'explicit expiration timestamps should be preserved');
    assert.strictEqual(explicitExpirationResult.record.expiration, '1_day', 'selected expiration value should be stored in metadata');
    assert.strictEqual(explicitExpirationResult.record.expirationLabel, '1 day', 'selected expiration label should be stored in metadata');

    const restartSafeTokenResult = house.issueMedicationAccessToken(accessUserResult.user.id, {
      scope: 'medication:access',
      ttlMs: 60 * 1000
    });
    assert.strictEqual(restartSafeTokenResult.success, true, 'restart-safe token should be created');
    assert.ok(house.getMedicationsData().accessTokenSecret, 'medication access token secret should be persisted with medication data');

    delete process.env.MEDICATION_ACCESS_TOKEN_SECRET;
    house = loadHouse();
    house.init({ house: { dataFilePath } });

    const rawTokenValidation = house.validateMedicationAccessToken(restartSafeTokenResult.token, { scope: 'medication:access' });
    assert.strictEqual(rawTokenValidation.valid, true, 'raw token should remain valid after module reload');

    const pathTokenValidation = house.validateMedicationAccessToken(
      extractAccessLinkToken(`/medications/access/${restartSafeTokenResult.token}`),
      { scope: 'medication:access' }
    );
    assert.strictEqual(pathTokenValidation.valid, true, 'route-path token input should remain valid after module reload');

    const urlTokenValidation = house.validateMedicationAccessToken(
      extractAccessLinkToken(`https://portal.example/medications/access/${restartSafeTokenResult.token}`),
      { scope: 'medication:access' }
    );
    assert.strictEqual(urlTokenValidation.valid, true, 'full URL token input should remain valid after module reload');
    log('✅ Medication access links remain valid across module reloads for raw, path, and full URL inputs');

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
    if (originalMedicationAccessTokenSecret === undefined) {
      delete process.env.MEDICATION_ACCESS_TOKEN_SECRET;
    } else {
      process.env.MEDICATION_ACCESS_TOKEN_SECRET = originalMedicationAccessTokenSecret;
    }
    cleanup(tempDir);
  }
}

run();
