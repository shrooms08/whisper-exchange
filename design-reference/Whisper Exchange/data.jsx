// Fake data for Whisper Exchange wireframes
// Mix of realistic on-chain + spy-coded suppliers

const SIGNALS = [
  {
    id: "sig-01",
    title: "Whale swap detected · Raydium",
    body: "Wallet 7xKX…Qh9 dumped 48,200 SOL into USDC across 3 pools.",
    meta: "slot 287,491,203 · 14s ago",
    tag: "WHALE",
  },
  {
    id: "sig-02",
    title: "Pool imbalance · Orca JUP/SOL",
    body: "Reserve skew hit 71/29 after routed arb from Phoenix.",
    meta: "slot 287,491,198 · 42s ago",
    tag: "IMBAL",
  },
  {
    id: "sig-03",
    title: "New mint authority · WIF2",
    body: "Metadata flagged: 8,500 holders in first 120s. Insider pattern.",
    meta: "slot 287,491,150 · 2m ago",
    tag: "MINT",
  },
];

const LISTINGS = [
  { id: "L-0419", cat: "WHALE", price: "2.40", rep: 4, seller: "night-oracle", age: "00:12", seal: "AES-256" },
  { id: "L-0418", cat: "MEV",   price: "5.80", rep: 5, seller: "cipher-rook",  age: "00:34", seal: "AES-256" },
  { id: "L-0417", cat: "MINT",  price: "1.20", rep: 3, seller: "fox-07",       age: "01:02", seal: "AES-256" },
  { id: "L-0416", cat: "IMBAL", price: "0.80", rep: 2, seller: "REDACTED",     age: "01:47", seal: "AES-256" },
  { id: "L-0415", cat: "INSDR", price: "11.0", rep: 5, seller: "glass-owl",    age: "02:58", seal: "AES-256" },
  { id: "L-0414", cat: "BRIDGE",price: "3.30", rep: 4, seller: "meridian-9",   age: "04:11", seal: "AES-256" },
];

const TX_LOG = [
  "[17:42:03] SEALED  L-0419 → buyer.0x91ae  ·  2.40 ◎  ·  envelope #e83",
  "[17:42:01] LISTED  L-0420  (cat=WHALE,  rep=4)  by night-oracle",
  "[17:41:58] SIGNAL  whale_swap.7xKX…Qh9  Δ=48,200 SOL  slot 287,491,203",
  "[17:41:52] DECRYPT L-0412  payload delivered → buyer.0x44df",
  "[17:41:50] RATED   L-0412  TIP_TRUE  ·  outcome verified by oracle",
  "[17:41:49] REP++   night-oracle  +0.12  (rep 4.00 → 4.12)",
  "[17:41:47] SEALED  L-0418 → buyer.0xb2c1  ·  5.80 ◎  ·  envelope #e82",
  "[17:41:42] SIGNAL  pool_imbalance.orca.JUP/SOL  skew=71/29",
  "[17:41:39] REP++   cipher-rook  +0.08  (verified outcome)",
  "[17:41:34] LISTED  L-0419  (cat=MINT,   rep=3)  by fox-07",
  "[17:41:31] SIGNAL  mint_authority.WIF2  holders=8,500 in 120s",
  "[17:41:28] REP--   REDACTED  -0.22  (tip_false · oracle contested)",
  "[17:41:22] SEALED  L-0416 → buyer.0x3d2a  ·  0.80 ◎  ·  envelope #e81",
  "[17:41:15] EXPIRED L-0401  (ttl=6 slots · refunded 1.20 ◎)",
];

const BUYER_INVENTORY = [
  { id: "L-0412", cat: "WHALE", bought: "17:38", status: "DECRYPTED" },
  { id: "L-0408", cat: "MEV",   bought: "17:21", status: "DECRYPTED" },
  { id: "L-0401", cat: "MINT",  bought: "16:58", status: "EXPIRED"   },
];

Object.assign(window, { SIGNALS, LISTINGS, TX_LOG, BUYER_INVENTORY });
