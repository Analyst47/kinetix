import { type Request, type Response, type NextFunction } from 'express'
import crypto from 'crypto'

export function login () {
  return (req: Request, res: Response, next: NextFunction) => {
    models.sequelize.query(`SELECT * FROM Users WHERE email = '${req.body.email || ''}' AND deletedAt IS NULL`, { model: UserModel, plain: true })
      .then((user) => res.json(user))
  }
}

export function safeLogin () {
  return (req: Request, res: Response) => {
    models.sequelize.query('SELECT * FROM Users WHERE email = ?', { replacements: [req.body.email] })
  }
}

export const hash = (data: string) => crypto.createHash('md5').update(data).digest('hex')
