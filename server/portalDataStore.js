import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { initialPortalData } from '../src/portals/data/portalData.js';

const DEFAULT_DATA_DIR = path.join(process.cwd(), 'server', 'data');
const DATA_DIR = process.env.PORTAL_DATA_DIR || DEFAULT_DATA_DIR;
const DATA_FILE = process.env.PORTAL_DATA_FILE || path.join(DATA_DIR, 'portalData.json');

const LEGACY_EMAIL_REPLACEMENTS = {
  'ksj@ksjdigital.co.uk': 'enquiries@ksjdigital.co.uk',
  'media@ksjdigital.co.uk': 'enquiries@ksjdigital.co.uk',
};

const CONTACT_EMAILS = {
  enquiries: 'enquiries@ksjdigital.co.uk',
  support: 'support@ksjdigital.co.uk',
  billing: 'billing@ksjdigital.co.uk',
  gaming: 'gaming@ksjdigital.co.uk',
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function ensureDataDir() {
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
}

function replaceLegacyEmail(email) {
  const cleanEmail = String(email ?? '').trim().toLowerCase();
  return LEGACY_EMAIL_REPLACEMENTS[cleanEmail] ?? cleanEmail;
}

function migratePortalData(data) {
  const nextData = clone(data ?? initialPortalData);

  nextData.meta = {
    ...(nextData.meta ?? {}),
    storageMode: 'server-json',
    sourceOfTruth: 'server/data/portalData.json',
  };

  nextData.users = (nextData.users ?? []).map((user) => ({
    ...user,
    email: replaceLegacyEmail(user.email),
  }));

  if (nextData.content?.ksjdigital?.contact?.live) {
    nextData.content.ksjdigital.contact.live = {
      ...nextData.content.ksjdigital.contact.live,
      email: replaceLegacyEmail(nextData.content.ksjdigital.contact.live.email) || CONTACT_EMAILS.enquiries,
      supportEmail: replaceLegacyEmail(nextData.content.ksjdigital.contact.live.supportEmail) || CONTACT_EMAILS.support,
    };
  }

  if (nextData.content?.twotonetaj?.contact?.live) {
    nextData.content.twotonetaj.contact.live = {
      ...nextData.content.twotonetaj.contact.live,
      publicEmail: replaceLegacyEmail(nextData.content.twotonetaj.contact.live.publicEmail) || CONTACT_EMAILS.enquiries,
    };
  }

  nextData.settings = {
    ...(nextData.settings ?? {}),
    contactEmails: {
      ...(nextData.settings?.contactEmails ?? {}),
      ...CONTACT_EMAILS,
    },
  };

  nextData.deploymentQueue = nextData.deploymentQueue ?? [];
  nextData.deploymentHistory = nextData.deploymentHistory ?? [];
  nextData.backups = nextData.backups ?? [];
  nextData.activityLogs = nextData.activityLogs ?? [];
  nextData.notifications = nextData.notifications ?? [];

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
