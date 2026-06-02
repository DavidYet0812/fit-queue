import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Expand,
  Dumbbell,
  GripVertical,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
  Video,
  Volume2
} from "lucide-react";
import "./styles.css";

const DEFAULT_EXERCISES = [
  { id: "squat", name: "深蹲", focus: "腿部", defaultDuration: 30, tempo: "穩定下蹲", accent: "#ef4444", videoUrl: "" },
  { id: "pushup", name: "伏地挺身", focus: "胸肩", defaultDuration: 30, tempo: "下壓撐起", accent: "#2563eb", videoUrl: "" },
  { id: "plank", name: "棒式", focus: "核心", defaultDuration: 45, tempo: "維持張力", accent: "#7c3aed", videoUrl: "" },
  { id: "lunge", name: "弓箭步", focus: "臀腿", defaultDuration: 30, tempo: "左右交替", accent: "#db2777", videoUrl: "" },
  { id: "jumping-jack", name: "開合跳", focus: "有氧", defaultDuration: 40, tempo: "跟上節拍", accent: "#0891b2", videoUrl: "" },
  { id: "mountain", name: "登山者", focus: "全身", defaultDuration: 30, tempo: "快速換腳", accent: "#ea580c", videoUrl: "" },
  { id: "bridge", name: "臀橋", focus: "臀腿", defaultDuration: 35, tempo: "上抬停住", accent: "#16a34a", videoUrl: "" },
  { id: "burpee", name: "波比跳", focus: "爆發", defaultDuration: 30, tempo: "完整動作", accent: "#111827", videoUrl: "" }
];

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const VIDEO_SETTINGS_KEY = "fit-queue-video-settings-v2";
const EXERCISES_SETTINGS_KEY = "fit-queue-exercises-v1";

const clampSeconds = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(600, Math.max(5, parsed));
};

const loadVideoSettings = () => {
  try {
    return JSON.parse(window.localStorage.getItem(VIDEO_SETTINGS_KEY) || "{}");
  } catch {
    return {};
  }
};

const saveVideoSettings = (settings) => {
  try {
    window.localStorage.setItem(VIDEO_SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
};

const normalizeExercise = (exercise) => ({
  id: exercise.id || `custom-${uid()}`,
  name: exercise.name || "新動作",
  focus: exercise.focus || "未分類",
  defaultDuration: clampSeconds(exercise.defaultDuration, 30),
  tempo: exercise.tempo || "跟著節奏",
  accent: exercise.accent || "#111827",
  videoUrl: exercise.videoUrl || ""
});

const loadExercises = () => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(EXERCISES_SETTINGS_KEY) || "null");
    if (Array.isArray(stored) && stored.length) {
      return stored.map(normalizeExercise);
    }
  } catch {}

  const videoSettings = loadVideoSettings();
  return DEFAULT_EXERCISES.map((exercise) => ({
    ...exercise,
    videoUrl: videoSettings[exercise.id] || exercise.videoUrl || ""
  }));
};

const saveExercises = (exercises) => {
  try {
    window.localStorage.setItem(EXERCISES_SETTINGS_KEY, JSON.stringify(exercises));
  } catch {}
};

const formatDuration = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes <= 0) return `${remainder}秒`;
  if (remainder === 0) return `${minutes}分鐘`;
  return `${minutes}分${remainder}秒`;
};

function useAudioCoach() {
  const audioRef = useRef(null);
  const speechTimeoutRef = useRef(null);

  const ensureAudio = useCallback(async () => {
    const AudioEngine = window.AudioContext || window.webkitAudioContext;
    if (!AudioEngine) return false;
    if (!audioRef.current) {
      audioRef.current = new AudioEngine();
    }
    if (audioRef.current.state === "suspended") {
      await audioRef.current.resume();
    }
    return true;
  }, []);

  const beep = useCallback(async (strong = false) => {
    const ready = await ensureAudio();
    if (!ready) return;
    const context = audioRef.current;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = strong ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(strong ? 980 : 720, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(strong ? 0.32 : 0.18, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.14);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.16);
  }, [ensureAudio]);

  const speak = useCallback((text) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth || typeof window.SpeechSynthesisUtterance === "undefined") return;
      synth.cancel();
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.lang = "zh-TW";
      utterance.rate = 1;
      utterance.pitch = 1;
      synth.speak(utterance);
    } catch {
      // Voice prompts are optional; the timer must keep working without them.
    }
  }, []);

  const speakAsync = useCallback((text) => {
    return new Promise((resolve) => {
      try {
        const synth = window.speechSynthesis;
        if (!synth || typeof window.SpeechSynthesisUtterance === "undefined") {
          resolve(false);
          return;
        }

        window.clearTimeout(speechTimeoutRef.current);
        synth.cancel();
        const utterance = new window.SpeechSynthesisUtterance(text);
        utterance.lang = "zh-TW";
        utterance.rate = 1;
        utterance.pitch = 1;
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(speechTimeoutRef.current);
          resolve(value);
        };
        utterance.onend = () => finish(true);
        utterance.onerror = () => finish(false);
        speechTimeoutRef.current = window.setTimeout(
          () => finish(false),
          Math.max(1500, text.length * 260)
        );
        synth.speak(utterance);
      } catch {
        resolve(false);
      }
    });
  }, []);

  const stopSpeech = useCallback(() => {
    try {
      window.clearTimeout(speechTimeoutRef.current);
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch {}
  }, []);

  return { ensureAudio, beep, speak, speakAsync, stopSpeech };
}

function AdminPage({ exercises, onExerciseChange, onExerciseAdd, onExerciseDelete }) {
  const [draft, setDraft] = useState({
    name: "",
    focus: "",
    defaultDuration: 30,
    tempo: "",
    accent: "#111827",
    videoUrl: ""
  });

  const addDraft = () => {
    if (!draft.name.trim()) return;
    onExerciseAdd(draft);
    setDraft({
      name: "",
      focus: "",
      defaultDuration: 30,
      tempo: "",
      accent: "#111827",
      videoUrl: ""
    });
  };

  return (
    <main className="app-shell admin-shell">
      <section className="studio">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark"><Video size={24} /></div>
            <div>
              <h1>動作後台</h1>
              <p>統一管理動作與示範影片，前台訓練頁只讀取設定</p>
            </div>
          </div>
          <a className="admin-link" href={import.meta.env.BASE_URL}>回前台</a>
        </header>

        <section className="admin-panel">
          <div className="admin-add-row">
            <input
              type="text"
              placeholder="動作名稱"
              value={draft.name}
              onChange={(event) => setDraft((item) => ({ ...item, name: event.target.value }))}
            />
            <input
              type="text"
              placeholder="部位"
              value={draft.focus}
              onChange={(event) => setDraft((item) => ({ ...item, focus: event.target.value }))}
            />
            <input
              type="number"
              min="5"
              max="600"
              value={draft.defaultDuration}
              onChange={(event) => setDraft((item) => ({ ...item, defaultDuration: clampSeconds(event.target.value, item.defaultDuration) }))}
            />
            <input
              type="text"
              placeholder="節奏提示"
              value={draft.tempo}
              onChange={(event) => setDraft((item) => ({ ...item, tempo: event.target.value }))}
            />
            <input
              type="color"
              value={draft.accent}
              onChange={(event) => setDraft((item) => ({ ...item, accent: event.target.value }))}
            />
            <input
              className="admin-url"
              type="url"
              placeholder="示範影片 URL"
              value={draft.videoUrl}
              onChange={(event) => setDraft((item) => ({ ...item, videoUrl: event.target.value }))}
            />
            <button className="primary" type="button" onClick={addDraft}><Plus size={18} />新增動作</button>
          </div>

          {exercises.map((exercise) => (
            <article className="admin-video-row" key={exercise.id}>
              <input
                type="text"
                aria-label={`${exercise.name} 名稱`}
                value={exercise.name}
                onChange={(event) => onExerciseChange(exercise.id, { name: event.target.value })}
              />
              <input
                type="text"
                aria-label={`${exercise.name} 部位`}
                value={exercise.focus}
                onChange={(event) => onExerciseChange(exercise.id, { focus: event.target.value })}
              />
              <input
                type="number"
                min="5"
                max="600"
                aria-label={`${exercise.name} 預設秒數`}
                value={exercise.defaultDuration}
                onChange={(event) => onExerciseChange(exercise.id, { defaultDuration: clampSeconds(event.target.value, exercise.defaultDuration) })}
              />
              <input
                type="text"
                aria-label={`${exercise.name} 節奏提示`}
                value={exercise.tempo}
                onChange={(event) => onExerciseChange(exercise.id, { tempo: event.target.value })}
              />
              <input
                type="color"
                aria-label={`${exercise.name} 顏色`}
                value={exercise.accent}
                onChange={(event) => onExerciseChange(exercise.id, { accent: event.target.value })}
              />
              <input
                type="url"
                placeholder={`/${exercise.id}.mp4 或 https://...`}
                aria-label={`${exercise.name} 示範影片網址`}
                value={exercise.videoUrl || ""}
                onChange={(event) => onExerciseChange(exercise.id, { videoUrl: event.target.value })}
              />
              <button className="mini danger" type="button" onClick={() => onExerciseDelete(exercise.id)} title="刪除">
                <Trash2 size={17} />
              </button>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}

function App() {
  const [isAdmin] = useState(() => window.location.pathname.replace(/\/$/, "").endsWith("/admin"));
  const [exercises, setExercises] = useState(loadExercises);
  const [draggingId, setDraggingId] = useState(null);
  const [queue, setQueue] = useState(() =>
    loadExercises().slice(0, 4).map((exercise) => {
      return {
        ...exercise,
        instanceId: uid(),
        duration: exercise.defaultDuration
      };
    })
  );
  const [restSeconds, setRestSeconds] = useState(30);
  const [soundOn, setSoundOn] = useState(true);
  const [voiceOn, setVoiceOn] = useState(true);
  const [status, setStatus] = useState("setup");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [phase, setPhase] = useState("ready");
  const [wakeLock, setWakeLock] = useState(null);
  const intervalRef = useRef(null);
  const runTokenRef = useRef(0);
  const statusRef = useRef(status);
  const wakeLockRef = useRef(null);
  const videoRef = useRef(null);
  const { ensureAudio, beep, speak, speakAsync, stopSpeech } = useAudioCoach();

  const exerciseLibrary = exercises;
  const activeExercise = queue[currentIndex];
  const activeWorkoutSeconds = useMemo(
    () => queue.reduce((sum, item) => sum + item.duration, 0),
    [queue]
  );
  const totalWorkoutSeconds = useMemo(() => {
    const rests = Math.max(0, queue.length - 1) * restSeconds;
    return activeWorkoutSeconds + rests;
  }, [activeWorkoutSeconds, queue.length, restSeconds]);

  useEffect(() => {
    if (import.meta.env.PROD && "navigator" in window && "serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (status === "running" && phase === "exercise") {
      video.muted = false;
      video.play().catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [status, phase, activeExercise?.videoUrl]);

  useEffect(() => {
    setQueue((items) =>
      items
        .map((item) => {
          const updated = exercises.find((exercise) => exercise.id === item.id);
          if (!updated) return null;
          return { ...item, ...updated, instanceId: item.instanceId, duration: item.duration };
        })
        .filter(Boolean)
    );
  }, [exercises]);

  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current);
      stopSpeech();
      if (wakeLockRef.current) wakeLockRef.current.release().catch(() => {});
    };
  }, [stopSpeech]);

  const requestWakeLock = async () => {
    if (!("navigator" in window) || !("wakeLock" in navigator)) return;
    try {
      const lock = await navigator.wakeLock.request("screen");
      wakeLockRef.current = lock;
      setWakeLock(lock);
    } catch {
      setWakeLock(null);
    }
  };

  const addExercise = (exercise) => {
    setQueue((items) => [
      ...items,
      { ...exercise, instanceId: uid(), duration: exercise.defaultDuration }
    ]);
  };

  const removeExercise = (instanceId) => {
    setQueue((items) => items.filter((item) => item.instanceId !== instanceId));
  };

  const reorderQueue = (fromInstanceId, toInstanceId) => {
    setQueue((items) => {
      const fromIndex = items.findIndex((item) => item.instanceId === fromInstanceId);
      const toIndex = items.findIndex((item) => item.instanceId === toInstanceId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items;
      const copy = [...items];
      const [item] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, item);
      return copy;
    });
  };

  const updateDuration = (instanceId, value) => {
    setQueue((items) =>
      items.map((item) =>
        item.instanceId === instanceId ? { ...item, duration: clampSeconds(value, item.duration) } : item
      )
    );
  };

  const updateExercise = (exerciseId, patch) => {
    setExercises((items) => {
      const next = items.map((item) =>
        item.id === exerciseId ? normalizeExercise({ ...item, ...patch }) : item
      );
      saveExercises(next);
      return next;
    });
  };

  const addAdminExercise = (exercise) => {
    setExercises((items) => {
      const next = [...items, normalizeExercise({ ...exercise, id: `custom-${uid()}` })];
      saveExercises(next);
      return next;
    });
  };

  const deleteAdminExercise = (exerciseId) => {
    setExercises((items) => {
      const next = items.filter((item) => item.id !== exerciseId);
      saveExercises(next);
      return next;
    });
  };

  if (isAdmin) {
    return (
      <AdminPage
        exercises={exercises}
        onExerciseChange={updateExercise}
        onExerciseAdd={addAdminExercise}
        onExerciseDelete={deleteAdminExercise}
      />
    );
  }

  const startWorkout = async () => {
    if (!queue.length) return;
    runTokenRef.current += 1;
    ensureAudio().catch(() => {});
    requestWakeLock().catch(() => {});
    statusRef.current = "running";
    setStatus("running");
    setCurrentIndex(0);
    if (videoRef.current) videoRef.current.muted = false;
    beginExercise(0, runTokenRef.current);
  };

  const pauseWorkout = () => {
    runTokenRef.current += 1;
    clearInterval(intervalRef.current);
    stopSpeech();
    statusRef.current = "paused";
    setStatus("paused");
    if (voiceOn) speak("已暫停");
  };

  const resumeWorkout = async () => {
    await ensureAudio();
    runTokenRef.current += 1;
    const token = runTokenRef.current;
    statusRef.current = "running";
    setStatus("running");
    if (phase === "exerciseCue") {
      beginExercise(currentIndex, token);
      return;
    }
    if (phase === "restCue") {
      beginRest(Math.max(0, currentIndex - 1), token);
      return;
    }
    if (voiceOn) await speakAsync("繼續");
    runTimer(phase, phase === "rest" ? Math.max(0, currentIndex - 1) : currentIndex, secondsLeft, token);
  };

  const resetWorkout = () => {
    runTokenRef.current += 1;
    clearInterval(intervalRef.current);
    stopSpeech();
    statusRef.current = "setup";
    setStatus("setup");
    setPhase("ready");
    setCurrentIndex(0);
    setSecondsLeft(0);
  };

  const isRunActive = (token) => token === runTokenRef.current && statusRef.current === "running";

  const announceBeforeTimer = async (text, token) => {
    if (!voiceOn) return true;
    await speakAsync(text);
    return isRunActive(token);
  };

  const beginExercise = async (index, token = runTokenRef.current) => {
    const exercise = queue[index];
    if (!exercise) return;
    setPhase("exerciseCue");
    setCurrentIndex(index);
    setSecondsLeft(exercise.duration);
    const canStart = await announceBeforeTimer(`開始 ${exercise.name}，${exercise.duration} 秒`, token);
    if (!canStart) return;
    setPhase("exercise");
    runTimer("exercise", index, exercise.duration, token);
  };

  const beginRest = async (index, token = runTokenRef.current) => {
    const next = queue[index + 1];
    if (!next) return;
    setPhase("rest");
    setCurrentIndex(index + 1);
    setSecondsLeft(restSeconds);
    const canStart = await announceBeforeTimer(`先休息 ${restSeconds} 秒，接著 ${next.name}`, token);
    if (!canStart) return;
    runTimer("rest", index, restSeconds, token);
  };

  const completeWorkout = () => {
    runTokenRef.current += 1;
    clearInterval(intervalRef.current);
    statusRef.current = "complete";
    setStatus("complete");
    setPhase("complete");
    setSecondsLeft(0);
    if (voiceOn) speak("訓練完成");
    if (wakeLock) wakeLock.release().catch(() => {});
  };

  const runTimer = (nextPhase, index, startingSeconds, token = runTokenRef.current) => {
    clearInterval(intervalRef.current);
    let remaining = startingSeconds;
    if (soundOn && nextPhase === "exercise") beep(true);
    intervalRef.current = setInterval(() => {
      if (!isRunActive(token)) {
        clearInterval(intervalRef.current);
        return;
      }
      remaining -= 1;
      setSecondsLeft(remaining);

      if (remaining > 0 && soundOn && nextPhase === "exercise") {
        beep(remaining <= 3);
      }
      if (voiceOn && nextPhase === "exercise" && remaining > 0 && remaining <= 3) {
        speak(String(remaining));
      }
      if (voiceOn && nextPhase === "rest" && remaining === 3) {
        speak("準備開始");
      }
      if (remaining <= 0) {
        clearInterval(intervalRef.current);
        if (nextPhase === "exercise") {
          if (index < queue.length - 1) beginRest(index, token);
          else completeWorkout();
        } else {
          beginExercise(index + 1, token);
        }
      }
    }, 1000);
  };

  const phaseLabel =
    phase === "exerciseCue" ? "語音提示" : phase === "exercise" ? "動作中" : phase === "rest" ? "休息中" : phase === "complete" ? "完成" : "準備";
  const progressMax = activeExercise ? (phase === "rest" ? restSeconds : activeExercise.duration) : 1;
  const progress = phase === "exerciseCue" ? 0 : progressMax ? Math.max(0, Math.min(100, ((progressMax - secondsLeft) / progressMax) * 100)) : 0;

  const openVideoFullscreen = () => {
    const target = videoRef.current;
    if (!target) return;
    if (target.requestFullscreen) target.requestFullscreen().catch(() => {});
    else if (target.webkitEnterFullscreen) target.webkitEnterFullscreen();
  };

  return (
    <main className="app-shell">
      <section className="studio">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark"><Activity size={24} /></div>
            <div>
              <h1>Fit Queue</h1>
              <p>先排動作，手機用節拍與語音帶你完成</p>
            </div>
          </div>
          <div className="summary">
            <span>{queue.length} 個動作</span>
            <strong>{formatDuration(totalWorkoutSeconds)}</strong>
            <small>動作 {formatDuration(activeWorkoutSeconds)}</small>
          </div>
        </header>

        <div className="workspace">
          <section className="player-panel" aria-label="訓練播放區">
            <div className="status-row">
              <span>{phaseLabel}</span>
              <span>第 {queue.length ? currentIndex + 1 : 0} / {queue.length} 組</span>
            </div>

            <div className="motion-stage" style={{ "--accent": activeExercise?.accent || "#f97316" }}>
              {activeExercise?.videoUrl ? (
                <video
                  ref={videoRef}
                  key={activeExercise.videoUrl}
                  className="demo-video"
                  src={activeExercise.videoUrl}
                  controls
                  loop
                  playsInline
                  preload="metadata"
                />
              ) : (
                <>
                  <div className={`pulse-ring ${status === "running" && phase === "exercise" ? "is-active" : ""}`} />
                  <div className="motion-figure">
                    <Dumbbell size={88} strokeWidth={1.5} />
                  </div>
                  <div className="video-empty">
                    <Video size={18} />
                    <span>尚未加入示範影片</span>
                  </div>
                </>
              )}

              {activeExercise?.videoUrl && (
                <button className="fullscreen-button" type="button" onClick={openVideoFullscreen} title="全螢幕播放">
                  <Expand size={18} />
                </button>
              )}

              <div className="player-hud">
                <div className="now-playing">
                  <span>{phase === "rest" ? "下一個動作" : "目前動作"}</span>
                  <h2>{activeExercise?.name || "尚未選擇"}</h2>
                  <p>{phase === "rest" ? `休息後繼續 ${activeExercise?.name}` : activeExercise?.tempo}</p>
                </div>
                <div className="timer">
                  <strong>{secondsLeft || (activeExercise?.duration ?? 0)}</strong>
                  <span>秒</span>
                </div>
              </div>
            </div>

            <div className="progress-track" aria-hidden="true">
              <div style={{ width: `${progress}%` }} />
            </div>

            <div className="control-row">
              {status === "running" ? (
                <button className="primary" onClick={pauseWorkout}><Pause size={20} />暫停</button>
              ) : status === "paused" ? (
                <button className="primary" onClick={resumeWorkout}><Play size={20} />繼續</button>
              ) : (
                <button className="primary" onClick={startWorkout} disabled={!queue.length}><Play size={20} />開始訓練</button>
              )}
              <button className="icon-button" onClick={resetWorkout} title="重設"><RotateCcw size={20} /></button>
            </div>
          </section>

          <section className="queue-panel" aria-label="運動排序">
            <div className="panel-heading">
              <div>
                <h2>訓練順序</h2>
                <p>依你點選的順序播放，可手動調整秒數與排序</p>
              </div>
              <Settings2 size={22} />
            </div>

            <label className="setting-row">
              <span>動作間休息</span>
              <input
                type="number"
                min="5"
                max="600"
                value={restSeconds}
                onChange={(event) => setRestSeconds(clampSeconds(event.target.value, restSeconds))}
              />
              <small>秒</small>
            </label>

            <div className="toggle-row">
              <button className={soundOn ? "toggle is-on" : "toggle"} onClick={() => setSoundOn((value) => !value)}>
                <Volume2 size={18} />節拍器
              </button>
              <button className={voiceOn ? "toggle is-on" : "toggle"} onClick={() => setVoiceOn((value) => !value)}>
                <Volume2 size={18} />語音提示
              </button>
            </div>

            <div className="queue-list">
              {queue.map((item, index) => (
                <article
                  className={`queue-item ${draggingId === item.instanceId ? "is-dragging" : ""}`}
                  key={item.instanceId}
                  draggable
                  onDragStart={(event) => {
                    setDraggingId(item.instanceId);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", item.instanceId);
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const fromId = event.dataTransfer.getData("text/plain") || draggingId;
                    reorderQueue(fromId, item.instanceId);
                    setDraggingId(null);
                  }}
                  style={{ "--accent": item.accent }}
                >
                  <div className="drag-handle" title="拖曳排序"><GripVertical size={18} /></div>
                  <div className="queue-index">{index + 1}</div>
                  <div className="queue-copy">
                    <strong>{item.name}</strong>
                    <span>{item.focus}</span>
                  </div>
                  <input
                    aria-label={`${item.name} 秒數`}
                    type="number"
                    min="5"
                    max="600"
                    value={item.duration}
                    onChange={(event) => updateDuration(item.instanceId, event.target.value)}
                  />
                  <button className="mini danger" onClick={() => removeExercise(item.instanceId)} title="刪除"><Trash2 size={17} /></button>
                </article>
              ))}
            </div>
          </section>
        </div>

        <section className="library" aria-label="動作庫">
          <div className="panel-heading">
            <div>
              <h2>動作庫</h2>
              <p>點選後會加入訓練順序的最後面</p>
            </div>
          </div>
          <div className="exercise-grid">
            {exerciseLibrary.map((exercise) => (
              <button
                className="exercise-card"
                key={exercise.id}
                style={{ "--accent": exercise.accent }}
                onClick={() => addExercise(exercise)}
              >
                <span>{exercise.focus}</span>
                <strong>{exercise.name}</strong>
                <small>{exercise.defaultDuration} 秒</small>
                <Plus size={20} />
              </button>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

const rootElement = document.getElementById("root");
window.__fitQueueRoot = window.__fitQueueRoot || createRoot(rootElement);
window.__fitQueueRoot.render(<App />);
