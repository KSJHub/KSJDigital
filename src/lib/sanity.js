import { createClient } from '@sanity/client';

export const client = createClient({
  projectId: '4ph8qwbg',
  dataset: 'production',
  apiVersion: '2026-04-30',
  useCdn: true,
});
