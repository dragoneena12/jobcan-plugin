# jobcan-plugin

Jobcanの出勤簿から残業時間の分析と月末予測を表示するTampermonkeyスクリプト

## 機能

- Jobcanページから月規定労働時間と所定労働日数を自動取得
- 実際の稼働日数と総労働時間を集計
- 休暇日数（シフト設定あり・出勤記録なし）を検出
- エラー日数（出勤記録あり・労働時間0）を検出
- 昨日までの残業時間を計算
- 月末の残業時間を予測（現在のペースで継続した場合）
- 1日あたりの平均労働時間を表示

## インストール方法

1. Tampermonkeyをブラウザにインストール
   - [Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - [Firefox](https://addons.mozilla.org/ja/firefox/addon/tampermonkey/)
   - [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

2. スクリプトをインストール
   - 以下のURLにアクセス
   ```
   https://raw.githubusercontent.com/dragoneena12/jobcan-plugin/main/jobcan-overtime-calculator.user.js
   ```
   - Tampermonkeyのインストール画面が表示されるので「インストール」をクリック

3. Jobcanの出勤簿ページにアクセス

## 自動アップデート

Tampermonkeyは自動的にスクリプトの更新をチェックします。手動で更新を確認する場合は：
- Tampermonkeyのダッシュボードを開く
- インストール済みのスクリプト一覧から「Jobcan 残業時間計算」を探す
- 「最終更新」列のアイコンをクリックして更新を確認

## 表示内容

- **稼働日数**: 実際に働いた日数
- **休暇日数**: シフト設定があるが出勤記録がない日数
- **エラー日数**: 出勤記録はあるが労働時間が0の日数
- **総労働時間**: 昨日までの累計労働時間
- **平均労働時間/日**: 1日あたりの平均労働時間
- **昨日までの残業時間**: これまでの残業時間
- **残り営業日数**: 月末までの残りシフト設定日数
- **月末残業予測**: このペースで働き続けた場合の月末の残業時間
