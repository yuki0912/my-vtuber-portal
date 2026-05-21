// --- 資料庫初始化 ---
let defaultRoster = [
    { 
        id: "demo-1", 
        name: "湊阿庫婭", 
        group: "Hololive", 
        platform: "YouTube", 
        subs: "180萬", 
        imageUrl: "https://api.dicebear.com/7.x/adventurer/svg?seed=Aqua", 
        birthday: "12月1日", 
        description: "傳奇超級電競女僕，雖然私底下極度社恐，但在遊戲（APEX、大亂鬥）中展現出驚人的天賦與技術。", 
        isFavorite: true, 
        tags: ["電競女僕", "阿夸", "洋蔥"],
        ytUrl: "https://www.youtube.com/@MinatoAqua",
        targetId: "@MinatoAqua" // 新增：用於自動抓取的關鍵 ID
    },
    { 
        id: "demo-2", 
        name: "杏仁咪嚕", 
        group: "個人勢", 
        platform: "YouTube", 
        subs: "43萬", 
        imageUrl: "https://api.dicebear.com/7.x/adventurer/svg?seed=Miru", 
        birthday: "12月26日", 
        description: "台灣知名的虛擬大前輩，台日雙語系 VTuber。聲音超級可愛，擅長各種射擊遊戲、雜談與歌回！", 
        isFavorite: false, 
        tags: ["咪嚕", "台灣VTuber", "貓咪"],
        ytUrl: "https://www.youtube.com/@AnninMiru",
        targetId: "@AnninMiru" // 新增：用於自動抓取的關鍵 ID
    }
];

let defaultSchedules = [
    { 
        id: "demo-s1", 
        name: "綜合連動", 
        date: "2026-06-01", 
        type: "🎮 大型賽事/連動", 
        title: "晚上 8 點！跨箱 Apex 聯賽正式開打，快來幫大家加油！" 
    }
];

let vtubers = JSON.parse(localStorage.getItem('vt_roster_v3')) || defaultRoster;
let schedules = JSON.parse(localStorage.getItem('vt_sched_v3')) || defaultSchedules;

// ==========================================
// 🌟 核心：自動抓取三大平台訂閱數邏輯
// ==========================================

// 格式化數字為中文萬/億，讓畫面更好看
function formatSubsCount(num) {
    if (!num || isNaN(num)) return "未獲取";
    if (num >= 100000000) return (num / 100000000).toFixed(1) + '億';
    if (num >= 10000) return (num / 10000).toFixed(1) + '萬';
    return num.toString();
}

async function autoFetchSubs(id) {
    const vt = vtubers.find(v => v.id === id);
    if (!vt || !vt.targetId) {
        alert("請先填寫該成員的「平台唯一標識 ID」才能進行抓取！");
        return;
    }

    // 尋找卡片上的轉圈圈動畫與按鈕
    const btn = document.getElementById(`sync-btn-${id}`);
    if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> 抓取中...';

    let finalSubs = vt.subs; 
    const cleanId = vt.targetId.trim();

    try {
        if (vt.platform === 'YouTube') {
            // 處理 @ 符號
            const handle = cleanId.startsWith('@') ? cleanId : `@${cleanId}`;
            // 透過 Oembed 公開接口加上 CORS 代理
            const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/${handle}&format=json`;
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
            
            const res = await fetch(proxyUrl);
            const data = await res.json();
            
            if (data.contents) {
                const pageText = data.contents;
                // 利用正則表達式，從 YouTube 的公開網頁中解析出訂閱人數
                const match = pageText.match(/"subscriberCountText":\s*\{\s*"simpleText":\s*"([^"]+)"\}/) || 
                              pageText.match(/"([^"]+) subscribers"/);
                if (match && match[1]) {
                    finalSubs = match[1].replace(' subscribers', '').replace('位訂閱者', '').trim();
                } else {
                    // 備用方案：解析部分網頁字串
                    const subIndex = pageText.indexOf('訂閱者');
                    if (subIndex !== -1) {
                        finalSubs = pageText.substring(subIndex - 15, subIndex).match(/[\d\.]+[萬|億|K|M]?/)?. [0] + '訂閱者' || finalSubs;
                    } else {
                        throw new Error("無法解析 YouTube 頁面格式");
                    }
                }
            }
        } 
        else if (vt.platform === 'Bilibili') {
            // Bilibili 官方有免驗蹤的數據接口，直接掛代理抓取
            const url = `https://api.bilibili.com/x/relation/stat?vmid=${cleanId}`;
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
            
            const res = await fetch(proxyUrl);
            const raw = await res.json();
            const data = JSON.parse(raw.contents);
            
            if (data && data.code === 0 && data.data && data.data.follower) {
                finalSubs = formatSubsCount(data.data.follower);
            } else {
                throw new Error("Bilibili 節點回應異常");
            }
        } 
        else if (vt.platform === 'Twitch') {
            // Twitch 在 2026 年對全公開前端限制極嚴，我們透過第三方 Twitch 數據反查網頁來獲取
            const url = `https://twitchtracker.com/${cleanId.toLowerCase()}`;
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
            
            const res = await fetch(proxyUrl);
            const data = await res.json();
            
            if (data.contents) {
                const doc = new DOMParser().parseFromString(data.contents, 'text/html');
                // 抓取 TwitchTracker 上的追隨者數字選取器
                const followerElem = doc.querySelector('#stat-followers, .g-scalar-value');
                if (followerElem) {
                    const num = parseInt(followerElem.innerText.replace(/,/g, ''), 10);
                    finalSubs = formatSubsCount(num);
                } else {
                    // 正則備用搜索
                    const match = data.contents.match(/followers['"]?\s*:\s*(\d+)/i);
                    if(match) finalSubs = formatSubsCount(parseInt(match[1], 10));
                    else throw new Error("無法解析 Twitch 網頁結構");
                }
            }
        }

        // 更新本地資料庫並重新渲染
        vt.subs = finalSubs;
        localStorage.setItem('vt_roster_v3', JSON.stringify(vtubers));
        renderRoster();
        alert(`🎉 ${vt.name} 數據同步成功！目前：${finalSubs}`);

    } catch (err) {
        console.error(err);
        alert(`❌ 抓取失敗，可能是平台改版或阻擋。您可以稍後再試，或手動修正。`);
        if (btn) renderRoster(); // 恢復按鈕原狀
    }
}

// ==========================================
// 頁籤切換與渲染邏輯
// ==========================================
function switchTab(tabName) {
    const rosterPage = document.getElementById('page-roster');
    const schedulePage = document.getElementById('page-schedule');
    const btnRoster = document.getElementById('btn-tab-roster');
    const btnSched = document.getElementById('btn-tab-schedule');

    if(tabName === 'roster') {
        rosterPage.classList.remove('hidden');
        schedulePage.classList.add('hidden');
        btnRoster.className = "px-5 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 cursor-pointer bg-indigo-600 text-white";
        btnSched.className = "px-5 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 cursor-pointer text-slate-400 hover:text-white";
    } else {
        rosterPage.classList.add('hidden');
        schedulePage.classList.remove('hidden');
        btnRoster.className = "px-5 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 cursor-pointer text-slate-400 hover:text-white";
        btnSched.className = "px-5 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 cursor-pointer bg-rose-600 text-white";
        renderSchedules();
    }
}

const vtuberForm = document.getElementById('vtuberForm');
const vtuberGrid = document.getElementById('vtuberGrid');
const emptyState = document.getElementById('emptyState');

function renderRoster() {
    const search = document.getElementById('searchBar').value.toLowerCase().trim();
    const grp = document.getElementById('filterGroup').value;

    let filtered = vtubers.filter(v => {
        const matchSearch = v.name.toLowerCase().includes(search) || 
                            (v.description && v.description.toLowerCase().includes(search)) ||
                            (v.tags && v.tags.some(t => t.toLowerCase().includes(search)));
        const matchGroup = (grp === '全部') || (v.group === grp);
        return matchSearch && matchGroup;
    });

    filtered.sort((a,b) => (b.isFavorite?1:0) - (a.isFavorite?1:0));

    if(filtered.length === 0) {
        vtuberGrid.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }
    emptyState.classList.add('hidden');

    vtuberGrid.innerHTML = filtered.map(v => {
        const avatar = v.imageUrl ? v.imageUrl : `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(v.name)}`;
        
        let platformIcon = '<i class="fa-brands fa-youtube text-red-500"></i>';
        if(v.platform === 'Twitch') platformIcon = '<i class="fa-brands fa-twitch text-purple-500"></i>';
        if(v.platform === 'Bilibili') platformIcon = '<i class="fa-solid fa-bilibili text-sky-400"></i>';

        return `
            <div class="bg-white rounded-2xl border ${v.isFavorite ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-200'} overflow-hidden shadow-sm hover:shadow-md transition flex flex-col justify-between">
                <div class="p-5 space-y-3">
                    <div class="flex items-center gap-4">
                        <img src="${avatar}" class="w-14 h-14 rounded-xl object-cover bg-slate-50 border border-slate-100" onerror="this.src='https://api.dicebear.com/7.x/adventurer/svg?seed=fallback'">
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-1.5">
                                <h3 class="text-base font-bold text-slate-800 truncate">${v.name}</h3>
                                ${v.isFavorite ? '⭐' : ''}
                            </div>
                            <div class="text-xs text-slate-400 flex flex-col gap-0.5 mt-0.5">
                                <p class="flex items-center gap-1">
                                    <span class="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">${v.group}</span>
                                    <span class="ml-1">${platformIcon} <span class="font-bold text-slate-700">${v.subs || '0'}</span></span>
                                </p>
                                ${v.targetId ? `<span class="text-[10px] text-slate-400">ID: ${v.targetId}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    
                    <div class="text-xs text-slate-500 flex gap-3 bg-slate-50 p-2 rounded-lg">
                        <span>🎂 生日：${v.birthday || '未填'}</span>
                    </div>

                    <p class="text-xs text-slate-600 leading-relaxed line-clamp-3">${v.description || '暫無簡介。'}</p>
                    
                    <div class="flex flex-wrap gap-1">
                        ${(v.tags || []).map(t => `<span class="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-semibold">#${t}</span>`).join('')}
                    </div>
                </div>

                <div class="bg-slate-50 px-5 py-3 border-t border-slate-100 flex justify-between items-center">
                    <div class="flex items-center gap-3">
                        ${v.ytUrl ? `<a href="${v.ytUrl}" target="_blank" class="text-xs text-indigo-600 hover:underline font-bold flex items-center gap-1"><i class="fa-solid fa-arrow-up-right-from-square"></i> 直播間</a>` : '<span class="text-xs text-slate-400 italic">無連結</span>'}
                        <!-- 🔄 新增：即時自動抓取按鈕 -->
                        <button id="sync-btn-${v.id}" onclick="autoFetchSubs('${v.id}')" class="text-[11px] text-emerald-600 hover:text-emerald-700 font-bold bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded transition cursor-pointer">
                            <i class="fa-solid fa-rotate"></i> 同步
                        </button>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="toggleFav('${v.id}')" class="text-slate-400 hover:text-amber-500 text-xs cursor-pointer"><i class="fa-${v.isFavorite?'solid text-amber-500':'regular'} fa-star"></i></button>
                        <button onclick="deleteVtuber('${v.id}')" class="text-slate-400 hover:text-red-500 text-xs cursor-pointer"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

if (vtuberForm) {
    vtuberForm.addEventListener('submit', function(e){
        e.preventDefault();
        const tagInput = document.getElementById('tags').value;
        const tags = tagInput ? tagInput.split(/,|，/).map(t => t.trim()).filter(t => t) : [];

        // 讀取新增的 targetId 輸入框
        const targetIdValue = document.getElementById('targetId') ? document.getElementById('targetId').value : '';

        vtubers.unshift({
            id: Date.now().toString(),
            name: document.getElementById('name').value,
            group: document.getElementById('group').value,
            platform: document.getElementById('platform').value,
            subs: document.getElementById('subs').value || "點擊同步獲取", // 留空時的提示
            imageUrl: document.getElementById('imageUrl').value,
            birthday: document.getElementById('birthday').value,
            description: document.getElementById('description').value,
            isFavorite: document.getElementById('isFavorite').value === 'true',
            tags: tags,
            ytUrl: document.getElementById('ytUrl').value,
            targetId: targetIdValue // 儲存唯一標識
        });
        localStorage.setItem('vt_roster_v3', JSON.stringify(vtubers));
        renderRoster();
        vtuberForm.reset();
    });
}

function deleteVtuber(id) {
    if(confirm('確定刪除該成員？')) {
        vtubers = vtubers.filter(v => v.id !== id);
        localStorage.setItem('vt_roster_v3', JSON.stringify(vtubers));
        renderRoster();
    }
}

function toggleFav(id) {
    vtubers = vtubers.map(v => v.id === id ? {...v, isFavorite: !v.isFavorite} : v);
    localStorage.setItem('vt_roster_v3', JSON.stringify(vtubers));
    renderRoster();
}

// --- 行事曆管理 ---
const scheduleForm = document.getElementById('scheduleForm');
const scheduleTimeline = document.getElementById('scheduleTimeline');
const schedEmptyState = document.getElementById('schedEmptyState');

function renderSchedules() {
    schedules.sort((a,b) => new Date(a.date) - new Date(b.date));

    if(schedules.length === 0) {
        if(scheduleTimeline) scheduleTimeline.innerHTML = '';
        if(schedEmptyState) schedEmptyState.classList.remove('hidden');
        return;
    }
    if(schedEmptyState) schedEmptyState.classList.add('hidden');

    if (scheduleTimeline) {
        scheduleTimeline.innerHTML = schedules.map(s => {
            return `
                <div class="relative pl-8 pb-2 group">
                    <div class="absolute left-2.5 top-1.5 w-3 h-3 rounded-full bg-rose-500 ring-4 ring-rose-100 z-10"></div>
                    <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div>
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="text-xs font-black text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded shadow-sm">${s.date}</span>
                                <span class="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">${s.type}</span>
                                <strong class="text-sm text-slate-800">${s.name}</strong>
                            </div>
                            <p class="text-xs text-slate-600 mt-2 font-medium">${s.title}</p>
                        </div>
                        <button onclick="deleteSched('${s.id}')" class="text-slate-300 hover:text-red-500 text-xs cursor-pointer sm:opacity-0 group-hover:opacity-100 transition">
                            <i class="fa-solid fa-calendar-xmark"></i> 移除
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }
}

if (scheduleForm) {
    scheduleForm.addEventListener('submit', function(e){
        e.preventDefault();
        schedules.push({
            id: 's' + Date.now().toString(),
            name: document.getElementById('schedName').value,
            date: document.getElementById('schedDate').value,
            type: document.getElementById('schedType').value,
            title: document.getElementById('schedTitle').value
        });
        localStorage.setItem('vt_sched_v3', JSON.stringify(schedules));
        renderSchedules();
        scheduleForm.reset();
    });
}

function deleteSched(id) {
    if(confirm('確定移除此項日程通知？')) {
        schedules = schedules.filter(s => s.id !== id);
        localStorage.setItem('vt_sched_v3', JSON.stringify(schedules));
        renderSchedules();
    }
}

// --- 全域備份機制 ---
function exportAllData() {
    const allData = { roster: vtubers, schedules: schedules };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allData, null, 2));
    const dl = document.createElement('a');
    dl.setAttribute("href", dataStr);
    dl.setAttribute("download", `vtuber_hub_v3_backup.json`);
    dl.click();
}

function importAllData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.roster && data.schedules) {
                if(confirm('檢查到完整備份，是否確認導入？(會覆蓋現有資料)')) {
                    vtubers = data.roster;
                    schedules = data.schedules;
                    localStorage.setItem('vt_roster_v3', JSON.stringify(vtubers));
                    localStorage.setItem('vt_sched_v3', JSON.stringify(schedules));
                    renderRoster();
                    renderSchedules();
                    alert('數據導入還原成功！');
                }
            } else {
                alert('不符合系統備份格式。');
            }
        } catch(err) {
            alert('讀取失敗，檔案毀損。');
        }
    };
    reader.readAsText(file);
}

if(document.getElementById('searchBar')) document.getElementById('searchBar').addEventListener('input', renderRoster);
if(document.getElementById('filterGroup')) document.getElementById('filterGroup').addEventListener('change', renderRoster);

renderRoster();
