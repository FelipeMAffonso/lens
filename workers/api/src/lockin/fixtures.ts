// S7-W40 — ecosystem fixtures with lock-in multipliers.
//
// lockInMultiplier is gross-to-switching-cost. >1 means the user loses value
// beyond the raw spend when switching (App Library effect, media non-transfer,
// DRM entanglement). Empirically grounded per public sources in the citations.

import type { EcosystemFixture } from "./types.js";

export const ECOSYSTEM_FIXTURES: EcosystemFixture[] = [
  {
    slug: "apple",
    label: "Apple (iOS + macOS + Watch + Home)",
    matchers: {
      brands: ["Apple"],
      productTokens: [
        "iphone", "ipad", "macbook", "apple watch", "airpods", "homepod",
        "imac", "mac mini", "mac pro", "apple tv", "icloud", "apple one",
        "apple music", "apple arcade", "apple fitness", "apple news",
      ],
      categoryTokens: ["smartphone", "laptop", "tablet", "smartwatch"],
    },
    lockInMultiplier: 1.8,
    nonDollarLockIn: [
      "iMessage + FaceTime network (group chats break on switch)",
      "Apple Photos library + Shared Albums",
      "App Store purchases + in-app subscriptions not portable to Android",
      "Handoff / AirDrop / Continuity workflows",
      "Apple Pay cards + transit passes",
    ],
    citations: [
      { label: "DOJ v. Apple (2024) — walled-garden allegations", url: "https://www.justice.gov/opa/pr/justice-department-sues-apple-monopolizing-smartphone-markets" },
      { label: "iFixit on Apple repair lock-in", url: "https://www.ifixit.com/Right-to-Repair/Intro" },
    ],
  },
  {
    slug: "google",
    label: "Google / Android (Pixel, Nest, Chromecast)",
    matchers: {
      brands: ["Google", "Google Nest", "Nest"],
      productTokens: [
        "pixel", "nest thermostat", "nest hub", "nest mini", "nest wifi",
        "chromecast", "google home", "google one", "google fi", "google play",
        "stadia", "youtube premium", "youtube music",
      ],
      categoryTokens: ["smartphone", "smart home", "smart thermostat"],
    },
    lockInMultiplier: 1.4,
    nonDollarLockIn: [
      "Google Photos library + Google One backup",
      "Google Play paid apps non-portable",
      "YouTube Music library + Premium-bought videos",
      "Nest automation rules",
    ],
    citations: [
      { label: "US v. Google (Search case, 2024 ruling)", url: "https://www.justice.gov/d9/2024-08/416729.pdf" },
    ],
  },
  {
    slug: "amazon-prime",
    label: "Amazon Prime ecosystem",
    matchers: {
      brands: ["Amazon", "Ring", "Eero", "Blink", "Kindle"],
      productTokens: [
        "kindle", "echo", "alexa", "fire tv", "fire tablet", "ring doorbell",
        "eero router", "blink camera", "luna", "prime video", "prime music",
        "audible", "amazon photos", "whole foods",
      ],
      categoryTokens: ["e-reader", "smart speaker", "video doorbell"],
    },
    lockInMultiplier: 1.6,
    nonDollarLockIn: [
      "Kindle library — DRM-locked, not movable to Kobo or Nook",
      "Audible credits + listens",
      "Prime Video purchases / rentals",
      "Ring camera cloud recordings + subscription",
      "Amazon Photos backup",
    ],
    citations: [
      { label: "FTC v. Amazon (2023) — monopoly maintenance", url: "https://www.ftc.gov/legal-library/browse/cases-proceedings/1910129-amazoncom-inc" },
    ],
  },
  {
    slug: "microsoft",
    label: "Microsoft (Xbox + Surface + 365)",
    matchers: {
      brands: ["Microsoft", "Xbox"],
      productTokens: ["xbox", "surface", "microsoft 365", "game pass", "onedrive", "teams premium", "office 365"],
      categoryTokens: ["console", "productivity"],
    },
    lockInMultiplier: 1.3,
    nonDollarLockIn: [
      "Xbox digital game library",
      "OneDrive storage + Office 365 subscription",
      "Game Pass cloud saves",
    ],
    citations: [
      { label: "FTC v. Microsoft (Activision merger, 2023)", url: "https://www.ftc.gov/legal-library/browse/cases-proceedings/221-0001-microsoftactivision-blizzard-inc-matter" },
    ],
  },
  {
    slug: "tesla",
    label: "Tesla (Supercharger + FSD + garage credits)",
    matchers: {
      brands: ["Tesla"],
      productTokens: ["model s", "model 3", "model x", "model y", "cybertruck", "supercharger", "full self-driving", "fsd", "autopilot"],
      categoryTokens: ["electric vehicle", "ev"],
    },
    lockInMultiplier: 1.7,
    nonDollarLockIn: [
      "Full Self-Driving (FSD) non-transferable between cars (only between Tesla purchases)",
      "Supercharger network convenience + historical free-supercharging credits",
      "Tesla app garage history + service records",
    ],
    citations: [
      { label: "Reuters: Tesla FSD transfer policy", url: "https://www.reuters.com/business/autos-transportation/tesla-limits-free-fsd-transfer-q3-2023-buyers-2023-09-25/" },
    ],
  },
  {
    slug: "ios-app-store",
    label: "iOS App Store purchases",
    matchers: {
      brands: ["Apple"],
      productTokens: ["app store", "in-app purchase", "ios app", "iphone app", "ipad app"],
      categoryTokens: ["app", "in-app"],
    },
    lockInMultiplier: 1.0,
    nonDollarLockIn: [
      "Paid apps don't transfer to Android (same dev rarely ports license)",
      "In-app-purchase content (game items, premium unlocks) tied to Apple ID",
    ],
    citations: [
      { label: "Epic v. Apple — App Store payment monopoly", url: "https://cand.uscourts.gov/judges/rogers-yvonne-gonzalez-ygr/" },
    ],
  },
  {
    slug: "google-play",
    label: "Google Play purchases",
    matchers: {
      brands: ["Google"],
      productTokens: ["play store", "google play", "android app", "play pass"],
      categoryTokens: ["app"],
    },
    lockInMultiplier: 1.0,
    nonDollarLockIn: [
      "Paid Android apps don't transfer to iOS",
      "Play Books + Play Movies DRM",
    ],
    citations: [
      { label: "Epic v. Google (2023 verdict)", url: "https://www.epicgames.com/site/en-US/news/jury-s-verdict-against-google-play-monopoly" },
    ],
  },
  {
    slug: "kindle-books",
    label: "Kindle book library",
    matchers: {
      brands: ["Amazon", "Kindle"],
      productTokens: ["kindle book", "ebook", "kindle paperwhite", "kindle oasis"],
      categoryTokens: ["ebook", "e-reader"],
    },
    lockInMultiplier: 1.0,
    nonDollarLockIn: [
      "Kindle library DRM — books cannot be moved to Kobo or Nook",
      "Kindle Unlimited catalog only available in the Amazon app",
    ],
    citations: [
      { label: "EFF on ebook DRM", url: "https://www.eff.org/issues/drm" },
    ],
  },
  {
    slug: "apple-books",
    label: "Apple Books library",
    matchers: {
      brands: ["Apple"],
      productTokens: ["apple books", "ibooks", "apple book"],
      categoryTokens: ["ebook"],
    },
    lockInMultiplier: 1.0,
    nonDollarLockIn: ["Books purchased in Apple Books are locked to the Apple Books app"],
    citations: [{ label: "EFF on ebook DRM", url: "https://www.eff.org/issues/drm" }],
  },
  {
    slug: "peloton",
    label: "Peloton (bike + tread + subscription)",
    matchers: {
      brands: ["Peloton"],
      productTokens: ["peloton bike", "peloton tread", "peloton guide", "all-access membership"],
      categoryTokens: ["fitness equipment"],
    },
    lockInMultiplier: 1.5,
    nonDollarLockIn: [
      "All-Access membership required to use Peloton hardware at full feature set",
      "Class history + leaderboard ranks non-portable",
    ],
    citations: [
      { label: "Peloton membership terms", url: "https://www.onepeloton.com/membership/terms" },
    ],
  },
  {
    slug: "nintendo",
    label: "Nintendo eShop digital library",
    matchers: {
      brands: ["Nintendo"],
      productTokens: ["nintendo switch", "nintendo eshop", "nintendo online", "switch online"],
      categoryTokens: ["console"],
    },
    lockInMultiplier: 1.0,
    nonDollarLockIn: ["Digital Switch games tied to Nintendo account; no family Steam-style sharing"],
    citations: [{ label: "Nintendo eShop terms", url: "https://www.nintendo.com/us/store/legal/" }],
  },
  {
    slug: "playstation",
    label: "PlayStation Network digital",
    matchers: {
      brands: ["Sony"],
      productTokens: ["playstation", "ps5", "ps4", "psn", "playstation plus", "playstation store"],
      categoryTokens: ["console"],
    },
    lockInMultiplier: 1.0,
    nonDollarLockIn: ["Digital PS games tied to the PSN account; platform exclusives"],
    citations: [{ label: "PSN terms", url: "https://www.playstation.com/en-us/legal/psn-terms-of-service/" }],
  },
  {
    slug: "xbox-live",
    label: "Xbox Live + Game Pass digital library",
    matchers: {
      brands: ["Microsoft", "Xbox"],
      productTokens: ["xbox live", "game pass", "xbox series", "xbox one", "xcloud", "cloud gaming"],
      categoryTokens: ["console", "cloud gaming"],
    },
    lockInMultiplier: 1.2,
    nonDollarLockIn: [
      "Digital Xbox games tied to Microsoft account",
      "Game Pass catalog rotation — canceling loses ongoing saves that require active sub",
    ],
    citations: [{ label: "Microsoft Game Pass terms", url: "https://www.xbox.com/en-US/xbox-game-pass/rules-for-use" }],
  },
  {
    slug: "hp-instant-ink",
    label: "HP Instant Ink + cartridge DRM",
    matchers: {
      brands: ["HP"],
      productTokens: ["hp printer", "officejet", "envy printer", "instant ink", "laserjet", "smart tank"],
      categoryTokens: ["printer"],
    },
    lockInMultiplier: 2.1,
    nonDollarLockIn: [
      "Cartridge DRM rejects third-party ink via firmware updates",
      "Canceling Instant Ink can disable already-paid-for cartridges",
      "Firmware-locked parts (chip-locked fusers)",
    ],
    citations: [
      { label: "FTC v. HP / firmware lock-in suits", url: "https://www.ftc.gov/news-events/news/press-releases/2024/10/federal-trade-commission-announces-final-click-cancel-rule-making-it-easier-consumers-end-recurring" },
      { label: "iFixit: HP printer DRM", url: "https://www.ifixit.com/News/43183/hp-dynamic-security-drm-printer" },
    ],
  },
  {
    slug: "keurig",
    label: "Keurig K-Cup entanglement",
    matchers: {
      brands: ["Keurig"],
      productTokens: ["k-cup", "kcup", "keurig k-elite", "keurig k-classic"],
      categoryTokens: ["coffee maker"],
    },
    lockInMultiplier: 1.2,
    nonDollarLockIn: ["Stocked K-Cup inventory only works on Keurig brewers"],
    citations: [{ label: "Keurig single-serve patents + brewer locks", url: "https://www.keurig.com/" }],
  },
  {
    slug: "nespresso",
    label: "Nespresso pod ecosystem",
    matchers: {
      brands: ["Nespresso"],
      productTokens: ["nespresso vertuo", "nespresso original", "nespresso pod", "vertuoline"],
      categoryTokens: ["coffee maker"],
    },
    lockInMultiplier: 1.3,
    nonDollarLockIn: [
      "Original-line vs Vertuo pods incompatible even between Nespresso lines",
      "Third-party pods vary in quality; subscription discounts on first-party only",
    ],
    citations: [{ label: "Nespresso Vertuo technology", url: "https://www.nespresso.com/us/en/vertuo-coffee-machines" }],
  },
  {
    slug: "adobe-creative-cloud",
    label: "Adobe Creative Cloud",
    matchers: {
      brands: ["Adobe"],
      productTokens: ["photoshop", "illustrator", "premiere", "lightroom", "after effects", "creative cloud"],
      categoryTokens: ["software", "saas"],
    },
    lockInMultiplier: 1.4,
    nonDollarLockIn: [
      "PSD/AI/AEP project files unusable without active subscription (post-2013)",
      "Years of Lightroom catalog edits tied to Adobe Cloud",
      "Annual cancellation fee clause",
    ],
    citations: [
      { label: "FTC v. Adobe (2024) — hidden early-termination fees", url: "https://www.ftc.gov/news-events/news/press-releases/2024/06/federal-trade-commission-takes-action-against-adobe-executives-hiding-fees-preventing-consumers" },
    ],
  },
  {
    slug: "spotify",
    label: "Spotify (playlists + library)",
    matchers: {
      brands: ["Spotify"],
      productTokens: ["spotify", "spotify premium", "spotify family", "spotify student"],
      categoryTokens: ["music streaming"],
    },
    lockInMultiplier: 1.2,
    nonDollarLockIn: [
      "Playlists + followed artists don't transfer to Apple Music / YouTube Music natively",
      "Listening history informs recommendations — lost on switch",
    ],
    citations: [{ label: "Spotify terms", url: "https://www.spotify.com/us/legal/end-user-agreement/" }],
  },
  {
    slug: "ring",
    label: "Ring cameras + subscription",
    matchers: {
      brands: ["Ring"],
      productTokens: ["ring doorbell", "ring camera", "ring alarm", "ring protect"],
      categoryTokens: ["video doorbell", "security camera"],
    },
    lockInMultiplier: 1.8,
    nonDollarLockIn: [
      "Ring Protect subscription required for cloud recordings",
      "Video history lost on subscription cancellation",
      "Ring cameras don't integrate with non-Ring ecosystems",
    ],
    citations: [
      { label: "FTC v. Ring (2023) — employee access + security lapses", url: "https://www.ftc.gov/news-events/news/press-releases/2023/05/ftc-says-ring-employees-illegally-surveilled-customers-failed-stop-hackers-taking-control-users" },
    ],
  },
  {
    slug: "tesla-fsd",
    label: "Tesla Full Self-Driving license",
    matchers: {
      brands: ["Tesla"],
      productTokens: ["full self-driving", "fsd package", "autopilot premium"],
      categoryTokens: ["electric vehicle"],
    },
    lockInMultiplier: 1.0,
    nonDollarLockIn: [
      "FSD license is non-transferable between buyers",
      "FSD policy has changed multiple times since 2017; features promised haven't shipped",
    ],
    citations: [
      { label: "Reuters: Tesla FSD transfer policy", url: "https://www.reuters.com/business/autos-transportation/tesla-limits-free-fsd-transfer-q3-2023-buyers-2023-09-25/" },
    ],
  },
];
