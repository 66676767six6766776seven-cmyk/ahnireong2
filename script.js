import { firebaseConfig } from "./firebase-config.js?v=7";

/* =====================================================================
   설정값 (숫자만 바꾸면 됩니다)
   ===================================================================== */

// 한국 구간 목표: 인천 → 뉴델리, 중급 항공사(에어인디아 직항) 편도 약 387,000원 (2026-10-14 기준)
const GOAL_KRW = 387000;
// 인도 구간 목표: 뉴델리 → 인천, 최고급 항공사(대한항공 직항) 편도 약 52,400루피 (2026-10-15 기준)
const GOAL_INR = 52400;
// 무인도 탈출 목표: 1달러씩 모아 1,000,000달러
const ISLAND_GOAL = 1000000;

// 피버타임: 접속한 모든 사람의 클릭이 하나의 게이지를 채웁니다. (한국·인도·무인도 공통)
// 300번이 모이면 모두에게 동시에 시작되고 5초 동안 클릭 한 번이 배로 늘어납니다.
// 게이지 숫자를 바꾸면 firebase-rules.json 의 300 도 함께 고쳐 주세요.
const FEVER_CLICKS = 300;
const FEVER_MULT = 100;         // 한국(원)·인도(루피)
const FEVER_MULT_ISLAND = 500;  // 무인도(달러)
const FEVER_MS = 5000;
const FLUSH_MS = 300; // 클릭을 모아서 서버로 보내는 간격

// 비행 (밀리초). 모든 방문자 화면에서 같은 순간에 같은 장면이 나옵니다.
const JOURNEY = {
  fly: 8000,    // 비행 시간
  land: 4000,   // 도착 메시지를 보여 주는 시간
  rescue: 5000, // 무인도에서 탈출한 뒤 남은 거리를 날아가는 시간
};

// 추락: 비행을 시작할 때 이 확률로 도중에 추락합니다.
const CRASH = {
  chance: 0.25,   // 비행 4번 중 1번 꼴
  minFrac: 0.3,   // 비행의 30% ~ 70% 지점 사이에서 추락
  maxFrac: 0.7,
  anim: 2800,     // 추락 장면 길이
};

const PHOTO1 = "photo1.jpg"; // 한국 쪽에 있을 때
const PHOTO2 = "photo2.jpg"; // 인도 쪽에 있을 때

// 자동 클릭 방지
const GUARD = {
  maxCps: 20,            // 1초에 이 횟수 이상 누르면 의심
  answerMs: 5000,        // 경고가 뜬 뒤 응답해야 하는 시간
  maxWarnings: 3,        // 이만큼 쌓이면 버튼이 날아다님
  flyMs: 10 * 60 * 1000, // 버튼이 날아다니는 시간 (10분)
  minAnswerMs: 250,      // 이보다 빠른 응답은 기계로 보고 무시
};

// 지도 (지도 사진 764×513 기준 좌표)
const MAP = {
  korea: { x: 623, y: 165 }, // 충남 홍성군 내포신도시
  delhi: { x: 518, y: 200 }, // 인도 뉴델리
  ctrl: { x: 568, y: 132 },  // 비행 곡선이 휘는 정도
  w: 764,
  h: 513,
};

const GUARD_KEY = "ahnireong-guard";
const LOCAL_KEY = "ahnireong-local-v4";
const LOCAL_FEVER_KEY = "ahnireong-fever-local-v4";

const UNIT = { krw: "원", inr: "루피", usd: "달러" };
const UNIT_OBJ = { krw: "원을", inr: "루피를", usd: "달러를" }; // "~을/를" 조사까지 붙인 형태


// 사이트 버전 (화면 맨 아래에 표시돼요. 앱마다 서로 다른 버전을 보고 있는지 확인할 때 쓰세요.)
const VERSION = 7;

// 환전: 1원 = 15루피, 1달러 = 1,500원 (루피를 1로 놓았을 때의 값)
const RATE = { inr: 1, krw: 15, usd: 22500 };

// 상점 (가격은 모두 원)
const SHOP = {
  boostPrice: 1000,           // 100배 부스트 5분
  boostMult: 100,
  boostMs: 5 * 60 * 1000,
  permPrice: 100000,          // 영구 ×10
  permMult: 10,
};

// 은행
const BANK = {
  rate: 0.001,                           // 이자: 12시간에 0.1% (통장과 대출 모두)
  periodMs: 12 * 60 * 60 * 1000,
  loanDueMs: 24 * 60 * 60 * 1000,       // 대출 만기: 빌린 뒤 24시간
  startCredit: 500,                     // 처음 신용 점수
  maxCredit: 1000,
  limitPerPoint: 1000,                  // 신용 1점당 대출 한도 1,000원 상당
  repayBonus: 20,                       // 만기 안에 다 갚으면 +20점
  latePenalty: 40,                      // 연체 12시간마다 -40점
};
const BANKS = [
  { key: "krw", name: "한국은행", unit: "원" },
  { key: "inr", name: "인도은행", unit: "루피" },
  { key: "usd", name: "미국은행", unit: "달러" },
];

// 랭킹
const RANK_LIMIT = 20;
const CATS = [
  { key: "credit", label: "신용 점수", fmt: (n) => `${won(n)}점` },
  { key: "clicks", label: "누적 클릭 수", fmt: (n) => `${won(n)}번` },
  { key: "donated", label: "누적 기부액", fmt: (n) => `${won(n)}원 상당` },
];

const ACCOUNT_KEY = "ahnireong-account"; // 이 기기에 저장되는 이어하기 코드
const PLAYER_KEY = "ahnireong-player";   // 이 기기에 저장되는 내 데이터 사본
/* =====================================================================
   화면 요소
   ===================================================================== */

const $ = (id) => document.getElementById(id);
const els = {
  wallet: $("wallet"),
  mine: $("mine"),
  donated: $("donated"),
  remaining: $("remaining"),
  percent: $("percent"),
  earnBtn: $("earnBtn"),
  donateBtn: $("donateBtn"),
  status: $("status"),
  sync: $("sync"),
  track: $("track"),
  trackDone: $("trackDone"),
  craft: $("craft"),
  rider: $("rider"),
  journeyMsg: $("journeyMsg"),
  goalText: $("goalText"),
  ticket: document.querySelector(".ticket"),
  feverText: $("feverText"),
  feverFill: $("feverFill"),
  units: document.querySelectorAll(".unit"),
  guardInfo: $("guardInfo"),
  guard: $("guard"),
  guardText: $("guardText"),
  guardFill: $("guardFill"),
  guardBtn: $("guardBtn"),
  mapBtn: $("mapBtn"),
  mapDialog: $("mapDialog"),
  mapClose: $("mapClose"),
  mapView: $("mapView"),
  mapStage: $("mapStage"),
  mapZoomIn: $("mapZoomIn"),
  mapZoomOut: $("mapZoomOut"),
  mapZoomReset: $("mapZoomReset"),
  mapShadow: $("mapShadow"),
  mapBase: $("mapBase"),
  mapDone: $("mapDone"),
  mapTagK: $("mapTagK"),
  mapTagD: $("mapTagD"),
  mapIsland: $("mapIsland"),
  mapPin: $("mapPin"),
  mapFlag: $("mapFlag"),
  mapPlane: $("mapPlane"),
  mapWhere: $("mapWhere"),
  mapProgress: $("mapProgress"),
  onlineCount: $("onlineCount"),
  perkInfo: $("perkInfo"),
  inappNote: $("inappNote"),
  buildInfo: $("buildInfo"),
  shopBtn: $("shopBtn"),
  exchangeBtn: $("exchangeBtn"),
  bankBtn: $("bankBtn"),
  accountBtn: $("accountBtn"),
  rankBtn: $("rankBtn"),
};

const reduceMotion =
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* =====================================================================
   상태
   ===================================================================== */
// 플레이어(나)의 모든 데이터는 "계정"에 묶여 서버에 저장됩니다. 그래서 어느 기기·앱에서든 이어집니다.
function defaultPlayer() {
  return {
    v: 1,
    name: "",                                   // 랭킹 이름 (비어 있으면 미등록)
    wallet: { krw: 0, inr: 0, usd: 0 },         // 지갑
    mine: { krw: 0, inr: 0, usd: 0 },           // 내가 기부한 돈
    clicks: 0,                                  // 누적 클릭 수
    donatedKrw: 0,                              // 누적 기부액 (원 환산)
    perm10: false,                              // 영구 ×10 보유
    boostUntil: 0,                              // 100배 부스트가 끝나는 시각
    bank: { krw: 0, inr: 0, usd: 0 },           // 은행 통장 잔액
    bankAt: { krw: 0, inr: 0, usd: 0 },         // 이자를 마지막으로 합친 시각
    loan: { krw: null, inr: null, usd: null },  // 대출 { owed, dueAt, accAt, lateApplied }
    credit: BANK.startCredit,                   // 신용 점수
    updatedAt: 0,
  };
}

// 서버나 저장소에서 읽은 값을 안전한 모양으로 다듬습니다.
function normalizePlayer(raw) {
  const d = defaultPlayer();
  if (!raw || typeof raw !== "object") return d;
  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
  const trio = (o) => ({ krw: num(o && o.krw), inr: num(o && o.inr), usd: num(o && o.usd) });
  d.name = typeof raw.name === "string" ? raw.name.slice(0, 12) : "";
  d.wallet = trio(raw.wallet);
  d.mine = trio(raw.mine);
  d.clicks = Math.floor(num(raw.clicks));
  d.donatedKrw = num(raw.donatedKrw);
  d.perm10 = !!raw.perm10;
  d.boostUntil = num(raw.boostUntil);
  d.bank = trio(raw.bank);
  d.bankAt = trio(raw.bankAt);
  for (const k of ["krw", "inr", "usd"]) {
    const l = raw.loan && raw.loan[k];
    d.loan[k] = l && num(l.owed) > 0
      ? { owed: num(l.owed), dueAt: num(l.dueAt), accAt: num(l.accAt), lateApplied: Math.floor(num(l.lateApplied)) }
      : null;
  }
  const c = Number(raw.credit);
  d.credit = Number.isFinite(c) ? Math.min(Math.max(Math.floor(c), 0), BANK.maxCredit) : BANK.startCredit;
  d.updatedAt = num(raw.updatedAt);
  return d;
}

let player = defaultPlayer();
let accountCode = "";   // 비밀 이어하기 코드 (다른 사람에게 알려 주면 안 돼요)
let publicId = "";      // 랭킹에 쓰는 공개용 번호 (코드를 해시한 값이라 코드를 알아낼 수 없어요)
let playerDirty = false;
let fb = null;          // 서버(Firebase) 연결 도구 모음
let backend = null;
let busy = false;

// 한 "구간(leg)"이 끝날 때마다 leg 가 1씩 늘어납니다.
//   leg 0: 한국에서 원으로 모금 → 인도행 비행
//   leg 1: 인도에서 루피로 모금 → 한국행 비행
//   leg 2: 다시 한국에서 원으로 모금 ... (반복)
// 비행 도중 추락하면 무인도에서 달러로 모금해 탈출한 뒤, 원래 가던 곳으로 다시 날아갑니다.
// 모금액은 "누적 합계"로 저장해서 줄어드는 일이 없습니다.
let donated = { krw: 0, inr: 0, usd: {} }; // usd: { "L0": 이번 무인도에서 모인 달러, ... }
let leg = 0;
let trip = null; // { leg, startAt, crash(0이면 추락 없음), escapedAt(0이면 아직 탈출 전) }
let tripStarting = false;
let escaping = false;
let advancing = false;

let fever = { count: 0, endAt: 0 };
let serverOffset = 0;
let pending = 0;
let flushing = false;
let flushTimer = null;
let wasInFever = false;
let feverFailed = false;

const goalOfLeg = (l) => (l % 2 === 0 ? GOAL_KRW : GOAL_INR);
const baseOfLeg = (l) => Math.floor(l / 2) * goalOfLeg(l);
const totalOfLeg = (l) => (l % 2 === 0 ? donated.krw : donated.inr);

const clampCount = (n) => Math.max(0, Math.min(Math.floor(Number(n)) || 0, FEVER_CLICKS));
const nonNeg = (n) => Math.max(0, Math.floor(Number(n)) || 0);
const won = (n) => n.toLocaleString("ko-KR");
const serverNow = () => Date.now() + serverOffset;
const isFever = () => serverNow() < fever.endAt;

// 이번 구간에서 모인 돈 (0 ~ 목표)
const getShared = () =>
  Math.max(0, Math.min(totalOfLeg(leg) - baseOfLeg(leg), goalOfLeg(leg)));

// 이번 무인도에서 모인 달러 (0 ~ 1,000,000)
const islandShared = () =>
  Math.max(0, Math.min(nonNeg((donated.usd || {})["L" + leg]), ISLAND_GOAL));

// ---- 내 지갑 ----
const walletOfKind = (k) => player.wallet[k];
function addWalletKind(k, n) { player.wallet[k] = Math.max(0, player.wallet[k] + n); }
const mineOfKind = (k) => player.mine[k];
function addMineKind(k, n) { player.mine[k] = Math.max(0, player.mine[k] + n); }

// ---- 계정 코드 ----
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 글자(I, O, 0, 1)는 뺌
function newCode() {
  const a = new Uint32Array(20);
  crypto.getRandomValues(a);
  let s = "";
  for (const n of a) s += CODE_CHARS[n % CODE_CHARS.length];
  return s;
}
const prettyCode = (c) => (c.match(/.{1,4}/g) || [c]).join("-");
const cleanCode = (t) => String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const validCode = (c) => /^[A-HJ-NP-Z2-9]{20}$/.test(c);

async function sha256Hex(text) {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (e) { // 아주 오래된 브라우저용 간단한 대체
    let h = 5381;
    for (const ch of text) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
    return "x" + h.toString(16).padStart(8, "0") + String(text.length).padStart(4, "0");
  }
}

function loadAccountCode() {
  try {
    const c = localStorage.getItem(ACCOUNT_KEY);
    if (c && validCode(c)) return c;
  } catch (e) { /* 무시 */ }
  return newCode();
}

// 이 기기에 저장해 둔 내 데이터 (서버에 연결되기 전에도 바로 보여 주기 위한 사본)
function loadPlayerLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(PLAYER_KEY));
    if (raw) return normalizePlayer(raw);
  } catch (e) { /* 무시 */ }
  try { // 예전 버전(지갑만 저장하던 때)의 기록 이어받기
    const old = JSON.parse(localStorage.getItem("ahnireong-me"));
    if (old) {
      const p = defaultPlayer();
      p.wallet.krw = nonNeg(old.walletKrw !== undefined ? old.walletKrw : old.wallet);
      p.wallet.inr = nonNeg(old.walletInr);
      p.wallet.usd = nonNeg(old.walletUsd);
      p.mine.krw = nonNeg(old.mineKrw !== undefined ? old.mineKrw : old.mine);
      p.mine.inr = nonNeg(old.mineInr);
      p.mine.usd = nonNeg(old.mineUsd);
      return p;
    }
  } catch (e) { /* 무시 */ }
  return defaultPlayer();
}

// 내 데이터가 바뀔 때마다 부르면 이 기기에 바로 저장하고, 서버에는 잠시 뒤 모아서 보냅니다.
function savePlayer() {
  player.updatedAt = Date.now();
  try { localStorage.setItem(PLAYER_KEY, JSON.stringify(player)); } catch (e) { /* 무시 */ }
  playerDirty = true;
}

function setSync(text) {
  els.sync.textContent = text;
}

/* =====================================================================
   비행 (모금 완료 후)
   ===================================================================== */

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// 지금 어떤 장면인지 계산합니다. p: 0 = 한국(홍성), 1 = 인도(뉴델리)
// phase: funding(모금) boarding(탑승) flying(비행) crashing(추락) island(무인도 모금)
//        escaping(탈출 준비) rescue(구조 비행) landed(도착) done(다음 구간으로)
function journeyState() {
  const origin = leg % 2 === 0 ? 0 : 1;
  const dest = 1 - origin;
  if (!(trip && trip.leg === leg)) {
    return getShared() >= goalOfLeg(leg)
      ? { phase: "boarding", p: origin }
      : { phase: "funding", p: origin };
  }

  const crash = trip.crash > 0 ? trip.crash : 0;
  const e = Math.max(serverNow() - trip.startAt, 0);
  const flyEnd = crash ? JOURNEY.fly * crash : JOURNEY.fly;

  if (e < flyEnd) return { phase: "flying", p: origin + (dest - origin) * ease(e / JOURNEY.fly) };

  if (!crash) {
    if (e < JOURNEY.fly + JOURNEY.land) return { phase: "landed", p: dest };
    return { phase: "done", p: dest };
  }

  // 추락한 경우: 추락 지점은 비행선 위의 한 점입니다.
  const pc = origin + (dest - origin) * ease(crash);
  const e1 = e - flyEnd;
  if (e1 < CRASH.anim) return { phase: "crashing", p: pc, t: e1 / CRASH.anim };

  if (!trip.escapedAt) {
    return { phase: islandShared() >= ISLAND_GOAL ? "escaping" : "island", p: pc };
  }

  const e2 = Math.max(serverNow() - trip.escapedAt, 0);
  if (e2 < JOURNEY.rescue) return { phase: "rescue", p: pc + (dest - pc) * ease(e2 / JOURNEY.rescue) };
  if (e2 < JOURNEY.rescue + JOURNEY.land) return { phase: "landed", p: dest };
  return { phase: "done", p: dest };
}

// 지금 쓰는 돈의 종류와 목표, 모인 금액
function ctxOf(st) {
  if (st.phase === "island" || st.phase === "escaping") {
    return { kind: "usd", unit: UNIT.usd, goal: ISLAND_GOAL, shared: islandShared(), mult: FEVER_MULT_ISLAND };
  }
  const kind = leg % 2 === 0 ? "krw" : "inr";
  return { kind, unit: UNIT[kind], goal: goalOfLeg(leg), shared: getShared(), mult: FEVER_MULT };
}

function render() {
  const st = journeyState();
  const ctx = ctxOf(st);
  const pct = (ctx.shared / ctx.goal) * 100;
  const remaining = Math.max(ctx.goal - ctx.shared, 0);
  const wallet = walletOfKind(ctx.kind);

  els.wallet.textContent = won(wallet);
  els.mine.textContent = won(mineOfKind(ctx.kind));
  els.donated.textContent = won(ctx.shared);
  els.remaining.textContent = won(remaining);
  els.percent.textContent = pct.toFixed(2);
  els.goalText.textContent = won(ctx.goal);
  els.units.forEach((u) => { u.textContent = ctx.unit; });

  // 모금 진행선은 출발지 쪽에서 자라납니다 (한국: 왼쪽 → 오른쪽, 인도: 오른쪽 → 왼쪽)
  const fromRight = leg % 2 === 1;
  els.trackDone.style.width = pct + "%";
  els.trackDone.style.left = fromRight ? "auto" : "0";
  els.trackDone.style.right = fromRight ? "0" : "auto";
  els.track.setAttribute("aria-valuenow", pct.toFixed(2));

  els.donateBtn.disabled = busy || wallet === 0 || remaining === 0;
  els.ticket.classList.toggle("arrived", remaining === 0);
  els.ticket.classList.toggle("in-india", ctx.kind === "inr");
  els.ticket.classList.toggle("on-island", ctx.kind === "usd");
  renderPerks();
}

function messageFor(phase) {
  const toIndia = leg % 2 === 0;
  const destTo = toIndia ? "인도 뉴델리로" : "충남 홍성으로";
  switch (phase) {
    case "funding":
      return toIndia
        ? "안이령이 충남 홍성군 내포신도시에서 출발을 기다리고 있어요. 원을 모아 인도행 비행기 값을 채워 주세요!"
        : "안이령이 인도 뉴델리에 있어요! 이제 루피를 모아 한국행 비행기 값을 채워 주세요.";
    case "boarding":
      return toIndia
        ? "목표 달성! 안이령이 비행기에 탑승했어요. 곧 출발합니다!"
        : "목표 달성! 안이령이 한국행 비행기에 탑승했어요. 곧 출발합니다!";
    case "flying":
      return toIndia
        ? "안이령이 인도 뉴델리로 날아가는 중이에요…"
        : "안이령이 충남 홍성으로 돌아가는 중이에요…";
    case "crashing":
      return "무인도에 추락했습니다";
    case "island":
      return `안이령이 무인도에 갇혔어요! 달러를 1달러씩 모아 ${won(ISLAND_GOAL)}달러를 채우면 탈출할 수 있어요.`;
    case "escaping":
      return "탈출 비용이 모두 모였어요! 구조 비행기가 곧 출발합니다.";
    case "rescue":
      return `안이령이 무인도를 탈출해 ${destTo} 다시 날아가는 중이에요…`;
    default: // landed, done
      return toIndia
        ? "안이령이 무사히 인도로 도착했습니다"
        : "안이령이 홍성에 무사히 돌아왔어요! 곧 새 모금이 시작돼요.";
  }
}

let currentPhoto = 0;
function setPhoto(which) {
  if (which === currentPhoto) return;
  const first = currentPhoto === 0;
  currentPhoto = which;
  els.rider.src = which === 2 ? PHOTO2 : PHOTO1;
  if (!first) {
    els.rider.classList.remove("pop");
    void els.rider.offsetWidth; // 애니메이션을 다시 재생하기 위한 트릭
    els.rider.classList.add("pop");
  }
}

let lastKey = "";
function renderJourney() {
  const st = journeyState();
  const { phase, p } = st;
  const arrivedPhase = phase === "landed" || phase === "done";
  const originPhoto = leg % 2 === 0 ? 1 : 2;
  const destPhoto = 3 - originPhoto;

  els.craft.style.setProperty("--p", reduceMotion ? (p >= 0.5 ? 1 : 0) : p);
  els.craft.classList.toggle("back", leg % 2 === 1); // 한국행일 때는 왼쪽을 바라봄
  els.craft.classList.toggle("crashing", phase === "crashing");
  els.craft.classList.toggle("stranded", phase === "island" || phase === "escaping");
  setPhoto(arrivedPhase ? destPhoto : originPhoto);

  const key = phase + ":" + leg;
  if (key !== lastKey) {
    lastKey = key;
    els.journeyMsg.textContent = messageFor(phase);
    els.journeyMsg.dataset.phase = arrivedPhase ? "arrived" : phase === "crashing" ? "crash" : phase;
    render();       // 장면이 바뀌면 돈의 종류(원·루피·달러)도 바뀔 수 있음
    renderFever();
  }

  // 비행 시작, 탈출, 다음 구간 시작은 누군가 한 명이 서버에 기록해 주면 모두에게 반영됩니다.
  if (!backend) return;
  if (phase === "boarding" && !tripStarting) {
    tripStarting = true;
    backend.startTrip(leg).catch(() => {}).finally(() => {
      setTimeout(() => { tripStarting = false; }, 1500);
    });
  }
  if (phase === "escaping" && !escaping) {
    escaping = true;
    backend.escape(leg).catch(() => {}).finally(() => {
      setTimeout(() => { escaping = false; }, 1500);
    });
  }
  if (phase === "done" && !advancing) {
    advancing = true;
    backend.nextLeg(leg).catch(() => {}).finally(() => {
      setTimeout(() => { advancing = false; }, 1500);
    });
  }
}

function journeyLoop() {
  renderJourney();
  if (els.mapDialog.open) renderMap();
  requestAnimationFrame(journeyLoop);
}

/* =====================================================================
   피버타임
   ===================================================================== */

// 클릭 n번을 반영한 새 피버타임 상태를 계산합니다. (서버 트랜잭션과 연습 모드가 함께 씁니다.)
function applyClicks(cur, n, now) {
  const count = clampCount(cur && cur.count);
  const endAt = Number(cur && cur.endAt) || 0;
  if (endAt > now) return { count, endAt };          // 피버타임 중에는 게이지가 오르지 않음
  const next = count + n;
  if (next >= FEVER_CLICKS) return { count: 0, endAt: now + FEVER_MS };
  return { count: next, endAt };
}

function renderFever() {
  const now = serverNow();
  const active = now < fever.endAt;
  const ctx = ctxOf(journeyState());

  if (active !== wasInFever) {
    wasInFever = active;
    if (active) {
      pending = 0;
      els.status.textContent = `피버타임 시작! ${FEVER_MS / 1000}초 동안 클릭이 ${won(ctx.mult)}배예요.`;
    } else {
      els.status.textContent = `피버타임이 끝났어요. 다시 ${FEVER_CLICKS}번을 모두 함께 채워 보세요!`;
    }
  }

  els.ticket.classList.toggle("fever-on", active);

  if (active) {
    const left = Math.min(Math.max(fever.endAt - now, 0), FEVER_MS);
    els.feverFill.style.width = (left / FEVER_MS) * 100 + "%";
    els.feverText.textContent =
      `피버타임! 클릭 ×${won(ctx.mult)}배 (남은 시간 ${(left / 1000).toFixed(1)}초)`;
    els.earnBtn.textContent = `${won(clickValue(ctx, true))}${ctx.unit} 벌기`;
  } else {
    const shown = Math.min(fever.count + pending, FEVER_CLICKS);
    els.feverFill.style.width = (shown / FEVER_CLICKS) * 100 + "%";
    els.feverText.textContent = feverFailed
      ? `${shown} / ${FEVER_CLICKS}번 (서버에 저장되지 않고 있어요. Firebase 규칙을 확인해 주세요)`
      : `${shown} / ${FEVER_CLICKS}번 (안이령이 인도로 하루 빨리 가게 도와주는 버튼입니다.)`;
    els.earnBtn.textContent = `${won(clickValue(ctx, false))}${ctx.unit} 벌기`;
  }
}

function scheduleFlush(delay = FLUSH_MS) {
  if (flushTimer) return;
  flushTimer = setTimeout(flush, delay);
}

// 모아 둔 클릭을 서버로 한꺼번에 보냅니다.
async function flush() {
  flushTimer = null;
  if (flushing || pending === 0) return;
  if (!backend) { scheduleFlush(500); return; }

  flushing = true;
  const n = pending;
  pending = 0;
  let ok = true;
  try {
    await backend.addClicks(n);
    feverFailed = false;
  } catch (e) {
    console.error("피버타임 저장 실패:", e);
    feverFailed = true;
    pending = Math.min(pending + n, FEVER_CLICKS);
    ok = false;
  }
  flushing = false;
  if (pending > 0) scheduleFlush(ok ? FLUSH_MS : 2000);
}

/* =====================================================================
   자동 클릭 방지
   ===================================================================== */

let guard = { warnings: 0, flyUntil: 0 };
let clickTimes = [];   // 최근 1초 동안의 클릭 시각
let recentTimes = [];  // 최근 20번의 클릭 시각
let guardOpen = false;
let guardShownAt = 0;
let guardDeadline = 0;
let guardTimer = null;
let lastKeyRepeat = false;

document.addEventListener("keydown", (e) => { lastKeyRepeat = e.repeat; }, true);

function loadGuard() {
  try {
    const s = JSON.parse(localStorage.getItem(GUARD_KEY));
    if (s) guard = { warnings: nonNeg(s.warnings), flyUntil: Number(s.flyUntil) || 0 };
  } catch (e) { /* 무시 */ }
}

function saveGuard() {
  try { localStorage.setItem(GUARD_KEY, JSON.stringify(guard)); } catch (e) { /* 무시 */ }
}

// 이 클릭이 사람이 낼 수 없는 클릭인지 검사합니다.
function checkClick(e) {
  if (!e.isTrusted) return { bad: true, cps: 0 }; // 코드로 만들어 낸 클릭

  const t = performance.now();
  clickTimes.push(t);
  while (clickTimes.length && t - clickTimes[0] > 1000) clickTimes.shift();
  if (clickTimes.length >= GUARD.maxCps) return { bad: true, cps: clickTimes.length };

  // 간격이 기계처럼 일정하게 빠른 경우
  recentTimes.push(t);
  if (recentTimes.length > 20) recentTimes.shift();
  if (recentTimes.length === 20) {
    const gaps = [];
    for (let i = 1; i < recentTimes.length; i++) gaps.push(recentTimes[i] - recentTimes[i - 1]);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (mean < 83) { // 초당 12번보다 빠르게
      const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
      if (sd < 3) return { bad: true, cps: Math.round(1000 / mean) };
    }
  }
  return { bad: false };
}

function openGuard(cps) {
  if (guardOpen) return;
  guardOpen = true;
  guardShownAt = performance.now();
  guardDeadline = guardShownAt + GUARD.answerMs;
  clickTimes = [];
  recentTimes = [];
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

  els.guardText.textContent =
    (cps ? `초당 약 ${cps}번 클릭했어요. ` : "코드로 만든 클릭이 감지됐어요. ") +
    `사람이라면 ${GUARD.answerMs / 1000}초 안에 "사람이에요" 버튼을 눌러 주세요. ` +
    `못 누르면 경고가 쌓이고, ${GUARD.maxWarnings}번 쌓이면 클릭 버튼이 ${GUARD.flyMs / 60000}분 동안 날아다녀요. ` +
    `(지금 경고 ${guard.warnings}/${GUARD.maxWarnings})`;

  // 버튼은 매번 다른 곳에 나타납니다.
  els.guardBtn.style.left = 15 + Math.random() * 70 + "%";
  els.guardBtn.style.top = 45 + Math.random() * 40 + "%";
  els.guardFill.style.width = "100%";
  els.guard.hidden = false;

  clearTimeout(guardTimer);
  guardTimer = setTimeout(guardTimeout, GUARD.answerMs);
}

function closeGuard() {
  clearTimeout(guardTimer);
  guardTimer = null;
  guardOpen = false;
  els.guard.hidden = true;
}

function onGuardConfirm(e) {
  if (!guardOpen) return;
  if (!e.isTrusted) return;
  if (e.detail === 0 && lastKeyRepeat) return;                  // 키를 꾹 눌러서 통과하는 것 방지
  if (performance.now() - guardShownAt < GUARD.minAnswerMs) return; // 너무 빠른 응답은 기계
  closeGuard();
  els.status.textContent = "확인됐어요. 사람으로 인정합니다!";
}

function guardTimeout() {
  closeGuard();
  guard.warnings += 1;
  if (guard.warnings >= GUARD.maxWarnings) {
    guard.warnings = 0;
    guard.flyUntil = Date.now() + GUARD.flyMs;
    saveGuard();
    startFlying();
    els.status.textContent = "경고가 3번 쌓였어요. 클릭 버튼이 10분 동안 날아다닙니다!";
  } else {
    saveGuard();
    els.status.textContent = `경고 ${guard.warnings}/${GUARD.maxWarnings}: ${GUARD.answerMs / 1000}초 안에 응답하지 않았어요.`;
  }
  renderGuardInfo();
}

function renderGuard() {
  if (!guardOpen) return;
  const left = Math.max(guardDeadline - performance.now(), 0);
  els.guardFill.style.width = (left / GUARD.answerMs) * 100 + "%";
}

function renderGuardInfo() {
  const left = guard.flyUntil - Date.now();
  if (left > 0) {
    const sec = Math.ceil(left / 1000);
    const mm = Math.floor(sec / 60);
    const ss = String(sec % 60).padStart(2, "0");
    els.guardInfo.textContent = `자동 클릭이 의심돼서 버튼이 날아다니는 중이에요. 남은 시간 ${mm}:${ss}`;
  } else if (guard.warnings > 0) {
    els.guardInfo.textContent =
      `경고 ${guard.warnings}/${GUARD.maxWarnings} 누적 (${GUARD.maxWarnings}번 쌓이면 클릭 버튼이 ${GUARD.flyMs / 60000}분 동안 날아다녀요)`;
  } else {
    els.guardInfo.textContent = "";
  }
}

// ----- 날아다니는 클릭 버튼 -----
let flyActive = false;
let flyRaf = 0;
let flyPlaceholder = null;
const fly = { x: 0, y: 0, vx: 0, vy: 0, turnAt: 0, last: 0 };

function startFlying() {
  if (flyActive) return;
  flyActive = true;

  const rect = els.earnBtn.getBoundingClientRect();
  flyPlaceholder = document.createElement("div"); // 버튼이 빠져나간 자리를 채워 화면이 흔들리지 않게 함
  flyPlaceholder.className = "earn-ph";
  flyPlaceholder.style.height = rect.height + "px";
  els.earnBtn.parentNode.insertBefore(flyPlaceholder, els.earnBtn);

  els.earnBtn.classList.add("flying");
  fly.x = Math.min(Math.max(rect.left, 0), Math.max(window.innerWidth - 170, 0));
  fly.y = Math.min(Math.max(rect.top, 0), Math.max(window.innerHeight - 64, 0));
  fly.turnAt = 0;
  fly.last = performance.now();
  flyRaf = requestAnimationFrame(flyLoop);
}

function stopFlying() {
  flyActive = false;
  cancelAnimationFrame(flyRaf);
  els.earnBtn.classList.remove("flying");
  els.earnBtn.style.transform = "";
  if (flyPlaceholder) { flyPlaceholder.remove(); flyPlaceholder = null; }
  guard.flyUntil = 0;
  saveGuard();
  renderGuardInfo();
}

function flyLoop(ts) {
  if (!flyActive) return;
  if (Date.now() >= guard.flyUntil) { stopFlying(); return; }

  const dt = Math.min((ts - fly.last) / 1000 || 0, 0.05);
  fly.last = ts;

  if (ts >= fly.turnAt) { // 방향과 속도를 불규칙하게 바꿉니다.
    const ang = Math.random() * Math.PI * 2;
    const speed = 180 + Math.random() * 340;
    fly.vx = Math.cos(ang) * speed;
    fly.vy = Math.sin(ang) * speed;
    fly.turnAt = ts + 450 + Math.random() * 900;
  }

  const w = els.earnBtn.offsetWidth;
  const h = els.earnBtn.offsetHeight;
  const maxX = Math.max(window.innerWidth - w, 0);
  const maxY = Math.max(window.innerHeight - h, 0);

  fly.x += fly.vx * dt;
  fly.y += fly.vy * dt;
  if (fly.x < 0) { fly.x = 0; fly.vx = Math.abs(fly.vx); }
  else if (fly.x > maxX) { fly.x = maxX; fly.vx = -Math.abs(fly.vx); }
  if (fly.y < 0) { fly.y = 0; fly.vy = Math.abs(fly.vy); }
  else if (fly.y > maxY) { fly.y = maxY; fly.vy = -Math.abs(fly.vy); }

  els.earnBtn.style.transform = `translate(${fly.x.toFixed(1)}px, ${fly.y.toFixed(1)}px)`;
  flyRaf = requestAnimationFrame(flyLoop);
}

/* =====================================================================
   지도 (확대·축소·이동 가능)
   ===================================================================== */

const MAP_FWD = `M${MAP.korea.x} ${MAP.korea.y} Q${MAP.ctrl.x} ${MAP.ctrl.y} ${MAP.delhi.x} ${MAP.delhi.y}`;
const MAP_REV = `M${MAP.delhi.x} ${MAP.delhi.y} Q${MAP.ctrl.x} ${MAP.ctrl.y} ${MAP.korea.x} ${MAP.korea.y}`;

// 곡선 위의 위치는 "실제 길이" 기준으로 계산해야 진행선과 비행기가 어긋나지 않습니다.
const bez = (t) => {
  const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
  return {
    x: a * MAP.korea.x + b * MAP.ctrl.x + c * MAP.delhi.x,
    y: a * MAP.korea.y + b * MAP.ctrl.y + c * MAP.delhi.y,
  };
};
const BEZ_N = 200;
const bezLen = [0];
for (let i = 1; i <= BEZ_N; i++) {
  const p0 = bez((i - 1) / BEZ_N), p1 = bez(i / BEZ_N);
  bezLen.push(bezLen[i - 1] + Math.hypot(p1.x - p0.x, p1.y - p0.y));
}

function mapPointAt(frac) {
  const f = Math.min(Math.max(frac, 0), 1);
  const target = f * bezLen[BEZ_N];
  let i = 1;
  while (i < BEZ_N && bezLen[i] < target) i++;
  const seg = bezLen[i] - bezLen[i - 1] || 1;
  const t = (i - 1 + (target - bezLen[i - 1]) / seg) / BEZ_N;
  return bez(t);
}

// ----- 확대·축소 상태 -----
// view.k: 지도 한 칸이 화면 몇 픽셀인지, view.tx/ty: 지도를 옮긴 거리(px)
const view = { k: 1, tx: 0, ty: 0 };

function viewSize() {
  const r = els.mapView.getBoundingClientRect();
  return { w: r.width || 1, h: r.height || 1 };
}

function clampK(k) {
  const { w, h } = viewSize();
  const kMin = Math.max(w / MAP.w, h / MAP.h); // 지도가 화면을 항상 꽉 채우도록
  return Math.min(Math.max(k, kMin), kMin * 12);
}

function applyView() {
  const { w, h } = viewSize();
  view.k = clampK(view.k);
  view.tx = Math.min(0, Math.max(view.tx, w - MAP.w * view.k));
  view.ty = Math.min(0, Math.max(view.ty, h - MAP.h * view.k));
  els.mapStage.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.k})`;
}

// (cx, cy) 화면 좌표를 중심으로 확대·축소
function zoomAt(cx, cy, factor) {
  const mx = (cx - view.tx) / view.k;
  const my = (cy - view.ty) / view.k;
  view.k = clampK(view.k * factor);
  view.tx = cx - mx * view.k;
  view.ty = cy - my * view.k;
  applyView();
}

// 처음 화면: 한국과 인도가 화면 양쪽 끝에 오도록 확대
function fitInitial() {
  const { w, h } = viewSize();
  const spanX = Math.abs(MAP.korea.x - MAP.delhi.x);
  let k = w / (spanX * 1.5);
  k = Math.min(k, h / 80); // 세로로도 비행선과 글자가 들어오도록
  view.k = k;
  const cx = (MAP.korea.x + MAP.delhi.x) / 2;
  const cy = 182;
  view.tx = w / 2 - cx * view.k;
  view.ty = h / 2 - cy * view.k;
  applyView();
}

// 포인터(마우스·터치) 이동과 두 손가락 확대
const pointers = new Map();
let panStart = null;
let pinchStart = null;

function pinchInfo() {
  const [a, b] = [...pointers.values()];
  const r = els.mapView.getBoundingClientRect();
  return {
    dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
    cx: (a.x + b.x) / 2 - r.left,
    cy: (a.y + b.y) / 2 - r.top,
  };
}

els.mapView.addEventListener("pointerdown", (e) => {
  if (e.target.closest(".map-zoom")) return;
  els.mapView.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    panStart = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
  } else if (pointers.size === 2) {
    const info = pinchInfo();
    pinchStart = { ...info, k: view.k, tx: view.tx, ty: view.ty };
    panStart = null;
  }
  els.mapView.classList.add("dragging");
});

els.mapView.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1 && panStart) {
    view.tx = panStart.tx + (e.clientX - panStart.x);
    view.ty = panStart.ty + (e.clientY - panStart.y);
    applyView();
  } else if (pointers.size === 2 && pinchStart) {
    const now = pinchInfo();
    const mx = (pinchStart.cx - pinchStart.tx) / pinchStart.k;
    const my = (pinchStart.cy - pinchStart.ty) / pinchStart.k;
    view.k = clampK(pinchStart.k * (now.dist / pinchStart.dist));
    view.tx = now.cx - mx * view.k;
    view.ty = now.cy - my * view.k;
    applyView();
  }
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  pinchStart = null;
  if (pointers.size === 1) {
    const [p] = [...pointers.values()];
    panStart = { x: p.x, y: p.y, tx: view.tx, ty: view.ty };
  } else {
    panStart = null;
    if (pointers.size === 0) els.mapView.classList.remove("dragging");
  }
}
els.mapView.addEventListener("pointerup", endPointer);
els.mapView.addEventListener("pointercancel", endPointer);

els.mapView.addEventListener("wheel", (e) => {
  e.preventDefault();
  const r = els.mapView.getBoundingClientRect();
  zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0016));
}, { passive: false });

els.mapZoomIn.addEventListener("click", () => {
  const { w, h } = viewSize();
  zoomAt(w / 2, h / 2, 1.5);
});
els.mapZoomOut.addEventListener("click", () => {
  const { w, h } = viewSize();
  zoomAt(w / 2, h / 2, 1 / 1.5);
});
els.mapZoomReset.addEventListener("click", fitInitial);
window.addEventListener("resize", () => { if (els.mapDialog.open) applyView(); });

// 글자·점·깃발은 지도를 확대해도 같은 크기로 보이도록 크기를 거꾸로 맞춰 둡니다.
function place(el, x, y, scale, deg = 0) {
  el.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${deg.toFixed(1)}) scale(${scale.toFixed(4)})`);
}

let mapDoneD = "";
function renderMap() {
  const st = journeyState();
  const { phase, p } = st;
  const toIndia = leg % 2 === 0;
  const origin = toIndia ? 0 : 1;
  const ctx = ctxOf(st);
  const funding = phase === "funding" || phase === "boarding";
  const flying = phase === "flying" || phase === "rescue";
  const onIsland = phase === "crashing" || phase === "island" || phase === "escaping";
  const hasCrash = !!(trip && trip.leg === leg && trip.crash > 0 && (phase !== "funding" && phase !== "boarding" && phase !== "flying"));
  const frac = funding ? ctx.shared / ctx.goal : Math.abs(p - origin); // 출발지에서 목적지 방향으로 얼마나 왔는지
  const s = 1 / view.k;

  // 한국 ↔ 인도를 잇는 비행선과 진행도 (확대해도 선 굵기는 같게)
  els.mapShadow.setAttribute("d", MAP_FWD);
  els.mapBase.setAttribute("d", MAP_FWD);
  const doneD = toIndia ? MAP_FWD : MAP_REV;
  if (doneD !== mapDoneD) { els.mapDone.setAttribute("d", doneD); mapDoneD = doneD; }
  els.mapShadow.style.strokeWidth = (8 * s).toFixed(3);
  els.mapBase.style.strokeWidth = (3 * s).toFixed(3);
  els.mapBase.style.strokeDasharray = `${(9 * s).toFixed(3)} ${(7 * s).toFixed(3)}`;
  els.mapDone.style.strokeWidth = (5 * s).toFixed(3);
  els.mapDone.style.strokeDasharray = `${frac.toFixed(4)} 2`;

  // 도시 이름
  place(els.mapTagK, MAP.korea.x, MAP.korea.y, s);
  place(els.mapTagD, MAP.delhi.x, MAP.delhi.y, s);

  // 빨간 점(현재 위치), 깃발(머무는 곳), 비행기(비행 중)
  const pos = mapPointAt(p);
  place(els.mapPin, pos.x, pos.y, s);
  els.mapFlag.style.display = flying || phase === "crashing" ? "none" : "";
  els.mapPlane.setAttribute("visibility", flying ? "visible" : "hidden");
  if (flying) {
    const a = mapPointAt(p - 0.01), b = mapPointAt(p + 0.01);
    const dx = toIndia ? b.x - a.x : a.x - b.x;
    const dy = toIndia ? b.y - a.y : a.y - b.y;
    place(els.mapPlane, pos.x, pos.y, s * 1.3, (Math.atan2(dy, dx) * 180) / Math.PI);
  }

  // 무인도 표시: 추락한 지점에 섬을 그려 둡니다.
  if (hasCrash) {
    const pc = leg % 2 === 0
      ? 0 + (1 - 0) * ease(trip.crash)
      : 1 + (0 - 1) * ease(trip.crash);
    const ip = mapPointAt(pc);
    els.mapIsland.style.display = "";
    place(els.mapIsland, ip.x, ip.y, s * 0.9);
  } else {
    els.mapIsland.style.display = "none";
  }

  // 글
  if (flying) {
    els.mapWhere.textContent = phase === "rescue"
      ? "구조 비행 중: 무인도 → " + (toIndia ? "인도 뉴델리" : "내포신도시")
      : (toIndia ? "비행 중: 내포신도시 → 인도 뉴델리" : "비행 중: 인도 뉴델리 → 내포신도시");
    els.mapProgress.textContent = `비행 진행도 ${(frac * 100).toFixed(0)}%`;
  } else if (onIsland) {
    els.mapWhere.textContent = phase === "crashing"
      ? "무인도에 추락했습니다"
      : "현재 위치: 무인도 (한국과 인도 사이 비행 경로 위)";
    els.mapProgress.textContent = phase === "crashing"
      ? "비행 진행도 " + (frac * 100).toFixed(0) + "%에서 추락"
      : `무인도 탈출 모금 ${(ctx.shared / ctx.goal * 100).toFixed(1)}% (${won(ctx.shared)} / ${won(ctx.goal)}달러)`;
  } else {
    els.mapWhere.textContent = p < 0.5
      ? "현재 위치: 대한민국 충청남도 홍성군 내포신도시"
      : "현재 위치: 인도 뉴델리";
    els.mapProgress.textContent = funding
      ? `${toIndia ? "인도행" : "한국행"} 비행기 값 모금 ${(frac * 100).toFixed(1)}% (${won(ctx.shared)} / ${won(ctx.goal)}${ctx.unit})`
      : "무사히 도착했어요! 비행 진행도 100%";
  }
}

function openMap() {
  if (typeof els.mapDialog.showModal === "function") els.mapDialog.showModal();
  else els.mapDialog.setAttribute("open", "");
  fitInitial(); // 열 때마다 한국과 인도가 양쪽에 보이는 처음 화면으로
  renderMap();
  requestAnimationFrame(() => { fitInitial(); renderMap(); }); // 화면 크기가 확정된 뒤 한 번 더
}

/* =====================================================================
   상점 · 환전 · 은행 · 랭킹 · 계정
   ===================================================================== */
/* ---------- 공통 ---------- */

const KINDS = ["krw", "inr", "usd"];
// 받침 유무에 따라 조사를 붙이는 도우미 (원 → "원을", 루피 → "루피를")
function hasBatchim(w) {
  const c = w.charCodeAt(w.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
}
const eulReul = (w) => w + (hasBatchim(w) ? "을" : "를");
const eunNeun = (w) => w + (hasBatchim(w) ? "은" : "는");
const euroRo = (w) => {
  const c = w.charCodeAt(w.length - 1);
  return w + (hasBatchim(w) && (c - 0xac00) % 28 !== 8 ? "으로" : "로");
};
const fmt2 = (n) => n.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toKrw = (kind, n) => (n * RATE[kind]) / RATE.krw; // 어떤 돈을 원으로 환산
const fmtClock = (ms) => {
  const s = Math.max(Math.ceil(ms / 1000), 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function openDialog(d) {
  if (typeof d.showModal === "function") d.showModal();
  else d.setAttribute("open", "");
}

/* =====================================================================
   상점 (부스트 · 영구 아이템)
   ===================================================================== */

const boostActive = () => serverNow() < player.boostUntil;

// 클릭 한 번으로 벌리는 돈 = (피버타임 배수) × (영구 ×10) × (부스트 ×100)
function clickValue(ctx, feverOn) {
  return (
    (feverOn ? ctx.mult : 1) *
    (player.perm10 ? SHOP.permMult : 1) *
    (boostActive() ? SHOP.boostMult : 1)
  );
}

function renderPerks() {
  const parts = [];
  if (player.perm10) parts.push(`영구 ×${SHOP.permMult}`);
  if (boostActive()) parts.push(`부스트 ×${SHOP.boostMult} (남은 시간 ${fmtClock(player.boostUntil - serverNow())})`);
  els.perkInfo.textContent = parts.length ? "내 아이템: " + parts.join(" · ") : "";
}

function renderShop() {
  $("shopWallet").textContent = won(player.wallet.krw);
  $("boostState").textContent = boostActive()
    ? `적용 중 · 남은 시간 ${fmtClock(player.boostUntil - serverNow())}`
    : "사용 중이 아니에요";
  $("permState").textContent = player.perm10 ? "보유 중 (영구 적용)" : "아직 없어요";
  $("buyBoost").textContent = `${won(SHOP.boostPrice)}원 구매`;
  $("buyPerm").textContent = player.perm10 ? "구매 완료" : `${won(SHOP.permPrice)}원 구매`;
  $("buyPerm").disabled = player.perm10;
}

function buyBoost() {
  const msg = $("shopMsg");
  if (player.wallet.krw < SHOP.boostPrice) {
    msg.textContent = `원이 모자라요. 지갑에 ${won(SHOP.boostPrice)}원이 있어야 해요.`;
    return;
  }
  const extend = boostActive();
  player.wallet.krw -= SHOP.boostPrice;
  player.boostUntil = Math.max(player.boostUntil, serverNow()) + SHOP.boostMs;
  savePlayer();
  render();
  renderShop();
  msg.textContent = extend ? "부스트 시간이 5분 늘어났어요!" : `${SHOP.boostMult}배 부스트가 5분 동안 시작됐어요!`;
}

function buyPerm() {
  const msg = $("shopMsg");
  if (player.perm10) { msg.textContent = "이미 가지고 있어요."; return; }
  if (player.wallet.krw < SHOP.permPrice) {
    msg.textContent = `원이 모자라요. 지갑에 ${won(SHOP.permPrice)}원이 있어야 해요.`;
    return;
  }
  player.wallet.krw -= SHOP.permPrice;
  player.perm10 = true;
  savePlayer();
  render();
  renderShop();
  msg.textContent = `영구 ×${SHOP.permMult}를 샀어요! 이제부터 모든 클릭이 ${SHOP.permMult}배예요.`;
}

/* =====================================================================
   환전
   ===================================================================== */

// from 돈 amount 를 to 돈으로 바꿀 때 받는 돈(out)과 실제로 쓰는 돈(spend)
function exchangeQuote(from, to, amount) {
  if (from === to || !(amount >= 1)) return null;
  const out = Math.floor((amount * RATE[from]) / RATE[to]);
  if (out < 1) return { out: 0, spend: 0 };
  const spend = Math.ceil((out * RATE[to]) / RATE[from]); // 남는 잔돈은 쓰지 않고 지갑에 둠
  return { out, spend };
}

function updateExPreview() {
  const from = $("exFrom").value;
  const to = $("exTo").value;
  const amt = Math.floor(Number($("exAmount").value));
  const p = $("exPreview");
  if (from === to) { p.textContent = "서로 다른 돈을 골라 주세요."; return null; }
  if (!(amt >= 1)) { p.textContent = ""; return null; }
  const q = exchangeQuote(from, to, amt);
  if (!q || q.out < 1) { p.textContent = "금액이 너무 적어서 바꿀 수 없어요."; return null; }
  p.textContent =
    `${won(q.spend)}${UNIT[from]} → ${won(q.out)}${UNIT[to]}` +
    (q.spend < amt ? ` (남는 ${won(amt - q.spend)}${eunNeun(UNIT[from])} 지갑에 그대로 있어요)` : "");
  return q;
}

function renderExchange() {
  $("exWKrw").textContent = won(player.wallet.krw);
  $("exWInr").textContent = won(player.wallet.inr);
  $("exWUsd").textContent = won(player.wallet.usd);
  updateExPreview();
}

function doExchange() {
  const msg = $("exMsg");
  const from = $("exFrom").value;
  const to = $("exTo").value;
  const q = updateExPreview();
  if (!q) { msg.textContent = "금액과 돈의 종류를 다시 확인해 주세요."; return; }
  if (q.spend > player.wallet[from]) {
    msg.textContent = `지갑에 ${won(player.wallet[from])}${UNIT[from]}만 있어요.`;
    return;
  }
  player.wallet[from] -= q.spend;
  player.wallet[to] += q.out;
  savePlayer();
  render();
  renderExchange();
  msg.textContent = `${won(q.spend)}${eulReul(UNIT[from])} ${won(q.out)}${euroRo(UNIT[to])} 바꿨어요.`;
}

/* =====================================================================
   은행 · 통장 · 대출 · 신용 점수
   ===================================================================== */

// 이자: 12시간에 4%. 흐르는 시간에 따라 조금씩 계속 불어납니다. (사이트를 나가 있는 동안에도 계산됨)
const growth = (ms) => Math.pow(1 + BANK.rate, ms / BANK.periodMs);

function bankBalance(k, now) {
  return player.bank[k] > 0 && player.bankAt[k] > 0
    ? player.bank[k] * growth(Math.max(now - player.bankAt[k], 0))
    : player.bank[k];
}

function settleBank(k, now) { // 이자를 통장에 합치고 기준 시각을 지금으로
  player.bank[k] = bankBalance(k, now);
  player.bankAt[k] = now;
}

function loanOwed(k, now) {
  const l = player.loan[k];
  return l ? l.owed * growth(Math.max(now - l.accAt, 0)) : 0;
}

function settleLoan(k, now) {
  const l = player.loan[k];
  if (l) { l.owed = loanOwed(k, now); l.accAt = now; }
}

// 대출 가능 금액: (신용 점수 × 1,000원 상당 − 지금 갚아야 할 돈 합계)
function loanAvailable(k, now) {
  const limit = player.credit * BANK.limitPerPoint;
  let owed = 0;
  for (const b of KINDS) owed += toKrw(b, loanOwed(b, now));
  return Math.max(Math.floor(((limit - owed) * RATE.krw) / RATE[k]), 0);
}

// 만기가 지났는데 못 갚았으면 12시간마다 신용 점수가 내려갑니다.
function applyOverdue(now) {
  let changed = false;
  for (const k of KINDS) {
    const l = player.loan[k];
    if (!l || now < l.dueAt) continue;
    const late = Math.floor((now - l.dueAt) / BANK.periodMs) + 1;
    const delta = late - l.lateApplied;
    if (delta > 0) {
      player.credit = Math.max(0, player.credit - BANK.latePenalty * delta);
      l.lateApplied = late;
      changed = true;
    }
  }
  if (changed) {
    savePlayer();
    if ($("bankDialog").open) $("bankMsg").textContent = "연체로 신용 점수가 내려갔어요. 빨리 갚아 주세요!";
  }
  return changed;
}

function creditLabel(c) {
  return c >= 800 ? "우수" : c >= 600 ? "양호" : c >= 400 ? "보통" : c >= 200 ? "주의" : "위험";
}

function dueText(dueAt, now) {
  const left = dueAt - now;
  if (left <= 0) {
    const late = -left;
    return `연체 중 (${Math.floor(late / 3600000)}시간 ${Math.floor((late % 3600000) / 60000)}분 지남)`;
  }
  return `만기까지 ${Math.floor(left / 3600000)}시간 ${Math.floor((left % 3600000) / 60000)}분`;
}

function buildBankCards() {
  const wrap = $("bankCards");
  wrap.innerHTML = BANKS.map((b) => `
    <section class="bank-card" data-bank="${b.key}">
      <h3>${b.name} <small>(${b.unit})</small></h3>
      <dl class="bank-nums">
        <div><dt>내 지갑</dt><dd><span data-f="wallet">0</span>${b.unit}</dd></div>
        <div><dt>통장 잔액</dt><dd><span data-f="balance">0</span>${b.unit}</dd></div>
        <div><dt>갚을 대출금</dt><dd><span data-f="owed">0</span>${b.unit}</dd></div>
      </dl>
      <p class="bank-sub" data-f="loanInfo"></p>
      <label class="bank-amt">금액
        <input type="number" min="1" step="1" inputmode="numeric" data-f="amount" placeholder="비우면 가능한 전액">
      </label>
      <div class="bank-btns">
        <button type="button" data-act="deposit">입금</button>
        <button type="button" data-act="withdraw">출금</button>
        <button type="button" data-act="borrow">대출</button>
        <button type="button" data-act="repay">상환</button>
      </div>
    </section>`).join("");

  wrap.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const card = btn.closest("[data-bank]");
    bankAction(card.dataset.bank, btn.dataset.act, card);
  });
}

function renderBank() {
  const now = serverNow();
  $("bankCredit").textContent = won(player.credit);
  $("bankCreditLabel").textContent = creditLabel(player.credit);
  $("bankLimit").textContent = won(player.credit * BANK.limitPerPoint);

  for (const b of BANKS) {
    const card = document.querySelector(`[data-bank="${b.key}"]`);
    if (!card) continue;
    const f = (name) => card.querySelector(`[data-f="${name}"]`);
    f("wallet").textContent = won(player.wallet[b.key]);
    f("balance").textContent = fmt2(bankBalance(b.key, now));
    f("owed").textContent = fmt2(loanOwed(b.key, now));
    const l = player.loan[b.key];
    f("loanInfo").textContent = l
      ? `대출 중 · ${dueText(l.dueAt, now)}`
      : `대출 가능 최대 ${won(loanAvailable(b.key, now))}${b.unit}`;
  }
}

function bankMsg(text) { $("bankMsg").textContent = text; }

function bankAction(k, act, card) {
  const now = serverNow();
  const unit = UNIT[k];
  const input = card.querySelector('[data-f="amount"]');
  const raw = input.value.trim();
  const typed = raw === "" ? null : Math.floor(Number(raw));
  if (typed !== null && !(typed >= 1)) return bankMsg("금액은 1 이상의 숫자로 적어 주세요.");
  applyOverdue(now);

  if (act === "deposit") {
    const amt = typed === null ? player.wallet[k] : typed;
    if (amt < 1) return bankMsg("입금할 돈이 없어요.");
    if (amt > player.wallet[k]) return bankMsg(`지갑에 ${won(player.wallet[k])}${unit}만 있어요.`);
    settleBank(k, now);
    player.wallet[k] -= amt;
    player.bank[k] += amt;
    bankMsg(`${won(amt)}${UNIT_OBJ[k]} 입금했어요.`);
  } else if (act === "withdraw") {
    settleBank(k, now);
    const avail = Math.floor(player.bank[k]);
    const amt = typed === null ? avail : typed;
    if (amt < 1) return bankMsg("출금할 돈이 없어요.");
    if (amt > avail) return bankMsg(`통장에는 ${won(avail)}${unit}까지 꺼낼 수 있어요.`);
    player.bank[k] -= amt;
    if (player.bank[k] < 0.005) player.bank[k] = 0;
    player.wallet[k] += amt;
    bankMsg(`${won(amt)}${UNIT_OBJ[k]} 출금했어요.`);
  } else if (act === "borrow") {
    if (player.loan[k]) return bankMsg("이미 대출이 있어요. 먼저 갚아 주세요.");
    const avail = loanAvailable(k, now);
    const amt = typed === null ? avail : typed;
    if (amt < 1) return bankMsg("지금은 빌릴 수 있는 금액이 없어요. 신용 점수를 올리거나 다른 대출을 먼저 갚아 보세요.");
    if (amt > avail) return bankMsg(`지금은 최대 ${won(avail)}${unit}까지 빌릴 수 있어요.`);
    player.loan[k] = { owed: amt, dueAt: now + BANK.loanDueMs, accAt: now, lateApplied: 0 };
    player.wallet[k] += amt;
    bankMsg(`${won(amt)}${UNIT_OBJ[k]} 빌렸어요. 24시간 안에 갚으면 신용 점수가 올라요!`);
  } else if (act === "repay") {
    const l = player.loan[k];
    if (!l) return bankMsg("갚을 대출이 없어요.");
    settleLoan(k, now);
    const due = Math.ceil(l.owed);
    const amt = Math.min(typed === null ? Math.min(player.wallet[k], due) : typed, due);
    if (amt < 1) return bankMsg("갚을 돈이 지갑에 없어요.");
    if (amt > player.wallet[k]) return bankMsg(`지갑에 ${won(player.wallet[k])}${unit}만 있어요.`);
    player.wallet[k] -= amt;
    l.owed -= amt;
    if (l.owed <= 0.005) {
      const onTime = now <= l.dueAt;
      player.loan[k] = null;
      if (onTime) {
        player.credit = Math.min(BANK.maxCredit, player.credit + BANK.repayBonus);
        bankMsg(`대출을 모두 갚았어요! 신용 점수 +${BANK.repayBonus}`);
      } else {
        bankMsg("연체된 대출을 모두 갚았어요. (신용 점수는 오르지 않아요)");
      }
    } else {
      bankMsg(`${won(amt)}${UNIT_OBJ[k]} 갚았어요. 남은 대출금은 ${fmt2(l.owed)}${unit}이에요.`);
    }
  }
  input.value = "";
  savePlayer();
  render();
  renderBank();
}

function bankTick() {
  const now = serverNow();
  applyOverdue(now);
  if ($("bankDialog").open) renderBank();
}

/* =====================================================================
   랭킹
   ===================================================================== */

let rankCat = "credit";
let rankUnsub = null;
let rankEntries = [];

function myEntry() {
  return {
    name: player.name,
    credit: Math.floor(player.credit),
    clicks: Math.floor(player.clicks),
    donated: Math.floor(player.donatedKrw),
    updatedAt: Date.now(),
  };
}

function renderRank() {
  const cat = CATS.find((c) => c.key === rankCat);
  document.querySelectorAll(".rank-tab").forEach((t) => {
    t.classList.toggle("on", t.dataset.cat === rankCat);
    t.setAttribute("aria-selected", t.dataset.cat === rankCat ? "true" : "false");
  });
  const list = $("rankList");
  list.textContent = "";
  if (!rankEntries.length) {
    const li = document.createElement("li");
    li.className = "rank-empty";
    li.textContent = "아직 등록한 사람이 없어요. 첫 번째로 이름을 올려 보세요!";
    list.appendChild(li);
  }
  rankEntries.forEach((e, i) => {
    const li = document.createElement("li");
    li.className = "rank-item" + (e.id === publicId ? " me" : "");
    const no = document.createElement("span");
    no.className = "rank-no";
    no.textContent = String(i + 1);
    const name = document.createElement("span");
    name.className = "rank-name";
    name.textContent = e.name; // 이름은 글자 그대로만 보여 줍니다
    const val = document.createElement("span");
    val.className = "rank-val";
    val.textContent = cat.fmt(e.value);
    li.append(no, name, val);
    list.appendChild(li);
  });
  $("rankMine").textContent = player.name
    ? `내 이름: ${player.name} (기록이 자동으로 올라가요)`
    : "아직 랭킹에 등록하지 않았어요.";
  $("rankName").value = $("rankName").value || player.name;
  $("rankRemove").hidden = !player.name;
  $("rankSave").textContent = player.name ? "이름 바꾸기" : "랭킹에 등록";
}

function unsubscribeRank() {
  if (typeof rankUnsub === "function") rankUnsub();
  rankUnsub = null;
}

function subscribeRank() {
  unsubscribeRank();
  if (!fb) { // 연습 모드: 내 기록만 보여 줍니다.
    const mine = myEntry();
    rankEntries = player.name ? [{ id: publicId, name: player.name, value: mine[rankCat] }] : [];
    renderRank();
    return;
  }
  const { dbMod, db } = fb;
  const q = dbMod.query(dbMod.ref(db, "v2/ranking"), dbMod.orderByChild(rankCat), dbMod.limitToLast(RANK_LIMIT));
  rankUnsub = dbMod.onValue(
    q,
    (snap) => {
      const arr = [];
      snap.forEach((child) => {
        const v = child.val() || {};
        arr.push({ id: child.key, name: String(v.name || "").slice(0, 12), value: Number(v[rankCat]) || 0 });
      });
      arr.sort((a, b) => b.value - a.value);
      rankEntries = arr;
      $("rankMsg").textContent = "";
      renderRank();
    },
    (err) => {
      console.error("랭킹 읽기 실패:", err);
      $("rankMsg").textContent = "랭킹을 불러오지 못했어요. Firebase 규칙을 최신으로 바꿨는지 확인해 주세요.";
    }
  );
}

async function saveRankName(e) {
  e.preventDefault();
  const msg = $("rankMsg");
  const name = $("rankName").value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 12);
  if (name.length < 1) { msg.textContent = "이름을 1~12글자로 적어 주세요."; return; }
  player.name = name;
  savePlayer();
  await syncNow(true);
  if (!fb) subscribeRank();
  renderRank();
  msg.textContent = `"${name}" 이름으로 등록했어요. 신용 점수, 클릭 수, 기부액이 자동으로 올라가요.`;
}

async function removeRank() {
  const msg = $("rankMsg");
  player.name = "";
  savePlayer();
  if (fb && publicId) {
    try { await fb.dbMod.remove(fb.dbMod.ref(fb.db, "v2/ranking/" + publicId)); } catch (e) { console.error(e); }
  }
  if (!fb) subscribeRank();
  $("rankName").value = "";
  renderRank();
  msg.textContent = "랭킹에서 이름을 뺐어요.";
}

/* =====================================================================
   계정 (이어하기 코드)
   ===================================================================== */

function renderAccount() {
  $("accCode").textContent = prettyCode(accountCode);
}

async function copyCode() {
  const msg = $("accMsg");
  const text = prettyCode(accountCode);
  try {
    await navigator.clipboard.writeText(text);
    msg.textContent = "코드를 복사했어요. 다른 기기나 앱에 붙여넣어 이어서 하세요.";
  } catch (e) {
    const range = document.createRange();
    range.selectNodeContents($("accCode"));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    msg.textContent = "코드를 선택했어요. 길게 눌러서(또는 Ctrl + C로) 복사해 주세요.";
  }
}

async function loadAccountByCode() {
  const msg = $("accMsg");
  const code = cleanCode($("accInput").value);
  if (!validCode(code)) { msg.textContent = "코드 형식이 올바르지 않아요. 20자리 코드를 그대로 붙여넣어 주세요."; return; }
  if (code === accountCode) { msg.textContent = "지금 쓰고 있는 코드예요."; return; }
  if (!fb) { msg.textContent = "서버에 연결된 상태에서만 이어할 수 있어요."; return; }
  msg.textContent = "불러오는 중…";
  try {
    await syncNow(true); // 지금 계정의 변경 사항은 먼저 저장
    const snap = await fb.dbMod.get(fb.dbMod.ref(fb.db, "v2/players/" + code));
    if (!snap.exists()) { msg.textContent = "그 코드로 저장된 데이터를 찾지 못했어요."; return; }
    if (!window.confirm("이 기기의 데이터가 입력한 코드의 데이터로 바뀌어요. (지금 계정의 데이터는 서버에 그대로 남아 있어요.) 계속할까요?")) {
      msg.textContent = "취소했어요.";
      return;
    }
    accountCode = code;
    try { localStorage.setItem(ACCOUNT_KEY, code); } catch (e) { /* 무시 */ }
    publicId = (await sha256Hex(code)).slice(0, 24);
    player = normalizePlayer(snap.val());
    try { localStorage.setItem(PLAYER_KEY, JSON.stringify(player)); } catch (e) { /* 무시 */ }
    playerDirty = false;
    $("accInput").value = "";
    renderAccount();
    render();
    renderFever();
    renderPerks();
    msg.textContent = "이어하기 완료! 이제 이 기기에서도 같은 데이터로 플레이해요.";
  } catch (e) {
    console.error(e);
    msg.textContent = "불러오지 못했어요. 잠시 후 다시 시도해 주세요. [" + (e && e.message ? e.message : e) + "]";
  }
}

/* =====================================================================
   서버 연결 후 할 일: 접속자 수, 내 데이터 맞추기, 저장
   ===================================================================== */

let accountReady = false;
let syncing = false;
let syncStarted = false;
let playerSyncState = "연결 중…";

function renderBuildInfo() {
  els.buildInfo.textContent =
    `사이트 버전 ${VERSION} · 서버 ${firebaseConfig && firebaseConfig.projectId ? firebaseConfig.projectId : "(미설정)"} · 내 데이터: ${playerSyncState}`;
}

function localExtras() {
  els.onlineCount.textContent = "1";
  accountReady = true;
  playerSyncState = "연습 모드 (이 기기에만 저장)";
  renderBuildInfo();
}

// 내 데이터를 서버에 저장합니다. 값이 바뀌었을 때만 보냅니다.
async function syncNow(force) {
  if (!fb || !accountReady || syncing) return;
  if (!playerDirty && !force) return;
  syncing = true;
  playerDirty = false;
  try {
    const { dbMod, db } = fb;
    await dbMod.set(dbMod.ref(db, "v2/players/" + accountCode), JSON.parse(JSON.stringify(player)));
    if (player.name && publicId) {
      await dbMod.set(dbMod.ref(db, "v2/ranking/" + publicId), myEntry());
    }
    playerSyncState = "서버에 저장됨";
  } catch (e) {
    console.error("내 데이터 저장 실패:", e);
    playerDirty = true;
    playerSyncState = "서버 저장 실패 [" + (e && e.message ? e.message : e) + "]";
  }
  syncing = false;
  renderBuildInfo();
}

async function connectExtras() {
  const { dbMod, db } = fb;

  // 실시간 접속자 수: 접속하면 내 이름표를 올리고, 나가면 서버가 알아서 지웁니다.
  const cid = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const presRef = dbMod.ref(db, "v2/presence/" + cid);
  dbMod.onValue(dbMod.ref(db, ".info/connected"), (snap) => {
    if (snap.val() === true) {
      dbMod.onDisconnect(presRef).remove();
      dbMod.set(presRef, Date.now()).catch((e) => console.error("접속 표시 실패:", e));
    }
  });
  dbMod.onValue(
    dbMod.ref(db, "v2/presence"),
    (snap) => {
      const n = typeof snap.size === "number" ? snap.size : snap.numChildren();
      els.onlineCount.textContent = String(Math.max(n, 1));
    },
    (err) => console.error("접속자 수 읽기 실패:", err)
  );

  // 이 계정의 서버 데이터와 맞추기
  try {
    const snap = await dbMod.get(dbMod.ref(db, "v2/players/" + accountCode));
    const remote = snap.exists() ? normalizePlayer(snap.val()) : null;
    if (remote && remote.updatedAt > player.updatedAt) {
      player = remote; // 서버가 더 최신이면 서버 데이터를 씀 (다른 기기·앱에서 이어하기)
      try { localStorage.setItem(PLAYER_KEY, JSON.stringify(player)); } catch (e) { /* 무시 */ }
      render();
      renderFever();
    } else {
      playerDirty = true; // 서버에 없거나 이 기기 쪽이 더 최신
    }
    accountReady = true;
    playerSyncState = "서버에 저장됨";
  } catch (e) {
    console.error("내 데이터 불러오기 실패:", e);
    playerSyncState = "서버 연결 실패 [" + (e && e.message ? e.message : e) + "] (Firebase 규칙을 최신으로 바꿨는지 확인해 주세요)";
  }
  renderBuildInfo();

  if (!syncStarted) {
    syncStarted = true;
    setInterval(() => syncNow(false), 2500);
    document.addEventListener("visibilitychange", () => { if (document.hidden) syncNow(false); });
    window.addEventListener("pagehide", () => syncNow(false));
  }
}

/* =====================================================================
   화면 연결
   ===================================================================== */

function wireUi() {
  // 메뉴 버튼
  els.shopBtn.addEventListener("click", () => { $("shopMsg").textContent = ""; renderShop(); openDialog($("shopDialog")); });
  els.exchangeBtn.addEventListener("click", () => { $("exMsg").textContent = ""; renderExchange(); openDialog($("exchangeDialog")); });
  els.bankBtn.addEventListener("click", () => { bankMsg(""); renderBank(); openDialog($("bankDialog")); });
  els.accountBtn.addEventListener("click", () => { $("accMsg").textContent = ""; renderAccount(); openDialog($("accountDialog")); });
  els.rankBtn.addEventListener("click", () => { $("rankMsg").textContent = ""; openDialog($("rankDialog")); subscribeRank(); renderRank(); });

  // 닫기: "닫기" 버튼이나 바깥(어두운 부분) 클릭
  document.querySelectorAll("dialog.modal").forEach((d) => {
    d.addEventListener("click", (e) => {
      if (e.target === d || e.target.closest("[data-close]")) d.close();
    });
  });
  $("rankDialog").addEventListener("close", unsubscribeRank);

  // 상점
  $("buyBoost").addEventListener("click", buyBoost);
  $("buyPerm").addEventListener("click", buyPerm);

  // 환전
  $("exFrom").addEventListener("change", updateExPreview);
  $("exTo").addEventListener("change", updateExPreview);
  $("exAmount").addEventListener("input", updateExPreview);
  $("exAll").addEventListener("click", () => { $("exAmount").value = player.wallet[$("exFrom").value] || ""; updateExPreview(); });
  $("exSwap").addEventListener("click", () => {
    const a = $("exFrom").value;
    $("exFrom").value = $("exTo").value;
    $("exTo").value = a;
    updateExPreview();
  });
  $("exDo").addEventListener("click", doExchange);

  // 은행
  buildBankCards();

  // 랭킹
  document.querySelectorAll(".rank-tab").forEach((t) => {
    t.addEventListener("click", () => { rankCat = t.dataset.cat; subscribeRank(); renderRank(); });
  });
  $("rankForm").addEventListener("submit", saveRankName);
  $("rankRemove").addEventListener("click", removeRank);

  // 계정
  $("accCopy").addEventListener("click", copyCode);
  $("accLoad").addEventListener("click", loadAccountByCode);

  // 인스타·카톡 같은 앱 안의 브라우저에서는 저장 공간이 따로라서 안내를 보여 줍니다.
  if (/KAKAOTALK|Instagram|FBAN|FBAV|NAVER\(inapp|DaumApps|Line\//i.test(navigator.userAgent || "")) {
    els.inappNote.hidden = false;
  }
}

/* =====================================================================
   저장소(백엔드)
   ===================================================================== */

// 비행을 시작할 때 추락할지 정합니다. (0이면 추락 없음, 아니면 비행의 몇 % 지점에서 추락할지)
function rollCrash() {
  if (Math.random() >= CRASH.chance) return 0;
  return Math.round((CRASH.minFrac + Math.random() * (CRASH.maxFrac - CRASH.minFrac)) * 1000) / 1000;
}

const parseTrip = (v) =>
  v && Number.isFinite(Number(v.startAt))
    ? {
        leg: nonNeg(v.leg),
        startAt: Number(v.startAt),
        crash: Math.min(Math.max(Number(v.crash) || 0, 0), 1),
        escapedAt: Number(v.escapedAt) || 0,
      }
    : null;

function setupLocalBackend(message) {
  try {
    const s = JSON.parse(localStorage.getItem(LOCAL_KEY));
    if (s) {
      donated = { krw: nonNeg(s.krw), inr: nonNeg(s.inr), usd: s.usd && typeof s.usd === "object" ? s.usd : {} };
      leg = nonNeg(s.leg);
      trip = parseTrip(s.trip);
    }
  } catch (e) { /* 무시 */ }
  try {
    const f = JSON.parse(localStorage.getItem(LOCAL_FEVER_KEY));
    if (f) fever = { count: clampCount(f.count), endAt: Number(f.endAt) || 0 };
  } catch (e) { /* 무시 */ }

  const saveLocal = () => {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ krw: donated.krw, inr: donated.inr, usd: donated.usd, leg, trip }));
    } catch (e) { /* 무시 */ }
  };

  backend = {
    async add(kind, l, amount) {
      if (kind === "usd") {
        const key = "L" + l;
        const cur = nonNeg(donated.usd[key]);
        const next = Math.max(cur, Math.min(cur + amount, ISLAND_GOAL));
        donated.usd[key] = next;
        saveLocal();
        return next - cur;
      }
      const cap = baseOfLeg(l) + goalOfLeg(l);
      const cur = donated[kind];
      const next = Math.max(cur, Math.min(cur + amount, cap));
      donated[kind] = next;
      saveLocal();
      return next - cur;
    },
    async startTrip(l) {
      if (!(trip && trip.leg === l)) {
        trip = { leg: l, startAt: Date.now(), crash: rollCrash(), escapedAt: 0 };
        saveLocal();
      }
    },
    async escape(l) {
      if (trip && trip.leg === l && trip.crash > 0 && !trip.escapedAt) {
        trip = { ...trip, escapedAt: Date.now() };
        saveLocal();
      }
    },
    async nextLeg(l) {
      if (leg === l) {
        leg = l + 1;
        saveLocal();
        render();
        renderFever();
      }
    },
    async addClicks(n) {
      fever = applyClicks(fever, n, Date.now());
      try { localStorage.setItem(LOCAL_FEVER_KEY, JSON.stringify(fever)); } catch (e) { /* 무시 */ }
      renderFever();
    },
  };
  setSync(message);
  render();
  renderFever();
  localExtras();
}

async function initBackend() {
  const url = firebaseConfig && firebaseConfig.databaseURL;
  if (!url || url.includes("YOUR")) {
    setupLocalBackend("연습 모드: 아직 공유 서버가 연결되지 않아 이 기기에서만 저장돼요.");
    return;
  }

  try {
    const base = "https://www.gstatic.com/firebasejs/10.12.2/";
    const appMod = await import(base + "firebase-app.js");
    const dbMod = await import(base + "firebase-database.js");

    const app = appMod.initializeApp(firebaseConfig);
    const db = dbMod.getDatabase(app);
    const krwRef = dbMod.ref(db, "v2/donatedKrw");
    const inrRef = dbMod.ref(db, "v2/donatedInr");
    const usdRef = dbMod.ref(db, "v2/usd");
    const legRef = dbMod.ref(db, "v2/leg");
    const tripRef = dbMod.ref(db, "v2/trip");
    const feverRef = dbMod.ref(db, "v2/fever");
    const failMsg = "공유 서버에 연결하지 못했어요. Firebase 설정과 규칙을 확인해 주세요.";
    // 실제 오류 내용도 함께 보여 줘서 원인을 찾기 쉽게 합니다. (permission_denied 이면 규칙 문제)
    const fail = (err) => {
      console.error("Firebase 오류:", err);
      setSync(failMsg + " [" + (err && err.message ? err.message : String(err)) + "]");
    };

    // 내 시계와 서버 시계의 차이 (모두가 같은 시각에 같은 장면을 보도록)
    dbMod.onValue(dbMod.ref(db, ".info/serverTimeOffset"), (snap) => {
      serverOffset = Number(snap.val()) || 0;
    });

    dbMod.onValue(krwRef, (snap) => {
      donated.krw = nonNeg(snap.val());
      setSync("실시간으로 모든 방문자와 함께 모으는 중이에요.");
      render();
    }, fail);

    dbMod.onValue(inrRef, (snap) => {
      donated.inr = nonNeg(snap.val());
      render();
    }, fail);

    dbMod.onValue(usdRef, (snap) => {
      donated.usd = snap.val() || {};
      render();
    }, fail);

    dbMod.onValue(legRef, (snap) => {
      leg = nonNeg(snap.val());
      render();
      renderFever();
    }, fail);

    dbMod.onValue(tripRef, (snap) => {
      trip = parseTrip(snap.val());
    }, fail);

    dbMod.onValue(feverRef, (snap) => {
      const v = snap.val() || {};
      fever = { count: clampCount(v.count), endAt: Number(v.endAt) || 0 };
      feverFailed = false;
      renderFever();
    }, (err) => {
      feverFailed = true;
      fail(err);
      renderFever();
    });

    backend = {
      // 목표까지만 안전하게 더하고, 실제로 더해진 금액을 돌려줍니다.
      async add(kind, l, amount) {
        let added = 0;
        if (kind === "usd") {
          await dbMod.runTransaction(dbMod.ref(db, "v2/usd/L" + l), (current) => {
            const cur = nonNeg(current);
            const next = Math.max(cur, Math.min(cur + amount, ISLAND_GOAL));
            added = next - cur;
            return next;
          });
          return added;
        }
        const cap = baseOfLeg(l) + goalOfLeg(l);
        await dbMod.runTransaction(kind === "krw" ? krwRef : inrRef, (current) => {
          const cur = nonNeg(current);
          const next = Math.max(cur, Math.min(cur + amount, cap));
          added = next - cur;
          return next;
        });
        return added;
      },
      // 이번 구간의 비행을 시작합니다. 이미 시작됐다면 그대로 둡니다. (추락 여부도 이때 정해집니다.)
      async startTrip(l) {
        await dbMod.runTransaction(tripRef, (cur) =>
          cur && Number(cur.leg) === l
            ? cur
            : { leg: l, startAt: serverNow(), crash: rollCrash(), escapedAt: 0 }
        );
      },
      // 무인도 탈출 비용이 모이면 구조 비행을 시작합니다.
      async escape(l) {
        await dbMod.runTransaction(tripRef, (cur) => {
          if (cur && Number(cur.leg) === l && Number(cur.crash) > 0 && !Number(cur.escapedAt)) {
            return { leg: l, startAt: Number(cur.startAt), crash: Number(cur.crash), escapedAt: serverNow() };
          }
          return cur;
        });
      },
      // 비행이 끝나면 다음 구간으로 넘어갑니다. (한국 → 인도 → 한국 → …)
      async nextLeg(l) {
        await dbMod.runTransaction(legRef, (cur) => {
          const c = nonNeg(cur);
          return c === l ? l + 1 : c;
        });
      },
      // 피버타임 게이지에 클릭 n번을 더합니다.
      async addClicks(n) {
        await dbMod.runTransaction(feverRef, (cur) => applyClicks(cur, n, serverNow()));
      },
    };
    fb = { dbMod, db };
    await connectExtras();
  } catch (e) {
    setSync("공유 서버를 불러오지 못했어요. 인터넷 연결을 확인해 주세요. [" + (e && e.message ? e.message : String(e)) + "]");
  }
}

/* =====================================================================
   버튼
   ===================================================================== */
function earn(e) {
  if (guardOpen) return;

  const check = checkClick(e);
  if (check.bad) { // 사람이 낼 수 없는 클릭: 이 클릭은 인정하지 않고 경고를 띄웁니다.
    openGuard(check.cps);
    return;
  }

  const ctx = ctxOf(journeyState());
  const feverOn = isFever();
  addWalletKind(ctx.kind, clickValue(ctx, feverOn)); // (피버타임) × (영구 ×10) × (부스트 ×100)
  player.clicks += 1;
  if (!feverOn) {
    els.status.textContent = "";
    pending = Math.min(pending + 1, FEVER_CLICKS);
    if (fever.count + pending >= FEVER_CLICKS) {
      // 게이지가 찰 차례라면 기다리지 않고 바로 서버에 알립니다.
      clearTimeout(flushTimer);
      flushTimer = null;
      flush();
    } else {
      scheduleFlush();
    }
  }
  savePlayer();
  render();
  renderFever();
}

async function donate() {
  const L = leg;
  const ctx = ctxOf(journeyState());
  const kind = ctx.kind;
  const amount = walletOfKind(kind);
  if (busy || amount === 0) return;
  if (!backend) {
    els.status.textContent = "아직 서버에 연결되지 않았어요. 잠시 후 다시 눌러 주세요.";
    return;
  }

  busy = true;
  render();

  try {
    const added = await backend.add(kind, L, amount);
    addWalletKind(kind, -added);
    addMineKind(kind, added);
    player.donatedKrw += toKrw(kind, added); // 누적 기부액은 원으로 환산해서 모읍니다.
    savePlayer();
    els.status.textContent =
      added > 0
        ? `${won(added)}${UNIT_OBJ[kind]} 안이령에게 기부했어요. 고마워요!`
        : "이번 모금은 이미 목표 금액이 모두 모였어요.";
  } catch (e) {
    els.status.textContent = "기부하지 못했어요. 지갑의 돈은 그대로예요. 잠시 후 다시 시도해 주세요.";
  } finally {
    busy = false;
    render();
  }
}

els.earnBtn.addEventListener("click", earn);
els.donateBtn.addEventListener("click", donate);
els.guardBtn.addEventListener("click", onGuardConfirm);
els.mapBtn.addEventListener("click", openMap);
els.mapClose.addEventListener("click", () => els.mapDialog.close());
els.mapDialog.addEventListener("click", (e) => {
  if (e.target === els.mapDialog) els.mapDialog.close(); // 바깥(어두운 부분)을 누르면 닫힘
});

// 사진 2를 미리 내려받아 두어 바뀔 때 깜빡이지 않게 합니다.
new Image().src = PHOTO2;

// 계정과 내 데이터 준비 (이 기기에 저장된 코드가 없으면 새로 만듭니다)
accountCode = loadAccountCode();
try { localStorage.setItem(ACCOUNT_KEY, accountCode); } catch (e) { /* 무시 */ }
player = loadPlayerLocal();
sha256Hex(accountCode).then((h) => { publicId = h.slice(0, 24); });

wireUi();
loadGuard();
render();
renderFever();
renderJourney();
renderGuardInfo();
renderBuildInfo();
if (guard.flyUntil > Date.now()) startFlying(); // 새로고침해도 벌칙은 이어집니다.
requestAnimationFrame(journeyLoop);
setInterval(renderFever, 100);
setInterval(renderGuard, 50);
setInterval(renderGuardInfo, 500);
setInterval(renderPerks, 500);
setInterval(bankTick, 1000);
initBackend();
