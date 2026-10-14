import { firebaseConfig } from "./firebase-config.js";

// 목표 금액: 2026-10-14 기준 인천 → 뉴델리 편도(에어인디아 직항, 중급 항공사) 약 387,000원
// 항공권 가격이 바뀌면 아래 숫자와 firebase-rules.json 의 387000 을 함께 고쳐 주세요.
const GOAL = 387000;

// 피버타임: 접속한 모든 사람의 클릭이 하나의 게이지를 채웁니다.
// 100번이 모이면 모두에게 동시에 시작되고, 25초 동안 클릭 한 번이 1,000배(1,000원)입니다.
// 게이지 숫자를 바꾸면 firebase-rules.json 의 100 도 함께 고쳐 주세요.
const FEVER_CLICKS = 100;
const FEVER_MULT = 1000;
const FEVER_MS = 25000;
const FLUSH_MS = 300; // 클릭을 모아서 서버로 보내는 간격

const MY_KEY = "ahnireong-me";
const LOCAL_SHARED_KEY = "ahnireong-shared-local";
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
  plane: $("plane"),
  goalText: $("goalText"),
  ticket: document.querySelector(".ticket"),
  feverText: $("feverText"),
  feverFill: $("feverFill"),
};

// 내 지갑과 내가 기부한 돈은 이 브라우저에 저장하고,
// 다 같이 모은 돈(shared)과 피버타임(fever)은 서버에서 가져옵니다.
let me = { wallet: 0, mine: 0 };
let shared = 0;
let backend = null;
let busy = false;

let fever = { count: 0, endAt: 0 }; // 서버의 피버타임 상태 (endAt: 끝나는 시각, ms)
let serverOffset = 0;               // 내 시계와 서버 시계의 차이
let pending = 0;                    // 아직 서버로 보내지 않은 내 클릭 수
let flushing = false;
let flushTimer = null;
let wasInFever = false;

const clamp = (n) => Math.max(0, Math.min(Number(n) || 0, GOAL));
const clampCount = (n) => Math.max(0, Math.min(Math.floor(Number(n)) || 0, FEVER_CLICKS));
const won = (n) => n.toLocaleString("ko-KR");
const serverNow = () => Date.now() + serverOffset;
const isFever = () => serverNow() < fever.endAt;

function loadMe() {
  try {
    const saved = JSON.parse(localStorage.getItem(MY_KEY));
    if (saved) {
      // 지갑은 목표보다 클 수 있으므로 clamp를 쓰지 않습니다.
      const wallet = Number(saved.wallet);
      me = {
        wallet: Number.isFinite(wallet) && wallet > 0 ? Math.floor(wallet) : 0,
        mine: clamp(saved.mine),
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
  const ratio = Math.min(shared / GOAL, 1);
  const pct = ratio * 100;
  const remaining = Math.max(GOAL - shared, 0);

  els.wallet.textContent = won(me.wallet);
  els.mine.textContent = won(me.mine);
  els.donated.textContent = won(shared);
  els.remaining.textContent = won(remaining);
  els.percent.textContent = pct.toFixed(2);
  els.goalText.textContent = won(GOAL);

  els.trackDone.style.width = pct + "%";
  els.plane.style.left = `calc(${pct}% - ${pct * 0.34}px)`;
  els.track.setAttribute("aria-valuenow", pct.toFixed(2));

  els.donateBtn.disabled = busy || me.wallet === 0 || remaining === 0;

  const done = remaining === 0;
  els.ticket.classList.toggle("arrived", done);
  if (done) {
    els.status.textContent = "목표 달성! 모두의 도움으로 안이령이 뉴델리행 비행기에 탑승합니다.";
  }
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
      els.status.textContent = `피버타임 시작! 25초 동안 모두의 클릭이 ${won(FEVER_MULT)}배예요.`;
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
    els.feverText.textContent =
      `${shown} / ${FEVER_CLICKS}번 (모두의 클릭이 함께 채워요)`;
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
  } catch (e) {
    pending = Math.min(pending + n, FEVER_CLICKS);
    ok = false;
  }
  flushing = false;
  if (pending > 0) scheduleFlush(ok ? FLUSH_MS : 2000);
}

/* ---------- 저장소(백엔드) ---------- */

function setupLocalBackend(message) {
  try { shared = clamp(localStorage.getItem(LOCAL_SHARED_KEY)); } catch (e) { shared = 0; }
  try {
    const f = JSON.parse(localStorage.getItem(LOCAL_FEVER_KEY));
    if (f) fever = { count: clampCount(f.count), endAt: Number(f.endAt) || 0 };
  } catch (e) { /* 무시 */ }

  backend = {
    async add(amount) {
      const next = Math.min(shared + amount, GOAL);
      const added = next - shared;
      shared = next;
      try { localStorage.setItem(LOCAL_SHARED_KEY, String(shared)); } catch (e) { /* 무시 */ }
      return added;
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
    const feverRef = dbMod.ref(db, "fever");
    const failMsg = "공유 서버에 연결하지 못했어요. Firebase 설정과 규칙을 확인해 주세요.";

    // 내 시계와 서버 시계의 차이 (모두가 같은 시각에 피버타임이 끝나도록)
    dbMod.onValue(dbMod.ref(db, ".info/serverTimeOffset"), (snap) => {
      serverOffset = Number(snap.val()) || 0;
    });

    dbMod.onValue(
      donatedRef,
      (snap) => {
        shared = clamp(snap.val());
        setSync("실시간으로 모든 방문자와 함께 모으는 중이에요.");
        render();
      },
      () => setSync(failMsg)
    );

    dbMod.onValue(
      feverRef,
      (snap) => {
        const v = snap.val() || {};
        fever = { count: clampCount(v.count), endAt: Number(v.endAt) || 0 };
        renderFever();
      },
      () => setSync(failMsg)
    );

    backend = {
      // 서버에 안전하게 더하고, 실제로 더해진 금액을 돌려줍니다.
      async add(amount) {
        let added = 0;
        await dbMod.runTransaction(donatedRef, (current) => {
          const cur = clamp(current);
          const next = Math.min(cur + amount, GOAL);
          added = next - cur;
          return next;
        });
        return added;
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
        : "이미 목표 금액이 모두 모였어요.";
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

loadMe();
render();
renderFever();
setInterval(renderFever, 100);
initBackend();
