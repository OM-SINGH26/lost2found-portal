// ============================================================
//  Lost2Found — Upgraded Server
//  Stack: Express + MongoDB (Mongoose) + JWT Auth + Nodemailer
//  Run:   npm install && node server.js
// ============================================================

const express    = require('express');
const mongoose   = require('mongoose');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const multer     = require('multer');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────────────────────
//  EMAIL SERVICE
// ─────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS   // Gmail App Password (not your real password)
  }
});

// Verify email connection on startup
transporter.verify((err) => {
  if (err) console.log('⚠️  Email not configured:', err.message);
  else     console.log('📧 Email service ready');
});

// ── Email Templates ────────────────────────────────────────
function emailWrapper(content) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8"/>
    <style>
      body { margin:0; padding:0; background:#0c0c0e; font-family:'Segoe UI',Arial,sans-serif; }
      .wrap { max-width:580px; margin:0 auto; padding:32px 16px; }
      .card { background:#131316; border-radius:16px; overflow:hidden; border:1px solid rgba(255,255,255,0.07); }
      .header { background:linear-gradient(135deg,#c0272d,#7a1a1e); padding:32px; text-align:center; }
      .header h1 { color:white; font-size:24px; margin:0 0 4px; letter-spacing:-0.5px; }
      .header p  { color:rgba(255,255,255,0.7); font-size:13px; margin:0; }
      .body  { padding:32px; }
      .body p { color:#b0b0c0; font-size:14px; line-height:1.7; margin:0 0 16px; }
      .highlight { background:#1c1c22; border-left:3px solid #c0272d; border-radius:0 8px 8px 0; padding:16px 20px; margin:20px 0; }
      .highlight p { margin:4px 0; color:#d0d0e0; font-size:13px; }
      .highlight strong { color:#f2f2f5; }
      .btn { display:inline-block; padding:14px 32px; border-radius:10px; text-decoration:none; font-weight:700; font-size:14px; margin:20px 0; }
      .btn-red   { background:#c0272d; color:white; }
      .btn-green { background:#3dd68c; color:#0c0c0e; }
      .footer { padding:20px 32px; border-top:1px solid rgba(255,255,255,0.06); text-align:center; }
      .footer p { color:#555568; font-size:12px; margin:0; }
      .badge { display:inline-block; padding:4px 12px; border-radius:100px; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; }
      .badge-found    { background:rgba(61,214,140,0.15);  color:#3dd68c; }
      .badge-lost     { background:rgba(255,107,107,0.15); color:#ff6b6b; }
      .badge-approved { background:rgba(61,214,140,0.15);  color:#3dd68c; }
      .badge-rejected { background:rgba(255,107,107,0.15); color:#ff6b6b; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <div class="header">
          <h1>Lost<span style="color:rgba(255,255,255,0.4)">2</span>Found</h1>
          <p>Chandigarh University — Lost & Found Portal</p>
        </div>
        <div class="body">${content}</div>
        <div class="footer">
          <p>© 2025 Lost2Found · Chandigarh University · This is an automated notification</p>
        </div>
      </div>
    </div>
  </body>
  </html>`;
}

// Email: New claim received (to item reporter)
function emailNewClaim({ reporterName, claimerName, claimerEmail, itemName, itemLocation, proof, claimsUrl }) {
  return emailWrapper(`
    <p>Hi <strong style="color:#f2f2f5">${reporterName}</strong>,</p>
    <p>Someone has submitted a claim on your reported item. Please review the proof and approve or reject it.</p>
    <div class="highlight">
      <p><strong>Item:</strong> ${itemName}</p>
      <p><strong>Location:</strong> ${itemLocation}</p>
      <p><strong>Claimed by:</strong> ${claimerName} (${claimerEmail})</p>
      <p><strong>Proof:</strong> "${proof}"</p>
    </div>
    <p>Log in to your dashboard to review this claim:</p>
    <a href="${claimsUrl}" class="btn btn-red">Review Claim →</a>
    <p style="font-size:13px;color:#555568">If this item is not yours to review, please ignore this email.</p>
  `);
}

// Email: Claim approved (to claimer)
function emailClaimApproved({ claimerName, itemName, itemLocation, reporterName, reporterContact, claimsUrl }) {
  return emailWrapper(`
    <p>Hi <strong style="color:#f2f2f5">${claimerName}</strong>,</p>
    <p>Great news! Your claim has been <span class="badge badge-approved">✅ Approved</span></p>
    <div class="highlight">
      <p><strong>Item:</strong> ${itemName}</p>
      <p><strong>Found at:</strong> ${itemLocation}</p>
      <p><strong>Reporter:</strong> ${reporterName}</p>
      <p><strong>Contact:</strong> ${reporterContact}</p>
    </div>
    <p>Please contact the reporter directly to arrange collection of your item. Be sure to carry your student ID for verification.</p>
    <a href="${claimsUrl}" class="btn btn-green">View My Claims →</a>
    <p style="font-size:13px;color:#555568">Congratulations on recovering your item!</p>
  `);
}

// Email: Claim rejected (to claimer)
function emailClaimRejected({ claimerName, itemName, adminNote, portalUrl }) {
  return emailWrapper(`
    <p>Hi <strong style="color:#f2f2f5">${claimerName}</strong>,</p>
    <p>Unfortunately, your claim has been <span class="badge badge-rejected">❌ Rejected</span></p>
    <div class="highlight">
      <p><strong>Item:</strong> ${itemName}</p>
      ${adminNote ? `<p><strong>Reason:</strong> ${adminNote}</p>` : ''}
    </div>
    <p>If you believe this was a mistake, you can browse the portal and try again, or contact campus security for assistance.</p>
    <a href="${portalUrl}" class="btn btn-red">Browse Portal →</a>
    <p style="font-size:13px;color:#555568">We're sorry we couldn't help this time.</p>
  `);
}

// ── Send Email Helper ──────────────────────────────────────
async function sendEmail({ to, subject, html }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`📧 [Email skipped — not configured] To: ${to} | Subject: ${subject}`);
    return;
  }
  try {
    await transporter.sendMail({
      from: `"Lost2Found CU" <${process.env.EMAIL_USER}>`,
      to, subject, html
    });
    console.log(`📧 Email sent to ${to}`);
  } catch (err) {
    console.error(`❌ Email failed to ${to}:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────
//  MIDDLEWARE
// ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────────────────────
//  MONGODB CONNECTION
// ─────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/lost2found';

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ─────────────────────────────────────────────────────────────
//  SCHEMAS & MODELS
// ─────────────────────────────────────────────────────────────

// --- User Model ---
const userSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true },
  email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:   { type: String, required: true, minlength: 6 },
  phone:      { type: String, trim: true },
  rollNo:     { type: String, trim: true },
  role:       { type: String, enum: ['student', 'admin', 'security'], default: 'student' },
  isVerified: { type: Boolean, default: false },
  resetOTP:   { type: String },
  resetOTPExpiry: { type: Date },
  createdAt:  { type: Date, default: Date.now }
});

// Compare password helper
userSchema.methods.comparePassword = async function(plain) {
  return await bcrypt.compare(plain, this.password);
};

const User = mongoose.model('User', userSchema);

// --- Item Model ---
const itemSchema = new mongoose.Schema({
  name:               { type: String, required: true, trim: true },
  category:           { type: String, required: true, enum: ['electronics','clothing','documents','accessories','valuables','other'] },
  description:        { type: String, required: true },
  location:           { type: String, required: true },
  date:               { type: Date, required: true },
  time:               { type: String },
  status:             { type: String, required: true, enum: ['lost','found','returned'] },
  image:              { type: String, default: 'https://via.placeholder.com/300?text=No+Image' },
  reportedBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reporterName:       { type: String },
  contact:            { type: String },
  isResolved:         { type: Boolean, default: false },
  resolvedAt:         { type: Date },
  submittedToOffice:  { type: Boolean, default: false },   // ← NEW
  officeReceivedAt:   { type: Date },                      // ← NEW
  officeNote:         { type: String },                    // ← NEW: admin note from office
  createdAt:          { type: Date, default: Date.now }
});

// Text index for search
itemSchema.index({ name: 'text', description: 'text' });

const Item = mongoose.model('Item', itemSchema);

// --- Claim Model ---
const claimSchema = new mongoose.Schema({
  item:          { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  claimedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  claimerName:   { type: String },
  claimerContact:{ type: String },
  proof:         { type: String, required: true },   // ownership proof description
  status:        { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  adminNote:     { type: String },
  createdAt:     { type: Date, default: Date.now },
  resolvedAt:    { type: Date }
});

const Claim = mongoose.model('Claim', claimSchema);

// ─────────────────────────────────────────────────────────────
//  FILE UPLOAD CONFIG
// ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename(req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },  // 5MB max
  fileFilter(req, file, cb) {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// ─────────────────────────────────────────────────────────────
//  JWT AUTH MIDDLEWARE
// ─────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'lost2found_secret_change_in_production';

function signToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Protect route — must be logged in
function protect(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authenticated. Please log in.' });
  }
  try {
    req.user = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Token expired or invalid. Please log in again.' });
  }
}

// Admin only
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'security') {
    return res.status(403).json({ message: 'Admin access required.' });
  }
  next();
}

// ─────────────────────────────────────────────────────────────
//  AUTH ROUTES  /api/auth
// ─────────────────────────────────────────────────────────────

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, phone, rollNo } = req.body;

    console.log('📝 Register attempt:', { name, email, rollNo });

    if (!name || !email || !password)
      return res.status(400).json({ message: 'Name, email and password are required.' });

    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });

    const exists = await User.findOne({ email });
    if (exists)
      return res.status(409).json({ message: 'An account with this email already exists.' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      phone:  phone  || '',
      rollNo: rollNo || ''
    });

    const token = signToken(user);
    console.log('✅ User created:', user.email);

    res.status(201).json({
      message: 'Account created successfully!',
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('❌ Register error:', err.message);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 Login attempt:', email);

    if (!email || !password)
      return res.status(400).json({ message: 'Email and password are required.' });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(401).json({ message: 'Invalid email or password.' });

    const match = await user.comparePassword(password);
    if (!match)
      return res.status(401).json({ message: 'Invalid email or password.' });

    const token = signToken(user);
    console.log('✅ Login success:', user.email);

    res.json({
      message: 'Login successful!',
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('❌ Login error:', err.message);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});




// GET /api/auth/me  — get current logged-in user
app.get('/api/auth/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -resetOTP -resetOTPExpiry');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/forgot-password — send OTP to email
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'No account found with this email.' });

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.resetOTP = otp;
    user.resetOTPExpiry = expiry;
    await user.save();

    // Send OTP email
    await sendEmail({
      to: email,
      subject: '🔐 Password Reset OTP — Lost2Found',
      html: emailWrapper(`
        <p>Hi <strong style="color:#f2f2f5">${user.name}</strong>,</p>
        <p>You requested a password reset. Use the OTP below to reset your password:</p>
        <div style="text-align:center;margin:28px 0">
          <div style="display:inline-block;background:#1c1c22;border:2px solid #c0272d;border-radius:14px;padding:24px 40px">
            <div style="font-size:2.8rem;font-weight:800;letter-spacing:0.3em;color:#f2f2f5;font-family:'Courier New',monospace">${otp}</div>
            <div style="font-size:0.78rem;color:#888;margin-top:8px">Expires in 10 minutes</div>
          </div>
        </div>
        <p>If you didn't request this, ignore this email. Your password won't change.</p>
        <p style="font-size:0.8rem;color:#555">For security, never share this OTP with anyone.</p>
      `)
    });

    res.json({ message: 'OTP sent to your email successfully!' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/auth/verify-otp — verify OTP
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required.' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'No account found.' });
    if (!user.resetOTP) return res.status(400).json({ message: 'No OTP requested. Please request a new one.' });
    if (user.resetOTP !== otp) return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
    if (new Date() > user.resetOTPExpiry) return res.status(400).json({ message: 'OTP expired. Please request a new one.' });

    res.json({ message: 'OTP verified successfully!', verified: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/reset-password — reset password after OTP verification
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return res.status(400).json({ message: 'All fields required.' });
    if (newPassword.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'No account found.' });
    if (!user.resetOTP || user.resetOTP !== otp) return res.status(400).json({ message: 'Invalid OTP.' });
    if (new Date() > user.resetOTPExpiry) return res.status(400).json({ message: 'OTP expired. Please request a new one.' });

    // Reset password
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetOTP = undefined;
    user.resetOTPExpiry = undefined;
    await user.save();

    res.json({ message: 'Password reset successfully! You can now log in.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/auth/profile — update profile
app.put('/api/auth/profile', protect, async (req, res) => {
  try {
    const { name, phone, rollNo } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, phone, rollNo },
      { new: true }
    ).select('-password');
    res.json({ message: 'Profile updated.', user });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
//  AI SMART MATCHING ENGINE — UPGRADED
//  TF-IDF + Cosine Similarity + Synonyms + Color + Spelling
// ─────────────────────────────────────────────────────────────

// ── Synonym Dictionary ────────────────────────────────────────
const SYNONYMS = {
  // Electronics
  phone:      ['mobile', 'iphone', 'android', 'smartphone', 'samsung', 'realme', 'oneplus', 'oppo', 'vivo', 'redmi', 'nokia', 'motorola', 'cellphone', 'handset'],
  laptop:     ['macbook', 'notebook', 'computer', 'dell', 'hp', 'lenovo', 'asus', 'acer', 'chromebook', 'thinkpad'],
  earphones:  ['airpods', 'earbuds', 'headphones', 'earpiece', 'buds', 'pods', 'headset', 'earpods'],
  charger:    ['adapter', 'cable', 'chord', 'wire', 'usb'],
  tablet:     ['ipad', 'tab', 'kindle', 'surface'],
  watch:      ['smartwatch', 'fitbit', 'apple watch', 'timepiece', 'wristwatch'],
  camera:     ['dslr', 'canon', 'nikon', 'gopro', 'lens'],

  // Valuables
  wallet:     ['purse', 'billfold', 'cardholder', 'pouch', 'moneybag'],
  keys:       ['keychain', 'keyring', 'keyset', 'chabi'],
  card:       ['idcard', 'identity', 'studentcard', 'atm', 'debit', 'credit', 'passcard', 'uid'],
  money:      ['cash', 'currency', 'notes', 'coins', 'rupees'],

  // Accessories
  bag:        ['backpack', 'rucksack', 'handbag', 'satchel', 'tote', 'schoolbag', 'jhola', 'kitbag'],
  bottle:     ['waterbottle', 'flask', 'sipper', 'tumbler', 'thermos'],
  glasses:    ['spectacles', 'specs', 'sunglasses', 'eyeglasses', 'goggles', 'chashma'],
  umbrella:   ['raincoat', 'brolly', 'chhata'],
  helmet:     ['headgear', 'hardhat'],

  // Clothing
  jacket:     ['hoodie', 'coat', 'blazer', 'sweater', 'sweatshirt', 'cardigan', 'windbreaker'],
  shoes:      ['sneakers', 'boots', 'sandals', 'chappal', 'footwear', 'slippers', 'jootay'],
  cap:        ['hat', 'topi', 'beanie', 'headband'],

  // Documents
  book:       ['notebook', 'textbook', 'register', 'diary', 'copy', 'notepad'],
  document:   ['certificate', 'marksheet', 'result', 'papers', 'file', 'folder'],
};

// ── Color Keywords ─────────────────────────────────────────────
const COLORS = ['black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'grey', 'gray', 'brown', 'silver', 'gold', 'maroon', 'navy', 'beige', 'cream', 'dark', 'light'];

// ── Expand text with synonyms ──────────────────────────────────
function expandWithSynonyms(text) {
  const lower = text.toLowerCase();
  let expanded = lower;
  for (const [key, syns] of Object.entries(SYNONYMS)) {
    const allVariants = [key, ...syns];
    // If any variant found in text, add all variants
    if (allVariants.some(v => lower.includes(v))) {
      expanded += ' ' + allVariants.join(' ');
    }
  }
  return expanded;
}

// ── Simple spell correction (edit distance 1) ──────────────────
function editDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m+1 }, (_, i) => Array.from({ length: n+1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i-1] === b[j-1]) dp[i][j] = dp[i-1][j-1];
      else dp[i][j] = 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function spellTolerantMatch(word1, word2) {
  if (word1 === word2) return true;
  if (Math.abs(word1.length - word2.length) > 2) return false;
  return editDistance(word1, word2) <= 1; // 1 character difference allowed
}

// ── Tokenize + expand ──────────────────────────────────────────
function tokenize(text) {
  const expanded = expandWithSynonyms(text);
  return expanded.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1);
}

// ── TF-IDF Cosine Similarity with spell tolerance ──────────────
function textSimilarity(text1, text2) {
  const words1 = tokenize(text1);
  const words2 = tokenize(text2);
  if (!words1.length || !words2.length) return 0;

  const freq1 = {}, freq2 = {};
  words1.forEach(w => freq1[w] = (freq1[w] || 0) + 1);
  words2.forEach(w => freq2[w] = (freq2[w] || 0) + 1);

  const allWords = new Set([...Object.keys(freq1), ...Object.keys(freq2)]);

  let dot = 0, mag1 = 0, mag2 = 0;
  const keys1 = Object.keys(freq1);
  const keys2 = Object.keys(freq2);

  allWords.forEach(w => {
    let v1 = freq1[w] || 0;
    let v2 = freq2[w] || 0;

    // Spell tolerance — if word not found exactly, check near matches
    if (v1 === 0) {
      const near = keys1.find(k => spellTolerantMatch(k, w));
      if (near) v1 = freq1[near] * 0.8; // 80% credit for spell match
    }
    if (v2 === 0) {
      const near = keys2.find(k => spellTolerantMatch(k, w));
      if (near) v2 = freq2[near] * 0.8;
    }

    dot  += v1 * v2;
    mag1 += v1 * v1;
    mag2 += v2 * v2;
  });

  if (mag1 === 0 || mag2 === 0) return 0;
  return dot / (Math.sqrt(mag1) * Math.sqrt(mag2));
}

// ── Color Match Bonus ──────────────────────────────────────────
function colorMatchScore(text1, text2) {
  const t1 = text1.toLowerCase();
  const t2 = text2.toLowerCase();
  const colors1 = COLORS.filter(c => t1.includes(c));
  const colors2 = COLORS.filter(c => t2.includes(c));
  if (!colors1.length || !colors2.length) return 0;
  // Check overlap
  const common = colors1.filter(c => colors2.includes(c));
  if (common.length > 0) return 1.0;   // same color = bonus
  return -0.3;                          // different color = penalty
}

// ── Location proximity score ───────────────────────────────────
function locationScore(loc1, loc2) {
  if (loc1 === loc2) return 1.0;
  const adjacent = {
    library:    ['cafeteria', 'classroom'],
    cafeteria:  ['library', 'auditorium'],
    auditorium: ['cafeteria', 'gym'],
    gym:        ['auditorium', 'parking'],
    dorm:       ['parking', 'cafeteria'],
    parking:    ['gym', 'dorm'],
    classroom:  ['library', 'lab'],
    lab:        ['classroom']
  };
  if (adjacent[loc1]?.includes(loc2)) return 0.4;
  return 0;
}

// ── Date proximity score ───────────────────────────────────────
function dateScore(date1, date2) {
  const diff = Math.abs(new Date(date1) - new Date(date2));
  const days = diff / (1000 * 60 * 60 * 24);
  if (days <= 1)  return 1.0;
  if (days <= 3)  return 0.8;
  if (days <= 7)  return 0.6;
  if (days <= 14) return 0.3;
  return 0.1;
}

// ── Main Scoring Function ──────────────────────────────────────
function calculateMatchScore(lostItem, foundItem) {
  // Category must match (hard filter)
  if (lostItem.category !== foundItem.category) return null;

  const lostText  = `${lostItem.name} ${lostItem.description}`;
  const foundText = `${foundItem.name} ${foundItem.description}`;

  // 1. Text similarity with synonyms + spell tolerance (35%)
  const txtScore  = textSimilarity(lostText, foundText);

  // 2. Name similarity alone (20%)
  const nameScore = textSimilarity(lostItem.name, foundItem.name);

  // 3. Color match bonus/penalty (10%)
  const clrScore  = colorMatchScore(lostText, foundText);

  // 4. Location score (22%)
  const locScore  = locationScore(lostItem.location, foundItem.location);

  // 5. Date score (13%)
  const dtScore   = dateScore(lostItem.date, foundItem.date);

  // Weighted total
  let total = (txtScore  * 0.35)
            + (nameScore * 0.20)
            + (clrScore  * 0.10)
            + (locScore  * 0.22)
            + (dtScore   * 0.13);

  // Clamp between 0 and 1
  total = Math.max(0, Math.min(1, total));

  // Minimum threshold
  if (total < 0.20) return null;

  return {
    score: Math.round(total * 100),
    breakdown: {
      textMatch:     Math.round(txtScore  * 100),
      nameMatch:     Math.round(nameScore * 100),
      colorMatch:    clrScore > 0 ? '✅ Same color' : clrScore < 0 ? '❌ Different color' : '—',
      locationMatch: Math.round(locScore  * 100),
      dateMatch:     Math.round(dtScore   * 100)
    }
  };
}

// GET /api/match/:itemId — find matches for a given item
app.get('/api/match/:itemId', protect, async (req, res) => {
  try {
    const item = await Item.findById(req.params.itemId);
    if (!item) return res.status(404).json({ message: 'Item not found.' });

    const oppositeStatus = item.status === 'lost' ? 'found' : 'lost';
    const candidates = await Item.find({
      status:     oppositeStatus,
      category:   item.category,
      isResolved: false,
      _id:        { $ne: item._id }
    }).populate('reportedBy', 'name email');

    const matches = [];
    for (const candidate of candidates) {
      const result = calculateMatchScore(item, candidate);
      if (result) {
        matches.push({
          item:      candidate,
          score:     result.score,
          breakdown: result.breakdown,
          label:     result.score >= 75 ? 'High Match' :
                     result.score >= 50 ? 'Possible Match' : 'Low Match'
        });
      }
    }
    matches.sort((a, b) => b.score - a.score);
    res.json({ sourceItem: item, matches: matches.slice(0, 5), total: matches.length });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/items — report a new item (auth required)
app.post('/api/items', protect, upload.single('image'), async (req, res) => {
  try {
    const { name, category, description, location, date, time, status, submittedToOffice } = req.body;

    if (!name || !category || !description || !location || !date || !status)
      return res.status(400).json({ message: 'All required fields must be filled.' });

    const image = req.file
      ? `/uploads/${req.file.filename}`
      : 'https://via.placeholder.com/300?text=No+Image';

    const user = await User.findById(req.user.id);
    const isAtOffice = submittedToOffice === 'true' || submittedToOffice === true;

    const item = await Item.create({
      name, category, description, location,
      date: new Date(date), time, status, image,
      reportedBy:        req.user.id,
      reporterName:      user.name,
      contact:           user.email,
      submittedToOffice: isAtOffice,
      officeReceivedAt:  isAtOffice ? new Date() : undefined
    });

    // 🤖 Run AI matching immediately after creation
    const oppositeStatus = status === 'lost' ? 'found' : 'lost';
    const candidates = await Item.find({
      status: oppositeStatus, category, isResolved: false
    }).populate('reportedBy', 'name email');

    const matches = [];
    for (const candidate of candidates) {
      const result = calculateMatchScore(item, candidate);
      if (result) {
        matches.push({
          item:      candidate,
          score:     result.score,
          breakdown: result.breakdown,
          label:     result.score >= 75 ? 'High Match' :
                     result.score >= 50 ? 'Possible Match' : 'Low Match'
        });
      }
    }
    matches.sort((a, b) => b.score - a.score);

    // 📧 Send match notification email if high matches found
    const highMatches = matches.filter(m => m.score >= 50);
    if (highMatches.length > 0 && status === 'lost') {
      await sendEmail({
        to:      user.email,
        subject: `🔍 ${highMatches.length} Possible Match(es) Found — ${name}`,
        html:    emailWrapper(`
          <p>Hi <strong style="color:#f2f2f5">${user.name}</strong>,</p>
          <p>Good news! We found <strong style="color:#3dd68c">${highMatches.length} possible match(es)</strong> for your lost <strong>${name}</strong>.</p>
          ${highMatches.slice(0,3).map(m => `
            <div class="highlight">
              <p><strong>Item:</strong> ${m.item.name}</p>
              <p><strong>Location:</strong> ${m.item.location}</p>
              <p><strong>Match Score:</strong> <span style="color:#3dd68c">${m.score}%</span></p>
              <p><strong>Found by:</strong> ${m.item.reportedBy?.name || 'Someone'}</p>
            </div>`).join('')}
          <p>Log in to view full details and submit a claim:</p>
          <a href="${process.env.APP_URL || 'http://localhost:3000'}" class="btn btn-green">View Matches →</a>
        `)
      });
    }

    res.status(201).json({ item, matches: matches.slice(0, 5) });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/items — get all items with filters
app.get('/api/items', async (req, res) => {
  try {
    const { category, location, status, search } = req.query;
    const filter = { isResolved: false };

    if (category) filter.category = category;
    if (location) filter.location = location;
    if (status)   filter.status = status;
    if (search)   filter.$text = { $search: search };

    const items = await Item.find(filter)
      .populate('reportedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json(items);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/items/my — get items reported by logged-in user
app.get('/api/items/my', protect, async (req, res) => {
  try {
    const items = await Item.find({ reportedBy: req.user.id }).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/items/:id — single item
app.get('/api/items/:id', async (req, res) => {
  try {
    const item = await Item.findById(req.params.id).populate('reportedBy', 'name email');
    if (!item) return res.status(404).json({ message: 'Item not found.' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/items/:id — update item (owner or admin only)
app.put('/api/items/:id', protect, upload.single('image'), async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found.' });

    // Only owner or admin can edit
    if (item.reportedBy.toString() !== req.user.id && req.user.role === 'student')
      return res.status(403).json({ message: 'Not authorized to edit this item.' });

    const { name, category, description, location, date, time, status } = req.body;
    if (name)        item.name = name;
    if (category)    item.category = category;
    if (description) item.description = description;
    if (location)    item.location = location;
    if (date)        item.date = new Date(date);
    if (time)        item.time = time;
    if (status)      item.status = status;
    if (req.file)    item.image = `/uploads/${req.file.filename}`;

    await item.save();
    res.json(item);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/items/:id — delete item (owner or admin only)
app.delete('/api/items/:id', protect, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found.' });

    if (item.reportedBy.toString() !== req.user.id && req.user.role === 'student')
      return res.status(403).json({ message: 'Not authorized to delete this item.' });

    // Remove uploaded image file if it exists locally
    if (item.image && item.image.startsWith('/uploads/')) {
      const imgPath = path.join(__dirname, item.image);
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }

    await Item.findByIdAndDelete(req.params.id);
    res.json({ message: 'Item deleted successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
//  CLAIM ROUTES  /api/claims
// ─────────────────────────────────────────────────────────────

// POST /api/claims — submit a claim (auth required)
app.post('/api/claims', protect, async (req, res) => {
  try {
    const { itemId, proof } = req.body;

    if (!itemId || !proof)
      return res.status(400).json({ message: 'Item ID and proof of ownership are required.' });

    const item = await Item.findById(itemId);
    if (!item) return res.status(404).json({ message: 'Item not found.' });
    if (item.isResolved) return res.status(400).json({ message: 'This item has already been resolved.' });

    // Prevent claiming your own item
    if (item.reportedBy.toString() === req.user.id)
      return res.status(400).json({ message: "You can't claim your own report." });

    // Prevent duplicate claims
    const existing = await Claim.findOne({ item: itemId, claimedBy: req.user.id });
    if (existing)
      return res.status(409).json({ message: 'You have already submitted a claim for this item.' });

    const user = await User.findById(req.user.id);
    const claim = await Claim.create({
      item: itemId,
      claimedBy: req.user.id,
      claimerName: user.name,
      claimerContact: user.email,
      proof
    });

    // 📧 Notify item reporter about new claim
    const reporter = await User.findById(item.reportedBy);
    if (reporter) {
      await sendEmail({
        to:      reporter.email,
        subject: `🔔 New Claim on Your Item — ${item.name}`,
        html:    emailNewClaim({
          reporterName:  reporter.name,
          claimerName:   user.name,
          claimerEmail:  user.email,
          itemName:      item.name,
          itemLocation:  item.location,
          proof,
          claimsUrl:     `${process.env.APP_URL || 'http://localhost:3000'}/claims.html`
        })
      });
    }

    res.status(201).json({ message: 'Claim submitted successfully! The reporter will review it soon.', claim });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/claims/my — claims submitted by the logged-in user
app.get('/api/claims/my', protect, async (req, res) => {
  try {
    const claims = await Claim.find({ claimedBy: req.user.id })
      .populate('item', 'name category location image status')
      .sort({ createdAt: -1 });
    res.json(claims);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/claims/item/:itemId — get all claims for a specific item (owner or admin)
app.get('/api/claims/item/:itemId', protect, async (req, res) => {
  try {
    const item = await Item.findById(req.params.itemId);
    if (!item) return res.status(404).json({ message: 'Item not found.' });

    if (item.reportedBy.toString() !== req.user.id && req.user.role === 'student')
      return res.status(403).json({ message: 'Not authorized.' });

    const claims = await Claim.find({ item: req.params.itemId })
      .populate('claimedBy', 'name email rollNo phone')
      .sort({ createdAt: -1 });

    res.json(claims);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/claims/:claimId/approve — approve a claim (item owner or admin)
app.put('/api/claims/:claimId/approve', protect, async (req, res) => {
  try {
    const claim = await Claim.findById(req.params.claimId).populate('item');
    if (!claim) return res.status(404).json({ message: 'Claim not found.' });

    const item = claim.item;
    if (item.reportedBy.toString() !== req.user.id && req.user.role === 'student')
      return res.status(403).json({ message: 'Not authorized.' });

    claim.status     = 'approved';
    claim.resolvedAt = new Date();
    claim.adminNote  = req.body.note || '';
    await claim.save();

    // Mark item as returned
    item.isResolved = true;
    item.status     = 'returned';
    item.resolvedAt = new Date();
    await item.save();

    // Reject all other pending claims for this item
    await Claim.updateMany(
      { item: item._id, _id: { $ne: claim._id }, status: 'pending' },
      { status: 'rejected', adminNote: 'Another claim was approved.' }
    );

    // 📧 Notify claimer their claim was approved
    const claimer  = await User.findById(claim.claimedBy);
    const reporter = await User.findById(item.reportedBy);
    if (claimer) {
      await sendEmail({
        to:      claimer.email,
        subject: `✅ Your Claim Was Approved — ${item.name}`,
        html:    emailClaimApproved({
          claimerName:     claimer.name,
          itemName:        item.name,
          itemLocation:    item.location,
          reporterName:    reporter?.name  || 'The reporter',
          reporterContact: reporter?.email || 'Check the portal',
          claimsUrl:       `${process.env.APP_URL || 'http://localhost:3000'}/claims.html`
        })
      });
    }

    res.json({ message: 'Claim approved! Item marked as returned.', claim });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/claims/:claimId/reject — reject a claim
app.put('/api/claims/:claimId/reject', protect, async (req, res) => {
  try {
    const claim = await Claim.findById(req.params.claimId).populate('item');
    if (!claim) return res.status(404).json({ message: 'Claim not found.' });

    const item = claim.item;
    if (item.reportedBy.toString() !== req.user.id && req.user.role === 'student')
      return res.status(403).json({ message: 'Not authorized.' });

    claim.status     = 'rejected';
    claim.resolvedAt = new Date();
    claim.adminNote  = req.body.note || '';
    await claim.save();

    // 📧 Notify claimer their claim was rejected
    const claimer = await User.findById(claim.claimedBy);
    if (claimer) {
      await sendEmail({
        to:      claimer.email,
        subject: `❌ Your Claim Was Rejected — ${item.name}`,
        html:    emailClaimRejected({
          claimerName: claimer.name,
          itemName:    item.name,
          adminNote:   claim.adminNote,
          portalUrl:   `${process.env.APP_URL || 'http://localhost:3000'}`
        })
      });
    }

    res.json({ message: 'Claim rejected.', claim });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
//  ADMIN ROUTES  /api/admin  (admin/security only)
// ─────────────────────────────────────────────────────────────

// GET /api/admin/stats — dashboard numbers
app.get('/api/admin/stats', protect, adminOnly, async (req, res) => {
  try {
    const [total, lost, found, returned, pending, users] = await Promise.all([
      Item.countDocuments(),
      Item.countDocuments({ status: 'lost' }),
      Item.countDocuments({ status: 'found' }),
      Item.countDocuments({ status: 'returned' }),
      Claim.countDocuments({ status: 'pending' }),
      User.countDocuments({ role: 'student' })
    ]);
    res.json({ total, lost, found, returned, pendingClaims: pending, totalUsers: users });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/items — all items including resolved
app.get('/api/admin/items', protect, adminOnly, async (req, res) => {
  try {
    const items = await Item.find()
      .populate('reportedBy', 'name email rollNo')
      .sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/claims — all claims (not just pending)
app.get('/api/admin/claims', protect, adminOnly, async (req, res) => {
  try {
    const claims = await Claim.find()
      .populate('item', 'name category location image')
      .populate('claimedBy', 'name email rollNo phone')
      .sort({ createdAt: -1 });
    res.json(claims);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/users — all users
app.get('/api/admin/users', protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/admin/users/:id/role — change user role
app.put('/api/admin/users/:id/role', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role: req.body.role },
      { new: true }
    ).select('-password');
    res.json({ message: 'Role updated.', user });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/admin/users/:id — admin delete user
app.delete('/api/admin/users/:id', protect, adminOnly, async (req, res) => {
  try {
    if (req.params.id === req.user.id)
      return res.status(400).json({ message: "You can't delete your own account." });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Delete all items and claims by this user
    const userItems = await Item.find({ reportedBy: req.params.id });
    for (const item of userItems) {
      await Claim.deleteMany({ item: item._id });
    }
    await Item.deleteMany({ reportedBy: req.params.id });
    await Claim.deleteMany({ claimedBy: req.params.id });
    await User.findByIdAndDelete(req.params.id);

    res.json({ message: `User "${user.name}" deleted successfully.` });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// DELETE /api/admin/items/:id — admin force delete
app.delete('/api/admin/items/:id', protect, adminOnly, async (req, res) => {
  try {
    await Item.findByIdAndDelete(req.params.id);
    await Claim.deleteMany({ item: req.params.id });
    res.json({ message: 'Item and its claims deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
//  PUBLIC STATS (for hero counter on frontend)
// ─────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const [total, found, lost, returned, submittedToOffice] = await Promise.all([
      Item.countDocuments({ isResolved: false }),
      Item.countDocuments({ status: 'found', isResolved: false }),
      Item.countDocuments({ status: 'lost',  isResolved: false }),
      Item.countDocuments({ status: 'returned' }),
      Item.countDocuments({ submittedToOffice: true, isResolved: false })
    ]);
    res.json({ total, found, lost, returned, submittedToOffice });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
//  OFFICE MANAGEMENT ROUTES  /api/office
// ─────────────────────────────────────────────────────────────

// GET /api/office/items — all items at office (admin/security only)
app.get('/api/office/items', protect, adminOnly, async (req, res) => {
  try {
    const items = await Item.find({ submittedToOffice: true })
      .populate('reportedBy', 'name email rollNo')
      .sort({ officeReceivedAt: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/office/items/:id/receive — mark item as received at office (admin)
app.put('/api/office/items/:id/receive', protect, adminOnly, async (req, res) => {
  try {
    const item = await Item.findByIdAndUpdate(
      req.params.id,
      { submittedToOffice: true, officeReceivedAt: new Date(), officeNote: req.body.note || '' },
      { new: true }
    );
    if (!item) return res.status(404).json({ message: 'Item not found.' });
    res.json({ message: 'Item marked as received at office.', item });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/office/items/:id/release — mark item as released/returned from office (admin)
app.put('/api/office/items/:id/release', protect, adminOnly, async (req, res) => {
  try {
    const item = await Item.findByIdAndUpdate(
      req.params.id,
      { status: 'returned', isResolved: true, resolvedAt: new Date(), officeNote: req.body.note || 'Released from office' },
      { new: true }
    );
    if (!item) return res.status(404).json({ message: 'Item not found.' });
    res.json({ message: 'Item marked as returned from office.', item });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
//  SERVE FRONTEND
// ─────────────────────────────────────────────────────────────

// Root → auth page (login/register is the entry point)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'auth.html'));
});

// Main portal
app.get('/portal', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Auth page explicit route
app.get('/auth', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'auth.html'));
});

// Claims dashboard
app.get('/claims', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'claims.html'));
});

// Admin dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Catch-all fallback — fixed for Express v5+
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'auth.html'));
});

// ─────────────────────────────────────────────────────────────
//  START SERVER
// ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Lost2Found server running → http://localhost:${PORT}`);
});
