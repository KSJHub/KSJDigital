import fs from 'node:fs/promises'

const [hook, inspector, library, pageBuilder, imageControl, api, registry] = await Promise.all([
  fs.readFile('src/hooks/useComponentRegistry.js', 'utf8'),
  fs.readFile('src/components/ComponentPropertyInspector.jsx', 'utf8'),
  fs.readFile('src/components/RegistryBlockLibrary.jsx', 'utf8'),
  fs.readFile('src/pages/PageBuilderPage.jsx', 'utf8'),
  fs.readFile('src/components/VisualImageControl.jsx', 'utf8'),
  fs.readFile('src/services/api.js', 'utf8'),
  fs.readFile('shared/componentRegistry.js', 'utf8'),
])

const failures = []

if (!hook.includes('api.getComponents()')) failures.push('Component registry hook must load the authenticated registry API')
if (!hook.includes('component.capability')) failures.push('Component registry hook must filter components by website capability')
if (!hook.includes('if (capabilities == null) return components')) failures.push('Component registry hook must support unfiltered lookup for selected components')
if (!inspector.includes('resolvedDefinition.fields')) failures.push('Property inspector must render fields from the resolved registry definition')
if (!inspector.includes('useComponentRegistry(null)')) failures.push('Property inspector must resolve selected component definitions through the registry API')
if (!inspector.includes('componentsByType.get(component?.type) || definition')) failures.push('Property inspector must retain a bundled fallback when the live registry is unavailable')
for (const type of ['textarea', 'image', 'boolean', 'select', 'number', 'url', 'repeater']) {
  if (!inspector.includes(`field.type === '${type}'`)) failures.push(`Property inspector is missing ${type} field support`)
}
for (const marker of ['function RepeaterField', '＋ Add Item', 'Move item up', 'Move item down', 'Remove', 'updateItem(index, key, value)']) {
  if (!inspector.includes(marker)) failures.push(`Repeater editor is missing marker: ${marker}`)
}
for (const marker of ['async function resolveActiveWebsite()', 'async function uploadItemImage(index, key, file)', 'api.getWebsites()', 'api.uploadAsset(', 'pageBlocks.${component.id}.${field.key}.${index}.${key}', 'onUpload={file => uploadItemImage(index, key, file)}']) {
  if (!inspector.includes(marker)) failures.push(`Nested repeater media upload is missing marker: ${marker}`)
}
if (inspector.includes('Repeating items are managed in the website preview')) failures.push('Repeater fields must not fall back to the preview-only placeholder')
if (inspector.includes('Direct nested uploads are added in the next media slice')) failures.push('Repeater image fields must not remain URL-only')
if (!imageControl.includes("typeof onUpload === 'function'")) failures.push('Image controls without upload handlers must remain URL-editable and safe')
if (!library.includes('useComponentRegistry(capabilities)')) failures.push('Section library must consume the website-filtered component registry')
if (!library.includes('createComponentBlock(definition.type')) failures.push('Section library must create blocks through the shared registry factory')
if (!library.includes('groupComponents(filtered)')) failures.push('Section library must group registered components by category')
if (!library.includes('Search sections')) failures.push('Section library must provide component search')
if (!pageBuilder.includes("from '../components/RegistryBlockLibrary.jsx'")) failures.push('Page Builder must import the registry-driven section library')
if (!pageBuilder.includes("from '../components/ComponentPropertyInspector.jsx'")) failures.push('Page Builder must import the universal property inspector')
if (!pageBuilder.includes("from '../../shared/componentRegistry.js'")) failures.push('Page Builder must retain bundled component definitions as an outage fallback')
if (!pageBuilder.includes('<RegistryBlockLibrary')) failures.push('Page Builder must render the registry-driven section library')
if (!pageBuilder.includes('<ComponentPropertyInspector')) failures.push('Managed sections must render the universal property inspector')
if (!pageBuilder.includes('capabilities={capabilities}')) failures.push('Page Builder must filter available sections using website capabilities')
if (!pageBuilder.includes('async function addBlock(block, definition)')) failures.push('Page Builder must accept blocks created by the shared registry')
if (!pageBuilder.includes('function updateSelectedBlockField(fieldKey, value)')) failures.push('Managed component fields must save through the Page Builder content workflow')
if (!pageBuilder.includes('async function uploadSelectedBlockImage(fieldKey, file)')) failures.push('Managed component image fields must use the media upload workflow')
if (pageBuilder.includes('BLOCK_TEMPLATES')) failures.push('Page Builder must not contain a duplicated component catalogue')
if (pageBuilder.includes('templateBlock(')) failures.push('Page Builder must not contain a duplicated component defaults factory')
if (!api.includes('getComponents:')) failures.push('Frontend API must expose the component registry endpoint')
if (!registry.includes('createComponentBlock')) failures.push('Component defaults must remain owned by the shared registry')

if (failures.length) {
  console.error('Component inspector check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Component property inspector check passed.')
