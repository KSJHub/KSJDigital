import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { initialPortalData } from '../../src/portals/data/portalData.js';

const DEFAULT_DATA_DIR = path.join(process.cwd(), 'server', 'data');
const DATA_DIR = process.env.PORTAL_DATA_DIR || DEFAULT_DATA_DIR;
const DATA_FILE = process.env.PORTAL_DATA_FILE || path.join(DATA_DIR, 'portalData.json');

const DEFAULT_CONTACT_EMAILS = {
  main: 'ksj@ksjdigital.co.uk',
  enquiries: 'enquiries@ksjdigital.co.uk',
  support: 'support@ksjdigital.co.uk',
  billing: 'billing@ksjdigital.co.uk',
  twotonetaj: 'twotonetaj@ksjdigital.co.uk',
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function ensureDataDir() {
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
}

function ensureCoreArrays(data) {
  return {
    ...data,
    users: data.users ?? [],
    websites: data.websites ?? [],
    drafts: data.drafts ?? [],
    publishRequests: data.publishRequests ?? [],
    supportTickets: data.supportTickets ?? [],
    backups: data.backups ?? [],
    deploymentQueue: data.deploymentQueue ?? [],
    deploymentHistory: data.deploymentHistory ?? [],
    activityLogs: data.activityLogs ?? [],
    notifications: data.notifications ?? [],
  };
}

function ensureSettings(data) {
  return {
    ...data,
    settings: {
      ...(data.settings ?? {}),
      contactEmails: {
        ...DEFAULT_CONTACT_EMAILS,
        ...(data.settings?.contactEmails ?? {}),
      },
    },
  };
}

function ensureMeta(data) {
  return {
    ...data,
    meta: {
      ...(data.meta ?? {}),
      storageMode: 'server-json',
      sourceOfTruth: 'server/data/portalData.json',
    },
  };
}

function migratePortalData(data) {
  let nextData = clone(data ?? initialPortalData);

  nextData = ensureMeta(nextData);
  nextData = ensureCoreArrays(nextData);
  nextData = ensureSettings(nextData);

  return nextData;
}

export async function readPortalData() {
  await ensureDataDir();

  try {
    const rawData = await readFile(DATA_FILE, 'utf8');
    const parsedData = JSON.parse(rawData);
    const migratedData = migratePortalData(parsedData);

    await writePortalData(migratedData);

    return migratedData;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Unable to read central portal data. Recreating from seed.', error);
    }

    const seededData = migratePortalData(initialPortalData);

    await writePortalData(seededData);

    return seededData;
  }
}

export async function writePortalData(data) {
  await ensureDataDir();

  const nextData = migratePortalData(data);

  nextData.meta = {
    ...(nextData.meta ?? {}),
    updatedAt: new Date().toISOString(),
  };

  await writeFile(DATA_FILE, `${JSON.stringify(nextData, null, 2)}\n`, 'utf8');

  return nextData;
}

export function getPortalDataFilePath() {
  return DATA_FILE;
}
