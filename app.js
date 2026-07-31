const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// تنظیم دیتابیس با پشتیبانی از رندر
const DB_FILE = process.env.RENDER ? '/tmp/database.json' : path.join(__dirname, 'database.json');

// ساخت دیتابیس اولیه
if (!fs.existsSync(DB_FILE)) {
    const initialData = {
        settings: {
            storeName: 'Extera shop',
            logoUrl: 'https://via.placeholder.com/100/1e1b4b/fbbf24?text=Extera'
        },
        users: [
            { id: 1, username: 'admin', password: '123', stars: 999, isBanned: false, isAdmin: true }
        ],
        products: [],
        orders: [],
        tickets: [],
        announcements: [],
        giftCodes: []
    };
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    } catch(e) {}
}

function getDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            return {
                settings: { storeName: 'Extera shop', logoUrl: 'https://via.placeholder.com/100/1e1b4b/fbbf24?text=Extera' },
                users: [{ id: 1, username: 'admin', password: '123', stars: 999, isBanned: false, isAdmin: true }],
                products: [], orders: [], tickets: [], announcements: [], giftCodes: []
            };
        }
        const data = JSON.parse(fs.readFileSync(DB_FILE));
        if(!data.settings) data.settings = { storeName: 'Extera shop', logoUrl: 'https://via.placeholder.com/100/1e1b4b/fbbf24?text=Extera' };
        if(!data.tickets) data.tickets = [];
        if(!data.announcements) data.announcements = [];
        if(!data.giftCodes) data.giftCodes = [];
        return data;
    } catch (e) {
        return {
            settings: { storeName: 'Extera shop', logoUrl: 'https://via.placeholder.com/100/1e1b4b/fbbf24?text=Extera' },
            users: [], products: [], orders: [], tickets: [], announcements: [], giftCodes: []
        };
    }
}

function saveDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch(e) {}
}

const BAN_MESSAGE = 'حساب شما به دلایل مختلف ، به حالت تعلیق در آمده ، برای تجدید نظر ، به آیدی @panda009822 در سروش پلاس مراجعه فرمائید.';

// ---------------- سیستم پینگ خودکار برای بیدار نگه داشتن ۲۴ ساعته رندر ----------------
app.get('/api/ping', (req, res) => {
    res.status(200).send('OK');
});

setInterval(() => {
    const siteUrl = process.env.RENDER_EXTERNAL_URL;
    if (siteUrl) {
        const protocol = siteUrl.startsWith('https') ? https : http;
        protocol.get(`${siteUrl}/api/ping`, (res) => {
            console.log('Self-ping sent to keep Render awake 24/7');
        }).on('error', (err) => {});
    }
}, 5 * 60 * 1000);

// ---------------- ای‌پی‌آی‌های عمومی و کاربران ----------------

app.get('/api/settings', (req, res) => {
    const db = getDB();
    res.json(db.settings || { storeName: 'Extera shop', logoUrl: '' });
});

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

app.get('/api/products', (req, res) => {
    const db = getDB();
    res.json(db.products || []);
});

app.get('/api/announcements', (req, res) => {
    const db = getDB();
    res.json(db.announcements || []);
});

app.get('/api/user/orders', (req, res) => {
    const userId = Number(req.query.userId);
    const db = getDB();
    const userOrders = (db.orders || []).filter(o => o.userId === userId);
    res.json(userOrders);
});

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
        previewImage: product.previewImage,
        deliveryType: product.deliveryType || 'image',
        secretImage: product.secretImage || product.previewImage,
        secretText: product.secretText || '',
        downloaded: false,
        status: 'در انتظار',
        date: new Date().toLocaleDateString('fa-IR')
    };

    if(!db.orders) db.orders = [];
    db.orders.push(newOrder);
    saveDB(db);

    res.json({ message: 'خرید با موفقیت انجام شد.', remainingStars: user.stars });
});

app.post('/api/user/download-image', (req, res) => {
    const { orderId, userId } = req.body;
    const db = getDB();
    const order = (db.orders || []).find(o => o.id === orderId && o.userId === userId);

    if(!order) return res.status(404).json({ error: 'سفارش یافت نشد.' });
    
    if(order.deliveryType === 'none') {
        return res.status(400).json({ error: 'این سفارش مربوط به خدمات دستی است و پس از انجام توسط ادمین تحویل داده می‌شود.' });
    }

    if(order.downloaded) return res.status(400).json({ error: 'این محتوا قبلاً ۱ بار دریافت شده و قفل گردیده است.' });

    order.downloaded = true;
    order.status = 'تحویل شد';
    saveDB(db);

    res.json({ 
        message: 'محتوای اصلی آماده مشاهده است.', 
        deliveryType: order.deliveryType,
        secretImage: order.secretImage, 
        secretText: order.secretText,
        productName: order.productName 
    });
});

app.post('/api/user/redeem-code', (req, res) => {
    const { userId, code } = req.body;
    if(!code) return res.status(400).json({ error: 'کد هدیه را وارد کنید.' });

    const db = getDB();
    const gift = (db.giftCodes || []).find(g => g.code.trim().toLowerCase() === code.trim().toLowerCase());
    const user = db.users.find(u => u.id === userId);

    if(!gift || !user) return res.status(404).json({ error: 'کد هدیه معتبر نیست.' });
    if(gift.isExpired) return res.status(400).json({ error: 'این کد هدیه منقضی شده است.' });

    const now = new Date();
    if(gift.startDate && new Date(gift.startDate) > now) {
        return res.status(400).json({ error: 'زمان استفاده از این کد هدیه هنوز شروع نشده است.' });
    }
    if(gift.endDate && new Date(gift.endDate) < now) {
        gift.isExpired = true;
        saveDB(db);
        return res.status(400).json({ error: 'مهلت استفاده از این کد هدیه به پایان رسیده است.' });
    }

    if(gift.maxCapacity && gift.usedCount >= gift.maxCapacity) {
        return res.status(400).json({ error: 'ظرفیت استفاده از این کد هدیه به اتمام رسیده است.' });
    }

    if(!gift.usedBy) gift.usedBy = [];
    if(gift.usedBy.includes(userId)) {
        return res.status(400).json({ error: 'شما قبلاً از این کد هدیه استفاده کرده‌اید.' });
    }

    gift.usedCount = (gift.usedCount || 0) + 1;
    gift.usedBy.push(userId);
    user.stars += gift.stars;

    saveDB(db);
    res.json({ message: `تبریک! تعداد ${gift.stars} ستاره هدیه به حساب شما اضافه شد.`, newStars: user.stars });
});

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

// ایجاد تیکت جدید با پیام اولیه
app.post('/api/user/tickets', (req, res) => {
    const { userId, username, title, message } = req.body;
    if(!title || !message) return res.status(400).json({ error: 'عنوان و متن پیام الزامی است.' });

    const db = getDB();
    const nowStr = new Date().toLocaleString('fa-IR');
    const newTicket = {
        id: Date.now(),
        userId,
        username,
        title,
        status: 'در حال بررسی',
        date: new Date().toLocaleDateString('fa-IR'),
        messages: [
            { sender: 'user', username, text: message, date: nowStr }
        ]
    };

    if(!db.tickets) db.tickets = [];
    db.tickets.push(newTicket);
    saveDB(db);

    res.json({ message: 'تیکت با موفقیت ایجاد شد.' });
});

// دریافت لیست تیکت‌های یک کاربر
app.get('/api/user/tickets', (req, res) => {
    const userId = Number(req.query.userId);
    const db = getDB();
    const userTickets = (db.tickets || []).filter(t => t.userId === userId);
    res.json(userTickets);
});

// ارسال پیام در چت تیکت (هم کاربر و هم ادمین)
app.post('/api/tickets/send-message', (req, res) => {
    const { ticketId, sender, username, text } = req.body;
    if(!text) return res.status(400).json({ error: 'متن پیام الزامی است.' });

    const db = getDB();
    const ticket = (db.tickets || []).find(t => t.id === ticketId);

    if(!ticket) return res.status(404).json({ error: 'تیکت یافت نشد.' });
    if(ticket.status === 'بسته شده') return res.status(400).json({ error: 'این تیکت بسته شده است و امکان ارسال پیام وجود ندارد.' });

    if(!ticket.messages) ticket.messages = [];
    ticket.messages.push({
        sender, // 'user' یا 'admin'
        username,
        text,
        date: new Date().toLocaleString('fa-IR')
    });

    if(sender === 'admin') ticket.status = 'پاسخ داده شد';
    if(sender === 'user') ticket.status = 'در حال بررسی';

    saveDB(db);
    res.json({ message: 'پیام ارسال شد.', ticket });
});

// ---------------- ای‌پی‌آی‌های مدیریت ----------------

app.post('/api/admin/settings', (req, res) => {
    const { storeName, logoUrl } = req.body;
    if(!storeName) return res.status(400).json({ error: 'نام فروشگاه الزامی است.' });

    const db = getDB();
    db.settings = {
        storeName: storeName.trim(),
        logoUrl: logoUrl ? logoUrl.trim() : 'https://via.placeholder.com/100/1e1b4b/fbbf24?text=Logo'
    };
    saveDB(db);
    res.json({ message: 'تنظیمات نام و لوگوی سایت با موفقیت به‌روزرسانی شد.' });
});

app.get('/api/admin/backup', (req, res) => {
    const db = getDB();
    res.json(db);
});

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
        settings: db.settings,
        users: db.users || [],
        products: db.products || [],
        orders: db.orders || [],
        tickets: db.tickets || [],
        announcements: db.announcements || [],
        giftCodes: db.giftCodes || [],
        stats: {
            totalUsers: (db.users || []).length,
            totalProducts: (db.products || []).length,
            totalOrders: (db.orders || []).length,
            totalTickets: (db.tickets || []).length,
            totalAnnouncements: (db.announcements || []).length,
            totalGiftCodes: (db.giftCodes || []).length
        }
    });
});

app.post('/api/admin/set-stars', (req, res) => {
    const { userId, stars } = req.body;
    const db = getDB();
    const user = db.users.find(u => u.id === userId);
    if (user) {
        user.stars = Math.max(0, Number(stars));
        saveDB(db);
        res.json({ message: 'موجودی ستاره کاربر تغییر یافت.', newStars: user.stars });
    } else {
        res.status(404).json({ error: 'کاربر پیدا نشد.' });
    }
});

app.post('/api/admin/add-product', (req, res) => {
    const { name, price, description, previewImage, deliveryType, secretImage, secretText } = req.body;
    if(!name || !price || !previewImage) {
        return res.status(400).json({ error: 'نام، قیمت و تصویر پیش‌نمایش اجباری هستند.' });
    }

    const db = getDB();
    if(!db.products) db.products = [];

    const newProduct = {
        id: Date.now(),
        name,
        price: Number(price),
        description: description || '',
        previewImage,
        deliveryType: deliveryType || 'image',
        secretImage: secretImage || previewImage,
        secretText: secretText || ''
    };

    db.products.push(newProduct);
    saveDB(db);
    res.json({ message: 'محصول با موفقیت اضافه شد.' });
});

app.post('/api/admin/create-gift-code', (req, res) => {
    const { code, stars, maxCapacity, startDate, endDate } = req.body;
    if(!code || !stars) return res.status(400).json({ error: 'عنوان کد و تعداد ستاره الزامی است.' });

    const db = getDB();
    if(!db.giftCodes) db.giftCodes = [];

    const newGift = {
        id: Date.now(),
        code: code.trim(),
        stars: Number(stars),
        maxCapacity: maxCapacity ? Number(maxCapacity) : null,
        usedCount: 0,
        usedBy: [],
        startDate: startDate || null,
        endDate: endDate || null,
        isExpired: false
    };

    db.giftCodes.push(newGift);
    saveDB(db);
    res.json({ message: 'کد هدیه با موفقیت ساخته شد.' });
});

app.post('/api/admin/expire-gift-code', (req, res) => {
    const { giftId } = req.body;
    const db = getDB();
    const gift = (db.giftCodes || []).find(g => g.id === giftId);
    if(gift) {
        gift.isExpired = true;
        saveDB(db);
        res.json({ message: 'کد هدیه منقضی شد.' });
    } else {
        res.status(404).json({ error: 'کد پیدا نشد.' });
    }
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

// بستن تیکت بدون حذف (تغییر وضعیت به "بسته شده")
app.post('/api/admin/close-ticket', (req, res) => {
    const { ticketId } = req.body;
    const db = getDB();
    const ticket = (db.tickets || []).find(t => t.id === ticketId);
    if(ticket) {
        ticket.status = 'بسته شده';
        saveDB(db);
        res.json({ message: 'تیکت با موفقیت بسته شد.' });
    } else {
        res.status(404).json({ error: 'تیکت یافت نشد.' });
    }
});

// حذف کامل تیکت از دیتابیس
app.post('/api/admin/delete-ticket', (req, res) => {
    const { ticketId } = req.body;
    const db = getDB();
    db.tickets = (db.tickets || []).filter(t => t.id !== ticketId);
    saveDB(db);
    res.json({ message: 'تیکت با موفقیت حذف گردید.' });
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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
