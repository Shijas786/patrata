// The page script. It owns the one page object, App.page, which the page's own form and
// buttons and the assistant's actions (site-actions.js) both call.
import { DESK, SCHEMES } from "./js/desk-data.js";
import { Desk } from "./js/desk.js";
import { Fields } from "./js/fields.js";

/**
 * The page: the questions, the results, the plan, and one method per operation.
 */
export class Page {
  static DISCLAIMER = "This is a guide, not a decision. Rules are summarised from official guidelines and can change; the department that runs a scheme decides. Always confirm on the scheme's official page before you apply.";

  static VERDICTS = {
    eligible: {title: "You likely qualify", empty: "Nothing yet. Answer a few more questions."},
    needs_info: {title: "One or two answers away", empty: "No scheme is waiting on an answer."},
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
      first.scrollIntoView({behavior: "smooth", block: "center"});
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
    if (result.ok) {
      this.clearHighlights();
      this.render();
      this.say("Your answers and plan were erased from this browser.");
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
    if (field.type === "number") {
      control = this.root.createElement("input");
      control.type = "number";
      control.min = field.min;
      control.max = field.max;
      control.step = field.integer ? "1" : "any";
      control.inputMode = field.integer ? "numeric" : "decimal";
    } else {
      control = this.root.createElement("select");
      const options = field.type === "boolean"
        ? [{value: "true", label: "Yes"}, {value: "false", label: "No"}]
        : field.options;
      const blank = this.root.createElement("option");
      blank.value = "";
      blank.textContent = "—";
      control.append(blank);
      for (const option of options) {
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
    const result = this.setAnswers({[control.name]: control.value});
    control.setCustomValidity(result.ok ? "" : result.reason);
    this.say(result.ok ? "" : result.reason);
    if (!result.ok) {
      control.reportValidity();
    }
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
      if (control && control !== this.root.activeElement && control.value !== text) {
        control.value = text;
      }
      const row = this.find(`#q-${field.id}`);
      if (row) {
        row.classList.toggle("is-asked", this.highlighted.includes(field.id));
      }
    }
    const answered = Object.keys(this.desk.facts).length;
    this.find("#progress").textContent = `${answered} of ${Fields.LIST.length} answered`;
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
      : `Start with any question on the left. ${this.desk.schemes.length} schemes are waiting.`;
    for (const [verdict, results] of Object.entries(groups)) {
      const list = this.find(`#list-${verdict}`);
      list.replaceChildren();
      this.find(`#count-${verdict}`).textContent = String(results.length);
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
    summary.append(name, tag, benefit);
    card.append(summary);

    const why = this.root.createElement("ul");
    why.className = "criteria";
    for (const item of result.criteria) {
      const line = this.root.createElement("li");
      line.className = `criterion criterion-${item.outcome}`;
      const mark = {pass: "✓", fail: "✕", unknown: "?"}[item.outcome];
      line.textContent = `${mark} ${item.label}`;
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
      add.addEventListener("click", () => (planned ? this.removeFromPlan(scheme.id) : this.addToPlan(scheme.id)));
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
      const label = this.root.createElement("label");
      label.append(box, ` ${document}`);
      item.append(label);
      documents.append(item);
    }
  }

  /**
   * Wire the page's own buttons and draw everything.
   */
  start() {
    this.buildForm();
    this.find("#erase").addEventListener("click", () => {
      const check = this.checkErase();
      if (check.ok && this.root.defaultView.confirm(`Erase your ${check.answers} answers and your plan from this browser?`)) {
        this.eraseMyDetails();
      }
    });
    this.find("#print-plan").addEventListener("click", () => this.root.defaultView.print());
    this.find("#disclaimer").textContent = Page.DISCLAIMER;
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
