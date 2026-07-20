# QR Pago Justo — Build Plan

Full-stack fare management app. No landing page — root `/` is the login/registration UI. Backend on Lovable Cloud (Supabase). Frontend React + Tailwind + Lucide.

## 1. Backend (Lovable Cloud)

**Tables**
- `profiles` — id (FK auth.users), role ('admin'|'supervisor'|'passenger'|'driver'), status ('pending'|'active'|'rejected'|'suspended'), first_name, paternal_surname, maternal_surname, ci_number, birthdate, phone, email, category ('general'|'primaria'|'secundaria'|'adulto_mayor'|'discapacidad'), driver_code (5 chars, unique, drivers only), ci_front_url, ci_back_url, selfie_url, license_url, extra_doc_url, qr_general_url, qr_primaria_url, qr_secundaria_url, qr_adulto_url, created_at.
- `user_roles` — separate roles table (per security best practice), with `has_role()` SECURITY DEFINER function.
- `transactions` — id, driver_id, passenger_id, category, amount, verification_code (5 chars), created_at. Realtime enabled.

**Storage buckets** (public): `kyc-documents`, `qr-codes`.

**Seed** (in migration): insert 4 pre-approved accounts via `auth.users` + profiles + user_roles.
- Admin: incos2026@gmail.com / 4Dmin-1234
- Supervisor 1–3: supervisor{1,2,3}@pagojusto.bo / Super1234!

**Auto-confirm emails**: set `email_confirmed_at` at signup via server function using admin client (`supabaseAdmin.auth.admin.createUser({ email_confirm: true })`).

**RLS**
- profiles: users read/update own; admin/supervisor read all, update status.
- transactions: driver reads own; passenger reads own; insert by passenger.
- user_roles: authenticated read (via `has_role`), admin writes.

## 2. Frontend routes

- `/` — Login (email or phone + password), toggles to Passenger/Driver registration. Auto-redirects: admin/supervisor→`/admin`, passenger→`/passenger`, driver→`/driver`.
- `/admin` — Sidebar (Choferes, Pasajeros, Supervisores [admin only], Reportes). Sub-tabs Pendientes/Activos. Modal shows KYC images, approve/reject/suspend. Admin can promote to supervisor.
- `/passenger` — Enter 5-char driver code → fetch driver → show correct static QR for passenger's category → demo "Adjuntar comprobante" button (fake success) → "Confirmar Pago Realizado" → full-screen Verification Pass: large 5-digit code + selfie (no category/price shown). Inserts transaction row (realtime).
- `/driver` — Prominent driver code, daily totals (amount + count only). OLED simulator component subscribes to realtime `transactions` where driver_id = self; on new row flashes green LED and shows `CÓDIGO: XXXXX` + amount.

## 3. Registration flows

- **Passenger**: 4-step wizard (credentials → personal → KYC uploads → category with age validation). Categories with age rules enforced client-side and server-side. Extra doc required for Secundaria≥18 (carnet universitario) and Discapacidad (carnet).
- **Driver**: personal + 4 KYC photos + 4 QR uploads. Server generates unique 5-char code.
- **"Cargar Datos de Prueba"** button at top: fills all text fields; attaches sample generated placeholder image blobs so uploads work end-to-end.

## 4. Image compression

`compressImage(file)` util: HTML5 canvas, max 800px longest side, JPEG quality 0.6, target <100KB. Upload to storage, save public URL.

## 5. Auth mechanics

- Login via email OR phone: if input matches phone pattern, lookup email from profiles by phone, then `signInWithPassword`.
- Signup uses server function with admin client to auto-confirm.
- Bearer middleware wired for authenticated server fns.

## 6. Design system

Vibrant orange primary (Bolivia public-transport vibe), clean dark sidebar for admin, neutral background. Semantic tokens in `src/styles.css` (oklch). OLED module: near-black card, green glowing text, LED dot with `animate-pulse`.

## Technical notes

- TanStack Router file routes under `src/routes/`.
- Protected areas under `src/routes/_authenticated/` — role check in components (redirect if wrong role).
- Realtime via browser supabase client on `/driver`.
- Verification code = random 5-digit alphanumeric generated client-side at confirm, stored on transaction, driver reads via realtime.

## Out of scope (per user)

No landing/marketing pages, no pricing/features sections, no email verification links, no real payment gateway (QR display only + demo comprobante).

Ready to build on approval.
