// src/components/ProgressBar.jsx
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './ProgressBar.css';

export default function ProgressBar(){
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [pct, setPct] = useState(0);
  const timerRef = useRef(null);

  // when location changes, start "fake" progress
  useEffect(() => {
    // start
    setVisible(true);
    setPct(5);

    // increment gently up to 85% until "done"
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setPct(prev => {
        // increase quickly at start, slow later
        const step = prev < 40 ? 8 : prev < 70 ? 4 : 1;
        return Math.min(prev + step, 85);
      });
    }, 150);

    return () => {
      clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]); // run on navigation

  // once component tree has painted, finish the bar
  useEffect(() => {
    // when pct reaches <=85 and we don't want to wait: finish after a short delay
    if (!visible) return;
    const finishTimer = setTimeout(() => {
      setPct(100);
      // hide after animation
      setTimeout(() => {
        setVisible(false);
        setPct(0);
      }, 300);
      clearInterval(timerRef.current);
    }, 350); // small delay to allow lazy-loaded component to mount
    return () => clearTimeout(finishTimer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // If page is slow to load, you'd call setPct(100) when your data fetch finishes.
  // That requires more integration with your loaders / data fetching.

  if (!visible) return null;

  return (
    <div className="top-progress-container" aria-hidden>
      <div
        className="top-progress-bar"
        style={{ width: `${pct}%`, transform: `translateX(${pct < 100 ? 0 : 0})` }}
      />
    </div>
  );
}
