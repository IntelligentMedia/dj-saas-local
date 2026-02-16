import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import useDJStore from "../store/djStore";
import {
  createAvatar, animateAvatar, createMetaAvatars, animateMetaAvatars,
  createCrowd, animateCrowd,
  createClubLights, animateClubLights, createLasers, animateLasers,
  createPyro, checkPyroTrigger, animatePyro,
  createStage, animateStage, switchMode as switchSceneMode, animateCamera,
} from "../engine";

export default function Visualizer() {
  const mountRef = useRef(null);
  const audioRef = useRef(null);
  const playBtnRef = useRef(null);
  const pauseBtnRef = useRef(null);
  const demoBtnRef = useRef(null);

  // Use refs for values read inside animation loop — avoids useEffect dependency issues
  const crowdEnergyRef = useRef(0);
  const modeRef = useRef("stage");
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const animFrameRef = useRef(null);
  const demoNodesRef = useRef(null);

  const crowdEnergy = useDJStore((s) => s.crowdEnergy);
  const setCrowdEnergy = useDJStore((s) => s.setCrowdEnergy);
  const setAudioEnergy = useDJStore((s) => s.setAudioEnergy);
  const setLightingMode = useDJStore((s) => s.setLightingMode);
  const [mode, setMode] = useState("stage");
  const [playing, setPlaying] = useState(false);
  const [demoActive, setDemoActive] = useState(false);

  // Keep refs in sync with state
  useEffect(() => { crowdEnergyRef.current = crowdEnergy; }, [crowdEnergy]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // Poll crowd energy from AI endpoint (silently fails if API is down)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("http://localhost:4000/ai/crowd-energy", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setCrowdEnergy(data.crowd_energy || 0);
        }
      } catch {
        // API not running — use simulated crowd energy for demo
        setCrowdEnergy(Math.floor(40 + Math.random() * 60));
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // ── Audio setup (only once per audio element) ──
  const setupAudio = useCallback(() => {
    if (audioCtxRef.current) return; // already set up
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    audioCtxRef.current = ctx;
    const audio = audioRef.current;
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser).connect(ctx.destination);
    analyserRef.current = analyser;
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
  }, []);

  // ── Demo mode: generate rich audio energy without external audio ──
  const startDemo = useCallback(() => {
    if (demoNodesRef.current) return; // already running
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = audioCtxRef.current || new AC();
    audioCtxRef.current = ctx;
    if (ctx.state === "suspended") ctx.resume();

    // Create multiple oscillators + noise for a rich frequency spectrum
    const nodes = [];
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0; // silent — don't play through speakers
    masterGain.connect(ctx.destination);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

    const mixGain = ctx.createGain();
    mixGain.gain.value = 1.0;
    mixGain.connect(analyser);

    // Bass oscillators (30-120 Hz)
    [40, 60, 80, 110].forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.3;
      osc.connect(g).connect(mixGain);
      osc.start();
      nodes.push(osc);
    });

    // Mid oscillators (200-2000 Hz)
    [200, 440, 880, 1200].forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.15;
      osc.connect(g).connect(mixGain);
      osc.start();
      nodes.push(osc);
    });

    // High oscillators (2k-8k Hz)
    [2000, 4000, 6000].forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.08;
      osc.connect(g).connect(mixGain);
      osc.start();
      nodes.push(osc);
    });

    // LFO to modulate energy rhythmically (simulates beat drops)
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 2.2; // ~132 BPM feel
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(mixGain.gain);
    lfo.start();
    nodes.push(lfo);

    demoNodesRef.current = { nodes, mixGain, masterGain, lfo };
    setDemoActive(true);
    // Pause the MP3 audio element so they don't conflict
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  const stopDemo = useCallback(() => {
    if (!demoNodesRef.current) return;
    const { nodes } = demoNodesRef.current;
    nodes.forEach(n => { try { n.stop(); } catch {} });
    demoNodesRef.current = null;
    analyserRef.current = null;
    dataArrayRef.current = null;
    setDemoActive(false);
  }, []);

  const handlePlay = useCallback(() => {
    stopDemo(); // stop demo if running
    setupAudio();
    const ctx = audioCtxRef.current;
    if (ctx?.state === "suspended") ctx.resume();
    audioRef.current?.play();
    setPlaying(true);
  }, [setupAudio, stopDemo]);

  const handlePause = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  // ── Three.js scene — runs ONCE on mount ──
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // ── Build scene using engine modules ──
    const avatarParts = createAvatar(scene);
    const stage = createStage(scene);
    const clubLights = createClubLights(scene);
    const lasers = createLasers(scene);
    const crowdAvatars = createCrowd(scene);
    const metaAvatars = createMetaAvatars(scene);
    const pyroState = createPyro(scene);

    camera.position.set(0, 3, 10);
    camera.lookAt(0, 1, 0);

    let lastEnergy = 0, mouseX = 0;

    const handleMouse = (e) => { mouseX = (e.clientX / window.innerWidth - 0.5) * 2; };
    window.addEventListener("mousemove", handleMouse);

    // Mode switching (called externally via ref)
    const updateMode = (m) => {
      switchSceneMode(m, {
        avatar: avatarParts.avatar, deckA: stage.deckA, deckB: stage.deckB,
        gridHelper: stage.gridHelper, clubLights, lasers, crowdAvatars,
        metaAvatars, globe: stage.globe, djNode: stage.djNode,
      });
    };
    container._updateMode = updateMode;
    updateMode("stage");

    let running = true;
    function animate() {
      if (!running) return;
      animFrameRef.current = requestAnimationFrame(animate);

      let avg = 0;
      const analyser = analyserRef.current;
      const dataArray = dataArrayRef.current;
      if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        avg = sum / dataArray.length;
      }

      const energy = avg / 255;
      const crowd = crowdEnergyRef.current / 100;
      const combinedEnergy = Math.min(1, energy + crowd * 0.3);
      const currentMode = modeRef.current;

      // Push energy into Zustand so other components can read it
      if (Math.abs(energy - (useDJStore.getState().audioEnergy || 0)) > 0.02) {
        useDJStore.getState().setAudioEnergy(energy);
      }

      // ── Use engine modules for animation ──
      checkPyroTrigger(pyroState, energy, lastEnergy);
      lastEnergy = energy;
      animatePyro(pyroState);

      animateAvatar(avatarParts, energy, crowd);
      animateStage(stage, energy, currentMode);
      animateClubLights(clubLights, energy);
      animateLasers(lasers, energy);
      animateCrowd(crowdAvatars, combinedEnergy);
      animateMetaAvatars(metaAvatars);
      animateCamera(camera, { energy, pyroActive: pyroState.active, mouseX, currentMode });

      renderer.render(scene, camera);
    }

    animate();

    const handleResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("mousemove", handleMouse);
      window.removeEventListener("resize", handleResize);
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []); // ← runs ONCE — no deps that change

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      stopDemo();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [stopDemo]);

  const switchMode = (m) => {
    setMode(m);
    setLightingMode(m);
    mountRef.current?._updateMode?.(m);
  };

  return (
    <div className="visualizer-page">
      <div className="viz-controls">
        <h2>🤖 3D DJ Avatar + Pyro FX + Club Lighting</h2>
        <audio ref={audioRef} src="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" crossOrigin="anonymous" />
        <div className="viz-btn-row">
          {!playing ? (
            <button ref={playBtnRef} className="deck-btn" onClick={handlePlay}>▶ Play Music</button>
          ) : (
            <button ref={pauseBtnRef} className="deck-btn active" onClick={handlePause}>⏸ Pause</button>
          )}
          <button
            ref={demoBtnRef}
            className={`deck-btn ${demoActive ? "active" : ""}`}
            onClick={demoActive ? stopDemo : startDemo}
          >
            {demoActive ? "⏹ Stop Demo" : "🎬 Demo Mode"}
          </button>
        </div>
        <span className="viz-hint">
          {demoActive
            ? "🎬 Demo active — synthetic audio drives the scene"
            : "▶ Play Music for audio-reactive visuals, or use Demo Mode"}
          {" | 👥 Crowd energy: " + crowdEnergy}
        </span>
        <div className="viz-mode-buttons">
          <button className={`deck-btn ${mode === "stage" ? "active" : ""}`} onClick={() => switchMode("stage")}>🎤 Stage</button>
          <button className={`deck-btn ${mode === "metaverse" ? "active" : ""}`} onClick={() => switchMode("metaverse")}>🌐 Metaverse</button>
          <button className={`deck-btn ${mode === "globe" ? "active" : ""}`} onClick={() => switchMode("globe")}>🌍 Pulse Globe</button>
        </div>
      </div>
      <div ref={mountRef} className="viz-canvas" />
    </div>
  );
}
