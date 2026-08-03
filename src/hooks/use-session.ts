import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  balance: number;

};

export function useSession() {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadProfile(uid: string) {
      const { data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
      if (mounted) setProfile((data as Profile | null) ?? null);
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
      else setProfile(null);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  const refresh = async () => {
    if (!userId) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    setProfile((data as Profile | null) ?? null);
  };

  return { userId, profile, loading, refresh };
}
