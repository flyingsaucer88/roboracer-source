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

/** Concatenated text of every JSON-LD answer/description string on a page. */
function machineText(html) {
  return jsonLd(html)
    .map((doc) => JSON.stringify(doc))
    .join(" ");
}

describe("retired pricing never reappears", () => {
  for (const file of ALL_HTML) {
    test(`${file} contains no US$6,100 in any form`, () => {
      const raw = read(file);
      for (const stale of ["6,100", "6100", "USD 6,100", "US$6,100"]) {
        assert.ok(!raw.includes(stale), `${file} still contains the retired price token "${stale}"`);
      }
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
      assert.match(
        visibleText(read(file)),
        /US\$500 shipping charge does not include destination customs clearance/i,
        `${file} does not scope the US$500 charge`,
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
        /within India/i,
        `the INR 4,500 shipping line in ${file} is not scoped to India:\n${line.label}`,
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
    test(`${file} quotes US$5,900 for the complete kit`, () => {
      assert.match(visibleText(read(file)), /US\$5,900/);
    });

    test(`${file} quotes the US$500 flat shipping`, () => {
      assert.match(visibleText(read(file)), /US\$500/);
    });

    test(`${file} presents the US$725 discount as approximate`, () => {
      const text = visibleText(read(file));
      for (const m of text.matchAll(/US\$725/g)) {
        const w = text.slice(Math.max(0, m.index - 60), m.index + 20);
        assert.match(w, /approximately/i, `US$725 appears unqualified in ${file}:\n${w}`);
      }
    });

    test(`${file} presents US$5,175 as approximate and indicative`, () => {
      const text = visibleText(read(file));
      for (const m of text.matchAll(/US\$5,175/g)) {
        const w = text.slice(Math.max(0, m.index - 120), m.index + 200);
        assert.match(w, /approximately/i, `US$5,175 appears unqualified in ${file}:\n${w}`);
      }
      // 5900 - 725 = 5175. Guard the arithmetic itself.
      assert.equal(5900 - 725, 5175);
    });
  }
});

describe("the locally sourced configuration names all three excluded items", () => {
  for (const file of PRICING_PAGES) {
    test(`${file} names all three excluded items on the discount price row`, () => {
      // Structural: the row carrying the discount must itself enumerate what
      // is excluded. A word appearing elsewhere in the callout does not count.
      const line = priceLines(read(file)).find((l) => l.value.includes("US$725"));
      assert.ok(line, `${file} has no US$725 price line`);
      for (const item of ["Traxxas chassis", "compatible battery", "corresponding battery charger"]) {
        assert.ok(
          line.label.includes(item),
          `the US$725 row in ${file} does not name "${item}":\n${line.label}`,
        );
      }
    });

    test(`${file} names all three excluded items in every discount sentence`, () => {
      // For each mention of the discount, the sentence it sits in — plus the
      // two before it — must enumerate all three items by their full names.
      const text = visibleText(read(file));
      const sentences = text.split(/(?<=\.)\s+/);
      const mentions = sentences.map((s, i) => [s, i]).filter(([s]) => s.includes("US$725"));
      assert.ok(mentions.length > 0, `${file} never mentions the local-sourcing discount`);
      for (const [, i] of mentions) {
        const context = sentences.slice(Math.max(0, i - 2), i + 1).join(" ");
        for (const item of ["Traxxas chassis", "compatible battery", "corresponding battery charger"]) {
          assert.ok(
            context.includes(item),
            `a US$725 mention in ${file} does not name "${item}" in context:\n${context}`,
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

    test(`${file} JSON-LD has no stale pricing`, () => {
      const machine = machineText(read(file));
      for (const stale of ['"6100"', "6,100", "US$6,100", "USD 6,100"]) {
        assert.ok(!machine.includes(stale), `${file} JSON-LD still advertises ${stale}`);
      }
    });
  }

  for (const file of ["index.html", "autonomous-racing-robotics-kit.html"]) {
    test(`${file} Product offers are exactly the three firm configurations`, () => {
      const offers = offersIn(read(file));
      const priced = offers.map((o) => `${o.priceCurrency} ${o.price}`).sort();
      assert.deepEqual(priced, ["INR 580000", "INR 628000", "USD 5900"], `unexpected offers in ${file}`);
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
      assert.match(d, /does not include destination customs clearance/i);
      for (const re of [/duties included/i, /customs cleared/i, /duty[- ]paid/i, /DDP/]) {
        assert.ok(!re.test(d), `the USD offer implies Ambimat covers destination charges: ${re}`);
      }
    });
  }
});

describe("pricing pages stay in agreement", () => {
  const FIGURES = ["INR 580,000", "INR 628,000", "INR 4,500", "US$5,900", "US$725", "US$5,175", "US$500"];
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
  test("the specifications page still says exact variants are confirmed on the quotation", () => {
    // These names were inferred from the platform standard, not sourced from
    // the build team. The caveat is what keeps them honest.
    assert.match(visibleText(read("specifications.html")), /confirmed on your quotation/i);
  });

  test("the cornerstone page still qualifies the sensor and compute variants", () => {
    assert.match(visibleText(read("autonomous-racing-robotics-kit.html")), /confirmed on your quotation/i);
  });
});
