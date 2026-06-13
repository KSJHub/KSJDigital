# KSJ Digital Portal Deployment Worker

Phase 4.6 adds a guarded server-side deployment runner for KSJ Digital Portals.

## Current behaviour

The deployment worker endpoint is available through the existing portal API server:

```bash
npm run portal:api
```

Run deployment endpoint:

```txt
POST /api/portal/deployments/run
```

Read worker state/logs endpoint:

```txt
GET /api/portal/deployments/status
GET /api/portal/deployments/status?deploymentId=deployment-twotonetaj-123
```

Payload:

```json
{
  "deployment": {
    "id": "deployment-twotonetaj-123",
    "websiteId": "twotonetaj",
    "status": "Queued",
    "githubCommitSha": "optional"
  },
  "website": {
    "id": "twotonetaj",
    "url": "https://twotonetaj.ksjdigital.co.uk/",
    "deployment": {
      "provider": "VPS / Nginx",
      "vpsPath": "/home/twotonetaj/site",
      "buildCommand": "npm run build",
      "verificationUrl": "https://twotonetaj.ksjdigital.co.uk/"
    }
  }
}
```

By default the worker runs in dry-run mode. It validates the website metadata, writes a server-side runtime snapshot, records logs, and returns planned steps without running shell commands.

## Real command execution

Only enable real commands on the VPS when the API server is running in the correct environment.

```bash
PORTAL_DEPLOYMENTS_ENABLED=true npm run portal:api
```

or:

```bash
npm run portal:deploy-worker
```

## Safety controls

The runner currently allows these commands only:

1. `git pull`
2. `npm install`
3. `npm run build`

Deployment paths must be absolute and stay inside allowed roots.

Default allowed root:

```txt
/home
```

Override with:

```bash
PORTAL_DEPLOY_ALLOWED_ROOTS=/home,/var/www
```

A worker lock is stored per deployment ID to prevent duplicate runs of the same deployment job.

## Server runtime state

The worker stores runtime state outside browser localStorage at:

```txt
server/runtime/deployment-state.json
```

Override with:

```bash
PORTAL_DEPLOY_STATE_DIR=/var/lib/ksj-digital/portal
```

State includes:

- Active locks
- Recent deployment snapshots
- Step logs
- Verification results

## Verification

After successful build steps, the worker checks the website `deployment.verificationUrl` or `website.url`.

Disable URL checks with:

```bash
PORTAL_DEPLOY_VERIFY_URLS=false
```

## Environment variables

```txt
PORTAL_API_PORT=4174
PORTAL_ALLOWED_ORIGIN=https://ksjdigital.co.uk
PORTAL_DEPLOYMENTS_ENABLED=false
PORTAL_DEPLOY_ALLOWED_ROOTS=/home
PORTAL_DEPLOY_STATE_DIR=/var/lib/ksj-digital/portal
PORTAL_DEPLOY_STEP_TIMEOUT_MS=300000
PORTAL_DEPLOY_VERIFY_URLS=true
```

## Next work

The worker now has guarded command execution, server-side state, logs, locks, and verification. The next phase should add:

- PM2/systemd production process setup
- Server-side queue persistence for pending jobs
- Background queue polling
- Staff-only deployment API authentication
- Better deployment log viewer styling
- Clear redeploy/latest-success controls
