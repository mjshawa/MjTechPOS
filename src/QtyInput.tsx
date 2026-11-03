import React, { useEffect, useState } from 'react';

/** Type a quantity (e.g. 30 crates) instead of tapping + thirty times. Applied on Enter or when you tap away. */
export default function QtyInput({ value, max, onCommit }: { value: number; max?: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = parseInt(text, 10);
    if (!n || n < 1) { setText(String(value)); return; }
    const capped = max !== undefined ? Math.min(n, max) : n;
    setText(String(capped));
    if (capped !== value) onCommit(capped);
  };
  return (
    <input
      value={text} inputMode="numeric" aria-label="Quantity" title={max !== undefined ? `Up to ${max} in stock` : undefined}
      onChange={e => setText(e.target.value.replace(/\D/g, '').slice(0, 5))}
      onFocus={e => e.target.select()} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className="w-12 text-center text-xs font-bold text-slate-200 bg-transparent focus:outline-none focus:bg-slate-800 rounded"
    />
  );
}
