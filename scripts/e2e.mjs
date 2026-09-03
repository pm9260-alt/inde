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

    /* 1-2. 開始前に役が分かる ------------------------------------ */
    await page.getByRole('button', { name: '役', exact: true }).click()
    await page.waitForSelector('.chance, .footnote')
    const handsText = await page.locator('.screen').innerText()
    check('役タブに役の一覧が出る', /東西南北[\s\S]*×4\.0/.test(handsText))
    check('属性の意味が分かる', /三軒茶屋 → 3/.test(handsText) && /北品川 → 北/.test(handsText))
    const chanceCount = await page.locator('.chance').count()
    check('この周辺で狙えそうな役が出る', chanceCount > 0 && chanceCount <= 3, `${chanceCount} 件`)
    check('最適ルートまでは教えない', handsText.includes('どの駅へ行くかは自分で決めてください'))
    await page.screenshot({ path: `${SHOTS}/01b-hands.png` })
    await page.getByRole('button', { name: 'マップ', exact: true }).click()
    await page.waitForSelector('.mapcanvas')

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
    check(
      '開始直後は役予告を出さない',
      (await page.locator('.hint--close').count()) === 0 &&
        !(await page.locator('.hud__hints').innerText()).includes('あと'),
    )
    check('ゲーム中はタブを出さない', (await page.locator('.tabbar').count()) === 0)
    await page.locator('.hud__hands').click()
    await page.waitForSelector('.sheet')
    check('ゲーム中もマップから離れずに役を見られる', (await page.locator('.sheet').innerText()).includes('この盤面で狙える役'))
    await closeSheet(page)
    await page.screenshot({ path: `${SHOTS}/03-game-start.png` })

    /* 4. 実際に移動してカードを取得 ------------------------------ */
    // 盤面は毎回抽選されるので、いま出ているカードから 5 枚を順に回る
    const board = await page.evaluate(() =>
      [...document.querySelectorAll('.mapcanvas__item[data-lat]')]
        .map((el) => ({
          name: el.querySelector('.marker__name')?.textContent ?? '',
          ward: el.getAttribute('data-ward') ?? '',
          lat: Number(el.getAttribute('data-lat')),
          lng: Number(el.getAttribute('data-lng')),
        }))
        .filter((entry) => entry.name),
    )
    check('盤面にカードが並ぶ', board.length >= 5, `${board.length} 枚`)

    // アプリ自身が示す「この盤面で狙える役」を読み、その役が成立する順路を組む。
    // 盤面は毎回抽選されるため、決め打ちのルートでは役が成立しないことがある。
    await page.locator('.hud__hands').click()
    await page.waitForSelector('.sheet')
    const topChance = (await page.locator('.sheet .handcond').first().innerText().catch(() => '')) || ''
    await closeSheet(page)
    check('盤面に狙える役が示される', topChance.length > 0, topChance)

    const kanjiMatch = topChance.match(/「(.)」/)
    const wardMatch = topChance.match(/^(.+?区)に/)
    let priority = []
    if (kanjiMatch) {
      priority = board.filter((entry) => entry.name.includes(kanjiMatch[1]))
    } else if (wardMatch) {
      priority = board.filter((entry) => entry.ward === wardMatch[1])
    }
    const stops = [...priority, ...board.filter((entry) => !priority.includes(entry))]

    let captured = 0
    let sawHandEffect = false
    for (const stop of stops) {
      if (captured >= 5) break
      await context.setGeolocation({ latitude: stop.lat, longitude: stop.lng, accuracy: 8 })
      await page.waitForTimeout(800)

      const marker = page.locator(`.mapcanvas__item[data-lat="${stop.lat}"] .marker`).first()
      if ((await marker.count()) === 0) continue
      await marker.click()
      await page.waitForSelector('.sheet')
      await page.waitForTimeout(250)
      const captureButton = page.locator('.sheet .btn').first()
      if (!(await captureButton.isEnabled())) {
        await closeSheet(page)
        continue
      }
      await captureButton.click()

      if (captured === 0) {
        await page.waitForSelector('.capture__card')
        check('取得演出がカード中央に出る', true)
        await page.screenshot({ path: `${SHOTS}/04-capture.png` })
      }
      await page.waitForTimeout(500)
      if ((await page.locator('.capture__hand').count()) > 0) sawHandEffect = true
      await page.waitForTimeout(1800)
      captured += 1

      if (captured === 3) {
        const hints = await page.locator('.hint').allInnerTexts()
        check('役予告が出る', hints.length > 0, hints.join(' / '))
        await page.screenshot({ path: `${SHOTS}/05-hint.png` })
      }
    }
    check('5 枚そろえられる', captured === 5, `${captured} 枚`)
    check('役が成立した瞬間の演出が出る', sawHandEffect)

    /* 5. 5 枚そろって自動で結果へ ------------------------------- */
    await page.waitForSelector('.result', { timeout: 8000 })
    const resultText = await page.locator('.result').innerText()
    const headline = await page.locator('.result__hand').innerText()
    const KNOWN_HANDS = [
      'ナンバーストレート', '山川', '東西南北', 'フォーカード', '動物園',
      'カラー', '同一区', 'スリー', 'ミックス', 'ペア', '役なし',
    ]
    check('役が判定され結果画面に出る', KNOWN_HANDS.includes(headline), headline)
    check('カード基礎点・倍率・最終スコアが出る', /カード基礎点[\s\S]*倍率[\s\S]*最終スコア/.test(resultText))
    check('移動距離とプレイ時間が出る', /移動距離[\s\S]*プレイ時間/.test(resultText))
    check('ランキング順位が出る', /ランキング順位/.test(resultText))
    check('取得した 5 枚が並ぶ', (await page.locator('.rcard').count()) === 5)
    check(
      '再挑戦がいちばん押しやすい場所にある',
      await page.getByRole('button', { name: 'もう一度この街で挑戦' }).isEnabled(),
    )
    await page.screenshot({ path: `${SHOTS}/06-result.png`, fullPage: true })

    await page.getByRole('button', { name: 'マップへ戻る' }).click()
    await page.waitForSelector('.tabbar')

    /* 6. ランキングへ反映 --------------------------------------- */
    await page.getByRole('button', { name: 'ランキング', exact: true }).click()
    await page.waitForSelector('.ranklist', { timeout: 8000 })
    check('自分の記録がランキングに載る', (await page.locator('.rankrow--self').count()) === 1)
    check('順位が表示される', (await page.locator('.page-head__sub').innerText()).includes('位'))
    const rankNotice = await page.locator('.notice__main').allInnerTexts()
    check('ランキングの案内文も 1 行に収まる', rankNotice.every((line) => !line.includes('\n')), rankNotice.join(' / '))
    await page.screenshot({ path: `${SHOTS}/07-ranking.png` })

    /* 7. 図鑑へ反映 --------------------------------------------- */
    await page.getByRole('button', { name: '図鑑', exact: true }).click()
    await page.waitForSelector('.wardlist')
    const dexSub = await page.locator('.page-head__sub').innerText()
    check('図鑑に 5 種類が登録される', dexSub.startsWith('5 / '), dexSub)
    check('区ごとにまとまっている', (await page.locator('.ward').count()) === 23)
    check('開く前はカードを並べない', (await page.locator('.dexcell').count()) === 0)
    await page.screenshot({ path: `${SHOTS}/08-dex.png` })

    const openedWard = page.locator('.ward__head').first()
    await openedWard.click()
    await page.waitForSelector('.dexcell')
    const lockedAttr = await page.locator('.dexcell--locked .dexcell__attr').first().innerText()
    check('未取得カードの属性は伏せる', lockedAttr === '？', lockedAttr)

    const anyOwned = page.locator('.dexcell:not(.dexcell--locked)')
    if ((await anyOwned.count()) === 0) {
      // 取得した駅が別の区にある場合はその区を開く
      for (let i = 0; i < (await page.locator('.ward__head').count()); i += 1) {
        await page.locator('.ward__head').nth(i).click()
        if ((await page.locator('.dexcell:not(.dexcell--locked)').count()) > 0) break
      }
    }
    check('取得済みカードが未取得と区別される', (await anyOwned.count()) > 0)
    await anyOwned.first().click()
    await page.waitForSelector('.sheet')
    await page.waitForTimeout(400)
    const dexDetail = await page.locator('.sheet').innerText()
    check('図鑑の詳細に初取得日・取得回数・最高得点が出る', /初取得日[\s\S]*取得回数[\s\S]*最高得点/.test(dexDetail))
    await page.screenshot({ path: `${SHOTS}/08b-dex-open.png` })
    await closeSheet(page)

    /* 7-2. 地図の設定（キーの保存と解除） ------------------------ */
    await page.getByRole('button', { name: 'ランキング', exact: true }).click()
    await page.waitForSelector('.mecard')
    await page.locator('.mecard').click()
    await page.waitForSelector('.namerow')
    const mapRow = page.locator('.metarow', { hasText: 'いまの地図' })
    check('地図の設定が出る', (await mapRow.innerText()).includes('簡易マップ'))

    const SAMPLE_KEY = 'AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7'
    await page.getByLabel('Google マップのキー').fill('みじかすぎるキー')
    await page.getByRole('button', { name: '保存' }).nth(1).click()
    check(
      '形の違うキーは弾いて案内する',
      (await page.locator('.screen--overlay').innerText()).includes('形が違う'),
    )

    await page.getByLabel('Google マップのキー').fill(SAMPLE_KEY)
    await page.getByRole('button', { name: '保存' }).nth(1).click()
    await page.waitForTimeout(1600)
    await page.getByRole('button', { name: 'ランキング', exact: true }).click()
    await page.locator('.mecard').click()
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

    // Google がキーを断ったときの動き（window.gm_authFailure が呼ばれる状況）を再現する
    await page.evaluate(() => {
      const handler = window.gm_authFailure
      if (typeof handler === 'function') handler()
    })
    await page.waitForTimeout(500)
    const authNotice = await page.locator('.notice--warn').allInnerTexts()
    check(
      'キーを断られたら日本語で理由を出す',
      authNotice.some((text) => text.includes('キーが使えませんでした')),
      authNotice.join(' / ').replace(/\n/g, ' '),
    )
    check('断られても簡易マップで遊べる', (await page.locator('.marker').count()) > 3)

    await page.getByRole('button', { name: 'ランキング', exact: true }).click()
    await page.locator('.mecard').click()
    await page.waitForSelector('.namerow')
    await page.getByRole('button', { name: 'キーを削除して簡易マップに戻す' }).click()
    await page.waitForTimeout(1600)
    await page.getByRole('button', { name: 'ランキング', exact: true }).click()
    await page.locator('.mecard').click()
    await page.waitForSelector('.namerow')
    check(
      'キーを削除すると簡易マップに戻る',
      (await page.locator('.metarow', { hasText: 'いまの地図' }).innerText()).includes('簡易マップ'),
    )

    /* 8. プロフィールへ反映 ------------------------------------- */
    const profileText = await page.locator('.screen--overlay').innerText()
    check('総プレイ数・最高得点・取得カード数が出る', /総プレイ数[\s\S]*1 回/.test(profileText))
    await page.screenshot({ path: `${SHOTS}/09-profile.png` })

    /* 9. 再読み込みしても記録が残る ------------------------------ */
    await page.reload()
    await page.getByRole('button', { name: 'ランキング', exact: true }).click()
    await page.waitForSelector('.mecard')
    check('再起動しても記録が残る', (await page.locator('.mecard').innerText()).includes('1 回'))

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
