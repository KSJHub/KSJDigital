import { useMemo, useState } from 'react';
import PortalSidebar from '../components/PortalSidebar';
import {
  PORTAL_ACTIVE_DEPLOYMENT_STATUSES,
  PORTAL_DEPLOYMENT_STATUSES,
  PORTAL_RUNNABLE_DEPLOYMENT_STATUSES,
  enqueuePortalDeployment,
  getPortalDeploymentQueue,
  getPortalDeploymentStatus,
  runPortalDeployment,
} from '../portals/api/deploymentApi';
import { clearSession, getStoredSession } from '../portals/auth/sessionManager';
import { getPortalData, savePortalData } from '../portals/data/portalManager';

function formatDuration(duration) {
  if (!duration && duration !== 0) return 'Not recorded';
  if (typeof duration === 'string') return duration;
  if (duration < 1000) return `${duration}ms`;
  return `${Math.round(duration / 1000)}s`;
}

function getDeploymentId(deployment) {
  return deployment?.id ?? deployment?.deploymentId;
}

function getDeploymentCommit(deployment) {
  return deployment.githubCommitSha ?? deployment.commitSha ?? 'Waiting for GitHub commit';
}

function getDeploymentTitle(deployment) {
  if (deployment.publishRequestId) return `Publish request: ${deployment.publishRequestId}`;
  if (deployment.deploymentId) return `Deployment: ${deployment.deploymentId}`;
  return 'Deployment job';
}

function getDeploymentTime(deployment) {
  return new Date(deployment.completedAt ?? deployment.startedAt ?? deployment.createdAt ?? 0).getTime() || 0;
}

function DeploymentCard({ deployment, websiteName, actionLabel, onAction, secondaryActionLabel, onSecondaryAction, tertiaryActionLabel, onTertiaryAction }) {
  return (
    <article>
      <div>
        <div className="portal-section-title-row">
          <strong>{websiteName ?? deployment.websiteId}</strong>
          <span>{deployment.status}</span>
        </div>
        <p>{getDeploymentTitle(deployment)}</p>
        <ul>
          <li>Actor: {deployment.actor ?? 'Portal System'}</li>
          <li>Commit: {getDeploymentCommit(deployment)}</li>
          <li>Started: {deployment.startedAt ?? 'Not started yet'}</li>
          <li>Completed: {deployment.completedAt ?? 'Not completed yet'}</li>
          {deployment.duration && <li>Duration: {formatDuration(deployment.duration)}</li>}
          {deployment.workerMessage && <li>Deployment Engine: {deployment.workerMessage}</li>}
        </ul>
      </div>
      {(onAction || onSecondaryAction || onTertiaryAction) && (
        <div className="portal-inline-actions">
          {onAction && <button type="button" onClick={() => onAction(deployment)}>{actionLabel}</button>}
          {onSecondaryAction && <button type="button" onClick={() => onSecondaryAction(deployment)}>{secondaryActionLabel}</button>}
          {onTertiaryAction && <button type="button" onClick={() => onTertiaryAction(deployment)}>{tertiaryActionLabel}</button>}
        </div>
      )}
    </article>
  );
}

export default function PortalsAdminDeployments() {
  const session = getStoredSession();
  const user = session?.user;
  const [portalData, setPortalData] = useState(getPortalData());
  const [activeWebsiteId, setActiveWebsiteId] = useState('all');
  const [workerNotice, setWorkerNotice] = useState('');
  const [selectedWorkerStatus, setSelectedWorkerStatus] = useState(null);
  const [serverQueueSnapshot, setServerQueueSnapshot] = useState([]);

  const websites = portalData.websites ?? [];
  const deploymentQueue = portalData.deploymentQueue ?? [];
  const deploymentHistory = portalData.deploymentHistory ?? [];
  const completedWrites = portalData.completedContentWrites ?? [];
  const pendingWrites = portalData.pendingContentWrites ?? [];
  const websiteById = useMemo(() => Object.fromEntries(websites.map((website) => [website.id, website])), [websites]);

  function getWebsiteName(websiteId) {
    return websiteById[websiteId]?.name ?? websiteId ?? 'Unknown website';
  }

  const visibleQueue = useMemo(() => activeWebsiteId === 'all' ? deploymentQueue : deploymentQueue.filter((item) => item.websiteId === activeWebsiteId), [activeWebsiteId, deploymentQueue]);
  const visibleHistory = useMemo(() => activeWebsiteId === 'all' ? deploymentHistory : deploymentHistory.filter((item) => item.websiteId === activeWebsiteId), [activeWebsiteId, deploymentHistory]);
  const visibleServerQueue = useMemo(() => activeWebsiteId === 'all' ? serverQueueSnapshot : serverQueueSnapshot.filter((item) => item.websiteId === activeWebsiteId), [activeWebsiteId, serverQueueSnapshot]);
  const visibleDeployments = useMemo(() => [...visibleQueue, ...visibleHistory], [visibleQueue, visibleHistory]);
  const activeDeployments = visibleQueue.filter((deployment) => PORTAL_ACTIVE_DEPLOYMENT_STATUSES.includes(deployment.status));
  const failedDeployments = visibleDeployments.filter((deployment) => deployment.status === 'Failed');
  const nextQueuedDeployment = visibleQueue.find((deployment) => deployment.status === 'Queued') ?? null;
  const latestDeployment = [...visibleDeployments].sort((a, b) => getDeploymentTime(b) - getDeploymentTime(a))[0] ?? null;
  const latestCommits = [...completedWrites, ...pendingWrites].filter((write) => activeWebsiteId === 'all' || write.websiteId === activeWebsiteId).slice(0, 8);
  const latestCommit = latestCommits[0] ?? null;
  const deploymentEngineStatus = selectedWorkerStatus ? (selectedWorkerStatus.lock ? 'Busy' : 'Ready') : 'Not Synced';

  function commitPortalData(nextData) {
    const savedData = savePortalData(nextData);
    setPortalData(savedData);
    return savedData;
  }

  function handleLogout() {
    clearSession();
    window.location.href = '/portals';
  }

  function createHistoryRecord(deployment, status, message, result = {}) {
    return {
      id: `history-${getDeploymentId(deployment)}-${Date.now()}`,
      websiteId: deployment.websiteId,
      deploymentId: getDeploymentId(deployment),
      commitSha: deployment.githubCommitSha ?? result.commitSha ?? '',
      actor: user?.name ?? 'KSJ Digital Admin',
      status,
      startedAt: result.startedAt ?? deployment.startedAt ?? 'Just now',
      completedAt: result.completedAt ?? new Date().toISOString(),
      duration: result.duration ?? 'Engine controlled',
      workerMessage: message,
      workerResult: result,
    };
  }

  function updateDeploymentRecord(deployment, nextFields, historyRecord) {
    const deploymentId = getDeploymentId(deployment);
    const nextData = {
      ...portalData,
      deploymentQueue: deploymentQueue.map((item) => getDeploymentId(item) === deploymentId ? { ...item, ...nextFields } : item),
      deploymentHistory: historyRecord ? [historyRecord, ...deploymentHistory] : deploymentHistory,
      websites: websites.map((website) => website.id === deployment.websiteId ? {
        ...website,
        deployment: {
          ...(website.deployment ?? {}),
          lastDeployment: nextFields.completedAt ?? website.deployment?.lastDeployment ?? '',
          lastDeploymentStatus: nextFields.status ?? website.deployment?.lastDeploymentStatus ?? 'Queued',
          lastCommitSha: deployment.githubCommitSha ?? website.deployment?.lastCommitSha ?? '',
        },
      } : website),
      activityLogs: [{ id: `activity-${Date.now()}`, type: `deployment.${String(nextFields.status ?? 'updated').toLowerCase()}`, label: `Deployment ${String(nextFields.status ?? 'updated').toLowerCase()}`, actor: user?.name ?? 'KSJ Digital Admin', target: getWebsiteName(deployment.websiteId), timestamp: 'Just now' }, ...(portalData.activityLogs ?? [])],
    };
    return commitPortalData(nextData);
  }

  function cancelDeployment(deployment) {
    if (!getDeploymentId(deployment)) return;
    const historyRecord = createHistoryRecord(deployment, 'Cancelled', 'Cancelled before deployment engine execution.');
    updateDeploymentRecord(deployment, { status: 'Cancelled', completedAt: 'Just now', workerMessage: 'Cancelled before deployment engine execution.' }, historyRecord);
  }

  async function refreshServerQueue() {
    const result = await getPortalDeploymentQueue();
    if (!result.ok) {
      setWorkerNotice(result.message || 'Unable to refresh server queue.');
      return;
    }
    setServerQueueSnapshot(result.queue ?? []);
    setWorkerNotice(`Server queue refreshed. ${(result.queue ?? []).length} job(s) loaded.`);
  }

  async function syncWorkerStatus(deployment = null) {
    const deploymentId = getDeploymentId(deployment) ?? getDeploymentId(nextQueuedDeployment) ?? getDeploymentId(latestDeployment) ?? null;
    const result = await getPortalDeploymentStatus(deploymentId);
    if (!result.ok) {
      setWorkerNotice(result.message || 'Unable to sync deployment engine status.');
      return;
    }
    setSelectedWorkerStatus(result);
    setWorkerNotice(deploymentId ? `Deployment engine status synced for ${deploymentId}.` : 'Deployment engine status synced.');
  }

  async function runDeployment(deployment) {
    if (!getDeploymentId(deployment)) return;
    const website = websiteById[deployment.websiteId];
    if (!website) {
      setWorkerNotice(`Unable to find website metadata for ${deployment.websiteId}.`);
      return;
    }

    const queuedResult = await enqueuePortalDeployment({
      deployment,
      website,
      status: 'Queued',
      message: 'Deployment queued from dashboard before engine execution.',
    });

    if (!queuedResult.ok && !queuedResult.offline) {
      setWorkerNotice(queuedResult.message || 'Unable to persist deployment to server queue.');
      return;
    }

    updateDeploymentRecord(deployment, {
      status: 'Running',
      startedAt: new Date().toISOString(),
      workerMessage: queuedResult.ok ? 'Server queue persisted. Engine request started.' : 'Server queue unavailable. Engine request started from browser.',
    });

    const result = await runPortalDeployment({ deployment, website });
    const status = result.ok ? 'Success' : result.dryRun ? 'Queued' : 'Failed';
    const message = result.message || (result.ok ? 'Deployment completed.' : 'Deployment failed.');
    const historyRecord = createHistoryRecord(deployment, status, message, result);

    updateDeploymentRecord(deployment, {
      status,
      startedAt: result.startedAt ?? deployment.startedAt ?? new Date().toISOString(),
      completedAt: result.completedAt ?? new Date().toISOString(),
      duration: result.duration,
      workerMessage: message,
      workerResult: result,
    }, historyRecord);

    setSelectedWorkerStatus(result.logs ? result : null);
    setWorkerNotice(message);
    await refreshServerQueue();
    await syncWorkerStatus(deployment);
  }

  function renderDeploymentCard(deployment, actions = {}) {
    return <DeploymentCard key={`${getDeploymentId(deployment)}-${deployment.status}`} deployment={deployment} websiteName={getWebsiteName(deployment.websiteId)} {...actions} />;
  }

  return (
    <main className="portals-shell portals-dashboard-page">
      <section className="portal-dashboard-frame" aria-label="Portal deployments">
        <PortalSidebar section="admin" title="Admin" />
        <div className="portal-dashboard-main">
          <header className="portal-dashboard-header">
            <div><p className="eyebrow">Deployments</p><h2>Deployment Dashboard</h2><p className="portal-role-line">Signed in as <strong>{user?.name ?? 'KSJ Digital Admin'}</strong></p></div>
            <button className="portal-logout-button" type="button" onClick={handleLogout}>Logout</button>
          </header>
          {workerNotice && <p className="portal-inline-notice">{workerNotice}</p>}

          <section className="portal-editor-panel">
            <div className="portal-editor-header">
              <div><p className="eyebrow">Deployment Control</p><h2>Queue, History, Engine Status</h2><p>Track queued jobs, running builds, completed deployments, failed releases, Git writes, and server-side logs from one place.</p></div>
              <div className="portal-header-actions"><button className="portal-logout-button" type="button" onClick={() => syncWorkerStatus()}>Sync Engine</button><button className="portal-logout-button" type="button" onClick={refreshServerQueue}>Refresh Queue</button></div>
            </div>
            <div className="portal-form-grid"><label>Website Filter<select value={activeWebsiteId} onChange={(event) => setActiveWebsiteId(event.target.value)}><option value="all">All websites</option>{websites.map((website) => <option value={website.id} key={website.id}>{website.name}</option>)}</select></label></div>
          </section>

          <div className="portal-admin-stats">
            <article className="portal-help-card"><p className="eyebrow">Engine</p><h3>{deploymentEngineStatus}</h3></article>
            <article className="portal-help-card"><p className="eyebrow">Next Queue</p><h3>{nextQueuedDeployment ? getWebsiteName(nextQueuedDeployment.websiteId) : 'Idle'}</h3></article>
            <article className="portal-help-card"><p className="eyebrow">Server Queue</p><h3>{visibleServerQueue.length}</h3></article>
            <article className="portal-help-card"><p className="eyebrow">Failed</p><h3>{failedDeployments.length}</h3></article>
          </div>

          <div className="portal-grid-two">
            <section className="portal-help-card portal-selection-guide"><p className="eyebrow">Latest Deployment</p><h3>{latestDeployment ? getWebsiteName(latestDeployment.websiteId) : 'No deployment yet'}</h3><p>{latestDeployment ? `${latestDeployment.status} · ${getDeploymentCommit(latestDeployment)}` : 'Deployment history will appear here after the first tracked publish or engine run.'}</p></section>
            <section className="portal-help-card portal-selection-guide"><p className="eyebrow">Latest Git Write</p><h3>{latestCommit?.contentFilePath ?? 'No commit record yet'}</h3><p>{latestCommit?.apiResult?.commitSha ?? latestCommit?.commitSha ?? 'Publish or restore content to create the first Git write record.'}</p></section>
          </div>

          <div className="portal-admin-stats">{PORTAL_DEPLOYMENT_STATUSES.map((status) => <article className="portal-help-card" key={status}><p className="eyebrow">{status}</p><h3>{visibleDeployments.filter((item) => item.status === status).length}</h3></article>)}</div>

          <div className="portal-grid-two">
            <section className="portal-editor-panel"><div className="portal-editor-header"><div><p className="eyebrow">Deployment Queue</p><h2>Queued Jobs</h2><p>Jobs created by publish approval. Run persists the job to the server queue before calling the guarded API engine.</p></div></div><div className="portal-section-list">{visibleQueue.length ? visibleQueue.map((deployment) => renderDeploymentCard(deployment, { actionLabel: 'Cancel', onAction: PORTAL_ACTIVE_DEPLOYMENT_STATUSES.includes(deployment.status) ? cancelDeployment : null, secondaryActionLabel: 'Run Engine', onSecondaryAction: PORTAL_RUNNABLE_DEPLOYMENT_STATUSES.includes(deployment.status) ? runDeployment : null, tertiaryActionLabel: 'Sync Logs', onTertiaryAction: syncWorkerStatus })) : <article><div><div className="portal-section-title-row"><strong>No deployment jobs</strong><span>Waiting</span></div><p>Approve and publish a request to create the first deployment queue item.</p></div></article>}</div></section>
            <section className="portal-editor-panel"><div className="portal-editor-header"><div><p className="eyebrow">Server Queue Snapshot</p><h2>Runtime Queue</h2><p>This comes from the API runtime store. Use Refresh Queue to sync it from the server.</p></div></div><div className="portal-section-list">{visibleServerQueue.length ? visibleServerQueue.map((job) => <article key={`${job.id}-${job.status}`}><div><div className="portal-section-title-row"><strong>{getWebsiteName(job.websiteId)}</strong><span>{job.status}</span></div><p>{job.message || job.deployment?.deploymentId || job.deploymentId || 'Server queue job'}</p><ul><li>Deployment: {job.deploymentId ?? job.id}</li><li>Source: {job.source ?? 'portal-api'}</li><li>Updated: {job.updatedAt ?? 'Not recorded'}</li></ul></div></article>) : <article><div><div className="portal-section-title-row"><strong>No server queue snapshot</strong><span>Not synced</span></div><p>Click Refresh Queue to load the server-side deployment queue.</p></div></article>}</div></section>
          </div>

          <div className="portal-grid-two">
            <section className="portal-editor-panel"><div className="portal-editor-header"><div><p className="eyebrow">Active Deployments</p><h2>Running / Queued</h2><p>Active jobs are separated so the engine can surface live progress here.</p></div></div><div className="portal-section-list">{activeDeployments.length ? activeDeployments.map((deployment) => renderDeploymentCard(deployment, { secondaryActionLabel: 'Run Engine', onSecondaryAction: deployment.status === 'Queued' ? runDeployment : null, tertiaryActionLabel: 'Sync Logs', onTertiaryAction: syncWorkerStatus })) : <article><div><div className="portal-section-title-row"><strong>No active deployments</strong><span>Idle</span></div><p>There are no queued or running deployment jobs right now.</p></div></article>}</div></section>
            <section className="portal-editor-panel"><div className="portal-editor-header"><div><p className="eyebrow">Failed Deployments</p><h2>Needs Attention</h2><p>Failures are grouped here so retry controls are visible.</p></div></div><div className="portal-section-list">{failedDeployments.length ? failedDeployments.map((deployment) => renderDeploymentCard(deployment, { secondaryActionLabel: 'Retry Engine', onSecondaryAction: runDeployment, tertiaryActionLabel: 'Sync Logs', onTertiaryAction: syncWorkerStatus })) : <article><div><div className="portal-section-title-row"><strong>No failed deployments</strong><span>Clear</span></div><p>Nothing needs manual intervention right now.</p></div></article>}</div></section>
          </div>

          <section className="portal-editor-panel"><div className="portal-editor-header"><div><p className="eyebrow">Deployment History</p><h2>Completed Jobs</h2><p>Successful, failed, cancelled, and dry-run records with commit and actor metadata.</p></div></div><div className="portal-section-list">{visibleHistory.length ? visibleHistory.map((deployment) => renderDeploymentCard(deployment, { tertiaryActionLabel: 'Sync Logs', onTertiaryAction: syncWorkerStatus })) : <article><div><div className="portal-section-title-row"><strong>No deployment history</strong><span>Waiting</span></div><p>History appears after the first tracked publish, cancellation, or engine run.</p></div></article>}</div></section>

          <section className="portal-editor-panel"><div className="portal-editor-header"><div><p className="eyebrow">Engine Logs</p><h2>Server Deployment State</h2><p>Logs come from the portal API server runtime store, not browser localStorage.</p></div></div>{selectedWorkerStatus ? <div className="portal-section-list"><article><div><div className="portal-section-title-row"><strong>{selectedWorkerStatus.deploymentId ?? selectedWorkerStatus.deployment?.deploymentId ?? 'Engine Status'}</strong><span>{selectedWorkerStatus.lock ? 'Busy' : 'Ready'}</span></div><p>{selectedWorkerStatus.deployment?.message ?? selectedWorkerStatus.message ?? 'Deployment engine status loaded.'}</p><ul><li>Status: {selectedWorkerStatus.deployment?.status ?? selectedWorkerStatus.queuedJob?.status ?? 'No snapshot yet'}</li><li>Server Queue: {selectedWorkerStatus.queuedJob?.status ?? 'No queued job snapshot'}</li><li>Logs: {selectedWorkerStatus.logs?.length ?? 0}</li><li>Engine State: {selectedWorkerStatus.lock?.acquiredAt ?? 'No active run'}</li></ul></div></article>{(selectedWorkerStatus.logs ?? []).slice(-10).reverse().map((log) => <article key={log.id}><div><div className="portal-section-title-row"><strong>{log.level ?? 'info'}</strong><span>{log.timestamp}</span></div><p>{log.message}</p>{log.step && <ul><li>Step: {log.step}</li></ul>}</div></article>)}</div> : <p className="portal-inline-notice">Use Sync Engine or Sync Logs on a deployment job to load server-side deployment state.</p>}</section>

          <section className="portal-editor-panel"><div className="portal-editor-header"><div><p className="eyebrow">Latest Commits</p><h2>Git Content Writes</h2><p>Recent content writes from publish and restore actions, including prepared writes when the portal API is unavailable.</p></div></div><div className="portal-section-list">{latestCommits.length ? latestCommits.map((write) => <article key={`${write.id ?? write.contentFilePath}-${write.createdAt ?? write.status}`}><div><div className="portal-section-title-row"><strong>{write.contentFilePath ?? 'Content write'}</strong><span>{write.apiResult?.ok ? 'Committed' : write.status ?? 'Prepared'}</span></div><p>{write.apiResult?.message ?? 'Git metadata recorded by the portal.'}</p><ul><li>Website: {getWebsiteName(write.websiteId)}</li><li>Commit: {write.apiResult?.commitSha ?? write.commitSha ?? 'Prepared only'}</li><li>Actor: {write.actorName ?? write.actor ?? 'Portal System'}</li></ul></div></article>) : <article><div><div className="portal-section-title-row"><strong>No commit records</strong><span>Waiting</span></div><p>Publish or restore a content change to record the first Git content write.</p></div></article>}</div></section>
        </div>
      </section>
    </main>
  );
}
