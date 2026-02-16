/**
 * DJ SaaS Engine Modules — Barrel Export
 *
 * engine/
 *   avatarEngine.js    — DJ avatar creation & animation
 *   crowdEngine.js     — Crowd avatars with energy-based movement
 *   lightingEngine.js  — Club lights, lasers, pyro particles
 *   stageDirector.js   — Scene setup, camera AI, mode switching
 *   audioEngine.js     — Centralized WebAudio master bus
 */
export * from "./avatarEngine.js";
export * from "./crowdEngine.js";
export * from "./lightingEngine.js";
export * from "./stageDirector.js";
export * from "./audioEngine.js";
