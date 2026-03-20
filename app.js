const STORAGE_KEY = "genshin-manager-data";
const ASSET_BASE = "./assets";
const FALLBACK_IMG = `${ASSET_BASE}/placeholder.png`;
const ELEMENT_ICONS = {
  "火": `${ASSET_BASE}/elements/火.png`,
  "水": `${ASSET_BASE}/elements/水.png`,
  "雷": `${ASSET_BASE}/elements/雷.png`,
  "冰": `${ASSET_BASE}/elements/冰.png`,
  "风": `${ASSET_BASE}/elements/风.png`,
  "岩": `${ASSET_BASE}/elements/岩.png`,
  "草": `${ASSET_BASE}/elements/草.png`,
  "未知": `${ASSET_BASE}/elements/未知.png`
};
const WEAPON_TYPE_ICONS = {
  "单手剑": `${ASSET_BASE}/weapontypes/单手剑.png`,
  "双手剑": `${ASSET_BASE}/weapontypes/双手剑.png`,
  "法器": `${ASSET_BASE}/weapontypes/法器.png`,
  "长柄武器": `${ASSET_BASE}/weapontypes/长柄武器.png`,
  "弓": `${ASSET_BASE}/weapontypes/弓.png`,
  "未知": `${ASSET_BASE}/weapontypes/未知.png`
};

const defaultData = {
  meta: {
    uid: "",
    updatedAt: null
  },
  characters: [],
  weapons: [],
  artifacts: [],
  wishes: []
};

const demoData = {
  meta: {
    uid: "123456789",
    updatedAt: new Date().toISOString()
  },
  characters: [
    {
      id: "char-1",
      name: "胡桃",
      element: "火",
      level: 90,
      constellation: 1,
      friendship: 10,
      notes: "蒸发队核心"
    },
    {
      id: "char-2",
      name: "枫原万叶",
      element: "风",
      level: 90,
      constellation: 2,
      friendship: 10,
      notes: "扩散拐"
    }
  ],
  weapons: [
    {
      id: "wp-1",
      name: "护摩之杖",
      type: "长柄武器",
      level: 90,
      refinement: 1,
      owner: "胡桃"
    },
    {
      id: "wp-2",
      name: "苍古自由之誓",
      type: "单手剑",
      level: 90,
      refinement: 1,
      owner: "枫原万叶"
    }
  ],
  artifacts: [
    {
      id: "art-1",
      name: "绯红之花",
      set: "炽烈的炎之魔女",
      slot: "花",
      mainStat: "生命值",
      level: 20,
      owner: "胡桃"
    },
    {
      id: "art-2",
      name: "翠绿之影",
      set: "翠绿之影",
      slot: "杯",
      mainStat: "风元素伤害",
      level: 20,
      owner: "枫原万叶"
    }
  ],
  wishes: [
    {
      id: "wish-1",
      time: "2024-01-12 18:20",
      banner: "角色池",
      type: "角色",
      item: "胡桃",
      rarity: 5
    },
    {
      id: "wish-2",
      time: "2024-02-03 11:10",
      banner: "武器池",
      type: "武器",
      item: "护摩之杖",
      rarity: 5
    },
    {
      id: "wish-3",
      time: "2024-02-12 10:00",
      banner: "常驻池",
      type: "角色",
      item: "香菱",
      rarity: 4
    },
    {
      id: "wish-4",
      time: "2024-02-20 20:12",
      banner: "常驻池",
      type: "武器",
      item: "西风长枪",
      rarity: 4
    }
  ]
};

let state = loadData();
let charts = {};
let currentDetail = null;

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(defaultData);
  try {
    const parsed = JSON.parse(raw);
    return normalizeData(parsed);
  } catch (err) {
    console.warn("Failed to parse local data", err);
    return structuredClone(defaultData);
  }
}

function saveData() {
  state.meta.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state, null, 2));
  updateMeta();
  renderAll();
}

function normalizeData(data) {
  const result = structuredClone(defaultData);
  result.meta.uid = data?.meta?.uid || data?.uid || "";
  result.meta.updatedAt = data?.meta?.updatedAt || data?.updatedAt || null;
  result.characters = ensureIds(
    Array.isArray(data?.characters) ? data.characters : [],
    "char"
  );
  result.weapons = ensureIds(
    Array.isArray(data?.weapons) ? data.weapons : [],
    "wp"
  );
  result.artifacts = ensureIds(
    Array.isArray(data?.artifacts) ? data.artifacts : [],
    "art"
  );
  result.wishes = ensureIds(
    Array.isArray(data?.wishes) ? data.wishes : [],
    "wish"
  );
  return result;
}

function mergeData(data) {
  const normalized = normalizeData(data);
  state.meta.uid = normalized.meta.uid || state.meta.uid;
  state.characters = normalized.characters.length ? normalized.characters : state.characters;
  state.weapons = normalized.weapons.length ? normalized.weapons : state.weapons;
  state.artifacts = normalized.artifacts.length ? normalized.artifacts : state.artifacts;
  if (normalized.wishes.length) {
    state.wishes = normalized.wishes;
    syncFromWishes(normalized.wishes);
  }
  saveData();
}

function updateMeta() {
  const meta = document.getElementById("metaUpdated");
  if (!meta) return;
  meta.textContent = `最后更新：${state.meta.updatedAt ? formatTime(state.meta.updatedAt) : "-"}`;
  document.getElementById("uidInput").value = state.meta.uid || "";
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function renderStats() {
  const statsGrid = document.getElementById("statsGrid");
  const stats = [
    { label: "角色数量", value: state.characters.length },
    { label: "武器数量", value: state.weapons.length },
    { label: "圣遗物数量", value: state.artifacts.length },
    { label: "抽卡记录", value: state.wishes.length }
  ];

  statsGrid.innerHTML = stats
    .map(
      (item) => `
      <div class="stat-card">
        <div class="label">${item.label}</div>
        <div class="value">${item.value}</div>
      </div>
    `
    )
    .join("");
}

function renderCharacters() {
  const grid = document.getElementById("charGrid");
  const query = document.getElementById("charSearch").value.trim();
  const elementFilter = document.getElementById("charElementFilter").value;
  const rarityFilter = document.getElementById("charRarityFilter").value;
  const { characterCounts } = getWishCounts();
  const rarityLookup = getWishRarityLookup("角色");
  const list = state.characters.filter((c) => {
    const matchQuery = c.name?.includes(query);
    const matchElement =
      elementFilter === "all" ? true : (c.element || "未知") === elementFilter;
    const rarityValue = rarityLookup[c.name] || c.rarity || 0;
    const matchRarity =
      rarityFilter === "all"
        ? true
        : Number(rarityValue || 0) === Number(rarityFilter);
    return matchQuery && matchElement && matchRarity;
  });
  grid.innerHTML = list
    .map(
      (c) => {
        const count = characterCounts[c.name] || 0;
        const derivedConstellation = Math.min(Math.max(count - 1, 0), 6);
        const displayConstellation =
          count > 0 ? derivedConstellation : c.constellation ?? 0;
        const rarityValue = rarityLookup[c.name] || c.rarity || null;
        const rarityClass = rarityValue === 5 ? "rarity-5" : rarityValue === 4 ? "rarity-4" : "";
        const charImg = getCharacterImage(c.name);
        const elementIcon = getElementIcon(c.element);
        return `
      <div class="item-card ${rarityClass}">
        <div class="media-row">
          <img class="avatar" src="${charImg}" alt="${c.name || "角色"}" onerror="this.src='${FALLBACK_IMG}'" />
          <div class="media-meta">
        <div class="title">${c.name || "未命名"}</div>
        <div class="tags">
          <span class="tag">
            <img class="icon" src="${elementIcon}" alt="${c.element || "未知"}" onerror="this.style.display='none'" />
            ${c.element || "未知元素"}
          </span>
          <span class="tag">Lv.${c.level ?? "-"}</span>
          <span class="tag">命座 ${displayConstellation}</span>
          <span class="tag">好感 ${c.friendship ?? 0}</span>
          ${rarityValue ? `<span class="tag">${rarityValue}★</span>` : ""}
        </div>
          </div>
        </div>
        <div class="muted">${c.notes || ""}</div>
        <button class="btn ghost small detail-btn" data-type="character" data-id="${c.id}">详情</button>
        <button class="delete-btn" data-type="character" data-id="${c.id}">删除</button>
      </div>
    `;
      }
    )
    .join("");
}

function renderWeapons() {
  const grid = document.getElementById("weaponGrid");
  const query = document.getElementById("weaponSearch").value.trim();
  const typeFilter = document.getElementById("weaponTypeFilter").value;
  const rarityFilter = document.getElementById("weaponRarityFilter").value;
  const rarityLookup = getWishRarityLookup("武器");
  const list = state.weapons.filter((w) => {
    const matchQuery = w.name?.includes(query);
    const matchType =
      typeFilter === "all" ? true : (w.type || "未知") === typeFilter;
    const rarityValue = rarityLookup[w.name] || w.rarity || 0;
    const matchRarity =
      rarityFilter === "all"
        ? true
        : Number(rarityValue || 0) === Number(rarityFilter);
    return matchQuery && matchType && matchRarity;
  });
  grid.innerHTML = list
    .map(
      (w) => {
        const rarityValue = rarityLookup[w.name] || w.rarity || null;
        const rarityClass = rarityValue === 5 ? "rarity-5" : rarityValue === 4 ? "rarity-4" : "";
        const weaponImg = getWeaponImage(w.name);
        const typeIcon = getWeaponTypeIcon(w.type);
        return `
      <div class="item-card ${rarityClass}">
        <div class="media-row">
          <img class="avatar" src="${weaponImg}" alt="${w.name || "武器"}" onerror="this.src='${FALLBACK_IMG}'" />
          <div class="media-meta">
        <div class="title">${w.name || "未命名"}</div>
        <div class="tags">
          <span class="tag">
            <img class="icon" src="${typeIcon}" alt="${w.type || "未知"}" onerror="this.style.display='none'" />
            ${w.type || "未知类型"}
          </span>
          <span class="tag">Lv.${w.level ?? "-"}</span>
          <span class="tag">精炼 ${w.refinement ?? 1}</span>
          <span class="tag">装备 ${w.owner || "-"}</span>
          ${rarityValue ? `<span class="tag">${rarityValue}★</span>` : ""}
        </div>
          </div>
        </div>
        <button class="btn ghost small detail-btn" data-type="weapon" data-id="${w.id}">详情</button>
        <button class="delete-btn" data-type="weapon" data-id="${w.id}">删除</button>
      </div>
    `;
      }
    )
    .join("");
}

function renderArtifacts() {
  const grid = document.getElementById("artifactGrid");
  const query = document.getElementById("artifactSearch").value.trim();
  const list = state.artifacts.filter((a) => a.name?.includes(query));
  grid.innerHTML = list
    .map(
      (a) => `
      <div class="item-card">
        <div class="title">${a.name || "未命名"}</div>
        <div class="tags">
          <span class="tag">${a.set || "未知套装"}</span>
          <span class="tag">${a.slot || "部位"}</span>
          <span class="tag">${a.mainStat || "主词条"}</span>
          <span class="tag">+${a.level ?? 0}</span>
          <span class="tag">装备 ${a.owner || "-"}</span>
        </div>
        <button class="delete-btn" data-type="artifact" data-id="${a.id}">删除</button>
      </div>
    `
    )
    .join("");
}

function renderWishes() {
  const table = document.getElementById("wishTable");
  const query = document.getElementById("wishSearch").value.trim();
  const list = filterWishes(query);
  const rows = [];
  const pool = document.getElementById("wishPool").value;

  const header = `
    <div class="table-row header">
      <div>物品</div>
      <div>卡池</div>
      <div>星级</div>
      <div>时间</div>
    </div>
  `;

  if (pool === "all") {
    const grouped = groupByPool(list);
    Object.keys(grouped).forEach((key) => {
      rows.push(`<div class="table-row section"><div>${key}</div></div>`);
      rows.push(header);
      rows.push(
        ...grouped[key].map(
          (w) => `
          <div class="table-row">
            <div>${w.item || "-"}</div>
            <div>${w.banner || w.type || "-"}</div>
            <div>${w.rarity || "-"}★</div>
            <div>${w.time || "-"}</div>
          </div>
        `
        )
      );
    });
  } else {
    rows.push(header);
    rows.push(
      ...list.map(
        (w) => `
        <div class="table-row">
          <div>${w.item || "-"}</div>
          <div>${w.banner || w.type || "-"}</div>
          <div>${w.rarity || "-"}★</div>
          <div>${w.time || "-"}</div>
        </div>
      `
      )
    );
  }

  table.innerHTML = rows.join("");
}

function renderCharts() {
  const wishTypeCounts = countBy(state.wishes, (w) => w.banner || w.type || "未知");
  const wishRarityCounts = countBy(state.wishes, (w) => `${w.rarity || 0}★`);
  const wishTrendCounts = countByMonth(state.wishes);

  charts.type?.destroy?.();
  charts.rarity?.destroy?.();
  charts.trend?.destroy?.();

  const typeCtx = document.getElementById("chartWishType");
  const rarityCtx = document.getElementById("chartWishRarity");
  const trendCtx = document.getElementById("chartWishTrend");

  charts.type = new Chart(typeCtx, {
    type: "doughnut",
    data: {
      labels: Object.keys(wishTypeCounts),
      datasets: [
        {
          data: Object.values(wishTypeCounts),
          backgroundColor: ["#1f7a8c", "#f2a541", "#ef6f6c", "#7a918d"]
        }
      ]
    },
    options: { plugins: { legend: { position: "bottom" } } }
  });

  charts.rarity = new Chart(rarityCtx, {
    type: "bar",
    data: {
      labels: Object.keys(wishRarityCounts),
      datasets: [
        {
          label: "数量",
          data: Object.values(wishRarityCounts),
          backgroundColor: "#1f7a8c"
        }
      ]
    },
    options: { plugins: { legend: { display: false } } }
  });

  charts.trend = new Chart(trendCtx, {
    type: "line",
    data: {
      labels: Object.keys(wishTrendCounts),
      datasets: [
        {
          label: "抽卡次数",
          data: Object.values(wishTrendCounts),
          borderColor: "#f2a541",
          backgroundColor: "rgba(242,165,65,0.3)",
          fill: true,
          tension: 0.3
        }
      ]
    },
    options: { plugins: { legend: { display: false } } }
  });
}

function countBy(list, keyFn) {
  return list.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function countByMonth(list) {
  const result = {};
  list.forEach((w) => {
    if (!w.time) return;
    const date = new Date(w.time.replace(/-/g, "/"));
    if (Number.isNaN(date.getTime())) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    result[key] = (result[key] || 0) + 1;
  });
  return result;
}

function ensureIds(list, prefix) {
  return list.map((item, idx) => {
    if (item?.id) return item;
    return {
      ...item,
      id: `${prefix}-${Date.now()}-${idx}`
    };
  });
}

function renderExportPreview() {
  const preview = document.getElementById("exportPreview");
  preview.textContent = JSON.stringify(state, null, 2);
}

function renderAll() {
  renderStats();
  renderCharacters();
  renderWeapons();
  renderArtifacts();
  renderWishes();
  renderCharts();
  renderExportPreview();
}

function setupNav() {
  const buttons = document.querySelectorAll(".nav-item");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const view = btn.dataset.view;
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      document.getElementById(`view-${view}`).classList.add("active");
    });
  });
}

function setupSearch() {
  [
    "charSearch",
    "weaponSearch",
    "artifactSearch",
    "wishSearch"
  ].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderAll);
  });

  [
    "charElementFilter",
    "charRarityFilter",
    "weaponTypeFilter",
    "weaponRarityFilter"
  ].forEach((id) => {
    document.getElementById(id).addEventListener("change", renderAll);
  });
}

function setupUid() {
  document.getElementById("saveUid").addEventListener("click", () => {
    state.meta.uid = document.getElementById("uidInput").value.trim();
    saveData();
  });
}

function addQuickHandlers() {
  document.getElementById("addChar").addEventListener("click", () => {
    const item = {
      id: `char-${Date.now()}`,
      name: document.getElementById("charName").value.trim(),
      element: document.getElementById("charElement").value.trim(),
      level: Number(document.getElementById("charLevel").value) || 1,
      constellation: Number(document.getElementById("charConst").value) || 0,
      friendship: Number(document.getElementById("charFriend").value) || 0
    };
    state.characters.push(item);
    saveData();
  });

  document.getElementById("addWeapon").addEventListener("click", () => {
    const item = {
      id: `wp-${Date.now()}`,
      name: document.getElementById("weaponName").value.trim(),
      type: document.getElementById("weaponType").value.trim(),
      level: Number(document.getElementById("weaponLevel").value) || 1,
      refinement: Number(document.getElementById("weaponRefine").value) || 1,
      owner: document.getElementById("weaponOwner").value.trim(),
      rarity: null
    };
    state.weapons.push(item);
    saveData();
  });

  document.getElementById("addArtifact").addEventListener("click", () => {
    const item = {
      id: `art-${Date.now()}`,
      name: document.getElementById("artifactName").value.trim(),
      set: document.getElementById("artifactSet").value.trim(),
      slot: document.getElementById("artifactSlot").value.trim(),
      mainStat: document.getElementById("artifactMain").value.trim(),
      level: Number(document.getElementById("artifactLevel").value) || 0,
      owner: document.getElementById("artifactOwner").value.trim()
    };
    state.artifacts.push(item);
    saveData();
  });

  document.getElementById("addWish").addEventListener("click", () => {
    const item = {
      id: `wish-${Date.now()}`,
      item: document.getElementById("wishItem").value.trim(),
      banner: document.getElementById("wishType").value.trim(),
      rarity: Number(document.getElementById("wishRarity").value) || 3,
      time: document.getElementById("wishTime").value.trim()
    };
    state.wishes.unshift(item);
    addFromWish(item);
    saveData();
  });
}

function setupImportExport() {
  document.getElementById("importBtn").addEventListener("click", () => {
    const text = document.getElementById("importText").value.trim();
    if (text) {
      handleImport(text);
      return;
    }
    const fileInput = document.getElementById("importFile");
    if (fileInput.files.length) {
      const file = fileInput.files[0];
      const reader = new FileReader();
      reader.onload = (evt) => handleImport(evt.target.result);
      reader.readAsText(file);
    }
  });

  document.getElementById("exportBtn").addEventListener("click", () => {
    downloadJson(state, `genshin-data-${Date.now()}.json`);
  });

  document.getElementById("exportWishes").addEventListener("click", () => {
    downloadJson(state.wishes, `genshin-wishes-${Date.now()}.json`);
  });

  document.getElementById("clearWishes").addEventListener("click", () => {
    if (!confirm("确定要清空抽卡记录吗？")) return;
    state.wishes = [];
    saveData();
  });

  document.getElementById("resetDemo").addEventListener("click", () => {
    state = structuredClone(demoData);
    saveData();
  });
}

function handleImport(rawText) {
  try {
    const parsed = JSON.parse(rawText);
    const normalized = normalizeImport(parsed);
    mergeData(normalized);
    alert("导入成功");
  } catch (err) {
    console.error(err);
    alert("导入失败，请检查JSON格式");
  }
}

function normalizeImport(parsed) {
  if (parsed?.info && Array.isArray(parsed.list)) {
    return {
      meta: {
        uid: parsed.info.uid || "",
        updatedAt: parsed.info.export_time || null
      },
      wishes: convertWishList(parsed.list)
    };
  }

  if (Array.isArray(parsed)) {
    return { wishes: convertWishList(parsed) };
  }

  if (parsed?.list && Array.isArray(parsed.list)) {
    return { wishes: convertWishList(parsed.list) };
  }

  if (parsed?.data?.list && Array.isArray(parsed.data.list)) {
    return { wishes: convertWishList(parsed.data.list) };
  }

  return parsed;
}

function convertWishList(list) {
  return list.map((item, idx) => {
    const rarity = Number(item.rank_type || item.rarity || item.star) || 3;
    const banner = mapGachaType(
      item.uigf_gacha_type || item.gacha_type || item.banner || item.type
    );
    return {
      id: item.id || `wish-${Date.now()}-${idx}`,
      time: item.time || item.timestamp || "",
      banner,
      type: item.item_type || item.type || "",
      item: item.name || item.item || "",
      rarity
    };
  });
}

function mapGachaType(value) {
  const map = {
    100: "新手池",
    200: "常驻池",
    301: "角色池",
    302: "武器池",
    400: "集录祈愿",
    500: "集录祈愿"
  };
  if (value == null) return "未知";
  if (typeof value === "number" || /^[0-9]+$/.test(value)) {
    const key = Number(value);
    return map[key] || "未知";
  }
  return value;
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function filterWishes(query) {
  const pool = document.getElementById("wishPool").value;
  const type = document.getElementById("wishItemType").value;
  const raritySet = new Set(
    Array.from(document.querySelectorAll(".wishRarity:checked")).map((el) =>
      Number(el.value)
    )
  );

  return state.wishes.filter((w) => {
    const matchQuery =
      (w.item || "").includes(query) || (w.banner || "").includes(query);
    const matchPool = pool === "all" ? true : (w.banner || "未知") === pool;
    const matchType = type === "all" ? true : (w.type || "") === type;
    const matchRarity = raritySet.size ? raritySet.has(Number(w.rarity)) : true;
    return matchQuery && matchPool && matchType && matchRarity;
  });
}

function groupByPool(list) {
  const order = ["角色池", "武器池", "常驻池", "集录祈愿", "新手池", "未知"];
  const grouped = {};
  order.forEach((key) => (grouped[key] = []));
  list.forEach((w) => {
    const key = order.includes(w.banner) ? w.banner : "未知";
    grouped[key].push(w);
  });
  Object.keys(grouped).forEach((key) => {
    if (!grouped[key].length) {
      delete grouped[key];
    }
  });
  return grouped;
}

function syncFromWishes(wishes) {
  wishes.forEach((wish) => addFromWish(wish));
}

function addFromWish(wish) {
  if (wish.type === "角色") {
    const exists = state.characters.some((c) => c.name === wish.item);
    if (!exists) {
      state.characters.push({
        id: `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: wish.item,
        element: "",
        rarity: wish.rarity || null,
        level: 1,
        constellation: 0,
        friendship: 0,
        notes: "从抽卡记录导入"
      });
    }
  }
  if (wish.type === "武器") {
    const exists = state.weapons.some((w) => w.name === wish.item);
    if (!exists) {
      state.weapons.push({
        id: `wp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: wish.item,
        type: "",
        level: 1,
        refinement: 1,
        rarity: wish.rarity || null,
        owner: ""
      });
    }
  }
}

function setupWishFilters() {
  ["wishPool", "wishItemType"].forEach((id) => {
    document.getElementById(id).addEventListener("change", renderAll);
  });
  document.querySelectorAll(".wishRarity").forEach((el) => {
    el.addEventListener("change", renderAll);
  });
}

function setupDeletes() {
  const handlers = [
    { id: "charGrid", key: "characters", type: "character" },
    { id: "weaponGrid", key: "weapons", type: "weapon" },
    { id: "artifactGrid", key: "artifacts", type: "artifact" }
  ];
  handlers.forEach(({ id, key, type }) => {
    document.getElementById(id).addEventListener("click", (evt) => {
      const btn = evt.target.closest(".delete-btn");
      if (!btn || btn.dataset.type !== type) return;
      const idValue = btn.dataset.id;
      state[key] = state[key].filter((item) => item.id !== idValue);
      saveData();
    });
  });
}

function getWishCounts() {
  const characterCounts = {};
  const weaponCounts = {};
  state.wishes.forEach((w) => {
    if (w.type === "角色") {
      characterCounts[w.item] = (characterCounts[w.item] || 0) + 1;
    } else if (w.type === "武器") {
      weaponCounts[w.item] = (weaponCounts[w.item] || 0) + 1;
    }
  });
  return { characterCounts, weaponCounts };
}

function getWishRarityLookup(targetType) {
  const lookup = {};
  state.wishes.forEach((w) => {
    if (w.type !== targetType) return;
    const rarity = Number(w.rarity) || 0;
    if (!lookup[w.item] || rarity > lookup[w.item]) {
      lookup[w.item] = rarity;
    }
  });
  return lookup;
}

function getCharacterImage(name) {
  if (!name) return FALLBACK_IMG;
  return `${ASSET_BASE}/characters/${name}.png`;
}

function getWeaponImage(name) {
  if (!name) return FALLBACK_IMG;
  return `${ASSET_BASE}/weapons/${name}.png`;
}

function getElementIcon(element) {
  if (!element) return ELEMENT_ICONS["未知"];
  return ELEMENT_ICONS[element] || ELEMENT_ICONS["未知"];
}

function getWeaponTypeIcon(type) {
  if (!type) return WEAPON_TYPE_ICONS["未知"];
  return WEAPON_TYPE_ICONS[type] || WEAPON_TYPE_ICONS["未知"];
}

function setupDetails() {
  const modal = document.getElementById("detailModal");
  const closeBtn = document.getElementById("closeModal");
  const body = document.getElementById("detailBody");

  closeBtn.addEventListener("click", () => modal.classList.remove("show"));
  modal.addEventListener("click", (evt) => {
    if (evt.target === modal) modal.classList.remove("show");
  });

  ["charGrid", "weaponGrid"].forEach((gridId) => {
    document.getElementById(gridId).addEventListener("click", (evt) => {
      const btn = evt.target.closest(".detail-btn");
      if (!btn) return;
      const { characterCounts, weaponCounts } = getWishCounts();
      if (btn.dataset.type === "character") {
        const item = state.characters.find((c) => c.id === btn.dataset.id);
        if (!item) return;
        const count = characterCounts[item.name] || 0;
        const constellation = Math.min(Math.max(count - 1, 0), 6);
        const displayConstellation =
          count > 0 ? constellation : item.constellation ?? 0;
        const rarityLookup = getWishRarityLookup("角色");
        const rarityValue = rarityLookup[item.name] || item.rarity || "-";
        currentDetail = { type: "character", id: item.id };
        body.innerHTML = `
          <h2>${item.name || "未命名角色"}</h2>
          <div class="muted">来自抽卡记录的命之座统计</div>
          <div class="detail-grid">
            <div class="detail-item">元素：${item.element || "未知"}</div>
            <div class="detail-item">等级：${item.level ?? "-"}</div>
            <div class="detail-item">好感：${item.friendship ?? 0}</div>
            <div class="detail-item">抽到次数：${count}</div>
            <div class="detail-item">命之座：${displayConstellation}</div>
            <div class="detail-item">星级：${rarityValue || "-"}</div>
          </div>
          <div class="form-card">
            <h3>手动设置</h3>
            <div class="form-row">
              <select id="detailCharElement">
                <option value="">元素</option>
                <option value="火">火</option>
                <option value="水">水</option>
                <option value="雷">雷</option>
                <option value="冰">冰</option>
                <option value="风">风</option>
                <option value="岩">岩</option>
                <option value="草">草</option>
              </select>
              <button id="saveDetail" class="btn">保存</button>
            </div>
          </div>
        `;
        document.getElementById("detailCharElement").value = item.element || "";
      }
      if (btn.dataset.type === "weapon") {
        const item = state.weapons.find((w) => w.id === btn.dataset.id);
        if (!item) return;
        const count = weaponCounts[item.name] || 0;
        const refinement = Math.min(count, 5);
        const rarityLookup = getWishRarityLookup("武器");
        const rarityValue = rarityLookup[item.name] || item.rarity || "-";
        currentDetail = { type: "weapon", id: item.id };
        body.innerHTML = `
          <h2>${item.name || "未命名武器"}</h2>
          <div class="muted">来自抽卡记录的精炼统计</div>
          <div class="detail-grid">
            <div class="detail-item">类型：${item.type || "未知"}</div>
            <div class="detail-item">等级：${item.level ?? "-"}</div>
            <div class="detail-item">装备角色：${item.owner || "-"}</div>
            <div class="detail-item">抽到次数：${count}</div>
            <div class="detail-item">精炼：${refinement}</div>
            <div class="detail-item">星级：${rarityValue || "-"}</div>
          </div>
          <div class="form-card">
            <h3>手动设置</h3>
            <div class="form-row">
              <select id="detailWeaponType">
                <option value="">类型</option>
                <option value="单手剑">单手剑</option>
                <option value="双手剑">双手剑</option>
                <option value="法器">法器</option>
                <option value="长柄武器">长柄武器</option>
                <option value="弓">弓</option>
              </select>
              <button id="saveDetail" class="btn">保存</button>
            </div>
          </div>
        `;
        document.getElementById("detailWeaponType").value = item.type || "";
      }
      const saveBtn = document.getElementById("saveDetail");
      if (saveBtn) {
        saveBtn.addEventListener("click", () => {
          if (!currentDetail) return;
          if (currentDetail.type === "character") {
            const target = state.characters.find((c) => c.id === currentDetail.id);
            if (!target) return;
            target.element = document.getElementById("detailCharElement").value.trim();
          } else if (currentDetail.type === "weapon") {
            const target = state.weapons.find((w) => w.id === currentDetail.id);
            if (!target) return;
            target.type = document.getElementById("detailWeaponType").value.trim();
          }
          saveData();
        });
      }
      modal.classList.add("show");
    });
  });
}

function init() {
  setupNav();
  setupSearch();
  setupUid();
  addQuickHandlers();
  setupImportExport();
  setupWishFilters();
  setupDeletes();
  setupDetails();
  updateMeta();
  renderAll();
}

init();
