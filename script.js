// script.js — обновлённый файл (на базе твоего кода) — все изменения для поддержки:
// - отдельного поля "ССЫЛКИ" (urlsInput)
// - отображения маленьких кнопок [S] (зелёная если есть ссылка, серая если нет)
// - обработки ❌ рядом с названием команды: все матчи этой команды = BYE, оппоненты получают тех. победу 3:0
// - inactive команды всегда занимают нижние места таблицы
// Код объединён и готов к использованию вместо старого script.js
// ъуйх
// --- Константы и переменные --- 
const DB_NAME = 'tournamentDB';
const DB_VERSION = 1;
let db; // Переменная для объекта базы данных IndexedDB

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

// ------------------ Сохранение/загрузка textarea в localStorage ------------------
const LS_TEAMS_KEY = 'rr_teams_textarea_v1';
const LS_URLS_KEY  = 'rr_urls_textarea_v1';

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
        tournamentData.standings = {};
        tournamentData.currentTourIndex = 0;
        tournamentData.totalTours = 0;

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
            const row = standingsBody.insertRow();
            // пометка стиля для inactive команд
            const isInactive = !!inactiveMap[teamName];
            if (isInactive) {
                row.classList.add('bye-match'); // используем уже существующий класс для визуального выделения
                row.style.opacity = '0.7';
                row.style.textDecoration = 'line-through';
            }

            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${teamName}</td>
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
const yellowFrom = settings?.yellowZone?.from;
const yellowTo   = settings?.yellowZone?.to;
const redFrom    = settings?.redZone?.from;
const redTo      = settings?.redZone?.to;

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

    getAllRequest.onerror = (event) => {
        console.error("Ошибка при загрузке всех матчей для расчета статистики:", event.target.error);
        alert("Не удалось рассчитать статистику турнира.");
    };
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

    console.log(`Расписание сгенерировано (${totalTours} туров, ${numMatchesPerTour} матчей за тур).`);
    alert(`Расписание сгенерировано (${totalTours} туров).`);

    // Обновляем UI
    updateTourNavigation();
    await displayTour(0); // Показываем первый тур
    await renderStandingsFromDB(); // Отображаем таблицу
    enableButtons();
    generateBtn.disabled = false; // Отключаем кнопку генерации
}

/**
 * Отображает матчи текущего тура.
 * @param {number} tourIndex - Индекс тура для отображения.
 */
async function displayTour(tourIndex) {
    currentTourOutput.innerHTML = ''; // Очищаем предыдущий тур

    const currentTourMatches = await getMatchesByTour(tourIndex);
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
        team1Cell.classList.add('match-teams');
        const team1NameSpan = document.createElement('span');
        team1NameSpan.classList.add('team-name');
        team1NameSpan.textContent = match.team1;
        team1Cell.appendChild(team1NameSpan);

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
        team2Cell.classList.add('match-teams');
        const team2NameSpan = document.createElement('span');
        team2NameSpan.classList.add('team-name');
        team2NameSpan.textContent = match.team2;
        team2Cell.appendChild(team2NameSpan);

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
}

/**
 * Создаёт маленькую кнопку [S]. Если url пустой — серый некликабельный квадратик.
 * Если url есть — зелёная ссылка (квадратная) с буквой S внутри.
 * Возвращает HTMLElement (a или button).
 */
function createSpotifyButton(url) {
    const size = 28;
    if (url && url.length > 0) {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'spotify-btn';
        a.tabIndex = -1;                     // ← 🔥 ВАЖНО (tab)
        a.title = 'Открыть в Spotify';
        a.style.display = 'inline-flex';
        a.style.alignItems = 'center';
        a.style.justifyContent = 'center';
        a.style.width = `${size}px`;
        a.style.height = `${size}px`;
        a.style.borderRadius = '4px';
        a.style.backgroundColor = '#1DB954'; // Spotify green
        a.style.color = '#ffffff';
        a.style.textDecoration = 'none';
        a.style.fontWeight = '700';
        a.style.boxSizing = 'border-box';
        a.textContent = 'S';
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

                    const spotify1Link = match.spotifyUrl1 ? `<a href="${match.spotifyUrl1}" target="_blank" class="spotify-link">S</a>` : '<span class="spotify-link disabled">S</span>';
                    const spotify2Link = match.spotifyUrl2 ? `<a href="${match.spotifyUrl2}" target="_blank" class="spotify-link">S</a>` : '<span class="spotify-link disabled">S</span>';

                    const team1Display = match.isBye ? 'BYE' : match.team1;
                    const team2Display = match.isBye ? 'BYE' : match.team2;

                    matchDiv.innerHTML = `
                    <div class="match-teams">
                    <span class="team-name">${team1Display}</span>
                    ${spotify1Link}
                    </div>

                    <div class="score-display">${scoreDisplay}</div>

                    <div class="match-teams">
                    <span class="team-name">${team2Display}</span>
                    ${spotify2Link}
                    </div>
                `;

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

        // Перерисовываем таблицу результатов
        await renderStandingsFromDB();
        await repaintStandingsBannedRows();

        // Перерисовываем текущий тур, чтобы обновить состояние кнопок и счетчиков
        await displayTour(tournamentData.currentTourIndex);
        updateTourNavigation();

        // Проверка статистики тура
        await checkTourStatsAndDisplay(tournamentData.currentTourIndex);

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
                if (match.score1 + match.score2 === 4) {
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
        statsMessage += `Ошибка: Неверное количество ничьих (${draws}). `;
        isError = true;
    }
    if (totalScore4Matches !== 6 && unfilledScores === 0) {
        statsMessage += `Ошибка: Неверное количество матчей с тоталом 4 гола (${totalScore4Matches}). `;
        isError = true;
    }

    tourStatsDiv.innerHTML = statsMessage ? `<span class="${isError ? 'error' : ''}">${statsMessage.trim()}</span>` : "Статистика тура: OK";
    if (isError) {
        tourStatsDiv.classList.add('error');
    } else {
        tourStatsDiv.classList.remove('error');
    }
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
        await displayTour(0);
        updateTourNavigation();
        enableButtons();
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
        await checkTourStatsAndDisplay(tournamentData.currentTourIndex);
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
            await displayTour(tournamentData.currentTourIndex);
            updateTourNavigation();
            await repaintStandingsBannedRows();
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

/**
 * Обновляет статусы команд согласно списку в textarea:
 * команды со значком ❌ → дисквалифицированы.
 * 1) Проставляет inactive в хранилище teams
 * 2) Меняет матчи на технические
 * 3) Обновляет tournamentData.schedule
 */

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
                // 3.3 Если обе забанены — BYE без технички (ничьи/пустые)
                else if (t1BannedNow && t2BannedNow) {
                    if (!match.isBye || match.technical || match.score1 !== null || match.score2 !== null) {
                        match.isBye = true;
                        match.technical = false;
                        match.score1 = null;
                        match.score2 = null;
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
        await checkTourStatsAndDisplay(tournamentData.currentTourIndex);
        // Сохраняем текущий индекс тура
        await saveSettings({ ...await loadSettings(), currentTourIndex: tournamentData.currentTourIndex });
    }
});

jumpToTourBtn.addEventListener('click', async () => {
    const tourNum = parseInt(tourJumpInput.value);
    if (!isNaN(tourNum) && tourNum >= 1 && tourNum <= tournamentData.totalTours) {
        tournamentData.currentTourIndex = tourNum - 1;
        await displayTour(tournamentData.currentTourIndex);
        updateTourNavigation();
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

closeModalBtn.addEventListener('click', () => {
    fullScheduleModal.style.display = 'none';
});

window.addEventListener('click', (event) => {
    if (event.target === fullScheduleModal) {
        fullScheduleModal.style.display = 'none';
    }
});

// --- Конец скрипта ---
// Вся логика работы с IndexedDB, генерация расписания, отображение туров,
// обработка ввода счета и Spotify URL (теперь кнопками), а также базовая статистика тура
// реализованы и объединены.