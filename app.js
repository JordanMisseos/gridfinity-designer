const canvas = document.getElementById("canvas");
const info = document.getElementById("info");
const binList = document.getElementById("binList");

const drawerW = document.getElementById("drawerW");
const drawerH = document.getElementById("drawerH");
const gridSizeInput = document.getElementById("gridSize");

const binWInput = document.getElementById("binW");
const binHInput = document.getElementById("binH");
const binZInput = document.getElementById("binZ");
const binLabelInput = document.getElementById("binLabel");

const wallHInput = document.getElementById("wallH");
const baseTInput = document.getElementById("baseT");

const applyDrawerBtn = document.getElementById("applyDrawer");
const addBinBtn = document.getElementById("addBin");
const toggleClientBtn = document.getElementById("toggleClient");
const exportJsonBtn = document.getElementById("exportJson");
const exportPng3dBtn = document.getElementById("exportPng3d");
const clearAllBtn = document.getElementById("clearAll");

let state = {
  gridMM: 42,
  drawerMM: { w: 500, h: 350 },
  wallHMM: 35,
  baseTMM: 6,

  cellPx: 28,          // visual scale
  cols: 0,
  rows: 0,

  bins: [],            // {id, x,y,w,h,zmm,label,colorAlt}
  selectedId: null,
  clientView: false
};

function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function computeGrid(){
  state.gridMM = Number(gridSizeInput.value);
  state.drawerMM.w = Number(drawerW.value);
  state.drawerMM.h = Number(drawerH.value);
  state.wallHMM = Number(wallHInput.value);
  state.baseTMM = Number(baseTInput.value);

  state.cols = Math.max(1, Math.floor(state.drawerMM.w / state.gridMM));
  state.rows = Math.max(1, Math.floor(state.drawerMM.h / state.gridMM));

  canvas.style.backgroundSize = `${state.cellPx}px ${state.cellPx}px`;
  canvas.style.width = `${state.cols * state.cellPx}px`;
  canvas.style.height = `${state.rows * state.cellPx}px`;

  info.textContent =
    `Drawer: ${state.drawerMM.w}×${state.drawerMM.h} mm • Grid: ${state.gridMM} mm • Cells: ${state.cols}×${state.rows}`;
}

function rectsOverlap(a, b){
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function withinBounds(bin){
  return bin.x >= 0 && bin.y >= 0 && (bin.x + bin.w) <= state.cols && (bin.y + bin.h) <= state.rows;
}

function collides(bin){
  return state.bins.some(b => b.id !== bin.id && rectsOverlap(bin, b));
}

function snapToGrid(px){
  return Math.round(px / state.cellPx);
}

function escapeHtml(str){
  return str.replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function render(){
  canvas.innerHTML = "";
  binList.innerHTML = "";

  canvas.classList.toggle("client", state.clientView);

  for(const b of state.bins){
    const el = document.createElement("div");
    el.className = "bin" + (b.id === state.selectedId ? " selected" : "");
    el.dataset.id = b.id;

    el.style.left = `${b.x * state.cellPx}px`;
    el.style.top  = `${b.y * state.cellPx}px`;
    el.style.width = `${b.w * state.cellPx}px`;
    el.style.height= `${b.h * state.cellPx}px`;

    if (b.colorAlt){
      el.style.background = "color-mix(in srgb, var(--bin2) 65%, black)";
    }

    el.innerHTML = `
      <div class="meta">
        <div class="title">${escapeHtml(b.label)}</div>
        <div class="sub">${b.w}×${b.h} cells • ${b.zmm}mm</div>
      </div>
      <div class="tag">#${b.id.slice(0,4)}</div>
    `;

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("click", () => {
      state.selectedId = b.id;
      render();
    });

    canvas.appendChild(el);

    const row = document.createElement("div");
    row.className = "binRow";
    row.innerHTML = `
      <div class="rowTop">
        <strong>${escapeHtml(b.label)}</strong>
        <span>${b.w}×${b.h}</span>
      </div>
      <small>Pos: (${b.x}, ${b.y}) • Height: ${b.zmm}mm</small>
      <button data-remove="${b.id}">Remove</button>
    `;
    row.querySelector("button").addEventListener("click", () => removeBin(b.id));
    binList.appendChild(row);
  }

  // notify 3D view to sync
  if (window.__gf3dUpdate) window.__gf3dUpdate();
}

function addBin(){
  const w = Math.max(1, Number(binWInput.value));
  const h = Math.max(1, Number(binHInput.value));
  const zmm = Math.max(5, Number(binZInput.value));
  const label = (binLabelInput.value || "Bin").trim();

  const b = {
    id: uid(),
    x: 0, y: 0,
    w, h,
    zmm,
    label,
    colorAlt: state.bins.length % 2 === 1
  };

  // find first free spot
  let placed = false;
  for(let y = 0; y <= state.rows - h; y++){
    for(let x = 0; x <= state.cols - w; x++){
      b.x = x; b.y = y;
      if (withinBounds(b) && !collides(b)){
        placed = true;
        break;
      }
    }
    if (placed) break;
  }

  if (!placed){
    alert("No space for that bin size in this drawer.");
    return;
  }

  state.bins.push(b);
  state.selectedId = b.id;
  render();
}

function removeBin(id){
  state.bins = state.bins.filter(b => b.id !== id);
  if (state.selectedId === id) state.selectedId = null;
  render();
}

function clearAll(){
  state.bins = [];
  state.selectedId = null;
  render();
}

function exportJSON(){
  const payload = {
    gridMM: state.gridMM,
    drawerMM: state.drawerMM,
    wallHMM: state.wallHMM,
    baseTMM: state.baseTMM,
    cols: state.cols,
    rows: state.rows,
    bins: state.bins.map(b => ({
      id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, zmm: b.zmm, label: b.label
    }))
  };
  const txt = JSON.stringify(payload, null, 2);
  downloadText("gridfinity-layout.json", txt);
}

function downloadText(filename, text){
  const blob = new Blob([text], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- 2D Drag logic ----------
let drag = null;

function onPointerDown(e){
  e.preventDefault();
  e.stopPropagation();

  const id = e.currentTarget.dataset.id;
  const b = state.bins.find(x => x.id === id);
  if (!b) return;

  state.selectedId = id;

  const start = { x:e.clientX, y:e.clientY };
  const orig = { x:b.x, y:b.y };

  drag = { id, start, orig };
  e.currentTarget.setPointerCapture(e.pointerId);

  e.currentTarget.addEventListener("pointermove", onPointerMove);
  e.currentTarget.addEventListener("pointerup", onPointerUp, { once:true });

  render();
}


function onPointerMove(e){
  if (!drag) return;
  e.preventDefault();
  e.stopPropagation();
  const b = state.bins.find(x => x.id === drag.id);
  if (!b) return;

  const dx = e.clientX - drag.start.x;
  const dy = e.clientY - drag.start.y;

  let nx = drag.orig.x + snapToGrid(dx);
  let ny = drag.orig.y + snapToGrid(dy)

  const test = {...b, x:nx, y:ny};

  // clamp to bounds
  test.x = Math.min(Math.max(0, test.x), state.cols - test.w);
  test.y = Math.min(Math.max(0, test.y), state.rows - test.h);

  // apply only if not colliding
  if (!collides(test)){
    b.x = test.x;
    b.y = test.y;
    render();
  }
}

function onPointerUp(e){
  const el = e.currentTarget;
  el.removeEventListener("pointermove", onPointerMove);
  drag = null;
}

function toggleClient(){
  state.clientView = !state.clientView;
  toggleClientBtn.textContent = state.clientView ? "Edit view" : "Client view";
  render();
}

function applyDrawer(){
  computeGrid();

  // remove bins that no longer fit
  state.bins = state.bins.filter(b => withinBounds(b));

  // ensure no overlaps; keep earlier bins
  const kept = [];
  for(const b of state.bins){
    if (!kept.some(k => rectsOverlap(b, k))) kept.push(b);
  }
  state.bins = kept;

  render();
}

// Delete key removes selected
window.addEventListener("keydown", (e)=>{
  if (e.key === "Delete" && state.selectedId){
    removeBin(state.selectedId);
  }
});

applyDrawerBtn.addEventListener("click", applyDrawer);
addBinBtn.addEventListener("click", addBin);
toggleClientBtn.addEventListener("click", toggleClient);
exportJsonBtn.addEventListener("click", exportJSON);
clearAllBtn.addEventListener("click", clearAll);

// 3D PNG export delegated to viewer
exportPng3dBtn.addEventListener("click", ()=>{
  if (window.__gf3dExportPng) window.__gf3dExportPng();
});

// Expose state/render for 3D
window.__gf = { state, render };

// init
computeGrid();
render();
