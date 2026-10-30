import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertRoleRow(admin: any, role: string, row: Record<string, unknown>) {
  const { category, bank_name, bank_account, transport_line, driver_code, status, ...base } = row;
  if (role === "passenger") {
    return admin.from("passengers").upsert(
      {
        ...base,
        status: status ?? "active",
        fare_category: category ?? "general",
        bank_name,
        bank_account,
      },
      { onConflict: "id" },
    );
  }
  if (role === "driver") {
    return admin.from("drivers").upsert(
      {
        ...base,
        status: status ?? "active",
        bank_name,
        bank_account,
        transport_line,
        driver_code,
      },
      { onConflict: "id" },
    );
  }
  return admin.from("admins_supervisors").upsert(
    {
      id: base.id,
      first_name: base.first_name,
      paternal_surname: base.paternal_surname,
      email: base.email,
      phone: base.phone ?? null,
      role,
    },
    { onConflict: "id" },
  );
}

// Server functions using service_role must independently authenticate and
// authorize the caller; hiding buttons in the UI is not an authorization check.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireAdmin(admin: any) {
  const authorization = getRequest().headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) throw new Error("No autorizado");

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) throw new Error("No autorizado");

  const { data: role } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", authData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!role) throw new Error("Se requiere rol de administrador");
}

const setRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "supervisor", "passenger", "driver"]),
});

export const grantRole = createServerFn({ method: "POST" })
  .inputValidator((d) => setRoleSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(supabaseAdmin);
    const { error } = await supabaseAdmin.from("user_roles").upsert({
      user_id: data.userId,
      role: data.role,
    });
    if (error) throw new Error(error.message);
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
    await requireAdmin(supabaseAdmin);

    const { data: user, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { role: "supervisor" },
    });
    if (error || !user.user) throw new Error(error?.message ?? "No se pudo crear el usuario");

    // The public signup trigger deliberately treats every non-driver as a
    // passenger. This trusted admin path replaces that provisional row.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).from("passengers").delete().eq("id", user.user.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).from("drivers").delete().eq("id", user.user.id);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", user.user.id);

    const { error: profileError } = await upsertRoleRow(supabaseAdmin, "supervisor", {
      id: user.user.id,
      first_name: data.first_name,
      paternal_surname: data.paternal_surname ?? null,
      email: data.email,
    });
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(user.user.id);
      throw new Error(profileError.message);
    }

    const { error: roleError } = await supabaseAdmin.from("user_roles").upsert({
      user_id: user.user.id,
      role: "supervisor",
    });
    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(user.user.id);
      throw new Error(roleError.message);
    }
    return { userId: user.user.id };
  });

const supervisorUpdateSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  first_name: z.string().trim().min(1),
  paternal_surname: z.string().trim(),
  phone: z.string().trim(),
});

export const updateSupervisor = createServerFn({ method: "POST" })
  .inputValidator((d) => supervisorUpdateSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(supabaseAdmin);

    const { data: authUser, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (getUserError || !authUser.user) {
      throw new Error(getUserError?.message ?? "No se encontró el supervisor");
    }

    const previousEmail = authUser.user.email;
    const emailChanged = previousEmail !== data.email;
    if (emailChanged) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        email: data.email,
        email_confirm: true,
      });
      if (error) throw new Error(error.message);
    }

    const { error: updateError } = await supabaseAdmin
      .from("admins_supervisors")
      .update({
        first_name: data.first_name,
        paternal_surname: data.paternal_surname || null,
        email: data.email,
        phone: data.phone || null,
      })
      .eq("id", data.userId);

    if (updateError) {
      if (emailChanged && previousEmail) {
        const { error: rollbackError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
          email: previousEmail,
          email_confirm: true,
        });
        if (rollbackError) {
          throw new Error(`${updateError.message}. No se pudo revertir el correo: ${rollbackError.message}`);
        }
      }
      throw new Error(updateError.message);
    }

    return { ok: true };
  });

const supervisorPasswordSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(6),
});

export const updateSupervisorPassword = createServerFn({ method: "POST" })
  .inputValidator((d) => supervisorPasswordSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(supabaseAdmin);

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
