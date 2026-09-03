/**
 * お試し版（デモ）のビルド。
 *
 * 通常のビルド結果を 1 枚の HTML にまとめる。
 * サーバーも設定も要らず、ファイルを開くだけで遊べる状態にする。
 *
 * 使い方: npm run build:demo
 */
import { spawnSync } from 'node:child_process'
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const OUT_DIR = 'demo'
/** そのまま開ける完全な HTML */
const OUT_FILE = path.join(OUT_DIR, 'machi-poker-demo.html')
/** head と body を外側が用意する場所（Artifact など）へ貼るための断片 */
const OUT_FRAGMENT = path.join(OUT_DIR, 'machi-poker-demo.fragment.html')

const build = spawnSync(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'build', '--outDir', 'dist-demo', '--emptyOutDir'],
  { stdio: 'inherit', env: { ...process.env, VITE_DEMO_MODE: 'on' } },
)
if (build.status !== 0) process.exit(build.status ?? 1)

const assetsDir = 'dist-demo/assets'
const files = await readdir(assetsDir)
const jsFile = files.find((name) => name.endsWith('.js'))
const cssFile = files.find((name) => name.endsWith('.css'))
if (!jsFile || !cssFile) {
  console.error('ビルド結果が見つかりませんでした')
  process.exit(1)
}

const js = await readFile(path.join(assetsDir, jsFile), 'utf8')
const css = await readFile(path.join(assetsDir, cssFile), 'utf8')

// </script> がスクリプト内に現れると HTML が途中で切れるため、安全に書き換える
const safeJs = js.replace(/<\/script>/gi, '<\\/script>')

const body = `<title>街ポーカー</title>
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${safeJs}
</script>
`

// スマートフォンで正しい幅にするための指定。これが無いと文字が小さくなる。
const standalone = `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
<meta name="theme-color" content="#ffffff" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="街ポーカー" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%23101214'/%3E%3Ctext x='16' y='22' font-size='17' font-family='sans-serif' font-weight='700' fill='%23fff' text-anchor='middle'%3E街%3C/text%3E%3C/svg%3E" />
<style>html,body,#root{height:100%;margin:0}</style>
</head>
<body>
${body}</body>
</html>
`

await mkdir(OUT_DIR, { recursive: true })
await writeFile(OUT_FILE, standalone, 'utf8')
await writeFile(OUT_FRAGMENT, body, 'utf8')
console.log(`${OUT_FILE} を作りました（${(Buffer.byteLength(standalone) / 1024).toFixed(0)} KB）`)
console.log(`${OUT_FRAGMENT} を作りました（貼り付け用）`)
