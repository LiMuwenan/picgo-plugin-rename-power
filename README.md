# picgo-plugin-rename-power

PicGo 插件：上传图片前按模板重命名文件，并按模板生成上传目录，模板语法与 [picgo-plugin-rename-file](https://github.com/liuwave/picgo-plugin-rename-file) 完全一致。

- 未开启官方「上传前重命名 / 时间戳重命名」时：插件同时接管**文件名**和**目录**，行为与 rename-file 一致。
- 开启官方重命名时：**文件名交给官方处理**，插件只负责按模板补充**目录**，两者可同时生效。

## 示例

原图：`D:/images/test.png`，图床 `path` 配置为 `images`，插件 `format` 配置为：

```
{y}/{m}/{d}/{origin}
```

上传结果为：

```
images/2026/10/24/test.png
```

如果开启官方「时间戳重命名」，文件名由官方改写，插件只应用目录：

```
images/2026/10/24/20261024153055123.png
```

## 配置

安装后在 PicGo 插件设置中配置：

| 配置项 | 说明 |
| --- | --- |
| `format` | 文件（路径）格式，留空则关闭插件 |

配置保存位置：`picgo-plugin-rename-power.format`。

## 模板语法

与 rename-file 一致：

| 占位符 | 说明 |
| --- | --- |
| `{y}` | 年，4 位 |
| `{m}` | 月，2 位 |
| `{d}` | 日，2 位 |
| `{h}` | 时，2 位 |
| `{i}` | 分，2 位 |
| `{s}` | 秒，2 位 |
| `{ms}` | 毫秒，3 位 |
| `{timestamp}` | 秒级时间戳，10 位 |
| `{hash}` | 文件内容的 MD5，32 位 |
| `{origin}` | 原文件名（不含扩展名，非法字符替换为 `-`） |
| `{rand:6}` | 随机字符串，`{rand}` 默认 6 位，最多 32 位 |
| `{localFolder:2}` | 原文件所在目录的最后 N 级，`{localFolder}` 默认 1 级 |

补充规则（与 rename-file 相同）：

- 自动在末尾追加原文件扩展名。
- 模板以 `/` 结尾时表示只指定目录，文件名使用图片序号。
- 多余的 `/` 会被合并；未识别的 `{xxx}` 原样输出 `xxx`。

## 与官方重命名的兼容策略

PicGo GUI 的官方重命名（`settings.rename` / `settings.autoRename`）与插件的 `beforeUpload` 钩子会并发执行，官方逻辑会覆盖插件写入的 `fileName`。因此本插件采用以下策略：

1. **官方重命名关闭**：插件直接改写 `fileName`（可包含目录），与 rename-file 行为一致。
2. **官方重命名开启**：插件不改 `fileName`，改为临时把模板中的目录部分拼到当前图床的 `path` 配置上，上传结束后自动还原。这样官方重命名结果不会被覆盖，同时目录模板仍然生效。

注意：

- 开启官方重命名时，模板中的**文件名部分会被忽略**（例如 `{origin}` 不再作为文件名）。因此这种模式下建议把 `format` 写成以 `/` 结尾的纯目录形式，例如 `{y}/{m}/{d}/`。
- 该模式依赖图床支持 `path` 配置（如 GitHub、Gitee、阿里云 OSS 等）；不支持 `path` 的图床（如 SM.MS）无法应用目录模板。
- 一次上传多张图片时，若模板为每张图片生成了不同目录（例如目录中包含 `{origin}`），插件只会使用第一个目录，并弹出提示。

## 开发

插件使用纯 JavaScript（CommonJS），无运行时依赖，也无需编译：

- 入口：`src/index.js`
- 模板渲染：`src/format.js`

本地调试时可以把仓库放到 PicGo 配置目录的 `node_modules/picgo-plugin-rename-power` 下（或用 `npm link`），重启 PicGo 后即可在插件设置中看到 `format` 配置项。

## 调试

1. **看日志（最快）**：插件用 `ctx.log.info` 输出的内容会写进 PicGo 日志文件：
   - Windows：`%APPDATA%\picgo\picgo.log`
   - PicGo 设置页也有「打开日志文件」入口

   在日志里搜索 `[rename-power]`，可以看到 `format` 实际读取值、是否进入官方重命名兼容分支、以及 path 是否被临时修改/还原。
2. **弹窗通知**：临时加 `ctx.emit('notification', { title: 'debug', body: '...' })`，结果会直接弹在桌面上，适合确认钩子是否执行。
3. **打断点**：PicGo 主进程基于 Electron，可用 `PicGo.exe --inspect=9229` 启动，然后浏览器打开 `chrome://inspect` 附加；或在 VS Code 里用 `node` 的 `attach` 配置连接 `9229` 端口，在 `src/index.js` 里下断点。
4. 插件代码在 PicGo 启动时加载，修改 `src/` 后需要**重启 PicGo** 才会生效；只改 `format` 配置则不需要重启。

## 参考

- [picgo-plugin-rename-file](https://github.com/liuwave/picgo-plugin-rename-file)：模板语法与重命名行为的参考来源
- [PicGo-Core](https://github.com/PicGo/PicGo-Core)：上传生命周期与各图床 uploader 的实现参考
- [PicGo](https://github.com/Molunerfinn/PicGo)：PicGo GUI 官方重命名逻辑的参考
- [PicGo 文档](https://docs.picgo.app/zh/core/api)：PicGo API 与插件开发文档

## License

MIT License

Copyright (c) 2026 picgo-plugin-rename-power contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
