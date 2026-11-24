// Motion and sound for the page. Nothing here decides anything: it only shows and
// sounds what the desk already decided. Every effect is skipped when the visitor
// prefers reduced motion, and sound has its own switch.

/**
 * The page's sound, scheme wheel and animations.
 */
export class Effects {
  static NS = "http://www.w3.org/2000/svg";

  /**
   * :param root: The document.
   * :param storage: A localStorage-like object, or null.
   * :param key: The storage key for the sound switch.
   */
  constructor(root, storage, key) {
    this.root = root;
    this.view = root.defaultView;
    this.storage = storage;
    this.key = key;
    this.audio = null;
    this.muted = storage ? storage.getItem(key) === "off" : false;
    this.still = Boolean(this.view.matchMedia && this.view.matchMedia("(prefers-reduced-motion: reduce)").matches);
    this.petals = new Map();
  }

  // ---- Sound. Short synthesised tones; no audio files. ----

  /**
   * Turn sound on or off and remember the choice.
   *
   * :return: True when sound is now on.
   */
  toggleSound() {
    this.muted = !this.muted;
    if (this.storage) {
      this.storage.setItem(this.key, this.muted ? "off" : "on");
    }
    if (!this.muted) {
      this.chime(2);
    }
    return !this.muted;
  }

  /**
   * Play one soft tone.
   *
   * :param frequency: Pitch in hertz.
   * :param delay: Seconds from now.
   * :param length: Seconds the tone rings.
   * :param level: Peak gain.
   * :param shape: Oscillator type.
   */
  tone(frequency, delay, length, level, shape = "sine") {
    if (this.muted) {
      return;
    }
    const Context = this.view.AudioContext || this.view.webkitAudioContext;
    if (!Context) {
      return;
    }
    try {
      this.audio = this.audio || new Context();
      if (this.audio.state === "suspended") {
        this.audio.resume();
      }
      const at = this.audio.currentTime + delay;
      const oscillator = this.audio.createOscillator();
      const gain = this.audio.createGain();
      oscillator.type = shape;
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(level, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
      oscillator.connect(gain).connect(this.audio.destination);
      oscillator.start(at);
      oscillator.stop(at + length + 0.05);
    } catch (error) {
      // A browser that refuses audio stays silent; the page works the same.
      this.muted = true;
    }
  }

  /** An answer was recorded. */
  tick() {
    this.tone(1320, 0, 0.07, 0.05, "triangle");
    this.tone(1980, 0.012, 0.05, 0.02);
  }

  /**
   * Schemes became likely: a rising figure, one note per scheme, up to four.
   *
   * :param count: How many schemes were gained.
   */
  chime(count) {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const total = Math.max(2, Math.min(notes.length, count + 1));
    for (let index = 0; index < total; index += 1) {
      this.tone(notes[index], index * 0.09, 0.9, 0.07);
      this.tone(notes[index] * 2, index * 0.09, 0.5, 0.015);
    }
  }

  /** A scheme was ruled out or lost. */
  drop() {
    this.tone(330, 0, 0.22, 0.04, "triangle");
    this.tone(247, 0.08, 0.3, 0.035, "triangle");
  }

  /** Something joined the plan or was ticked. */
  pop() {
    this.tone(740, 0, 0.12, 0.05);
    this.tone(1110, 0.06, 0.2, 0.04);
  }

  /** Something was refused. */
  refuse() {
    this.tone(196, 0, 0.18, 0.05, "square");
  }

  /** Everything was erased. */
  sweep() {
    for (let index = 0; index < 6; index += 1) {
      this.tone(880 - index * 110, index * 0.05, 0.18, 0.035, "triangle");
    }
  }

  // ---- Motion. ----

  /**
   * Count a number up or down to its new value.
   *
   * :param element: The element holding the number.
   * :param value: The new value.
   */
  count(element, value) {
    if (!element) {
      return;
    }
    const from = Number(element.dataset.value || 0);
    element.dataset.value = String(value);
    if (this.still || from === value) {
      element.textContent = String(value);
      return;
    }
    const started = this.view.performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - started) / 520);
      const eased = 1 - Math.pow(1 - progress, 3);
      // A newer count took over.
      if (element.dataset.value !== String(value)) {
        return;
      }
      element.textContent = String(Math.round(from + (value - from) * eased));
      if (progress < 1) {
        this.view.requestAnimationFrame(step);
      }
    };
    this.view.requestAnimationFrame(step);
    element.animate([{transform: "scale(1.35)"}, {transform: "scale(1)"}], {duration: 420, easing: "cubic-bezier(.2,1.6,.4,1)"});
  }

  /**
   * Throw a small ring of sparks out of an element.
   *
   * :param element: The element to burst from.
   * :param color: A CSS color.
   */
  burst(element, color) {
    if (this.still || !element) {
      return;
    }
    const box = element.getBoundingClientRect();
    if (!box.width) {
      return;
    }
    const layer = this.root.createElement("div");
    layer.className = "burst";
    layer.style.left = `${box.left + box.width / 2}px`;
    layer.style.top = `${box.top + box.height / 2}px`;
    this.root.body.append(layer);
    const sparks = 14;
    for (let index = 0; index < sparks; index += 1) {
      const spark = this.root.createElement("i");
      spark.style.background = index % 3 ? color : "var(--gold)";
      layer.append(spark);
      const angle = (index / sparks) * Math.PI * 2;
      const reach = 46 + (index % 4) * 14;
      spark.animate([
        {transform: "translate(0, 0) scale(1)", opacity: 1},
        {transform: `translate(${Math.cos(angle) * reach}px, ${Math.sin(angle) * reach}px) scale(0)`, opacity: 0},
      ], {duration: 720, easing: "cubic-bezier(.1,.8,.3,1)", fill: "forwards"});
    }
    this.view.setTimeout(() => layer.remove(), 800);
  }

  /**
   * Remember where the result cards are, before they are redrawn.
   *
   * :param scope: The element holding the cards.
   * :return: Each card's box and group by id, and which were open.
   */
  capture(scope) {
    const seen = new Map();
    for (const card of scope.querySelectorAll(".card")) {
      const box = card.getBoundingClientRect();
      seen.set(card.id, {left: box.left, top: box.top, visible: box.width > 0, open: card.open, verdict: card.dataset.verdict});
    }
    return seen;
  }

  /**
   * Glide the redrawn cards from where they were to where they are.
   *
   * :param scope: The element holding the cards.
   * :param seen: What capture() returned.
   */
  settle(scope, seen) {
    let fresh = 0;
    for (const card of scope.querySelectorAll(".card")) {
      const before = seen.get(card.id);
      if (before && before.open) {
        card.open = true;
      }
      if (this.still) {
        continue;
      }
      const box = card.getBoundingClientRect();
      if (!box.width) {
        continue;
      }
      if (!before || !before.visible) {
        card.animate([{opacity: 0, transform: "translateY(18px) scale(.98)"}, {opacity: 1, transform: "none"}],
          {duration: 480, delay: Math.min(fresh, 12) * 45, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards"});
        fresh += 1;
        continue;
      }
      const dx = before.left - box.left;
      const dy = before.top - box.top;
      if (dx || dy) {
        card.animate([{transform: `translate(${dx}px, ${dy}px)`}, {transform: "none"}], {duration: 520, easing: "cubic-bezier(.2,.8,.2,1)"});
      }
      if (before.verdict !== card.dataset.verdict) {
        card.classList.add("is-moved");
        this.view.setTimeout(() => card.classList.remove("is-moved"), 1600);
      }
    }
  }

  /**
   * Fade sections in as they scroll into view.
   */
  reveal() {
    const targets = this.root.querySelectorAll("[data-reveal]");
    if (this.still || !this.view.IntersectionObserver) {
      for (const target of targets) {
        target.classList.add("is-seen");
      }
      return;
    }
    const watcher = new this.view.IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-seen");
          watcher.unobserve(entry.target);
        }
      }
    }, {threshold: 0.08});
    for (const target of targets) {
      watcher.observe(target);
    }
  }

  // ---- The scheme wheel: one petal per scheme, coloured by its verdict. ----

  /**
   * Create an SVG element.
   *
   * :param name: The tag name.
   * :param attributes: Attributes by name.
   * :return: The element.
   */
  svg(name, attributes) {
    const element = this.root.createElementNS(Effects.NS, name);
    for (const [key, value] of Object.entries(attributes)) {
      element.setAttribute(key, value);
    }
    return element;
  }

  /**
   * Draw the wheel once.
   *
   * :param host: The svg element.
   * :param schemes: The desk's schemes.
   * :param onPick: Called with a scheme id when its petal is selected.
   * :param onHover: Called with a scheme, or null, as the pointer moves.
   */
  buildWheel(host, schemes, onPick, onHover) {
    if (!host) {
      return;
    }
    const total = schemes.length;
    const width = Math.min(30, ((2 * Math.PI * 132) / total) * 0.46);
    const outer = this.svg("g", {class: "wheel-outer"});
    schemes.forEach((scheme, index) => {
      const petal = this.svg("path", {
        class: "petal petal-needs_info",
        d: `M0,-96 C${width},-118 ${width},-158 0,-184 C${-width},-158 ${-width},-118 0,-96Z`,
        transform: `rotate(${(index * 360) / total})`,
        style: `--i:${index}`,
      });
      petal.addEventListener("click", () => onPick(scheme.id));
      petal.addEventListener("pointerenter", () => onHover(scheme));
      petal.addEventListener("pointerleave", () => onHover(null));
      this.petals.set(scheme.id, petal);
      outer.append(petal);
    });
    const middle = this.svg("g", {class: "wheel-middle"});
    for (let index = 0; index < 16; index += 1) {
      middle.append(this.svg("path", {class: "leaf", d: "M0,-58 C9,-68 9,-80 0,-90 C-9,-80 -9,-68 0,-58Z", transform: `rotate(${index * 22.5})`}));
    }
    const rings = this.svg("g", {class: "wheel-rings"});
    rings.append(this.svg("circle", {r: 192, class: "ring ring-dots"}), this.svg("circle", {r: 93, class: "ring"}), this.svg("circle", {r: 54, class: "ring ring-dash"}));
    host.append(rings, outer, middle);
  }

  /**
   * Colour the petals by verdict.
   *
   * :param results: The engine's results.
   */
  paintWheel(results) {
    for (const result of results) {
      const petal = this.petals.get(result.id);
      if (petal) {
        petal.setAttribute("class", `petal petal-${result.verdict}`);
      }
    }
  }
}
