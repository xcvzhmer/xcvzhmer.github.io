// script.js — обновлённый файл (на базе твоего кода) — все изменения для поддержки:
// - отдельного поля "ССЫЛКИ" (urlsInput)
// - отображения маленьких кнопок [S] (зелёная если есть ссылка, серая если нет)
// - обработки ❌ рядом с названием команды: все матчи этой команды = BYE, оппоненты получают тех. победу 3:0
// - inactive команды всегда занимают нижние места таблицы
// Код объединён и готов к использованию вместо старого script.js
// ъуйх
// --- Константы и переменные --- 
const DB_NAME = 'tournamentDB';
const DB_VERSION = 2;
let db; // Переменная для объекта базы данных IndexedDB
let currentTourIndex = null;
// 🎯 активный фильтр по счёту
let activeScoreFilter = null;
// 🎯 активный фильтр таблицы
let activeStandingsRange = null;
// 🎯 feat. / solo
let activeStandingsArtistType = null;
// 🎯 20ХХ треки
let activeSpecialTracksFilter = false;
// 🎯
let activeSeasonFilter = null;   // 🔥 (зима/весна/...)
let activeYearFilter = null;     // 🔥 (2024)
let activeTierFilter = null;     // 🔥 (1-6)
let isSpecial = false;
// 🆚 сравнение команд
let selectedCompareTeamA = null;
let selectedCompareTeamB = null;
// 🎯
let activeStandingsArtistFilter = null; // 🔝 таблица
let activeMatchArtistFilter = null;     // 🔽 матчи
// 🎯
let artistFilterInitialized = false;
// 🍋‍🟩 [S] в основной таблице
let activeSpotifyCell = null;
// 🎯 Экспорт только изменённых матчей
let lastExportTime = 0;
// 🎯 ВРЕМЯ ОТКРЫТИЯ САЙТА
let pageOpenTime = Date.now();
// 🎯 без лагов
let ALL_MATCHES_CACHE = null;
let ALL_PAIRS_CACHE = null;
let ALL_TEAMS_CACHE = null;
let ALL_MATCHES_MAP = null;
let TEAM_BY_TRACK = null;

// 🔥 ОТКЛЮЧАЕМ восстановление скролла браузером
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}

// 🔥 ВСЕГДА стартуем сверху
window.addEventListener('load', () => {
    window.scrollTo(0, 0);
});

// --- Элементы DOM ---
const teamsInput = document.getElementById('teamsInput');
const urlsInput = document.getElementById('urlsInput'); // Новое поле с ссылками
const generateBtn = document.getElementById('generateBtn');
const resetBtn = document.getElementById('resetBtn');
const currentTourNumSpan = document.getElementById('currentTourNum');
const totalToursNumSpan = document.getElementById('totalToursNum');
const prevTourBtn = document.getElementById('prevTourBtn');
const nextTourBtn = document.getElementById('nextTourBtn');
const tourJumpInput = document.getElementById('tourJumpInput');
const jumpToTourBtn = document.getElementById('jumpToTourBtn');
const currentTourOutput = document.getElementById('currentTourOutput');
const tourStatsDiv = document.getElementById('tourStats');
const standingsBody = document.getElementById('standingsBody');
const showFullScheduleBtn = document.getElementById('showFullScheduleBtn');
const fullScheduleModal = document.getElementById('fullScheduleModal');
const fullScheduleContent = document.getElementById('fullScheduleContent');
const closeModalBtn = document.querySelector('.close-button');
// ⭐ ЛУЧШИЕ МАТЧИ ПО ТУРАМ
const bestMatchesByTour = {};

function ruToEn(char) {
    const map = {
        й:'Q', ц:'W', у:'E', к:'R', е:'T', н:'Y', г:'U', ш:'I', щ:'O', з:'P', х:'[', ъ:']',
        ф:'A', ы:'S', в:'D', а:'F', п:'G', р:'H', о:'J', л:'K', д:'L', ж:';', э:"'",
        я:'Z', ч:'X', с:'C', м:'V', и:'B', т:'N', ь:'M', б:',', ю:'.', ё:'`'
    };

    return map[char] || char;
}

// ==========================
// 🔗 SUPABASE CONFIG
// ==========================

const SUPABASE_URL = 'https://aiobhxvmqxvlsicsyetr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_VeF0U4HXrHLazUlvK3BNqg_S1TniZGo';

// ------------------ Сохранение/загрузка textarea в localStorage ------------------
const LS_TEAMS_KEY = 'rr_teams_textarea_v1';
const LS_URLS_KEY  = 'rr_urls_textarea_v1';

window.onerror = function(msg, url, line){
    const box = document.getElementById("debugBox") || (() => {
        const d = document.createElement("div");
        d.id = "debugBox";
        d.style.position = "fixed";
        d.style.bottom = "0";
        d.style.left = "0";
        d.style.right = "0";
        d.style.maxHeight = "40%";
        d.style.overflow = "auto";
        d.style.background = "black";
        d.style.color = "lime";
        d.style.fontSize = "12px";
        d.style.zIndex = "99999";
        document.body.appendChild(d);
        return d;
    })();

    box.innerHTML += "<div>"+msg+" (line "+line+")</div>";
};

function saveInputsToLocalStorage() {
    try {
        localStorage.setItem(LS_TEAMS_KEY, teamsInput.value);
        localStorage.setItem(LS_URLS_KEY, urlsInput.value);
    } catch (e) {
        console.warn('Не удалось сохранить textarea в localStorage:', e);
    }
}

function loadInputsFromLocalStorage() {
    try {
        const teams = localStorage.getItem(LS_TEAMS_KEY);
        const urls  = localStorage.getItem(LS_URLS_KEY);
        if (teams !== null && teamsInput) teamsInput.value = teams;
        if (urls !== null && urlsInput) urlsInput.value = urls;
    } catch (e) {
        console.warn('Не удалось загрузить textarea из localStorage:', e);
    }
}

// Слушатели ввода — сохраняем при каждом изменении (легко откатить, если нужно)
teamsInput.addEventListener('input', saveInputsToLocalStorage);
urlsInput.addEventListener('input', saveInputsToLocalStorage);
teamsInput.addEventListener('input', () => {
    updateInputLabels();
});
// --- Функции для работы с IndexedDB ---

/**
 * Инициализирует базу данных IndexedDB.
 */
async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("Ошибка открытия IndexedDB:", event.target.error);
            reject("Ошибка открытия базы данных.");
        };

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            console.log("Создание/обновление базы данных...");

            // Создание хранилища настроек
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'id' });
                console.log("Создано хранилище 'settings'");
            }

            // Создание хранилища команд
            if (!db.objectStoreNames.contains('teams')) {
                const teamsStore = db.createObjectStore('teams', { keyPath: 'id' });
                teamsStore.createIndex('teamName', 'teamName', { unique: true });
                teamsStore.createIndex('spotifyUrl', 'spotifyUrl', { unique: false }); // Не уникальный, т.к. может быть пусто
                console.log("Создано хранилище 'teams'");
            }

            // Создание хранилища расписания
if (!db.objectStoreNames.contains('schedule')) {
    const scheduleStore = db.createObjectStore('schedule', { keyPath: 'id' });
    scheduleStore.createIndex('tourIndex', 'tourIndex', { unique: false });
    scheduleStore.createIndex('matchIndex', 'matchIndex', { unique: false });
    scheduleStore.createIndex('team1', 'team1', { unique: false });
    scheduleStore.createIndex('team2', 'team2', { unique: false });
    console.log("Создано хранилище 'schedule'");
}

/* ⭐ ЛУЧШИЕ МАТЧИ ТУРА */
if (!db.objectStoreNames.contains('bestMatches')) {
    db.createObjectStore('bestMatches', { keyPath: 'tourIndex' });
    console.log("Создано хранилище 'bestMatches'");
    }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log("IndexedDB успешно открыта.");
            resolve();
        };

        request.onblocked = (event) => {
            console.warn("Открытие IndexedDB заблокировано. Пожалуйста, обновите страницу.", event);
            reject("Открытие базы данных заблокировано.");
        };
    });
}

/**
 * Генерирует UUID (Version 4).
 * @returns {string} Уникальный идентификатор.
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// --- Утилиты для работы с "крестиком" (поддерживает разные варианты: ❌ и ❌️ и похожие символы) ---
function hasCrossMark(str) {
    if (str === undefined || str === null) return false;
    const s = String(str);
    // Убираем selector-variants и zero-width joiner, затем проверяем по множеству похожих символов
    const clean = s.replace(/\uFE0F/g, '').replace(/\u200D/g, '').trim();
    return /[❌✖✕✗\u274C\u2716]/.test(clean);
}

// --- Операции с хранилищем 'settings' ---

/**
 * Сохраняет или обновляет настройки турнира.
 * @param {object} settingsData - Объект с настройками.
 */
async function saveSettings(settingsData) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['settings'], 'readwrite');
        const store = transaction.objectStore('settings');
        const request = store.put({ id: 'tournamentState', ...settingsData });

        request.onsuccess = () => resolve();
        request.onerror = (event) => {
            console.error("Ошибка сохранения настроек:", event.target.error);
            reject("Не удалось сохранить настройки.");
        };
    });
}

/**
 * Загружает настройки турнира.
 * @returns {Promise<object>} Промис с объектом настроек.
 */
async function loadSettings() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['settings'], 'readonly');
        const store = transaction.objectStore('settings');
        const request = store.get('tournamentState');

        request.onsuccess = (event) => {
            resolve(event.target.result || { id: 'tournamentState', totalTeams: 0, currentTourIndex: 0, teamsPerTour: 0 });
        };
        request.onerror = (event) => {
            console.error("Ошибка загрузки настроек:", event.target.error);
            reject("Не удалось загрузить настройки.");
        };
    });
}

// ===============================
// Relegation zones (settings)
// ===============================
async function saveRelegationZones(zones) {
    const settings = await loadSettings();
    await saveSettings({
        ...settings,
        relegationZones: zones
    });
}

async function loadRelegationZones() {
    const settings = await loadSettings();
    return settings.relegationZones || {
        yellow: null,
        red: null
    };
}

// --- Операции с хранилищем 'teams' ---

/**
 * Добавляет команду в хранилище.
 * @param {string} teamName - Название команды.
 * @param {string} spotifyUrl - URL Spotify (может быть пустым).
 * @param {boolean} inactive - пометка: команда отключена (❌)
 * @returns {Promise<string>} Промис с ID добавленной команды.
 */
async function addTeam(teamName, spotifyUrl = '', inactive = false) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['teams'], 'readwrite');
        const store = transaction.objectStore('teams');
        const teamId = generateUUID();
        const teamData = { id: teamId, teamName: teamName.trim(), spotifyUrl: spotifyUrl.trim(), inactive: !!inactive };
        const request = store.add(teamData);

        request.onsuccess = () => resolve(teamId);
        request.onerror = (event) => {
            console.error("Ошибка добавления команды:", event.target.error);
            reject("Не удалось добавить команду.");
        };
    });
}

/**
 * Загружает все команды из хранилища.
 * @returns {Promise<Array<object>>} Промис с массивом команд.
 */
async function getAllTeams() {
    if (ALL_TEAMS_CACHE) return ALL_TEAMS_CACHE;

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['teams'], 'readonly');
        const store = transaction.objectStore('teams');
        const request = store.getAll();

        request.onsuccess = (event) => {
            ALL_TEAMS_CACHE = event.target.result;
            resolve(ALL_TEAMS_CACHE);
        };
        request.onerror = (event) => {
            console.error("Ошибка загрузки всех команд:", event.target.error);
            reject("Не удалось загрузить команды.");
        };
    });
}

/**
 * Очищает хранилище команд.
 */
async function clearTeamsStore() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['teams'], 'readwrite');
        const store = transaction.objectStore('teams');
        const request = store.clear();

        request.onsuccess = () => {
            console.log("Хранилище 'teams' очищено.");
            resolve();
        };
        request.onerror = (event) => {
            console.error("Ошибка очистки хранилища 'teams':", event.target.error);
            reject("Не удалось очистить хранилище команд.");
        };
    });
}

// --- Операции с хранилищем 'schedule' ---

/**
 * Добавляет матч в расписание.
 * @param {object} matchData - Данные матча.
 */
async function addMatch(matchData) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['schedule'], 'readwrite');
        const store = transaction.objectStore('schedule');
        const matchId = generateUUID();
        const fullMatchData = { id: matchId, ...matchData };
        const request = store.add(fullMatchData);

        request.onsuccess = () => resolve(matchId);
        request.onerror = (event) => {
            console.error("Ошибка добавления матча:", event.target.error);
            reject("Не удалось добавить матч.");
        };
    });
}

/**
 * Обновляет счет матча.
 * @param {string} matchId - ID матча.
 * @param {number | null} score1 - Счет для команды 1.
 * @param {number | null} score2 - Счет для команды 2.
 * @returns {Promise<void>}
 */
async function updateMatchScore(matchId, score1, score2) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['schedule'], 'readwrite');
        const store = transaction.objectStore('schedule');
        const request = store.get(matchId);

        request.onsuccess = (event) => {
            const match = event.target.result;
            if (match) {
                match.score1 = score1;
                match.score2 = score2;

                /* ⭐ фикс для системы экспорта */
                match.lastModified = Date.now();

                const updateRequest = store.put(match); // Обновляем весь объект
                updateRequest.onsuccess = () => {
                    console.log(`Счет матча ${matchId} обновлен.`);
                    resolve();
                };
                updateRequest.onerror = (event) => {
                    console.error(`Ошибка обновления счета матча ${matchId}:`, event.target.error);
                    reject("Не удалось обновить счет матча.");
                };
            } else {
                console.error(`Матч с ID ${matchId} не найден для обновления.`);
                reject("Матч не найден.");
            }
        };
        request.onerror = (event) => {
            console.error(`Ошибка получения матча ${matchId} для обновления:`, event.target.error);
            reject("Не удалось получить данные матча.");
        };
    });
}

/**
 * Загружает матчи определенного тура.
 * @param {number} tourIndex - Индекс тура.
 * @returns {Promise<Array<object>>} Промис с массивом матчей тура.
 */
async function getMatchesByTour(tourIndex) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['schedule'], 'readonly');
        const store = transaction.objectStore('schedule');
        const index = store.index('tourIndex');
        const request = index.getAll(tourIndex);

        request.onsuccess = (event) => {
            resolve(event.target.result.sort((a, b) => a.matchIndex - b.matchIndex)); // Сортируем по matchIndex
        };
        request.onerror = (event) => {
            console.error(`Ошибка загрузки матчей тура ${tourIndex}:`, event.target.error);
            reject(`Не удалось загрузить матчи тура ${tourIndex}.`);
        };
    });
}

async function saveBestMatchesForTour(tourIndex, slots) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['bestMatches'], 'readwrite');
        const store = tx.objectStore('bestMatches');
        store.put({ tourIndex, slots });

        tx.oncomplete = () => resolve();
        tx.onerror = e => reject(e);
    });
}

    // лучшие матчи идут в db

async function loadBestMatchesForTour(tourIndex) {
    return new Promise((resolve) => {
        const tx = db.transaction(['bestMatches'], 'readonly');
        const store = tx.objectStore('bestMatches');
        const req = store.get(tourIndex);

        req.onsuccess = () => resolve(req.result?.slots || []);
        req.onerror = () => resolve([]);
    });
}

/* ⭐ ВОССТАНОВЛЕНИЕ ЛУЧШИХ МАТЧЕЙ ДЛЯ ТУРА */
async function renderBestMatchesForTour(tourIndex) {
    const slotsData = await loadBestMatchesForTour(tourIndex);

    // ✅ КРИТИЧЕСКИ ВАЖНО — восстанавливаем кэш
    bestMatchesByTour[tourIndex] = Array.isArray(slotsData)
    ? slotsData
    : [];

    const slots = document.querySelectorAll('.best-match-slot');

for (let idx = 0; idx < slots.length; idx++) {
    const slot = slots[idx];
    slot.innerHTML = '';

    const matchNumber = slotsData[idx];
    if (!matchNumber) {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = 1;
        input.placeholder = '№ матча';
        slot.appendChild(input);
        continue;
    }

    const match = getMatchByNumberInCurrentTour(matchNumber);

    if (!match) {
        // ⚠️ матч устарел — сбрасываем слот
        bestMatchesByTour[tourIndex][idx] = null;
        await saveBestMatchesForTour(
            tourIndex,
            bestMatchesByTour[tourIndex]
        );

        const input = document.createElement('input');
        input.type = 'number';
        input.min = 1;
        input.placeholder = '№ матча';
        slot.appendChild(input);
        continue;
    }

    slot.innerHTML = buildBestMatchLine(match);
}

    initBestMatchesUI();
}

/**
 * Очищает хранилище расписания.
 */
async function clearScheduleStore() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['schedule'], 'readwrite');
        const store = transaction.objectStore('schedule');
        const request = store.clear();

        request.onsuccess = () => {
            console.log("Хранилище 'schedule' очищено.");
            resolve();
        };
        request.onerror = (event) => {
            console.error("Ошибка очистки хранилища 'schedule':", event.target.error);
            reject("Не удалось очистить хранилище расписания.");
        };
    });
}

/**
 * Очищает все данные из IndexedDB и сбрасывает поля ввода.
 */
async function clearAllData() {
    try {
        // Очищаем все хранилища
        await clearSettingsStore(); // Предполагается, что такая функция будет добавлена
        await clearTeamsStore();
        await clearScheduleStore();

        // Сбрасываем поля ввода

        currentTourOutput.innerHTML = '';
        tourStatsDiv.textContent = '';
        standingsBody.innerHTML = ''; // Очищаем таблицу результатов
        currentTourNumSpan.textContent = '1';
        totalToursNumSpan.textContent = '0';
        tourJumpInput.value = '';

                // Сбрасываем глобальные переменные
        tournamentData.teams = [];
        tournamentData.schedule = [];

        tournamentData.standings = {}; // ⚠️ НЕ ТРОГАЕМ — логика таблицы

        // ✅ НОВЫЕ ХРАНИЛИЩА ДЛЯ СРAВНЕНИЯ
        tournamentData.standingsTable = [];
        tournamentData.standingsHistory = [];

        tournamentData.currentTourIndex = 0;
        tournamentData.totalTours = 0;

        // Сброс лучших матчей
        for (const key in bestMatchesByTour) {
        delete bestMatchesByTour[key];
    }

        console.log("Все данные удалены.");
        alert("Все данные турнира удалены.");
        enableButtons(); // Обновляем состояние кнопок после сброса
    } catch (error) {
        console.error("Ошибка при очистке всех данных:", error);
        alert("Произошла ошибка при удалении данных. Пожалуйста, попробуйте снова.");
    }
}

/**
 * Вспомогательная функция для очистки хранилища настроек.
 */
async function clearSettingsStore() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['settings'], 'readwrite');
        const store = transaction.objectStore('settings');
        const request = store.delete('tournamentState'); // Удаляем запись по ключу

        request.onsuccess = () => {
            console.log("Хранилище 'settings' очищено.");
            resolve();
        };
        request.onerror = (event) => {
            console.error("Ошибка очистки хранилища 'settings':", event.target.error);
            reject("Не удалось очистить хранилище настроек.");
        };
    });
}

// --- Основная логика ---
let tournamentData = {
    teams: [],
    schedule: [],
    standings: {},
    currentTourIndex: 0,
    totalTours: 0
};

/**
 * Инициализация и основные функции.
 */
async function initializeApp() {
    // загружаем textarea из localStorage до инициализации DB
    loadInputsFromLocalStorage();
    updateInputLabels();
    await initDB(); // Сначала инициализируем базу данных

    // Загружаем настройки
    const settings = await loadSettings();
    tournamentData.currentTourIndex = settings.currentTourIndex || 0;
    if (settings.totalTeams) {
    const n = settings.totalTeams;
    tournamentData.totalTours = (n % 2 === 0) ? (n - 1) : n;
} else {
    tournamentData.totalTours = 0;
}

    // Загружаем команды
    tournamentData.teams = await getAllTeams();

    // Если есть сохраненные команды и расписание, отображаем их
    if (tournamentData.teams.length > 0 && settings.totalTeams) {
        // Загрузим расписание для текущего тура
        const currentTourMatches = await getMatchesByTour(tournamentData.currentTourIndex);
        tournamentData.schedule[tournamentData.currentTourIndex] = currentTourMatches;

        // Восстанавливаем турнирную таблицу
        await renderStandingsFromDB();

updateTourNavigation();

await withStableScroll(async () => {
    await displayTour(tournamentData.currentTourIndex);
});
enableButtons();
        generateBtn.disabled = false; // Отключаем кнопку генерации, если есть сохраненные данные
    } else {
        // Если данных нет, сбрасываем UI и кнопки
        resetUIState();
        enableButtons();
    }
}

/**
 * Сбрасывает UI и кнопки в начальное состояние.
 */
function resetUIState() {
   localStorage.removeItem(LS_TEAMS_KEY);
   localStorage.removeItem(LS_URLS_KEY);
   teamsInput.value = '';
   urlsInput.value = '';
    currentTourOutput.innerHTML = '';
    tourStatsDiv.textContent = '';
    standingsBody.innerHTML = '';
    currentTourNumSpan.textContent = '1';
    totalToursNumSpan.textContent = '0';
    tourJumpInput.value = '';
    generateBtn.disabled = false; // Включаем кнопку генерации
    resetBtn.disabled = true; // Отключаем кнопку сброса
}

/**
 * Очищает все данные из IndexedDB и сбрасывает UI.
 */
async function resetAllDataAndUI() {
    if (!confirm('Вы уверены, что хотите сбросить все данные турнира?')) {
        return;
    }
    try {
        await clearAllData(); // Очищает DB и UI
        // Сбрасываем настройки в DB на дефолтные
        await saveSettings({ totalTeams: 0, currentTourIndex: 0 });
        console.log("Настройки сброшены.");
        tournamentData = { teams: [], schedule: [], standings: {}, currentTourIndex: 0, totalTours: 0 }; // Сброс в памяти
        resetUIState(); // Сброс UI
        enableButtons();
    } catch (error) {
        console.error("Ошибка при сбросе всех данных:", error);
        alert("Произошла ошибка при сбросе данных. Пожалуйста, попробуйте снова.");
    }
}

/**
 * Создает турнирную таблицу на основе данных из IndexedDB.
 */
async function renderStandingsFromDB() {
    standingsBody.innerHTML = '';
    const allTeams = await getAllTeams(); // Получаем команды из DB
    const settings = await loadSettings();

    if (allTeams.length === 0 || !settings.totalTeams) {
        return; // Нечего отображать
    }

    // ✅ ГЛОБАЛЬНОЕ ХРАНИЛИЩЕ АКТУАЛЬНОЙ ТАБЛИЦЫ
if (!window.tournamentData) window.tournamentData = {};
window.tournamentData.standings = [];

    // 🔒 ВСЕГДА начинаем с чистой таблицы
tournamentData.standingsTable = [];

    // Сначала нужно рассчитать статистику, основываясь на сохраненных матчах
    const standings = {};
    // собираем карту inactive по имени команды (teamName уникален)
    const inactiveMap = {};
    allTeams.forEach(team => {
        standings[team.teamName] = { wins: 0, draws: 0, losses: 0, points: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, teamName: team.teamName };
        if (team.inactive) inactiveMap[team.teamName] = true;
    });

    // Получаем все матчи из schedule
    const transaction = db.transaction(['schedule'], 'readonly');
    const store = transaction.objectStore('schedule');
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = (event) => {
        const allMatches = event.target.result;
    tournamentData.allMatches = allMatches;
    tournamentData.allTeams = allTeams;

// ✅ СКОЛЬКО ТУРОВ РЕАЛЬНО СЫГРАНО
tournamentData.completedTours = getCompletedToursCount(allMatches);

        allMatches.forEach(match => {
            // Если матч BYE и не технический и нет оценок — пропускаем
            if ((match.team1 === 'BYE' || match.team2 === 'BYE') && !match.technical) {
                return;
            }

            // Если обе команды есть в standings (защита)
            const team1Stats = standings[match.team1];
            const team2Stats = standings[match.team2];

            // Если команда отсутствует (например BYE или удалена) — пропуск
            if (!team1Stats || !team2Stats) {
                return;
            }

            // Для технических матчей заранее установлены счета
            if (match.technical) {
                // предполагается, что match.score1 и match.score2 уже установлены
                if (match.score1 === null || match.score2 === null) {
                    return;
                }
            } else {
                // Обычные матчи: пропускаем незавершённые
                if (match.score1 === null || match.score2 === null) {
                    return;
                }
            }

            // Обновляем общие показатели
            team1Stats.goalsFor += match.score1;
            team1Stats.goalsAgainst += match.score2;
            team1Stats.goalDifference = team1Stats.goalsFor - team1Stats.goalsAgainst;

            team2Stats.goalsFor += match.score2;
            team2Stats.goalsAgainst += match.score1;
            team2Stats.goalDifference = team2Stats.goalsFor - team2Stats.goalsAgainst;

            // Обновляем результаты матча
            if (match.score1 > match.score2) { // Победа команды 1
                team1Stats.wins++;
                team1Stats.points += 3;
                team2Stats.losses++;
            } else if (match.score1 < match.score2) { // Победа команды 2
                team2Stats.wins++;
                team2Stats.points += 3;
                team1Stats.losses++;
            } else { // Ничья
                team1Stats.draws++;
                team1Stats.points += 1;
                team2Stats.draws++;
                team2Stats.points += 1;
            }
        });

        // Сортировка команд для отображения
// Сначала сортируем по очкам/рэшо/забито, затем помещаем inactive в конец
const sortedTeams = Object.keys(standings).sort((a, b) => {
    const statsA = standings[a];
    const statsB = standings[b];

    // если одна из команд inactive — откладываем её вниз
    const aInactive = !!inactiveMap[a];
    const bInactive = !!inactiveMap[b];
    if (aInactive !== bInactive) {
        return aInactive ? 1 : -1;
    }

    // 🔥 ВАКАНТНЫЕ ВСЕГДА В САМЫЙ НИЗ
    const isVacantA = /^вакантное место\s*-\s*\d+$/i.test(a.toLowerCase());
    const isVacantB = /^вакантное место\s*-\s*\d+$/i.test(b.toLowerCase());

    if (isVacantA !== isVacantB) {
        return isVacantA ? 1 : -1;
    }

    // 🔥 ОСНОВНАЯ СОРТИРОВКА
    if (statsB.points !== statsA.points) return statsB.points - statsA.points;
    if (statsB.goalDifference !== statsA.goalDifference) return statsB.goalDifference - statsA.goalDifference;
    if (statsB.goalsFor !== statsA.goalsFor) return statsB.goalsFor - statsA.goalsFor;

    // 🔥 ПРИ РАВНЫХ СТАТАХ: SPECIAL НИЖЕ ОБЫЧНЫХ
    const specialA = isSpecial(a);
    const specialB = isSpecial(b);

    if (specialA !== specialB) {
        return specialA ? 1 : -1;
    }

    return 0;
});

        // ==============               =================
        // 🧠 НЕ ЗАНИМАЕТ МЕСТО ОБЫЧНЫХ КОМАНД в таблице
        // ===============================

        function isVirtualTeam(teamName) {

    // 🔥 SPECIAL
    for (const k in SPECIAL_TRACKS) {
        if (isSpecialTrack(teamName, k)) return true;
    }

    // 🔥 ВАКАНТНОЕ МЕСТО
    const normalized = teamName.toLowerCase().trim();
    if (/^вакантное место\s*-\s*\d+$/i.test(normalized)) {
        return true;
    }

    return false;
}

// ===============================
// 🧠 BUILD POSITIONS SYSTEM
// ===============================

function isSpecial(teamName) {
    for (const k in SPECIAL_TRACKS) {
        if (isSpecialTrack(teamName, k)) return true;
    }
    return false;
}

function getStatsKey(s) {
    return [
        s.points,
        s.goalDifference,
        s.goalsFor,
        s.wins,
        s.draws,
        s.losses,
        s.goalsAgainst
    ].join('|');
}

const positionsMap = {};
let currentPlace = 1;
let lastStatsKey = null;

for (let i = 0; i < sortedTeams.length; i++) {

    const teamName = sortedTeams[i];
    const stats = standings[teamName];

    const special = isSpecial(teamName);

// 🔥 ВАКАНТНЫЕ ОТДЕЛЬНО (НЕ ВЛИЯЮТ НА МЕСТА)
const isVacant = /^вакантное место\s*-\s*\d+$/i.test(teamName.toLowerCase());

// 🔥 ОБЩЕЕ КОЛ-ВО КОМАНД
const TOTAL_TEAMS = sortedTeams.length;

const statsKey = getStatsKey(stats);

// =========================
// 🔥 ВАКАНТНЫЕ → ВСЕГДА ПОСЛЕДНЕЕ МЕСТО
// =========================
if (isVacant) {
    positionsMap[teamName] = TOTAL_TEAMS;
    continue;
}

// 🔥 ВСЕ НУЛИ = НЕ СЧИТАЕМ РАВЕНСТВОМ
const isAllZero =
    stats.points === 0 &&
    stats.goalDifference === 0 &&
    stats.goalsFor === 0 &&
    stats.goalsAgainst === 0 &&
    stats.wins === 0 &&
    stats.draws === 0 &&
    stats.losses === 0;

    // =========================
    // 🔥 SPECIAL TRACK LOGIC
    // =========================
    if (special) {

        if (i === 0) {
            positionsMap[teamName] = currentPlace;
        } else {
            const prevTeam = sortedTeams[i - 1];
            positionsMap[teamName] = positionsMap[prevTeam];
        }

        continue;
    }

    // =========================
    // 🔥 ОБЫЧНЫЕ ТРЕКИ
    // =========================

    if (!isAllZero && statsKey === lastStatsKey) {
        // одинаковая статистика → то же место
        positionsMap[teamName] = currentPlace;
    } else {
        // новая позиция
        currentPlace = Object.values(positionsMap)
            .filter((_, idx) => {
                const t = sortedTeams[idx];
                return !isSpecial(t);
            }).length + 1;

        positionsMap[teamName] = currentPlace;
        lastStatsKey = statsKey;
    }
}
        // Рендерим строки таблицы
        sortedTeams.forEach((teamName, index) => {
    const stats = standings[teamName];

    // ✅ СОХРАНЯЕМ ДАННЫЕ ДЛЯ СРAВНЕНИЯ (ПРАВИЛЬНО)
    if (!Array.isArray(tournamentData.standingsTable)) {
        tournamentData.standingsTable = [];
    }

    tournamentData.standingsTable.push({
        team: teamName,
        position: index + 1,
        points: stats.points,
        goalsFor: stats.goalsFor,
        goalsAgainst: stats.goalsAgainst,
        goalDifference: stats.goalDifference
    });

    const row = standingsBody.insertRow();

// ⬇⬇⬇ ВАЖНО: сохраняем ИСХОДНОЕ имя трека ⬇⬇⬇
row.dataset.track = teamName;
const trackKey = teamName;
for (const k in SPECIAL_TRACKS) {
    const trackData = SPECIAL_TRACKS[k];
    if (isSpecialTrack(trackKey, k)) {
        const colors = trackData.colors;
        row.style.background = buildSpecialBackground(colors);
        row.classList.add("special-track-row");
        break;
    }
}

    // пометка стиля для inactive команд
    const isInactive = !!inactiveMap[teamName];
    if (isInactive) {
        row.classList.add('bye-match');
        row.style.textDecoration = 'line-through';
    }

    const place = positionsMap[teamName];

// 🧹 убираем inline-цвета
const cleanTeamName = stripInlineColors(teamName);

row.innerHTML = `
<td class="position-cell" data-position="${place}">
    ${place}
</td>
        <td class="team-cell">${cleanTeamName}</td>
        <td>${stats.wins + stats.losses + stats.draws}</td>
        <td>${stats.wins}</td>
        <td>${stats.draws}</td>
        <td>${stats.losses}</td>
        <td>${stats.goalsFor}</td>
        <td>${stats.goalsAgainst}</td>
        <td>${stats.goalDifference}</td>
        <td>${stats.points}</td>
    `;
});

        // После рендера — подсвечиваем зоны вылета и стыков (101-120 желтая, 121-150 красная)
        // Подсветка выполняется на основе количества строк (выполнится в UI)
        // После рендера — подсвечиваем зоны вылета (динамические)
const rows = Array.from(standingsBody.rows);

// сначала чистим старые классы
rows.forEach(r => {
    r.classList.remove('relegation', 'relegation-playoff');
});

// получаем настройки зон
// получаем настройки зон
const zones = settings?.relegationZones;

const yellowFrom = zones?.yellow?.from;
const yellowTo   = zones?.yellow?.to;
const redFrom    = zones?.red?.from;
const redTo      = zones?.red?.to;

rows.forEach((r, idx) => {
    const pos = idx + 1;

    // 🔴 красная зона
    if (
        redFrom !== undefined &&
        redTo !== undefined &&
        pos >= redFrom &&
        pos <= redTo
    ) {
        r.classList.add('relegation');
    }

    // 🟨 жёлтая зона
    else if (
        yellowFrom !== undefined &&
        yellowTo !== undefined &&
        pos >= yellowFrom &&
        pos <= yellowTo
    ) {
        r.classList.add('relegation-playoff');
    }
});
    }

    // ← ← ← ДОБАВИТЬ ЭТУ СТРОКУ
    await repaintStandingsBannedRows();
    await restoreRelegationZonesUI();
    applyStandingsVisibilityFilter();

    getAllRequest.onerror = (event) => {
        console.error("Ошибка при загрузке всех матчей для расчета статистики:", event.target.error);
        alert("Не удалось рассчитать статистику турнира.");
    };
}

function getCompletedToursCount(allMatches) {
    const tours = {};

    allMatches.forEach(m => {
        if (!tours[m.tourIndex]) tours[m.tourIndex] = [];
        tours[m.tourIndex].push(m);
    });

    let completed = 0;

    Object.keys(tours).forEach(tourIndex => {
        const matches = tours[tourIndex];
        const allPlayed = matches.every(m => {
    // BYE-матчи не участвуют в проверке
    if (m.team1 === 'BYE' || m.team2 === 'BYE') return true;

    // технические считаем сыгранными, если есть счёт
    if (m.technical) {
        return m.score1 !== null && m.score2 !== null;
    }

    // обычные
    return m.score1 !== null && m.score2 !== null;
});
        if (allPlayed) completed++;
    });

    return completed;
}

/**
 * Строит таблицу standings ДО указанного тура (не включая следующий)
 */
function buildStandingsUpToTour(allMatches, allTeams, tourLimit) {
    const standings = {};
    const inactiveMap = {};

    allTeams.forEach(team => {
        standings[team.teamName] = {
            team: team.teamName,
            wins: 0,
            draws: 0,
            losses: 0,
            points: 0,
            goalsFor: 0,
            goalsAgainst: 0
        };

        if (team.inactive) {
            inactiveMap[team.teamName] = true;
        }
    });

    allMatches.forEach(match => {
        if (match.tourIndex >= tourLimit) return;
        if (match.team1 === 'BYE' || match.team2 === 'BYE') return;
        if (match.score1 === null || match.score2 === null) return;

        const t1 = standings[match.team1];
        const t2 = standings[match.team2];
        if (!t1 || !t2) return;

        t1.goalsFor += match.score1;
        t1.goalsAgainst += match.score2;
        t2.goalsFor += match.score2;
        t2.goalsAgainst += match.score1;

        if (match.score1 > match.score2) {
            t1.wins++; t1.points += 3;
            t2.losses++;
        } else if (match.score1 < match.score2) {
            t2.wins++; t2.points += 3;
            t1.losses++;
        } else {
            t1.draws++; t2.draws++;
            t1.points++; t2.points++;
        }
    });

    return Object.values(standings)
        .sort((a, b) => {

            const aInactive = !!inactiveMap[a.team];
            const bInactive = !!inactiveMap[b.team];

            if (aInactive !== bInactive) {
                return aInactive ? 1 : -1;
            }

            const gdA = a.goalsFor - a.goalsAgainst;
            const gdB = b.goalsFor - b.goalsAgainst;

            return (
                b.points - a.points ||
                gdB - gdA ||
                b.goalsFor - a.goalsFor ||
                a.team.localeCompare(b.team)   // ← ДОБАВЛЕНО
            );
        })
        .map((t, i) => ({
            team: t.team,
            position: i + 1
        }));
}

function saveStandingsSnapshot() {
    if (!window.tournamentData) return;
    if (!Array.isArray(tournamentData.standingsTable)) return;

    if (!Array.isArray(tournamentData.standingsHistory)) {
        tournamentData.standingsHistory = [];
    }

const expected = tournamentData.completedTours;

    // 🔒 не сохраняем пустоту
    if (tournamentData.standingsTable.length === 0) return;

    if (tournamentData.standingsHistory.length < expected) {

    const snapshotIndex = tournamentData.standingsHistory.length;

    const snapshot = buildStandingsUpToTour(
        tournamentData.allMatches,
        tournamentData.allTeams,
        snapshotIndex + 1
    );

    tournamentData.standingsHistory.push(snapshot);

    console.log(`📸 Снапшот тура ${snapshotIndex + 1} сохранён`);
  }
}

standingsBody.addEventListener('click', function (e) {

    const cell = e.target.closest('.position-cell');
    if (!cell) return;

    const row = cell.parentElement;
    const trackName = row.dataset.track;

    // Если уже активна эта же ячейка — игнор
    if (activeSpotifyCell === cell) return;

    // Убираем предыдущую активную кнопку
    if (activeSpotifyCell) {
        restorePositionCell(activeSpotifyCell);
        activeSpotifyCell = null;
    }

    // Получаем url трека
    const team = tournamentData.allTeams.find(t => t.teamName === trackName);
    const url = team?.spotifyUrl || team?.url || '';

    // Сохраняем оригинальное число
    cell.dataset.original = cell.textContent.trim();

    // Очищаем ячейку
    cell.innerHTML = '';
    cell.style.padding = '0';

    // Создаём кнопку через универсальную функцию
const btn = createSpotifyButton(url, 'standings', trackName);

// ❌ НЕ ПЕРЕТИРАЕМ КЛАССЫ
btn.classList.add('standings-spotify-overlay');

// 🔥 убираем лишнее поведение ссылок (на всякий)
btn.href = '#';

cell.appendChild(btn);

    activeSpotifyCell = cell;
});

document.addEventListener('click', function (e) {

    if (!activeSpotifyCell) return;

    const clickedInsideCell = e.target.closest('.position-cell');

    // если клик не по ячейке позиции
    if (!clickedInsideCell) {
        restorePositionCell(activeSpotifyCell);
        activeSpotifyCell = null;
    }

});

function restorePositionCell(cell) {
    if (!cell) return;

    const original = cell.dataset.original;
    cell.innerHTML = original;
    cell.style.padding = '';
}

// СЕРАЯ КНОПКА (100 к 1)

standingsBody.addEventListener('click', function (e) {

    const cell = e.target.closest('.team-cell');
    if (!cell) return;

    // работает только если столбец скрыт
    if (!document.body.classList.contains('teams-column-hidden')) return;

    // переключение конкретной команды
    cell.classList.toggle('team-visible');

});

/* ======================================================
   📊 ФОРМА , ЗГ/ПГ, СЕРИИ — ДЛЯ ВТОРОГО МОДАЛЬНОГО ОКНА
====================================================== */

function buildTeamTrackMap() {
    if (TEAM_BY_TRACK) return TEAM_BY_TRACK;

    TEAM_BY_TRACK = new Map();

    for (const tour of tournamentData.schedule) {
        if (!tour) continue;

        for (const m of tour) {
            if (!m) continue;

            [m.team1, m.team2].forEach(team => {
                const { artist, track } = parseArtistAndTrack(team);
                const safeTrack = track || artist;

                TEAM_BY_TRACK.set(
                    normalizeText(stripInlineColors(safeTrack)),
                    team
                );
            });
        }
    }

    return TEAM_BY_TRACK;
}

async function getAllMatchesCached() {
    if (ALL_MATCHES_CACHE) return ALL_MATCHES_CACHE;

    const tx = db.transaction(['schedule'], 'readonly');
    const store = tx.objectStore('schedule');

    ALL_MATCHES_CACHE = await new Promise(resolve => {
    store.getAll().onsuccess = e => resolve(e.target.result);
});

// 🔥 сразу строим быстрый доступ
ALL_MATCHES_MAP = new Map();

for (const m of ALL_MATCHES_CACHE) {
    if (!m) continue;

    const k1 = getTeamKey(m.team1);
    const k2 = getTeamKey(m.team2);

    if (!ALL_MATCHES_MAP.has(k1)) ALL_MATCHES_MAP.set(k1, []);
    if (!ALL_MATCHES_MAP.has(k2)) ALL_MATCHES_MAP.set(k2, []);

    ALL_MATCHES_MAP.get(k1).push(m);
    ALL_MATCHES_MAP.get(k2).push(m);
}

    console.log('📦 DB загружена.');

    return ALL_MATCHES_CACHE;
}

function getTeamKey(team) {
    if (!team) return '';

    return normalizeText(
        normalizeTeamName(stripInlineColors(team))
    );
}

async function getLastPlayedMatchesFromDB(teamName, limit = 5) {
    const allMatches = await getAllMatchesCached();

    const cleanTeam = stripInlineColors(teamName);

    const isInactiveTeam = tournamentData.allTeams
        ?.find(t => stripInlineColors(t.teamName) === cleanTeam)
        ?.inactive;

    const teamMatches = ALL_MATCHES_MAP.get(getTeamKey(teamName)) || [];
const all = teamMatches.filter(m => {
    
        if (!m) return false;

        const isTeamMatch =
            getTeamKey(m.team1) === getTeamKey(teamName) ||
            getTeamKey(m.team2) === getTeamKey(teamName);

        if (!isTeamMatch) return false;

        if (!isInactiveTeam) {
            return (
                !m.isBye &&
                m.score1 !== null &&
                m.score2 !== null
            );
        }

        return (
            m.score1 !== null &&
            m.score2 !== null &&
            (m.isBye || m.technical)
        );
    });

    if (!all.length) return [];

    return all
        .sort((a, b) => b.tourIndex - a.tourIndex)
        .slice(0, limit)
        .reverse();
}

async function getStreaksFromDB(teamName) {
    const allMatches = await getAllMatchesCached();

    let win = 0;
    let clean = 0;
    let golden = 0;

        let cleanActive = true;
    let goldenActive = true;

    const teamMatches = ALL_MATCHES_MAP.get(getTeamKey(teamName)) || [];

    const matches = teamMatches
        .filter(m =>
            !m.isBye &&
            m.score1 !== null &&
            m.score2 !== null
        )
        .sort((a, b) => b.tourIndex - a.tourIndex);

    for (const m of matches) {
        const scored   = m.team1 === teamName ? m.score1 : m.score2;
        const conceded = m.team1 === teamName ? m.score2 : m.score1;

        if (scored <= conceded) break;

        win++;

        if (cleanActive && conceded === 0) clean++;
        else cleanActive = false;

        if (goldenActive && conceded === 0 && scored >= 4) golden++;
        else goldenActive = false;
    }

    return { win, clean, golden };
}

/**
 * Генерирует расписание турнира по схеме Round Robin и сохраняет в IndexedDB.
 * @param {number} numTeams - Общее количество команд.
 */
async function generateAndSaveSchedule(numTeams) {
    await clearScheduleStore(); // Очищаем старое расписание перед генерацией нового
    await clearTeamsStore(); // Очищаем команды, чтобы добавить их заново с UUID
    tournamentData.teams = [];

    const teamsInputText = teamsInput.value.trim();
    const urlsInputText = urlsInput.value.trim();

    const rawTeamNames = teamsInputText.split('\n').map(team => team.trim()).filter(team => team.length > 0);
    const rawUrls = urlsInputText.split('\n').map(u => u.trim()).filter(u => u.length > 0);

    if (rawTeamNames.length < 2) {
        alert('Для проведения турнира необходимо минимум 2 команды.');
        return;
    }

    // Сохраняем команды с UUID и учитываем ссылки по строкам — 1:1
    const savedTeams = [];
    for (let idx = 0; idx < rawTeamNames.length; idx++) {
        let name = rawTeamNames[idx];
        // Универсальная проверка ❌ (телефонный и обычный)
        const hasCross = hasCrossMark(name);

// Удаляем ❌ любого типа
        const cleanName = removeCrossMark(name);
        const spotifyUrl = rawUrls[idx] || ''; // если ссылка отсутствует — пусто
        const teamId = await addTeam(cleanName, spotifyUrl, hasCross, {
    initiallyBanned: hasCross
});
        savedTeams.push({
    id: teamId,
    teamName: cleanName,
    spotifyUrl: spotifyUrl,

    inactive: !!hasCross,

    // 🔥 КЛЮЧЕВОЕ ПОЛЕ
    initiallyInactive: !!hasCross
});

    }
    tournamentData.teams = savedTeams; // Обновляем глобальную переменную

    const teamNamesForRR = savedTeams.map(t => t.teamName);
let teamsForRoundRobin = teamNamesForRR.slice(); // обязательно let, потому что будет мутация
let numMatchesPerTour = 0;
let totalTours = 0;

// Если команд нечётное число — добавляем BYE
if (teamsForRoundRobin.length % 2 !== 0) {
    teamsForRoundRobin.push('BYE');
}

const numTeamsAdjusted = teamsForRoundRobin.length;
totalTours = numTeamsAdjusted - 1;

for (let round = 0; round < totalTours; round++) {
    const currentRoundFixtures = [];

    for (let i = 0; i < numTeamsAdjusted / 2; i++) {
        const team1Name = teamsForRoundRobin[i];
        const team2Name = teamsForRoundRobin[numTeamsAdjusted - 1 - i];
        const isByeMatch = team1Name === 'BYE' || team2Name === 'BYE';

        const team1Data = savedTeams.find(t => t.teamName === team1Name);
        const team2Data = savedTeams.find(t => t.teamName === team2Name);

        const team1Inactive = team1Data ? !!team1Data.inactive : false;
        const team2Inactive = team2Data ? !!team2Data.inactive : false;

        const match = {
            tourIndex: round,
            matchIndex: i,
            team1: team1Name,
            team2: team2Name,
            isBye: isByeMatch,
            spotifyUrl1: team1Data ? team1Data.spotifyUrl : '',
            spotifyUrl2: team2Data ? team2Data.spotifyUrl : '',
            score1: null,
            score2: null,
            technical: false
        };

        if (isByeMatch) {
            match.isBye = true;
            match.technical = false;
            match.score1 = null;
            match.score2 = null;
        } else if (team1Inactive && !team2Inactive) {
            match.isBye = true;
            match.technical = true;
            match.score1 = 0;
            match.score2 = 3;
        } else if (!team1Inactive && team2Inactive) {
            match.isBye = true;
            match.technical = true;
            match.score1 = 3;
            match.score2 = 0;
        } else if (team1Inactive && team2Inactive) {
            match.isBye = true;
            match.technical = false;
            match.score1 = null;
            match.score2 = null;
        } else {
            match.isBye = false;
            match.technical = false;
            match.score1 = null;
            match.score2 = null;
        }

        currentRoundFixtures.push(match);
    }

    numMatchesPerTour = currentRoundFixtures.length;

    // Сохраняем матчи в базу
    for (const match of currentRoundFixtures) {
        await addMatch(match);
    }

    // --- Новая идеальная ротация Round Robin (ВАРИАНТ A — как в твоих примерах) ---
    // Сдвигаем команды на 1 позицию влево, кроме первой
    // Пример:
    // Тур 1: [1,2,3,4,5,6]
    // Тур 2: [1,3,4,5,6,2]
    const fixed = teamsForRoundRobin[0];
    const tail = teamsForRoundRobin.slice(1);

    // циклический сдвиг влево
    const firstTail = tail.shift();
    tail.push(firstTail);

    // собираем массив обратно
    teamsForRoundRobin.length = 0;
    teamsForRoundRobin.push(fixed, ...tail);
}

    // Сохраняем настройки
    await saveSettings({ totalTeams: savedTeams.length, currentTourIndex: 0, teamsPerTour: numMatchesPerTour });
    tournamentData.totalTours = totalTours;

    await saveSettings({ totalTeams: savedTeams.length, currentTourIndex: 0, teamsPerTour: numMatchesPerTour });
    tournamentData.totalTours = totalTours;

    const toursText = formatTours(totalTours);

    console.log(`Расписание сгенерировано (${toursText}, ${numMatchesPerTour} матчей за тур).`);
    alert(`Расписание сгенерировано (${toursText}).`);

    // 🧹 сброс лучших матчей после генерации нового расписания
{
    const tx = db.transaction(['bestMatches'], 'readwrite');
    const store = tx.objectStore('bestMatches');
    store.clear();
}

for (const key in bestMatchesByTour) {
    delete bestMatchesByTour[key];
}

    // Обновляем UI
    updateTourNavigation();

await renderStandingsFromDB();

await withStableScroll(async () => {
    await displayTour(0);
});

    // 🔥 ДОБАВЛЕНО — подсветка после полной отрисовки
    applyAuto33Relegation();
    highlightMatchesWithRelegationTeams();

// 🔥 ВОССТАНАВЛИВАЕМ ПОДСВЕТКУ ИГРАЮЩЕГО ТРЕКА
    restoreActiveTrackHighlight();

    enableButtons();
    generateBtn.disabled = false; // Отключаем кнопку генерации
}

/* ======================================================
   🪟 РЕНДЕР ВТОРОГО МОДАЛЬНОГО ОКНА (ФОРМА И СЕРИИ)
====================================================== */

async function renderFormStandingsFromDB() {
    const tbody = document.getElementById('formStandingsBody');
    tbody.innerHTML = '';

    const allTeams = await getAllTeams();
    const rows = [];

    for (const t of allTeams) {
        const team = t.teamName;
        const matches = await getLastPlayedMatchesFromDB(team, 5);
        const { win, clean, golden } = await getStreaksFromDB(team);

        let gf = 0, ga = 0;
const formItems = [];

for (const m of matches) {
    const isTeamLeft =
    stripInlineColors(m.team1) === stripInlineColors(team);

const leftTeam  = stripInlineColors(team);
const rightTeam = stripInlineColors(isTeamLeft ? m.team2 : m.team1);

const leftGoals  = isTeamLeft ? m.score1 : m.score2;
const rightGoals = isTeamLeft ? m.score2 : m.score1;

const scored   = leftGoals;
const conceded = rightGoals;

    gf += scored;
    ga += conceded;

    let icon = '🟨';
    if (scored > conceded) icon = '✅';
    else if (scored < conceded) icon = '❌';

    const title = `${m.tourIndex + 1} тур, ${leftTeam} ${leftGoals} – ${rightGoals} ${rightTeam}`;

    formItems.push({
        icon,
        title
    });
}

        const formHtml = formItems
    .map(item => `<span title="${item.title}">${item.icon}</span>`)
    .join('');

// разница голов за последние 5 матчей
let diff = gf - ga;

rows.push({
    team,
    win,
    clean,
    golden,
    form: formHtml,
    gf,
    ga,
    diff
});
    }

    // сортировка по разнице за последние 5 матчей
    rows.sort((a, b) => {
    return b.diff - a.diff;
});

    rows.forEach((r, i) => {
    const tr = document.createElement('tr');

    // 🧹 чистим ТОЛЬКО отображаемое имя
    const cleanTeamName = stripInlineColors(r.team);

    tr.innerHTML = `
        <td>${i + 1}</td>
        <td class="team-cell">${cleanTeamName}</td>
        <td>${r.win}</td>
        <td>${r.clean}</td>
        <td>${r.golden}</td>
        <td class="form-icons">${r.form}</td>
        <td>${r.gf}:${r.ga}</td>
        <td>${r.diff}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderWinStreak(count) {
    let html = '<div class="win-streak">';
    for (let i = 0; i < 5; i++) {
        let cls = 'streak-box gray';
        if (i === 3) cls = 'streak-box light';
        if (i === 4) cls = 'streak-box gold';
        if (i < count) cls += ' filled';
        html += `<div class="${cls}"></div>`;
    }
    html += '</div>';
    return html;
}

// ===============================
// 🔥 STABLE SCROLL WRAPPER (FINAL)
// ===============================
async function withStableScroll(callback) {
    const scrollY = window.scrollY;

    const el = document.querySelector('#currentTourOutput');

    // 🔥 фиксируем высоту ДО рендера
    let height = 0;
    if (el) {
        height = el.offsetHeight;
        el.style.minHeight = height + 'px';
    }

    // выполняем изменения DOM
    await callback();

    // 🔥 возвращаем скролл
    window.scrollTo(0, scrollY);

    // 🔥 проверяем — есть ли вообще контент
    if (el) {
        const hasContent = el.children.length > 0;

        // если после фильтра ничего нет → добавляем empty-state
        if (!hasContent) {
            el.innerHTML = `
                <div class="empty-state">
                    Нет матчей по фильтру
                </div>
            `;
        }
    }

    // 🔥 мягкий сброс высоты (как у тебя было)
    setTimeout(() => {
        if (el) el.style.minHeight = '';
    }, 250);
}

// ЗАПРЕТ 4:0 для фаворитов

const FORBIDDEN_FOUR_TRACKS = [
    "Kai Angel – damage",
    "tuborosho, Anonymous Ember – А я Курю и Плачу",
    "тёмный принц – вклубе",
    "9mice – famous"
];

// КАЖДАЯ буква в поле ввода счёта это 0

function sanitizeScoreInput(e) {
    const input = e.target;

    // 🔹 оставляем только цифры
    let val = input.value.replace(/\D/g, '');

    // ❗ ВАЖНО: не подставляем 0 если пусто
    input.value = val;

    const row = input.closest('tr');
    if (!row) return;

    const inputA = row.querySelector('input[data-team="team1"]');
    const inputB = row.querySelector('input[data-team="team2"]');

    if (!inputA || !inputB) return;

    // если одно из полей пустое — не лезем
    if (inputA.value === '' || inputB.value === '') return;

    let a = parseInt(inputA.value);
    let b = parseInt(inputB.value);

    // 🔥 команды
    const teamSpans = row.querySelectorAll('.team-name');
    if (teamSpans.length < 2) return;

    const teamA = stripInlineColors(teamSpans[0].textContent);
    const teamB = stripInlineColors(teamSpans[1].textContent);

    const favA = FORBIDDEN_FOUR_TRACKS.some(t => teamA.includes(t));
    const favB = FORBIDDEN_FOUR_TRACKS.some(t => teamB.includes(t));

    // ❗ если вообще нет фаворита — ВЫХОД
    if (!favA && !favB) return;

    // =========================
    // 🔥 ПРАВИЛА
    // =========================

    // фаворит слева
    if (favA && a > b) {

        // ❌ 4:0 → 3:0
        if (a === 4 && b === 0) {
            a = 3;
        }

        // ❌ 3:1 → 4:1
        if (a === 3 && b === 1) {
            a = 4;
        }
    }

    // фаворит справа
    if (favB && b > a) {

        // ❌ 0:4 → 0:3
        if (b === 4 && a === 0) {
            b = 3;
        }

        // ❌ 1:3 → 0:3
        if (b === 3 && a === 1) {
            a = 0;
        }
    }

    // 🔥 записываем обратно
    inputA.value = a;
    inputB.value = b;
}

/**
 * Отображает матчи текущего тура.
 * @param {number} tourIndex - Индекс тура для отображения.
 */
async function displayTour(tourIndex) {
    currentTourIndex = tourIndex;

    currentTourOutput.innerHTML = ''; // Очищаем предыдущий тур

    const currentTourMatches = await getMatchesByTour(tourIndex);

    // 🚀 гарантируем разрежённое хранение
    if (!Array.isArray(tournamentData.schedule)) {
        tournamentData.schedule = [];
    }

    tournamentData.schedule[tourIndex] = currentTourMatches; // Сохраняем в памяти

    // Проверка статистики тура (количество незаполненных матчей)
    let unfilledScores = 0;
    currentTourMatches.forEach(match => {
        if (!match.isBye && (match.score1 === null || match.score2 === null)) {
            unfilledScores++;
        }
    });

    if (unfilledScores > 0) {
        tourStatsDiv.innerHTML = `<span class="error">Есть ${unfilledScores} незаполненных матчей.</span>`;
        tourStatsDiv.classList.add('error');
    } else {
        tourStatsDiv.innerHTML = "Статистика тура: OK";
        tourStatsDiv.classList.remove('error');
    }

    if (!currentTourMatches || currentTourMatches.length === 0) {
        currentTourOutput.innerHTML = '<p>В этом туре нет матчей.</p>';
        return;
    }

    const table = document.createElement('table');
    const thead = table.createTHead();
    const tbody = table.createTBody();

    const headerRow = thead.insertRow();
    // Формат: # | [S] | Команда 1 | Счёт1 | Счёт2 | Команда 2 | [S]
    headerRow.innerHTML = `
        <th>#</th>
        <th></th>
        <th>Команда 1</th>
            <th colspan="2">Счёт</th>
        <th>Команда 2</th>
        <th></th>
        <th></th> <!-- Пустая ячейка для действий -->
    `;

    let hasMatches = false; // 🔥 ДОБАВИТЬ ПЕРЕД forEach

currentTourMatches.forEach((match, matchIndex) => {
    if (!matchPassesScoreFilter(match)) return;
    if (!matchPassesArtistFilter(match)) return;

    hasMatches = true; // 🔥 ВАЖНО

    const row = tbody.insertRow();
        row.dataset.matchId = match.id; // Добавляем ID матча для удобства

        // Класс для BYE матчей (визуально)
        if (match.isBye) {
            row.classList.add('bye-match');
        }

            // --- Подсветка при загрузке тура ---
if (!match.isBye && match.score1 !== null && match.score2 !== null) {

    // Удаляем прошлые классы, если тур рисуется повторно
    row.classList.remove('draw-match', 'total4-match', 'draw-row', 'total4-row');

    if (match.score1 === match.score2) {
        // Приоритет ничьей — ТОЛЬКО ничья, без тотал=4
        row.classList.add('draw-match', 'draw-row');
    } else if (match.score1 + match.score2 === 4) {
        // Тотал 4 — только если не ничья
        row.classList.add('total4-match', 'total4-row');
    }
}

        // Номер матча
        const matchNumCell = row.insertCell(0);
matchNumCell.innerHTML = `<span class="cell-text">${matchIndex + 1}</span>`;

        // Spotify кнопка для Команды 1
        const spotifyBtnCell1 = row.insertCell(1);
        spotifyBtnCell1.style.width = '36px';
        spotifyBtnCell1.style.textAlign = 'center';
        const spotifyUrl1 = match.spotifyUrl1 || '';
        const spotifyBtn1 = createSpotifyButton(spotifyUrl1, 'default', match.team1);
        spotifyBtnCell1.appendChild(spotifyBtn1);

        // Команда 1
const team1Cell = row.insertCell(2);
team1Cell.classList.add('match-teams', 'team-left');

const rawTeam1 = match.team1;
const cleanTeam1 = stripInlineColors(rawTeam1);

// 🟦 КВАДРАТ ЦВЕТА
const colorSquare1 = document.createElement('div');
colorSquare1.classList.add('color-square');
team1Cell.appendChild(colorSquare1);

// 📝 ТЕКСТ КОМАНДЫ (БЕЗ HEX)
const team1NameSpan = document.createElement('span');
team1NameSpan.classList.add('team-name');
team1NameSpan.textContent = cleanTeam1;
team1Cell.appendChild(team1NameSpan);

// 🔥 ЦВЕТА — ПО СЫРОЙ СТРОКЕ
applySpecialTrackHighlight(team1Cell, rawTeam1);
applyInlineColorSquare(colorSquare1, rawTeam1);

        // Счет Команды 1 (input) — если матч не isBye и не technical
        const score1Cell = row.insertCell(3);
        const score1Input = document.createElement('input');
        score1Input.type = 'text';
        score1Input.inputmode = 'numeric';
        score1Input.pattern = '[0-9]*';
        score1Input.min = '0';
        score1Input.value = (match.score1 !== null && match.score1 !== undefined) ? match.score1 : '';
        score1Input.disabled = match.isBye || match.technical;
        score1Input.dataset.team = 'team1';
        score1Input.dataset.matchId = match.id;
        score1Input.classList.add('score-input');
        score1Input.autocomplete = 'off';
        score1Input.maxLength = '3';
    score1Input.addEventListener('input', sanitizeScoreInput);
    score1Input.addEventListener('change', handleScoreInputChange);
        score1Cell.appendChild(score1Input);

        // Счет Команды 2 (input)
        const score2Cell = row.insertCell(4);
        const score2Input = document.createElement('input');
        score2Input.type = 'text';
        score2Input.inputmode = 'numeric';
        score2Input.pattern = '[0-9]*';
        score2Input.min = '0';
        score2Input.value = (match.score2 !== null && match.score2 !== undefined) ? match.score2 : '';
        score2Input.disabled = match.isBye || match.technical;
        score2Input.dataset.team = 'team2';
        score2Input.dataset.matchId = match.id;
        score2Input.classList.add('score-input');
        score2Input.autocomplete = 'off';
        score2Input.maxLength = '3';
    score2Input.addEventListener('input', sanitizeScoreInput);
    score2Input.addEventListener('change', handleScoreInputChange);
        score2Cell.appendChild(score2Input);

        // Команда 2
const team2Cell = row.insertCell(5);
team2Cell.classList.add('match-teams', 'team-right');

const rawTeam2 = match.team2;
const cleanTeam2 = stripInlineColors(rawTeam2);

// 🟦 КВАДРАТ ЦВЕТА
const colorSquare2 = document.createElement('div');
colorSquare2.classList.add('color-square');
team2Cell.appendChild(colorSquare2);

// 📝 ТЕКСТ КОМАНДЫ (БЕЗ HEX)
const team2NameSpan = document.createElement('span');
team2NameSpan.classList.add('team-name');
team2NameSpan.textContent = cleanTeam2;
team2Cell.appendChild(team2NameSpan);

// 🔥 ЦВЕТА — ПО СЫРОЙ СТРОКЕ
applySpecialTrackHighlight(team2Cell, rawTeam2);
applyInlineColorSquare(colorSquare2, rawTeam2);

        // Spotify кнопка для Команды 2
        const spotifyBtnCell2 = row.insertCell(6);
        spotifyBtnCell2.style.width = '36px';
        spotifyBtnCell2.style.textAlign = 'center';
        const spotifyUrl2 = match.spotifyUrl2 || '';
        const spotifyBtn2 = createSpotifyButton(spotifyUrl2, 'default', match.team2);
        spotifyBtnCell2.appendChild(spotifyBtn2);

        // Кнопка "Сохранить"/"Изменить"
        const actionsCell = row.insertCell(7);
        const actionBtn = document.createElement('button');
        actionBtn.textContent = (match.score1 !== null && match.score2 !== null) ? 'Изменить' : 'Сохранить';
        actionBtn.dataset.matchId = match.id;
        actionBtn.disabled = match.isBye || match.technical;
        actionBtn.tabIndex = -1; // ← 🔥 ВАЖНО (tab)
        actionBtn.addEventListener('click', handleSaveOrUpdateScore);
        actionsCell.appendChild(actionBtn);
    });

    if (!hasMatches) {
    currentTourOutput.innerHTML = `
        <div class="empty-state">
            Нет матчей по фильтру
        </div>
    `;
    return;
}

currentTourOutput.appendChild(table);

    // ⭐ лучшие матчи перерисовываем ТОЛЬКО если фильтр выключен
if (!activeScoreFilter) {
    await renderBestMatchesForTour(tourIndex);
}

// ===============================
    // 🔎 Обновление подписи фильтра "Артист"
    // при ЛЮБОЙ перерисовке тура
    // ===============================
    const result = document.getElementById('artistFilterResult');

if (result) {
    if (activeMatchArtistFilter && activeMatchArtistFilter.trim()) {
        const matches = countArtistMatchesInCurrentTour(activeMatchArtistFilter);
        result.textContent = `Матчей с этим артистом в этом туре: ${matches}`;
        result.style.display = 'block';
    } else {
        result.textContent = '';
        result.style.display = 'none';
    }
}

    // ⚠️ initBestMatchesUI вызывается ВНУТРИ renderBestMatchesForTour
}

/* ==========================
   🎯 ФИЛЬТР ПО СЧЁТУ
========================== */

function matchPassesScoreFilter(match) {
    if (!activeScoreFilter) return true;

    // 🎯 ФИЛЬТР "0" — незаполненные матчи
    if (activeScoreFilter === '0') {
        if (match.isBye) return false;
        return match.score1 === null || match.score2 === null;
    }

    // ⛔ для остальных фильтров — матч должен быть заполнен
    if (
        match.score1 === null ||
        match.score2 === null ||
        match.isBye
    ) return false;

    const a = match.score1;
    const b = match.score2;

    const min = Math.min(a, b);
    const max = Math.max(a, b);

    switch (activeScoreFilter) {

    case '3:0':
        return max === 3 && min === 0;

    case '2:1':
        return max === 2 && min === 1;

    case '4:0':
        // ✅ ТОЛЬКО тотал 4 (4:0, 3:1)
        return (
            (max === 4 && min === 0) ||
            (max === 3 && min === 1)
        );

    case 'other':
        return !(
            (max === 3 && min === 0) ||
            (max === 2 && min === 1) ||
            (max === 4 && min === 0) ||
            (max === 3 && min === 1)
        );

    default:
        return true;
    }
}

/* ==========================
   ⭐ ЛУЧШИЕ МАТЧИ ТУРА
========================== */

function initBestMatchesUI() {
    const slots = document.querySelectorAll('.best-match-slot');

    slots.forEach(slot => {
        const input = slot.querySelector('input');
        if (!input) return;

        input.addEventListener('change', async () => {
    const matchNumber = parseInt(input.value, 10);
    if (!matchNumber || matchNumber < 1) return;

    const match = getMatchByNumberInCurrentTour(matchNumber);
    if (!match) {
        alert('Матч с таким номером не найден');
        return;
    }

    const tourIndex = currentTourIndex;
    if (!bestMatchesByTour[tourIndex]) {
        bestMatchesByTour[tourIndex] = [];
    }

    const slotIndex = [...slot.parentNode.children].indexOf(slot);
    bestMatchesByTour[tourIndex][slotIndex] = matchNumber;

    // ✅ РЕАЛЬНО сохраняем в DB
    await saveBestMatchesForTour(tourIndex, bestMatchesByTour[tourIndex]);

    slot.innerHTML = buildBestMatchLine(match);
  });
 });
}

/* 🔎 получить матч по номеру в текущем туре */
function getMatchByNumberInCurrentTour(number) {
    const tourIndex = currentTourIndex;
    const tourMatches = tournamentData.schedule[tourIndex];
    if (!tourMatches) return null;

    return tourMatches[number - 1] || null;
}

/* 🧱 построение строки */
function buildBestMatchLine(match, matchNumber) {

    const team1 = stripInlineColors(match.team1);
    const team2 = stripInlineColors(match.team2);

    const score =
        match.score1 !== null && match.score2 !== null
            ? `${match.score1} : ${match.score2}`
            : '- : -';

    const spotify1 = match.spotifyUrl1
    ? `<a href="#"
         class="spotify-link"
         onclick="playInGlobalPlayer('${match.spotifyUrl1}'); return false;">
         S
       </a>`
    : '';

    const spotify2 = match.spotifyUrl2
    ? `<a href="#"
         class="spotify-link"
         onclick="playInGlobalPlayer('${match.spotifyUrl2}'); return false;">
         S
       </a>`
    : '';

    return `
    <div class="best-match-line">
    <button class="remove-best-match">✕</button>
    ${spotify1}

    <div class="best-match-center">
    <span class="team team-left">${team1}</span>
    <span class="score">${score}</span>
    <span class="team team-right">${team2}</span>
</div>

    ${spotify2}
</div>
`;
}

// логика удаления - крестик ❌ удаление лучшего матча
document.addEventListener('click', async e => {
    if (!e.target.classList.contains('remove-best-match')) return;

    const slot = e.target.closest('.best-match-slot');
    const slots = [...slot.parentNode.children];
    const slotIndex = slots.indexOf(slot);

    const tourIndex = currentTourIndex;

    if (bestMatchesByTour[tourIndex]) {
        bestMatchesByTour[tourIndex][slotIndex] = null;

        // ✅ сохраняем после удаления
        await saveBestMatchesForTour(
            tourIndex,
            bestMatchesByTour[tourIndex]
        );
    }

    slot.innerHTML = '';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = 1;
    input.placeholder = '№ матча';
    slot.appendChild(input);

    initBestMatchesUI();
});

// ❌ УДАЛЕНО
// восстановление лучших матчей выполняется ТОЛЬКО через IndexedDB

/**
 * Создаёт маленькую кнопку [S]. Если url пустой — серый некликабельный квадратик.
 * Если url есть — зелёная ссылка (квадратная) с буквой S внутри.
 * Возвращает HTMLElement (a или button).
 */

// 🔥 определяем платформу
function getPlatformName(url) {
    if (url.includes('soundcloud.com')) return 'SoundCloud';
    if (url.includes('spotify.com')) return 'Spotify';
    return 'Unknown';
}

function createSpotifyButton(url, variant = 'default', trackName = '') {    const size = 28;

    if (url && url.length > 0) {
        const a = document.createElement('a');

        a.href = "#";
        a.className = 'spotify-btn';
        a.tabIndex = -1;
        a.title = 'Play in tournament player';

        const urls = url.split(' / ').map(s => s.trim());

if (urls.length === 1) {
    // обычный режим
    a.addEventListener('click', function (e) {
        e.preventDefault();
        playInGlobalPlayer(urls[0], this);
    });
} else {
    // 🔥 SPLIT-РЕЖИМ

    let pressTimer = null;
    let longPressTriggered = false;

    const cleanName = stripInlineColors(trackName);

    // 🔥 делим артист и трек

    // 🔥 сначала убираем ВСЕ скобки (там могут быть даты с /)
const noBrackets = trackName.replace(/\([^)]*\)/g, '').trim();

// 🔥 теперь безопасно делим
const parts = noBrackets.split('–');
const artist = parts[0]?.trim() || '';
const trackPart = parts[1]?.trim() || '';

// 🔥 теперь / только для реальных треков
const trackSplit = trackPart.split(' / ').map(s => s.trim()).filter(Boolean);

    // 🎯 MOUSEMOVE → динамический title
    a.addEventListener('mousemove', (e) => {
        const rect = a.getBoundingClientRect();
        const x = e.clientX - rect.left;

        const isLeft = x < rect.width / 2;

        let title = '';

        // ✅ СЛУЧАЙ 1: два трека
        if (trackSplit.length === 2 && artist) {
    const chosenTrack = isLeft ? trackSplit[0] : trackSplit[1];
    title = `${artist} – ${chosenTrack}`;
}

        // ✅ СЛУЧАЙ 2: один трек, две ссылки
        else {
    const platform = getPlatformName(isLeft ? urls[0] : urls[1]);

    // 🔥 если вдруг artist не распарсился — используем чистое имя
    if (!artist || !trackPart) {
        title = `${cleanName} (${platform})`;
    } else {
        title = `${artist} – ${trackPart} (${platform})`;
    }
}

        a.title = title;
    });

    // desktop + mobile определение стороны
    a.addEventListener('click', function (e) {
        e.preventDefault();

        // если уже был long press — игнорим клик
        if (longPressTriggered) {
            longPressTriggered = false;
            return;
        }

        const rect = a.getBoundingClientRect();
        const x = e.clientX - rect.left;

        const chosenUrl = (x < rect.width / 2)
            ? urls[0]
            : urls[1];

        playInGlobalPlayer(chosenUrl, a);
    });

    // 📱 LONG PRESS = правая ссылка
    a.addEventListener('touchstart', () => {
        longPressTriggered = false;

        pressTimer = setTimeout(() => {
            longPressTriggered = true;
            playInGlobalPlayer(urls[1], a);
        }, 400);
    });

    a.addEventListener('touchend', () => {
        clearTimeout(pressTimer);
    });
}

        // базовые стили
        a.style.display = 'inline-flex';
        a.style.alignItems = 'center';
        a.style.justifyContent = 'center';
        a.style.width = `${size}px`;
        a.style.height = `${size}px`;
        a.style.borderRadius = '4px';
        a.style.color = '#ffffff';
        a.style.textDecoration = 'none';
        a.style.fontWeight = '700';
        a.style.boxSizing = 'border-box';

        // 🎵 платформа
if (urls.length > 1) {
    a.classList.add('split');
    a.textContent = 'S';
    a.style.fontSize = '16px';
}
else if (url.includes("soundcloud.com")) {
            a.style.backgroundColor = '#ff7500';
            a.textContent = 'SC';
            a.style.fontSize = '15px';
        } else {
            a.style.backgroundColor = '#1DB954';
            a.textContent = 'S';
            a.style.fontSize = '16px';
        }

        // 🔥 ВАРИАНТЫ
        if (variant === 'standings') {
            a.classList.add('standings-spotify-overlay');
        }

        return a;
    } else {
        const btn = document.createElement('button');

        btn.type = 'button';
        btn.className = 'spotify-btn disabled';
        btn.disabled = true;
        btn.tabIndex = -1;
        btn.title = 'Нет ссылки';

        btn.style.display = 'inline-flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.width = `${size}px`;
        btn.style.height = `${size}px`;
        btn.style.borderRadius = '4px';
        btn.style.backgroundColor = '#6b6b6b';
        btn.style.color = '#ffffff';
        btn.style.border = 'none';
        btn.style.fontWeight = '700';
        btn.textContent = 'S';

        return btn;
    }
}

/**
 * Обновляет элементы навигации по турам.
 */
function updateTourNavigation() {
    if (!tournamentData || !tournamentData.totalTours || tournamentData.totalTours === 0) {
        totalToursNumSpan.textContent = '0';
        currentTourNumSpan.textContent = '1';
        prevTourBtn.disabled = true;
        nextTourBtn.disabled = true;
        tourJumpInput.disabled = true;
        jumpToTourBtn.disabled = true;
        return;
    }
    totalToursNumSpan.textContent = tournamentData.totalTours;
    currentTourNumSpan.textContent = tournamentData.currentTourIndex + 1;
    tourJumpInput.max = tournamentData.totalTours;
    tourJumpInput.value = '';

    prevTourBtn.disabled = tournamentData.currentTourIndex === 0;
    nextTourBtn.disabled = tournamentData.currentTourIndex >= tournamentData.totalTours - 1;
    tourJumpInput.disabled = false;
    jumpToTourBtn.disabled = false;
}

/**
 * Отображает полное расписание в модальном окне.
 */
async function renderFullScheduleModal() {
    fullScheduleContent.innerHTML = '';
    const settings = await loadSettings();

    if (!tournamentData.teams || tournamentData.teams.length === 0 || !settings.totalTeams) {
        fullScheduleContent.innerHTML = '<p>Турнир не был сгенерирован.</p>';
        return;
    }

    function createGap(size = 12) {
    const gap = document.createElement('div');
    gap.className = `grid-gap gap-${size}`;
    return gap;
}

    // Загрузим все матчи для полноты
    const transaction = db.transaction(['schedule'], 'readonly');
    const store = transaction.objectStore('schedule');
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = (event) => {
        const allMatches = event.target.result;
        const matchesByTour = Array.from({ length: tournamentData.totalTours }, () => []);

        allMatches.forEach(match => {
            if (match.tourIndex !== undefined && match.tourIndex < matchesByTour.length) {
                matchesByTour[match.tourIndex].push(match);
            }
        });

        // Сортируем матчи внутри каждого тура по matchIndex
        matchesByTour.forEach(tourMatches => {
            tourMatches.sort((a, b) => a.matchIndex - b.matchIndex);
        });

        matchesByTour.forEach((tour, tourIndex) => {
            const tourBlock = document.createElement('div');
            tourBlock.classList.add('tour-block');
            tourBlock.innerHTML = `<h3>Тур ${tourIndex + 1}</h3>`;

            if (tour.length === 0) {
                tourBlock.innerHTML += '<p>Нет матчей в этом туре.</p>';
            } else {
                tour.forEach((match, matchIndex) => {
                    // 🎯 фильтр по счёту
                    if (!matchPassesScoreFilter(match)) return false;
                    if (!matchPassesArtistFilter(match)) return false;

                    const matchDiv = document.createElement('div');
                    matchDiv.classList.add('match');

                    let scoreDisplay = '';
                    if (match.isBye) {
                        if (match.technical) {
                            // показать технич.результат
                            scoreDisplay = `${match.score1 !== null ? match.score1 : '-'} : ${match.score2 !== null ? match.score2 : '-'}`;
                        } else {
                            scoreDisplay = 'BYE';
                        }
                    } else if (match.score1 !== null && match.score2 !== null) {
                        scoreDisplay = `${match.score1} : ${match.score2}`;
                    } else {
                        scoreDisplay = '- : -';
                    }

const spotify1Link = match.spotifyUrl1
    ? `<a href="#"
         class="spotify-link"
         onclick="playInGlobalPlayer('${match.spotifyUrl1}'); return false;">
         S
       </a>`
    : '<span class="spotify-link disabled">S</span>';

const spotify2Link = match.spotifyUrl2
    ? `<a href="#"
         class="spotify-link"
         onclick="playInGlobalPlayer('${match.spotifyUrl2}'); return false;">
         S
       </a>`
    : '<span class="spotify-link disabled">S</span>';

let team1Display = '';
let team2Display = '';

if (match.isBye && !match.technical) {
    // 🟡 ПРОПУСК ТУРА
    team1Display = stripInlineColors(match.team1);
    team2Display = 'BYE';
} else if (match.isBye && match.technical) {
    // ❌ ДИСКВАЛИФИКАЦИЯ
    team1Display = `${stripInlineColors(match.team1)} (❌)`;
    team2Display = `${stripInlineColors(match.team2)} (❌)`;
} else {
    // ✅ ОБЫЧНЫЙ МАТЧ
    team1Display = stripInlineColors(match.team1);
    team2Display = stripInlineColors(match.team2);
}

// ====== КОМАНДА 1 ======
const team1Div = document.createElement('div');
team1Div.classList.add('match-teams', 'team-left');

const colorSquare1 = document.createElement('div');
colorSquare1.className = 'color-square';
team1Div.appendChild(colorSquare1);

const team1Content = document.createElement('div');
team1Content.className = 'team-content';
team1Content.insertAdjacentHTML('beforeend', spotify1Link);

const team1Span = document.createElement('span');
team1Span.className = 'team-name';
team1Span.textContent = team1Display;
team1Content.appendChild(team1Span);

team1Div.appendChild(team1Content);

// ====== СЧЁТ ======
const scoreDiv = document.createElement('div');
scoreDiv.className = 'score-display';
scoreDiv.textContent = scoreDisplay;

// ====== КОМАНДА 2 ======
const team2Div = document.createElement('div');
team2Div.classList.add('match-teams', 'team-right');

const colorSquare2 = document.createElement('div');
colorSquare2.className = 'color-square';
team2Div.appendChild(colorSquare2);

// 🔥 НОВЫЙ КОНТЕЙНЕР
const team2Content = document.createElement('div');
team2Content.className = 'team-content';

// Название — ПЕРВЫМ
const team2Span = document.createElement('span');
team2Span.className = 'team-name';
team2Span.textContent = team2Display;
team2Content.appendChild(team2Span);

// Spotify S — ВТОРЫМ
team2Content.insertAdjacentHTML('beforeend', spotify2Link);

team2Div.appendChild(team2Content);

// ====== ВСТАВКА ======
matchDiv.appendChild(team1Div);
matchDiv.appendChild(scoreDiv);
matchDiv.appendChild(team2Div);

applyInlineColorSquare(colorSquare1, match.team1);
applyInlineColorSquare(colorSquare2, match.team2);

                    tourBlock.appendChild(matchDiv);
                });
            }
            fullScheduleContent.appendChild(tourBlock);
        });
    };

    getAllRequest.onerror = (event) => {
        console.error("Ошибка загрузки матчей для модального окна:", event.target.error);
        fullScheduleContent.innerHTML = '<p>Ошибка загрузки расписания.</p>';
    };
}

/**
 * Обработчик изменения значения в полях ввода счета.
 * @param {Event} event - Событие изменения.
 */
function handleScoreInputChange(event) {
    const input = event.target;
    const matchId = input.dataset.matchId;
    const team = input.dataset.team;
    const value = parseInt(input.value);

    // Очищаем, если введено некорректное значение
    if (isNaN(value) || value < 0) {
        input.value = '';
        // Обновляем значение в памяти и DB
        updateMatchScoreInMemoryAndDB(matchId, team, null);
        return;
    }

    // Обновляем значение в памяти и DB
    updateMatchScoreInMemoryAndDB(matchId, team, value);

    // Проверяем, введены ли оба счета, и если да, активируем кнопку "Сохранить"
    const row = input.closest('tr');
    const score1Input = row.querySelector('input[data-team="team1"]');
    const score2Input = row.querySelector('input[data-team="team2"]');
    const saveBtn = row.querySelector('button');

    if (score1Input && score2Input && saveBtn) {
        if (score1Input.value !== '' && score2Input.value !== '') {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Сохранить'; // Устанавливаем текст кнопки
        } else {
            saveBtn.disabled = true; // Если хотя бы одно поле пустое, кнопка отключена
            saveBtn.textContent = 'Сохранить'; // Возвращаем текст кнопки
        }
    }

    // --- Подсветка строки после изменения счёта ---
row.classList.remove('draw-match', 'total4-match', 'draw-row', 'total4-row');

// читаем значения снова, только что введённые
const s1 = score1Input.value === '' ? null : parseInt(score1Input.value);
const s2 = score2Input.value === '' ? null : parseInt(score2Input.value);

if (s1 !== null && s2 !== null) {

    if (s1 === s2) {
        // приоритет ничьи
        row.classList.add('draw-match', 'draw-row');

    } else if (s1 + s2 === 4) {
        // тотал 4 только если НЕ ничья
        row.classList.add('total4-match', 'total4-row');
    }
  }
}

const SPECIAL_TRACKS = {
  "fonforino|темный принц|черный": {
    year: 2024,
    colors: ["#050016", "#051836"]
  },
  "madk1d|мориарти": {
    year: 2024,
    colors: ["#cd04df", "#9f11c6"]
  },
  "шипы|стрипсы": {
    year: 2024,
    colors: ["#7aafe3", "#eedba6", "#f6f7ec"]
  },
  "zavet|buy me": {
    year: 2021,
    colors: ["#27a5ad", "#0d211c"]
  },
  "шипы|cowboyclicker|thepolepositionclub": {
    year: 2023,
    colors: ["#ff3c06", "#001b60", "#efa105"]
  },
  "mindless self indulgence|shut me up": {
    year: 2006,
    colors: ["#050608", "#5b292b", "#eed80f"]
  },
  "marjorie -w c sinclair|noah's ark": {
    year: 2022,
    colors: ["#d0afa6", "#bebebe", "#e9e9e9"]
  },
  "arlekin 40 000|data404|lottery billz|p2p": {
    year: 2024,
    colors: ["#850a11", "#dd0f19", "#f2d985"]
  },
  "a v g|goro|она близко": {
    year: 2023,
    colors: ["#1a191e", "#412a27", "#d2ac85"]
  },
  "cmh|слава кпсс|сэлфхарм": {
    year: 2023,
    colors: ["#49506d", "#d5dbe4"]
  },
  "пошлая молли|самый лучший эмо панк": {
    year: 2020,
    colors: ["#955f39", "#e99dbd", "#fefefe"]
  },
  "9mice|kai angel|fountainebleau": {
    year: 2024,
    colors: ["#131315", "#e2e4e5"]
  },
  "ken carson|rockstar lifestyle": {
    year: 2023,
    colors: ["#141314", "#4d464e"]
  },
  "2hollis|poster boy": {
    year: 2023,
    colors: ["#dfdfdf", "#cb2929"]
  },
  "benjamingotbenz|supernova": {
    year: 2020,
    colors: ["#186db9", "#e16a09", "#fdf6ed"]
  },
  "sqwore|бардак": {
    year: 2024,
    colors: ["#dfdfdf", "#fffc53"]
  },
  "tonser|exx": {
    year: 2024,
    colors: ["#27a5ad", "#e3d9d1", "#0f0f0f"]
  },
  "angelik|revetg|ss25": {
    year: 2024,
    colors: ["#afafb1", "#434247", "#000000"]
  },
  "oklou|family and friends": {
    year: 2024,
    colors: ["#dfdfdf", "#74aab8", "#ddc0a6"]
  },
  "хестон|benjamingotbenz|bratz": {
    year: 2022,
    colors: ["#f2bcc9", "#c7a991", "#8e6153"]
  }
};

/* ==========================
   🔧 NORMALIZE TRACK STRING
========================== */
function normalizeTrackString(str) {

    return str
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/[.,–—\-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/* ==========================
   🔍 MATCH SPECIAL TRACK
========================== */
function isSpecialTrack(trackName, key) {

    const normalizedTrack = normalizeTrackString(trackName);
    const parts = key.split("|");

    return parts.every(p =>
        normalizedTrack.includes(normalizeTrackString(p))
    );
}

// ==========================
// 🎨 Многоцветная подсветка — LAYER BLEND (FINAL)
// используется для 16 песен исключений
// ==========================

// 🎛 фиксированный режим
// (оставлен только Layer Blend)

/* ==========================
   🎨 ПОСТРОИТЕЛЬ ПОДСВЕТКИ
========================== */
function buildSpecialBackground(colors) {
    return buildLayerBlend(colors);
}

/* ==========================
   🟠 LAYER BLEND — ЧЁТКИЙ, БЕЗ МЫЛА
   • меньше прозрачности
   • нет ухода в фон (#2c2c2c / #272727)
========================== */
function buildLayerBlend(colors) {

    if (colors.length === 1) {
        return `linear-gradient(90deg,
            ${hexToRGBA(colors[0], 0.38)},
            ${hexToRGBA(colors[0], 0.38)})`;
    }

    if (colors.length === 2) {
        return `linear-gradient(90deg,
            ${hexToRGBA(colors[0], 0.40)} 0%,
            ${hexToRGBA(colors[0], 0.30)} 30%,
            ${hexToRGBA(colors[1], 0.30)} 70%,
            ${hexToRGBA(colors[1], 0.40)} 100%)`;
    }

    // 3 цвета (основной кейс)
    return `linear-gradient(90deg,
        ${hexToRGBA(colors[0], 0.42)} 0%,
        ${hexToRGBA(colors[0], 0.32)} 22%,

        ${hexToRGBA(colors[1], 0.36)} 40%,
        ${hexToRGBA(colors[1], 0.36)} 60%,

        ${hexToRGBA(colors[2], 0.32)} 78%,
        ${hexToRGBA(colors[2], 0.42)} 100%
    )`;
}

/* ==========================
   🟩 ВЕРТИКАЛЬНЫЙ BLEND ДЛЯ HEX-Прямоугольников
   • 2–4 цвета
   • сверху вниз
   • проценты/процентаж/полоски
========================== */

//                              🔧 РЕГУЛЯТОР МЫЛА           (0.00 – 1.00)
// 0.00  = идеально резкие полосы
// 0.60+ = сильно мыльно

const BLEND_SOFTNESS = 0.55;

function buildVerticalBlend(colors) {

    // 2 цвета
if (colors.length === 2) {

    if (BLEND_SOFTNESS === 0) {
        // 🔥 ЧЁТКИЙ РАЗРЕЗ 50/50 (без мыла)
        return `linear-gradient(180deg,
            ${colors[0]} 0%,
            ${colors[0]} 50%,
            ${colors[1]} 50%,
            ${colors[1]} 100%
        )`;
    }

    // 🌫 МЯГКИЙ РЕЖИМ
    return `linear-gradient(180deg,
        ${colors[0]} 0%,
        ${colors[0]} ${50 - (5 * BLEND_SOFTNESS)}%,
        ${colors[1]} ${50 + (5 * BLEND_SOFTNESS)}%,
        ${colors[1]} 100%
    )`;
}

    // 3 цвета
if (colors.length === 3) {

    if (BLEND_SOFTNESS === 0) {
        // 🔥 ЧЁТКИЕ ТРИ ПОЛОСЫ
        return `linear-gradient(180deg,
            ${colors[0]} 0%,
            ${colors[0]} 33.333%,

            ${colors[1]} 33.333%,
            ${colors[1]} 66.666%,

            ${colors[2]} 66.666%,
            ${colors[2]} 100%
        )`;
    }

    const shift = 6 * BLEND_SOFTNESS;

    return `linear-gradient(180deg,
        ${colors[0]} 0%,
        ${colors[0]} ${33.333 - shift}%,

        ${colors[1]} ${33.333 + shift}%,
        ${colors[1]} ${66.666 - shift}%,

        ${colors[2]} ${66.666 + shift}%,
        ${colors[2]} 100%
    )`;
}

    // 4 цвета — ОСНОВНОЙ КЕЙС

if (BLEND_SOFTNESS === 0) {
    return `linear-gradient(180deg,
        ${colors[0]} 0%,
        ${colors[0]} 25%,

        ${colors[1]} 25%,
        ${colors[1]} 50%,

        ${colors[2]} 50%,
        ${colors[2]} 75%,

        ${colors[3]} 75%,
        ${colors[3]} 100%
    )`;
}

const shift = 5 * BLEND_SOFTNESS;

return `linear-gradient(180deg,
    ${colors[0]} 0%,
    ${colors[0]} ${25 - shift}%,

    ${colors[1]} ${25 + shift}%,
    ${colors[1]} ${50 - shift}%,

    ${colors[2]} ${50 + shift}%,
    ${colors[2]} ${75 - shift}%,

    ${colors[3]} ${75 + shift}%,
    ${colors[3]} 100%
)`;
}

/* ==========================
   🧩 ВСПОМОГАТЕЛЬНЫЕ
========================== */
function hexToRGBA(hex, alphaOverride) {
    hex = hex.replace('#', '');

    if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
    }

    // если #RRGGBBAA — просто убираем AA
    if (hex.length === 8) {
        hex = hex.slice(0, 6);
    }

    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    return `rgba(${r},${g},${b},${alphaOverride})`;
}

/* ==========================
   🔤 НОРМАЛИЗАЦИЯ ТЕКСТА
========================== */
function normalizeText(str) {
    return String(str)
        .toLowerCase()
        .replace(/[–—]/g, '-')
        .replace(/[.,]/g, ' ')
        .replace(/ё/g, 'е')
        .replace(/[^a-zа-я0-9\s\-']/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// 🧹 УДАЛЕНИЕ inline-HEX ЦВЕТОВ ИЗ ТЕКСТА (Единая версия)
function stripInlineColors(text) {
    if (!text) return '';
    return String(text)
        .replace(/\s*\([^)]*\)\s*/g, '')
        .trim();
}

/* ==========================
   🎨 ПАРСИНГ ЦВЕТОВ ИЗ ТЕКСТА
========================== */
function extractInlineColors(text) {
    const match = text.match(/\(([^)]+)\)/);
    if (!match) return null;

    const colors = match[1]
        .split('+')
        .map(c => c.trim())
        .filter(c => /^[0-9a-fA-F]{6}$/.test(c))
        .map(c => `#${c}`);

    return colors.length >= 2 ? colors.slice(0, 4) : null;
}

/* ==========================
   🎯 ПРИМЕНЕНИЕ
========================== */
function applySpecialTrackHighlight(cell, teamText) {
    if (!cell || !teamText) return;
    const normalized = normalizeText(teamText);
    for (const key in SPECIAL_TRACKS) {
    const trackData = SPECIAL_TRACKS[key];
    const parts = key
        .split('|')
        .map(p => normalizeText(p));
    if (!parts.every(p => normalized.includes(p))) continue;
    cell.style.backgroundImage = buildSpecialBackground(
        trackData.colors
    );
        cell.classList.add('special-track-cell');
                cell.style.backgroundRepeat = "no-repeat";
        cell.style.backgroundSize = "100% 100%";
        cell.style.backgroundColor = "transparent";

        // 📅 добавляем год релиза
        const year = trackData.year;
        if (year && !cell.querySelector('.track-year')) {
            const yearEl = document.createElement('span');
            yearEl.className = 'track-year';
            yearEl.textContent = year;

            // 🎨 цвет = первый (левый) цвет бленда
            yearEl.style.color = trackData.colors[0];

            cell.appendChild(yearEl);
        }

        return;
    }
}

/* ==========================
   🟩 ЦВЕТОВОЙ КВАДРАТ В ЯЧЕЙКЕ
========================== */
function applyInlineColorSquare(square, teamText) {
    if (!square || !teamText) return;

    const colors = extractInlineColors(teamText);

    // если нет hex — полоса прозрачная
    if (!colors || colors.length < 2) {
        square.style.backgroundImage = 'none';
        return;
    }

    // ⬇️ ВАЖНО: используем ВЕРТИКАЛЬНЫЙ BLEND
    square.style.backgroundImage = buildVerticalBlend(colors);
}

/**
 * Обновляет счет матча в памяти и в IndexedDB.
 * @param {string} matchId - ID матча.
 * @param {'team1' | 'team2'} team - Какая команда обновляется.
 * @param {number | null} score - Новое значение счета.
 */
async function updateMatchScoreInMemoryAndDB(matchId, team, score) {
    try {
        // Получаем актуальные данные матча из DB
        const transaction = db.transaction(['schedule'], 'readwrite');
        const store = transaction.objectStore('schedule');
        const request = store.get(matchId);

        request.onsuccess = async (event) => {
            const match = event.target.result;
            if (!match) {
                console.error(`Матч с ID ${matchId} не найден для обновления счета.`);
                return;
            }

            let score1 = match.score1;
            let score2 = match.score2;

            if (team === 'team1') {
                score1 = score;
            } else {
                score2 = score;
            }

            // Обновляем объект матча
            match.score1 = score1;
            match.score2 = score2;
            // Если пользователь вручную ввёл оба счета, снимаем флаг technical (если был)
            if (score1 !== null && score2 !== null) {
                match.technical = false;
            }

            // ⭐ фикс для экспорта изменений
            match.lastModified = Date.now();

            // Обновляем в IndexedDB
            const updateRequest = store.put(match);
            updateRequest.onsuccess = () => {
                console.log(`Счет матча ${matchId} обновлен в DB.`);
                // Обновляем в памяти tournamentData, если это текущий отображаемый тур
                if (tournamentData.schedule[tournamentData.currentTourIndex]) {
                    const memoryMatch = tournamentData.schedule[tournamentData.currentTourIndex].find(m => m.id === matchId);
                    if (memoryMatch) {
                        memoryMatch.score1 = score1;
                        memoryMatch.score2 = score2;
                        memoryMatch.technical = match.technical;
                    }
                }
            };
            updateRequest.onerror = (event) => console.error(`Ошибка обновления матча ${matchId} в DB:`, event.target.error);
        };
        request.onerror = (event) => console.error(`Ошибка получения матча ${matchId} для обновления счета:`, event.target.error);

    } catch (error) {
        console.error("Ошибка при обновлении счета:", error);
    }
}

/**
 * Обработчик кнопки "Сохранить" или "Изменить" счет.
 * @param {Event} event - Событие клика.
 */
async function handleSaveOrUpdateScore(event) {
    const button = event.target;
    const matchId = button.dataset.matchId;

    try {
        // Получаем данные матча из памяти (предполагая, что они актуальны)
        let match = null;
        for (const tour of tournamentData.schedule) {
            if (tour) {
                match = tour.find(m => m.id === matchId);
                if (match) break;
            }
        }

        if (!match) {
            console.error(`Матч с ID ${matchId} не найден в памяти.`);
            alert("Не удалось найти данные матча для сохранения.");
            return;
        }

        if (match.score1 === null || match.score2 === null) {
            alert('Пожалуйста, введите счет для обеих команд.');
            return;
        }

        // 🔥 ПЕРЕСЧЁТ ТАБЛИЦЫ
        await withStableScroll(async () => {
    await renderStandingsFromDB();
});
        
// Перерисовываем таблицу результатов
        await repaintStandingsBannedRows();

// 🔥 применяем авто-вылет
        applyAuto33Relegation();

/* ===============================
   🔥 ЛОКАЛЬНОЕ ОБНОВЛЕНИЕ СТРОКИ МАТЧА
   без displаyTour()
================================= */

const row = document.querySelector(`[data-match-id="${matchId}"]`);

if (row) {

    const scoreInputs = row.querySelectorAll('.score-input');
    const score1 = parseInt(scoreInputs[0].value);
    const score2 = parseInt(scoreInputs[1].value);

    // убираем старые классы
    row.classList.remove('draw-match', 'total4-match', 'draw-row', 'total4-row');

    if (!isNaN(score1) && !isNaN(score2)) {

        if (score1 === score2) {
            row.classList.add('draw-match', 'draw-row');
        } else if (score1 + score2 === 4) {
            row.classList.add('total4-match', 'total4-row');
        }

        // меняем текст кнопки
        const actionBtn = row.querySelector('button');
        if (actionBtn) actionBtn.textContent = 'Изменить';
    }
}

// 🔥 подсветки теперь просто обновляем
highlightMatchesWithRelegationTeams();
restoreActiveTrackHighlight();

        const tourIndex = tournamentData.currentTourIndex;

// проверка статистики тура
const statsOk = await checkTourStatsAndDisplay(tourIndex);
updateTourCompletionIndicator(tourIndex);

// 📸 ФИКСИРУЕМ ТУР ТОЛЬКО ОДИН РАЗ
if (statsOk) {
    saveStandingsSnapshot();
}

        // Обновляем UI модального окна, если оно открыто
        if (fullScheduleModal.style.display === 'block') {
            renderFullScheduleModal();
        }

    } catch (error) {
        console.error("Ошибка при сохранении/изменении счета:", error);
        alert("Произошла ошибка при сохранении результата.");
    }
}

/**
 * Проверяет статистику тура и отображает результат.
 * @param {number} tourIndex - Индекс тура.
 * @returns {Promise<boolean>} true если тур валиден
 */
async function checkTourStatsAndDisplay(tourIndex) {

    let statsMessage = "";
    let isError = false;

    const currentTourMatches = await getMatchesByTour(tourIndex);

    let unfilledScores = 0;
    let draws = 0;
    let totalScore4Matches = 0;

    currentTourMatches.forEach(match => {
        if (!match.isBye) {
            if (match.score1 === null || match.score2 === null) {
                unfilledScores++;
            } else {
                if (match.score1 === match.score2) {
                    draws++;
                }
                if (
                    match.score1 + match.score2 === 4 &&
                    match.score1 !== match.score2
                ) {
                    totalScore4Matches++;
                }
            }
        }
    });

    if (unfilledScores > 0) {
        statsMessage += `Есть ${unfilledScores} незаполненных матчей. `;
        isError = true;
    }
    if (draws !== 1 && unfilledScores === 0) {
        statsMessage += `Предупреждение: кол-во ничьих (${draws}/1)\n`;
        isError = true;
    }
    if (totalScore4Matches !== 6 && unfilledScores === 0) {
        statsMessage += `Предупреждение: кол-во матчей с тоталом 4 гола (${totalScore4Matches}/6)\n`;
        isError = true;
    }

    tourStatsDiv.innerHTML = statsMessage
        ? `<span class="${isError ? 'error' : ''}">${statsMessage.trim()}</span>`
        : "Статистика тура: OK";

    tourStatsDiv.classList.toggle('error', isError);

    return !isError;
}

/* ==========================
   📊 ПРОГРЕСС ЗАПОЛНЕННОСТИ ТУРА
========================== */
async function updateTourCompletionIndicator(tourIndex) {
        const wrapper = document.getElementById('tourCompletionWrapper');
    const bar = document.getElementById('tourCompletionBar');
    if (!wrapper || !bar) return;

    const matches = await getMatchesByTour(tourIndex);
    if (!matches || matches.length === 0) {
        bar.style.width = '0%';
        return;
    }

        let completed = 0;

    matches.forEach(match => {

        // ✅ BYE и технички считаем завершёнными
        if (match.isBye) {
            completed++;
            return;
        }

        if (match.score1 !== null && match.score2 !== null) {
            completed++;
        }
    });

    const total = matches.length;
    const percent = Math.round((completed / total) * 100);

    bar.style.width = `${percent}%`;
    wrapper.title = `${completed} из ${total} (${percent}%)`;
}

/**
 * Включает/отключает кнопки в зависимости от состояния турнира.
 */
function enableButtons() {
    const hasTeams = tournamentData.teams && tournamentData.teams.length > 0;
    const hasSchedule = tournamentData.schedule.length > 0 && tournamentData.schedule[tournamentData.currentTourIndex] && tournamentData.schedule[tournamentData.currentTourIndex].length > 0;

    generateBtn.disabled = false;
    resetBtn.disabled = !hasTeams;

    prevTourBtn.disabled = !hasSchedule || tournamentData.currentTourIndex === 0;
    nextTourBtn.disabled = !hasSchedule || tournamentData.currentTourIndex >= tournamentData.totalTours - 1;
    tourJumpInput.disabled = !hasSchedule;
    jumpToTourBtn.disabled = !hasSchedule;
    showFullScheduleBtn.disabled = !hasSchedule;

    // Включаем/отключаем поля ввода счета и кнопки "Сохранить"
    document.querySelectorAll('#currentTourOutput tbody tr').forEach(row => {
        const isByeMatch = row.classList.contains('bye-match');
        const inputs = row.querySelectorAll('input[type="text"].score-input');
        const spotifyBtns = row.querySelectorAll('.spotify-btn');
        const saveBtn = row.querySelector('button');

        inputs.forEach(input => {
            input.disabled = isByeMatch || !hasSchedule;
        });
        spotifyBtns.forEach(sb => {
            // spotify buttons всегда активны/пассивны в зависимости от наличия href/disabled, ничего делать не нужно
        });

        if (saveBtn) {
            // Кнопка "Сохранить" активна, если не BYE, есть расписание, и оба счета введены
            const score1Input = row.querySelector('input[data-team="team1"]');
            const score2Input = row.querySelector('input[data-team="team2"]');

            if (isByeMatch || !hasSchedule) {
                saveBtn.disabled = true;
            } else if (score1Input && score2Input && score1Input.value !== '' && score2Input.value !== '') {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Изменить'; // Меняем текст на "Изменить", если счет уже сохранен
            } else {
                saveBtn.disabled = true; // Отключена, если счета не введены
                saveBtn.textContent = 'Сохранить';
            }
        }
    });
}

// --- Инициализация приложения ---
document.addEventListener('DOMContentLoaded', () => {
    initializeApp().then(() => {
        console.log("Приложение инициализировано.");
    }).catch((error) => {
        console.error("Ошибка при инициализации приложения:", error);
        alert("Критическая ошибка при запуске приложения. Пожалуйста, попробуйте обновить страницу.");
    });
});

// ===============================
// Relegation zone controls
// ===============================
const yellowFrom = document.getElementById("yellowFrom");
const yellowTo   = document.getElementById("yellowTo");
const redFrom    = document.getElementById("redFrom");
const redTo      = document.getElementById("redTo");

const applyYellowBtn = document.getElementById("applyYellowZone");
const applyRedBtn    = document.getElementById("applyRedZone");

if (applyYellowBtn && applyRedBtn) {

    applyYellowBtn.addEventListener("click", async () => {
        const from = parseInt(yellowFrom.value);
        const to = parseInt(yellowTo.value);
        const totalTeams = document.querySelectorAll("#standingsBody tr").length;

        const zones = await loadRelegationZones();
        const nextZones = {
            yellow: { from, to },
            red: zones.red
        };

        if (!validateRelegationZones(nextZones.yellow, nextZones.red, totalTeams)) {
            alert("Некорректный диапазон жёлтой зоны");
            return;
        }

        await saveRelegationZones(nextZones);
        await applyRelegationZonesToStandings();
    });

    applyRedBtn.addEventListener("click", async () => {
        const from = parseInt(redFrom.value);
        const to = parseInt(redTo.value);
        const totalTeams = document.querySelectorAll("#standingsBody tr").length;

        const zones = await loadRelegationZones();
        const nextZones = {
            yellow: zones.yellow,
            red: { from, to }
        };

        if (!validateRelegationZones(nextZones.yellow, nextZones.red, totalTeams)) {
            alert("Некорректный диапазон красной зоны");
            return;
        }

        await saveRelegationZones(nextZones);
        await applyRelegationZonesToStandings();
    });
}

//      ========
//      СБРОСС
//      ========

function resetAllStandingsFilters() {
    activeStandingsRange = null;
    activeStandingsArtistType = null;
    activeSpecialTracksFilter = false;

    activeSeasonFilter = null;        // 🔥 СЕЗОНЫ
    activeYearFilter = null;          // 🔥 2024
    activeTierFilter = null;          // 🔥 (1-6)
    activeMatchArtistFilter = null;   // 🔥 артист

    // 🔥 скрываем UI
    document.querySelector('.custom-range-inputs').style.display = 'none';
    document.querySelector('.artist-filter-box').style.display = 'none';

    applyStandingsVisibilityFilter();
}

//      ========
//      ФИЛЬТРЫ
//      ========

initArtistFilter();
initArtistFilterT9();
initStandingsArtistFilterT9(); // 🔥 ВОТ СЮДА

// Custom range apply
document.getElementById('applyCustomRange')?.addEventListener('click', () => {
    const from = parseInt(document.getElementById('customFrom').value);
    const to   = parseInt(document.getElementById('customTo').value);
    const total = document.querySelectorAll("#standingsBody tr").length;

    if (
        !Number.isInteger(from) ||
        !Number.isInteger(to) ||
        from < 1 ||
        to > total ||
        from > to
    ) {
        alert("Некорректный диапазон");
        return;
    }

    activeStandingsRange = { from, to };
    applyStandingsVisibilityFilter();
});

// --- Обработчики событий ---

// Кнопка "Сгенерировать"
generateBtn.addEventListener('click', async () => {
    const teamsInputText = teamsInput.value.trim();
    if (!teamsInputText) {
        alert('Пожалуйста, введите названия команд.');
        return;
    }
    const numTeams = teamsInputText.split('\n').filter(t => t.trim().length > 0).length;
    if (numTeams < 2) {
        alert('Необходимо минимум 2 команды.');
        return;
    }

    try {
        await generateAndSaveSchedule(numTeams);

// ❗ НИЧЕГО БОЛЬШЕ НЕ РЕНДЕРИМ
updateTourNavigation();;

        // 🔥 после displаyTour
    highlightMatchesWithRelegationTeams();

// 🔥 ВОССТАНАВЛИВАЕМ ПОДСВЕТКУ ИГРАЮЩЕГО ТРЕКА
    restoreActiveTrackHighlight();

        enableButtons();
        updateTourCompletionIndicator(0);
    } catch (error) {
        console.error("Ошибка при генерации расписания:", error);
        alert("Не удалось сгенерировать расписание.");
    }
});

// Кнопка "Сбросить все данные"
resetBtn.addEventListener('click', resetAllDataAndUI);

// Навигация по турам
prevTourBtn.addEventListener('click', async () => {
    if (tournamentData.currentTourIndex > 0) {
        tournamentData.currentTourIndex--;
        
        await withStableScroll(async () => {
    await displayTour(tournamentData.currentTourIndex);
});

updateTourNavigation(); // 🔥 ВАЖНО

        // 🔥 подсветка
    highlightMatchesWithRelegationTeams();

// 🔥 ВОССТАНАВЛИВАЕМ ПОДСВЕТКУ ИГРАЮЩЕГО ТРЕКА
    restoreActiveTrackHighlight();

        await checkTourStatsAndDisplay(tournamentData.currentTourIndex);
        updateTourCompletionIndicator(tournamentData.currentTourIndex);

        // Сохраняем текущий индекс тура
        await saveSettings({ ...await loadSettings(), currentTourIndex: tournamentData.currentTourIndex });
    }
});

// ==========================
// Универсальная обработка ❌
// ==========================

// Убираем emoji-модификаторы FE0F, FE0E, Zero-Width-Joiner
function normalizeCross(str) {
    if (!str) return "";
    return String(str).replace(/[\uFE0F\uFE0E\u200D]/g, "");
}

// Проверяем, есть ли ❌ любого вида (❌ или ❌️)
function hasCrossMark(str) {
    return normalizeCross(str).includes("❌");
}

// Удаляем ❌ любого вида
function removeCrossMark(str) {
    if (!str) return "";
    return normalizeCross(str).replace(/❌/g, "").trim();
}

// Кнопка "Обновить команды" — новая красная кнопка X
const updateTeamsBtn = document.getElementById('updateTeamsBtn');
if (updateTeamsBtn) {
    updateTeamsBtn.addEventListener('click', async () => {
        try {
            await updateTeamsStatuses();
            alert("Статусы команд обновлены!");
            await renderStandingsFromDB();
            await repaintStandingsBannedRows();

await withStableScroll(async () => {
    await displayTour(currentTourIndex);
});

    applyAuto33Relegation();

            // 🔥 после displаyTour
    highlightMatchesWithRelegationTeams();

// 🔥 ВОССТАНАВЛИВАЕМ ПОДСВЕТКУ ИГРАЮЩЕГО ТРЕКА
    restoreActiveTrackHighlight();

        } catch (error) {
            console.error("Ошибка при обновлении статусов команд:", error);
            alert("Не удалось обновить команды.");
        }
    });
} else {
    console.warn('Кнопка updateTeamsBtn не найдена в DOM. Проверьте, есть ли элемент с id="updateTeamsBtn" в HTML.');
} 

function normalizeName(str) {
    if (!str) return "";

    return normalizeText(
        stripInlineColors(
            removeCrossMark(
                normalizeCross(str)
            )
        )
    );
}

// ==========================
// 🔄 ЗАМЕНА КОМАНДЫ / ТРЕКА
// ==========================

const replaceTeamBtn = document.getElementById('replaceTeamBtn');

if (replaceTeamBtn) {
    replaceTeamBtn.addEventListener('click', async () => {
        try {

            const lines = teamsInput.value.split("\n");

            // ==========================
            // 🔹 STEP 1: строки
            // ==========================

            let oldLine = null;
            let newLine = null;

            const oldLineInput = prompt("Вставь СТАРУЮ строку полностью");

            if (oldLineInput !== null) {
                oldLine = oldLineInput.trim();

                const newLineInput = prompt("Вставь НОВУЮ строку");

                if (newLineInput !== null) {
                    newLine = newLineInput.trim();
                }
            }

            // ==========================
            // 🔹 STEP 2: ссылки
            // ==========================

            let oldLink = null;
            let newLink = null;

            const oldLinkInput = prompt("Старая ссылка (если есть)");

            if (oldLinkInput !== null) {
                oldLink = oldLinkInput.trim();

                const newLinkInput = prompt("Новая ссылка (если есть)");

                if (newLinkInput !== null) {
                    newLink = newLinkInput.trim();
                }
            }

            // ==========================
            // 🔹 STEP 3: флаги
            // ==========================

            const hasLineReplace = oldLine && newLine;
            const hasLinkReplace = oldLink && newLink;

            if (!hasLineReplace && !hasLinkReplace) {
    return;
}

            // ==========================
            // 🔹 тип (трек / команда)
            // ==========================

            const isTrack = hasLineReplace && oldLine.includes(" – ");

            // ==========================
            // 🔹 замена строки
            // ==========================

            if (hasLineReplace) {
                const newLines = lines.map(l =>
                    normalizeName(l) === normalizeName(oldLine)
                        ? newLine
                        : l
                );

                teamsInput.value = newLines.join("\n");

// 🔥 СОХРАНЯЕМ В LOCAL STORAGE
saveInputsToLocalStorage();
            }

            // ==========================
            // 🔹 замена ссылок
            // ==========================

            if (hasLinkReplace) {
                const urlLines = urlsInput.value.split("\n");

                urlsInput.value = urlLines.map(l =>
                    l.trim() === oldLink
                        ? newLink
                        : l
                ).join("\n");

// 🔥 СОХРАНЯЕМ В LOCAL STORAGE
saveInputsToLocalStorage();
            }

            // ==========================
            // 🔴 ОБНОВЛЯЕМ DB
            // ==========================

            const teams = await getAllTeams();

            if (hasLineReplace) {
                const teamObj = teams.find(t =>
    normalizeName(t.teamName) === normalizeName(oldLine)
);

if (!teamObj) {
    console.warn("❌ Команда не найдена в DB:", oldLine);
}

                if (teamObj) {
                    const tr = db.transaction(['teams'], 'readwrite');
                    const store = tr.objectStore('teams');

                    teamObj.teamName = newLine;

                    await new Promise((res, rej) => {
                        const req = store.put(teamObj);
                        req.onsuccess = () => res();
                        req.onerror = () => rej(req.error);
                    });
                }
            }

            // ==========================
            // 🔴 ОБНОВЛЯЕМ SCHEDULE
            // ==========================

            const tr2 = db.transaction(['schedule'], 'readwrite');
            const store2 = tr2.objectStore('schedule');

            const matches = await new Promise((res, rej) => {
                const req = store2.getAll();
                req.onsuccess = (e) => res(e.target.result || []);
                req.onerror = (e) => rej(e.target.error);
            });

            for (const m of matches) {
                let changed = false;

                if (
    hasLineReplace &&
    (
        normalizeName(m.team1) === normalizeName(oldLine) ||
        normalizeName(m.team2) === normalizeName(oldLine)
    )
) {

    // 🔥 сначала запоминаем старые значения
const oldTeam1 = m.team1;
const oldTeam2 = m.team2;

// 🔥 считаем флаги ДО замены
const isByeMatch =
    m.isBye === true ||
    oldTeam1 === 'BYE' ||
    oldTeam2 === 'BYE';

// 🔥 проверяем по АКТУАЛЬНОЙ строке команды
const isTeam1Technical = hasCrossMark(oldTeam1);
const isTeam2Technical = hasCrossMark(oldTeam2);

const isTechnicalMatch =
    isTeam1Technical ||
    isTeam2Technical;

// 🔥 теперь делаем замену
if (normalizeName(oldTeam1) === normalizeName(oldLine)) {
    m.team1 = newLine;
}

if (normalizeName(oldTeam2) === normalizeName(oldLine)) {
    m.team2 = newLine;
}

// 🔥 🧹 СРАЗУ ЧИСТИМ УСТАРЕВШИЙ TECHNICAL (КРИТИЧНО)
if (!hasCrossMark(m.team1) && !hasCrossMark(m.team2)) {
    m.technical = false;
}

// 🔥 теперь чистим
// ❗ учитываем только АКТУАЛЬНЫЕ special-статусы
if (!isByeMatch && !isTechnicalMatch) {
    m.score1 = null;
    m.score2 = null;

    // 🔥 КРИТИЧЕСКИЙ ФИКС
    m.isBye = false;
    m.technical = false;

    delete m.originalScore1;
    delete m.originalScore2;
    delete m.originalIsBye;
    delete m.originalTechnical;
    m.originalSaved = false;
}

    changed = true;
}

                if (changed) {
                    await new Promise((res, rej) => {
                        const req = store2.put(m);
                        req.onsuccess = () => res();
                        req.onerror = () => rej(req.error);
                    });
                }
            }

            // ==========================
            // 🔔 ALERT
            // ==========================

            let alertText = "";

            if (hasLineReplace) {
                if (isTrack) {
                    alertText += `Удалён трек: ${oldLine}\n`;
                    alertText += `На его место встанет: ${newLine}\n`;
                } else {
                    alertText += `Удалена команда: ${oldLine}\n`;
                    alertText += `На её место встанет: ${newLine}\n`;
                }
            }

            if (hasLinkReplace) {
                alertText += `Удалена ссылка: ${oldLink}\n`;
                alertText += `На её место встанет: ${newLink}`;
            }

            alert(alertText);

            // ==========================
            // 🔄 UI
            // ==========================

            await renderStandingsFromDB();

            await withStableScroll(async () => {
                await displayTour(currentTourIndex);
            });

        } catch (err) {
            console.error("Ошибка замены:", err);
            alert("Ошибка при замене");
        }
    });
}

    /**
 * Перекрашивает строки таблицы по факту banned = true в IndexedDB.
 * Работает всегда корректно.
 */
async function repaintStandingsBannedRows() {
    const teams = await getAllTeams();
    const banned = teams.filter(t => t.inactive === true).map(t => t.teamName);

    const rows = document.querySelectorAll("#standingsBody tr");

    rows.forEach(row => {
        const nameCell = row.querySelector("td:nth-child(2)");
        if (!nameCell) return;

        const name = nameCell.textContent.trim();

        if (banned.includes(name)) {
            row.classList.add("banned");
        } else {
            row.classList.remove("banned");
        }
    });
}

// ===============================
// Apply relegation zones to standings
// ===============================
async function applyRelegationZonesToStandings() {
    const zones = await loadRelegationZones();
    const rows = document.querySelectorAll("#standingsBody tr");

    rows.forEach((row, index) => {
        const place = index + 1;

        row.classList.remove("relegation", "relegation-playoff");

        if (
            zones.yellow &&
            place >= zones.yellow.from &&
            place <= zones.yellow.to
        ) {
            row.classList.add("relegation-playoff");
        }

        if (
            zones.red &&
            place >= zones.red.from &&
            place <= zones.red.to
        ) {
            row.classList.add("relegation");
        }
    });
    // 🔥 AUTO 33% (всегда поверх ручных зон)
    applyAuto33Relegation();
}

function isFeatTrack(name) {
    if (!name) return false;

    const n = name.toLowerCase();

    // разделители артистов
    return (
        n.includes(' feat.') ||
        n.includes(' feat ') ||
        n.includes(',') ||
        n.includes(' x ') ||
        n.includes(' х ') ||
        n.includes('&')
    );
}

function applyStandingsVisibilityFilter() {

    // все строки таблицы standings
    const rows = document.querySelectorAll("#standingsBody tr");
    const total = rows.length;

    rows.forEach((row, index) => {

        // место в таблице (1, 2, 3...)
        const place = index + 1;

        let visible = true;

        // ФИЛЬТР ПО ДИАПАЗОНУ
        // (Все / 100 / 40 / 10 / NQ / Custom)
        if (activeStandingsRange) {

            const { from, to } = activeStandingsRange;

            // если таблица меньше диапазона — ничего не скрываем
            if (total >= from) {

                // если место не входит в диапазон
                if (place < from || place > to) {
                    visible = false;
                }
            }
        }

        // ПОЛУЧАЕМ ИМЯ ТРЕКА
const trackName =
    row.dataset.track ||
    row.dataset.team ||
    row.querySelector('.team-name')?.textContent ||
    "";

// 🔥 ОПРЕДЕЛЯЕМ SPECIAL TRACK
let isSpecial = false;
const trackKey = row.dataset.track;

for (const k in SPECIAL_TRACKS) {
    if (isSpecialTrack(trackKey, k)) {
        isSpecial = true;
        break;
    }
}

// 🔥 ВЫТАСКИВАЕМ ДАТУ (первая из dd.mm.yyyy / dd.mm.yyyy)
const dateMatches = [...trackName.matchAll(/(\d{2})\.(\d{2})\.(\d{4})/g)];

let trackDate = null;

if (dateMatches.length > 0) {
    const [_, d, m, y] = dateMatches[0]; // 👈 берём ПЕРВУЮ (левую)
    trackDate = new Date(`${y}-${m}-${d}`);
}

// ==========================
// 📅 ГОД (2024)
// ==========================

if (activeYearFilter) {

    if (isSpecial) {
        visible = false;
    }
    else if (!trackDate) {
        visible = false;
    }
    else {
        const from = new Date(`2000-01-01`);
        const to   = new Date(`2024-12-20`);

        if (trackDate < from || trackDate > to) {
            visible = false;
        }
    }
}

        // 🌦️ СЕЗОНЫ
if (activeSeasonFilter) {

    if (isSpecial) {
        visible = false;
    }
    else if (!trackDate) {
        visible = false;
    }
    else {
        const y = trackDate.getFullYear();

        const ranges = {
            winter: [new Date(`2024-12-21`), new Date(`2025-02-28`)],
            spring: [new Date(`2025-03-01`), new Date(`2025-05-31`)],
            summer: [new Date(`2025-06-01`), new Date(`2025-08-31`)],
            autumn: [new Date(`2025-09-01`), new Date(`2025-12-31`)]
        };

        const [from, to] = ranges[activeSeasonFilter] || [];

        if (!from || trackDate < from || trackDate > to) {
            visible = false;
        }
    }
}

// 🔢 TIER (1-6)
if (activeTierFilter) {

    if (isSpecial) {
        visible = false;
    }
    else {
        const matches = trackName.match(/\((\d)\)/g);

        if (!matches) {
            visible = false;
        } else {
            const nums = matches.map(m => parseInt(m.replace(/\D/g, '')));

            if (!nums.includes(activeTierFilter)) {
                visible = false;
            }
        }
    }
}
        // ФИЛЬТР FEAT.
        if (activeStandingsArtistType === 'feat') {
            if (!isFeatTrack(trackName)) {
                visible = false;
            }
        }

        // ФИЛЬТР SOLO
        if (activeStandingsArtistType === 'solo') {
            if (isFeatTrack(trackName)) {
                visible = false;
            }
        }

        // 🎤 ФИЛЬТР ПО АРТИСТУ (НОВЫЙ)
        if (activeStandingsArtistFilter) {
    if (!trackName.toLowerCase().includes(activeStandingsArtistFilter)) {
        visible = false;
    }
}

        // 🔥 SPECIAL TRACKS (20XX)
if (activeSpecialTracksFilter) {

    // показываем ТОЛЬКО special
    if (!isSpecial) {
        visible = false;
    }
}

// ❗ ВАЖНО: больше НЕ скрываем special по умолчанию

        // применяем видимость
        row.style.display = visible ? "" : "none";
    });
}

function validateRelegationZones(yellow, red, totalTeams) {
    function valid(z) {
        return (
            Number.isInteger(z.from) &&
            Number.isInteger(z.to) &&
            z.from >= 1 &&
            z.to <= totalTeams &&
            z.from <= z.to
        );
    }

    if (yellow && !valid(yellow)) return false;
    if (red && !valid(red)) return false;

    if (yellow && red) {
        const overlap =
            yellow.from <= red.to &&
            red.from <= yellow.to;
        if (overlap) return false;
    }

    return true;
}

// ===============================
// Restore relegation zones on load
// ===============================
async function restoreRelegationZonesUI() {
    const zones = await loadRelegationZones();

    if (zones.yellow) {
        yellowFrom.value = zones.yellow.from ?? "";
        yellowTo.value   = zones.yellow.to ?? "";
    }

    if (zones.red) {
        redFrom.value = zones.red.from ?? "";
        redTo.value   = zones.red.to ?? "";
    }

    await applyRelegationZonesToStandings();

    // 🔥 AUTO 33% при загрузке страницы
    applyAuto33Relegation()
}

// ===============================
// 🔥 AUTO 33% RELEGATION (NEW)
// не трогает старую систему зон
// ===============================
function applyAuto33Relegation() {

    const allRows = Array.from(
        document.querySelectorAll("#standingsBody tr")
    );

    const activeRows = allRows.filter(
        row => !row.classList.contains("disqualified")
    );

    const N = activeRows.length;
    if (N === 0) return;

    // 🔥 новая формула
    const start = Math.floor(N * (84 / 152)) + 1;
    const end   = Math.ceil(N * (115 / 152));

    // чистим
    allRows.forEach(row => {
        row.classList.remove("auto-relegation-33");
    });

    // применяем
    activeRows.forEach((row, index) => {
        const pos = index + 1;

        if (pos >= start && pos <= end) {
            row.classList.add("auto-relegation-33");
        }
    });
}

// =============================================
// 🔥 Выделяем матчи с командами, из зоны вылета
// =============================================
function highlightMatchesWithRelegationTeams() {

    // 1. Берём и НОРМАЛИЗУЕМ команды из зоны вылета
    const relegationTeams = Array.from(
        document.querySelectorAll("#standingsBody tr.auto-relegation-33")
    ).map(row => {
        const nameCell = row.querySelector("td:nth-child(2)");
        if (!nameCell) return null;

        return normalizeText(
            stripInlineColors(nameCell.textContent)
        );
    }).filter(Boolean);

    if (relegationTeams.length === 0) return;

    // 2. Матчи
    const matchRows = document.querySelectorAll(
        "#currentTourOutput tbody tr"
    );

    matchRows.forEach(row => {

    row.classList.remove("match-relegation");

    const cells = row.querySelectorAll("td");
    if (cells.length < 5) return;

    // 🧹 очищаем предыдущую подсветку ячеек
    cells.forEach(td => td.classList.remove("match-relegation-cell"));

    // ❌ НЕ подсвечиваем BYE и технические матчи
    if (
        row.classList.contains("bye-match") ||
        row.classList.contains("technical-match")
    ) {
        return;
    }

    const fullText = normalizeText(
        stripInlineColors(row.textContent)
    );

    let shouldHighlight = false;

    relegationTeams.forEach(team => {
        if (fullText.includes(team)) {
            shouldHighlight = true;
        }
    });

    // 🔥 если найден матч с зоной вылета — красим только нужные ячейки
    if (shouldHighlight) {
        cells.forEach((td, index) => {

            // ❌ игнорируем колонку Команда 1 и Команда 2
            if (index === 1 || index === 2 || index === 5 || index === 6 || index === 7) return;

            td.classList.add("match-relegation-cell");
        });
    }

  });
}

/**
 * Обновляет статусы команд согласно списку в textarea:
 * - команды со значком ❌ → inactive = true в store 'teams'
 * - их матчи в 'schedule' помечаются как BYE / technical (3:0 у соперника)
 * - если дисквалификация отменена (❌ удалён), восстанавливаем оригинальные результаты (если они были сохранены при дисквалификации)
 */
async function updateTeamsStatuses() {
    try {

        // --- 1) Считываем текущее состояние textarea и список команд из DB ---
        const lines = teamsInput.value
            .trim()
            .split("\n")
            .map(t => t.trim())
            .filter(l => l.length > 0);

        const existingTeams = await getAllTeams();

        // Функция надёжного срaвнения строки и имени команды
        function sameTeam(a, b) {
            return removeCrossMark(normalizeCross(a)).trim().toLowerCase() ===
                   removeCrossMark(normalizeCross(b)).trim().toLowerCase();
        }

        // Две группы: кто сейчас с крестом и у кого крест снят
        const bannedNow = [];
        const unbannedNow = [];

        for (const team of existingTeams) {
            // ищем соответствующую строку в textarea
            const line = lines.find(l => sameTeam(l, team.teamName));

            // если строки нет в textarea → команда точно без ❌
            if (!line) {
                unbannedNow.push(team.teamName);
                continue;
            }

            // если строка есть — смотрим, есть ли на ней ❌
            const hasCross = hasCrossMark(line);

            if (hasCross) {
                bannedNow.push(team.teamName);
            } else {
                unbannedNow.push(team.teamName);
            }
        }

        console.log("Сейчас дисквалифицированы:", bannedNow);
        console.log("Сейчас восстановлены:", unbannedNow);

        // --- 2) Обновляем поле inactive в хранилище teams ---
        {
            const tr = db.transaction(['teams'], 'readwrite');
            const store = tr.objectStore('teams');

            const allReq = store.getAll();
            const teamsList = await new Promise((res, rej) => {
                allReq.onsuccess = (e) => res(e.target.result || []);
                allReq.onerror = (e) => rej(e.target.error);
            });

            for (const team of teamsList) {
                const shouldBeInactive = bannedNow.includes(team.teamName);
                if (team.inactive !== shouldBeInactive) {
                    team.inactive = shouldBeInactive;
                    await new Promise((res, rej) => {
                        const putReq = store.put(team);
                        putReq.onsuccess = () => res();
                        putReq.onerror = () => rej(putReq.error);
                    });
                }
            }

            await new Promise((res, rej) => {
                tr.oncomplete = () => res();
                tr.onerror = () => rej(tr.error);
            });
        }

        // Обновим в памяти список команд
        tournamentData.teams = await getAllTeams();

        // --- 3) Обновляем расписание (schedule) в соответствии с bannedNow / unbannedNow ---
        {
            const tr = db.transaction(['schedule'], 'readwrite');
            const store = tr.objectStore('schedule');

            const getAllReq = store.getAll();
            const matches = await new Promise((res, rej) => {
                getAllReq.onsuccess = (e) => res(e.target.result || []);
                getAllReq.onerror = (e) => rej(e.target.error);
            });

            // Проходим все матчи и применяем правила
            for (const match of matches) {
    const t1 = (match.team1 || '').trim();
    const t2 = (match.team2 || '').trim();

    const t1BannedNow = bannedNow.includes(t1);
    const t2BannedNow = bannedNow.includes(t2);

    // 🆕 команда вернулась после ИЗНАЧАЛЬНОГО ❌ (до генерации)
    const t1Returned =
        !t1BannedNow &&
        !match.originalSaved &&
        tournamentData.teams.find(t => t.teamName === t1)?.initiallyBanned === true;

    const t2Returned =
        !t2BannedNow &&
        !match.originalSaved &&
        tournamentData.teams.find(t => t.teamName === t2)?.initiallyBanned === true;

    let changed = false;

                // Сохраняем оригинал только один раз — когда впервые из состояния "не забанен" переходит в "забанен"
                // originalSaved будет флагом, хранимым в объекте матча
                if ((t1BannedNow || t2BannedNow) && !match.originalSaved) {
                    match.originalScore1 = match.score1;
                    match.originalScore2 = match.score2;
                    match.originalIsBye = !!match.isBye;
                    match.originalTechnical = !!match.technical;
                    match.originalSaved = true;
                    // не устанавливаем changed здесь — изменения ниже установят, если требуется
                }

                // 3.1 Если только команда1 забанена
                if (t1BannedNow && !t2BannedNow) {
                    // если ещё не было BYE/tech для этого матча — поставить
                    if (!match.isBye || !match.technical || match.score1 !== 0 || match.score2 !== 3) {
                        match.isBye = true;
                        match.technical = true;
                        match.score1 = 0;
                        match.score2 = 3;
                        changed = true;
                    }
                }
                // 3.2 Если только команда2 забанена
                else if (t2BannedNow && !t1BannedNow) {
                    if (!match.isBye || !match.technical || match.score1 !== 3 || match.score2 !== 0) {
                        match.isBye = true;
                        match.technical = true;
                        match.score1 = 3;
                        match.score2 = 0;
                        changed = true;
                    }
                }
                // 3.3 Если обе забанены — матч считается сыгранным (0:0 техничка)
                else if (t1BannedNow && t2BannedNow) {
                    if (!match.isBye || !match.technical || match.score1 !== 0 || match.score2 !== 0) {
                        match.isBye = true;
                        match.technical = true;
                        match.score1 = 0;
                        match.score2 = 0;
                        changed = true;
                    }
                }

                // 3.4 ❗ Команда была ❌ ДО генерации и теперь вернулась → ПОЛНЫЙ СБРОС матча
const team1Obj = tournamentData.teams.find(t => t.teamName === t1);
const team2Obj = tournamentData.teams.find(t => t.teamName === t2);

const t1InitiallyInactive = team1Obj?.initiallyInactive === true;
const t2InitiallyInactive = team2Obj?.initiallyInactive === true;

// 🔥 КРИТИЧЕСКИЙ БЛОК
if (
    (!t1BannedNow && t1InitiallyInactive) ||
    (!t2BannedNow && t2InitiallyInactive)
) {
    // команда ВОЗВРАЩЕНА в турнир → матч должен стать ПУСТЫМ
    match.isBye = false;
    match.technical = false;
    match.score1 = null;
    match.score2 = null;

    changed = true;
}

    // 3.5 Обычное восстановление
else if (
    !t1BannedNow &&
    !t2BannedNow &&
    match.originalSaved &&
    !t1Returned &&
    !t2Returned
) {
    // команда дисквалифицировалась ВО ВРЕМЯ турнира
    match.isBye = !!match.originalIsBye;
    match.technical = !!match.originalTechnical;
    match.score1 = match.originalScore1;
    match.score2 = match.originalScore2;
    match.originalSaved = false;

    delete match.originalScore1;
    delete match.originalScore2;
    delete match.originalIsBye;
    delete match.originalTechnical;

    changed = true;
}


else if (t1Returned || t2Returned) {
    // команда вернулась в турнир — чистим матч
    match.isBye = false;
    match.technical = false;
    match.score1 = null;
    match.score2 = null;
    changed = true;
}

                if (changed) {
                    await new Promise((res, rej) => {
                        const putReq = store.put(match);
                        putReq.onsuccess = () => res();
                        putReq.onerror = () => rej(putReq.error);
                    });
                }
            }

            await new Promise((res, rej) => {
                tr.oncomplete = () => res();
                tr.onerror = () => rej(tr.error);
            });

            // Обновляем tournamentData.schedule из DB (чтобы UI отобразил актуальные матчи)
            const freshMatches = matches;

            const grouped = {};
            freshMatches.forEach(m => {
                if (m.tourIndex === undefined || m.tourIndex === null) return;
                if (!grouped[m.tourIndex]) grouped[m.tourIndex] = [];
                grouped[m.tourIndex].push(m);
            });

            tournamentData.schedule = [];
            Object.keys(grouped).forEach(idxStr => {
                const idx = parseInt(idxStr, 10);
                tournamentData.schedule[idx] = grouped[idx].sort((a, b) => a.matchIndex - b.matchIndex);
            });
        }

        console.log("updateTeamsStatuses(): ВСЁ ГОТОВО");
    } catch (err) {
        console.error("Ошибка updateTeamsStatuses:", err);
        throw err;
    }
}

nextTourBtn.addEventListener('click', async () => {
    if (tournamentData.currentTourIndex < tournamentData.totalTours - 1) {

        tournamentData.currentTourIndex++;
        
        await withStableScroll(async () => {
    await displayTour(tournamentData.currentTourIndex);
});

updateTourNavigation(); // 🔥 ВАЖНО

        // 🔥 подсветка
    highlightMatchesWithRelegationTeams();

// 🔥 ВОССТАНАВЛИВАЕМ ПОДСВЕТКУ ИГРАЮЩЕГО ТРЕКА
    restoreActiveTrackHighlight();

        await checkTourStatsAndDisplay(tournamentData.currentTourIndex);

        await saveSettings({
            ...await loadSettings(),
            currentTourIndex: tournamentData.currentTourIndex
        });
    }
});

jumpToTourBtn.addEventListener('click', async () => {
    const tourNum = parseInt(tourJumpInput.value);
    if (!isNaN(tourNum) && tourNum >= 1 && tourNum <= tournamentData.totalTours) {
        tournamentData.currentTourIndex = tourNum - 1;
        
        await withStableScroll(async () => {
    await displayTour(tournamentData.currentTourIndex);
});

updateTourNavigation(); // 🔥 ВАЖНО

        // 🔥 подсветка
    highlightMatchesWithRelegationTeams();

// 🔥 ВОССТАНАВЛИВАЕМ ПОДСВЕТКУ ИГРАЮЩЕГО ТРЕКА
    restoreActiveTrackHighlight();
    
        await checkTourStatsAndDisplay(tournamentData.currentTourIndex); 
        // Сохраняем текущий индекс тура
        await saveSettings({ ...await loadSettings(), currentTourIndex: tournamentData.currentTourIndex });
        // Здесь можно добавить прокрутку к первому незаполненному матчу, если это необходимо
        // scrollToActiveMatch();
    } else {
        alert(`Пожалуйста, введите номер тура от 1 до ${tournamentData.totalTours}.`);
    }
});

// Модальное окно полного расписания
showFullScheduleBtn.addEventListener('click', async () => {
    await renderFullScheduleModal();
    fullScheduleModal.style.display = 'block';
});

// 🔴 ВСТАВКА — крестик первого модала
const closeFullScheduleModalBtn = document.getElementById('closeFullScheduleModal');
closeFullScheduleModalBtn.addEventListener('click', () => {
    fullScheduleModal.style.display = 'none';
});

const showFormStatsBtn = document.getElementById('showFormStatsBtn');
const formStatsModal = document.getElementById('formStatsModal');
const closeFormModalBtn = document.getElementById('closeFormModal');

/* ==========================
   🎨 РЕЖИМ ВИЗУАЛЬНОЙ ПРОВЕРКИ
========================== */
document.addEventListener('DOMContentLoaded', () => {

    const hideTeamsBtn = document.getElementById('hideTeamsBtn');
    const toggleRelegationBtn = document.getElementById('toggleRelegationBtn');

    if (hideTeamsBtn) {
        hideTeamsBtn.addEventListener('click', () => {
            document.body.classList.toggle('teams-hidden');
        });
    }

    // 🔴 ПЕРЕКЛЮЧАТЕЛЬ ПОДСВЕТКИ
    let relegationHighlightEnabled = true;

    if (toggleRelegationBtn) {

        toggleRelegationBtn.addEventListener('click', () => {

            relegationHighlightEnabled = !relegationHighlightEnabled;

            document.body.classList.toggle(
                'relegation-disabled',
                !relegationHighlightEnabled
            );

        });

    }

});

const toggleTeamsColumnBtn = document.getElementById('toggleTeamsColumnBtn');

if (toggleTeamsColumnBtn) {
    toggleTeamsColumnBtn.addEventListener('click', () => {

        const isHidden = document.body.classList.contains('teams-column-hidden');

        if (isHidden) {
            document.body.classList.remove('teams-column-hidden');

            // 👉 показываем ВСЕ
            document.querySelectorAll('.team-cell').forEach(c => {
                c.classList.remove('team-visible');
            });

        } else {
            document.body.classList.add('teams-column-hidden');
        }

    });
}

/* ========================== */

showFormStatsBtn.addEventListener('click', async () => {
    formStatsModal.style.display = 'block';
    await renderFormStandingsFromDB();
});

// 🔴 ВСТАВКА — закрытие по крестику
closeFormModalBtn.addEventListener('click', () => {
    formStatsModal.style.display = 'none';
});

window.addEventListener('click', (event) => {
    if (event.target === fullScheduleModal) {
        fullScheduleModal.style.display = 'none';
    }

    // 🔴 Форма и серия (второй модал)
    if (event.target === formStatsModal) {
        formStatsModal.style.display = 'none';
    }

    // 🆚 Срaвнение (третий модал)
    const compareModal = document.getElementById('compareModal');
    if (event.target === compareModal) {
        compareModal.style.display = 'none';
    }
});

// ===============================
// 🆚 Модaл "Сравнение"
// ===============================

const openCompareBtn  = document.getElementById('openCompareModal');
const closeCompareBtn = document.getElementById('closeCompareModal');
const compareModalEl  = document.getElementById('compareModal');

if (openCompareBtn && compareModalEl) {
    openCompareBtn.addEventListener('click', () => {

        // 🔧 гарантируем историю позиций
        ensureStandingsHistory();

        compareModalEl.style.display = 'block';
    });
}

if (closeCompareBtn && compareModalEl) {
    closeCompareBtn.addEventListener('click', () => {
        compareModalEl.style.display = 'none';
    });
}

function parseArtistAndTrack(line) {
    if (!line) return { artist: '', track: '' };

    // все варианты тире → единый разделитель
    const normalized = line.replace(/[–—]/g, '-');

    // ищем первое " - " с пробелами
    const match = normalized.match(/\s-\s(.+)$/);

    if (!match) {
        return {
            artist: normalized.trim(),
            track: ''
        };
    }

    const track = match[1].trim();
    const artist = normalized.slice(0, match.index).trim();

    return { artist, track };
}

/* 🔧 НОРМАЛИЗАЦИЯ ИМЕНИ КОМАНДЫ
   всегда возвращает
   "ARTIST – TRACK"*/
function normalizeTeamName(team) {
    if (!team) return null;

    const { artist, track } = parseArtistAndTrack(team);
    // 🔥 если нет трека — считаем артист = команда
const safeTrack = track || artist;

return `${stripInlineColors(artist)} – ${stripInlineColors(safeTrack)}`;
}

function findHeadToHeadMatch(teamA, teamB) {
    if (!teamA || !teamB) return null;

    for (const tour of tournamentData.schedule) {
        if (!tour) continue;

        for (const match of tour) {
            const t1 = match.team1;
            const t2 = match.team2;

            if (
                (t1 === teamA && t2 === teamB) ||
                (t1 === teamB && t2 === teamA)
            ) {
                return match;
            }
        }
    }

    return null;
}

// 🗓 НАХОДИМ НОМЕР ТУРА ВСТРЕЧИ (ИЗ INDEXEDDB)
async function getHeadToHeadTour(teamA, teamB) {
    if (!teamA || !teamB) return null;

    const A = normalizeTeamName(stripInlineColors(teamA));
    const B = normalizeTeamName(stripInlineColors(teamB));

    const allMatches = await getAllMatchesCached();

    for (const match of allMatches) {
        if (!match || match.isBye) continue;

        const m1 = normalizeTeamName(stripInlineColors(match.team1));
        const m2 = normalizeTeamName(stripInlineColors(match.team2));

        if (
            (m1 === A && m2 === B) ||
            (m1 === B && m2 === A)
        ) {
            return match.tourIndex + 1;
        }
    }

    return null;
}

/* ===============================
   🔍 СУПЕР-T9 ДЛЯ ТРЕКОВ
=============================== */

async function getAllArtistTrackPairs() {
    if (ALL_PAIRS_CACHE) return ALL_PAIRS_CACHE;

    const pairs = [];
    const seen = new Set();

    const allMatches = await getAllMatchesCached(); // 🔥 вместо getAll()

    allMatches.forEach(match => {
        if (!match || match.isBye) return;

        [match.team1, match.team2].forEach(team => {
            if (!team) return;

            const { artist, track } = parseArtistAndTrack(team);
            const cleanTrack = stripInlineColors(track || artist);

            if (!cleanTrack || seen.has(cleanTrack)) return;
            seen.add(cleanTrack);

            const artistSearch = stripInlineColors(artist || cleanTrack)
                .toLowerCase()
                .replace(/ё/g, 'е')
                .replace(/[^\p{L}\p{N}\s]/gu, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            const trackClean = cleanTrack
                .toLowerCase()
                .replace(/ё/g, 'е')
                .replace(/[^\p{L}\p{N}\s]/gu, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            pairs.push({
                search: `${artistSearch} ${trackClean}`,
                track: cleanTrack
            });
        });
    });

    ALL_PAIRS_CACHE = pairs;
    return pairs;
}

/* ===============================
   🆚 T9 ПОИСК ТРЕКОВ (СРAВНЕНИЕ)
=============================== */

function initCompareTrackT9(inputId, suggestionsId) {
    const input = document.getElementById(inputId);
    const suggestions = document.getElementById(suggestionsId);

    if (!input || !suggestions) return;

    input.addEventListener('input', async () => {
        const query = input.value
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ');

        suggestions.innerHTML = '';

        if (!query) return;

        const pairs = await getAllArtistTrackPairs();
        const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(safe, 'i');

        const matches = pairs
            .filter(p => regex.test(p.search))
            .slice(0, 10);

        matches.forEach(p => {
            const div = document.createElement('div');
            div.className = 'artist-suggestion';
            div.textContent = p.track;

            div.addEventListener('click', () => {
                input.value = p.track;
                suggestions.innerHTML = '';
                input.dispatchEvent(new Event('change'));
            });

            suggestions.appendChild(div);
        });
    });

    // 🧠 ручной ввод → авто-подстановка
    input.addEventListener('blur', async () => {
    setTimeout(() => {
        suggestions.innerHTML = '';
    }, 150); // 🔥 даём клику по подсказке сработать
    
        const query = input.value
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ');

        if (!query) return;

        const pairs = await getAllArtistTrackPairs();
        const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(safe, 'i');

        const matches = pairs.filter(p => regex.test(p.search));

        if (matches.length === 1) {
            input.value = matches[0].track;
        }
    });

    // клик вне — скрыть подсказки
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !suggestions.contains(e.target)) {
            suggestions.innerHTML = '';
        }
    });
}

initCompareTrackT9('compareTeamA', 'compareT9A');
initCompareTrackT9('compareTeamB', 'compareT9B');

// ===== 🆚 СВЯЗЬ T9 → HEAD-TO-HEAD =====
function bindCompareInput(inputId, side) {
    const input = document.getElementById(inputId);
    if (!input) return;

    input.addEventListener('change', () => {
        const track = stripInlineColors(input.value);

        const map = buildTeamTrackMap();
        const fullTeam = map.get(normalizeText(track));

        if (!fullTeam) return;

        if (side === 'A') {
    selectedCompareTeamA = fullTeam;

    const { track } = parseArtistAndTrack(fullTeam);
    document.getElementById('compareNameA').textContent =
        stripInlineColors(track);
} else {
    selectedCompareTeamB = fullTeam;

    const { track } = parseArtistAndTrack(fullTeam);
    document.getElementById('compareNameB').textContent =
        stripInlineColors(track);
}

        renderVSResult();
        renderCompareStats();

        // 🧹 очищаем поля ПОСЛЕ полной логики
        if (selectedCompareTeamA && selectedCompareTeamB) {
            const inputA = document.getElementById('compareTeamA');
            const inputB = document.getElementById('compareTeamB');

            if (inputA) inputA.value = '';
            if (inputB) inputB.value = '';
        }
    });
}

bindCompareInput('compareTeamA', 'A');
bindCompareInput('compareTeamB', 'B');

function getArtistPart(trackName) {
    if (!trackName) return '';
    return trackName.split('–')[0].trim();
}

function isFeatTrack(trackName) {
    const artistPart = getArtistPart(trackName).toLowerCase();

    // единый regex для feat
    return /,|\sx\s|\sх\s|&|\sfeat\.?\s|\sft\.?\s/.test(artistPart);
}

// 🎯 управление фильтром по счёту
document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.score-filter-btn');
    if (!btn) return;

    const value = btn.dataset.score;

document.querySelectorAll('.score-filter-btn')
    .forEach(b => b.classList.remove('active'));

if (value === 'all') {
    activeScoreFilter = null;
    btn.classList.add('active');
} else {
    activeScoreFilter = value;
    btn.classList.add('active');

    // снимаем активность с "Все"
    document
        .querySelector('.score-filter-btn.all')
        ?.classList.remove('active');
}

    // ⚠️ если тур ещё не показан — ничего не делаем
if (currentTourIndex === null) return;
    // перерисовываем текущий тур
    await withStableScroll(() => displayTour(currentTourIndex));
});

// ==========================
// 🔍 T9 поиск по артисту
// ==========================

const artistInput = document.getElementById('artistSearchInput');
const artistResult = document.getElementById('artistSearchResult');
const artistSuggestions = document.getElementById('artistSuggestions');

if (artistInput && artistResult && artistSuggestions) {

    function getAllArtists() {
    const lines = teamsInput.value
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);

    const set = new Set();

    lines.forEach(line => {
        const { artist } = parseArtistAndTrack(line);
        if (!artist) return;

        artist.split(',').forEach(a => {
            const name = a.trim();
            if (name) set.add(name);
        });
    });

    return Array.from(set);
}

    function countTracks(artistName) {
    const target = artistName.toLowerCase();
    let count = 0;

    teamsInput.value
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .forEach(line => {
            const { artist } = parseArtistAndTrack(line);
            if (!artist) return;

            const artists = artist
                .split(',')
                .map(a => a.trim().toLowerCase());

            if (artists.includes(target)) {
                count++;
            }
        });

    return count;
}
        // 🔥 ИСПРАВЛЕННАЯ ВЕРСИЯ С feat.
    function showArtistTracks(artistName) {
        const list = document.getElementById('artistTracksList');
        if (!list) return;

        list.innerHTML = '';

        const target = artistName.toLowerCase();

        teamsInput.value
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .forEach(line => {
        const { artist, track } = parseArtistAndTrack(line);
        if (!artist || !track) return;

        const rawArtists = artist
            .replace(/feat\.?/gi, ',')
            .replace(/&/g, ',')
            .split(',')
            .map(a => a.trim())
            .filter(Boolean);

        const hasTarget = rawArtists.some(a => a.toLowerCase() === target);
        if (!hasTarget) return;

        const feats = rawArtists.filter(a => a.toLowerCase() !== target);

        // 🧹 ЧИСТИМ НАЗВАНИЕ ТРЕКА ОТ (hex + hex)
const cleanTrack = stripInlineColors(track);

let finalTitle = cleanTrack;
if (feats.length > 0) {
    finalTitle += ` (feat. ${feats.join(', ')})`;
}

const div = document.createElement('div');
div.className = 'artist-track';
div.textContent = finalTitle;
list.appendChild(div);
    });
}

    artistInput.addEventListener('input', () => {
        const query = artistInput.value.trim().toLowerCase();

        artistSuggestions.innerHTML = '';
        artistResult.textContent = '';

        if (!query) return;

        const artists = getAllArtists();

        const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

const matches = artists
    .filter(a => regex.test(a))
    .slice(0, 10);

        matches.forEach(name => {
            const div = document.createElement('div');
            div.className = 'artist-suggestion';
            div.textContent = name;

            div.addEventListener('click', () => {
    artistInput.value = name;
    artistSuggestions.innerHTML = '';

    const count = countTracks(name);
    artistResult.textContent = `Треков в топе: ${count}`;

    showArtistTracks(name);
});

            artistSuggestions.appendChild(div);
        });

        // если точное совпадение — сразу считаем
        const exact = artists.find(a => a.toLowerCase() === query.toLowerCase());
        if (exact) {
            const count = countTracks(exact);
            artistResult.textContent = `Треков в топе: ${count}`;
        }
    });

    // клик вне — скрыть подсказки
    document.addEventListener('click', (e) => {
        if (!artistInput.contains(e.target) && !artistSuggestions.contains(e.target)) {
            artistSuggestions.innerHTML = '';
        }
    });
}

// фильтр: кнопка Артист

function getAllArtistsFromTeams() {
    const set = new Set();

    teamsInput.value
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .forEach(line => {
            const { artist } = parseArtistAndTrack(line);
            if (!artist) return;

            artist
                .replace(/feat\.?/gi, ',')
                .replace(/&/g, ',')
                .split(',')
               .map(a => a.trim())
                .filter(Boolean)
                .forEach(a => set.add(a));
        });

    return Array.from(set);
}

// Применение фильтра к матчу

function matchPassesArtistFilter(match) {
    if (!activeMatchArtistFilter) return true;

    const target = activeMatchArtistFilter.toLowerCase();

    function extractArtists(teamName) {
        const { artist } = parseArtistAndTrack(teamName);
        if (!artist) return [];

        return artist
            .replace(/feat\.?/gi, ',')
            .replace(/&/g, ',')
            .split(',')
            .map(a => a.trim().toLowerCase())
            .filter(Boolean);
    }

    const a1 = extractArtists(match.team1);
    const a2 = extractArtists(match.team2);

    return a1.includes(target) || a2.includes(target);
}

// Матчей с этим артистом в этом туре: N

// (1 матч считается ОДИН раз, даже если aртист с обеих сторон)

function countArtistMatchesInCurrentTour(artistName) {
    if (!artistName) return 0;

    const target = artistName.toLowerCase();
    const tour = tournamentData?.schedule?.[currentTourIndex];

    if (!Array.isArray(tour)) return 0;

    let matchCount = 0;

    tour.forEach(match => {

        function teamHasArtist(teamName) {
            const { artist } = parseArtistAndTrack(teamName);
            if (!artist) return false;

            return artist
                .replace(/feat\.?/gi, ',')
                .replace(/&/g, ',')
                .split(',')
                .map(a => a.trim().toLowerCase())
                .includes(target);
        }

        // ✅ КЛЮЧЕВАЯ ЛОГИКА:
        // матч считается, если артист есть
        // хотя бы в ОДНОМ треке матча
        if (
            teamHasArtist(match.team1) ||
            teamHasArtist(match.team2)
        ) {
            matchCount++;
        }
    });

    return matchCount;
}

// ===============================
// Инициализация фильтра Артист (1 раз)
// ===============================
function initArtistFilter() {
    if (artistFilterInitialized) return;
    artistFilterInitialized = true;

    const btn = document.getElementById('artistFilterBtn');
    const input = document.getElementById('matchArtistFilterInput');

    if (!btn || !input) return;

    // клик по кнопке Артист → заменить на input
    btn.addEventListener('click', () => {
        btn.style.display = 'none';
        input.style.display = 'block';
        input.focus();
    });

    // ввод aртиста — НЕ фильтруем тур
input.addEventListener('input', () => {
    // ничего не делаем, ждём выбора подсказки
});

// выход из input по ESC
input.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') {
        activeMatchArtistFilter = null;        input.value = '';
        input.style.display = 'none';
        btn.style.display = 'block';
        const result = document.getElementById('artistFilterResult');
        if (result) {
    result.textContent = '';
    result.style.display = 'none';
}
        await withStableScroll(() => displayTour(currentTourIndex));
    }
  });
}

// ===============================
// T9-поиск для фильтра Артист
// ===============================
function initArtistFilterT9() {
    const input = document.getElementById('matchArtistFilterInput');
    const suggestions = document.getElementById('matchArtistFilterSuggestions');

    if (!input || !suggestions) return;

    input.addEventListener('input', async () => {
    const query = input.value.trim().toLowerCase(); // 🔥 ВОТ ЭТОГО НЕ ХВАТАЛО

    suggestions.innerHTML = '';

    if (!query) {
    activeMatchArtistFilter = null;

    const result = document.getElementById('artistFilterResult');
    if (result) {
        result.textContent = '';
        result.style.display = 'none'; // 🔥 скрываем обратно
    }

    await withStableScroll(() => displayTour(currentTourIndex));

    return;
}

        const artists = getAllArtistsFromTeams();
        const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

        artists
            .filter(a => regex.test(a))
            .slice(0, 6)
            .forEach(name => {
                const div = document.createElement('div');
                div.className = 'artist-suggestion';
                div.textContent = name;

                div.addEventListener('click', async () => {
    input.value = name;
    suggestions.innerHTML = '';
    activeMatchArtistFilter = name;

    const result = document.getElementById('artistFilterResult');
if (result) {
    if (name && name.trim()) {
        const matches = countArtistMatchesInCurrentTour(name);
        result.textContent = `Матчей с этим артистом в этом туре: ${matches}`;
        result.style.display = 'block';
    } else {
        result.textContent = '';
        result.style.display = 'none';
    }
}

    await withStableScroll(() => displayTour(currentTourIndex));
});

                suggestions.appendChild(div);
            });
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !suggestions.contains(e.target)) {
            suggestions.innerHTML = '';
        }
    });
}

// модал Сравнение (вспомогательная функция)

function getAllTrackNames() {
    return teamsInput.value
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .map(line => {
            const { track } = parseArtistAndTrack(line);
            return track ? stripInlineColors(track) : null;
        })
        .filter(Boolean);
}

// Т9 🆚 T9

function initCompareT9(inputId, suggestionsId, side) {
    const input = document.getElementById(inputId);
    const suggestions = document.getElementById(suggestionsId);

    if (!input || !suggestions) return;

    input.addEventListener('input', () => {
        const query = input.value
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ');

        suggestions.innerHTML = '';

        if (!query) return;

        const tracks = getAllTrackNames();
        const regex = new RegExp(
            query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            'i'
        );

        tracks
            .filter(t => regex.test(t))
            .slice(0, 10)
            .forEach(track => {
                const div = document.createElement('div');
                div.className = 'artist-suggestion';
                div.textContent = track;

                div.addEventListener('click', () => {
    input.value = track;
    suggestions.innerHTML = '';

    if (side === 'A') {
        selectedCompareTeamA = teamsInput.value
            .split('\n')
            .map(l => l.trim())
            .find(line => {
                const { track: t } = parseArtistAndTrack(line);
                return stripInlineColors(t) === track;
            });

        document.getElementById('compareNameA').textContent = track;
    } else {
        selectedCompareTeamB = teamsInput.value
            .split('\n')
            .map(l => l.trim())
            .find(line => {
                const { track: t } = parseArtistAndTrack(line);
                return stripInlineColors(t) === track;
            });

        document.getElementById('compareNameB').textContent = track;
    }

    renderVSResult();
    renderCompareStats();
});

                suggestions.appendChild(div);
            });
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !suggestions.contains(e.target)) {
            suggestions.innerHTML = '';
        }
    });
}

/* ===============================
   🔁 SWAP КОМАНД В СРAВНЕНИИ
=============================== */

const swapBtn = document.getElementById('compareSwapBtn');

if (swapBtn) {
    swapBtn.addEventListener('click', () => {

        const inputA = document.getElementById('compareTeamA');
        const inputB = document.getElementById('compareTeamB');

        // 🔥 меняем значения input
        const tempValue = inputA.value;
        inputA.value = inputB.value;
        inputB.value = tempValue;

        // 🔥 меняем выбранные команды
        const tempTeam = selectedCompareTeamA;
        selectedCompareTeamA = selectedCompareTeamB;
        selectedCompareTeamB = tempTeam;

        // 🔥 меняем отображаемые имена
        const nameA = document.getElementById('compareNameA');
        const nameB = document.getElementById('compareNameB');

        const tempName = nameA.textContent;
        nameA.textContent = nameB.textContent;
        nameB.textContent = tempName;

        // 🔥 перерендер
        renderVSResult();
        renderCompareStats();
    });
}

// ===============================
// 🆚 СЧЁТ + ПОЗИЦИИ В МОДАЛЕ СРAВНЕНИЯ     #6(#7)
// ===============================

function renderVSResult() {

    const leftEl  = document.getElementById('compareScoreLeft');
    const rightEl = document.getElementById('compareScoreRight');

    const leftRankEl  = document.getElementById('compareRankLeft');
    const rightRankEl = document.getElementById('compareRankRight');

    leftEl.textContent  = '';
    rightEl.textContent = '';

    if (leftRankEl)  leftRankEl.textContent  = '—';
    if (rightRankEl) rightRankEl.textContent = '—';

    if (!selectedCompareTeamA || !selectedCompareTeamB) return;

    const A = selectedCompareTeamA;
    const B = selectedCompareTeamB;

    // 🔥 ВОТ ЭТО КЛЮЧ
    findHeadToHeadScore(A, B, leftEl, rightEl);

    /* ===============================
       🏆 ПОЗИЦИИ — ТЕПЕРЬ СЧИТАЮТСЯ ВСЕГДА
    =============================== */

    const standingA = getTeamStanding(A);
    const standingB = getTeamStanding(B);

    const mainPosA = standingA ? standingA.position : null;
    const mainPosB = standingB ? standingB.position : null;

    Promise.all([
        getTeamFormPosition(A),
        getTeamFormPosition(B)
    ]).then(([formPosA, formPosB]) => {

        if (leftRankEl) {
            if (mainPosA) {
                leftRankEl.innerHTML = `
                    <span class="rank-main">#${mainPosA}</span>
                    <span class="rank-form">(#${formPosA ?? '—'})</span>
                `;
            } else {
                leftRankEl.textContent = '—';
            }
        }

        if (rightRankEl) {
            if (mainPosB) {
                rightRankEl.innerHTML = `
                    <span class="rank-main">#${mainPosB}</span>
                    <span class="rank-form">(#${formPosB ?? '—'})</span>
                `;
            } else {
                rightRankEl.textContent = '—';
            }
        }
    });
}

    // ===== 🆚 ПОИСК МАТЧА (FIXED ASYNC) =====
async function findHeadToHeadScore(A, B, leftEl, rightEl) {

    const allMatches = await getAllMatchesCached();

    const normalize = t => normalizeTeamName(stripInlineColors(t));

    const A_norm = normalize(A);
    const B_norm = normalize(B);

    const match = allMatches.find(m => {
        if (!m || m.isBye) return false;

        const m1 = normalize(m.team1);
        const m2 = normalize(m.team2);

        return (
            (m1 === A_norm && m2 === B_norm) ||
            (m1 === B_norm && m2 === A_norm)
        );
    });

    if (!match) return;
    if (match.score1 === null || match.score2 === null) return;

    const leftScore =
        match.team1 === A ? match.score1 : match.score2;

    const rightScore =
        match.team1 === A ? match.score2 : match.score1;

    leftEl.textContent  = leftScore;
    rightEl.textContent = rightScore;
}

function formatPoints(points) {
    if (points === null || points === undefined) return '—';

    const mod10 = points % 10;
    const mod100 = points % 100;

    let word = 'очков';
    if (mod10 === 1 && mod100 !== 11) word = 'очко';
    else if ([2,3,4].includes(mod10) && ![12,13,14].includes(mod100)) {
        word = 'очка';
    }

    return `${points} ${word}`;
}

function formatTours(num) {

    const mod10 = num % 10;
    const mod100 = num % 100;

    let word = 'туров';

    if (mod10 === 1 && mod100 !== 11) {
        word = 'тур';
    }
    else if ([2,3,4].includes(mod10) && ![12,13,14].includes(mod100)) {
        word = 'тура';
    }

    return `${num} ${word}`;
}

// СТАТИСТИКА (Шаг 3)

function getTeamStanding(teamName) {
    if (
        !teamName ||
        !tournamentData ||
        !Array.isArray(tournamentData.standingsTable)
    ) {
        return null;
    }

    return (
        tournamentData.standingsTable.find(
            row => stripInlineColors(row.team) === stripInlineColors(teamName)
        ) || null
    );
}

function getGoalsString(team) {
    if (!team) return '—';
    const diff = team.goalsFor - team.goalsAgainst;
    return `${diff} (${team.goalsFor}/${team.goalsAgainst})`;
}

function ensureStandingsHistory() {

    if (!tournamentData || !Array.isArray(tournamentData.allMatches)) {
        return;
    }

    if (!Array.isArray(tournamentData.standingsHistory)) {
        tournamentData.standingsHistory = [];
    }

    if (tournamentData.standingsHistory.length > 0) {
        return;
    }

    const matches = tournamentData.allMatches;

    // получаем реальные индексы туров
    const tourIndexes = [...new Set(matches.map(m => m.tourIndex))]
        .sort((a, b) => a - b);

    tourIndexes.forEach(tourIndex => {

        // проверяем — полностью ли сыгран тур
        const tourMatches = matches.filter(m => m.tourIndex === tourIndex);

        const allPlayed = tourMatches.every(m => {

            if (m.team1 === 'BYE' || m.team2 === 'BYE') return true;

            if (m.technical) {
                return m.score1 !== null && m.score2 !== null;
            }

            return m.score1 !== null && m.score2 !== null;
        });

        const hasAnyPlayedMatch = tourMatches.some(m =>
            (m.team1 !== 'BYE' && m.team2 !== 'BYE') &&
             m.score1 !== null &&
             m.score2 !== null
        );

            if (!hasAnyPlayedMatch) return;

        const snapshot = buildStandingsUpToTour(
            tournamentData.allMatches,
            tournamentData.allTeams,
            tourIndex + 1   // 🔥 ВАЖНО: потому что >= tourLimit
        );

        tournamentData.standingsHistory.push(snapshot);
    });

    console.log(
        '📸 standingsHistory построен корректно:',
        tournamentData.standingsHistory.length
    );
}

// peak

function getBestPosition(teamName) {
    let bestPos = Infinity;
    let bestTour = null;

    if (
        !tournamentData ||
        !Array.isArray(tournamentData.standingsHistory)
    ) {
        return '—';
    }

    const cleanTarget = stripInlineColors(teamName);

    tournamentData.standingsHistory.forEach((table, tourIndex) => {
        if (!Array.isArray(table)) return;

        const normalize = s =>
    stripInlineColors(s)
        .replace(/\s+/g, ' ')
        .trim()
        .normalize('NFKD');

        const row = table.find(r =>
    normalize(r.team) === normalize(teamName)
);

    if (!row) return;

        if (row.position < bestPos) {
            bestPos = row.position;
            bestTour = tourIndex + 1;
        }
    });

    if (!bestTour) return '—';

    return `#${bestPos} (в ${bestTour} туре)`;
}

function debugPeak(teamName) {
    if (
        !tournamentData ||
        !Array.isArray(tournamentData.standingsHistory)
    ) {
        console.log('❌ standingsHistory отсутствует');
        return;
    }

    const cleanTarget = stripInlineColors(teamName);

    console.log(`\n===== АНАЛИЗ ${cleanTarget} =====`);

    let bestPos = Infinity;
    let bestTour = null;

    tournamentData.standingsHistory.forEach((table, tourIndex) => {
        if (!Array.isArray(table)) return;

        const normalize = s =>
    stripInlineColors(s)
        .replace(/\s+/g, ' ')
        .trim()
        .normalize('NFKD');

        const row = table.find(r =>
    normalize(r.team) === normalize(teamName)
);

        if (!row) {
            console.log(`${tourIndex + 1} тур: ❌ команда не найдена`);
            return;
        }

        console.log(
            `${tourIndex + 1} тур: #${row.position} место`
        );

        if (row.position < bestPos) {
            bestPos = row.position;
            bestTour = tourIndex + 1;
        }
    });

    if (bestTour) {
        console.log(
            `\nвывод: пик - #${bestPos} (в ${bestTour} туре)`
        );
    } else {
        console.log('\nвывод: данных нет');
    }

    console.log('===========================\n');
}

function debugTeamsInTour(tourNumber) {
    const table = tournamentData.standingsHistory[tourNumber - 1];
    console.log(`\nКоманды в ${tourNumber} туре:`);

    table.forEach(r => {
        console.log(`[${r.team}]`);
    });
}

/* ===============================
   📊 ФОРМА КОМАНДЫ (ШАГ 3)
   использует ту же логику,
   что и модал "Форма и серия"
=============================== */
async function getTeamFormIcons(teamName, limit = 5) {
    const matches = await getLastPlayedMatchesFromDB(teamName, limit);
    if (!matches.length) return '—';

    const items = matches.map(m => {
        const isLeft =
            stripInlineColors(m.team1) === stripInlineColors(teamName);

        const leftTeam  = stripInlineColors(teamName);
        const rightTeam = stripInlineColors(isLeft ? m.team2 : m.team1);

        const leftGoals  = isLeft ? m.score1 : m.score2;
        const rightGoals = isLeft ? m.score2 : m.score1;

        const scored   = leftGoals;
        const conceded = rightGoals;

        let icon = '🟨';
        if (scored > conceded) icon = '✅';
        else if (scored < conceded) icon = '❌';

        const title =
            `${m.tourIndex + 1} тур, ${leftTeam} ${leftGoals} – ${rightGoals} ${rightTeam}`;

        return `<span title="${title}">${icon}</span>`;
    });

    return items.join('');
}

/* ===============================
   📊 ПОЗИЦИЯ В FORM-ТАБЛИЦЕ
=============================== */
async function getTeamFormPosition(teamName) {
    const allTeams = await getAllTeams();

    const promises = allTeams.map(async t => {
    const team = t.teamName;
    const matches = await getLastPlayedMatchesFromDB(team, 5);

    let gf = 0, ga = 0;

    for (const m of matches) {
        const isLeft =
            stripInlineColors(m.team1) === stripInlineColors(team);

        const scored   = isLeft ? m.score1 : m.score2;
        const conceded = isLeft ? m.score2 : m.score1;

        gf += scored;
        ga += conceded;
    }

    return {
        team,
        diff: gf - ga
    };
});

const rows = await Promise.all(promises);

    rows.sort((a, b) => b.diff - a.diff);

    const cleanTarget = stripInlineColors(teamName);

    const index = rows.findIndex(r =>
        stripInlineColors(r.team) === cleanTarget
    );

    return index >= 0 ? index + 1 : null;
}

/* ===============================
   🆚 COMPARE — ЛОГИКА ПОДСВЕТКИ
=============================== */
function setBetter(rowA, rowB, valueA, valueB, reverse = false) {
    if (!rowA || !rowB) return;

    rowA.classList.remove('better');
    rowB.classList.remove('better');

    if (valueA === valueB) return;

    if (!reverse) {
        if (valueA > valueB) rowA.classList.add('better');
        else rowB.classList.add('better');
    } else {
        if (valueA < valueB) rowA.classList.add('better');
        else rowB.classList.add('better');
    }
}

function renderCompareStats() {
    if (!selectedCompareTeamA || !selectedCompareTeamB) return;

    const teamAName = normalizeTeamName(selectedCompareTeamA);
    const teamBName = normalizeTeamName(selectedCompareTeamB);

    if (!teamAName || !teamBName) return;

    const teamA = getTeamStanding(teamAName);
    const teamB = getTeamStanding(teamBName);

    // 🗓 НОМЕР ТУРА ВСТРЕЧИ
    getHeadToHeadTour(
        selectedCompareTeamA,
        selectedCompareTeamB
    ).then(tourNumber => {

        const tourText = tourNumber
            ? `${tourNumber} тур`
            : '—';

        document.getElementById('compareTourNumber').textContent = tourText;
    });

    // POINTS
    document.getElementById('comparePointsA').textContent =
        teamA ? formatPoints(teamA.points) : '—';

    document.getElementById('comparePointsB').textContent =
        teamB ? formatPoints(teamB.points) : '—';

    // GOALS
    document.getElementById('compareGoalsA').textContent =
        teamA ? getGoalsString(teamA) : '—';

    document.getElementById('compareGoalsB').textContent =
        teamB ? getGoalsString(teamB) : '—';

    // FORM (ВАЖНО)
    getTeamFormIcons(teamAName).then(res => {
    document.getElementById('compareFormA').innerHTML = res;
});

    getTeamFormIcons(teamBName).then(res => {
    document.getElementById('compareFormB').innerHTML = res;
});

    // BEST POSITION
    document.getElementById('compareBestPosA').textContent =
        getBestPosition(teamAName);

    document.getElementById('compareBestPosB').textContent =
        getBestPosition(teamBName);

                /* 
        ====    ===================
       🆚 ПРИМЕНЯЕМ ПОДСВЕТКУ
    =============================== */

    const rowPointsA = document.getElementById('comparePointsA').closest('.compare-row');
    const rowPointsB = document.getElementById('comparePointsB').closest('.compare-row');

    const rowGoalsA = document.getElementById('compareGoalsA').closest('.compare-row');
    const rowGoalsB = document.getElementById('compareGoalsB').closest('.compare-row');

    const rowFormA = document.getElementById('compareFormA').closest('.compare-row');
    const rowFormB = document.getElementById('compareFormB').closest('.compare-row');

    const rowBestA = document.getElementById('compareBestPosA').closest('.compare-row');
    const rowBestB = document.getElementById('compareBestPosB').closest('.compare-row');

    const pointsA = teamA ? teamA.points : 0;
    const pointsB = teamB ? teamB.points : 0;

    setBetter(rowPointsA, rowPointsB, pointsA, pointsB);

    const diffA = teamA ? (teamA.goalsFor - teamA.goalsAgainst) : 0;
    const diffB = teamB ? (teamB.goalsFor - teamB.goalsAgainst) : 0;

    setBetter(rowGoalsA, rowGoalsB, diffA, diffB);

    Promise.all([
        getTeamFormIcons(teamAName),
        getTeamFormIcons(teamBName)
    ]).then(([formA, formB]) => {
        const getFormPoints = html => {
    const temp = document.createElement('div');
    temp.innerHTML = html;

    return [...temp.textContent].reduce((acc, ch) =>
        acc + (ch === '✅' ? 3 : ch === '🟨' ? 1 : 0), 0);
};

        setBetter(rowFormA, rowFormB,
            getFormPoints(formA),
            getFormPoints(formB)
        );
    });

    const bestA = parseInt((getBestPosition(teamAName).match(/\d+/) || [999])[0]);
    const bestB = parseInt((getBestPosition(teamBName).match(/\d+/) || [999])[0]);

    setBetter(rowBestA, rowBestB, bestA, bestB, true);
}

/* ==========================
   🍋‍🟩 SPOTIFY WEB PLAYER
========================== */

function playInGlobalPlayer(trackUrl, buttonElement) {

    if (!trackUrl) return;

    const iframe = document.getElementById('spotifyIframe');
    const container = document.getElementById('globalSpotifyPlayer');

    let embedUrl = "";
    let trackId = "";

    /* 🔥 ОПРЕДЕЛЕНИЕ ПЛАТФОРМЫ */

    // =========================
    // 🎵 SPOTIFY
    // =========================
    if (trackUrl.includes("spotify.com")) {

        trackId = trackUrl.split('/track/')[1]?.split('?')[0];
        if (!trackId) return;

        embedUrl = `https://open.spotify.com/embed/track/${trackId}`;

    }

    // =========================
    // ☁ SOUNDCLOUD
    // =========================
    else if (trackUrl.includes("soundcloud.com")) {

        // очищаем параметры ?si= и прочее
        const cleanUrl = trackUrl.split('?')[0];

        embedUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(cleanUrl)}`;

        // универсальный id для подсветки
        trackId = btoa(cleanUrl);
    }

    else {
        console.warn("Неизвестный сервис:", trackUrl);
        return;
    }

    // 🔥 сначала сбрасываем состояние
container.classList.remove('minimized');
container.classList.remove('active');

iframe.src = embedUrl;

// 🔥 показываем ПОЛНОСТЬЮ
container.classList.add('active');

localStorage.setItem('lastSpotifyTrack', embedUrl);
localStorage.setItem('currentTrackId', trackId);

// 🔥 подсветка
highlightActiveTeamCell(buttonElement);

    // 🔥 ДОБАВЛЯЕМ МЕСТО СНИЗУ СТРАНИЦЫ
    // (чтобы 13 матч не прятался под плеером)

    document.body.style.paddingBottom = "180px"; // ← высота плеера
}

document.addEventListener('DOMContentLoaded', function () {

    const iframe = document.getElementById('spotifyIframe');
    const container = document.getElementById('globalSpotifyPlayer');

    // 🔄 Восстановление последнего трека
    const saved = localStorage.getItem('lastSpotifyTrack');

if (saved) {
    // только сохраняем, НО НЕ ПОКАЗЫВАЕМ
    iframe.dataset.savedTrack = saved;
}

// 🔥 ГАРАНТИЯ: плеер скрыт
container.classList.remove('active');
container.classList.remove('minimized');
iframe.src = '';

    // ❌ КНОПКА ЗАКРЫТЬ ПЛЕЕР
    const closeBtn = document.getElementById('spotifyCloseBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', function () {

    // 🔥 ПОЛНОЕ ЗАКРЫТИЕ
    iframe.src = '';

    container.classList.remove('active');
    container.classList.remove('minimized');

    localStorage.removeItem('lastSpotifyTrack');
    localStorage.removeItem('currentTrackId');

    document.body.style.paddingBottom = "0px";
    });
    }

    // ▬ КНОПКА СВЕРНУТЬ ПЛЕЕР
    const minimizeBtn = document.getElementById('spotifyMinimizeBtn');
    if (minimizeBtn) {
        minimizeBtn.addEventListener('click', function () {

    // если плеер не открыт — ничего не делаем
    if (!container.classList.contains('active')) return;

    container.classList.toggle('minimized');
});
    }

});

/* ==========================
   🎵 ACTIVE TEAM CELL
========================== */

function highlightActiveTeamCell(button) {

    if (!(button instanceof HTMLElement)) {
        console.warn('highlightActiveTeamCell получил не DOM элемент:', button);
        return;
    }

    document.querySelectorAll('.playing-team-cell')
        .forEach(el => el.classList.remove('playing-team-cell'));

    const td = button.closest('td');
    if (!td) return;

    const row = td.closest('tr');
    if (!row) return;

    const cells = row.querySelectorAll('td');
    const index = Array.from(cells).indexOf(td);

    let teamCell = null;

    if (index === 1) teamCell = cells[2];
    if (index === 6) teamCell = cells[5];

    if (teamCell) {
        teamCell.classList.add('playing-team-cell');
    }
}

// вспомогательная, чтобы без ошибок в консоли 

function restoreActiveTrackHighlight() {

    const activeTrack = localStorage.getItem('currentTrackId');
    if (!activeTrack) return;

    const button = document.querySelector(
        `[data-track-id="${activeTrack}"]`
    );

    if (button) {
        highlightActiveTeamCell(button);
    }
}

/* ==========================
   ✅ ИМПОРТ / ЭКСПОРТ
========================== */

async function exportTournamentMatches() {

    if (typeof db === "undefined" || !db) {
        alert("База данных ещё не инициализирована.");
        return;
    }

    const tx = db.transaction(['schedule'], 'readonly');
    const store = tx.objectStore('schedule');
    const req = store.getAll();

    req.onsuccess = () => {

        const matches = req.result;

const filledMatches = matches
    .filter(m => m.score1 !== null && m.score2 !== null)
    .map(m => ({
        id: m.id,
        tourIndex: m.tourIndex,
        matchIndex: m.matchIndex,
        score1: m.score1,
        score2: m.score2,
        technical: m.technical
    }));

if (!filledMatches.length) {
    alert("Нет заполненных матчей для экспорта.");
    return;
}

/* ===== СТАТИСТИКА ТУРОВ ДЛЯ CONFIRM ===== */

const tourStats = {};

matches.forEach(m => {

    if (!tourStats[m.tourIndex]) {
        tourStats[m.tourIndex] = { total:0, filled:0 };
    }

    tourStats[m.tourIndex].total++;

    if (m.score1 !== null && m.score2 !== null) {
        tourStats[m.tourIndex].filled++;
    }

});

let confirmText = "Экспортировать:\n\n";

Object.keys(tourStats)
    .sort((a,b)=>a-b)
    .forEach(t => {

        const r = tourStats[t];

        if (r.filled > 0) {
            confirmText += `${+t+1} тур — ${r.filled} матчей из ${r.total}\n`;
        }

    });

if (!confirm(confirmText)) return;

        const data = {
            type: "delta",
            exportedAt: new Date().toISOString(),
            matches: filledMatches
        };

        const blob = new Blob(
            [JSON.stringify(data, null, 2)],
            { type: "application/json" }
        );

        const a = document.createElement("a");
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = `tournament_matches_${Date.now()}.json`;
        a.click();

URL.revokeObjectURL(url);

        console.log("Экспортировано матчей:", filledMatches.length);
    };
}

/* ==========================
   ✅ ЭКСПОРТ ТЕКУЩЕГО ТУРА
========================== */

async function exportCurrentTourMatches() {

    if (typeof db === "undefined" || !db) {
        alert("База данных ещё не инициализирована.");
        return;
    }

    const tx = db.transaction(['schedule'], 'readonly');
    const store = tx.objectStore('schedule');
    const req = store.getAll();

    req.onsuccess = () => {

        const matches = req.result;

        const tourMatches = matches
            .filter(m => m.tourIndex === currentTourIndex)
            .filter(m => m.score1 !== null && m.score2 !== null)
            .map(m => ({
                id: m.id,
                tourIndex: m.tourIndex,
                matchIndex: m.matchIndex,
                score1: m.score1,
                score2: m.score2,
                technical: m.technical
            }));

        if (!tourMatches.length) {
            alert("В текущем туре нет заполненных матчей.");
            return;
        }

        if (!confirm(`Экспортировать текущий тур (${currentTourIndex+1})?\nМатчей: ${tourMatches.length}`)) return;

        const data = {
            type: "tour",
            tour: currentTourIndex,
            exportedAt: new Date().toISOString(),
            matches: tourMatches
        };

        const blob = new Blob(
            [JSON.stringify(data, null, 2)],
            { type: "application/json" }
        );

        const a = document.createElement("a");
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = `tour_${currentTourIndex+1}_${Date.now()}.json`;
        a.click();

URL.revokeObjectURL(url);

        console.log("Экспортирован тур:", currentTourIndex+1, "матчей:", tourMatches.length);
    };
}

/* ==========================
   📋 КОПИРОВАТЬ ТУР В БУФЕР
========================== */

async function copyCurrentTourMatches() {

    if (typeof db === "undefined" || !db) {
        alert("База данных ещё не инициализирована.");
        return;
    }

    const tx = db.transaction(['schedule'], 'readonly');
    const store = tx.objectStore('schedule');
    const req = store.getAll();

    req.onsuccess = async () => {

        const matches = req.result;

        const tourMatches = matches
            .filter(m => m.tourIndex === currentTourIndex)
            .filter(m => m.score1 !== null && m.score2 !== null)
            .map(m => ({
                id: m.id,
                tourIndex: m.tourIndex,
                matchIndex: m.matchIndex,
                score1: m.score1,
                score2: m.score2,
                technical: m.technical
            }));

        if (!tourMatches.length) {
            alert("В текущем туре нет заполненных матчей.");
            return;
        }

        const data = {
            type: "clipboard",
            tour: currentTourIndex,
            exportedAt: new Date().toISOString(),
            matches: tourMatches
        };

        const json = JSON.stringify(data);

        try {

            await navigator.clipboard.writeText(json);

            alert(
`Тур ${currentTourIndex+1} скопирован в буфер.

Матчей: ${tourMatches.length}

Теперь можно вставить в Telegram или заметки.`
            );

        } catch(e) {

            console.error(e);

            alert("Не удалось скопировать в буфер.");
        }

    };
}

/* ==========================
   📥 ВСТАВИТЬ ТУР ИЗ БУФЕРА
========================== */

async function pasteTournamentMatches() {

    let text;

    try {
        text = await navigator.clipboard.readText();
if(!text){
alert("Буфер обмена пуст.");
return;
}
    } catch (e) {
        alert("Не удалось прочитать буфер обмена.");
        return;
    }

    let data;

    try {
        data = JSON.parse(text);
    } catch (e) {
        alert("Буфер не содержит JSON турнира.");
        return;
    }

    if (!data.matches) {
        alert("Неверный формат данных.");
        return;
    }

    const tx = db.transaction(['schedule'], 'readwrite');
    const store = tx.objectStore('schedule');

    let updated = 0;
    let same = 0;
    let conflicts = 0;
    let missing = 0;

    const allReq = store.getAll();

    allReq.onsuccess = () => {

        const localMap = new Map();

        allReq.result.forEach(m => {
            const key = m.tourIndex + "_" + m.matchIndex;
            localMap.set(key, m);
        });

        for (const importedMatch of data.matches) {

            const key = importedMatch.tourIndex + "_" + importedMatch.matchIndex;
            let localMatch = localMap.get(key);

            if (!localMatch) {

                localMatch = allReq.result.find(m =>
                    m.tourIndex === importedMatch.tourIndex &&
                    m.team1 === importedMatch.team1 &&
                    m.team2 === importedMatch.team2
                );

            }

            if (!localMatch) {
                missing++;
                continue;
            }

            if (
                localMatch.score1 !== null &&
                localMatch.score2 !== null &&
                localMatch.score1 === importedMatch.score1 &&
                localMatch.score2 === importedMatch.score2
            ) {
                same++;
                continue;
            }

            if (
                localMatch.score1 !== null &&
                localMatch.score2 !== null &&
                (
                    localMatch.score1 !== importedMatch.score1 ||
                    localMatch.score2 !== importedMatch.score2
                )
            ) {
                conflicts++;
            }

            if(
localMatch.lastModified &&
importedMatch.lastModified &&
importedMatch.lastModified <= localMatch.lastModified
){
continue;
}

                localMatch.score1 = importedMatch.score1;
                localMatch.score2 = importedMatch.score2;
            localMatch.technical = importedMatch.technical ?? false;
    localMatch.lastModified = importedMatch.lastModified || Date.now();

                store.put(localMatch);

                updated++;
        }
    };

    tx.oncomplete = async () => {

        let summary =
`Импорт из буфера завершён

Добавлено: ${updated}
Совпало: ${same}
Конфликтов: ${conflicts}
Отсутствуют: ${missing}`;

        alert(summary);

        await renderStandingsFromDB();

await withStableScroll(async () => {
    await displayTour(currentTourIndex);
});
    };
}

/* ==========================
   🔎 ПРЕДПРОСМОТР ИМПОРТА
========================== */
async function previewImport(data){

    const tx = db.transaction(['schedule'],'readonly');
    const store = tx.objectStore('schedule');

    const req = store.getAll();
    return new Promise(resolve=>{
        req.onsuccess = ()=>{
            const localMatches = req.result;

            const localMap = new Map();

            localMatches.forEach(m=>{
                const key = m.tourIndex + "_" + m.matchIndex;
                localMap.set(key,m);
            });

            let same = 0;
            let conflicts = 0;
            let newResults = 0;

            const tours = new Set();
            (data.matches || []).forEach(imported=>{
                tours.add(imported.tourIndex);

                const key = imported.tourIndex + "_" + imported.matchIndex;
let local = localMap.get(key);

if(!local){

    local = localMatches.find(m =>
        m.tourIndex === imported.tourIndex &&
        m.team1 === imported.team1 &&
        m.team2 === imported.team2
    );

}

                if(!local){
                    return;
                }
                if(
local.score1 !== null &&
local.score2 !== null &&
local.score1 === imported.score1 &&
local.score2 === imported.score2
                ){
                    same++;
                    return;
                }
                if(
                    local.score1 !== null &&
                    local.score2 !== null
                ){
                    conflicts++;
                }else{
                    newResults++;
                }
            });

            const result = {
tours: tours.size,
matches: data.matches.length,
same,
conflicts,
newResults
};

resolve(result);
        };
    });
}

/* ==========================
   UI PREVIEW IMPORT
========================== */

function showImportPreview(preview){

const box = document.querySelector("#importModal .export-modal-box");

let previewBlock = document.getElementById("importPreviewBlock");

if(!previewBlock){

previewBlock = document.createElement("div");
previewBlock.id = "importPreviewBlock";
previewBlock.style.marginTop = "15px";
previewBlock.style.fontSize = "14px";

box.insertBefore(previewBlock, box.querySelector(".export-modal-buttons"));

}

previewBlock.innerHTML = `
<div style="text-align:left;line-height:1.5">

<b>Файл содержит</b><br><br>

туров: ${preview.tours}<br>
матчей: ${preview.matches}<br><br>

совпадений: ${preview.same}<br>
конфликтов: ${preview.conflicts}<br>
новых результатов: ${preview.newResults}

</div>
`;

}

async function applyImportData(data){

const tx = db.transaction(['schedule'], 'readwrite');
const store = tx.objectStore('schedule');

let updated = 0;
let same = 0;
let conflicts = [];
let missing = 0;

const allReq = store.getAll();
allReq.onsuccess = () => {

const localMap = new Map();

allReq.result.forEach(m=>{
const key = m.tourIndex + "_" + m.matchIndex;
localMap.set(key,m);
});

for (const importedMatch of data.matches) {

const key = importedMatch.tourIndex + "_" + importedMatch.matchIndex;
let localMatch = localMap.get(key);

if (!localMatch) {

localMatch = allReq.result.find(m =>
m.tourIndex === importedMatch.tourIndex &&
m.team1 === importedMatch.team1 &&
m.team2 === importedMatch.team2
);

}

if (!localMatch) {
missing++;
continue;
}

if (
localMatch.score1 !== null &&
localMatch.score2 !== null &&
localMatch.score1 === importedMatch.score1 &&
localMatch.score2 === importedMatch.score2
) {
same++;
continue;
}

if (
localMatch.score1 !== null &&
localMatch.score2 !== null &&
(
localMatch.score1 !== importedMatch.score1 ||
localMatch.score2 !== importedMatch.score2
)
){
conflicts.push({
tour: localMatch.tourIndex + 1,
match: localMatch.matchIndex + 1,
local: `${localMatch.score1}:${localMatch.score2}`,
incoming: `${importedMatch.score1}:${importedMatch.score2}`
});
}

if(
localMatch.lastModified &&
importedMatch.lastModified &&
importedMatch.lastModified <= localMatch.lastModified
){
continue;
}

localMatch.score1 = importedMatch.score1;
localMatch.score2 = importedMatch.score2;
localMatch.technical = importedMatch.technical ?? false;
localMatch.lastModified = importedMatch.lastModified || Date.now();
store.put(localMatch);
updated++;
}
};
tx.oncomplete = async () => {
if (conflicts.length) {
let msg = "Обнаружены конфликты:\n\n";
conflicts.slice(0,10).forEach(c => {
msg += `Тур ${c.tour}, матч ${c.match}\n`;
msg += `ПК: ${c.local}\n`;
msg += `Импорт: ${c.incoming}\n\n`;
});
alert(msg);
}
alert(`Импорт завершён

Добавлено: ${updated}
Совпало: ${same}
Конфликтов: ${conflicts.length}
Отсутствуют: ${missing}`)

await renderStandingsFromDB();

await withStableScroll(async () => {
    await displayTour(currentTourIndex);
});
};
}

async function importTournamentMatches(file) {

    const text = await file.text();

    let data;

    try {
        data = JSON.parse(text);
    } catch (e) {
        alert("Файл повреждён.");
        return;
    }

    if (!data.matches) {
        alert("Неверный формат файла.");
        return;
    }

/* ==========================
   PREVIEW ИМПОРТА
========================== */

const preview = await previewImport(data);
pendingImportData = data;
showImportPreview(preview);
return;
}

/* ==========================
   УНИВЕРСАЛЬНЫЙ ЭКСПОРТ
========================== */
async function exportMatches() {
    if (!db) {
        alert("База данных ещё не инициализирована.");
        return;
    }

    const fileMode = modeFileToggle.checked;
    const allMatches = scopeAllToggle.checked;

    const tx = db.transaction(['schedule'],'readonly');
    const store = tx.objectStore('schedule');

    const req = store.getAll();
req.onsuccess = async () => {
    let matches = req.result;

    /* ===== ФИЛЬТР ===== */
    if(allMatches){
        /* ✅ ВСЕ МАТЧИ ТУРНИРА */
        matches = matches.filter(m =>
            m.score1 !== null &&
            m.score2 !== null
        );
    }else{
        /* ✅ ТОЛЬКО НОВЫЕ (после открытия сайта) */
        matches = matches.filter(m =>
            m.lastModified && m.lastModified > pageOpenTime
        );
    }

        if(!matches.length){
            alert("Нет матчей для экспорта.");
            return;
        }

        const data = {
                exportedAt: new Date().toISOString(),
                matches: matches.map(m=>({
                id: m.id,
                tourIndex: m.tourIndex,
                matchIndex: m.matchIndex,
                score1: m.score1,
                score2: m.score2,
                technical: m.technical,
                lastModified: m.lastModified || Date.now()
        }))
        };
        const json = JSON.stringify(data,null,2);
        /* ===== БУФЕР ===== */
        if(!fileMode){
            try{
                await navigator.clipboard.writeText(json);
console.log("Clipboard export:", data.matches.length);
                alert(`Экспортировано: ${data.matches.length} матчей (${allMatches ? 'все' : 'новые'})`);
            }catch(e){
                console.error("Clipboard error:", e);
                alert("Ошибка записи в буфер");
            }
            return;
        }
        /* ===== ФАЙЛ ===== */
        const blob = new Blob([json],{type:"application/json"});

        const a = document.createElement("a");
        const url = URL.createObjectURL(blob); 
        a.href = url; 
        if(allMatches){
  a.download = `all_matches_${Date.now()}.json`;
}else{
  a.download = `new_matches_${Date.now()}.json`;
}
        a.click();

URL.revokeObjectURL(url);

alert(`Экспортировано: ${data.matches.length} матчей (${allMatches ? 'все' : 'новые'})`);
    };
}

/* ==========================
   UI: МОДАЛЬНОЕ ОКНО ЭКСПОРТА
========================== */

const exportModal = document.getElementById("exportModal");
const exportBtn = document.getElementById("exportMatchesBtn");
const exportConfirmBtn = document.getElementById("exportConfirmBtn");
const exportCancelBtn = document.getElementById("exportCancelBtn");

const modeFileToggle = document.getElementById("modeFileToggle");
const scopeAllToggle = document.getElementById("scopeAllToggle");
const tourLabel = document.getElementById("tourLabel");

/* ===== IMPORT UI ===== */

const importModal = document.getElementById("importModal");
const importBtn = document.getElementById("importMatchesBtn");
const importConfirmBtn = document.getElementById("importConfirmBtn");
const importCancelBtn = document.getElementById("importCancelBtn");

const importModeFileToggle = document.getElementById("importModeFileToggle");
const importScopeAllToggle = document.getElementById("importScopeAllToggle");
const importTourLabel = document.getElementById("importTourLabel");

const importInput = document.getElementById("importMatchesInput");

/* ===== PREVIEW IMPORT ===== */

let pendingImportData = null;

/* ==========================
   ОТКРЫТЬ ОКНО ЭКСПОРТА
========================== */
exportBtn.addEventListener("click", () => {
    exportModal.classList.remove("hidden");
    // ❌ больше не трогаем текст
});

/* ==========================
   ОТКРЫТЬ ОКНО ИМПОРТА
========================== */
importBtn.addEventListener("click", () => {
    importModal.classList.remove("hidden");
    // ❌ не перезаписываем
});

/* ==========================
   ПОДТВЕРЖДЕНИЕ ЭКСПОРТА
========================== */
exportConfirmBtn.addEventListener("click", async () => {

    await exportMatches();

    exportModal.classList.add("hidden");

});

/* ==========================
   КНОПКА ОТМЕНА
========================== */
exportCancelBtn.addEventListener("click", () => {
    exportModal.classList.add("hidden");
});

/* ==========================
   ПОДТВЕРЖДЕНИЕ ИМПОРТА
========================== */
importConfirmBtn.addEventListener("click", async () => {
if(pendingImportData){
await applyImportData(pendingImportData);
pendingImportData = null;
importModal.classList.add("hidden");
return;
}

const fileMode = importModeFileToggle.checked;

if(fileMode){
importInput.click();
}else{

let text;

try{
text = await navigator.clipboard.readText();
if(!text){
alert("Буфер обмена пуст.");
return;
}
}catch(e){
alert("Не удалось прочитать буфер обмена.");
return;
}

let data;

try{
data = JSON.parse(text);
}catch(e){
alert("Буфер не содержит JSON турнира.");
return;
}
if(!data.matches){
alert("Неверный формат данных.");
return;
}
const preview = await previewImport(data);
pendingImportData = data;
showImportPreview(preview);
}
});

/* ==========================
   КНОПКА ОТМЕНА
========================== */
importCancelBtn.addEventListener("click", () => {
    importModal.classList.add("hidden");
    pendingImportData = null;
    const p = document.getElementById("importPreviewBlock");
    if(p) p.remove();
});

/* ==========================
   КЛИК ВНЕ ОКНА
========================== */
exportModal.addEventListener("click", (e)=>{
    if(e.target === exportModal){
        exportModal.classList.add("hidden");
    }
});

importModal.addEventListener("click",(e)=>{

    if(e.target === importModal){

        importModal.classList.add("hidden");

    }

});


/* ==========================
   ESC ЗАКРЫВАЕТ ОКНО
========================== */

document.addEventListener("keydown",(e)=>{
    if(e.key === "Escape"){
        exportModal.classList.add("hidden");
        importModal.classList.add("hidden");
    }
});

importInput.addEventListener("change", e => {

    const file = e.target.files[0];

    if (!file) return;

    importTournamentMatches(file);
});

function mapToLatin(char) {
    const map = {
        й:'q', ц:'w', у:'e', к:'r', е:'t', н:'y', г:'u', ш:'i', щ:'o', з:'p',
        ф:'a', ы:'s', в:'d', а:'f', п:'g', р:'h', о:'j', л:'k', д:'l',
        я:'z', ч:'x', с:'c', м:'v', и:'b', т:'n', ь:'m'
    };

    char = char.toLowerCase();
    const mapped = map[char] || char;

    return mapped.toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

const codeInput = document.getElementById('codeTextInput');

// 🔥 ХРАНИМ "ЧИСТЫЙ" ВВОД ПОЛЬЗОВАТЕЛЯ (без X и ZHMER)
let rawInputValue = '';

if (codeInput) {

    // ==========================
    // ⌫ ОБРАБОТКА BACKSPACE
    // ==========================
    codeInput.addEventListener('keydown', (e) => {

        // 🔴 если нажали backspace
        if (e.key === 'Backspace') {

            // 🔹 удаляем последний символ из "сырого" ввода
            rawInputValue = rawInputValue.slice(0, -1);

            // 🔹 заново собираем отображаемую строку
            updateFormatted();

            // 🔹 ОТМЕНЯЕМ стандартное поведение (иначе будет ломать логику)
            e.preventDefault();
        }
    });

    // ==========================
    // ⌨️ ОБРАБОТКА ВВОДА
    // ==========================
    codeInput.addEventListener('input', (e) => {

        // 🔹 получаем именно введённый символ (а не весь input)
        const chars = e.data;

        // 🔹 если это не ввод (например delete/вставка) — игнор
        if (!chars) return;

        // 🔹 переводим в латиницу + фильтруем
        const mapped = chars
            .split('')
            .map(ch => mapToLatin(ch)) // кириллица → латиница
            .join('')
            .replace(/[^A-Z0-9-]/g, ''); // только A-Z0-9

        // 🔹 добавляем в "сырой ввод"
        rawInputValue += mapped;

        // 🔹 ограничение: максимум 8 пользовательских символов
        rawInputValue = rawInputValue.slice(0, 8);

        // 🔹 обновляем отображение
        updateFormatted();
    });

    // ==========================
    // 🧠 ФОРМИРОВАНИЕ КОДА
    // ==========================
    function updateFormatted() {

        // 🔹 если пусто → очищаем input
        if (!rawInputValue.length) {
            codeInput.value = '';
            return;
        }

        // 🔹 первые 4 символа → левая часть
        const left = rawInputValue.slice(0, 4);

        // 🔹 символы после 4 → правая часть
        const right = rawInputValue.slice(4);

        // 🔹 начинаем всегда с X
        const isLoveCode = 'ILOVEYOU'.startsWith(rawInputValue.toUpperCase());

let result;

if (isLoveCode) {
    // 💖 СПЕЦ-ФОРМАТ БЕЗ ZHMER
    result = 'X-' + rawInputValue.toUpperCase() + '-X';
} else {
    // 🧠 ОБЫЧНЫЙ ФОРМАТ (как было)
    const left = rawInputValue.slice(0, 4);
    const right = rawInputValue.slice(4);

    result = 'X' + left;

    if (rawInputValue.length > 4) {
        result += '-ZHMER-' + right;
    }

    if (rawInputValue.length === 8) {
        result += 'X';
    }
}

const formattedCode = result;

// 🔥 проверка спец-кода
if (formattedCode === 'X-ILOVEYOU-X') {
    applyLoveCode();
}

        // 🔹 записываем в input
        codeInput.value = result;
    }
}

// ==========================
// 🎲 ГЕНЕРАЦИЯ КОДА ТУРНИРА
// ==========================

function generateTournamentCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    function part(len) {
        return Array.from({ length: len }, () =>
            chars[Math.floor(Math.random() * chars.length)]
        ).join('');
    }

    return `X${part(4)}-ZHMER-${part(4)}X`;
}

// ==========================
// ☁️ СОХРАНЕНИЕ КОДА
// ==========================

async function saveTournamentToCloud(code) {
    const data = {
        teams: teamsInput.value,
        urls: urlsInput.value
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/textarea_teams_urls`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            code: code,
            data: data
        })
    });

    if (!res.ok) {
        alert('❌ Ошибка сохранения кода');
        return false;
    }

    return true;
}

// ==========================
// 📥 ЗАГРУЗКА ПО КОДУ
// ==========================

async function loadTournamentFromCloud(code) {

    // 💖 СПЕЦ-КОД
    if (code === 'X-ILOVEYOU-X') {
        applyLoveCode();
        return;
    }

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/textarea_teams_urls?code=eq.${code}`,
        {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        }
    );

    if (!res.ok) {
        alert('❌ Ошибка загрузки');
        return;
    }

    const result = await res.json();

    if (!result.length) {
        alert('❌ Код не найден');
        return;
    }

    const data = result[0].data;

    teamsInput.value = data.teams;
    urlsInput.value = data.urls;

    saveInputsToLocalStorage();

    alert(`✅ Турнир загружен по коду ${code}`);
}

// обработчики

document.addEventListener('DOMContentLoaded', () => {

    const tournamentCodeBtn = document.getElementById('tournamentCodeBtn');
    const modal = document.getElementById('tournamentCodeModal');

    const randomBtn = document.getElementById('randomCodeBtn');
    const saveBtn = document.getElementById('saveCodeBtn');
    const loadConfirmBtn = document.getElementById('loadCodeConfirmBtn');

    const codeInputWrapper = document.getElementById('codeInputWrapper');

    const closeTournamentModalBtn = document.getElementById('closeTournamentCodeModal');
    const authyGrid = document.getElementById('authyGrid');

    let authyInputs = [];

    function buildAuthyInputs() {

    authyGrid.innerHTML = '';
    authyInputs = []; 

    function createInput() {
        const input = document.createElement('input');
        input.maxLength = 1;
        input.className = 'authy-char';

        input.addEventListener('input', () => {
            input.value = mapToLatin(input.value);

            const next = authyInputs[authyInputs.indexOf(input) + 1];
            if (next && input.value) next.focus();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace') {
                if (input.value) {
                    input.value = '';
                } else {
                    const prev = authyInputs[authyInputs.indexOf(input) - 1];
                    if (prev) {
                        prev.focus();
                        prev.value = '';
                    }
                }
            }
        });

        return input;
    }

    function createFixed(char) {
        const div = document.createElement('div');
        div.textContent = char;
        div.className = 'authy-char fixed';
        return div;
    }

    // 🔥 ROW 1: X + 4 inputs
    authyGrid.appendChild(createFixed('X'));

    for (let i = 0; i < 4; i++) {
        const inp = createInput();
        authyInputs.push(inp);
        authyGrid.appendChild(inp);
    }

    // 🔥 ROW 2: ZHMER
    ['Z','H','M','E','R'].forEach(ch => {
        authyGrid.appendChild(createFixed(ch));
    });

    // 🔥 ROW 3: 4 inputs + X
    for (let i = 0; i < 4; i++) {
        const inp = createInput();
        authyInputs.push(inp);
        authyGrid.appendChild(inp);
    }

    authyGrid.appendChild(createFixed('X'));

// 🔥 СКРЫТАЯ КНОПКА ОЧИСТКИ (поверх правого нижнего X)
const clearBtn = document.createElement('button');
clearBtn.className = 'authy-clear-btn';

// 🔹 очищаем все 8 input'ов
clearBtn.addEventListener('click', () => {
    authyInputs.forEach(inp => inp.value = '');

    // 🔹 фокус на первый input
    if (authyInputs[0]) authyInputs[0].focus();
});

// 🔹 добавляем в grid (будет лежать поверх X)
authyGrid.appendChild(clearBtn);
}

    // 🔓 открыть модалку
if (tournamentCodeBtn && modal) {
    tournamentCodeBtn.addEventListener('click', () => {
    modal.classList.remove('hidden');

// 🔥 RESET ВСЕГО UI
const createBtn = document.getElementById('createCodeBtn');
const loadBtn = document.getElementById('loadCodeBtn');
const codeTextInput = document.getElementById('codeTextInput');

// 🔥 RESET ВСЕГО UI (ТОЛЬКО ПОСЛЕ ОБЪЯВЛЕНИЯ)
// ❌ НЕ ТРОГАЕМ WRAPPER
if (authyGrid) authyGrid.classList.add('hidden');
if (randomBtn) randomBtn.classList.add('hidden');
if (saveBtn) saveBtn.classList.add('hidden');

if (codeTextInput) {
    codeTextInput.classList.add('hidden');
    codeTextInput.value = '';
}

if (loadConfirmBtn) loadConfirmBtn.classList.add('hidden');
if (createBtn) createBtn.style.display = 'inline-block';
if (loadBtn) loadBtn.style.display = 'inline-block';

    authyInputs = [];

if (authyGrid) authyGrid.innerHTML = '';
});
}

// ❌ клик вне окна
if (modal) {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });
}

// ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal) {
        modal.classList.add('hidden');
    }
});

if (randomBtn) {
    randomBtn.addEventListener('click', () => {

        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomPart(len) {
    return Array.from({ length: len }, () =>
        chars[Math.floor(Math.random() * chars.length)]
    ).join('');
}

const left = randomPart(4);
const right = randomPart(4);

const full = left + right; // только 8 символов

for (let i = 0; i < authyInputs.length; i++) {
    authyInputs[i].value = full[i] || '';
}

    });
}

    if (closeTournamentModalBtn && modal) {
        closeTournamentModalBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            codeInputWrapper.classList.add('hidden');
        });
    }

    const createBtn = document.getElementById('createCodeBtn');
    const loadBtn = document.getElementById('loadCodeBtn'); // ✅ ВЕРНУЛИ
    const codeTextInput = document.getElementById('codeTextInput');

if (createBtn) {
    createBtn.addEventListener('click', () => {

        createBtn.style.display = 'none';
        loadBtn.style.display = 'block'; // 🔥 фикс

        codeInputWrapper.classList.remove('hidden');

        if (authyGrid) authyGrid.classList.remove('hidden');
        randomBtn.classList.remove('hidden');
        saveBtn.classList.remove('hidden');

        codeTextInput.classList.add('hidden');
        loadConfirmBtn.classList.add('hidden');

        buildAuthyInputs();
    });
}

if (loadBtn) {
    loadBtn.addEventListener('click', () => {

        loadBtn.style.display = 'none';
        createBtn.style.display = 'block'; // 🔥 фикс

        codeInputWrapper.classList.remove('hidden');

        if (authyGrid) authyGrid.classList.add('hidden');
        if (randomBtn) randomBtn.classList.add('hidden');
        if (saveBtn) saveBtn.classList.add('hidden');

        codeTextInput.classList.remove('hidden');
        loadConfirmBtn.classList.remove('hidden');

        codeTextInput.focus();
        codeTextInput.value = ''; // 🔥 очищает прошлый код
    });
}

if (saveBtn) {
    saveBtn.addEventListener('click', async () => {

        // 🔥 берём код из authy
        let code = "X";

        for (let i = 0; i < 4; i++) {
            code += authyInputs[i].value || '';
        }

code += "-ZHMER-";

        for (let i = 4; i < 8; i++) {
            code += authyInputs[i].value || '';
        }

code += "X";

        const check = await fetch(
            `${SUPABASE_URL}/rest/v1/textarea_teams_urls?code=eq.${code}`,
            {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            }
        );

        const existing = await check.json();

        if (existing.length) {
            alert('❌ Такой код уже существует');
            return;
        }

        const ok = await saveTournamentToCloud(code);
        if (!ok) return;

        navigator.clipboard.writeText(code);
        alert(`Сохранено: ${code}`);
    });
}

if (loadConfirmBtn) {
    loadConfirmBtn.addEventListener('click', async () => {
        const code = codeTextInput.value.trim().toUpperCase();

        if (!code.includes('-ZHMER-') && code !== 'X-ILOVEYOU-X') {
    alert('Введите код полностью');
    return;
}

        await loadTournamentFromCloud(code);
        if (code === 'X-ILOVEYOU-X') {
    applyLoveCode();
} else {
    updateInputLabels();
}

// 🔥 закрываем модал
modal.classList.add('hidden');
    });
    }
});


// ПЕСНИ / КОМАНДЫ 

function detectTournamentType(lines) {
    // 🔥 если не передали — берём из textarea
    if (!lines) {
        lines = teamsInput.value.split("\n").filter(l => l.trim());
    }

    if (!lines.length) return 'unknown';

    const hasTracks = lines.some(l => l.includes(" – "));
    return hasTracks ? 'tracks' : 'teams';
}

function updateInputLabels() {
    const lines = teamsInput.value.split("\n").filter(l => l.trim());
    const type = detectTournamentType(lines);

    const teamsLabel = document.querySelector('label[for="teamsInput"]');
    const urlsGroup = document.querySelector('label[for="urlsInput"]')?.closest('.input-group');
    const title = document.querySelector('.container h1');

    const generateBtn = document.getElementById('generateBtn');
    const resetBtn = document.getElementById('resetBtn');
    const codeBtn = document.getElementById('tournamentCodeBtn');
    const updateBtn = document.getElementById('updateTeamsBtn');
    const replaceBtn = document.getElementById('replaceTeamBtn');

    if (!teamsLabel || !title) return;

    const isLoveMode = teamsInput.value.toLowerCase().includes("маша");

    // 💖 LOVE MODE
    if (isLoveMode) {

        // 🔥 заголовок
        title.textContent = "ТЫ ТОП-1 2025 ГОДА (и 2026 тоже)";

        // 🔥 label
        teamsLabel.textContent = `МАША ТЫ САМАЯ ЛУЧШАЯ
Я ТЕБЯ ЛЮБЛЮ
ТЫ МОЙ МИР
МОЙ АНГЕЛ
СПАСИБО ЧТО ТЫ ЕСТЬ ❤️❤️❤️`;

        // 🔥 скрываем ссылки
        if (urlsGroup) urlsGroup.style.display = 'none';

        teamsInput.placeholder = '';

        // 🔥 меняем кнопки (БЕЗ disabled)
        if (generateBtn) generateBtn.textContent = "Удалить всех кроме тебя";
        if (resetBtn) resetBtn.textContent = "Случайно влюбиться снова";
        if (codeBtn) codeBtn.textContent = "Завершить турнир (ты уже победила)";
        if (updateBtn) updateBtn.textContent = "🔥";
        if (replaceBtn) replaceBtn.textContent = "❤️‍🔥";

        // 🔥 ОТКЛЮЧАЕМ КЛИКИ (но цвет сохраняется)
        [generateBtn, resetBtn, codeBtn, updateBtn, replaceBtn].forEach(btn => {
            if (!btn) return;
            btn.style.pointerEvents = 'none';
        });

        // 🔥 СКРЫВАЕМ ВСЁ НИЖЕ "Лучшие матчи тура"
        const bestMatches = document.querySelector('.best-matches-wrapper');
        if (bestMatches) {
            let el = bestMatches;
            while (el) {
                el.style.display = 'none';
                el = el.nextElementSibling;
            }
        }

        return;
    }

    // 🔁 ВЫХОД ИЗ LOVE MODE

    title.textContent = "ТОП-100 ПЕСЕН 2025 ГОДА";

    if (urlsGroup) urlsGroup.style.display = '';

    teamsInput.placeholder = `Команда 1
Команда 2
Команда 3
Команда 4`;

    if (generateBtn) generateBtn.textContent = "Сгенерировать расписание";
    if (resetBtn) resetBtn.textContent = "Сбросить все данные";
    if (codeBtn) codeBtn.textContent = "Код турнира";
    if (updateBtn) updateBtn.textContent = "Х";
    if (replaceBtn) replaceBtn.textContent = "↺";

    // 🔥 ВОЗВРАЩАЕМ КЛИКИ
    [generateBtn, resetBtn, codeBtn, updateBtn, replaceBtn].forEach(btn => {
        if (!btn) return;
        btn.style.pointerEvents = '';
    });

    // 🔥 ВОЗВРАЩАЕМ ВСЁ НИЖЕ
    const bestMatches = document.querySelector('.best-matches-wrapper');
    if (bestMatches) {
        let el = bestMatches;
        while (el) {
            el.style.display = '';
            el = el.nextElementSibling;
        }
    }

    // обычная логика
    if (type === 'tracks') {
        teamsLabel.textContent = "ПЕСНИ:";
    } else if (type === 'teams') {
        teamsLabel.textContent = "КОМАНДЫ:";
    } else {
        teamsLabel.textContent = "ПЕСНИ:";
    }
}

function applyLoveCode() {

    const loveText = `МАША ТЫ САМАЯ ЛУЧШАЯ
Я ТЕБЯ ЛЮБЛЮ
ТЫ МОЙ МИР
МОЙ АНГЕЛ
СПАСИБО ЧТО ТЫ ЕСТЬ ❤️❤️❤️`;

    teamsInput.style.transition = '0.4s';
    teamsInput.style.opacity = '0';

    setTimeout(() => {

        teamsInput.value = loveText;

        updateInputLabels();

        teamsInput.style.opacity = '1';

        teamsInput.dispatchEvent(new Event('input'));

    }, 200);
}

teamsInput.addEventListener('input', updateInputLabels);

// ==========================
// 🎛️ FILTERS NAVIGATION
// ==========================

const filtersBtn = document.querySelector('.filters-main-btn');
const filtersModal = document.querySelector('.filters-modal');
const screens = document.querySelectorAll('.filters-screen');

// открыть / закрыть модалку
filtersBtn.addEventListener('click', () => {
    filtersModal.classList.toggle('hidden');

    // всегда возвращаемся в MAIN
    switchScreen('main');
});

// функция переключения экранов
function switchScreen(name) {
    screens.forEach(s => s.classList.remove('active'));

    const target = document.querySelector(`.filters-screen[data-screen="${name}"]`);
    if (target) target.classList.add('active');
}

// ==========================
// LEVEL 1 → LEVEL 2
// ==========================

document.querySelector('.filter-btn.default')
    .addEventListener('click', () => switchScreen('default'));

document.querySelector('.filter-btn.season')
    .addEventListener('click', () => switchScreen('season'));

document.querySelector('.filter-btn.tier')
    .addEventListener('click', () => switchScreen('tier'));

// ==========================
// НАЗАД
// ==========================

document.querySelectorAll('.filter-btn.back')
.forEach(btn => {
    btn.addEventListener('click', () => {
        resetAllStandingsFilters(); // 🔥 ВОТ ЭТО НОВОЕ
        switchScreen('main');
    });
});

// ==========================
// DEFAULT FILTERS
// ==========================

document.querySelector('.filter-btn.c100')
.addEventListener('click', () => {
    const total = document.querySelectorAll("#standingsBody tr").length;

    activeStandingsRange = total >= 100 ? { from: 1, to: 100 } : null;

    applyStandingsVisibilityFilter();
});

document.querySelector('.filter-btn.c10')
.addEventListener('click', () => {
    const total = document.querySelectorAll("#standingsBody tr").length;

    activeStandingsRange = total >= 10 ? { from: 1, to: 10 } : null;

    applyStandingsVisibilityFilter();
});

document.querySelector('.filter-btn.nq')
.addEventListener('click', () => {
    const rows = document.querySelectorAll("#standingsBody tr");
    const total = rows.length;

    const bottomCount = Math.round(total / 3);
    const from = total - bottomCount;

    activeStandingsRange = { from, to: total };

    applyStandingsVisibilityFilter();
});

// custom
document.querySelector('.filter-btn.custom')
.addEventListener('click', () => {

    document.querySelector('.custom-range-inputs').style.display = 'flex';
    document.querySelector('.artist-filter-box').style.display = 'none';
});

// artist
document.querySelector('.filter-btn.artist')
.addEventListener('click', () => {

    document.querySelector('.artist-filter-box').style.display = 'flex';
    document.querySelector('.custom-range-inputs').style.display = 'none';
});

// ==========================
// SEASON FILTERS
// ==========================

// feat
document.querySelector('.filter-btn.feat')
.addEventListener('click', () => {
    activeStandingsArtistType = 'feat'; // // кнопка [feat.]
    applyStandingsVisibilityFilter();
});

// solo
document.querySelector('.filter-btn.solo')
.addEventListener('click', () => {
    activeStandingsArtistType = 'solo'; // // кнопка [solo]
    applyStandingsVisibilityFilter();
});

// 2024
document.querySelector('.filter-btn.y2024')
.addEventListener('click', () => {
    activeYearFilter = 2024; // // кнопка [2024]
    applyStandingsVisibilityFilter();
});

// зима
document.querySelector('.filter-btn.winter')
.addEventListener('click', () => {
    activeSeasonFilter = 'winter'; // // кнопка [Зима]
    applyStandingsVisibilityFilter();
});

// весна
document.querySelector('.filter-btn.spring')
.addEventListener('click', () => {
    activeSeasonFilter = 'spring'; // // кнопка [Весна]
    applyStandingsVisibilityFilter();
});

// лето
document.querySelector('.filter-btn.summer')
.addEventListener('click', () => {
    activeSeasonFilter = 'summer'; // // кнопка [Лето]
    applyStandingsVisibilityFilter();
});

// осень
document.querySelector('.filter-btn.autumn')
.addEventListener('click', () => {
    activeSeasonFilter = 'autumn'; // // кнопка [Осень]
    applyStandingsVisibilityFilter();
});

// ==========================
// TIER FILTERS
// ==========================

// (1)
document.querySelector('.filter-btn.t1')
.addEventListener('click', () => {
    activeTierFilter = 1; // // кнопка [(1)]
    applyStandingsVisibilityFilter();
});

// (2)
document.querySelector('.filter-btn.t2')
.addEventListener('click', () => {
    activeTierFilter = 2; // // кнопка [(2)]
    applyStandingsVisibilityFilter();
});

// (3)
document.querySelector('.filter-btn.t3')
.addEventListener('click', () => {
    activeTierFilter = 3; // // кнопка [(3)]
    applyStandingsVisibilityFilter();
});

// (4)
document.querySelector('.filter-btn.t4')
.addEventListener('click', () => {
    activeTierFilter = 4; // // кнопка [(4)]
    applyStandingsVisibilityFilter();
});

// (5)
document.querySelector('.filter-btn.t5')
.addEventListener('click', () => {
    activeTierFilter = 5; // // кнопка [(5)]
    applyStandingsVisibilityFilter();
});

// (6)
document.querySelector('.filter-btn.t6')
.addEventListener('click', () => {
    activeTierFilter = 6; // // кнопка [(6)]
    applyStandingsVisibilityFilter();
});

// 20XX
document.querySelector('.filter-btn.t20xx')
.addEventListener('click', () => {

    activeSpecialTracksFilter = true;

    applyStandingsVisibilityFilter();
});

// custom APPLY
document.getElementById('applyCustomRange')?.addEventListener('click', () => {

    const from = parseInt(document.getElementById('customFrom').value);
    const to   = parseInt(document.getElementById('customTo').value);
    const total = document.querySelectorAll("#standingsBody tr").length;

    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > total || from > to) {
        alert("Некорректный диапазон");
        return;
    }

    activeStandingsRange = { from, to };

    applyStandingsVisibilityFilter();
});

// artist APPLY
document.getElementById('applyArtistFilter')?.addEventListener('click', () => {

    const input = document.getElementById('artistFilterInput');
if (!input) return;

const val = input.value.trim();
    if (!val) return;

    activeStandingsArtistFilter = val.toLowerCase();

    applyStandingsVisibilityFilter();
});

// T9-логика для верхнего фильтра 

function initStandingsArtistFilterT9() {
    const input = document.getElementById('artistFilterInput');
    const suggestions = document.getElementById('ArtistFilterSuggestions');

    if (!input || !suggestions) return;

    input.addEventListener('input', () => {
        const query = input.value.trim().toLowerCase();

        suggestions.innerHTML = '';

        if (!query) return;

        const artists = getAllArtistsFromTeams();
        const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

        artists
            .filter(a => regex.test(a))
            .slice(0, 6)
            .forEach(name => {
                const div = document.createElement('div');
                div.className = 'artist-suggestion';
                div.textContent = name;

                div.addEventListener('click', () => {
                    input.value = name;
                    suggestions.innerHTML = '';
                });

                suggestions.appendChild(div);
            });
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !suggestions.contains(e.target)) {
            suggestions.innerHTML = '';
        }
    });
}

// --- Конец скрипта ---
// Вся логика работы с IndexedDB, генерация расписания, отображение туров,
// обработка ввода счета и Spotify URL (теперь кнопками), а также базовая статистика тура
// реализованы и объединены.