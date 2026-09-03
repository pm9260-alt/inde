/**
 * 実ブラウザでの通し確認。
 *
 * 位置情報を差し替えながら、
 *   起動 → 周辺カード表示 → 30分チャレンジ開始 → 移動 → 取得 ×5
 *   → 役判定 → 結果画面 → ランキング → 図鑑
 * を実際に操作して確かめ、各段階のスクリーンショットを残す。
 *
 * 使い方: npm run e2e
 */
import { chromium, devices } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4173
const BASE = `http://127.0.0.1:${PORT}`
const SHOTS = 'e2e-screenshots'

/** 東西南北ルート（東京 → 西荻窪 → 南砂町 → 北品川 → 上野） */
const ROUTE = [
  { name: '東京', lat: 35.6812, lng: 139.7671 },
  { name: '西荻窪', lat: 35.7039, lng: 139.5994 },
  { name: '南砂町', lat: 35.6717, lng: 139.8294 },
  { name: '北品川', lat: 35.6222, lng: 139.7396 },
  { name: '上野', lat: 35.7141, lng: 139.7774 },
]

/** シートの外側（上部の余白）をタップして閉じる */
async function closeSheet(page) {
  await page.locator('.sheet-backdrop').click({ position: { x: 40, y: 60 } })
  await page.waitForSelector('.sheet', { state: 'detached' })
}

const checks = []
function check(label, ok, detail = '') {
  checks.push({ label, ok, detail })
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

async function waitForServer(url, timeoutMs = 40_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      /* まだ起動していない */
    }
    await sleep(300)
  }
  throw new Error('開発サーバーが起動しませんでした')
}

async function main() {
  await rm(SHOTS, { recursive: true, force: true })
  await mkdir(SHOTS, { recursive: true })

  // npx を挟むと停止時に子プロセスが残るため、vite を直接起動しプロセスグループごと止める。
  // --strictPort を付けて、ポートが使われていたら黙って別ポートへ逃げないようにする。
  const server = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'],
    { stdio: 'ignore', detached: true },
  )

  try {
    await waitForServer(BASE)

    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
    const context = await browser.newContext({
      ...devices['iPhone 13'],
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
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

    /* 1. 起動と周辺カードの表示 --------------------------------- */
    const markerCount = await page.locator('.marker').count()
    check('起動して周辺カードのマーカーが出る', markerCount > 3, `${markerCount} 件`)
    check('現在地が地図に出る', (await page.locator('.me').count()) === 1)
    await page.screenshot({ path: `${SHOTS}/01-map.png` })

    /* 2. マーカーをタップしてカード詳細 -------------------------- */
    await page.locator('.marker', { hasText: '東京' }).first().click()
    await page.waitForSelector('.sheet')
    await page.waitForTimeout(400)
    const sheetText = await page.locator('.sheet').innerText()
    check('カード詳細に地名・所在地・距離が出る', /東京[\s\S]*東京都[\s\S]*現在地から/.test(sheetText))
    const disabledBeforeStart = await page.locator('.sheet .btn').isDisabled()
    check('ゲーム開始前は「取得する」が押せない', disabledBeforeStart)
    await page.screenshot({ path: `${SHOTS}/02-card-detail.png` })
    await closeSheet(page)

    /* 3. 30分チャレンジ開始 ------------------------------------- */
    await page.getByRole('button', { name: /チャレンジを始める/ }).click()
    await page.waitForSelector('.hud')
    const hudText = await page.locator('.hud').innerText()
    check('残り時間・枚数・暫定スコアが出る', /29:5\d|30:00/.test(hudText) && /0 \/ 5/.test(hudText))
    check('手札の空きスロットが 5 つ出る', (await page.locator('.handcard--empty').count()) === 5)
    check('開始直後は役予告を出さない', (await page.locator('.hint').count()) === 0)
    await page.screenshot({ path: `${SHOTS}/03-game-start.png` })

    /* 4. 実際に移動してカードを取得 ------------------------------ */
    for (const [index, stop] of ROUTE.entries()) {
      await context.setGeolocation({ latitude: stop.lat, longitude: stop.lng, accuracy: 8 })
      await page.waitForTimeout(600)

      await page.locator('.marker', { hasText: stop.name }).first().click()
      await page.waitForSelector('.sheet')
      const captureButton = page.locator('.sheet .btn')
      const enabled = await captureButton.isEnabled()
      check(`${stop.name} の圏内で「取得する」が押せる`, enabled)
      if (!enabled) {
        console.log(await page.locator('.sheet').innerText())
        break
      }
      await captureButton.click()

      if (index === 0) {
        await page.waitForSelector('.capture__card')
        check('取得演出がカード中央に出る', true)
        await page.screenshot({ path: `${SHOTS}/04-capture.png` })
      }
      await page.waitForTimeout(1100)

      if (index === 2) {
        const hints = await page.locator('.hint').allInnerTexts()
        check('役予告が出る', hints.some((text) => text.includes('北')), hints.join(' / '))
        await page.screenshot({ path: `${SHOTS}/05-hint.png` })
      }
    }

    /* 5. 5 枚そろって自動で結果へ ------------------------------- */
    await page.waitForSelector('.result', { timeout: 8000 })
    const resultText = await page.locator('.result').innerText()
    check('役が判定され結果画面に出る', resultText.includes('東西南北'))
    check('カード基礎点・倍率・最終スコアが出る', /カード基礎点[\s\S]*倍率[\s\S]*最終スコア/.test(resultText))
    check('移動距離とプレイ時間が出る', /移動距離[\s\S]*プレイ時間/.test(resultText))
    check('ランキング順位が出る', /ランキング順位/.test(resultText))
    check('取得した 5 枚が並ぶ', (await page.locator('.rcard').count()) === 5)
    await page.screenshot({ path: `${SHOTS}/06-result.png`, fullPage: true })

    await page.getByRole('button', { name: 'マップへ戻る' }).click()
    await page.waitForSelector('.tabbar')

    /* 6. ランキングへ反映 --------------------------------------- */
    await page.getByRole('button', { name: 'ランキング' }).click()
    await page.waitForSelector('.ranklist', { timeout: 8000 })
    check('自分の記録がランキングに載る', (await page.locator('.rankrow--self').count()) === 1)
    check('順位が表示される', (await page.locator('.page-head__sub').innerText()).includes('位'))
    const rankNotice = await page.locator('.notice__main').allInnerTexts()
    check('ランキングの案内文も 1 行に収まる', rankNotice.every((line) => !line.includes('\n')), rankNotice.join(' / '))
    await page.screenshot({ path: `${SHOTS}/07-ranking.png` })

    /* 7. 図鑑へ反映 --------------------------------------------- */
    await page.getByRole('button', { name: '図鑑' }).click()
    await page.waitForSelector('.dexgrid')
    const dexSub = await page.locator('.page-head__sub').innerText()
    check('図鑑に 5 種類が登録される', dexSub.startsWith('5 / '), dexSub)
    const unlocked = await page.locator('.dexcell:not(.dexcell--locked)').count()
    check('取得済みカードが未取得と区別される', unlocked === 5, `取得済み ${unlocked} 件`)
    await page.locator('.dexcell:not(.dexcell--locked)').first().click()
    await page.waitForSelector('.sheet')
    await page.waitForTimeout(400)
    const dexDetail = await page.locator('.sheet').innerText()
    check('図鑑の詳細に初取得日・取得回数・最高得点が出る', /初取得日[\s\S]*取得回数[\s\S]*最高得点/.test(dexDetail))
    await page.screenshot({ path: `${SHOTS}/08-dex.png` })
    await closeSheet(page)

    /* 7-2. 地図の設定（キーの保存と解除） ------------------------ */
    await page.getByRole('button', { name: 'プロフィール' }).click()
    await page.waitForSelector('.namerow')
    const mapRow = page.locator('.metarow', { hasText: 'いまの地図' })
    check('地図の設定が出る', (await mapRow.innerText()).includes('簡易マップ'))

    const SAMPLE_KEY = 'AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7'
    await page.getByLabel('Google マップのキー').fill('みじかすぎるキー')
    await page.getByRole('button', { name: '保存' }).nth(1).click()
    check('形の違うキーは弾いて案内する', (await page.locator('.footnote').first().innerText()).includes('形が違う'))

    await page.getByLabel('Google マップのキー').fill(SAMPLE_KEY)
    await page.getByRole('button', { name: '保存' }).nth(1).click()
    await page.waitForTimeout(1600)
    await page.getByRole('button', { name: 'プロフィール' }).click()
    await page.waitForSelector('.namerow')
    check(
      'キーを保存すると Google マップに切り替わる',
      (await page.locator('.metarow', { hasText: 'いまの地図' }).innerText()).includes('Google マップ'),
    )

    await page.getByRole('button', { name: 'マップ', exact: true }).click()
    await page.waitForTimeout(1500)
    check('読み込み中もすぐ遊べる（真っ白にならない）', (await page.locator('.marker').count()) > 3)
    check(
      '読み込み中だと分かる案内が出る',
      (await page.locator('.notice__main').allInnerTexts()).some((text) =>
        text.includes('読み込んでいます'),
      ),
    )

    await page.locator('.notice--warn').first().waitFor({ timeout: 20_000 })
    const keyErrorNotice = await page.locator('.notice--warn').allInnerTexts()
    check(
      '使えないキーでも落ちずに案内へ切り替わる',
      keyErrorNotice.some((text) => text.includes('Google マップを表示できませんでした')),
      keyErrorNotice.join(' / ').replace(/\n/g, ' '),
    )
    check('そのあとも簡易マップで遊べる', (await page.locator('.marker').count()) > 3)

    await page.getByRole('button', { name: 'プロフィール' }).click()
    await page.waitForSelector('.namerow')
    await page.getByRole('button', { name: 'キーを削除して簡易マップに戻す' }).click()
    await page.waitForTimeout(1600)
    await page.getByRole('button', { name: 'プロフィール' }).click()
    await page.waitForSelector('.namerow')
    check(
      'キーを削除すると簡易マップに戻る',
      (await page.locator('.metarow', { hasText: 'いまの地図' }).innerText()).includes('簡易マップ'),
    )

    /* 8. プロフィールへ反映 ------------------------------------- */
    await page.getByRole('button', { name: 'プロフィール' }).click()
    await page.waitForSelector('.namerow')
    const profileText = await page.locator('.screen').innerText()
    check('総プレイ数・最高得点・取得カード数が出る', /総プレイ数[\s\S]*1 回/.test(profileText))
    await page.screenshot({ path: `${SHOTS}/09-profile.png` })

    /* 9. 再読み込みしても記録が残る ------------------------------ */
    await page.reload()
    await page.getByRole('button', { name: 'プロフィール' }).click()
    await page.waitForSelector('.namerow')
    check('再起動しても記録が残る', (await page.locator('.screen').innerText()).includes('1 回'))

    /* 10. 位置情報を拒否されても壊れない ------------------------- */
    const denied = await browser.newContext({ ...devices['iPhone 13'], locale: 'ja-JP', permissions: [] })
    const deniedPage = await denied.newPage()
    await deniedPage.goto(BASE)
    await deniedPage.waitForSelector('.tabbar')
    await deniedPage.waitForTimeout(2500)
    const noticeVisible = await deniedPage.locator('.notice--warn').count()
    check('位置情報を拒否されても案内が出て動き続ける', noticeVisible >= 1)
    check('拒否されてもクラッシュしない', (await deniedPage.locator('.tabbar').count()) === 1)
    check(
      '現在地が無いときは開始ボタンを押せない',
      await deniedPage.getByRole('button', { name: /チャレンジを始める/ }).isDisabled(),
    )
    const noticeLines = await deniedPage.locator('.notice__main').allInnerTexts()
    check('案内文が 1 行に収まる', noticeLines.every((line) => !line.includes('\n')), noticeLines.join(' / '))
    await deniedPage.screenshot({ path: `${SHOTS}/10-denied.png` })
    await denied.close()

    check('JavaScript のエラーが出ていない', errors.length === 0, errors.slice(0, 3).join(' | '))

    await browser.close()
  } finally {
    stopServer(server)
  }

  const failed = checks.filter((entry) => !entry.ok)
  console.log(`\n${checks.length - failed.length} / ${checks.length} 件の確認に成功`)
  if (failed.length > 0) {
    console.log('失敗:', failed.map((entry) => entry.label).join(', '))
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
