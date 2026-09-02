// ============================================================
// COMISSIONAMENTO - HVAC — app.js
// App vanilla JS + Supabase (mesmo padrão do PMOC Digital).
// Renderização por innerHTML com delegação de eventos.
// ============================================================

const root = document.getElementById("root");
const cameraInput = document.getElementById("camera-input");
const artInput = document.getElementById("art-input");

const DEFAULT_NORMS = [
  "NBR 16401-1/2/3:2008 — Instalações de ar-condicionado — Sistemas centrais e unitários",
  "NBR 16665:2021 — Sistemas de climatização — Unidades split e VRF — requisitos de instalação",
  "NBR 6401 — Instalações centrais de ar-condicionado para conforto (parâmetros básicos, onde aplicável)",
  "NBR 5410:2004 — Instalações elétricas de baixa tensão",
  "NR-10 — Segurança em instalações e serviços em eletricidade",
  "NR-35 — Trabalho em altura (quando aplicável à obra)",
  "Resolução CONAMA nº 267/2000 e legislação correlata — Manejo e recolhimento de fluidos refrigerantes",
  "Portaria GM/MS nº 1.083/2022 (PMOC) — Qualidade do ar interior em ambientes climatizados",
  "ASHRAE Standard 15 — Safety Standard for Refrigeration Systems (referência técnica complementar)",
];

const TYPE_META = {
  split: { label: "Unidade Evaporadora — Split" },
  cassete: { label: "Unidade Evaporadora — Cassete" },
  exaustao: { label: "Rede de Exaustão" },
  ventilacao: { label: "Rede de Ventilação Mecânica" },
};

const STATUS_META = {
  conforme: { label: "Conforme", color: "#35C5A6" },
  fora: { label: "Fora da faixa", color: "#E4572E" },
  informativo: { label: "Registrado", color: "#8A98A3" },
  pendente: { label: "Pendente", color: "#2E3A42" },
};

function climaTestDefs() {
  return [
    { test_key: "estanqueidade", label: "Estanqueidade (pressurização N2)", unit: "psi", min_ref: 300, max_ref: 450 },
    { test_key: "vacuo", label: "Vácuo de linha (decaimento)", unit: "µmHg", min_ref: 0, max_ref: 500 },
    { test_key: "carga_gas", label: "Carga de gás adicional", unit: "g", min_ref: null, max_ref: null },
    { test_key: "pressao_suc", label: "Pressão de sucção", unit: "psi", min_ref: 110, max_ref: 145 },
    { test_key: "tensao", label: "Tensão elétrica", unit: "V", min_ref: 198, max_ref: 242 },
    { test_key: "corrente", label: "Corrente (amperagem)", unit: "A", min_ref: null, max_ref: null },
    { test_key: "temp_insuflamento", label: "Temperatura de insuflamento (termômetro laser)", unit: "°C", min_ref: 10, max_ref: 18 },
  ];
}

function grelhaTestDefs(items) {
  const counts = {};
  return items.map(({ tag, vazao }) => {
    counts[tag] = (counts[tag] || 0) + 1;
    return {
      test_key: `${tag}-${counts[tag]}`,
      label: `${tag} — un. ${counts[tag]}`,
      unit: "m³/h",
      vazao_projeto: vazao ? Number(vazao) : null,
    };
  });
}

function getTestStatus(t) {
  if (!t.value || String(t.value).trim() === "") return "pendente";
  const v = parseFloat(String(t.value).replace(",", "."));
  if (isNaN(v)) return "pendente";
  if (t.vazao_projeto != null) {
    if (!t.vazao_projeto) return "informativo";
    const dev = Math.abs(v - t.vazao_projeto) / t.vazao_projeto;
    return dev <= 0.2 ? "conforme" : "fora";
  }
  if (t.min_ref != null && t.max_ref != null) {
    return v >= t.min_ref && v <= t.max_ref ? "conforme" : "fora";
  }
  return "informativo";
}

function fmtDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function dialSVG(done, total, size) {
  const pct = total ? done / total : 0;
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);
  const complete = done === total && total > 0;
  const color = complete ? "#35C5A6" : "#F2A93B";
  return `
    <div class="dial" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="#2E3A42" stroke-width="4" fill="none"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="4" fill="none"
          stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${offset}"/>
      </svg>
      <div class="label" style="color:${complete ? color : "#EDEFF1"}">${done}/${total}</div>
    </div>`;
}

// ============================================================
// Estado
// ============================================================
const state = {
  screen: "home", // home | project | equipment | report
  projects: [],
  currentProjectId: null,
  currentEquipmentId: null,
  capturingTestId: null,
  viewingPhoto: null,
};

function currentProject() {
  return state.projects.find((p) => p.id === state.currentProjectId) || null;
}
function currentEquipment() {
  const p = currentProject();
  return p ? (p.equipment || []).find((e) => e.id === state.currentEquipmentId) : null;
}

// ============================================================
// Camada de dados — Supabase
// ============================================================
async function fetchProjects() {
  const { data, error } = await supabase
    .from("hvac_projects")
    .select("*, hvac_equipment(*, hvac_tests(*))")
    .order("created_at", { ascending: true });
  if (error) {
    console.error(error);
    alert("Erro ao carregar obras: " + error.message);
    return [];
  }
  return data.map((p) => ({ ...p, equipment: (p.hvac_equipment || []).sort((a, b) => a.sort_order - b.sort_order) }));
}

async function reloadProjects() {
  state.projects = await fetchProjects();
  render();
}

async function createProject(fields) {
  const { data, error } = await supabase
    .from("hvac_projects")
    .insert([{ ...fields, norms: DEFAULT_NORMS }])
    .select()
    .single();
  if (error) { alert("Erro ao criar obra: " + error.message); return null; }
  return data;
}

async function createEquipment(projectId, tag, type, capacity, room) {
  const { data: eq, error } = await supabase
    .from("hvac_equipment")
    .insert([{ project_id: projectId, tag, type, capacity, room }])
    .select()
    .single();
  if (error) { alert("Erro ao adicionar equipamento: " + error.message); return null; }

  const defs = type === "split" || type === "cassete" ? climaTestDefs() : grelhaTestDefs([{ tag, vazao: null }]);
  const rows = defs.map((d) => ({ ...d, equipment_id: eq.id }));
  const { error: tErr } = await supabase.from("hvac_tests").insert(rows);
  if (tErr) alert("Equipamento criado, mas houve erro ao gerar os testes: " + tErr.message);
  return eq;
}

async function updateTestRemote(testId, patch) {
  const { error } = await supabase.from("hvac_tests").update(patch).eq("id", testId);
  if (error) console.error("Erro ao salvar teste:", error.message);
}

async function updateProjectRemote(projectId, patch) {
  const { error } = await supabase.from("hvac_projects").update(patch).eq("id", projectId);
  if (error) alert("Erro ao salvar: " + error.message);
}

// ---------- Seed do projeto piloto RDSL Cemed Salute ----------
async function seedRdslProject() {
  const project = await createProject({
    name: "RDSL Cemed Salute",
    client: "FACILITAS · Contrato 6300",
    location: "Brasília, DF",
  });
  if (!project) return;

  const climaEquip = [
    ["UE-01", "split", "9.000 Btu/h", "CONS. 03 / 04"],
    ["UE-02", "split", "9.000 Btu/h", "CONS. 02 / 03"],
    ["UE-03", "split", "9.000 Btu/h", "CONS. 01"],
    ["UE-04", "split", "9.000 Btu/h", "CONS. 01"],
    ["UE-05", "cassete", "36.000 Btu/h", "ESPERA PRIMÁRIA"],
    ["UE-06", "cassete", "36.000 Btu/h", "CONS. 07 / ESPERA PRIMÁRIA"],
    ["UE-07", "split", "9.000 Btu/h", "CONS. 08 / 09"],
    ["UE-08", "split", "9.000 Btu/h", "CONS. 08 / 09"],
    ["UE-09", "cassete", "24.000 Btu/h", "ESPERA SECUNDÁRIA"],
    ["UE-10", "cassete", "24.000 Btu/h", "ESPERA SECUNDÁRIA"],
    ["UE-11", "split", "12.000 Btu/h", "CIRCULAÇÃO"],
    ["UE-12", "split", "12.000 Btu/h", "CIRCULAÇÃO"],
    ["UE-13", "split", "12.000 Btu/h", "RACK"],
    ["UE-14", "split", "9.000 Btu/h", "CONS. 05"],
    ["UE-15", "split", "9.000 Btu/h", "CONS. 05"],
  ];
  for (const [tag, type, capacity, room] of climaEquip) {
    await createEquipment(project.id, tag, type, capacity, room);
  }

  // Redes de duto — inseridas como um único equipamento "agregado" por rede,
  // com um teste por grelha/terminal (replica o protótipo React).
  const exaustaoTags = [
    ["EX-01", "1400"], ["TA-01", "80"], ["TA-01", "80"], ["TA-01", "100"], ["TA-01", "100"],
    ["TA-01", "100"], ["TA-01", "100"], ["TA-01", "100"], ["TA-01", "100"], ["TA-01", "100"],
    ["TA-01", "100"], ["TA-01", "120"], ["TA-01", "120"], ["TA-02", "200"],
  ];
  const ventilacaoTags = [
    ["VN-01", "1400"], ["VN-02", "1818"],
    ["GR-01", "100"], ["GR-01", "100"], ["GR-01", "100"], ["GR-01", "100"], ["GR-01", "100"],
    ["GR-01", "100"], ["GR-01", "100"], ["GR-01", "100"], ["GR-01", "100"],
    ["GR-02", "510"], ["GR-03", "408"],
    ["GR-04", "170"], ["GR-04", "170"], ["GR-04", "170"], ["GR-04", "170"], ["GR-04", "170"],
    ["GR-04", "170"], ["GR-04", "170"], ["GR-04", "170"], ["GR-04", "170"], ["GR-04", "170"],
    ["GR-04", "170"], ["GR-04", "200"], ["GR-04", "200"], ["GR-04", "200"], ["GR-04", "200"],
    ["GR-04", "170"], ["GR-04", "170"],
  ];

  await createDuctNetwork(project.id, "EXAUSTAO", "exaustao", "EX-01 · TA-01 ×12 · TA-02", "COPA, ATR, DML, RACK, CONS. 05/07", exaustaoTags);
  await createDuctNetwork(project.id, "VENTILACAO", "ventilacao", "VN-01 · VN-02 · GR-01 ×9 · GR-02 · GR-03 · GR-04 ×18", "Recepção, Circulação e consultórios (ar externo)", ventilacaoTags);

  await reloadProjects();
  state.currentProjectId = project.id;
  state.screen = "project";
  render();
}

async function createDuctNetwork(projectId, tag, type, capacity, room, tagVazaoPairs) {
  const { data: eq, error } = await supabase
    .from("hvac_equipment")
    .insert([{ project_id: projectId, tag, type, capacity, room }])
    .select()
    .single();
  if (error) { alert("Erro ao criar rede: " + error.message); return; }
  const items = tagVazaoPairs.map(([t, v]) => ({ tag: t, vazao: v }));
  const defs = grelhaTestDefs(items);
  const rows = defs.map((d) => ({ ...d, equipment_id: eq.id }));
  const { error: tErr } = await supabase.from("hvac_tests").insert(rows);
  if (tErr) alert("Erro ao gerar testes da rede: " + tErr.message);
}
// ============================================================
// Render
// ============================================================
function render() {
  if (state.screen === "home") return renderHome();
  if (state.screen === "project") return renderProject();
  if (state.screen === "equipment") return renderEquipment();
  if (state.screen === "report") return renderReport();
}

function renderHome() {
  const rows = state.projects.map((p) => {
    const tests = (p.equipment || []).flatMap((e) => e.hvac_tests || []);
    const done = tests.filter((t) => t.done).length;
    return `
      <button class="card-btn" data-action="open-project" data-id="${p.id}">
        <div style="flex:1;min-width:0">
          <div class="title">${escapeHtml(p.name)}</div>
          <div class="sub">${escapeHtml(p.client || "")} · ${(p.equipment || []).length} itens</div>
        </div>
        ${dialSVG(done, tests.length, 36)}
        <span>›</span>
      </button>`;
  }).join("");

  root.innerHTML = `
    <div class="app-header" style="border-bottom:none">
      <div class="eyebrow">Comissionamento - HVAC</div>
      <h1>Suas obras</h1>
    </div>
    <div class="list">
      ${rows || `<div style="color:#8A98A3;font-size:13px;padding:8px 2px">Nenhuma obra cadastrada ainda.</div>`}
      <button class="dashed-btn" data-action="show-add-project">+ Nova obra</button>
      ${state.projects.length === 0 ? `<button class="dashed-btn" data-action="seed-rdsl">Carregar obra piloto (RDSL Cemed Salute)</button>` : ""}
    </div>
  `;
}

function renderProject() {
  const p = currentProject();
  if (!p) { state.screen = "home"; return renderHome(); }
  const equip = p.equipment || [];
  const allTests = equip.flatMap((e) => e.hvac_tests || []);
  const done = allTests.filter((t) => t.done).length;
  const total = allTests.length;
  const allDone = total > 0 && done === total;

  const grouped = {};
  equip.forEach((e) => { (grouped[e.type] = grouped[e.type] || []).push(e); });

  const groupsHtml = Object.entries(grouped).map(([type, items]) => `
    <div style="margin-bottom:24px">
      <div class="tick-rule"><span class="txt">${TYPE_META[type].label} · ${items.length}</span><span class="line"></span></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${items.map((e) => {
          const tests = e.hvac_tests || [];
          const d = tests.filter((t) => t.done).length;
          return `
            <button class="card-btn" data-action="open-equipment" data-id="${e.id}">
              <div style="flex:1;min-width:0">
                <div class="title" style="font-family:var(--font-data)">${escapeHtml(e.tag)}</div>
                <div class="sub">${escapeHtml(e.capacity || "")} · ${escapeHtml(e.room || "")}</div>
              </div>
              ${dialSVG(d, tests.length, 40)}
              <span>›</span>
            </button>`;
        }).join("")}
      </div>
    </div>
  `).join("");

  root.innerHTML = `
    <div class="app-header">
      <button class="back-link" data-action="go-home">‹ Suas obras</button>
      <div class="eyebrow">${escapeHtml(p.client || "")}</div>
      <h1>${escapeHtml(p.name)}</h1>
      <div class="meta"><span>Inst. HVAC (PE)</span><span>${escapeHtml(p.location || "")}</span></div>
      <div class="summary-bar">
        ${dialSVG(done, total, 48)}
        <div>
          <div class="txt">${done}/${total} verificações registradas</div>
          <div class="sub">${equip.length} equipamentos/redes nesta obra</div>
        </div>
      </div>
    </div>
    <div class="list">
      ${groupsHtml}
      <button class="dashed-btn" data-action="show-add-equip" style="margin-bottom:10px">+ Adicionar equipamento</button>
      <button class="outline-btn" data-action="show-art" style="color:${p.art_file_url ? "#35C5A6" : "#8A98A3"};border:1px solid ${p.art_file_url ? "#35C5A6" : "#2E3A42"}">
        ${p.art_file_url ? `ART anexada: ${escapeHtml(p.art_file_name || "")}` : "Anexar ART"}
      </button>
      <button class="outline-btn" data-action="show-cond" style="color:${p.cond_temp ? "#35C5A6" : "#8A98A3"};border:1px solid ${p.cond_temp ? "#35C5A6" : "#2E3A42"}">
        ${p.cond_temp ? `Condições: ${escapeHtml(p.cond_temp)}°C · UR ${escapeHtml(p.cond_umid || "—")}%` : "Condições ambientais do dia"}
      </button>
    </div>
    <div class="bottom-action">
      <div class="inner">
        <button class="btn-primary" data-action="open-report" style="background:${allDone ? "#35C5A6" : "#F2A93B"};color:#10151A">
          ${allDone ? "Gerar laudo em PDF" : `Ver laudo (${done}/${total})`}
        </button>
      </div>
    </div>
  `;
}

function renderEquipment() {
  const e = currentEquipment();
  if (!e) { state.screen = "project"; return renderProject(); }
  const tests = (e.hvac_tests || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const done = tests.filter((t) => t.done).length;

  const rowsHtml = tests.map((t) => {
    const status = getTestStatus(t);
    const sMeta = STATUS_META[status];
    const rangeText = t.vazao_projeto != null
      ? `Projeto: ${t.vazao_projeto} m³/h (±20%)`
      : (t.min_ref != null && t.max_ref != null ? `Faixa ref.: ${t.min_ref}–${t.max_ref} ${t.unit}` : null);
    return `
      <div class="test-row ${status === "fora" ? "fora" : (t.done ? "done" : "")}" data-test-id="${t.id}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:500">
            <span data-role="check-icon">${t.done ? "✓" : "○"}</span> ${escapeHtml(t.label)}
          </div>
          <div data-role="photo-slot">
            ${t.photo_url
              ? `<div style="display:flex;align-items:center;gap:6px">
                   <button class="thumb-btn" data-action="view-photo" data-url="${t.photo_url}" style="width:30px;height:30px;border-radius:4px;overflow:hidden;border:1px solid #35C5A6;padding:0">
                     <img src="${t.photo_url}" style="width:100%;height:100%;object-fit:cover" />
                   </button>
                   <button data-action="capture" data-test-id="${t.id}" style="font-size:10px;background:#10151A;color:#8A98A3;border:1px solid #2E3A42;border-radius:4px;padding:5px 8px">Refazer</button>
                 </div>`
              : `<button data-action="capture" data-test-id="${t.id}" style="font-size:11px;background:#10151A;color:#8A98A3;border:1px solid #2E3A42;border-radius:4px;padding:6px 10px">📷 Capturar</button>`}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <input type="text" data-role="value-input" data-test-id="${t.id}" value="${escapeAttr(t.value || "")}"
            placeholder="${t.vazao_projeto != null ? `Projeto: ${t.vazao_projeto}` : "Valor medido"}" />
          <span style="font-size:12px;color:#8A98A3;font-family:var(--font-data)">${t.unit || ""}</span>
          <button data-action="toggle-done" data-test-id="${t.id}" style="flex-shrink:0;border-radius:4px;padding:8px 12px;font-size:11px;font-weight:600;background:${t.done ? "#35C5A6" : "#2E3A42"};color:${t.done ? "#10151A" : "#EDEFF1"};border:none">
            ${t.done ? "OK" : "Marcar"}
          </button>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px">
          <span class="status-pill" data-role="status-pill" style="color:${sMeta.color};border:1px solid ${sMeta.color}">
            <span class="status-dot" style="background:${sMeta.color}"></span>${sMeta.label}
          </span>
          ${rangeText ? `<span style="font-size:10.5px;color:#8A98A3;font-family:var(--font-data)">${rangeText}</span>` : ""}
        </div>
        ${t.measured_at ? `<div style="font-size:10px;margin-top:4px;color:#8A98A3;font-family:var(--font-data)" data-role="timestamp">Registrado em ${fmtDateTime(t.measured_at)}</div>` : `<div data-role="timestamp"></div>`}
      </div>`;
  }).join("");

  root.innerHTML = `
    <div class="overlay">
      <div class="overlay-header">
        <button class="back-link" data-action="close-equipment" style="margin:0"><span>‹</span></button>
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:600;font-family:var(--font-data)">${escapeHtml(e.tag)}</div>
          <div style="font-size:12px;color:#8A98A3">${escapeHtml(e.capacity || "")} · ${escapeHtml(e.room || "")}</div>
        </div>
        ${dialSVG(done, tests.length, 40)}
      </div>
      <div style="padding:20px">
        <div class="tick-rule"><span class="txt">Testes e medições</span><span class="line"></span></div>
        ${rowsHtml}
      </div>
    </div>
  `;
}

// ============================================================
// Laudo — memorial descritivo (mesma estrutura do protótipo)
// ============================================================
function renderReport() {
  const p = currentProject();
  if (!p) { state.screen = "home"; return renderHome(); }
  const equip = p.equipment || [];
  const allTests = equip.flatMap((e) => e.hvac_tests || []);
  const done = allTests.filter((t) => t.done).length;
  const total = allTests.length;
  const allDone = total > 0 && done === total;
  const foraCount = allTests.filter((t) => getTestStatus(t) === "fora").length;
  const today = new Date().toLocaleDateString("pt-BR");
  const docNumber = `RT-001/${new Date().getFullYear()}`;
  const norms = (p.norms && p.norms.length ? p.norms : DEFAULT_NORMS);

  const grouped = {};
  equip.forEach((e) => { (grouped[e.type] = grouped[e.type] || []).push(e); });

  const toc = [
    "1. Contracapa e Partes Interessadas",
    "2. Apresentação e Normas Aplicáveis",
    "3. Anotação de Responsabilidade Técnica (ART)",
    "4. Medições, Dados e Evidências Fotográficas",
    "5. Startup e Metodologia de Comissionamento",
    "6. Conclusão",
    "7. Assinaturas",
  ];

  const medicoesHtml = Object.entries(grouped).map(([type, items]) => `
    <div style="margin-bottom:32px">
      <div style="background:#1B3A5C;color:#fff;font-size:12px;font-weight:700;text-transform:uppercase;padding:8px 12px;margin-bottom:12px">${TYPE_META[type].label}</div>
      <div style="display:flex;flex-direction:column;gap:20px">
        ${items.map((e) => `
          <div style="border:1px solid #1B3A5C">
            <div style="background:#EDF1F6;display:flex;justify-content:space-between;padding:8px 12px;font-size:12.5px;font-weight:700">
              <span style="font-family:var(--font-data)">${escapeHtml(e.tag)}</span>
              <span style="font-weight:400;color:#555;font-size:11px">${escapeHtml(e.capacity || "")} · ${escapeHtml(e.room || "")}</span>
            </div>
            ${(e.hvac_tests || []).map((t, i) => {
              const status = getTestStatus(t);
              const sMeta = STATUS_META[status];
              return `
              <div style="display:flex;font-size:11px;background:${i % 2 === 0 ? "#fff" : "#F5F7FA"};border-top:1px solid #E6EAF0;border-left:${status === "fora" ? "3px solid #E4572E" : "3px solid transparent"}">
                <div style="width:22px;background:#1B3A5C;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10px">${i + 1}</div>
                <div style="flex:1;padding:8px 12px;display:flex;justify-content:space-between;gap:12px">
                  <div>
                    <div style="font-weight:500;color:#1a1a1a">${escapeHtml(t.label)}</div>
                    <div style="font-family:var(--font-data);color:#444">
                      ${t.value ? `${escapeHtml(t.value)} ${t.unit || ""}` : "não registrado"}
                      ${t.vazao_projeto != null ? ` <span style="color:#8A98A3">· projeto: ${t.vazao_projeto} m³/h</span>` : ""}
                      ${(t.min_ref != null && t.max_ref != null) ? ` <span style="color:#8A98A3">· faixa: ${t.min_ref}–${t.max_ref} ${t.unit}</span>` : ""}
                      ${t.measured_at ? ` <span style="color:#8A98A3">· ${fmtDateTime(t.measured_at)}</span>` : ""}
                    </div>
                    <span style="display:inline-block;margin-top:4px;font-size:9px;font-weight:700;text-transform:uppercase;padding:1px 6px;background:${sMeta.color};color:#fff">${sMeta.label}</span>
                  </div>
                  ${t.photo_url
                    ? `<img src="${t.photo_url}" style="width:46px;height:46px;object-fit:cover;border:1px solid #D8DEE6;flex-shrink:0" />`
                    : `<div style="width:46px;height:46px;border:1px dashed #D8DEE6;color:#B0B8C2;display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0">sem foto</div>`}
                </div>
              </div>`;
            }).join("")}
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");

  const startupTable = equip.filter((e) => e.type === "split" || e.type === "cassete").map((e, i) => {
    const byKey = Object.fromEntries((e.hvac_tests || []).map((t) => [t.test_key, t]));
    const keyTests = ["pressao_suc", "tensao", "corrente", "temp_insuflamento"];
    const statuses = keyTests.map((k) => byKey[k] ? getTestStatus(byKey[k]) : "pendente");
    const worst = statuses.includes("fora") ? "fora" : (statuses.includes("pendente") ? "pendente" : "conforme");
    const wMeta = STATUS_META[worst];
    return `
      <div style="display:flex;font-size:10.5px;background:${i % 2 === 0 ? "#fff" : "#F5F7FA"};border-top:1px solid #E6EAF0">
        <div style="width:60px;padding:6px 8px;font-weight:600;font-family:var(--font-data)">${escapeHtml(e.tag)}</div>
        <div style="flex:1;padding:6px 8px;color:#555">${escapeHtml(e.room || "")}</div>
        <div style="width:78px;padding:6px 8px;font-family:var(--font-data)">${byKey.pressao_suc && byKey.pressao_suc.value ? byKey.pressao_suc.value + " psi" : "—"}</div>
        <div style="width:60px;padding:6px 8px;font-family:var(--font-data)">${byKey.tensao && byKey.tensao.value ? byKey.tensao.value + " V" : "—"}</div>
        <div style="width:58px;padding:6px 8px;font-family:var(--font-data)">${byKey.corrente && byKey.corrente.value ? byKey.corrente.value + " A" : "—"}</div>
        <div style="width:68px;padding:6px 8px;font-family:var(--font-data)">${byKey.temp_insuflamento && byKey.temp_insuflamento.value ? byKey.temp_insuflamento.value + "°C" : "—"}</div>
        <div style="width:78px;padding:6px 8px"><span style="font-size:9px;font-weight:700;text-transform:uppercase;padding:1px 6px;background:${wMeta.color};color:#fff">${wMeta.label}</span></div>
      </div>`;
  }).join("");

  root.innerHTML = `
    <div class="overlay" style="background:#10151A">
      <div class="no-print" style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #2E3A42;position:sticky;top:0;background:#10151A">
        <button class="back-link" data-action="close-report" style="margin:0">‹ Voltar</button>
        <button data-action="print-report" style="display:flex;align-items:center;gap:6px;border-radius:6px;padding:8px 14px;font-size:12px;font-weight:600;background:#35C5A6;color:#10151A;border:none">Salvar em PDF</button>
      </div>

      <div id="report-print" style="max-width:680px;margin:0 auto">
        <!-- CAPA -->
        <div class="page">
          <div style="background:#1B3A5C;height:8px;margin:-40px -40px 64px"></div>
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:96px">
            <div style="display:flex;gap:3px">
              <div style="width:8px;height:44px;background:#1B3A5C;transform:skewX(-12deg)"></div>
              <div style="width:8px;height:44px;background:#1B3A5C;transform:skewX(-12deg);opacity:.75"></div>
              <div style="width:8px;height:44px;background:#1B3A5C;transform:skewX(-12deg);opacity:.5"></div>
            </div>
            <div>
              <div style="font-family:var(--font-display);font-size:20px;font-weight:700;color:#1B3A5C">${escapeHtml(p.company) || "[ Empresa executora não informada ]"}</div>
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#667">${escapeHtml(p.cnpj) || "CNPJ não informado"}</div>
            </div>
          </div>
          <div style="text-align:center;margin-top:128px">
            <div style="font-size:12px;text-transform:uppercase;letter-spacing:.3em;color:#667">Memorial Descritivo de Comissionamento</div>
            <h1 style="font-family:var(--font-display);font-size:28px;margin:12px 0 8px;color:#1a1a1a">${escapeHtml(p.name)}</h1>
            <div style="font-size:13px;color:#555">${escapeHtml(p.location || "")}</div>
            <div style="margin-top:32px;display:inline-block;background:#EDF1F6;color:#1B3A5C;font-size:13px;font-weight:700;padding:8px 16px">${docNumber} · Rev.00</div>
          </div>
          <div style="text-align:center;margin-top:80px;font-size:11px;color:#667">Emitido em ${today}</div>
        </div>

        <!-- CONTRACAPA -->
        <div class="page">
          <div class="section-title"><div class="num">1</div><h2>Contracapa e Partes Interessadas</h2></div>
          <table style="width:100%;font-size:12px;border-collapse:collapse;margin-bottom:24px">
            <tbody>
              <tr><td style="width:140px;font-weight:700;color:#1B3A5C;vertical-align:top;padding:8px 12px 8px 0">Contratante</td>
                <td style="padding:8px 0;border-bottom:1px solid #E6EAF0">${escapeHtml(p.contratante_nome) || "—"}<br><span style="color:#777">${p.contratante_cnpj ? "CNPJ " + escapeHtml(p.contratante_cnpj) : "CNPJ não informado"}${p.contratante_representante ? " · Repres.: " + escapeHtml(p.contratante_representante) : ""}</span></td></tr>
              <tr><td style="font-weight:700;color:#1B3A5C;vertical-align:top;padding:8px 12px 8px 0">Contratada / Executora</td>
                <td style="padding:8px 0;border-bottom:1px solid #E6EAF0">${escapeHtml(p.company) || "—"}<br><span style="color:#777">${p.cnpj ? "CNPJ " + escapeHtml(p.cnpj) : "CNPJ não informado"}</span></td></tr>
              <tr><td style="font-weight:700;color:#1B3A5C;vertical-align:top;padding:8px 12px 8px 0">Responsável Técnico</td>
                <td style="padding:8px 0;border-bottom:1px solid #E6EAF0">${escapeHtml(p.tech) || "—"}</td></tr>
              <tr><td style="font-weight:700;color:#1B3A5C;vertical-align:top;padding:8px 12px 8px 0">Executor de campo</td>
                <td style="padding:8px 0;border-bottom:1px solid #E6EAF0">${escapeHtml(p.executor_nome) || "—"}</td></tr>
              <tr><td style="font-weight:700;color:#1B3A5C;vertical-align:top;padding:8px 12px 8px 0">ART nº</td>
                <td style="padding:8px 0;border-bottom:1px solid #E6EAF0;font-family:var(--font-data)">${escapeHtml(p.art_numero) || "—"}</td></tr>
            </tbody>
          </table>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#1B3A5C;margin-bottom:8px">Histórico de revisões</div>
          <table style="width:100%;font-size:11px;border-collapse:collapse;border:1px solid #D8DEE6">
            <thead><tr style="background:#EDF1F6"><th style="text-align:left;padding:6px 8px">Rev.</th><th style="text-align:left;padding:6px 8px">Data</th><th style="text-align:left;padding:6px 8px">Descrição</th></tr></thead>
            <tbody><tr><td style="padding:6px 8px;border-top:1px solid #E6EAF0">00</td><td style="padding:6px 8px;border-top:1px solid #E6EAF0">${today}</td><td style="padding:6px 8px;border-top:1px solid #E6EAF0">Emissão inicial</td></tr></tbody>
          </table>
        </div>

        <!-- APRESENTAÇÃO E NORMAS -->
        <div class="page">
          <div class="section-title"><div class="num">2</div><h2>Apresentação e Normas Aplicáveis</h2></div>
          <p style="font-size:12px;line-height:1.6;color:#333;margin-bottom:16px">O presente memorial descritivo documenta os procedimentos de comissionamento de campo executados nos sistemas de climatização, exaustão e ventilação mecânica instalados na obra ${escapeHtml(p.name)}, compreendendo a verificação de estanqueidade, vácuo, carga de fluido refrigerante, parâmetros elétricos e desempenho térmico de cada equipamento, conforme registrado na Seção 4 deste documento.</p>
          <p style="font-size:12px;line-height:1.6;color:#333;margin-bottom:16px">Os ensaios e critérios de aceitação adotados têm como referência as normas técnicas e regulamentações a seguir. Cabe ao Engenheiro Responsável Técnico confirmar a aplicabilidade de cada item à presente obra.</p>
          <div style="border:1px solid #D8DEE6">
            ${norms.map((n, i) => `
              <div style="display:flex;font-size:11px;background:${i % 2 === 0 ? "#fff" : "#F5F7FA"};border-bottom:1px solid #E6EAF0">
                <div style="width:24px;background:#1B3A5C;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">${i + 1}</div>
                <div style="flex:1;padding:8px 12px;color:#333">${escapeHtml(n)}</div>
              </div>`).join("")}
          </div>
          <div style="margin-top:40px;font-size:11px;font-weight:700;text-transform:uppercase;color:#1B3A5C;margin-bottom:8px">Índice</div>
          <div style="border:1px solid #D8DEE6">
            ${toc.map((t, i) => `<div style="padding:8px 12px;font-size:12px;background:${i % 2 === 0 ? "#fff" : "#F5F7FA"};${i < toc.length - 1 ? "border-bottom:1px solid #E6EAF0" : ""};color:#333">${t}</div>`).join("")}
          </div>
        </div>

        <!-- ART ANEXA -->
        <div class="page">
          <div class="section-title"><div class="num">3</div><h2>Anotação de Responsabilidade Técnica (ART)</h2></div>
          ${p.art_file_url
            ? (p.art_file_type && p.art_file_type.startsWith("image/")
                ? `<div style="font-size:12px;color:#555;margin-bottom:12px">Documento anexado: <span style="font-family:var(--font-data)">${escapeHtml(p.art_file_name || "")}</span></div><img src="${p.art_file_url}" style="width:100%;border:1px solid #D8DEE6" />`
                : `<div style="font-size:12px;color:#555;margin-bottom:12px">Documento anexado: <span style="font-family:var(--font-data)">${escapeHtml(p.art_file_name || "")}</span></div><div style="padding:32px 16px;text-align:center;font-size:12px;border:1px dashed #D8DEE6;color:#777">Arquivo PDF anexado — anexar fisicamente ao registro final junto ao órgão de classe.</div>`)
            : `<div style="padding:40px 16px;text-align:center;font-size:12px;border:1px dashed #D8DEE6;color:#999">Nenhuma ART anexada. Utilize o botão "Anexar ART" na tela do projeto antes de emitir a versão final deste memorial para registro.</div>`}
        </div>

        <!-- MEDIÇÕES -->
        <div class="page" style="page-break-after:auto">
          <div class="section-title"><div class="num">4</div><h2>Medições, Dados e Evidências Fotográficas</h2></div>
          <div style="font-size:11px;color:#1B3A5C;margin-bottom:20px">${done}/${total} verificações registradas nesta obra</div>
          ${medicoesHtml}
        </div>

        <!-- STARTUP -->
        <div class="page">
          <div class="section-title"><div class="num">5</div><h2>Startup e Metodologia de Comissionamento</h2></div>
          <p style="font-size:12px;line-height:1.6;color:#333;margin-bottom:12px">O startup (partida inicial) de cada unidade foi realizado com o equipamento energizado e operando em regime contínuo por no mínimo 15 a 20 minutos antes da leitura das grandezas de performance (pressão, corrente e temperatura de insuflamento), tempo necessário para estabilização do compressor e das trocas térmicas no evaporador.</p>
          <p style="font-size:12px;line-height:1.6;color:#333;margin-bottom:20px">A coleta de dados seguiu a sequência: (1) estanqueidade com nitrogênio, (2) vácuo de linha com análise de decaimento, (3) complemento de carga de refrigerante, (4) pressão de sucção em regime, (5) tensão de alimentação, (6) corrente em regime, e (7) temperatura de insuflamento com termômetro infravermelho a laser. Cada verificação foi registrada com valor medido e respectiva evidência fotográfica, conforme Seção 4.</p>
          ${p.cond_temp ? `<div style="display:flex;gap:16px;background:#EDF1F6;padding:8px 12px;margin-bottom:20px;font-size:11px;color:#333"><span style="font-weight:700;color:#1B3A5C">Condições ambientais no dia do teste:</span><span style="font-family:var(--font-data)">Temp. externa: ${escapeHtml(p.cond_temp)}°C</span>${p.cond_umid ? `<span style="font-family:var(--font-data)">UR: ${escapeHtml(p.cond_umid)}%</span>` : ""}</div>` : ""}
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#1B3A5C;margin-bottom:8px">Resumo dos valores de startup por unidade</div>
          <div style="border:1px solid #D8DEE6">
            <div style="display:flex;font-size:10.5px;font-weight:600;background:#EDF1F6;color:#555">
              <div style="width:60px;padding:6px 8px">Unid.</div><div style="flex:1;padding:6px 8px">Ambiente</div>
              <div style="width:78px;padding:6px 8px">P. sucção</div><div style="width:60px;padding:6px 8px">Tensão</div>
              <div style="width:58px;padding:6px 8px">Corrente</div><div style="width:68px;padding:6px 8px">T. insufl.</div>
              <div style="width:78px;padding:6px 8px">Status</div>
            </div>
            ${startupTable}
          </div>
          <p style="font-size:10.5px;line-height:1.5;color:#777;margin-top:16px">Instrumentos utilizados na coleta: manovacuômetro digital, balança digital de recarga de refrigerante, alicate amperímetro/multímetro e termômetro infravermelho a laser. A aferição e a rastreabilidade metrológica destes instrumentos são de responsabilidade da contratada executora.</p>
        </div>

        <!-- CONCLUSÃO -->
        <div class="page">
          <div class="section-title"><div class="num">6</div><h2>Conclusão</h2></div>
          <p style="font-size:12px;line-height:1.6;color:#333;margin-bottom:16px">
            Com base nas verificações de campo registradas neste memorial, foram executadas ${done} de ${total} verificações previstas (${equip.length} equipamentos/redes) na obra ${escapeHtml(p.name)}
            ${allDone ? ", com a totalidade dos itens verificada e registrada com respectiva evidência fotográfica." : ", restando itens pendentes de verificação conforme detalhado na Seção 4 deste documento."}
            ${foraCount > 0 ? ` Dentre as verificações registradas, ${foraCount} apresentaram valor fora da faixa de referência adotada e estão destacadas na Seção 4.` : ""}
          </p>
          <p style="font-size:12px;line-height:1.6;color:#333;margin-bottom:16px">
            ${foraCount > 0
              ? "Recomenda-se a análise das não conformidades identificadas, com eventual reteste após ação corretiva, antes da emissão da revisão final deste memorial para fins de aceite e registro junto ao órgão de classe."
              : (allDone
                  ? "Os sistemas avaliados apresentaram parâmetros de estanqueidade, vácuo, carga de fluido refrigerante, grandezas elétricas e desempenho térmico compatíveis com as recomendações dos fabricantes e com as normas técnicas referenciadas na Seção 2, estando aptos à operação."
                  : "Recomenda-se a conclusão das verificações pendentes antes da emissão da revisão final deste memorial para fins de aceite e registro junto ao órgão de classe.")}
          </p>
          <p style="font-size:11px;color:#777">Este memorial reflete o estado das verificações na data de emissão informada na capa, sendo de responsabilidade do Engenheiro Responsável Técnico a análise final e validação dos dados aqui apresentados antes do registro nos órgãos competentes.</p>
        </div>

        <!-- ASSINATURAS -->
        <div class="page" style="page-break-after:auto">
          <div class="section-title"><div class="num">7</div><h2>Assinaturas</h2></div>
          <div style="display:flex;flex-direction:column;gap:56px;margin-top:40px">
            <div><div style="border-top:1px solid #1a1a1a;width:280px"></div><div style="font-size:12px;font-weight:700;margin-top:6px">${escapeHtml(p.executor_nome) || "Executor de campo"}</div><div style="font-size:11px;color:#777">Executor</div></div>
            <div><div style="border-top:1px solid #1a1a1a;width:280px"></div><div style="font-size:12px;font-weight:700;margin-top:6px">${escapeHtml(p.tech) || "Engenheiro Responsável Técnico"}</div><div style="font-size:11px;color:#777">Engenheiro RT ${p.art_numero ? "· ART " + escapeHtml(p.art_numero) : ""}</div></div>
            <div><div style="border-top:1px solid #1a1a1a;width:280px"></div><div style="font-size:12px;font-weight:700;margin-top:6px">${escapeHtml(p.contratante_representante) || "Representante do contratante"}</div><div style="font-size:11px;color:#777">${escapeHtml(p.contratante_nome) || "Contratante"}</div></div>
          </div>
        </div>
      </div>
    </div>
  `;
}
// ============================================================
// Modais (adicionar obra / equipamento / condições)
// ============================================================
function openModal(html) {
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop no-print";
  wrap.id = "modal-root";
  wrap.innerHTML = `<div class="modal-sheet" onclick="event.stopPropagation()">${html}</div>`;
  wrap.addEventListener("click", closeModal);
  document.body.appendChild(wrap);
}
function closeModal() {
  const m = document.getElementById("modal-root");
  if (m) m.remove();
}

function showAddProjectModal() {
  openModal(`
    <div class="tick-rule"><span class="txt">Nova obra</span><span class="line"></span></div>
    <input id="np-name" placeholder="Nome da obra" />
    <input id="np-client" placeholder="Cliente / contrato" />
    <input id="np-location" placeholder="Local" />
    <div style="height:1px;background:#2E3A42;margin:8px 0"></div>
    <div style="font-size:10px;text-transform:uppercase;color:#8A98A3;margin-bottom:6px">Dados p/ cabeçalho do laudo</div>
    <input id="np-company" placeholder="Empresa executora" />
    <input id="np-cnpj" placeholder="CNPJ" style="font-family:var(--font-data)" />
    <input id="np-tech" placeholder="Responsável técnico (nome/CREA)" />
    <input id="np-executor" placeholder="Executor de campo" />
    <input id="np-contratante" placeholder="Razão social do contratante" />
    <input id="np-contratante-cnpj" placeholder="CNPJ do contratante" style="font-family:var(--font-data)" />
    <input id="np-contratante-rep" placeholder="Representante do contratante" />
    <input id="np-art" placeholder="Número da ART" style="font-family:var(--font-data)" />
    <button class="btn-primary" style="background:#35C5A6;color:#10151A;margin-top:4px" data-action="submit-project">Criar obra</button>
  `);
}

async function submitAddProject() {
  const val = (id) => document.getElementById(id).value.trim();
  const name = val("np-name");
  if (!name) return;
  const project = await createProject({
    name,
    client: val("np-client") || "—",
    location: val("np-location") || "—",
    company: val("np-company"),
    cnpj: val("np-cnpj"),
    tech: val("np-tech"),
    executor_nome: val("np-executor"),
    contratante_nome: val("np-contratante"),
    contratante_cnpj: val("np-contratante-cnpj"),
    contratante_representante: val("np-contratante-rep"),
    art_numero: val("np-art"),
  });
  closeModal();
  if (!project) return;
  await reloadProjects();
  state.currentProjectId = project.id;
  state.screen = "project";
  render();
}

function showAddEquipModal() {
  openModal(`
    <div class="tick-rule"><span class="txt">Novo equipamento</span><span class="line"></span></div>
    <input id="ne-tag" placeholder="Tag (ex: UE-16)" style="font-family:var(--font-data)" />
    <select id="ne-type">
      <option value="split">Split</option>
      <option value="cassete">Cassete</option>
      <option value="exaustao">Rede de exaustão</option>
      <option value="ventilacao">Rede de ventilação mecânica</option>
    </select>
    <input id="ne-capacity" placeholder="Capacidade (ex: 9.000 Btu/h)" />
    <input id="ne-room" placeholder="Ambiente" />
    <button class="btn-primary" style="background:#35C5A6;color:#10151A;margin-top:4px" data-action="submit-equip">Adicionar à obra</button>
  `);
}

async function submitAddEquip() {
  const tag = document.getElementById("ne-tag").value.trim();
  if (!tag) return;
  const type = document.getElementById("ne-type").value;
  const capacity = document.getElementById("ne-capacity").value.trim() || "—";
  const room = document.getElementById("ne-room").value.trim() || "—";
  closeModal();
  await createEquipment(state.currentProjectId, tag, type, capacity, room);
  await reloadProjects();
  state.screen = "project";
  render();
}

function showCondModal() {
  const p = currentProject();
  openModal(`
    <div class="tick-rule"><span class="txt">Condições ambientais do dia</span><span class="line"></span></div>
    <div style="font-size:11px;color:#8A98A3;margin-bottom:10px">Usadas como referência para leituras sensíveis à temperatura externa.</div>
    <input id="nc-temp" placeholder="Temperatura externa (°C)" style="font-family:var(--font-data)" value="${escapeAttr(p.cond_temp || "")}" />
    <input id="nc-umid" placeholder="Umidade relativa (%)" style="font-family:var(--font-data)" value="${escapeAttr(p.cond_umid || "")}" />
    <button class="btn-primary" style="background:#35C5A6;color:#10151A;margin-top:4px" data-action="submit-cond">Salvar</button>
  `);
}

async function submitCond() {
  const temp = document.getElementById("nc-temp").value.trim();
  const umid = document.getElementById("nc-umid").value.trim();
  closeModal();
  await updateProjectRemote(state.currentProjectId, { cond_temp: temp, cond_umid: umid });
  await reloadProjects();
  state.screen = "project";
  render();
}

// ============================================================
// Captura de foto / ART
// ============================================================
function requestCapture(testId) {
  state.capturingTestId = testId;
  cameraInput.click();
}

cameraInput.addEventListener("change", async (ev) => {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = "";
  if (!file || !state.capturingTestId) return;
  const testId = state.capturingTestId;
  try {
    const url = await uploadToBucket(BUCKET_FOTOS, file, `tests/${testId}`);
    const test = findTestById(testId);
    const patch = { photo_url: url };
    if (test && !test.measured_at) patch.measured_at = new Date().toISOString();
    await updateTestRemote(testId, patch);
    await reloadProjects();
    state.screen = "equipment";
    render();
  } catch (err) {
    alert("Erro ao enviar foto: " + err.message);
  }
});

artInput.addEventListener("change", async (ev) => {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = "";
  if (!file || !state.currentProjectId) return;
  try {
    const url = await uploadToBucket(BUCKET_ANEXOS, file, `art/${state.currentProjectId}`);
    await updateProjectRemote(state.currentProjectId, {
      art_file_url: url, art_file_name: file.name, art_file_type: file.type,
    });
    await reloadProjects();
    state.screen = "project";
    render();
  } catch (err) {
    alert("Erro ao enviar ART: " + err.message);
  }
});

function findTestById(testId) {
  for (const p of state.projects) for (const e of p.equipment || []) for (const t of e.hvac_tests || []) if (t.id === testId) return t;
  return null;
}

// ============================================================
// Delegação de eventos
// ============================================================
let saveTimers = {};

document.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === "open-project") { state.currentProjectId = btn.dataset.id; state.screen = "project"; render(); }
  else if (action === "go-home") { state.screen = "home"; state.currentProjectId = null; render(); }
  else if (action === "show-add-project") showAddProjectModal();
  else if (action === "submit-project") submitAddProject();
  else if (action === "seed-rdsl") seedRdslProject();
  else if (action === "show-add-equip") showAddEquipModal();
  else if (action === "submit-equip") submitAddEquip();
  else if (action === "show-art") artInput.click();
  else if (action === "show-cond") showCondModal();
  else if (action === "submit-cond") submitCond();
  else if (action === "open-equipment") { state.currentEquipmentId = btn.dataset.id; state.screen = "equipment"; render(); }
  else if (action === "close-equipment") { state.screen = "project"; render(); }
  else if (action === "capture") requestCapture(btn.dataset.testId);
  else if (action === "view-photo") showLightbox(btn.dataset.url);
  else if (action === "toggle-done") {
    const testId = btn.dataset.testId;
    const t = findTestById(testId);
    if (!t) return;
    const done = !t.done;
    await updateTestRemote(testId, { done });
    await reloadProjects();
    state.screen = "equipment";
    render();
  }
  else if (action === "open-report") { state.screen = "report"; render(); }
  else if (action === "close-report") { state.screen = "project"; render(); }
  else if (action === "print-report") window.print();
});

document.addEventListener("input", (ev) => {
  const input = ev.target.closest("[data-role='value-input']");
  if (!input) return;
  const testId = input.dataset.testId;
  const value = input.value;

  // Atualiza status/pill localmente sem re-render completo (mantém o foco no input)
  const t = findTestById(testId);
  if (t) t.value = value;
  const row = input.closest(".test-row");
  const status = getTestStatus(t || { value });
  const sMeta = STATUS_META[status];
  const pill = row.querySelector("[data-role='status-pill']");
  if (pill) {
    pill.style.color = sMeta.color;
    pill.style.borderColor = sMeta.color;
    pill.querySelector(".status-dot").style.background = sMeta.color;
    pill.lastChild.textContent = sMeta.label;
  }
  row.classList.toggle("fora", status === "fora");

  clearTimeout(saveTimers[testId]);
  saveTimers[testId] = setTimeout(async () => {
    const patch = { value };
    if (t && !t.measured_at) patch.measured_at = new Date().toISOString();
    await updateTestRemote(testId, patch);
    if (t) t.measured_at = t.measured_at || patch.measured_at;
  }, 600);
});

function showLightbox(url) {
  const wrap = document.createElement("div");
  wrap.className = "lightbox no-print";
  wrap.innerHTML = `<img src="${url}" />`;
  wrap.addEventListener("click", () => wrap.remove());
  document.body.appendChild(wrap);
}

// ============================================================
// Utilidades
// ============================================================
function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }

// ============================================================
// Boot
// ============================================================
(async function init() {
  root.innerHTML = `<div style="padding:40px 20px;color:#8A98A3;font-size:13px">Carregando…</div>`;
  state.projects = await fetchProjects();
  render();
})();