# KSJ Digital Portal Deployment Worker

Phase 4.6 adds a guarded server-side deployment runner for KSJ Digital Portals.

## Current behaviour

The deployment worker endpoint is available through the existing portal API server:

```bash
npm run portal:api
```

Endpoint:

```txt
POST /api/portal/deployments/run
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
    "deployment": {
      "provider": "VPS / Nginx",
      "vpsPath": "/home/twotonetaj/site",
      "buildCommand": "npm run build"
    }
  }
}
```

By default the worker runs in dry-run mode. It validates the website metadata and returns planned steps without running shell commands.

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

## Environment variables

```txt
PORTAL_API_PORT=4174
PORTAL_ALLOWED_ORIGIN=https://ksjdigital.co.uk
PORTAL_DEPLOYMENTS_ENABLED=false
PORTAL_DEPLOY_ALLOWED_ROOTS=/home
PORTAL_DEPLOY_STEP_TIMEOUT_MS=300000
```

## Next work

The worker currently performs a guarded local VPS build workflow. The next polish phase should add:

- Deployment logs stored outside localStorage
- Queue persistence on the server
- Worker lock to prevent duplicate runs
- Post-build verification URL check
- PM2/systemd production process setup
- Clear retry/redeploy controls
