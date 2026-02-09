(() => {
  const mount = document.getElementById("viewer3d");
  if (!mount) return;

  const { state, render } = window.__gf;

  // --- helpers ---
  const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

  // --- Three basics ---
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 8000);
  camera.position.set(0, 260, 320);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  mount.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = true;
  controls.screenSpacePanning = false;
  controls.target.set(0, 0, 0);

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(250, 400, 200);
  scene.add(dir);

  // Drag plane (invisible)
  const dragPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  dragPlane.rotation.x = -Math.PI / 2;
  scene.add(dragPlane);

  // Materials
  const binMatA = new THREE.MeshStandardMaterial({ color: 0x2a72ff, roughness: 0.55, metalness: 0.05 });
  const binMatB = new THREE.MeshStandardMaterial({ color: 0x20c997, roughness: 0.55, metalness: 0.05 });
  const binMatClient = new THREE.MeshStandardMaterial({ color: 0x3a475a, roughness: 0.8, metalness: 0.0 });

  const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 });

  const baseMat = new THREE.MeshStandardMaterial({ color: 0x0f1522, roughness: 0.9, metalness: 0.0 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x121826, roughness: 0.95, metalness: 0.0 });

  // Grid + drawer geometry
  let gridHelper = null;
  let drawerGroup = new THREE.Group();
  scene.add(drawerGroup);

  // Bins
  const binMeshes = new Map();   // id -> { mesh, labelSprite }
  const boxGeom = new THREE.BoxGeometry(1, 1, 1);

  function mmToWorld(mm){
    // 1 grid cell == state.cellPx world units, and state.gridMM mm
    return (mm * state.cellPx) / state.gridMM;
  }

  function cellToWorldCenter(cellX, cellY){
    // X right, Z down, centered at origin
    const x = (cellX - state.cols / 2) * state.cellPx;
    const z = (cellY - state.rows / 2) * state.cellPx;
    return { x, z };
  }

  function worldToCell(xWorld, zWorld){
    const xCell = (xWorld / state.cellPx) + state.cols / 2;
    const yCell = (zWorld / state.cellPx) + state.rows / 2;
    return { xCell, yCell };
  }

  function ensureGrid(){
    if (gridHelper) scene.remove(gridHelper);

    const size = Math.max(state.cols, state.rows) * state.cellPx;
    const divisions = Math.max(state.cols, state.rows);

    gridHelper = new THREE.GridHelper(size, divisions, 0x22314a, 0x22314a);
    gridHelper.position.y = 0.01; // avoid z-fight with base
    scene.add(gridHelper);
  }

  function rebuildDrawer(){
    // clear old
    scene.remove(drawerGroup);
    drawerGroup = new THREE.Group();
    scene.add(drawerGroup);

    const w = state.cols * state.cellPx;
    const d = state.rows * state.cellPx;

    const baseT = mmToWorld(Math.max(0, state.baseTMM));
    const wallH = mmToWorld(Math.max(0, state.wallHMM));
    const wallT = mmToWorld(4); // 4mm thick walls

    // Baseplate
    if (baseT > 0){
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, baseT, d), baseMat);
      base.position.set(0, baseT / 2, 0);
      drawerGroup.add(base);
    }

    // Walls (only if wall height > 0)
    if (wallH > 0){
      const y = (baseT + wallH) / 2;

      // Left wall
      const wl = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, d + wallT * 2), wallMat);
      wl.position.set(-w/2 - wallT/2, y, 0);
      drawerGroup.add(wl);

      // Right wall
      const wr = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, d + wallT * 2), wallMat);
      wr.position.set(w/2 + wallT/2, y, 0);
      drawerGroup.add(wr);

      // Front wall
      const wf = new THREE.Mesh(new THREE.BoxGeometry(w + wallT * 2, wallH, wallT), wallMat);
      wf.position.set(0, y, -d/2 - wallT/2);
      drawerGroup.add(wf);

      // Back wall
      const wb = new THREE.Mesh(new THREE.BoxGeometry(w + wallT * 2, wallH, wallT), wallMat);
      wb.position.set(0, y, d/2 + wallT/2);
      drawerGroup.add(wb);
    }
  }

  function makeLabelSprite(text){
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const pad = 18;
    const fontSize = 34;
    ctx.font = `700 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;

    // measure
    const metrics = ctx.measureText(text);
    const w = Math.ceil(metrics.width + pad * 2);
    const h = Math.ceil(fontSize + pad * 1.6);

    canvas.width = w;
    canvas.height = h;

    // redraw (must set font again after resizing)
    ctx.font = `700 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;

    // background pill
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(ctx, 0, 0, w, h, 16);
    ctx.fill();

    // text
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.textBaseline = "middle";
    ctx.fillText(text, pad, h / 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;

    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const spr = new THREE.Sprite(mat);

    // sprite scale in world units
    const scale = 0.25; // tune visual size
    spr.scale.set(w * scale, h * scale, 1);
    spr.renderOrder = 10;
    return spr;
  }

  function roundRect(ctx, x, y, w, h, r){
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.arcTo(x+w, y, x+w, y+h, rr);
    ctx.arcTo(x+w, y+h, x, y+h, rr);
    ctx.arcTo(x, y+h, x, y, rr);
    ctx.arcTo(x, y, x+w, y, rr);
    ctx.closePath();
  }

  function ensureMeshForBin(b){
    let rec = binMeshes.get(b.id);
    if (rec) return rec;

    const mat = state.clientView ? binMatClient : (b.colorAlt ? binMatB : binMatA);
    const mesh = new THREE.Mesh(boxGeom, mat);

    const edges = new THREE.EdgesGeometry(boxGeom);
    const lines = new THREE.LineSegments(edges, edgeMat);
    mesh.add(lines);

    mesh.userData.binId = b.id;

    // label sprite
    const labelSprite = makeLabelSprite(b.label);
    scene.add(labelSprite);

    scene.add(mesh);
    rec = { mesh, labelSprite };
    binMeshes.set(b.id, rec);
    return rec;
  }

  function removeMissingMeshes(){
    const ids = new Set(state.bins.map(b => b.id));
    for (const [id, rec] of binMeshes.entries()){
      if (!ids.has(id)){
        scene.remove(rec.mesh);
        scene.remove(rec.labelSprite);
        binMeshes.delete(id);
      }
    }
  }

  function canPlace(test){
    const overlap = (a, b) =>
      !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);

    if (test.x < 0 || test.y < 0) return false;
    if (test.x + test.w > state.cols) return false;
    if (test.y + test.h > state.rows) return false;

    for (const b of state.bins){
      if (b.id !== test.id && overlap(test, b)) return false;
    }
    return true;
  }

  function syncMeshes(){
    ensureGrid();
    rebuildDrawer();
    removeMissingMeshes();

    const baseT = mmToWorld(Math.max(0, state.baseTMM));

    for (const b of state.bins){
      const rec = ensureMeshForBin(b);

      // update material for client view toggle
      rec.mesh.material = state.clientView
        ? binMatClient
        : (b.colorAlt ? binMatB : binMatA);

      const height = mmToWorld(Math.max(5, b.zmm));
      const wPx = b.w * state.cellPx;
      const dPx = b.h * state.cellPx;

      // scale bin block
      rec.mesh.scale.set(wPx, height, dPx);

      // position bin center
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const p = cellToWorldCenter(cx, cy);

      rec.mesh.position.set(p.x, baseT + height / 2, p.z);

      // label above bin
      rec.labelSprite.position.set(p.x, baseT + height + mmToWorld(6), p.z);

      // face camera
      rec.labelSprite.material.opacity = state.clientView ? 1.0 : 0.95;
    }
  }

  // expose update hook (called by app.js render())
  window.__gf3dUpdate = syncMeshes;

  // --- 3D dragging ---
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  let draggingId = null;
  let dragOffset = { x: 0, z: 0 };
  let isLeftDrag = false;

  function setPointerFromEvent(e){
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  }

  // left drag moves bins; right drag orbits (OrbitControls)
  function onPointerDown(e){
    isLeftDrag = (e.button === 0);

    // only intercept left-click to move bins
    if (!isLeftDrag) return;

    setPointerFromEvent(e);
    raycaster.setFromCamera(pointer, camera);

    const meshes = Array.from(binMeshes.values()).map(r => r.mesh);
    const hits = raycaster.intersectObjects(meshes, true);
    if (!hits.length) return;

    let obj = hits[0].object;
    while (obj && !obj.userData.binId) obj = obj.parent;
    if (!obj) return;

    draggingId = obj.userData.binId;
    state.selectedId = draggingId;
    render();

    // offset so it doesn't jump
    const planeHit = raycaster.intersectObject(dragPlane, false)[0];
    if (planeHit) {
      dragOffset.x = obj.position.x - planeHit.point.x;
      dragOffset.z = obj.position.z - planeHit.point.z;
    }

    renderer.domElement.setPointerCapture(e.pointerId);
    controls.enabled = false; // prevent orbit while dragging bins
  }

  function onPointerMove(e){
    if (!draggingId) return;

    setPointerFromEvent(e);
    raycaster.setFromCamera(pointer, camera);

    const planeHit = raycaster.intersectObject(dragPlane, false)[0];
    if (!planeHit) return;

    const xWorld = planeHit.point.x + dragOffset.x;
    const zWorld = planeHit.point.z + dragOffset.z;

    const { xCell, yCell } = worldToCell(xWorld, zWorld);
    const b = state.bins.find(bb => bb.id === draggingId);
    if (!b) return;

    const nx = Math.round(xCell - b.w / 2);
    const ny = Math.round(yCell - b.h / 2);

    const test = { ...b, x: clamp(nx, 0, state.cols - b.w), y: clamp(ny, 0, state.rows - b.h) };
    if (canPlace(test)){
      b.x = test.x;
      b.y = test.y;
      render(); // triggers 3D sync
    }
  }

  function onPointerUp(e){
    draggingId = null;
    controls.enabled = true;
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerUp);

  // --- PNG Export ---
  window.__gf3dExportPng = () => {
    // force a fresh render, then export
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL("image/png");

    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "gridfinity-3d-preview.png";
    a.click();
  };

  // --- resize + animate ---
  function resize(){
    const w = mount.clientWidth;
    const h = mount.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);

  function tick(){
    controls.update();

    // make sprites face camera
    for (const rec of binMeshes.values()){
      rec.labelSprite.quaternion.copy(camera.quaternion);
    }

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  resize();
  syncMeshes();
  tick();
})();
