# Medication Portal Secure Access Links

This document explains how the medication portal secure-link authentication works, how operators manage token generation and expiry, and how the system protects against unauthorized access.

## Overview

The medication portal supports two login paths:

- Password login via `/medications/api/login`
- Secure access link via `/medications/api/access-link` and `/medications/access/:token`

The secure-link path is intended for controlled recovery or guest access when a user cannot log in with a password but still needs access to their assigned medication data.

## Token lifecycle

When an admin generates a link for a user, the server creates a random 32-byte token and stores only a hash of it:

- `token` is returned once to the admin UI or API caller
- `tokenHash` is persisted in the medication data store
- the token is scoped to `medication:access`
- the token expires after a short TTL (default: 15 minutes)
- the token is invalid after a single successful verification

The token validation logic is implemented in `modules/house.js` because the medication portal data and its access-token registry are persisted alongside the rest of the house data in `config/house-data.json`. That shared module enforces:

- missing token rejection
- invalid token rejection
- expired token rejection
- revoked token rejection
- used token rejection
- scope mismatch rejection

## User flow

1. The admin selects a medication portal user and requests a secure access link.
2. The server creates a link and responds with a URL such as:
   `http://localhost:3000/medications/access/<token>`
3. The user opens the link.
4. The server verifies the token and marks it used upon success.
5. The session is established and the user is redirected back to `/medications`.
6. The medication dashboard loads only the medications assigned to that user.

## Password fallback and authorization

The portal keeps password-based login as the primary authentication method. The secure-link flow is a fallback that still uses the same session enforcement and authorization checks.

To keep access limited:

- user sessions are tied to `medicationPortalUserId`
- API endpoints reject unauthenticated requests with `401 UNAUTHORIZED`
- cross-user medication access is blocked by assignment checks
- adherence updates are allowed only when the medication is assigned to the requester

## Required environment configuration

Set a stable token secret in the environment so tokens stay valid across process restarts:

```bash
export MEDICATION_ACCESS_TOKEN_SECRET="replace-with-long-random-secret"
```

If the variable is unset, the application generates an ephemeral secret for the current process only; this is acceptable for development but should be avoided in production.

## Revocation workflow

If a link is compromised or no longer needed:

1. Revoke the token in application logic or by removing it from the persisted `accessTokens` records.
2. Issue a replacement link from the admin interface.
3. Ask the user to log in again using their password if they still have it.
4. Confirm the user receives only their own assigned medication data.

The server exposes the validation and revocation logic through `issueMedicationAccessToken`, `validateMedicationAccessToken`, `verifyMedicationAccessToken`, and `revokeMedicationAccessToken`.

## Security expectations

- Tokens are short-lived and single-use.
- Tokens never appear in plaintext in persisted records.
- Access tokens are scoped to the medication portal, not shared across unrelated routes.
- A bad token redirects to `/medications?error=INVALID_ACCESS_LINK` or `EXPIRED_ACCESS_LINK` for user-friendly recovery, while the internal validation layer still emits structured reasons such as `invalid_token`, `expired_token`, `revoked_token`, and `used_token` for API logging and debugging.
- Password logins and access-link verifications are both rate-limited.

## Regression coverage

The project includes automated tests for:

- secure token issue/validation lifecycle
- invalid, expired, revoked, and used links
- password fallback behavior
- unauthenticated access rejection
- cross-user authorization blocking
- CSRF enforcement on medication portal actions

See the test files in `scripts/test-medications-portal.js` and `scripts/test-medications-auth-integration.js` for the current regression suite.
