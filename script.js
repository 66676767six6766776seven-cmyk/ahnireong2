import { firebaseConfig } from "./firebase-config.js";

/* =====================================================================
   설정값 (숫자만 바꾸면 됩니다)
   ===================================================================== */

// 한국 구간 목표: 인천 → 뉴델리, 중급 항공사(에어인디아 직항) 편도 약 387,000원 (2026-10-14 기준)
const GOAL_KRW = 387000;
// 인도 구간 목표: 뉴델리 → 인천, 최고급 항공사(대한항공 직항) 편도 약 52,400루피 (2026-10-15 기준)
const GOAL_INR = 52400;

// 피버타임: 접속한 모든 사람의 클릭이 하나의 게이지를 채웁니다. (한국·인도 공통)
// 300번이 모이면 모두에게 동시에 시작되고, 5초 동안 클릭 한 번이 100배입니다.
// 게이지 숫자를 바꾸면 firebase-rules.json 의 300 도 함께 고쳐 주세요.
const FEVER_CLICKS = 300;
const FEVER_MULT = 100;
const FEVER_MS = 5000;
const FLUSH_MS = 300; // 클릭을 모아서 서버로 보내는 간격

// 비행 (밀리초). 모든 방문자 화면에서 같은 순간에 같은 장면이 나옵니다.
const JOURNEY = {
  fly: 8000,  // 비행 시간
  land: 4000, // 도착 메시지를 보여 주는 시간
};
const PHOTO1 = "photo1.jpg"; // 한국에 있을 때
const PHOTO2 = "photo2.jpg"; // 인도에 있을 때

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
};

const MY_KEY = "ahnireong-me";
const GUARD_KEY = "ahnireong-guard";
const LOCAL_KEY = "ahnireong-local-v3";
const LOCAL_FEVER_KEY = "ahnireong-fever-local-v3";

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
  resetBtn: $("resetBtn"),
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
  mapShadow: $("mapShadow"),
  mapBase: $("mapBase"),
  mapDone: $("mapDone"),
  mapPin: $("mapPin"),
  mapFlag: $("mapFlag"),
  mapPlane: $("mapPlane"),
  mapWhere: $("mapWhere"),
  mapProgress: $("mapProgress"),
};

const reduceMotion =
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* =====================================================================
   상태
   ===================================================================== */

// 내 지갑과 내가 기부한 돈은 이 브라우저에 저장하고, 나머지는 서버(모두 공유)에서 가져옵니다.
let me = { walletKrw: 0, walletInr: 0, mineKrw: 0, mineInr: 0 };
let backend = null;
let busy = false;

// 한 "구간(leg)"이 끝날 때마다 leg 가 1씩 늘어납니다.
//   leg 0: 한국에서 원으로 모금 → 인도행 비행
//   leg 1: 인도에서 루피로 모금 → 한국행 비행
//   leg 2: 다시 한국에서 원으로 모금 ... (반복)
// 모금액은 통화별 "누적 합계"로 저장해서 줄어드는 일이 없습니다.
let donated = { krw: 0, inr: 0 };
let leg = 0;
let trip = null; // { leg, startAt } : 이번 구간의 비행이 시작된 시각
let tripStarting = false;
let advancing = false;

let fever = { count: 0, endAt: 0 };
let serverOffset = 0;
let pending = 0;
let flushing = false;
let flushTimer = null;
let wasInFever = false;
let feverFailed = false;

const goalOfLeg = (l) => (l % 2 === 0 ? GOAL_KRW : GOAL_INR);
const unitOfLeg = (l) => (l % 2 === 0 ? "원" : "루피");
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

const walletOf = (l) => (l % 2 === 0 ? me.walletKrw : me.walletInr);
function addWallet(l, n) {
  if (l % 2 === 0) me.walletKrw += n; else me.walletInr += n;
}

function loadMe() {
  try {
    const s = JSON.parse(localStorage.getItem(MY_KEY));
    if (s) {
      me = {
        walletKrw: nonNeg(s.walletKrw !== undefined ? s.walletKrw : s.wallet), // 예전 저장값도 이어받음
        walletInr: nonNeg(s.walletInr),
        mineKrw: nonNeg(s.mineKrw !== undefined ? s.mineKrw : s.mine),
        mineInr: nonNeg(s.mineInr),
      };
    }
  } catch (e) { /* 저장소를 쓸 수 없으면 새로 시작 */ }
}

function saveMe() {
  try { localStorage.setItem(MY_KEY, JSON.stringify(me)); } catch (e) { /* 무시 */ }
}

function setSync(text) {
  els.sync.textContent = text;
}

function render() {
  const inIndia = leg % 2 === 1;
  const unit = unitOfLeg(leg);
  const goal = goalOfLeg(leg);
  const shared = getShared();
  const pct = (shared / goal) * 100;
  const remaining = Math.max(goal - shared, 0);
  const wallet = inIndia ? me.walletInr : me.walletKrw;
  const mine = inIndia ? me.mineInr : me.mineKrw;

  els.wallet.textContent = won(wallet);
  els.mine.textContent = won(mine);
  els.donated.textContent = won(shared);
  els.remaining.textContent = won(remaining);
  els.percent.textContent = pct.toFixed(2);
  els.goalText.textContent = won(goal);
  els.units.forEach((u) => { u.textContent = unit; });

  // 모금 진행선은 출발지 쪽에서 자라납니다 (한국: 왼쪽 → 오른쪽, 인도: 오른쪽 → 왼쪽)
  els.trackDone.style.width = pct + "%";
  els.trackDone.style.left = inIndia ? "auto" : "0";
  els.trackDone.style.right = inIndia ? "0" : "auto";
  els.track.setAttribute("aria-valuenow", pct.toFixed(2));

  els.donateBtn.disabled = busy || wallet === 0 || remaining === 0;
  els.ticket.classList.toggle("arrived", remaining === 0);
  els.ticket.classList.toggle("in-india", inIndia);
}

/* =====================================================================
   비행 (모금 완료 후)
   ===================================================================== */

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// 지금 어떤 장면인지 계산합니다. p: 0 = 한국(홍성), 1 = 인도(뉴델리)
function journeyState() {
  const origin = leg % 2 === 0 ? 0 : 1;
  const dest = 1 - origin;
  if (!(trip && trip.leg === leg)) {
    return getShared() >= goalOfLeg(leg)
      ? { phase: "boarding", p: origin }
      : { phase: "funding", p: origin };
  }
  const e = Math.max(serverNow() - trip.startAt, 0);
  if (e < JOURNEY.fly) return { phase: "flying", p: origin + (dest - origin) * ease(e / JOURNEY.fly) };
  if (e < JOURNEY.fly + JOURNEY.land) return { phase: "landed", p: dest };
  return { phase: "done", p: dest };
}

function messageFor(phase) {
  const toIndia = leg % 2 === 0;
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
  const { phase, p } = journeyState();
  const arrivedPhase = phase === "landed" || phase === "done";
  const originPhoto = leg % 2 === 0 ? 1 : 2;
  const destPhoto = 3 - originPhoto;

  els.craft.style.setProperty("--p", reduceMotion ? (p >= 0.5 ? 1 : 0) : p);
  els.craft.classList.toggle("back", leg % 2 === 1); // 한국행일 때는 왼쪽을 바라봄
  setPhoto(arrivedPhase ? destPhoto : originPhoto);

  const key = phase + ":" + leg;
  if (key !== lastKey) {
    lastKey = key;
    els.journeyMsg.textContent = messageFor(phase);
    els.journeyMsg.dataset.phase = arrivedPhase ? "arrived" : phase;
  }

  // 비행 시작과 다음 구간 시작은 누군가 한 명이 서버에 기록해 주면 모두에게 반영됩니다.
  if (!backend) return;
  if (phase === "boarding" && !tripStarting) {
    tripStarting = true;
    backend.startTrip(leg).catch(() => {}).finally(() => {
      setTimeout(() => { tripStarting = false; }, 1500);
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
  const unit = unitOfLeg(leg);

  if (active !== wasInFever) {
    wasInFever = active;
    if (active) {
      pending = 0;
      els.status.textContent = `피버타임 시작! ${FEVER_MS / 1000}초 동안 모두의 클릭이 ${won(FEVER_MULT)}배예요.`;
    } else {
      els.status.textContent = `피버타임이 끝났어요. 다시 ${FEVER_CLICKS}번을 모두 함께 채워 보세요!`;
    }
  }

  els.ticket.classList.toggle("fever-on", active);

  if (active) {
    const left = Math.min(Math.max(fever.endAt - now, 0), FEVER_MS);
    els.feverFill.style.width = (left / FEVER_MS) * 100 + "%";
    els.feverText.textContent =
      `피버타임! 클릭 ×${won(FEVER_MULT)}배 (남은 시간 ${(left / 1000).toFixed(1)}초)`;
    els.earnBtn.textContent = `${won(FEVER_MULT)}${unit} 벌기`;
  } else {
    const shown = Math.min(fever.count + pending, FEVER_CLICKS);
    els.feverFill.style.width = (shown / FEVER_CLICKS) * 100 + "%";
    els.feverText.textContent = feverFailed
      ? `${shown} / ${FEVER_CLICKS}번 (서버에 저장되지 않고 있어요. Firebase 규칙을 확인해 주세요)`
      : `${shown} / ${FEVER_CLICKS}번 (모두의 클릭이 함께 채워요)`;
    els.earnBtn.textContent = `1${unit} 벌기`;
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
   지도
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

let mapDoneD = "";
function renderMap() {
  const { phase, p } = journeyState();
  const toIndia = leg % 2 === 0;
  const origin = toIndia ? 0 : 1;
  const goal = goalOfLeg(leg);
  const unit = unitOfLeg(leg);
  const shared = getShared();
  const funding = phase === "funding" || phase === "boarding";
  const flying = phase === "flying";
  const frac = funding ? shared / goal : Math.abs(p - origin); // 출발지에서 목적지 방향으로 얼마나 왔는지

  // 한국 ↔ 인도를 잇는 비행선과 진행도
  els.mapShadow.setAttribute("d", MAP_FWD);
  els.mapBase.setAttribute("d", MAP_FWD);
  const doneD = toIndia ? MAP_FWD : MAP_REV;
  if (doneD !== mapDoneD) { els.mapDone.setAttribute("d", doneD); mapDoneD = doneD; }
  els.mapDone.style.strokeDasharray = `${frac.toFixed(4)} 2`;

  // 빨간 점(현재 위치), 깃발(머무는 도시), 비행기(비행 중)
  const pos = mapPointAt(p);
  els.mapPin.setAttribute("transform", `translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)})`);
  els.mapFlag.style.display = flying ? "none" : "";
  els.mapPlane.setAttribute("visibility", flying ? "visible" : "hidden");
  if (flying) {
    const a = mapPointAt(p - 0.01), b = mapPointAt(p + 0.01);
    const dx = toIndia ? b.x - a.x : a.x - b.x;
    const dy = toIndia ? b.y - a.y : a.y - b.y;
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    els.mapPlane.setAttribute("transform", `translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)}) rotate(${deg.toFixed(1)})`);
  }

  // 글
  if (flying) {
    els.mapWhere.textContent = toIndia
      ? "비행 중: 내포신도시 → 인도 뉴델리"
      : "비행 중: 인도 뉴델리 → 내포신도시";
    els.mapProgress.textContent = `비행 진행도 ${(frac * 100).toFixed(0)}%`;
  } else {
    els.mapWhere.textContent = p < 0.5
      ? "현재 위치: 대한민국 충청남도 홍성군 내포신도시"
      : "현재 위치: 인도 뉴델리";
    els.mapProgress.textContent = funding
      ? `${toIndia ? "인도행" : "한국행"} 비행기 값 모금 ${(frac * 100).toFixed(1)}% (${won(shared)} / ${won(goal)}${unit})`
      : "무사히 도착했어요! 비행 진행도 100%";
  }
}

function openMap() {
  renderMap();
  if (typeof els.mapDialog.showModal === "function") els.mapDialog.showModal();
  else els.mapDialog.setAttribute("open", "");
}

/* =====================================================================
   저장소(백엔드)
   ===================================================================== */

function setupLocalBackend(message) {
  try {
    const s = JSON.parse(localStorage.getItem(LOCAL_KEY));
    if (s) {
      donated = { krw: nonNeg(s.krw), inr: nonNeg(s.inr) };
      leg = nonNeg(s.leg);
      trip = s.trip && Number.isFinite(Number(s.trip.startAt))
        ? { leg: nonNeg(s.trip.leg), startAt: Number(s.trip.startAt) }
        : null;
    }
  } catch (e) { /* 무시 */ }
  try {
    const f = JSON.parse(localStorage.getItem(LOCAL_FEVER_KEY));
    if (f) fever = { count: clampCount(f.count), endAt: Number(f.endAt) || 0 };
  } catch (e) { /* 무시 */ }

  const saveLocal = () => {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ krw: donated.krw, inr: donated.inr, leg, trip }));
    } catch (e) { /* 무시 */ }
  };

  backend = {
    async add(l, amount) {
      const cap = baseOfLeg(l) + goalOfLeg(l);
      const key = l % 2 === 0 ? "krw" : "inr";
      const cur = donated[key];
      const next = Math.max(cur, Math.min(cur + amount, cap));
      donated[key] = next;
      saveLocal();
      return next - cur;
    },
    async startTrip(l) {
      if (!(trip && trip.leg === l)) {
        trip = { leg: l, startAt: Date.now() };
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
    const legRef = dbMod.ref(db, "v2/leg");
    const tripRef = dbMod.ref(db, "v2/trip");
    const feverRef = dbMod.ref(db, "v2/fever");
    const failMsg = "공유 서버에 연결하지 못했어요. Firebase 설정과 규칙을 확인해 주세요.";

    // 내 시계와 서버 시계의 차이 (모두가 같은 시각에 같은 장면을 보도록)
    dbMod.onValue(dbMod.ref(db, ".info/serverTimeOffset"), (snap) => {
      serverOffset = Number(snap.val()) || 0;
    });

    dbMod.onValue(krwRef, (snap) => {
      donated.krw = nonNeg(snap.val());
      setSync("실시간으로 모든 방문자와 함께 모으는 중이에요.");
      render();
    }, () => setSync(failMsg));

    dbMod.onValue(inrRef, (snap) => {
      donated.inr = nonNeg(snap.val());
      render();
    }, () => setSync(failMsg));

    dbMod.onValue(legRef, (snap) => {
      leg = nonNeg(snap.val());
      render();
      renderFever();
    }, () => setSync(failMsg));

    dbMod.onValue(tripRef, (snap) => {
      const v = snap.val();
      trip = v && Number.isFinite(Number(v.startAt))
        ? { leg: nonNeg(v.leg), startAt: Number(v.startAt) }
        : null;
    }, () => setSync(failMsg));

    dbMod.onValue(feverRef, (snap) => {
      const v = snap.val() || {};
      fever = { count: clampCount(v.count), endAt: Number(v.endAt) || 0 };
      feverFailed = false;
      renderFever();
    }, (err) => {
      console.error("피버타임 읽기 실패:", err);
      feverFailed = true;
      renderFever();
    });

    backend = {
      // 이번 구간의 목표까지만 안전하게 더하고, 실제로 더해진 금액을 돌려줍니다.
      async add(l, amount) {
        let added = 0;
        const cap = baseOfLeg(l) + goalOfLeg(l);
        await dbMod.runTransaction(l % 2 === 0 ? krwRef : inrRef, (current) => {
          const cur = nonNeg(current);
          const next = Math.max(cur, Math.min(cur + amount, cap));
          added = next - cur;
          return next;
        });
        return added;
      },
      // 이번 구간의 비행을 시작합니다. 이미 시작됐다면 그대로 둡니다.
      async startTrip(l) {
        await dbMod.runTransaction(tripRef, (cur) =>
          cur && Number(cur.leg) === l ? cur : { leg: l, startAt: serverNow() }
        );
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
  } catch (e) {
    setSync("공유 서버를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.");
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

  if (isFever()) {
    addWallet(leg, FEVER_MULT);
  } else {
    addWallet(leg, 1);
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
  saveMe();
  render();
  renderFever();
}

async function donate() {
  const L = leg;
  const amount = walletOf(L);
  if (busy || amount === 0) return;
  if (!backend) {
    els.status.textContent = "아직 서버에 연결되지 않았어요. 잠시 후 다시 눌러 주세요.";
    return;
  }

  busy = true;
  render();

  try {
    const added = await backend.add(L, amount);
    addWallet(L, -added);
    if (L % 2 === 0) me.mineKrw += added; else me.mineInr += added;
    saveMe();
    els.status.textContent =
      added > 0
        ? `${won(added)}${unitOfLeg(L)}을(를) 안이령에게 기부했어요. 고마워요!`
        : "이번 모금은 이미 목표 금액이 모두 모였어요.";
  } catch (e) {
    els.status.textContent = "기부하지 못했어요. 지갑의 돈은 그대로예요. 잠시 후 다시 시도해 주세요.";
  } finally {
    busy = false;
    render();
  }
}

function resetMine() {
  const ok = window.confirm(
    "내 지갑과 내 기부 기록(원·루피)만 지워져요. 다 같이 모은 돈은 그대로 남아요. 계속할까요?"
  );
  if (!ok) return;
  me = { walletKrw: 0, walletInr: 0, mineKrw: 0, mineInr: 0 };
  els.status.textContent = "";
  saveMe();
  render();
}

els.earnBtn.addEventListener("click", earn);
els.donateBtn.addEventListener("click", donate);
els.resetBtn.addEventListener("click", resetMine);
els.guardBtn.addEventListener("click", onGuardConfirm);
els.mapBtn.addEventListener("click", openMap);
els.mapClose.addEventListener("click", () => els.mapDialog.close());
els.mapDialog.addEventListener("click", (e) => {
  if (e.target === els.mapDialog) els.mapDialog.close(); // 바깥(어두운 부분)을 누르면 닫힘
});

// 사진 2를 미리 내려받아 두어 바뀔 때 깜빡이지 않게 합니다.
new Image().src = PHOTO2;

loadMe();
loadGuard();
render();
renderFever();
renderJourney();
renderGuardInfo();
if (guard.flyUntil > Date.now()) startFlying(); // 새로고침해도 벌칙은 이어집니다.
requestAnimationFrame(journeyLoop);
setInterval(renderFever, 100);
setInterval(renderGuard, 50);
setInterval(renderGuardInfo, 500);
initBackend();
