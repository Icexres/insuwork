// Demonstration fixtures mirroring the Figma designs.
// ponytail: static data; each export gets replaced by a Supabase / on-chain read in the backend pass.
// Everything partner-related here is MOCK (AGENTS.md rule 10).

/** Replace `{key}` placeholders in a message string. */
export const fmt = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

export const today = "10 OCT 2026";

export const users = {
  freelancer: { name: "Prabin Shrestha", sub: "prabin.s@gmail.com" },
  family: { name: "Sushila Shrestha", sub: "Read-only family access" },
  voucher: { name: "Rajan Gurung", sub: "Toronto · 9vRk…2Lm4", wallet: "9vRk…2Lm4" },
  client: { name: "Northwind Labs", sub: "Squads · 4fTx…8Qp1", wallet: "4fTx…8Qp1" },
  panel: { name: "Anil Maharjan", sub: "InsuWork nominee · Hn3c…7Wd2", wallet: "Hn3c…7Wd2" },
  admin: { name: "InsuWork Ops", sub: "Upgrade authority · AdmN…1xZ7", wallet: "AdmN…1xZ7" },
} as const;

export const freelancer = {
  ref: "fr_7Kq2c9xA",
  first: "Prabin",
  initials: "PS",
  displayName: "Prabin S.",
  bio: "Prabin Shrestha · Full-stack · React, TypeScript · Pulchowk Campus ’26",
  college: "Pulchowk Campus (IOE, TU)",
  gradYear: "2026",
  stack: "React, TypeScript, Next.js, Supabase",
  intro: "Final-year BCT student focused on product frontend and full-stack work for remote product teams.",
  bank: "Nabil Bank ••XXXX",
  family: "sushila.shrestha@gmail.com",
};

export const backer = {
  name: "Rajan Gurung",
  first: "Rajan",
  sub: "Senior engineer · Toronto, CA · Pulchowk ’14",
  short: "Rajan Gurung · Toronto",
  home: "Toronto · Pulchowk ’14",
  band: "$1,000–2,499",
};

/** Northwind × Prabin contract NW-01: 3 × $1,000 salary, MOCK FX 133.5. */
export const contract = {
  id: "NW-01",
  client: "Northwind Labs",
  clientEmail: "nw@northwindlabs.com",
  summary: "Frontend retainer · Sep–Nov 2026 · Paid to Nabil Bank ••XXXX",
  receivedNpr: "NPR 1,33,500",
  estimateNpr: "NPR 4,00,500",
  fxRate: "133.5",
  milestones: [
    { work: "M1 · Landing page rebuild", due: ["Sep 30", "Credited Oct 2"], npr: "1,33,500", usd: "$1,000", status: "Paid · MOCK" },
    { work: "M2 · Dashboard analytics module", due: ["Oct 31", "Delivered Oct 9"], npr: "≈ 1,33,500", usd: "$1,000", status: "Under review" },
    { work: "M3 · Mobile responsive pass", due: ["Nov 30", "Not started"], npr: "≈ 1,33,500", usd: "$1,000", status: "Upcoming" },
  ],
  lifecycle: [
    { label: "01 / BACKER", title: "Rajan Gurung", note: "Guarantee in place" },
    { label: "02 / CONTRACT", title: "Northwind Labs", note: "3 funded payments" },
    { label: "03 / DELIVERY", title: "M1 approved", note: "Released Sep 30" },
    { label: "04 / BANK CREDIT", title: "NPR 1,33,500", note: "MOCK · Oct 2" },
  ],
};

export const publicProfile = {
  deliveries: "3",
  clients: "3",
  since: "Aug 2026",
  records: [
    [["Sep 30, 2026", "Landing page rebuild"], "Northwind Labs", "$1,000–2,499", ["Oct 2 · MOCK", "NPR 1,33,500"], "5hQk…Lm2a ↗"],
    [["Aug 30, 2026", "Docs site migration"], "Lumen DAO", "$500–999", ["Confirmed · MOCK", "Historical demo"], "3xPa…9QwE ↗"],
    [["Aug 12, 2026", "Bounty · wallet adapter fix"], "Superteam Nepal", "$100–499", ["Confirmed · MOCK", "Historical demo"], "Gh7d…uY2c ↗"],
  ],
  lifecycle: [
    { label: "01 / BACKING", title: "$1,000 cap", note: "Rajan Gurung · Toronto" },
    { label: "02 / FUNDED MILESTONE", title: "$1,000 salary", note: "Northwind Labs · M1" },
    { label: "03 / DELIVERY EVIDENCE", title: "PR #42 merged", note: "Released Sep 30" },
    { label: "04 / BANK CREDIT", title: "NPR 1,33,500", note: "MOCK · confirmed Oct 2" },
  ],
};

export const triage = {
  turn: 2,
  total: 10,
  section: 2,
  messages: [
    { from: "ai", section: "BACKGROUND & GOALS", text: "Hi Prabin. This interview helps a backer decide whether to book a 30-minute call with you. To start: what are you studying, and what kind of work do you want to do?" },
    { from: "me", text: "Final-year BCT at Pulchowk. I want frontend and full-stack work for product teams, mostly React and TypeScript." },
    { from: "ai", section: "PROJECT WALK-THROUGH", text: "Thanks. Walk me through one recent project. What did you personally build, and what was hard about it?" },
  ],
  draft: "I built the booking flow for a clinic app. I owned the React front end and the Supabase schema. The hard part was double-bookings; I added a DB constraint and optimistic UI rollback.",
};

export const freelancerHome = {
  currentMilestone: "M2",
  receivedNote: "M1 · credited Oct 2",
  estimateNote: "3 × NPR 1,33,500 at mock FX 133.5",
  current: "M2 / 03",
  currentNote: "Awaiting Northwind’s approval",
  reviewNotice: {
    title: "M2 is under review",
    body: "You shared the dashboard module on Oct 9. Northwind is checking it against the agreed spec. Approval releases the contract payment for bank processing.",
  },
  journey: [
    { label: "APPLIED", value: "✓ Aug 2" },
    { label: "INTERVIEW", value: "✓ Aug 4" },
    { label: "BACKER CALL", value: "✓ Aug 11" },
    { label: "VERIFIED · MOCK", value: "✓ Aug 12" },
  ],
  familyBadge: "1 OF 3",
};

export const family = {
  receivedNote: "1 payment credited to Nabil Bank",
  totalNote: "1 of 3 payments received",
  monthly: "NPR 1,33,500",
  paid: 1,
  progressText: "Month 1 arrived on Oct 2. Month 2 is under client review. Month 3 has not started.",
  glance: { sub: "Software development · Frontend retainer", period: "Sep–Nov 2026", bank: "Nabil ••XXXX" },
};

export const statement = {
  id: "ST-fr_7Kq2c9xA-2610",
  issued: "Oct 10, 2026",
  holder: ["Prabin Shrestha", "Nabil Bank · A/C ••XXXX", "PAN 6XXXXXXXX"],
  payer: ["Northwind Labs", "Via Mock Partner Ltd", "Software development · IT export"],
  period: "Sep 1–Oct 10, 2026",
  credits: [["Month 1", "Landing page rebuild · Oct 2, 2026", "1,33,500"]],
  total: "NPR 1,33,500",
  remaining: ["Month 2 · Oct 31 · ≈ NPR 1,33,500", "Month 3 · Nov 30 · ≈ NPR 1,33,500"],
  remainingNote: "MOCK FX 133.5 · NPR 4,00,500 total contract estimate. Actual exchange amounts and fees may differ.",
  footnote: "Payment release: Sep 30, 2026 · Bank confirmation: Oct 2, 2026 (MOCK). Public delivery record: insuwork.app/p/fr_7Kq2c9xA.",
  received: "1 of 3",
};

export const vault = {
  address: "9vRk…2Lm4",
  deposited: "2,500.00",
  allocated: "1,800.00",
  locked: "1,600.00",
  unallocated: "700.00",
  premiums: "54.00",
  claimsPaid: "0.00",
  minDeposit: "500",
  walletBalance: "4,200.00 USDC",
  afterDeposit: "1,700.00 USDC",
  depositAmount: "2,500",
  presets: ["500", "1,000", "2,500"],
  networkFee: "~0.002 SOL",
  prereqs: { ownership: "Signed · no fee", vault: "Complete · DEVNET", kyc: "MOCK · complete" },
  rules: { leverage: "1 : 1", premium: "3% · client-paid", claimWindow: "14 days", ruling: "7 days" },
  /** Bar fill as % of deposit. */
  bars: [
    { key: "deposited", value: "2,500.00", pct: 100 },
    { key: "allocated", value: "1,800.00", pct: 72 },
    { key: "locked", value: "1,600.00", pct: 64 },
    { key: "unallocated", value: "700.00", pct: 28 },
  ],
  metricNotes: { deposited: "Vault 9vRk…2Lm4 · DEVNET", allocated: "72% of deposited capital", locked: "64% of deposited capital" },
  backings: [
    { name: "Prabin Shrestha", client: "Northwind Labs · M2 awaiting approval", cap: "1,000 / 1,000", lockedPct: "100% locked", premiums: "30.00", status: "Under review", claims: "0 claims paid" },
    { name: "Srijana Karki", client: "Lumen DAO · CLM-0009 open", cap: "800 / 600", lockedPct: "75% locked", premiums: "24.00", status: "Open", claims: "0 claims paid" },
  ],
  activity: [
    "Oct 2 · CLM-0009 filed · $600 locked",
    "Sep 30 · Northwind M1 released · +$30 premium",
    "Sep 14 · Lumen M1 released · +$24 premium",
    "Aug 20 · Srijana backed · $800 cap",
  ],
};

export const applicants = {
  capacity: { remaining: "$700", allocated: "$1,800", allocatedNote: "Across 2 active backings", deposit: "$2,500", depositNote: "72% allocated · DEVNET", premium: "3%" },
  list: [
    { id: "rojina-lama", name: "Rojina Lama", sub: "React · TypeScript · Pulchowk", background: "Product frontend · React / TypeScript", comms: "Clear", status: "Complete", ready: true },
    { id: "sagar-adhikari", name: "Sagar Adhikari", sub: "Go · Postgres · KU", background: "Backend · Go / PostgreSQL", comms: "Adequate", status: "Complete", ready: true },
    { id: "pooja-bhattarai", name: "Pooja Bhattarai", sub: "Flutter · TU", background: "Mobile · Flutter", comms: "Clear", status: "Complete", ready: true },
    { id: "dipesh-rai", name: "Dipesh Rai", sub: "Rust · Pulchowk", background: "Smart contracts · Rust", comms: "Not assessed", status: "In progress", ready: false },
  ],
};

export const report = {
  name: "Rojina Lama",
  first: "Rojina",
  initials: "RL",
  stack: "React/TypeScript/Next.js/Tailwind/Playwright · Pulchowk 26",
  highlight: "Clinic booking frontend ~400 weekly users · 47 merged public UI PRs",
  summary: [
    ["English", "Clear structured English"],
    ["Testing", "Proactive UI testing"],
    ["Estimation", "Realistic estimates"],
    ["Availability", "December exam availability"],
    ["Backend ownership", "Limited"],
  ],
  decision: { deposit: "$2,500", allocated: "$1,800", remaining: "$700", cap: "$700", after: "$0" },
  questions: [
    ["Project ownership", "Double-booking fix"],
    ["Scope changes", "Handling new requests"],
    ["Starter task", "UI library audit"],
    ["Alternative task", "Next.js landing rebuild"],
    ["Counterparties", "Related clients blocked"],
  ],
  questionsNote: "Discuss how Rojina tested her double-booking fix and how she would respond to a mid-milestone scope change. Report confidence: high.",
};

export const backedFreelancers = {
  stacks: ["React", "TypeScript", "Vue", "Python"],
  list: [
    { initials: "PS", name: "Prabin Shrestha", sub: "Pulchowk 26 · React / TypeScript", backer: "Rajan Gurung · Toronto", backerNote: "Backed since Aug 12 · $1,000 cap", delivered: "3 paid deliveries", deliveredNote: "M1 approved Sep 30 · M2 under review" },
    { initials: "AT", name: "Anisha Tamang", sub: "KU26 · Vue / TypeScript", backer: "Sabina Rai · Sydney", backerNote: "Backed since Sep 18 · $800 cap", delivered: "1 delivery", deliveredNote: "1 client-funded paid delivery" },
    { initials: "BM", name: "Bikash Magar", sub: "Pulchowk25 · Anchor", backer: "Nirmal Thapa · Seattle", backerNote: "Backed since Sep 22 · $1,500 cap", delivered: "0 deliveries", deliveredNote: "First commitment ready · no live exposure" },
    { initials: "SK", name: "Srijana Karki", sub: "TU25 · Python / dbt", backer: "Rajan Gurung · Toronto", backerNote: "Backed by Rajan · $800 cap", delivered: "2 deliveries", deliveredNote: "2 client-funded paid deliveries" },
  ],
  client: { treasury: "Squads / devnet", backer: "Rajan Gurung", cap: "$1,000", delivered: "3 paid", exposure: "M2 under review" },
};

export const newCommitment = {
  title: "Northwind Labs · Frontend retainer",
  cap: "$1,000",
  mode: "Salary release only to partner for NPR payout",
  milestones: [
    { title: "M1 · Landing page rebuild", due: "Sep 30", spec: "GitHub merge northwind/web · Lighthouse ≥ 90", amount: "$1,000" },
    { title: "M2 · Dashboard analytics module", due: "Oct 31", spec: "Client approval · charts + date-range CSV", amount: "$1,000" },
    { title: "M3 · Mobile responsive pass", due: "Nov 30", spec: "Client approval · all routes usable at 360px; no horizontal scroll", amount: "$1,000" },
  ],
  totals: { salary: "$3,000", premium: "$90", fee: "$30", vest: "$500", fund: "$3,620" },
  vestNote: "$500 · OQ-5",
  treasury: "Squads treasury · devnet",
};

export const commitment = {
  subtitle: "Northwind Labs × Prabin Shrestha · NW-01 frontend retainer · 3 × $1,000 salary",
  pending: "M2",
  lifecycle: [
    { label: "01 / BACKER", title: "Rajan Gurung", note: "$1,000 cap · M2 locked $1,000" },
    { label: "02 / CONTRACT", title: "Northwind Labs", note: "3 funded payments · $3,000 total" },
    { label: "03 / DELIVERY", title: "M1 approved", note: "Released Sep 30" },
    { label: "04 / BANK CREDIT", title: "NPR 1,33,500", note: "MOCK · Oct 2" },
  ],
  metrics: { contract: "$3,000", contractNote: "3 × $1,000 salary", released: "$1,000", releasedNote: "M1 · credited Oct 2", remaining: "$2,000", remainingNote: "M2 + M3 pending", fees: "$90 / $30 / $500" },
  received: "$1,000",
  reviewNotice: { title: "M2 is under review", body: "Prabin shared the analytics module on Oct 9. Review the delivered build against the agreed spec before approving release." },
  evidence: [
    [["M1 RELEASE", "✓ Landing page rebuild approved Sep 30"], ["CREDIT", "NPR 1,33,500 · MOCK bank credit Oct 2"]],
    [["M2 DELIVERABLE", "✓ Dashboard analytics module delivered Oct 9"], ["REVIEW", "Awaiting Northwind approval"]],
    [["M3 ACTIVATION", "Mobile responsive pass · upcoming after M2"], ["NEXT", "Due Nov 30"]],
  ],
  contractLine: "Contract NW-01 · frontend retainer",
};

export const claim = {
  id: "CLM-0009",
  client: "Lumen DAO",
  freelancerRef: "fr_Lm3pX02r",
  freelancerName: "Srijana K.",
  milestone: "M2 · Data pipeline refactor",
  stake: "$600",
  filed: "Oct 2, 2026",
  filedShort: "Oct 2",
  spec: "Spec hash · d44f…02c1",
  evidence: "message-log.pdf · delivery-artefacts.zip",
  remaining: "3d 4h",
  subtitle: "M2 · Data pipeline refactor · $600 at stake. Three-person panel, majority of 2 of 3, ruling within 7 days of assignment.",
  overview: "Committed spec: incremental dbt models, runtime under 15 minutes and tests for 4 core tables. Client evidence reports 48 minutes and coverage for only 1 of 4 tables. Spec hash d44f…02c1 matches the committed record.",
  timeline: [
    { label: "01 / SPEC", title: "Aug 20", note: "Runtime spec committed" },
    { label: "02 / ACTIVATED", title: "Sep 15", note: "$600 milestone locked" },
    { label: "03 / DUE", title: "Sep 30", note: "Delivery deadline" },
    { label: "04 / FILED", title: "Oct 2", note: "Claim filed · panel assigned" },
  ],
  files: { client: ["message-log.pdf", "sha256 · 9f2c…11ab"], freelancer: ["delivery-artefacts.zip", "sha256 · 41de…c07f"] },
  panel: [
    { initials: "AM", name: "Anil Maharjan", role: "InsuWork nominee", seat: "INSUWORK" },
    { initials: "MJ", name: "Meera Joshi", role: "Voucher nominee", seat: "VOUCHER" },
    { initials: "DO", name: "Daniel Ortiz", role: "Client nominee", seat: "CLIENT" },
  ],
  fees: { claimFee: "10 USDC", networkFee: "~0.002 SOL", policy: "Not settled" },
  voted: "0 of 3 voted",
  finalization: "Not ready",
  panelStatus: "3 / 3 assigned",
  title: "Lumen DAO data pipeline refactor M2",
  parties: "Lumen DAO × Srijana K.",
  response: "Review evidence before voting",
  deadline: "7-day ruling window",
  status: "Voting",
  vote: "Pending",
  source: "Read-only",
  idNote: "Filed Oct 2 · DEVNET pilot",
  stakeNote: "$600 milestone at stake",
  reviewers: "3 / 3",
};

export const operator = {
  program: { minBond: "500", leverage: "1 : 1", premium: "300 bps", fee: "100 bps", claimWindow: "14 days", ruling: "7 days" },
  partner: { summary: "Mock Partner Ltd · PrtN…8xQ1", name: "Mock Partner Ltd", wallet: "PrtN…8xQ1", note: "Conspicuous MOCK payout partner for pilot testing only." },
  oracle: { key: "OrcL…v2Bn", note: "Signed merge events can release agreed code milestones." },
  authority: { badge: "OQ-19", note: "Upgrade authority signing info assumption OQ-19." },
  treasury: "TrsY…4kWm",
  network: "Devnet",
  allowlist: [
    { name: "Anil Maharjan", meta: "InsuWork · Hn3c…7Wd2" },
    { name: "Meera Joshi", meta: "Voucher · 3QpL…aK9e" },
    { name: "Daniel Ortiz", meta: "Client · Bv8T…n1Zc" },
    { name: "Kiran Bista", meta: "Voucher · F2wm…Ux4q" },
    { name: "Hana Sato", meta: "Client · 9tRe…Lp3s" },
  ],
  workflow: [
    [["STEP 1", "InsuWork nominee"], ["ROLE", "Anil Maharjan"], ["STATUS", "Assigned"]],
    [["STEP 2", "Voucher nominee"], ["ROLE", "Meera Joshi"], ["STATUS", "Assigned"]],
    [["STEP 3", "Client nominee"], ["ROLE", "Daniel Ortiz"], ["STATUS", "Assigned"]],
    [["STEP 4", "Majority decision"], ["WINDOW", "7 days"], ["STATUS", "Panel review"]],
    [["STEP 5", "Finalize ruling"], ["REQUIREMENT", "Majority reached"], ["STATUS", "Not ready"]],
  ],
  keeper: {
    lastRun: "Oct 10 · 09:00",
    scanned: "14 / 14",
    unlocked: "0",
    history: [
      ["Oct 10 · 09:00", "scanned 14 / unlocked 0"],
      ["Oct 9 · 21:00", "scanned 14 / unlocked 1"],
      ["Oct 9 · 09:00", "RPC timeout · recovered 09:02"],
    ],
    events: [
      ["Milestone released · NW01M1", "Sep 30 · 09:18", "fr_7Kq2c9xA", "$1000", "Released"],
      ["Paid delivery written", "Sep 30 · 09:22", "fr_7Kq2c9xA", "$1,000–2,499 band", "Written"],
      ["MOCK NPR credit", "Oct 2 · 09:24", "fr_7Kq2c9xA", "NPR 133500", "Credited"],
      ["Claim filed · CLM0009", "Oct 2 · 10:05", "fr_Lm3pX02r", "$600", "Filed"],
      ["Backing locked", "Sep 15 · 10:06", "fr_Lm3pX02r", "$600", "Locked"],
    ],
    balance: "Test funds only",
    mode: "Expired claim scan",
    release: "Client / merge",
    unlock: "Auto",
  },
};
