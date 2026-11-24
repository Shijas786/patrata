// Registers this desk's operations with the agent runtime. agent-manifest.json loads
// this module through "actions.module"; the names in "actions.agentTools" become model
// tools called website_<name>. Every action wraps a method of the page object, so the
// assistant and the page's own controls follow one set of rules.
import { App } from "./script.js";
import { SCHEMES } from "./js/desk-data.js";
import { Fields } from "./js/fields.js";

/**
 * Describes the desk's operations as actions the agents can call.
 */
class SiteActions {
  static SCHEME_IDS = SCHEMES.map((scheme) => scheme.id);

  /**
   * Register every action.
   *
   * :param actions: The runtime registry facade with a register(definition) method.
   */
  static registerActions(actions) {
    actions.register({
      name: "get_desk_state",
      description: "Read this desk: today's date, the schemes it covers, the visitor's answers so far (as ranges, never exact figures), the questions not yet answered, their plan, and the page's notes with the disclaimer and links. Changes nothing. Call it first in each turn: the visitor can also change the page.",
      effect: "read",
      inputSchema: {type: "object", properties: {}, additionalProperties: false},
      execute: () => App.page.getState(),
    });
    actions.register({
      name: "check_eligibility",
      description: "Run the desk's open rules and return, for every scheme, the verdict (eligible, needs_info or not_eligible), the conditions met or not met, what is still needed, and the most useful next questions. With no arguments it uses the answers the visitor saved on the page. Pass facts only for a what-if the visitor asks about; they are used for this check only. Changes nothing. Verdicts come from code, so never overrule or guess them.",
      effect: "read",
      inputSchema: {type: "object", additionalProperties: false, properties: {facts: SiteActions.factsSchema("What-if facts for this check only. Leave out to use the visitor's saved answers.")}},
      execute: (args) => App.page.checkEligibility(args.facts),
    });
    actions.register({
      name: "get_scheme_details",
      description: "Read one scheme's full record: benefit, conditions, documents, how to apply, the official page link, any caveat and when its rules were reviewed. Changes nothing. Call it before explaining a scheme or how to apply.",
      effect: "read",
      inputSchema: {type: "object", additionalProperties: false, required: ["id"], properties: {id: {type: "string", enum: SiteActions.SCHEME_IDS, description: "Scheme id from website_get_desk_state or website_check_eligibility."}}},
      execute: (args) => App.page.getSchemeDetails(args.id),
    });
    actions.register({
      name: "set_answers",
      description: "Call it only when the visitor states facts about themselves in the chat and wants them used. Fills in those answers on the page's form, keeping the others, and returns the new verdict counts. Returns ok false with a reason, and changes nothing, when a value is refused. The visitor can change or clear any answer on the page.",
      effect: "write",
      inputSchema: {type: "object", additionalProperties: false, required: ["facts"], properties: {facts: SiteActions.factsSchema("Only the facts the visitor stated. Never guess one.")}},
      execute: (args) => App.page.setAnswers(args.facts),
    });
    actions.register({
      name: "ask_on_page",
      description: "Call it only when the visitor wants to know what to answer next. Marks up to five questions on the page's form and scrolls to the first, so the visitor answers privately on the page instead of typing personal details in the chat. Prefer this over asking for income, caste, disability or family details in chat. Changes no answer.",
      effect: "write",
      inputSchema: {type: "object", additionalProperties: false, required: ["fields"], properties: {fields: {type: "array", minItems: 1, maxItems: 5, items: {type: "string", enum: Fields.LIST.map((field) => field.id)}, description: "Field ids, from mostUsefulNextQuestions or stillNeededFields."}}},
      execute: (args) => App.page.askOnPage(args.fields),
    });
    actions.register({
      name: "add_to_plan",
      description: "Call it only when the visitor asks to save or plan for a scheme. Adds the scheme to My plan on the page and returns the plan with one merged document checklist. Returns ok false when it is already there. It does not apply for anything.",
      effect: "write",
      inputSchema: {type: "object", additionalProperties: false, required: ["id"], properties: {id: {type: "string", enum: SiteActions.SCHEME_IDS, description: "Scheme id to add."}}},
      execute: (args) => App.page.addToPlan(args.id),
    });
    actions.register({
      name: "remove_from_plan",
      description: "Call it only when the visitor asks to drop a scheme from My plan. Returns the updated plan, or ok false when the scheme is not in it.",
      effect: "write",
      inputSchema: {type: "object", additionalProperties: false, required: ["id"], properties: {id: {type: "string", enum: SiteActions.SCHEME_IDS, description: "Scheme id to remove."}}},
      execute: (args) => App.page.removeFromPlan(args.id),
    });
    actions.register({
      name: "erase_my_details",
      description: "Erase every answer and the plan from this browser. It cannot be undone. Call it only when the visitor asks to erase or delete their details. The browser asks the visitor to confirm. Returns what was erased, or ok false when nothing was saved.",
      effect: "irreversible",
      inputSchema: {type: "object", properties: {}, additionalProperties: false},
      execute: () => App.page.eraseMyDetails(),
    });
  }

  /**
   * The schema of a set of facts, all optional.
   *
   * :param description: What the facts are for.
   * :return: An object schema.
   */
  static factsSchema(description) {
    return {type: "object", additionalProperties: false, description: description, properties: Fields.schemaProperties()};
  }
}

// The runtime calls the module's registerActions export.
export const registerActions = SiteActions.registerActions;
