# WorkManager – מערכת ניהול עובדים

מערכת ווב לניהול עובדים, משמרות, בונוסים ודוחות שכר. ממשק בעברית עם RTL.

## התקנה מקומית

```bash
npm install
npm run dev
```

פתח בדפדפן: http://localhost:5173

## פריסה ל-Vercel

1. דחוף את הקוד ל-GitHub
2. כנס ל-vercel.com → Import Project
3. בחר את ה-repo → Deploy

## חיבור שליחת מיילים

פתח את הקובץ `src/pages/Messages.jsx` וחפש את הפונקציה `sendEmail()`.
החלף אותה עם ה-provider שבחרת:

- **Resend** (מומלץ): https://resend.com
- **SendGrid**: https://sendgrid.com
- **Mailgun**: https://mailgun.com

## מבנה הפרויקט

```
src/
├── context/      # AppContext – global state
├── data/         # mockData – נתוני demo
├── pages/        # דפי האפליקציה
├── components/
│   ├── ui/       # קומפוננטים משותפים
│   └── layout/   # Sidebar
└── utils/        # חישובי שכר ועזרים
```

## תפקידים

- **מנהל** – גישה לכל הדפים
- **עובד** – דף בית + המשמרות שלי

ניתן לעבור בין התפקידים בכפתור בתחתית הסרגל הצדדי.
