# Pago Justo App

Build a minimal, functional-first full-stack web application named "QR Pago Justo" for public transport fare management in Bolivia, built with React, Tailwind CSS, Lucide Icons, and Supabase / Lovable Cloud backend.

---

### 🚨 NO LANDING PAGE / NO MARKETING SECTIONS
- DO NOT create landing pages, pricing cards, features list, or public info pages.
- The root route ("/") must load directly the LOGIN / REGISTRATION interface.
- Focus 100% of the code on core backend integration, auth, forms, image compression, database queries, and real-time validation.

---

### 1. INFRASTRUCTURE, STORAGE & PRE-SEEDED ACCOUNTS
- CLIENT-SIDE IMAGE COMPRESSION & STORAGE: Compress all image uploads using HTML5 Canvas (max 800px dimension, JPEG 0.6 quality) to keep files under 100KB. Upload images to public Storage Buckets ("kyc-documents" and "qr-codes") and save ONLY the public URLs in database columns.
- AUTOMATIC EMAIL CONFIRMATION BYPASS: Auto-confirm emails upon signup so users can immediately log in without verifying email links.
- DATABASE SEED ACCOUNTS: Pre-populate the system with 4 pre-approved, active accounts on initial load:
  1. Master Admin: Email "incos2026@gmail.com", Password "4Dmin-1234", Role "admin", Status "active".
  2. Supervisor 1: Email "supervisor1@pagojusto.bo", Password "Super1234!", Role "supervisor", Status "active".
  3. Supervisor 2: Email "supervisor2@pagojusto.bo", Password "Super1234!", Role "supervisor", Status "active".
  4. Supervisor 3: Email "supervisor3@pagojusto.bo", Password "Super1234!", Role "supervisor", Status "active".

---

### 2. AUTHENTICATION & MULTI-STEP REGISTRATION

#### DEMO AUTO-FILL FEATURE:
- Place a prominent button "Cargar Datos de Prueba" at the top of registration forms. When clicked, it automatically populates all text inputs (Name, CI, Birthdate, Phone) and pre-attaches sample mock images for IDs, selfies, and licenses.

#### LOGIN PAGE (`/` or `/login`):
- Login via Email or Phone Number + Password.
- Direct toggle to register as "Pasajero" (Passenger) or "Chofer" (Driver).
- Directly authenticates Admin and Supervisors to their respective panels.

#### PASSENGER REGISTRATION FORM:
- STEP 1 (Credentials): Phone Number (Required), Password (Required), Email (Optional).
- STEP 2 (Personal Data): First Name, Paternal Surname, Maternal Surname, CI Number, Birthdate.
- STEP 3 (KYC Uploads): Foto CI Frontal, Foto CI Reverso, Selfie sosteniendo el CI.
- STEP 4 (Category & Dynamic Age Logic):
  - Categories & Tariffs:
    * General (Bs 3.00)
    * Estudiante Primaria (Bs 1.00) -> Max age 12.
    * Secundaria y Universitario (Bs 2.00) -> Require extra upload "Carnet Universitario/Estudiantil" if age >= 18.
    * Adulto Mayor (Bs 2.50) -> Min age 60.
    * Persona con Discapacidad (Bs 2.50) -> Require extra upload "Carnet de Discapacidad".
  - System automatically calculates age from birthdate and validates allowed category.
- Status upon registration: "pending" (Pendiente de aprobación).

#### DRIVER REGISTRATION FORM:
- Same personal data as Passenger + 4 required KYC photos (CI Front, CI Back, Selfie with CI, Licencia de Conducir).
- QR CODE UPLOADS (4 Static Banking QRs): General (Bs 3.00), Primaria (Bs 1.00), Secundaria/Universitario (Bs 2.00), Adulto Mayor/Discapacidad (Bs 2.50).
- Generate a unique 5-character Driver Code (e.g. "DRV84").
- Status upon registration: "pending".

---

### 3. ADMIN & SUPERVISOR DASHBOARD (`/admin`)

- ACCESS CONTROL:
  - Admin ("incos2026@gmail.com") has full rights (Manage Users, Manage Supervisors, Approve/Reject/Suspend, Export/Import Excel).
  - Supervisors can review pending KYC photos, Approve, Reject, or Suspend Passengers and Drivers.
- NAVIGATION SIDEBAR:
  - Fixed sidebar highlighting active tab in vibrant orange.
  - Tabs: "Choferes", "Pasajeros", "Supervisores" (Admin only), "Reportes/Transacciones".
- MANAGEMENT TABLES:
  - Sub-tabs for "Pendientes de Aprobación" and "Inscritos / Activos".
  - Action Modal: Detailed view of all uploaded KYC images before approving.
  - Admin can promote any existing Passenger/Driver to Supervisor role.

---

### 4. PASSENGER FARE PAYMENT FLOW (`/passenger`)

1. ENTER DRIVER CODE: Passenger enters 5-character Driver Code (or scans driver's code).
2. DYNAMIC TARIFF DISPLAY: System fetches driver profile and displays the exact static QR code corresponding to the logged-in passenger's category.
3. DEMO PROOF OF PAYMENT UPLOAD BUTTON:
   - Include a visual button "Adjuntar comprobante de pago (Opcional)".
   - Clicking it triggers a simulated upload animation that immediately displays "Comprobante adjuntado correctamente ✓" without requiring real file selection.
4. CONFIRM PAYMENT: Passenger clicks "Confirmar Pago Realizado".
5. PASSENGER VERIFICATION PASS:
   - Displays a full-screen Verification Pass on passenger's phone containing:
     a) Live generated 5-digit verification code in large green text (e.g. "84A29").
     b) Passenger's Selfie Photo (from registration) to verify identity.
   - ABSOLUTELY DO NOT DISPLAY passenger category name or price on screen to avoid discrimination.

---

### 5. DRIVER DASHBOARD & HARDWARE SIMULATED OLED SCREEN (`/driver`)

- DRIVER DASHBOARD:
  - Displays assigned 5-digit Driver Code prominently.
  - Lists daily aggregate earnings total (Bs) and count of passenger validations (NO passenger category names or wallet balances displayed).
- HARDWARE SIMULATED OLED SCREEN MODULE:
  - Visual component styled like a dark physical hardware OLED screen (0.96" bezel style).
  - When passenger clicks "Confirmar Pago Realizado", Supabase Realtime emits transaction instantly.
  - Hardware display flashes a green LED status light and displays: `CÓDIGO: [5-DIGIT CODE]` (matching passenger screen) alongside the validated fare amount.
  - Driver visually confirms that the 5-digit code on passenger's phone matches the code on their screen and hardware simulator.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://qrbus.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/46d922ff-e61c-44d0-bfa7-bb6638dc7cba).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
