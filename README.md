# KSJ Digital Portals

KSJ Digital Portals is the management panel for KSJ Digital websites, client content edits, draft approvals, support tickets, deployment tracking, and rollback workflows.

## Current Architecture

```txt
KSJDigital
├── server/
│   ├── api/
│   ├── data/
│   ├── deployment/
│   ├── github/
│   ├── stores/
│   └── devPortal.js
├── src/
│   ├── pages/
│   └── portals/
└── public/
```

## Source Of Truth

The active portal database is:

```txt
server/data/portalData.json
```

This JSON file stores users, websites, ownership, contact details, drafts, publish requests, support tickets, backups, deployment queue, deployment history, notifications, and settings.

It is intentionally ignored by Git so local and VPS data does not get overwritten by commits.

The seed file is:

```txt
src/portals/data/portalData.js
```

It is only a default template. If `server/data/portalData.json` does not exist, the API regenerates it from this seed on startup.

## Local Development

Install dependencies:

```bash
npm install
```

Start the Portal API and Vite frontend together:

```bash
npm start
```

Useful URLs:

```txt
Frontend: http://localhost:5173/
Portal API: http://localhost:4174/api/portal/health
Portal data: http://localhost:4174/api/portal/data
```

## Scripts

```txt
npm start                     Start Portal API + Vite frontend
npm run portal:start          Same as npm start
npm run portal:api            Start Portal API only
npm run portal:api:watch      Start Portal API in watch mode
npm run dev                   Start Vite frontend only
npm run build                 Build production frontend
npm run preview               Preview production build
npm run lint                  Run ESLint
npm run portal:deploy-worker  Start API with deployment worker flag
```

## Current Roadmap

1. Finish repository cleanup and server folder organisation.
2. Polish Website Management System.
3. Finish Deployments Dashboard.
4. Finish Deployment Queue and History views.
5. Connect real VPS deployment worker.
6. Complete Git-based publish approval workflow.
7. Harden authentication and move from JSON storage to PostgreSQL or Prisma later.
