import { guideExamples } from "./guide-examples.js";
import { resourceIcon } from "./icons.js";
import { portrait } from "./characters.js";

export function createGuide(dialog, uploadDialog) {
  const $ = (selector) => dialog.querySelector(selector);
  let selected = guideExamples[0],
    returnToUpload = false,
    copyTimer;
  $('[data-guide-icon="carrot"]').innerHTML = resourceIcon("carrot");
  $('[data-guide-icon="energy"]').innerHTML = resourceIcon("energy");
  $(".guide-mascot").innerHTML = portrait(2);
  const code = $("#guide-example-code"),
    tabs = [...dialog.querySelectorAll('[role="tab"]')];
  function highlight(source) {
    code.replaceChildren();
    const tokens = /\/\/[^\n]*|\b(?:package|func|return|var|if|int)\b|\b\d+\b/g;
    let offset = 0;
    for (const match of source.matchAll(tokens)) {
      code.append(document.createTextNode(source.slice(offset, match.index)));
      const token = document.createElement("span");
      token.className = match[0].startsWith("//")
        ? "go-comment"
        : /^\d/.test(match[0])
          ? "go-number"
          : "go-keyword";
      token.textContent = match[0];
      code.append(token);
      offset = match.index + match[0].length;
    }
    code.append(document.createTextNode(source.slice(offset)));
  }
  function choose(id) {
    selected = guideExamples.find((example) => example.id === id);
    highlight(selected.code);
    $("#guide-example-note").textContent = selected.description;
    $("#guide-example-panel").setAttribute("aria-labelledby", `guide-tab-${id}`);
    $("#guide-example-filename").textContent = id === "simple" ? "agent.go" : `${id}.go`;
    $("#guide-copy").textContent = "Copy code";
    clearTimeout(copyTimer);
    tabs.forEach((tab) => {
      const active = tab.dataset.example === id;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
  }
  tabs.forEach((tab, index) => {
    tab.onclick = () => choose(tab.dataset.example);
    tab.onkeydown = (event) => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      tabs[next].focus();
      choose(tabs[next].dataset.example);
    };
  });
  $("#guide-copy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(selected.code);
      $("#guide-copy").textContent = "Copied ✓";
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      $("#guide-copy").textContent = "Code selected";
    }
    copyTimer = setTimeout(() => {
      $("#guide-copy").textContent = "Copy code";
    }, 2200);
  };
  $("#guide-download-example").onclick = () => {
    const url = URL.createObjectURL(new Blob([selected.code], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = selected.id === "simple" ? "agent.go" : `${selected.id}.go`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const scroll = $(".guide-scroll"),
    links = [...dialog.querySelectorAll(".guide-nav a")];
  const sections = links.map((link) => $(link.getAttribute("href")));
  function markSection() {
    const top = scroll.getBoundingClientRect().top + (innerWidth <= 730 ? 90 : 45);
    let active = 0;
    sections.forEach((section, i) => {
      if (section.getBoundingClientRect().top <= top) active = i;
    });
    if (scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 3)
      active = sections.length - 1;
    links.forEach((link, i) =>
      i === active
        ? link.setAttribute("aria-current", "location")
        : link.removeAttribute("aria-current"),
    );
  }
  let queued = false;
  scroll.addEventListener(
    "scroll",
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        markSection();
      });
    },
    { passive: true },
  );
  links.forEach(
    (link) =>
      (link.onclick = (event) => {
        event.preventDefault();
        const target = $(link.getAttribute("href"));
        scroll.scrollTo({
          top:
            scroll.scrollTop +
            target.getBoundingClientRect().top -
            scroll.getBoundingClientRect().top -
            (innerWidth <= 730 ? 76 : 24),
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        });
      }),
  );
  $("#guide-open-upload").onclick = () => {
    returnToUpload = false;
    dialog.close();
    uploadDialog.showModal();
  };
  dialog.addEventListener("close", () => {
    clearTimeout(copyTimer);
    if (returnToUpload) {
      returnToUpload = false;
      uploadDialog.showModal();
    }
  });
  choose("simple");
  return {
    setGoUploads(available) {
      $("#guide-open-upload").disabled = !available;
      if (available) $("#guide-open-upload").removeAttribute("aria-describedby");
      else $("#guide-open-upload").setAttribute("aria-describedby", "guide-upload-note");
      $("#guide-upload-note").hidden = available;
    },
    open() {
      returnToUpload = uploadDialog.open;
      if (returnToUpload) uploadDialog.close();
      dialog.showModal();
      $("#guide-copy").textContent = "Copy code";
      dialog.scrollTop = 0;
      scroll.scrollTop = 0;
      $(".guide-nav").scrollLeft = 0;
      markSection();
      $(".close").focus({ preventScroll: true });
    },
  };
}
