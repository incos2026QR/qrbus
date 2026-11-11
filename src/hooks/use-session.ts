import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Profile = {
  id: string;
  role: "admin" | "supervisor" | "passenger" | "driver";
  status: "pending" | "active" | "rejected" | "suspended";
  first_name: string | null;
  paternal_surname: string | null;
  maternal_surname: string | null;
  ci_number: string | null;
  birthdate: string | null;
  phone: string | null;
  email: string | null;
  category: "general" | "primaria" | "secundaria" | "adulto_mayor" | "discapacidad" | null;
  driver_code: string | null;
  ci_front_url: string | null;
  ci_back_url: string | null;
  selfie_url: string | null;
  license_url: string | null;
  extra_doc_url: string | null;
  qr_general_url: string | null;
  qr_primaria_url: string | null;
  qr_secundaria_url: string | null;
  qr_adulto_url: string | null;
  bank_account: string | null;
  bank_name: string | null;
  transport_line: string | null;
  union_doc_url: string | null;
  rejection_reason: string | null;
  resubmission_count: number;
  balance: number;
};

export function useSession() {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [missingProfile, setMissingProfile] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function loadProfile(uid: string) {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
      if (!mounted) return;
      if (error) {
        console.error("[Auth] Could not load the signed-in user's profile", error);
        toast.error("No se pudo verificar tu cuenta. Vuelve a iniciar sesión.");
        setProfile(null);
        setMissingProfile(false);
        await supabase.auth.signOut();
        return;
      }

      let loadedProfile = (data as Profile | null) ?? null;
      if (loadedProfile?.role === "admin" || loadedProfile?.role === "supervisor") {
        const { data: staff, error: staffError } = await supabase
          .from("admins_supervisors")
          .select("role, status")
          .eq("id", uid)
          .maybeSingle();

        if (!mounted) return;
        if (staffError || !staff) {
          console.error(
            "[Auth] Could not verify the signed-in staff member's status",
            staffError ?? new Error("Staff account not found"),
          );
          toast.error("No se pudo verificar el estado de tu cuenta. Vuelve a iniciar sesión.");
          setProfile(null);
          setMissingProfile(false);
          await supabase.auth.signOut();
          return;
        }

        loadedProfile = {
          ...loadedProfile,
          role: staff.role,
          status:
            String(staff.status).trim().toLowerCase() === "suspended"
              ? "suspended"
              : loadedProfile.status,
        };
      }

      setProfile(loadedProfile);
      setMissingProfile(!data);
    }

    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? null;
      if (!mounted) return;
      setUserId(uid);
      if (uid) loadProfile(uid).finally(() => mounted && setLoading(false));
      else setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
      const uid = session?.user.id ?? null;
      setUserId(uid);
      if (uid) loadProfile(uid);
      else {
        setProfile(null);
        setMissingProfile(false);
      }
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  const refresh = async () => {
    if (!userId) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    setProfile((data as Profile | null) ?? null);
  };

  return { userId, profile, loading, missingProfile, refresh };
}
