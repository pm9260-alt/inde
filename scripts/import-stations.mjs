#!/usr/bin/env node
/**
 * 駅・地名データの取り込み。
 *
 * 東京 23 区の収録データを、公式データや全国データに置き換えるための道具です。
 *
 * 使い方:
 *   npm run import:stations -- <ファイル> [出力先]
 *
 * 例:
 *   npm run import:stations -- data/stations.csv
 *   npm run import:stations -- data/stations.geojson src/data/stations.generated.ts
 *
 * 受け取れる形式:
 *   1) CSV  … 1 行目が見出し。次の列があれば読み取ります（日本語・英語どちらでも可）
 *        駅名 / 名称 / name          … 地名（必須）
 *        緯度 / lat / latitude       … 緯度（必須）
 *        経度 / lng / lon / longitude … 経度（必須）
 *        都道府県 / prefecture       … 省略可
 *        市区町村 / 市区郡 / municipality … 省略可
 *   2) GeoJSON … FeatureCollection。各 feature の properties から上と同じ名前を探します。
 *        座標は Point / LineString / MultiLineString に対応（線の場合は中間点を使います）。
 *
 * 出力したファイルを使うには、src/data/stations.ts の PLACE_SOURCES を
 * 生成ファイルの読み込みに差し替えてください。
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const COLUMN_ALIASES = {
  name: ['駅名', '名称', '地名', 'name', 'station', 'station_name', 'S12_001'],
  lat: ['緯度', 'lat', 'latitude', 'y'],
  lng: ['経度', 'lng', 'lon', 'long', 'longitude', 'x'],
  prefecture: ['都道府県', '県名', 'prefecture', 'pref'],
  municipality: ['市区町村', '市区郡', '区市町村', '市町村', 'municipality', 'city', 'ward'],
}

function pick(row, key) {
  for (const alias of COLUMN_ALIASES[key]) {
    if (row[alias] !== undefined && String(row[alias]).trim() !== '') return String(row[alias]).trim()
  }
  return ''
}

/** 引用符に対応した最小限の CSV 解析 */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  const source = text.replace(/^﻿/, '')

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i += 1
        } else quoted = false
      } else field += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') field += char
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const header = rows.shift()
  if (!header) return []
  return rows
    .filter((values) => values.some((value) => value.trim() !== ''))
    .map((values) => Object.fromEntries(header.map((key, index) => [key.trim(), values[index] ?? ''])))
}

/** GeoJSON の geometry から代表点を取り出す */
function representativePoint(geometry) {
  if (!geometry) return null
  if (geometry.type === 'Point') return geometry.coordinates
  if (geometry.type === 'LineString') {
    const line = geometry.coordinates
    return line[Math.floor(line.length / 2)] ?? null
  }
  if (geometry.type === 'MultiLineString') {
    const line = geometry.coordinates[0] ?? []
    return line[Math.floor(line.length / 2)] ?? null
  }
  if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates[0] ?? []
    if (ring.length === 0) return null
    const sum = ring.reduce((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0])
    return [sum[0] / ring.length, sum[1] / ring.length]
  }
  return null
}

function normalizeName(rawName) {
  return rawName
    .replace(/\s+/g, '')
    .replace(/駅$/, '')
    .replace(/\(.*?\)|（.*?）/g, '')
}

async function loadRecords(filePath) {
  const text = await readFile(filePath, 'utf8')
  if (path.extname(filePath).toLowerCase() === '.csv') {
    return parseCsv(text).map((row) => ({
      name: pick(row, 'name'),
      lat: Number(pick(row, 'lat')),
      lng: Number(pick(row, 'lng')),
      prefecture: pick(row, 'prefecture'),
      municipality: pick(row, 'municipality'),
    }))
  }

  const json = JSON.parse(text)
  const features = Array.isArray(json) ? json : (json.features ?? [])
  return features.map((feature) => {
    const properties = feature.properties ?? feature
    const point = representativePoint(feature.geometry)
    return {
      name: pick(properties, 'name'),
      lat: point ? Number(point[1]) : Number(pick(properties, 'lat')),
      lng: point ? Number(point[0]) : Number(pick(properties, 'lng')),
      prefecture: pick(properties, 'prefecture'),
      municipality: pick(properties, 'municipality'),
    }
  })
}

function buildFile(records) {
  const lines = records.map(
    (record) =>
      `  { id: ${JSON.stringify(record.id)}, name: ${JSON.stringify(record.name)}, prefecture: ${JSON.stringify(
        record.prefecture,
      )}, municipality: ${JSON.stringify(record.municipality)}, lat: ${record.lat}, lng: ${record.lng} },`,
  )
  return `/**
 * 自動生成ファイル。手で書き換えないでください。
 * 生成コマンド: npm run import:stations
 * 生成日時: ${new Date().toISOString()}
 * 件数: ${records.length}
 */
import type { PlaceSource } from '@/domain/types'

export const IMPORTED_PLACE_SOURCES: readonly PlaceSource[] = [
${lines.join('\n')}
]
`
}

async function main() {
  const [input, output = 'src/data/stations.generated.ts'] = process.argv.slice(2)
  if (!input) {
    console.error('取り込むファイルを指定してください。例: npm run import:stations -- data/stations.csv')
    process.exit(1)
  }

  const raw = await loadRecords(input)
  const seen = new Set()
  const records = []
  let skipped = 0

  for (const record of raw) {
    const name = normalizeName(record.name ?? '')
    if (!name || !Number.isFinite(record.lat) || !Number.isFinite(record.lng)) {
      skipped += 1
      continue
    }
    if (Math.abs(record.lat) > 90 || Math.abs(record.lng) > 180) {
      skipped += 1
      continue
    }
    const prefecture = record.prefecture || ''
    const municipality = record.municipality || ''
    const id = `${prefecture}-${municipality}-${name}`.replace(/^-+|-+$/g, '') || name
    if (seen.has(id)) {
      skipped += 1
      continue
    }
    seen.add(id)
    records.push({
      id,
      name,
      prefecture,
      municipality,
      lat: Math.round(record.lat * 1e6) / 1e6,
      lng: Math.round(record.lng * 1e6) / 1e6,
    })
  }

  if (records.length === 0) {
    console.error('取り込める行が見つかりませんでした。列の見出しを確認してください。')
    process.exit(1)
  }

  await writeFile(output, buildFile(records), 'utf8')
  console.log(`${records.length} 件を ${output} に書き出しました（読み飛ばし ${skipped} 件）`)
  console.log('src/data/stations.ts の PLACE_SOURCES を、このファイルの読み込みに差し替えてください。')
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exit(1)
})
