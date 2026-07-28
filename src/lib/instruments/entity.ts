/**
 * THE ANSWER ENGINE INSPECTOR — engine.
 *
 * WHAT IT READS
 *   What a language model can actually determine about a business, and what it
 *   can only guess.
 *
 *   When an assistant is asked "who should I call for a burst pipe in Mesa",
 *   it is not searching. It is resolving an entity — assembling attributes
 *   from whatever structured, corroborated facts it can find, and declining to
 *   name anyone it cannot resolve confidently. A business can be excellent,
 *   well reviewed and first on Google, and still be unresolvable, because none
 *   of those things are machine-readable claims about an entity.
 *
 * WHY THIS IS HONEST
 *   This makes no prediction about rankings and computes no score out of a
 *   hat. It does exactly one thing: takes the attributes the owner says exist,
 *   and reports which of them a machine could resolve, which it could only
 *   infer, and which are simply absent — then emits the schema.org document
 *   those answers imply.
 *
 *   Every judgement here is structural and checkable:
 *     - RESOLVED   the fact is stated in a machine-readable form AND at least
 *                  one independent source could corroborate it.
 *     - INFERRED   the fact is stated, but only by the business itself. A model
 *                  can read it; it has no reason to believe it.
 *     - ABSENT     nothing to read.
 *
 *   That distinction — stated versus corroborated — is the entire subject, and
 *   it is arithmetic, not opinion.
 */

export type Confidence = "resolved" | "inferred" | "absent";

/** One attribute an assistant tries to resolve before it will name a business. */
export interface EntityAttribute {
  key: string;
  /** What a person would call it. */
  label: string;
  /** The schema.org property it maps to, where one exists. */
  property?: string;
  /** Why an assistant needs it before it will recommend you. */
  why: string;
  /**
   * Whether an assistant treats this as load-bearing. Missing a required
   * attribute is not a weak entity — it is an unresolvable one.
   */
  required: boolean;
}

/**
 * The attribute set, in the order an assistant needs them.
 *
 * Deliberately not exhaustive — schema.org's LocalBusiness has dozens of
 * properties and listing them all would be a spec dump rather than an
 * instrument. These are the ones whose absence stops a resolution.
 */
export const ENTITY_ATTRIBUTES: EntityAttribute[] = [
  {
    key: "name",
    label: "Your business name",
    property: "name",
    why: "If your name is written two different ways, AI thinks you're two businesses and trusts neither.",
    required: true,
  },
  {
    key: "category",
    label: "What kind of business you are",
    property: "@type",
    why: "People ask for a plumber before they ask for you. If AI doesn't know what you do, you never come up.",
    required: true,
  },
  {
    key: "area",
    label: "Where you work",
    property: "areaServed",
    why: "Almost every question has a place in it — \"near me\", \"in Mesa\". No area, no match.",
    required: true,
  },
  {
    key: "phone",
    label: "Phone number and address",
    property: "telephone / address",
    why: "AI won't give someone a phone number it can't double-check somewhere else.",
    required: true,
  },
  {
    key: "hours",
    label: "When you're open",
    property: "openingHoursSpecification",
    why: "\"Who's open now\" is the most common question there is. No hours means you're skipped.",
    required: false,
  },
  {
    key: "services",
    label: "The exact jobs you do",
    property: "hasOfferCatalog",
    why: "Listing the actual jobs is what gets you matched to a specific question instead of a general one.",
    required: true,
  },
  {
    key: "price",
    label: "Roughly what you charge",
    property: "priceRange",
    why: "Hiding your prices takes you out of every question that mentions money.",
    required: false,
  },
  {
    key: "credentials",
    label: "Licence and insurance",
    property: "hasCredential",
    why: "In the trades this is the difference between being mentioned and being recommended.",
    required: false,
  },
  {
    key: "reviews",
    label: "Your star rating",
    property: "aggregateRating",
    why: "Stars a person can see on your page aren't stars a computer can read. They have to be coded in.",
    required: false,
  },
  {
    key: "sameAs",
    label: "Links to your other profiles",
    property: "sameAs",
    why: "These links are what tie your website to your Google listing, your Yelp page, all of it.",
    required: true,
  },
];

/**
 * What the owner says exists, per attribute.
 *
 * `stated` — is it on your site in a form a machine reads (markup, not a
 *            picture of a phone number in a header image)?
 * `corroborated` — does at least one source you do not control say the same?
 */
export interface AttributeAnswer {
  stated: boolean;
  corroborated: boolean;
}

export type EntityAnswers = Record<string, AttributeAnswer>;

export interface AttributeReading {
  attribute: EntityAttribute;
  confidence: Confidence;
}

export interface EntityReading {
  readings: AttributeReading[];
  resolved: number;
  inferred: number;
  absent: number;
  /** Required attributes that are absent. Any one of these blocks a resolution. */
  blocking: EntityAttribute[];
  /**
   * Can an assistant name this business at all?
   *
   * Not a score. A single boolean with a stated rule: every required attribute
   * must at minimum be stated. It is the difference between "ranked poorly"
   * and "not a candidate", and businesses routinely do not know which one they
   * are.
   */
  resolvable: boolean;
}

export function confidenceOf(a: AttributeAnswer | undefined): Confidence {
  if (!a?.stated) return "absent";
  return a.corroborated ? "resolved" : "inferred";
}

export function readEntity(answers: EntityAnswers): EntityReading {
  const readings = ENTITY_ATTRIBUTES.map((attribute) => ({
    attribute,
    confidence: confidenceOf(answers[attribute.key]),
  }));

  const count = (c: Confidence) => readings.filter((r) => r.confidence === c).length;
  const blocking = readings
    .filter((r) => r.attribute.required && r.confidence === "absent")
    .map((r) => r.attribute);

  return {
    readings,
    resolved: count("resolved"),
    inferred: count("inferred"),
    absent: count("absent"),
    blocking,
    resolvable: blocking.length === 0,
  };
}

/**
 * The schema.org document these answers imply.
 *
 * Emitted for real, with only the properties the owner said exist — so the
 * gaps in the readout are visibly the gaps in the JSON. Values are placeholders
 * because we do not ask for the actual phone number: the instrument is about
 * structure, and collecting a business's details to show it a diagram would be
 * a lead form wearing a lab coat.
 */
export function entityJsonLd(answers: EntityAnswers, businessName: string): string {
  const has = (k: string) => Boolean(answers[k]?.stated);
  const doc: Record<string, unknown> = { "@context": "https://schema.org" };

  doc["@type"] = has("category") ? "LocalBusiness" : "Thing";
  if (has("name")) doc.name = businessName || "Your Business, LLC";
  if (has("area")) doc.areaServed = { "@type": "City", name: "…" };
  if (has("phone")) {
    doc.telephone = "+1-…";
    doc.address = { "@type": "PostalAddress", addressLocality: "…", addressRegion: "AZ" };
  }
  if (has("hours")) {
    doc.openingHoursSpecification = [
      { "@type": "OpeningHoursSpecification", dayOfWeek: "…", opens: "…", closes: "…" },
    ];
  }
  if (has("services")) {
    doc.hasOfferCatalog = {
      "@type": "OfferCatalog",
      itemListElement: [{ "@type": "Offer", itemOffered: { "@type": "Service", name: "…" } }],
    };
  }
  if (has("price")) doc.priceRange = "$$";
  if (has("credentials")) {
    doc.hasCredential = { "@type": "EducationalOccupationalCredential", name: "…" };
  }
  if (has("reviews")) {
    doc.aggregateRating = { "@type": "AggregateRating", ratingValue: "…", reviewCount: "…" };
  }
  if (has("sameAs")) doc.sameAs = ["…"];

  return JSON.stringify(doc, null, 2);
}

/**
 * The sentence an assistant could say, and the one it could not.
 *
 * This is the whole instrument in two lines. Built by concatenation from what
 * is present — never by claiming an outcome.
 */
export function entitySentence(
  reading: EntityReading,
  businessName: string,
): { can: string; cannot: string | null } {
  const name = businessName.trim() || "the business";
  const ok = (k: string) =>
    reading.readings.find((r) => r.attribute.key === k)?.confidence !== "absent";

  if (!reading.resolvable) {
    return {
      can: `Somebody asks AI who to call. It cannot name ${name} at all.`,
      cannot: `It doesn't know: ${reading.blocking.map((b) => b.label.toLowerCase()).join(", ")}.`,
    };
  }

  const parts = [`${name} is a`];
  parts.push(ok("category") ? "business it knows the type of" : "business");
  if (ok("area")) parts.push("working in a known area");
  if (ok("hours")) parts.push("with hours it can check");
  if (ok("price")) parts.push("and a price range it can quote");

  const missing = [
    !ok("credentials") ? "whether you're licensed" : "",
    !ok("reviews") ? "how you're rated" : "",
    !ok("services") ? "what jobs you actually do" : "",
  ].filter(Boolean);

  return {
    can: `${parts.join(" ")}.`,
    cannot: missing.length ? `It still can't tell anyone ${missing.join(", or ")}.` : null,
  };
}
