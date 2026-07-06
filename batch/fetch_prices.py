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
import smtplib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from email.header import Header
from email.mime.text import MIMEText
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


def supabase_headers(service_key, extra=None):
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    if extra:
        headers.update(extra)
    return headers


def supabase_request(url, service_key, method="GET", data=None, extra_headers=None):
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, method=method,
                                 headers=supabase_headers(service_key, extra_headers))
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            text = resp.read().decode("utf-8")
            return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase {method} 失敗 HTTP {e.code}: {body_text[:300]}") from e


def upsert_rows(supabase_url, service_key, table, rows, on_conflict=None):
    """PostgREST 経由でテーブルへ insert/upsert する。"""
    url = supabase_url.rstrip("/") + f"/rest/v1/{table}"
    prefer = "return=minimal"
    if on_conflict:
        url += f"?on_conflict={on_conflict}"
        prefer = "resolution=merge-duplicates,return=minimal"
    for i in range(0, len(rows), UPSERT_CHUNK):
        supabase_request(url, service_key, method="POST", data=rows[i:i + UPSERT_CHUNK],
                         extra_headers={"Prefer": prefer})


def fetch_existing(supabase_url, service_key, hotel_no, date_from, date_to):
    """比較用に既存の nightly_price を取得。key=(grade, stay_date, adults) の辞書を返す。"""
    existing = {}
    offset = 0
    limit = 1000
    base = (supabase_url.rstrip("/")
            + "/rest/v1/nightly_price"
              f"?hotel_no=eq.{hotel_no}&stay_date=gte.{date_from}&stay_date=lte.{date_to}"
              "&select=room_grade,stay_date,adult_num,min_total,is_available"
              "&order=stay_date.asc")
    while True:
        data = supabase_request(f"{base}&limit={limit}&offset={offset}", service_key)
        for r in data or []:
            existing[(r["room_grade"], r["stay_date"], r["adult_num"])] = r
        if not data or len(data) < limit:
            return existing
        offset += limit


def prune_past(supabase_url, service_key, today_iso):
    """過去日（今日より前）の価格・履歴・お気に入りを削除する。"""
    for table, col in (("nightly_price", "stay_date"),
                       ("price_history", "stay_date"),
                       ("favorites", "checkin_date")):
        url = (supabase_url.rstrip("/")
               + f"/rest/v1/{table}?{col}=lt.{today_iso}")
        supabase_request(url, service_key, method="DELETE")


def load_favorites(supabase_url, service_key, today_iso):
    """今日以降のお気に入りを全ユーザー分取得する。"""
    url = (supabase_url.rstrip("/")
           + "/rest/v1/favorites"
             f"?checkin_date=gte.{today_iso}"
             "&select=id,owner_id,room_grade,checkin_date,nights,adult_num,"
             "notify_on_drop,notify_threshold,last_notified_total,lowest_total,price_at_saved")
    return supabase_request(url, service_key) or []


def get_user_email(supabase_url, service_key, user_id):
    """Supabase Auth Admin API でユーザーのメールアドレスを取得する。"""
    try:
        data = supabase_request(
            supabase_url.rstrip("/") + f"/auth/v1/admin/users/{user_id}", service_key)
        return (data or {}).get("email")
    except Exception as e:
        print(f"  メールアドレス取得失敗 ({user_id}): {e}", file=sys.stderr)
        return None


def send_mail(to_addr, subject, body):
    """SMTP(既定: Gmail)でメールを送る。SMTP_USERNAME/SMTP_PASSWORD が必要。"""
    user = os.environ.get("SMTP_USERNAME")
    password = os.environ.get("SMTP_PASSWORD")
    if not user or not password:
        return False
    host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    port = int(os.environ.get("SMTP_PORT", "465"))
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = Header(subject, "utf-8")
    msg["From"] = user
    msg["To"] = to_addr
    with smtplib.SMTP_SSL(host, port, timeout=30) as server:
        server.login(user, password)
        server.sendmail(user, [to_addr], msg.as_string())
    return True


def process_favorites(supabase_url, service_key, favorites, latest, grade_labels):
    """お気に入りの最安値を更新し、設定金額以下になったらメール通知する。

    通知ルール:
      - notify_on_drop が ON かつ notify_threshold(円)が設定されているお気に入りが対象
      - 合計参考価格が threshold 以下になったら通知
      - 同じ価格で繰り返し通知しない(前回通知した価格より更に下がった時だけ再通知)
      - 一度 threshold を上回ったらリセットし、再び下回れば改めて通知する
    """
    smtp_ready = bool(os.environ.get("SMTP_USERNAME") and os.environ.get("SMTP_PASSWORD"))
    app_url = os.environ.get("APP_URL", "")
    notified = 0
    for fav in favorites:
        checkin = datetime.date.fromisoformat(fav["checkin_date"])
        total = 0
        available = True
        for i in range(fav["nights"]):
            d = (checkin + datetime.timedelta(days=i)).isoformat()
            row = latest.get((fav["room_grade"], d, fav["adult_num"]))
            if row is None or not row["is_available"] or row["min_total"] is None:
                available = False
                break
            total += row["min_total"]
        if not available:
            continue

        patch = {}

        # 「これまで最安」の記録を更新
        lowest = fav.get("lowest_total")
        if lowest is None:
            saved = fav.get("price_at_saved")
            patch["lowest_total"] = min(total, saved) if saved else total
        elif total < lowest:
            patch["lowest_total"] = total

        # しきい値通知
        threshold = fav.get("notify_threshold")
        last_notified = fav.get("last_notified_total")
        if fav.get("notify_on_drop") and threshold is not None:
            if total <= threshold and (last_notified is None or total < last_notified):
                label = grade_labels.get(fav["room_grade"], fav["room_grade"])
                if not smtp_ready:
                    print("  しきい値到達(メール未設定のため通知スキップ): "
                          f"{fav['checkin_date']}発 {label} {total:,}円")
                else:
                    to_addr = get_user_email(supabase_url, service_key, fav["owner_id"])
                    if to_addr:
                        subject = (f"【フサキ価格モニター】{total:,}円に値下がり "
                                   f"{fav['checkin_date']}発{fav['nights']}泊 {label}")
                        body = (
                            f"お気に入りの参考価格が、設定した金額以下になりました。\n\n"
                            f"　部屋グレード: {label}\n"
                            f"　日程: {fav['checkin_date']} 発 "
                            f"{fav['nights']}泊{fav['nights'] + 1}日"
                            f" / 大人{fav['adult_num']}名\n"
                            f"　通知設定: {threshold:,}円以下\n"
                            f"　現在の価格: {total:,}円\n"
                            + (f"　これまでの最安: {lowest:,}円\n" if lowest else "")
                            + "\n"
                            + (f"アプリで確認: {app_url}\n\n" if app_url else "")
                            + "※1泊料金の合算による参考価格です。"
                              "実際の予約価格は楽天トラベルでご確認ください。\n")
                        try:
                            send_mail(to_addr, subject, body)
                            notified += 1
                            patch["last_notified_total"] = total
                            print(f"  通知メール送信: {to_addr} "
                                  f"({fav['checkin_date']} {label} {total:,}円)")
                        except Exception as e:
                            print(f"  メール送信失敗: {e}", file=sys.stderr)
            elif total > threshold and last_notified is not None:
                patch["last_notified_total"] = None  # 上回ったのでリセット

        if patch:
            supabase_request(
                supabase_url.rstrip("/") + f"/rest/v1/favorites?id=eq.{fav['id']}",
                service_key, method="PATCH", data=patch)
    return notified


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=60, help="今日から何日分取得するか")
    ap.add_argument("--start-offset", type=int, default=0, help="開始日のオフセット(日)")
    ap.add_argument("--adults", default="1,2,3,4", help="取得する人数(カンマ区切り)")
    ap.add_argument("--favorites-only", action="store_true",
                    help="お気に入りに登録された日程・人数だけ取得する(毎時バッチ用)")
    ap.add_argument("--dry-run", metavar="PATH", help="Supabaseに書かずJSONファイルへ出力")
    args = ap.parse_args()

    app_id = (os.environ.get("RAKUTEN_APP_ID") or "").strip()
    access_key = (os.environ.get("RAKUTEN_ACCESS_KEY") or "").strip()
    if not app_id or not access_key:
        sys.exit("環境変数 RAKUTEN_APP_ID / RAKUTEN_ACCESS_KEY を設定してください。")
    # Secretの貼り間違い切り分け用(キー本体はログに出さない)
    print(f"認証情報チェック: APP_ID={app_id[:4]}...({len(app_id)}文字) "
          f"ACCESS_KEY={access_key[:3]}...({len(access_key)}文字)")
    print("  期待値: APP_ID=8c45...(36文字) ACCESS_KEY=pk_...(46文字)")

    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not args.dry_run and (not supabase_url or not service_key):
        sys.exit("環境変数 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を設定してください"
                 "(検証だけなら --dry-run out.json を使用)。")
    if args.favorites_only and args.dry_run:
        sys.exit("--favorites-only はお気に入りをDBから読むため --dry-run と併用できません。")

    with open(CONFIG_PATH, encoding="utf-8") as f:
        config = json.load(f)
    hotel_no = config["hotel_no"]
    grades = config["grades"]
    grade_labels = {g["key"]: g["label"] for g in grades}
    adults_list = [int(a) for a in args.adults.split(",") if a.strip()]

    today = datetime.datetime.now(ZoneInfo("Asia/Tokyo")).date()
    one = datetime.timedelta(days=1)

    favorites = []
    if not args.dry_run:
        # 過去日の掃除(価格・履歴・お気に入り) + お気に入りの読み込み
        try:
            prune_past(supabase_url, service_key, today.isoformat())
            favorites = load_favorites(supabase_url, service_key, today.isoformat())
        except RuntimeError as e:
            msg = str(e)
            if "PGRST205" in msg or "PGRST204" in msg or "Could not find" in msg:
                sys.exit(
                    "エラー: Supabaseに必要なテーブル/列がありません。\n"
                    "SQL Editor で以下の2ファイルを実行してから再実行してください:\n"
                    "  - supabase/add_price_history.sql\n"
                    "  - supabase/add_favorite_notify.sql\n"
                    f"詳細: {msg}")
            raise

    # 取得対象の (宿泊日, 人数) ペアを決める
    if args.favorites_only:
        pair_set = set()
        for fav in favorites:
            checkin = datetime.date.fromisoformat(fav["checkin_date"])
            for i in range(fav["nights"]):
                pair_set.add((checkin + datetime.timedelta(days=i), fav["adult_num"]))
        pairs = sorted(pair_set)
        if not pairs:
            print("お気に入りが無いため取得対象なし。終了します。")
            return
        print(f"取得開始(お気に入りのみ): hotelNo={hotel_no} 対象 {len(pairs)}件 "
              f"(お気に入り{len(favorites)}件)")
    else:
        dates = [today + datetime.timedelta(days=args.start_offset + i)
                 for i in range(args.days)]
        pairs = [(d, adults) for d in dates for adults in adults_list]
        print(f"取得開始: hotelNo={hotel_no} {dates[0]}〜{dates[-1]} ({len(dates)}日) "
              f"人数={adults_list} dry_run={bool(args.dry_run)}")

    all_rows = []
    pending = []
    history_rows = []
    history_count = 0
    latest = {}  # (grade, stay_date, adults) -> {min_total, is_available}
    unmatched = {}
    furthest_available = None
    success_count = 0
    fail_streak = 0
    started = time.monotonic()

    existing = {}
    if not args.dry_run:
        # 変化検出用に既存データを取得
        existing = fetch_existing(supabase_url, service_key, hotel_no,
                                  pairs[0][0].isoformat(), pairs[-1][0].isoformat())
        print(f"既存データ: {len(existing)}件（変化した価格のみ履歴に記録）")

    for i, (d, adults) in enumerate(pairs):
        checkin = d.isoformat()
        checkout = (d + one).isoformat()
        fetched_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        try:
            entries = fetch_one_night(app_id, access_key, hotel_no, checkin, checkout, adults)
        except Exception as e:
            print(f"  {checkin} adults={adults}: 取得失敗 {e}", file=sys.stderr)
            fail_streak += 1
            if success_count == 0 and fail_streak >= 10:
                sys.exit(
                    "エラー: 最初の10リクエストがすべて失敗しました。処理を中断します。\n"
                    "403 (Invalid Access Key) の場合は、楽天アプリの設定で\n"
                    "Allowed IP addresses に 0.0.0.0/0 が登録されているか確認してください\n"
                    "(GitHub ActionsのIPは毎回変わるため、全IP許可が必要です)。")
            continue
        success_count += 1
        fail_streak = 0

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
            latest[(key, checkin, adults)] = {
                "min_total": row["min_total"],
                "is_available": row["is_available"],
            }

            # 価格か空室状況が前回から変化した時だけ履歴に記録
            old = existing.get((key, checkin, adults))
            if old is None or old.get("min_total") != row["min_total"] \
                    or bool(old.get("is_available")) != row["is_available"]:
                history_count += 1
                history_rows.append({
                    "hotel_no": hotel_no,
                    "room_grade": key,
                    "stay_date": checkin,
                    "adult_num": adults,
                    "min_total": row["min_total"],
                    "is_available": row["is_available"],
                    "recorded_at": fetched_at,
                })

        # 進捗保存: まとまったらupsert
        if not args.dry_run and len(pending) >= UPSERT_CHUNK:
            upsert_rows(supabase_url, service_key, "nightly_price", pending,
                        on_conflict="hotel_no,room_grade,stay_date,adult_num")
            pending = []
        if not args.dry_run and len(history_rows) >= UPSERT_CHUNK:
            upsert_rows(supabase_url, service_key, "price_history", history_rows)
            history_rows = []

        if i % 40 == 39:
            elapsed = time.monotonic() - started
            print(f"  進捗: {i + 1}/{len(pairs)} ({checkin} まで, {elapsed:.0f}s)")

    if not args.dry_run and pending:
        upsert_rows(supabase_url, service_key, "nightly_price", pending,
                    on_conflict="hotel_no,room_grade,stay_date,adult_num")
    if not args.dry_run and history_rows:
        upsert_rows(supabase_url, service_key, "price_history", history_rows)

    if args.dry_run:
        with open(args.dry_run, "w", encoding="utf-8") as f:
            json.dump(all_rows, f, ensure_ascii=False, indent=1)
        print(f"dry-run: {len(all_rows)}行を {args.dry_run} に出力")
    else:
        print(f"upsert完了: {len(all_rows)}行 / 履歴に記録した変化: {history_count}件")
        # お気に入りの最安値更新 + 値下がり通知
        notified = process_favorites(supabase_url, service_key, favorites,
                                     latest, grade_labels)
        if notified:
            print(f"値下がり通知メール: {notified}件送信")

    print(f"所要: {time.monotonic() - started:.0f}秒 / 空室データが取れた最遠日: {furthest_available}")
    if unmatched:
        print("グレード未分類のroomClass(マッチャ調整の参考):")
        for rc, rn in unmatched.items():
            print(f"  {rc}: {rn}")
    if pairs and success_count == 0:
        sys.exit("エラー: 全リクエストが失敗しました(成功0件)。上記のエラーを確認してください。")


if __name__ == "__main__":
    main()
