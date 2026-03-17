// ========== НАСТРОЙКИ SUPABASE ==========
const SUPABASE_URL = 'https://ygpczdorqtoxchgwtcdu.supabase.co'; // ЗАМЕНИ!
const SUPABASE_KEY = 'sb_publishable_QWZrAGxsXt0xtot2lFdz3A_tOWokALJ'; // ЗАМЕНИ!
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ========== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========
let currentUser = null;
let users = [];
let forumPosts = [];

// ========== ИНИЦИАЛИЗАЦИЯ ==========
document.addEventListener('DOMContentLoaded', async () => {
    await loadUsers();
    await loadForumPosts();
    await loadSession();
    await checkMaintenanceMode();
    await checkBanStatus();
    updateNavbar();
});

// ========== НАВИГАЦИЯ ==========
function loadNavbarAndFooter() {
    fetch('navbar.html')
        .then(response => response.text())
        .then(data => {
            document.getElementById('navbar-placeholder').innerHTML = data;
            updateNavbar();
        });
    
    fetch('footer.html')
        .then(response => response.text())
        .then(data => {
            document.getElementById('footer-placeholder').innerHTML = data;
        });
}

function updateNavbar() {
    const userArea = document.getElementById('userArea');
    const adminTab = document.getElementById('adminTabLink');
    
    if (!userArea) return;
    
    if (currentUser) {
        userArea.innerHTML = `
            <span onclick="window.location.href='profile.html?id=${currentUser.id}'">
                <i class="fas fa-user"></i> ${currentUser.username}
            </span>
            <button class="logout-btn" onclick="logout()">ВЫЙТИ</button>
        `;
        
        if (adminTab) {
            adminTab.style.display = currentUser.role === 'admin' ? 'inline-block' : 'none';
        }
    } else {
        userArea.innerHTML = `
            <div class="auth-buttons">
                <button onclick="window.location.href='login.html'">ВХОД</button>
                <button onclick="window.location.href='register.html'">РЕГИСТРАЦИЯ</button>
            </div>
        `;
        if (adminTab) adminTab.style.display = 'none';
    }
}

// ========== РАБОТА С СЕССИЕЙ ==========
async function saveSession(user) {
    const sessionData = {
        id: user.id,
        username: user.username,
        loginTime: new Date().toISOString()
    };
    localStorage.setItem('rbxforum_session', JSON.stringify(sessionData));
}

async function loadSession() {
    const sessionStr = localStorage.getItem('rbxforum_session');
    if (!sessionStr) return null;
    
    try {
        const session = JSON.parse(sessionStr);
        const user = users.find(u => u.id === session.id);
        
        if (user && !user.banned) {
            currentUser = user;
            return user;
        }
    } catch (e) {
        console.error('Ошибка загрузки сессии:', e);
    }
    
    localStorage.removeItem('rbxforum_session');
    return null;
}

function clearSession() {
    localStorage.removeItem('rbxforum_session');
}

// ========== РАБОТА С БАЗОЙ ДАННЫХ ==========
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

async function updateUser(id, updates) {
    try {
        await supabase.from('users').update(updates).eq('id', id);
        await loadUsers();
        
        if (currentUser && currentUser.id === id) {
            currentUser = users.find(u => u.id === id);
        }
    } catch (e) {
        console.log('Ошибка обновления:', e);
    }
}

// ========== РЕГИСТРАЦИЯ И ВХОД ==========
async function registerUser(username, password, robloxNick) {
    const currentIP = await getUserIP();
    
    // Проверка уникальности
    if (users.find(u => u.username === username)) {
        return { error: 'Имя пользователя уже занято' };
    }
    
    // Получаем следующий ID (автоматически в Supabase)
    const newUser = {
        username,
        password,
        roblox_nick: robloxNick,
        role: 'user',
        banned: false,
        ip: currentIP,
        bio: '',
        created_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase.from('users').insert([newUser]).select();
    
    if (error) {
        return { error: 'Ошибка при регистрации' };
    }
    
    return { success: true };
}

async function loginUser(username, password) {
    const currentIP = await getUserIP();
    
    // Проверка бана IP
    const ipBanned = await isIPBanned(currentIP);
    if (ipBanned) {
        return { error: 'Ваш IP заблокирован' };
    }
    
    const user = users.find(u => u.username === username && u.password === password);
    
    if (!user) {
        return { error: 'Неверное имя или пароль' };
    }
    
    if (user.banned) {
        return { error: 'Аккаунт заблокирован' };
    }
    
    currentUser = user;
    await saveSession(user);
    
    return { success: true };
}

function logout() {
    currentUser = null;
    clearSession();
    window.location.href = 'index.html';
}

// ========== ПОЛУЧЕНИЕ IP ==========
async function getUserIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (error) {
        return '0.0.0.0';
    }
}

// ========== ПРОВЕРКА БАНОВ ==========
async function isIPBanned(ip) {
    try {
        const { data } = await supabase
            .from('banned_ips')
            .select('*')
            .eq('ip_address', ip)
            .maybeSingle();
        
        if (data) {
            if (data.ban_expires && new Date(data.ban_expires) < new Date()) {
                await supabase.from('banned_ips').delete().eq('ip_address', ip);
                return false;
            }
            return true;
        }
        return false;
    } catch (error) {
        return false;
    }
}

async function checkBanStatus() {
    const currentPath = window.location.pathname;
    const isBanPage = currentPath.includes('not-approved.html');
    
    const currentIP = await getUserIP();
    const isBanned = await isIPBanned(currentIP);
    
    if (isBanPage) {
        if (!isBanned) {
            window.location.href = 'index.html';
        } else {
            loadBanInfo();
        }
        return;
    }
    
    if (isBanned) {
        window.location.href = 'not-approved.html';
    }
}

async function loadBanInfo() {
    const banInfo = document.getElementById('banInfo');
    if (!banInfo) return;
    
    const currentIP = await getUserIP();
    const { data } = await supabase
        .from('banned_ips')
        .select('*')
        .eq('ip_address', currentIP)
        .single();
    
    if (data) {
        banInfo.innerHTML = `
            <p><strong>Причина:</strong> ${data.reason || 'Не указана'}</p>
            ${data.ban_expires ? `<p><strong>Срок:</strong> до ${new Date(data.ban_expires).toLocaleString()}</p>` : '<p><strong>Срок:</strong> навсегда</p>'}
            <p><strong>Дата блокировки:</strong> ${new Date(data.banned_at).toLocaleString()}</p>
        `;
    }
}

// ========== ТЕХНИЧЕСКИЕ РАБОТЫ ==========
async function checkMaintenanceMode() {
    try {
        const { data } = await supabase
            .from('site_settings')
            .select('maintenance_mode')
            .eq('id', 1)
            .single();
        
        const maintenanceMode = data?.maintenance_mode || false;
        const currentPath = window.location.pathname;
        const isMaintenancePage = currentPath.includes('maintenance.html');
        
        if (maintenanceMode && !isMaintenancePage) {
            if (!currentUser) {
                window.location.href = 'maintenance.html';
                return;
            }
            
            // Проверка белого списка
            const { data: whitelist } = await supabase
                .from('maintenance_whitelist')
                .select('username')
                .eq('username', currentUser.username)
                .maybeSingle();
            
            if (!whitelist) {
                window.location.href = 'maintenance.html';
            }
        }
        
        if (!maintenanceMode && isMaintenancePage) {
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error('Ошибка проверки режима:', error);
    }
}

// ========== ФОРУМ ==========
async function loadForumPosts() {
    const postsList = document.getElementById('postsList');
    if (!postsList) return;
    
    try {
        const { data } = await supabase
            .from('forum_posts')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (data && data.length > 0) {
            let html = '';
            data.forEach(post => {
                const commentsCount = post.comments ? post.comments.length : 0;
                html += `
                    <div class="forum-post">
                        <div class="post-author">
                            <div class="author-avatar" onclick="window.location.href='profile.html?id=${post.user_id}'">
                                <i class="fas fa-user"></i>
                            </div>
                            <div>
                                <h4 onclick="window.location.href='profile.html?id=${post.user_id}'">${post.roblox_nick || post.username}</h4>
                                <div class="post-meta">${formatDate(post.created_at)}</div>
                            </div>
                        </div>
                        <div class="post-title">${post.title}</div>
                        <div class="post-content">${post.content.substring(0, 200)}${post.content.length > 200 ? '...' : ''}</div>
                        <div class="post-meta">
                            <i class="fas fa-comment"></i> ${commentsCount} комментариев
                        </div>
                        <a href="post.html?id=${post.id}" class="btn-secondary" style="margin-top: 15px;">ЧИТАТЬ</a>
                    </div>
                `;
            });
            postsList.innerHTML = html;
        } else {
            postsList.innerHTML = '<div class="empty-forum">Пока нет сообщений</div>';
        }
    } catch (error) {
        console.error('Ошибка загрузки постов:', error);
    }
}

async function loadPost(postId) {
    const postContainer = document.getElementById('postContainer');
    const commentsList = document.getElementById('commentsList');
    const addCommentForm = document.getElementById('addCommentForm');
    
    try {
        const { data } = await supabase
            .from('forum_posts')
            .select('*')
            .eq('id', postId)
            .single();
        
        if (data) {
            postContainer.innerHTML = `
                <div class="forum-post">
                    <div class="post-author">
                        <div class="author-avatar" onclick="window.location.href='profile.html?id=${data.user_id}'">
                            <i class="fas fa-user"></i>
                        </div>
                        <div>
                            <h4 onclick="window.location.href='profile.html?id=${data.user_id}'">${data.roblox_nick || data.username}</h4>
                            <div class="post-meta">${formatDate(data.created_at)}</div>
                        </div>
                    </div>
                    <div class="post-title">${data.title}</div>
                    <div class="post-content">${data.content.replace(/\n/g, '<br>')}</div>
                </div>
            `;
            
            // Загрузка комментариев
            if (data.comments && data.comments.length > 0) {
                let commentsHtml = '';
                data.comments.forEach(comment => {
                    commentsHtml += `
                        <div class="comment">
                            <div class="comment-header">
                                <span class="comment-author" onclick="window.location.href='profile.html?id=${comment.user_id}'">
                                    ${comment.roblox_nick || comment.username}
                                </span>
                                <span class="comment-date">${formatDate(comment.created_at)}</span>
                            </div>
                            <div class="comment-content">${comment.content.replace(/\n/g, '<br>')}</div>
                        </div>
                    `;
                });
                commentsList.innerHTML = commentsHtml;
            } else {
                commentsList.innerHTML = '<p style="color: #888;">Пока нет комментариев</p>';
            }
            
            // Форма добавления комментария
            if (currentUser && !currentUser.banned) {
                addCommentForm.classList.remove('hidden');
                addCommentForm.dataset.postId = postId;
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки поста:', error);
    }
}

async function createPost() {
    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }
    
    const title = document.getElementById('postTitle').value;
    const content = document.getElementById('postContent').value;
    
    if (!title || !content) {
        alert('Заполните все поля');
        return;
    }
    
    const newPost = {
        user_id: currentUser.id,
        username: currentUser.username,
        roblox_nick: currentUser.roblox_nick,
        title: title,
        content: content,
        created_at: new Date().toISOString(),
        comments: []
    };
    
    try {
        const { error } = await supabase.from('forum_posts').insert([newPost]);
        
        if (error) {
            alert('Ошибка при создании поста');
        } else {
            window.location.href = 'forum.html';
        }
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

async function addComment() {
    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }
    
    const postId = document.getElementById('addCommentForm').dataset.postId;
    const commentText = document.getElementById('commentText').value;
    
    if (!commentText) {
        alert('Введите комментарий');
        return;
    }
    
    try {
        const { data: post } = await supabase
            .from('forum_posts')
            .select('comments')
            .eq('id', postId)
            .single();
        
        const comments = post.comments || [];
        comments.push({
            id: Date.now().toString(),
            user_id: currentUser.id,
            username: currentUser.username,
            roblox_nick: currentUser.roblox_nick,
            content: commentText,
            created_at: new Date().toISOString()
        });
        
        const { error } = await supabase
            .from('forum_posts')
            .update({ comments: comments })
            .eq('id', postId);
        
        if (!error) {
            document.getElementById('commentText').value = '';
            loadPost(postId);
        }
    } catch (error) {
        console.error('Ошибка добавления комментария:', error);
    }
}

function hideCreatePost() {
    document.getElementById('createPostPanel').classList.add('hidden');
}

// ========== ПРОФИЛЬ ==========
async function loadProfile(userId) {
    const profileContainer = document.getElementById('profileContainer');
    
    try {
        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (user) {
            const isOwnProfile = currentUser && currentUser.id === userId;
            const isAdmin = currentUser?.role === 'admin';
            
            profileContainer.innerHTML = `
                <div class="profile-header">
                    <div class="profile-avatar">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="profile-info">
                        <h2>${user.roblox_nick || user.username}</h2>
                        ${user.bio ? `<div class="bio">"${user.bio}"</div>` : ''}
                        <div class="post-meta">Аккаунт создан ${formatDate(user.created_at)}</div>
                    </div>
                </div>
                
                <div class="profile-stats">
                    <div class="stat-box">
                        <div class="label">РОЛЬ</div>
                        <div class="value">${user.role === 'admin' ? 'Администратор' : 'Пользователь'}</div>
                    </div>
                </div>
                
                ${isOwnProfile ? `
                    <div class="profile-actions">
                        <button class="btn-primary" onclick="showEditProfile()">РЕДАКТИРОВАТЬ</button>
                    </div>
                    
                    <div id="editProfileSection" class="hidden">
                        <h3>РЕДАКТИРОВАНИЕ</h3>
                        <textarea id="bioInput" class="input-group" placeholder="О себе">${user.bio || ''}</textarea>
                        <button class="btn-primary" onclick="updateBio('${user.id}')">СОХРАНИТЬ</button>
                    </div>
                ` : ''}
                
                ${isAdmin && !isOwnProfile ? `
                    <div class="admin-panel-section">
                        <h3>УПРАВЛЕНИЕ</h3>
                        <div class="ban-controls">
                            <select id="banDuration" class="ban-duration">
                                <option value="1">1 час</option>
                                <option value="24">1 день</option>
                                <option value="168">7 дней</option>
                                <option value="720">30 дней</option>
                                <option value="0">Навсегда</option>
                            </select>
                            <input type="text" id="banReason" class="ban-reason" placeholder="Причина">
                            <button class="ban-button" onclick="banUser('${user.id}')">ЗАБАНИТЬ</button>
                        </div>
                        ${user.banned ? `
                            <button class="btn-primary" onclick="unbanUser('${user.id}')">РАЗБАНИТЬ</button>
                        ` : ''}
                    </div>
                ` : ''}
            `;
        }
    } catch (error) {
        console.error('Ошибка загрузки профиля:', error);
    }
}

function showEditProfile() {
    document.getElementById('editProfileSection').classList.remove('hidden');
}

async function updateBio(userId) {
    const bio = document.getElementById('bioInput').value;
    
    await updateUser(userId, { bio: bio });
    alert('Профиль обновлен');
    loadProfile(userId);
}

// ========== АДМИН ФУНКЦИИ ==========
async function banUser(userId) {
    const duration = document.getElementById('banDuration').value;
    const reason = document.getElementById('banReason').value;
    
    if (!reason) {
        alert('Введите причину бана');
        return;
    }
    
    const banExpires = parseInt(duration) === 0 ? null : 
        new Date(Date.now() + parseInt(duration) * 60 * 60 * 1000).toISOString();
    
    await updateUser(userId, {
        banned: true,
        ban_reason: reason,
        ban_expires: banExpires
    });
    
    alert('Пользователь забанен');
    loadProfile(userId);
}

async function unbanUser(userId) {
    await updateUser(userId, {
        banned: false,
        ban_reason: null,
        ban_expires: null
    });
    
    alert('Пользователь разбанен');
    loadProfile(userId);
}

async function adminSearchUser() {
    const username = document.getElementById('adminSearchUsername').value;
    const resultDiv = document.getElementById('adminSearchResult');
    
    if (!username) return;
    
    const user = users.find(u => u.username === username);
    
    if (user) {
        resultDiv.innerHTML = `
            <div class="user-row">
                <div>
                    <strong>${user.username}</strong> (${user.roblox_nick})
                    ${user.banned ? '<span style="color: #ff4d4f;">(Забанен)</span>' : ''}
                </div>
                <button onclick="window.location.href='profile.html?id=${user.id}'">ПРОСМОТР</button>
            </div>
        `;
    } else {
        resultDiv.innerHTML = '<p>Пользователь не найден</p>';
    }
}

async function publishBanner() {
    const text = document.getElementById('bannerText').value;
    
    if (!text) return;
    
    try {
        await supabase
            .from('banners')
            .update({ is_active: false })
            .eq('is_active', true);
        
        await supabase
            .from('banners')
            .insert([{
                message: text,
                is_active: true,
                created_by: currentUser?.username,
                activated_at: new Date()
            }]);
        
        alert('Баннер опубликован');
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

async function toggleMaintenance() {
    try {
        const { data } = await supabase
            .from('site_settings')
            .select('maintenance_mode')
            .eq('id', 1)
            .single();
        
        const newMode = !data?.maintenance_mode;
        
        await supabase
            .from('site_settings')
            .upsert({ id: 1, maintenance_mode: newMode });
        
        alert(`Режим обслуживания ${newMode ? 'включен' : 'выключен'}`);
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

async function addToWhitelist() {
    const username = document.getElementById('whitelistUser').value;
    
    if (!username) return;
    
    try {
        await supabase
            .from('maintenance_whitelist')
            .insert([{ username: username }]);
        
        alert('Пользователь добавлен в белый список');
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

// ========== СЧЕТЧИКИ ==========
async function updateCounters() {
    const accountCounter = document.getElementById('accountCounter');
    const postsCounter = document.getElementById('postsCounter');
    
    if (accountCounter) {
        const { count } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true });
        accountCounter.textContent = count || 0;
    }
    
    if (postsCounter) {
        const { count } = await supabase
            .from('forum_posts')
            .select('*', { count: 'exact', head: true });
        postsCounter.textContent = count || 0;
    }
}

// ========== УТИЛИТЫ ==========
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    // Меньше минуты
    if (diff < 60000) {
        return 'только что';
    }
    
    // Меньше часа
    if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes} ${minutes === 1 ? 'минуту' : 'минуты'} назад`;
    }
    
    // Меньше дня
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours} ${hours === 1 ? 'час' : 'часа'} назад`;
    }
    
    // Даты
    const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}
