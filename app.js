const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'database.json');

// ساخت دیتابیس اولیه در صورت عدم وجود
if (!fs.existsSync(DB_FILE)) {
const initialData = {
users: [
{ id: 1, username: 'admin', password: '123', stars: 999, isBanned: false, isAdmin: true }
 ],
products: [
{ id: 1, name: 'اکانت ویژه ۱ ماهه', price: 5, description: 'دسترسی کامل به تمامی امکانات', image: 'https://via.placeholder.com/150' },
{ id: 2, name: 'کد تخفیف ۵۰ درصدی', price: 8, description: 'قابل استفاده در خرید بعدی', image: 'https://via.placeholder.com/150' }
 ],
orders: []
};
fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
}

function getDB() {
try {
return JSON.parse(fs.readFileSync(DB_FILE));
} catch (e) {
return { users: [], products: [], orders: [] };
}
}

function saveDB(data) {
fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// متن اختصاصی برای بن/تعلیق شدن کاربر
const BAN_MESSAGE = 'حساب شما به دلایل مختلف ، به حالت تعلیق در آمده ، برای تجدید نظر ، به آیدی @panda009822 در سروش پلاس مراجعه فرمائید.';

// ---------------- ای‌پی‌آی‌های عمومی و کاربران ----------------

// ثبت نام کاربر جدید
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
stars: 10, // ۱۰ ستاره هدیه ثبت‌نام
isBanned: false,
isAdmin: false
};

db.users.push(newUser);
saveDB(db);
res.json({ message: 'ثبت‌نام با موفقیت انجام شد! ۱۰ ستاره هدیه دریافت کردید.', user: newUser });
});

// ورود به حساب (با متن بن اختصاصی جدید)
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

// دریافت لیست محصولات
app.get('/api/products', (req, res) => {
const db = getDB();
res.json(db.products);
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

// کم شدن ستاره و ثبت سفارش
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

db.orders.push(newOrder);
saveDB(db);

res.json({ message: 'خرید با موفقیت انجام شد و سفارش ثبت گردید.', remainingStars: user.stars });
});

// ---------------- ای‌پی‌آی‌های پنل مدیریت ----------------

// دریافت اطلاعات کامل پنل مدیریت
app.get('/api/admin/data', (req, res) => {
const db = getDB();
res.json({
users: db.users,
products: db.products,
orders: db.orders,
stats: {
totalUsers: db.users.length,
totalProducts: db.products.length,
totalOrders: db.orders.length
}
});
});

// کم یا زیاد کردن ستاره کاربر
app.post('/api/admin/update-stars', (req, res) => {
const { userId, amount } = req.body;
const db = getDB();
const user = db.users.find(u => u.id === userId);
if (user) {
user.stars = Math.max(0, user.stars + amount);
saveDB(db);
res.json({ message: 'ستاره کاربر به‌روزرسانی شد.', newStars: user.stars });
} else {
res.status(404).json({ error: 'کاربر پیدا نشد.' });
}
});

// بن یا آنبن کردن کاربر
app.post('/api/admin/toggle-ban', (req, res) => {
const { userId } = req.body;
const db = getDB();
const user = db.users.find(u => u.id === userId);
if (user) {
user.isBanned = !user.isBanned;
saveDB(db);
res.json({ message: وضعیت بن تغییر یافت. });
} else {
res.status(404).json({ error: 'کاربر پیدا نشد.' });
}
});

// افزودن محصول جدید
app.post('/api/admin/add-product', (req, res) => {
const { name, price, description, image } = req.body;
if(!name || !price) return res.status(400).json({ error: 'نام و قیمت محصول الزامی است.' });

const db = getDB();
const newProduct = {
id: Date.now(),
name,
price: Number(price),
description: description || '',
image: image || 'https://via.placeholder.com/150'
};
db.products.push(newProduct);
saveDB(db);
res.json({ message: 'محصول با موفقیت اضافه شد.' });
});

// حذف محصول
app.post('/api/admin/delete-product', (req, res) => {
const { productId } = req.body;
const db = getDB();
db.products = db.products.filter(p => p.id !== productId);
saveDB(db);
res.json({ message: 'محصول حذف شد.' });
});

// تغییر وضعیت سفارش
app.post('/api/admin/update-order-status', (req, res) => {
const { orderId, status } = req.body;
const db = getDB();
const order = db.orders.find(o => o.id === orderId);
if (order) {
order.status = status;
saveDB(db);
res.json({ message: 'وضعیت سفارش تغییر کرد.' });
} else {
res.status(404).json({ error: 'سفارش یافت نشد.' });
}
});

app.listen(PORT, () => {
console.log(Server running on port ${PORT});
});