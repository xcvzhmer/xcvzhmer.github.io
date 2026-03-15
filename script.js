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
// 🆚 сравнение команд
let selectedCompareTeamA = null;
let selectedCompareTeamB = null;
// 🎯 активный фильтр по Артисту
let activeArtistFilter = null;
let artistFilterInitialized = false;
// 🍋‍🟩 [S] в основной таблице
let activeSpotifyCell = null;
// 🎯 Экспорт только изменённых матчей
let lastExportTime = 0;
// 🎯 ВРЕМЯ ОТКРЫТИЯ САЙТА
let pageOpenTime = Date.now();

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
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['teams'], 'readonly');
        const store = transaction.objectStore('teams');
        const request = store.getAll();

        request.onsuccess = (event) => {
            resolve(event.target.result);
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

        // ✅ НОВЫЕ ХРАНИЛИЩА ДЛЯ СРАВНЕНИЯ
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

        // Обновляем UI
        updateTourNavigation();
        displayTour(tournamentData.currentTourIndex);
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
                return aInactive ? 1 : -1; // inactive идут вниз
            }

            if (statsB.points !== statsA.points) return statsB.points - statsA.points;
            if (statsB.goalDifference !== statsA.goalDifference) return statsB.goalDifference - statsA.goalDifference;
            return statsB.goalsFor - statsA.goalsFor;
        });

        // Рендерим строки таблицы
        sortedTeams.forEach((teamName, index) => {
    const stats = standings[teamName];

    // ✅ СОХРАНЯЕМ ДАННЫЕ ДЛЯ СРАВНЕНИЯ (ПРАВИЛЬНО)
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

    // 🧹 убираем inline-цвета ТОЛЬКО для отображения
    const cleanTeamName = stripInlineColors(teamName);

    row.innerHTML = `
    <td class="position-cell" data-position="${index + 1}">
        ${index + 1}
    </td>
        <td>${cleanTeamName}</td>
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
    cell.dataset.original = cell.dataset.position;

    // Очищаем ячейку
    cell.innerHTML = '';
    cell.style.padding = '0';

    // Создаём кнопку
    const btn = document.createElement('a');
    btn.href = '#';
    btn.addEventListener('click', function (e) {
    e.preventDefault();
    playInGlobalPlayer(url, this);
});
    btn.rel = 'noopener';
    btn.className = 'standings-spotify-overlay';
    btn.textContent = 'S';

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

/* ======================================================
   📊 ФОРМА , ЗГ/ПГ, СЕРИИ — ДЛЯ ВТОРОГО МОДАЛЬНОГО ОКНА
====================================================== */

async function getLastPlayedMatchesFromDB(teamName, limit = 5) {
    const tx = db.transaction(['schedule'], 'readonly');
    const store = tx.objectStore('schedule');
    const req = store.getAll();

    return new Promise(resolve => {
        req.onsuccess = () => {
    const cleanTeam = stripInlineColors(teamName);

    const all = req.result.filter(m =>
        !m.isBye &&
        m.score1 !== null &&
        m.score2 !== null &&
        (
            stripInlineColors(m.team1) === cleanTeam ||
            stripInlineColors(m.team2) === cleanTeam
        )
    );

            if (!all.length) {
                resolve([]);
                return;
            }

            const lastTour = Math.max(...all.map(m => m.tourIndex));

            const matches = all
                .filter(m => m.tourIndex >= lastTour - (limit - 1))
                .sort((a, b) => a.tourIndex - b.tourIndex);

            resolve(matches);
        };
    });
}

async function getStreaksFromDB(teamName) {
    const tx = db.transaction(['schedule'], 'readonly');
    const store = tx.objectStore('schedule');
    const req = store.getAll();

    return new Promise(resolve => {
        req.onsuccess = () => {

    const cleanTeam = stripInlineColors(teamName);

    let win = 0;
    let clean = 0;
    let golden = 0;

        // ⬇️ ВОТ ЭТИ ДВЕ СТРОКИ ПРОПАЛИ
    let cleanActive = true;
    let goldenActive = true;

    const matches = req.result
        .filter(m =>
            !m.isBye &&
            m.score1 !== null &&
            m.score2 !== null &&
            (
                stripInlineColors(m.team1) === cleanTeam ||
                stripInlineColors(m.team2) === cleanTeam
            )
        )
                .sort((a, b) => b.tourIndex - a.tourIndex); // последний тур → назад

            for (const m of matches) {
                const scored   = m.team1 === teamName ? m.score1 : m.score2;
                const conceded = m.team1 === teamName ? m.score2 : m.score1;

                // ❌ ничья или поражение — обрывает ВСЁ
                if (scored <= conceded) break;

                // ✅ победа
                win++;

                // 🟦 сухая серия
                if (cleanActive && conceded === 0) {
                    clean++;
                } else {
                    cleanActive = false;
                }

                // 🟨 золотая серия
                if (goldenActive && conceded === 0 && scored >= 4) {
                    golden++;
                } else {
                    goldenActive = false;
                }
            }

            resolve({ win, clean, golden });
        };
    });
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
    await displayTour(0); // Показываем первый тур
    await renderStandingsFromDB(); // Отображаем таблицу

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

    // 🔥 ДИСКВАЛИФИЦИРОВАННЫЕ КОМАНДЫ
if (
    team.includes("дисквали") ||
    team.includes("DISQ") ||
    team.includes("BYE")
) {
    diff = -513;
}

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

    const aDisq =
    a.team.includes("BYE") ||
    a.team.includes("дисквали") ||
    a.diff === -513;

const bDisq =
    b.team.includes("BYE") ||
    b.team.includes("дисквали") ||
    b.diff === -513;

    if (aDisq && !bDisq) return 1;
    if (!aDisq && bDisq) return -1;

    return b.diff - a.diff;
});

    rows.forEach((r, i) => {
    const tr = document.createElement('tr');

    // 🧹 чистим ТОЛЬКО отображаемое имя
    const cleanTeamName = stripInlineColors(r.team);

    tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${cleanTeamName}</td>
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
        <th>Счет</th>
        <th>Счет</th>
        <th>Команда 2</th>
        <th></th>
        <th></th> <!-- Пустая ячейка для действий -->
    `;

    currentTourMatches.forEach((match, matchIndex) => {
        // 🎯 ФИЛЬТР ПО СЧЁТУ
    if (!matchPassesScoreFilter(match)) return false;
    if (!matchPassesArtistFilter(match)) return false;

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
        matchNumCell.textContent = `${matchIndex + 1}`;

        // Spotify кнопка для Команды 1
        const spotifyBtnCell1 = row.insertCell(1);
        spotifyBtnCell1.style.width = '36px';
        spotifyBtnCell1.style.textAlign = 'center';
        const spotifyUrl1 = match.spotifyUrl1 || '';
        const spotifyBtn1 = createSpotifyButton(spotifyUrl1);
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
        const spotifyBtn2 = createSpotifyButton(spotifyUrl2);
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

    if (result && activeArtistFilter) {
        const matches = countArtistMatchesInCurrentTour(activeArtistFilter);
        result.textContent = `Матчей с этим артистом в этом туре: ${matches}`;
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

function createSpotifyButton(url) {
    const size = 28;
    if (url && url.length > 0) {
        const a = document.createElement('a');

        a.href = "#";   // ← НЕ переходим со страницы
        
        a.className = 'spotify-btn';
        a.tabIndex = -1;
        a.title = 'Play in tournament player';

        a.addEventListener('click', function (e) {
        e.preventDefault();
        playInGlobalPlayer(url, this);
});

        a.style.display = 'inline-flex';
        a.style.alignItems = 'center';
        a.style.justifyContent = 'center';
        a.style.width = `${size}px`;
        a.style.height = `${size}px`;
        a.style.borderRadius = '4px';

        /* 🔥 ОПРЕДЕЛЯЕМ ПЛАТФОРМУ ДЛЯ ЦВЕТА И ТЕКСТА */

if (url.includes("soundcloud.com")) {
    a.style.backgroundColor = '#ff7500'; // ☁ SoundCloud оранжевый
    a.textContent = 'SC';                
a.style.fontSize = '15px';               // 🔥 немного меньше для SC
    } else {
    a.style.backgroundColor = '#1DB954'; // 🎵 Spotify зелёный
    a.textContent = 'S';
a.style.fontSize = '16px';                 // 🍋‍🟩 стандартный размер
        }
        a.style.color = '#ffffff';
        a.style.textDecoration = 'none';
        a.style.fontWeight = '700';
        a.style.boxSizing = 'border-box';
        return a;
    } else {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'spotify-btn disabled';
        btn.disabled = true;
        btn.tabIndex = -1;                   // ← 🔥 ВАЖНО (tab)
        btn.title = 'Нет ссылки';
        btn.style.display = 'inline-flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.width = `${size}px`;
        btn.style.height = `${size}px`;
        btn.style.borderRadius = '4px';
        btn.style.backgroundColor = '#6b6b6b'; // grey
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
    colors: ["#b79f99", "#bebebe", "#e9e9e9"]
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
    colors: ["#5f657c", "#d5dbe4"]
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
    colors: ["#ffffff", "#cb2929"]
  },
  "benjamingotbenz|supernova": {
    year: 2020,
    colors: ["#186db9", "#e16a09", "#fdf6ed"]
  },
  "sqwore|бардак": {
    year: 2024,
    colors: ["#2b2b2b", "#6e6e6e"]
  },
  "tonser|exx": {
    year: 2024,
    colors: ["#0f1c2e", "#1f6fb2"]
  },
  "angelik|revetg|ss25": {
    year: 2024,
    colors: ["#1c1c1c", "#8b5cf6", "#e5e7eb"]
  },
  "oklou|family and friends": {
    year: 2024,
    colors: ["#1c1c1c", "#8b5cf6", "#e5e7eb"]
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

        // 🔥 СОХРАНЯЕМ ТЕКУЩИЙ СКРОЛЛ
        const currentScroll = window.scrollY;

        // 🔥 ПЕРЕСЧЁТ ТАБЛИЦЫ
        await renderStandingsFromDB();

        // 🔥 ВОССТАНАВЛИВАЕМ СКРОЛЛ
        window.scrollTo(0, currentScroll);
        
// Перерисовываем таблицу результатов
        await repaintStandingsBannedRows();

// 🔥 применяем авто-вылет
        applyAuto33Relegation();

/* ===============================
   🔥 ЛОКАЛЬНОЕ ОБНОВЛЕНИЕ СТРОКИ МАТЧА
   без displayTour()
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

// ===============================
// Standings focus buttons
// ===============================

// инициализация фильтра Артист
initArtistFilter();
initArtistFilterT9();

document.querySelectorAll('.standings-focus-controls button')
.forEach(btn => {
    btn.addEventListener('click', () => {

        const range = btn.dataset.range;
        const artistType = btn.dataset.artistType;
        const specialFilter = btn.dataset.special;

        // feat. / solo
        if (artistType) {
            activeStandingsArtistType = artistType;

            document
                .querySelectorAll('.standings-focus-controls button[data-artist-type]')
                .forEach(b => b.classList.remove('active'));

            btn.classList.add('active');
            applyStandingsVisibilityFilter();
            return;
        }

        // 🔥 SPECIAL TRACKS (20XX)
        if (specialFilter) {

            activeSpecialTracksFilter = !activeSpecialTracksFilter;

            btn.classList.toggle('active', activeSpecialTracksFilter);

            applyStandingsVisibilityFilter();
            return;
        }

        // диапазоны
        const total = document.querySelectorAll("#standingsBody tr").length;

        if (range === 'all') {
    activeStandingsRange = null;
    activeStandingsArtistType = null;

    // 🔥 убираем активность feat/solo
    document
        .querySelectorAll('.standings-focus-controls button[data-artist-type]')
        .forEach(b => b.classList.remove('active'));
}

        else if (range === '100') {
    activeStandingsRange = total >= 100 ? { from: 1, to: 100 } : null;
    }

        else if (range === '40') {
    activeStandingsRange = total >= 40 ? { from: 1, to: 40 } : null;
    }

        else if (range === '10') {
    activeStandingsRange = total >= 10 ? { from: 1, to: 10 } : null;
    }

        else if (range === 'nq') {

    // 🔥 нижние 33% таблицы
    const bottomCount = Math.round(total / 3);
    const from = total - bottomCount + 1;

    activeStandingsRange = {
        from: from,
        to: total
    };
}

    else if (range === 'custom') {
    document.querySelector('.custom-range-inputs').style.display = 'flex';
    return;
    }

        document.querySelector('.custom-range-inputs').style.display = 'none';
        applyStandingsVisibilityFilter();
    });
});

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
        await renderStandingsFromDB();

        applyAuto33Relegation();

        await displayTour(0);
        updateTourNavigation();

        // 🔥 после displayTour
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
        await displayTour(tournamentData.currentTourIndex);
        updateTourNavigation();

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

            applyAuto33Relegation();

            await displayTour(tournamentData.currentTourIndex);
            updateTourNavigation();

            // 🔥 после displayTour
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
            row.dataset.track ||        // ← ИСХОДНОЕ НАЗВАНИЕ (ВАЖНО)
            row.dataset.team ||         // запасной вариант
            row.querySelector('.team-name')?.textContent ||
            "";

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

        // 🔥 SPECIAL TRACKS FILTER
if (activeSpecialTracksFilter) {
    let isSpecial = false;

    const trackKey = row.dataset.track;
    for (const k in SPECIAL_TRACKS) {
        const year = SPECIAL_TRACKS[k].year; // <- здесь новая структура
        if (isSpecialTrack(trackKey, k)) { 
            isSpecial = true;
            break;
        }
    }
    if (!isSpecial) {
        visible = false;
    }
}
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

    // ❌ исключаем дисквалифицированные
    const activeRows = allRows.filter(
        row => !row.classList.contains("disqualified")
    );

    const activeTeams = activeRows.length;

    if (activeTeams === 0) return;

    // 33% снизу (округление вверх)
    const relegationCount = Math.ceil(activeTeams * 0.22);

    const startIndex = activeTeams - relegationCount;

    // очищаем старые классы
    allRows.forEach(row => {
        row.classList.remove("auto-relegation-33");
    });

    // назначаем новые
    activeRows.forEach((row, index) => {
        if (index >= startIndex) {
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

        // Функция надёжного сравнения строки и имени команды
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
        await displayTour(tournamentData.currentTourIndex);
        updateTourNavigation();

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
        await displayTour(tournamentData.currentTourIndex);
        updateTourNavigation();

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

    // 🆚 Сравнение (третий модал)
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
    if (!artist || !track) return null;

    return `${stripInlineColors(artist)} – ${stripInlineColors(track)}`;
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

    return new Promise((resolve) => {

        const transaction = db.transaction(['schedule'], 'readonly');
        const store = transaction.objectStore('schedule');
        const request = store.getAll();

        request.onsuccess = (event) => {
            const allMatches = event.target.result;

            for (const match of allMatches) {
                if (!match || match.isBye) continue;

                const m1 = normalizeTeamName(stripInlineColors(match.team1));
                const m2 = normalizeTeamName(stripInlineColors(match.team2));

                if (
                    (m1 === A && m2 === B) ||
                    (m1 === B && m2 === A)
                ) {
                    resolve(match.tourIndex + 1);
                    return;
                }
            }

            resolve(null);
        };

        request.onerror = () => resolve(null);
    });
}

/* ===============================
   🔍 СУПЕР-T9 ДЛЯ ТРЕКОВ
=============================== */

async function getAllArtistTrackPairs() {
    const pairs = [];
    const seen = new Set();

    const tx = db.transaction(['schedule'], 'readonly');
    const store = tx.objectStore('schedule');
    const allMatches = await new Promise(resolve => {
        store.getAll().onsuccess = e => resolve(e.target.result);
    });

    allMatches.forEach(match => {
        if (!match || match.isBye) return;

        [match.team1, match.team2].forEach(team => {
            if (!team || !team.includes('–')) return;

            const { artist, track } = parseArtistAndTrack(team);
            if (!artist || !track) return;

            const cleanTrack = stripInlineColors(track);
            if (seen.has(cleanTrack)) return;
            seen.add(cleanTrack);

            const artistSearch = stripInlineColors(artist)
                .toLowerCase()
                .replace(/ё/g, 'е')
                .replace(/feat\.?/gi, '')
                .replace(/ft\.?/gi, '')
                .replace(/&/g, ' ')
                .replace(/,/g, ' ')
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

    return pairs;
}

/* ===============================
   🆚 T9 ПОИСК ТРЕКОВ (СРАВНЕНИЕ)
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
        const regex = new RegExp(safe.split('').join('.*'), 'i');

        const matches = pairs
            .filter(p => regex.test(p.search))
            .slice(0, 6);

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
        const query = input.value
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ');

        if (!query) return;

        const pairs = await getAllArtistTrackPairs();
        const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(safe.split('').join('.*'), 'i');

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

        const fullTeam = tournamentData.schedule
            .flat()
            .filter(Boolean)
            .flatMap(m => [m.team1, m.team2])
            .find(team => {
                const { track: t } = parseArtistAndTrack(team);
                return stripInlineColors(t) === track;
            });

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
    await displayTour(currentTourIndex);
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
    .slice(0, 6);

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
    if (!activeArtistFilter) return true;

    const target = activeArtistFilter.toLowerCase();

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
    const input = document.getElementById('artistFilterInput');

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
input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        activeArtistFilter = null;
        input.value = '';
        input.style.display = 'none';
        btn.style.display = 'block';
        const result = document.getElementById('artistFilterResult');
        if (result) result.textContent = '';
        displayTour(currentTourIndex);  
    }
  });
}

// ===============================
// T9-поиск для фильтра Артист
// ===============================
function initArtistFilterT9() {
    const input = document.getElementById('artistFilterInput');
    const suggestions = document.getElementById('artistFilterSuggestions');

    if (!input || !suggestions) return;

    input.addEventListener('input', () => {
        const query = input.value.trim().toLowerCase();
        suggestions.innerHTML = '';

            if (!query) {
        activeArtistFilter = null;
        displayTour(currentTourIndex);
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

                div.addEventListener('click', () => {
    input.value = name;
    suggestions.innerHTML = '';
    activeArtistFilter = name;

    const result = document.getElementById('artistFilterResult');
    if (result) {
        const matches = countArtistMatchesInCurrentTour(name);
        result.textContent = `Матчей с этим артистом в этом туре: ${matches}`;
    }

    displayTour(currentTourIndex);
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
            .slice(0, 6)
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

// ===============================
// 🆚 СЧЁТ + ПОЗИЦИИ В МОДАЛЕ СРАВНЕНИЯ     #6(#7)
// ===============================

function renderVSResult() {

    const leftEl  = document.getElementById('compareScoreLeft');
    const rightEl = document.getElementById('compareScoreRight');

    const leftRankEl  = document.getElementById('compareRankLeft');   // 🔥 ИЗМЕНЕНО — получаем сразу
    const rightRankEl = document.getElementById('compareRankRight');  // 🔥 ИЗМЕНЕНО — получаем сразу

    leftEl.textContent  = '';
    rightEl.textContent = '';

    if (leftRankEl)  leftRankEl.textContent  = '—';   // 🔥 ИЗМЕНЕНО — очищаем ранги сразу
    if (rightRankEl) rightRankEl.textContent = '—';   // 🔥 ИЗМЕНЕНО

    if (!selectedCompareTeamA || !selectedCompareTeamB) return;

    const A = selectedCompareTeamA;
    const B = selectedCompareTeamB;

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

    /* ===============================
       🆚 ПОИСК МАТЧА — ТЕПЕРЬ ОТДЕЛЬНО
    =============================== */

    const tx = db.transaction(['schedule'], 'readonly');
    const store = tx.objectStore('schedule');
    const request = store.getAll();

    request.onsuccess = (e) => {

        const match = e.target.result.find(m =>
            !m.isBye &&
            (
                (m.team1 === A && m.team2 === B) ||
                (m.team2 === A && m.team1 === B)
            )
        );

        // 🔥 ИЗМЕНЕНО — больше НЕ выходим раньше времени
        if (!match) return;
        if (match.score1 === null || match.score2 === null) return;

        const leftScore =
            match.team1 === A ? match.score1 : match.score2;

        const rightScore =
            match.team1 === A ? match.score2 : match.score1;

        leftEl.textContent  = leftScore;
        rightEl.textContent = rightScore;
    };
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
    const rows = [];

    for (const t of allTeams) {
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

        rows.push({
            team,
            diff: gf - ga
        });
    }

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

    iframe.src = embedUrl;

    if (!container.classList.contains('active')) {
    container.classList.add('active');
}

    localStorage.setItem('lastSpotifyTrack', embedUrl);
    localStorage.setItem('currentTrackId', trackId);

    // 🔥 ПОДСВЕТКА ЧЕРЕЗ КНОПКУ
    highlightActiveTeamCell(buttonElement);

    container.classList.remove('minimized');
    container.classList.add('active');

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
    // просто сохраняем ссылку
    iframe.dataset.savedTrack = saved;
    // 🔥 ПРЯЧЕМ ПЛЕЕР ПОЛНОСТЬЮ
    container.classList.remove('active');
}

    // ❌ КНОПКА ЗАКРЫТЬ ПЛЕЕР
    const closeBtn = document.getElementById('spotifyCloseBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', function () {

            iframe.src = '';
            container.classList.remove('active');
            localStorage.removeItem('lastSpotifyTrack');

            // 🔥 УБИРАЕМ ДОПОЛНИТЕЛЬНОЕ МЕСТО СНИЗУ
            document.body.style.paddingBottom = "0px";
        });
    }

    // ▬ КНОПКА СВЕРНУТЬ ПЛЕЕР
    const minimizeBtn = document.getElementById('spotifyMinimizeBtn');
    if (minimizeBtn) {
        minimizeBtn.addEventListener('click', function () {

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

    requestAnimationFrame(() => {

        const activeTrack = localStorage.getItem('currentTrackId');
        if (!activeTrack) return;

        const button = document.querySelector(
            `[data-track-id="${activeTrack}"]`
        );

        if (button) {
            highlightActiveTeamCell(button);
        }
    });
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
        await displayTour(currentTourIndex);
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
await displayTour(currentTourIndex);
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
            /* изменённые после открытия сайта */
            matches = matches.filter(m =>
                m.lastModified && m.lastModified > pageOpenTime
            );
        }else{
            /* текущий тур */
            matches = matches.filter(m =>
                m.tourIndex === currentTourIndex &&
                m.score1 !== null &&
                m.score2 !== null
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
                alert(`Скопировано в буфер: ${data.matches.length} матчей`);
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
          a.download = `changed_matches_${Date.now()}.json`;
        }else{
          a.download = `tour_${currentTourIndex+1}_${Date.now()}.json`;
        }
        a.click();

URL.revokeObjectURL(url);
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
    tourLabel.textContent = `Тур ${currentTourIndex+1}`;
});

/* ==========================
   ОТКРЫТЬ ОКНО ИМПОРТА
========================== */

importBtn.addEventListener("click", () => {
    importModal.classList.remove("hidden");
    importTourLabel.textContent = `Тур ${currentTourIndex+1}`;
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

// --- Конец скрипта ---
// Вся логика работы с IndexedDB, генерация расписания, отображение туров,
// обработка ввода счета и Spotify URL (теперь кнопками), а также базовая статистика тура
// реализованы и объединены.