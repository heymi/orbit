-- Orbit 多租户数据库 Schema v2
-- 支持组织级数据隔离和实时同步

-- ============ 删除旧表（按依赖顺序）============
DROP TABLE IF EXISTS activities CASCADE;
DROP TABLE IF EXISTS subtasks CASCADE;
DROP TABLE IF EXISTS issues CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS cycles CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS org_members CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

-- 删除旧函数
DROP FUNCTION IF EXISTS get_user_org_ids(UUID);

-- ============ Organizations 组织表 ============
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ Users 用户表 ============
CREATE TABLE users (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT '其他成员',
  theme_preference TEXT,
  layout_preference TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ Org Members 组织成员关联表 ============
CREATE TABLE org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

-- ============ Teams 团队表 ============
CREATE TABLE teams (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'Layers',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ Cycles 迭代表 ============
CREATE TABLE cycles (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  description TEXT,
  goals TEXT[] DEFAULT '{}',
  is_released BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ Projects 项目表 ============
CREATE TABLE projects (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL DEFAULT '📁',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ Issues 任务表 ============
CREATE TABLE issues (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  identifier TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT '待办',
  priority TEXT NOT NULL DEFAULT '无优先级',
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  previous_assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  cycle_id TEXT REFERENCES cycles(id) ON DELETE SET NULL,
  labels TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, identifier)
);

-- ============ Subtasks 子任务表 ============
CREATE TABLE subtasks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ Activities 活动记录表 ============
CREATE TABLE activities (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('create', 'update', 'comment')),
  user_id UUID NOT NULL,
  field TEXT,
  old_value TEXT,
  new_value TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ============ 索引 ============
CREATE INDEX idx_org_members_user ON org_members(user_id);
CREATE INDEX idx_org_members_org ON org_members(org_id);
CREATE INDEX idx_teams_org ON teams(org_id);
CREATE INDEX idx_cycles_org ON cycles(org_id);
CREATE INDEX idx_projects_org ON projects(org_id);
CREATE INDEX idx_issues_org ON issues(org_id);
CREATE INDEX idx_issues_team ON issues(team_id);
CREATE INDEX idx_issues_assignee ON issues(assignee_id);
CREATE INDEX idx_subtasks_issue ON subtasks(issue_id);
CREATE INDEX idx_activities_issue ON activities(issue_id);

-- ============ 辅助函数：获取用户所属组织 ============
CREATE OR REPLACE FUNCTION get_user_org_ids(uid UUID)
RETURNS SETOF UUID AS $$
  SELECT org_id FROM org_members WHERE user_id = uid;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============ RLS 策略 ============
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- Organizations
CREATE POLICY "org_select" ON organizations FOR SELECT TO authenticated
  USING (id IN (SELECT get_user_org_ids(auth.uid())));
CREATE POLICY "org_insert" ON organizations FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "org_update" ON organizations FOR UPDATE TO authenticated
  USING (id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));
CREATE POLICY "org_delete" ON organizations FOR DELETE TO authenticated
  USING (id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role = 'owner'));

-- Users
CREATE POLICY "users_select" ON users FOR SELECT TO authenticated
  USING (id = auth.uid() OR id IN (SELECT user_id FROM org_members WHERE org_id IN (SELECT get_user_org_ids(auth.uid()))));
CREATE POLICY "users_insert" ON users FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "users_update" ON users FOR UPDATE TO authenticated
  USING (id = auth.uid());

-- Org Members: 关键修复 - 允许用户将自己添加到任何组织（创建组织时需要）
CREATE POLICY "org_members_select" ON org_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR org_id IN (SELECT get_user_org_ids(auth.uid())));
CREATE POLICY "org_members_insert" ON org_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "org_members_delete" ON org_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- Teams, Cycles, Projects, Issues
CREATE POLICY "teams_all" ON teams FOR ALL TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())))
  WITH CHECK (org_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "cycles_all" ON cycles FOR ALL TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())))
  WITH CHECK (org_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "projects_all" ON projects FOR ALL TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())))
  WITH CHECK (org_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "issues_all" ON issues FOR ALL TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())))
  WITH CHECK (org_id IN (SELECT get_user_org_ids(auth.uid())));

-- Subtasks, Activities
CREATE POLICY "subtasks_all" ON subtasks FOR ALL TO authenticated
  USING (issue_id IN (SELECT id FROM issues WHERE org_id IN (SELECT get_user_org_ids(auth.uid()))))
  WITH CHECK (issue_id IN (SELECT id FROM issues WHERE org_id IN (SELECT get_user_org_ids(auth.uid()))));

CREATE POLICY "activities_all" ON activities FOR ALL TO authenticated
  USING (issue_id IN (SELECT id FROM issues WHERE org_id IN (SELECT get_user_org_ids(auth.uid()))))
  WITH CHECK (issue_id IN (SELECT id FROM issues WHERE org_id IN (SELECT get_user_org_ids(auth.uid()))));

-- ============ 实时订阅 ============
ALTER PUBLICATION supabase_realtime ADD TABLE issues;
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
ALTER PUBLICATION supabase_realtime ADD TABLE cycles;
ALTER PUBLICATION supabase_realtime ADD TABLE users;
ALTER PUBLICATION supabase_realtime ADD TABLE teams;
