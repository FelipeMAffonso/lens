// S1-W9 — 6 hand-curated comparison fixtures.
// Each fixture: option-A vs option-B across ~7 axes, per persona. No brand
// names, no products — pure categorical framing. Reviewed for honesty:
// every axis assessment names the actual trade-off (not a marketing talking
// point) and the persona-specific verdicts change appropriately.

import type { Axis, FixtureEntry, Verdict } from "./types.js";

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "vs", "versus", "with", "for",
]);

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t)),
  );
}

function opt(canonical: string, synonyms: string[] = []): FixtureEntry["optionA"] {
  const set = new Set<string>();
  for (const t of tokens(canonical)) set.add(t);
  for (const s of synonyms) for (const t of tokens(s)) set.add(t);
  return { canonical, tokens: set };
}

function ax(
  key: string,
  label: string,
  aAssessment: string,
  bAssessment: string,
  leans: Axis["leans"],
): Axis {
  return { key, label, aAssessment, bAssessment, leans };
}

function v(leaning: Verdict["leaning"], summary: string, caveats: string[]): Verdict {
  return { leaning, summary, caveats };
}

// ─── 1. mirrorless vs DSLR ────────────────────────────────────────────────
const CAMERA_AXES_BEGINNER: Axis[] = [
  ax("learning_curve", "Learning curve",
    "EVFs show the exposure preview live so mistakes are visible before the shutter fires.",
    "Optical viewfinder shows the scene, not the exposure — users learn through review, not preview.",
    "A"),
  ax("body_size", "Body size + weight",
    "Noticeably smaller and lighter; easy to carry all day without fatigue.",
    "Larger bodies with deeper grips; some photographers prefer the heft for stability.",
    "A"),
  ax("lens_ecosystem", "Lens ecosystem",
    "Newer mount; every major maker has caught up with zooms + primes at most focal lengths.",
    "Mature mount with 20+ years of used glass at every price point.",
    "B"),
  ax("autofocus_action", "Autofocus for action",
    "Modern mirrorless AF has matched or beaten DSLRs in the last two generations.",
    "Phase-detect AF with dedicated sensor module; long-proven for sports/birds.",
    "tied"),
  ax("battery", "Battery life per charge",
    "Constantly-on EVF drains the battery faster; spare batteries expected.",
    "Optical viewfinder uses near-zero power; single charge handles full-day shoots.",
    "B"),
  ax("video", "Video capability",
    "Continuous AF, 4K at mid-tier, and no mirror-slap noise make this the current video default.",
    "Video was added late to most DSLRs; AF + noise handling are usually inferior.",
    "A"),
  ax("price_today", "New-body price",
    "Entry-level bodies have climbed as the category has matured.",
    "Deep discounts on remaining inventory; used market is thick and cheap.",
    "B"),
];
const CAMERA_AXES_PRO: Axis[] = [
  ax("learning_curve", "Transition cost",
    "Pros switching bring lens investment with them; adapters work but add bulk.",
    "Decades of muscle memory; every control is where veterans expect it.",
    "B"),
  ax("autofocus_action", "Tracking + burst",
    "Modern mirrorless flagships (R3/A1/Z9-class) meet or exceed DSLR flagship AF.",
    "Fast, proven AF on the top tier — still the choice for many wildlife + sports shooters with existing lens collections.",
    "tied"),
  ax("video", "Video capability",
    "8K/4K60 + ProRes internal on flagship mirrorless is the professional norm now.",
    "DSLR video is capped at the levels of the last-gen hardware; used for stills + incidental clips.",
    "A"),
  ax("lens_ecosystem", "Glass availability",
    "New mount — native pro glass is complete but expensive; adapted lenses work well.",
    "Every specialty lens exists in the used market (tilt-shift, fisheye, macro, exotic super-tele).",
    "B"),
  ax("longevity", "Body longevity",
    "Fewer moving parts (no mirror box, no shutter mechanism on electronic shutters) = fewer failures.",
    "Mechanical shutter wears out; mirror mechanism adds one more failure mode.",
    "A"),
  ax("body_size", "Body size + weight",
    "Pro bodies have climbed back to ~DSLR weight for battery + grip + IBIS, narrowing the gap.",
    "Still the larger option, especially with battery grip attached.",
    "A"),
];

const CAMERA: FixtureEntry = {
  optionA: opt("mirrorless camera", ["mirrorless", "evf camera", "mirrorless body"]),
  optionB: opt("dslr", ["dslr camera", "slr", "reflex camera", "full-frame dslr"]),
  personas: new Set(["beginner", "enthusiast", "pro", "professional", "general"]),
  perPersonaAxes: {
    beginner: CAMERA_AXES_BEGINNER,
    general: CAMERA_AXES_BEGINNER,
    enthusiast: CAMERA_AXES_BEGINNER,
    pro: CAMERA_AXES_PRO,
    professional: CAMERA_AXES_PRO,
  },
  perPersonaVerdict: {
    beginner: v(
      "A",
      "Mirrorless is the better starting point for most beginners: shorter learning curve, smaller body, and the lens ecosystem has caught up.",
      [
        "A used DSLR + kit lens can be $200-$400 cheaper for the same image-quality tier.",
        "If you already own Canon EF or Nikon F glass, a DSLR extends that investment without adapters.",
      ],
    ),
    general: v(
      "A",
      "Mirrorless is the current default unless there is a specific reason (existing glass, battery life, or a deal on used DSLR gear) to choose otherwise.",
      [
        "The used DSLR market is still the cheapest path to full-frame image quality.",
        "Battery life difference still matters for multi-day trips without charging.",
      ],
    ),
    enthusiast: v(
      "A",
      "Mirrorless wins on video + compactness; DSLR still wins on battery + access to cheap used glass. For new-purchase enthusiasts, mirrorless is the better long-term commit.",
      [
        "Consider a used DSLR body + lens collection as a secondary 'beater' kit for travel.",
        "Third-party lens support is catching up but still thinner on some new mounts.",
      ],
    ),
    pro: v(
      "A",
      "Most working pros have made or are making the transition; flagship mirrorless bodies now set the pace for AF + video. Replace DSLR bodies as they reach shutter-count end-of-life.",
      [
        "Adapters work, but long lens balance + AF performance still differ between native and adapted glass.",
        "Wildlife + sports shooters with existing big-whites may stay on DSLR until a flagship replacement justifies the switch.",
      ],
    ),
    professional: v(
      "A",
      "Most working pros have made or are making the transition; flagship mirrorless bodies now set the pace for AF + video. Replace DSLR bodies as they reach shutter-count end-of-life.",
      [
        "Adapters work, but long lens balance + AF performance still differ between native and adapted glass.",
        "Wildlife + sports shooters with existing big-whites may stay on DSLR until a flagship replacement justifies the switch.",
      ],
    ),
  },
};

// ─── 2. iPad vs laptop ────────────────────────────────────────────────────
const IPAD_AXES_GENERAL: Axis[] = [
  ax("text_input", "Long-form typing",
    "On-screen keyboard is cramped; Magic Keyboard narrows the gap but adds $300+.",
    "Physical keyboard, trackpad, and hinge geometry designed for hours of typing.",
    "B"),
  ax("form_factor", "Travel + meetings",
    "Slim, quiet, and comfortable to hold; great on planes and standing meetings.",
    "Requires a desk or lap; bulkier in a bag.",
    "A"),
  ax("desktop_software", "Professional software",
    "Growing but still missing many desktop apps (IDEs, CAD, scientific tools, full DAWs).",
    "Every mainstream professional app runs natively.",
    "B"),
  ax("battery", "All-day battery",
    "Tablet chipsets give 9-12h of real-world use.",
    "Modern ARM-based laptops have closed the gap; older x86 machines are still 4-7h.",
    "A"),
  ax("longevity", "Software-update lifespan",
    "7-10 years of iPadOS updates on current hardware.",
    "OS updates last the life of the hardware for macOS / Linux; Windows varies.",
    "A"),
  ax("pen_input", "Handwriting + drawing",
    "Apple Pencil + direct surface is the best digital-ink experience available.",
    "Trackpad + peripheral; pen tablets exist but feel disconnected.",
    "A"),
  ax("price", "Price per capability",
    "Entry iPad is cheap; comparable-to-laptop iPads (iPad Pro + Keyboard) approach laptop prices.",
    "Entry laptops cover more use cases for the same money.",
    "B"),
];
const IPAD: FixtureEntry = {
  optionA: opt("ipad", ["tablet", "ipad pro", "ipad air"]),
  optionB: opt("laptop", ["notebook", "computer", "macbook", "chromebook", "pc"]),
  personas: new Set(["student", "creative", "casual", "general", "developer"]),
  perPersonaAxes: {
    general: IPAD_AXES_GENERAL,
    student: IPAD_AXES_GENERAL,
    creative: IPAD_AXES_GENERAL,
    casual: IPAD_AXES_GENERAL,
    developer: IPAD_AXES_GENERAL,
  },
  perPersonaVerdict: {
    general: v("B", "A laptop handles more of a typical user's day. iPad is the better second device, not replacement.", [
      "iPad + external keyboard is a viable primary for casual / reading / note-taking profiles.",
      "If you are a heavy handwriting or drawing user, iPad wins for that specific workflow.",
    ]),
    student: v("B", "Laptop is the safer primary for most degrees — essay + coding + research software all assume a desktop OS.", [
      "iPad + Pencil is the better choice for humanities + arts majors who take notes by hand.",
    ]),
    creative: v("tied", "Depends which creative: illustrator/concept artist → iPad. Editor/producer → laptop.", [
      "Light editing (Lightroom, Final Cut on iPad) is possible but not preferred for deadline work.",
    ]),
    casual: v("A", "Reading, streaming, and light email lean iPad for comfort + portability.", [
      "If taxes, resumes, or spreadsheets are in the mix, a laptop is still easier.",
    ]),
    developer: v("B", "Software development largely requires desktop OS — terminal, IDE, package managers.", [
      "iPad can cover review + remote-session scenarios but not standalone development.",
    ]),
  },
};

// ─── 3. EV vs hybrid ──────────────────────────────────────────────────────
const EV_AXES_COMMUTER: Axis[] = [
  ax("range", "Range per fill",
    "250-400 mi on modern EVs; more than enough for a daily commute, tight for long-distance without planning.",
    "450-600 mi on a tank; no planning required on the interstate.",
    "B"),
  ax("home_charging", "Home fueling",
    "Overnight charging means never visiting a gas station; requires home wiring (120V trickles; 240V ideal).",
    "Gas stations remain mandatory.",
    "A"),
  ax("refueling_network", "Long-distance refueling",
    "Supercharger network is dense in some regions, sparse in others. 20-40 min charges vs 5 min gas fills.",
    "Gas network is everywhere.",
    "B"),
  ax("maintenance", "Routine service cost",
    "No oil changes, no spark plugs, no belts; brake pads last longer due to regen.",
    "Standard ICE maintenance schedule (oil, belts, filters, spark plugs, emissions).",
    "A"),
  ax("upfront_cost", "Purchase price",
    "Still commands a premium over comparable hybrids, though narrowing with incentives.",
    "Widely available at lower upfront prices, especially on the used market.",
    "B"),
  ax("incentives", "Tax credits / rebates",
    "Federal + many state incentives (US) apply; stackable with utility rebates in some markets.",
    "Some hybrid incentives in some states; generally fewer than EV.",
    "A"),
  ax("noise_and_ride", "Noise + driving feel",
    "Silent at idle, strong torque off the line, single-speed drivetrain = smooth.",
    "ICE noise + multi-speed transmission + hybrid handoff add NVH (noise/vibration/harshness).",
    "A"),
];
const EV: FixtureEntry = {
  optionA: opt("electric vehicle", ["ev", "battery ev", "bev", "electric car"]),
  optionB: opt("hybrid", ["hybrid vehicle", "hev", "phev", "plug-in hybrid"]),
  personas: new Set(["commuter", "road-tripper", "eco-minded", "general"]),
  perPersonaAxes: {
    commuter: EV_AXES_COMMUTER,
    general: EV_AXES_COMMUTER,
    "road-tripper": EV_AXES_COMMUTER,
    "eco-minded": EV_AXES_COMMUTER,
  },
  perPersonaVerdict: {
    commuter: v("A", "Daily commute with home charging is the strongest EV case: low fuel cost, low maintenance, quiet drive.", [
      "If you cannot charge at home, a hybrid is the honest answer until public-charging density improves for your area.",
    ]),
    general: v("A", "For drivers who can charge at home and do occasional long trips, modern EV + one planned stop ≈ the experience of hybrid.", [
      "Cold-climate range loss is real (20-30%); budget for it.",
    ]),
    "road-tripper": v("B", "If most weeks include 400+ mile single-day drives, hybrid still wins on simplicity.", [
      "If those trips follow major interstates, EV is now viable with planning.",
    ]),
    "eco-minded": v("A", "EV's lifecycle emissions beat hybrid's in most US grids, and the gap widens as grids decarbonize.", [
      "Battery manufacturing footprint is real but amortizes over use.",
    ]),
  },
};

// ─── 4. eReader vs tablet ─────────────────────────────────────────────────
const EREADER_AXES_READER: Axis[] = [
  ax("eye_strain", "Eye comfort over long reads",
    "E-ink is reflective, matte, and non-emissive — closest thing to paper; no blue-light fatigue.",
    "Backlit LCD/OLED fatigues after long sessions for many readers.",
    "A"),
  ax("battery", "Battery life per charge",
    "Weeks of reading on a charge (e-ink draws power only on page turn).",
    "Hours of screen-on time; daily charging for heavy readers.",
    "A"),
  ax("weight", "Holding weight",
    "6-7oz typical; comfortable one-handed for hours.",
    "1-2 lb typical; heavier, especially in bed.",
    "A"),
  ax("glare", "Reading outdoors in sun",
    "Reflective display — direct sunlight is easiest on e-ink.",
    "Glossy screens wash out in bright sun; matte screen protectors help.",
    "A"),
  ax("library_access", "Library access",
    "Kindle + Kobo tie into OverDrive / Libby; native library-loan integration.",
    "Both libraries + web browsing + app store; wider source options.",
    "B"),
  ax("distraction", "Distraction",
    "Single-purpose device; no notifications, no browsing tabs.",
    "Multi-purpose — the same device that holds the book holds the social feeds.",
    "A"),
  ax("price", "Typical price",
    "Mid-tier: $130-200 for a Kindle/Kobo without ads.",
    "Wide range: $200-1200+ depending on tier.",
    "A"),
];
const EREADER: FixtureEntry = {
  optionA: opt("ereader", ["e reader", "e-reader", "kindle", "kobo", "ebook reader"]),
  optionB: opt("tablet", ["ipad", "android tablet", "fire tablet"]),
  personas: new Set(["reader", "traveler", "casual", "general"]),
  perPersonaAxes: {
    reader: EREADER_AXES_READER,
    traveler: EREADER_AXES_READER,
    casual: EREADER_AXES_READER,
    general: EREADER_AXES_READER,
  },
  perPersonaVerdict: {
    reader: v("A", "For readers, an eReader wins on nearly every axis that matters to reading. The tablet's extra features are not an upgrade — they are distraction.", [
      "If you read PDFs, comics, or heavily-illustrated books, a color tablet is still better for visual fidelity.",
    ]),
    traveler: v("A", "Battery life + weight + sun readability make eReader ideal for travel. Use your phone as the tablet replacement.", []),
    casual: v("tied", "If books are an occasional hobby, a tablet doubles as many other things. If reading is core, eReader wins.", []),
    general: v("A", "For pure reading, an eReader wins. For everything else, you already have a phone.", []),
  },
};

// ─── 5. Android vs iOS ────────────────────────────────────────────────────
const OS_AXES_GENERAL: Axis[] = [
  ax("device_diversity", "Device options",
    "Dozens of hardware brands, price points from $100 to flagship.",
    "One vendor; options vary mostly by size + year.",
    "A"),
  ax("app_quality", "App-store curation",
    "Wider, but variable quality; more free tier options; fewer app-review rejections.",
    "Narrower catalog; higher baseline polish + stricter privacy review.",
    "B"),
  ax("privacy_controls", "Per-app permission controls",
    "Fine-grained controls; ATT-analog still catching up; scoped storage strong on newer versions.",
    "App Tracking Transparency + Privacy Nutrition Labels are industry-leading in this area.",
    "B"),
  ax("sideloading", "Installing outside the store",
    "First-class support: APK files, third-party stores, F-Droid, enterprise distribution.",
    "Restricted by default; changing in EU; workarounds elsewhere are involved.",
    "A"),
  ax("desktop_integration", "Desktop sync",
    "Integrates with whatever OS you use; Google stack is cross-platform by default.",
    "Tightest integration is macOS; functional elsewhere.",
    "tied"),
  ax("longevity", "Software-update lifespan",
    "Flagship Android now ships 7 years of updates; mid-tier varies widely (3-5 years).",
    "5-6 years of iOS updates is typical.",
    "tied"),
  ax("resale", "Resale value",
    "Depreciation is steep outside the top flagships.",
    "Strong resale market; 3-year-old iPhones still command real money.",
    "B"),
];
const OS: FixtureEntry = {
  optionA: opt("android", ["android phone", "google phone", "pixel"]),
  optionB: opt("ios", ["iphone", "apple phone", "ios phone"]),
  personas: new Set(["switcher", "developer", "casual", "general", "privacy-focused"]),
  perPersonaAxes: {
    general: OS_AXES_GENERAL,
    switcher: OS_AXES_GENERAL,
    developer: OS_AXES_GENERAL,
    casual: OS_AXES_GENERAL,
    "privacy-focused": OS_AXES_GENERAL,
  },
  perPersonaVerdict: {
    general: v("tied", "Both are mature OSs. Which ecosystem you already live in matters more than the OS itself.", [
      "Switching costs are real — paid apps, cloud photos, messaging group norms.",
    ]),
    switcher: v("tied", "Neither is obviously better; pick based on the family/friend messaging norms + existing cloud storage.", []),
    developer: v("A", "Android is easier for hobbyist development + sideloading. iOS is easier for monetization + App Store distribution — pick your priority.", []),
    casual: v("B", "For users who value 'it just works' defaults + strong resale, iOS has less friction.", []),
    "privacy-focused": v("B", "iOS privacy controls are best-in-class out of the box. Android matches only on Pixel + GrapheneOS-style configurations.", []),
  },
};

// ─── 6. Mechanical vs membrane keyboard ───────────────────────────────────
const KEYBOARD_AXES: Axis[] = [
  ax("typing_feel", "Typing feel",
    "Discrete, tactile keypress; many switch types to match preference.",
    "Soft, mushier press; fewer options to tune feel.",
    "A"),
  ax("noise", "Quietness",
    "Louder on average; silent-switch variants exist but cost more.",
    "Near-silent; roommate-friendly.",
    "B"),
  ax("longevity", "Key-switch lifespan",
    "Rated 50M-100M actuations per switch; servicable + individually replaceable.",
    "Rated 5M-10M actuations; membrane wear = full replacement.",
    "A"),
  ax("portability", "Travel",
    "Heavier; TKL / 60% layouts mitigate but still chunkier.",
    "Thin, light, stacks in a laptop sleeve.",
    "B"),
  ax("price", "Entry price",
    "$60-100 minimum for decent build; $150+ for enthusiast.",
    "$10-40 covers most users' needs.",
    "B"),
  ax("customization", "Key + switch + sound tuning",
    "Hot-swap boards + custom keycaps + lube/tape mods. Deep tinkering surface.",
    "Effectively none — keyboard is keyboard.",
    "A"),
  ax("repairability", "Fix + extend",
    "Swap broken switches; replace keycaps; dust-clean individually.",
    "Spill = new keyboard.",
    "A"),
];
const KEYBOARD: FixtureEntry = {
  optionA: opt("mechanical keyboard", ["mechanical", "mech keeb", "cherry mx keyboard"]),
  optionB: opt("membrane keyboard", ["membrane", "rubber dome", "chiclet keyboard", "scissor keyboard"]),
  personas: new Set(["typist", "office", "gamer", "casual", "general"]),
  perPersonaAxes: {
    general: KEYBOARD_AXES,
    typist: KEYBOARD_AXES,
    office: KEYBOARD_AXES,
    gamer: KEYBOARD_AXES,
    casual: KEYBOARD_AXES,
  },
  perPersonaVerdict: {
    general: v("A", "Mechanical wins on feel, longevity, and repairability. Membrane wins on price + noise.", [
      "Shared offices benefit from silent / linear switches specifically.",
    ]),
    typist: v("A", "For people who type for a living, the feel + longevity premium pays back in months.", []),
    office: v("tied", "Noise is the dominant factor in most offices. Silent-switch mechanical is worth the premium; loud clicky mechanical is not.", []),
    gamer: v("A", "Lower-travel linear mechanical switches have a measurable latency edge; N-key rollover is standard.", [
      "Match switch type to game: linear for FPS, tactile for RTS/strategy.",
    ]),
    casual: v("B", "Casual users rarely miss mechanical; the money is better spent elsewhere.", []),
  },
};

export const FIXTURES: FixtureEntry[] = [CAMERA, IPAD, EV, EREADER, OS, KEYBOARD];

export { tokens as tokenizeComparison };
