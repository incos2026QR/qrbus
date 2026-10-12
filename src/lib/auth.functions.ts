import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional(),
});

export const signUpAutoConfirm = createServerFn({ method: "POST" })
  .inputValidator((d) => signUpSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: user, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      phone: data.phone,
      email_confirm: true,
      phone_confirm: !!data.phone,
    });
    if (error) throw new Error(error.message);
    return { userId: user.user!.id };
  });

export const seedAccounts = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const accounts = [
    { email: "incos2026@gmail.com", password: "4Dmin-1234", role: "admin", first: "Master", surname: "Admin" },
    { email: "supervisor1@pagojusto.bo", password: "Super123!", role: "supervisor", first: "Supervisor", surname: "Uno" },
    { email: "supervisor2@pagojusto.bo", password: "Super123!", role: "supervisor", first: "Supervisor", surname: "Dos" },
    { email: "supervisor3@pagojusto.bo", password: "Super123!", role: "supervisor", first: "Supervisor", surname: "Tres" },
    {
      email: "choferapi@pagojusto.bo", password: "Password123!", role: "driver", first: "Chofer", surname: "API",
      extra: { driver_code: "DRV93", phone: "70000093", bank_name: "Banco Unión", bank_account: "104593", transport_line: "Línea 1" },
    },
    {
      email: "pasajeroapi@pagojusto.bo", password: "Password123!", role: "passenger", first: "Pasajero", surname: "API",
      extra: { category: "general" as const, phone: "70000094", bank_name: "Banco Unión", bank_account: "104594", balance: 50 },
    },
  ] as const;

  const results: { email: string; created: boolean; updated: boolean }[] = [];
  for (const acc of accounts) {
    const extra = "extra" in acc ? acc.extra : {};
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", acc.email)
      .maybeSingle();
    if (existing) {
      // Reset password so demo credentials always work.
      await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        password: acc.password,
        email_confirm: true,
      });
      results.push({ email: acc.email, created: false, updated: true });
      continue;
    }
    const { data: user, error } = await supabaseAdmin.auth.admin.createUser({
      email: acc.email,
      password: acc.password,
      email_confirm: true,
    });
    if (error || !user.user) {
      results.push({ email: acc.email, created: false, updated: false });
      continue;
    }
    await upsertRoleRow(supabaseAdmin, acc.role, {
      id: user.user.id,
      first_name: acc.first,
      paternal_surname: acc.surname,
      email: acc.email,
      ...extra,
    });
    await supabaseAdmin.from("user_roles").upsert(
      { user_id: user.user.id, role: acc.role as "admin" | "supervisor" | "driver" | "passenger" },
      { onConflict: "user_id,role" },
    );
    results.push({ email: acc.email, created: true, updated: false });
  }
  return { results };
});


// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertRoleRow(admin: any, role: string, row: Record<string, unknown>) {
  const { category, bank_name, bank_account, transport_line, driver_code, status, ...base } = row as Record<string, unknown>;
  if (role === "passenger") {
    return admin.from("passengers").upsert({ ...base, status: status ?? "active", fare_category: category ?? "general" }, { onConflict: "id" });
  }
  if (role === "driver") {
    return admin.from("drivers").upsert({ ...base, status: status ?? "active", bank_name, bank_account, transport_line, driver_code }, { onConflict: "id" });
  }
  const { balance: _b, ...staff } = base;
  return admin.from("admins_supervisors").upsert({ id: staff.id, first_name: staff.first_name, paternal_surname: staff.paternal_surname, email: staff.email, phone: staff.phone ?? null, role }, { onConflict: "id" });
}

export const generateDriverCode = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  for (let i = 0; i < 20; i++) {
    const code = "DRV" + Math.floor(10 + Math.random() * 90).toString();
    const { data } = await (supabaseAdmin as any).from("drivers").select("id").eq("driver_code", code).maybeSingle();
    if (!data) return { code };
  }
  const code = "D" + Math.random().toString(36).slice(2, 6).toUpperCase();
  return { code };
});

const setRoleSchema = z.object({ userId: z.string().uuid(), role: z.enum(["admin", "supervisor", "passenger", "driver"]) });
export const grantRole = createServerFn({ method: "POST" })
  .inputValidator((d) => setRoleSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").upsert({ user_id: data.userId, role: data.role });
    return { ok: true };
  });

/** Elimina un usuario de autenticación (usado para no dejar huérfanos si falla el perfil). */
export const deleteAuthUser = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.auth.admin.deleteUser(data.userId);
    return { ok: true };
  });

const supervisorSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  first_name: z.string().min(1),
  paternal_surname: z.string().optional(),
});

/** Crea una cuenta de supervisor activa (solo desde el panel de administración). */
export const createSupervisor = createServerFn({ method: "POST" })
  .inputValidator((d) => supervisorSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: user, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error || !user.user) throw new Error(error?.message ?? "No se pudo crear el usuario");
    const { error: pErr } = await upsertRoleRow(supabaseAdmin, "supervisor", {
      id: user.user.id,
      first_name: data.first_name,
      paternal_surname: data.paternal_surname ?? null,
      email: data.email,
    });
    if (pErr) {
      await supabaseAdmin.auth.admin.deleteUser(user.user.id);
      throw new Error(pErr.message);
    }
    await supabaseAdmin.from("user_roles").upsert({ user_id: user.user.id, role: "supervisor" });
    return { userId: user.user.id };
  });

