BEGIN;

-- These audit/coordinator tables are intentionally server-only. Explicit deny
-- policies document that browser roles must never read or mutate their rows.
CREATE POLICY "wallet topup requests deny browser"
ON public.wallet_topup_requests
FOR ALL TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "wallet withdrawal requests deny browser"
ON public.wallet_withdrawal_requests
FOR ALL TO anon, authenticated
USING (false)
WITH CHECK (false);

COMMIT;
