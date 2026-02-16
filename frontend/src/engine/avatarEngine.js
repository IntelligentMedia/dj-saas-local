import * as THREE from "three";

/**
 * Avatar Engine — Creates and animates the DJ avatar (head, body, arms, mouth)
 */
export function createAvatar(scene) {
  const material = new THREE.MeshBasicMaterial({
    color: 0x00f0ff, wireframe: true, transparent: true, opacity: 0.9,
  });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 16), material);
  head.position.y = 2.5;

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 0.6), material);
  body.position.y = 1;

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.5, 0.4), material);
  leftArm.position.set(-1, 1.5, 0);

  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.5, 0.4), material);
  rightArm.position.set(1, 1.5, 0);

  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.1), material);
  mouth.position.set(0, 2.15, 0.6);

  const avatar = new THREE.Group();
  avatar.add(head, body, leftArm, rightArm, mouth);
  scene.add(avatar);

  return { avatar, head, body, leftArm, rightArm, mouth, material };
}

/**
 * Animate avatar — call every frame
 * @param {object} parts - { avatar, leftArm, rightArm, mouth, material }
 * @param {number} energy - 0–1 audio energy
 * @param {number} crowdFactor - 0–1 crowd energy fraction
 */
export function animateAvatar(parts, energy, crowdFactor) {
  const { avatar, leftArm, rightArm, mouth, material } = parts;
  const combinedEnergy = Math.min(1, energy + crowdFactor * 0.3);

  avatar.rotation.y += 0.01;
  avatar.position.y = Math.sin(Date.now() * 0.002) * combinedEnergy;
  leftArm.rotation.z = Math.sin(Date.now() * 0.005) * combinedEnergy * 1.5;
  rightArm.rotation.z = -Math.sin(Date.now() * 0.005) * combinedEnergy * 1.5;

  // Voice-sync mouth scale
  mouth.scale.y = 0.5 + Math.abs(Math.sin(Date.now() * 0.008)) * energy;

  // Color shift with combined energy
  const hue = 0.5 - combinedEnergy * 0.2;
  material.color.setHSL(Math.max(0, hue), 1, 0.5);
}

/**
 * Create metaverse DJ avatars (3 extra DJs for multiplayer view)
 */
export function createMetaAvatars(scene) {
  const metaAvatars = [];
  const colors = [0xff00ff, 0xffff00, 0x00ff00];

  for (let i = 0; i < 3; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: colors[i], wireframe: true });
    const mHead = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), mat);
    mHead.position.y = 1.5;
    const mBody = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.5, 0.4), mat);
    mBody.position.y = 0.5;
    const group = new THREE.Group();
    group.add(mHead, mBody);
    group.position.set((i - 1) * 5, 0, -3);
    group.visible = false;
    scene.add(group);
    metaAvatars.push(group);
  }

  return metaAvatars;
}

export function animateMetaAvatars(metaAvatars) {
  metaAvatars.forEach((a, i) => {
    a.rotation.y += 0.01 + i * 0.002;
    a.position.y = Math.sin(Date.now() * 0.002 + i) * 0.2;
  });
}
