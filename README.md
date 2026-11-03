# SmartBee store connector

> רוצים התקנה בעזרת AI? מדביקים את כל הקובץ הזה ל-Claude או ChatGPT ואומרים "תעביר אותי בהתקנה צעד אחר צעד". המדריך באנגלית בסוף הקובץ.

קבלות SmartBee אוטומטיות מהחנות שלכם, ואם תרצו גם תשלום באשראי דרך Cardcom.
הכול רץ על חשבון ה-Cloudflare שלכם. אתם מחזיקים את כל המפתחות, ואף אחד אחר (גם לא Automatziot) לא יכול לקרוא אותם.

רישיון: [PolyForm Internal Use 1.0.0](LICENSE). מותר להפעיל לעסק שלכם, להמשיך להשתמש גם אחרי שמפסיקים לעבוד איתנו. אסור למכור או להפיץ הלאה.

## מה זה עושה

- **קבלות:** הזמנה ששולמה בחנות (Lovable, Wix עם Velo, אתר מותאם) שולחת בקשה אחת, ו-SmartBee מפיקה קבלה ושולחת אותה ללקוח במייל.
- **תשלום באשראי (Cardcom):** החנות מבקשת דף תשלום, הלקוח משלם בדף של Cardcom (פרטי הכרטיס לא עוברים אצלנו או אצל החנות), ואחרי שהתשלום מאומת מול Cardcom, הקבלה יוצאת ב-SmartBee לבד עם 4 הספרות האחרונות.

## שני מצבים, אותו קוד

| מצב | מה ממלאים | מה עובד |
|---|---|---|
| קבלות בלבד | הגדרות SmartBee | `POST /receipt` לכל אמצעי תשלום. `/pay` עונה `card_payments_disabled` |
| קבלות + אשראי | הגדרות SmartBee + שתי הגדרות Cardcom | הכול. אשראי דרך `/pay`, שאר אמצעי התשלום דרך `/receipt` |

מוסיפים או מורידים את האשראי בכל רגע רק דרך ההגדרות, בלי לגעת בקוד.

מה הקבלה כוללת בתשלום באשראי: הסכום שחויב בפועל, 4 ספרות אחרונות, סוג הכרטיס, מספר תשלומים ומספר אישור. כל מספרי הקבלות נקבעים ב-SmartBee בלבד. ה-Worker רק זוכר איזו קבלה שייכת לאיזו הזמנה (מסד D1 קטן בשם `smartbee-memory` שנוצר לבד בהתקנה הראשונה), וכל שאלה חוזרת נקראת מחדש מ-SmartBee.

הגנות: הזמנה לא תפיק שתי קבלות; להזמנה ששולמה לא ייפתח דף תשלום נוסף; התשלום מאומת ישירות מול Cardcom לפני הקבלה; זיכוי לא מפיק קבלה אוטומטית; סכום שחויב ושונה מסכום ההזמנה מסומן `amount_mismatch`.

## מה צריך לפני ההתקנה (הכול בשם העסק)

| מה | מאיפה |
|---|---|
| חשבון GitHub (חינם) | github.com |
| חשבון Cloudflare (חינם) | cloudflare.com |
| SmartBee: API client id, API password, provider user token | מ-SmartBee (מבקשים גישת API לחשבון הייצור) |
| Cardcom, רק אם רוצים אשראי: מספר מסוף, שם משתמש ממשקים | פורטל Cardcom: הגדרות ← 1. הגדרות חברה ומשתמשים ← 4. ניהול מפתחות API לממשק |

## התקנה

### 1. עותק משלכם של הקוד
1. Automatziot מוסיפים את משתמש ה-GitHub שלכם כקורא בלבד ל-repo הזה.
2. בעמוד ה-repo לוחצים **Fork**. נוצר עותק פרטי אצלכם.

### 2. הקמה ב-Cloudflare
1. נכנסים ל-Cloudflare בעצמכם.
2. **Workers & Pages ← Create ← Import a repository**, מחברים את GitHub ובוחרים את ה-fork.
3. משאירים את ההגדרות כמו שהן ולוחצים **Deploy**. בסוף מתקבלת כתובת בסגנון `https://smartbee-store-connector.<שם>.workers.dev`.
4. אם ההתקנה נעצרת על מסד הנתונים (אין הרשאה ליצור אותו): Storage & Databases ← D1 ← Create database, שם `smartbee-memory`; ואז ב-GitHub עורכים את `wrangler.toml` ומוסיפים מתחת ל-`database_name` את השורה `database_id = "<המזהה שמופיע ב-D1>"`. שומרים, ו-Cloudflare מתקין שוב לבד. הטבלה נוצרת לבד, אין צורך בשום סקריפט.

### 3. ההגדרות: אתם מקלידים, לבד
Worker ← **Settings ← Variables and Secrets ← Add**. כל ערך מסוג **Secret** נשמר מוצפן, ואחרי השמירה אי אפשר לקרוא אותו שוב, גם לא מנהל בחשבון.

כדאי לעשות את השלב הזה כשאף אחד לא צופה במסך (אם יש שיתוף מסך, עוצרים אותו לשלב הזה).

| שם | סוג | ערך |
|---|---|---|
| `SMARTBEE_CLIENT_ID` | Secret | מ-SmartBee |
| `SMARTBEE_PASSWORD` | Secret | מ-SmartBee |
| `PROVIDERUSERTOKEN` | Secret | מ-SmartBee |
| `SMARTBEE_RECEIPT_KEY` | Secret | סיסמה חדשה וארוכה שאתם ממציאים (32 תווים ומעלה, למשל ממחולל הסיסמאות של הדפדפן). אותה סיסמה תודבק גם בחנות. |
| `SMARTBEE_ENV` | Text | `prod` |
| `SMARTBEE_FORCE_DRAFT` | Text | `1` בבדיקה הראשונה (רק טיוטות, שום דבר לא נשלח), `0` אחרי שהבדיקה עברה |
| `CARDCOM_TERMINAL` | Secret | רק לאשראי: מספר המסוף |
| `CARDCOM_API_NAME` | Secret | רק לאשראי: שם משתמש ממשקים |

בפורטל Cardcom, רק לאשראי: הגדרות ← 4. סליקה בפרופיל נמוך ← 2. הגדרות כלליות ← לסמן **"תמיד בצע דיווח של עסקה"** ← שמירה.

אחרי השמירה לוחצים **Deploy** פעם אחת כדי שההגדרות ייכנסו לתוקף.

### 4. חיבור החנות
- בהגדרות הסודות של החנות (למשל Lovable ← Secrets) יוצרים `BOOKKEEPING_API_KEY` עם אותה סיסמה של `SMARTBEE_RECEIPT_KEY`. אתם מדביקים, לא אנחנו.
- מריצים בכלי ה-AI של החנות את ההנחיה שקיבלתם מ-Automatziot, עם כתובת ה-Worker שלכם.

### 5. בדיקה ועלייה לאוויר
0. פותחים בדפדפן `https://<כתובת ה-Worker>/health`. צריך לראות `"ok": true`, `"receipt_memory": true`, ו-`"card_payments": true` אם חיברתם אשראי. אין שם אף סוד.
1. הזמנה אחת עם `SMARTBEE_FORCE_DRAFT=1`: בודקים שנוצרה טיוטה ב-SmartBee.
2. משנים ל-`0`, ומבצעים הזמנה אמיתית אחת למייל של בעל העסק.
3. מוודאים שהחנות או חברת הסליקה לא מפיקות קבלה משלהן (כדי שלא יהיו שתי קבלות).
4. בעל העסק מסיר את Automatziot מחשבון ה-Cloudflare (Manage Account ← Members) ומה-GitHub, אם הוזמנו.

## עדכונים
כשיוצאת גרסה חדשה, בעמוד ה-fork שלכם ב-GitHub לוחצים **Sync fork ← Update branch**. Cloudflare מעדכן את ה-Worker לבד. ההגדרות והסודות לא משתנים.

## כתובות (לחנות)

| כתובת | מה |
|---|---|
| `POST /receipt` | קבלה להזמנה ששולמה (כל אמצעי תשלום) |
| `POST /pay` | יצירת דף תשלום באשראי ב-Cardcom |
| `GET /pay/<low_profile_id>` | האם שולם, ומספר הקבלה |
| `POST /cardcom/webhook` | Cardcom מדווחת על עסקה (לא לשימוש החנות) |
| `GET /health` | מה מופעל (בלי סודות) |

כל הכתובות של החנות דורשות כותרת `x-api-key` עם `SMARTBEE_RECEIPT_KEY`. אותה הזמנה (`order_id`) לא תפיק שתי קבלות.


---

# Install guide for an AI assistant (English)

Paste this whole README into an AI assistant (Claude, ChatGPT ...) and say: "Walk me through installing this, one step at a time." The steps below are written for that.

## Rules for the assistant
- The business owner does every step in **their own** GitHub and Cloudflare accounts. Never ask the owner to send you a password, API key or token; the owner types them into Cloudflare themselves.
- Go one step at a time. After each step, ask what the owner sees before continuing.
- Nothing is sent to real customers until step 7 switches draft mode off.

## What this is
A Cloudflare Worker that turns a paid store order into a SmartBee receipt, and optionally charges cards through Cardcom first. One codebase, two modes:
- **Receipts only:** fill in the SmartBee settings. The store calls `POST /receipt`.
- **Receipts + card payments:** also fill in the two Cardcom settings. The store calls `POST /pay` for cards and `POST /receipt` for every other payment method.

Storage: one small Cloudflare D1 database bound as `DB`. **Cloudflare creates the database on the first deploy (it is declared in `wrangler.toml`), and the code creates its own table on first use.** No schema step, no migration, no script, and nobody else needs access to the owner's account.

## Step 1: Accounts
The owner needs, in the business's name:
- a GitHub account (free) and a Cloudflare account (free)
- SmartBee API access: client id, API password, provider user token (ask SmartBee)
- card payments only: a Cardcom terminal number and API user name. Cardcom portal: הגדרות → 1. הגדרות חברה ומשתמשים → 4. ניהול מפתחות API לממשק. Use the 20-character "משתמש ממשקים", not the key's display name.

## Step 2: Copy the code
The owner opens this repository on GitHub and presses **Fork** (Automatziot gives them read access first). The fork is private and theirs.

## Step 3: Deploy on Cloudflare
1. Cloudflare dashboard → **Workers & Pages → Create → Import a repository**. Connect GitHub, pick the fork.
2. Keep the defaults (deploy command `npx wrangler deploy`) and press **Deploy**.
3. Note the Worker address, for example `https://smartbee-store-connector.<account>.workers.dev`.

**If the deploy stops on the D1 database** (no permission to create it):
1. Dashboard → **Storage & Databases → D1 → Create database**, name `smartbee-memory`.
2. In the fork on GitHub, edit `wrangler.toml`: under `database_name = "smartbee-memory"` add `database_id = "<the id shown in D1>"`. Commit. Cloudflare redeploys by itself.

Command-line alternative, only if the owner already uses Node.js on their own computer: `npx wrangler login`, then `npx wrangler d1 create smartbee-memory`, put the printed `database_id` into `wrangler.toml`, and push.

## Step 4: Settings (the owner types them)
Worker → **Settings → Variables and Secrets → Add**. Secrets are encrypted and cannot be read back by anyone after saving. Pause any screen sharing for this step.

| Name | Type | Value |
|---|---|---|
| `SMARTBEE_CLIENT_ID` | Secret | from SmartBee |
| `SMARTBEE_PASSWORD` | Secret | from SmartBee |
| `PROVIDERUSERTOKEN` | Secret | from SmartBee |
| `SMARTBEE_RECEIPT_KEY` | Secret | a new random password, 32+ characters, made up by the owner (browser password generator). The same value goes into the store in step 6. |
| `SMARTBEE_ENV` | Text | `prod` (`test` only for SmartBee's test server) |
| `SMARTBEE_FORCE_DRAFT` | Text | `1` for the first test (drafts only, nothing emailed), `0` after it passes |
| `CARDCOM_TERMINAL` | Secret | card payments only: terminal number |
| `CARDCOM_API_NAME` | Secret | card payments only: API user name |

Card payments only, in the Cardcom portal: הגדרות → 4. סליקה בפרופיל נמוך → 2. הגדרות כלליות → tick **"תמיד בצע דיווח של עסקה"** → save. Leave "שלח דואר לכול עסקה" and the API override settings as they are.

Then deploy once more (Deployments → Deploy, or any commit) so the settings take effect. `wrangler.toml` has `keep_vars = true`, so later updates never overwrite them.

## Step 5: Check
Open `https://<worker>/health`. Expected: `"ok":true`, `"receipts":true`, `"store_key":true`, `"receipt_memory":true`, `"card_payments":true` (or false for receipts only), `"smartbee_env":"prod"`, `"draft_mode":true`.
- `receipt_memory:false` → the D1 binding `DB` is missing (step 3 fallback).
- `card_payments:false` although Cardcom is wanted → `CARDCOM_TERMINAL` or `CARDCOM_API_NAME` missing.
No secret is ever shown.

## Step 6: Connect the store
The store must run server-side code (Lovable, Wix with Velo, a custom site). In the store's server secrets the owner creates `BOOKKEEPING_API_KEY` with the same value as `SMARTBEE_RECEIPT_KEY`. Then paste a prompt into the store's AI builder, replacing `<WORKER_URL>`.

### Prompt A: receipts (every store)
```text
Connect automatic receipts. Plain code only, no AI step builds the request.
WHEN: every time an order becomes paid, run a server-side function sendReceipt.
REQUEST: POST <WORKER_URL>/receipt
Headers: Content-Type: application/json; x-api-key: secret BOOKKEEPING_API_KEY (server only, never in frontend code, never logged)
Body (send only fields that have a value):
{"order_id":"<unique order id>","customer_name":"...","customer_email":"...","customer_phone":"...","amount":450,"payment_method":"bit","description":"Order <id>: <items>","send_to_customer":true}
payment_method is one of: credit_card, bit, paybox, cash, bank_transfer, check, other. credit_card also sends card_last_digits. bank_transfer and check also send bank_name, bank_branch, bank_account, reference.
SAVE ON THE ORDER: receipt_status, receipt_number, receipt_pdf_link, receipt_error.
RESPONSE: 201 "created": save receipt_number and pdf_link, status receipt_sent. 201 "draft": status receipt_sent, receipt_number "draft". 200 "duplicate": status receipt_sent, save receipt_number and pdf_link if present, do not resend. 202 "pending": show "Check again" (resending the same order_id is safe). 401/400/422: save the error text, status receipt_failed, show "Retry receipt".
The owner's orders page must be behind a login. Customers only see their own order: receipt number and PDF link.
```

### Prompt B: add card payments (after Prompt A)
```text
Add real card payment through my endpoint. Plain code only. Keep everything else as it is.
- credit_card: real payment on Cardcom's page. Remove any card_last_digits field: the card is typed only on the payment page. Never call sendReceipt for credit_card orders: my endpoint issues that receipt by itself after the charge.
- every other method: unchanged (sendReceipt).
1. START PAYMENT (server-side function startPayment, when the customer presses Pay with credit_card)
POST <WORKER_URL>/pay, same headers as sendReceipt.
Body: {"order_id":"<order id>","amount":<total>,"customer_name":"...","customer_email":"...","customer_phone":"...","description":"Order <id>: <items>","success_url":"<this app's public URL>/order/<order id>?paid=1","fail_url":"<this app's public URL>/order/<order id>?paid=0"}
201 {"pay_url","low_profile_id"}: save low_profile_id on the order, status awaiting_payment, full-page redirect to pay_url.
409 "already_paid": the order already has a receipt; show it. Other replies: status payment_failed, "Payment could not start" + "Try again".
2. ORDER PAGE /order/<order id> (public, only this order). With paid=1: server-side function checkPayment GETs <WORKER_URL>/pay/<low_profile_id>.
"paid": save receipt_number, pdf_link, card_last_digits, status receipt_sent; show "Payment received" + receipt number + PDF link.
"pending" (202), or "paid" without receipt_number: show "Payment received, preparing your receipt..." and check again every 3 seconds, up to 10 times; then a "Check again" button.
"not_paid": status payment_failed, "Payment not completed" + "Pay again". "receipt_failed": status receipt_failed, admin sees Retry.
With paid=0: status payment_failed, "Pay again".
3. ADMIN ORDERS LIST: show low_profile_id and statuses awaiting_payment / paid / payment_failed. For credit_card orders "Retry receipt" calls checkPayment, not sendReceipt.
```

## Step 7: Test, then go live
1. With `SMARTBEE_FORCE_DRAFT=1`: one order per payment method the store offers. Drafts appear in SmartBee. On a live Cardcom terminal use a real card and a small amount.
2. Set `SMARTBEE_FORCE_DRAFT=0`, deploy once, place one real order to the owner's own email. The receipt arrives from SmartBee.
3. Make sure the store or the payment company does not also issue receipts.
4. The owner removes Automatziot from Cloudflare (Manage Account → Members) and GitHub, if they were invited.

## Updates
On the fork's GitHub page: **Sync fork → Update branch**. Cloudflare redeploys by itself. Settings, secrets and the D1 data stay as they are.

## API reference
| Route | Auth | Purpose |
|---|---|---|
| `POST /receipt` | `x-api-key` | Receipt for a paid order, any payment method. The same `order_id` never issues twice. |
| `POST /pay` | `x-api-key` | Cardcom payment page. 501 `card_payments_disabled` without Cardcom settings; 409 `already_paid`. |
| `GET /pay/<low_profile_id>` | `x-api-key` | Verifies the charge with Cardcom; returns `paid` + receipt, `pending`, `not_paid`, `refund` or `receipt_failed`. |
| `POST /cardcom/webhook` | none (verified with Cardcom) | Cardcom reports a deal. Non-200 makes Cardcom retry. |
| `GET /health` | none | What is switched on. No secrets. |

Card receipts carry the charged amount, last 4 digits, card brand, installments and approval number. Receipt numbers come only from SmartBee; the Worker remembers which receipt belongs to which order (D1) and re-reads it from SmartBee on every repeat. A charged amount different from the order amount is flagged `amount_mismatch`. Refunds never issue a receipt automatically.
