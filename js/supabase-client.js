// ============================================================
// Cliente Supabase — mesmo projeto/repositório usado pelo
// PMOC Digital. Preencha as duas constantes abaixo com os
// valores do SEU projeto Supabase (Project Settings > API).
// A anon key é segura para uso no front-end (fica restrita
// pelas policies de RLS definidas em sql/schema.sql).
// ============================================================

const SUPABASE_URL = "COLE_AQUI_A_URL_DO_SEU_PROJETO_SUPABASE";
const SUPABASE_ANON_KEY = "COLE_AQUI_A_ANON_KEY_DO_SEU_PROJETO_SUPABASE";

// eslint-disable-next-line no-undef
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const BUCKET_FOTOS = "hvac-fotos";
const BUCKET_ANEXOS = "hvac-anexos";

/**
 * Faz upload de um arquivo (File ou Blob) para um bucket do Storage
 * e devolve a URL pública para exibição/armazenamento no banco.
 */
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