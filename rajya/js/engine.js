// The open rule engine. It decides, from declarative JSON rules, whether a set of
// facts fits a scheme. It has no page, storage or network access, so it runs the same
// in the page, in the action bridge, in Node tests and in the validator.

/**
 * Evaluates declarative eligibility rules with three-valued logic.
 *
 * A rule is either a criterion {field, op, value, label} or a combinator
 * {all: [...]}, {any: [...]} or {not: rule}. A criterion on a fact the visitor has
 * not given is "unknown", never a guess.
 */
export class RuleEngine {
  static OPS = ["eq", "ne", "in", "nin", "lte", "gte", "lt", "gt", "between"];

  /**
   * Check one scheme against the facts.
   *
   * :param scheme: The scheme, with a rules tree.
   * :param facts: The known facts by field id. Missing, null or "" means not given.
   * :return: The verdict (eligible, not_eligible or needs_info), each criterion with
   *   its outcome, and the fields still needed.
   */
  static check(scheme, facts) {
    const criteria = [];
    const outcome = RuleEngine.evaluate(scheme.rules, facts || {}, criteria);
    const missing = [];
    for (const item of criteria) {
      if (item.outcome === "unknown") {
        for (const field of item.fields) {
          if (!missing.includes(field)) {
            missing.push(field);
          }
        }
      }
    }
    let verdict = "needs_info";
    if (outcome === "pass") {
      verdict = "eligible";
    } else if (outcome === "fail") {
      verdict = "not_eligible";
    }
    return {
      id: scheme.id,
      verdict: verdict,
      criteria: criteria,
      // Once the verdict is certain, nothing more is needed.
      missing: verdict === "needs_info" ? missing : [],
    };
  }

  /**
   * Evaluate a rule tree and collect its criteria.
   *
   * :param rule: A criterion or a combinator.
   * :param facts: The known facts.
   * :param criteria: The list that receives each top-level criterion's outcome.
   * :return: "pass", "fail" or "unknown".
   */
  static evaluate(rule, facts, criteria) {
    if (Array.isArray(rule.all)) {
      let result = "pass";
      for (const part of rule.all) {
        const outcome = RuleEngine.evaluatePart(part, facts, criteria);
        if (outcome === "fail") {
          result = "fail";
        } else if (outcome === "unknown" && result !== "fail") {
          result = "unknown";
        }
      }
      return result;
    }
    return RuleEngine.evaluatePart(rule, facts, criteria);
  }

  /**
   * Evaluate one part of a top-level "all" and record it as one readable criterion.
   *
   * :param part: A criterion or a nested combinator with its own label.
   * :param facts: The known facts.
   * :param criteria: The list that receives the outcome.
   * :return: "pass", "fail" or "unknown".
   */
  static evaluatePart(part, facts, criteria) {
    const fields = [];
    const outcome = RuleEngine.resolve(part, facts, fields);
    criteria.push({label: part.label || RuleEngine.describe(part), outcome: outcome, fields: fields});
    return outcome;
  }

  /**
   * Resolve a rule without recording it, naming the unknown fields it depends on.
   *
   * :param rule: A criterion or a combinator.
   * :param facts: The known facts.
   * :param fields: Receives the fields that are unknown and still matter.
   * :return: "pass", "fail" or "unknown".
   */
  static resolve(rule, facts, fields) {
    if (Array.isArray(rule.all) || Array.isArray(rule.any)) {
      const isAll = Array.isArray(rule.all);
      const decisive = isAll ? "fail" : "pass";
      const unknownFields = [];
      let sawUnknown = false;
      for (const part of isAll ? rule.all : rule.any) {
        const outcome = RuleEngine.resolve(part, facts, unknownFields);
        if (outcome === decisive) {
          return decisive;
        }
        if (outcome === "unknown") {
          sawUnknown = true;
        }
      }
      if (sawUnknown) {
        for (const field of unknownFields) {
          if (!fields.includes(field)) {
            fields.push(field);
          }
        }
        return "unknown";
      }
      return isAll ? "pass" : "fail";
    }
    if (rule.not) {
      const outcome = RuleEngine.resolve(rule.not, facts, fields);
      if (outcome === "unknown") {
        return "unknown";
      }
      return outcome === "pass" ? "fail" : "pass";
    }
    const actual = facts[rule.field];
    if (actual === undefined || actual === null || actual === "") {
      if (!fields.includes(rule.field)) {
        fields.push(rule.field);
      }
      return "unknown";
    }
    return RuleEngine.compare(rule.op, actual, rule.value) ? "pass" : "fail";
  }

  /**
   * Compare one fact with a criterion's value.
   *
   * :param op: The operator, one of OPS.
   * :param actual: The fact.
   * :param value: The criterion's value; a list for in, nin and between.
   * :return: True when the fact meets the criterion.
   * :raises Error: When the operator is not one of OPS.
   */
  static compare(op, actual, value) {
    switch (op) {
      case "eq": return actual === value;
      case "ne": return actual !== value;
      case "in": return value.includes(actual);
      case "nin": return !value.includes(actual);
      case "lte": return actual <= value;
      case "gte": return actual >= value;
      case "lt": return actual < value;
      case "gt": return actual > value;
      case "between": return actual >= value[0] && actual <= value[1];
      default: throw new Error(`Unknown operator "${op}".`);
    }
  }

  /**
   * Describe a rule that has no label of its own.
   *
   * :param rule: A criterion or a combinator.
   * :return: A short description.
   */
  static describe(rule) {
    if (rule.field) {
      return `${rule.field} ${rule.op} ${JSON.stringify(rule.value)}`;
    }
    return "Combined condition";
  }

  /**
   * Check a list of schemes and sort them: eligible first, then needs_info, then not.
   *
   * :param schemes: The schemes to check.
   * :param facts: The known facts.
   * :return: One result per scheme, in display order.
   */
  static checkAll(schemes, facts) {
    const order = {eligible: 0, needs_info: 1, not_eligible: 2};
    const results = [];
    for (const scheme of schemes) {
      results.push(RuleEngine.check(scheme, facts));
    }
    results.sort((a, b) => order[a.verdict] - order[b.verdict] || a.missing.length - b.missing.length);
    return results;
  }

  /**
   * Validate a scheme file against the open rule format.
   *
   * :param schemes: The parsed scheme list.
   * :param fields: The field definitions by id, each with type and, for enums, options.
   * :return: A list of problems; empty when the file is valid.
   */
  static validate(schemes, fields) {
    const problems = [];
    if (!Array.isArray(schemes)) {
      return ["The scheme file must be a JSON array."];
    }
    const seen = new Set();
    for (const scheme of schemes) {
      const where = `Scheme "${scheme && scheme.id}"`;
      if (!scheme || typeof scheme.id !== "string" || !/^[a-z][a-z0-9-]{1,40}$/.test(scheme.id)) {
        problems.push(`${where}: id must be lowercase letters, digits and hyphens.`);
        continue;
      }
      if (seen.has(scheme.id)) {
        problems.push(`${where}: duplicate id.`);
      }
      seen.add(scheme.id);
      for (const key of ["name", "benefit", "summary", "howToApply", "reviewed"]) {
        if (typeof scheme[key] !== "string" || !scheme[key].trim()) {
          problems.push(`${where}: "${key}" must be a non-empty string.`);
        }
      }
      if (typeof scheme.source !== "string" || !/^https:\/\//.test(scheme.source)) {
        problems.push(`${where}: "source" must be an https link to the official page.`);
      }
      if (!Array.isArray(scheme.documents) || !scheme.documents.length) {
        problems.push(`${where}: "documents" must list at least one document.`);
      }
      if (!scheme.rules || !Array.isArray(scheme.rules.all) || !scheme.rules.all.length) {
        problems.push(`${where}: "rules" must be {"all": [...]} with at least one criterion.`);
        continue;
      }
      for (const part of scheme.rules.all) {
        if (typeof part.label !== "string" || !part.label.trim()) {
          problems.push(`${where}: every top-level criterion needs a plain-language "label".`);
        }
        RuleEngine.validateRule(part, fields, where, problems, 0);
      }
    }
    return problems;
  }

  /**
   * Validate one rule node.
   *
   * :param rule: A criterion or a combinator.
   * :param fields: The field definitions by id.
   * :param where: The scheme's name for messages.
   * :param problems: Receives each problem found.
   * :param depth: The nesting depth, limited to 4.
   */
  static validateRule(rule, fields, where, problems, depth) {
    if (!rule || typeof rule !== "object" || depth > 4) {
      problems.push(`${where}: a rule must be an object nested at most 4 deep.`);
      return;
    }
    const nested = rule.all || rule.any;
    if (Array.isArray(nested)) {
      if (!nested.length) {
        problems.push(`${where}: a combinator must not be empty.`);
      }
      for (const part of nested) {
        RuleEngine.validateRule(part, fields, where, problems, depth + 1);
      }
      return;
    }
    if (rule.not) {
      RuleEngine.validateRule(rule.not, fields, where, problems, depth + 1);
      return;
    }
    const field = fields[rule.field];
    if (!field) {
      problems.push(`${where}: unknown field "${rule.field}".`);
      return;
    }
    if (!RuleEngine.OPS.includes(rule.op)) {
      problems.push(`${where}: unknown operator "${rule.op}" on "${rule.field}".`);
      return;
    }
    const list = ["in", "nin", "between"].includes(rule.op);
    const values = list ? rule.value : [rule.value];
    if (!Array.isArray(values) || !values.length || (rule.op === "between" && values.length !== 2)) {
      problems.push(`${where}: "${rule.op}" on "${rule.field}" needs a list value.`);
      return;
    }
    const numeric = ["lte", "gte", "lt", "gt", "between"].includes(rule.op);
    for (const value of values) {
      if (field.type === "boolean" && typeof value !== "boolean") {
        problems.push(`${where}: "${rule.field}" is yes/no, so its value must be true or false.`);
      } else if (field.type === "number" && typeof value !== "number") {
        problems.push(`${where}: "${rule.field}" is a number.`);
      } else if (field.type === "enum" && !field.options.some((option) => option.value === value)) {
        problems.push(`${where}: "${value}" is not an option of "${rule.field}".`);
      }
    }
    if (numeric && field.type !== "number") {
      problems.push(`${where}: "${rule.op}" needs a number field, and "${rule.field}" is not one.`);
    }
  }
}
