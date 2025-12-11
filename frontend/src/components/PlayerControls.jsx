import React from 'react';

export default function PlayerControls({ playing, onToggle, onNext, onPrev }) {
  return (
    <div className="flex items-center gap-4">
      <button onClick={onPrev} className="p-2 border rounded">Prev</button>
      <button onClick={onToggle} className="px-4 py-2 bg-orange-500 rounded">
        {playing ? 'Pause' : 'Play'}
      </button>
      <button onClick={onNext} className="p-2 border rounded">Next</button>
    </div>
  );
}
