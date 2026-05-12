# API v2 envelope item download (runbook)

This runbook covers how to test the **API v2** download endpoint for a specific envelope item ID and how to identify the **API token** in Postgres.

## Endpoint

This hits the Hono route implemented in:

- `apps/remix/server/api/download/download.ts` (`GET /api/v2/envelope/item/:envelopeItemId/download`)

Behavior notes:

- A **401** means the API token is missing/invalid.
- A **404** with body `{"error":"Envelope item not found"}` means the envelope item **either** does not exist **or** exists but does not match the API token’s team/user access filter.

## Quick curl test (exact envelope item)

Replace `API_TOKEN` with the **plaintext** token that POS/ssdriver is using (it typically looks like `api_...`).

```bash
API_TOKEN='api_sl2yth46ha3wshrg'
ENVELOPE_ITEM_ID='envelope_item_bntnznlaxmxdtnao'

curl -v \
  -H "Authorization: Bearer ${API_TOKEN}" \
  "https://sign.pinogy.com/api/v2/envelope/item/${ENVELOPE_ITEM_ID}/download" \
  -o "${ENVELOPE_ITEM_ID}.pdf"
```

Optional: request the original instead of signed PDF:

```bash
curl -v \
  -H "Authorization: Bearer ${API_TOKEN}" \
  "https://sign.pinogy.com/api/v2/envelope/item/${ENVELOPE_ITEM_ID}/download?version=original" \
  -o "${ENVELOPE_ITEM_ID}.pdf"
```

## Identify whether the envelope item exists and which team it belongs to

In `psql`:

```sql
SELECT
  ei.id AS envelope_item_id,
  ei."envelopeId",
  e."teamId",
  e.status
FROM "EnvelopeItem" ei
JOIN "Envelope" e ON e.id = ei."envelopeId"
WHERE ei.id = 'envelope_item_bntnznlaxmxdtnao';
```

If that returns 0 rows, the ID is wrong (or you’re connected to the wrong DB).

## How API tokens are stored (why you can’t “retrieve the token” from DB)

API tokens are stored **hashed**, not in plaintext:

- Token format is created like `api_${alphaid(16)}` in `packages/lib/server-only/public-api/create-api-token.ts`.
- The database stores `sha512(token)` (see `packages/lib/server-only/auth/hash.ts`).

That means:

- You **cannot reverse** the hash to recover the original token string.
- To test with curl, you need the **plaintext token** from where it’s configured (POS/ssdriver secret, env var, vault, etc.), or you must mint a new token via the app/admin tooling.

## Find the correct `ApiToken` row in Postgres

### Option A: You already have the plaintext token (recommended)

If you have the plaintext token (e.g. `api_abc...`), compute its sha512 and search for it in DB.

#### If `pgcrypto` is available

```sql
-- Check if extension exists
SELECT extname FROM pg_extension WHERE extname = 'pgcrypto';

-- Compute sha512 hex (this should match ApiToken.token)
SELECT encode(digest('api_REPLACE_ME', 'sha512'), 'hex') AS token_sha512_hex;

-- Find matching DB row
SELECT id, "teamId", "userId", expires
FROM "ApiToken"
WHERE token = encode(digest('api_REPLACE_ME', 'sha512'), 'hex');
```

#### If `pgcrypto` is NOT available

Compute sha512 hex outside Postgres and paste it into the query:

```bash
python - <<'PY'
import hashlib
token = "api_REPLACE_ME"
print(hashlib.sha512(token.encode("utf-8")).hexdigest())
PY
```

Then:

```sql
SELECT id, "teamId", "userId", expires
FROM "ApiToken"
WHERE token = '<sha512_hex_here>';
```

### Option B: You do not have the plaintext token

You can only narrow candidates; you cannot reconstruct the token string.

1. Determine the `teamId` for the envelope item (query above), then:

```sql
SELECT id, "teamId", "userId", expires
FROM "ApiToken"
WHERE "teamId" = 19
LIMIT 50;
```

2. Correlate the **actual token used by the failing request** via logs.

The API download handler logs `apiTokenId` and `userId` for each request:

- `apps/remix/server/api/download/download.ts` logs `{ apiTokenId, userId, envelopeItemId, path }`

Once you have `apiTokenId` from logs:

```sql
SELECT id, "teamId", "userId", expires
FROM "ApiToken"
WHERE id = <apiTokenId>;
```

## If curl returns 404 Envelope item not found

Given an existing `EnvelopeItem`, a 404 here typically means **access scoping** failed:

- Envelope belongs to team X, but the API token is for team Y, or
- The API token’s `userId` is not linked to the team via the org/team group graph.

To validate group membership for a `(teamId, userId)` pair:

```sql
SELECT
  t.id AS team_id,
  om."userId" AS user_id
FROM "Team" t
JOIN "TeamGroup" tg ON tg."teamId" = t.id
JOIN "OrganisationGroup" og ON og.id = tg."organisationGroupId"
JOIN "OrganisationGroupMember" ogm ON ogm."groupId" = og.id
JOIN "OrganisationMember" om ON om.id = ogm."organisationMemberId"
WHERE t.id = 19
  AND om."userId" = 3
LIMIT 1;
```
