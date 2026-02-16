import * as THREE from "three";

/**
 * Stage Director — Scene setup, camera AI, mode switching, globe/stage objects
 */

// ── Create base scene objects (floor, deck panels, globe) ──
export function createStage(scene) {
  // Floor grid
  const gridHelper = new THREE.GridHelper(20, 20, 0x00f0ff, 0x111133);
  gridHelper.position.y = -1;
  scene.add(gridHelper);

  // Floating deck panels
  const panelMat = new THREE.MeshBasicMaterial({
    color: 0xff00ff, wireframe: true, transparent: true, opacity: 0.5,
  });
  const panelGeo = new THREE.BoxGeometry(3, 1.5, 0.15);
  const deckA = new THREE.Mesh(panelGeo, panelMat);
  deckA.position.set(-3, 0, -1);
  const deckB = new THREE.Mesh(panelGeo, panelMat);
  deckB.position.set(3, 0, -1);
  scene.add(deckA, deckB);

  // Pulse Globe
  const globeGeo = new THREE.SphereGeometry(3, 48, 48);
  const globeMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff, wireframe: true, transparent: true, opacity: 0.3,
  });
  const globe = new THREE.Mesh(globeGeo, globeMat);
  globe.visible = false;
  scene.add(globe);

  // Globe DJ node
  const djNode = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff00ff }),
  );
  djNode.position.set(2, 0.7, 1.5);
  djNode.visible = false;
  scene.add(djNode);

  return { gridHelper, panelMat, deckA, deckB, globe, djNode };
}

/**
 * Animate stage objects (deck panels float, globe pulse)
 */
export function animateStage(stage, energy, currentMode) {
  const { panelMat, deckA, deckB, globe, djNode } = stage;

  panelMat.color.setHex(energy > 0.5 ? 0xff3300 : 0xff00ff);
  deckA.position.y = Math.sin(Date.now() * 0.001) * 0.2;
  deckB.position.y = Math.cos(Date.now() * 0.001) * 0.2;
  deckA.rotation.y = Math.sin(Date.now() * 0.0005) * 0.1;
  deckB.rotation.y = -Math.sin(Date.now() * 0.0005) * 0.1;

  if (currentMode === "globe") {
    const scale = 1 + energy * 0.3;
    globe.scale.set(scale, scale, scale);
    globe.rotation.y += 0.002;
    djNode.material.color.setRGB(energy, 0.2, 1 - energy);
  }
}

/**
 * Switch visibility of scene objects based on mode
 */
export function switchMode(mode, objects) {
  const { avatar, deckA, deckB, gridHelper, clubLights, lasers, crowdAvatars, metaAvatars, globe, djNode } = objects;
  const isStage = mode === "stage";
  const isMeta = mode === "metaverse";
  const isGlobe = mode === "globe";

  avatar.visible = isStage || isMeta;
  deckA.visible = isStage;
  deckB.visible = isStage;
  gridHelper.visible = isStage || isMeta;
  clubLights.forEach(l => (l.visible = isStage));
  lasers.forEach(l => (l.visible = isStage));
  crowdAvatars.forEach(c => (c.visible = isStage || isMeta));
  metaAvatars.forEach(a => (a.visible = isMeta));
  globe.visible = isGlobe;
  djNode.visible = isGlobe;
}

/**
 * AI Stage Director Camera — zooms on energy, shakes on pyro, tracks mouse
 */
export function animateCamera(camera, { energy, pyroActive, mouseX, currentMode }) {
  const baseCam = { x: 0, y: 3, z: 10 };
  const shakeIntensity = pyroActive ? 0.3 : 0;
  const shakeX = (Math.random() - 0.5) * shakeIntensity;
  const shakeY = (Math.random() - 0.5) * shakeIntensity * 0.5;
  const aiZoom = currentMode === "globe" ? 12 : (baseCam.z - energy * 3);

  camera.position.x += (mouseX * 5 - camera.position.x) * 0.02 + shakeX;
  camera.position.y = baseCam.y + shakeY;
  camera.position.z += (aiZoom - camera.position.z) * 0.02;
  camera.lookAt(0, 1, 0);
}
