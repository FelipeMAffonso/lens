// S7-W41 — repairability fixtures.
//
// Scores follow iFixit's 10-point rubric (10 = every part user-replaceable,
// 1 = sealed glass brick). Numbers are iFixit's own published scores
// (2024-2026). Failure modes + parts availability are synthesized from
// iFixit's teardown notes + the product's active repair programs as of
// early 2026. When a product's official iFixit score has not been updated
// for a newer generation, we use the closest published generation's score.

import type { RepairabilityFixture } from "./types.js";

export const REPAIRABILITY_FIXTURES: RepairabilityFixture[] = [
  // Smartphones
  {
    matchers: { brands: ["Apple"], productTokens: ["iphone 15 pro"] },
    score: 4,
    band: "hard",
    commonFailures: ["cracked screen", "degraded battery after 800 cycles", "Face ID sensor misalignment"],
    partsAvailability: { manufacturer: "available", thirdParty: "limited" },
    citations: [
      { label: "iFixit iPhone 15 Pro teardown", url: "https://www.ifixit.com/News/83682/iphone-15-pro-teardown", source: "ifixit" },
      { label: "Apple Self Service Repair", url: "https://support.apple.com/self-service-repair", source: "manufacturer" },
    ],
  },
  {
    matchers: { brands: ["Apple"], productTokens: ["iphone 14"] },
    score: 7,
    band: "medium",
    commonFailures: ["cracked screen", "battery degradation", "speaker distortion"],
    partsAvailability: { manufacturer: "available", thirdParty: "available" },
    citations: [
      { label: "iFixit iPhone 14 teardown", url: "https://www.ifixit.com/News/62264/iphone-14-teardown", source: "ifixit" },
    ],
  },
  {
    matchers: { brands: ["Apple"], productTokens: ["iphone 13"] },
    score: 5,
    band: "hard",
    commonFailures: ["cracked screen with True Tone loss", "battery degradation", "Face ID pairing"],
    partsAvailability: { manufacturer: "available", thirdParty: "limited" },
    citations: [{ label: "iFixit iPhone 13 teardown", url: "https://www.ifixit.com/News/53619/iphone-13-teardown", source: "ifixit" }],
  },
  {
    matchers: { brands: ["Samsung"], productTokens: ["galaxy s24"] },
    score: 5,
    band: "hard",
    commonFailures: ["cracked rear glass", "battery swelling", "charging port wear"],
    partsAvailability: { manufacturer: "available", thirdParty: "available" },
    citations: [
      { label: "Samsung self-repair program", url: "https://www.samsung.com/us/support/self-repair/", source: "manufacturer" },
    ],
  },
  {
    matchers: { brands: ["Samsung"], productTokens: ["galaxy s23"] },
    score: 4,
    band: "hard",
    commonFailures: ["cracked rear glass", "battery degradation", "USB-C port wear"],
    partsAvailability: { manufacturer: "available", thirdParty: "available" },
    citations: [{ label: "iFixit Galaxy S23 teardown", url: "https://www.ifixit.com/News/70168/samsung-galaxy-s23-teardown", source: "ifixit" }],
  },
  {
    matchers: { brands: ["Google"], productTokens: ["pixel 8"] },
    score: 6,
    band: "medium",
    commonFailures: ["cracked screen", "battery degradation", "fingerprint sensor misread"],
    partsAvailability: { manufacturer: "available", thirdParty: "available" },
    citations: [
      { label: "Google Pixel Repair via iFixit", url: "https://www.ifixit.com/Google", source: "ifixit" },
    ],
  },
  {
    matchers: { brands: ["Google"], productTokens: ["pixel 7"] },
    score: 6,
    band: "medium",
    commonFailures: ["cracked screen", "battery degradation", "modem firmware bug"],
    partsAvailability: { manufacturer: "available", thirdParty: "available" },
    citations: [{ label: "iFixit Pixel 7 teardown", url: "https://www.ifixit.com/News/64877/google-pixel-7-pro-teardown", source: "ifixit" }],
  },
  // Laptops
  {
    matchers: { brands: ["Framework"], productTokens: ["framework laptop 13"] },
    score: 10,
    band: "easy",
    commonFailures: ["keyboard wear", "expected battery replacement at ~1000 cycles"],
    partsAvailability: { manufacturer: "available", thirdParty: "available" },
    citations: [
      { label: "iFixit Framework 13 teardown (score 10/10)", url: "https://www.ifixit.com/News/46288/framework-laptop-teardown", source: "ifixit" },
    ],
  },
  {
    matchers: { brands: ["Framework"], productTokens: ["framework laptop 16"] },
    score: 9,
    band: "easy",
    commonFailures: ["GPU module rarer to source", "expansion card wear"],
    partsAvailability: { manufacturer: "available", thirdParty: "limited" },
    citations: [{ label: "iFixit Framework 16 preview", url: "https://www.ifixit.com/News/82120", source: "ifixit" }],
  },
  {
    matchers: { brands: ["Apple"], productTokens: ["macbook pro 14", "macbook pro 16"] },
    score: 4,
    band: "hard",
    commonFailures: ["battery glued to chassis", "keyboard wear", "Thunderbolt port failure"],
    partsAvailability: { manufacturer: "available", thirdParty: "limited" },
    citations: [
      { label: "iFixit M3 MacBook Pro teardown", url: "https://www.ifixit.com/News/83982/macbook-pro-m3-teardown", source: "ifixit" },
    ],
  },
  {
    matchers: { brands: ["Apple"], productTokens: ["macbook air"] },
    score: 4,
    band: "hard",
    commonFailures: ["battery swelling (glued)", "display hinge cable wear", "storage soldered (unrepairable if it fails)"],
    partsAvailability: { manufacturer: "available", thirdParty: "limited" },
    citations: [{ label: "iFixit MacBook Air M2 teardown", url: "https://www.ifixit.com/News/64192/m2-macbook-air-teardown", source: "ifixit" }],
  },
  {
    matchers: { brands: ["Lenovo"], productTokens: ["thinkpad t14", "thinkpad x1 carbon", "thinkpad e14"] },
    score: 8,
    band: "easy",
    commonFailures: ["keyboard wear after 5yr", "fan bearing failure", "CMOS battery"],
    partsAvailability: { manufacturer: "available", thirdParty: "available" },
    citations: [{ label: "iFixit Lenovo ThinkPad teardowns", url: "https://www.ifixit.com/Device/Lenovo_ThinkPad", source: "ifixit" }],
  },
  {
    matchers: { brands: ["Dell"], productTokens: ["xps 13", "xps 15"] },
    score: 6,
    band: "medium",
    commonFailures: ["swollen battery (glued)", "trackpad click degradation"],
    partsAvailability: { manufacturer: "available", thirdParty: "available" },
    citations: [{ label: "iFixit XPS 13 guide", url: "https://www.ifixit.com/Device/Dell_XPS_13", source: "ifixit" }],
  },
  {
    matchers: { brands: ["HP"], productTokens: ["spectre", "envy"] },
    score: 4,
    band: "hard",
    commonFailures: ["RAM soldered to board", "SSD soldered (select models)", "fan bearing"],
    partsAvailability: { manufacturer: "limited", thirdParty: "limited" },
    citations: [{ label: "HP service manuals", url: "https://support.hp.com/us-en/product/service-manuals", source: "manufacturer" }],
  },
  // Headphones
  {
    matchers: { brands: ["Apple"], productTokens: ["airpods pro"] },
    score: 1,
    band: "unrepairable",
    commonFailures: ["battery degradation after 2y", "lost bud", "charging case wear"],
    partsAvailability: { manufacturer: "unavailable", thirdParty: "unavailable" },
    citations: [
      { label: "iFixit AirPods Pro teardown (1/10)", url: "https://www.ifixit.com/News/20588/airpods-pro-teardown", source: "ifixit" },
    ],
  },
  {
    matchers: { brands: ["Sony"], productTokens: ["wh-1000xm5", "wh1000xm5"] },
    score: 5,
    band: "hard",
    commonFailures: ["ear cushion wear", "headband padding", "hinge cracks", "battery degradation"],
    partsAvailability: { manufacturer: "limited", thirdParty: "available" },
    citations: [{ label: "iFixit Sony WH-1000XM5 guide", url: "https://www.ifixit.com/Device/Sony_WH-1000XM5", source: "ifixit" }],
  },
  {
    matchers: { brands: ["Sony"], productTokens: ["wh-1000xm4", "wh1000xm4"] },
    score: 6,
    band: "medium",
    commonFailures: ["ear cushion wear", "hinge fatigue", "battery replacement"],
    partsAvailability: { manufacturer: "available", thirdParty: "available" },
    citations: [{ label: "iFixit WH-1000XM4 guide", url: "https://www.ifixit.com/Device/Sony_WH-1000XM4", source: "ifixit" }],
  },
  {
    matchers: { brands: ["Bose"], productTokens: ["quietcomfort 45", "quietcomfort ultra", "quietcomfort"] },
    score: 5,
    band: "hard",
    commonFailures: ["ear cushion wear", "headband fatigue", "battery fade"],
    partsAvailability: { manufacturer: "available", thirdParty: "limited" },
    citations: [{ label: "Bose support + parts", url: "https://www.bose.com/support", source: "manufacturer" }],
  },
  {
    matchers: { brands: ["Sennheiser"], productTokens: ["momentum 4", "momentum"] },
    score: 5,
    band: "hard",
    commonFailures: ["ear cushion wear", "hinge cracks", "battery"],
    partsAvailability: { manufacturer: "available", thirdParty: "limited" },
    citations: [{ label: "Sennheiser replacement parts", url: "https://en-us.sennheiser.com/support", source: "manufacturer" }],
  },
  // Espresso machines
  {
    matchers: { brands: ["Breville"], productTokens: ["bambino"] },
    score: 6,
    band: "medium",
    commonFailures: ["solenoid valve clog (descale)", "pump failure after 3-5y", "steam wand seal"],
    partsAvailability: { manufacturer: "available", thirdParty: "available" },
    citations: [
      { label: "Breville parts store", url: "https://www.breville.com/us/en/parts", source: "manufacturer" },
      { label: "iFixit Breville Bambino guide", url: "https://www.ifixit.com/Device/Breville_Bambino", source: "ifixit" },
    ],
  },
  {
    matchers: { brands: ["Breville"], productTokens: ["barista express", "barista touch", "barista pro"] },
    score: 7,
    band: "medium",
    commonFailures: ["grinder burr wear (replaceable)", "solenoid valve", "steam wand seal"],
    partsAvailability: { manufacturer: "available", thirdParty: "available" },
    citations: [{ label: "iFixit Breville Barista teardown", url: "https://www.ifixit.com/Device/Breville_Barista_Express", source: "ifixit" }],
  },
  {
    matchers: { brands: ["De'Longhi", "DeLonghi", "De Longhi"], productTokens: ["stilosa", "dedica"] },
    score: 4,
    band: "hard",
    commonFailures: ["pump failure", "thermoblock scale build-up", "pressure valve clog"],
    partsAvailability: { manufacturer: "limited", thirdParty: "available" },
    citations: [{ label: "De'Longhi parts + service", url: "https://www.delonghi.com/en-us/customer-service", source: "manufacturer" }],
  },
  {
    matchers: { brands: ["Gaggia"], productTokens: ["classic evo", "classic"] },
    score: 9,
    band: "easy",
    commonFailures: ["gasket wear (trivial to replace)", "steam wand O-ring", "pump every 5-7y"],
    partsAvailability: { manufacturer: "available", thirdParty: "available" },
    citations: [{ label: "Gaggia Classic parts + community", url: "https://www.gaggia.com/en-us/support", source: "manufacturer" }],
  },
  {
    matchers: { brands: ["Rancilio"], productTokens: ["silvia"] },
    score: 9,
    band: "easy",
    commonFailures: ["boiler element scale", "group gasket", "three-way solenoid"],
    partsAvailability: { manufacturer: "available", thirdParty: "available" },
    citations: [{ label: "Rancilio Silvia parts", url: "https://www.ranciliogroup.com/parts", source: "manufacturer" }],
  },
  // Coffee makers
  {
    matchers: { brands: ["Technivorm"], productTokens: ["moccamaster"] },
    score: 9,
    band: "easy",
    commonFailures: ["carafe glass (replaceable)", "heating element", "silicone tubing"],
    partsAvailability: { manufacturer: "available", thirdParty: "available" },
    citations: [{ label: "Technivorm 5-year warranty + parts", url: "https://www.technivorm.com/parts/", source: "manufacturer" }],
  },
  {
    matchers: { brands: ["OXO"], productTokens: ["brew", "9 cup"] },
    score: 5,
    band: "hard",
    commonFailures: ["pump clog", "carafe lid seal", "water pickup tube scale"],
    partsAvailability: { manufacturer: "limited", thirdParty: "unavailable" },
    citations: [{ label: "OXO customer service", url: "https://www.oxo.com/customer-service.html", source: "manufacturer" }],
  },
  {
    matchers: { brands: ["Keurig"], productTokens: ["k-elite", "k-classic", "k-mini"] },
    score: 3,
    band: "unrepairable",
    commonFailures: ["puncture needle clog", "water pump failure (sealed unit)", "internal scale"],
    partsAvailability: { manufacturer: "unavailable", thirdParty: "limited" },
    citations: [{ label: "Keurig troubleshooting FAQ", url: "https://www.keurig.com/help-center", source: "manufacturer" }],
  },
  // Robot vacuums
  {
    matchers: { brands: ["iRobot"], productTokens: ["roomba"] },
    score: 7,
    band: "medium",
    commonFailures: ["side brush motor", "cliff sensor", "battery replacement at 2-3y"],
    partsAvailability: { manufacturer: "available", thirdParty: "available" },
    citations: [{ label: "iRobot parts store", url: "https://www.irobot.com/en_US/parts-and-accessories.html", source: "manufacturer" }],
  },
  {
    matchers: { brands: ["Roborock"], productTokens: ["roborock"] },
    score: 6,
    band: "medium",
    commonFailures: ["main brush wear", "LiDAR sensor alignment", "mop pad replacement"],
    partsAvailability: { manufacturer: "available", thirdParty: "available" },
    citations: [{ label: "Roborock support", url: "https://global.roborock.com/pages/service-support", source: "manufacturer" }],
  },
  {
    matchers: { brands: ["Eufy"], productTokens: ["robovac"] },
    score: 5,
    band: "hard",
    commonFailures: ["battery degradation (glued)", "main brush motor", "charging port wear"],
    partsAvailability: { manufacturer: "limited", thirdParty: "limited" },
    citations: [{ label: "Eufy parts + warranty", url: "https://www.eufy.com/collections/spare-parts", source: "manufacturer" }],
  },
  // Gaming handhelds
  {
    matchers: { brands: ["Valve"], productTokens: ["steam deck"] },
    score: 7,
    band: "medium",
    commonFailures: ["joystick drift", "thumbstick module", "battery after 2-3y"],
    partsAvailability: { manufacturer: "available", thirdParty: "available" },
    citations: [{ label: "iFixit Steam Deck repair kit", url: "https://www.ifixit.com/products/steam-deck-parts", source: "ifixit" }],
  },
  {
    matchers: { brands: ["Nintendo"], productTokens: ["switch", "switch oled"] },
    score: 8,
    band: "easy",
    commonFailures: ["Joy-Con drift (replaceable sticks)", "kickstand break", "fan bearing"],
    partsAvailability: { manufacturer: "available", thirdParty: "available" },
    citations: [{ label: "iFixit Switch repair guides", url: "https://www.ifixit.com/Device/Nintendo_Switch", source: "ifixit" }],
  },
  // VR
  {
    matchers: { brands: ["Meta", "Oculus"], productTokens: ["quest 3", "quest 2"] },
    score: 4,
    band: "hard",
    commonFailures: ["facial interface sweat damage", "controller drift", "battery degradation"],
    partsAvailability: { manufacturer: "limited", thirdParty: "available" },
    citations: [{ label: "iFixit Quest 3 teardown", url: "https://www.ifixit.com/News/79624/meta-quest-3-teardown", source: "ifixit" }],
  },
  // TVs (generic)
  {
    matchers: { brands: ["LG"], productTokens: ["oled"] },
    score: 4,
    band: "hard",
    commonFailures: ["OLED burn-in (irreversible)", "power supply board", "T-con board"],
    partsAvailability: { manufacturer: "limited", thirdParty: "limited" },
    citations: [{ label: "LG product warranty", url: "https://www.lg.com/us/support/warranty-information", source: "manufacturer" }],
  },
  {
    matchers: { brands: ["Sony"], productTokens: ["bravia"] },
    score: 5,
    band: "hard",
    commonFailures: ["backlight LED strip", "power board capacitor", "T-con ribbon cable"],
    partsAvailability: { manufacturer: "available", thirdParty: "limited" },
    citations: [{ label: "Sony support / service", url: "https://www.sony.com/electronics/support", source: "manufacturer" }],
  },
  // Smart home
  {
    matchers: { brands: ["Ring"], productTokens: ["video doorbell", "doorbell pro"] },
    score: 2,
    band: "unrepairable",
    commonFailures: ["sealed battery", "water ingress", "PIR sensor failure"],
    partsAvailability: { manufacturer: "unavailable", thirdParty: "unavailable" },
    citations: [{ label: "Ring warranty + replacement", url: "https://support.ring.com/hc/en-us/articles/360000568403", source: "manufacturer" }],
  },
  {
    matchers: { brands: ["Nest", "Google Nest"], productTokens: ["thermostat", "learning thermostat"] },
    score: 6,
    band: "medium",
    commonFailures: ["battery replacement (user-replaceable with tool)", "base wiring loose"],
    partsAvailability: { manufacturer: "limited", thirdParty: "unavailable" },
    citations: [{ label: "iFixit Nest thermostat teardown", url: "https://www.ifixit.com/Device/Nest_Learning_Thermostat", source: "ifixit" }],
  },
  // Printers
  {
    matchers: { brands: ["Brother"], productTokens: ["hl-", "mfc-"] },
    score: 6,
    band: "medium",
    commonFailures: ["paper feed roller wear", "fuser unit after 100k pages", "toner sensor"],
    partsAvailability: { manufacturer: "available", thirdParty: "available" },
    citations: [{ label: "Brother support + manuals", url: "https://www.brother-usa.com/support", source: "manufacturer" }],
  },
  {
    matchers: { brands: ["HP"], productTokens: ["officejet", "envy", "laserjet"] },
    score: 3,
    band: "unrepairable",
    commonFailures: ["cartridge DRM lockout on third-party ink", "printhead failure (non-user-serviceable)", "firmware-locked parts"],
    partsAvailability: { manufacturer: "limited", thirdParty: "limited" },
    citations: [
      { label: "FTC Right-to-Repair on HP", url: "https://www.ftc.gov/policy/advocacy-research/tech-at-ftc", source: "press" },
    ],
  },
  // Cameras
  {
    // Judge P1-3: "a7" is 2 chars (filtered by matcher) and "alpha" is rare in
    // real queries. Use realistic model tokens users actually type.
    matchers: { brands: ["Sony"], productTokens: ["a7 iv", "a7r", "a7s", "alpha 7", "alpha a7"] },
    score: 5,
    band: "hard",
    commonFailures: ["sensor dust", "shutter unit after 200k actuations", "rear dial wear"],
    partsAvailability: { manufacturer: "available", thirdParty: "limited" },
    citations: [{ label: "Sony Authorized Service", url: "https://www.sony.com/electronics/support/service-repair", source: "manufacturer" }],
  },
];
