# 排名网站

这是一个用于发布排行榜、提交变更提案并通过投票确认的项目示例。

## 结构

- `backend/` - Node.js + Express 后端 API
- `frontend/` - React + Vite 前端应用

## 快速启动

1. 安装依赖

```powershell
cd backend
npm install
cd ../frontend
npm install
```

2. 启动后端服务

```powershell
cd backend
npm start
```

3. 启动前端开发服务器

```powershell
cd frontend
npm run dev
```

4. 浏览器访问

打开 `http://localhost:5173`

## 默认账号

- 管理员：`admin` / `admin123`
- 普通用户：`guest` / `guest123`

## 功能概览

- 管理员创建榜单
- 用户提交移动或插入变更提案
- 其他用户对提案进行同意/否定投票
- 根据投票结果确认变更
