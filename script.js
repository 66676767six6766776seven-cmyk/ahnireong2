import { firebaseConfig } from "./firebase-config.js";

// 목표 금액: 2026-10-14 기준 인천 → 뉴델리 편도(에어인디아 직항, 중급 항공사) 약 387,000원
// 항공권 가격이 바뀌면 아래 숫자와 firebase-rules.json 의 387000 을 함께 고쳐 주세요.
const GOAL = 387000;

// 피버타임: 100번 클릭하면 시작, 25초 동안 클릭 한 번이 1,000배(1,000원)
const FEVER_CLICKS = 100;
const FEVER_MULT = 1000;
const FEVER_MS = 25000;

const MY_KEY = "ahnireong-me";
const LOCAL_SHARED_KEY = "ahnireong-shared-local";

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
// 다 같이 모은 돈(shared)은 서버에서 가져옵니다.
let me = { wallet: 0, mine: 0, fever: 0 };
let shared = 0;
let backend = null;
let busy = false;

// 피버타임 상태 (새로고침하면 진행 중인 피버타임은 사라집니다)
let inFever = false;
let feverEnd = 0;
let feverTimer = null;

const clamp = (n) => Math.max(0, Math.min(Number(n) || 0, GOAL));
const won = (n) => n.toLocaleString("ko-KR");

function loadMe() {
  try {
    const saved = JSON.parse(localStorage.getItem(MY_KEY));
    if (saved) {
      // 지갑은 목표보다 클 수 있으므로 clamp를 쓰지 않습니다.
      const wallet = Number(saved.wallet);
      me = {
        wallet: Number.isFinite(wallet) && wallet > 0 ? Math.floor(wallet) : 0,
        mine: clamp(saved.mine),
        fever: Math.min(Math.max(Math.floor(Number(saved.fever)) || 0, 0), FEVER_CLICKS - 1),
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

/* ---------- 저장소(백엔드) ---------- */

function setupLocalBackend(message) {
  try { shared = clamp(localStorage.getItem(LOCAL_SHARED_KEY)); } catch (e) { shared = 0; }
  backend = {
    async add(amount) {
      const next = Math.min(shared + amount, GOAL);
      const added = next - shared;
      shared = next;
      try { localStorage.setItem(LOCAL_SHARED_KEY, String(shared)); } catch (e) { /* 무시 */ }
      return added;
    },
  };
  setSync(message);
  render();
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

    dbMod.onValue(
      donatedRef,
      (snap) => {
        shared = clamp(snap.val());
        setSync("실시간으로 모든 방문자와 함께 모으는 중이에요.");
        render();
      },
      () => setSync("공유 서버에 연결하지 못했어요. Firebase 설정과 규칙을 확인해 주세요.")
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
    };
  } catch (e) {
    setSync("공유 서버를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.");
  }
}

/* ---------- 버튼 ---------- */

function renderFever() {
  els.ticket.classList.toggle("fever-on", inFever);

  if (inFever) {
    const left = Math.max(feverEnd - Date.now(), 0);
    els.feverFill.style.width = (left / FEVER_MS) * 100 + "%";
    els.feverText.textContent =
      `피버타임! 클릭 ×${won(FEVER_MULT)}배 (남은 시간 ${(left / 1000).toFixed(1)}초)`;
    els.earnBtn.textContent = `${won(FEVER_MULT)}원 벌기`;
  } else {
    els.feverFill.style.width = (me.fever / FEVER_CLICKS) * 100 + "%";
    els.feverText.textContent =
      `${me.fever} / ${FEVER_CLICKS}번 클릭하면 피버타임이 시작돼요`;
    els.earnBtn.textContent = "1원 벌기";
  }
}

function startFever() {
  inFever = true;
  feverEnd = Date.now() + FEVER_MS;
  me.fever = 0;
  clearInterval(feverTimer);
  feverTimer = setInterval(() => {
    if (Date.now() >= feverEnd) {
      endFever();
    } else {
      renderFever();
    }
  }, 100);
}

function endFever() {
  inFever = false;
  clearInterval(feverTimer);
  feverTimer = null;
  els.status.textContent = "피버타임이 끝났어요. 다시 100번을 채워 보세요!";
  renderFever();
}

function earn() {
  if (inFever) {
    me.wallet += 1 * FEVER_MULT;
  } else {
    me.wallet += 1;
    me.fever += 1;
    els.status.textContent = "";
    if (me.fever >= FEVER_CLICKS) startFever();
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
  me = { wallet: 0, mine: 0, fever: 0 };
  if (inFever) endFever();
  els.status.textContent = "";
  saveMe();
  render();
  renderFever();
}

els.earnBtn.addEventListener("click", earn);
els.donateBtn.addEventListener("click", donate);
els.resetBtn.addEventListener("click", resetMine);

loadMe();
render();
renderFever();
initBackend();
