import axios from 'axios'
import handlebars from 'handlebars'
import _ from 'lodash'
import { type Request, type Response } from 'express'

export function fetchUrl (req: Request, res: Response) {
  const url = req.query.url
  void axios.get(url)                       // SSRF
}

export function renderTemplate (req: Request, res: Response) {
  const tpl = req.body.template
  const compiled = handlebars.compile(tpl)  // SSTI
  res.send(compiled({}))
}

export function reflect (req: Request, res: Response) {
  res.send('<h1>' + req.query.name + '</h1>') // reflected XSS
}

export function lookup (req: Request, res: Response) {
  const q = req.body.filter
  void User.find(q)                          // NoSQL injection
}

export function mergeConfig (req: Request, res: Response) {
  _.merge({}, req.body)                      // prototype pollution
}

export function search (req: Request, res: Response) {
  const re = new RegExp(req.query.pattern)   // ReDoS
  return re.test('x')
}

export function safeFetch (req: Request, res: Response) {
  void axios.get('https://api.internal/health')   // constant, not tainted
}
