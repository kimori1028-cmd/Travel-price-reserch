# Travel Price Research

楽天トラベルの宿泊価格を調査・監視するプロジェクトです。

## フサキ価格モニター（Webアプリ）

石垣島「フサキビーチリゾート ホテル＆ヴィラズ」の3部屋グレード
（ヴィラスタンダード / スーペリアツイン / パティオスーペリアツイン）の価格を
毎時自動取得し、スマホで見られるカレンダー・最安値検索・お気に入り共有を提供します。

- 仕様書: [docs/spec.md](docs/spec.md)
- **セットアップ手順: [docs/SETUP.md](docs/SETUP.md)** ← 最初にここを読む
- 構成: GitHub Actions（バッチ）→ Supabase（DB/認証）← Vercel（フロント）

| ディレクトリ | 内容 |
|---|---|
| `app/` | Webフロント（React + TypeScript + Vite + Tailwind、モバイルファースト） |
| `batch/fetch_prices.py` | 価格取得バッチ（楽天API → Supabase upsert、レート制限遵守） |
| `config/room_grades.json` | 監視対象ホテル・部屋グレード判定設定 |
| `supabase/schema.sql` | DBスキーマ + RLS（Supabase SQL Editorで実行） |
| `.github/workflows/` | 毎時（直近60日）+ 毎晩（1年分）の自動取得 |

### ローカルでの確認

```bash
cd app
npm install
npm run dev   # Supabase未設定ならサンプルデータのデモモードで起動
```

バッチの検証（Supabaseに書かずJSON出力）:

```bash
export RAKUTEN_APP_ID="..." RAKUTEN_ACCESS_KEY="pk_..."
python3 batch/fetch_prices.py --days 7 --adults 2 --dry-run out.json
```

## rakuten_price_check.py（単発の価格確認スクリプト）

楽天トラベル空室検索APIが返す料金が、会員限定割引の適用前か適用後かを確認するためのスクリプト。
調査の結果、**APIは会員割引「前」の価格を返す**ことを確認済み（会員情報を渡す手段がAPIに無いため）。

```bash
export RAKUTEN_APP_ID="あなたのアプリID（UUID形式）"
export RAKUTEN_ACCESS_KEY="あなたのアクセスキー（pk_...）"
python3 rakuten_price_check.py [--hotel-no 9159] [--checkin 2026-09-12] [--checkout 2026-09-14] [--raw]
```

## 楽天APIの注意（2026年2月刷新後の新仕様）

- エンドポイントは `openapi.rakuten.co.jp`。`applicationId`（UUID）と `accessKey`（pk_...）が両方必須
- `Referer` または `Origin` ヘッダーが必須
- アプリ登録の「Allowed IP addresses」に実行元IPが必要
- レート制限: リクエスト間隔1.5秒以上を推奨（超過で429）
- 複数泊で問い合わせても料金は初泊分しか返らない → 1泊ずつ取得して合算する
- 価格は楽天ウェブサービスによる参考値です（Supported by [Rakuten Developers](https://webservice.rakuten.co.jp/)）
