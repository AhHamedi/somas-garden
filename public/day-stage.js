const stages = ["dawn", "morning", "afternoon", "evening"];

// Supper is a playback step inside a recorded growth frame. Earlier traces
// close the day at growth itself and can then show a recorded death.
export function dayStageFor(frame, version) {
  if (frame.motion?.kind === "supper") return "evening";
  switch (frame.phase) {
    case "start":
      return "dawn";
    case "harvest":
      return "morning";
    case "contribute":
      return "afternoon";
    case "grow":
      return version >= 3 ? "afternoon" : "evening";
    case "supper":
    case "death":
      return "evening";
    default:
      return "ready";
  }
}

export function createDayStage(root) {
  const items = Array.from(root.querySelectorAll("[data-period]"));
  let previous;
  return (frame, version) => {
    const stage = dayStageFor(frame, version);
    if (stage === previous) return stage;
    previous = stage;
    root.dataset.stage = stage;
    const current = stages.indexOf(stage);
    items.forEach((item, index) => {
      item.dataset.state =
        index < current ? "done" : index === current ? "current" : "upcoming";
      if (index === current) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
    return stage;
  };
}
