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

/** Every page that quotes a price. Keep in sync with the audit in the commit.
 *  The Core Kit page left this list on 26-Aug when its commercial section was
 *  removed on the owner's instruction; Home and Contact remain the two
 *  surfaces that quote figures, and every assertion below still runs on both. */
const PRICING_PAGES = ["index.html", "contact.html"];

/** Every indexable page, for the metadata regression checks. */
const INDEXABLE_PAGES = [
  "index.html",
  "autonomous-racing-robotics-kit.html",
  "our-clients.html",
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
    test(`${file} only uses US$6,250 for the Tech Support configuration`, () => {
      // US$6,250 is the international kit *with* Software Setup / Technical
      // Support. It must never be presented as the standard kit price.
      const text = visibleText(read(file));
      for (const m of text.matchAll(/US\$6,?100/g)) {
        const w = text.slice(Math.max(0, m.index - 200), m.index + 60);
        assert.match(
          w,
          /Core Kit Pro|With Tech Support|Software Setup ?\/ ?Technical Support/i,
          `${file} quotes US$6,250 without naming the Tech Support configuration:\n${w}`,
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

    test(`${file} excludes destination charges from the US$450 per-kit shipping rate`, () => {
      const text = visibleText(read(file));
      assert.match(
        text,
        /US\$450 per kit, and that charge covers shipping only|US\$450 charge covers shipping only/i,
        `${file} does not scope the US$450 per-kit charge`,
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
    test(`${file} states the service is not included in US$5,870`, () => {
      assert.match(
        visibleText(read(file)),
        /not included in the US\$5,870 (international|kit) price|US\$5,870, which does not include\s+Software Setup \/ Technical Support/i,
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

    test(`${file} says the US$450 per-kit rate covers shipping only`, () => {
      assert.match(
        visibleText(read(file)),
        /US\$450 per kit, and that charge covers shipping only|covers shipping only/i,
        `${file} does not state that US$450 per kit is shipping only`,
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

    test(`${file} positions the US$5,870 row as customer-managed`, () => {
      const line = priceLines(read(file)).find((l) => l.value.includes("US$5,870"));
      assert.ok(line, `${file} has no US$5,870 row`);
      assert.match(
        line.label,
        /customer-managed software setup and integration/i,
        `the US$5,870 row in ${file} is not positioned as customer-managed:\n${line.label}`,
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
          "service excluded from US$5,870",
          /Software Setup \/ Technical Support is not included in the US\$5,870 kit price/i,
        ],
        ["operating system not flashed", /without\s+the operating system flashed/i],
        [
          "ROS stack / drivers not configured",
          /(ROS stack and(?: the)? LiDAR and VESC drivers are not configured)/i,
        ],
        ["60-day support not included", /60-day remote technical-support period is not included/i],
        [
          "Tech Support available as a priced configuration",
          /RoboRacer Core Kit Pro[^.]{0,60}for US\$6,250/i,
        ],
      ]) {
        assert.match(card.text, re, `the International card in ${file} does not state: ${what}`);
      }
    });

    test(`${file} states the service exclusion in correct English`, () => {
      const card = priceCards(read(file)).find((c) => /International/i.test(c.heading));
      assert.match(
        card.text,
        /Software Setup \/ Technical Support is not included in the US\$5,870 kit price\./,
        `the International card in ${file} does not carry the corrected exclusion sentence`,
      );
    });

    test(`${file} never asserts inclusion inside a customer-managed card`, () => {
      for (const card of priceCards(read(file))) {
        for (const re of [
          /Software Setup \/ Technical Support is included in the US\$5,870/i,
          /the 60-day remote technical-support period is included/i,
          /the Jetson is supplied with the operating system flashed/i,
        ]) {
          assert.ok(!re.test(card.text), `the ${card.heading} card in ${file} asserts inclusion: ${re}`);
        }
      }
    });

    test(`${file} never claims 580,000 or 5,870 include the setup activities`, () => {
      const text = visibleText(read(file));
      const forbidden = [
        /INR 580,000(?:(?!not|without|excluding)[^.]){0,140}\b(operating system (is )?flashed|ROS stack (is )?configured|drivers (are )?(pre-)?configured|60 days of remote)/i,
        /US\$5,870(?:(?!not|without|excluding)[^.]){0,140}\b(operating system (is )?flashed|ROS stack (is )?configured|drivers (are )?(pre-)?configured|60 days of remote)/i,
      ];
      for (const re of forbidden) {
        assert.ok(!re.test(text), `${file} attaches setup activities to a customer-managed price: ${re}`);
      }
    });

    test(`${file} offers the service to international buyers at a published price`, () => {
      assert.match(
        visibleText(read(file)),
        /RoboRacer Core Kit Pro[^.]{0,60}for US\$6,250/i,
        `${file} does not offer international buyers the Tech Support configuration`,
      );
    });

    test(`${file} invents no price for the international service`, () => {
      // The sentence offering the service separately must carry no figure.
      const APPROVED = new Set(["US$5,870", "US$464", "US$5,406", "US$450"]);
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
        /US\$5,870[^.]{0,100}(without|no) (the )?(Traxxas )?chassis/i,
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
    test(`${file} quotes US$5,870 for the complete kit`, () => {
      assert.match(visibleText(read(file)), /US\$5,870/);
    });

    test(`${file} quotes the US$450 per-kit shipping`, () => {
      assert.match(visibleText(read(file)), /US\$450 per kit/);
    });

    test(`${file} presents the US$464 discount as approximate`, () => {
      const text = visibleText(read(file));
      for (const m of text.matchAll(/US\$464/g)) {
        const w = text.slice(Math.max(0, m.index - 60), m.index + 20);
        assert.match(w, /approximately/i, `US$464 appears unqualified in ${file}:\n${w}`);
      }
    });

    test(`${file} presents US$5,406 as approximate and indicative`, () => {
      const text = visibleText(read(file));
      for (const m of text.matchAll(/US\$5,406/g)) {
        const w = text.slice(Math.max(0, m.index - 120), m.index + 200);
        assert.match(w, /approximately/i, `US$5,406 appears unqualified in ${file}:\n${w}`);
      }
      // 5870 - 464 = 5406. Guard the arithmetic itself.
      assert.equal(5870 - 464, 5406);
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
  // The informational pages deliberately carry no Product/Offer markup. The Core
  // Kit cannot be bought here — India orders go by email, international orders go
  // to orders.ambimat.com, which is the merchant surface and carries its own
  // Product/Offer schema. Removed 2026-09-02; this test stops it coming back.
  for (const file of ["index.html", "autonomous-racing-robotics-kit.html"]) {
    test(`${file} publishes no Product or Offer markup`, () => {
      const found = jsonLd(read(file))
        .flatMap((doc) => [...nodes(doc)])
        .map((n) => n["@type"])
        .filter((t) => t === "Product" || t === "Offer" || t === "AggregateOffer");
      assert.deepEqual(found, [], `${file} reintroduced merchant markup: ${found.join(", ")}`);
    });
  }
});

describe("pricing pages stay in agreement", () => {
  const FIGURES = ["INR 580,000", "INR 628,000", "INR 4,500", "US$5,870", "US$464", "US$5,406", "US$450"];
  for (const figure of FIGURES) {
    test(`every pricing page shows ${figure}`, () => {
      for (const file of PRICING_PAGES) {
        assert.ok(visibleText(read(file)).includes(figure), `${file} is missing ${figure}`);
      }
    });
  }
});

describe("international shipping is priced per kit, not per order", () => {
  // Shipping was US$500 per ORDER, with a US$565 shortcut for a kit plus power
  // boards and a "quoted rate" escape above one kit. The owner replaced all
  // three with a single rule: US$450 per kit. These guards exist so the old
  // per-order framing cannot creep back in through a copy edit.
  const KIT_SHIPPING = 450;

  test("the per-kit rate multiplies the way the policy says", () => {
    assert.equal(KIT_SHIPPING * 1, 450);
    assert.equal(KIT_SHIPPING * 2, 900);
    // Power Board shipping is a separate, unchanged US$65 component.
    assert.equal(KIT_SHIPPING + 65, 515);
    assert.equal(KIT_SHIPPING * 2 + 65, 965);
  });

  for (const file of PRICING_PAGES) {
    test(`${file} states the per-kit rule`, () => {
      assert.match(
        visibleText(read(file)),
        /US\$450 per kit/,
        `${file} does not state the US$450 per-kit shipping rate`,
      );
    });

    test(`${file} shows the two-kit total that follows from it`, () => {
      assert.match(visibleText(read(file)), /US\$900/, `${file} does not show that two kits ship for US$900`);
    });

    test(`${file} keeps the US$65 Power Board rate separate`, () => {
      const text = visibleText(read(file));
      assert.match(text, /Power Board-only order ships for US\$65/i, `${file} lost the US$65 board rate`);
      assert.match(text, /US\$515/, `${file} lost the kit-plus-board US$515 rate`);
    });

    test(`${file} carries no per-order or quoted-rate shipping language`, () => {
      const text = visibleText(read(file));
      for (const re of [
        /US\$500/,
        /US\$565/,
        /Core Kit-only order/i,
        /shipped on a quoted rate/i,
        /more than one Core Kit are shipped/i,
      ]) {
        assert.ok(!re.test(text), `${file} still carries superseded shipping language: ${re}`);
      }
    });

    test(`${file} does not fold shipping into the kit price`, () => {
      assert.ok(
        !/US\$(5,870|6,250)[^.]{0,80}(shipping included|including shipping|inclusive of shipping)/i.test(
          visibleText(read(file)),
        ),
        `${file} implies shipping is included in the kit price`,
      );
    });
  }
});

describe("kit orders are wire-transfer only, with no Ambimat surcharge", () => {
  for (const file of PRICING_PAGES) {
    test(`${file} names International Wire Transfer as the payment route`, () => {
      assert.match(
        visibleText(read(file)),
        /International Wire Transfer/,
        `${file} does not state the wire-transfer payment policy`,
      );
    });

    test(`${file} disclaims any Ambimat-side handling surcharge`, () => {
      assert.match(
        visibleText(read(file)),
        /Ambimat adds no P&H, payment-processing or wire-transfer handling charge/i,
        `${file} does not disclaim the Ambimat P&H surcharge`,
      );
    });

    test(`${file} places bank and intermediary charges on the buyer`, () => {
      assert.match(
        visibleText(read(file)),
        /(bank,\s*correspondent-bank or intermediary charges|bank or intermediary charges)[^.]{0,90}buyer's responsibility/i,
        `${file} does not place bank charges with the buyer`,
      );
    });

    test(`${file} does not offer a card or wallet gateway for kits`, () => {
      const text = visibleText(read(file));
      for (const re of [/pay by card/i, /credit card/i, /PayPal/i, /Stripe/i, /PayGlocal/i, /Juspay/i]) {
        assert.ok(!re.test(text), `${file} offers a non-wire payment route: ${re}`);
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

/* -------------------------------------------------------------------------
   Contact pricing component — structure.

   The 20-Aug restructure moved content between the four blocks of the
   Contact pricing section: the Software Setup / Technical Support
   explanation went into both pricing cards, the FOB/shipping paragraph
   moved out of the International card into the first callout, and each
   order CTA moved to the bottom of its own card. These guards pin that
   arrangement so a later edit cannot quietly duplicate a paragraph, strip
   a CTA, or split the two buttons back onto different treatments.
   ---------------------------------------------------------------------- */

/** Raw inner markup of each `.price-card`, keyed by its heading. */
function priceCardMarkup(html) {
  const out = {};
  for (const m of html.matchAll(/<article class="price-card">([\s\S]*?)<\/article>/g)) {
    const h = m[1].match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    out[visibleText(h ? h[1] : "")] = m[1];
  }
  return out;
}

/** Raw inner markup of each `.callout`, in document order. */
function calloutMarkup(html) {
  return [...html.matchAll(/<div class="callout">([\s\S]*?)<\/div>/g)].map((m) => m[1]);
}

const SUPPORT_SENTENCE = "This covers loading of the operating system for the";
const FOB_SENTENCE = "International quotations are supplied on";
const SHIPPING_POLICY_HREF = 'href="https://orders.ambimat.com/shipping-policy/"';
const INDIA_CTA_HREF =
  'href="https://mail.google.com/mail/?view=cm&amp;fs=1&amp;to=business.development@ambimat.com"';
const INTL_CTA_HREF = 'href="https://orders.ambimat.com/"';

describe("contact pricing component keeps its restructured layout", () => {
  const html = read("contact.html");
  const cards = priceCardMarkup(html);
  const callouts = calloutMarkup(html);

  test("both pricing cards exist", () => {
    assert.deepStrictEqual(Object.keys(cards).sort(), ["India", "International"]);
    assert.strictEqual(callouts.length, 2, "the pricing section should still have exactly two callouts");
  });

  for (const card of ["India", "International"]) {
    test(`the ${card} card explains Software Setup / Technical Support exactly once`, () => {
      const hits = cards[card].split(SUPPORT_SENTENCE).length - 1;
      assert.strictEqual(hits, 1, `${card} card has ${hits} copies of the support explanation, expected 1`);
    });

    test(`the ${card} card ends with its own order CTA`, () => {
      const m = cards[card].match(/<div class="order-actions">([\s\S]*?)<\/div>/);
      assert.ok(m, `${card} card lost its .order-actions block`);
      const anchors = [...m[1].matchAll(/<a\b/g)].length;
      assert.strictEqual(anchors, 1, `${card} card should hold exactly one CTA, found ${anchors}`);
      // .order-actions is the last element, so `margin-top: auto` pins it to
      // the bottom of the flex card rather than a hard-coded height.
      const after = cards[card].slice(cards[card].indexOf('<div class="order-actions">'));
      assert.ok(!/<p\b|<ul\b|<h3\b/.test(after.replace(/<div class="order-actions">[\s\S]*?<\/div>/, "")));
    });
  }

  test("the India CTA keeps its mail destination and sits in the India card", () => {
    assert.ok(cards.India.includes(INDIA_CTA_HREF), "India CTA href changed or left the India card");
    assert.ok(cards.India.includes("Request an India quotation"));
    assert.ok(!cards.International.includes("Request an India quotation"));
  });

  test("the International CTA keeps its store destination and sits in the International card", () => {
    assert.ok(cards.International.includes(INTL_CTA_HREF), "International CTA href changed or left the card");
    assert.ok(cards.International.includes("International orders<"));
    assert.ok(!cards.India.includes("International orders<"));
  });

  test("both CTAs use the same button treatment", () => {
    const classOf = (markup) => markup.match(/<a\s+class="([^"]*btn[^"]*)"/)[1];
    const inIndia = classOf(cards.India.match(/<div class="order-actions">[\s\S]*?<\/div>/)[0]);
    const inIntl = classOf(cards.International.match(/<div class="order-actions">[\s\S]*?<\/div>/)[0]);
    assert.strictEqual(inIndia, inIntl, `pricing CTAs drifted apart: "${inIndia}" vs "${inIntl}"`);
    assert.match(inIndia, /\bbtn\b/);
  });

  test("the FOB paragraph lives in the first callout, not the International card", () => {
    assert.ok(
      !cards.International.includes(FOB_SENTENCE),
      "the FOB paragraph is back inside the International card",
    );
    assert.ok(callouts[0].includes(FOB_SENTENCE), "the first callout lost the FOB paragraph");
    assert.ok(
      callouts[0].includes(SHIPPING_POLICY_HREF),
      "the shipping-policy link did not travel with the paragraph",
    );
    assert.match(callouts[0], /is\s+authoritative\./, "the moved paragraph was truncated");
  });

  test("the first callout no longer duplicates the support explanation", () => {
    assert.ok(!callouts[0].includes(SUPPORT_SENTENCE), "support text is duplicated in the first callout");
  });

  test("the second callout still carries the battery, charger and chassis terms", () => {
    const text = visibleText(callouts[1]);
    for (const phrase of [
      "battery and charger are excluded from international shipment",
      "must be sourced locally by the customer",
      "Traxxas chassis may be supplied with the kit or sourced locally",
      "approximately US$464",
    ]) {
      assert.ok(text.includes(phrase), `second callout lost: ${phrase}`);
    }
  });

  test("no orphaned CTA row survives below the callouts", () => {
    assert.ok(
      !html.includes("order-actions section-cta"),
      "the old button row below the callouts is still present",
    );
    const rows = [...html.matchAll(/class="order-actions"/g)].length;
    assert.strictEqual(rows, 3, `expected 3 .order-actions rows (Order Now + 2 cards), found ${rows}`);
  });
});

describe("assembly video card keeps its destination and structure", () => {
  const html = read("resource.html");
  const card = html.match(/<article class="card video-card">([\s\S]*?)<\/article>/)[1];
  const FULL_VIDEO = "https://www.youtube.com/watch?v=HMK_diuJNmA&amp;t=7s";

  test("the media area and the Watch Video button both open the full video", () => {
    const hrefs = [...card.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    assert.strictEqual(hrefs.length, 2, `expected 2 links in the video card, found ${hrefs.length}`);
    for (const h of hrefs) assert.strictEqual(h, FULL_VIDEO, `video card link changed destination: ${h}`);
  });

  test("the supplied video title is not renamed", () => {
    assert.match(card, /<h3>F1Tenth Assembling<\/h3>/, "the video title was renamed");
  });

  test("the media keeps a 16:9 frame and intrinsic dimensions", () => {
    assert.match(card, /width="640"/);
    assert.match(card, /height="360"/);
    assert.match(card, /alt="F1Tenth Assembling video"/, "the thumbnail lost its accessible alt text");
  });

  test("new-tab behaviour keeps its opener protection", () => {
    const targets = [...card.matchAll(/target="_blank"/g)].length;
    const rels = [...card.matchAll(/rel="noopener noreferrer"/g)].length;
    assert.strictEqual(targets, 2);
    assert.strictEqual(rels, 2, "a _blank link lost rel=noopener noreferrer");
  });

  test("the card never nests an interactive element inside a link", () => {
    for (const m of card.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)) {
      assert.ok(
        !/<a\b|<button\b|<iframe\b/.test(m[1]),
        "the video card nests an interactive element inside a link",
      );
    }
  });
});

/* -------------------------------------------------------------------------
   21-Aug UI pass: compact pricing CTAs, a centred Watch Video row, and the
   PDU wiring PDF added to the power-board section. These guards pin the
   parts that are easy to undo by accident — the CTAs must not go back to
   forced full-width, the video row must stay centred without the button
   itself being restyled, and the PDF link text, description, destination
   and placement are all fixed by the request.
   ---------------------------------------------------------------------- */

const PDU_PDF_HREF = "/files/roboracer-pdu-wiring-connection-guide.pdf";
const PDU_LINK_TEXT = "RoboRacer PDU Wiring &amp; Connection Guide (PDF)";
const PDU_DESCRIPTION =
  "Detailed wiring, power distribution, and PDU connection reference for the RoboRacer build.";

describe("pricing CTAs size to their label", () => {
  const css = fs.readFileSync(path.join(REPO, "assets/css/main.css"), "utf8");
  const rule = css.match(/\.price-card \.order-actions \.btn \{([^}]*)\}/);

  test("the pricing-card CTA rule no longer forces full width", () => {
    assert.ok(rule, ".price-card .order-actions .btn rule disappeared");
    assert.ok(!/width:\s*100%/.test(rule[1]), "the pricing CTAs are stretched to the card again");
    assert.match(rule[1], /width:\s*fit-content/, "the pricing CTAs lost their intrinsic width");
  });

  test("the CTAs keep their card, their labels and their destinations", () => {
    const html = read("contact.html");
    const cards = {};
    for (const m of html.matchAll(/<article class="price-card">([\s\S]*?)<\/article>/g)) {
      const h = m[1].match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
      cards[visibleText(h ? h[1] : "")] = m[1];
    }
    assert.ok(cards.India.includes("Request an India quotation"));
    assert.ok(cards.India.includes("mail.google.com/mail/?view=cm"));
    assert.ok(cards.International.includes("International orders<"));
    assert.ok(cards.International.includes('href="https://orders.ambimat.com/"'));
    for (const c of ["India", "International"]) {
      const row = cards[c].match(/<div class="order-actions">[\s\S]*?<\/div>/);
      assert.ok(row, `${c} card lost its CTA row`);
      assert.match(row[0], /class="btn btn-primary"/, `${c} CTA changed treatment`);
    }
  });
});

describe("the Watch Video row is centred without restyling the button", () => {
  const css = fs.readFileSync(path.join(REPO, "assets/css/main.css"), "utf8");

  test("the alignment is scoped to the video card's action row", () => {
    assert.match(
      css,
      /\.video-card \.section-cta \{[^}]*text-align:\s*center/,
      "the Watch Video row is no longer centred",
    );
  });

  test("no global button or section-cta rule was introduced to do it", () => {
    // A bare `.btn { ... center }` or `.section-cta { ... center }` would move
    // every other CTA on the site, which this change must not do.
    assert.ok(!/^\.btn \{[^}]*text-align:\s*center/m.test(css), "a global .btn centring rule appeared");
    assert.ok(
      !/^\.section-cta \{[^}]*text-align:\s*center/m.test(css),
      "a global .section-cta centring rule appeared",
    );
  });

  test("the button itself keeps its classes, size and destination", () => {
    const card = read("resource.html").match(/<article class="card video-card">([\s\S]*?)<\/article>/)[1];
    const cta = card.match(/<p class="section-cta">([\s\S]*?)<\/p>/)[1];
    assert.match(cta, /class="btn btn-primary"/, "the Watch Video button changed treatment");
    assert.ok(!/style=/.test(cta), "an inline style was added to the Watch Video button");
    assert.ok(!/width/.test(cta), "a width was pinned on the Watch Video button");
    assert.ok(cta.includes("https://www.youtube.com/watch?v=HMK_diuJNmA&amp;t=7s"));
    assert.ok(cta.includes(">Watch Video<"));
  });
});

describe("the PDU wiring guide is published and linked", () => {
  const html = read("resource.html");
  const section =
    html.match(/<section class="section" id="about-board">?[\s\S]*?<\/section>/) ||
    html.match(/<section[^>]*id="about-board"[\s\S]*?<\/section>/);

  test("the PDF asset exists and is a real PDF", () => {
    const p = path.join(REPO, "files/roboracer-pdu-wiring-connection-guide.pdf");
    assert.ok(fs.existsSync(p), "the PDU PDF is missing from files/");
    const fd = fs.openSync(p, "r");
    const head = Buffer.alloc(5);
    fs.readSync(fd, head, 0, 5, 0);
    fs.closeSync(fd);
    assert.strictEqual(head.toString("latin1"), "%PDF-", "the published asset is not a PDF");
    assert.ok(fs.statSync(p).size > 100_000, "the published PDF looks truncated");
  });

  test("the link text and description are exactly as supplied", () => {
    assert.ok(section, "the power-board section disappeared");
    assert.ok(section[0].includes(PDU_LINK_TEXT), "the PDF link text drifted from the supplied wording");
    assert.ok(section[0].includes(PDU_DESCRIPTION), "the PDF description drifted from the supplied wording");
    assert.ok(section[0].includes("📄"), "the document emoji was dropped");
  });

  test("the link points at the local asset and opens in a new tab", () => {
    const a = section[0].match(new RegExp(`<a[^>]*href="${PDU_PDF_HREF}"[^>]*>`));
    assert.ok(a, "the PDF link does not point at the published asset");
    assert.match(a[0], /target="_blank"/, "the PDF link does not open in a new tab");
    assert.match(a[0], /rel="[^"]*noopener/, "the PDF link lost rel=noopener");
    assert.ok(!/download/.test(a[0]), "the PDF link force-downloads instead of opening");
  });

  test("the PDF sits before the regulated-output list", () => {
    const s = section[0];
    assert.ok(s.indexOf(PDU_PDF_HREF) < s.indexOf("<ul>"), "the PDF block landed after the output bullets");
  });

  test("the existing power-board copy, diagram and bullets are untouched", () => {
    const s = section[0];
    for (const phrase of [
      "A 1:10-scale autonomous vehicle runs three different supply voltages off one battery",
      "The board takes input either from the 3S lithium-polymer traction pack",
      "roboracer-power-board-diagram.png",
      "RoboRacer AE170 power distribution board V02.04",
      "19 V, up to 3 A",
      "12 V, up to 2 A",
      "5 V, up to 1 A",
      "Those currents are totals across all outputs on a rail taken together",
    ]) {
      assert.ok(s.includes(phrase), `power-board section lost: ${phrase}`);
    }
    assert.strictEqual((s.match(/<li>/g) || []).length, 3, "the regulated-output bullet count changed");
  });
});

/* -------------------------------------------------------------------------
   26-Aug pass. The Core Kit page stopped being a commercial surface, the
   Home hero CTA now opens the same India quotation action as Contact, and
   the Our Clients page went up from the supplied spreadsheet and logo pack.
   clients.fixture.json is generated from that spreadsheet, so these guards
   compare the published page against the source of truth rather than
   against a hand-copied list.
   ---------------------------------------------------------------------- */

const CLIENTS = JSON.parse(fs.readFileSync(path.join(REPO, "tests/clients.fixture.json"), "utf8"));
const ALL_NAV_PAGES = ALL_HTML;

describe("commercial figures are written the same way everywhere", () => {
  // contact.html carried one FAQ answer that wrote the Pro price as "US$6250"
  // and the support tier as "Software Setup/Technical Support", against 11 and
  // 58 correctly formatted occurrences elsewhere. The values never differed --
  // only the formatting -- and the same sentence is mirrored into FAQ schema,
  // so both copies must stay in step.
  test("no US$ figure over a thousand drops its separator", () => {
    for (const file of ALL_HTML) {
      const offenders = [...read(file).matchAll(/US\$\d{4,}/g)].map((m) => m[0]);
      assert.deepStrictEqual(offenders, [], `${file} writes ${offenders.join(", ")} without a separator`);
    }
  });

  test("the support tier keeps its spaced slash", () => {
    for (const file of ALL_HTML) {
      assert.ok(
        !read(file).includes("Software Setup/Technical Support"),
        `${file} uses the unspaced Software Setup/Technical Support form`,
      );
    }
  });

  test("the corrected contact answer still reads the same in copy and in schema", () => {
    const contact = read("contact.html");
    const faq = [...nodes(jsonLd(contact))].find((n) => n["@type"] === "FAQPage");
    const schemaText = faq.mainEntity.map((q) => q.acceptedAnswer.text).join(" ");
    assert.match(schemaText, /US\$6,250 with Software Setup \/ Technical Support/);
    assert.match(
      visibleText(contact).replace(/\s+/g, " "),
      /US\$6,250 with Software Setup \/ Technical Support/,
    );
  });
});

describe("the homepage parts grid names components the way the rest of the site does", () => {
  // The parts grid carried two stale spellings that contradicted the
  // specifications page and the store. Guard the canonical names so the copy
  // cannot drift back, and check the whole site rather than Home alone.
  const STALE = ["Jetson Orin Super Nano", "MK IV VESC"];

  test("no page still carries a stale component spelling", () => {
    for (const file of ALL_HTML) {
      const text = read(file);
      for (const stale of STALE) {
        assert.ok(!text.includes(stale), `${file} still says ${stale}`);
      }
    }
  });

  test("the Home parts grid uses the canonical names", () => {
    const home = read("index.html");
    assert.match(home, /<span class="part-name">Jetson Orin Nano Super<\/span>/);
    assert.match(home, /<span class="part-name">VESC 6 MkIV<\/span>/);
  });

  test("the part descriptions beside them were not touched", () => {
    const home = read("index.html");
    assert.ok(
      home.includes("Onboard compute — Ampere GPU, CUDA and TensorRT for perception and control"),
      "the Jetson part description changed",
    );
    assert.ok(
      home.includes("Field-oriented motor control, steering, wheel odometry and onboard IMU"),
      "the VESC part description changed",
    );
  });
});

describe("the Home hero CTA opens the Contact pricing section", () => {
  const home = read("index.html");
  const contact = read("contact.html");

  test("the hero CTA lands on the Contact commercial pricing section", () => {
    // The CTA used to jump straight to the India quotation mail action, which
    // took the reader past the pricing they came to read. It now stops at the
    // pricing section, and the quotation action stays one click further on.
    const hero = home.match(/<div class="hero-actions">([\s\S]*?)<\/div>/)[1];
    const first = hero.match(
      /<a[^>]*class="btn btn-primary"[^>]*href="([^"]+)"|<a[^>]*href="([^"]+)"[^>]*class="btn btn-primary"/,
    );
    const href = first[1] || first[2];
    assert.strictEqual(
      href,
      "/contact.html#pricing",
      "the Home CTA does not point at the Contact pricing section",
    );
    assert.ok(!/mail\.google\.com/.test(href), "the Home CTA still jumps to the quotation mail action");
  });

  test("the anchor it points at exists and is the commercial pricing section", () => {
    const section = contact.match(/<section[^>]*id="pricing"[\s\S]*?<\/section>/);
    assert.ok(section, "contact.html has no #pricing section for the CTA to land on");
    assert.match(section[0], /<p class="eyebrow">Commercial<\/p>/, "#pricing is not the commercial block");
    assert.match(section[0], /id="pricing-title">Pricing</, "#pricing lost its heading");
  });

  test("the India quotation action still exists on Contact, one step further on", () => {
    const card = contact.match(/<article class="price-card">\s*<h3>India<\/h3>([\s\S]*?)<\/article>/)[1];
    const href = card.match(/<div class="order-actions">[\s\S]*?href="([^"]+)"/)[1];
    assert.match(href, /mail\.google\.com/, "the India quotation action changed");
  });

  test("the CTA keeps its label and treatment, and the secondary CTA is untouched", () => {
    const hero = home.match(/<div class="hero-actions">([\s\S]*?)<\/div>/)[1];
    assert.ok(hero.includes(">Order the Core Kit</a"), "the primary CTA label changed");
    assert.ok(hero.includes("btn btn-primary"), "the primary CTA lost its treatment");
    assert.ok(
      hero.includes('href="/autonomous-racing-robotics-kit.html">What is in the kit</a>'),
      "the secondary hero CTA was altered",
    );
  });
});

describe("the pricing-card CTAs are centred in their cards", () => {
  const css = fs.readFileSync(path.join(REPO, "assets/css/main.css"), "utf8");
  test("the pricing card action row centres its content", () => {
    const rule = css.match(/\.price-card \.order-actions \{([^}]*)\}/);
    assert.ok(rule, ".price-card .order-actions rule disappeared");
    assert.match(rule[1], /justify-content:\s*center/, "the pricing CTAs are not centred");
  });
  test("no global button rule was used to do it", () => {
    assert.ok(!/^\.btn \{[^}]*margin(-inline)?:\s*auto/m.test(css), "a global .btn centring rule appeared");
  });
  test("the CTA destinations are unchanged", () => {
    const c = read("contact.html");
    assert.ok(c.includes("mail.google.com/mail/?view=cm"), "the India CTA destination changed");
    assert.ok(c.includes('href="https://orders.ambimat.com/"'), "the International CTA destination changed");
  });
});

describe("the Core Kit page is no longer a commercial surface", () => {
  const kit = read("autonomous-racing-robotics-kit.html");

  test("the table of contents drops Pricing and ordering and ends on Questions", () => {
    const toc = kit.match(/<nav class="toc"[\s\S]*?<\/nav>/)[0];
    const items = [...toc.matchAll(/<li><a href="[^"]*">([^<]+)<\/a><\/li>/g)].map((m) => m[1]);
    assert.ok(!items.includes("Pricing and ordering"), "the pricing TOC entry is still there");
    assert.strictEqual(items.length, 7, `expected 7 TOC items, found ${items.length}`);
    assert.strictEqual(items[6], "Questions", "Questions is not the seventh item");
  });

  test("the Commercial pricing section and its four buttons are gone", () => {
    assert.ok(!/id="pricing"/.test(kit), "the #pricing section still exists");
    assert.ok(!kit.includes("Pricing and how to order"), "the commercial heading survived");
    for (const label of [
      "Core Kit on the store",
      "Core Kit Pro on the store",
      "Open-source board resources",
    ]) {
      assert.ok(!kit.includes(label), `removed CTA still present: ${label}`);
    }
  });

  test("no link on the page points at the deleted #pricing anchor", () => {
    assert.ok(!/href="#pricing"/.test(kit), "a dead #pricing link remains");
  });

  test("both removed FAQs are gone from the copy and the schema", () => {
    const gone = [
      "What does the RoboRacer Core Kit cost?",
      "Can I buy the chassis, battery and charger locally instead?",
    ];
    const machine = machineText(kit);
    for (const q of gone) {
      assert.ok(!kit.includes(q), `FAQ still visible: ${q}`);
      assert.ok(!machine.includes(q), `FAQ still in schema: ${q}`);
    }
  });

  test("the visible FAQ list and the FAQPage schema reconcile", () => {
    const visible = [...kit.matchAll(/<div class="faq-item">\s*<h3>([\s\S]*?)<\/h3>/g)].map((m) =>
      visibleText(m[1]).trim(),
    );
    const schema = [];
    const walk = (o) => {
      if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === "object") {
        if (o["@type"] === "Question") schema.push(o.name);
        Object.values(o).forEach(walk);
      }
    };
    jsonLd(kit).forEach(walk);
    assert.deepStrictEqual(visible, schema, "visible FAQ order/count does not match the FAQPage schema");
    assert.strictEqual(visible.length, 7, `expected 7 remaining FAQs, found ${visible.length}`);
  });

  test("the other pages keep their own copies of the removed questions", () => {
    assert.ok(
      read("contact.html").includes("Can I source the chassis, battery and charger locally?"),
      "the Contact page lost its equivalent chassis question",
    );
  });
});

describe("the Our Clients page matches the supplied spreadsheet", () => {
  const page = read("our-clients.html");

  test("the fixture carries every published client, with no duplicates", () => {
    // The spreadsheet supplied 48 rows; Hanyang University ERICA Campus was
    // withdrawn on the owner's instruction, so 47 are published. The fixture
    // tracks what the site shows, and every assertion below runs on all of them.
    assert.strictEqual(CLIENTS.length, 47);
    assert.strictEqual(new Set(CLIENTS.map((c) => c.name)).size, 47);
  });

  test("the page exists with the exact heading", () => {
    assert.match(page, /<h1 class="page-title">Our Clients<\/h1>/, "the H1 is not exactly 'Our Clients'");
    assert.match(
      page,
      /<link rel="canonical" href="https:\/\/roboracer\.ambimat\.com\/our-clients\.html" \/>/,
    );
    assert.match(page, /<meta name="robots" content="index,follow" \/>/);
  });

  test("every client appears exactly once, with nothing extra", () => {
    const shown = [...page.matchAll(/<h2 class="client-name">([\s\S]*?)<\/h2>/g)].map((m) =>
      visibleText(m[1]).trim(),
    );
    const expected = CLIENTS.map((c) => c.name);
    assert.strictEqual(shown.length, 47, `expected 47 cards, found ${shown.length}`);
    assert.strictEqual(new Set(shown).size, 47, "the page repeats a client");
    assert.deepStrictEqual(
      expected.filter((n) => !shown.includes(n)),
      [],
      "clients missing from the page",
    );
    assert.deepStrictEqual(
      shown.filter((n) => !expected.includes(n)),
      [],
      "clients on the page that are not in the spreadsheet",
    );
    assert.deepStrictEqual(shown, expected, "the page no longer follows spreadsheet row order");
  });

  test("each card carries the logo matched to that client", () => {
    for (const c of CLIENTS) {
      const card = page.match(
        new RegExp(
          `<li class="client-card">(?:(?!</li>)[\\s\\S])*?${c.name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}(?:(?!</li>)[\\s\\S])*?</li>`,
        ),
      );
      assert.ok(card, `no card found for ${c.name}`);
      assert.ok(card[0].includes(`/assets/img/clients/${c.asset}`), `${c.name} is not showing ${c.asset}`);
      assert.ok(fs.existsSync(path.join(REPO, "assets/img/clients", c.asset)), `missing asset for ${c.name}`);
    }
  });

  test("each logo offers candidates sized for every density we serve", () => {
    // The logo box is 238x96 on desktop but only 152x72 in the narrow grid, so a
    // density (x) descriptor cannot describe it: the same "2x" file is right for a
    // retina desktop and far too large for a phone. Width descriptors plus a
    // per-logo sizes let the browser pick, so each logo ships three candidates --
    // desktop 1x, the narrow-grid high-density size, and desktop 2x.
    for (const c of CLIENTS) {
      const [stem, ext] = [c.asset.replace(/\.[^.]+$/, ""), c.asset.split(".").pop()];
      const card = page.replace(/\s+/g, " ");
      const widths = [];
      for (const suffix of ["", "@mid", "@2x"]) {
        const file = `${stem}${suffix}.${ext}`;
        assert.ok(fs.existsSync(path.join(REPO, "assets/img/clients", file)), `missing ${file}`);
        const m = card.match(
          new RegExp(`/assets/img/clients/${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} (\\d+)w`),
        );
        assert.ok(m, `${c.name} does not offer ${file} as a width candidate`);
        widths.push(Number(m[1]));
      }
      assert.deepStrictEqual(
        widths,
        [...widths].sort((a, b) => a - b),
        `${c.name} candidate widths are not ascending`,
      );
      assert.strictEqual(new Set(widths).size, 3, `${c.name} has duplicate candidate widths`);
    }
    const imgs = [...page.matchAll(/<img[\s\S]*?\/>/g)].filter((m) => m[0].includes("/assets/img/clients/"));
    for (const i of imgs) {
      // Every logo carries a per-logo sizes; box-constrained ones additionally
      // carry min-width branches for the wider grids (see the sizes test above).
      const sizes = i[0].match(/sizes="([^"]*)"/);
      assert.ok(sizes, "a client logo has no per-logo sizes");
      const flat = sizes[1].replace(/\s+/g, " ").trim();
      assert.match(flat, /^(\((?:min|max)-width: \d+px\) \d+px, )+\d+px$/, `malformed sizes: ${flat}`);
    }
  });

  test("every website link comes from the spreadsheet and opens safely", () => {
    for (const c of CLIENTS) {
      const a = page.match(
        new RegExp(
          `<a class="client-link" href="${c.website.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}"[^>]*>`,
        ),
      );
      assert.ok(a, `no link for ${c.name} at ${c.website}`);
      assert.match(a[0], /target="_blank"/, `${c.name} link does not open in a new tab`);
      assert.match(a[0], /rel="noopener noreferrer"/, `${c.name} link is missing rel protection`);
    }
    const hrefs = [...page.matchAll(/<a class="client-link" href="([^"]+)"/g)].map((m) => m[1]);
    assert.strictEqual(hrefs.length, 47);
    assert.ok(!hrefs.some((h) => h.startsWith("http://")), "an insecure client link survived");
  });

  test("no spreadsheet address is published", () => {
    // The sheet carries an Address column the brief forbids publishing, so
    // compare against the real values rather than guessing at a postcode
    // shape: every supplied address, and its distinctive tail, must be absent.
    const text = visibleText(page).replace(/\s+/g, " ");
    for (const c of CLIENTS) {
      assert.ok(!text.includes(c.address), `the address for ${c.name} is published`);
      const tail = c.address.split(",").slice(-2).join(",").trim();
      if (tail.length > 8) assert.ok(!text.includes(tail), `part of ${c.name}'s address is published`);
    }
  });

  test("the sizes hint matches the measured grid at every layout", () => {
    // Measured from the built grid at 1px resolution: the logo box is at most
    // 194.8px wide once the grid reaches 5 columns (viewport >= 1356px), 238.75
    // at 4 columns, 259 at 3, 299.5 at 2. A logo is only box-constrained when
    // 96 * aspect exceeds the box, so most logos need no wide-desktop branch at
    // all -- their rendered width is the same in every column count.
    const MAX_5COL = 194.8;
    const imgs = [...page.matchAll(/<img[\s\S]*?\/>/g)].filter((m) => m[0].includes("/assets/img/clients/"));
    assert.strictEqual(imgs.length, 47);
    let withWideBranch = 0;
    for (const i of imgs) {
      const sizes = i[0].match(/sizes="([^"]*)"/)[1].replace(/\s+/g, " ");
      const width = Number(i[0].match(/width="(\d+)"/)[1]);
      const height = Number(i[0].match(/height="(\d+)"/)[1]);
      const rendered = Math.min(MAX_5COL, (96 * width) / height);
      const wide = sizes.match(/\(min-width: 1356px\) (\d+)px/);
      if (wide) {
        withWideBranch += 1;
        const hint = Number(wide[1]);
        assert.ok(hint <= MAX_5COL, `wide-desktop hint ${hint}px exceeds the measured 5-column box`);
        assert.ok(hint >= rendered - 1, `wide-desktop hint ${hint}px would undersize a ${rendered}px render`);
      } else {
        // No branch is only correct when the box never constrains this logo.
        assert.ok(
          (96 * width) / height <= MAX_5COL + 0.5,
          "a box-constrained logo is missing its wide-desktop sizes branch",
        );
      }
      assert.match(sizes, /\d+px$/, "sizes has no default branch");
    }
    assert.strictEqual(withWideBranch, 8, "the set of box-constrained logos changed");
  });

  test("every logo keeps all three width candidates", () => {
    const imgs = [...page.matchAll(/<img[\s\S]*?\/>/g)].filter((m) => m[0].includes("/assets/img/clients/"));
    for (const i of imgs) {
      const srcset = i[0].match(/srcset="([\s\S]*?)"/)[1].replace(/\s+/g, " ");
      const cands = [...srcset.matchAll(/\/assets\/img\/clients\/(\S+) (\d+)w/g)];
      assert.strictEqual(cands.length, 3, "a logo lost a candidate");
      for (const c of cands) {
        assert.ok(fs.existsSync(path.join(REPO, "assets/img/clients", c[1])), `missing ${c[1]}`);
      }
      const widths = cands.map((c) => Number(c[2]));
      assert.deepStrictEqual(
        widths,
        [...widths].sort((a, b) => a - b),
        "candidate widths are not ascending",
      );
    }
  });

  test("logos declare intrinsic dimensions and lazy-load below the fold", () => {
    const imgs = [...page.matchAll(/<img[\s\S]*?\/>/g)].filter((m) => m[0].includes("/assets/img/clients/"));
    assert.strictEqual(imgs.length, 47);
    for (const i of imgs) {
      assert.match(i[0], /width="\d+"/, "a client logo has no intrinsic width");
      assert.match(i[0], /height="\d+"/, "a client logo has no intrinsic height");
      assert.match(i[0], /alt="[^"]+ logo"/, "a client logo has no meaningful alt text");
    }
    assert.strictEqual(
      imgs.filter((i) => i[0].includes('loading="lazy"')).length,
      41,
      "the lazy/eager split for the logo grid changed",
    );
  });
});

describe("the 26-Aug client and hero corrections hold", () => {
  const clients = read("our-clients.html");
  const home = read("index.html");

  test("Chungnam National University points at its English site", () => {
    assert.ok(
      clients.includes('href="https://plus.cnu.ac.kr/html/en/"'),
      "the Chungnam link was not updated to the English site",
    );
    assert.ok(!clients.includes('href="https://plus.cnu.ac.kr/"'), "the old Chungnam link is still present");
    const row = CLIENTS.find((c) => c.name === "Chungnam National University");
    assert.strictEqual(row.website, "https://plus.cnu.ac.kr/html/en/");
  });

  test("Hanyang University ERICA Campus is gone, and only that entry", () => {
    assert.ok(!clients.includes("Hanyang University ERICA Campus"), "the ERICA entry is still on the page");
    assert.ok(!clients.includes("hanyang-university-erica-campus"), "an ERICA logo reference survived");
    assert.ok(
      !CLIENTS.some((c) => c.name === "Hanyang University ERICA Campus"),
      "ERICA is still in the fixture",
    );
    // The main Hanyang entry is a different client and must stay.
    assert.ok(clients.includes(">Hanyang University</h2>"), "the main Hanyang entry was removed by mistake");
    for (const file of ["hanyang-university-erica-campus.png", "hanyang-university-erica-campus@2x.png"]) {
      assert.ok(!fs.existsSync(path.join(REPO, "assets/img/clients", file)), `${file} is orphaned on disk`);
    }
  });

  test("the hero shows the cutout, sized and loaded for above the fold", () => {
    const pic = home.match(/<picture>[\s\S]*?<\/picture>/)[0].replace(/\s+/g, " ");
    for (const w of [400, 460, 600]) {
      assert.match(
        pic,
        new RegExp(`/assets/img/roboracer-core-kit-cutout-${w}\\.webp ${w}w`),
        `the hero is missing its ${w}w cutout candidate`,
      );
    }
    assert.match(
      pic,
      /src="\/assets\/img\/roboracer-core-kit-cutout\.png"/,
      "the hero fallback is not the cutout",
    );
    assert.match(pic, /width="600"/, "the hero width no longer matches the asset");
    assert.match(pic, /height="800"/, "the hero height no longer matches the asset");
    assert.match(pic, /fetchpriority="high"/, "the above-the-fold hero lost its fetch priority");
    assert.ok(!/loading="lazy"/.test(pic), "the hero must not lazy-load");
    assert.match(pic, /alt="[^"]{30,}"/, "the hero alt text is missing or too thin");
    for (const f of [
      "roboracer-core-kit-cutout-400.webp",
      "roboracer-core-kit-cutout-460.webp",
      "roboracer-core-kit-cutout-600.webp",
      "roboracer-core-kit-cutout.png",
    ]) {
      assert.ok(fs.existsSync(path.join(REPO, "assets/img", f)), `missing hero asset ${f}`);
    }
  });

  test("the declared hero ratio matches the asset, so nothing shifts", () => {
    const css = read("assets/css/main.css");
    const rule = css.match(/\.hero-visual \{[^}]*\}/)[0];
    assert.ok(!/box-shadow/.test(rule), "a drop shadow would frame the cutout's empty corners");
    assert.ok(!/border-radius/.test(rule), "a radius would round the cutout's empty corners");
    assert.match(rule, /max-width: 460px/, "the hero lost its width cap");
  });
});

describe("Our Clients is wired into the site", () => {
  test("every page lists Our Clients immediately before Contact", () => {
    for (const file of ALL_NAV_PAGES) {
      const nav = read(file).match(/<div class="nav-links"[^>]*>([\s\S]*?)<\/div>/)[1];
      const items = [...nav.matchAll(/<a[^>]*href="(\/[^"]*)"[^>]*>([^<]*)/g)].map((m) => m[2].trim());
      assert.deepStrictEqual(items.slice(-2), ["Our Clients", "Contact"], `${file} nav order is wrong`);
    }
  });

  test("the footer mirrors it in the same position", () => {
    for (const file of ALL_NAV_PAGES) {
      const nav = read(file).match(/<nav aria-labelledby="footer-explore">([\s\S]*?)<\/nav>/)[1];
      const items = [...nav.matchAll(/<a[^>]*href="[^"]*"[^>]*>([^<]*)/g)].map((m) => m[1].trim());
      assert.deepStrictEqual(items.slice(-2), ["Our clients", "Contact"], `${file} footer order is wrong`);
    }
  });

  test("the page marks itself current in its own nav", () => {
    assert.match(
      read("our-clients.html"),
      /<a href="\/our-clients\.html" aria-current="page">Our Clients<\/a>/,
    );
  });

  test("the sitemap lists it", () => {
    const sm = fs.readFileSync(path.join(REPO, "sitemap.xml"), "utf8");
    assert.ok(
      sm.includes("https://roboracer.ambimat.com/our-clients.html"),
      "the sitemap is missing the page",
    );
  });
});
