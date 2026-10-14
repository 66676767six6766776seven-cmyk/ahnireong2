import { firebaseConfig } from "./firebase-config.js";

// 목표 금액: 2026-10-14 기준 인천 → 뉴델리 편도(에어인디아 직항, 중급 항공사) 약 387,000원
const GOAL = 387000;

// 피버타임: 접속한 모든 사람의 클릭이 하나의 게이지를 채웁니다.
// 100번이 모이면 모두에게 동시에 시작되고, 25초 동안 클릭 한 번이 1,000배(1,000원)입니다.
// 게이지 숫자를 바꾸면 firebase-rules.json 의 100 도 함께 고쳐 주세요.
const FEVER_CLICKS = 100;
const FEVER_MULT = 1000;
const FEVER_MS = 25000;
const FLUSH_MS = 300; // 클릭을 모아서 서버로 보내는 간격

// 모금을 다 채운 뒤의 여행 (밀리초). 모든 방문자 화면에서 같은 순간에 같은 장면이 나옵니다.
const JOURNEY = {
  go: 8000,    // 홍성 → 뉴델리 (사진 1)
  stay: 4000,  // 뉴델리 도착 (사진 2)
  back: 8000,  // 뉴델리 → 홍성 (사진 2)
  home: 3000,  // 홍성 도착 (사진 1로 돌아옴) → 새 모금 시작
};
const JOURNEY_TOTAL = JOURNEY.go + JOURNEY.stay + JOURNEY.back + JOURNEY.home;
const PHOTO1 = "photo1.jpg";
const PHOTO2 = "photo2.jpg";

const MESSAGES = {
  funding: "",
  boarding: "목표 달성! 안이령이 비행기에 탑승했어요. 곧 출발합니다!",
  going: "안이령이 인도 뉴델리로 날아가는 중이에요…",
  arrived: "안이령이 무사히 인도로 도착했습니다",
  returning: "안이령이 충남 홍성으로 돌아가는 중이에요…",
  home: "안이령이 홍성에 무사히 돌아왔어요! 곧 새 모금이 시작돼요.",
  done: "안이령이 홍성에 무사히 돌아왔어요! 곧 새 모금이 시작돼요.",
};

const MY_KEY = "ahnireong-me";
const LOCAL_KEY = "ahnireong-local-v2";
const LOCAL_FEVER_KEY = "ahnireong-fever-local";

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
};

const reduceMotion =
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// 내 지갑과 내가 기부한 돈은 이 브라우저에 저장하고,
// 모금액·여행·피버타임은 서버에서 가져옵니다.
let me = { wallet: 0, mine: 0 };
let backend = null;
let busy = false;

// 모금액은 "누적 합계"로 저장합니다. 한 바퀴(round)마다 GOAL 만큼씩 늘어나고, 줄어드는 일이 없습니다.
let donatedTotal = 0;
let round = 0;
let trip = null; // { round, startAt } : 이번 바퀴의 여행이 시작된 시각
let tripStarting = false;
let advancing = false;

let fever = { count: 0, endAt: 0 };
let serverOffset = 0;
let pending = 0;
let flushing = false;
let flushTimer = null;
let wasInFever = false;
let feverFailed = false;

const clampCount = (n) => Math.max(0, Math.min(Math.floor(Number(n)) || 0, FEVER_CLICKS));
const nonNeg = (n) => Math.max(0, Math.floor(Number(n)) || 0);
const won = (n) => n.toLocaleString("ko-KR");
const serverNow = () => Date.now() + serverOffset;
const isFever = () => serverNow() < fever.endAt;

// 이번 바퀴에서 모인 돈 (0 ~ GOAL)
const getShared = () => Math.max(0, Math.min(donatedTotal - round * GOAL, GOAL));

function loadMe() {
  try {
    const saved = JSON.parse(localStorage.getItem(MY_KEY));
    if (saved) me = { wallet: nonNeg(saved.wallet), mine: nonNeg(saved.mine) };
  } catch (e) { /* 저장소를 쓸 수 없으면 새로 시작 */ }
}

function saveMe() {
  try { localStorage.setItem(MY_KEY, JSON.stringify(me)); } catch (e) { /* 무시 */ }
}

function setSync(text) {
  els.sync.textContent = text;
}

function render() {
  const shared = getShared();
  const pct = (shared / GOAL) * 100;
  const remaining = Math.max(GOAL - shared, 0);

  els.wallet.textContent = won(me.wallet);
  els.mine.textContent = won(me.mine);
  els.donated.textContent = won(shared);
  els.remaining.textContent = won(remaining);
  els.percent.textContent = pct.toFixed(2);
  els.goalText.textContent = won(GOAL);

  els.trackDone.style.width = pct + "%";
  els.track.setAttribute("aria-valuenow", pct.toFixed(2));

  els.donateBtn.disabled = busy || me.wallet === 0 || remaining === 0;
  els.ticket.classList.toggle("arrived", remaining === 0);
}

/* ---------- 여행 (모금 완료 후) ---------- */

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// 지금 어떤 장면인지 계산합니다. p: 0 = 홍성, 1 = 뉴델리
function journeyState() {
  if (!(trip && trip.round === round)) {
    return getShared() >= GOAL ? { phase: "boarding", p: 0 } : { phase: "funding", p: 0 };
  }
  const e = Math.max(serverNow() - trip.startAt, 0);
  const J = JOURNEY;
  if (e < J.go) return { phase: "going", p: ease(e / J.go) };
  if (e < J.go + J.stay) return { phase: "arrived", p: 1 };
  if (e < J.go + J.stay + J.back) {
    return { phase: "returning", p: 1 - ease((e - J.go - J.stay) / J.back) };
  }
  if (e < JOURNEY_TOTAL) return { phase: "home", p: 0 };
  return { phase: "done", p: 0 };
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

let lastPhase = "";
function renderJourney() {
  const { phase, p } = journeyState();

  els.craft.style.setProperty("--p", reduceMotion ? (p >= 0.5 ? 1 : 0) : p);
  els.craft.classList.toggle("back", phase === "returning");
  setPhoto(phase === "arrived" || phase === "returning" ? 2 : 1);

  if (phase !== lastPhase) {
    lastPhase = phase;
    els.journeyMsg.textContent = MESSAGES[phase] || "";
    els.journeyMsg.dataset.phase = phase;
  }

  // 여행 시작과 새 모금 시작은 누군가 한 명이 서버에 기록해 주면 모두에게 반영됩니다.
  if (!backend) return;
  if (phase === "boarding" && !tripStarting) {
    tripStarting = true;
    backend.startTrip(round).catch(() => {}).finally(() => {
      setTimeout(() => { tripStarting = false; }, 1500);
    });
  }
  if (phase === "done" && !advancing) {
    advancing = true;
    backend.nextRound(round).catch(() => {}).finally(() => {
      setTimeout(() => { advancing = false; }, 1500);
    });
  }
}

function journeyLoop() {
  renderJourney();
  requestAnimationFrame(journeyLoop);
}

/* ---------- 피버타임 ---------- */

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
    els.earnBtn.textContent = `${won(FEVER_MULT)}원 벌기`;
  } else {
    const shown = Math.min(fever.count + pending, FEVER_CLICKS);
    els.feverFill.style.width = (shown / FEVER_CLICKS) * 100 + "%";
    els.feverText.textContent = feverFailed
      ? `${shown} / ${FEVER_CLICKS}번 (서버에 저장되지 않고 있어요. Firebase 규칙을 확인해 주세요)`
      : `${shown} / ${FEVER_CLICKS}번 (모두의 클릭이 함께 채워요)`;
    els.earnBtn.textContent = "1원 벌기";
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

/* ---------- 저장소(백엔드) ---------- */

function setupLocalBackend(message) {
  try {
    const s = JSON.parse(localStorage.getItem(LOCAL_KEY));
    if (s) {
      donatedTotal = nonNeg(s.donatedTotal);
      round = nonNeg(s.round);
      trip = s.trip && Number.isFinite(s.trip.startAt)
        ? { round: nonNeg(s.trip.round), startAt: Number(s.trip.startAt) }
        : null;
    }
  } catch (e) { /* 무시 */ }
  try {
    const f = JSON.parse(localStorage.getItem(LOCAL_FEVER_KEY));
    if (f) fever = { count: clampCount(f.count), endAt: Number(f.endAt) || 0 };
  } catch (e) { /* 무시 */ }

  const saveLocal = () => {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ donatedTotal, round, trip })); } catch (e) { /* 무시 */ }
  };

  backend = {
    async add(amount) {
      const cap = (round + 1) * GOAL;
      const next = Math.max(donatedTotal, Math.min(donatedTotal + amount, cap));
      const added = next - donatedTotal;
      donatedTotal = next;
      saveLocal();
      return added;
    },
    async startTrip(r) {
      if (!(trip && trip.round === r)) {
        trip = { round: r, startAt: Date.now() };
        saveLocal();
      }
    },
    async nextRound(r) {
      if (round === r) {
        round = r + 1;
        saveLocal();
        render();
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
    const donatedRef = dbMod.ref(db, "donated");
    const roundRef = dbMod.ref(db, "round");
    const tripRef = dbMod.ref(db, "trip");
    const feverRef = dbMod.ref(db, "fever");
    const failMsg = "공유 서버에 연결하지 못했어요. Firebase 설정과 규칙을 확인해 주세요.";

    // 내 시계와 서버 시계의 차이 (모두가 같은 시각에 같은 장면을 보도록)
    dbMod.onValue(dbMod.ref(db, ".info/serverTimeOffset"), (snap) => {
      serverOffset = Number(snap.val()) || 0;
    });

    dbMod.onValue(
      donatedRef,
      (snap) => {
        donatedTotal = nonNeg(snap.val());
        setSync("실시간으로 모든 방문자와 함께 모으는 중이에요.");
        render();
      },
      () => setSync(failMsg)
    );

    dbMod.onValue(
      roundRef,
      (snap) => {
        round = nonNeg(snap.val());
        render();
      },
      () => setSync(failMsg)
    );

    dbMod.onValue(
      tripRef,
      (snap) => {
        const v = snap.val();
        trip = v && Number.isFinite(Number(v.startAt))
          ? { round: nonNeg(v.round), startAt: Number(v.startAt) }
          : null;
      },
      () => setSync(failMsg)
    );

    dbMod.onValue(
      feverRef,
      (snap) => {
        const v = snap.val() || {};
        fever = { count: clampCount(v.count), endAt: Number(v.endAt) || 0 };
        feverFailed = false;
        renderFever();
      },
      (err) => {
        console.error("피버타임 읽기 실패:", err);
        feverFailed = true;
        renderFever();
      }
    );

    backend = {
      // 이번 바퀴의 목표까지만 안전하게 더하고, 실제로 더해진 금액을 돌려줍니다.
      async add(amount) {
        let added = 0;
        const cap = (round + 1) * GOAL;
        await dbMod.runTransaction(donatedRef, (current) => {
          const cur = nonNeg(current);
          const next = Math.max(cur, Math.min(cur + amount, cap));
          added = next - cur;
          return next;
        });
        return added;
      },
      // 이번 바퀴의 여행을 시작합니다. 이미 시작됐다면 그대로 둡니다.
      async startTrip(r) {
        await dbMod.runTransaction(tripRef, (cur) =>
          cur && Number(cur.round) === r ? cur : { round: r, startAt: serverNow() }
        );
      },
      // 여행이 끝나면 다음 바퀴로 넘어가 모금액이 0에서 다시 시작됩니다.
      async nextRound(r) {
        await dbMod.runTransaction(roundRef, (cur) => {
          const c = nonNeg(cur);
          return c === r ? r + 1 : c;
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

/* ---------- 버튼 ---------- */

function earn() {
  if (isFever()) {
    me.wallet += 1 * FEVER_MULT;
  } else {
    me.wallet += 1;
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
  if (busy || me.wallet === 0) return;
  if (!backend) {
    els.status.textContent = "아직 서버에 연결되지 않았어요. 잠시 후 다시 눌러 주세요.";
    return;
  }

  busy = true;
  render();
  const amount = me.wallet;

  try {
    const added = await backend.add(amount);
    me.wallet -= added;
    me.mine += added;
    saveMe();
    els.status.textContent =
      added > 0
        ? `${won(added)}원을 안이령에게 기부했어요. 고마워요!`
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
    "내 지갑과 내 기부 기록만 지워져요. 다 같이 모은 돈은 그대로 남아요. 계속할까요?"
  );
  if (!ok) return;
  me = { wallet: 0, mine: 0 };
  els.status.textContent = "";
  saveMe();
  render();
}

els.earnBtn.addEventListener("click", earn);
els.donateBtn.addEventListener("click", donate);
els.resetBtn.addEventListener("click", resetMine);

// 사진 2를 미리 내려받아 두어 바뀔 때 깜빡이지 않게 합니다.
new Image().src = PHOTO2;

loadMe();
render();
renderFever();
renderJourney();
requestAnimationFrame(journeyLoop);
setInterval(renderFever, 100);
initBackend();
