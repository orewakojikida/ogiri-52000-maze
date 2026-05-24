import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const LOOP_DURATION = 30;
const IMPACT_TIME = 14;
const START_X = 42;
const LANE_COUNT = 15;
const LANE_SPACING = 4.2;
const TEXT_TARGET_UNITS = 57200;
const PART_NAMES = [
  "body",
  "chest",
  "neck",
  "head",
  "mane",
  "frontLegNear",
  "frontLegFar",
  "rearLegNear",
  "rearLegFar",
  "tail",
  "horn",
  "trunk",
  "earNear",
  "earFar",
  "armNear",
  "armFar"
];

const app = document.querySelector("#app");
const urlParams = new URLSearchParams(window.location.search);
const debugTimeParam = urlParams.get("debugTime");
const shouldFreezeTime = urlParams.get("freeze") === "1";
let forcedCycleTime =
  shouldFreezeTime && Number.isFinite(Number(debugTimeParam)) ? wrapTime(Number(debugTimeParam), LOOP_DURATION) : null;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8e9ef);

const initialAspect = window.innerWidth / window.innerHeight;
const camera = new THREE.PerspectiveCamera(initialAspect < 0.75 ? 64 : 56, initialAspect, 0.1, 2400);
camera.position.set(0, initialAspect < 0.75 ? 62 : 38, initialAspect < 0.75 ? 166 : 104);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2.2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxDistance = 850;
controls.minDistance = 10;
controls.maxPolarAngle = Math.PI * 0.49;
controls.update();

const hemiLight = new THREE.HemisphereLight(0xf6fbff, 0x7e9468, 2.2);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
keyLight.position.set(-30, 52, 26);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xb7dcff, 1.1);
rimLight.position.set(42, 20, -34);
scene.add(rimLight);

const silhouetteMaterial = new THREE.MeshStandardMaterial({
  color: 0x030303,
  roughness: 0.88,
  metalness: 0,
  transparent: true,
  opacity: 1,
  flatShading: true
});

const geometries = {
  oval: new THREE.IcosahedronGeometry(1, 2),
  limb: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cone: new THREE.ConeGeometry(0.5, 1, 8),
  shard: new THREE.IcosahedronGeometry(1, 1)
};

class TextPatchRegistry {
  constructor(expectedUnitCount) {
    this.expectedUnitCount = expectedUnitCount;
    this.groundTiles = [];
    this.animalSurfacePatches = [];
    this.assignments = new Map();
    this.usedTextIds = new Set();
  }

  registerGroundTile(record) {
    const tile = {
      kind: "groundTile",
      assignedTextId: null,
      ...record
    };
    this.groundTiles.push(tile);
    return tile;
  }

  registerAnimalSurfacePatch(record) {
    const patch = {
      kind: "animalSurfacePatch",
      assignedTextId: null,
      ...record
    };
    this.animalSurfacePatches.push(patch);
    return patch;
  }

  get capacity() {
    return this.groundTiles.length + this.animalSurfacePatches.length;
  }

  getPatchSequence() {
    return [...this.groundTiles, ...this.animalSurfacePatches];
  }

  assignUniqueTextUnits(textUnits) {
    if (textUnits.length > this.capacity) {
      throw new Error(`Not enough patch slots: ${textUnits.length} text units for ${this.capacity} slots.`);
    }

    const seen = new Set();
    const patches = this.getPatchSequence();

    textUnits.forEach((unit, index) => {
      const textId = unit.id ?? `text-${index}`;
      if (seen.has(textId)) {
        throw new Error(`Duplicate text id: ${textId}`);
      }
      seen.add(textId);

      const patch = patches[index];
      patch.assignedTextId = textId;
      this.assignments.set(patch.id, {
        patch,
        textUnit: unit
      });
    });

    this.usedTextIds = seen;
    return this.assignments;
  }

  clearAssignments() {
    this.assignments.clear();
    this.usedTextIds.clear();
    this.getPatchSequence().forEach((patch) => {
      patch.assignedTextId = null;
    });
  }
}

class GroundTileManager {
  constructor(sceneRef, registry, options = {}) {
    this.scene = sceneRef;
    this.registry = registry;
    this.width = options.width ?? 1800;
    this.depth = options.depth ?? 1800;
    this.columns = options.columns ?? 120;
    this.rows = options.rows ?? 120;
    this.createGround();
    this.registerTiles();
  }

  createGround() {
    const groundGeometry = new THREE.PlaneGeometry(this.width, this.depth, 32, 24);
    const positions = groundGeometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const ripple = Math.sin(x * 0.055) * 0.12 + Math.cos(y * 0.075) * 0.1;
      positions.setZ(i, ripple);
    }
    positions.needsUpdate = true;
    groundGeometry.computeVertexNormals();

    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0xb7c99d,
      roughness: 0.95,
      metalness: 0,
      flatShading: false
    });

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(this.width, this.columns, 0x8da17a, 0xa7b992);
    grid.position.y = 0.012;
    grid.material.transparent = true;
    grid.material.opacity = 0.13;
    this.scene.add(grid);

    this.createTufts();
  }

  createTufts() {
    const tuftGeometry = new THREE.ConeGeometry(0.045, 0.8, 3);
    const tuftMaterial = new THREE.MeshBasicMaterial({
      color: 0x789466,
      transparent: true,
      opacity: 0.55
    });
    const count = 2200;
    const tufts = new THREE.InstancedMesh(tuftGeometry, tuftMaterial, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i += 1) {
      const x = rand(-this.width * 0.48, this.width * 0.48);
      const z = rand(-this.depth * 0.46, this.depth * 0.46);
      const avoidTrack = Math.abs(z) < LANE_COUNT * LANE_SPACING * 0.42 && Math.abs(x) < 84;
      const scale = avoidTrack ? rand(0.35, 0.72) : rand(0.55, 1.35);
      dummy.position.set(x, 0.2, z);
      dummy.rotation.set(0, rand(0, Math.PI * 2), rand(-0.18, 0.18));
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      tufts.setMatrixAt(i, dummy.matrix);
    }

    this.scene.add(tufts);
  }

  registerTiles() {
    const tileWidth = this.width / this.columns;
    const tileDepth = this.depth / this.rows;
    let index = 0;

    for (let row = 0; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const minX = -this.width / 2 + column * tileWidth;
        const minZ = -this.depth / 2 + row * tileDepth;
        this.registry.registerGroundTile({
          id: `ground-${index}`,
          column,
          row,
          bounds: {
            minX,
            maxX: minX + tileWidth,
            minZ,
            maxZ: minZ + tileDepth
          }
        });
        index += 1;
      }
    }
  }
}

class CreatureSilhouette {
  constructor({ id, side, laneIndex, z, registry }) {
    this.id = id;
    this.side = side;
    this.laneIndex = laneIndex;
    this.morphOffset = fract(laneIndex * 0.173 + (side > 0 ? 0.41 : 0.08));
    this.startOffset = rand(-4.2, 4.2);
    this.scale = rand(1.05, 1.38);
    this.group = new THREE.Group();
    this.group.rotation.y = side > 0 ? Math.PI : 0;
    this.baseZ = z + rand(-0.34, 0.34);
    this.group.position.z = this.baseZ;
    this.parts = this.createParts();
    this.createPatchAnchors(registry);
  }

  createParts() {
    const parts = {};
    const partGeometry = {
      body: geometries.oval,
      chest: geometries.oval,
      neck: geometries.limb,
      head: geometries.oval,
      mane: geometries.oval,
      frontLegNear: geometries.limb,
      frontLegFar: geometries.limb,
      rearLegNear: geometries.limb,
      rearLegFar: geometries.limb,
      tail: geometries.limb,
      horn: geometries.cone,
      trunk: geometries.limb,
      earNear: geometries.oval,
      earFar: geometries.oval,
      armNear: geometries.limb,
      armFar: geometries.limb
    };

    PART_NAMES.forEach((name) => {
      const mesh = new THREE.Mesh(partGeometry[name], silhouetteMaterial);
      mesh.name = `${this.id}-${name}`;
      mesh.matrixAutoUpdate = true;
      this.group.add(mesh);
      parts[name] = mesh;
    });

    return parts;
  }

  createPatchAnchors(registry) {
    const anchors = [
      ["body", [-0.6, 0.35, 0.62]],
      ["body", [0.2, 0.45, 0.64]],
      ["body", [0.75, 0.12, 0.62]],
      ["chest", [0.18, 0.2, 0.52]],
      ["head", [0.12, 0.12, 0.44]],
      ["neck", [0, 0.38, 0.22]],
      ["frontLegNear", [0, 0.2, 0.13]],
      ["rearLegNear", [0, 0.2, 0.13]],
      ["earNear", [0, 0.05, 0.16]]
    ];

    anchors.forEach(([partName, localPosition], index) => {
      const anchor = new THREE.Object3D();
      anchor.position.fromArray(localPosition);
      this.parts[partName].add(anchor);
      registry.registerAnimalSurfacePatch({
        id: `${this.id}-surface-${index}`,
        creatureId: this.id,
        partName,
        anchor,
        localPosition
      });
    });
  }

  addTo(sceneRef) {
    sceneRef.add(this.group);
  }

  update(cycleTime) {
    const approach = clamp(cycleTime / IMPACT_TIME, 0, 1);
    const travel = easeOutSine(approach);
    const squeeze = 1 - smoothstep(0.6, 1, approach);
    const x = this.side * (START_X * (1 - travel) + this.startOffset * squeeze);
    const laneSway = Math.sin(cycleTime * 1.65 + this.laneIndex * 0.9) * 0.28 * (1 - approach);
    this.group.position.x = x;
    this.group.position.z = this.baseZ + laneSway;
    this.group.scale.setScalar(this.scale * (1 + Math.sin(cycleTime * 8.0 + this.laneIndex) * 0.015));

    const humanBlend = smoothstep(IMPACT_TIME - 3.6, IMPACT_TIME - 0.45, cycleTime);
    const animalShape = this.getAnimalShape(cycleTime);
    const finalShape = mixShape(animalShape, SHAPES.human, humanBlend);
    this.applyShape(finalShape, cycleTime, humanBlend);
  }

  getAnimalShape(cycleTime) {
    const species = ["lion", "giraffe", "rhino", "elephant"];
    const phase = fract(cycleTime / 3.2 + this.morphOffset) * species.length;
    const index = Math.floor(phase);
    const nextIndex = (index + 1) % species.length;
    const blend = smootherstep(fract(phase));
    return mixShape(SHAPES[species[index]], SHAPES[species[nextIndex]], blend);
  }

  applyShape(shape, cycleTime, humanBlend) {
    PART_NAMES.forEach((name) => {
      const part = this.parts[name];
      const target = shape[name];
      part.position.fromArray(target.position);
      part.scale.fromArray(target.scale);
      part.rotation.set(target.rotation[0], target.rotation[1], target.rotation[2]);
      part.visible = target.scale[0] + target.scale[1] + target.scale[2] > 0.03;
    });

    const run = cycleTime * (humanBlend > 0.7 ? 9.2 : 7.5) + this.laneIndex * 0.53;
    this.applyGait(run, humanBlend);
  }

  applyGait(runPhase, humanBlend) {
    const bodyBob = Math.abs(Math.sin(runPhase)) * (humanBlend > 0.65 ? 0.08 : 0.05);
    this.parts.body.position.y += bodyBob;
    this.parts.chest.position.y += bodyBob * 0.8;
    this.parts.head.position.y += bodyBob * 0.45;

    const animalSwing = 0.28 * (1 - humanBlend);
    const humanSwing = 0.52 * humanBlend;
    const swing = animalSwing + humanSwing;

    this.parts.frontLegNear.rotation.z += Math.sin(runPhase) * swing;
    this.parts.rearLegNear.rotation.z += Math.sin(runPhase + Math.PI) * swing;
    this.parts.frontLegFar.rotation.z += Math.sin(runPhase + Math.PI * 0.82) * swing * 0.85;
    this.parts.rearLegFar.rotation.z += Math.sin(runPhase + Math.PI * 1.82) * swing * 0.85;

    this.parts.armNear.rotation.z += Math.sin(runPhase + Math.PI) * humanSwing * 1.15;
    this.parts.armFar.rotation.z += Math.sin(runPhase) * humanSwing * 1.15;
    this.parts.tail.rotation.z += Math.sin(runPhase * 0.5) * 0.18 * (1 - humanBlend);
    this.parts.trunk.rotation.z += Math.sin(runPhase * 0.35 + this.laneIndex) * 0.08 * (1 - humanBlend);
  }
}

class InkBurstSystem {
  constructor(sceneRef, lanes) {
    this.scene = sceneRef;
    this.lanes = lanes;
    this.particleCount = 2600;
    this.blobCount = 180;
    this.duration = 8.3;
    this.particleData = this.createParticleData();
    this.createPoints();
    this.createBlobs();
    this.createCrestLines();
  }

  createParticleData() {
    return Array.from({ length: this.particleCount }, (_, index) => {
      const lane = this.lanes[index % this.lanes.length];
      const side = index % 2 === 0 ? -1 : 1;
      const speed = rand(8, 30) * (index % 7 === 0 ? 1.45 : 1);
      return {
        side,
        origin: new THREE.Vector3(rand(-0.18, 0.18), rand(0.55, 3.4), lane + rand(-1.25, 1.25)),
        velocity: new THREE.Vector3(side * speed, rand(7, 22), rand(-9, 9)),
        swirl: rand(0, Math.PI * 2),
        drag: rand(0.58, 1.08),
        size: rand(0.08, 0.44)
      };
    });
  }

  createPoints() {
    const positions = new Float32Array(this.particleCount * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));

    const material = new THREE.PointsMaterial({
      color: 0x010101,
      size: 0.42,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  createBlobs() {
    const material = new THREE.MeshStandardMaterial({
      color: 0x010101,
      roughness: 0.9,
      transparent: true,
      opacity: 0,
      flatShading: true,
      fog: false,
      depthWrite: false
    });

    this.blobs = new THREE.InstancedMesh(geometries.shard, material, this.blobCount);
    this.blobs.frustumCulled = false;
    this.blobDummy = new THREE.Object3D();
    this.scene.add(this.blobs);
  }

  createCrestLines() {
    this.crestSegmentCount = 220;
    const positions = new Float32Array(this.crestSegmentCount * 6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));

    const material = new THREE.LineBasicMaterial({
      color: 0x020202,
      transparent: true,
      opacity: 0,
      fog: false
    });

    this.crestLines = new THREE.LineSegments(geometry, material);
    this.crestLines.frustumCulled = false;
    this.scene.add(this.crestLines);
  }

  update(cycleTime) {
    const localTime = cycleTime - (IMPACT_TIME - 0.02);
    const active = localTime >= 0 && localTime <= this.duration;
    this.points.visible = active;
    this.blobs.visible = active;
    this.crestLines.visible = active;

    if (!active) {
      this.points.material.opacity = 0;
      this.blobs.material.opacity = 0;
      this.crestLines.material.opacity = 0;
      return;
    }

    const p = clamp(localTime / this.duration, 0, 1);
    const impulse = smoothstep(0, 0.12, p);
    const fade = 1 - smoothstep(0.62, 1, p);
    const force = impulse * fade;

    this.points.material.opacity = 0.88 * force;
    this.points.material.size = 0.36 + 0.26 * (1 - p);
    this.blobs.material.opacity = 0.72 * force;
    this.crestLines.material.opacity = 0.42 * force;

    this.updateParticles(p);
    this.updateBlobs(p, force);
    this.updateCrest(p, force);
  }

  updateParticles(p) {
    const positions = this.points.geometry.attributes.position.array;

    this.particleData.forEach((data, index) => {
      const delayedP = clamp((p - (index % 17) * 0.0025) / (1 - (index % 17) * 0.0025), 0, 1);
      const wave = Math.sin(delayedP * 34 + data.swirl) * (1 - delayedP) * 1.7;
      const rebound = Math.sin(Math.min(delayedP * Math.PI * 1.3, Math.PI));
      const horizontal = delayedP * data.drag + 0.18 * rebound;
      const x = data.origin.x + data.velocity.x * horizontal;
      const y = Math.max(
        0.08,
        data.origin.y + data.velocity.y * delayedP - 24 * delayedP * delayedP + Math.abs(wave) * 0.35
      );
      const z = data.origin.z + data.velocity.z * delayedP + wave;

      const arrayIndex = index * 3;
      positions[arrayIndex] = x;
      positions[arrayIndex + 1] = y;
      positions[arrayIndex + 2] = z;
    });

    this.points.geometry.attributes.position.needsUpdate = true;
  }

  updateBlobs(p, force) {
    const stride = Math.floor(this.particleData.length / this.blobCount);

    for (let i = 0; i < this.blobCount; i += 1) {
      const data = this.particleData[i * stride];
      const delayedP = clamp((p - (i % 11) * 0.006) / 0.95, 0, 1);
      const x = data.origin.x + data.velocity.x * delayedP * data.drag;
      const y = Math.max(0.12, data.origin.y + data.velocity.y * delayedP - 22 * delayedP * delayedP);
      const z = data.origin.z + data.velocity.z * delayedP + Math.sin(delayedP * 17 + data.swirl) * (1 - delayedP);
      const scale = data.size * (3.2 - delayedP * 1.7) * force;

      this.blobDummy.position.set(x, y, z);
      this.blobDummy.rotation.set(data.swirl + delayedP * 5, delayedP * 8, data.swirl * 0.7);
      this.blobDummy.scale.set(scale * 1.45, scale * randStatic(i, 0.8, 2.2), scale);
      this.blobDummy.updateMatrix();
      this.blobs.setMatrixAt(i, this.blobDummy.matrix);
    }

    this.blobs.instanceMatrix.needsUpdate = true;
  }

  updateCrest(p, force) {
    const positions = this.crestLines.geometry.attributes.position.array;
    const burstHeight = 4.5 + Math.sin(p * Math.PI) * 7.5;

    for (let i = 0; i < this.crestSegmentCount; i += 1) {
      const lane = this.lanes[i % this.lanes.length];
      const side = i % 2 === 0 ? -1 : 1;
      const z = lane + Math.sin(i * 1.71) * 1.7;
      const local = fract(i * 0.381);
      const reach = (6 + local * 18) * Math.sin(Math.min(p * Math.PI * 1.35, Math.PI));
      const y0 = 0.22 + local * 1.2;
      const y1 = y0 + burstHeight * (0.3 + local) * force;
      const x0 = 0;
      const x1 = side * reach;
      const arrayIndex = i * 6;

      positions[arrayIndex] = x0;
      positions[arrayIndex + 1] = y0;
      positions[arrayIndex + 2] = z;
      positions[arrayIndex + 3] = x1;
      positions[arrayIndex + 4] = y1;
      positions[arrayIndex + 5] = z + Math.sin(p * 15 + i) * 1.4;
    }

    this.crestLines.geometry.attributes.position.needsUpdate = true;
  }
}

const patchRegistry = new TextPatchRegistry(TEXT_TARGET_UNITS);
new GroundTileManager(scene, patchRegistry);

const lanePositions = Array.from({ length: LANE_COUNT }, (_, index) => {
  return (index - (LANE_COUNT - 1) / 2) * LANE_SPACING;
});

const creatures = [];
lanePositions.forEach((z, laneIndex) => {
  [-1, 1].forEach((side) => {
    const creature = new CreatureSilhouette({
      id: `${side < 0 ? "left" : "right"}-${laneIndex}`,
      side,
      laneIndex,
      z,
      registry: patchRegistry
    });
    creature.addTo(scene);
    creatures.push(creature);
  });
});

const inkBurst = new InkBurstSystem(scene, lanePositions);

window.prototypePatchRegistry = patchRegistry;
window.prototypeTimeline = {
  setTime(seconds) {
    forcedCycleTime = wrapTime(seconds, LOOP_DURATION);
  },
  clearTime() {
    forcedCycleTime = null;
  }
};

const clock = new THREE.Clock();

function animate() {
  const elapsed = clock.getElapsedTime();
  const cycleTime = forcedCycleTime ?? elapsed % LOOP_DURATION;
  const impactFade = 1 - smoothstep(IMPACT_TIME - 0.08, IMPACT_TIME + 0.34, cycleTime);
  silhouetteMaterial.opacity = impactFade;

  creatures.forEach((creature) => creature.update(cycleTime));
  inkBurst.update(cycleTime);

  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function makeTransform(position, scale, rotation = [0, 0, 0]) {
  return { position, scale, rotation };
}

function hiddenTransform() {
  return makeTransform([0, -8, 0], [0.001, 0.001, 0.001], [0, 0, 0]);
}

function shapeWith(overrides) {
  const shape = {};
  PART_NAMES.forEach((name) => {
    shape[name] = hiddenTransform();
  });
  Object.entries(overrides).forEach(([name, transform]) => {
    shape[name] = transform;
  });
  return shape;
}

const SHAPES = {
  lion: shapeWith({
    body: makeTransform([0, 1.35, 0], [2.45, 0.72, 0.55]),
    chest: makeTransform([1.02, 1.48, 0], [0.76, 0.72, 0.56]),
    neck: makeTransform([1.34, 1.72, 0], [0.18, 0.48, 0.18], [0, 0, -0.4]),
    head: makeTransform([1.76, 1.83, 0], [0.58, 0.46, 0.42]),
    mane: makeTransform([1.27, 1.72, 0], [0.7, 0.68, 0.62]),
    frontLegNear: makeTransform([0.82, 0.65, 0.26], [0.13, 0.88, 0.13]),
    frontLegFar: makeTransform([0.72, 0.62, -0.24], [0.12, 0.82, 0.12]),
    rearLegNear: makeTransform([-0.82, 0.65, 0.24], [0.15, 0.9, 0.15]),
    rearLegFar: makeTransform([-0.92, 0.6, -0.23], [0.13, 0.82, 0.13]),
    tail: makeTransform([-1.48, 1.58, 0], [0.08, 1.18, 0.08], [0, 0, 1.16]),
    earNear: makeTransform([1.72, 2.18, 0.18], [0.14, 0.2, 0.08]),
    earFar: makeTransform([1.7, 2.16, -0.16], [0.1, 0.16, 0.06])
  }),

  giraffe: shapeWith({
    body: makeTransform([0, 1.7, 0], [2.22, 0.62, 0.48]),
    chest: makeTransform([0.92, 1.8, 0], [0.56, 0.58, 0.46]),
    neck: makeTransform([1.18, 3.05, 0], [0.16, 1.72, 0.16], [0, 0, -0.22]),
    head: makeTransform([1.62, 4.38, 0], [0.5, 0.32, 0.3]),
    frontLegNear: makeTransform([0.76, 0.86, 0.22], [0.11, 1.45, 0.11]),
    frontLegFar: makeTransform([0.62, 0.84, -0.2], [0.1, 1.42, 0.1]),
    rearLegNear: makeTransform([-0.76, 0.86, 0.2], [0.12, 1.46, 0.12]),
    rearLegFar: makeTransform([-0.92, 0.84, -0.2], [0.1, 1.42, 0.1]),
    tail: makeTransform([-1.32, 1.82, 0], [0.055, 1.02, 0.055], [0, 0, 1.28]),
    horn: makeTransform([1.5, 4.73, 0.1], [0.05, 0.26, 0.05]),
    earNear: makeTransform([1.44, 4.48, 0.2], [0.12, 0.2, 0.07]),
    earFar: makeTransform([1.44, 4.48, -0.18], [0.1, 0.16, 0.06])
  }),

  rhino: shapeWith({
    body: makeTransform([-0.06, 1.28, 0], [2.92, 0.92, 0.66]),
    chest: makeTransform([1.2, 1.42, 0], [0.95, 0.74, 0.62]),
    neck: makeTransform([1.48, 1.52, 0], [0.26, 0.42, 0.28], [0, 0, 1.22]),
    head: makeTransform([1.86, 1.48, 0], [0.84, 0.48, 0.48]),
    frontLegNear: makeTransform([0.9, 0.58, 0.28], [0.18, 0.78, 0.18]),
    frontLegFar: makeTransform([0.78, 0.56, -0.26], [0.16, 0.72, 0.16]),
    rearLegNear: makeTransform([-0.9, 0.58, 0.26], [0.2, 0.8, 0.2]),
    rearLegFar: makeTransform([-1.02, 0.56, -0.24], [0.17, 0.72, 0.17]),
    horn: makeTransform([2.44, 1.62, 0], [0.2, 0.66, 0.2], [0, 0, -Math.PI / 2]),
    tail: makeTransform([-1.62, 1.4, 0], [0.06, 0.56, 0.06], [0, 0, 1.05]),
    earNear: makeTransform([1.52, 1.9, 0.22], [0.11, 0.18, 0.07])
  }),

  elephant: shapeWith({
    body: makeTransform([-0.08, 1.55, 0], [3.22, 1.08, 0.82]),
    chest: makeTransform([1.28, 1.74, 0], [1.05, 0.88, 0.74]),
    neck: makeTransform([1.42, 1.72, 0], [0.34, 0.4, 0.34], [0, 0, 1.1]),
    head: makeTransform([1.84, 1.86, 0], [0.88, 0.72, 0.7]),
    frontLegNear: makeTransform([0.84, 0.62, 0.34], [0.22, 0.98, 0.22]),
    frontLegFar: makeTransform([0.64, 0.6, -0.31], [0.2, 0.92, 0.2]),
    rearLegNear: makeTransform([-0.92, 0.62, 0.32], [0.24, 1, 0.24]),
    rearLegFar: makeTransform([-1.12, 0.6, -0.3], [0.21, 0.92, 0.21]),
    trunk: makeTransform([2.42, 1.05, 0], [0.15, 1.08, 0.15], [0, 0, 0.2]),
    earNear: makeTransform([1.48, 1.95, 0.54], [0.18, 0.75, 0.56]),
    earFar: makeTransform([1.48, 1.95, -0.54], [0.14, 0.58, 0.42]),
    tail: makeTransform([-1.72, 1.68, 0], [0.06, 0.68, 0.06], [0, 0, 1.18])
  }),

  human: shapeWith({
    body: makeTransform([0, 1.75, 0], [0.38, 1.05, 0.28]),
    chest: makeTransform([0.02, 2.33, 0], [0.46, 0.52, 0.32]),
    neck: makeTransform([0.03, 2.78, 0], [0.12, 0.26, 0.12]),
    head: makeTransform([0.04, 3.12, 0], [0.36, 0.36, 0.36]),
    frontLegNear: makeTransform([0.15, 0.76, 0.1], [0.11, 0.92, 0.11], [0, 0, -0.08]),
    rearLegNear: makeTransform([-0.17, 0.76, 0.02], [0.11, 0.92, 0.11], [0, 0, 0.08]),
    frontLegFar: makeTransform([0.12, 0.72, -0.1], [0.095, 0.82, 0.095], [0, 0, -0.08]),
    rearLegFar: makeTransform([-0.15, 0.72, -0.03], [0.095, 0.82, 0.095], [0, 0, 0.08]),
    armNear: makeTransform([0.12, 2.22, 0.2], [0.1, 0.86, 0.1], [0, 0, -0.36]),
    armFar: makeTransform([-0.1, 2.2, -0.18], [0.09, 0.78, 0.09], [0, 0, 0.34])
  })
};

function mixShape(shapeA, shapeB, alpha) {
  const mixed = {};
  PART_NAMES.forEach((name) => {
    mixed[name] = mixTransform(shapeA[name], shapeB[name], alpha);
  });
  return mixed;
}

function mixTransform(a, b, alpha) {
  return {
    position: mixArray(a.position, b.position, alpha),
    scale: mixArray(a.scale, b.scale, alpha),
    rotation: mixArray(a.rotation, b.rotation, alpha)
  };
}

function mixArray(a, b, alpha) {
  return [
    THREE.MathUtils.lerp(a[0], b[0], alpha),
    THREE.MathUtils.lerp(a[1], b[1], alpha),
    THREE.MathUtils.lerp(a[2], b[2], alpha)
  ];
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function randStatic(seed, min, max) {
  const value = fract(Math.sin(seed * 12.9898) * 43758.5453);
  return min + value * (max - min);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function fract(value) {
  return value - Math.floor(value);
}

function wrapTime(value, duration) {
  return ((value % duration) + duration) % duration;
}

function smoothstep(edge0, edge1, value) {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function smootherstep(value) {
  const x = clamp(value, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function easeInOutCubic(value) {
  const x = clamp(value, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function easeOutSine(value) {
  return Math.sin((clamp(value, 0, 1) * Math.PI) / 2);
}

renderer.setAnimationLoop(animate);
