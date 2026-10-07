/*
 * Demo excerpt modeled on OWASP Juice Shop (MIT License), an intentionally
 * vulnerable application. Used only as Kinetix demo data.
 */

import { type Request, type Response, type NextFunction } from 'express'
import config from 'config'

import * as challengeUtils from '../lib/challengeUtils'
import { challenges, users } from '../data/datacache'
import { BasketModel } from '../models/basket'
import { UserModel } from '../models/user'
import * as security from '../lib/insecurity'
import * as models from '../models/index'
import * as utils from '../lib/utils'

export function login () {
  function afterLogin (user: { data: User, bid: number }, res: Response, next: NextFunction) {
    verifyPostLoginChallenges(user)
    BasketModel.findOrCreate({ where: { UserId: user.data.id } })
      .then(([basket]: [BasketModel, boolean]) => {
        const token = security.authorize(user)
        user.bid = basket.id
        security.authenticatedUsers.put(token, user)
        res.json({ authentication: { token, bid: basket.id, umail: user.data.email } })
      }).catch((error: Error) => {
        next(error)
      })
  }

  return (req: Request, res: Response, next: NextFunction) => {
    verifyPreLoginChallenges(req)
    models.sequelize.query(
      `SELECT * FROM Users WHERE email = '${req.body.email || ''}' AND password = '${security.hash(req.body.password || '')}' AND deletedAt IS NULL`,
      { model: UserModel, plain: true }
    )
      .then((authenticatedUser) => {
        const user = utils.queryResultToJson(authenticatedUser)
        if (user.data?.id && user.data.totpSecret !== '') {
          res.status(401).json({ status: 'totp_token_required' })
        } else if (user.data?.id) {
          afterLogin(user, res, next)
        } else {
          res.status(401).send(res.__('Invalid email or password.'))
        }
      }).catch((error: Error) => {
        next(error)
      })
  }
}
