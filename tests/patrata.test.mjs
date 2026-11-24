// Tests for the rule engine, the desk logic, the page operations, the registered
// actions and the built sites. Run after building both desks:
//   node tools/build.mjs rajya
//   node tools/build.mjs patrata --partner-network http://localhost:8081/rajya_desk
//   node --test tests/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { RuleEngine } from "../app/js/engine.js";
import { Fields } from "../app/js/fields.js";
import { Desk } from "../app/js/desk.js";

/**
 * Loads the built desks and holds the tests.
 */
class PatrataTest {
  static ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

  /**
   * Read a JSON file under the repository root.
   *
   * :param parts: Path parts.
   * :return: The parsed JSON.
   */
  static json(...parts) {
    return JSON.parse(readFileSync(join(PatrataTest.ROOT, ...parts), "utf8"));
  }

  /**
   * A desk with no storage.
   *
   * :param name: The desk folder name.
   * :return: The desk.
   */
  static desk(name) {
    return new Desk(PatrataTest.json("desks", name, "desk.json"), PatrataTest.json("desks", name, "schemes.json"), null);
  }

  /**
   * Collect the actions a module registers.
   *
   * :param path: The module path under the repository root.
   * :return: The registered definitions by name.
   */
  static async actions(path) {
    const module = await import(join(PatrataTest.ROOT, path));
    const found = {};
    module.registerActions({register: (definition) => { found[definition.name] = definition; }});
    return found;
  }

  /**
   * The verdict of one scheme in a list of results.
   *
   * :param results: Engine results.
   * :param id: The scheme id.
   * :return: The verdict.
   */
  static verdict(results, id) {
    return results.find((result) => result.id === id).verdict;
  }

  static testDataIsValid() {
    for (const name of ["patrata", "rajya"]) {
      const schemes = PatrataTest.json("desks", name, "schemes.json");
      assert.deepEqual(RuleEngine.validate(schemes, Fields.BY_ID), []);
    }
  }

  static testValidatorRejectsBadRules() {
    const bad = [{id: "bad-one", name: "X", category: "c", benefit: "b", summary: "s", documents: ["d"], howToApply: "h", source: "http://insecure.example", reviewed: "2026-11", rules: {all: [{field: "nope", op: "eq", value: 1, label: "l"}]}}];
    assert.ok(RuleEngine.validate(bad, Fields.BY_ID).length >= 2);
  }

  static testMissingFactsAreNeverGuessed() {
    const desk = PatrataTest.desk("patrata");
    const empty = desk.check().results;
    assert.ok(empty.every((result) => result.verdict === "needs_info"), "With no answers, nothing may be decided.");
    const scheme = desk.byId["pm-kisan"];
    const result = RuleEngine.check(scheme, {ownsFarmland: true});
    assert.equal(result.verdict, "needs_info");
    assert.ok(result.missing.length > 0);
  }

  static testOneFailDecides() {
    const desk = PatrataTest.desk("patrata");
    const result = RuleEngine.check(desk.byId["pm-kisan"], {ownsFarmland: false});
    assert.equal(result.verdict, "not_eligible");
  }

  static testKnownProfiles() {
    const desk = PatrataTest.desk("patrata");
    const results = desk.check({age: 34, gender: "female", bplCard: true, hasLpg: false, area: "rural"}).results;
    assert.equal(PatrataTest.verdict(results, "pmuy"), "eligible");
    assert.equal(PatrataTest.verdict(results, "pmjay"), "eligible");
    assert.equal(PatrataTest.verdict(results, "ignoaps"), "not_eligible");
    assert.equal(PatrataTest.verdict(results, "pmay-u"), "not_eligible");
    const again = desk.check({age: 34, gender: "female", bplCard: true, hasLpg: false, area: "rural"}).results;
    assert.deepEqual(again, results, "The same facts always give the same verdicts.");
  }

  static testStateSchemesNeedTheirState() {
    const desk = PatrataTest.desk("rajya");
    const results = desk.check({state: "Karnataka", gender: "female", age: 30, incomeTaxPayer: false}).results;
    const fitting = results.filter((result) => result.verdict === "eligible").map((result) => result.id);
    const other = results.filter((result) => desk.byId[result.id].name.includes("Maharashtra"));
    assert.ok(other.every((result) => result.verdict === "not_eligible"));
    assert.ok(fitting.every((id) => desk.byId[id].name.includes("Karnataka")));
  }

  static testBadAnswersChangeNothing() {
    const desk = PatrataTest.desk("patrata");
    assert.equal(desk.setFacts({age: 34}).ok, true);
    for (const bad of [{age: 400}, {age: 40, gender: "robot"}, {aadhaar: "1234"}, {}]) {
      const result = desk.setFacts(bad);
      assert.equal(result.ok, false);
      assert.ok(result.reason);
    }
    assert.deepEqual(desk.facts, {age: 34});
    assert.equal(desk.check({age: -1}).ok, false);
  }

  static testStateSummaryHidesExactFigures() {
    const desk = PatrataTest.desk("patrata");
    desk.setFacts({age: 34, annualIncome: 187650, landHectares: 1.37, disabilityPercent: 45});
    const text = JSON.stringify(desk.coarseProfile());
    for (const exact of ["187650", "1,87,650", "1.37", "34", "45"]) {
      assert.ok(!text.split(/[^0-9.,]+/).includes(exact), `The summary leaks the exact figure ${exact}: ${text}`);
    }
  }

  static testPlanAndErase() {
    const desk = PatrataTest.desk("patrata");
    assert.equal(desk.checkErase().ok, false);
    assert.equal(desk.erase().ok, false);
    assert.equal(desk.addToPlan("nope").ok, false);
    assert.equal(desk.addToPlan("pmuy").ok, true);
    assert.equal(desk.addToPlan("pmuy").ok, false);
    assert.equal(desk.addToPlan("pmjay").ok, true);
    const view = desk.planView();
    assert.equal(view.schemes.length, 2);
    assert.equal(new Set(view.documents).size, view.documents.length, "Each document is listed once.");
    assert.equal(desk.removeFromPlan("pm-kisan").ok, false);
    assert.equal(desk.removeFromPlan("pmuy").ok, true);
    desk.setFacts({age: 20});
    const erased = desk.erase();
    assert.deepEqual(erased.erased, {answers: 1, planned: 1});
    assert.deepEqual(desk.facts, {});
    assert.deepEqual(desk.plan, []);
  }

  static testStorageRoundTrip() {
    const store = {};
    const storage = {getItem: (key) => store[key] || null, setItem: (key, value) => { store[key] = value; }, removeItem: (key) => { delete store[key]; }};
    const config = PatrataTest.json("desks", "patrata", "desk.json");
    const schemes = PatrataTest.json("desks", "patrata", "schemes.json");
    const first = new Desk(config, schemes, storage);
    first.setFacts({age: 61, gender: "male"});
    first.addToPlan("pmuy");
    const second = new Desk(config, schemes, storage);
    assert.deepEqual(second.facts, {age: 61, gender: "male"});
    assert.deepEqual(second.plan, ["pmuy"]);
    second.erase();
    assert.deepEqual(store, {});
    store[config.storageKey] = "{broken";
    assert.deepEqual(new Desk(config, schemes, storage).facts, {});
  }

  static testEraseInAnotherTabStaysErased() {
    const store = {};
    const storage = {getItem: (key) => store[key] || null, setItem: (key, value) => { store[key] = value; }, removeItem: (key) => { delete store[key]; }};
    const config = PatrataTest.json("desks", "patrata", "desk.json");
    const schemes = PatrataTest.json("desks", "patrata", "schemes.json");
    const first = new Desk(config, schemes, storage);
    first.setFacts({age: 61, annualIncome: 90000});
    first.addToPlan("pmuy");
    const second = new Desk(config, schemes, storage);
    assert.equal(first.erase().ok, true);
    second.setFacts({gender: "male"});
    assert.deepEqual(second.facts, {gender: "male"}, "Answers erased in one tab must not return from another.");
    assert.deepEqual(second.plan, []);
  }

  static testChecklistTicksSurviveOtherEdits() {
    const desk = PatrataTest.desk("patrata");
    desk.addToPlan("pmuy");
    const document = desk.planView().documents[0];
    desk.tickDocument(document, true);
    desk.setFacts({age: 40});
    assert.deepEqual(desk.planView().ticked, [document]);
    desk.tickDocument(document, false);
    assert.deepEqual(desk.planView().ticked, []);
  }

  static testFamilyAnswersDoNotDecidePersonalRules() {
    const desk = PatrataTest.desk("patrata");
    const base = {age: 30, hasBankAccount: true, incomeTaxPayer: true, govtEmployee: true};
    const family = RuleEngine.check(desk.byId.apy, base);
    assert.notEqual(family.verdict, "not_eligible", "A relative's income tax must not rule out the applicant.");
    assert.equal(RuleEngine.check(desk.byId.apy, {...base, paysIncomeTax: true}).verdict, "not_eligible");
    assert.equal(RuleEngine.check(desk.byId["pm-kisan"], {ownsFarmland: true, incomeTaxPayer: true}).verdict, "not_eligible");
  }

  static async testPageActions() {
    const actions = await PatrataTest.actions("dist/patrata/site-actions.js");
    const manifest = PatrataTest.json("dist", "patrata", "agent-manifest.json");
    assert.deepEqual(Object.keys(actions).sort(), [...manifest.actions.agentTools].sort());
    for (const action of Object.values(actions)) {
      assert.ok(["read", "write", "irreversible"].includes(action.effect));
      assert.equal(action.inputSchema.additionalProperties, false);
      assert.ok(action.description.length > 60);
    }
    assert.equal(actions.erase_my_details.effect, "irreversible");
    const irreversible = Object.values(actions).filter((action) => action.effect === "irreversible");
    assert.equal(irreversible.length, 1);

    const before = actions.get_desk_state.execute({});
    assert.equal(before.schemes.length, 23);
    assert.deepEqual(before.answersSoFar, {});
    const refused = actions.set_answers.execute({facts: {age: 999}});
    assert.equal(refused.ok, false);
    assert.equal(actions.get_desk_state.execute({}).version, before.version);

    const set = actions.set_answers.execute({facts: {age: 34, gender: "female", occupation: "street_vendor", area: "urban"}});
    assert.equal(set.ok, true);
    const whatIf = actions.check_eligibility.execute({facts: {age: 70}});
    assert.equal(whatIf.ok, true);
    assert.equal(actions.get_desk_state.execute({}).version, set.version, "A what-if check changes nothing.");
    const check = actions.check_eligibility.execute({});
    assert.equal(check.schemes.find((scheme) => scheme.id === "svanidhi").verdict, "eligible");
    assert.ok(check.mostUsefulNextQuestions.length > 0);
    assert.equal(actions.ask_on_page.execute({fields: ["nope"]}).ok, false);
    assert.equal(actions.ask_on_page.execute({fields: [check.mostUsefulNextQuestions[0].field]}).ok, true);
    assert.equal(actions.get_scheme_details.execute({id: "svanidhi"}).scheme.officialPage.startsWith("https://"), true);
    assert.equal(actions.add_to_plan.execute({id: "svanidhi"}).ok, true);
    assert.equal(actions.get_desk_state.execute({}).plan.schemes.length, 1);
    assert.equal(actions.remove_from_plan.execute({id: "svanidhi"}).ok, true);
    assert.equal(actions.erase_my_details.execute({}).ok, true);
    assert.equal(actions.erase_my_details.execute({}).ok, false);
    assert.deepEqual(actions.get_desk_state.execute({}).answersSoFar, {});
  }

  static async testBridgeSharesOnlyReads() {
    const actions = await PatrataTest.actions("dist/rajya/bridge/bridge-actions.js");
    assert.deepEqual(Object.keys(actions).sort(), ["check_eligibility", "get_desk_state", "get_scheme_details"]);
    for (const action of Object.values(actions)) {
      assert.equal(action.effect, "read");
      assert.equal(action.availability, "bridge");
    }
    const result = actions.check_eligibility.execute({facts: {state: "Maharashtra", gender: "female", age: 34, annualIncome: 200000}});
    assert.equal(result.ok, true);
    assert.ok(result.schemes.some((scheme) => scheme.name.includes("Ladki Bahin") && scheme.verdict !== "not_eligible"));
    assert.deepEqual(actions.get_desk_state.execute({}).answersSoFar, {}, "The bridge holds no visitor's answers.");
    assert.equal(actions.check_eligibility.execute({facts: {aadhaar: "1"}}).ok, false);
  }

  static testBuiltNetworks() {
    const cases = [["patrata", "patrata", "patrata_guide"], ["rajya", "rajya_desk", "rajya_desk_guide"]];
    for (const [folder, network, front] of cases) {
      const manifest = PatrataTest.json("dist", folder, "agent-manifest.json");
      const built = PatrataTest.json("dist", folder, `${network}.network.json`);
      const text = JSON.stringify(built) + JSON.stringify(manifest);
      assert.ok(!text.includes("__PARTNER"), "A placeholder was left in the built files.");
      assert.ok(!text.includes("TODO"));
      assert.equal(manifest.networks[0].front_man, front);
      assert.deepEqual(manifest.networks[0].sample_queries, built.metadata.sample_queries);
      assert.ok(built.tools.some((agent) => agent.name === front));
    }
    const patrata = PatrataTest.json("dist", "patrata", "agent-manifest.json");
    const network = PatrataTest.json("dist", "patrata", "patrata.network.json");
    const partner = network.tools[0].tools.find((tool) => tool.startsWith("http"));
    assert.deepEqual(patrata.allowed_peers, [new URL(partner).origin], "Peers are a closed list holding only the partner.");
    assert.ok(Object.keys(network.link_labels).includes(partner));
  }
}

test("scheme data passes the validator", PatrataTest.testDataIsValid);
test("the validator rejects unknown fields and insecure sources", PatrataTest.testValidatorRejectsBadRules);
test("missing facts give needs_info, never a guess", PatrataTest.testMissingFactsAreNeverGuessed);
test("one failed condition decides not_eligible", PatrataTest.testOneFailDecides);
test("known profiles get the expected, repeatable verdicts", PatrataTest.testKnownProfiles);
test("state schemes apply only in their state", PatrataTest.testStateSchemesNeedTheirState);
test("bad answers are refused and change nothing", PatrataTest.testBadAnswersChangeNothing);
test("the state summary gives ranges, not exact figures", PatrataTest.testStateSummaryHidesExactFigures);
test("plan and erase follow their rules", PatrataTest.testPlanAndErase);
test("answers survive a reload and broken storage is ignored", PatrataTest.testStorageRoundTrip);
test("answers erased in another tab stay erased", PatrataTest.testEraseInAnotherTabStaysErased);
test("checklist ticks survive other edits", PatrataTest.testChecklistTicksSurviveOtherEdits);
test("family answers do not decide personal rules", PatrataTest.testFamilyAnswersDoNotDecidePersonalRules);
test("page actions match the manifest and follow the page's rules", PatrataTest.testPageActions);
test("the bridge shares only stateless reads", PatrataTest.testBridgeSharesOnlyReads);
test("built networks are complete and peers are closed", PatrataTest.testBuiltNetworks);
