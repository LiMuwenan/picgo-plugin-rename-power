const { renderFormat, splitRendered } = require('./format')

const PLUGIN_NAME = 'picgo-plugin-rename-power'
const PLUGIN_ID = 'rename-power'
const RESTORE_KEY = Symbol('rename-power-restore')
const FAILED_EVENT = 'failed'

/** 同一图床的 path 状态，用于并发上传时共享原始 path 并在结束后还原 */
const pathStates = new Map()

function getUploaderType (ctx) {
  return ctx.getConfig('picBed.uploader') ||
    ctx.getConfig('picBed.current') ||
    undefined
}

function joinPath (base, dir) {
  const left = base.replace(/\/+$/g, '')
  const right = dir.replace(/^\/+/g, '')
  // 必须保留结尾的 /：PicGo 的 GitHub 等 uploader 直接拼接 path + fileName，
  // 少了分隔符会得到 images/2026/10hello.png 这类错误路径
  return left ? `${left}/${right}/` : `${right}/`
}

function acquirePathState (type, currentPath) {
  let state = pathStates.get(type)
  if (!state) {
    state = { base: currentPath, pending: 0 }
    pathStates.set(type, state)
  }
  state.pending += 1
  return state
}

function createRestore (ctx, type, state) {
  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    ctx.removeListener(FAILED_EVENT, restore)
    state.pending -= 1
    if (state.pending <= 0) {
      // 还原为上传前的 path，避免污染后续上传
      ctx.setConfig({ [`picBed.${type}.path`]: state.base })
      pathStates.delete(type)
    }
  }
  return restore
}

const beforeUploadPlugin = {
  // 注意：PicGo 的 beforeUploadPlugins 是并发（Promise.all）执行的。
  // 官方重命名插件 renameFn 也会写 item.fileName，所以开启官方重命名时本插件绝不能写 fileName，
  // 只通过图床 path 配置补充目录；关闭官方重命名时才由本插件接管 fileName。
  handle: async (ctx) => {
    const format = (ctx.getConfig(`${PLUGIN_NAME}.format`) || '').trim()
    const officialRename = Boolean(
      ctx.getConfig('settings.autoRename') || ctx.getConfig('settings.rename')
    )
    ctx.log.info(`[rename-power] handle: format="${format}", officialRename=${officialRename}`)
    if (!format) {
      ctx.log.info('[rename-power] format 为空，跳过处理')
      return ctx
    }

    if (!officialRename) {
      // 官方重命名未开启：完全接管文件名，行为与 rename-file 一致
      ctx.output.forEach((item, index) => {
        item.fileName = renderFormat({
          format,
          item,
          index,
          inputPath: ctx.input ? ctx.input[index] : undefined
        })
      })
      ctx.log.info(`[rename-power] 已改写文件名: ${ctx.output.map(item => item.fileName).join(', ')}`)
      return ctx
    }

    // 官方重命名已开启：文件名交给官方处理，插件只补充目录部分
    const uploaderType = getUploaderType(ctx)
    if (!uploaderType) return ctx

    const dirs = ctx.output
      .map((item, index) => splitRendered(renderFormat({
        format,
        item,
        index,
        inputPath: ctx.input ? ctx.input[index] : undefined
      })).dir)
      .filter(Boolean)

    if (dirs.length === 0) return ctx

    const dir = dirs[0]
    if (dirs.some(item => item !== dir)) {
      ctx.emit('notification', {
        title: 'rename-power 提示',
        body: '模板为本次上传的多张图片生成了不同目录，插件仅使用第一个目录。\n如需每张图片独立目录，请关闭官方「上传前重命名 / 时间戳重命名」。'
      })
      ctx.log.warn('[rename-power] multiple target dirs detected, using:', dir)
    }

    const pathKey = `picBed.${uploaderType}.path`
    const currentPath = ctx.getConfig(pathKey) || ''
    const state = acquirePathState(uploaderType, currentPath)
    const targetPath = joinPath(state.base, dir)
    ctx.setConfig({ [pathKey]: targetPath })
    ctx.log.info(`[rename-power] 官方重命名开启，临时修改 ${pathKey}: "${state.base}" -> "${targetPath}"`)

    const restore = createRestore(ctx, uploaderType, state)
    ctx[RESTORE_KEY] = restore
    ctx.once(FAILED_EVENT, restore)
    return ctx
  }
}

const afterUploadPlugin = {
  handle: async (ctx) => {
    const restore = ctx[RESTORE_KEY]
    if (restore) {
      restore()
      delete ctx[RESTORE_KEY]
    }
    return ctx
  }
}

function config (ctx) {
  const userConfig = ctx.getConfig(PLUGIN_NAME) || {}
  return [
    {
      name: 'format',
      type: 'input',
      alias: '文件(路径)格式',
      default: userConfig.format || '',
      message: '例如 images/{y}/{m}/{d}/{origin}；留空则关闭插件',
      required: false
    }
  ]
}

module.exports = (ctx) => {
  const register = () => {
    ctx.helper.beforeUploadPlugins.register(PLUGIN_ID, beforeUploadPlugin)
    ctx.helper.afterUploadPlugins.register(PLUGIN_ID, afterUploadPlugin)
  }
  return {
    register,
    config
  }
}
