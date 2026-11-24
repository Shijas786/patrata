// The page script. It owns the one page object, App.page, which the page's own form and
// buttons and the assistant's actions (site-actions.js) both call.
import { DESK, SCHEMES } from "./js/desk-data.js";
import { Desk } from "./js/desk.js";
import { Effects } from "./js/effects.js";
import { Fields } from "./js/fields.js";

/**
 * The page: the questions, the results, the plan, and one method per operation.
 */
export class Page {
  static DISCLAIMER = "This is a guide, not a decision. Rules are summarised from official guidelines and can change; the department that runs a scheme decides. Always confirm on the scheme's official page before you apply.";

  // Questions with this many choices or fewer show buttons, not a list.
  static CHIP_LIMIT = 6;

  static VERDICTS = {
    eligible: {title: "You likely qualify", empty: "Nothing yet. Answer a few more questions."},
    needs_info: {title: "Need more answers", empty: "No scheme is waiting on an answer."},
    not_eligible: {title: "Does not fit right now", empty: "No scheme is ruled out."},
  };

  /**
   * :param desk: The desk logic with the visitor's answers.
   * :param root: The document, or null to run without a page (Node tests, the bridge).
   */
  constructor(desk, root) {
    this.desk = desk;
    this.root = root;
    this.highlighted = [];
    this.fx = root ? new Effects(root, desk.storage, `${desk.config.storageKey}.sound`) : null;
    // The likely schemes at the last draw, to sound and mark what changed.
    this.likely = null;
    // Counts sample fills and erases, so a fill in progress stops when either happens.
    this.run = 0;
  }

  /**
   * Choose how to scroll.
   *
   * :return: "auto" when the visitor prefers reduced motion or there is no page, else "smooth".
   */
  scrolling() {
    return this.fx && !this.fx.still ? "smooth" : "auto";
  }

  /**
   * Find one of the page's elements.
   *
   * :param selector: A CSS selector.
   * :return: The element, or null without a page.
   */
  find(selector) {
    return this.root ? this.root.querySelector(selector) : null;
  }

  // ---- Operations. The page's controls and the assistant's actions call these. ----

  /**
   * Read what the page knows and shows, as plain data.
   *
   * :return: The desk, its schemes, the visitor's answers in coarse bands, the plan and
   *   the page's own notes.
   */
  getState() {
    const now = new Date();
    const partner = this.desk.config.partner;
    return {
      today: now.toISOString().slice(0, 10),
      todayReadable: now.toLocaleDateString("en-IN", {weekday: "short", day: "numeric", month: "short", year: "numeric"}),
      desk: {name: this.desk.config.brand, covers: this.desk.config.scope},
      schemes: this.desk.catalogue(),
      answersSoFar: this.desk.coarseProfile(),
      answersNote: "Ages, incomes and land sizes are given as ranges. The exact figures stay in the visitor's browser.",
      unansweredQuestions: Fields.LIST.filter((field) => !(field.id in this.desk.facts)).map((field) => ({field: field.id, question: field.question})),
      plan: this.desk.planView(),
      version: this.desk.version,
      pageNotes: {
        disclaimer: Page.DISCLAIMER,
        privacy: "Answers are saved only in this browser. This site has no server and asks for no name, ID number, phone or address.",
        partner: partner ? {name: partner.label, covers: partner.what, link: partner.pageUrl} : null,
      },
    };
  }

  /**
   * Check the schemes against the saved answers, plus optional facts for this check only.
   * Changes nothing on the page.
   *
   * :param facts: Optional extra facts by field id.
   * :param useSaved: False to ignore the visitor's saved answers.
   * :return: Verdicts with reasons and the most useful next questions, or ok false.
   */
  checkEligibility(facts, useSaved = true) {
    const check = this.desk.check(facts, useSaved);
    if (!check.ok) {
      return check;
    }
    return {
      ok: true,
      ...this.desk.describe(check.results),
      mostUsefulNextQuestions: this.desk.nextQuestions(check.results),
      note: Page.DISCLAIMER,
    };
  }

  /**
   * Read one scheme's full record.
   *
   * :param id: The scheme id.
   * :return: The scheme, or ok false.
   */
  getSchemeDetails(id) {
    return this.desk.details(id);
  }

  /**
   * Fill in answers on the page.
   *
   * :param facts: Answers by field id; null clears one.
   * :return: The new verdict counts and version, or ok false with nothing changed.
   */
  setAnswers(facts) {
    const result = this.desk.setFacts(facts);
    if (!result.ok) {
      return result;
    }
    this.clearHighlights();
    this.render();
    const check = this.desk.check();
    return {ok: true, filledIn: result.changed, counts: this.desk.describe(check.results).counts, version: result.version};
  }

  /**
   * Point the visitor to questions on the page, so they answer there and not in the chat.
   *
   * :param fields: The field ids to highlight.
   * :return: The highlighted questions, or ok false.
   */
  askOnPage(fields) {
    const questions = [];
    for (const id of fields) {
      if (!Fields.BY_ID[id]) {
        return {ok: false, reason: `There is no question called "${id}".`, field: "fields"};
      }
      questions.push(Fields.BY_ID[id].question);
    }
    if (!questions.length) {
      return {ok: false, reason: "Name at least one question to highlight.", field: "fields"};
    }
    this.clearHighlights();
    this.highlighted = [...fields];
    this.render();
    const first = this.find(`#q-${fields[0]}`);
    if (first && first.scrollIntoView) {
      first.scrollIntoView({behavior: this.scrolling(), block: "center"});
    }
    return {ok: true, highlighted: questions, note: "The questions are marked on the page. The visitor answers there; read the state again after they do."};
  }

  /**
   * Add a scheme to the plan and show it.
   *
   * :param id: The scheme id.
   * :return: The plan with its merged document checklist, or ok false.
   */
  addToPlan(id) {
    const result = this.desk.addToPlan(id);
    if (result.ok) {
      this.render();
    }
    return result;
  }

  /**
   * Remove a scheme from the plan.
   *
   * :param id: The scheme id.
   * :return: The plan, or ok false.
   */
  removeFromPlan(id) {
    const result = this.desk.removeFromPlan(id);
    if (result.ok) {
      this.render();
    }
    return result;
  }

  /**
   * Say what erasing would remove. Changes nothing.
   *
   * :return: The counts, or ok false when nothing is saved.
   */
  checkErase() {
    return this.desk.checkErase();
  }

  /**
   * Erase every answer and the plan from this browser.
   *
   * :return: What was erased, or ok false when nothing was saved.
   */
  eraseMyDetails() {
    const result = this.desk.erase();
    this.run += 1;
    if (result.ok) {
      this.clearHighlights();
      this.render();
      this.say("Your answers and plan were erased from this browser.");
      if (this.fx) {
        this.fx.sweep();
      }
    }
    return result;
  }

  // ---- Rendering. ----

  /**
   * Forget which questions were highlighted.
   */
  clearHighlights() {
    this.highlighted = [];
  }

  /**
   * Show a short status message under the form.
   *
   * :param text: The message.
   */
  say(text) {
    const status = this.find("#form-status");
    if (status) {
      status.textContent = text;
    }
  }

  /**
   * Build the question form once.
   */
  buildForm() {
    const form = this.find("#questions");
    if (!form) {
      return;
    }
    for (const group of Fields.GROUPS) {
      const set = this.root.createElement("fieldset");
      set.className = "group";
      const legend = this.root.createElement("legend");
      legend.textContent = group.title;
      set.append(legend);
      for (const field of Fields.LIST.filter((entry) => entry.group === group.id)) {
        set.append(this.buildQuestion(field));
      }
      form.append(set);
    }
    form.addEventListener("change", (event) => this.onAnswer(event));
  }

  /**
   * Build one question's row.
   *
   * :param field: The field definition.
   * :return: The row element.
   */
  buildQuestion(field) {
    const row = this.root.createElement("div");
    row.className = `question question-${field.type}`;
    row.id = `q-${field.id}`;
    const label = this.root.createElement("label");
    label.textContent = field.question;
    label.htmlFor = `f-${field.id}`;
    let control = null;
    const choices = field.type === "boolean"
      ? [{value: "true", label: "Yes"}, {value: "false", label: "No"}]
      : field.options;
    if (field.type === "number") {
      control = this.root.createElement("input");
      control.type = "number";
      control.min = field.min;
      control.max = field.max;
      control.step = field.integer ? "1" : "any";
      control.inputMode = field.integer ? "numeric" : "decimal";
      control.placeholder = "Type a number";
    } else if (choices.length <= Page.CHIP_LIMIT) {
      // Few choices: one button each. Selecting the chosen one again clears the answer.
      const label = this.root.createElement("span");
      label.className = "q-label";
      label.id = `l-${field.id}`;
      label.textContent = field.question;
      control = this.root.createElement("div");
      control.className = "chips";
      control.setAttribute("role", "group");
      control.setAttribute("aria-labelledby", label.id);
      for (const choice of choices) {
        const chip = this.root.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.dataset.value = choice.value;
        chip.setAttribute("aria-pressed", "false");
        chip.textContent = choice.label;
        chip.addEventListener("click", () => {
          const chosen = chip.getAttribute("aria-pressed") === "true";
          this.answer(field.id, chosen ? "" : choice.value, chip);
        });
        control.append(chip);
      }
      control.id = `f-${field.id}`;
      row.replaceChildren(label, control);
      if (field.hint) {
        const hint = this.root.createElement("small");
        hint.textContent = field.hint;
        row.append(hint);
      }
      return row;
    } else {
      control = this.root.createElement("select");
      const blank = this.root.createElement("option");
      blank.value = "";
      blank.textContent = "Choose…";
      control.append(blank);
      for (const option of choices) {
        const element = this.root.createElement("option");
        element.value = option.value;
        element.textContent = option.label;
        control.append(element);
      }
    }
    control.id = `f-${field.id}`;
    control.name = field.id;
    row.append(label, control);
    if (field.hint) {
      const hint = this.root.createElement("small");
      hint.textContent = field.hint;
      row.append(hint);
    }
    return row;
  }

  /**
   * Record an answer the visitor gave in the form, through the same operation the
   * assistant uses.
   *
   * :param event: The form's change event.
   */
  onAnswer(event) {
    const control = event.target;
    if (!control.name) {
      return;
    }
    const result = this.answer(control.name, control.value, control);
    control.setCustomValidity(result.ok ? "" : result.reason);
    if (!result.ok) {
      control.reportValidity();
    }
  }

  /**
   * Record one answer from the page's own controls, with its sound.
   *
   * :param id: The field id.
   * :param value: The answer; an empty string clears it.
   * :param control: The control the visitor used.
   * :return: What setAnswers returned.
   */
  answer(id, value, control) {
    const result = this.setAnswers({[id]: value});
    this.say(result.ok ? "" : result.reason);
    if (result.ok) {
      this.fx.tick();
    } else {
      this.fx.refuse();
    }
    if (!result.ok && !this.fx.still) {
      control.animate([{transform: "translateX(-6px)"}, {transform: "translateX(6px)"}, {transform: "none"}], {duration: 240});
    }
    return result;
  }

  /**
   * Redraw the form values, the results and the plan from the desk.
   */
  render() {
    if (!this.root) {
      return;
    }
    for (const field of Fields.LIST) {
      const control = this.find(`#f-${field.id}`);
      const value = this.desk.facts[field.id];
      const text = value === undefined ? "" : String(value);
      // Never overwrite what the visitor is typing.
      if (control && control.classList.contains("chips")) {
        for (const chip of control.children) {
          chip.setAttribute("aria-pressed", String(chip.dataset.value === text));
        }
      } else if (control && control !== this.root.activeElement && control.value !== text) {
        control.value = text;
      }
      const row = this.find(`#q-${field.id}`);
      if (row) {
        row.classList.toggle("is-asked", this.highlighted.includes(field.id));
        row.classList.toggle("is-answered", value !== undefined);
      }
    }
    const answered = Object.keys(this.desk.facts).length;
    this.find("#progress").textContent = `${answered} of ${Fields.LIST.length} answered`;
    const share = `${Math.round((answered / Fields.LIST.length) * 100)}%`;
    this.find("#progress-bar").style.width = share;
    this.find("#page-progress").style.width = share;
    this.find("#erase").disabled = !this.desk.checkErase().ok;
    this.renderResults();
    this.renderPlan();
  }

  /**
   * Redraw the three result columns.
   */
  renderResults() {
    const check = this.desk.check();
    const groups = {eligible: [], needs_info: [], not_eligible: []};
    for (const result of check.results) {
      groups[result.verdict].push(result);
    }
    const answered = Object.keys(this.desk.facts).length;
    this.find("#summary").textContent = answered
      ? `${groups.eligible.length} likely fit · ${groups.needs_info.length} need an answer · ${groups.not_eligible.length} ruled out`
      : `Answer any question to begin. ${this.desk.schemes.length} schemes are waiting.`;
    const scope = this.find("#results");
    const seen = this.fx.capture(scope);
    for (const [verdict, results] of Object.entries(groups)) {
      const list = this.find(`#list-${verdict}`);
      list.replaceChildren();
      this.fx.count(this.find(`#count-${verdict}`), results.length);
      this.fx.count(this.find(`#hero-count-${verdict}`), results.length);
      if (!results.length) {
        const empty = this.root.createElement("p");
        empty.className = "empty";
        empty.textContent = Page.VERDICTS[verdict].empty;
        list.append(empty);
      }
      for (const result of results) {
        list.append(this.buildCard(result));
      }
    }
    this.fx.settle(scope, seen);
    this.fx.paintWheel(check.results);
    this.fx.count(this.find("#hero-eligible"), groups.eligible.length);
    this.fx.count(this.find("#dock-eligible"), groups.eligible.length);
    this.fx.count(this.find("#dock-open"), groups.needs_info.length);
    this.celebrate(groups.eligible.map((result) => result.id));
  }

  /**
   * Sound and mark the schemes that became likely, or were lost, since the last draw.
   *
   * :param likely: The ids of the schemes that are likely now.
   */
  celebrate(likely) {
    const before = this.likely;
    this.likely = likely;
    // The first draw shows what was saved; nothing changed.
    if (!before) {
      return;
    }
    const gained = likely.filter((id) => !before.includes(id));
    if (gained.length) {
      this.fx.chime(gained.length);
      this.fx.burst(this.find("#count-eligible"), "var(--ok)");
      this.fx.burst(this.find("#hero-eligible"), "var(--ok)");
    } else if (before.length > likely.length) {
      this.fx.drop();
    }
  }

  /**
   * Build one scheme's result card.
   *
   * :param result: The engine's result for the scheme.
   * :return: The card element.
   */
  buildCard(result) {
    const scheme = this.desk.byId[result.id];
    const card = this.root.createElement("details");
    card.className = `card card-${result.verdict}`;
    card.id = `card-${scheme.id}`;
    card.dataset.verdict = result.verdict;
    const summary = this.root.createElement("summary");
    const name = this.root.createElement("span");
    name.className = "card-name";
    name.textContent = scheme.name;
    const tag = this.root.createElement("span");
    tag.className = "card-tag";
    tag.textContent = scheme.category;
    const benefit = this.root.createElement("span");
    benefit.className = "card-benefit";
    benefit.textContent = scheme.benefit;
    // One segment per condition: met, not met or not known yet.
    const meter = this.root.createElement("span");
    meter.className = "meter";
    meter.setAttribute("aria-hidden", "true");
    for (const item of result.criteria) {
      const segment = this.root.createElement("i");
      segment.className = `segment-${item.outcome}`;
      meter.append(segment);
    }
    summary.append(name, tag, benefit, meter);
    card.append(summary);

    const why = this.root.createElement("ul");
    why.className = "criteria";
    for (const item of result.criteria) {
      const line = this.root.createElement("li");
      line.className = `criterion criterion-${item.outcome}`;
      const mark = this.root.createElement("b");
      mark.textContent = {pass: "✓", fail: "✕", unknown: "?"}[item.outcome];
      line.append(mark, item.label);
      why.append(line);
    }
    card.append(why);

    if (result.verdict === "needs_info") {
      const ask = this.root.createElement("button");
      ask.type = "button";
      ask.className = "link-button";
      ask.textContent = `Answer ${result.missing.length === 1 ? "this question" : `these ${result.missing.length} questions`}`;
      ask.addEventListener("click", () => this.askOnPage(result.missing));
      card.append(ask);
    }
    if (scheme.caveat) {
      const caveat = this.root.createElement("p");
      caveat.className = "caveat";
      caveat.textContent = scheme.caveat;
      card.append(caveat);
    }
    const how = this.root.createElement("p");
    how.textContent = scheme.howToApply;
    const documents = this.root.createElement("p");
    documents.className = "documents";
    documents.textContent = `Keep ready: ${scheme.documents.join(" · ")}`;
    const actions = this.root.createElement("p");
    actions.className = "card-actions";
    const link = this.root.createElement("a");
    link.href = scheme.source;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Official page ↗";
    actions.append(link);
    if (result.verdict !== "not_eligible") {
      const planned = this.desk.plan.includes(scheme.id);
      const add = this.root.createElement("button");
      add.type = "button";
      add.textContent = planned ? "Remove from my plan" : "Add to my plan";
      add.className = planned ? "is-planned" : "";
      add.addEventListener("click", () => {
        this.fx.pop();
        return planned ? this.removeFromPlan(scheme.id) : this.addToPlan(scheme.id);
      });
      actions.append(add);
    }
    const reviewed = this.root.createElement("small");
    reviewed.textContent = `Rules reviewed ${scheme.reviewed}`;
    card.append(how, documents, actions, reviewed);
    return card;
  }

  /**
   * Redraw the plan with its merged document checklist.
   */
  renderPlan() {
    const view = this.desk.planView();
    const section = this.find("#plan");
    section.hidden = !view.schemes.length;
    const schemes = this.find("#plan-schemes");
    schemes.replaceChildren();
    for (const scheme of view.schemes) {
      const item = this.root.createElement("li");
      const name = this.root.createElement("strong");
      name.textContent = scheme.name;
      const how = this.root.createElement("span");
      how.textContent = ` — ${scheme.howToApply} `;
      const link = this.root.createElement("a");
      link.href = scheme.officialPage;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Official page ↗";
      item.append(name, how, link);
      schemes.append(item);
    }
    const documents = this.find("#plan-documents");
    documents.replaceChildren();
    for (const document of view.documents) {
      const item = this.root.createElement("li");
      const box = this.root.createElement("input");
      box.type = "checkbox";
      box.checked = view.ticked.includes(document);
      box.addEventListener("change", () => {
        this.desk.tickDocument(document, box.checked);
        this.fx.pop();
      });
      const label = this.root.createElement("label");
      label.append(box, ` ${document}`);
      item.append(label);
      documents.append(item);
    }
  }

  /**
   * Fill in a sample person's answers one by one, so the visitor sees the results move.
   *
   * :param persona: The sample person from the desk's config.
   */
  tryPersona(persona) {
    const view = this.root.defaultView;
    const saved = this.checkErase();
    if (saved.ok) {
      if (!view.confirm(`Replace your ${saved.answers} answers and your plan with ${persona.name}'s?`)) {
        return;
      }
      this.eraseMyDetails();
    }
    this.find("#check").scrollIntoView({behavior: this.scrolling(), block: "start"});
    const entries = Object.entries(persona.facts);
    this.run += 1;
    const run = this.run;
    const next = (index) => {
      // The visitor erased, or started another sample.
      if (run !== this.run) {
        return;
      }
      if (index >= entries.length) {
        this.say(`These are ${persona.name}'s answers, a sample person. Select “Erase my answers” before you enter your own.`);
        return;
      }
      const [id, value] = entries[index];
      const control = this.find(`#f-${id}`);
      this.answer(id, String(value), control);
      const row = this.find(`#q-${id}`);
      if (row && this.root.defaultView.innerWidth > 860) {
        row.scrollIntoView({behavior: this.scrolling(), block: "nearest"});
      }
      view.setTimeout(() => next(index + 1), 260);
    };
    view.setTimeout(() => next(0), 500);
  }

  /**
   * Draw the sample people.
   */
  buildPersonas() {
    const list = this.find("#personas");
    for (const persona of this.desk.config.personas || []) {
      const button = this.root.createElement("button");
      button.type = "button";
      button.className = "persona";
      const face = this.root.createElement("span");
      face.className = "persona-face";
      face.textContent = persona.name[0];
      const name = this.root.createElement("strong");
      name.textContent = persona.name;
      const line = this.root.createElement("span");
      line.textContent = persona.line;
      const go = this.root.createElement("em");
      go.textContent = "Try →";
      button.append(face, name, line, go);
      button.addEventListener("click", () => this.tryPersona(persona));
      list.append(button);
    }
  }

  /**
   * Open one scheme's card and bring it into view.
   *
   * :param id: The scheme id.
   */
  showCard(id) {
    const card = this.find(`#card-${id}`);
    if (!card) {
      return;
    }
    const group = card.closest("details.verdict");
    if (group) {
      group.open = true;
    }
    card.open = true;
    card.scrollIntoView({behavior: this.scrolling(), block: "center"});
    card.classList.add("is-moved");
    this.root.defaultView.setTimeout(() => card.classList.remove("is-moved"), 1600);
  }

  /**
   * Wire the page's own buttons and draw everything.
   */
  start() {
    this.buildForm();
    this.buildPersonas();
    this.find("#erase").addEventListener("click", () => {
      const check = this.checkErase();
      if (check.ok && this.root.defaultView.confirm(`Erase your ${check.answers} answers and your plan from this browser?`)) {
        this.eraseMyDetails();
      }
    });
    this.find("#print-plan").addEventListener("click", () => this.root.defaultView.print());
    this.find("#disclaimer").textContent = Page.DISCLAIMER;
    this.fx.buildWheel(this.find("#wheel"), this.desk.schemes, (id) => this.showCard(id), (scheme) => {
      this.find("#wheel-caption").textContent = scheme ? `${scheme.name} — ${scheme.benefit}` : "One petal for each scheme. Answer a question and watch them turn.";
    });
    const sound = this.find("#sound");
    const showSound = (on) => {
      sound.setAttribute("aria-pressed", String(on));
      this.find("#sound-label").textContent = on ? "Sound on" : "Sound off";
    };
    showSound(!this.fx.muted);
    sound.addEventListener("click", () => showSound(this.fx.toggleSound()));
    this.fx.reveal();
    // Another tab changed or erased the answers: show what is saved now.
    this.root.defaultView.addEventListener("storage", () => {
      this.desk.load();
      this.render();
    });
    this.render();
  }
}

/**
 * Creates the one page object for this document.
 */
export class App {
  static page = null;

  /**
   * Create the page object, with the document when there is one.
   *
   * :param storage: A localStorage-like object, or null.
   * :param root: The document, or null.
   * :return: The page object.
   */
  static create(storage, root) {
    App.page = new Page(new Desk(DESK, SCHEMES, storage), root);
    return App.page;
  }

  /**
   * Read this browser's storage, which can be blocked.
   *
   * :return: localStorage, or null when the browser refuses it.
   */
  static browserStorage() {
    try {
      window.localStorage.getItem(DESK.storageKey);
      return window.localStorage;
    } catch (error) {
      return null;
    }
  }
}

if (typeof document !== "undefined" && document.querySelector("#questions")) {
  App.create(App.browserStorage(), document).start();
} else {
  // No page: Node tests. Answers live in memory only.
  App.create(null, null);
}
