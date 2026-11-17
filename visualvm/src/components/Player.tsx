import { useEffect, useRef, useState } from 'react';
import { formatDuration } from '../lib/util';
import { Icon } from './Icons';

const BARS = 88;
const RATES = [1, 1.25, 1.5, 2] as const;

function syntheticPeaks(seed: string, count: number): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const peaks: number[] = [];
  for (let i = 0; i < count; i += 1) {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    const noise = (hash % 1000) / 1000;
    peaks.push(0.2 + Math.abs(Math.sin(i / 4.1)) * 0.4 + noise * 0.4);
  }
  return peaks;
}

type Props = {
  url: string | null;
  peaks?: number[];
  durationMs: number;
  seed: string;
};

export function Player({ url, peaks, durationMs, seed }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(durationMs / 1000);
  const [rate, setRate] = useState<number>(1);

  useEffect(() => {
    setPlaying(false);
    setTime(0);
    setDuration(durationMs / 1000);
  }, [url, durationMs]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const audio = audioRef.current;
      if (audio) setTime(audio.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const total = duration > 0 ? duration : durationMs / 1000;
  const progress = total > 0 ? Math.min(1, time / total) : 0;
  const bars = peaks && peaks.length > 4 ? peaks : syntheticPeaks(seed, BARS);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  function nudge(seconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const limit = audio.duration || total;
    audio.currentTime = Math.max(0, Math.min(limit, audio.currentTime + seconds));
    setTime(audio.currentTime);
  }

  function seek(fraction: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const limit = audio.duration || total;
    if (!limit) return;
    audio.currentTime = Math.max(0, Math.min(limit, fraction * limit));
    setTime(audio.currentTime);
  }

  function cycleRate() {
    const audio = audioRef.current;
    const index = RATES.indexOf(rate as (typeof RATES)[number]);
    const next = RATES[(index + 1) % RATES.length];
    setRate(next);
    if (audio) audio.playbackRate = next;
  }

  return (
    <div className="player">
      <audio
        ref={audioRef}
        src={url ?? undefined}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value) && value > 0) setDuration(value);
          event.currentTarget.playbackRate = rate;
        }}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onEnded={() => {
          setPlaying(false);
          setTime(0);
        }}
      />

      <div
        className="wave"
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          seek((event.clientX - rect.left) / rect.width);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') nudge(5);
          if (event.key === 'ArrowLeft') nudge(-5);
        }}
      >
        {bars.map((peak, index) => (
          <span
            key={index}
            className={`wave-bar${index / bars.length <= progress ? ' is-played' : ''}`}
            style={{ height: `${Math.round(10 + peak * 46)}px` }}
          />
        ))}
      </div>

      <div className="player-row">
        <button type="button" className="icon-btn" onClick={() => nudge(-5)} aria-label="Back 5 seconds">
          <Icon name="back5" />
        </button>
        <button type="button" className="play-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
          <Icon name={playing ? 'pause' : 'play'} size={22} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => nudge(5)}
          aria-label="Forward 5 seconds"
        >
          <Icon name="forward5" />
        </button>

        <span className="player-time">
          {formatDuration(time * 1000)}
          <em>/</em>
          {formatDuration(total * 1000)}
        </span>

        <button type="button" className="rate-btn" onClick={cycleRate} aria-label="Playback speed">
          {rate}×
        </button>
      </div>
    </div>
  );
}
