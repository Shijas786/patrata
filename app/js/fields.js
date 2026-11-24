// The facts a desk may ask for. Every desk shares this vocabulary, so one set of
// answers works across desks. No field identifies a person: no name, no ID number,
// no address, no phone.

/**
 * The shared vocabulary of facts, and helpers to clean and coarsen them.
 */
export class Fields {
  static STATES = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
    "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
    "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan",
    "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
    "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
  ];

  static LIST = [
    {id: "state", group: "basics", type: "enum", question: "Which state or union territory do you live in?", short: "State", options: Fields.STATES.map((name) => ({value: name, label: name}))},
    {id: "area", group: "basics", type: "enum", question: "Do you live in a village or a town/city?", short: "Area", options: [{value: "rural", label: "Village (rural)"}, {value: "urban", label: "Town or city (urban)"}]},
    {id: "age", group: "basics", type: "number", question: "How old are you?", short: "Age", min: 0, max: 120, integer: true, unit: "years", bands: [10, 16, 18, 21, 25, 40, 50, 60, 65, 70, 80]},
    {id: "gender", group: "basics", type: "enum", question: "Gender", short: "Gender", options: [{value: "female", label: "Woman"}, {value: "male", label: "Man"}, {value: "other", label: "Other"}]},
    {id: "annualIncome", group: "basics", type: "number", question: "Total family income in a year (₹)", short: "Family income", min: 0, max: 100000000, integer: true, unit: "a year", bands: [100000, 180000, 250000, 300000, 600000, 900000], hint: "A rough figure is fine. It is never sent anywhere exactly."},
    {id: "category", group: "basics", type: "enum", question: "Social category", short: "Category", options: [{value: "general", label: "General"}, {value: "obc", label: "OBC"}, {value: "sc", label: "SC"}, {value: "st", label: "ST"}]},
    {id: "occupation", group: "basics", type: "enum", question: "What do you mainly do?", short: "Work", options: [
      {value: "farmer", label: "Farmer"}, {value: "street_vendor", label: "Street vendor"},
      {value: "artisan", label: "Artisan or craftsperson"}, {value: "unorganised_worker", label: "Daily-wage or informal worker"},
      {value: "self_employed", label: "Small business or self-employed"}, {value: "salaried", label: "Salaried job"},
      {value: "student", label: "Student"}, {value: "homemaker", label: "Homemaker"},
      {value: "unemployed", label: "Looking for work"}, {value: "retired", label: "Retired"}]},
    {id: "maritalStatus", group: "family", type: "enum", question: "Marital status", short: "Marital status", options: [{value: "single", label: "Single"}, {value: "married", label: "Married"}, {value: "widowed", label: "Widowed"}, {value: "separated", label: "Separated or divorced"}]},
    {id: "bplCard", group: "family", type: "boolean", question: "Does your family hold a BPL, Antyodaya or priority ration card?", short: "BPL / priority ration card"},
    {id: "pregnantOrNewMother", group: "family", type: "boolean", question: "Are you pregnant or a mother of a newborn?", short: "Pregnant or new mother"},
    {id: "hasGirlChildUnder10", group: "family", type: "boolean", question: "Do you have a daughter under 10?", short: "Daughter under 10"},
    {id: "disabilityPercent", group: "family", type: "number", question: "Certified disability, in percent (0 if none)", short: "Disability", min: 0, max: 100, integer: true, unit: "%", bands: [40, 80]},
    {id: "ownsFarmland", group: "work", type: "boolean", question: "Does your family own farmland?", short: "Owns farmland"},
    {id: "landHectares", group: "work", type: "number", question: "How much farmland, in hectares? (1 hectare ≈ 2.47 acres)", short: "Farmland", min: 0, max: 10000, unit: "hectares", bands: [1, 2]},
    {id: "wantsBusinessLoan", group: "work", type: "boolean", question: "Do you want a loan to start or grow a small business?", short: "Wants a business loan"},
    {id: "epfMember", group: "work", type: "boolean", question: "Are you covered by EPF, ESIC or NPS through a job?", short: "EPF / ESIC / NPS member"},
    {id: "incomeTaxPayer", group: "work", type: "boolean", question: "Does anyone in your family pay income tax?", short: "Income-tax payer in family"},
    {id: "govtEmployee", group: "work", type: "boolean", question: "Is anyone in your family a government employee or government pensioner?", short: "Government employee in family"},
    {id: "hasBankAccount", group: "home", type: "boolean", question: "Do you have a bank or post-office savings account?", short: "Has a bank account"},
    {id: "ownsPuccaHouse", group: "home", type: "boolean", question: "Does your family own a pucca (permanent) house anywhere in India?", short: "Owns a pucca house"},
    {id: "hasLpg", group: "home", type: "boolean", question: "Does your household have an LPG (cooking gas) connection?", short: "Has LPG"},
    {id: "ownsRoofWithElectricity", group: "home", type: "boolean", question: "Do you own a house with a usable roof and an electricity connection?", short: "Own roof with electricity"},
  ];

  static GROUPS = [
    {id: "basics", title: "About you"},
    {id: "family", title: "Family"},
    {id: "work", title: "Work and land"},
    {id: "home", title: "Home and bank"},
  ];

  static BY_ID = Object.fromEntries(Fields.LIST.map((field) => [field.id, field]));

  /**
   * Check and clean one answer.
   *
   * :param id: The field id.
   * :param value: The raw value from a form or an agent.
   * :return: {ok: true, value}, where null clears the answer, or {ok: false, reason, field}.
   */
  static clean(id, value) {
    const field = Fields.BY_ID[id];
    if (!field) {
      return {ok: false, field: id, reason: `There is no question called "${id}".`};
    }
    if (value === null || value === undefined || value === "") {
      return {ok: true, value: null};
    }
    if (field.type === "boolean") {
      if (value === true || value === "true" || value === "yes") {
        return {ok: true, value: true};
      }
      if (value === false || value === "false" || value === "no") {
        return {ok: true, value: false};
      }
      return {ok: false, field: id, reason: `"${field.short}" must be yes or no.`};
    }
    if (field.type === "number") {
      const number = typeof value === "number" ? value : Number(String(value).replace(/[,\s₹]/g, ""));
      if (!Number.isFinite(number) || number < field.min || number > field.max || (field.integer && !Number.isInteger(number))) {
        return {ok: false, field: id, reason: `"${field.short}" must be a ${field.integer ? "whole " : ""}number from ${field.min} to ${field.max}.`};
      }
      return {ok: true, value: number};
    }
    const text = String(value).trim().toLowerCase();
    for (const option of field.options) {
      if (option.value.toLowerCase() === text || option.label.toLowerCase() === text) {
        return {ok: true, value: option.value};
      }
    }
    return {ok: false, field: id, reason: `"${value}" is not one of the choices for "${field.short}".`};
  }

  /**
   * Check and clean a set of answers. Refuses the whole set if any answer is bad.
   *
   * :param facts: Raw answers by field id.
   * :return: {ok: true, facts} with only the given, cleaned answers (null clears), or
   *   {ok: false, reason, field}.
   */
  static cleanAll(facts) {
    const cleaned = {};
    for (const [id, value] of Object.entries(facts || {})) {
      const result = Fields.clean(id, value);
      if (!result.ok) {
        return result;
      }
      cleaned[id] = result.value;
    }
    return {ok: true, facts: cleaned};
  }

  /**
   * Describe one answer coarsely, so an exact age or income never leaves the page.
   *
   * :param id: The field id.
   * :param value: The cleaned answer.
   * :return: A readable band such as "₹1,80,001 to ₹2,50,000 a year", or the option label.
   */
  static coarse(id, value) {
    const field = Fields.BY_ID[id];
    if (field.type === "boolean") {
      return value ? "yes" : "no";
    }
    if (field.type === "enum") {
      return field.options.find((option) => option.value === value).label;
    }
    const format = (number) => (id === "annualIncome" ? `₹${number.toLocaleString("en-IN")}` : String(number));
    let lower = null;
    for (const edge of field.bands) {
      if (value < edge || (value === edge && id !== "age" && id !== "disabilityPercent")) {
        const from = lower === null ? "up to" : `over ${format(lower)} and up to`;
        return id === "age" || id === "disabilityPercent"
          ? `${lower === null ? "under" : `${lower} to under`} ${edge} ${field.unit}`
          : `${from} ${format(edge)} ${field.unit}`;
      }
      lower = edge;
    }
    return id === "age" || id === "disabilityPercent" ? `${lower} ${field.unit} or more` : `over ${format(lower)} ${field.unit}`;
  }

  /**
   * The JSON-schema properties for the facts an agent may pass, all optional.
   *
   * :return: A properties object for an action's inputSchema.
   */
  static schemaProperties() {
    const properties = {};
    for (const field of Fields.LIST) {
      if (field.type === "boolean") {
        properties[field.id] = {type: "boolean", description: field.question};
      } else if (field.type === "number") {
        properties[field.id] = {type: field.integer ? "integer" : "number", minimum: field.min, maximum: field.max, description: `${field.question} Unit: ${field.id === "annualIncome" ? "rupees a year" : field.unit}.`};
      } else {
        properties[field.id] = {type: "string", enum: field.options.map((option) => option.value), description: field.question};
      }
    }
    return properties;
  }
}
