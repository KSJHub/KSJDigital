import { AsyncLocalStorage } from 'node:async_hooks'

const loginStorage = new AsyncLocalStorage()

export function runVerifiedLogin(context, next) {
  return loginStorage.run(context, next)
}

export function currentVerifiedLogin() {
  return loginStorage.getStore() || null
}
