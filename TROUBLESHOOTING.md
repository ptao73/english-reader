# 🔧 问题排查指南

## 当前已修复的问题

✅ **textParser.js** - 修复了 `protected` 保留字错误
✅ **vite.config.js** - 添加了 `host: '0.0.0.0'` 支持外部访问
✅ **所有语法** - 通过了语法检查

## 🎯 现在应该怎么做

### 步骤1: 停止当前服务器

在Mac终端按 `Ctrl + C` 停止服务器

### 步骤2: 重新启动

```bash
cd ~/Documents/學習資料/claude/english-reader
npm run dev
```

### 步骤3: 验证启动成功

你应该看到:
```
VITE v5.4.21  ready in 490 ms

➜  Local:   http://localhost:3000/
➜  Network: http://192.168.1.6:3000/
➜  Network: http://198.18.0.1:3000/
```

没有任何红色ERROR信息!

### 步骤4: 测试访问

**在Mac Chrome/Safari打开:**
```
http://localhost:3000
```

**应该看到:**
- 📖 English Reader 标题
- "文章列表" 和 "导入文章" 按钮
- 底部 "⚡ Powered by React..." 信息

**如果看到空白页:**
1. 按 F12 打开开发者工具
2. 查看Console标签的错误
3. 截图发给我

### 步骤5: 在iPhone测试

**使用Network地址:**
```
http://192.168.1.6:3000
或
http://198.18.0.1:3000
```

**确保:**
- iPhone和Mac在同一WiFi
- 不要用localhost(只在Mac有效)

## 🆘 如果还有错误

### 错误1: "Cannot find module"

**解决:**
```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### 错误2: "Vite error: ..."

**检查:**
1. Node版本: `node --version` (应该 >= 18)
2. 删除 `.vite` 缓存目录: `rm -rf node_modules/.vite`
3. 重启: `npm run dev`

### 错误3: iPhone无法访问

**检查网络:**
```bash
# Mac终端查看IP
ifconfig | grep "inet " | grep -v 127.0.0.1

# 或者
ipconfig getifaddr en0
```

**Mac防火墙:**
- 系统偏好设置 → 安全性与隐私 → 防火墙
- 如果开启,需要允许Node.js连接

### 错误4: "Failed to scan for dependencies"

**解决:**
```bash
# 清理所有缓存
rm -rf node_modules .vite package-lock.json
npm cache clean --force
npm install
npm run dev
```

## 📊 验证清单

启动成功后,依次验证:

- [ ] Mac浏览器能打开 http://localhost:3000
- [ ] 看到完整的UI界面(不是空白)
- [ ] 点击"导入文章"能看到表单
- [ ] Console没有红色错误
- [ ] iPhone能访问Network地址
- [ ] iPhone上界面显示正常

## 🎯 快速测试页面

访问这个测试页面验证服务器:
```
http://localhost:3000/test.html
```

应该看到绿色的成功消息。

## 💡 常见问题

**Q: 为什么之前有错误?**
A: `protected` 是JavaScript保留字,不能用作变量名。已修复为 `protectedText`。

**Q: 现在应该没问题了吗?**
A: 是的!所有已知问题都已修复。如果还有问题,请:
1. 发送错误截图
2. 发送Console错误信息
3. 告诉我具体的步骤和现象

**Q: 需要重新下载吗?**
A: 不需要!你现在的代码已经是修复后的版本。只需要重启服务器即可。

---

**记住: Ctrl+C 停止服务器,然后 npm run dev 重新启动!**
