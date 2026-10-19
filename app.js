// =========================================================================
// 1. KONFIGURASI SUPABASE
// =========================================================================
const SUPABASE_URL = "https://ymxxmjioswrglvktwokw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_TCP1-WVZa6RbFYxTXjziuw_9tiR-1mF";

let supabaseClient = null;
if (SUPABASE_URL && window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Data cadangan lokal jika koneksi Supabase terputus
const fallbackData = [
    { id: 1, name: "STNK", description: "Monitoring dokumen Pajak & STNK Kendaraan Operasional di Site.", link: "https://pajakkendaraank2.netlify.app/", category: "Operasional", icon: "fa-car" },
    { id: 2, name: "Proms", description: "Memantau Pelaksanaan Project", link: "https://link-proms.com", category: "Operasional", icon: "fa-chart-line" },
    { id: 3, name: "Monitoring Stock BBM", description: "Monitoring ketersediaan BBM di Site", link: "https://link-bbm.com", category: "Operasional", icon: "fa-gas-pump" }
];

let allApps = [];
let favoriteAppNames = JSON.parse(localStorage.getItem('nexus_app_favorites') || '[]');
let activeCategory = 'ALL';
let currentViewMode = 'grid';
let deleteTargetId = null;

// Fungsi normalisasi toleran: menerima format kolom 'name'/'nama', 'description'/'keterangan', 'category'/'kategori', serta 'icon'
function normalizeAppData(item) {
    if (!item) return null;
    return {
        id: item.id,
        nama: item.name || item.nama || '',
        keterangan: item.description || item.keterangan || item.desc || '',
        link: item.link || item.url || '',
        kategori: item.category || item.kategori || 'Operasional',
        icon: item.icon || '',
        created_at: item.created_at || null
    };
}

// =========================================================================
// 2. AUDIO FX SYNTHESIZER
// =========================================================================
let soundEnabled = false;
let audioCtx = null;

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playAudio(type) {
    if (!soundEnabled) return;
    try {
        initAudio();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        const now = audioCtx.currentTime;

        if (type === 'click') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(520, now);
            gain.gain.setValueAtTime(0.02, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
            osc.start(now);
            osc.stop(now + 0.03);
        } else if (type === 'success') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.setValueAtTime(660, now + 0.04);
            gain.gain.setValueAtTime(0.02, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
            osc.start(now);
            osc.stop(now + 0.07);
        }
    } catch (e) {
        console.debug('Audio FX error:', e);
    }
}

// =========================================================================
// 3. SUPABASE DATA HANDLER (CRUD)
// =========================================================================
async function loadAppsFromSupabase() {
    const statusEl = document.getElementById('backendStatus');

    if (!supabaseClient) {
        if (statusEl) statusEl.innerText = "Demo Mode";
        allApps = fallbackData.map(normalizeAppData).filter(Boolean);
        renderApps(allApps);
        return;
    }

    try {
        // Ambil data tanpa pemaksaan order kolom 'id' agar tidak gagal jika primary key berbeda
        const { data, error } = await supabaseClient
            .from('apps')
            .select('*');

        if (error) throw error;

        if (statusEl) statusEl.innerText = "Supabase Terhubung";
        allApps = (data || []).map(normalizeAppData).filter(Boolean);
        renderApps(allApps);
    } catch (err) {
        console.error("Gagal mengambil data dari Supabase:", err);
        showToast("Gagal memuat data: " + err.message, "error");
        if (statusEl) statusEl.innerText = "Supabase Offline / Fallback";
        allApps = fallbackData.map(normalizeAppData).filter(Boolean);
        renderApps(allApps);
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();
    hideFormError();
    playAudio('success');

    const idVal = document.getElementById('editAppId').value;
    const nama = document.getElementById('formNama').value.trim();
    const keterangan = document.getElementById('formKeterangan').value.trim();
    const link = document.getElementById('formLink').value.trim();
    const kategori = document.getElementById('formKategori').value;
    const iconEl = document.getElementById('formIcon');
    const iconVal = iconEl ? iconEl.value.trim() : 'fa-cube';

    // Payload utama disesuaikan tepat dengan kolom tabel Supabase
    const appPayload = {
        name: nama,
        description: keterangan,
        link: link,
        category: kategori,
        icon: iconVal || 'fa-cube'
    };

    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i> <span>Menyimpan...</span>';

    try {
        if (supabaseClient) {
            let resError = null;

            if (idVal && idVal !== "") {
                // UPDATE data
                const { error } = await supabaseClient
                    .from('apps')
                    .update(appPayload)
                    .eq('id', idVal);
                resError = error;

                // Jika gagal karena kolom 'icon' belum ada di tabel Supabase user, retry tanpa field icon
                if (resError && resError.message && resError.message.includes('icon')) {
                    console.warn("Kolom icon belum ada di tabel Supabase, mencoba simpan tanpa kolom icon...");
                    delete appPayload.icon;
                    const retry = await supabaseClient
                        .from('apps')
                        .update(appPayload)
                        .eq('id', idVal);
                    resError = retry.error;
                }

                if (resError) throw resError;
                showToast("Aplikasi berhasil diperbarui!");
            } else {
                // INSERT data baru
                const { error } = await supabaseClient
                    .from('apps')
                    .insert([appPayload]);
                resError = error;

                // Fallback retry jika kolom icon belum ada
                if (resError && resError.message && resError.message.includes('icon')) {
                    console.warn("Kolom icon belum ada di tabel Supabase, mencoba insert tanpa kolom icon...");
                    delete appPayload.icon;
                    const retry = await supabaseClient
                        .from('apps')
                        .insert([appPayload]);
                    resError = retry.error;
                }

                if (resError) throw resError;
                showToast("Aplikasi baru berhasil ditambahkan!");
            }
            await loadAppsFromSupabase();
        } else {
            if (idVal && idVal !== "") {
                const idx = allApps.findIndex(a => a.id == idVal);
                if (idx !== -1) allApps[idx] = normalizeAppData({ id: idVal, ...appPayload });
            } else {
                allApps.unshift(normalizeAppData({ id: Date.now(), ...appPayload }));
            }
            showToast("Tersimpan secara lokal (Demo Mode)");
            renderApps(allApps);
        }
        closeFormModal();
    } catch (err) {
        console.error("Error saving app:", err);
        showFormError("Gagal menyimpan ke Supabase: " + (err.message || err));
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fa-solid fa-check text-[10px]"></i> <span>Simpan</span>';
    }
}

async function executeDelete() {
    if (!deleteTargetId) return;
    playAudio('click');
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i> <span>Menghapus...</span>';

    try {
        if (supabaseClient) {
            const { error } = await supabaseClient
                .from('apps')
                .delete()
                .eq('id', deleteTargetId);
            if (error) throw error;
            showToast("Aplikasi berhasil dihapus dari database!");
            await loadAppsFromSupabase();
        } else {
            allApps = allApps.filter(a => a.id != deleteTargetId);
            showToast("Aplikasi dihapus (Demo Mode)");
            renderApps(allApps);
        }
        toggleModal('deleteModal');
    } catch (err) {
        console.error("Gagal menghapus:", err);
        showToast("Gagal menghapus: " + err.message, "error");
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = 'Ya, Hapus';
    }
}

// =========================================================================
// 4. PERINTAH SUARA (WEB SPEECH API)
// =========================================================================
let recognition = null;
let isListening = false;

function initVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return false;

    recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = function() {
        isListening = true;
        updateVoiceUI(true);
    };

    recognition.onresult = function(event) {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }

        const spokenText = finalTranscript || interimTranscript;
        const transcriptEl = document.getElementById('voiceStatusTranscript');
        if (transcriptEl && spokenText) {
            transcriptEl.innerText = `"${spokenText}"`;
        }

        if (finalTranscript) {
            processVoiceCommand(finalTranscript);
        }
    };

    recognition.onerror = function(event) {
        if (event.error === 'not-allowed') {
            showToast('Izin akses mikrofon ditolak oleh browser.', 'error');
        } else if (event.error !== 'no-speech') {
            showToast('Gagal mengenali suara: ' + event.error, 'error');
        }
        stopVoiceRecognition();
    };

    recognition.onend = function() {
        stopVoiceRecognition();
    };

    return true;
}

function toggleVoiceRecognition() {
    playAudio('click');
    if (isListening) {
        stopVoiceRecognition();
    } else {
        startVoiceRecognition();
    }
}

function startVoiceRecognition() {
    if (!recognition) {
        const supported = initVoiceRecognition();
        if (!supported) {
            showToast('Browser belum mendukung perintah suara.', 'error');
            return;
        }
    }
    try {
        recognition.start();
    } catch (e) {
        console.debug('Recognition start exception:', e);
    }
}

function stopVoiceRecognition() {
    isListening = false;
    updateVoiceUI(false);
    if (recognition) {
        try { recognition.stop(); } catch (e) {}
    }
}

function updateVoiceUI(listening) {
    const voiceBtn = document.getElementById('voiceBtn');
    const micIcon = document.getElementById('voiceMicIcon');
    const overlay = document.getElementById('voiceOverlay');
    const btnText = document.getElementById('voiceBtnText');

    if (listening) {
        if (voiceBtn) voiceBtn.className = "px-3 py-1.5 bg-red-50 text-red-600 font-semibold rounded-xl text-xs flex items-center space-x-1.5 ui-transition border border-red-200 animate-pulse";
        if (micIcon) micIcon.className = "fa-solid fa-microphone-lines text-[12px] text-red-600";
        if (btnText) btnText.innerText = "Mendengarkan...";
        if (overlay) overlay.classList.remove('hidden');
        const titleEl = document.getElementById('voiceStatusTitle');
        const transcriptEl = document.getElementById('voiceStatusTranscript');
        if (titleEl) titleEl.innerText = "Mendengarkan suara Anda...";
        if (transcriptEl) transcriptEl.innerText = "Katakan: 'Buka STNK', 'Buka Proms', dsb.";
    } else {
        if (voiceBtn) voiceBtn.className = "px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 font-medium rounded-xl text-xs flex items-center space-x-1.5 ui-transition border border-slate-200/80 shadow-2xs";
        if (micIcon) micIcon.className = "fa-solid fa-microphone text-[12px]";
        if (btnText) btnText.innerText = "Perintah Suara";
        if (overlay) overlay.classList.add('hidden');
    }
}

function processVoiceCommand(text) {
    const raw = text.toLowerCase().trim();
    const cleanText = raw.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');

    let keyword = cleanText;
    const triggers = ['buka aplikasi', 'jalankan aplikasi', 'buka', 'jalankan', 'open', 'akses'];
    
    for (const trig of triggers) {
        if (cleanText.startsWith(trig)) {
            keyword = cleanText.substring(trig.length).trim();
            break;
        }
    }

    if (!keyword) {
        showToast(`Perintah "${text}" belum menyebut nama aplikasi`, 'error');
        return;
    }

    const matchedApp = allApps.find(app => {
        const appName = (app.nama || '').toLowerCase();
        return appName === keyword || 
               appName.includes(keyword) || 
               keyword.includes(appName);
    });

    if (matchedApp) {
        playAudio('success');
        showToast(`Membuka ${matchedApp.nama}...`);
        const titleEl = document.getElementById('voiceStatusTitle');
        const transcriptEl = document.getElementById('voiceStatusTranscript');
        if (titleEl) titleEl.innerText = `Ditemukan: ${matchedApp.nama}!`;
        if (transcriptEl) transcriptEl.innerText = `Membuka aplikasi...`;

        setTimeout(() => {
            launchApp(null, matchedApp.link);
            stopVoiceRecognition();
        }, 500);
    } else {
        showToast(`Aplikasi "${keyword}" tidak ditemukan`, 'error');
    }
}

// =========================================================================
// 5. UI DISPLAY & RENDERING
// =========================================================================
function getAppStyling(app) {
    // Jika user sudah memilih ikon secara custom di database, utamakan ikon tersebut
    if (app && app.icon && app.icon.trim() !== '') {
        const customIcon = app.icon.trim();
        // Berikan aksen warna selaras berdasarkan jenis ikon
        if (customIcon.includes('car') || customIcon.includes('truck')) {
            return { icon: customIcon, iconBg: 'bg-teal-600 text-white', badgeBg: 'bg-teal-50 text-teal-600 border-teal-100' };
        }
        if (customIcon.includes('tree') || customIcon.includes('invoice')) {
            return { icon: customIcon, iconBg: 'bg-emerald-600 text-white', badgeBg: 'bg-emerald-50 text-emerald-600 border-emerald-100' };
        }
        if (customIcon.includes('gas') || customIcon.includes('wrench')) {
            return { icon: customIcon, iconBg: 'bg-amber-500 text-white', badgeBg: 'bg-amber-50 text-amber-600 border-amber-100' };
        }
        if (customIcon.includes('chart') || customIcon.includes('calendar') || customIcon.includes('users')) {
            return { icon: customIcon, iconBg: 'bg-blue-600 text-white', badgeBg: 'bg-blue-50 text-blue-600 border-blue-100' };
        }
        return { icon: customIcon, iconBg: 'bg-slate-800 text-white', badgeBg: 'bg-slate-100 text-slate-600 border-slate-200' };
    }

    // Fallback otomatis jika data lama belum memiliki nilai kolom 'icon'
    const name = (typeof app === 'string') ? app : (app?.nama || '');
    const lower = (name || '').toLowerCase();
    if (lower.includes('cuti') || lower.includes('tiket')) {
        return { icon: 'fa-calendar-days', iconBg: 'bg-blue-600 text-white', badgeBg: 'bg-blue-50 text-blue-600 border-blue-100' };
    }
    if (lower.includes('csr') || lower.includes('berita')) {
        return { icon: 'fa-file-invoice', iconBg: 'bg-emerald-600 text-white', badgeBg: 'bg-emerald-50 text-emerald-600 border-emerald-100' };
    }
    if (lower.includes('bbm') || lower.includes('stock')) {
        return { icon: 'fa-gas-pump', iconBg: 'bg-amber-500 text-white', badgeBg: 'bg-amber-50 text-amber-600 border-amber-100' };
    }
    if (lower.includes('stnk') || lower.includes('pajak')) {
        return { icon: 'fa-car', iconBg: 'bg-teal-600 text-white', badgeBg: 'bg-teal-50 text-teal-600 border-teal-100' };
    }
    return { icon: 'fa-cube', iconBg: 'bg-slate-800 text-white', badgeBg: 'bg-slate-100 text-slate-600 border-slate-200' };
}

function renderApps(apps) {
    updateStatsCounters();
    filterApps();
}

// Pengaman null-check pada statistik agar eksekusi script tidak terhenti
function updateStatsCounters() {
    const total = allApps.length;
    const active = allApps.filter(a => a.link && a.link.trim() !== '').length;
    const favs = allApps.filter(a => favoriteAppNames.includes(a.nama)).length;

    const elTotal = document.getElementById('statTotalApps');
    const elActive = document.getElementById('statActiveApps');
    const elFav = document.getElementById('statFavApps');

    if (elTotal) elTotal.innerText = total;
    if (elActive) elActive.innerText = active;
    if (elFav) elFav.innerText = favs;
}

function setCategoryFilter(category) {
    activeCategory = category;
    document.querySelectorAll('.cat-btn').forEach(btn => {
        const catAttr = btn.getAttribute('data-cat');
        if (catAttr === category) {
            btn.className = "cat-btn px-4 py-1.5 rounded-full text-xs font-semibold bg-[#2563EB] text-white shadow-xs ui-transition flex items-center gap-1.5";
        } else {
            btn.className = "cat-btn px-4 py-1.5 rounded-full text-xs font-medium text-slate-600 hover:text-slate-900 border border-[#E5EAF1] bg-white ui-transition flex items-center gap-1.5";
        }
    });
    filterApps();
}

function setViewMode(mode) {
    currentViewMode = mode;
    const btnGrid = document.getElementById('btnViewGrid');
    const btnList = document.getElementById('btnViewList');
    const gridContainer = document.getElementById('appsGrid');
    const listContainer = document.getElementById('appsList');

    if (mode === 'grid') {
        if (btnGrid) btnGrid.className = "p-1.5 rounded-lg text-xs font-medium ui-transition bg-white text-blue-600 shadow-xs";
        if (btnList) btnList.className = "p-1.5 rounded-lg text-xs font-medium ui-transition text-slate-400 hover:text-slate-800";
        if (gridContainer) gridContainer.classList.remove('hidden');
        if (listContainer) listContainer.classList.add('hidden');
    } else {
        if (btnList) btnList.className = "p-1.5 rounded-lg text-xs font-medium ui-transition bg-white text-blue-600 shadow-xs";
        if (btnGrid) btnGrid.className = "p-1.5 rounded-lg text-xs font-medium ui-transition text-slate-400 hover:text-slate-800";
        if (gridContainer) gridContainer.classList.add('hidden');
        if (listContainer) listContainer.classList.remove('hidden');
    }
}

function filterApps() {
    const searchInput = document.getElementById('searchInput');
    const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const sortSelect = document.getElementById('sortSelect');
    const sortMode = sortSelect ? sortSelect.value : 'newest';
    const clearBtn = document.getElementById('clearSearchBtn');

    if (clearBtn) {
        if (searchVal.length > 0) clearBtn.classList.remove('hidden');
        else clearBtn.classList.add('hidden');
    }

    let filtered = allApps.filter(app => {
        const appTitle = (app.nama || '').toLowerCase();
        const appDesc = (app.keterangan || '').toLowerCase();
        const appCategory = app.kategori || 'Operasional';

        const matchesSearch = appTitle.includes(searchVal) || appDesc.includes(searchVal);
        
        let matchesCategory = true;
        if (activeCategory === 'FAV') {
            matchesCategory = favoriteAppNames.includes(app.nama);
        } else if (activeCategory !== 'ALL') {
            matchesCategory = appCategory === activeCategory || (!appCategory && activeCategory === 'Lainnya');
        }

        return matchesSearch && matchesCategory;
    });

    if (sortMode === 'name') {
        filtered.sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
    } else {
        filtered.sort((a, b) => (b.id || 0) - (a.id || 0));
    }

    renderFavoritesSection(allApps);
    displayAppCards(filtered);
    displayAppList(filtered);
}

function renderFavoritesSection(apps) {
    const favGrid = document.getElementById('favAppsGrid');
    const favNotice = document.getElementById('favEmptyNotice');
    if (!favGrid) return;

    const pinnedApps = apps.filter(a => favoriteAppNames.includes(a.nama));

    if (pinnedApps.length === 0) {
        favGrid.classList.add('hidden');
        if (favNotice) favNotice.classList.remove('hidden');
        favGrid.innerHTML = '';
    } else {
        favGrid.classList.remove('hidden');
        if (favNotice) favNotice.classList.add('hidden');
        favGrid.innerHTML = pinnedApps.map(app => renderSingleCardHTML(app)).join('');
    }
}

// Validasi URL HTTP/HTTPS aman untuk mencegah script injection
function isValidHttpUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) {
        return false;
    }
}

function launchApp(e, url) {
    if (!url || !isValidHttpUrl(url)) {
        showToast('URL aplikasi belum valid atau kosong', 'error');
        return;
    }
    playAudio('click');
    // Tabnapping security protection
    const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
    if (newWindow) newWindow.opener = null;
}

function renderSingleCardHTML(app) {
    const style = getAppStyling(app);
    const hasLink = app.link && app.link.trim() !== '';
    const isFav = favoriteAppNames.includes(app.nama);

    return `
        <div class="group bg-white rounded-2xl p-5 border ${isFav ? 'border-blue-400/80 shadow-sm' : 'border-[#E5EAF1] shadow-card'} hover:border-blue-500 hover:shadow-card-hover transition-all duration-200 flex flex-col justify-between space-y-3.5 h-full">
            <div>
                <div class="flex items-start justify-between mb-3">
                    <div class="flex items-center space-x-3">
                        <div class="w-11 h-11 rounded-2xl ${style.iconBg} flex items-center justify-center text-lg shadow-2xs group-hover:scale-105 transition-transform">
                            <i class="fa-solid ${style.icon}"></i>
                        </div>
                        <div>
                            <h4 class="font-bold text-sm text-slate-900 group-hover:text-blue-600 ui-transition line-clamp-1">${escapeHtml(app.nama)}</h4>
                            <div class="flex items-center gap-1.5 mt-0.5">
                                <span class="w-1.5 h-1.5 rounded-full ${hasLink ? 'bg-emerald-500' : 'bg-slate-300'}"></span>
                                <span class="text-[11px] font-medium ${hasLink ? 'text-emerald-600' : 'text-slate-400'}">${hasLink ? 'Online' : 'Offline'}</span>
                            </div>
                        </div>
                    </div>

                    <div class="flex items-center space-x-1">
                        <button onclick="event.stopPropagation(); toggleFavorite('${escapeJs(app.nama)}')" title="${isFav ? 'Unpin' : 'Pin Favorite'}" class="p-1.5 text-slate-400 hover:text-amber-500 rounded-lg hover:bg-slate-50 ui-transition">
                            <i class="${isFav ? 'fa-solid fa-thumbtack text-blue-600' : 'fa-regular fa-star'} text-xs"></i>
                        </button>
                        <button onclick="event.stopPropagation(); openEditModal(${app.id})" title="Edit Aplikasi" class="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-50 ui-transition">
                            <i class="fa-solid fa-ellipsis-vertical text-xs"></i>
                        </button>
                    </div>
                </div>

                <div class="mb-2">
                    <span class="inline-block px-2.5 py-0.5 text-[10px] font-medium rounded-full ${style.badgeBg} border">
                        ${escapeHtml(app.kategori || 'Operasional')}
                    </span>
                </div>

                <p class="text-xs text-slate-500 leading-relaxed line-clamp-2 min-h-[32px]">
                    ${escapeHtml(app.keterangan || 'Tidak ada deskripsi tambahan untuk aplikasi ini.')}
                </p>
            </div>

            <div class="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 mt-auto">
                <button onclick="launchApp(event, '${escapeJs(app.link)}')" class="w-full sm:w-auto px-4 py-1.5 bg-slate-50 hover:bg-[#2563EB] text-slate-700 hover:text-white rounded-xl text-xs font-semibold border border-slate-200 hover:border-blue-600 flex items-center justify-center gap-1.5 ui-transition group-hover:bg-[#2563EB] group-hover:text-white group-hover:border-blue-600">
                    <span>Buka Aplikasi</span>
                    <i class="fa-solid fa-arrow-right text-[10px]"></i>
                </button>
            </div>
        </div>
    `;
}

function displayAppCards(apps) {
    const grid = document.getElementById('appsGrid');
    const emptyState = document.getElementById('emptyState');
    const appCountEl = document.getElementById('appCount');
    if (appCountEl) appCountEl.innerText = apps.length;

    if (!grid) return;

    if (apps.length === 0) {
        grid.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    grid.innerHTML = apps.map(app => renderSingleCardHTML(app)).join('');
}

function displayAppList(apps) {
    const listContainer = document.getElementById('appsList');
    if (!listContainer) return;

    if (apps.length === 0) {
        listContainer.innerHTML = '';
        return;
    }

    listContainer.innerHTML = apps.map(app => {
        const style = getAppStyling(app);
        const hasLink = app.link && app.link.trim() !== '';

        return `
            <div class="bg-white rounded-xl p-3.5 border border-[#E5EAF1] hover:border-blue-400 hover:shadow-card ui-transition flex items-center justify-between gap-4 group">
                <div class="flex items-center space-x-3.5">
                    <div class="w-10 h-10 rounded-xl ${style.iconBg} flex items-center justify-center text-sm font-bold flex-shrink-0 shadow-2xs">
                        <i class="fa-solid ${style.icon}"></i>
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <h4 class="font-bold text-xs text-slate-900 group-hover:text-blue-600 ui-transition">${escapeHtml(app.nama)}</h4>
                            <span class="w-1.5 h-1.5 rounded-full ${hasLink ? 'bg-emerald-500' : 'bg-slate-300'}"></span>
                            <span class="text-[10px] text-slate-400">${escapeHtml(app.kategori || 'Operasional')}</span>
                        </div>
                        <p class="text-xs text-slate-500 line-clamp-1 mt-0.5">${escapeHtml(app.keterangan || '-')}</p>
                    </div>
                </div>

                <div class="flex items-center space-x-2.5">
                    ${hasLink ? `
                        <button onclick="launchApp(event, '${escapeJs(app.link)}')" class="px-3.5 py-1.5 bg-[#2563EB] hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 ui-transition">
                            <span>Buka</span>
                            <i class="fa-solid fa-arrow-right text-[9px]"></i>
                        </button>
                    ` : `
                        <span class="px-2.5 py-1 bg-slate-100 text-slate-400 text-xs rounded-lg border border-slate-200">Offline</span>
                    `}
                    <button onclick="openEditModal(${app.id})" class="p-1.5 text-slate-400 hover:text-slate-700 text-xs">
                        <i class="fa-solid fa-ellipsis"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function toggleFavorite(appName) {
    playAudio('click');
    if (favoriteAppNames.includes(appName)) {
        favoriteAppNames = favoriteAppNames.filter(n => n !== appName);
        showToast('Dihapus dari Pinned');
    } else {
        favoriteAppNames.push(appName);
        showToast('Disematkan ke Pinned');
    }

    localStorage.setItem('nexus_app_favorites', JSON.stringify(favoriteAppNames));
    updateStatsCounters();
    filterApps();
}

// =========================================================================
// 7. FORM MODAL CONTROLS & ICON PICKER
// =========================================================================
function selectAppIcon(iconClass) {
    playAudio('click');
    const input = document.getElementById('formIcon');
    const label = document.getElementById('selectedIconLabel');
    if (input) input.value = iconClass;
    if (label) label.innerText = iconClass;

    // Perbarui visual border aktif pada grid pilihan ikon
    document.querySelectorAll('.icon-choice-btn').forEach(btn => {
        if (btn.getAttribute('data-icon') === iconClass) {
            btn.className = "icon-choice-btn w-8 h-8 rounded-lg flex items-center justify-center text-xs bg-white text-blue-600 border-2 border-blue-600 shadow-xs transition";
        } else {
            btn.className = "icon-choice-btn w-8 h-8 rounded-lg flex items-center justify-center text-xs bg-white text-slate-600 border border-slate-200 hover:border-blue-400 transition";
        }
    });
}

function openFormModal() {
    hideFormError();
    const form = document.getElementById('appForm');
    if (form) form.reset();
    
    const editIdEl = document.getElementById('editAppId');
    if (editIdEl) editIdEl.value = "";

    selectAppIcon('fa-cube'); // Set default icon

    const titleEl = document.getElementById('modalTitle');
    if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-plus-circle text-blue-600 text-xs"></i> Tambah Aplikasi Baru';
    
    const deleteBtn = document.getElementById('deleteAppModalBtn');
    if (deleteBtn) deleteBtn.classList.add('hidden');
    
    const modal = document.getElementById('appModal');
    const box = document.getElementById('appModalBox');
    if (modal && box) {
        modal.classList.remove('hidden');
        setTimeout(() => box.classList.remove('scale-95', 'opacity-0'), 10);
    }
}

function openEditModal(appId) {
    playAudio('click');
    hideFormError();
    const app = allApps.find(a => a.id == appId);
    if (!app) return;

    deleteTargetId = appId;
    const editIdEl = document.getElementById('editAppId');
    const namaEl = document.getElementById('formNama');
    const ketEl = document.getElementById('formKeterangan');
    const linkEl = document.getElementById('formLink');
    const katEl = document.getElementById('formKategori');

    if (editIdEl) editIdEl.value = app.id;
    if (namaEl) namaEl.value = app.nama || '';
    if (ketEl) ketEl.value = app.keterangan || '';
    if (linkEl) linkEl.value = app.link || '';
    if (katEl) katEl.value = app.kategori || 'Operasional';

    // Set ikon yang tersimpan (atau default jika kosong)
    const iconToSelect = app.icon || getAppStyling(app).icon || 'fa-cube';
    selectAppIcon(iconToSelect);

    const titleEl = document.getElementById('modalTitle');
    if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-pen-to-square text-blue-600 text-xs"></i> Edit Data Aplikasi';

    const deleteBtn = document.getElementById('deleteAppModalBtn');
    if (deleteBtn) deleteBtn.classList.remove('hidden');

    const modal = document.getElementById('appModal');
    const box = document.getElementById('appModalBox');
    if (modal && box) {
        modal.classList.remove('hidden');
        setTimeout(() => box.classList.remove('scale-95', 'opacity-0'), 10);
    }
}

function closeFormModal() {
    const modal = document.getElementById('appModal');
    const box = document.getElementById('appModalBox');
    if (!modal || !box) return;
    box.classList.add('scale-95', 'opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 150);
}

function confirmDeleteFromModal() {
    closeFormModal();
    const app = allApps.find(a => a.id == deleteTargetId);
    if (app) {
        const nameEl = document.getElementById('deleteAppName');
        if (nameEl) nameEl.innerText = app.nama;
        toggleModal('deleteModal');
    }
}

function showFormError(msg) {
    const errBox = document.getElementById('formErrorBox');
    const errTxt = document.getElementById('formErrorText');
    if (errTxt) errTxt.innerHTML = msg;
    if (errBox) errBox.classList.remove('hidden');
}

function hideFormError() {
    const errBox = document.getElementById('formErrorBox');
    if (errBox) errBox.classList.add('hidden');
}

function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    filterApps();
}

function resetFilters() {
    playAudio('click');
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    if (searchInput) searchInput.value = '';
    if (sortSelect) sortSelect.value = 'newest';
    setCategoryFilter('ALL');
}

function toggleModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden');
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    const bgClass = type === 'success' ? 'bg-slate-900 text-white' : 'bg-red-600 text-white';
    const icon = type === 'success' ? 'fa-circle-check text-emerald-400' : 'fa-circle-exclamation text-white';

    toast.className = `${bgClass} text-xs font-medium px-4 py-2.5 rounded-xl shadow-lg flex items-center space-x-2 ui-transition transform translate-y-2 opacity-0 z-50 pointer-events-auto`;
    toast.innerHTML = `<i class="fa-solid ${icon}"></i><span>${escapeHtml(message)}</span>`;

    const container = document.getElementById('toastContainer');
    if (!container) return;
    container.appendChild(toast);

    setTimeout(() => toast.classList.remove('translate-y-2', 'opacity-0'), 10);
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 2200);
    }, 2500);
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function escapeJs(text) {
    if (!text) return '';
    return String(text).replace(/'/g, "\\'");
}

// =========================================================================
// 8. SECURITY (DISABLE RIGHT CLICK & DEVTOOLS SHORTCUTS)
// =========================================================================
document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        return false;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U' || e.keyCode === 85)) {
        e.preventDefault();
        return false;
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.keyCode === 73)) {
        e.preventDefault();
        return false;
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'J' || e.key === 'j' || e.keyCode === 74)) {
        e.preventDefault();
        return false;
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c' || e.keyCode === 67)) {
        e.preventDefault();
        return false;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.keyCode === 83)) {
        e.preventDefault();
        return false;
    }
});

// =========================================================================
// 9. INITIALIZATION
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    loadAppsFromSupabase();

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            playAudio('click');
            openSpotlight();
        }
        if (e.key === 'Escape') closeSpotlight();
    });
});
