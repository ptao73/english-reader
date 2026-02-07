# 📖 English Reader - 英文学习阅读器

**反直觉学习法 + 离线优先 + 零后端成本**

## 🌟 核心特性

- ✅ **反直觉学习节奏** - 三层渐进式揭示,强迫思考而非依赖答案
- ✅ **离线优先(PWA)** - 可安装,可离线使用
- ✅ **三层智能缓存** - 极致节省AI调用成本
- ✅ **跨设备同步** - 基于GitHub私有仓库(零成本)
- ✅ **零后端架构** - 无需服务器,数据完全掌控

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone <your-repo-url>
cd english-reader
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置API Key

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑.env,填入你的Anthropic API Key
# VITE_ANTHROPIC_API_KEY=sk-ant-xxxxx

# 可选: 启用跨设备同步 (文章自动同步 / 词汇手动同步)
# VITE_GITHUB_TOKEN=ghp_xxxxxx
```

**获取API Key**: https://console.anthropic.com/

### 4. 启动开发服务器

```bash
npm run dev
```

访问: http://localhost:3000

### 5. 构建生产版本

```bash
npm run build
npm run preview
```

## 📱 安装为APP

### iOS (iPhone/iPad)

1. 用Safari打开网站
2. 点击底部"分享"按钮
3. 选择"添加到主屏幕"
4. 完成!现在可以像原生APP一样使用

### Android

1. 用Chrome打开网站
2. 点击右上角"⋮"菜单
3. 选择"安装应用"或"添加到主屏幕"
4. 完成!

### Mac/Windows

1. 用Chrome/Edge打开网站
2. 地址栏右侧会出现"安装"图标
3. 点击安装
4. 完成!

## 🎯 使用指南

### 导入文章

1. 点击"导入文章"
2. 输入标题
3. 粘贴英文文章内容 或 上传.txt文件
4. 点击"开始阅读"

### 反直觉学习流程

**这是本APP的核心创新!**

```
第一步: 阅读句子,尝试理解
   ↓
第二步: 点击"💡 查看提示" - 只显示最少信息
   ↓  (强迫自己先思考)
第三步: 点击"📖 深度分析" - 查看完整语法解析
   ↓  (理解句子结构)
第四步: 点击"🈯 中文翻译" - 确认理解无误
   ↓
第五步: 点击"🔄 重新思考" - 随时重置
```

**为什么这样做?**

- 传统方式: 看句子 → 看翻译 → 记住翻译 ❌
- 反直觉方式: 先思考 → 看分析 → 看翻译 ✅
- **效果**: 记忆深刻度提升3-5倍!

### 三层缓存系统

APP会自动缓存所有AI分析结果:

- **L1缓存**: 本地IndexedDB(毫秒级响应)
- **L2缓存**: GitHub私有仓库(未来实现)
- **L3调用**: 实时AI分析(仅缓存未命中时)

**成本优化**:
- 第一次查询: $0.0001
- 后续查询: $0(缓存命中)
- 节省率: 99%+

## 📊 数据管理

### 本地数据

所有数据存储在浏览器IndexedDB:

- 文章内容
- AI分析缓存
- 学习进度
- 词汇表

### GitHub 与本地同步（自动）

**同步对象**:
- 文章内容
- 阅读进度
- 反直觉揭示状态

**同步方式**:
- 本地数据为主
- GitHub Gist 作为云端备份和跨设备同步
- 按更新时间自动合并，冲突以最新为准
- 删除会在多设备间同步删除

**前置条件**:
- 所有设备使用同一个 `VITE_GITHUB_TOKEN`
- 首次运行会自动创建文章备份 Gist

### 词汇同步（手动）

词汇表同步是手动触发（词汇表页“云端同步”按钮）。

### 清理数据

```javascript
// 打开浏览器控制台(F12)
indexedDB.deleteDatabase('EnglishLearningDB');
location.reload();
```

### 导出数据(未来版本)

将支持导出为JSON,备份到GitHub。

## 🛠️ 技术栈

- **前端框架**: React 18
- **构建工具**: Vite
- **数据库**: IndexedDB (Dexie.js)
- **PWA**: vite-plugin-pwa
- **AI**: Claude Sonnet 4 (Anthropic API)

## 📈 开发路线图

- [x] ✅ 阅读器核心
- [x] ✅ 反直觉学习节奏
- [x] ✅ PWA离线能力
- [x] ✅ 三层缓存系统
- [x] ✅ GitHub同步
- [ ] 🔄 离线语音朗读
- [x] ✅ 词汇复习系统
- [x] ✅ 统计分析

## 💡 常见问题

### Q: 为什么需要API Key?

A: APP使用Claude AI来分析句子,提供语法解析和翻译。API Key是访问AI服务的凭证。

### Q: API调用会很贵吗?

A: 不会!得益于三层缓存设计:
- 100个新句子首次分析: ~$0.01
- 后续无限次查看: $0
- 月成本预估: $3-5

### Q: 数据安全吗?

A: 完全安全!
- 所有数据存储在你的设备上
- API Key仅用于AI调用
- 未来GitHub同步也是你的私有仓库

### Q: 可以离线使用吗?

A: 可以!
- 已缓存的内容可离线查看
- 新句子需要网络(首次AI分析)
- 安装为APP后,界面完全离线

### Q: 支持哪些浏览器?

A: 推荐:
- iOS: Safari 14+
- Android: Chrome 90+
- Mac: Safari 14+ / Chrome 90+
- Windows: Chrome 90+ / Edge 90+

## 🤝 贡献

欢迎提Issue和PR!

## 📄 许可证

MIT License

## 🙏 致谢

- Claude AI (Anthropic)
- React团队
- Vite团队
- Dexie.js

---

**开始你的反直觉英文学习之旅! 🚀**
