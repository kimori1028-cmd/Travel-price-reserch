# 楽天トラベル 価格監視アプリ 汎用仕様書（テンプレート）

> 「フサキ価格モニター」で実際に構築・運用して得た知見をまとめた、
> **他ホテル・他アプリへ応用するための仕様書**です。
> 実装済みの参照コードはこのリポジトリ全体（`app/` `batch/` `supabase/` `.github/`）。

本書の記号:
- **【事実】** … 楽天ウェブサービスの実挙動として確認済み。前提にしてよい。
- **【設計】** … 本テンプレートの設計方針。踏襲推奨だが変更可。
- **【要差替】** … ホテル/アプリごとに必ず実データで確定する箇所。決め打ち禁止。
- **【教訓】** … 実際にハマった罠と対策。同じ轍を踏まないため。

---

## 1. このアプリは何か

特定ホテルの楽天トラベル宿泊価格を**定期的に取得してDBに蓄積し**、身内（少人数）が
スマホで**カレンダー閲覧・最安値検索・お気に入り共有・値下がりメール通知**できるWebアプリ。

用途を一般化すると「**外部APIの値を定期取得してDBに貯め、フロントはDBだけ読む**」型の
アプリすべてに、本書の構成（3クラウド分離・バッチ設計・RLS・通知）はそのまま応用できる。

---

## 2. システム構成【設計】

**ユーザー操作時に外部APIを叩かない**のが最重要原則（レートリミット遵守＋キー秘匿）。

```
  ①定期バッチ（1req/1.6秒）        GitHub Actions
  楽天トラベルAPI  ◀──────────────  （キーを保持・唯一のAPI呼出者）
       │                                    │ ②価格だけ書込
       │                                    ▼
       │                              Supabase (PostgreSQL)
       │                              価格 / 履歴 / 認証 / お気に入り
       │                                    ▲ ③読取
       └── ④ユーザーは楽天へ直接遷移 ──  Vercel（React SPA）◀── 身内スマホ
```

- **3つのクラウドは互いに独立**。楽天とSupabaseが直接通信することはない。
- キーが存在する場所は **GitHub Secrets のみ**。楽天へ送るのはバッチだけ。Supabaseへ送るのは価格データのみ。
- フロント（Vercel）は Supabase を読むだけ。予約は楽天サイトへ直リンクで遷移。

### 技術スタック【設計】
- フロント: **React + TypeScript + Vite + Tailwind CSS**（モバイルファースト・PWA対応）
- DB/認証: **Supabase**（PostgreSQL + Auth + Row Level Security）
- 定期実行: **GitHub Actions（cron）** … Public リポジトリなら標準ランナー無料無制限
- ホスティング: **Vercel**（Root Directory を `app/` に設定）
- バッチ: **Python 3 標準ライブラリのみ**（追加依存なし。urllib で API/PostgREST を叩く）

### コスト【事実】
すべて無料枠で運用可能:
- GitHub Actions: **Public なら無制限無料**（Private は月2,000分で毎時更新は超過するので Public 必須）
- Supabase 無料枠: DB 500MB（後述の履歴設計なら1割未満）
- Vercel 無料枠: 個人利用は十分

---

## 3. 楽天トラベルAPI の必須知識【事実】

> 2026年2月の刷新後の新仕様。旧 `app.rakuten.co.jp` は廃止方向。

### 3.1 認証・エンドポイント
- 空室検索: `https://openapi.rakuten.co.jp/engine/api/Travel/VacantHotelSearch/20170426`
- 施設検索: `https://openapi.rakuten.co.jp/engine/api/Travel/KeywordHotelSearch/20170426`
- 認証は **`applicationId`（UUID形式）と `accessKey`（`pk_` 始まり）の両方が必須**。
- **`Referer` または `Origin` ヘッダーが必須**（無いと403）。
- アプリ登録の **Allowed IP addresses** に実行元IPが必要。
  - **GitHub Actions は毎回IPが変わるため `0.0.0.0/0`（全IP許可）を登録**。キーはSecretsで秘匿されるため実用上問題ない。楽天が `0.0.0.0/0` を弾く場合は `0.0.0.0/1` + `128.0.0.0/1` の2行で代替。

### 3.2 設計を左右する4つの制約【事実】
1. **料金は「1泊目のみ」返る。** 複数泊を指定しても初日1泊分しか返らず、連泊合計フィールドは無い。
   → **1泊単位で問い合わせ、フロントで合算**する（4.1）。
2. **部屋タイプでAPI絞込みは不可。** → 返却の `roomClass`（優先）/`roomName`（正規表現）で**文字列マッチ分類**（4.2）。
3. **`searchPattern=1`（宿泊プランごと）を使う。** `=0`（施設ごと）は1施設最大3プランしか返らず不足。`=1` は `hits`最大30 × `page`最大100 でページング可能。
4. **プラン絞込みは `squeezeCondition` で。** 例 `breakfast`=朝食付き, `kinen`=禁煙。カンマ区切りで複数。

### 3.3 レート・エラー【事実】
- **1 applicationId あたり 1秒1リクエスト以下**。超過で **429**。本テンプレートは**1.6秒間隔**で安全側。
- エラーコード: `400`=パラメータ不正（バグ）／`404`=**データなし=空室なし/未受付として正常扱い**／`429/500/503`=指数バックオフでリトライ。

### 3.4 会員割引は反映されない【事実】
API認証は applicationId のみで会員ログインを渡せないため、**返る価格は会員限定割引「前」**。
割引後を知りたい場合は割引率をアプリ側で別途計算する（例: 6%OFF なら `×0.94`）しかない。

### 3.5 予約ページへのディープリンク【事実】【教訓】
- **宿泊のみ**: `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/{hotelNo}?...` に
  `f_nen1/f_tuki1/f_hi1`（IN）・`f_nen2/f_tuki2/f_hi2`（OUT）・`f_otona_su`・`f_heya_su` を付けて**日付入り**で開ける。
  APIが返す `reserveUrl` は**バッチが使った1泊検索の条件**が埋まっているため、そのまま使うと1泊表示になる。**自前で泊数付きURLを組み立てること。**
- **ANA楽パック等（航空券+宿泊）**: API/監視は**不可**（宿泊APIしか無い）。ただし
  `https://package.travel.rakuten.co.jp/anafrt/planList/hotelPlanList?...` へ
  日付・空港・人数・便名（`nsBinOuro=Y-{便番号}`／`nsBinHukuro=Y-{便番号}`）・レンタカー（`fRcUmu=1`）を
  **GET パラメータで渡せる**（＝希望便選択済みの一覧を開ける）。
  **【教訓】** 旅程確定ページ `/anafrt/itinerary/` への直接 POST はセッションが無いと
  「サーバーからの応答が得られませんでした」で拒否される。**正規の入口 `planList` に GET リンク**すること。

---

## 4. 重要な設計方針【設計】

### 4.1 連泊合計＝1泊料金の合算（最重要）
- データ取得は「1泊単位」（`checkinDate=D, checkoutDate=D+1`）。
- N泊合計 = 各夜の最安 `total` の和。**N泊すべての夜に在庫がある時だけ「予約可」**。1泊でも欠ければ不可。
- **これは参考値**（連泊専用プラン・連泊割引で実価格とズレうる）。UIに「参考価格」と明示し、各カードに**楽天予約ページへの日付入りリンク**を必ず置く。

### 4.2 部屋グレードの分類（設定ファイル化）
- `config/room_grades.json` にホテル番号・グレード定義（`room_class` コード配列＋`room_name_patterns` 正規表現）を持つ。
- **`roomClass` コード一致を優先**、無ければ `roomName` 正規表現でフォールバック。
- **【要差替】** 実 `roomClass`/`roomName` はホテルごとに違う。**KeywordHotelSearch で hotelNo を確定 → 実レスポンスをダンプして分類条件を確定**。想定文字列で決め打ちしない（バッチが未分類 `roomClass` をログ出力するので調整に使う）。

### 4.3 履歴は「変化時のみ」記録＋過去日削除（容量対策）【設計】【教訓】
- 毎回の取得値を前回と比較し、**価格か在庫が変化した時だけ** `price_history` に1行追記。毎日全件記録だと500MBを圧迫するが、変化時のみなら**無料枠の1割未満**。
- **チェックイン日を過ぎた** `nightly_price`/`price_history`/`favorites` はバッチ実行時に自動 DELETE。
- 推移グラフ・最安/最高値（＋その日付）・カレンダーの値上がり/値下がり矢印は、すべてこの履歴からフロントで復元する（`trend.ts` の `buildTrend`/`trendStats`/`recentTotalChange`）。
- **【教訓】** セットアップ中に取得条件を変えながら複数回実行すると、同日に「見かけの変化」が溜まり偽の最安/最高・矢印が出る。運用開始後は1日1回の安定運用で再発しないが、初回分は該当日の履歴を「各プラン最新1件だけ残す」掃除SQLで一度整える。

### 4.4 取得予算とスケジュール【設計】
- フル取得 ≒ 365日 × 人数分。1.6秒間隔で **人数1種なら約10分、4種なら約40〜45分**（朝食絞込みでページング減）。
- **毎晩フル更新**（`--days 366`）＋**毎時はお気に入り日程だけ**（`--favorites-only`、数分で完了）の二段構え。
- **【要確認】** 楽天ウェブサービス規約の更新頻度要件・「楽天サービス利用」表示義務を遵守（フロント下部に表示）。

---

## 5. データモデル【設計】（`supabase/schema.sql` 参照）

| テーブル | 役割 | 主なカラム |
|---|---|---|
| `nightly_price` | 1泊単位の最新価格（バッチが upsert） | hotel_no, room_grade, stay_date, adult_num, min_total, plan_name, reserve_url, is_available, fetched_at / 一意制約 (hotel_no,room_grade,stay_date,adult_num) |
| `price_history` | 変化イベントのみ追記 | 同上 + recorded_at |
| `favorites` | お気に入り＋共有＋通知設定 | owner_id, room_grade, checkin_date, nights, adult_num, is_shared, notify_on_drop, notify_threshold, last_notified_total, lowest_total, price_at_saved |
| `profiles` | 共有時の表示名（auth 連動トリガーで自動生成） | id, display_name |

### RLS（行レベル権限）方針【設計】
- `nightly_price`/`price_history`: 認証済みは**読取のみ**、書込は service role（バッチ）だけ。
- `favorites`: **自分の全件 + 他人の `is_shared=true`** を閲覧可。編集/削除は `owner_id = auth.uid()` のみ。
- 認証は Supabase Auth。**サインアップ無効化＋招待メール**で身内限定。

---

## 6. バッチ仕様【設計】（`batch/fetch_prices.py` 参照）

```
起動 → キー長のフィンガープリント表示（貼り間違い検知）
     → 過去日を掃除（price/history/favorites）
     → お気に入り読込（毎時モード用）
     → 対象(泊日,人数)を決定
        通常: today..+N日 × 人数リスト
        --favorites-only: お気に入りの日程×人数だけ
     → 各対象を1泊クエリ（全ページング／Refererヘッダ／1.6秒間隔）
        404/空きなし → is_available=false
        roomClass/roomName で3グレード分類、grade別 min_total を算出
     → nightly_price に upsert
     → 変化した分だけ price_history に追記
     → お気に入りの lowest_total 更新＋閾値割れでメール通知
```

- **リトライ**: 429/500/503 は指数バックオフ（2s,4s,8s…最大数回）。通信エラーも同様。
- **べき等**: 一意制約＋ upsert で再実行安全。
- **フェイルセーフ【教訓】**: **最初の10連続失敗（成功0）で即中断**し原因（IP許可等）をログ出力。**全滅を「成功」と誤報しない**よう、成功0件なら exit 1。
- **環境変数**: `RAKUTEN_APP_ID`, `RAKUTEN_ACCESS_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, （通知用）`SMTP_USERNAME`, `SMTP_PASSWORD`, `APP_URL`。**先頭/末尾の空白は strip する**（貼付け時の改行混入対策）。

### メール通知【設計】
- お気に入りごとに `notify_threshold`（円）を設定。**合計参考価格が閾値以下**になったら owner のメールへ送信。
- **同じ価格で連投しない**（`last_notified_total` より下がった時だけ再送、閾値超過でリセット）。
- 送信は SMTP（既定 Gmail SSL 465）。`SMTP_*` 未設定なら通知だけスキップし本体は正常動作。

---

## 7. フロント仕様【設計】（`app/src/` 参照）

- **カレンダー**（`CalendarView` / `DayDetail`）: 月表示。
  - 泊数プルダウン、**グレード複数選択**（選択数に応じ1〜3行。多選択時は V/S/P の色付き頭文字＋`¥金額`、単独時は金額のみ大きく）。
  - **月内最安日を緑**の金額で強調。
  - **前回更新からの値上がり↑（赤）／値下がり↓（緑）矢印**。変動率で1〜3本（≥1%/≥5%/≥10%）。データ最終更新から2日以内の変化のみ表示し、動きがなければ自然に消える。
  - **左右スワイプで月移動**（横方向優位のときだけ発火し縦スクロールと両立）。
  - **祝日は日番号を赤**（`holidays.ts` が計算：固定祝日＋ハッピーマンデー＋春分秋分＋振替休日＋国民の休日）。
  - セルタップで**詳細ボトムシート**（✕閉じるボタン＋各泊内訳＋**推移グラフ**（最安/最高とその日付）＋予約リンク＋★保存）。
- **最安検索**（`SearchView`）: 泊数/出発曜日/グレード（複数選択）＋**月単位の期間プルダウン（日本語 `YYYY年M月`）**。DB上で計算しAPIは叩かない。安い順表示。各結果に予約リンク・楽パックボタン・★保存。
- **お気に入り**（`FavoritesView`）: 保存/共有トグル/通知閾値設定/削除。保存時価格との差分・これまで最安・**価格推移グラフ**（カードごとに履歴ロード）を表示。
- **推移グラフ**（`TrendChart` / `trend.ts`）: 履歴の変化イベントからN泊合計のステップ折れ線を復元。最安（緑）・最高（赤）の点と**その日付**を表示。
- **認証**（`LoginView` / `SetPasswordView`）: 招待・再設定リンクからの**自前パスワード設定画面**、パスワード表示切替、「パスワードを忘れた」再送。
- **予約リンク**（`rakuten.ts`）: 「サイトで確認」（宿泊のみ・日付入り）＋「ANA楽パック」（**帰り便別に2ボタン**＝往路固定・復路 `nsBinHukuro` 違い、**レンタカー付き `fRcUmu=1`**）。カレンダー詳細/検索結果/お気に入りの全カードに設置。すべて**楽天公式ドメインへ直リンク**（アフィリエイト/トラッキングID無し）。
- **PWA**: `manifest.webmanifest`＋アイコンでホーム画面に追加可能（standalone）。外部リンクが**アプリ画面を置換しない**ため、スマホで「アプリが閉じる」現象を回避。
- **デモモード**: Supabase 未接続時はバンドルしたサンプルJSON（`public/demo-data.json` / `demo-history.json`）で動作（見た目確認用・お気に入りは端末内保存）。

---

## 8. 他アプリへの応用チェックリスト【要差替】

新しいホテル/対象へ転用する際、**必ず差し替える/確定する**項目:

- [ ] 対象ホテルの **`hotelNo`**（KeywordHotelSearch で `keyword=施設名` → hotelName で確認）
- [ ] 監視する**グレード定義**（`config/room_grades.json` の `room_class`/`room_name_patterns`）※実レスポンスで確定
- [ ] **`squeeze_condition`**（朝食付き `breakfast` 等。素泊まり含むなら削除）
- [ ] **人数条件**（`--adults` の既定。ヴィラ等は定員に注意）
- [ ] **予約ディープリンク**の地域コード（`f_dai/f_chu/f_shou`、パッケージの `cdTomariTiikiKen/Tiiki`）と**空港コード**（`cdHatuKuukou/cdTyakuKuukou`）
- [ ] **航空便番号**（`nsBinOuro/nsBinHukuro`。往路固定＋復路2便の構成。季節ダイヤで変わる。レンタカー要否 `fRcUmu`。不要なら楽パックボタン自体を削除）
- [ ] **参照値**（会員割引前後の比較などホテル固有の数値。使わないなら削除）
- [ ] **祝日ロジック**（`holidays.ts` は日本の祝日。海外/別基準なら差替。年更新は不要＝計算式）
- [ ] **アプリ名・アイコン・テーマ色**（`index.html` / `manifest.webmanifest` / 画面ヘッダ）
- [ ] **楽天アプリ登録**（applicationId/accessKey 取得、Allowed IP に `0.0.0.0/0`）
- [ ] **Supabase**（プロジェクト作成→`schema.sql`実行→サインアップ無効化→招待→URL Configuration）
- [ ] **GitHub Secrets** と **Vercel 環境変数** の設定（`docs/SETUP.md` 参照）
- [ ] **利用規約の遵守**（更新頻度・楽天サービス利用表示）

---

## 9. ハマりどころ集【教訓】

実際に遭遇した罠と対策。応用時に同じ問題が出たら参照。

| 症状 | 原因 | 対策 |
|---|---|---|
| API が `wrong_parameter / specify valid applicationId` | 旧エンドポイントに新UUIDキーを送っている | `openapi.rakuten.co.jp` の新エンドポイントを使う |
| `accessKey must be present` | 新仕様は accessKey 必須 | applicationId と accessKey の両方を送る |
| 全リクエスト 403 `Invalid Access Key` | 実行元IPが Allowed IP 外（GitHub は毎回IP変動） | `0.0.0.0/0` を登録（またはキー貼付けミス） |
| バッチが「成功」なのにDB空 | 全リクエスト失敗を握りつぶしていた | 10連続失敗で中断＋成功0で exit 1 |
| Supabase 書込で `PGRST205 table not found` | マイグレーションSQL未実行 | `schema.sql` / 追加SQL を実行。未実行を検知して案内表示 |
| キー長は正しいのに 403 継続 | Secret に**改行/空白が混入** | 値を strip、フィンガープリント（先頭数文字＋文字数）をログ出力して切り分け |
| 連泊なのに1泊分の価格 | API は初日しか返さない | 1泊単位取得＋合算 |
| 予約リンクが1泊表示になる | `reserveUrl` に1泊検索条件が埋まっている | 泊数入りURLを自前生成 |
| 楽パック旅程ページが「応答が得られません」 | itinerary への直POSTはセッション必須 | 正規入口 planList に GET リンク |
| 月ピッカーが英語表示 | OS標準 `<input type=month>` は端末ロケール依存 | 自前の `YYYY年M月` プルダウンに置換 |
| 外部リンクを開くとアプリが閉じたように見える | ブラウザタブがアプリ画面を置換 | PWA（standalone）化＋`target=_blank` |
| Private リポジトリで Actions 無料枠超過 | 毎時更新は月2,000分を超える | リポジトリを Public に（キーはSecretsで安全） |
| 初日の履歴に偽の最安/最高・矢印が出る | セットアップ中の複数回実行・取得条件変更で同日に複数の履歴が入った | 該当日は「各プラン最新1件だけ残す」掃除SQL（`cleanup_*.sql`。1件のみのものは残す） |
| 招待/再設定メールのリンクを開いても設定画面が出ない | Supabase の Site URL / Redirect URL 未設定 | Authentication → URL Configuration にアプリURLを登録 |
| 招待メールが届かない/届くのが遅い | Supabase 無料枠の内蔵メールは送信数制限あり | 1人ずつ間隔を空けて送る（大量配信は外部SMTP） |

---

## 10. セキュリティ要点【設計】

- **キーはサーバ側（GitHub Secrets）のみ**。フロントに露出させない。フロントが持つのは Supabase anon キー（RLS で保護される公開用）だけ。
- 楽天キーは**楽天サーバーにしか送られない**。Supabase に渡るのは価格データのみ（構造上キーは混入しない）。
- 予約リンクは**楽天公式ドメインへ直リンク**。中継サーバー・短縮URL・トラッキングID無し。
- 万一キーを平文共有した場合は**楽天管理画面で再発行（ローテーション）**し Secrets を差し替える。
- SMTP は Gmail の**アプリパスワード**（2段階認証が前提）。本パスワードは使わない。
