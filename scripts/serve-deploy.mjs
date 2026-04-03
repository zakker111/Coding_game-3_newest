import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '..')
const deployRoot = path.join(repoRoot, 'deploy')

function parseArgs(argv) {
  let host = '127.0.0.1'
  let port = 8787

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--host' && argv[i + 1]) {
      host = argv[++i]
    } else if (a.startsWith('--host=')) {
      host = a.slice('--host='.length)
    } else if (a === '--port' && argv[i + 1]) {
      port = Number(argv[++i])
    } else if (a.startsWith('--port=')) {
      port = Number(a.slice('--port='.length))
    }
  }

  if (!Number.isFinite(port) || port <= 0) port = 8787

  return { host, port }
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.map':
      return 'application/json; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.txt':
      return 'text/plain; charset=utf-8'
    case '.md':
      return 'text/markdown; charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}

function respond(res, statusCode, body, headers = {}) {
  res.statusCode = statusCode
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
  if (body == null) return res.end()
  res.end(body)
}

const { host, port } = parseArgs(process.argv.slice(2))

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.method) return respond(res, 400, 'Bad Request')

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return respond(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' })
  }

  const url = new URL(req.url, `http://${req.headers.host || host}`)

  // URL pathname is always posix-style.
  const pathname = decodeURIComponent(url.pathname)

  // Redirect "directory without trailing slash" → "directory/".
  // This matters because relative module imports resolve differently without the slash.
  const candidatePath = path.resolve(deployRoot, `.${pathname}`)
  if (!candidatePath.startsWith(deployRoot)) {
    return respond(res, 403, 'Forbidden')
  }

  const stat = await fs.stat(candidatePath).catch(() => null)
  if (stat?.isDirectory() && !pathname.endsWith('/')) {
    const location = `${pathname}/${url.search}`
    return respond(res, 301, null, { Location: location })
  }

  let filePath = candidatePath
  let fileStat = stat

  if (fileStat?.isDirectory()) {
    filePath = path.join(filePath, 'index.html')
    fileStat = await fs.stat(filePath).catch(() => null)
  }

  if (!fileStat?.isFile()) {
    return respond(res, 404, 'Not Found')
  }

  const headers = {
    'Content-Type': contentTypeFor(filePath),
    'Cache-Control': 'no-cache',
  }

  if (req.method === 'HEAD') {
    headers['Content-Length'] = String(fileStat.size)
    return respond(res, 200, null, headers)
  }

  const buf = await fs.readFile(filePath)
  headers['Content-Length'] = String(buf.length)
  return respond(res, 200, buf, headers)
})

server.listen(port, host, () => {
  console.log(`Serving ${path.relative(repoRoot, deployRoot)} at http://${host}:${port}/`) // eslint-disable-line no-console
  console.log(`Workshop: http://${host}:${port}/workshop/`) // eslint-disable-line no-console
})
