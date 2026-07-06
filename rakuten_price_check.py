#!/usr/bin/env python3
"""
楽天トラベル空室検索API(VacantHotelSearch) 価格確認スクリプト

目的:
  APIが返す料金が、楽天トラベルのページ表示のどちらに一致するかを「事実」として確認する。
    - 76,440円 = 会員限定割引「前」の合計 (大人2人/2泊/1室)
    - 71,854円 = 会員限定割引「後」の合計 (-4,586円 適用後)
  → 返ってきた合計が 76,440 側なら「反映されない」、71,854 側なら「反映される」。

使い方:
  export RAKUTEN_APP_ID="あなたのアプリID (UUID形式)"
  export RAKUTEN_ACCESS_KEY="あなたのアクセスキー (pk_ で始まる)"
  python rakuten_price_check.py
  # 生JSONも見たい場合:
  python rakuten_price_check.py --raw

注意:
  - 2026年2月のAPI刷新後の新仕様 (openapi.rakuten.co.jp) に対応。
    applicationId (UUID) と accessKey の両方が必須。
  - アプリ登録時の Allowed IP addresses に実行元のIPが含まれている必要がある。
  - 会員ログインを渡す手段はAPIに無い。
  - 複数泊で問い合わせてもAPIは初泊のdailyChargeしか返さないため、
    このスクリプトは1泊ずつ問い合わせてプラン別に合算する。
  - リクエスト間隔は1.5秒以上空けること (429 Too Many Requests になる)。
"""

import argparse
import datetime
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ENDPOINT = "https://openapi.rakuten.co.jp/engine/api/Travel/VacantHotelSearch/20170426"
REFERER = "https://github.com/kimori1028-cmd/Travel-price-reserch"
REQUEST_INTERVAL_SEC = 2.0  # 新APIのレート制限 (1.5秒以上) を守る

# ページ表示の参照値（大人2人/2泊/1室）
REF_BEFORE_DISCOUNT = 76440  # 会員限定割引 前
REF_AFTER_DISCOUNT = 71854   # 会員限定割引 後 (-4,586)


def fetch(app_id, access_key, hotel_no, checkin, checkout, adult_num, squeeze, page=1):
    params = {
        "format": "json",
        "applicationId": app_id,
        "accessKey": access_key,
        "hotelNo": hotel_no,
        "checkinDate": checkin,
        "checkoutDate": checkout,
        "adultNum": adult_num,
        "squeezeCondition": squeeze,   # breakfast など
        "searchPattern": 1,            # 宿泊プランごと
        "page": page,
        "sort": "+roomCharge",
    }
    url = ENDPOINT + "?" + urllib.parse.urlencode(params)
    headers = {
        "User-Agent": "price-check/1.0",
        "Referer": REFERER,  # 新APIはReferer/Originが無いと403になる
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            return json.loads(body)
        except ValueError:
            raise RuntimeError(f"HTTP {e.code}: {body[:500]}") from e


def check_api_error(data):
    if isinstance(data, dict) and data.get("error"):
        sys.exit(f"APIエラー: {data.get('error')} / {data.get('error_description')}")
    if isinstance(data, dict) and data.get("errors"):
        err = data["errors"]
        sys.exit(f"APIエラー: {err.get('errorCode')} / {err.get('errorMessage')}")


def iter_room_entries(data):
    """レスポンス中の (roomBasicInfo, dailyCharge) の組を順に返す。"""
    for hotel_wrap in data.get("hotels", []):
        for entry in hotel_wrap.get("hotel", []):
            room_info = entry.get("roomInfo")
            if not room_info:
                continue
            room_basic = {}
            for item in room_info:
                if "roomBasicInfo" in item:
                    room_basic = item["roomBasicInfo"]
                if "dailyCharge" in item:
                    yield room_basic, item["dailyCharge"]


def fetch_all_pages(app_id, access_key, hotel_no, checkin, checkout, adults, squeeze, raw):
    """全ページを取得して (roomBasicInfo, dailyCharge) のリストを返す。"""
    results = []
    page = 1
    while True:
        data = fetch(app_id, access_key, hotel_no, checkin, checkout, adults, squeeze, page)
        check_api_error(data)
        if raw:
            print(json.dumps(data, ensure_ascii=False, indent=2))
            print("=" * 60)
        results.extend(iter_room_entries(data))
        paging = data.get("pagingInfo", {})
        if page >= paging.get("pageCount", 1):
            break
        page += 1
        time.sleep(REQUEST_INTERVAL_SEC)
    return results


def date_range(checkin, checkout):
    """checkin〜checkout(泊数分)の (泊日, 翌日) のペアを返す。"""
    d0 = datetime.date.fromisoformat(checkin)
    d1 = datetime.date.fromisoformat(checkout)
    if d1 <= d0:
        sys.exit("checkout は checkin より後の日付にしてください。")
    one = datetime.timedelta(days=1)
    d = d0
    while d < d1:
        yield d.isoformat(), (d + one).isoformat()
        d += one


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
    access_key = os.environ.get("RAKUTEN_ACCESS_KEY")
    if not access_key:
        sys.exit("環境変数 RAKUTEN_ACCESS_KEY が未設定です。 export RAKUTEN_ACCESS_KEY=pk_... を実行してください。")

    # APIは複数泊指定でも初泊分しか返さないため、1泊ずつ取得してプラン別に合算する
    nights = list(date_range(args.checkin, args.checkout))
    plans = {}  # (planId, roomName) -> {info, nights: {stayDate: total}}
    for i, (n_in, n_out) in enumerate(nights):
        if i > 0:
            time.sleep(REQUEST_INTERVAL_SEC)
        try:
            entries = fetch_all_pages(app_id, access_key, args.hotel_no,
                                      n_in, n_out, args.adults, args.squeeze, args.raw)
        except Exception as e:
            sys.exit(f"リクエスト失敗 ({n_in}泊分): {e}")
        for basic, charge in entries:
            key = (basic.get("planId"), basic.get("roomName"))
            p = plans.setdefault(key, {
                "planName": basic.get("planName"),
                "roomName": basic.get("roomName"),
                "planId": basic.get("planId"),
                "withBreakfastFlag": basic.get("withBreakfastFlag"),
                "nights": {},
            })
            if charge.get("total") is not None:
                p["nights"][charge.get("stayDate")] = charge["total"]

    if not plans:
        print("該当プランが返りませんでした（条件に合う空室が無い/絞り込み過多の可能性）。")
        return

    n_nights = len(nights)
    print(f"条件: hotelNo={args.hotel_no} {args.checkin}→{args.checkout} ({n_nights}泊) "
          f"大人{args.adults}名 squeeze={args.squeeze}")
    print(f"参照値: 割引前 {REF_BEFORE_DISCOUNT:,}円 / 割引後 {REF_AFTER_DISCOUNT:,}円")
    print("=" * 60)
    # 全泊そろったプランを合計の昇順で表示し、そろわないものは後ろに回す
    ordered = sorted(plans.values(),
                     key=lambda p: (len(p["nights"]) < n_nights,
                                    sum(p["nights"].values())))
    for i, p in enumerate(ordered, 1):
        bf = {1: "朝食あり", 0: "朝食なし"}.get(p["withBreakfastFlag"], "?")
        night_list = sorted(p["nights"].items())
        total = sum(t for _, t in night_list)
        print(f"[{i}] {p['planName']}")
        print(f"    room: {p['roomName']} / planId={p['planId']} / {bf}")
        print(f"    各泊: {night_list}")
        if len(night_list) < n_nights:
            print(f"    合計: （{len(night_list)}/{n_nights}泊分のみ取得。全泊の空きが無い可能性）")
        else:
            print(f"    合計({n_nights}泊): {total:,}円  {compare(total)}")
        print("-" * 60)


if __name__ == "__main__":
    main()
