#!/usr/bin/env node
// Offline unit-test runner for Wardni's pure logic (no database, no network, no Next build needed).
// Transpiles src/lib/wardni/*.ts with TypeScript (or @babel/core fallback), then runs tests/*.test.mjs with node:test.
import { createRequire } from 'node:module'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

let transpile
try {
  let ts
  try {
    ts = require('typescript')
  } catch {
    const g = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
    ts = require(path.join(g, 'typescript'))
  }
  transpile = (code, fileName) =>
    ts.transpileModule(code, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName,
    }).outputText
} catch {
  const sysReq = createRequire('/usr/share/nodejs/index.js')
  const babel = sysReq('@babel/core')
  const presetTs = sysReq('@babel/preset-typescript')
  const pluginCjs = sysReq('@babel/plugin-transform-modules-commonjs')
  transpile = (code, filename) =>
    babel.transformSync(code, {
      filename,
      presets: [presetTs],
      plugins: [pluginCjs],
    }).code
}

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'wardni-test-'))
fs.writeFileSync(path.join(out, 'package.json'), '{"type":"commonjs"}')
const srcDir = path.join(root, 'src/lib/wardni')
const skip = new Set(['engine.ts', 'http.ts', 'page-auth.ts']) // need Payload / Next at import time
for (const f of fs.readdirSync(srcDir).filter((f) => f.endsWith('.ts') && !skip.has(f))) {
  const code = fs.readFileSync(path.join(srcDir, f), 'utf8')
  fs.writeFileSync(path.join(out, f.replace(/\.ts$/, '.js')), transpile(code, f))
}
const files = fs.readdirSync(path.join(root, 'tests')).filter((f) => f.endsWith('.test.mjs')).map((f) => path.join(root, 'tests', f))
const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...files], {
  stdio: 'inherit',
  env: { ...process.env, WARDNI_BUILD: out },
})
process.exit(r.status ?? 1)
