// ========== НАСТРОЙКИ SUPABASE ==========
const SUPABASE_URL = 'https://ziwubecvahvlxxleqjid.supabase.co';
const SUPABASE_KEY = 'sb_publishable_b6_Wtue4ArK0M4cWFp5KfA_pD3E0QN2';

// Глобальные переменные
let currentUser = null;
let users = [];
let forumPosts = [];

// Инициализация Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ========== ЗАГРУЗКА НАВИГАЦИИ ==========
async function loadNavbarAndFooter() {
    try {
        // Загружаем навбар
        const navbarResponse = await fetch('navbar.html');
        const navbarHtml = await navbarResponse.text();
        document.getElementById('navbar-placeholder').innerHTML = navbarHtml;
        
        // Загружаем футер
        const footerResponse = await fetch('footer.html');
        const footerHtml = await footerResponse.text();
        document.getElementById('footer-placeholder').innerHTML = footerHtml;
    } catch (error) {
        console.error('Ошибка загрузки навигации:', error);
    }
}

// ========== ЗАГРУЗКА ДАННЫХ ==========
async function loadUsers() {
    try {
        const { data } = await supabase.from('users').select('*');
        if (data) {
            users = data.map(user => ({
                ...user,
                banned: user.banned && (!user.ban_expires || new Date(user.ban_expires) > new Date())
            }));
        }
    } catch (e) {
        console.log('Ошибка загрузки пользователей:', e);
    }
}

async function loadForumPosts() {
    try {
        const { data } = await supabase
            .from('forum_posts')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (data) {
            forumPosts = data;
        }
    } catch (error) {
        console.error('Ошибка загрузки постов:', error);
    }
}

// ========== СЕССИЯ ==========
async function loadSession() {
    const sessionStr = localStorage.getItem('rbxforum_session');
    if (!sessionStr) return null;
    
    try {
        const session = JSON.parse(sessionStr);
        const user = users.find(u => u.id === session.id);
        
        if (user && !user.banned) {
            currentUser = user;
            updateNavbar();
            return user;
        }
    } catch (e) {
        console.error('Ошибка загрузки сессии:', e);
    }
    
    localStorage.removeItem('rbxforum_session');
    return null;
}

function saveSession(user) {
    const sessionData = {
        id: user.id,
        username: user.username,
        loginTime: new Date().toISOString()
    };
    localStorage.setItem('rbxforum_session', JSON.stringify(sessionData));
}

function clearSession() {
    localStorage.removeItem('rbxforum_session');
}

// ========== НАВИГАЦИЯ ==========
function updateNavbar() {
    const userArea = document.getElementById('userArea');
    const adminTab = document.getElementById('adminTabLink');
    
    if (!userArea) return;
    
    if (currentUser) {
        userArea.innerHTML = `
            <span onclick="window.location.href='Pages/profile.html?id=${currentUser.id}'">
                <i class="fas fa-user"></i> ${currentUser.username}
            </span>
            <button class="logout-btn" onclick="logout()">ВЫЙТИ</button>
        `;
        
        if (adminTab) {
            adminTab.style.display = currentUser.role === 'admin' ? 'inline-block' : 'none';
            adminTab.onclick = () => window.location.href = 'Pages/admin.html';
        }
    } else {
        userArea.innerHTML = `
            <div class="auth-buttons">
                <button onclick="window.location.href='Pages/login.html'">ВХОД</button>
                <button onclick="window.location.href='Pages/register.html'">РЕГИСТРАЦИЯ</button>
            </div>
        `;
        if (adminTab) adminTab.style.display = 'none';
    }
}

// ========== АВТОРИЗАЦИЯ ==========
async function loginUser(username, password) {
    try {
        const user = users.find(u => u.username === username && u.password === password);
        
        if (!user) {
            return { error: 'Неверное имя или пароль' };
        }
        
        if (user.banned) {
            return { error: 'Аккаунт заблокирован' };
        }
        
        currentUser = user;
        saveSession(user);
        updateNavbar();
        
        return { success: true };
    } catch (error) {
        return { error: 'Ошибка входа' };
    }
}

async function registerUser(username, password, robloxNick) {
    try {
        // Проверка уникальности
        if (users.find(u => u.username === username)) {
            return { error: 'Имя пользователя уже занято' };
        }
        
        const newUser = {
            username,
            password,
            roblox_nick: robloxNick,
            role: 'user',
            banned: false,
            bio: '',
            created_at: new Date().toISOString()
        };
        
        const { data, error } = await supabase.from('users').insert([newUser]).select();
        
        if (error) {
            return { error: 'Ошибка при регистрации' };
        }
        
        await loadUsers();
        return { success: true };
    } catch (error) {
        return { error: 'Ошибка регистрации' };
    }
}

function logout() {
    currentUser = null;
    clearSession();
    window.location.href = 'index.html';
}

// ========== УТИЛИТЫ ==========
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) {
        return 'только что';
    }
    
    if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes} ${minutes === 1 ? 'минуту' : 'минуты'} назад`;
    }
    
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours} ${hours === 1 ? 'час' : 'часа'} назад`;
    }
    
    const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}
