# Elder'sVeil Anime Studio — Technical & Operations Documentation

**Founder & Director:** M.J. Mujesh Dharshan  
**Tagline:** Stories Beyond Imagination  

---

## 1. Architecture Overview

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Socket.IO Client, Firebase Client SDK (Google Sign-In).
- **Backend:** Node.js + Express (`server.ts`), Socket.IO real-time server, Firebase Admin SDK (`verifyIdToken`), Multer file uploads, PDFKit screenplay export, Nodemailer SMTP adapter, Twilio/MSG91 SMS adapter, Zod request validation, bcryptjs credential hashing.
- **Database:** Cloud SQL (PostgreSQL) managed with Drizzle ORM (`src/db/schema.ts`, `src/db/index.ts`, `src/db/drizzle.config.ts`). *(Note: Cloud SQL in AI Studio uses Drizzle ORM with PostgreSQL rather than Prisma).*

---

## 2. Official Ten-Department Structure

| # | Department | ID | Prefix |
|---|---|---|---|
| 1 | Samurai / Ronin | `samurai` | `SAM` |
| 2 | Ninja | `ninja` | `NIN` |
| 3 | Martial Arts | `martial-arts` | `MAR` |
| 4 | Pirate | `pirate` | `PIR` |
| 5 | Explorer | `explorer` | `EXP` |
| 6 | Witches & Wizards | `witches-wizards` | `WIZ` |
| 7 | Animation | `animation` | `ANI` |
| 8 | Story / Writing | `story` | `STO` |
| 9 | Audio / Music | `audio` | `AUD` |
| 10 | Video / Production | `video` | `VID` |

---

## 3. Security & Privacy Controls

- **Authentication:** Every private route requires a verified Firebase ID token (`Authorization: Bearer <token>`). Tokens are kept strictly in memory by the Firebase SDK.
- **Role-Based Access Control (RBAC):** Server-enforced hierarchy across `DIRECTOR`, `ADMIN`, `DEPT_HEAD`, `MEMBER`, and `GUEST`. Admins cannot modify Director accounts, create Admin accounts, or access Director-only integration/backup endpoints.
- **Department Isolation:** Members and Department Heads only access departments assigned in `department_memberships`.
- **Upload & Path Traversal Protection:** Extension allowlists, compound executable filename rejection, 10–20MB file size caps, randomized `nanoid` disk filenames, and `path.resolve` prefix verification on every download.
- **Application Tracking Privacy:** Status lookup requires both the unique tracking code (`EV-<PREFIX>-...`) and the applicant's email address, protected by IP rate limiting, and never exposes internal review notes.
- **Immutable Audit Ledger:** `audit_logs` is append-only with no update or delete endpoints.

---

## 4. Director & Integration Configuration

### Environment Variables (`.env.example`)
- **Database:** `SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD`, `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD`.
- **Director Notification Targets:** `DIRECTOR_EMAIL="black0warrior0143@gmail.com"`, `DIRECTOR_PHONE="+919443498638"`.
- **Gmail / SMTP:** Set `SMTP_HOST="smtp.gmail.com"`, `SMTP_PORT="465"`, `SMTP_SECURE="true"`, `SMTP_USER`, and a Gmail App Password in `SMTP_PASS`.
- **SMS Gateway:** Set `SMS_PROVIDER="TWILIO"` (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`) or `SMS_PROVIDER="MSG91"` (`MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `MSG91_SENDER_ID`).
- **Delivery Honesty:** When SMTP or SMS provider secrets are absent, deliveries are logged as `AWAITING_CONFIG` in `notification_deliveries` and never reported as sent.

---

## 5. Local Development & Backup Restore

- **Dev Server:** `npm run dev` (starts `tsx server.ts` on port `3000`).
- **Type Check:** `npm run lint` (`tsc --noEmit`).
- **Production Build:** `npm run build` followed by `NODE_ENV=production node server.ts`.
- **Backup Snapshot:** The Founder/Director can export a complete JSON snapshot of all PostgreSQL tables at any time from **Director's Office → Email / SMS / Backups → Export Backup Snapshot**.
