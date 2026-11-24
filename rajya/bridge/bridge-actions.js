// The reads this desk shares with other agent sites, through its action bridge. When
// another site's assistant calls this desk's network, the bridge loads this module in a
// hidden frame on this desk's origin. There is no page and no visitor here: only the
// public schemes and the open rule engine, run on the facts the caller passes.
import { DESK, SCHEMES } from "../js/desk-data.js";
import { Desk } from "../js/desk.js";
import { Fields } from "../js/fields.js";
import { Page } from "../script.js";

/**
 * Shares the desk's public reads with every agent site.
 */
class BridgeActions {
  // Public facts and a pure rule check: safe to share with every site on the web.
  static CALLERS = ["*"];

  static SCHEME_IDS = SCHEMES.map((scheme) => scheme.id);

  /**
   * A fresh page object with no storage and no document, as a new visitor would have.
   *
   * :return: The page object.
   */
  static fresh() {
    return new Page(new Desk(DESK, SCHEMES, null), null);
  }

  /**
   * Register the shared reads.
   *
   * :param actions: The runtime registry facade with a register(definition) method.
   */
  static registerActions(actions) {
    actions.register({
      name: "get_desk_state",
      description: "Read this desk: today's date, the schemes it covers with their benefits, and the page's notes with the disclaimer. It holds no visitor's answers here. Changes nothing. Call it before answering what this desk covers.",
      effect: "read",
      availability: "bridge",
      callerOrigins: BridgeActions.CALLERS,
      inputSchema: {type: "object", properties: {}, additionalProperties: false},
      execute: () => BridgeActions.fresh().getState(),
    });
    actions.register({
      name: "check_eligibility",
      description: "Run this desk's open rules on the facts you pass and return, for every scheme, the verdict (eligible, needs_info or not_eligible), the conditions met or not met and what is still needed. Pass every fact the request states, such as state, gender, age and family income. Changes nothing. Verdicts come from code, so never overrule or guess them.",
      effect: "read",
      availability: "bridge",
      callerOrigins: BridgeActions.CALLERS,
      inputSchema: {type: "object", additionalProperties: false, properties: {facts: {type: "object", additionalProperties: false, description: "The facts stated in the request. Never guess one.", properties: Fields.schemaProperties()}}},
      execute: (args) => BridgeActions.fresh().checkEligibility(args.facts, false),
    });
    actions.register({
      name: "get_scheme_details",
      description: "Read one scheme's full record: benefit, conditions, documents, how to apply, the official page link, any caveat and when its rules were reviewed. Changes nothing.",
      effect: "read",
      availability: "bridge",
      callerOrigins: BridgeActions.CALLERS,
      inputSchema: {type: "object", additionalProperties: false, required: ["id"], properties: {id: {type: "string", enum: BridgeActions.SCHEME_IDS, description: "Scheme id from get_desk_state or check_eligibility."}}},
      execute: (args) => BridgeActions.fresh().getSchemeDetails(args.id),
    });
  }
}

// The bridge calls the module's registerActions export.
export const registerActions = BridgeActions.registerActions;
