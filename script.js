// Инициализация Supabase
const supabaseUrl = 'https://ygpczdorqtoxchgwtcdu.supabase.co';
const supabaseKey = 'sb_publishable_QWZrAGxsXt0xtot2lFdz3A_tOWokALJ';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Функция для показа уведомлений
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Проверка авторизации
async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

// Проверка прав администратора
async function checkAdmin() {
    const user = await checkAuth();
    if (!user) return false;
    
    const { data, error } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();
    
    return data?.is_admin || false;
}

// Регистрация
if (document.getElementById('registerForm')) {
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        if (password !== confirmPassword) {
            showNotification('Пароли не совпадают', 'error');
            return;
        }
        
        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        username: username
                    }
                }
            });
            
            if (error) throw error;
            
            // Создаем профиль пользователя
            if (data.user) {
                await supabase.from('profiles').insert([
                    {
                        id: data.user.id,
                        username: username,
                        email: email,
                        is_admin: false
                    }
                ]);
            }
            
            showNotification('Регистрация успешна! Проверьте email для подтверждения', 'success');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        } catch (error) {
            showNotification(error.message, 'error');
        }
    });
}

// Вход
if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });
            
            if (error) throw error;
            
            showNotification('Вход выполнен успешно!', 'success');
            setTimeout(() => {
                window.location.href = 'forum.html';
            }, 1000);
        } catch (error) {
            showNotification(error.message, 'error');
        }
    });
}

// Выход
if (document.getElementById('logoutBtn')) {
    document.getElementById('logoutBtn').addEventListener('click', async (e) => {
        e.preventDefault();
        
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            
            showNotification('Выход выполнен', 'info');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
        } catch (error) {
            showNotification(error.message, 'error');
        }
    });
}

// Защита админ панели
if (window.location.pathname.includes('admin.html')) {
    (async () => {
        const isAdmin = await checkAdmin();
        if (!isAdmin) {
            window.location.href = 'forum.html';
        } else {
            // Загружаем данные для админ панели
            await loadAdminData();
        }
    })();
}

// Загрузка данных для админ панели
async function loadAdminData() {
    try {
        // Загружаем пользователей
        const { data: users, error: usersError } = await supabase
            .from('profiles')
            .select('*');
        
        if (usersError) throw usersError;
        
        document.getElementById('userCount').textContent = users.length;
        
        const usersTableBody = document.getElementById('usersTableBody');
        if (usersTableBody) {
            usersTableBody.innerHTML = users.map(user => `
                <tr>
                    <td>${user.id}</td>
                    <td>${user.username}</td>
                    <td>${user.email}</td>
                    <td>${user.is_admin ? 'Админ' : 'Пользователь'}</td>
                    <td>
                        <button class="btn btn-primary btn-sm" onclick="toggleAdmin('${user.id}')">
                            ${user.is_admin ? 'Убрать админа' : 'Сделать админом'}
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteUser('${user.id}')">
                            Удалить
                        </button>
                    </td>
                </tr>
            `).join('');
        }
        
        // Загружаем темы форума
        const { data: topics, error: topicsError } = await supabase
            .from('topics')
            .select('*');
        
        if (topicsError) throw topicsError;
        
        document.getElementById('topicCount').textContent = topics.length;
        
        const topicsTableBody = document.getElementById('topicsTableBody');
        if (topicsTableBody) {
            topicsTableBody.innerHTML = topics.map(topic => `
                <tr>
                    <td>${topic.id}</td>
                    <td>${topic.title}</td>
                    <td>${topic.author}</td>
                    <td>${new Date(topic.created_at).toLocaleDateString()}</td>
                    <td>
                        <button class="btn btn-danger btn-sm" onclick="deleteTopic('${topic.id}')">
                            Удалить
                        </button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// Создание темы на форуме
if (document.getElementById('createTopicForm')) {
    document.getElementById('createTopicForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const user = await checkAuth();
        if (!user) {
            showNotification('Необходимо войти в систему', 'error');
            window.location.href = 'login.html';
            return;
        }
        
        const title = document.getElementById('topicTitle').value;
        const content = document.getElementById('topicContent').value;
        
        try {
            const { data, error } = await supabase
                .from('topics')
                .insert([
                    {
                        title: title,
                        content: content,
                        author_id: user.id,
                        author: user.user_metadata.username
                    }
                ]);
            
            if (error) throw error;
            
            showNotification('Тема создана успешно!', 'success');
            document.getElementById('createTopicForm').reset();
            
            // Перезагружаем список тем
            loadTopics();
        } catch (error) {
            showNotification(error.message, 'error');
        }
    });
}

// Функции для админ панели
async function toggleAdmin(userId) {
    try {
        const { data: user, error: fetchError } = await supabase
            .from('profiles')
            .select('is_admin')
            .eq('id', userId)
            .single();
        
        if (fetchError) throw fetchError;
        
        const { error } = await supabase
            .from('profiles')
            .update({ is_admin: !user.is_admin })
            .eq('id', userId);
        
        if (error) throw error;
        
        showNotification('Права пользователя обновлены', 'success');
        loadAdminData();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function deleteUser(userId) {
    if (!confirm('Вы уверены, что хотите удалить этого пользователя?')) return;
    
    try {
        const { error } = await supabase
            .from('profiles')
            .delete()
            .eq('id', userId);
        
        if (error) throw error;
        
        // Также удаляем пользователя из auth (требует прав администратора Supabase)
        showNotification('Пользователь удален', 'success');
        loadAdminData();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function deleteTopic(topicId) {
    if (!confirm('Вы уверены, что хотите удалить эту тему?')) return;
    
    try {
        const { error } = await supabase
            .from('topics')
            .delete()
            .eq('id', topicId);
        
        if (error) throw error;
        
        showNotification('Тема удалена', 'success');
        loadAdminData();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}
