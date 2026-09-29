/* ==========================================================================
   Steel Riders – real-time 3D machining (three.js r128)

   SR3D.hero(canvas, hud)          CNC turning simulation driven by a real
                                   Fanuc-style ISO program (see PROGRAM)
   SR3D.gallery(canvas)            interactive viewer of finished parts
   SR3D.still(kind, mat, w, h)     studio render of a part -> data URL

   Lathe parts are built along +y (LatheGeometry), units mm.
   In the machine scene the spindle axis is world +X; machine Z = world X.
   ========================================================================== */
(function () {
  'use strict';
  if (!window.THREE) return;
  var T = window.THREE;
  var PI = Math.PI, TAU = PI * 2;

  function lin(hex) { return new T.Color(hex).convertSRGBToLinear(); }
  function v2(r, y) { return new T.Vector2(Math.max(r, 0.0005), y); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function rand(seed) { var s = seed || 1; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  /* ======================================================================
     Procedural surface maps
     ====================================================================== */
  var maps = null;
  function surfaceMaps() {
    if (maps) return maps;
    var R = rand(7);
    function tex(data, w, h) {
      var t = new T.DataTexture(data, w, h, T.RGBAFormat);
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.magFilter = T.LinearFilter;
      t.minFilter = T.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = 8;
      t.needsUpdate = true;
      return t;
    }
    // Turned surface: circumferential feed marks (ridges across v)
    var W = 16, H = 512, G = 40, x, y, i;
    var n = new Uint8Array(W * H * 4), r = new Uint8Array(W * H * 4);
    var rowNoise = [];
    for (y = 0; y < H; y++) rowNoise.push((R() - 0.5) * 0.35);
    for (y = 0; y < H; y++) {
      var ph = (y / H) * G * TAU;
      var slope = Math.sin(ph) * 0.42 + rowNoise[y] * 0.5 + Math.sin(ph * 0.5 + 1.3) * 0.06;
      for (x = 0; x < W; x++) {
        i = (y * W + x) * 4;
        var nx = (R() - 0.5) * 0.04, ny = slope, l = Math.sqrt(nx * nx + ny * ny + 1);
        n[i] = (nx / l * 0.5 + 0.5) * 255; n[i + 1] = (ny / l * 0.5 + 0.5) * 255; n[i + 2] = (1 / l * 0.5 + 0.5) * 255; n[i + 3] = 255;
        var rough = 0.72 + 0.22 * Math.abs(Math.cos(ph)) + rowNoise[y] * 0.3;
        r[i] = r[i + 1] = r[i + 2] = clamp(rough, 0, 1) * 255; r[i + 3] = 255;
      }
    }
    // Milled / faced surface: fine lines with fly-cut arcs
    var MW = 256, MH = 256;
    var mn = new Uint8Array(MW * MH * 4), mr = new Uint8Array(MW * MH * 4);
    var line = []; for (y = 0; y < MH; y++) line.push(R() - 0.5);
    for (y = 0; y < MH; y++) {
      for (x = 0; x < MW; x++) {
        i = (y * MW + x) * 4;
        var arc = Math.sin(Math.sqrt(x * x + (y + 400) * (y + 400)) / 6) * 0.12;
        var s = line[y] * 0.28 + arc + (R() - 0.5) * 0.05, L2 = Math.sqrt(1 + s * s);
        mn[i] = 128; mn[i + 1] = (s / L2 * 0.5 + 0.5) * 255; mn[i + 2] = (1 / L2 * 0.5 + 0.5) * 255; mn[i + 3] = 255;
        mr[i] = mr[i + 1] = mr[i + 2] = clamp(0.8 + line[y] * 0.25 + arc, 0, 1) * 255; mr[i + 3] = 255;
      }
    }
    maps = { turnN: tex(n, W, H), turnR: tex(r, W, H), millN: tex(mn, MW, MH), millR: tex(mr, MW, MH) };
    return maps;
  }

  /* ======================================================================
     Materials – base colours from measured metal reflectance (sRGB)
     ====================================================================== */
  var MAT = {
    brass: { color: 0xe3c378, metalness: 1, roughness: 0.2 },
    alu:   { color: 0xdfe2e5, metalness: 1, roughness: 0.26 },
    steel: { color: 0xc6c9cc, metalness: 1, roughness: 0.2 },
    pom:   { color: 0x1d1f22, metalness: 0, roughness: 0.36 }
  };
  function partMaterial(key, kind, repeatV) {
    var m = MAT[key] || MAT.alu, mp = surfaceMaps();
    var mat = new T.MeshStandardMaterial({ color: lin(m.color), metalness: m.metalness, roughness: m.roughness, envMapIntensity: 1 });
    var nMap, rMap;
    if (kind === 'mill') {
      nMap = mp.millN.clone(); rMap = mp.millR.clone();
      nMap.repeat.set(1 / 30, 1 / 30);
    } else {
      nMap = mp.turnN.clone(); rMap = mp.turnR.clone();
      nMap.repeat.set(1, repeatV || 14);
    }
    rMap.repeat.copy(nMap.repeat);
    nMap.needsUpdate = rMap.needsUpdate = true;
    mat.normalMap = nMap;
    mat.roughnessMap = rMap;
    mat.normalScale = new T.Vector2(0.55, 0.55);
    if (key === 'pom') mat.normalScale.set(0.25, 0.25);
    return mat;
  }
  function setPartColor(mat, key) {
    var m = MAT[key];
    mat.color.copy(lin(m.color)); mat.metalness = m.metalness; mat.roughness = m.roughness;
    if (mat.normalScale) mat.normalScale.setScalar(key === 'pom' ? 0.25 : 0.55);
    mat.needsUpdate = true;
  }
  function plain(hex, metal, rough) { return new T.MeshStandardMaterial({ color: lin(hex), metalness: metal, roughness: rough }); }

  /* ======================================================================
     Machine-interior environment for reflections (HDR values > 1)
     ====================================================================== */
  function environment(renderer) {
    var pm = new T.PMREMGenerator(renderer);
    var env = new T.Scene();
    var dome = new T.SphereGeometry(40, 32, 16), cols = [], pos = dome.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var y = pos.getY(i) / 40;
      var c = y > 0 ? 0.05 + y * 0.18 : 0.02 + (y + 1) * 0.03;
      cols.push(c * 0.95, c, c * 1.06);
    }
    dome.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    env.add(new T.Mesh(dome, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    function panel(w, h, x, y, z, rx, ry, col) {
      var m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: col, side: T.DoubleSide }));
      m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, 0); env.add(m);
    }
    panel(30, 3, 0, 18, -4, PI / 2, 0, new T.Color(6.0, 6.2, 6.6));       // LED bar on the machine roof
    panel(4, 14, -22, 4, 6, 0, PI / 2, new T.Color(3.2, 3.1, 3.0));        // left softbox
    panel(2.2, 16, 24, 2, -6, 0, -PI / 2, new T.Color(1.8, 1.9, 2.1));     // right strip
    panel(18, 1.2, 0, -2, -26, 0, 0, new T.Color(0.9, 0.85, 0.8));         // door window
    panel(6, 1.6, 8, 10, 24, 0, PI, new T.Color(2.2, 2.0, 1.7));           // warm kicker
    var t = pm.fromScene(env, 0.02).texture;
    pm.dispose();
    return t;
  }

  function makeRenderer(canvas, still) {
    var r = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, preserveDrawingBuffer: !!still, powerPreference: 'high-performance' });
    r.setPixelRatio(still ? 1 : Math.min(window.devicePixelRatio || 1, 1.75));
    r.outputEncoding = T.sRGBEncoding;
    r.toneMapping = T.ACESFilmicToneMapping;
    r.toneMappingExposure = still ? 1.0 : 1.35;
    r.physicallyCorrectLights = true;
    r.shadowMap.enabled = true;
    r.shadowMap.type = T.PCFSoftShadowMap;
    return r;
  }
  function studioLights(scene) {
    var key = new T.DirectionalLight(0xfff4e6, 2.2);
    key.position.set(-60, 110, 90);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    var c = key.shadow.camera; c.left = -140; c.right = 140; c.top = 140; c.bottom = -140; c.near = 10; c.far = 500;
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.6; key.shadow.radius = 4;
    scene.add(key);
    var rim = new T.DirectionalLight(0xcfe0ff, 1.1); rim.position.set(90, 30, -80); scene.add(rim);
    scene.add(new T.HemisphereLight(0xdfe6ee, 0x0b0c0d, 0.25));
    return key;
  }

  /* ======================================================================
     Geometry helpers
     ====================================================================== */
  function crisp(vs) {                         // double interior vertices -> sharp edges
    var out = [];
    for (var i = 0; i < vs.length; i++) { out.push(vs[i]); if (i > 0 && i < vs.length - 1) out.push(vs[i]); }
    return out;
  }
  // Closed section from outer [r,y] (ascending y) and optional inner [r,y]
  function revolve(outer, inner, segs) {
    var P = [], i, y0 = outer[0][1], y1 = outer[outer.length - 1][1];
    P.push(v2(inner ? inner[0][0] : 0, inner ? inner[0][1] : y0));
    P.push(v2(outer[0][0], y0));
    for (i = 0; i < outer.length; i++) P.push(v2(outer[i][0], outer[i][1]));
    P.push(v2(outer[outer.length - 1][0], y1));
    if (inner) {
      P.push(v2(inner[inner.length - 1][0], inner[inner.length - 1][1]));
      for (i = inner.length - 1; i >= 0; i--) P.push(v2(inner[i][0], inner[i][1]));
    } else P.push(v2(0, y1));
    var g = new T.LatheGeometry(P, segs || 128);
    g.computeVertexNormals();
    return g;
  }
  function threadPts(r, y0, y1, pitch, depth, per) {
    var pts = [], steps = Math.round((y1 - y0) / pitch * (per || 10));
    for (var i = 0; i <= steps; i++) {
      var y = y0 + (y1 - y0) * i / steps, f = ((y - y0) / pitch) % 1;
      var tri = 1 - Math.abs(f - 0.5) * 2;
      pts.push([r - depth * clamp(tri * 1.25 - 0.12, 0, 1), y]);
    }
    return pts;
  }
  function roundedRect(w, h, rr) {
    var s = new T.Shape();
    s.moveTo(-w / 2 + rr, -h / 2); s.lineTo(w / 2 - rr, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + rr);
    s.lineTo(w / 2, h / 2 - rr); s.quadraticCurveTo(w / 2, h / 2, w / 2 - rr, h / 2);
    s.lineTo(-w / 2 + rr, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - rr);
    s.lineTo(-w / 2, -h / 2 + rr); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + rr, -h / 2);
    return s;
  }
  function circle(x, y, r) { var p = new T.Path(); p.absarc(x, y, r, 0, TAU, true); return p; }
  function extrude(shape, depth, bevel) {
    var g = new T.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: !!bevel, bevelThickness: bevel || 0, bevelSize: bevel || 0, bevelSegments: 2, curveSegments: 64 });
    g.computeVertexNormals();
    return g;
  }
  function shadowed(obj) { obj.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return obj; }

  /* ======================================================================
     The simulated part: brass bushing – M20x1.5 thread, relief groove,
     O-ring groove, bearing seat D25, collar D30, through bore D10.
     Machine coordinates: Z0 = finished end face, part length 50.
     Model y = Z + 66 (y 0..13 = bar stock held in the chuck).
     ====================================================================== */
  var SIM = { L: 66, stock: 16, bore: 5, z0: 66 };
  function zOf(y) { return y - SIM.z0; }
  function yOf(z) { return z + SIM.z0; }
  function contour(z) {                        // G71/G70 profile N30..N40
    if (z > 0) return 0;
    if (z >= -1) return 9 + (-z);              // X18 Z0 -> X20 Z-1
    if (z >= -19) return 10;                   // D20
    if (z >= -19.5) return 12 + (-19 - z);     // X24 -> X25 Z-19.5
    if (z >= -34) return 12.5;                 // D25
    if (z >= -34.5) return 14.5 + (-34 - z);   // X29 -> X30 Z-34.5
    if (z >= -53) return 15;                   // D30
    return SIM.stock;
  }
  function threadForm(z, frac) {               // M20x1.5, thread depth 0.92
    if (z > -1 || z < -16) return 10;
    var f = ((-z) / 1.5) % 1, tri = 1 - Math.abs(f - 0.5) * 2;
    return 10 - 0.92 * frac * clamp(tri * 1.25 - 0.12, 0, 1);
  }
  function finalRadius(z) {
    var r = contour(z);
    if (z <= -16 && z >= -19) r = 8.4;         // thread relief D16.8
    if (z <= -26 && z >= -28.5) r = 10.7;      // O-ring groove D21.4
    if (z <= -1 && z > -16) r = threadForm(z, 1);
    return r;
  }

  /* ISO program (Fanuc 0i-TF syntax) – each line tagged with its operation */
  var PROGRAM = [
    ['', '%'],
    ['', 'O4471 (SR-4471 PERSELY CUZN39PB3)'],
    ['', '(NYERS D32 RUD - KESZ HOSSZ 50)'],
    ['', 'G21 G40 G99 G18'],
    ['', 'G28 U0. W0.'],
    ['face', 'N10 (HOMLOKESZTERGALAS)'],
    ['face', 'T0101 (PCLNL2525M12 CNMG120408)'],
    ['face', 'G50 S3500'],
    ['face', 'G96 S260 M03'],
    ['face', 'G00 X34. Z0. M08'],
    ['face', 'G01 X-1.6 F0.15'],
    ['face', 'G00 Z2.'],
    ['rough', 'N20 (NAGYOLAS G71)'],
    ['rough', 'G00 X34. Z2.'],
    ['rough', 'G71 U1.5 R0.5'],
    ['rough', 'G71 P30 Q40 U0.4 W0.1 F0.25'],
    ['rough', 'N30 G00 X18.'],
    ['rough', 'G01 Z0.'],
    ['rough', 'X20. Z-1.'],
    ['rough', 'Z-19.'],
    ['rough', 'X24.'],
    ['rough', 'X25. Z-19.5'],
    ['rough', 'Z-34.'],
    ['rough', 'X29.'],
    ['rough', 'X30. Z-34.5'],
    ['rough', 'Z-53.'],
    ['rough', 'N40 X34.'],
    ['rough', 'G28 U0. W0.'],
    ['drill', 'N50 (FURAS D10 G74)'],
    ['drill', 'T0303 (FURO D10.0 HM)'],
    ['drill', 'G97 S2400 M03'],
    ['drill', 'G00 X0. Z3.'],
    ['drill', 'G74 R0.5'],
    ['drill', 'G74 Z-53. Q8000 F0.12'],
    ['drill', 'G00 Z5.'],
    ['drill', 'G28 U0. W0.'],
    ['finish', 'N60 (SIMITAS G70)'],
    ['finish', 'T0202 (SVJBL2525M16 VBMT160404)'],
    ['finish', 'G96 S320 M03'],
    ['finish', 'G00 X34. Z2.'],
    ['finish', 'G70 P30 Q40 F0.08'],
    ['finish', 'G28 U0. W0.'],
    ['groove', 'N70 (BESZURAS)'],
    ['groove', 'T0404 (BESZURO B2.5)'],
    ['groove', 'G96 S150 M03'],
    ['groove', 'G00 X22. Z-18.5'],
    ['groove', 'G01 X16.8 F0.05'],
    ['groove', 'G00 X22.'],
    ['groove', 'Z-16.5'],
    ['groove', 'G01 X16.8'],
    ['groove', 'G00 X27.'],
    ['groove', 'Z-28.5'],
    ['groove', 'G01 X21.4 F0.05'],
    ['groove', 'G04 P300'],
    ['groove', 'G00 X27.'],
    ['groove', 'G28 U0. W0.'],
    ['thread', 'N80 (MENETVAGAS M20X1.5)'],
    ['thread', 'T0505 (16ER 1.5ISO)'],
    ['thread', 'G97 S1200 M03'],
    ['thread', 'G00 X22. Z4.'],
    ['thread', 'G76 P010060 Q50 R0.02'],
    ['thread', 'G76 X18.16 Z-16. P920 Q250 F1.5'],
    ['thread', 'G28 U0. W0.'],
    ['cutoff', 'N90 (LESZURAS)'],
    ['cutoff', 'T0606 (LESZURO B3.0)'],
    ['cutoff', 'G50 S2500'],
    ['cutoff', 'G96 S140 M03'],
    ['cutoff', 'G00 X34. Z-53.'],
    ['cutoff', 'G01 X8. F0.06'],
    ['cutoff', 'G00 X34. M09'],
    ['inspect', 'G28 U0. W0. M05'],
    ['inspect', 'M30'],
    ['inspect', '%']
  ];

  // [op, seconds, turret station, 'css'|'rpm', S, F]
  var OPS = [
    ['face',    3.0, 0, 'css', 260, 0.15],
    ['rough',   8.5, 0, 'css', 260, 0.25],
    ['drill',   6.0, 2, 'rpm', 2400, 0.12],
    ['finish',  5.5, 1, 'css', 320, 0.08],
    ['groove',  4.5, 3, 'css', 150, 0.05],
    ['thread',  6.0, 4, 'rpm', 1200, 1.5],
    ['cutoff',  3.5, 5, 'css', 140, 0.06],
    ['inspect', 7.0, -1, 'rpm', 0, 0]
  ];
  var INDEX_T = 0.9;
  var TOTAL = OPS.reduce(function (a, o) { return a + o[1]; }, 0);
  var TOOL_NAMES = ['T0101', 'T0202', 'T0303', 'T0404', 'T0505', 'T0606'];
  var TOOL_INFO = ['CNMG 120408 · nagyoló', 'VBMT 160404 · simító', 'Ø10 HM csigafúró', 'Beszúró B2,5', '16ER 1,5 ISO menetkés', 'Leszúró B3,0'];
  // [yaw, pitch, distance, target x, target y] per operation
  var SHOTS = {
    face:   [0.62, 0.16, 205, -2, 10],
    rough:  [0.32, 0.22, 262, -22, 12],
    drill:  [0.95, 0.12, 215, 6, 6],
    finish: [0.18, 0.26, 235, -26, 11],
    groove: [0.46, 0.18, 170, -24, 10],
    thread: [0.52, 0.16, 150, -8, 10],
    cutoff: [0.28, 0.2, 190, -48, 10],
    inspect:[0.4, 0.3, 175, -30, 6]
  };

  /* ======================================================================
     Tools (tip at local origin, shank along +Y toward the turret)
     ====================================================================== */
  var TM = null;
  function toolMats() {
    if (TM) return TM;
    TM = {
      holder: plain(0x4a5058, 0.9, 0.32), carbide: plain(0x45484d, 0.8, 0.28), tin: plain(0xd9b45a, 1, 0.26),
      screw: plain(0x6b7077, 1, 0.3), drill: plain(0x7a7888, 1, 0.22), turret: plain(0x6a727b, 0.5, 0.45), face: plain(0xb4bac0, 1, 0.3)
    };
    return TM;
  }
  function rhombus(len, ang) {
    var a = ang * PI / 180, s = new T.Shape(), dx = Math.cos(a / 2) * len, dy = Math.sin(a / 2) * len;
    s.moveTo(0, 0); s.lineTo(dx, dy); s.lineTo(2 * dx, 0); s.lineTo(dx, -dy); s.lineTo(0, 0);
    return s;
  }
  function insertTool(shape, tilt, coated) {
    var M = toolMats(), g = new T.Group();
    var shank = new T.Mesh(new T.BoxGeometry(12, 30, 12), M.holder); shank.position.set(8, 24, 0); g.add(shank);
    var head = new T.Mesh(new T.BoxGeometry(15, 10, 12), M.holder); head.position.set(7, 7, 0); head.rotation.z = -0.2; g.add(head);
    var ins = new T.Group();
    var body = new T.Mesh(extrude(shape, 4.2, 0.3), coated ? M.tin : M.carbide); body.position.z = -2.1; ins.add(body);
    ins.rotation.z = PI / 2 - tilt; ins.position.y = 0.2; g.add(ins);
    var screw = new T.Mesh(new T.CylinderGeometry(1.8, 1.8, 1.4, 16), M.screw); screw.rotation.x = PI / 2; screw.position.set(3.2, 5.2, 2.3); g.add(screw);
    return g;
  }
  function bladeTool(width, coated) {
    var M = toolMats(), g = new T.Group();
    var blade = new T.Mesh(new T.BoxGeometry(width * 0.75, 26, 18), M.holder); blade.position.set(0, 15, 0); g.add(blade);
    var tip = new T.Mesh(new T.BoxGeometry(width, 4, 7), coated ? M.tin : M.carbide); tip.position.set(0, 2, 0); g.add(tip);
    var block = new T.Mesh(new T.BoxGeometry(16, 14, 20), M.holder); block.position.set(0, 32, 0); g.add(block);
    return g;
  }
  function threadingTool() {
    var M = toolMats(), g = new T.Group();
    var s = new T.Shape(); s.moveTo(0, 0); s.lineTo(4, 7); s.lineTo(-4, 7); s.lineTo(0, 0);
    var ins = new T.Mesh(extrude(s, 3.4, 0.2), M.tin); ins.position.z = -1.7; g.add(ins);
    var shank = new T.Mesh(new T.BoxGeometry(12, 30, 12), M.holder); shank.position.set(0, 23, 0); g.add(shank);
    return g;
  }
  // Twist drill D10: tip at origin, body along +X
  function twistDrill() {
    var M = toolMats(), g = new T.Group();
    var len = 62, geo = new T.CylinderGeometry(5, 5, len, 48, 160, false), p = geo.attributes.position;
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i), y = p.getY(i), z = p.getZ(i), rr = Math.sqrt(x * x + z * z);
      if (rr < 0.01) continue;
      var yy = len / 2 - y;                               // 0 at tip
      var a = Math.atan2(z, x), twist = yy / 12 * TAU / 2.8;
      var flute = Math.pow(Math.max(0, Math.cos(2 * (a - twist))), 3);
      var fl = yy < 42 ? 1 : clamp((48 - yy) / 6, 0, 1);
      var k = (1 - 0.46 * flute * fl) * (yy < 3 ? clamp(yy / 3, 0.18, 1) : 1);
      p.setX(i, x * k); p.setZ(i, z * k);
    }
    geo.computeVertexNormals();
    var body = new T.Mesh(geo, M.drill);
    body.rotation.z = -PI / 2; body.position.x = len / 2; g.add(body); // tip (+y end) -> -x
    var holder = new T.Mesh(new T.CylinderGeometry(9, 9, 22, 32), M.holder); holder.rotation.z = PI / 2; holder.position.x = len + 6; g.add(holder);
    return g;
  }
  var TURRET_R = 30, TIP_R = 60, DRILL_OFF = 38, DRILL_AHEAD = 58;
  function buildTurret() {
    var M = toolMats(), turret = new T.Group();
    var body = new T.Mesh(new T.CylinderGeometry(TURRET_R, TURRET_R, 30, 8), M.turret); body.rotation.z = PI / 2; body.position.x = 21; turret.add(body);
    var face = new T.Mesh(new T.CylinderGeometry(TURRET_R - 6, TURRET_R - 6, 2, 8), M.face); face.rotation.z = PI / 2; face.position.x = 3.5; turret.add(face);
    for (var s = 0; s < 8; s++) {
      var st = new T.Group(); st.rotation.x = s * TAU / 8;
      var tool = s === 0 ? insertTool(rhombus(7, 80), 0.6) : s === 1 ? insertTool(rhombus(9, 35), 0.25) :
        s === 3 ? bladeTool(2.5) : s === 4 ? threadingTool() : s === 5 ? bladeTool(3, true) : null;
      if (tool) { tool.position.set(0, -TIP_R, 0); st.add(tool); }
      if (s === 2) { var d = twistDrill(); d.position.set(-DRILL_AHEAD, -DRILL_OFF, 0); st.add(d); }
      var blk = new T.Mesh(new T.BoxGeometry(22, 10, 22), M.holder); blk.position.set(10, -TURRET_R - 3, 0); st.add(blk);
      turret.add(st);
    }
    return shadowed(turret);
  }
  function chipGeometry(turns, radius, length, thick) {
    var pts = [], n = Math.max(8, Math.round(turns * 14));
    for (var i = 0; i <= n; i++) {
      var t = i / n, a = t * turns * TAU, rr = radius * (1 - t * 0.35);
      pts.push(new T.Vector3(Math.cos(a) * rr, t * length, Math.sin(a) * rr));
    }
    return new T.TubeGeometry(new T.CatmullRomCurve3(pts), n, thick, 5, false);
  }

  /* Steel Riders badge: rounded-triangle plaque, raised rim, polished lettering */
  function badgeShape(sc, inset) {
    // outline from the logo (SVG units 48 x 44), y flipped, centred
    var k = sc * (1 - (inset || 0)), cx = 24, cy = 25;
    function P(x, y) { return [(x - cx) * k, (cy - y) * k]; }
    var s = new T.Shape(), a;
    a = P(24, 2.5); s.moveTo(a[0], a[1]);
    function C(x1, y1, x2, y2, x, y) { var p1 = P(x1, y1), p2 = P(x2, y2), p3 = P(x, y); s.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]); }
    function L(x, y) { var q = P(x, y); s.lineTo(q[0], q[1]); }
    C(25.6, 2.5, 26.9, 3.3, 27.8, 4.8); L(44.8, 34.0); C(46.7, 37.3, 44.9, 40.2, 41.2, 40.9);
    C(35.8, 41.9, 30.2, 42.4, 24, 42.4); C(17.8, 42.4, 12.2, 41.9, 6.8, 40.9);
    C(3.1, 40.2, 1.3, 37.3, 3.2, 34.0); L(20.2, 4.8); C(21.1, 3.3, 22.4, 2.5, 24, 2.5);
    return s;
  }
  function buildBadge(scale) {
    var g = new T.Group(), S = 2.6 * scale;
    var steel = partMaterial('steel', 'mill'); steel.roughness = 0.14; steel.color.copy(lin(0xe2e5e8)); steel.normalScale.setScalar(0.15);
    var dark = partMaterial('steel', 'mill'); dark.color.copy(lin(0x3a3f45)); dark.roughness = 0.36; dark.normalScale.setScalar(0.35);
    var back = new T.Mesh(extrude(badgeShape(S), 3, 0.6), dark); g.add(back);
    var rim = badgeShape(S); rim.holes.push(badgeShape(S, 0.1));
    var rimM = new T.Mesh(extrude(rim, 3, 0.9), steel); rimM.position.z = 3; g.add(rimM);
    var rim2 = badgeShape(S, 0.15); rim2.holes.push(badgeShape(S, 0.18));
    var r2 = new T.Mesh(extrude(rim2, 1.2, 0.3), steel); r2.position.z = 3; g.add(r2);
    // lettering as a polished-metal decal with alpha
    var c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
    var x = c.getContext('2d');
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '900 196px "Archivo", "Arial Black", Arial, sans-serif';
    x.fillText('STEEL', 512, 452);
    x.fillText('RIDERS', 512, 700);
    x.fillRect(250, 566, 524, 16);
    x.font = '800 84px "Archivo", "Arial Black", Arial, sans-serif';
    x.fillText('KFT.', 512, 842);
    x.fillRect(330, 838, 90, 8); x.fillRect(604, 838, 90, 8);
    var tex = new T.CanvasTexture(c);
    var letters = new T.Mesh(new T.PlaneGeometry(48 * S * 0.62, 48 * S * 0.62), new T.MeshStandardMaterial({
      color: lin(0xf2f4f6), metalness: 0.85, roughness: 0.22, alphaMap: tex, transparent: true, envMapIntensity: 1.5,
      emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.45, polygonOffset: true, polygonOffsetFactor: -4
    }));
    letters.position.set(0, -2 * S, 4.4);
    letters.material.depthWrite = false; letters.renderOrder = 2;
    g.add(letters);
    return shadowed(g);
  }

  /* Final grade: exposure + ACES filmic tone mapping + sRGB + vignette + fine grain */
  var FINAL_SHADER = {
    uniforms: { tDiffuse: { value: null }, exposure: { value: 1.35 }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform float exposure; uniform float time; varying vec2 vUv;',
      'vec3 RRTAndODTFit(vec3 v){ vec3 a = v*(v+0.0245786)-0.000090537; vec3 b = v*(0.983729*v+0.4329510)+0.238081; return a/b; }',
      'vec3 aces(vec3 c){',
      '  const mat3 I = mat3(0.59719,0.07600,0.02840, 0.35458,0.90834,0.13383, 0.04823,0.01566,0.83777);',
      '  const mat3 O = mat3(1.60475,-0.10208,-0.00327, -0.53108,1.10813,-0.07276, -0.07367,-0.00605,1.07602);',
      '  c *= exposure / 0.6; c = I * c; c = RRTAndODTFit(c); c = O * c; return clamp(c, 0.0, 1.0); }',
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }',
      'void main(){',
      '  vec4 t = texture2D(tDiffuse, vUv);',
      '  vec3 c = aces(t.rgb);',
      '  c = mix(12.92 * c, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c));',
      '  vec2 d = vUv - 0.5; float v = smoothstep(0.85, 0.25, length(d * vec2(1.0, 0.85)));',
      '  c *= mix(0.62, 1.0, v);',
      '  c += (hash(vUv * 900.0 + time) - 0.5) * 0.018;',
      '  gl_FragColor = vec4(c, 1.0); }'
    ].join('\n')
  };

  /* ======================================================================
     HERO – CNC turning simulation
     ====================================================================== */
  function hero(canvas, hud, opts) {
    opts = opts || {};
    var wrap = canvas.parentElement;
    var renderer = makeRenderer(canvas);
    var scene = new T.Scene();
    scene.environment = environment(renderer);
    // painted backdrop so post-processing keeps the machine-interior gradient
    var bgc = document.createElement('canvas'); bgc.width = bgc.height = 512;
    var bx = bgc.getContext('2d'), grd = bx.createRadialGradient(230, 230, 20, 256, 256, 420);
    grd.addColorStop(0, '#2c353e'); grd.addColorStop(0.55, '#171d23'); grd.addColorStop(1, '#0c1014');
    bx.fillStyle = grd; bx.fillRect(0, 0, 512, 512);
    var bgTex = new T.CanvasTexture(bgc); bgTex.encoding = T.sRGBEncoding;
    var finalPass = null;
    scene.background = bgTex;
    var keyLight = studioLights(scene);
    var cam = new T.PerspectiveCamera(30, 1, 5, 4000);
    var rig = new T.Group(); scene.add(rig);

    var backMat = partMaterial('steel', 'mill'); backMat.color.copy(lin(0x5c646c)); backMat.roughness = 0.55; backMat.metalness = 0.75;
    var back = new T.Mesh(new T.PlaneGeometry(1200, 600), backMat); back.position.set(0, 60, -130); back.receiveShadow = true; rig.add(back);
    scene.add(cam);

    // Steel Riders badge on the machine's back wall: extruded metal plaque
    var badge = buildBadge(0.78);
    badge.position.set(112, 74, -126); badge.rotation.y = -0.08;
    rig.add(badge);
    // LED light bar inside the enclosure (drives the bloom highlight)
    var led = new T.Mesh(new T.BoxGeometry(420, 2.2, 5), new T.MeshBasicMaterial({ color: new T.Color(3.2, 3.3, 3.6) }));
    led.position.set(-10, 150, -60); rig.add(led);
    // Door frame in the foreground, fixed to the camera (seen through the machine door)
    var frameMat = plain(0x2a2f35, 0.85, 0.32);
    var doorFrame = new T.Group();
    var post = new T.Mesh(new T.BoxGeometry(14, 260, 10), frameMat); post.position.set(-7, 0, 0); doorFrame.add(post);
    var edge = new T.Mesh(new T.BoxGeometry(1.6, 260, 12), plain(0x9aa1a8, 1, 0.22)); edge.position.set(0.6, 0, 0); doorFrame.add(edge);
    var seal = new T.Mesh(new T.BoxGeometry(3.5, 260, 14), plain(0x0c0d0e, 0, 0.9)); seal.position.set(3, 0, -1); doorFrame.add(seal);
    doorFrame.position.z = -170;
    cam.add(doorFrame);

    var tray = new T.Mesh(new T.PlaneGeometry(1200, 500), plain(0x121416, 0.2, 0.85)); tray.rotation.x = -PI / 2; tray.position.y = -58; tray.receiveShadow = true; rig.add(tray);

    var spindle = new T.Group();
    spindle.rotation.order = 'ZYX';
    spindle.rotation.z = -PI / 2;
    spindle.position.x = -SIM.z0;
    rig.add(spindle);

    var chuck = new T.Mesh(revolve(crisp([[46, -34], [52, -30], [52, -8], [48, -2], [30, 0]]), [[12, -34], [12, 0]], 96), plain(0x8a9098, 1, 0.3));
    spindle.add(chuck);
    var nose = new T.Mesh(new T.CylinderGeometry(40, 40, 30, 64), plain(0x3d434a, 0.6, 0.5)); nose.position.y = -50; spindle.add(nose);
    var jawMat = plain(0x7d838a, 1, 0.3);
    for (var j = 0; j < 3; j++) {
      var a = j * TAU / 3, jaw = new T.Group();
      var j1 = new T.Mesh(new T.BoxGeometry(14, 11, 12), jawMat); j1.position.set(0, 5.5, 0); jaw.add(j1);
      var j2 = new T.Mesh(new T.BoxGeometry(14, 6, 12), jawMat); j2.position.set(0, 3, 11); jaw.add(j2);
      jaw.position.set(Math.cos(a) * (SIM.stock + 6), 0, Math.sin(a) * (SIM.stock + 6));
      jaw.rotation.y = -a + PI / 2;
      spindle.add(jaw);
    }
    shadowed(spindle);

    var matKey = 'brass';
    var workMat = partMaterial(matKey, 'turn', 30);
    var work = new T.Mesh(new T.BufferGeometry(), workMat); work.castShadow = work.receiveShadow = true; spindle.add(work);
    workMat.vertexColors = true;
    var finMat = partMaterial(matKey, 'turn', 30);
    var finished = new T.Mesh(new T.BufferGeometry(), finMat); finished.castShadow = true; finished.visible = false; rig.add(finished);
    finished.rotation.order = 'ZYX';

    // Tool side (turret, coolant nozzle) is tilted back like a slant-bed lathe
    var slide = new T.Group(); slide.rotation.x = -0.95; rig.add(slide);
    var turret = buildTurret(); slide.add(turret);

    var DROPS = 280, cg = new T.BufferGeometry(), cpos = new Float32Array(DROPS * 3);
    cg.setAttribute('position', new T.BufferAttribute(cpos, 3));
    var coolant = new T.Points(cg, new T.PointsMaterial({ color: 0xd8ecf7, size: 1.4, transparent: true, opacity: 0.5, depthWrite: false }));
    coolant.frustumCulled = false; rig.add(coolant);
    var drops = []; for (var d = 0; d < DROPS; d++) drops.push({ life: 0, p: new T.Vector3(), v: new T.Vector3() });
    var nozzle = new T.Mesh(new T.CylinderGeometry(1.4, 2.4, 28, 12), plain(0x5b6168, 0.9, 0.35)); slide.add(nozzle);
    var tipW = new T.Vector3(), nozW = new T.Vector3();

    var CHIPS = 240;
    var chipGeos = { brass: chipGeometry(1.1, 1.3, 1.6, 0.22), alu: chipGeometry(3.2, 1.8, 6, 0.2), pom: chipGeometry(4.5, 2.2, 9, 0.3) };
    var chipMat = plain(MAT.brass.color, 1, 0.28);
    var chips = new T.InstancedMesh(chipGeos.brass, chipMat, CHIPS);
    chips.instanceMatrix.setUsage(T.DynamicDrawUsage); chips.castShadow = true; chips.frustumCulled = false; rig.add(chips);
    var chipS = []; for (var c = 0; c < CHIPS; c++) chipS.push({ life: 0, rest: false, p: new T.Vector3(), v: new T.Vector3(), r: new T.Euler(), w: new T.Vector3(), s: 1 });
    var dummy = new T.Object3D(), chipCur = 0;

    /* stock state */
    var N = 264, rad = new Float32Array(N + 1), boreDepth = 0, threadFrac = 0, cutDone = false, dirty = true, faced = false;
    function reset() {
      for (var i = 0; i <= N; i++) rad[i] = SIM.stock;
      boreDepth = 0; threadFrac = 0; cutDone = false; dirty = true; faced = false;
      finished.visible = false;
      for (var k = 0; k < CHIPS; k++) chipS[k].life = 0;
    }
    function yAt(i) { return i / N * SIM.L; }
    function cutTo(zA, zB, fn) {
      var hi = yOf(Math.max(zA, zB)), lo = yOf(Math.min(zA, zB));
      for (var i = 0; i <= N; i++) {
        var y = yAt(i);
        if (y <= hi && y >= lo) { var nr = Math.min(rad[i], fn(zOf(y))); if (nr < rad[i] - 1e-4) { rad[i] = nr; dirty = true; } }
      }
    }
    function buildWork() {
      if (!dirty) return; dirty = false;
      var P = [v2(0, 0), v2(rad[0], 0)], i;
      for (i = 0; i <= N; i++) P.push(v2(rad[i], yAt(i)));
      P.push(v2(rad[N], SIM.L));
      if (boreDepth > 0.05) {
        var yb = SIM.L - Math.min(boreDepth, SIM.L - 2);
        P.push(v2(SIM.bore, SIM.L)); P.push(v2(SIM.bore, SIM.L)); P.push(v2(SIM.bore, yb)); P.push(v2(SIM.bore, yb)); P.push(v2(0, yb - SIM.bore * 0.6));
      } else P.push(v2(0, SIM.L));
      var g = new T.LatheGeometry(P, 96); g.computeVertexNormals();
      // bar stock is dull drawn material, machined surfaces are bright
      var n = P.length, cnt = g.attributes.position.count, col = new Float32Array(cnt * 3);
      for (var v = 0; v < cnt; v++) {
        var jj = v % n, fresh;
        if (jj <= 1) fresh = false;
        else if (jj <= N + 2) fresh = rad[jj - 2] < SIM.stock - 0.01;
        else fresh = faced || jj > N + 3;
        var c = fresh ? 1 : 0.6;
        col[v * 3] = c; col[v * 3 + 1] = c * (fresh ? 1 : 0.96); col[v * 3 + 2] = c * (fresh ? 1 : 0.88);
      }
      g.setAttribute('color', new T.BufferAttribute(col, 3));
      work.geometry.dispose(); work.geometry = g;
    }
    function buildFinished() {
      var outer = [], a = yOf(-50);
      for (var i = 0; i <= N; i++) { var y = yAt(i); if (y >= a - 1e-6) outer.push([rad[i], y - a]); }
      finished.geometry.dispose();
      finished.geometry = revolve(outer, [[SIM.bore, 0], [SIM.bore, SIM.L - a]], 128);
      // the remaining bar stays in the chuck
      cutTo(-50, 1, function () { return 0.0005; });
      boreDepth = 0; dirty = true;
    }

    function opAt(t) {
      var acc = 0;
      for (var i = 0; i < OPS.length; i++) { if (t < acc + OPS[i][1]) return { i: i, local: t - acc }; acc += OPS[i][1]; }
      return { i: OPS.length - 1, local: OPS[OPS.length - 1][1] - 0.001 };
    }
    // tool tip in machine coords (X diameter, Z) for op & progress; removes material
    function path(key, p) {
      var X = 34, Z = 2, cut = false;
      if (key === 'face') { X = 34 - p * 35.6; Z = 0; cut = X < 32 && X > 0; if (p > 0.2 && !faced) { faced = true; dirty = true; } }
      else if (key === 'rough') {
        var levels = [29, 26, 23, 20.4], n = levels.length + 1;
        var k = Math.min(n - 1, Math.floor(p * n)), q = p * n - k;
        if (k < levels.length) {
          var L = levels[k], zEnd = -53;
          for (var zz = 0; zz >= -53; zz -= 0.25) { if ((contour(zz) + 0.2) * 2 >= L) { zEnd = zz; break; } }
          Z = 1 - q * (1 - zEnd); X = L;
          cutTo(1, Z, function (z) { return Math.max(L / 2, contour(z) + 0.2); });
        } else {
          Z = 1 - q * 54; X = (contour(Math.min(Z, 0)) + 0.2) * 2;
          cutTo(1, Z, function (z) { return contour(z) + 0.2; });
        }
        cut = true;
      } else if (key === 'drill') {
        var depth = 53 * clamp(p / 0.88, 0, 1), peck = (depth % 8) / 8;
        var retract = (peck < 0.1 && depth > 1 && p < 0.88) ? 1.5 * (1 - peck / 0.1) : 0;
        Z = 3 - Math.min(depth + 3, 56) + retract; X = 0;
        if (p >= 0.88) Z = -53 + (p - 0.88) / 0.12 * 60;
        if (depth > boreDepth + 0.05) { boreDepth = depth; dirty = true; }
        cut = p < 0.88 && Z < 0;
      } else if (key === 'finish') {
        Z = 1 - p * 54; X = contour(Math.min(Z, 0)) * 2;
        cutTo(1, Z, function (z) { return contour(z); });
        cut = Z < 0;
      } else if (key === 'groove') {
        var g;
        if (p < 0.5) {
          g = p / 0.5;
          var pl = g < 0.5 ? g / 0.5 : (g - 0.5) / 0.5;
          Z = g < 0.5 ? -18.5 : -16.5;
          X = 22 - Math.sin(pl * PI) * (22 - 16.8);
          var r1 = X / 2, zl = Z;
          cutTo(zl, zl - 2.5, function (z) { return Math.max(r1, 8.4); });
        } else {
          g = (p - 0.5) / 0.5;
          Z = -28.5 + 2.5; X = 27 - Math.sin(g * PI) * (27 - 21.4);
          var r2 = X / 2;
          cutTo(-26, -28.5, function () { return Math.max(r2, 10.7); });
        }
        cut = X < 20 && X > 16.9 || (p >= 0.5 && X < 25);
      } else if (key === 'thread') {
        var passes = 9, kk = Math.min(passes - 1, Math.floor(p * passes)), qq = p * passes - kk;
        var reach = Math.min(1, qq * 1.25);
        Z = 4 - reach * 20;
        X = qq > 0.8 ? 22 : 20 - 1.84 * Math.sqrt((kk + 1) / passes);
        var f = Math.sqrt((kk + (qq > 0.8 ? 1 : 0)) / passes + (qq <= 0.8 ? reach / passes : 0));
        if (f > threadFrac) {
          threadFrac = f;
          var zHead = Z, tf = threadFrac;
          cutTo(-1, Math.max(-16, zHead), function (z) { return threadForm(z, tf); });
        }
        cut = qq <= 0.8 && Z < -1 && Z > -16;
      } else if (key === 'cutoff') {
        var cp = clamp(p / 0.85, 0, 1);
        X = 34 - cp * 26; Z = -50;
        var r3 = X / 2;
        cutTo(-50, -53, function () { return Math.max(r3, SIM.bore + 0.001); });
        if (cp >= 1 && !cutDone) { cutDone = true; buildFinished(); }
        if (p > 0.85) X = 8 + (p - 0.85) / 0.15 * 26;
        cut = cp < 1 && X < 32;
      }
      return { X: X, Z: Z, cut: cut };
    }

    /* interaction */
    var yaw = 0.3, pitch = 0.2, tYaw = yaw, tPitch = pitch, drag = false, lx = 0, ly = 0, idle = 0;
    canvas.addEventListener('pointerdown', function (e) { drag = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag) return;
      tYaw += (e.clientX - lx) * 0.006; tPitch = clamp(tPitch + (e.clientY - ly) * 0.004, -0.05, 0.75); tYaw = clamp(tYaw, -1.2, 1.4);
      lx = e.clientX; ly = e.clientY; idle = 0;
    });
    function up() { drag = false; }
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    /* Cinematic post-processing: bloom, depth of field, vignette */
    var composer = null, bokeh = null;
    if (T.EffectComposer && !opts.noPost) {
      try {
        composer = new T.EffectComposer(renderer);
        composer.addPass(new T.RenderPass(scene, cam));
        var bloom = new T.UnrealBloomPass(new T.Vector2(256, 256), 0.32, 0.55, 0.86);
        composer.addPass(bloom);
        if (!opts.lite) {
          bokeh = new T.BokehPass(scene, cam, { focus: 285, aperture: 0.00006, maxblur: 0.006, width: 256, height: 256 });
          composer.addPass(bokeh);
        }
        finalPass = new T.ShaderPass(FINAL_SHADER); composer.addPass(finalPass);
        renderer.toneMapping = T.NoToneMapping;          // tone mapping happens in FINAL_SHADER
      } catch (err) { composer = null; }
    }
    function resize() {
      var W = wrap.clientWidth, H = wrap.clientHeight;
      renderer.setSize(W, H, false); cam.aspect = W / H; cam.updateProjectionMatrix();
      if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(W, H); }
      doorFrame.visible = cam.aspect > 1.1;
      doorFrame.position.x = -Math.tan(cam.fov * PI / 360) * 170 * cam.aspect + 9;
    }
    window.addEventListener('resize', resize);
    var visible = true;
    if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(canvas);

    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var camDist = 285, camTarget = new T.Vector3(-6, 16, 0);
    var cycle = 1, t = 0, playing = true, last = performance.now(), spin = 0, rpmNow = 0, lastOp = -1, lastLine = -1, dropT = 0;
    var turretAngle = 0, turretPos = new T.Vector3(120, 160, 0), tip = new T.Vector3(), target = new T.Vector3(-6, 16, 0);
    var home = new T.Vector3(100, 160, 0);
    reset();

    function frame(now, forced) {
      if (!forced) requestAnimationFrame(frame);
      var dt = forced || clamp((now - last) / 1000, 0, 0.05); last = now;
      if (!forced && (!visible || document.hidden)) return;
      if (playing && !reduce) t += dt;
      if (t >= TOTAL) { t = 0; reset(); cycle++; }

      var o = opAt(t), op = OPS[o.i], key = op[0], station = op[2];
      if (o.i === 0 && o.local < 0.05 && rad[0] < SIM.stock) reset();
      var inIndex = station >= 0 && o.local < INDEX_T;
      var p = station >= 0 ? clamp((o.local - INDEX_T) / (op[1] - INDEX_T), 0, 1) : o.local / op[1];

      var X = 90, Z = 40, cut = false;
      if (station >= 0 && !inIndex) { var pp = path(key, p); X = pp.X; Z = pp.Z; cut = pp.cut; }
      if (key === 'inspect' && !cutDone) { cutDone = true; buildFinished(); }

      // turret: retract, index, approach
      if (station >= 0) {
        var goal = -station * TAU / 8;
        if (inIndex) {
          turretPos.lerp(home, 0.14);
          var ip = ease(clamp((o.local - 0.2) / (INDEX_T - 0.35), 0, 1));
          turretAngle = turretAngle + (goal - turretAngle) * ip * 0.35;
        } else {
          turretAngle = goal;
          var tgt = station === 2 ? new T.Vector3(Z + DRILL_AHEAD, DRILL_OFF + X / 2, 0) : new T.Vector3(Z, X / 2 + TIP_R, 0);
          turretPos.lerp(tgt, 0.5);
        }
      } else turretPos.lerp(home, 0.06);
      turret.position.copy(turretPos);
      turret.rotation.x = turretAngle;

      buildWork();

      var rpm = 0;
      if (station >= 0 && !inIndex) rpm = op[3] === 'css' ? Math.min(op[4] * 1000 / (PI * Math.max(X, 8)), key === 'cutoff' ? 2500 : 3500) : op[4];
      rpmNow += (rpm - rpmNow) * 0.06;
      spin += dt * (rpmNow > 20 ? 7 + rpmNow / 900 : rpmNow / 400);
      spindle.rotation.y = spin;

      if (key === 'inspect') {
        finished.visible = true;
        dropT = Math.min(1, dropT + dt * 0.6);
        var e = ease(dropT);
        finished.rotation.z = -PI / 2;
        finished.rotation.y += dt * 0.6;
        finished.position.set(-50 + e * 6, -e * 4 + Math.sin(t * 1.5) * 0.8 * e, e * 34);
      } else { dropT = 0; finished.visible = false; }

      var coolOn = station >= 0 && !inIndex;
      tip.set(Z, station === 2 ? 0 : X / 2, 0);
      nozzle.visible = coolOn;
      nozzle.position.set(tip.x + 16, tip.y + 30, 16);
      nozzle.lookAt(tip.x, tip.y, tip.z); nozzle.rotateX(PI / 2);
      slide.updateMatrixWorld();
      tipW.copy(tip).applyMatrix4(slide.matrix);
      nozW.copy(nozzle.position).applyMatrix4(slide.matrix);
      updateCoolant(dt, coolOn && cut);
      if (cut) emitChips(dt, key);
      updateChips(dt);

      // Cinematic director: per-operation framing, user drag takes over for 6 s
      idle += dt;
      var shot = SHOTS[key] || SHOTS.rough;
      if (!drag && idle > 6) {
        var drift = Math.sin(t * 0.21) * 0.08;
        if (key === 'inspect') { tYaw = shot[0] + o.local * 0.35; } else tYaw = shot[0] + drift;
        tPitch = shot[1];
        camDist += (shot[2] - camDist) * 0.02;
        if (key === 'inspect') camTarget.lerp(finished.position.clone().add(new T.Vector3(-25, 0, 0)), 0.04);
        else camTarget.lerp(new T.Vector3(shot[3], shot[4], 0), 0.025);
      }
      yaw += (tYaw - yaw) * 0.035; pitch += (tPitch - pitch) * 0.035;
      var dist = camDist * (cam.aspect < 1 ? 1.55 : cam.aspect < 1.4 ? 1.2 : 1);
      cam.position.set(camTarget.x + Math.sin(yaw) * dist * Math.cos(pitch), camTarget.y + Math.sin(pitch) * dist, camTarget.z + Math.cos(yaw) * dist * Math.cos(pitch));
      cam.lookAt(camTarget);
      target.copy(camTarget);

      // screen-space callouts for the page (tool tag, inspection dimensions)
      if (hud && hud.overlay) {
        var W = renderer.domElement.clientWidth, H = renderer.domElement.clientHeight;
        var toScreen = function (v) { var q = v.clone().project(cam); return { x: (q.x + 1) / 2 * W, y: (1 - q.y) / 2 * H, on: q.z < 1 }; };
        var tag = null, dims = null;
        if (station >= 0 && !inIndex && key !== 'inspect') {
          var ts = toScreen(tipW);
          tag = { x: ts.x, y: ts.y, t: TOOL_NAMES[station], tool: TOOL_INFO[station], op: key, vc: op[3] === 'css' ? op[4] + ' m/min' : op[4] + ' 1/min', f: op[5] };
        }
        if (key === 'inspect' && dropT > 0.85) {
          finished.updateMatrixWorld();
          var L = function (y, r) { return toScreen(finished.localToWorld(new T.Vector3(0, y, r))); };
          dims = [
            { a: L(0, 19), b: L(50, 19), label: '50 ±0,05' },
            { a: L(8, 15), b: L(8, -15), label: 'Ø30 h9' },
            { a: L(42, 10), b: L(42, -10), label: 'M20×1,5' },
            { a: L(27.25, 12.5), b: L(27.25, -12.5), label: 'Ø25 f7' }
          ];
        }
        hud.overlay(tag, dims);
      }
      keyLight.position.set(cam.position.x * 0.3 - 60, 140, cam.position.z * 0.3 + 80);

      if (hud) {
        if (o.i !== lastOp) { lastOp = o.i; if (hud.op) hud.op(key, o.i); }
        var idx = []; for (var q = 0; q < PROGRAM.length; q++) if (PROGRAM[q][0] === key) idx.push(q);
        var frac = key === 'inspect' ? p : (inIndex ? 0.05 : 0.2 + p * 0.8);
        var li = idx[Math.min(idx.length - 1, Math.floor(frac * idx.length))];
        if (o.i === 0 && o.local < 0.5) li = Math.floor(o.local / 0.5 * 5);
        if (li !== lastLine) { lastLine = li; if (hud.line) hud.line(li); }
        if (hud.dro) hud.dro({
          x: station >= 0 && !inIndex ? X : 200, z: station >= 0 && !inIndex ? Z : 150, s: Math.round(rpmNow),
          f: station >= 0 ? op[5] : 0, t: station >= 0 ? TOOL_NAMES[station] : 'T0000', m: coolOn ? 'M08' : 'M09', p: t / TOTAL,
          time: t, total: TOTAL, cut: cut, op: key, index: inIndex, cycle: cycle
        });
      }
      if (bokeh) bokeh.uniforms.focus.value = cam.position.distanceTo(tipW.lengthSq() > 0 ? tipW : target);
      if (finalPass) finalPass.uniforms.time.value = t;
      if (composer) composer.render(); else renderer.render(scene, cam);
    }

    function emitChips(dt, key) {
      var n = Math.min(4, Math.ceil(dt * 70));
      for (var k = 0; k < n; k++) {
        var s = chipS[chipCur]; chipCur = (chipCur + 1) % CHIPS;
        s.life = 7; s.rest = false;
        s.p.set(tipW.x + (Math.random() - 0.5) * 2, tipW.y + 1.5, tipW.z + (Math.random() - 0.2) * 3);
        if (key === 'drill') s.v.set(25 + Math.random() * 25, 10 + Math.random() * 20, (Math.random() - 0.5) * 40);
        else s.v.set(10 + Math.random() * 25, 25 + Math.random() * 35, 30 + Math.random() * 40);
        s.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        s.w.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
        s.s = 0.7 + Math.random() * 0.6;
      }
    }
    function updateChips(dt) {
      for (var k = 0; k < CHIPS; k++) {
        var s = chipS[k];
        if (s.life > 0) {
          s.life -= dt;
          if (!s.rest) {
            s.v.y -= 160 * dt; s.v.multiplyScalar(1 - dt * 0.6);
            s.p.addScaledVector(s.v, dt);
            s.r.x += s.w.x * dt; s.r.y += s.w.y * dt; s.r.z += s.w.z * dt;
            if (s.p.y < -56.5) { s.p.y = -56.5; s.rest = true; }
          }
          dummy.position.copy(s.p); dummy.rotation.copy(s.r);
          dummy.scale.setScalar(s.s * Math.min(1, s.life));
        } else dummy.scale.setScalar(0);
        dummy.updateMatrix(); chips.setMatrixAt(k, dummy.matrix);
      }
      chips.instanceMatrix.needsUpdate = true;
    }
    function updateCoolant(dt, on) {
      var src = nozW;
      for (var k = 0; k < DROPS; k++) {
        var d = drops[k];
        if (d.life <= 0 && on && Math.random() < 0.5) {
          d.life = 0.5 + Math.random() * 0.4; d.p.copy(src);
          d.v.copy(tipW).sub(src).normalize().multiplyScalar(170 + Math.random() * 40);
          d.v.x += (Math.random() - 0.5) * 10; d.v.z += (Math.random() - 0.5) * 10;
        }
        if (d.life > 0) {
          d.life -= dt; d.v.y -= 220 * dt; d.p.addScaledVector(d.v, dt);
          if (d.p.distanceTo(tipW) < 4) d.v.set((Math.random() - 0.5) * 70, 15 + Math.random() * 30, 30 + Math.random() * 50);
          cpos[k * 3] = d.p.x; cpos[k * 3 + 1] = d.p.y; cpos[k * 3 + 2] = d.p.z;
        } else { cpos[k * 3] = 0; cpos[k * 3 + 1] = -999; cpos[k * 3 + 2] = 0; }
      }
      cg.attributes.position.needsUpdate = true;
    }

    resize();
    if (reduce) t = TOTAL - 3;
    requestAnimationFrame(frame);
    return {
      setMaterial: function (k) {
        matKey = k; setPartColor(workMat, k); setPartColor(finMat, k);
        chipMat.color.copy(lin(MAT[k].color)); chipMat.metalness = MAT[k].metalness; chipMat.roughness = k === 'pom' ? 0.4 : 0.28;
        chips.geometry = chipGeos[k] || chipGeos.brass;
      },
      step: function (sec) { for (var k = 0; k < sec / 0.05; k++) frame(performance.now(), 0.05); },
      toggle: function () { playing = !playing; return playing; },
      restart: function () { t = 0; reset(); playing = true; },
      seek: function (opKey) { var acc = 0; for (var i = 0; i < OPS.length && OPS[i][0] !== opKey; i++) acc += OPS[i][1]; if (acc < t) reset(); t = acc; playing = true; }
    };
  }

  /* ======================================================================
     Finished parts
     ====================================================================== */
  var PARTS = {
    bushing: function () {
      var outer = [];
      for (var z = -50; z <= 0.0001; z += 0.1) outer.push([finalRadius(z), z + 50]);
      var g = new T.Group();
      g.add(new T.Mesh(revolve(outer, [[SIM.bore, 0], [SIM.bore, 50]], 160), partMaterial('brass', 'turn', 26)));
      return { obj: g, len: 50 };
    },
    piston: function () {
      var o = [[29.5, 0], [31.5, 1.5], [31.5, 5], [29.5, 5], [29.5, 9], [31.5, 9], [31.5, 13], [26, 13], [26, 25], [31.5, 25], [31.5, 29], [29.5, 29], [29.5, 33], [31.5, 33], [31.5, 38.5], [29.5, 40]];
      var i = [[10, 0], [10, 28], [15, 28], [15, 40]];
      var g = new T.Group();
      g.add(new T.Mesh(revolve(crisp(o), crisp(i), 160), partMaterial('steel', 'turn', 18)));
      return { obj: g, len: 40 };
    },
    spool: function () {
      var o = [[3, 0], [4, 1], [4, 9], [5.2, 9], [6, 9.8]];
      var lands = [[9.8, 18], [26, 34], [42, 50], [58, 66]];
      lands.forEach(function (l, k) { o.push([6, l[1]]); o.push([4.6, l[1] + 1]); var nx = lands[k + 1] ? lands[k + 1][0] : 71; o.push([4.6, nx - 1]); o.push([6, nx]); });
      o.push([6, 78]); o.push([4, 79]);
      var pts = crisp(o).concat(threadPts(4, 79, 90, 0.8, 0.49, 8)); pts.push([3.2, 90.6]);
      var g = new T.Group();
      g.add(new T.Mesh(revolve(pts, null, 128), partMaterial('steel', 'turn', 30)));
      return { obj: g, len: 90.6 };
    },
    fitting: function () {
      var g = new T.Group(), m = partMaterial('brass', 'turn', 12);
      var low = crisp([[5.2, 0], [6.5, 1.2]]).concat(threadPts(6.5, 1.2, 12, 1.337, 0.86, 8)).concat(crisp([[6.5, 12], [5.6, 12.6], [5.6, 14.6]]));
      g.add(new T.Mesh(revolve(low, [[3.5, 0], [3.5, 14.6]], 128), m));
      var hex = new T.Shape(), R = 22 / Math.sqrt(3);
      for (var k = 0; k < 6; k++) { var a = k * PI / 3 + PI / 6; if (k) hex.lineTo(Math.cos(a) * R, Math.sin(a) * R); else hex.moveTo(Math.cos(a) * R, Math.sin(a) * R); }
      hex.holes.push(circle(0, 0, 3.5));
      var h = new T.Mesh(extrude(hex, 10, 0.6), partMaterial('brass', 'mill')); h.rotation.x = -PI / 2; h.position.y = 15.2; g.add(h);
      var tp = new T.Mesh(revolve(crisp([[8, 0], [8, 3], [6.5, 3], [6.5, 5.5], [8, 5.5], [8, 11], [7, 12]]), [[3.5, 0], [3.5, 12]], 128), m);
      tp.position.y = 25.8; g.add(tp);
      return { obj: g, len: 37.8 };
    },
    flange: function () {
      var g = new T.Group(), s = new T.Shape(); s.absarc(0, 0, 40, 0, TAU, false);
      for (var k = 0; k < 6; k++) { var a = k * TAU / 6; s.holes.push(circle(Math.cos(a) * 32, Math.sin(a) * 32, 4.5)); }
      s.holes.push(circle(0, 0, 12.5));
      var disc = new T.Mesh(extrude(s, 12, 0.8), partMaterial('alu', 'mill')); disc.rotation.x = -PI / 2; disc.position.y = 14; g.add(disc);
      var hub = crisp([[25, 0], [25, 5], [21.5, 5], [21.5, 8], [25, 8], [25, 13], [24, 14]]);
      var hubIn = crisp([[12.5, 0], [12.5, 6], [15.5, 6], [15.5, 9], [12.5, 9], [12.5, 14]]);
      g.add(new T.Mesh(revolve(hub, hubIn, 128), partMaterial('alu', 'turn', 10)));
      return { obj: g, len: 26.8, upright: true };
    },
    manifold: function () {
      var g = new T.Group(), M = partMaterial('alu', 'mill');
      var base = roundedRect(70, 46, 3);
      [[-22, -10, 3.3], [22, -10, 3.3], [-22, 12, 3.3], [22, 12, 3.3], [0, 0, 6]].forEach(function (h) { base.holes.push(circle(h[0], h[1], h[2])); });
      var b = new T.Mesh(extrude(base, 28, 0.8), M); b.rotation.x = -PI / 2; g.add(b);
      var top = roundedRect(70, 46, 3);
      [[-22, -10, 5.5], [22, -10, 5.5], [-22, 12, 5.5], [22, 12, 5.5], [0, 0, 9.5]].forEach(function (h) { top.holes.push(circle(h[0], h[1], h[2])); });
      var pk = new T.Path(); pk.moveTo(-30, -19); pk.lineTo(-10, -19); pk.absarc(-10, -14, 5, -PI / 2, PI / 2, false); pk.lineTo(-30, -9); pk.absarc(-30, -14, 5, PI / 2, PI * 1.5, false);
      top.holes.push(pk);
      var tp = new T.Mesh(extrude(top, 6, 0.6), M); tp.rotation.x = -PI / 2; tp.position.y = 28.8; g.add(tp);
      var boss = new T.Mesh(revolve(crisp([[10, 0], [10, 5], [9, 6]]), [[4.5, 0], [4.5, 6]], 64), partMaterial('alu', 'turn', 4));
      boss.rotation.z = PI / 2; boss.position.set(-35.8, 17, 0); g.add(boss);
      return { obj: g, len: 35, upright: true };
    },
    series: function () {
      var src = PARTS.fitting().obj, w = new T.Group();
      for (var row = 0; row < 4; row++) for (var col = 0; col < 6; col++) {
        var c = src.clone();
        c.position.set((col - 2.5) * 34 + (row % 2) * 17, 11, (row - 1.5) * 34);
        c.rotation.set(PI / 2, 0, (row * 6 + col) * 0.7);
        w.add(c);
      }
      return { obj: w, len: 40, flat: true };
    }
  };
  function recolor(obj, mat) {
    if (!mat) return;
    obj.traverse(function (o) { if (o.isMesh && o.material && o.material.normalMap) setPartColor(o.material, mat); });
  }
  // Put a part on the ground (lathe parts lie down) and return its bounds
  function placePart(kind, mat) {
    var P = (PARTS[kind] || PARTS.bushing)();
    recolor(P.obj, mat); shadowed(P.obj);
    var holder = new T.Group(), inner = new T.Group();
    inner.add(P.obj); holder.add(inner);
    if (!P.upright && !P.flat) { P.obj.rotation.z = PI / 2; P.obj.position.x = P.len / 2; }
    var bb = new T.Box3().setFromObject(holder);
    inner.position.y = -bb.min.y + 0.05;
    inner.position.x = -(bb.min.x + bb.max.x) / 2;
    inner.position.z = -(bb.min.z + bb.max.z) / 2;
    return { holder: holder, size: bb.getSize(new T.Vector3()), P: P };
  }

  var stillCtx = null;
  function still(kind, mat, w, h) {
    if (!stillCtx) {
      var c = document.createElement('canvas'), r = makeRenderer(c, true);
      r.setClearColor(0x131a20, 1);
      stillCtx = { c: c, r: r, env: environment(r) };
    }
    stillCtx.r.setSize(w, h, false);
    var scene = new T.Scene(); scene.environment = stillCtx.env;
    studioLights(scene);
    var floor = new T.Mesh(new T.PlaneGeometry(3000, 3000), new T.ShadowMaterial({ opacity: 0.5 }));
    floor.rotation.x = -PI / 2; floor.receiveShadow = true; scene.add(floor);
    var pl = placePart(kind, mat); scene.add(pl.holder);
    pl.holder.rotation.y = pl.P.flat ? 0 : -0.6;
    var s = pl.size, d = Math.max(s.x, s.y * 1.6, s.z) * (pl.P.flat ? 1.25 : 2.6);
    var cam = new T.PerspectiveCamera(22, w / h, 1, 8000);
    cam.position.set(d * 0.3, d * (pl.P.flat ? 0.8 : 0.5), d * 0.95);
    cam.lookAt(0, s.y * 0.4, 0);
    stillCtx.r.render(scene, cam);
    var url = stillCtx.c.toDataURL('image/jpeg', 0.9);
    scene.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
    return url;
  }

  function gallery(canvas) {
    var wrap = canvas.parentElement, renderer = makeRenderer(canvas);
    var scene = new T.Scene(); scene.environment = environment(renderer);
    studioLights(scene);
    var floor = new T.Mesh(new T.PlaneGeometry(4000, 4000), new T.ShadowMaterial({ opacity: 0.5 }));
    floor.rotation.x = -PI / 2; floor.receiveShadow = true; scene.add(floor);
    var cam = new T.PerspectiveCamera(24, 1, 1, 8000);
    var current = null, size = new T.Vector3(50, 30, 30);
    var yaw = 0.6, pitch = 0.35, tYaw = yaw, tPitch = pitch, drag = false, lx = 0, ly = 0, idle = 0, intro = 0;
    function show(kind) {
      if (current) { scene.remove(current); current.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
      var pl = placePart(kind); current = pl.holder; size = pl.size; scene.add(current); intro = 0;
    }
    canvas.addEventListener('pointerdown', function (e) { drag = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', function (e) { if (!drag) return; tYaw += (e.clientX - lx) * 0.008; tPitch = clamp(tPitch + (e.clientY - ly) * 0.005, 0.05, 1.2); lx = e.clientX; ly = e.clientY; idle = 0; });
    canvas.addEventListener('pointerup', function () { drag = false; });
    canvas.addEventListener('pointercancel', function () { drag = false; });
    function resize() { var W = wrap.clientWidth, H = wrap.clientHeight; renderer.setSize(W, H, false); cam.aspect = W / H; cam.updateProjectionMatrix(); }
    window.addEventListener('resize', resize);
    var visible = true;
    if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(canvas);
    var last = performance.now();
    function frame(now) {
      requestAnimationFrame(frame);
      var dt = clamp((now - last) / 1000, 0, 0.05); last = now;
      if (!visible || document.hidden || !current) return;
      idle += dt; if (!drag && idle > 2.5) tYaw += dt * 0.3;
      intro = Math.min(1, intro + dt * 1.6);
      yaw += (tYaw - yaw) * 0.08; pitch += (tPitch - pitch) * 0.08;
      var d = Math.max(size.x, size.y * 1.5, size.z) * (cam.aspect < 1 ? 3.4 : 2.4) * (1.25 - 0.25 * ease(intro));
      cam.position.set(Math.sin(yaw) * Math.cos(pitch) * d, size.y * 0.45 + Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d);
      cam.lookAt(0, size.y * 0.45, 0);
      renderer.render(scene, cam);
    }
    resize(); requestAnimationFrame(frame);
    return { show: show };
  }

  window.SR3D = { hero: hero, gallery: gallery, still: still, program: PROGRAM, profile: finalRadius, contour: contour };
})();
