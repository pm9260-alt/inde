/**
 * 本番ビルドの動作確認。
 * 開発モードとは条件が違うため、ビルド後の実物でも一通り動くことを確かめる。
 */
import { chromium, devices } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4174
const BASE = `http://127.0.0.1:${PORT}`
const START = { lat: 35.6812, lng: 139.7671 }

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
    geolocation: { latitude: START.lat, longitude: START.lng, accuracy: 8 },
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

  // 盤面は毎回抽選されるので、いま出ているカードを回る
  const board = await page.evaluate(() =>
    [...document.querySelectorAll('.mapcanvas__item[data-lat]')]
      .map((el) => ({ lat: Number(el.getAttribute('data-lat')), lng: Number(el.getAttribute('data-lng')) }))
      .filter((entry) => Number.isFinite(entry.lat)),
  )
  check('本番ビルドでも盤面が抽選される', board.length >= 5, `${board.length} 枚`)

  let captured = 0
  for (const stop of board) {
    if (captured >= 5) break
    await context.setGeolocation({ latitude: stop.lat, longitude: stop.lng, accuracy: 8 })
    await page.waitForTimeout(700)
    const marker = page.locator(`.mapcanvas__item[data-lat="${stop.lat}"] .marker`).first()
    if ((await marker.count()) === 0) continue
    await marker.click()
    await page.waitForSelector('.sheet')
    await page.waitForTimeout(250)
    const button = page.locator('.sheet .btn').first()
    if (!(await button.isEnabled())) {
      await page.locator('.sheet-backdrop').click({ position: { x: 40, y: 60 } })
      continue
    }
    await button.click()
    await page.waitForTimeout(2100)
    captured += 1
  }

  await page.waitForSelector('.result', { timeout: 8000 })
  check('本番ビルドでも 5 枚そろえて結果へ進む', (await page.locator('.rcard').count()) === 5)
  check('本番ビルドでも役とスコアが出る', (await page.locator('.result').innerText()).includes('最終スコア'))
  check('JavaScript のエラーが出ていない', errors.length === 0, errors.slice(0, 2).join(' | '))

  await browser.close()
} finally {
  stopServer(server)
}

console.log(`\n${checks.filter(Boolean).length} / ${checks.length} 件の確認に成功`)
