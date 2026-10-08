import jwt from 'jsonwebtoken'
import cors from 'cors'

export function verifyToken (token: string, secret: string) {
  return jwt.verify(token, secret)   // no algorithms pinned
}

export function verifySafe (token: string, secret: string) {
  return jwt.verify(token, secret, { algorithms: ['HS256'] })
}

export const corsOptions = cors({ origin: '*', credentials: true })  // CORS misconfig

export function makeToken () {
  const sessionToken = Math.random()   // weak randomness for a secret
  return sessionToken
}
