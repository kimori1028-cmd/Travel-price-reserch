# Travel Price Research

楽天トラベル空室検索API（VacantHotelSearch）が返す料金が、楽天トラベルのページ表示のどちらに一致するかを確認するためのスクリプトです。

- 76,440円 = 会員限定割引「前」の合計（大人2人 / 2泊 / 1室）
- 71,854円 = 会員限定割引「後」の合計（-4,586円 適用後）

返ってきた合計が 76,440 側なら「会員割引は反映されない」、71,854 側なら「反映される」と判断できます。

## 使い方

2026年2月の楽天ウェブサービス刷新後の新API（`openapi.rakuten.co.jp`）に対応しています。
アプリID（UUID形式）とアクセスキー（`pk_` で始まる）の両方が必要です。

```bash
export RAKUTEN_APP_ID="あなたのアプリID（UUID形式）"
export RAKUTEN_ACCESS_KEY="あなたのアクセスキー（pk_...）"
python3 rakuten_price_check.py

# 生JSONも見たい場合
python3 rakuten_price_check.py --raw
```

### オプション

| オプション | デフォルト | 説明 |
|---|---|---|
| `--hotel-no` | `9159` | 楽天トラベルのホテル番号 |
| `--checkin` | `2026-09-12` | チェックイン日 |
| `--checkout` | `2026-09-14` | チェックアウト日 |
| `--adults` | `2` | 大人の人数 |
| `--squeeze` | `breakfast` | 絞り込み条件（squeezeCondition） |
| `--raw` | - | APIの生JSONを出力 |

## 注意

- アプリ登録時の「Allowed IP addresses」に、スクリプトを実行するマシンのグローバルIPが含まれている必要があります。
- 新APIは `Referer` または `Origin` ヘッダーが必須です（スクリプトが自動で付与します）。
- リクエスト間隔は1.5秒以上空けてください（超えると 429 Too Many Requests）。
- 会員ログインをAPIに渡す手段はありません。
- 標準ライブラリのみで動作します（追加パッケージ不要、Python 3 が必要）。
