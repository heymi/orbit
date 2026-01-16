<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1MAITwBg8Z4mc6M9LGlhlsrkFGR3QXHy6

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `VITE_GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Supabase 配置

### 1. 创建 Supabase 项目
前往 [Supabase](https://supabase.com) 创建一个新项目。

### 2. 配置环境变量
在 `.env.local` 文件中设置：
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> 邀请链接生成使用 Service Role Key，仅建议在内网或受控环境使用，正式环境请改为服务端接口。

### 3. 创建数据库表
在 Supabase SQL Editor 中运行 `supabase/schema.sql` 创建所有表。

### 4. 插入初始数据（可选）
运行 `supabase/seed.sql` 插入示例数据。

### 5. 启用邮箱认证
在 Supabase Dashboard > Authentication > Providers 中启用 Email 认证。

> 如果未配置 Supabase，应用会自动使用本地模拟数据运行。

## Task List
- [x] 替换任务详情中的硬编码用户身份：使用真实登录用户用于活动日志与 QA 权限判定，并补充单元测试。
- [x] 优化 `updateIssue` 的子任务更新策略：差量更新而非全量删除重建，并补充单元测试。
- [x] 拖拽排序写放大优化：仅更新移动项的排序值并持久化，补充单元测试。
- [x] 实时订阅一致性：补充 users/teams 订阅并统一变更处理逻辑，补充单元测试。
- [ ] Gemini Key 暂缓处理（内网使用）。

## Bug 管理（简版说明）
- Bug 作为任务的一种：使用 `Bug` 标签识别。
- Bug 详情字段存放在 `customFields`：`severity`、`environment`、`reproSteps`、`expectedResult`、`actualResult`、`closeReason`、`reopenCount`。
- “Bug”视图提供总览统计，支持按状态分组与优先级排序。
- QA 验收约束：Bug 需 QA 角色通过后才能标记完成。
