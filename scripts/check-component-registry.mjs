import fs from 'node:fs/promises'
import {
  COMPONENT_REGISTRY,
  COMPONENT_FIELD_TYPES,
  componentRenderer,
  validateComponentRegistry,
} from '../shared/componentRegistry.js'

const requiredTypes = ['text', 'image', 'cta', 'gallery', 'video', 'faq', 'products']
const errors = validateComponentRegistry()

for (const type of requiredTypes) {
  const definition = COMPONENT_REGISTRY.find(component => component.type === type)
  if (!definition) errors.push(`Missing required component type: ${type}`)
  else if (!definition.renderer) errors.push(`Missing renderer key for component type: ${type}`)
  else if (componentRenderer(type) !== definition.renderer) errors.push(`Renderer resolver mismatch for component type: ${type}`)
}

if (!COMPONENT_FIELD_TYPES.includes('repeater')) errors.push('Repeater field support is missing')

const contentService = await fs.readFile(new URL('../server/services/contentService.js', import.meta.url), 'utf8')
const contentRouter = await fs.readFile(new URL('../server/contentRouter.js', import.meta.url), 'utf8')
const apiClient = await fs.readFile(new URL('../src/services/api.js', import.meta.url), 'utf8')
const registrySource = await fs.readFile(new URL('../shared/componentRegistry.js', import.meta.url), 'utf8')

if (!contentService.includes('validateManagedPageBlocks')) errors.push('Content Service does not validate managed component blocks')
if (!contentRouter.includes("router.get('/components'")) errors.push('Component registry API route is missing')
if (!contentRouter.includes('const serialisable = { ...definition }')) errors.push('Component registry API must serialise definition metadata, including renderer keys')
if (!apiClient.includes("getComponents: () => request('/content/components')")) errors.push('Editor API client does not expose the component registry')
if (!registrySource.includes('export function componentRenderer(type)')) errors.push('Shared component renderer resolver is missing')
if (!registrySource.includes('has no registered renderer')) errors.push('Managed block validation must reject components without renderers')

if (errors.length) {
  console.error('Component registry check failed:')
  errors.forEach(error => console.error(`- ${error}`))
  process.exit(1)
}

console.log(`Component registry check passed (${COMPONENT_REGISTRY.length} components with renderer contracts).`)
