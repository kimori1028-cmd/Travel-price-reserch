#!/usr/bin/env python3
"""
フサキビーチリゾート 価格取得バッチ

楽天トラベル空室検索API(VacantHotelSearch)を1泊単位で叩き、
部屋グレード別の最安値を Supabase の nightly_price テーブルへ upsert する。

- 1リクエストごとに1.6秒以上待機(楽天レートリミット: 1req/秒 以上を厳守)
- 429/500/503 は指数バックオフでリトライ
- 404(データなし)は「空室なし/未受付」として正常扱い
- --dry-run PATH でSupabaseに書かずJSONに出力(検証・デモデータ生成用)

必要な環境変数:
  RAKUTEN_APP_ID, RAKUTEN_ACCESS_KEY
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (dry-run時は不要)

使い方:
  python batch/fetch_prices.py --days 60 --adults 1,2,3,4
  python batch/fetch_prices.py --days 366                # 年間フル取得
  python batch/fetch_prices.py --days 30 --dry-run out.json
"""

import argparse
import datetime
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

ENDPOINT = "https://openapi.rakuten.co.jp/engine/api/Travel/VacantHotelSearch/20170426"
REFERER = "https://github.com/kimori1028-cmd/Travel-price-reserch"
REQUEST_INTERVAL_SEC = 1.6
MAX_RETRIES = 4
UPSERT_CHUNK = 200

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "room_grades.json")

_last_request_at = 0.0


def throttle():
    """直前のAPIリクエストから最低間隔を空ける。"""
    global _last_request_at
    wait = _last_request_at + REQUEST_INTERVAL_SEC - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    _last_request_at = time.monotonic()


def api_get(params):
    """1リクエスト実行。404(データなし)は None、それ以外のエラーはリトライ後に例外。"""
    url = ENDPOINT + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "User-Agent": "fusaki-price-monitor/1.0",
        "Referer": REFERER,  # 新APIはReferer/Origin必須
    })
    backoff = 2.0
    for attempt in range(MAX_RETRIES + 1):
        throttle()
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            if e.code == 404:
                return None  # 空室なし/未受付 → 正常扱い
            if e.code in (429, 500, 503) and attempt < MAX_RETRIES:
                print(f"  HTTP {e.code} → {backoff:.0f}s待機してリトライ", file=sys.stderr)
                time.sleep(backoff)
                backoff *= 2
                continue
            raise RuntimeError(f"HTTP {e.code}: {body[:300]}") from e
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < MAX_RETRIES:
                print(f"  通信エラー({e}) → {backoff:.0f}s待機してリトライ", file=sys.stderr)
                time.sleep(backoff)
                backoff *= 2
                continue
            raise
    return None


def is_notfound(data):
    """レスポンスボディがデータなしエラーかどうか(旧/新フォーマット両対応)。"""
    if not isinstance(data, dict):
        return False
    if data.get("error") == "not_found":
        return True
    errors = data.get("errors")
    if isinstance(errors, dict) and errors.get("errorCode") == 404:
        return True
    return False


def check_error(data):
    if not isinstance(data, dict):
        raise RuntimeError(f"不正なレスポンス: {data!r}")
    if data.get("error"):
        raise RuntimeError(f"APIエラー: {data.get('error')} / {data.get('error_description')}")
    errors = data.get("errors")
    if isinstance(errors, dict):
        raise RuntimeError(f"APIエラー: {errors.get('errorCode')} / {errors.get('errorMessage')}")


def fetch_one_night(app_id, access_key, hotel_no, checkin, checkout, adults):
    """1泊分を全ページ取得し (roomBasicInfo, dailyCharge) のリストを返す。空きなしは []。"""
    entries = []
    page = 1
    while True:
        data = api_get({
            "format": "json",
            "applicationId": app_id,
            "accessKey": access_key,
            "hotelNo": hotel_no,
            "checkinDate": checkin,
            "checkoutDate": checkout,
            "adultNum": adults,
            "searchPattern": 1,
            "hits": 30,
            "page": page,
            "sort": "+roomCharge",
        })
        if data is None or is_notfound(data):
            return entries
        check_error(data)
        for hotel_wrap in data.get("hotels", []):
            for entry in hotel_wrap.get("hotel", []):
                room_info = entry.get("roomInfo")
                if not room_info:
                    continue
                basic = {}
                for item in room_info:
                    if "roomBasicInfo" in item:
                        basic = item["roomBasicInfo"]
                    if "dailyCharge" in item:
                        entries.append((basic, item["dailyCharge"]))
        paging = data.get("pagingInfo", {})
        if page >= paging.get("pageCount", 1):
            return entries
        page += 1


def classify(basic, grades):
    """roomClass優先・roomName正規表現フォールバックでグレードを判定。該当なしは None。"""
    room_class = (basic.get("roomClass") or "").strip()
    room_name = basic.get("roomName") or ""
    for g in grades:
        if room_class and room_class in g["room_class"]:
            return g["key"]
    for g in grades:
        for pat in g["room_name_patterns"]:
            if re.search(pat, room_name):
                return g["key"]
    return None


def upsert_rows(supabase_url, service_key, rows):
    """PostgREST 経由で nightly_price に upsert する。"""
    url = (supabase_url.rstrip("/")
           + "/rest/v1/nightly_price?on_conflict=hotel_no,room_grade,stay_date,adult_num")
    for i in range(0, len(rows), UPSERT_CHUNK):
        chunk = rows[i:i + UPSERT_CHUNK]
        body = json.dumps(chunk).encode("utf-8")
        req = urllib.request.Request(url, data=body, method="POST", headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        })
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                resp.read()
        except urllib.error.HTTPError as e:
            body_text = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase upsert失敗 HTTP {e.code}: {body_text[:300]}") from e


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=60, help="今日から何日分取得するか")
    ap.add_argument("--start-offset", type=int, default=0, help="開始日のオフセット(日)")
    ap.add_argument("--adults", default="1,2,3,4", help="取得する人数(カンマ区切り)")
    ap.add_argument("--dry-run", metavar="PATH", help="Supabaseに書かずJSONファイルへ出力")
    args = ap.parse_args()

    app_id = os.environ.get("RAKUTEN_APP_ID")
    access_key = os.environ.get("RAKUTEN_ACCESS_KEY")
    if not app_id or not access_key:
        sys.exit("環境変数 RAKUTEN_APP_ID / RAKUTEN_ACCESS_KEY を設定してください。")

    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not args.dry_run and (not supabase_url or not service_key):
        sys.exit("環境変数 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を設定してください"
                 "(検証だけなら --dry-run out.json を使用)。")

    with open(CONFIG_PATH, encoding="utf-8") as f:
        config = json.load(f)
    hotel_no = config["hotel_no"]
    grades = config["grades"]
    adults_list = [int(a) for a in args.adults.split(",") if a.strip()]

    today = datetime.datetime.now(ZoneInfo("Asia/Tokyo")).date()
    one = datetime.timedelta(days=1)
    dates = [today + datetime.timedelta(days=args.start_offset + i) for i in range(args.days)]

    total_requests = 0
    all_rows = []
    pending = []
    unmatched = {}
    furthest_available = None
    started = time.monotonic()

    print(f"取得開始: hotelNo={hotel_no} {dates[0]}〜{dates[-1]} ({len(dates)}日) "
          f"人数={adults_list} dry_run={bool(args.dry_run)}")

    for d in dates:
        checkin = d.isoformat()
        checkout = (d + one).isoformat()
        for adults in adults_list:
            fetched_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
            try:
                entries = fetch_one_night(app_id, access_key, hotel_no, checkin, checkout, adults)
            except Exception as e:
                print(f"  {checkin} adults={adults}: 取得失敗 {e}", file=sys.stderr)
                continue
            total_requests += 1  # 概算(ページングで実際は増える)

            best = {}  # grade_key -> (total, basic, charge)
            for basic, charge in entries:
                total = charge.get("total")
                if total is None:
                    continue
                key = classify(basic, grades)
                if key is None:
                    rc = basic.get("roomClass") or "?"
                    unmatched.setdefault(rc, basic.get("roomName"))
                    continue
                if key not in best or total < best[key][0]:
                    best[key] = (total, basic, charge)

            for g in grades:
                key = g["key"]
                if key in best:
                    total, basic, charge = best[key]
                    row = {
                        "hotel_no": hotel_no,
                        "room_grade": key,
                        "stay_date": checkin,
                        "adult_num": adults,
                        "min_total": total,
                        "plan_id": str(basic.get("planId") or ""),
                        "plan_name": basic.get("planName"),
                        "room_name": basic.get("roomName"),
                        "with_breakfast": bool(basic.get("withBreakfastFlag")),
                        "reserve_url": basic.get("reserveUrl"),
                        "is_available": True,
                        "fetched_at": fetched_at,
                    }
                    furthest_available = checkin
                else:
                    row = {
                        "hotel_no": hotel_no,
                        "room_grade": key,
                        "stay_date": checkin,
                        "adult_num": adults,
                        "min_total": None,
                        "plan_id": None,
                        "plan_name": None,
                        "room_name": None,
                        "with_breakfast": None,
                        "reserve_url": None,
                        "is_available": False,
                        "fetched_at": fetched_at,
                    }
                pending.append(row)
                all_rows.append(row)

        # 進捗保存: 日単位でまとまったらupsert
        if not args.dry_run and len(pending) >= UPSERT_CHUNK:
            upsert_rows(supabase_url, service_key, pending)
            pending = []

        if (d - dates[0]).days % 10 == 9:
            elapsed = time.monotonic() - started
            print(f"  進捗: {checkin} まで完了 ({elapsed:.0f}s)")

    if not args.dry_run and pending:
        upsert_rows(supabase_url, service_key, pending)

    if args.dry_run:
        with open(args.dry_run, "w", encoding="utf-8") as f:
            json.dump(all_rows, f, ensure_ascii=False, indent=1)
        print(f"dry-run: {len(all_rows)}行を {args.dry_run} に出力")
    else:
        print(f"upsert完了: {len(all_rows)}行")

    print(f"所要: {time.monotonic() - started:.0f}秒 / 空室データが取れた最遠日: {furthest_available}")
    if unmatched:
        print("グレード未分類のroomClass(マッチャ調整の参考):")
        for rc, rn in unmatched.items():
            print(f"  {rc}: {rn}")


if __name__ == "__main__":
    main()
