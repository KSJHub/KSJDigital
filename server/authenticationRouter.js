import express from 'express'
import { completeMfaLogin } from './services/authenticationService.js'

export function createAuthenticationPublicRouter() {
  const router = express.Router()
  router.post('/api/login/mfa', (req, res, next) => {
    Promise.resolve(completeMfaLogin(req, res)).catch(next)
  })
  return router
}
