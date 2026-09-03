/**
 * お試し版（1 枚の HTML）の動作確認。
 * ファイルを直接開いた状態と、位置情報が使えない状態の両方で、
 * ゲームを最初から最後まで通せることを確かめる。
 */
import { chromium, devices } from 'playwright'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const FILE = pathToFileURL(path.resolve('demo/machi-poker-demo.html')).href
const checks = []
const check = (label, ok, detail = '') => {
  checks.push(ok)
  console.log(`${ok ? '  OK ' : '  NG '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
// 位置情報を許可しない状態（お試し版が置かれる環境に近い条件）
const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'ja-JP', permissions: [] })
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

await page.goto(FILE)
await page.waitForSelector('.tabbar', { timeout: 15_000 })
await page.waitForTimeout(1500)

check('ファイルを開くだけで起動する', (await page.locator('.marker').count()) > 3)
check('お試し版の案内が出る', (await page.locator('.notice--demo').count()) === 1)
check('位置情報が無くても現在地が置かれる', (await page.locator('.me').count()) === 1)
check('デバッグ機能は含まれない', (await page.locator('.debug').count()) === 0)

await page.getByRole('button', { name: /チャレンジを始める/ }).click()
await page.waitForSelector('.hud')

// 盤面は毎回抽選されるので、いま出ているカードを近い順に回る
const board = await page.evaluate(() =>
  [...document.querySelectorAll('.mapcanvas__item[data-lat]')]
    .map((el) => ({
      name: el.querySelector('.marker__name')?.textContent ?? '',
      lat: Number(el.getAttribute('data-lat')),
    }))
    .filter((entry) => entry.name),
)
check('盤面にカードが並ぶ', board.length >= 5, `${board.length} 枚`)

// 近い順に回る（重なったマーカーでも、近いものが手前に出る）
const route = board.slice(0, 5)
let walked = 0
for (const stop of route) {
  await page.locator(`.mapcanvas__item[data-lat="${stop.lat}"] .marker`).first().click()
  await page.waitForSelector('.sheet')
  await page.waitForTimeout(300)

  const walk = page.getByRole('button', { name: 'ここまで歩く' })
  if (await walk.count()) {
    await walk.click()
    walked += 1
    await page.getByRole('button', { name: '取得する' }).waitFor({ timeout: 12_000 })
    await page.waitForFunction(
      () => !document.querySelector('.sheet .btn')?.hasAttribute('disabled'),
      undefined,
      { timeout: 12_000 },
    )
  }
  await page.getByRole('button', { name: '取得する' }).click()
  await page.waitForTimeout(2100)
}

check('「ここまで歩く」で移動できる', walked >= 3, `${walked} / ${route.length} 回`)

await page.waitForSelector('.result', { timeout: 10_000 })
const resultText = await page.locator('.result').innerText()
const distanceText = (resultText.match(/移動距離\s*(\S+)/) ?? [])[1] ?? ''
check('移動距離が記録される', /[0-9]/.test(distanceText) && distanceText !== '0m', distanceText)
check('5 枚そろって結果画面へ進む', (await page.locator('.rcard').count()) === 5)
check('役と最終スコアが出る', /最終スコア/.test(resultText), resultText.split('\n')[1] ?? '')

await page.getByRole('button', { name: 'マップへ戻る' }).click()
await page.getByRole('button', { name: 'ランキング', exact: true }).click()
await page.waitForSelector('.ranklist', { timeout: 8_000 })
check('ランキングに記録が載る', (await page.locator('.rankrow--self').count()) === 1)

await page.getByRole('button', { name: '図鑑', exact: true }).click()
await page.waitForSelector('.wardlist')
check('図鑑に反映される', (await page.locator('.page-head__sub').innerText()).startsWith('5 / '))
check('図鑑が区ごとにまとまる', (await page.locator('.ward').count()) === 23)

// ファイルを直接開いた状態で、キーが断られたときの案内を確かめる
await page.getByRole('button', { name: 'ランキング', exact: true }).click()
await page.waitForSelector('.mecard')
await page.locator('.mecard').click()
await page.waitForSelector('.namerow')
check('地図の設定が入っている', (await page.getByLabel('Google マップのキー').count()) === 1)

await page.getByLabel('Google マップのキー').fill('AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7')
await page.getByRole('button', { name: '保存' }).nth(1).click()
await page.waitForTimeout(1800)
await page.getByRole('button', { name: 'マップ', exact: true }).click()
await page.waitForTimeout(1400)
await page.evaluate(() => {
  const handler = window.gm_authFailure
  if (typeof handler === 'function') handler()
})
await page.waitForTimeout(500)
const fileNotice = (await page.locator('.notice--warn').allInnerTexts()).join(' ').replace(/\n/g, ' ')
check(
  'ファイルを直接開いた場合の理由を示す',
  fileNotice.includes('ファイルを直接開いている'),
  fileNotice,
)
check('その状態でも簡易マップで遊べる', (await page.locator('.marker').count()) > 3)
await page.screenshot({ path: 'e2e-screenshots/demo-key-error.png' })

await page.screenshot({ path: 'e2e-screenshots/demo-01.png' })
check('JavaScript のエラーが出ていない', errors.length === 0, errors.slice(0, 2).join(' | '))

await browser.close()
console.log(`\n${checks.filter(Boolean).length} / ${checks.length} 件の確認に成功`)
