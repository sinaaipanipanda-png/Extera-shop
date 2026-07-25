const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// تنظیم دیتابیس با پشتیبانی از رندر
const DB_FILE = process.env.RENDER ? '/tmp/database.json' : path.join(__dirname, 'database.json');

// ساخت دیتابیس اولیه
if (!fs.existsSync(DB_FILE)) {
    const initialData = {
        users: [
            { id: 1, username: 'admin', password: '123', stars: 999, isBanned: false, isAdmin: true }
        ],
        products: [],
        orders: [],
        tickets: [],
        announcements: []
    };
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    } catch(e) {}
}

function getDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            return { users: [{ id: 1, username: 'admin', password: '123', stars: 999, isBanned: false, isAdmin: true }], products: [], orders: [], tickets: [], announcements: [] };
        }
        const data = JSON.parse(fs.readFileSync(DB_FILE));
        if(!data.tickets) data.tickets = [];
        if(!data.announcements) data.announcements = [];
        return data;
    } catch (e) {
        return { users: [], products: [], orders: [], tickets: [], announcements: [] };
    }
}

function saveDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch(e) {}
}

const BAN_MESSAGE = 'حساب شما به دلایل مختلف ، به حالت تعلیق در آمده ، برای تجدید نظر ، به آیدی @panda009822 در سروش پلاس مراجعه فرمائید.';

// ---------------- ای‌پی‌آی‌های عمومی ----------------

// ثبت نام
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'لطفاً نام کاربری و رمز عبور را وارد کنید.' });
    }

    const db = getDB();
    if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
        return res.status(400).json({ error: 'این نام کاربری قبلاً ثبت شده است.' });
    }

    const newUser = {
        id: Date.now(),
        username,
        password,
        stars: 10,
        isBanned: false,
        isAdmin: false
    };

    db.users.push(newUser);
    saveDB(db);
    res.json({ message: 'ثبت‌نام با موفقیت انجام شد! ۱۰ ستاره هدیه دریافت کردید.', user: newUser });
});

// ورود
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const db = getDB();
    const user = db.users.find(u => u.username === username && u.password === password);

    if (!user) {
        return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است.' });
    }

    if (user.isBanned) {
        return res.status(403).json({ error: BAN_MESSAGE });
    }

    res.json({ message: 'ورود موفقیت‌آمیز', user });
});

// دریافت محصولات
app.get('/api/products', (req, res) => {
    const db = getDB();
    res.json(db.products || []);
});

// دریافت اطلاعیه‌ها
app.get('/api/announcements', (req, res) => {
    const db = getDB();
    res.json(db.announcements || []);
});

// دریافت سفارش‌های یک کاربر
app.get('/api/user/orders', (req, res) => {
    const userId = Number(req.query.userId);
    const db = getDB();
    const userOrders = (db.orders || []).filter(o => o.userId === userId);
    res.json(userOrders);
});

// خرید محصول با ستاره
app.post('/api/buy', (req, res) => {
    const { userId, productId } = req.body;
    const db = getDB();

    const user = db.users.find(u => u.id === userId);
    const product = db.products.find(p => p.id === productId);

    if (!user || !product) return res.status(404).json({ error: 'اطلاعات یافت نشد.' });
    if (user.isBanned) return res.status(403).json({ error: BAN_MESSAGE });
    if (user.stars < product.price) return res.status(400).json({ error: 'موجودی ستاره شما کافی نیست!' });

    user.stars -= product.price;
    const newOrder = {
        id: Date.now(),
        userId: user.id,
        username: user.username,
        productName: product.name,
        price: product.price,
        status: 'در انتظار',
        date: new Date().toLocaleDateString('fa-IR')
    };

    if(!db.orders) db.orders = [];
    db.orders.push(newOrder);
    saveDB(db);

    res.json({ message: 'خرید با موفقیت انجام شد.', remainingStars: user.stars });
});

// تغییر رمز عبور کاربر
app.post('/api/user/update-profile', (req, res) => {
    const { userId, newPassword } = req.body;
    if(!newPassword) return res.status(400).json({ error: 'رمز عبور جدید را وارد کنید.' });

    const db = getDB();
    const user = db.users.find(u => u.id === userId);
    if(user) {
        user.password = newPassword;
        saveDB(db);
        res.json({ message: 'رمز عبور با موفقیت تغییر یافت.' });
    } else {
        res.status(404).json({ error: 'کاربر پیدا نشد.' });
    }
});

// ارسال تیکت کاربر
app.post('/api/user/tickets', (req, res) => {
    const { userId, username, title, message } = req.body;
    if(!title || !message) return res.status(400).json({ error: 'عنوان و متن پیام الزامی است.' });

    const db = getDB();
    const newTicket = {
        id: Date.now(),
        userId,
        username,
        title,
        message,
        adminReply: '',
        status: 'در حال بررسی',
        date: new Date().toLocaleDateString('fa-IR')
    };

    if(!db.tickets) db.tickets = [];
    db.tickets.push(newTicket);
    saveDB(db);

    res.json({ message: 'تیکت با موفقیت ارسال شد.' });
});

// دریافت تیکت‌های کاربر
app.get('/api/user/tickets', (req, res) => {
    const userId = Number(req.query.userId);
    const db = getDB();
    const userTickets = (db.tickets || []).filter(t => t.userId === userId);
    res.json(userTickets);
});

// ---------------- ای‌پی‌آی‌های مدیریت ----------------

// گرفتن کپی (بکاپ) از دیتابیس
app.get('/api/admin/backup', (req, res) => {
    const db = getDB();
    res.json(db);
});

// پیست و بازگردانی (رستور) دیتابیس
app.post('/api/admin/restore', (req, res) => {
    const { backupData } = req.body;
    if(!backupData || !backupData.users) {
        return res.status(400).json({ error: 'اطلاعات بکاپ معتبر نیست.' });
    }
    saveDB(backupData);
    res.json({ message: 'اطلاعات با موفقیت بازگردانی و پیست شد!' });
});

app.get('/api/admin/data', (req, res) => {
    const db = getDB();
    res.json({
        users: db.users || [],
        products: db.products || [],
        orders: db.orders || [],
        tickets: db.tickets || [],
        announcements: db.announcements || [],
        stats: {
            totalUsers: (db.users || []).length,
            totalProducts: (db.products || []).length,
            totalOrders: (db.orders || []).length,
            totalTickets: (db.tickets || []).length,
            totalAnnouncements: (db.announcements || []).length
        }
    });
});

app.post('/api/admin/announcements', (req, res) => {
    const { title, content } = req.body;
    if(!title || !content) return res.status(400).json({ error: 'عنوان و متن اطلاعیه الزامی است.' });

    const db = getDB();
    if(!db.announcements) db.announcements = [];

    const newAnno = {
        id: Date.now(),
        title,
        content,
        date: new Date().toLocaleDateString('fa-IR')
    };

    db.announcements.push(newAnno);
    saveDB(db);

    res.json({ message: 'اطلاعیه با موفقیت منتشر شد.' });
});

app.post('/api/admin/delete-announcement', (req, res) => {
    const { id } = req.body;
    const db = getDB();
    db.announcements = (db.announcements || []).filter(a => a.id !== id);
    saveDB(db);
    res.json({ message: 'اطلاعیه حذف شد.' });
});

app.post('/api/admin/delete-user', (req, res) => {
    const { userId } = req.body;
    const db = getDB();
    db.users = (db.users || []).filter(u => u.id !== userId);
    saveDB(db);
    res.json({ message: 'عضویت کاربر با موفقیت لغو و حسابش حذف گردید.' });
});

app.post('/api/admin/close-ticket', (req, res) => {
    const { ticketId } = req.body;
    const db = getDB();
    db.tickets = (db.tickets || []).filter(t => t.id !== ticketId);
    saveDB(db);
    res.json({ message: 'تیکت بسته شد و از سیستم حذف گردید.' });
});

app.post('/api/admin/update-stars', (req, res) => {
    const { userId, amount } = req.body;
    const db = getDB();
    const user = db.users.find(u => u.id === userId);
    if (user) {
        user.stars = Math.max(0, user.stars + amount);
        saveDB(db);
        res.json({ message: 'ستاره به‌روزرسانی شد.', newStars: user.stars });
    } else {
        res.status(404).json({ error: 'کاربر پیدا نشد.' });
    }
});

app.post('/api/admin/toggle-ban', (req, res) => {
    const { userId } = req.body;
    const db = getDB();
    const user = db.users.find(u => u.id === userId);
    if (user) {
        user.isBanned = !user.isBanned;
        saveDB(db);
        res.json({ message: 'وضعیت بن تغییر یافت.' });
    } else {
        res.status(404).json({ error: 'کاربر پیدا نشد.' });
    }
});

app.post('/api/admin/add-product', (req, res) => {
    const { name, price, description, image } = req.body;
    if(!name || !price) return res.status(400).json({ error: 'نام و قیمت الزامی است.' });

    const db = getDB();
    if(!db.products) db.products = [];

    const newProduct = {
        id: Date.now(),
        name,
        price: Number(price),
        description: description || '',
        image: image || 'https://via.placeholder.com/150'
    };
    db.products.push(newProduct);
    saveDB(db);
    res.json({ message: 'محصول اضافه شد.' });
});

app.post('/api/admin/delete-product', (req, res) => {
    const { productId } = req.body;
    const db = getDB();
    db.products = (db.products || []).filter(p => p.id !== productId);
    saveDB(db);
    res.json({ message: 'محصول حذف شد.' });
});

app.post('/api/admin/update-order-status', (req, res) => {
    const { orderId, status } = req.body;
    const db = getDB();
    const order = (db.orders || []).find(o => o.id === orderId);
    if (order) {
        order.status = status;
        saveDB(db);
        res.json({ message: 'وضعیت تغییر کرد.' });
    } else {
        res.status(404).json({ error: 'سفارش یافت نشد.' });
    }
});

app.post('/api/admin/delete-order', (req, res) => {
    const { orderId } = req.body;
    const db = getDB();
    db.orders = (db.orders || []).filter(o => o.id !== orderId);
    saveDB(db);
    res.json({ message: 'سفارش با موفقیت حذف شد.' });
});

app.post('/api/admin/reply-ticket', (req, res) => {
    const { ticketId, reply, status } = req.body;
    const db = getDB();
    const ticket = (db.tickets || []).find(t => t.id === ticketId);
    if(ticket) {
        ticket.adminReply = reply;
        ticket.status = status || 'پاسخ داده شد';
        saveDB(db);
        res.json({ message: 'پاسخ ارسال شد.' });
    } else {
        res.status(404).json({ error: 'تیکت یافت نشد.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
