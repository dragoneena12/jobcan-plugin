// ==UserScript==
// @name         Jobcan 残業時間計算
// @namespace    https://github.com/dragoneena12/jobcan-plugin
// @version      1.0.0
// @description  Jobcanの出勤簿から残業時間と月末残業予測を表示
// @author       dragoneena12
// @match        https://ssl.jobcan.jp/employee/attendance*
// @match        https://ssl.jobcan.jp/jbcoauth/login*
// @updateURL    https://raw.githubusercontent.com/dragoneena12/jobcan-plugin/main/jobcan-overtime-calculator.user.js
// @downloadURL  https://raw.githubusercontent.com/dragoneena12/jobcan-plugin/main/jobcan-overtime-calculator.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ページ読み込み完了を待つ
    function init() {
        // 出勤簿テーブルが存在するか確認（日付列があるテーブルを探す）
        const table = document.querySelector('table.jbc-table.jbc-table-bordered');
        if (!table) {
            console.log('出勤簿テーブルが見つかりません');
            return;
        }

        calculateOvertime();
    }

    // 時刻文字列を分に変換（例: "8:30" -> 510）
    function timeToMinutes(timeStr) {
        if (!timeStr || timeStr === '-' || timeStr.trim() === '') {
            return 0;
        }
        const match = timeStr.match(/(\d+):(\d+)/);
        if (!match) return 0;
        return parseInt(match[1]) * 60 + parseInt(match[2]);
    }

    // 分を時間文字列に変換（例: 510 -> "8:30"）
    function minutesToTime(minutes) {
        const sign = minutes < 0 ? '-' : '';
        const absMinutes = Math.abs(minutes);
        const hours = Math.floor(absMinutes / 60);
        const mins = absMinutes % 60;
        return `${sign}${hours}:${mins.toString().padStart(2, '0')}`;
    }

    // Jobcanページから月規定労働時間を取得
    function getMonthlyStandardMinutes() {
        // 「労働時間」カード内の「月規定労働時間」を探す
        const tables = document.querySelectorAll('table.jbc-table.jbc-table-fixed.info-contents');
        for (const table of tables) {
            const rows = table.querySelectorAll('tbody tr');
            for (const row of rows) {
                const th = row.querySelector('th');
                if (th && th.textContent.trim() === '月規定労働時間') {
                    const td = row.querySelector('td span.info-content');
                    if (td) {
                        const timeText = td.textContent.trim();
                        return timeToMinutes(timeText);
                    }
                }
            }
        }
        return null;
    }

    // Jobcanページから所定労働日数を取得
    function getStandardWorkDays() {
        // 「ユーザー情報」カード内の「所定労働日数」を探す
        const tables = document.querySelectorAll('table.jbc-table.jbc-table-fixed');
        for (const table of tables) {
            const rows = table.querySelectorAll('tbody tr');
            for (const row of rows) {
                const th = row.querySelector('th');
                if (th && th.textContent.trim() === '所定労働日数') {
                    const td = row.querySelector('td');
                    if (td) {
                        const text = td.textContent.trim();
                        const match = text.match(/(\d+)/);
                        if (match) {
                            return parseInt(match[1]);
                        }
                    }
                }
            }
        }
        return null;
    }

    // 出勤簿データを取得（各レコード単体の処理を実施）
    function getAttendanceData(standardDailyMinutes) {
        const rows = document.querySelectorAll('table.jbc-table.jbc-table-bordered tbody tr');
        const dailyRecords = [];

        // 現在の日付を取得
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentDay = now.getDate();

        rows.forEach((row) => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 6) return;

            // 列の構造:
            // 0: 日付, 1: 休日区分, 2: シフト時間, 3: 出勤時刻, 4: 退勤時刻,
            // 5: 労働時間, 6: 残業時間, 7: 深夜時間, 8: 休憩時間, 9: 有休時間, 10: 選択備考

            // 日付を取得
            const dateCell = cells[0];
            const dateText = dateCell.textContent.trim();
            const dayMatch = dateText.match(/(\d+)\/(\d+)/);
            let rowMonth = currentMonth;
            let rowDay = 0;
            if (dayMatch) {
                rowMonth = parseInt(dayMatch[1]);
                rowDay = parseInt(dayMatch[2]);
            }

            // 各セルのデータを取得
            const shiftTimeCell = cells[2]?.textContent.trim() || '';
            const startTimeCell = cells[3]?.textContent.trim() || '';
            const endTimeCell = cells[4]?.textContent.trim() || '';
            const workTimeCell = cells[5]?.textContent.trim() || '';

            // 過去の判定
            const isPastDate = rowMonth < currentMonth ||
                             (rowMonth === currentMonth && rowDay < currentDay);

            // シフトの有無
            const hasShift = shiftTimeCell && shiftTimeCell !== '' && shiftTimeCell !== '-';

            // 出勤の有無
            const hasAttendance = (startTimeCell && startTimeCell !== '' && startTimeCell !== '-') ||
                                 (endTimeCell && endTimeCell !== '' && endTimeCell !== '-' &&
                                  endTimeCell !== '(勤務中)');

            // 実労働時間の計算
            let dailyWorkMinutes = 0;
            if (workTimeCell && workTimeCell !== '-' && workTimeCell !== '' &&
                workTimeCell !== '(勤務中)') {
                dailyWorkMinutes = timeToMinutes(workTimeCell);
            }

            // 休暇かどうか
            const isVacation = isPastDate && hasShift && !hasAttendance;

            // エラー（出勤しているのに労働時間が0）
            const isError = isPastDate && hasShift && hasAttendance && dailyWorkMinutes === 0;

            dailyRecords.push({
                month: rowMonth,
                day: rowDay,
                isPastDate,
                hasShift,
                hasAttendance,
                dailyWorkMinutes,
                isVacation,
                isError
            });
        });

        return {
            dailyRecords,
            currentMonth,
            currentDay
        };
    }

    // 残業時間分析を計算（集計のみ）
    function analyzeOvertime(rawData, standardDailyMinutes, monthlyStandardMinutes) {
        const { dailyRecords } = rawData;

        let totalWorkMinutes = 0;
        let actualWorkDays = 0;
        let remainingWorkDays = 0;
        let vacationDays = 0;
        let errorDays = 0;

        // 各日のレコードを集計（昨日まで）
        dailyRecords.forEach((record) => {
            if (record.isPastDate) {
                // 労働時間の集計
                if (record.dailyWorkMinutes > 0) {
                    totalWorkMinutes += record.dailyWorkMinutes;
                    actualWorkDays++;
                }

                // 休暇日数をカウント
                if (record.isVacation) {
                    vacationDays++;
                }

                // エラー日数をカウント
                if (record.isError) {
                    errorDays++;
                }
            } else {
                // 今日より後の日付でシフト時間が設定されている日をカウント
                if (record.hasShift) {
                    remainingWorkDays++;
                }
            }
        });

        // 休暇とエラーを考慮した月規定労働時間
        const adjustedMonthlyStandardMinutes = monthlyStandardMinutes - (standardDailyMinutes * (vacationDays + errorDays));

        // 昨日までの残業時間
        const currentOvertime = totalWorkMinutes - (standardDailyMinutes * actualWorkDays);

        // 平均労働時間/日
        const averageDailyMinutes = actualWorkDays > 0
                                    ? totalWorkMinutes / actualWorkDays
                                    : 0;

        // 月末予測（現在のペースで続けた場合）
        const projectedTotalMinutes = totalWorkMinutes + (averageDailyMinutes * remainingWorkDays);
        const projectedMonthEndOvertime = projectedTotalMinutes - adjustedMonthlyStandardMinutes;

        return {
            totalWorkMinutes,
            actualWorkDays,
            vacationDays,
            errorDays,
            currentOvertime,
            remainingWorkDays,
            projectedMonthEndOvertime,
            averageDailyMinutes,
            monthlyStandardMinutes
        };
    }

    function calculateOvertime() {
        // 月規定労働時間を取得
        const monthlyStandardMinutes = getMonthlyStandardMinutes();
        if (monthlyStandardMinutes === null) {
            console.log('月規定労働時間が取得できませんでした');
            return;
        }

        // 所定労働日数を取得
        const standardWorkDays = getStandardWorkDays();
        if (standardWorkDays === null) {
            console.log('所定労働日数が取得できませんでした');
            return;
        }

        // 1日あたりの標準労働時間を計算
        const standardDailyMinutes = monthlyStandardMinutes / standardWorkDays;

        // 出勤簿データを取得（各レコード単体の処理を実施）
        const rawData = getAttendanceData(standardDailyMinutes);

        // 残業時間分析を計算（集計のみ）
        const analysisResult = analyzeOvertime(rawData, standardDailyMinutes, monthlyStandardMinutes);

        // 結果を表示
        displayResults(analysisResult);
    }

    function displayResults(data) {
        // 既存の表示を削除
        const existingPanel = document.getElementById('overtime-calculator-panel');
        if (existingPanel) {
            existingPanel.remove();
        }

        // テーブルを探す
        const table = document.querySelector('table.jbc-table.jbc-table-bordered');
        if (!table) return;

        // テーブルの親要素を取得
        const tableParent = table.parentElement;

        // 結果パネルを作成（Jobcanのスタイルに合わせる）
        const panel = document.createElement('div');
        panel.id = 'overtime-calculator-panel';
        panel.className = 'col-lg-6 mb-3';

        // Jobcanのカードスタイルに合わせる
        panel.innerHTML = `
            <div class="card jbc-card-bordered h-100">
                <div class="card-header jbc-card-header">
                    <h5 class="card-text">残業時間分析</h5>
                </div>
                <div class="card-body">
                    <table class="table jbc-table jbc-table-fixed info-contents">
                        <tbody>
                            <tr>
                                <th scope="row" class="jbc-text-sub">稼働日数</th>
                                <td><span class="info-content text-right text-nowrap d-inline-block" style="width: 42px;">${data.actualWorkDays}</span></td>
                            </tr>
                            <tr>
                                <th scope="row" class="jbc-text-sub">休暇日数</th>
                                <td><span class="info-content text-right text-nowrap d-inline-block" style="width: 42px;">${data.vacationDays}</span></td>
                            </tr>
                            <tr>
                                <th scope="row" class="jbc-text-sub">エラー日数</th>
                                <td><span class="info-content text-right text-nowrap d-inline-block" style="width: 42px;">${data.errorDays}</span></td>
                            </tr>
                            <tr>
                                <th scope="row" class="jbc-text-sub">平均労働時間/日</th>
                                <td><span class="info-content text-right text-nowrap d-inline-block" style="width: 42px;">${minutesToTime(Math.round(data.averageDailyMinutes))}</span></td>
                            </tr>
                            <tr>
                                <th scope="row" class="jbc-text-sub">昨日までの残業時間</th>
                                <td>
                                    <span class="info-content text-right text-nowrap d-inline-block" style="width: 42px;">
                                        ${minutesToTime(Math.round(data.currentOvertime))}
                                    </span>
                                </td>
                            </tr>
                            <tr>
                                <th scope="row" class="jbc-text-sub">残り営業日数</th>
                                <td><span class="info-content text-right text-nowrap d-inline-block" style="width: 42px;">${data.remainingWorkDays}</span></td>
                            </tr>
                            <tr>
                                <th scope="row" class="jbc-text-sub">月末残業時間予測</th>
                                <td>
                                    <span class="info-content text-right text-nowrap d-inline-block" style="width: 42px;">
                                        ${minutesToTime(Math.round(data.projectedMonthEndOvertime))}
                                    </span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // collapseInfo の row に追加
        const collapseInfo = document.getElementById('collapseInfo');
        if (collapseInfo) {
            collapseInfo.appendChild(panel);
        } else {
            // collapseInfo が見つからない場合はテーブルの前に挿入
            tableParent.insertBefore(panel, table);
        }
    }

    // ページ読み込み後に実行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ページ遷移時に再計算
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            setTimeout(init, 1000);
        }
    }).observe(document, { subtree: true, childList: true });

})();
