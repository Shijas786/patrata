// A desk's business logic: the visitor's answers, the eligibility check and the plan.
// It touches no page, so the page, the action bridge and the Node tests share it.
import { RuleEngine } from "./engine.js";
import { Fields } from "./fields.js";

/**
 * Holds one visitor's answers and plan, and answers every question about schemes.
 */
export class Desk {
  /**
   * :param config: The desk's settings (desk.json).
   * :param schemes: The desk's schemes in the open rule format (schemes.json).
   * :param storage: A localStorage-like object, or null to keep nothing.
   */
  constructor(config, schemes, storage) {
    this.config = config;
    this.schemes = schemes;
    this.byId = Object.fromEntries(schemes.map((scheme) => [scheme.id, scheme]));
    this.storage = storage || null;
    this.facts = {};
    this.plan = [];
    this.ticked = [];
    this.version = 0;
    this.load();
  }

  /**
   * Restore saved answers and plan, ignoring anything that no longer passes the checks.
   */
  load() {
    if (!this.storage) {
      return;
    }
    // Start from nothing, so answers erased in another tab do not come back.
    this.facts = {};
    this.plan = [];
    this.ticked = [];
    try {
      const saved = JSON.parse(this.storage.getItem(this.config.storageKey) || "{}");
      const cleaned = Fields.cleanAll(saved.facts || {});
      if (cleaned.ok) {
        this.facts = Desk.withoutNulls(cleaned.facts);
      }
      this.plan = (saved.plan || []).filter((id) => this.byId[id]);
      this.ticked = (saved.ticked || []).filter((name) => typeof name === "string");
    } catch (error) {
      console.error("Saved answers could not be read", error);
    }
  }

  /**
   * Save answers and plan in this browser only.
   */
  save() {
    if (this.storage) {
      this.storage.setItem(this.config.storageKey, JSON.stringify({facts: this.facts, plan: this.plan, ticked: this.ticked}));
    }
  }

  /**
   * Drop cleared answers.
   *
   * :param facts: Answers by field id, where null means cleared.
   * :return: A copy without the cleared answers.
   */
  static withoutNulls(facts) {
    return Object.fromEntries(Object.entries(facts).filter(([, value]) => value !== null));
  }

  /**
   * Record answers. Checks every answer before changing any.
   *
   * :param raw: Answers by field id; null or "" clears one.
   * :return: {ok: true, changed, version}, or {ok: false, reason, field}.
   */
  setFacts(raw) {
    this.load();
    const cleaned = Fields.cleanAll(raw);
    if (!cleaned.ok) {
      return cleaned;
    }
    const changed = Object.keys(cleaned.facts);
    if (!changed.length) {
      return {ok: false, reason: "No answer was given."};
    }
    this.facts = Desk.withoutNulls({...this.facts, ...cleaned.facts});
    this.version += 1;
    this.save();
    return {ok: true, changed: changed, version: this.version};
  }

  /**
   * Check every scheme, or one category, against the saved answers plus extra facts.
   *
   * :param extra: Extra raw facts for this check only, such as from another site's agent.
   * :param useSaved: False to ignore the saved answers.
   * :return: {ok: true, results}, or {ok: false, reason, field} for a bad extra fact.
   */
  check(extra, useSaved = true) {
    const cleaned = Fields.cleanAll(extra || {});
    if (!cleaned.ok) {
      return cleaned;
    }
    const facts = Desk.withoutNulls({...(useSaved ? this.facts : {}), ...cleaned.facts});
    return {ok: true, facts: facts, results: RuleEngine.checkAll(this.schemes, facts)};
  }

  /**
   * Describe check results for an agent: verdicts and reasons, never the raw answers.
   *
   * :param results: Results from check().
   * :return: Scheme verdicts in display order, with counts.
   */
  describe(results) {
    const schemes = [];
    const counts = {eligible: 0, needs_info: 0, not_eligible: 0};
    for (const result of results) {
      const scheme = this.byId[result.id];
      counts[result.verdict] += 1;
      const entry = {id: scheme.id, name: scheme.name, verdict: result.verdict, benefit: scheme.benefit};
      if (result.verdict === "needs_info") {
        entry.stillNeeded = result.missing.map((id) => Fields.BY_ID[id].question);
        entry.stillNeededFields = result.missing;
      } else if (result.verdict === "not_eligible") {
        entry.notMet = result.criteria.filter((item) => item.outcome === "fail").map((item) => item.label);
      } else {
        entry.met = result.criteria.map((item) => item.label);
        if (scheme.caveat) {
          entry.caveat = scheme.caveat;
        }
      }
      schemes.push(entry);
    }
    return {counts: counts, schemes: schemes};
  }

  /**
   * Rank the unanswered questions by how many undecided schemes each would help decide.
   *
   * :param results: Results from check().
   * :return: Up to five questions, most useful first, each with field, question and count.
   */
  nextQuestions(results) {
    const counts = {};
    for (const result of results) {
      for (const field of result.missing) {
        counts[field] = (counts[field] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([field, count]) => ({field: field, question: Fields.BY_ID[field].question, helpsDecide: count}));
  }

  /**
   * The full public record of one scheme.
   *
   * :param id: The scheme id.
   * :return: {ok: true, scheme}, or {ok: false, reason}.
   */
  details(id) {
    const scheme = this.byId[id];
    if (!scheme) {
      return {ok: false, reason: `This desk has no scheme "${id}".`, field: "id"};
    }
    return {
      ok: true,
      scheme: {
        id: scheme.id, name: scheme.name, category: scheme.category, benefit: scheme.benefit,
        summary: scheme.summary, conditions: scheme.rules.all.map((part) => part.label),
        documents: scheme.documents, howToApply: scheme.howToApply, officialPage: scheme.source,
        caveat: scheme.caveat || "", rulesReviewed: scheme.reviewed,
      },
    };
  }

  /**
   * The list of schemes this desk covers.
   *
   * :return: One short entry per scheme.
   */
  catalogue() {
    return this.schemes.map((scheme) => ({id: scheme.id, name: scheme.name, category: scheme.category, benefit: scheme.benefit, summary: scheme.summary}));
  }

  /**
   * The saved answers in coarse bands, so exact ages and incomes stay on the page.
   *
   * :return: Readable answers by short field name.
   */
  coarseProfile() {
    const profile = {};
    for (const [id, value] of Object.entries(this.facts)) {
      profile[Fields.BY_ID[id].short] = Fields.coarse(id, value);
    }
    return profile;
  }

  /**
   * Add a scheme to the visitor's plan.
   *
   * :param id: The scheme id.
   * :return: {ok: true, plan, version}, or {ok: false, reason}.
   */
  addToPlan(id) {
    this.load();
    if (!this.byId[id]) {
      return {ok: false, reason: `This desk has no scheme "${id}".`, field: "id"};
    }
    if (this.plan.includes(id)) {
      return {ok: false, reason: `${this.byId[id].name} is already in the plan.`, field: "id"};
    }
    this.plan = [...this.plan, id];
    this.version += 1;
    this.save();
    return {ok: true, plan: this.planView(), version: this.version};
  }

  /**
   * Remove a scheme from the visitor's plan.
   *
   * :param id: The scheme id.
   * :return: {ok: true, plan, version}, or {ok: false, reason}.
   */
  removeFromPlan(id) {
    this.load();
    if (!this.plan.includes(id)) {
      return {ok: false, reason: "That scheme is not in the plan.", field: "id"};
    }
    this.plan = this.plan.filter((entry) => entry !== id);
    this.version += 1;
    this.save();
    return {ok: true, plan: this.planView(), version: this.version};
  }

  /**
   * The plan as the page shows it, with one merged document checklist.
   *
   * :return: The planned schemes and every document needed, each listed once.
   */
  planView() {
    const documents = [];
    const schemes = [];
    for (const id of this.plan) {
      const scheme = this.byId[id];
      schemes.push({id: id, name: scheme.name, howToApply: scheme.howToApply, officialPage: scheme.source});
      for (const document of scheme.documents) {
        if (!documents.includes(document)) {
          documents.push(document);
        }
      }
    }
    return {schemes: schemes, documents: documents, ticked: this.ticked.filter((name) => documents.includes(name))};
  }

  /**
   * Tick or untick a document on the plan's checklist.
   *
   * :param name: The document name.
   * :param ticked: True when the visitor has the document ready.
   */
  tickDocument(name, ticked) {
    this.load();
    this.ticked = this.ticked.filter((entry) => entry !== name);
    if (ticked) {
      this.ticked.push(name);
    }
    this.save();
  }

  /**
   * Say what erasing would remove, without removing it.
   *
   * :return: {ok: true, answers, planned}, or {ok: false, reason} when nothing is saved.
   */
  checkErase() {
    this.load();
    const answers = Object.keys(this.facts).length;
    if (!answers && !this.plan.length) {
      return {ok: false, reason: "There is nothing to erase: no answers and no plan are saved."};
    }
    return {ok: true, answers: answers, planned: this.plan.length};
  }

  /**
   * Erase every answer and the plan from this browser.
   *
   * :return: {ok: true, erased}, or {ok: false, reason} when nothing is saved.
   */
  erase() {
    const check = this.checkErase();
    if (!check.ok) {
      return check;
    }
    this.facts = {};
    this.plan = [];
    this.ticked = [];
    this.version += 1;
    if (this.storage) {
      this.storage.removeItem(this.config.storageKey);
    }
    return {ok: true, erased: {answers: check.answers, planned: check.planned}, version: this.version};
  }
}
