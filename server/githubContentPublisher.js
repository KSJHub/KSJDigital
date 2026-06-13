const DEFAULT_BRANCH = 'main';

function requireConfig() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPO || process.env.GITHUB_REPOSITORY || 'KSJHub/KSJDigital';
  const branch = process.env.GITHUB_BRANCH || DEFAULT_BRANCH;

  if (!token) {
    throw new Error('Missing GITHUB_TOKEN environment variable.');
  }

  if (!repository.includes('/')) {
    throw new Error('GITHUB_REPO must use owner/name format.');
  }

  return { token, repository, branch };
}

function assertSafeContentPath(path) {
  if (!path || typeof path !== 'string') throw new Error('contentFilePath is required.');
  if (!path.startsWith('content/')) throw new Error('contentFilePath must stay inside the content/ folder.');
  if (!path.endsWith('.json')) throw new Error('contentFilePath must target a JSON file.');
  if (path.includes('..')) throw new Error('contentFilePath cannot contain path traversal.');
}

function getGitHubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

function encodeBase64(value) {
  return Buffer.from(value, 'utf8').toString('base64');
}

async function readExistingFile({ token, repository, branch, path }) {
  const url = `https://api.github.com/repos/${repository}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(url, { headers: getGitHubHeaders(token) });

  if (response.status === 404) return null;

  const body = await response.json();

  if (!response.ok) {
    throw new Error(body?.message || `GitHub read failed with status ${response.status}.`);
  }

  return body;
}

function createConflictError({ contentFilePath, expectedSha, actualSha }) {
  const error = new Error(`Content file conflict detected for ${contentFilePath}. Pull the latest content before publishing.`);
  error.code = 'CONTENT_FILE_CONFLICT';
  error.details = {
    contentFilePath,
    expectedSha,
    actualSha,
    message: 'The content file changed in GitHub after this portal draft was prepared. Publishing was blocked to avoid overwriting manual KSJ/client updates.',
  };
  return error;
}

function assertNoConflict({ preparedWrite, existingFile, contentFilePath }) {
  const expectedSha = preparedWrite?.baseFileSha || preparedWrite?.expectedFileSha || preparedWrite?.fileShaBeforeEdit;
  const actualSha = existingFile?.sha;

  if (!expectedSha) return;
  if (!actualSha) return;
  if (expectedSha !== actualSha) {
    throw createConflictError({ contentFilePath, expectedSha, actualSha });
  }
}

export async function getContentFileState(path) {
  const { token, repository, branch } = requireConfig();
  assertSafeContentPath(path);
  const existingFile = await readExistingFile({ token, repository, branch, path });

  return {
    ok: true,
    repository,
    branch,
    contentFilePath: path,
    exists: Boolean(existingFile),
    fileSha: existingFile?.sha ?? null,
    htmlUrl: existingFile?.html_url ?? null,
  };
}

export async function publishContentFile(preparedWrite) {
  const { token, repository, branch } = requireConfig();
  const contentFilePath = preparedWrite?.contentFilePath;
  const serialisedContent = preparedWrite?.serialisedContent;
  const commitMessage = preparedWrite?.commitMessage || `Publish content file ${contentFilePath}`;

  assertSafeContentPath(contentFilePath);

  if (!serialisedContent || typeof serialisedContent !== 'string') {
    throw new Error('serialisedContent is required.');
  }

  const existingFile = await readExistingFile({ token, repository, branch, path: contentFilePath });
  assertNoConflict({ preparedWrite, existingFile, contentFilePath });

  const url = `https://api.github.com/repos/${repository}/contents/${encodeURIComponent(contentFilePath).replace(/%2F/g, '/')}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: getGitHubHeaders(token),
    body: JSON.stringify({
      message: commitMessage,
      content: encodeBase64(serialisedContent),
      branch,
      sha: existingFile?.sha,
    }),
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(body?.message || `GitHub write failed with status ${response.status}.`);
  }

  return {
    ok: true,
    repository,
    branch,
    contentFilePath,
    baseFileSha: existingFile?.sha ?? null,
    commitSha: body?.commit?.sha,
    fileSha: body?.content?.sha,
    htmlUrl: body?.content?.html_url,
    message: 'Content file published to GitHub.',
  };
}
