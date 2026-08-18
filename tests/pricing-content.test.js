/**
 * Commercial-copy contract tests.
 *
 * Pricing is duplicated across three pages (there is no template layer), and a
 * stale figure on one of them is a commercial defect, not a cosmetic one. These
 * tests assert on the *claims* the site makes about price, inclusions, the
 * additional end-to-end service and shipping — in both the rendered copy and
 * the JSON-LD — so a partial edit fails loudly.
 *
 * They deliberately do NOT assert on wording, layout or design-system classes;
 * only on facts that must never drift.
 *
 * Run: npm test
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Every page that quotes a price. Keep in sync with the audit in the commit. */
const PRICING_PAGES = ["index.html", "contact.html", "autonomous-racing-robotics-kit.html"];

/** Every indexable page, for the metadata regression checks. */
const INDEXABLE_PAGES = [
  "index.html",
  "autonomous-racing-robotics-kit.html",
  "specifications.html",
  "getting-started.html",
  "use-cases.html",
  "resource.html",
  "contact.html",
];

const ALL_HTML = fs.readdirSync(REPO).filter((f) => f.endsWith(".html"));

const read = (name) => fs.readFileSync(path.join(REPO, name), "utf8");

/** Strip tags and collapse whitespace, so assertions survive prettier reflow. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every JSON-LD block on a page, parsed. */
function jsonLd(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return blocks.map((m) => JSON.parse(m[1]));
}

/** Walk any parsed JSON-LD graph, yielding every object node. */
function* nodes(value) {
  if (Array.isArray(value)) {
    for (const v of value) yield* nodes(v);
  } else if (value && typeof value === "object") {
    yield value;
    for (const v of Object.values(value)) yield* nodes(v);
  }
}

function offersIn(html) {
  return jsonLd(html)
    .flatMap((doc) => [...nodes(doc)])
    .filter((n) => n["@type"] === "Offer");
}

/**
 * Every row of every .price-lines table on a page, split into its label and
 * its figure. Lets a test assert on the line item itself rather than on text
 * that merely happens to sit near it.
 */
function priceLines(html) {
  const lists = [...html.matchAll(/<ul class="price-lines"[^>]*>([\s\S]*?)<\/ul>/g)];
  return lists.flatMap((list) =>
    [...list[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((li) => {
      const label = li[1].match(/<span class="price-line-label"[^>]*>([\s\S]*?)<\/span>/);
      const value = li[1].match(
        /<span class="price-line-value"[^>]*>([\s\S]*?)<\/span>\s*<\/li>|<span class="price-line-value"[^>]*>([\s\S]*)/,
      );
      return {
        label: visibleText(label ? label[1] : ""),
        value: visibleText(value ? (value[1] ?? value[2] ?? "") : ""),
      };
    }),
  );
}

/**
 * Each .price-card on a page, as {heading, text}. Card-scoped assertions stop
 * one card's wording from satisfying a claim that belongs to the other — the
 * India note saying "without the operating system flashed" must not excuse the
 * International note for omitting it.
 */
function priceCards(html) {
  return [...html.matchAll(/<article class="price-card">([\s\S]*?)<\/article>/g)].map((m) => {
    const h = m[1].match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    return { heading: visibleText(h ? h[1] : ""), text: visibleText(m[1]) };
  });
}

/** Concatenated text of every JSON-LD answer/description string on a page. */
function machineText(html) {
  return jsonLd(html)
    .map((doc) => JSON.stringify(doc))
    .join(" ");
}

describe("retired pricing never reappears", () => {
  for (const file of ALL_HTML) {
    test(`${file} only uses US$6,100 for the Tech Support configuration`, () => {
      // US$6,100 is the international kit *with* Software Setup / Technical
      // Support. It must never be presented as the standard kit price.
      const text = visibleText(read(file));
      for (const m of text.matchAll(/US\$6,?100/g)) {
        const w = text.slice(Math.max(0, m.index - 200), m.index + 60);
        assert.match(
          w,
          /With Tech Support|Software Setup ?\/ ?Technical Support/i,
          `${file} quotes US$6,100 without naming the Tech Support configuration:\n${w}`,
        );
      }
    });

    test(`${file} never says "with is not included"`, () => {
      assert.ok(!/with is not included/i.test(read(file)), `${file} still contains the "with is" typo`);
    });

    test(`${file} does not quote the kit ex-works`, () => {
      // Shipping is now a flat published rate, so an Incoterm that means
      // "buyer collects at our premises" would contradict it.
      assert.ok(!/ex-works/i.test(read(file)), `${file} still describes the kit as ex-works`);
    });
  }
});

describe("retired wording never reappears", () => {
  for (const file of ALL_HTML) {
    test(`${file} does not state a GST rate`, () => {
      // Only "+ GST" is approved; a published rate goes stale the day it moves.
      assert.ok(!/\b18\s*%\s*GST/i.test(read(file)), `${file} states an explicit GST rate`);
    });

    test(`${file} does not use EXW or ex-works`, () => {
      const raw = read(file);
      assert.ok(!/ex-?works/i.test(raw), `${file} reintroduces ex-works`);
      assert.ok(!/\bEXW\b/.test(raw), `${file} reintroduces EXW`);
    });

    test(`${file} does not use the vague shipping-scope phrase`, () => {
      assert.ok(
        !/where th[ai][st] policy applies/i.test(read(file)),
        `${file} reintroduces "where this policy applies"`,
      );
    });

    test(`${file} does not call the service "additional end-to-end service"`, () => {
      assert.ok(!/end-to-end/i.test(read(file)), `${file} still uses the retired service name`);
    });
  }
});

describe("international terms are FOB and destination charges stay with the buyer", () => {
  for (const file of PRICING_PAGES) {
    test(`${file} states FOB terms`, () => {
      assert.match(visibleText(read(file)), /FOB terms/, `${file} does not state FOB terms`);
    });

    test(`${file} says Ambimat does not pay destination charges`, () => {
      assert.match(
        visibleText(read(file)),
        /Ambimat does not pay destination customs-clearance charges, import duties, local taxes or related destination charges/i,
        `${file} does not disclaim destination charges`,
      );
    });

    test(`${file} excludes destination charges from the US$500 shipping rate`, () => {
      const text = visibleText(read(file));
      assert.match(
        text,
        /US\$500 charge covers shipping only|US\$500 shipping charge does not include destination customs clearance/i,
        `${file} does not scope the US$500 charge`,
      );
      assert.match(
        text,
        /destination customs clearance, import duties, local taxes and related destination\s+charges are the buyer's responsibility/i,
        `${file} does not place destination charges with the buyer`,
      );
    });

    test(`${file} never implies Ambimat clears customs or pays duty`, () => {
      const text = visibleText(read(file));
      const forbidden = [
        /we (pay|cover|handle) (the )?(import )?(duty|duties|customs)/i,
        /duty[- ]paid/i,
        /customs cleared/i,
        /\bDDP\b/,
        /shipping includes? (customs|duties|import)/i,
        // Lookbehind so the approved disclaimer ("does not include destination
        // customs clearance") is not mistaken for the claim it disclaims.
        /(?<!does not |not )includes? destination (customs|duties|taxes)/i,
      ];
      for (const re of forbidden) {
        assert.ok(!re.test(text), `${file} implies Ambimat covers destination charges: ${re}`);
      }
    });

    test(`${file} does not invent an FOB port or Incoterms edition`, () => {
      // The approved wording defers the FOB location to the quotation.
      const text = visibleText(read(file));
      assert.ok(
        !/FOB\s+(Mumbai|Nhava|Mundra|Chennai|Kolkata|Ahmedabad|India\b)/i.test(text),
        `${file} names an FOB port`,
      );
      assert.ok(!/Incoterms\s*(®|\(R\))?\s*20\d\d/i.test(text), `${file} names an Incoterms edition`);
      assert.match(text, /FOB location and full commercial terms will be confirmed in the quotation/i);
    });
  }
});

describe("confirmed international facts", () => {
  for (const file of PRICING_PAGES) {
    test(`${file} states the service is not included in US$5,639`, () => {
      assert.match(
        visibleText(read(file)),
        /not included in the US\$5,639 (international|kit) price|US\$5,639, which does not include\s+Software Setup \/ Technical Support/i,
        `${file} does not say Software Setup / Technical Support is excluded from the USD price`,
      );
    });

    test(`${file} only ever asserts inclusion against the INR 628,000 option`, () => {
      // The service is included in exactly one offer. Any affirmative
      // "includes Software Setup / Technical Support" sentence anywhere on the
      // page must therefore name INR 628,000; anything else is a mis-sell.
      const sentences = visibleText(read(file)).split(/(?<=\.)\s+/);
      for (const s of sentences) {
        // Both orders: "includes Software Setup …" and "Software Setup … is included".
        // A conditional ("Where/When/If … is included, …") states a dependency,
        // not an inclusion, and is how the operational pages legitimately
        // describe behaviour that only applies with the service.
        const conditional =
          /\b(where|when|if)\s+Software Setup \/ Technical Support\s+(?:is|are|was|were)\s+includ/i.test(s);
        const negated = /\b(not|without|excluding|excludes)\b[^.]{0,40}includ/i.test(s);
        const affirmative =
          (/\binclud(?:es|ed|ing)\s+Software Setup \/ Technical Support/i.test(s) ||
            /Software Setup \/ Technical Support\s+(?:is|are)\s+included\b/i.test(s)) &&
          !conditional &&
          !negated;
        if (!affirmative) continue;
        assert.match(
          s,
          /628,000/,
          `${file} asserts the service is included without naming the INR 628,000 option:\n${s}`,
        );
      }
    });

    test(`${file} says the US$500 covers shipping only`, () => {
      assert.match(
        visibleText(read(file)),
        /US\$500 (charge )?covers shipping only|covers shipping only/i,
        `${file} does not state that US$500 is shipping only`,
      );
    });

    test(`${file} puts destination charges on the buyer`, () => {
      assert.match(
        visibleText(read(file)),
        /are the buyer's responsibility|Ambimat does not pay destination/i,
        `${file} does not place destination charges with the buyer`,
      );
    });

    test(`${file} says the INR rate reaches any destination in India`, () => {
      assert.match(
        visibleText(read(file)),
        /any destination within India/i,
        `${file} does not state the INR 4,500 rate covers all Indian destinations`,
      );
    });
  }

  test("the USD Offer records that the service is excluded", () => {
    for (const file of ["index.html", "autonomous-racing-robotics-kit.html"]) {
      const usd = offersIn(read(file)).find((o) => o.priceCurrency === "USD");
      assert.match(
        usd.description ?? "",
        /Software Setup \/ Technical Support is not included/i,
        `the USD offer in ${file} does not exclude the service`,
      );
      assert.match(usd.description ?? "", /covers shipping only/i);
    }
  });

  test("the INR Offers record the all-India shipping scope", () => {
    for (const file of ["index.html", "autonomous-racing-robotics-kit.html"]) {
      for (const o of offersIn(read(file)).filter((x) => x.priceCurrency === "INR")) {
        assert.match(
          o.description ?? "",
          /any destination within India/i,
          `offer ${o.price} in ${file} does not state the all-India shipping scope`,
        );
      }
    }
  });
});

describe("the three configurations are unambiguous", () => {
  const SERVICE_ACTS = [
    /operating system flashed/i,
    /ROS stack[^.]{0,60}not configured|not configured/i,
    /60-day (remote )?(technical-)?support/i,
  ];

  for (const file of PRICING_PAGES) {
    test(`${file} positions the INR 580,000 row as customer-managed`, () => {
      const line = priceLines(read(file)).find((l) => l.value.includes("INR 580,000"));
      assert.ok(line, `${file} has no INR 580,000 row`);
      assert.match(
        line.label,
        /customer-managed software setup and integration/i,
        `the INR 580,000 row in ${file} is not positioned as customer-managed:\n${line.label}`,
      );
    });

    test(`${file} positions the US$5,639 row as customer-managed`, () => {
      const line = priceLines(read(file)).find((l) => l.value.includes("US$5,639"));
      assert.ok(line, `${file} has no US$5,639 row`);
      assert.match(
        line.label,
        /customer-managed software setup and integration/i,
        `the US$5,639 row in ${file} is not positioned as customer-managed:\n${line.label}`,
      );
    });

    test(`${file} spells out the exclusions inside the India card itself`, () => {
      const card = priceCards(read(file)).find((c) => /India/i.test(c.heading));
      assert.ok(card, `${file} has no India price card`);
      for (const [what, re] of [
        ["operating system not flashed", /without the operating system flashed/i],
        [
          "ROS stack / drivers not configured",
          /(ROS stack and(?: the)? LiDAR and VESC drivers are not configured)/i,
        ],
        ["60-day support not included", /60-day remote technical-support period is not included/i],
        ["customer-managed framing", /customer-managed software setup and integration/i],
      ]) {
        assert.match(card.text, re, `the India card in ${file} does not state: ${what}`);
      }
    });

    test(`${file} spells out the exclusions inside the International card itself`, () => {
      const card = priceCards(read(file)).find((c) => /International/i.test(c.heading));
      assert.ok(card, `${file} has no International price card`);
      for (const [what, re] of [
        [
          "service excluded from US$5,639",
          /Software Setup \/ Technical Support is not included in the US\$5,639 kit price/i,
        ],
        ["operating system not flashed", /without\s+the operating system flashed/i],
        [
          "ROS stack / drivers not configured",
          /(ROS stack and(?: the)? LiDAR and VESC drivers are not configured)/i,
        ],
        ["60-day support not included", /60-day remote technical-support period is not included/i],
        [
          "Tech Support available as a priced configuration",
          /RoboRacer Core Kit \(With Tech Support\) for US\$6,100/i,
        ],
      ]) {
        assert.match(card.text, re, `the International card in ${file} does not state: ${what}`);
      }
    });

    test(`${file} states the service exclusion in correct English`, () => {
      const card = priceCards(read(file)).find((c) => /International/i.test(c.heading));
      assert.match(
        card.text,
        /Software Setup \/ Technical Support is not included in the US\$5,639 kit price\./,
        `the International card in ${file} does not carry the corrected exclusion sentence`,
      );
    });

    test(`${file} never asserts inclusion inside a customer-managed card`, () => {
      for (const card of priceCards(read(file))) {
        for (const re of [
          /Software Setup \/ Technical Support is included in the US\$5,639/i,
          /the 60-day remote technical-support period is included/i,
          /the Jetson is supplied with the operating system flashed/i,
        ]) {
          assert.ok(!re.test(card.text), `the ${card.heading} card in ${file} asserts inclusion: ${re}`);
        }
      }
    });

    test(`${file} never claims 580,000 or 5,639 include the setup activities`, () => {
      const text = visibleText(read(file));
      const forbidden = [
        /INR 580,000(?:(?!not|without|excluding)[^.]){0,140}\b(operating system (is )?flashed|ROS stack (is )?configured|drivers (are )?(pre-)?configured|60 days of remote)/i,
        /US\$5,639(?:(?!not|without|excluding)[^.]){0,140}\b(operating system (is )?flashed|ROS stack (is )?configured|drivers (are )?(pre-)?configured|60 days of remote)/i,
      ];
      for (const re of forbidden) {
        assert.ok(!re.test(text), `${file} attaches setup activities to a customer-managed price: ${re}`);
      }
    });

    test(`${file} offers the service to international buyers at a published price`, () => {
      assert.match(
        visibleText(read(file)),
        /RoboRacer Core Kit \(With Tech Support\) for US\$6,100/i,
        `${file} does not offer international buyers the Tech Support configuration`,
      );
    });

    test(`${file} invents no price for the international service`, () => {
      // The sentence offering the service separately must carry no figure.
      const APPROVED = new Set(["US$5,639", "US$464", "US$5,175", "US$500"]);
      const sentences = visibleText(read(file)).split(/(?<=\.)\s+/);
      for (const s of sentences.filter((x) => /separately for an additional fee/i.test(x))) {
        // Anchor on a digit so a trailing comma is not read as part of the figure.
        const figures = [...s.matchAll(/US\$[\d,]*\d/g)].map((m) => m[0]).filter((f) => !APPROVED.has(f));
        assert.deepEqual(
          figures,
          [],
          `${file} publishes a price for the optional international service:\n${s}`,
        );
      }
    });

    test(`${file} keeps the software distinction separate from the physical kit`, () => {
      const text = visibleText(read(file));
      // Removing the service must never be described as removing hardware.
      for (const re of [
        /without Software Setup[^.]{0,80}(fewer|reduced|missing) (parts|components|hardware)/i,
        /INR 580,000[^.]{0,100}(without|no) (the )?(Traxxas )?chassis/i,
        /US\$5,639[^.]{0,100}(without|no) (the )?(Traxxas )?chassis/i,
      ]) {
        assert.ok(!re.test(text), `${file} conflates the service distinction with the physical kit: ${re}`);
      }
      // And all three complete-kit prices still include the three items.
      assert.match(
        text,
        /include the chassis, battery and charger|all three items included|including the Traxxas\s+chassis/i,
      );
    });
  }

  test("no unconditional ready-to-use claim survives anywhere", () => {
    for (const file of ALL_HTML) {
      const text = visibleText(read(file));
      for (const re of [/plug[- ]and[- ]play/i, /ready to use out of the box/i, /works out of the box/i]) {
        assert.ok(!re.test(text), `${file} makes an unconditional readiness claim: ${re}`);
      }
      // "publishes on first boot" is only true with the service.
      for (const m of text.matchAll(/publish(?:ing|es)? on first boot/gi)) {
        // Accept either an explicit conditional, or sitting inside the block
        // that describes the paid service (whose heading is "Software setup").
        const w = text.slice(Math.max(0, m.index - 400), m.index + 40);
        assert.match(
          w,
          /Software Setup \/ Technical Support|Where that service is included|with Software Setup|\bSoftware setup\b/i,
          `${file} claims first-boot publishing without scoping it to the service:\n${w}`,
        );
      }
    }
  });

  test("the service is only ever sold as a kit configuration, never on its own", () => {
    // The Tech Support tier is now a published Offer (USD 6100), but it is a
    // *kit* configuration. The bare service must never be an Offer by itself.
    for (const file of ["index.html", "autonomous-racing-robotics-kit.html"]) {
      const offers = offersIn(read(file));
      assert.equal(offers.length, 4, `${file} should carry exactly four Offers`);
      for (const o of offers) {
        assert.ok(
          !/^Software Setup/i.test(o.name ?? ""),
          `${file} models the optional service as a standalone Offer: ${o.name}`,
        );
        assert.match(
          o.name ?? "",
          /RoboRacer Core Kit/i,
          `${file} has an Offer that is not a Core Kit configuration: ${o.name}`,
        );
      }
    }
  });
});

describe("Software Setup / Technical Support is described consistently", () => {
  for (const file of PRICING_PAGES) {
    test(`${file} uses the approved service name`, () => {
      assert.match(visibleText(read(file)), /Software Setup \/ Technical Support/);
    });

    test(`${file} does not claim the service comes with every kit`, () => {
      const text = visibleText(read(file));
      const forbidden = [
        /included with every kit/i,
        /every kit includes (loading|remote hardware)/i,
        /services delivered with every kit/i,
        /every kit carries \d+ days/i,
      ];
      for (const re of forbidden) {
        assert.ok(!re.test(text), `${file} claims universal inclusion of the service: ${re}`);
      }
    });

    test(`${file} does not expand the service scope beyond what is approved`, () => {
      const text = visibleText(read(file));
      const forbidden = [
        /\bSLA\b/,
        /service level agreement/i,
        /on-?site (service|support|installation)/i,
        /training (course|programme|program|entitlement)/i,
        /\bwarrant(y|ies)\b/i,
        /response time/i,
        /\d+\s*-?\s*(hour|business day) response/i,
      ];
      for (const re of forbidden) {
        assert.ok(!re.test(text), `${file} introduces an unapproved service commitment: ${re}`);
      }
    });
  }

  test("the service scope pages do not claim universal inclusion either", () => {
    for (const file of ["specifications.html", "getting-started.html"]) {
      const text = visibleText(read(file));
      assert.ok(!/services delivered with every kit/i.test(text), `${file} claims universal inclusion`);
      assert.ok(!/every kit includes remote hardware/i.test(text), `${file} claims universal inclusion`);
    }
  });
});

describe("India pricing is stated with the service relationship intact", () => {
  for (const file of PRICING_PAGES) {
    test(`${file} quotes INR 580,000 + GST`, () => {
      assert.match(visibleText(read(file)), /INR 580,000 \+ GST/);
    });

    test(`${file} quotes INR 628,000 + GST`, () => {
      assert.match(visibleText(read(file)), /INR 628,000 \+ GST/);
    });

    test(`${file} never shows INR 628,000 without naming the service`, () => {
      // Every sentence-ish run containing 628,000 must also name the service it
      // pays for, otherwise the figure reads as the only kit price.
      const text = visibleText(read(file));
      const windows = [...text.matchAll(/INR 628,000/g)].map((m) =>
        text.slice(Math.max(0, m.index - 240), m.index + 240),
      );
      assert.ok(windows.length > 0, `${file} does not mention INR 628,000 at all`);
      for (const w of windows) {
        assert.match(
          w,
          /Software Setup \/ Technical Support/i,
          `INR 628,000 appears in ${file} without naming the service:\n${w}`,
        );
      }
    });

    test(`${file} labels the INR 628,000 price line with the service it buys`, () => {
      // Proximity is not enough: the *line item itself* must say what the
      // extra INR 48,000 pays for, or a customer scanning the table reads
      // two unexplained kit prices.
      const line = priceLines(read(file)).find((l) => l.value.includes("INR 628,000"));
      assert.ok(line, `${file} has no INR 628,000 price line`);
      assert.match(
        line.label,
        /Software Setup \/ Technical Support/,
        `the INR 628,000 line in ${file} does not identify Software Setup / Technical Support:\n${line.label}`,
      );
    });

    test(`${file} labels the INR 580,000 price line as the kit alone`, () => {
      const line = priceLines(read(file)).find((l) => l.value.includes("INR 580,000"));
      assert.ok(line, `${file} has no INR 580,000 price line`);
      assert.ok(
        !/Software Setup \/ Technical Support/i.test(line.label),
        `the INR 580,000 line in ${file} claims the service:\n${line.label}`,
      );
    });

    test(`${file} never labels INR 580,000 as including the service`, () => {
      const text = visibleText(read(file));
      for (const m of text.matchAll(/INR 580,000/g)) {
        const w = text.slice(m.index, m.index + 160);
        assert.ok(
          !/580,000 \+ GST with Software Setup \/ Technical Support/i.test(w),
          `INR 580,000 is described as including the service in ${file}:\n${w}`,
        );
      }
      assert.ok(
        !/INR 580,000[^.]{0,140}\bincludes Software Setup \/ Technical Support/i.test(text),
        `${file} says INR 580,000 includes Software Setup / Technical Support`,
      );
    });

    test(`${file} states the INR 4,500 + GST shipping rate`, () => {
      assert.match(visibleText(read(file)), /INR 4,500 \+ GST/);
    });

    test(`${file} scopes the INR shipping charge to India`, () => {
      const line = priceLines(read(file)).find((l) => l.value.includes("INR 4,500"));
      assert.ok(line, `${file} has no INR 4,500 price line`);
      assert.match(
        line.label,
        /any destination within India/i,
        `the INR 4,500 shipping line in ${file} is not scoped to all of India:\n${line.label}`,
      );
    });

    test(`${file} presents both INR options as the same physical kit`, () => {
      // The INR 48,000 buys a service, not more hardware. Any wording that
      // makes 628,000 look like a bigger kit is a commercial misstatement.
      const text = visibleText(read(file));
      assert.match(
        text,
        /same complete (physical )?(RoboRacer )?Core Kit|both options include the complete/i,
      );
      for (const re of [/larger kit/i, /upgraded kit/i, /reduced kit\b(?! ?:)/i, /extra hardware/i]) {
        assert.ok(!re.test(text), `${file} implies the two INR options differ physically: ${re}`);
      }
    });
  }
});

describe("international pricing is stated with the discount qualified", () => {
  for (const file of PRICING_PAGES) {
    test(`${file} quotes US$5,639 for the complete kit`, () => {
      assert.match(visibleText(read(file)), /US\$5,639/);
    });

    test(`${file} quotes the US$500 flat shipping`, () => {
      assert.match(visibleText(read(file)), /US\$500/);
    });

    test(`${file} presents the US$464 discount as approximate`, () => {
      const text = visibleText(read(file));
      for (const m of text.matchAll(/US\$464/g)) {
        const w = text.slice(Math.max(0, m.index - 60), m.index + 20);
        assert.match(w, /approximately/i, `US$464 appears unqualified in ${file}:\n${w}`);
      }
    });

    test(`${file} presents US$5,175 as approximate and indicative`, () => {
      const text = visibleText(read(file));
      for (const m of text.matchAll(/US\$5,175/g)) {
        const w = text.slice(Math.max(0, m.index - 120), m.index + 200);
        assert.match(w, /approximately/i, `US$5,175 appears unqualified in ${file}:\n${w}`);
      }
      // 5639 - 464 = 5175. Guard the arithmetic itself.
      assert.equal(5639 - 464, 5175);
    });
  }
});

describe("the locally sourced configuration names the discounted item", () => {
  for (const file of PRICING_PAGES) {
    test(`${file} names the discounted item on the discount price row`, () => {
      // Structural: the row carrying the discount must itself name what is
      // locally sourced. A word appearing elsewhere in the callout does not count.
      const line = priceLines(read(file)).find((l) => l.value.includes("US$464"));
      assert.ok(line, `${file} has no US$464 price line`);
      for (const item of ["Traxxas chassis"]) {
        assert.ok(
          line.label.includes(item),
          `the US$464 row in ${file} does not name "${item}":\n${line.label}`,
        );
      }
    });

    test(`${file} names the discounted item in every discount sentence`, () => {
      // For each mention of the discount, the sentence it sits in — plus the
      // two before it — must name the item that is locally sourced.
      const text = visibleText(read(file));
      const sentences = text.split(/(?<=\.)\s+/);
      const mentions = sentences.map((s, i) => [s, i]).filter(([s]) => s.includes("US$464"));
      assert.ok(mentions.length > 0, `${file} never mentions the local-sourcing discount`);
      for (const [, i] of mentions) {
        const context = sentences.slice(Math.max(0, i - 2), i + 1).join(" ");
        for (const item of ["Traxxas chassis"]) {
          assert.ok(
            context.includes(item),
            `a US$464 mention in ${file} does not name "${item}" in context:\n${context}`,
          );
        }
      }
    });

    test(`${file} keeps the discount scoped to international orders`, () => {
      assert.match(
        visibleText(read(file)),
        /international/i,
        `${file} does not scope the local-sourcing option to international orders`,
      );
    });
  }
});

describe("the complete kit is never described as excluding chassis, battery or charger", () => {
  for (const file of ALL_HTML) {
    test(`${file} carries no blanket exclusion claim`, () => {
      const text = visibleText(read(file));
      // The pre-existing contradiction this replaced. Any resurrection of a
      // sentence claiming the kit as a whole omits these parts must fail.
      const forbidden = [
        /by excluding only the chassis, battery,? and charger/i,
        /kit excludes the chassis/i,
        /chassis, battery and charger are not included/i,
        /does not include the chassis, battery/i,
      ];
      for (const re of forbidden) {
        assert.ok(!re.test(text), `${file} claims the complete kit excludes chassis/battery/charger: ${re}`);
      }
    });
  }

  for (const file of PRICING_PAGES) {
    test(`${file} states the complete kit includes all three`, () => {
      const text = visibleText(read(file));
      assert.match(
        text,
        /(including|include[sd]?) the (Traxxas )?chassis/i,
        `${file} never affirms that the complete kit includes the chassis`,
      );
    });
  }
});

describe("shipping is never folded into the kit price", () => {
  for (const file of PRICING_PAGES) {
    test(`${file} does not describe shipping as included`, () => {
      const text = visibleText(read(file));
      const forbidden = [
        /shipping is included/i,
        /includes? (free )?shipping/i,
        /free shipping/i,
        /shipping included/i,
        /price includes? (delivery|freight)/i,
      ];
      for (const re of forbidden) {
        assert.ok(!re.test(text), `${file} presents shipping as included: ${re}`);
      }
    });

    test(`${file} says shipping is charged separately`, () => {
      assert.match(visibleText(read(file)), /separate|separately/i);
    });
  }
});

describe("structured data carries the current commerce facts", () => {
  for (const file of ALL_HTML) {
    test(`${file} JSON-LD parses`, () => {
      assert.doesNotThrow(() => jsonLd(read(file)));
    });

    test(`${file} JSON-LD carries no retired USD 5900 price`, () => {
      const machine = machineText(read(file));
      for (const stale of ['"price": "5900"', '"price":"5900"', "US$5,900", "USD 5,900"]) {
        assert.ok(!machine.includes(stale), `${file} JSON-LD still advertises ${stale}`);
      }
    });
  }

  for (const file of ["index.html", "autonomous-racing-robotics-kit.html"]) {
    test(`${file} Product offers are exactly the four firm configurations`, () => {
      const offers = offersIn(read(file));
      const priced = offers.map((o) => `${o.priceCurrency} ${o.price}`).sort();
      assert.deepEqual(
        priced,
        ["INR 580000", "INR 628000", "USD 5639", "USD 6100"],
        `unexpected offers in ${file}`,
      );
    });

    test(`${file} the USD 6100 offer is the Tech Support configuration`, () => {
      const tech = offersIn(read(file)).filter((o) => o.priceCurrency === "USD" && o.price === "6100");
      assert.equal(tech.length, 1, `${file} does not have exactly one USD 6100 offer`);
      assert.match(
        tech[0].name,
        /With Tech Support/i,
        `the USD 6100 offer in ${file} is not named as the Tech Support configuration:\n${tech[0].name}`,
      );
      assert.match(
        tech[0].description,
        /Software Setup \/ Technical Support/i,
        `the USD 6100 offer in ${file} does not describe the service it includes`,
      );
      // It must not be presented as the plain/base international kit.
      assert.ok(
        !/^Complete RoboRacer Core Kit - international$/i.test(tech[0].name),
        `the USD 6100 offer in ${file} is presented as the standard international kit`,
      );
    });

    test(`${file} the USD 6100 offer did not replace the USD 5639 offer`, () => {
      const usd = offersIn(read(file)).filter((o) => o.priceCurrency === "USD");
      const prices = usd.map((o) => o.price).sort();
      assert.deepEqual(prices, ["5639", "6100"], `${file} lost or duplicated a USD offer`);
      const std = usd.find((o) => o.price === "5639");
      assert.ok(std, `${file} no longer publishes the standard USD 5639 offer`);
      assert.match(
        std.description,
        /not included in this price/i,
        `the USD 5639 offer in ${file} no longer excludes the service`,
      );
    });

    test(`${file} publishes no duplicate offers`, () => {
      const keys = offersIn(read(file)).map((o) => `${o.priceCurrency} ${o.price} ${o.name}`);
      assert.equal(new Set(keys).size, keys.length, `${file} has duplicate Offer nodes:\n${keys.join("\n")}`);
    });

    test(`${file} has exactly one Product node`, () => {
      const products = jsonLd(read(file))
        .flatMap((doc) => [...nodes(doc)])
        .filter((n) => n["@type"] === "Product");
      assert.equal(products.length, 1, `${file} has ${products.length} Product nodes`);
    });

    test(`${file} offers declare tax as not included`, () => {
      for (const o of offersIn(read(file))) {
        assert.equal(
          o.valueAddedTaxIncluded,
          false,
          `offer ${o.price} in ${file} implies tax-inclusive pricing`,
        );
      }
    });

    test(`${file} offers carry shipping as a separate rate, not in the price`, () => {
      for (const o of offersIn(read(file))) {
        const rate = o.shippingDetails?.shippingRate;
        assert.ok(rate, `offer ${o.price} in ${file} has no shippingDetails`);
        const expected = o.priceCurrency === "INR" ? "4500" : "500";
        assert.equal(rate.value, expected, `offer ${o.price} in ${file} has the wrong shipping rate`);
        assert.equal(rate.currency, o.priceCurrency);
      }
    });

    test(`${file} does not advertise the indicative price as a firm Offer`, () => {
      // approximately US$5,175 is a quotation-controlled estimate; publishing
      // it as machine-readable commerce data would assert false precision.
      const prices = offersIn(read(file)).map((o) => String(o.price));
      assert.ok(!prices.includes("5175"), `${file} publishes the indicative price as an Offer`);
    });

    test(`${file} identifies Software Setup / Technical Support on the INR 628,000 offer`, () => {
      const offer = offersIn(read(file)).find((o) => String(o.price) === "628000");
      assert.ok(offer, "no INR 628,000 offer found");
      assert.match(offer.name, /Software Setup \/ Technical Support/);
    });

    test(`${file} does not attach the service to the INR 580,000 offer`, () => {
      const offer = offersIn(read(file)).find((o) => String(o.price) === "580000");
      assert.ok(offer, "no INR 580,000 offer found");
      assert.ok(
        !/with Software Setup \/ Technical Support/i.test(offer.name),
        "the INR 580,000 offer is named as including the service",
      );
      assert.match(
        offer.description ?? "",
        /not included/i,
        "the INR 580,000 offer does not say the service is excluded",
      );
    });

    test(`${file} INR offers describe the same physical kit`, () => {
      const inr = offersIn(read(file)).filter((o) => o.priceCurrency === "INR");
      assert.equal(inr.length, 2);
      for (const o of inr) {
        assert.match(
          o.description ?? "",
          /complete physical Core Kit/i,
          `offer ${o.price} does not state it is the same complete physical kit`,
        );
      }
    });

    test(`${file} international offer does not absorb destination charges`, () => {
      const usd = offersIn(read(file)).find((o) => o.priceCurrency === "USD");
      assert.ok(usd, "no USD offer found");
      const d = usd.description ?? "";
      assert.match(d, /FOB/, "the USD offer does not state FOB terms");
      assert.match(
        d,
        /covers shipping only; destination customs clearance, import duties, local taxes and related destination charges are the buyer's responsibility/i,
        "the USD offer does not place destination charges with the buyer",
      );
      for (const re of [/duties included/i, /customs cleared/i, /duty[- ]paid/i, /DDP/]) {
        assert.ok(!re.test(d), `the USD offer implies Ambimat covers destination charges: ${re}`);
      }
    });
  }
});

describe("pricing pages stay in agreement", () => {
  const FIGURES = ["INR 580,000", "INR 628,000", "INR 4,500", "US$5,639", "US$464", "US$5,175", "US$500"];
  for (const figure of FIGURES) {
    test(`every pricing page shows ${figure}`, () => {
      for (const file of PRICING_PAGES) {
        assert.ok(visibleText(read(file)).includes(figure), `${file} is missing ${figure}`);
      }
    });
  }
});

describe("required page metadata survives content edits", () => {
  for (const file of INDEXABLE_PAGES) {
    test(`${file} keeps canonical, title, description, H1 and social metadata`, () => {
      const html = read(file);
      const slug = file === "index.html" ? "/" : `/${file}`;

      const canonical = html.match(/<link rel="canonical" href="([^"]+)"/);
      assert.ok(canonical, `${file} lost its canonical`);
      assert.equal(canonical[1], `https://roboracer.ambimat.com${slug}`);

      const title = html.match(/<title>([^<]+)<\/title>/);
      assert.ok(title && title[1].trim().length > 10, `${file} lost its <title>`);

      const description = html.match(/<meta\s+name="description"\s+content="([^"]+)"/);
      assert.ok(description && description[1].trim().length >= 50, `${file} lost its meta description`);

      const h1s = [...html.matchAll(/<h1[\s>]/g)];
      assert.equal(h1s.length, 1, `${file} must have exactly one <h1>, found ${h1s.length}`);

      for (const prop of ["og:title", "og:description", "og:url", "og:image", "og:type"]) {
        assert.ok(html.includes(`property="${prop}"`), `${file} lost ${prop}`);
      }
      for (const name of ["twitter:card", "twitter:title", "twitter:image"]) {
        assert.ok(html.includes(`name="${name}"`), `${file} lost ${name}`);
      }
    });
  }
});

describe("inferred component variants keep their caveat", () => {
  // These model names were inferred from the platform standard, not supplied by
  // the build team, and the business has decided not to commit to them publicly.
  // The caveat is what keeps them honest, so it is asserted against the sentence
  // that actually carries it — not merely somewhere on the page.
  test("the specifications page defers the exact build to the quotation", () => {
    assert.match(
      visibleText(read("specifications.html")),
      /exact build is confirmed on your quotation/i,
      "specifications.html lost its exact-build caveat",
    );
  });

  test("the cornerstone page defers the exact variants to the quotation", () => {
    const text = visibleText(read("autonomous-racing-robotics-kit.html"));
    assert.match(
      text,
      /sensor and compute variants are confirmed on your quotation/i,
      "the cornerstone lost its variant caveat",
    );
    const machine = machineText(read("autonomous-racing-robotics-kit.html"));
    assert.match(
      machine,
      /Exact sensor and compute variants are confirmed on your quotation/i,
      "the cornerstone FAQ schema lost its variant caveat",
    );
  });

  test("no page presents the inferred variants as settled fact", () => {
    for (const file of ALL_HTML) {
      const text = visibleText(read(file));
      for (const re of [
        /variants are exactly as listed/i,
        /these are the exact shipped variants/i,
        /guaranteed to ship with (the )?(Hokuyo|VESC|Jetson)/i,
      ]) {
        assert.ok(!re.test(text), `${file} presents inferred variants as settled: ${re}`);
      }
    }
  });
});
