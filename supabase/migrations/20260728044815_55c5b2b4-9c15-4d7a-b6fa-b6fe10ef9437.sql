REVOKE EXECUTE ON FUNCTION public.topup_wallet(numeric, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.pay_fare(text, integer) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.withdraw_earnings(numeric, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.topup_wallet(numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_fare(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_earnings(numeric, text) TO authenticated;