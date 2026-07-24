import express from 'express'
import { listFieldTypes } from './services/fieldTypeRegistry.js'

function publicFieldType(fieldType) {
  return {
    id: fieldType.id,
    label: fieldType.label,
  }
}

export function createFieldRegistryRouter() {
  const router = express.Router()

  router.get('/', (req, res) => {
    const fieldTypes = listFieldTypes()
      .map(publicFieldType)
      .sort((left, right) => left.id.localeCompare(right.id))

    res.setHeader('Cache-Control', 'no-store')
    res.json({ fieldTypes })
  })

  return router
}
