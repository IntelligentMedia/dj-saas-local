import * as THREE from "three";

/**
 * Crowd Engine — Creates and animates 20 crowd avatars
 */
export function createCrowd(scene, count = 20) {
  const crowdAvatars = [];

  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x8888ff, wireframe: true, transparent: true, opacity: 0.6,
    });
    const cBody = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 0.3), mat);
    const cHead = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), mat);
    cHead.position.y = 0.65;

    const crowd = new THREE.Group();
    crowd.add(cBody, cHead);
    crowd.position.set(
      (Math.random() - 0.5) * 14,
      -0.5,
      (Math.random() - 0.5) * 14 + 3,
    );
    crowd.userData = { baseX: crowd.position.x, baseZ: crowd.position.z };
    scene.add(crowd);
    crowdAvatars.push(crowd);
  }

  return crowdAvatars;
}

/**
 * Animate crowd — bounce and surge toward stage at high energy
 * @param {Array} crowdAvatars
 * @param {number} combinedEnergy - 0–1
 */
export function animateCrowd(crowdAvatars, combinedEnergy) {
  const t = Date.now() * 0.001;

  crowdAvatars.forEach((c, i) => {
    c.position.y = -0.5 + Math.abs(Math.sin(t * 2 + i)) * combinedEnergy * 0.5;
    c.rotation.y += 0.01;

    if (combinedEnergy > 0.5) {
      // Surge toward stage
      c.position.x += (0 - c.position.x) * 0.002;
      c.position.z += (0 - c.position.z) * 0.002;
    } else {
      // Drift back to base positions
      c.position.x += (c.userData.baseX - c.position.x) * 0.001;
      c.position.z += (c.userData.baseZ - c.position.z) * 0.001;
    }
  });
}
