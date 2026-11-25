const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'ReelsScreen.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations', '20261125190000_add_unique_reel_views.sql'), 'utf8');

const checks = [
  ['reel feed loads persisted view count', /select\('id,user_id,video_path,caption,duration_seconds,file_size_bytes,views_count,created_at'\)/.test(source)],
  ['only a reel visible for at least 70 percent can become active', /itemVisiblePercentThreshold:\s*70/.test(source)],
  ['view is recorded after a short watch delay', /from\('reel_views'\)\.insert\(\{\s*reel_id:\s*activeId,\s*viewer_id:\s*userId\s*\}\)/.test(source) && /\},\s*2200\)/.test(source)],
  ['repeat views are harmless', /error\.code !== '23505'/.test(source)],
  ['creator self-views are excluded', /activeReel\.user_id === userId/.test(source)],
  ['creator sees view count in My Reels', /myReelViews/.test(source) && /item\.viewsCount/.test(source)],
  ['opening My Reels refreshes the count', /setMyReelsOpen\(true\);\s*loadReels\(\)/.test(source)],
  ['database enforces one view per member and reel', /primary key \(reel_id, viewer_id\)/i.test(migration)],
  ['view table has RLS and insert-only access', /enable row level security/i.test(migration) && /grant insert on public\.reel_views to authenticated/i.test(migration) && /revoke all on public\.reel_views from public, anon, authenticated/i.test(migration)],
  ['database rejects own and unpublished reel views', /r\.status = 'published'[\s\S]*r\.user_id <> \(select auth\.uid\(\)\)/.test(migration)],
  ['database counter increments only on inserted unique view', /after insert on public\.reel_views/i.test(migration) && /views_count = views_count \+ 1/.test(migration)],
  ['no viewer identity read policy is created', !/for select to authenticated/i.test(migration)],
];

for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) process.exitCode = 1;
}
