const STORAGE_KEY = "leisurely-app-v4";
const DEFAULT_COLOR = "#3b82f6";
const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"users":[],"session":null}');
const page = document.body.dataset.page;

const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
const uid = () => crypto.randomUUID();
const esc = (v) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const todayISO = () => new Date().toISOString().slice(0, 10);
const byEmail = (e) => state.users.find((u) => u.email === String(e || "").trim().toLowerCase()) || null;
const me = () => byEmail(state.session);
const go = (path) => { window.location.href = path; };
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function saveSafe() {
    try {
        save();
        return true;
    } catch {
        return false;
    }
}

function applyTheme() {
    const user = me();
    const authOnlyPages = new Set(["dashboard", "profile", "settings", "rooms"]);
    if (!user || !authOnlyPages.has(page)) {
        document.documentElement.classList.remove("dark");
        document.body.classList.remove("dark");
        document.documentElement.style.setProperty("--accent", DEFAULT_COLOR);
        return;
    }
    const isDark = (user?.settings?.theme || "light") === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    document.body.classList.toggle("dark", isDark);
    document.documentElement.style.setProperty("--accent", user?.settings?.accent || DEFAULT_COLOR);
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
    });
}

async function imageFileToOptimizedDataUrl(file) {
    const raw = await fileToDataUrl(file);
    const img = new Image();
    img.src = raw;
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
    });
    const max = 320;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return raw;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.82);
}

function requireAuth() {
    if (!me()) go("./login.html");
}

function sendResetEmail(email, code) {
    const endpoint = localStorage.getItem("LEISURELY_EMAIL_ENDPOINT") || "";
    if (!endpoint) return false;
    fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: email, subject: "Leisurely Password Reset", text: `Your reset code is ${code}` })
    }).catch(() => {});
    return true;
}

function wireSignup() {
    const form = document.getElementById("signupForm");
    const msg = document.getElementById("msg");
    form.onsubmit = async (e) => {
        e.preventDefault();
        const d = new FormData(form);
        const email = String(d.get("email")).trim().toLowerCase();
        if (byEmail(email)) return void (msg.innerHTML = `<span class="danger">Email already exists.</span>`);
        const photoFile = d.get("photoFile");
        const photoData = photoFile instanceof File && photoFile.size > 0 ? await imageFileToOptimizedDataUrl(photoFile) : "";
        state.users.push({
            id: uid(),
            email,
            password: String(d.get("password")),
            profile: { displayName: String(d.get("displayName")).trim(), photoUrl: photoData },
            personalization: {
                style: String(d.get("style")),
                bestTime: String(d.get("bestTime")),
                interests: String(d.get("interests")).split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)
            },
            settings: { theme: "light", accent: DEFAULT_COLOR },
            friends: [],
            rooms: [],
            tasks: [{ id: uid(), title: "Plan your day", date: todayISO(), start: "09:00", end: "10:00", roomId: "", status: "planned" }],
            passwordReset: null
        });
        state.session = email;
        if (!saveSafe()) return void (msg.innerHTML = `<span class="danger">Image too large to save. Try a smaller photo.</span>`);
        go("./dashboard.html");
    };
}

function wireLogin() {
    const form = document.getElementById("loginForm");
    const msg = document.getElementById("msg");
    form.onsubmit = (e) => {
        e.preventDefault();
        const d = new FormData(form);
        const user = byEmail(d.get("email"));
        if (!user || user.password !== String(d.get("password"))) return void (msg.innerHTML = `<span class="danger">Invalid email or password.</span>`);
        state.session = user.email;
        save();
        go("./dashboard.html");
    };
}

function wireForgotPassword() {
    const sendForm = document.getElementById("sendForm");
    const resetForm = document.getElementById("resetForm");
    const msg = document.getElementById("msg");
    sendForm.onsubmit = (e) => {
        e.preventDefault();
        const email = String(new FormData(sendForm).get("email")).trim().toLowerCase();
        const user = byEmail(email);
        if (!user) return void (msg.innerHTML = `<span class="danger">No account found.</span>`);
        const code = String(Math.floor(100000 + Math.random() * 900000));
        user.passwordReset = { code, at: Date.now() };
        save();
        msg.innerHTML = sendResetEmail(email, code) ? `<span class="ok">Reset email sent.</span>` : `<span class="danger">Set LEISURELY_EMAIL_ENDPOINT. Temporary code: <strong>${code}</strong></span>`;
    };
    resetForm.onsubmit = (e) => {
        e.preventDefault();
        const d = new FormData(resetForm);
        const email = String(d.get("email")).trim().toLowerCase();
        const code = String(d.get("code")).trim();
        const pass = String(d.get("password")).trim();
        const user = byEmail(email);
        if (!user || !user.passwordReset || user.passwordReset.code !== code) return void (msg.innerHTML = `<span class="danger">Invalid reset code.</span>`);
        if (pass.length < 6) return void (msg.innerHTML = `<span class="danger">Password must be at least 6 characters.</span>`);
        user.password = pass;
        user.passwordReset = null;
        save();
        msg.innerHTML = `<span class="ok">Password reset complete. <a href="./login.html">Log in</a>.</span>`;
    };
}

function nowTask(tasks) {
    const n = new Date();
    const time = `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
    return tasks.find((t) => t.date === todayISO() && t.start <= time && t.end >= time)?.title || "Free time";
}

function aiIdeas(user) {
    const ideas = [];
    const interests = user.personalization.interests || [];
    const style = user.personalization.style || "balanced";
    const bestTime = user.personalization.bestTime || "morning";

    if (!user.tasks.some((t) => t.start <= "19:00" && t.end >= "19:00")) ideas.push("7:00 PM is open. Great for a restorative activity.");
    if (style === "focus") ideas.push("Use a 50/10 focus sprint for your top priority.");
    if (style === "social") ideas.push("Open a room and invite a friend for shared scheduling.");
    if (style === "balanced") ideas.push("Alternate a 40-minute work block with a 10-minute recharge break.");

    if (bestTime === "morning") ideas.push("Do your hardest task in the morning to use your peak energy.");
    if (bestTime === "afternoon") ideas.push("Reserve afternoons for collaborative and medium-effort tasks.");
    if (bestTime === "evening") ideas.push("Use evening slots for low-pressure progress and reflection.");

    if (interests.includes("music")) ideas.push("Add a 20-minute music block during free time.");
    if (interests.includes("exercise")) ideas.push("Add a short movement break between long tasks.");
    if (interests.includes("reading")) ideas.push("Plan a 25-minute reading session after your next task.");
    if (interests.includes("coding")) ideas.push("Use one free block for a mini coding challenge.");
    if (interests.includes("art")) ideas.push("Set a creative art session in your next free window.");

    ideas.push(
        "Do a 5-minute planning reset before starting your next task.",
        "Batch similar tasks together to reduce context switching.",
        "If energy feels low, start with a 10-minute easy win task.",
        "Leave one open slot today for unexpected priorities.",
        "End your day with a 5-minute review and tomorrow plan."
    );

    const unique = [...new Set(ideas)];
    return unique.slice(0, 10);
}

function nextFreeSlot(tasks) {
    const today = todayISO();
    const todays = tasks
        .filter((t) => t.date === today)
        .sort((a, b) => a.start.localeCompare(b.start));
    let cursor = "08:00";
    for (const t of todays) {
        if (cursor < t.start) break;
        if (cursor < t.end) cursor = t.end;
    }
    const [h, m] = cursor.split(":").map(Number);
    const endDate = new Date();
    endDate.setHours(h, m + 30, 0, 0);
    const end = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;
    return { date: today, start: cursor, end };
}

function suggestionToTaskTitle(text) {
    return text
        .replace(/^\d{1,2}:\d{2}\s?(AM|PM)?\s?/i, "")
        .replace(/^-\s*/, "")
        .trim()
        .slice(0, 90);
}

function buildCalendar(tasks, year, month) {
    const d = new Date();
    const y = year;
    const m = month;
    const start = new Date(y, m, 1).getDay();
    const total = new Date(y, m + 1, 0).getDate();
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((n) => `<div class="day-name">${n}</div>`).join("");
    const cells = [names];
    for (let i = 0; i < start; i += 1) cells.push(`<div class="day-cell"></div>`);
    for (let day = 1; day <= total; day += 1) {
        const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const dayTasks = tasks.filter((t) => t.date === iso).slice(0, 3);
        const isToday = day === d.getDate() && y === d.getFullYear() && m === d.getMonth();
        cells.push(`<div class="day-cell ${isToday ? "today" : ""}"><strong>${day}</strong>${dayTasks.map((t) => `<div class="day-task">${esc(t.title)}</div>`).join("")}</div>`);
    }
    return cells.join("");
}

function getSharedTasks(user) {
    const roomIds = new Set(user.rooms.map((r) => r.id));
    return state.users.flatMap((other) => other.email === user.email ? [] : other.tasks.filter((t) => t.roomId && roomIds.has(t.roomId)).map((t) => ({ ...t, owner: other.profile.displayName || other.email })));
}

function wireDashboard() {
    requireAuth();
    const user = me();
    const shared = getSharedTasks(user);
    document.getElementById("status").innerHTML = `<strong>Current Time:</strong> ${new Date().toLocaleTimeString()} | <strong>Current Activity:</strong> ${esc(nowTask(user.tasks))}`;
    document.getElementById("kpis").innerHTML = `
        <div class="kpi"><small>Total Tasks</small><strong>${user.tasks.length}</strong></div>
        <div class="kpi"><small>Friends</small><strong>${user.friends.length}</strong></div>
        <div class="kpi"><small>Rooms</small><strong>${user.rooms.length}</strong></div>
        <div class="kpi"><small>Shared Tasks</small><strong>${shared.length}</strong></div>`;
    const now = new Date();
    const viewRaw = sessionStorage.getItem("LEISURELY_CAL_VIEW");
    let viewYear = now.getFullYear();
    let viewMonth = now.getMonth();
    if (viewRaw) {
        const [yy, mm] = viewRaw.split("-").map(Number);
        if (Number.isInteger(yy) && Number.isInteger(mm) && mm >= 0 && mm <= 11) {
            viewYear = yy;
            viewMonth = mm;
        }
    }

    const renderCalendar = () => {
        document.getElementById("calendar").innerHTML = buildCalendar([...user.tasks, ...shared], viewYear, viewMonth);
        document.getElementById("calendarTitle").textContent = `Calendar - ${monthNames[viewMonth]} ${viewYear}`;
        sessionStorage.setItem("LEISURELY_CAL_VIEW", `${viewYear}-${viewMonth}`);
    };
    renderCalendar();
    const renderAi = () => {
        const shuffled = [...aiIdeas(user)].sort(() => Math.random() - 0.5);
        document.getElementById("aiList").innerHTML = shuffled
            .map((x, idx) => `<li><span>${esc(x)}</span> <button type="button" class="action-btn add-ai-btn" data-ai-idx="${idx}">Add to Tasks</button></li>`)
            .join("");
        const aiButtons = document.querySelectorAll(".add-ai-btn");
        aiButtons.forEach((btn) => {
            btn.onclick = () => {
                const index = Number(btn.dataset.aiIdx);
                const pick = shuffled[index];
                if (!pick) return;
                const slot = nextFreeSlot(user.tasks);
                user.tasks.push({
                    id: uid(),
                    title: suggestionToTaskTitle(pick),
                    date: slot.date,
                    start: slot.start,
                    end: slot.end,
                    roomId: "",
                    status: "planned"
                });
                save();
                go("./dashboard.html");
            };
        });
    };
    renderAi();
    const ownRows = user.tasks.map((t) => {
        const doneClass = t.status === "done" ? "task-done" : "";
        const room = esc(user.rooms.find((r) => r.id === t.roomId)?.name || "Personal");
        return `<tr>
            <td class="${doneClass}">${esc(t.title)}</td>
            <td>${t.date}</td>
            <td>${t.start}-${t.end}</td>
            <td>${room}</td>
            <td>
                <button type="button" class="action-btn toggle-done-btn" data-task-id="${t.id}">${t.status === "done" ? "Undo" : "Done"}</button>
                <button type="button" class="action-btn ghost delete-task-btn" data-task-id="${t.id}">Delete</button>
            </td>
        </tr>`;
    });
    const sharedRows = shared.map((t) => `<tr><td>${esc(t.title)}</td><td>${t.date}</td><td>${t.start}-${t.end}</td><td>Shared: ${esc(t.owner)}</td><td>-</td></tr>`);
    document.getElementById("taskRows").innerHTML = [...ownRows, ...sharedRows].join("") || "<tr><td colspan='5'>No tasks yet.</td></tr>";
    document.querySelectorAll(".toggle-done-btn").forEach((btn) => {
        btn.onclick = () => {
            const task = user.tasks.find((t) => t.id === btn.dataset.taskId);
            if (!task) return;
            task.status = task.status === "done" ? "planned" : "done";
            save();
            go("./dashboard.html");
        };
    });
    document.querySelectorAll(".delete-task-btn").forEach((btn) => {
        btn.onclick = () => {
            user.tasks = user.tasks.filter((t) => t.id !== btn.dataset.taskId);
            save();
            go("./dashboard.html");
        };
    });
    document.getElementById("refreshAiBtn").onclick = () => {
        renderAi();
    };
    document.getElementById("prevMonthBtn").onclick = () => {
        viewMonth -= 1;
        if (viewMonth < 0) {
            viewMonth = 11;
            viewYear -= 1;
        }
        renderCalendar();
    };
    document.getElementById("nextMonthBtn").onclick = () => {
        viewMonth += 1;
        if (viewMonth > 11) {
            viewMonth = 0;
            viewYear += 1;
        }
        renderCalendar();
    };

    const taskModal = document.getElementById("taskModal");
    document.getElementById("openTaskModalBtn").onclick = () => {
        taskModal.classList.remove("hidden");
    };
    document.getElementById("closeTaskModalBtn").onclick = () => {
        taskModal.classList.add("hidden");
    };
    taskModal.onclick = (e) => {
        if (e.target === taskModal) taskModal.classList.add("hidden");
    };

    document.getElementById("taskForm").onsubmit = (e) => {
        e.preventDefault();
        const d = new FormData(e.target);
        user.tasks.push({ id: uid(), title: String(d.get("title")).trim(), date: String(d.get("date")), start: String(d.get("start")), end: String(d.get("end")), roomId: String(d.get("roomId")), status: "planned" });
        save();
        taskModal.classList.add("hidden");
        go("./dashboard.html");
    };
    document.getElementById("roomOptions").innerHTML = `<option value="">Personal</option>${user.rooms.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join("")}`;
}

function wireProfile() {
    requireAuth();
    const user = me();
    const form = document.getElementById("profileForm");
    const preview = document.getElementById("profilePreview");
    const profileMsg = document.getElementById("profileMsg");
    form.displayName.value = user.profile.displayName || "";
    if (user.profile.photoUrl) {
        preview.src = user.profile.photoUrl;
        preview.classList.remove("hidden");
    }
    form.photoFile.onchange = async () => {
        const file = form.photoFile.files?.[0];
        if (!file) return;
        const data = await imageFileToOptimizedDataUrl(file);
        preview.src = data;
        preview.classList.remove("hidden");
    };
    form.onsubmit = async (e) => {
        e.preventDefault();
        const d = new FormData(form);
        user.profile.displayName = String(d.get("displayName")).trim();
        const photoFile = d.get("photoFile");
        if (photoFile instanceof File && photoFile.size > 0) {
            user.profile.photoUrl = await imageFileToOptimizedDataUrl(photoFile);
        }
        if (!saveSafe()) {
            profileMsg.innerHTML = `<span class="danger">Could not save profile image. Try a smaller image file.</span>`;
            return;
        }
        profileMsg.innerHTML = `<span class="ok">Profile updated.</span>`;
        go("./dashboard.html");
    };
}

function wireSettings() {
    requireAuth();
    const user = me();
    const form = document.getElementById("settingsForm");
    form.theme.value = user.settings.theme || "light";
    form.accent.value = user.settings.accent || DEFAULT_COLOR;
    form.onsubmit = (e) => {
        e.preventDefault();
        const d = new FormData(form);
        user.settings.theme = String(d.get("theme")) === "dark" ? "dark" : "light";
        user.settings.accent = String(d.get("accent")) || DEFAULT_COLOR;
        save();
        go("./dashboard.html");
    };
}

function wireRooms() {
    requireAuth();
    const user = me();
    const friendList = document.getElementById("friendList");
    const roomList = document.getElementById("roomList");
    friendList.innerHTML = user.friends.map((f) => `<li class="mini-card">${esc(f)}</li>`).join("") || "<li class='mini-card'>No friends yet.</li>";
    roomList.innerHTML = user.rooms.map((r) => `<li class="mini-card"><strong>${esc(r.name)}</strong><br /><small>${r.members.length} members</small></li>`).join("") || "<li class='mini-card'>No rooms yet.</li>";
    document.getElementById("friendForm").onsubmit = (e) => {
        e.preventDefault();
        const email = String(new FormData(e.target).get("friendEmail")).trim().toLowerCase();
        if (!byEmail(email)) return void alert("That account does not exist.");
        if (!user.friends.includes(email)) user.friends.push(email);
        save();
        go("./rooms.html");
    };
    document.getElementById("roomForm").onsubmit = (e) => {
        e.preventDefault();
        const name = String(new FormData(e.target).get("roomName")).trim();
        if (!name) return;
        user.rooms.push({ id: uid(), name, members: [user.email, ...user.friends] });
        save();
        go("./rooms.html");
    };
}

function wireNav() {
    const logout = document.getElementById("logoutBtn");
    if (logout) logout.onclick = () => { state.session = null; save(); go("./login.html"); };
}

applyTheme();
wireNav();
if (page === "signup") wireSignup();
if (page === "login") wireLogin();
if (page === "forgot") wireForgotPassword();
if (page === "dashboard") wireDashboard();
if (page === "profile") wireProfile();
if (page === "settings") wireSettings();
if (page === "rooms") wireRooms();
