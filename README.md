# SmartBee business connector

> רוצים התקנה בעזרת AI? מדביקים את כל הקובץ הזה ל-Claude או ChatGPT ואומרים "תעביר אותי בהתקנה צעד אחר צעד". המדריך באנגלית בסוף הקובץ.

מחברים את חשבון ה-SmartBee שלכם ל-Claude, ומדברים או כותבים: "תוציא הצעת מחיר לדנה ב-300", "דנה שילמה בביט, תוציא קבלה", "מה שלחתי החודש?".
הכול רץ על חשבון ה-Cloudflare שלכם. אתם מחזיקים את כל המפתחות, ואף אחד אחר (גם לא Automatziot) לא יכול לקרוא אותם.

רישיון: [PolyForm Internal Use 1.0.0](LICENSE). מותר להפעיל לעסק שלכם, להמשיך להשתמש גם אחרי שמפסיקים לעבוד איתנו. אסור למכור או להפיץ הלאה.

מחפשים קבלות אוטומטיות מחנות אינטרנט, או תשלום באשראי דרך Cardcom? זה מחבר אחר: [connector-smartbee-store](https://github.com/Automatziot/connector-smartbee-store).

## מה Claude יכול לעשות

| פעולה | דוגמה | אישור לפני ביצוע |
|---|---|---|
| הצעת מחיר ללקוח (חדש או קיים) | "שלח לו הצעת מחיר לשעת ייעוץ ב-300" | כן |
| קבלה על תשלום (מזומן, ביט, פייבוקס, אשראי, העברה, צ'ק) | "נחמה שילמה 300 בביט, תוציא לה קבלה" | כן |
| חיפוש מסמכים | "מה הצעת המחיר האחרונה?", "הצעה מספר 5" | לא |
| סגירת הצעה כטופלה | "נחמה אישרה, תסגור את ההצעה" | כן |
| סיכום חודשי, סיכום הוצאות | "כמה הצעות מחיר הוצאתי החודש?" | לא |

כל פעולה שיוצרת או משנה מסמך מוצגת קודם כתצוגה מקדימה, ויוצאת רק אחרי שאתם מאשרים במפורש. קבלות הן מסמכים רשמיים שאי אפשר למחוק, ולכן שווה לקרוא את התצוגה לפני האישור. את המסמך שולחת ללקוח SmartBee עצמה.

## מה צריך לפני ההתקנה (הכול בשם העסק)

| מה | מאיפה |
|---|---|
| חשבון GitHub (חינם) | github.com |
| חשבון Cloudflare (חינם) | cloudflare.com |
| SmartBee: API client id, API password, provider user token | מ-SmartBee (מבקשים גישת API לחשבון הייצור) |
| חשבון Claude בתשלום, שמאפשר חיבורים מותאמים (Custom connectors) | claude.ai |

## התקנה

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Automatziot/connector-smartbee-business)

1. נכנסים לחשבון ה-Cloudflare שלכם ומחברים את GitHub. Cloudflare יוצרת עותק של הקוד בחשבון ה-GitHub שלכם.
2. מופיע מסך עם 6 שדות והסבר ליד כל אחד. ממלאים:
   - שלושת פרטי SmartBee שקיבלתם במייל.
   - `MCP_TOKEN`: סיסמה ארוכה שאתם ממציאים (32 תווים ומעלה, ממחולל הסיסמאות של הדפדפן). שומרים אותה במנהל סיסמאות.
   - `SMARTBEE_ENV`: להשאיר `prod`.
   - `SMARTBEE_FORCE_DRAFT`: להשאיר `1` בבדיקה הראשונה.
3. לוחצים **Deploy**. בסוף מתקבלת כתובת בסגנון `https://smartbee-business-connector.<שם>.workers.dev`.
4. בודקים: `<הכתובת>/health` צריך להראות `"ok": true`. הכתובת מראה רק "תקין / לא תקין" ולא את הערכים.

## חיבור ל-Claude

ב-claude.ai: Settings ← Connectors ← Add custom connector. בשדה הכתובת מדביקים:

```
https://smartbee-business-connector.<שם>.workers.dev/mcp/<MCP_TOKEN>
```

הכתובת כוללת את הסיסמה, לכן לא משתפים אותה עם אף אחד. אם היא דלפה: משנים את `MCP_TOKEN` ב-Cloudflare (Worker ← Settings ← Variables and Secrets) ומחברים מחדש עם הכתובת החדשה.

## בדיקה ראשונה, בלי להוציא שום מסמך

כש-`SMARTBEE_FORCE_DRAFT` הוא `1`, כל הצעה או קבלה נשמרת ב-SmartBee כ**טיוטה** בלבד ושום דבר לא נשלח ללקוח במייל.
1. מבקשים מ-Claude: "מה אתה יכול לעשות עם SmartBee?" ואז "תכין הצעת מחיר לבדיקה ללקוח בדיקה ב-100".
2. מאשרים את התצוגה המקדימה, ובודקים ב-SmartBee שנוצרה טיוטה.
3. מוכנים? ב-Cloudflare משנים `SMARTBEE_FORCE_DRAFT` ל-`0`. מרגע זה מסמכים יוצאים באמת.

## הוראות לפעולה (Skill)

קובץ ה-zip `client-smartbee-business` (נמסר יחד עם ההתקנה) מלמד את Claude מתי להכין טיוטה, מתי לבקש אישור ואיך לדווח. מעלים ב-claude.ai: Customize ← Skills ← Add ← Upload a skill.

## עדכונים והגנות

- ההגדרות שלכם נשמרות ב-Cloudflare ועדכוני קוד לא דורסים אותן (`keep_vars`).
- Automatziot לא מקבלים גישה לחשבון ה-Cloudflare או ה-GitHub שלכם, ולא רואים אף סיסמה.
- בלי `MCP_TOKEN` חיבור ה-Claude כבוי לגמרי.
- אין כאן אחסון של מסמכים או פרטי לקוחות: ה-Worker רק מעביר בקשות ל-SmartBee.

---

## English guide (paste this whole file into an AI assistant)

You are guiding a business owner through installing the **SmartBee business connector**: a Cloudflare Worker that lets Claude create quotes and receipts, search documents and summarize income and expenses in the owner's own SmartBee account. Go one step at a time, wait for confirmation, never ask the owner to paste secrets into the chat.

1. **Prerequisites:** GitHub account, Cloudflare account (free), SmartBee API credentials (client id, API password, provider user token, requested from SmartBee for the production account), and a paid Claude plan that supports custom connectors.
2. **Deploy:** open the "Deploy to Cloudflare" button above while signed in to Cloudflare. Connect GitHub when asked. Cloudflare copies the code into the owner's GitHub and deploys it.
3. **Settings form (6 fields):** `SMARTBEE_CLIENT_ID`, `SMARTBEE_PASSWORD`, `PROVIDERUSERTOKEN` from SmartBee; `MCP_TOKEN` a new random password of 32+ characters made up by the owner (use the browser's password generator, save it in a password manager); `SMARTBEE_ENV` = `prod`; `SMARTBEE_FORCE_DRAFT` = `1` for the first test. The owner types the secrets; do not look at them.
4. **Check:** open `https://smartbee-business-connector.<account>.workers.dev/health`. Expect `"ok": true`. It never shows values.
5. **Connect Claude:** claude.ai → Settings → Connectors → Add custom connector → `https://smartbee-business-connector.<account>.workers.dev/mcp/<MCP_TOKEN>`. The URL contains the secret: do not share it. To rotate, change `MCP_TOKEN` in Cloudflare (Worker → Settings → Variables and Secrets) and reconnect.
6. **Dry run:** with `SMARTBEE_FORCE_DRAFT=1` everything is saved as a SmartBee draft: nothing is emailed to the customer. Ask Claude to prepare a test quote, approve the preview, and confirm in SmartBee that a draft appeared.
7. **Go live:** set `SMARTBEE_FORCE_DRAFT` to `0` in Cloudflare. Documents are then issued for real, after the owner approves each preview. Receipts are official and cannot be deleted.
8. **Skill:** upload `client-smartbee-business.zip` in claude.ai (Customize → Skills → Add → Upload a skill).
