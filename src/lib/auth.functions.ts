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
  ] as const;

  const results: { email: string; created: boolean; updated: boolean }[] = [];
  for (const acc of accounts) {
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
    await supabaseAdmin.from("profiles").insert({
      id: user.user.id,
      role: acc.role as "admin" | "supervisor",
      status: "active",
      first_name: acc.first,
      paternal_surname: acc.surname,
      email: acc.email,
    });
    await supabaseAdmin.from("user_roles").insert({ user_id: user.user.id, role: acc.role as "admin" | "supervisor" });
    results.push({ email: acc.email, created: true, updated: false });
  }
  return { results };
});

export const generateDriverCode = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  for (let i = 0; i < 20; i++) {
    const code = "DRV" + Math.floor(10 + Math.random() * 90).toString();
    const { data } = await supabaseAdmin.from("profiles").select("id").eq("driver_code", code).maybeSingle();
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
    await supabaseAdmin.from("profiles").update({ role: data.role }).eq("id", data.userId);
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
    const { error: pErr } = await supabaseAdmin.from("profiles").insert({
      id: user.user.id,
      role: "supervisor",
      status: "active",
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

