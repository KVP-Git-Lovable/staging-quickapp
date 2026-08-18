# Staging Database Connection

## Which project the app talks to

This repo is wired to **one** Supabase project — the test application's staging DB:

| | |
|---|---|
| Project name | `Application test - Stage` |
| Project ref | `aoxdosjkwqyuvccuwhzc` |
| API URL | `https://aoxdosjkwqyuvccuwhzc.supabase.co` |
| Region | `ap-south-1` |

The connection lives in `.env`:

```
VITE_SUPABASE_URL=https://aoxdosjkwqyuvccuwhzc.supabase.co
VITE_SUPABASE_PROJECT_ID=aoxdosjkwqyuvccuwhzc
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key for aoxdosjkwqyuvccuwhzc>
```

Only `VITE_`-prefixed variables reach the browser bundle — Vite strips everything
else. The bare `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` entries exist for
local Edge Function work (`supabase functions serve`) and must be kept pointing
at the same project as the `VITE_` pair.

`supabase/config.toml` pins the same ref (`project_id = "aoxdosjkwqyuvccuwhzc"`),
so the CLI, the migrations, and the app all target staging.

## Do not confuse these projects

The org contains several similarly-named projects. Only the first is staging:

| Project | Ref | Use |
|---|---|---|
| **Application test - Stage** | `aoxdosjkwqyuvccuwhzc` | **This repo — staging** |
| Application test | `etabpbfokzhhfuybeieu` | Older test project |
| Application test - Live Mirror | `rdfmcxvbseobsmladgtr` | Mirror of live data |
| Preprod of Quickapp 06072026 | `ihdkqgiesgichzgrqocc` | Preprod snapshot |
| Application - Pharma | `jkwobuljnfginnlvwghl` | Separate product |

## Prod vs QA within staging

There is no second database for QA. Both APKs hit `aoxdosjkwqyuvccuwhzc`; the
QA build is isolated by **table prefix**, not by connection:

- `.env.production` → `VITE_APP_MODE=production`, `VITE_TABLE_PREFIX=` (empty)
- `.env.qa` → `VITE_APP_MODE=qa`, `VITE_TABLE_PREFIX=qa_`

In QA mode `src/integrations/supabase/client.ts` wraps the client so that
`from('retailers')` is routed to `qa_retailers`, writes to non-mirrored tables
are blocked, and RPCs outside `QA_SAFE_RPCS` are rejected. See
`QA_BUILD_WORKFLOW.md` for the build steps and the known limits of the `qa_`
mirrors.

## Verifying the connection

```bash
# 1. Confirm the anon key actually belongs to the staging project.
#    The "ref" claim in the JWT payload must read aoxdosjkwqyuvccuwhzc.
node -e 'const k=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  console.log(JSON.parse(Buffer.from(k.split(".")[1],"base64")).ref)'

# 2. Hit the REST endpoint (expects HTTP 200).
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY" \
  "$VITE_SUPABASE_URL/rest/v1/"

# 3. Run the app; the browser console should show no 401/404 from Supabase.
npm run dev
```

A `401 Invalid API key` means the key and the URL are from different projects —
re-check that all four variables above name `aoxdosjkwqyuvccuwhzc`.

## Note on secrets

`.env`, `.env.qa`, and `.env.production` are committed to the repo. The Supabase
key in them is the **anon/publishable** key, which is designed to be shipped to
clients and is protected by RLS — it is not a service-role key. Keep it that
way: never commit a `service_role` key, and keep Edge Function secrets in the
Supabase dashboard rather than in these files.
