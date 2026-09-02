# Comissionamento - HVAC

App de campo para comissionamento de sistemas HVAC — testes por equipamento,
evidência fotográfica, e geração de memorial descritivo (laudo) em PDF.

Stack: HTML/CSS/JS puro (sem build) + Supabase (banco + storage de fotos),
mesmo padrão do PMOC Digital. Deploy estático no Netlify.

## 1. Banco de dados (Supabase)

Este app usa o **mesmo projeto/repositório Supabase do PMOC Digital**, com
tabelas próprias prefixadas com `hvac_` para não colidir com as tabelas
existentes (`Cliente`, `Dispositivo`, `RTU`, `Manutencao_Preventiva`).

1. Abra o projeto Supabase do PMOC Digital → **SQL Editor**.
2. Cole e execute o conteúdo de `sql/schema.sql` (cria as tabelas
   `hvac_projects`, `hvac_equipment`, `hvac_tests`, os buckets de Storage
   `hvac-fotos` e `hvac-anexos`, e as policies de RLS).
3. Confirme em **Storage** que os buckets `hvac-fotos` e `hvac-anexos`
   foram criados como públicos (necessário para as fotos e a ART
   aparecerem no laudo impresso).

## 2. Configurar as credenciais

Abra `js/supabase-client.js` e preencha:

```js
const SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
const SUPABASE_ANON_KEY = "sua-anon-key-publica";