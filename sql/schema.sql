-- ============================================================
-- COMISSIONAMENTO - HVAC
-- Schema Supabase — mesmo projeto/repositório do PMOC Digital.
-- Tabelas prefixadas com "hvac_" para não colidir com as
-- tabelas existentes do PMOC (Cliente, Dispositivo, RTU,
-- Manutencao_Preventiva).
-- Execute este arquivo inteiro no SQL Editor do Supabase.
-- ============================================================

-- ---------- Obras ----------
create table if not exists hvac_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text,
  location text,
  company text,           -- empresa executora
  cnpj text,               -- CNPJ da executora
  tech text,                -- Eng. Responsável Técnico (nome/CREA)
  executor_nome text,       -- técnico executor de campo
  contratante_nome text,
  contratante_cnpj text,
  contratante_representante text,
  art_numero text,
  art_file_url text,        -- caminho no Storage (bucket hvac-anexos)
  art_file_name text,
  art_file_type text,
  cond_temp text,           -- condições ambientais do dia (°C)
  cond_umid text,           -- umidade relativa (%)
  norms jsonb default '[]'::jsonb,  -- lista de normas de referência
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- Equipamentos / redes de duto ----------
create table if not exists hvac_equipment (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references hvac_projects(id) on delete cascade,
  tag text not null,               -- ex: "UE-01"
  type text not null,              -- split | cassete | exaustao | ventilacao
  capacity text,
  room text,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ---------- Verificações / testes por equipamento ----------
create table if not exists hvac_tests (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references hvac_equipment(id) on delete cascade,
  test_key text not null,          -- ex: "estanqueidade", "GR-04-3"
  label text not null,
  unit text,
  min_ref numeric,                 -- faixa de referência (nulo = sem faixa fixa)
  max_ref numeric,
  vazao_projeto numeric,           -- para grelhas/dutos: vazão de projeto (m³/h)
  value text,                      -- valor medido (texto p/ aceitar vírgula/decimais)
  done boolean default false,
  photo_url text,                  -- caminho no Storage (bucket hvac-fotos)
  measured_at timestamptz,         -- timestamp da primeira leitura
  sort_order int default 0,
  created_at timestamptz default now()
);

create index if not exists idx_hvac_equipment_project on hvac_equipment(project_id);
create index if not exists idx_hvac_tests_equipment on hvac_tests(equipment_id);

-- ---------- updated_at automático em hvac_projects ----------
create or replace function hvac_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_hvac_projects_updated_at on hvac_projects;
create trigger trg_hvac_projects_updated_at
  before update on hvac_projects
  for each row execute function hvac_set_updated_at();

-- ============================================================
-- Storage — buckets para fotos de teste e anexo de ART
-- (crie também pela UI do Supabase: Storage > New bucket,
-- caso prefira não rodar via SQL)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('hvac-fotos', 'hvac-fotos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('hvac-anexos', 'hvac-anexos', true)
on conflict (id) do nothing;

-- ============================================================
-- RLS — Row Level Security
-- Ajuste conforme o padrão de autenticação já usado no PMOC
-- Digital. Abaixo, uma política aberta para uso com a anon key
-- (equivalente ao nível de proteção atual do PMOC Digital);
-- restrinja depois se adicionar login de usuário.
-- ============================================================
alter table hvac_projects enable row level security;
alter table hvac_equipment enable row level security;
alter table hvac_tests enable row level security;

drop policy if exists "hvac_projects_all" on hvac_projects;
create policy "hvac_projects_all" on hvac_projects for all using (true) with check (true);

drop policy if exists "hvac_equipment_all" on hvac_equipment;
create policy "hvac_equipment_all" on hvac_equipment for all using (true) with check (true);

drop policy if exists "hvac_tests_all" on hvac_tests;
create policy "hvac_tests_all" on hvac_tests for all using (true) with check (true);