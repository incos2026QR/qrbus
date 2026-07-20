// Client-side image compression: max 800px longest side, JPEG q=0.6, target <100KB.
export async function compressImage(file: File | Blob, maxDim = 800, quality = 0.6): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", quality));
}

// Deterministic sample image (colored square with label) for demo autofill.
export function makeSampleImage(label: string, color = "#f97316"): Blob {
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 400;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 600, 400);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 34px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, 300, 210);
  ctx.font = "18px sans-serif";
  ctx.fillText("DEMO", 300, 250);
  const data = canvas.toDataURL("image/jpeg", 0.7);
  const bin = atob(data.split(",")[1]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: "image/jpeg" });
}

export async function uploadImage(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  bucket: string,
  path: string,
  file: Blob,
): Promise<string> {
  const compressed = await compressImage(file);
  const { error } = await supabase.storage.from(bucket).upload(path, compressed, {
    upsert: true,
    contentType: "image/jpeg",
  });
  if (error) throw error;
  return path;
}

export async function getSignedUrl(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  bucket: string,
  path: string,
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
