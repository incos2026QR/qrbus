CREATE OR REPLACE FUNCTION public.sync_supervisor_auth_suspension()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.role = 'supervisor' THEN
    UPDATE auth.users
    SET banned_until = CASE
      WHEN lower(COALESCE(NEW.status, '')) = 'suspended'
        THEN now() + interval '100 years'
      ELSE NULL
    END
    WHERE id = NEW.id;
  ELSIF TG_OP = 'UPDATE' AND OLD.role = 'supervisor' THEN
    UPDATE auth.users
    SET banned_until = NULL
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_supervisor_auth_suspension()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_sync_supervisor_auth_suspension
AFTER INSERT OR UPDATE OF role, status ON public.admins_supervisors
FOR EACH ROW
EXECUTE FUNCTION public.sync_supervisor_auth_suspension();

UPDATE public.admins_supervisors
SET status = status
WHERE role = 'supervisor'
  AND lower(COALESCE(status, '')) = 'suspended';
