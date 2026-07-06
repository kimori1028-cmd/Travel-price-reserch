# フサキ価格モニター セットアップ手順

仕様書（[spec.md](./spec.md)）どおり **Supabase + Vercel + GitHub Actions** 構成です。
以下を順番にやれば動きます（所要 30分ほど。すべて無料プランでOK）。

```
GitHub Actions（毎時/毎晩バッチ）→ 楽天トラベルAPI
        ↓ 書き込み
     Supabase（価格DB・認証・お気に入り）
        ↑ 読み取り
     Vercel（Webアプリ本体）← スマホでアクセス
```

---

## 1. Supabase の準備（DB・ログイン基盤）

1. https://supabase.com で無料アカウントを作成 → 「New project」でプロジェクト作成
   - Region は Tokyo (ap-northeast-1) 推奨。Database Password は控えておく。
2. 左メニュー **SQL Editor** → 「New query」→ このリポジトリの `supabase/schema.sql` の中身を全部貼り付けて **Run**
   - テーブル（価格・お気に入り・プロフィール）と権限設定（RLS）が一括で作られます。
3. **サインアップを無効化**（身内以外が登録できないように）:
   - Authentication → Sign In / Providers → Email → **「Allow new users to sign up」をOFF**
4. **身内のアカウントを発行**:
   - Authentication → Users → 「Add user」→「Create new user」でメールアドレスとパスワードを入力して作成
   - 「Auto Confirm User」にチェックを入れて作成する
   - 表示名はメールの@より前が自動で使われます（profiles テーブルで変更可）
5. **キーを控える**（Settings → API）:
   - `Project URL`（例: `https://xxxx.supabase.co`）
   - `anon` `public` キー … フロント用（公開されてもRLSで守られる）
   - `service_role` キー … **バッチ専用・絶対に公開しない**

## 2. GitHub の設定（毎時の価格取得バッチ）

1. リポジトリの **Settings → Secrets and variables → Actions → New repository secret** で4つ登録:

   | Name | 値 |
   |---|---|
   | `RAKUTEN_APP_ID` | 楽天のアプリID（UUID形式） |
   | `RAKUTEN_ACCESS_KEY` | 楽天のアクセスキー（pk_...） |
   | `SUPABASE_URL` | SupabaseのProject URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabaseの service_role キー |

2. **Actions タブ** → 左の `prices-nightly` → 「Run workflow」で初回のフル取得（1年分）を手動実行
   - 約1.5〜2時間かかります（楽天のレート制限を守るため）。完了するとSupabaseに価格が入ります。
3. 以後は自動で動きます:
   - **毎時15分**: 直近60日分を更新（約15分）
   - **毎晩 3:00 JST**: 1年分をフル更新

> ⚠️ **リポジトリが Private の場合の注意**: GitHub Actions の無料枠は Private リポジトリだと月2,000分までで、毎時更新（約400分/日）だと数日で使い切ります。対策はどちらか:
> - リポジトリを **Public にする**（Publicは無料枠無制限。キーはSecretsにあるので公開されません）
> - 毎時が不要なら `.github/workflows/prices-hourly.yml` の cron を `15 */3 * * *`（3時間ごと）などに減らす

> 💡 楽天アプリの「Allowed IP addresses」に GitHub Actions のIPを固定登録することはできません（IPが毎回変わるため）。楽天アプリの設定で **`0.0.0.0/0`（全IP許可）を1行入れてください**。キー自体がSecretsで秘匿されているため実用上問題ありません。

## 3. Vercel の設定（Webアプリ公開）

1. https://vercel.com で無料アカウント作成（GitHubアカウント連携でOK）
2. 「Add New → Project」→ このリポジトリ（Travel-price-reserch）を Import
3. 設定:
   - **Root Directory**: `app` ← 重要
   - Framework Preset: Vite（自動検出されるはず）
4. **Environment Variables** に2つ追加:

   | Name | 値 |
   |---|---|
   | `VITE_SUPABASE_URL` | SupabaseのProject URL |
   | `VITE_SUPABASE_ANON_KEY` | Supabaseの anon キー |

5. Deploy → 発行されたURL（`https://xxx.vercel.app`）をスマホで開き、手順1-4で作ったアカウントでログイン

## 4. 動作確認チェックリスト

- [ ] ログイン画面が出て、発行したアカウントで入れる
- [ ] カレンダーに価格が表示される（初回はnightlyバッチ完了後）
- [ ] 泊数（3泊/4泊）・人数（1〜4名）・グレード切替が効く
- [ ] 最安検索で結果が出る
- [ ] お気に入り保存 →「共有する」→ 別アカウントでも見える

## 価格推移機能の追加（既にセットアップ済みの場合）

日付詳細に「これまでの最安値・最高値・価格推移グラフ」を表示する機能を後から追加した場合は、
Supabase の SQL Editor で `supabase/add_price_history.sql` を **1回だけ** 実行してください
（履歴テーブルの作成と、現在価格を起点として登録します）。

- 履歴は「価格や空室状況が変化した時だけ」記録されるため、容量は無料枠の1割以下に収まります。
- 過去になった日付の価格・履歴は毎回のバッチで自動削除されます。
- 新規セットアップの場合は `schema.sql` に含まれているため、この手順は不要です。

## 補足

- **デモモード**: Vercelの環境変数を設定しないままデプロイすると、リポジトリ内のサンプルデータで動く「デモモード」になります（ログイン不要・お気に入りは端末内保存）。まず見た目を確認したい場合に便利です。
- **価格は参考値**: 連泊合計は「1泊料金の合算」なので、連泊割引等がある場合は実価格とずれます。必ず楽天トラベルのリンク先で最終確認してください。
- **部屋グレードの判定**: `config/room_grades.json` で管理しています。楽天側の部屋名が変わって拾えなくなった場合はこのファイルを調整してください（バッチのログに未分類の部屋タイプが出ます）。
- **監視対象ホテルの変更**: 同ファイルの `hotel_no` と grades を書き換えれば他ホテルにも流用できます。
