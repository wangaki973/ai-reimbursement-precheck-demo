# AI报销预审助手 Demo 前端

## 目录结构
- `index.html`：结构层（页面骨架）
- `css/styles.css`：样式层（视觉与布局）
- `js/app.js`：逻辑层（状态管理、事件、接口调用）
- `js/mock-api.js`：Mock 接口与规则模拟（对齐 PRD）

## 运行方式
在当前目录启动静态服务后访问 `index.html`。

示例（Python）：

```bash
cd demo
python3 -m http.server 8080
```

访问：`http://localhost:8080`

## 接口切换
在 `js/app.js` 中修改：

- `USE_MOCK_API = true`：使用本地 Mock（默认）
- `USE_MOCK_API = false`：改为调用真实后端

真实后端地址可通过 `API_BASE` 配置。
