# Claude 用量监控

实时监控 Claude 使用量，智能提醒最佳使用时机的浏览器扩展 + Web 应用。

## 功能特点

- **实时监控** - 自动读取 Claude usage 页面数据
- **智能提醒** - 距离用量重置还剩约1小时时，微信通知提醒
- **多端查看** - 浏览器扩展 + 手机 Web 页面
- **安全可靠** - 使用浏览器扩展读取数据，不存储密码

## 监控内容

- **当前会话用量** - 实时显示当前会话使用百分比
- **每周限制** - 每周总用量限制及重置倒计时
- **5小时滚动窗口** - 5小时限制用量及重置时间

## 快速开始

### 1. 生成扩展图标

1. 在浏览器中打开 `extension/icons/icon-generator.html`
2. 点击"下载所有图标"按钮
3. 将下载的 3 个 PNG 文件放到 `extension/icons/` 目录下
4. 删除 `icon-generator.html`（可选）

### 2. 安装浏览器扩展

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `extension` 文件夹
6. 扩展安装成功！

### 3. 配置 Server酱（微信通知）

1. 访问 [Server酱官网](https://sct.ftqq.com/)
2. 使用微信扫码登录
3. 复制 SendKey
4. 点击扩展图标，打开设置
5. 粘贴 SendKey 并保存
6. 点击"测试通知"验证配置

### 4. 配置 Firebase（可选，用于手机查看）

#### 4.1 创建 Firebase 项目

1. 访问 [Firebase Console](https://console.firebase.google.com/)
2. 创建新项目（或使用现有项目）
3. 进入项目设置
4. 找到"Realtime Database"
5. 创建数据库（选择测试模式）
6. 复制数据库 URL（格式：`https://your-project.firebaseio.com`）

#### 4.2 配置扩展

1. 点击扩展图标
2. 展开"设置"面板
3. 在"Firebase Database URL"输入框粘贴 URL
4. 点击"保存设置"

#### 4.3 部署 Web 页面

**方式一：使用 GitHub Pages（推荐）**

```bash
cd /Users/haihui/ClaudeProjects/jiluUsage
git init
git add web/*
git commit -m "Add web app"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

然后在 GitHub 仓库设置中启用 GitHub Pages，选择 `web` 文件夹。

**方式二：使用 Vercel/Netlify**

直接将 `web` 文件夹拖拽到 [Vercel](https://vercel.com/) 或 [Netlify](https://www.netlify.com/) 部署。

**方式三：本地测试**

```bash
cd web
python3 -m http.server 8080
# 访问 http://localhost:8080
```

### 5. 首次使用

1. 访问 [claude.ai/settings/usage](https://claude.ai/settings/usage)
2. 扩展会自动读取并存储数据
3. 点击扩展图标查看用量信息
4. 数据会自动同步到 Firebase（如果已配置）

## 使用说明

### 浏览器扩展

- **查看用量** - 点击扩展图标即可查看实时用量
- **刷新数据** - 点击刷新按钮会打开 usage 页面并重新读取
- **打开 Usage 页面** - 直接跳转到 Claude usage 页面
- **测试通知** - 测试微信通知是否配置成功

### 手机 Web 页面

1. 在手机浏览器打开部署的 Web 页面
2. 首次访问时输入 Firebase Database URL
3. 页面会自动每 30 秒刷新数据
4. 可以关闭自动刷新功能

### 通知机制

- **检查频率** - 每 15 分钟检查一次（扩展后台自动运行）
- **提醒条件** - 距离重置时间 ≤ 1 小时
- **通知方式** - 微信（Server酱） + 浏览器通知
- **防打扰** - 最小通知间隔 30 分钟，避免频繁提醒

### 为什么1小时最佳？

- 如果还需要 4 小时才重置 → 可能需要等待很久
- 如果还剩 1 小时就重置 → 现在使用，用完后等 1 小时即可再用
- **策略** - 等到快重置时使用，最大化可用时间

## 项目结构

```
jiluUsage/
├── extension/              # Chrome 扩展
│   ├── manifest.json      # 扩展配置
│   ├── popup/             # 弹窗界面
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   ├── content/           # 内容脚本（读取页面）
│   │   └── content.js
│   ├── background/        # 后台脚本（通知逻辑）
│   │   └── background.js
│   └── icons/             # 扩展图标
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
├── web/                   # Web 查询页面
│   ├── index.html
│   ├── app.js
│   └── style.css
└── README.md
```

## 工作原理

```
┌─────────────────┐
│  Claude Usage  │
│     页面        │
└────────┬────────┘
         │ 读取数据
         ▼
┌─────────────────┐
│ Content Script  │ ─────┐
│  (自动读取)     │      │
└─────────────────┘      │ 发送数据
                         │
         ┌───────────────┘
         ▼
┌─────────────────┐
│ Background      │
│   Script        │
└────┬────────┬───┘
     │        │
     │        └─────────┐
     │                  │
     ▼                  ▼
┌──────────┐    ┌──────────────┐
│ Firebase │    │  Server酱    │
│  (云存储) │    │ (微信通知)   │
└─────┬────┘    └──────────────┘
      │
      ▼
┌──────────────┐
│   Web 页面   │
│  (手机查看)  │
└──────────────┘
```

## 常见问题

### Q: 扩展无法读取数据？

A: 确保：
1. 已访问 `claude.ai/settings/usage` 页面
2. 页面完全加载完成
3. 浏览器扩展已正确安装并启用

### Q: 没有收到微信通知？

A: 检查：
1. Server酱 SendKey 是否正确配置
2. 是否已关注 Server酱公众号
3. 点击"测试通知"验证配置
4. 检查是否达到提醒条件（距离重置 ≤ 1小时）

### Q: 手机 Web 页面无法显示数据？

A: 确保：
1. Firebase Database URL 配置正确
2. Firebase 数据库规则允许读取（测试模式）
3. 扩展已同步数据到 Firebase
4. 检查浏览器控制台是否有错误

### Q: 数据多久更新一次？

A:
- 访问 usage 页面时实时更新
- 扩展后台每 15 分钟检查一次
- Web 页面每 30 秒自动刷新（可关闭）

### Q: 安全吗？

A:
- ✅ 使用浏览器扩展读取数据，不需要登录凭证
- ✅ 所有数据存储在本地和您自己的 Firebase
- ✅ 不会上传到第三方服务器
- ✅ 代码开源，可自行审查

## 自定义配置

### 修改提醒阈值

在扩展设置中调整"提醒阈值"，默认为 60 分钟。

### 修改检查频率

编辑 `extension/background/background.js`：

```javascript
const CHECK_INTERVAL = 15; // 改为您想要的分钟数
```

### 修改 Web 刷新频率

编辑 `web/app.js`：

```javascript
refreshInterval = setInterval(() => {
  if (isAutoRefresh) {
    fetchUsageData();
  }
}, 30000); // 改为您想要的毫秒数（30000 = 30秒）
```

## 技术栈

- **浏览器扩展** - Chrome Extension Manifest V3
- **前端** - 原生 JavaScript（无框架依赖）
- **云存储** - Firebase Realtime Database
- **通知** - Server酱 API
- **样式** - 原生 CSS（响应式设计）

## 更新日志

### v1.0.0 (2025-01-XX)

- ✨ 初始版本发布
- ✅ 实时监控 Claude 用量
- ✅ 智能微信提醒
- ✅ 手机 Web 页面查看
- ✅ Firebase 云端同步

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 联系方式

如有问题或建议，欢迎通过 GitHub Issues 联系。

---

**Enjoy! 🎉**
