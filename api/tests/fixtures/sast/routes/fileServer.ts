import path from 'path'
import { type Request, type Response } from 'express'

export function servePublicFiles () {
  return ({ params }: Request, res: Response) => {
    const file = params.file
    res.sendFile(path.resolve('ftp/', file))
  }
}

export function serveDirect (req: Request, res: Response) {
  res.sendFile(path.resolve('ftp/', req.params.file))
}

export function redirect (req: Request, res: Response) {
  res.redirect(req.query.to)
}
