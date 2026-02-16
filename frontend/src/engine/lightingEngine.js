import * as THREE from "three";

/**
 * Lighting Engine — Club lights, lasers, pyro particles
 */

// ── Club Point Lights (6 rotating hue lights) ──
export function createClubLights(scene, count = 6) {
  const lights = [];
  for (let i = 0; i < count; i++) {
    const light = new THREE.PointLight(0x00f0ff, 2, 15);
    light.position.set(
      Math.cos(i * Math.PI / 3) * 6,
      5,
      Math.sin(i * Math.PI / 3) * 6,
    );
    scene.add(light);
    lights.push(light);
  }
  return lights;
}

export function animateClubLights(lights, energy) {
  const t = Date.now() * 0.001;
  lights.forEach((light, i) => {
    const hue = (t * 0.1 + i * 0.15) % 1;
    light.color.setHSL(hue, 1, 0.5);
    light.intensity = 1 + energy * 4;
  });
}

// ── Laser Beams (4 rotating lines) ──
export function createLasers(scene, count = 4) {
  const lasers = [];
  for (let i = 0; i < count; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 6, 0),
      new THREE.Vector3(
        Math.cos(i * Math.PI / 2) * 10,
        -1,
        Math.sin(i * Math.PI / 2) * 10,
      ),
    ]);
    const mat = new THREE.LineBasicMaterial({
      color: 0x00ff88, transparent: true, opacity: 0.7,
    });
    const laser = new THREE.Line(geo, mat);
    scene.add(laser);
    lasers.push(laser);
  }
  return lasers;
}

export function animateLasers(lasers, energy) {
  const t = Date.now() * 0.001;
  lasers.forEach((laser, i) => {
    laser.rotation.y = t * 0.5 + i * Math.PI / 2 + energy * 2;
    laser.material.opacity = 0.3 + energy * 0.7;
  });
}

// ── Pyro Particles (300 burst-on-beat-drop particles) ──
export function createPyro(scene, count = 300) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 3;
    positions[i * 3 + 1] = Math.random() * 5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 3;
    velocities[i * 3] = (Math.random() - 0.5) * 0.3;
    velocities[i * 3 + 1] = Math.random() * 0.4 + 0.1;
    velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    const t = Math.random();
    colors[i * 3] = t < 0.5 ? 1.0 : 0.0;
    colors[i * 3 + 1] = t < 0.33 ? 0.5 : 0.0;
    colors[i * 3 + 2] = t > 0.66 ? 1.0 : 0.0;
  }

  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.12, vertexColors: true, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  const pyro = new THREE.Points(geo, mat);
  pyro.visible = false;
  scene.add(pyro);

  return { pyro, velocities, count, mat, timer: 0, active: false };
}

/**
 * Check if beat drop should trigger pyro
 */
export function checkPyroTrigger(pyroState, energy, lastEnergy) {
  const delta = energy - lastEnergy;
  if (delta > 0.25 && energy > 0.35) {
    pyroState.active = true;
    pyroState.timer = 0;
    pyroState.pyro.visible = true;

    const positions = pyroState.pyro.geometry.attributes.position.array;
    for (let i = 0; i < pyroState.count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 2;
      positions[i * 3 + 1] = Math.random() * 0.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 2;
    }
    pyroState.pyro.geometry.attributes.position.needsUpdate = true;
  }
}

/**
 * Animate active pyro burst
 */
export function animatePyro(pyroState) {
  if (!pyroState.active) return;

  pyroState.timer++;
  const positions = pyroState.pyro.geometry.attributes.position.array;
  const vel = pyroState.velocities;

  for (let i = 0; i < pyroState.count; i++) {
    positions[i * 3] += vel[i * 3];
    positions[i * 3 + 1] += vel[i * 3 + 1];
    positions[i * 3 + 2] += vel[i * 3 + 2];
    vel[i * 3 + 1] -= 0.003; // gravity
  }
  pyroState.pyro.geometry.attributes.position.needsUpdate = true;
  pyroState.mat.opacity = Math.max(0, 0.9 - pyroState.timer * 0.015);
  pyroState.pyro.rotation.y += 0.02;

  if (pyroState.timer > 60) {
    pyroState.active = false;
    pyroState.pyro.visible = false;
    pyroState.mat.opacity = 0.9;
    // Reset velocities
    for (let i = 0; i < pyroState.count; i++) {
      vel[i * 3] = (Math.random() - 0.5) * 0.3;
      vel[i * 3 + 1] = Math.random() * 0.4 + 0.1;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    }
  }
}
