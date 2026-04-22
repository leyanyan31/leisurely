const STORAGE_KEY = "leisurely-app-v5";
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
    const authOnlyPages = new Set(["dashboard", "profile", "settings", "rooms", "room"]);
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
        if (byEmail(email)) return void (msg.innerHTML = `<span class="danger" role="alert">Email already exists.</span>`);
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
        if (!saveSafe()) return void (msg.innerHTML = `<span class="danger" role="alert">Image too large to save. Try a smaller photo.</span>`);
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
        if (!user || user.password !== String(d.get("password"))) return void (msg.innerHTML = `<span class="danger" role="alert">Invalid email or password.</span>`);
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
        if (!user) return void (msg.innerHTML = `<span class="danger" role="alert">No account found.</span>`);
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
        if (!user || !user.passwordReset || user.passwordReset.code !== code) return void (msg.innerHTML = `<span class="danger" role="alert">Invalid reset code.</span>`);
        if (pass.length < 6) return void (msg.innerHTML = `<span class="danger" role="alert">Password must be at least 6 characters.</span>`);
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

function aiIdeasGroup(roomMembers, roomTasks) {
    const ideas = [];
    const allInterests = [];
    const styles = [];
    const bestTimes = [];
    let memberCount = 0;

    for (const email of roomMembers) {
        const user = byEmail(email);
        if (user) {
            memberCount++;
            if (user.personalization?.interests) allInterests.push(...user.personalization.interests);
            if (user.personalization?.style) styles.push(user.personalization.style);
            if (user.personalization?.bestTime) bestTimes.push(user.personalization.bestTime);
        }
    }

    if (memberCount === 0) {
        const user = me();
        if (user) {
            allInterests.push(...(user.personalization?.interests || []));
            styles.push(user.personalization?.style || "balanced");
            bestTimes.push(user.personalization?.bestTime || "morning");
            memberCount = 1;
        }
    }

    const uniqueInterests = [...new Set(allInterests)];

    const taskTimes = roomTasks.filter(t => t.date === todayISO()).map(t => t.start);
    const has7PM = taskTimes.some(t => t <= "19:00" && parseInt(t) >= 19);
    if (!has7PM) ideas.push("7:00 PM is open. Great for a group activity.");

    const styleCounts = styles.reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {});
    const dominantStyle = Object.entries(styleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "balanced";

    if (dominantStyle === "focus") ideas.push("Use 50/10 focus sprints for top priorities.");
    if (dominantStyle === "social") ideas.push("Plan a collaborative session - great for group synergy!");
    if (dominantStyle === "balanced") ideas.push("Alternate 40-min work blocks with 10-min breaks.");

    const timeCounts = bestTimes.reduce((acc, t) => { acc[t] = (acc[t] || 0) + 1; return acc; }, {});
    const dominantTime = Object.entries(timeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "morning";

    if (dominantTime === "morning") ideas.push("Schedule hard tasks in morning when energy peaks.");
    if (dominantTime === "afternoon") ideas.push("Reserve afternoons for collaborative and medium-effort work.");
    if (dominantTime === "evening") ideas.push("Use evenings for reflection and low-pressure progress.");

    if (uniqueInterests.includes("music")) ideas.push("Add a 20-minute music break - match group vibe!");
    if (uniqueInterests.includes("exercise")) ideas.push("Schedule a movement break - group stretches!");
    if (uniqueInterests.includes("reading")) ideas.push("Plan a quiet reading session for the group.");
    if (uniqueInterests.includes("coding")) ideas.push("Group coding session - pair programming?");
    if (uniqueInterests.includes("art")) ideas.push("Creative session - collaborative art or brainstorming.");

    ideas.push(
        "Do a 5-minute planning reset before starting.",
        "Batch similar tasks to reduce switching.",
        "Start with a quick win to build momentum.",
        "Leave one slot open for unexpected priorities.",
        "End with a 5-minute group review."
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
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((n) => `<div class="day-name" role="columnheader" aria-label="${n}">${n}</div>`).join("");
    const cells = [names];
    for (let i = 0; i < start; i += 1) cells.push(`<div class="day-cell" role="gridcell"></div>`);
    for (let day = 1; day <= total; day += 1) {
        const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const dayTasks = tasks.filter((t) => t.date === iso).slice(0, 3);
        const isToday = day === d.getDate() && y === d.getFullYear() && m === d.getMonth();
        cells.push(`<div class="day-cell ${isToday ? "today" : ""}" role="gridcell" aria-label="${day}${isToday ? ', today' : ''}"><strong>${day}</strong>${dayTasks.map((t) => `<div class="day-task">${esc(t.title)}</div>`).join("")}</div>`);
    }
    return cells.join("");
}

function getSharedTasks(user) {
    const roomIds = new Set(user.rooms.map((r) => r.id));
    return state.users.flatMap((other) => other.email === user.email ? [] : other.tasks.filter((t) => t.roomId && roomIds.has(t.roomId)).map((t) => ({ ...t, owner: other.profile.displayName || other.email })));
}

function getRoomTasks(roomId, user) {
    const room = user.rooms.find(r => r.id === roomId);
    if (!room) return [];
    const roomMemberEmails = room.members || [];
    return state.users
        .filter(u => roomMemberEmails.includes(u.email))
        .flatMap(u => u.tasks.map(t => ({ ...t, owner: u.profile.displayName || u.email, ownerEmail: u.email })));
}

function getRoomMembers(roomId, user) {
    const room = user.rooms.find(r => r.id === roomId);
    if (!room) return [user.email];
    return room.members || [user.email];
}

function getRoomAllTasks(roomId, user) {
    const roomMembers = getRoomMembers(roomId, user);
    const room = user.rooms.find(r => r.id === roomId);
    if (!room) return [];
    return state.users
        .filter(u => roomMembers.includes(u.email))
        .flatMap(u => u.tasks.filter(t => t.roomId === roomId).map(t => ({ ...t, owner: u.profile.displayName || u.email, ownerEmail: u.email })));
}

function getAllMembersWithTasks(roomId, user) {
    const roomMembers = getRoomMembers(roomId, user);
    return state.users
        .filter(u => roomMembers.includes(u.email))
        .map(u => ({
            email: u.email,
            displayName: u.profile.displayName || u.email,
            tasks: u.tasks.filter(t => !t.roomId || t.roomId === roomId)
        }));
}

function openEditTaskModal(taskId) {
    const user = me();
    const task = user.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const modal = document.getElementById("editTaskModal");
    const form = document.getElementById("editTaskForm");
    
    document.getElementById("editTaskId").value = task.id;
    document.getElementById("editTaskTitle").value = task.title;
    document.getElementById("editTaskDate").value = task.date;
    document.getElementById("editTaskStart").value = task.start;
    document.getElementById("editTaskEnd").value = task.end;
    document.getElementById("editTaskRoomOptions").value = task.roomId || "";
    
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
}

function closeEditTaskModal() {
    const modal = document.getElementById("editTaskModal");
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
}

function wireDashboard() {
    requireAuth();
    const user = me();
    const currentRoomId = sessionStorage.getItem("LEISURELY_CURRENT_ROOM") || "";
    const currentRoom = user.rooms.find(r => r.id === currentRoomId);

    const statusDiv = document.getElementById("status");
    const roomSelector = document.getElementById("roomSelector");
    if (roomSelector) {
        const roomOptions = [
            `<option value="">Personal</option>`,
            ...user.rooms.map(r => `<option value="${r.id}" ${r.id === currentRoomId ? 'selected' : ''}>${esc(r.name)}</option>`)
        ].join("");
        roomSelector.innerHTML = roomOptions;
        roomSelector.onchange = (e) => {
            const selectedRoom = e.target.value;
            sessionStorage.setItem("LEISURELY_CURRENT_ROOM", selectedRoom);
            window.location.reload(); // Stay on dashboard, just reload with new filter
        };
    }
const currentTasks = currentRoomId ? getRoomAllTasks(currentRoomId, user) : user.tasks.filter(t => !t.roomId);
    const currentActivity = nowTask(currentTasks);
    const timeDisplay = new Date().toLocaleTimeString();
    
    const tasksHeading = document.getElementById("tasksHeading");
    if (tasksHeading) tasksHeading.textContent = currentRoom ? currentRoom.name + " Tasks" : "Personal Tasks";

    const viewPersonSelect = document.getElementById("viewPerson");
    let personFilter = "";
    if (currentRoomId && viewPersonSelect) {
        const membersWithTasks = getAllMembersWithTasks(currentRoomId, user);
        const personOptions = [
            `<option value="">All Members</option>`,
            ...membersWithTasks.map(m => `<option value="${esc(m.email)}">${esc(m.displayName)}</option>`)
        ].join("");
        viewPersonSelect.innerHTML = personOptions;
        viewPersonSelect.onchange = (e) => {
            personFilter = e.target.value;
            renderTaskRows();
            renderCalendar();
        };
    }

    const roomLabel = currentRoom ? currentRoom.name : "Personal";
    document.getElementById("kpis").innerHTML = `
        <div class="kpi"><small>${roomLabel} Tasks</small><strong>${currentTasks.length}</strong></div>
        <div class="kpi"><small>Rooms</small><strong>${user.rooms.length}</strong></div>`;

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
        const tasksToShow = personFilter ? currentTasks.filter(t => t.ownerEmail === personFilter) : currentTasks;
        document.getElementById("calendar").innerHTML = buildCalendar(tasksToShow, viewYear, viewMonth);
        document.getElementById("calendarTitle").textContent = `Calendar - ${monthNames[viewMonth]} ${viewYear}`;
        sessionStorage.setItem("LEISURELY_CAL_VIEW", `${viewYear}-${viewMonth}`);
    };

    const roomMembers = currentRoomId ? getRoomMembers(currentRoomId, user) : [user.email];
    const renderAi = () => {
        const groupIdeas = aiIdeasGroup(roomMembers, currentTasks);
        const shuffled = [...groupIdeas].sort(() => Math.random() - 0.5);
        const aiLabel = currentRoomId ? `Group AI Suggestions - ${esc(currentRoom?.name || "Room")}` : "AI Suggestions";
        document.querySelector(".card h3").textContent = aiLabel;
        document.getElementById("aiList").innerHTML = shuffled
            .map((x, idx) => `<li><span>${esc(x)}</span> <button type="button" class="action-btn add-ai-btn" data-ai-idx="${idx}" aria-label="Add suggestion to tasks">Add to Tasks</button></li>`)
            .join("");
        const aiButtons = document.querySelectorAll(".add-ai-btn");
        aiButtons.forEach((btn) => {
            btn.onclick = () => {
                const index = Number(btn.dataset.aiIdx);
                const pick = shuffled[index];
                if (!pick) return;
                const slot = nextFreeSlot(currentTasks);
                user.tasks.push({
                    id: uid(),
                    title: suggestionToTaskTitle(pick),
                    date: slot.date,
                    start: slot.start,
                    end: slot.end,
                    roomId: currentRoomId,
                    status: "planned"
                });
                save();
                go("./dashboard.html");
            };
        });
    };

    renderCalendar();
    renderAi();

    const renderTaskRows = () => {
        let tasksToShow = currentTasks;
        if (personFilter) {
            tasksToShow = currentTasks.filter(t => t.ownerEmail === personFilter);
        }

        const ownRows = tasksToShow.filter(t => t.ownerEmail === user.email || !t.ownerEmail).map((t) => {
            const doneClass = t.status === "done" ? "task-done" : "";
            const room = esc(user.rooms.find((r) => r.id === t.roomId)?.name || "Personal");
            return `<tr>
                <td class="${doneClass}">${esc(t.title)}</td>
                <td>${t.date}</td>
                <td>${t.start}-${t.end}</td>
                <td>${room}</td>
                <td>
                    <button type="button" class="action-btn edit-task-btn" data-task-id="${t.id}" aria-label="Edit task">Edit</button>
                    <button type="button" class="action-btn toggle-done-btn" data-task-id="${t.id}" aria-label="${t.status === 'done' ? 'Undo' : 'Mark'} task as done">${t.status === "done" ? "Undo" : "Done"}</button>
                    <button type="button" class="action-btn ghost delete-task-btn" data-task-id="${t.id}" aria-label="Delete task">Delete</button>
                </td>
            </tr>`;
        });

        const otherRows = tasksToShow.filter(t => t.ownerEmail && t.ownerEmail !== user.email).map((t) => `<tr><td>${esc(t.title)}</td><td>${t.date}</td><td>${t.start}-${t.end}</td><td>Shared: ${esc(t.owner)}</td><td>-</td></tr>`);

        document.getElementById("taskRows").innerHTML = [...ownRows, ...otherRows].join("") || "<tr><td colspan='5'>No tasks yet.</td></tr>";
    };

    renderTaskRows();

    document.querySelectorAll(".edit-task-btn").forEach((btn) => {
        btn.onclick = () => {
            openEditTaskModal(btn.dataset.taskId);
        };
    });

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
        taskModal.setAttribute("aria-hidden", "false");
    };
    document.getElementById("closeTaskModalBtn").onclick = () => {
        taskModal.classList.add("hidden");
        taskModal.setAttribute("aria-hidden", "true");
    };
    taskModal.onclick = (e) => {
        if (e.target === taskModal) {
            taskModal.classList.add("hidden");
            taskModal.setAttribute("aria-hidden", "true");
        }
    };

    document.getElementById("taskForm").onsubmit = (e) => {
        e.preventDefault();
        const d = new FormData(e.target);
        const roomId = currentRoomId || "";
        user.tasks.push({ id: uid(), title: String(d.get("title")).trim(), date: String(d.get("date")), start: String(d.get("start")), end: String(d.get("end")), roomId: roomId, status: "planned" });
        save();
        taskModal.classList.add("hidden");
        window.location.reload();
    };

    document.getElementById("editTaskForm").onsubmit = (e) => {
        e.preventDefault();
        const d = new FormData(e.target);
        const taskId = document.getElementById("editTaskId").value;
        const task = user.tasks.find(t => t.id === taskId);
        if (task) {
            task.title = String(d.get("title")).trim();
            task.date = String(d.get("date"));
            task.start = String(d.get("start"));
            task.end = String(d.get("end"));
            save();
            closeEditTaskModal();
            window.location.reload();
        }
    };

    document.getElementById("closeEditTaskModalBtn").onclick = closeEditTaskModal;
    document.getElementById("editTaskModal").onclick = (e) => {
        if (e.target.id === "editTaskModal") closeEditTaskModal();
    };

    document.getElementById("roomOptions").innerHTML = `<option value="">Personal</option>${user.rooms.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join("")}`;
    document.getElementById("editTaskRoomOptions").innerHTML = `<option value="">Personal</option>${user.rooms.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join("")}`;
}

function wireRoom() {
    requireAuth();
    const user = me();
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get("roomId");
    const room = user.rooms.find(r => r.id === roomId);

    if (!room) {
        alert("Room not found. Redirecting to dashboard.");
        go("./dashboard.html");
        return;
    }

    sessionStorage.setItem("LEISURELY_CURRENT_ROOM", roomId);
    const roomTitle = document.getElementById("roomTitle");
    if (roomTitle) roomTitle.textContent = room.name;

    const roomMembers = getRoomMembers(roomId, user);
    const roomTasks = getRoomAllTasks(roomId, user);

    const statusDiv = document.getElementById("status");
    const currentActivity = nowTask(roomTasks);
    statusDiv.innerHTML = `<strong>Current Time:</strong> ${new Date().toLocaleTimeString()} | <strong>Current Activity:</strong> ${esc(currentActivity)}`;
    statusDiv.setAttribute("aria-live", "polite");

    document.getElementById("kpis").innerHTML = `
        <div class="kpi"><small>Room Tasks</small><strong>${roomTasks.length}</strong></div>
        <div class="kpi"><small>Members</small><strong>${roomMembers.length}</strong></div>`;

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
        document.getElementById("calendar").innerHTML = buildCalendar(roomTasks, viewYear, viewMonth);
        document.getElementById("calendarTitle").textContent = `Calendar - ${monthNames[viewMonth]} ${viewYear}`;
    };
    renderCalendar();

    const renderAi = () => {
        const groupIdeas = aiIdeasGroup(roomMembers, roomTasks);
        const shuffled = [...groupIdeas].sort(() => Math.random() - 0.5);
        document.getElementById("aiList").innerHTML = shuffled
            .map((x, idx) => `<li><span>${esc(x)}</span> <button type="button" class="action-btn add-ai-btn" data-ai-idx="${idx}">Add to Tasks</button></li>`)
            .join("");
        const aiButtons = document.querySelectorAll(".add-ai-btn");
        aiButtons.forEach((btn) => {
            btn.onclick = () => {
                const index = Number(btn.dataset.aiIdx);
                const pick = shuffled[index];
                if (!pick) return;
                const slot = nextFreeSlot(roomTasks);
                user.tasks.push({
                    id: uid(),
                    title: suggestionToTaskTitle(pick),
                    date: slot.date,
                    start: slot.start,
                    end: slot.end,
                    roomId: roomId,
                    status: "planned"
                });
                save();
                window.location.reload();
            };
        });
    };
    renderAi();

    // Render member list
    const memberList = document.getElementById("memberList");
    if (memberList) {
        memberList.innerHTML = roomMembers.map(email => {
            const memberUser = byEmail(email);
            const name = memberUser?.profile?.displayName || email;
            return `<li class="mini-card">${esc(name)}</li>`;
        }).join("") || "<li class='mini-card'>No members yet.</li>";
    }

    const renderTasks = () => {
        const rows = roomTasks.map((t) => {
            const doneClass = t.status === "done" ? "task-done" : "";
            return `<tr>
                <td class="${doneClass}">${esc(t.title)}</td>
                <td>${t.date}</td>
                <td>${t.start}-${t.end}</td>
                <td>${esc(t.owner)}</td>
                <td>
                    ${t.ownerEmail === user.email ? `<button type="button" class="action-btn edit-task-btn" data-task-id="${t.id}">Edit</button>
                    <button type="button" class="action-btn toggle-done-btn" data-task-id="${t.id}">${t.status === "done" ? "Undo" : "Done"}</button>
                    <button type="button" class="action-btn ghost delete-task-btn" data-task-id="${t.id}">Delete</button>` : '-'}
                </td>
            </tr>`;
        }).join("");
        document.getElementById("taskRows").innerHTML = rows || "<tr><td colspan='5'>No tasks yet.</td></tr>";
    };
    renderTasks();

    document.querySelectorAll(".edit-task-btn").forEach((btn) => {
        btn.onclick = () => {
            openEditTaskModal(btn.dataset.taskId);
        };
    });

    document.querySelectorAll(".toggle-done-btn").forEach((btn) => {
        btn.onclick = () => {
            const task = user.tasks.find((t) => t.id === btn.dataset.taskId);
            if (!task) return;
            task.status = task.status === "done" ? "planned" : "done";
            save();
            window.location.reload();
        };
    });

    document.querySelectorAll(".delete-task-btn").forEach((btn) => {
        btn.onclick = () => {
            user.tasks = user.tasks.filter((t) => t.id !== btn.dataset.taskId);
            save();
            window.location.reload();
        };
    });

    document.getElementById("prevMonthBtn").onclick = () => {
        viewMonth -= 1;
        if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
        renderCalendar();
    };
    document.getElementById("nextMonthBtn").onclick = () => {
        viewMonth += 1;
        if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
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
        user.tasks.push({ id: uid(), title: String(d.get("title")).trim(), date: String(d.get("date")), start: String(d.get("start")), end: String(d.get("end")), roomId: roomId, status: "planned" });
        save();
        taskModal.classList.add("hidden");
        window.location.reload();
    };

    document.getElementById("editTaskForm").onsubmit = (e) => {
        e.preventDefault();
        const d = new FormData(e.target);
        const taskId = document.getElementById("editTaskId").value;
        const task = user.tasks.find(t => t.id === taskId);
        if (task) {
            task.title = String(d.get("title")).trim();
            task.date = String(d.get("date"));
            task.start = String(d.get("start"));
            task.end = String(d.get("end"));
            save();
            closeEditTaskModal();
            window.location.reload();
        }
    };

    document.getElementById("closeEditTaskModalBtn").onclick = closeEditTaskModal;
    document.getElementById("editTaskModal").onclick = (e) => {
        if (e.target.id === "editTaskModal") closeEditTaskModal();
    };
}

function wireProfile() {
    requireAuth();
    const user = me();
    const form = document.getElementById("profileForm");
    const preview = document.getElementById("profilePreview");
    const profileMsg = document.getElementById("profileMsg");
    const displayNameInput = document.getElementById("displayName");
    const emailInput = document.getElementById("email");
    displayNameInput.value = user.profile?.displayName || "";
    emailInput.value = user.email || "";
    if (user.profile?.photoUrl) {
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
        const newEmail = String(d.get("email")).trim().toLowerCase();
        if (newEmail !== user.email) {
            if (byEmail(newEmail)) {
                profileMsg.innerHTML = `<span class="danger" role="alert">Email already in use.</span>`;
                return;
            }
            user.email = newEmail;
            state.session = newEmail;
        }
        const photoFile = d.get("photoFile");
        if (photoFile instanceof File && photoFile.size > 0) {
            user.profile.photoUrl = await imageFileToOptimizedDataUrl(photoFile);
        }
        if (!saveSafe()) {
            profileMsg.innerHTML = `<span class="danger" role="alert">Could not save profile image. Try a smaller image file.</span>`;
            return;
        }
        profileMsg.innerHTML = `<span class="ok" role="status">Profile updated.</span>`;
        go("./dashboard.html");
    };
    document.getElementById("deleteAccountBtn").onclick = () => {
        if (!confirm("Are you sure you want to delete your account? This cannot be undone.")) return;
        state.users = state.users.filter(u => u.id !== user.id);
        state.session = null;
        localStorage.removeItem(STORAGE_KEY);
        go("./Leisurely.html");
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

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function copyRoomCode(code, roomName) {
    navigator.clipboard.writeText(code).then(() => {
        alert(`Room code "${code}" copied to clipboard! Share it with friends to join "${roomName}".`);
    }).catch(() => {
        prompt("Copy this room code to share:", code);
    });
}

function wireRooms() {
    requireAuth();
    const user = me();
    const roomList = document.getElementById("roomList");
    const joinForm = document.getElementById("joinRoomForm");

    roomList.innerHTML = user.rooms.map((r) => `
        <li class="mini-card">
            <div class="room-info">
                <strong>${esc(r.name)}</strong><br />
                <small>${r.members?.length || 1} members</small>
            </div>
            <div class="room-code-display">
                <button type="button" class="action-btn copy-code-btn" data-room-id="${r.id}" aria-label="Copy room code">
                    Copy Code
                </button>
            </div>
            <button type="button" class="action-btn open-room-btn" data-room-id="${r.id}">
                Open Room
            </button>
            <button type="button" class="action-btn danger delete-room-btn" data-room-id="${r.id}">
                Delete
            </button>
        </li>`).join("") || "<li class='mini-card'>No rooms yet.</li>";

    document.querySelectorAll(".delete-room-btn").forEach((btn) => {
        btn.onclick = () => {
            if (!confirm("Delete this room?")) return;
            user.rooms = user.rooms.filter(r => r.id !== btn.dataset.roomId);
            save();
            go("./rooms.html");
        };
    });

    document.querySelectorAll(".copy-code-btn").forEach((btn) => {
        btn.onclick = () => {
            const roomId = btn.dataset.roomId;
            const room = user.rooms.find(r => r.id === roomId);
            if (room) {
                copyRoomCode(room.code || "NOCODE", room.name);
            }
        };
    });

    document.querySelectorAll(".open-room-btn").forEach((btn) => {
        btn.onclick = () => {
            const roomId = btn.dataset.roomId;
            window.location.href = `./room.html?roomId=${roomId}`;
        };
    });

    document.getElementById("roomForm").onsubmit = (e) => {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const name = formData.get("roomName");
        if (!name || !name.trim()) { alert("Please enter a room name"); return; }
        const roomCode = generateRoomCode();
        const newRoom = { id: uid(), name: name.trim(), members: [user.email], code: roomCode };
        user.rooms.push(newRoom);
        const saved = save();
        alert("Room created! Code: " + roomCode + "\nName: " + name);
        window.location.href = "./rooms.html";
    };

    if (joinForm) {
        joinForm.onsubmit = (e) => {
            e.preventDefault();
            const code = String(new FormData(e.target).get("joinCode")).trim().toUpperCase();
            const roomToJoin = user.rooms.find(r => r.code === code);
            if (roomToJoin) {
                alert("You are already in this room!");
                return;
            }
            const roomByCode = state.users
                .flatMap(u => u.rooms || [])
                .find(r => r.code === code);
            if (!roomByCode) {
                alert("Room not found. Check the code and try again.");
                return;
            }
            const existingRoom = user.rooms.find(r => r.id === roomByCode.id);
            if (existingRoom) {
                alert("You are already in this room!");
                return;
            }
            user.rooms.push({ id: roomByCode.id, name: roomByCode.name, members: roomByCode.members, code: roomByCode.code });
            save();
            alert("Successfully joined the room!");
            go("./rooms.html");
        };
    }
}

function wireNav() {
    const logout = document.getElementById("logoutBtn");
    if (logout) logout.onclick = () => { state.session = null; save(); go("./login.html"); };
    
    const backBtn = document.getElementById("backBtn");
    if (backBtn) {
        backBtn.onclick = (e) => {
            e.preventDefault();
            if (history.length > 1) history.back();
            else window.location.href = "./Leisurely.html";
        };
    }
}

applyTheme();
wireNav();
if (page === "signup") wireSignup();
if (page === "login") wireLogin();
if (page === "forgot") wireForgotPassword();
if (page === "dashboard") { updateHeaderUser(); wireDashboard(); }
if (page === "room") { updateHeaderUser(); wireRoom(); }
if (page === "profile") { updateHeaderUser(); wireProfile(); }
if (page === "settings") { updateHeaderUser(); wireSettings(); }
if (page === "rooms") { updateHeaderUser(); wireRooms(); }

function updateHeaderUser() {
    const user = me();
    if (!user) return;
    const avatar = document.getElementById("headerAvatar");
    const name = document.getElementById("headerName");
    if (avatar && user.profile?.photoUrl) {
        avatar.innerHTML = `<img src="${user.profile.photoUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        avatar.style.background = "transparent";
    } else if (avatar) {
        avatar.textContent = (user.profile?.displayName || user.email || "U")[0].toUpperCase();
    }
    if (name && user.profile?.displayName) {
        name.textContent = `Leisurely - ${user.profile.displayName}`;
    }
}
