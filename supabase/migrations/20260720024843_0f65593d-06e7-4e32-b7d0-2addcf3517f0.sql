
CREATE POLICY "kyc read authenticated" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('kyc-documents','qr-codes'));
CREATE POLICY "kyc insert authenticated" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('kyc-documents','qr-codes'));
CREATE POLICY "kyc update authenticated" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('kyc-documents','qr-codes'));
