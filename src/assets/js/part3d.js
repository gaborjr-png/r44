/* ==========================================================================
   Steel Riders – real-time 3D machined parts (three.js r128)
   - SR3D.hero(canvas, hud)   : interactive CNC turning simulation
   - SR3D.still(kind, mat, w, h) : studio render of a part -> data URL
   ========================================================================== */
(function () {
  'use strict';
  if (!window.THREE) return;
  var T = window.THREE;

  /* ---------- Materials ---------- */
  var MATERIALS = {
    alu:   { color: 0xc4cad0, metalness: 1.0, roughness: 0.3 },
    brass: { color: 0xc9912f, metalness: 1.0, roughness: 0.24 },
    pom:   { color: 0x2a2d31, metalness: 0.0, roughness: 0.42 },
    steel: { color: 0x9aa3ab, metalness: 1.0, roughness: 0.34 }
  };
  function lin(hex) { return new T.Color(hex).convertSRGBToLinear(); }
  function material(key) {
    var m = MATERIALS[key] || MATERIALS.alu;
    return new T.MeshStandardMaterial({ color: lin(m.color), metalness: m.metalness, roughness: m.roughness, envMapIntensity: 1.0 });
  }

  /* ---------- Studio environment (softbox reflections) ---------- */
  function studioEnv(renderer) {
    var pm = new T.PMREMGenerator(renderer);
    var env = new T.Scene();
    env.background = new T.Color(0x0f1113);
    var panel = function (w, h, x, y, z, ry, rx, v) {
      var mesh = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(v, v, v), side: T.DoubleSide }));
      mesh.position.set(x, y, z); mesh.rotation.y = ry || 0; mesh.rotation.x = rx || 0;
      env.add(mesh);
    };
    panel(10, 1.4, 0, 7, 0, 0, Math.PI / 2, 2.6);      // top strip
    panel(1.6, 8, -8, 1, 2, Math.PI / 2, 0, 1.8);      // left softbox
    panel(1.2, 8, 8, 1, -2, -Math.PI / 2, 0, 1.1);     // right strip
    panel(12, 1.2, 0, -2, -8, 0, 0, 0.35);             // back fill
    panel(3, 0.8, 3, 4, 7, Math.PI, 0, 0.9);           // front kicker
    var tex = pm.fromScene(env, 0.03).texture;
    pm.dispose();
    return tex;
  }

  /* ---------- Part profiles (radius as a function of axial position) ----------
     Units: mm. Axis along +y, from 0 (chuck side) to L (free end). */
  var PART = {
    L: 64, stock: 15,
    // Outer finished radius at axial position y
    outer: function (y) {
      var r;
      if (y < 6) r = 9;                                 // cut-off side
      else if (y < 20) r = 12.5;                        // bearing seat
      else if (y < 22) r = 12.5 - (y - 20) * 1.1;       // chamfer down
      else if (y < 26) r = 9.2;                         // groove
      else if (y < 38) r = 13.5;                        // collar
      else if (y < 40) r = 13.5 - (y - 38) * 1.2;       // chamfer
      else if (y < 58) {                                // M20 thread
        var p = (y - 40) / 1.5;
        r = 10 - 0.55 * Math.abs(((p % 1) + 1) % 1 - 0.5) * 2;
      }
      else if (y < 62) r = 9.2;
      else r = 9.2 - (y - 62) * 0.9;                    // end chamfer
      return r;
    },
    bore: 5.2,        // through-bore radius
    boreDepth: 64
  };

  // Build LatheGeometry points for a solid of revolution with optional bore.
  // radiusAt(y) outer, boreR / boreDepth inner. Duplicated corner points keep
  // edges crisp (degenerate triangles do not affect vertex normals).
  function lathePoints(radiusAt, L, boreR, boreDepth, samples) {
    var pts = [], i, y, r;
    var bd = Math.min(boreDepth, L);
    var start = boreR > 0 && bd >= L ? boreR : 0.0001;
    // bottom face (y = 0)
    pts.push(new T.Vector2(start, 0));
    pts.push(new T.Vector2(radiusAt(0), 0));
    pts.push(new T.Vector2(radiusAt(0), 0));
    for (i = 0; i <= samples; i++) {
      y = (i / samples) * L;
      r = radiusAt(y);
      pts.push(new T.Vector2(r, y));
    }
    pts.push(new T.Vector2(radiusAt(L), L));
    // top face
    if (boreR > 0 && bd > 0) {
      pts.push(new T.Vector2(boreR, L));
      pts.push(new T.Vector2(boreR, L));
      pts.push(new T.Vector2(boreR, L - bd));
      if (bd < L) {
        pts.push(new T.Vector2(boreR, L - bd));
        // drill point (118°)
        pts.push(new T.Vector2(0.0001, L - bd - boreR * 0.6));
      }
    } else {
      pts.push(new T.Vector2(0.0001, L));
    }
    // LatheGeometry wants points ordered; the list above traces the section.
    return pts;
  }

  function turnedGeometry(radiusAt, L, boreR, boreDepth, segs) {
    var g = new T.LatheGeometry(lathePoints(radiusAt, L, boreR, boreDepth, 220), segs || 96);
    g.computeVertexNormals();
    return g;
  }

  /* Milled aluminium block with through holes and a counterbored pocket */
  function milledGeometry() {
    var w = 80, h = 56, rr = 4;
    var s = new T.Shape();
    s.moveTo(-w / 2 + rr, -h / 2);
    s.lineTo(w / 2 - rr, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + rr);
    s.lineTo(w / 2, h / 2 - rr); s.quadraticCurveTo(w / 2, h / 2, w / 2 - rr, h / 2);
    s.lineTo(-w / 2 + rr, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - rr);
    s.lineTo(-w / 2, -h / 2 + rr); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + rr, -h / 2);
    var holes = [[-30, -18, 3.4], [30, -18, 3.4], [-30, 18, 3.4], [30, 18, 3.4], [0, 0, 11]];
    holes.forEach(function (c) {
      var p = new T.Path(); p.absarc(c[0], c[1], c[2], 0, Math.PI * 2, true); s.holes.push(p);
    });
    // slot
    var sl = new T.Path();
    sl.moveTo(-18, 14); sl.lineTo(-6, 14); sl.absarc(-6, 18, 4, -Math.PI / 2, Math.PI / 2, false);
    sl.lineTo(-18, 22); sl.absarc(-18, 18, 4, Math.PI / 2, Math.PI * 1.5, false);
    s.holes.push(sl);
    var g = new T.ExtrudeGeometry(s, { depth: 18, bevelEnabled: true, bevelThickness: 0.8, bevelSize: 0.8, bevelSegments: 2, curveSegments: 48 });
    g.center();
    return g;
  }

  /* Small hex-collar brass fitting (for series still) */
  function fittingRadius(y) {
    if (y < 8) return 5 - 0.3 * Math.abs((((y / 1) % 1) + 1) % 1 - 0.5) * 2;
    if (y < 9) return 5 + (y - 8) * 2.5;
    if (y < 15) return 7.6;
    if (y < 16) return 7.6 - (y - 15) * 2;
    if (y < 26) return 4.2;
    return 4.2 - (y - 26) * 1.2;
  }

  /* ---------- Renderer helpers ---------- */
  function makeRenderer(canvas, w, h) {
    var r = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, preserveDrawingBuffer: !!canvas.__still });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setSize(w, h, false);
    r.outputEncoding = T.sRGBEncoding;
    r.toneMapping = T.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.92;
    r.physicallyCorrectLights = true;
    return r;
  }

  function addLights(scene) {
    var key = new T.DirectionalLight(0xffffff, 1.1); key.position.set(-40, 60, 80); scene.add(key);
    var rim = new T.DirectionalLight(0xc9d6e2, 0.8); rim.position.set(60, -20, -60); scene.add(rim);
    scene.add(new T.AmbientLight(0xffffff, 0.05));
  }

  /* ======================================================================
     Still renders
     ====================================================================== */
  var stillCtx = null;
  function stillRenderer() {
    if (stillCtx) return stillCtx;
    var c = document.createElement('canvas'); c.__still = true;
    var r = makeRenderer(c, 1200, 900);
    r.setPixelRatio(1);
    r.setClearColor(0x161d24, 1);
    stillCtx = { canvas: c, renderer: r, env: studioEnv(r) };
    return stillCtx;
  }

  function still(kind, mat, w, h) {
    var ctx = stillRenderer();
    ctx.renderer.setSize(w, h, false);
    var scene = new T.Scene();
    scene.environment = ctx.env;
    addLights(scene);
    var cam = new T.PerspectiveCamera(24, w / h, 1, 2000);
    var group = new T.Group(); scene.add(group);
    var m = material(mat);

    if (kind === 'milled') {
      var blk = new T.Mesh(milledGeometry(), m);
      blk.rotation.set(-0.95, 0, 0.5);
      group.add(blk);
      cam.position.set(0, 20, 210);
    } else if (kind === 'series') {
      var fg = turnedGeometry(fittingRadius, 28, 2.4, 28, 64);
      var inst = new T.InstancedMesh(fg, m, 42);
      var d = new T.Object3D(), k = 0;
      for (var row = 0; row < 6; row++) {
        for (var col = 0; col < 7; col++) {
          d.position.set((col - 3) * 26 + (row % 2) * 13, 0, (row - 3) * 26);
          d.rotation.set(Math.PI / 2, 0, 0.25 + (k % 5) * 0.4);
          d.updateMatrix(); inst.setMatrixAt(k++, d.matrix);
        }
      }
      group.add(inst);
      group.rotation.x = 0.7;
      cam.position.set(0, 30, 320);
    } else if (kind === 'shaft') {
      var sg = turnedGeometry(PART.outer, PART.L, 0, 0, 128);
      var sh = new T.Mesh(sg, m);
      sh.position.y = -PART.L / 2;
      group.add(sh);
      group.rotation.set(0.35, 0.3, -Math.PI / 2 + 0.22);
      cam.position.set(0, 0, 175);
    } else { // 'turned' hollow part, three-quarter view
      var tg = turnedGeometry(PART.outer, PART.L, PART.bore, PART.boreDepth, 128);
      var tp = new T.Mesh(tg, m);
      tp.position.y = -PART.L / 2;
      group.add(tp);
      group.rotation.set(0.55, 0.2, -Math.PI / 2 + 0.55);
      cam.position.set(0, 0, 165);
    }
    cam.lookAt(0, 0, 0);
    ctx.renderer.render(scene, cam);
    var url = ctx.canvas.toDataURL('image/jpeg', 0.9);
    scene.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
    m.dispose();
    return url;
  }

  /* ======================================================================
     Hero: CNC turning simulation
     ====================================================================== */
  var OPS = [
    // [key, duration seconds]
    ['face', 1.2], ['rough', 5.2], ['drill', 2.4], ['finish', 3.4],
    ['groove', 1.4], ['thread', 2.6], ['cutoff', 1.6], ['inspect', 6.0]
  ];
  var OPS_TOTAL = OPS.reduce(function (a, o) { return a + o[1]; }, 0);

  function hero(canvas, hud) {
    var wrap = canvas.parentElement;
    var W = wrap.clientWidth, H = wrap.clientHeight;
    var renderer = makeRenderer(canvas, W, H);
    var scene = new T.Scene();
    scene.environment = studioEnv(renderer);
    addLights(scene);
    var cam = new T.PerspectiveCamera(26, W / H, 1, 3000);
    cam.position.set(0, 8, 190);
    cam.lookAt(0, 4, 0);

    // World: spindle axis along X. Part group rotates around X (spindle).
    var rig = new T.Group(); scene.add(rig);          // orbit (user drag)
    rig.position.x = 8;
    var spindle = new T.Group(); rig.add(spindle);
    spindle.rotation.order = 'ZYX';                    // spin about lathe axis first
    spindle.rotation.z = -Math.PI / 2;                 // lathe y-axis -> world +x
    spindle.position.x = -PART.L / 2 + 6;

    var matKey = 'brass';
    var partMat = material(matKey);
    var partMesh = new T.Mesh(new T.BufferGeometry(), partMat);
    spindle.add(partMesh);

    // Chuck jaws (stylised)
    var chuckMat = new T.MeshStandardMaterial({ color: lin(0x3a4046), metalness: 0.9, roughness: 0.45 });
    var chuck = new T.Mesh(new T.CylinderGeometry(30, 30, 16, 64), chuckMat);
    chuck.position.y = -9; spindle.add(chuck);
    for (var j = 0; j < 3; j++) {
      var jaw = new T.Mesh(new T.BoxGeometry(7, 10, 12), chuckMat);
      var a = j * Math.PI * 2 / 3;
      jaw.position.set(Math.cos(a) * 18.6, 2, Math.sin(a) * 18.6);
      jaw.rotation.y = -a;
      spindle.add(jaw);
    }

    // Tool: holder + insert
    var tool = new T.Group();
    var holder = new T.Mesh(new T.BoxGeometry(5, 34, 6), new T.MeshStandardMaterial({ color: lin(0x23282d), metalness: 0.7, roughness: 0.45 }));
    holder.position.y = 19; holder.rotation.z = 0.12;
    var insertGeo = new T.CylinderGeometry(0, 4.5, 3, 3); // triangular insert
    var insert = new T.Mesh(insertGeo, new T.MeshStandardMaterial({ color: 0xc9a45c, metalness: 0.9, roughness: 0.3 }));
    insert.rotation.x = Math.PI / 2;
    insert.position.y = 1.5;
    tool.add(holder); tool.add(insert);
    rig.add(tool);

    // Drill (for bore op)
    var drill = new T.Mesh(new T.CylinderGeometry(PART.bore, PART.bore, 70, 24), new T.MeshStandardMaterial({ color: 0x8e979f, metalness: 1, roughness: 0.3 }));
    drill.rotation.z = Math.PI / 2;
    drill.visible = false;
    rig.add(drill);

    // Chips (instanced particles)
    var CHIPS = 160;
    var chipGeo = new T.BoxGeometry(0.3, 1.6, 0.6);
    var chipMat = material(matKey);
    var chips = new T.InstancedMesh(chipGeo, chipMat, CHIPS);
    chips.instanceMatrix.setUsage(T.DynamicDrawUsage);
    rig.add(chips);
    var chipState = [];
    for (var c = 0; c < CHIPS; c++) chipState.push({ life: 0, p: new T.Vector3(), v: new T.Vector3(), r: new T.Euler(), s: 1 });
    var dummy = new T.Object3D();
    var chipCursor = 0;

    /* ----- Machining state ----- */
    var N = 180;                           // axial samples
    var radius = new Float32Array(N + 1);  // current outer radius at sample i
    var boreDepth = 0;
    var cutLen = PART.L;                   // remaining length on the chuck side
    function resetStock() {
      for (var i = 0; i <= N; i++) radius[i] = PART.stock;
      boreDepth = 0;
    }
    function rAt(y) {
      var f = Math.max(0, Math.min(N, (y / PART.L) * N));
      var i = Math.floor(f), t = f - i;
      return i >= N ? radius[N] : radius[i] * (1 - t) + radius[i + 1] * t;
    }
    function rebuild() {
      var g = turnedGeometry(rAt, PART.L, PART.bore, boreDepth, 96);
      partMesh.geometry.dispose();
      partMesh.geometry = g;
    }

    /* ----- Timeline ----- */
    var clock = 0, playing = true, lastOp = '';
    var ROUGH_PASSES = 3;
    function opAt(t) {
      var acc = 0;
      for (var i = 0; i < OPS.length; i++) {
        if (t < acc + OPS[i][1]) return { key: OPS[i][0], p: (t - acc) / OPS[i][1], i: i };
        acc += OPS[i][1];
      }
      return { key: 'inspect', p: 1, i: OPS.length - 1 };
    }

    var toolPos = new T.Vector3(), cutting = false;
    // Map lathe (y along axis, r radial) to rig coordinates (x along axis, y up)
    function lathe2rig(y, r) { return new T.Vector3(spindle.position.x + y, r, 0); }

    function simulate(op) {
      var i, y, target;
      cutting = false;
      drill.visible = false;
      switch (op.key) {
        case 'face': {
          // face the free end slightly: trim last 1 mm down to stock
          y = PART.L;
          target = PART.stock * (1 - op.p);
          toolPos.copy(lathe2rig(y + 0.5, Math.max(target, 0.5)));
          cutting = op.p < 0.98;
          break;
        }
        case 'rough': {
          var pass = Math.min(ROUGH_PASSES - 1, Math.floor(op.p * ROUGH_PASSES));
          var pp = op.p * ROUGH_PASSES - pass;
          var level = PART.stock - (pass + 1) * ((PART.stock - 13.8) / ROUGH_PASSES + 0.35);
          y = PART.L - pp * (PART.L - 4);
          for (i = 0; i <= N; i++) {
            var yi = (i / N) * PART.L;
            if (yi >= y) radius[i] = Math.min(radius[i], Math.max(PART.outer(yi) + 0.6, level));
          }
          toolPos.copy(lathe2rig(y, Math.max(PART.outer(y) + 0.6, level)));
          cutting = true;
          break;
        }
        case 'drill': {
          boreDepth = op.p < 0.85 ? (op.p / 0.85) * PART.boreDepth : PART.boreDepth;
          drill.visible = op.p < 0.95;
          var dx = spindle.position.x + PART.L - boreDepth + 35 + (op.p >= 0.85 ? (op.p - 0.85) * 400 : 0);
          drill.position.set(dx, 0, 0);
          toolPos.copy(lathe2rig(PART.L + 30, 30));
          cutting = op.p < 0.85;
          break;
        }
        case 'finish': {
          y = PART.L - op.p * (PART.L - 4);
          for (i = 0; i <= N; i++) {
            var yf = (i / N) * PART.L;
            if (yf >= y && (yf < 22 || yf > 26) && (yf < 40 || yf > 58)) radius[i] = PART.outer(yf);
            else if (yf >= y && yf >= 40 && yf <= 58) radius[i] = Math.min(radius[i], 10);
            else if (yf >= y) radius[i] = Math.min(radius[i], 12.5);
          }
          toolPos.copy(lathe2rig(y, rAt(y)));
          cutting = true;
          break;
        }
        case 'groove': {
          var depth = 12.5 - (12.5 - 9.2) * Math.min(1, op.p * 1.3);
          for (i = 0; i <= N; i++) {
            var yg = (i / N) * PART.L;
            if (yg >= 22 && yg <= 26) radius[i] = Math.max(PART.outer(yg), Math.min(radius[i], depth));
          }
          toolPos.copy(lathe2rig(24, depth));
          cutting = op.p < 0.8;
          break;
        }
        case 'thread': {
          var tp = Math.min(1, op.p * 1.1);
          y = 58 - tp * 18;
          for (i = 0; i <= N; i++) {
            var yt = (i / N) * PART.L;
            if (yt >= 40 && yt <= 58 && yt >= y) radius[i] = PART.outer(yt);
          }
          toolPos.copy(lathe2rig(y, rAt(y)));
          cutting = tp < 1;
          break;
        }
        case 'cutoff': {
          var co = Math.min(1, op.p * 1.15);
          var cr = 9 - co * 9;
          for (i = 0; i <= N; i++) {
            var yc = (i / N) * PART.L;
            if (yc <= 2.5) radius[i] = Math.max(PART.bore + 0.01, Math.min(radius[i], Math.max(cr, 0)));
          }
          toolPos.copy(lathe2rig(1.2, Math.max(cr, PART.bore)));
          cutting = co < 1;
          break;
        }
        default: {
          toolPos.copy(lathe2rig(PART.L + 30, 32));
        }
      }
    }

    function emitChip(dt) {
      if (!cutting) return;
      var n = Math.min(6, Math.ceil(dt * 90));
      for (var k = 0; k < n; k++) {
        var s = chipState[chipCursor];
        chipCursor = (chipCursor + 1) % CHIPS;
        s.life = 0.9 + Math.random() * 0.6;
        s.p.copy(toolPos).add(new T.Vector3(0, 0.5, 2));
        s.v.set((Math.random() - 0.3) * 30, 18 + Math.random() * 30, 20 + Math.random() * 30);
        s.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        s.s = 0.6 + Math.random() * 0.9;
      }
    }
    function updateChips(dt) {
      for (var k = 0; k < CHIPS; k++) {
        var s = chipState[k];
        if (s.life > 0) {
          s.life -= dt;
          s.v.y -= 120 * dt;
          s.p.addScaledVector(s.v, dt);
          s.r.x += dt * 12; s.r.y += dt * 9;
          dummy.position.copy(s.p);
          dummy.rotation.copy(s.r);
          dummy.scale.setScalar(s.life > 0 ? s.s : 0);
        } else {
          dummy.scale.setScalar(0);
        }
        dummy.updateMatrix();
        chips.setMatrixAt(k, dummy.matrix);
      }
      chips.instanceMatrix.needsUpdate = true;
    }

    /* ----- Interaction: drag to orbit ----- */
    var rotY = -0.45, rotX = 0.28, tRotY = rotY, tRotX = rotX, dragging = false, lx = 0, ly = 0, idle = 0;
    canvas.addEventListener('pointerdown', function (e) { dragging = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      tRotY += (e.clientX - lx) * 0.008; tRotX += (e.clientY - ly) * 0.005;
      tRotX = Math.max(-0.6, Math.min(0.9, tRotX));
      lx = e.clientX; ly = e.clientY; idle = 0;
    });
    canvas.addEventListener('pointerup', function () { dragging = false; });
    canvas.addEventListener('pointercancel', function () { dragging = false; });

    /* ----- Resize / visibility ----- */
    function resize() {
      W = wrap.clientWidth; H = wrap.clientHeight;
      renderer.setSize(W, H, false);
      cam.aspect = W / H;
      cam.position.z = W / H < 1 ? 250 : 190;
      cam.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    var visible = true;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }, { threshold: 0 }).observe(canvas);
    }

    /* ----- Main loop ----- */
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var spin = 0, last = performance.now(), partFree = 0, builtFinal = false;
    resetStock();

    function frame(now) {
      requestAnimationFrame(frame);
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!visible || document.hidden) return;

      if (playing && !reduce) clock += dt;
      if (clock >= OPS_TOTAL) { clock = 0; resetStock(); partFree = 0; spindle.position.set(-PART.L / 2 + 6, 0, 0); }
      var op = opAt(clock);
      if (op.i === 0 && op.p < 0.02) resetStock();
      simulate(op);
      if (op.key !== 'inspect' || !builtFinal) { rebuild(); builtFinal = op.key === 'inspect'; }

      // Spindle speed: fast while machining, slow showcase during inspection
      var rpm = op.key === 'inspect' ? 0.6 : (op.key === 'drill' ? 9 : 14);
      spin += dt * rpm;
      spindle.rotation.y = spin;   // around lathe axis (local y)

      // after cut-off the part drops free and floats to the centre
      if (op.key === 'inspect') {
        partFree = Math.min(1, partFree + dt * 0.8);
        var e = 1 - Math.pow(1 - partFree, 3);
        spindle.position.x = (-PART.L / 2 + 6) - e * 6;
        chuck.visible = e < 0.3;
      } else {
        chuck.visible = true;
      }

      // tool follows target smoothly
      tool.position.lerp(toolPos, 0.35);
      tool.visible = op.key !== 'inspect' && op.key !== 'drill';

      emitChip(dt);
      updateChips(dt);

      idle += dt;
      if (!dragging && idle > 3) tRotY += dt * 0.08;
      rotY += (tRotY - rotY) * 0.08; rotX += (tRotX - rotX) * 0.08;
      rig.rotation.set(rotX, rotY, 0);

      if (hud && op.key !== lastOp) { lastOp = op.key; hud(op.key, op.i, OPS.length); }
      if (hud && hud.progress) hud.progress(clock / OPS_TOTAL);

      renderer.render(scene, cam);
    }
    resize();
    if (reduce) { clock = OPS_TOTAL - 0.01; }
    requestAnimationFrame(frame);

    return {
      setMaterial: function (key) {
        matKey = key;
        var m = MATERIALS[key];
        [partMat, chipMat].forEach(function (mm) { mm.color.copy(lin(m.color)); mm.metalness = m.metalness; mm.roughness = m.roughness; mm.needsUpdate = true; });
      },
      restart: function () { clock = 0; resetStock(); partFree = 0; playing = true; },
      toggle: function () { playing = !playing; return playing; }
    };
  }

  window.SR3D = { hero: hero, still: still, ops: OPS.map(function (o) { return o[0]; }) };
})();
