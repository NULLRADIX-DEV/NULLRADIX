/**
 * NULLRADIX - single source of truth for content.
 * Edit this file to update the site. (The hero headline + subline live in
 * index.html since they're the one piece of brand copy.)
 */

export const profile = {
  name: "Tristan",
  role: "Systems & Software Developer",
  status: "Available for work",
  email: "tristan@nullradix.de",
};

/**
 * @typedef {Object} Project
 * @property {string} id
 * @property {string} name
 * @property {string} blurb
 * @property {string[]} tech
 * @property {number} year
 * @property {'live'|'wip'|'archived'} [status]
 * @property {{live?:string,repo?:string,docs?:string}} links
 * @property {{x:number,y:number}} coord  where the project leans on the plane (each axis ~ -100..100;
 *   x: Frontend (-) ↔ Backend (+), y: Infrastructure (-) ↔ Product (+))
 */

/** @type {Project[]} */
export const projects = [
  {
    id: "bookheart",
    name: "BookHeart",
    blurb:
      "A cozy Android app for tracking, rating and gamifying your reading - virtual bookshelf, reading timer, streaks, plant-growing rewards and shareable stats, fully offline on the device.",
    tech: ["C#", ".NET 10 MAUI", "Blazor Hybrid", "EF Core", "SQLite"],
    year: 2025,
    status: "live",
    links: {
      live: "https://play.google.com/store/apps/details?id=com.bookheart.app",
      repo: "https://github.com/Tr1sma/BookLoggerApp",
    },
    coord: { x: -28, y: 68 }, // polished consumer mobile product (Frontend + Product quadrant)
  },
  {
    id: "noose",
    name: "NOOSE",
    blurb:
      "Audited, role-based case database for a GTA roleplay law-enforcement faction - linked person/faction files, investigations, threat scoring and a relationship graph, updated in real time.",
    tech: ["C#", ".NET 10", "Blazor", "EF Core", "MySQL"],
    year: 2026,
    status: "live",
    links: {
      live: "https://demo.noose.info",
      repo: "https://github.com/Tr1sma/NOOSE-Website",
    },
    coord: { x: 48, y: 45 }, // backend-heavy product (Backend + Product quadrant)
  },
  {
    id: "kosguardian",
    name: "KoSGuardian",
    blurb:
      "A user-mode anti-cheat for Windows in pure C++ - layered runtime scanning of memory, modules, threads, IAT and inline hooks, with code-integrity checks, anti-debugging, a trusted-module catalog and a watchdog, all hidden behind API hashing and string obfuscation.",
    tech: ["C++", "Win32"],
    year: 2026,
    status: "wip",
    links: { repo: "https://github.com/Tr1sma/AntiCheat-KoSGuardian" },
    coord: { x: 62, y: -85 }, // low-level Windows security / systems internals (Backend + Infrastructure)
  },
  {
    id: "fluidsim",
    name: "Fluid Sim",
    blurb:
      "A real-time 2D fluid sandbox in pure C++ - runs smoothly with up to 100k particles, grid-accelerated collisions, fixed-step physics and interactive mouse forces, software-rendered on raw Win32/GDI with no engine.",
    tech: ["C++", "Win32", "GDI"],
    year: 2025,
    links: { repo: "https://github.com/Tr1sma/FluidSimCpp" },
    coord: { x: 45, y: -72 }, // low-level systems / physics experiment (Backend + Infrastructure)
  },
  {
    id: "nuget",
    name: "NuGet Libraries",
    blurb:
      "A collection of 12 open-source .NET packages on NuGet - a rich console UX toolkit plus focused Windows APIs (autostart, event log, registry, credentials, toasts), audio & gamepad I/O, AES-256-GCM crypto and cross-platform MAUI notifications. 10k+ downloads.",
    tech: ["C#", ".NET 10", "NuGet", "Win32"],
    year: 2025,
    status: "live",
    links: { live: "https://www.nuget.org/profiles/BenSowieja" },
    coord: { x: 72, y: -30 }, // reusable .NET libraries / dev tooling (Backend + Infrastructure)
  },
  {
    id: "nullradix",
    name: "NULLRADIX",
    blurb:
      "This site - a monochrome portfolio that behaves like a graphing instrument: kinetic type, an interactive canvas coordinate field, built from scratch with no UI framework.",
    tech: ["Vanilla JS", "Canvas", "GSAP", "Vite"],
    year: 2026,
    status: "live",
    links: {
      live: "https://nullradix.de",
      repo: "https://github.com/Tr1sma/NULLRADIX",
    },
    coord: { x: -80, y: 48 }, // frontend product (this site)
  },
];

/**
 * The plane's meaning - the four directions a project can lean toward. These
 * label the axis poles in the field; a project's `coord` places it between them.
 * Rename freely.
 * @type {{x:{neg:string,pos:string}, y:{neg:string,pos:string}}}
 */
export const axes = {
  x: { neg: "Frontend", pos: "Backend" },
  y: { neg: "Infrastructure", pos: "Product" },
};

/** @type {{lead:string, principles:{k:string,v:string}[]}} */
export const about = {
  lead: "I build software that feels obvious - fast, durable products where the hard parts are hidden and the right thing is the easy thing to do.",
  principles: [
    {
      k: "Correctness",
      v: "Systems that stay right under load, and fail loudly when they don’t.",
    },
    {
      k: "Clarity",
      v: "Code and interfaces a stranger can read at a glance - including future me.",
    },
    {
      k: "Durability",
      v: "Boring, well-bounded pieces that keep working long after launch.",
    },
  ],
};

/**
 * The words slamming through the code bore (as in the 30 s film), each with the stack behind it.
 * @type {{k:string, v:string}[]}
 */
export const disciplines = [
  { k: 'Frontend', v: 'Blazor · Vanilla JS · CSS · GSAP' },
  { k: 'Backend', v: '.NET 10 · ASP.NET Core · EF Core · SignalR' },
  { k: 'Mobile', v: '.NET MAUI · Blazor Hybrid · SQLite' },
  { k: 'Infrastructure', v: 'CI/CD · Containers · Zero-downtime deploys' },
];

/** @type {string[]} words riding the marquee band under the hero */
export const marquee = [
  "SOFTWARE",
  "SYSTEMS",
  "INTERFACES",
  "INFRASTRUCTURE",
  "TOOLS",
  "DURABLE",
  "FAST",
];

/** @type {{group:string, items:string[]}[]} */
export const skills = [
  { group: "Languages", items: ["C#", "C++", "JavaScript", "Lua", "SQL"] },
  {
    group: "Backend",
    items: [".NET 10", "ASP.NET Core", "EF Core", "SignalR"],
  },
  {
    group: "Frontend",
    items: ["Blazor", ".NET MAUI", "Vanilla JS", "CSS", "GSAP"],
  },
  {
    group: "Data & Tools",
    items: ["MySQL / MariaDB", "SQLite", "OAuth", "CI/CD", "Git", "TSql"],
  },
];

/** @type {{org:string, role:string, from:string, to:string, summary:string, tech?:string[]}[]} */
export const experience = [
  {
    org: "Self-taught",
    role: "Hobbyist",
    from: "2014",
    to: "2024",
    summary:
      "Began with visual logic before building custom Minecraft extensions and diving into low-level graphics and systems programming with C/C++.",
    tech: ["Scratch", "Java", "C", "C++", "Win32"],
  },
  {
    org: "4SELLERS",
    role: "IT Specialist - Application Development",
    from: "2024",
    to: "Present",
    summary:
      "Apprenticeship as Fachinformatiker für Anwendungsentwicklung - designing, building and maintaining ERP and web software end to end.",
    tech: ["C#", ".NET", "SQL"],
  },
  {
    org: "ModernV",
    role: "Developer",
    from: "2025",
    to: "2026",
    summary:
      "Built real-time tools for ModernV, a GTA roleplay server - including NOOSE, an audited, role-based case database for an in-game law-enforcement faction.",
    tech: ["Lua", "JavaScript", "HTML/CSS", "C#", ".NET", "Blazor", "MySQL"],
  },
  {
    org: "ModernV",
    role: "Lead Developer",
    from: "2026",
    to: "Present",
    summary:
      "Set technical direction, review contributions and own architecture across gameplay systems, internal tooling and the live database.",
    tech: ["Lua", "JavaScript", "HTML/CSS", "C#", ".NET", "Blazor", "MySQL"],
  },
  {
    org: "Fiverr",
    role: "Freelance Developer",
    from: "2026",
    to: "Present",
    summary:
      "Take commissions for custom FiveM scripts, .NET backends and REST APIs, Blazor / ASP.NET web apps and cross-platform mobile apps.",
    tech: ["FiveM", ".NET", "Blazor", "MAUI"],
  },
];

/** @type {{label:string, href:string, handle:string}[]} */
export const socials = [
  { label: "GitHub", href: "https://github.com/Tr1sma", handle: "@Tr1sma" },
  {
    label: "Fiverr",
    href: "https://de.fiverr.com/tristan_sowieja",
    handle: "@tristan_sowieja",
  },
  {
    label: "Discord",
    href: "https://discord.com/users/883419902843699250",
    handle: "@Tristan",
  },
];

export default { profile, axes, about, disciplines, projects, marquee, skills, experience, socials };
