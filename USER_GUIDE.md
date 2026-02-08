# 📖 快速使用指南

## 🎯 导入文章的正确步骤

### 方法一: 粘贴文本(推荐)

1. **复制你的英文文章**
   - 从任何地方(Word, PDF, 网页)复制文本
   - Cmd+C (Mac) 或 Ctrl+C (Windows)

2. **打开APP,点击"导入文章"**

3. **粘贴到"文章内容"框**
   - 点击大文本框
   - Cmd+V 粘贴
   - 标题会自动生成!

4. **点击"🚀 开始阅读"**
   - 按钮会从灰色变为蓝色
   - 点击后立即进入阅读界面

### 方法一补充: 粘贴网页链接

1. **复制网页URL**
2. **粘贴到导入弹窗**
3. **点击"🚀 开始阅读"**
   - 系统自动抓取英文正文
   - 自动下载 `.txt`
   - 自动导入到阅读器

### 方法二: 上传.txt文件

1. **将文档保存为.txt格式**
   - Word: 文件 → 另存为 → 纯文本(.txt)
   - PDF: 全选复制 → 粘贴到记事本 → 保存为.txt

2. **点击"📁 或选择文件上传"**

3. **选择.txt文件**
   - 内容会自动填充
   - 标题会自动生成

4. **点击"🚀 开始阅读"**

## ⚠️ 注意事项

### PDF和Word文件暂不支持直接上传

**原因**: 
- PDF和Word是二进制格式,需要专门的解析库
- 为了保持APP简单轻量,暂不支持

**解决方案**:
1. 打开PDF/Word文档
2. 全选(Cmd+A)
3. 复制(Cmd+C)
4. 粘贴到APP的文本框中

### 标题输入框

- **可以手动修改标题**
- **粘贴内容后会自动生成**
- 如果不满意,直接修改即可

## 🎨 阅读界面功能

### 导入成功后,你会看到:

1. **句子卡片** - 显示当前句子
2. **三个按钮** - 反直觉学习的核心!
   - 💡 查看提示
   - 📖 深度分析
   - 🈯 中文翻译

### 使用流程:

```
1. 阅读句子,尝试理解
   ↓
2. 点击"💡 查看提示"
   - 看到最少信息(关键词、句型)
   - 强迫自己思考
   ↓
3. 点击"📖 深度分析"
   - 查看完整语法解析
   - 理解句子结构
   ↓
4. 点击"🈯 中文翻译"
   - 确认理解无误
   - 兜底确认
   ↓
5. 点击"🔄 重新思考"或"下一句 →"
```

## 🔧 常见问题

### Q: 为什么不同设备上的文章不一致?

A: 文章默认保存在本地浏览器中。要跨设备同步，需要配置 GitHub Token 并让应用自动同步。

**同步说明**:
- 自动同步内容: 文章内容、阅读进度、反直觉揭示状态
- 同步规则: 以更新时间较新的数据为准
- 删除会在多设备间同步删除
- 词汇表同步需要手动点击“云端同步”

**检查方法**:
- 文章列表页会显示“上次同步时间”
- 若显示“未配置 GitHub Token”，说明未启用同步

### Q: 为什么"开始阅读"按钮是灰色的?

A: 需要同时满足:
- ✅ 标题不为空
- ✅ 内容不为空

**解决**: 粘贴内容后,标题会自动生成,按钮就会变蓝!

### Q: 如何导入PDF文件?

A: 步骤:
1. 用任何PDF阅读器打开
2. 全选文本(Cmd+A)
3. 复制(Cmd+C)
4. 粘贴到APP(Cmd+V)

### Q: 可以导入中文文章吗?

A: 可以导入,但APP是为英文学习设计的:
- AI分析针对英文语法
- 中文翻译功能只对英文句子有意义

### Q: 为什么粘贴网页链接失败?

A: 可能原因:
- 目标网站限制抓取
- 网页不是英文正文
- 连接超时或页面过大

解决:
- 换一个链接或先复制正文再粘贴

### Q: 句子切分不准确怎么办?

A: 当前使用简单的正则切分:
- 以 `.` `!` `?` 结尾识别为句子
- 会处理常见缩写(Mr. Dr. etc.)
- 如果切分有问题,建议预处理文本

## 💡 最佳实践

### 文章选择:

✅ **推荐**:
- 新闻报道
- 技术博客
- 学术文章
- 经典文学段落

❌ **不推荐**:
- 对话体(剧本)
- 大量缩写的技术文档
- 诗歌(特殊格式)

### 学习节奏:

**每天10-20句**,重质不重量:
- 用"反直觉学习法"深度理解
- 比快速浏览100句效果好10倍!

### 复习策略:

1. 第一遍:全部揭示三层
2. 第二天:点"🔄重新思考",只看提示
3. 第三天:直接尝试翻译,最后看答案

## 🎯 测试文章(复制使用)

```
The Future of Artificial Intelligence

Artificial intelligence has revolutionized the way we live and work. The implementation of AI in education has transformed how students learn and interact with educational content. Machine learning algorithms can now analyze vast amounts of data in seconds.

However, experts warn that we must approach this technology with caution. Ethical considerations are paramount when developing AI systems. The potential for bias in algorithms remains a significant concern.

Despite these challenges, the benefits of AI are undeniable. From healthcare diagnostics to climate change predictions, AI is helping us solve some of humanity's most pressing problems. The key is to ensure that this powerful technology is developed responsibly and used for the benefit of all.
```

**使用方法**:
1. 复制上面的文本
2. 在APP中点击"导入文章"
3. 粘贴到内容框
4. 点击"🚀 开始阅读"

---

**开始你的反直觉英文学习之旅!** 🚀📖
