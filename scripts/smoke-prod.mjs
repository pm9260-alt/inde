/**
 * 本番ビルドの動作確認。
 * 開発モードとは条件が違うため、ビルド後の実物でも一通り動くことを確かめる。
 */
import { chromium, devices } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4174
const BASE = `http://127.0.0.1:${PORT}`
const ROUTE = [
  { name: '東京', lat: 35.6812, lng: 139.7671 },
  { name: '西荻窪', lat: 35.7039, lng: 139.5994 },
  { name: '南砂町', lat: 35.6717, lng: 139.8294 },
  { name: '北品川', lat: 35.6222, lng: 139.7396 },
  { name: '上野', lat: 35.7141, lng: 139.7774 },
]

const checks = []
const check = (label, ok, detail = '') => {
  checks.push(ok)
  console.log(`${ok ? '  OK ' : '  NG '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
}

/** プロセスグループごと停止する（子の vite が残らないように） */
function stopServer(child) {
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

async function waitForServer(url) {
  const deadline = Date.now() + 40_000
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* まだ */
    }
    await sleep(300)
  }
  throw new Error('プレビューサーバーが起動しませんでした')
}

// npx を挟むと停止時に子プロセスが残るため、vite を直接起動しプロセスグループごと止める。
// --strictPort を付けて、ポートが使われていたら黙って別ポートへ逃げないようにする。
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'],
  { stdio: 'ignore', detached: true },
)

try {
  await waitForServer(BASE)
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    locale: 'ja-JP',
    permissions: ['geolocation'],
    geolocation: { latitude: ROUTE[0].lat, longitude: ROUTE[0].lng, accuracy: 8 },
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto(BASE)
  await page.waitForSelector('.tabbar')
  await page.waitForTimeout(1200)

  check('本番ビルドが起動する', (await page.locator('.marker').count()) > 3)
  check('デバッグ機能が表示されない', (await page.locator('.debug').count()) === 0)

  await page.getByRole('button', { name: /チャレンジを始める/ }).click()
  await page.waitForSelector('.hud')

  for (const stop of ROUTE) {
    await context.setGeolocation({ latitude: stop.lat, longitude: stop.lng, accuracy: 8 })
    await page.waitForTimeout(500)
    await page.locator('.marker', { hasText: stop.name }).first().click()
    await page.waitForSelector('.sheet')
    await page.locator('.sheet .btn').click()
    await page.waitForTimeout(1100)
  }

  await page.waitForSelector('.result', { timeout: 8000 })
  check('本番ビルドでも役が判定される', (await page.locator('.result').innerText()).includes('東西南北'))
  check('JavaScript のエラーが出ていない', errors.length === 0, errors.slice(0, 2).join(' | '))

  await browser.close()
} finally {
  stopServer(server)
}

console.log(`\n${checks.filter(Boolean).length} / ${checks.length} 件の確認に成功`)
