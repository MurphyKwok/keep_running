# MurphyKwok 跑步数据微信小程序

这是一个不依赖 `github.io`、不需要配置业务域名的小程序版本。历史跑步数据、距离、用时、心率、城市和 GPS 轨迹都打包在小程序本地，页面在微信内直接读取。

小程序和 Running Page 共用 Keep 同步流程及 `src/static/activities.json` 数据源。仓库中的 `.github/workflows/miniprogram-data-sync.yml` 每天从 Keep 重新抓取数据，生成小程序数据包，并在数据变化时自动重新发布 Running Page。小程序发行包本身是发布时的静态快照，仓库数据更新后，仍需在微信开发者工具上传并发布新版本；本地编译可以立即看到最新仓库数据。

## 在微信开发者工具中预览

1. 打开微信开发者工具，选择“导入项目”。
2. 项目目录选择本仓库的 `miniprogram/` 文件夹。
3. AppID 一行点击“测试号”即可自动获得测试 AppID。`project.config.json` 目前保存的是开发者工具分配的测试 AppID `wxef8881819aab3264`，也可以替换成你自己的正式 AppID。
4. 点击“编译”即可打开首页；点击跑步列表中的一条可查看单次轨迹。

测试 AppID 只能用于本地调试，新版开发者工具已不再接受 `touristappid` 直接导入。上传体验版或正式版时，必须把小程序的真实 AppID 写入 `project.config.json`，并在微信公众平台完成主体、类目和隐私设置。

## 更新跑步数据

GitHub Actions 每天自动执行 Keep 同步和小程序数据生成。也可以在 Actions 页面手动运行 `Sync Mini Program Data`。本地需要手动刷新时，在仓库根目录执行：

```bash
python3 run_page/generate_miniprogram_data.py
```

脚本读取与 Running Page 相同的 `src/static/activities.json`，重新生成 `miniprogram/data/activities.js`。提交这个生成文件后，再在开发者工具中上传新版本。

微信小程序主包上限为 2 MB，而 Keep 的原始轨迹点超过 100 万个，直接打包约 2 MB，还会触发“文件超过最大文件大小”告警。生成脚本默认用 2 米容差的 Douglas-Peucker 简化打包轨迹，生成文件约 320 KB；原始 `activities.json`、GPX/TCX 导出和 Keep 数据库都不会被修改。需要更高精度时可以运行：

```bash
python3 run_page/generate_miniprogram_data.py --simplify-meters 1
```

传入 `--simplify-meters 0` 会保留全部轨迹点，但会超过微信的体积限制。

## 已支持与数据限制

- 全部年份与年度筛选
- 总次数、总公里、加权平均配速、平均心率
- 年度聚合轨迹与单次轨迹（默认按 2 米容差简化，显示效果不受影响）
- 单次距离、用时、配速、心率、日期、城市和 GPS 点数
- 无 GPS 记录会显示明确占位

活动数据继续以 WGS-84 保存；小程序在地图渲染和边界计算前转换为 GCJ-02，以匹配微信原生地图。可在仓库根目录运行 `node --test tests/miniprogram/coords.test.cjs` 检查网页与小程序共用的数据和转换结果。

当前 `activities.json` 的 Keep 聚合数据没有热量、步频和步数，因此详情页对应位置显示 `--`。生成脚本已经支持这三个可选字段；以后上游数据出现 `calories`、`average_cadence` 或 `step_count` 时，会一并写入小程序数据。

## 隐私与发布

页面不请求网络接口，也不主动读取用户实时位置。原生 `<map>` 仍会使用微信的地图服务；正式发布前需要在微信公众平台配置隐私保护指引，并如实说明地图组件的用途。
