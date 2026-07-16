import fs from 'node:fs/promises'

const [hook, inspector, api, registry] = await Promise.all([
  fs.readFile('src/hooks/useComponentRegistry.js', 'utf8'),
  fs.readFile('src/components/ComponentPropertyInspector.jsx', 'utf8'),
  fs.readFile('src/services/api.js', 'utf8'),
  fs.readFile('shared/componentRegistry.js', 'utf8'),
])

const failures = []

if (!hook.includes('api.getComponents()')) failures.push('Component registry hook must load the authenticated registry API')
if (!hook.includes('component.capability')) failures.push('Component registry hook must filter components by website capability')
if (!inspector.includes('definition.fields')) failures.push('Property inspector must render fields from component definitions')
for (const type of ['textarea', 'image', 'boolean', 'select', 'number', 'url', 'repeater']) {
  if (!inspector.includes(`field.type === '${type}'`)) failures.push(`Property inspector is missing ${type} field support`)
}
if (!api.includes('getComponents:')) failures.push('Frontend API must expose the component registry endpoint')
if (!registry.includes('createComponentBlock')) failures.push('Component defaults must remain owned by the shared registry')

if (failures.length) {
  console.error('Component inspector check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Component property inspector check passed.')
