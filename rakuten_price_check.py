#!/usr/bin/env python3
"""
楽天トラベル空室検索API(VacantHotelSearch) 価格確認スクリプト

目的:
  APIが返す料金が、楽天トラベルのページ表示のどちらに一致するかを「事実」として確認する。
    - 76,440円 = 会員限定割引「前」の合計 (大人2人/2泊/1室)
    - 71,854円 = 会員限定割引「後」の合計 (-4,586円 適用後)
  → 返ってきた合計が 76,440 側なら「反映されない」、71,854 側なら「反映される」。

使い方:
  export RAKUTEN_APP_ID="あなたのアプリID"
  python rakuten_price_check.py
  # 生JSONも見たい場合:
  python rakuten_price_check.py --raw

注意:
  - 認証は applicationId のみ。会員ログインを渡す手段はAPIに無い。
  - 短時間に同一URLへ大量アクセスすると一時的に制限される場合がある。
"""

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request

ENDPOINT = "https://app.rakuten.co.jp/services/api/Travel/VacantHotelSearch/20170426"

# ページ表示の参照値（大人2人/2泊/1室）
REF_BEFORE_DISCOUNT = 76440  # 会員限定割引 前
REF_AFTER_DISCOUNT = 71854   # 会員限定割引 後 (-4,586)


def fetch(app_id, hotel_no, checkin, checkout, adult_num, squeeze):
    params = {
        "format": "json",
        "applicationId": app_id,
        "hotelNo": hotel_no,
        "checkinDate": checkin,
        "checkoutDate": checkout,
        "adultNum": adult_num,
        "squeezeCondition": squeeze,   # breakfast など
        "sort": "+roomCharge",
    }
    url = ENDPOINT + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "price-check/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def extract_plans(data):
    """各プランごとに planName / roomName / 各泊のtotal / 合計 を取り出す。"""
    plans = []
    for hotel_wrap in data.get("hotels", []):
        hotel = hotel_wrap.get("hotel", [])
        for entry in hotel:
            room_info = entry.get("roomInfo")
            if not room_info:
                continue
            room_basic = {}
            charges = []
            for item in room_info:
                if "roomBasicInfo" in item:
                    room_basic = item["roomBasicInfo"]
                if "dailyCharge" in item:
                    charges.append(item["dailyCharge"])
            totals = [c.get("total") for c in charges if c.get("total") is not None]
            plans.append({
                "planName": room_basic.get("planName"),
                "roomName": room_basic.get("roomName"),
                "planId": room_basic.get("planId"),
                "withBreakfastFlag": room_basic.get("withBreakfastFlag"),
                "nights": [(c.get("stayDate"), c.get("total")) for c in charges],
                "sum_total": sum(totals) if totals else None,
            })
    return plans


def compare(value):
    if value is None:
        return "（合計が取得できず）"
    d_before = abs(value - REF_BEFORE_DISCOUNT)
    d_after = abs(value - REF_AFTER_DISCOUNT)
    if d_before <= d_after:
        return f"→ 76,440(割引前)に近い : 差 {d_before}円 ＝ 会員割引は反映されていない可能性"
    return f"→ 71,854(割引後)に近い : 差 {d_after}円 ＝ 会員割引が反映されている可能性"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hotel-no", default="9159")
    ap.add_argument("--checkin", default="2026-09-12")
    ap.add_argument("--checkout", default="2026-09-14")
    ap.add_argument("--adults", default="2")
    ap.add_argument("--squeeze", default="breakfast")
    ap.add_argument("--raw", action="store_true", help="生JSONを出力")
    args = ap.parse_args()

    app_id = os.environ.get("RAKUTEN_APP_ID")
    if not app_id:
        sys.exit("環境変数 RAKUTEN_APP_ID が未設定です。 export RAKUTEN_APP_ID=... を実行してください。")

    try:
        data = fetch(app_id, args.hotel_no, args.checkin, args.checkout, args.adults, args.squeeze)
    except Exception as e:
        sys.exit(f"リクエスト失敗: {e}")

    if isinstance(data, dict) and data.get("error"):
        sys.exit(f"APIエラー: {data.get('error')} / {data.get('error_description')}")

    if args.raw:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        print("=" * 60)

    plans = extract_plans(data)
    if not plans:
        print("該当プランが返りませんでした（条件に合う空室が無い/絞り込み過多の可能性）。")
        return

    print(f"条件: hotelNo={args.hotel_no} {args.checkin}→{args.checkout} "
          f"大人{args.adults}名 squeeze={args.squeeze}")
    print(f"参照値: 割引前 {REF_BEFORE_DISCOUNT:,}円 / 割引後 {REF_AFTER_DISCOUNT:,}円")
    print("=" * 60)
    for i, p in enumerate(plans, 1):
        bf = {1: "朝食あり", 0: "朝食なし"}.get(p["withBreakfastFlag"], "?")
        print(f"[{i}] {p['planName']}")
        print(f"    room: {p['roomName']} / planId={p['planId']} / {bf}")
        print(f"    各泊: {p['nights']}")
        sum_str = f"{p['sum_total']:,}円" if p["sum_total"] is not None else "不明"
        print(f"    合計(各泊totalの和): {sum_str}  {compare(p['sum_total'])}")
        print("-" * 60)


if __name__ == "__main__":
    main()
