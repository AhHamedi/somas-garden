// Large runs store a stopped agent's diagnostic once, with the first frame
// where it applies. Restore the usual per-seat state at the reading boundary.
export function expandReplay(trace) {
  if (!Array.isArray(trace.errorStarts)) return trace;
  trace.errorStarts.forEach((start, seat) => {
    if (start < 0) return;
    const error = trace.agents[seat].error;
    for (let i = start; i < trace.frames.length; i++) {
      trace.frames[i].agents[seat].error = error;
    }
  });
  delete trace.errorStarts;
  return trace;
}
