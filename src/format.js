const crypto = require('crypto')
const path = require('path')

/** 与 rename-file 一致：用于清理 {origin} 中的非法文件名字符 */
const UNSAFE_NAME_CHARS = /[\\/:<>|"'*?$#&@()\[\]^~]+/g

function pad (value) {
  return (value < 10 ? '0' : '') + value
}

function getHash (item) {
  let buffer = item.buffer
  if (!buffer && item.base64Image) {
    buffer = Buffer.from(item.base64Image.replace(/^data:[^;]+;base64,/, ''), 'base64')
  }
  if (!buffer) return ''
  return crypto.createHash('md5').update(buffer).digest('hex')
}

/**
 * 按 rename-file 的模板语法渲染文件名/相对路径。
 * 支持的占位符：{y} {m} {d} {h} {i} {s} {ms} {timestamp} {hash} {origin} {rand[:count]} {localFolder[:count]}
 * @param {{ format: string, item: object, index: number, inputPath?: unknown, now?: Date }} options
 * @returns {string}
 */
function renderFormat ({ format, item, index, inputPath, now = new Date() }) {
  const dateValues = {
    y: now.getFullYear(),
    m: now.getMonth() + 1,
    d: now.getDate(),
    h: now.getHours(),
    i: now.getMinutes(),
    s: now.getSeconds(),
    ms: String(now.getTime()).slice(-3),
    timestamp: String(now.getTime()).slice(0, -3)
  }
  const originName = item.fileName || ''

  let rendered = format
    .trim()
    .replace(/{(y|m|d|h|i|s|ms|timestamp)}/gi, (match, key) => {
      const value = dateValues[key.toLowerCase()]
      if (value === undefined) return match
      return typeof value === 'number' ? pad(value) : value
    })
    // 本地目录层级，如 {localFolder:2} => 原文件路径的最后两级目录
    .replace(/{(localFolder:?(\d+)?)}/gi, (match, _key, count) => {
      if (typeof inputPath !== 'string' || !inputPath) return ''
      const level = Math.max(1, Number(count) || 1)
      const dirs = path.dirname(inputPath).split(path.sep)
      return dirs.slice(-level).join('/').replace(/:/g, '')
    })
    // 随机字符串，如 {rand:6}
    .replace(/{(rand:?(\d+)?)}/gi, (_match, _key, count) => {
      const length = Math.min(Math.max(1, Number(count) || 6), 32)
      return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length)
    })
    // 原名、MD5，以及其他未知占位符（保持 rename-file 的行为：原样输出 key）
    .replace(/{(hash|origin|\w+)}/gi, (_match, key) => {
      const lowerKey = key.toLowerCase()
      if (lowerKey === 'origin') {
        const dotIndex = originName.lastIndexOf('.')
        const baseName = dotIndex > 0 ? originName.slice(0, dotIndex) : originName
        return baseName.replace(UNSAFE_NAME_CHARS, '-')
      }
      if (lowerKey === 'hash') {
        return getHash(item)
      }
      return key
    })
    // 合并多余的斜杠
    .replace(/\/+/g, '/')

  // 以 / 结尾表示“只指定目录”，文件名使用序号，与 rename-file 行为一致
  if (rendered.endsWith('/')) {
    rendered += index
  }

  return rendered + (item.extname || '')
}

/** 把渲染结果拆成目录与文件名两部分 */
function splitRendered (rendered) {
  const normalized = rendered.replace(/^\/+/, '')
  const slashIndex = normalized.lastIndexOf('/')
  if (slashIndex === -1) {
    return { dir: '', name: normalized, full: normalized }
  }
  return {
    dir: normalized.slice(0, slashIndex),
    name: normalized.slice(slashIndex + 1),
    full: normalized
  }
}

module.exports = {
  renderFormat,
  splitRendered
}
