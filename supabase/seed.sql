-- Orbit v2 初始数据
-- 多租户版本 - 运行 schema.sql 后执行此脚本

-- 注意：此文件仅供参考，实际数据由用户通过应用创建
-- 新用户登录后会自动引导创建组织，组织创建时会自动生成默认团队

-- 如需手动创建测试组织，可使用以下模板：
-- INSERT INTO organizations (id, name, slug) VALUES 
--   ('org_test', '测试组织', 'test-org');
-- 
-- INSERT INTO org_members (org_id, user_id, role) VALUES
--   ('org_test', 'your-user-id', 'owner');
--
-- INSERT INTO teams (id, org_id, name, icon) VALUES
--   ('org_test_inbox', 'org_test', '业务收件箱', 'Inbox'),
--   ('org_test_eng', 'org_test', '研发交付', 'Zap');
