const SUPABASE_URL = "https://izpqxrbbsciwlloqvrjk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ZEekLFYj3vn4pUn-GggRoQ_v3e070wf";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const BUCKET_FOTOS = "hvac-fotos";
const BUCKET_ANEXOS = "hvac-anexos";

async function uploadToBucket(bucket, file, pathPrefix) {
  const ext = (file.name && file.name.split(".").pop()) || "jpg";
  const path = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
