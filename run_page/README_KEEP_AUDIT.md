# Keep 数据完整性检查

同步器默认会纳入 Keep 标记为 `isDoubtful` 的活动，并在 `duration` 为零时使用起止时间计算时长。数据库还会为 Keep 的长 ID 保存一个精确字符串 `external_id`，避免 JavaScript 数值精度造成重复记录。

先在本机检查 Keep 与当前数据库的差异。密码通过环境变量读取，不会出现在命令参数或 Shell 历史里：

```bash
cd keep_running
read -r -p "Keep mobile: " KEEP_MOBILE
read -r -s -p "Keep password: " KEEP_PASSWORD
echo
export KEEP_MOBILE KEEP_PASSWORD
python run_page/keep_missing_audit.py --year 2025 --include-details
```

报告写入 `keep-audit.json`。`missing` 中的活动可使用 Keep ID 单独导出；缺少 GPS 的活动仍会保留在跑步统计中，但无法生成轨迹。

如果旧缓存中的 Keep ID 已经被 JavaScript 舍入，可从页面生成的 SVG 中恢复精确 ID：

```bash
python run_page/repair_keep_ids.py assets/grid.svg --write
```

应先确认 `assets/grid.svg` 包含目标活动。未包含在 SVG 中的短距离活动会由下一次 Keep 全量同步补回。

完成完整重同步：

```bash
python run_page/keep_sync.py "$KEEP_MOBILE" "$KEEP_PASSWORD" --with-gpx
```

随后重新生成展示资源：

```bash
python run_page/gen_svg.py --from-db --title "MurphyKwok Running" --type github --athlete MurphyKwok --output assets/github.svg --use-localtime --min-distance 0.5
python run_page/gen_svg.py --from-db --title "Over 1km Runs" --type grid --athlete MurphyKwok --output assets/grid.svg --min-distance 1 --use-localtime
```

GitHub Actions 的完整检查可以在仓库页面进入 **Actions → Keep Data Audit → Run workflow**，运行后下载 `keep-data-audit` 工件。工作流复用已有的 `KEEP_MOBILE` 和 `KEEP_PASSWORD` Secrets。
