require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secret-key-change-in-production';
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Rate limiters
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many login attempts. Try again later.' }
});
const registerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Too many registration attempts. Try again later.' }
});
const chatLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30,
    message: { success: false, message: 'Too many messages. Slow down.' }
});

// Session configuration
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: COOKIE_SECURE,
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));

// Database file path
const dbPath = path.join(__dirname, 'database.json');

// Reports database file path
const reportsDbPath = path.join(__dirname, 'reports.json');

// Audit log file path
const auditLogPath = path.join(__dirname, 'audit.log');

// Audit log helper
function writeAuditLog(action, details, userId) {
    try {
        const line = `${new Date().toISOString()} | userId=${userId || 'anonymous'} | ${action} | ${typeof details === 'string' ? details : JSON.stringify(details)}\n`;
        fs.appendFileSync(auditLogPath, line);
    } catch (err) { console.error('Audit log error:', err); }
}

// Initialize database with default users if it doesn't exist
function initDatabase() {
    if (!fs.existsSync(dbPath)) {
        const defaultUsers = {
            users: [
                {
                    id: 1,
                    username: 'admin',
                    password: bcrypt.hashSync('admin123', 10),
                    role: 'admin',
                    email: 'admin@college.edu',
                    name: 'Administrator'
                },
                {
                    id: 2,
                    username: 'student1',
                    password: bcrypt.hashSync('student123', 10),
                    role: 'student',
                    email: 'student1@college.edu',
                    name: 'John Doe'
                },
                {
                    id: 3,
                    username: 'student2',
                    password: bcrypt.hashSync('password123', 10),
                    role: 'student',
                    email: 'student2@college.edu',
                    name: 'Jane Smith'
                }
            ]
        };
        fs.writeFileSync(dbPath, JSON.stringify(defaultUsers, null, 2));
    }
}

// Read database
function getDatabase() {
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data);
}

// Write database
function saveDatabase(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

// Password reset requests (file path and helpers)
const passwordResetRequestsPath = path.join(__dirname, 'password_reset_requests.json');

function getPasswordResetRequests() {
    if (!fs.existsSync(passwordResetRequestsPath)) {
        fs.writeFileSync(passwordResetRequestsPath, JSON.stringify({ requests: [] }, null, 2));
    }
    return JSON.parse(fs.readFileSync(passwordResetRequestsPath, 'utf8'));
}

function savePasswordResetRequests(data) {
    fs.writeFileSync(passwordResetRequestsPath, JSON.stringify(data, null, 2));
}

// Initialize reports database
function initReportsDatabase() {
    if (!fs.existsSync(reportsDbPath)) {
        const defaultReports = {
            reports: []
        };
        fs.writeFileSync(reportsDbPath, JSON.stringify(defaultReports, null, 2));
    }
}

// Read reports database
function getReports() {
    if (!fs.existsSync(reportsDbPath)) {
        initReportsDatabase();
    }
    const data = fs.readFileSync(reportsDbPath, 'utf8');
    return JSON.parse(data);
}

// Write reports database
function saveReports(data) {
    fs.writeFileSync(reportsDbPath, JSON.stringify(data, null, 2));
}

// Routes

// Root route - serve splash screen
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'splash.html'));
});

// Splash route
app.get('/splash.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'splash.html'));
});

// Login page route
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});
app.post('/api/login', loginLimiter, (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: 'Username and password are required'
        });
    }

    const db = getDatabase();
    const user = db.users.find(u => u.username === username && u.role === role);

    if (!user) {
        return res.status(401).json({
            success: false,
            message: 'User not found or incorrect role'
        });
    }

    // Compare password with hashed password
    const isPasswordValid = bcrypt.compareSync(password, user.password);

    if (!isPasswordValid) {
        return res.status(401).json({
            success: false,
            message: 'Invalid password'
        });
    }

    // Set session
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.name = user.name;

    res.json({
        success: true,
        message: 'Login successful',
        user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
            email: user.email
        }
    });
});

// Logout route
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Failed to logout'
            });
        }
        res.json({
            success: true,
            message: 'Logout successful'
        });
    });
});

// Get current user
app.get('/api/user', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            message: 'Not authenticated'
        });
    }

    res.json({
        success: true,
        user: {
            id: req.session.userId,
            username: req.session.username,
            role: req.session.role,
            name: req.session.name
        }
    });
});

// Check authentication middleware
function isAuthenticated(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            message: 'Not authenticated'
        });
    }
    next();
}

// Validation runner helper
function runValidation(req, res, validations, nextHandler) {
    return Promise.all(validations.map(v => v.run(req))).then(() => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array().map(e => ({ field: e.path, msg: e.msg }))
            });
        }
        nextHandler(req, res);
    }).catch(err => res.status(500).json({ success: false, message: 'Validation error' }));
}

const registerValidations = [
    body('username').trim().isLength({ min: 2, max: 50 }).withMessage('Username must be 2-50 characters'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name is required'),
    body('role').isIn(['admin', 'student']).withMessage('Role must be admin or student')
];

// Register new user (admin only)
app.post('/api/register', registerLimiter, isAuthenticated, (req, res) => {
    if (req.session.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Only admins can register new users'
        });
    }
    return runValidation(req, res, registerValidations, (req, res) => {
    const { username, password, email, name, role } = req.body;

    const db = getDatabase();

    // Check if user already exists
    if (db.users.find(u => u.username === username)) {
        return res.status(400).json({
            success: false,
            message: 'Username already exists'
        });
    }

    // Create new user
    const newUser = {
        id: Math.max(...db.users.map(u => u.id), 0) + 1,
        username: username,
        password: bcrypt.hashSync(password, 10),
        email: email,
        name: name,
        role: role
    };

    db.users.push(newUser);
    saveDatabase(db);
    writeAuditLog('USER_CREATE', { username: newUser.username, role: newUser.role }, req.session.userId);

    res.json({
        success: true,
        message: 'User registered successfully',
        user: {
            id: newUser.id,
            username: newUser.username,
            email: newUser.email,
            name: newUser.name,
            role: newUser.role
        }
    });
    });
});

// Get all users (admin only)
app.get('/api/users', isAuthenticated, (req, res) => {
    if (req.session.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Only admins can view users'
        });
    }

    const db = getDatabase();
    const users = db.users.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        name: u.name,
        role: u.role
    }));

    res.json({
        success: true,
        users: users
    });
});

// Change password
app.post('/api/change-password', isAuthenticated, (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({
            success: false,
            message: 'Current and new passwords are required'
        });
    }

    const db = getDatabase();
    const user = db.users.find(u => u.id === req.session.userId);

    if (!user) {
        return res.status(404).json({
            success: false,
            message: 'User not found'
        });
    }

    // Verify current password
    if (!bcrypt.compareSync(currentPassword, user.password)) {
        return res.status(401).json({
            success: false,
            message: 'Current password is incorrect'
        });
    }

    // Update password
    user.password = bcrypt.hashSync(newPassword, 10);
    saveDatabase(db);

    res.json({
        success: true,
        message: 'Password changed successfully'
    });
});

// Forgot password - create reset request (by email or username, admin will change password)
app.post('/api/forgot-password', loginLimiter, (req, res) => {
    const { email, username } = req.body;
    const identifier = email || username;

    if (!identifier) {
        return res.status(400).json({ success: false, message: 'Email or username is required' });
    }

    const db = getDatabase();
    const user = db.users.find(u => u.email === identifier || u.username === identifier);

    if (!user) {
        return res.status(404).json({ success: false, message: 'No account found with that email or username' });
    }

    const requestsData = getPasswordResetRequests();

    // Prevent duplicate pending requests for the same user
    const alreadyPending = requestsData.requests.some(r => r.userId === user.id && r.status === 'pending');
    if (alreadyPending) {
        return res.status(200).json({
            success: true,
            message: 'A password reset request is already pending for this account. Please wait for the admin to update your password.'
        });
    }

    const newId = (requestsData.requests.reduce((max, r) => Math.max(max, r.id || 0), 0) || 0) + 1;

    const requestEntry = {
        id: newId,
        userId: user.id,
        username: user.username,
        email: user.email,
        createdAt: new Date().toISOString(),
        status: 'pending'
    };

    requestsData.requests.push(requestEntry);
    savePasswordResetRequests(requestsData);

    writeAuditLog('PASSWORD_RESET_REQUEST_CREATED', { userId: user.id, username: user.username }, null);

    return res.json({
        success: true,
        message: 'Your password reset request has been sent to the admin. They will update your password and inform you.'
    });
});

// Admin: get all password reset requests
app.get('/api/password-reset-requests', isAuthenticated, (req, res) => {
    if (req.session.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Only admins can view password reset requests'
        });
    }

    const data = getPasswordResetRequests();
    return res.json({
        success: true,
        requests: data.requests || []
    });
});

// Admin: resolve a password reset request and set new password for the student
app.post('/api/password-reset-requests/:requestId/resolve', isAuthenticated, (req, res) => {
    if (req.session.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Only admins can resolve password reset requests'
        });
    }

    const { newPassword } = req.body;
    const requestId = parseInt(req.params.requestId, 10);

    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({
            success: false,
            message: 'New password is required and must be at least 6 characters long'
        });
    }

    const requestsData = getPasswordResetRequests();
    const request = requestsData.requests.find(r => r.id === requestId);

    if (!request) {
        return res.status(404).json({
            success: false,
            message: 'Password reset request not found'
        });
    }

    if (request.status !== 'pending') {
        return res.status(400).json({
            success: false,
            message: 'This request has already been resolved'
        });
    }

    const db = getDatabase();
    const user = db.users.find(u => u.id === request.userId);

    if (!user) {
        return res.status(404).json({
            success: false,
            message: 'User associated with this request no longer exists'
        });
    }

    user.password = bcrypt.hashSync(newPassword, 10);
    saveDatabase(db);

    request.status = 'completed';
    request.resolvedAt = new Date().toISOString();
    request.resolvedBy = req.session.userId;
    savePasswordResetRequests(requestsData);

    writeAuditLog('PASSWORD_RESET_REQUEST_RESOLVED', { requestId, userId: user.id, username: user.username }, req.session.userId);

    return res.json({
        success: true,
        message: `Password for user "${user.username}" has been updated.`
    });
});

// Admin: cancel a password reset request
app.post('/api/password-reset-requests/:requestId/cancel', isAuthenticated, (req, res) => {
    if (req.session.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Only admins can cancel password reset requests'
        });
    }

    const requestId = parseInt(req.params.requestId, 10);
    const requestsData = getPasswordResetRequests();
    const request = requestsData.requests.find(r => r.id === requestId);

    if (!request) {
        return res.status(404).json({
            success: false,
            message: 'Password reset request not found'
        });
    }

    if (request.status !== 'pending') {
        return res.status(400).json({
            success: false,
            message: 'Only pending requests can be cancelled'
        });
    }

    request.status = 'cancelled';
    request.resolvedAt = new Date().toISOString();
    request.resolvedBy = req.session.userId;
    savePasswordResetRequests(requestsData);

    writeAuditLog('PASSWORD_RESET_REQUEST_CANCELLED', { requestId, userId: request.userId, username: request.username }, req.session.userId);

    return res.json({
        success: true,
        message: `Password reset request for user "${request.username}" has been cancelled.`
    });
});

// Delete user (admin only)
app.delete('/api/users/:userId', isAuthenticated, (req, res) => {
    if (req.session.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Only admins can delete users'
        });
    }

    const userId = parseInt(req.params.userId);
    const db = getDatabase();

    // Prevent deleting yourself
    if (userId === req.session.userId) {
        return res.status(400).json({
            success: false,
            message: 'Cannot delete your own account'
        });
    }

    const userIndex = db.users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
        return res.status(404).json({
            success: false,
            message: 'User not found'
        });
    }

    const deletedUser = db.users[userIndex];
    db.users.splice(userIndex, 1);
    saveDatabase(db);
    writeAuditLog('USER_DELETE', { userId, username: deletedUser.username }, req.session.userId);

    res.json({
        success: true,
        message: `User "${deletedUser.username}" deleted successfully`
    });
});

// Report endpoints

// Submit report (admin only)
app.post('/api/reports', isAuthenticated, (req, res) => {
    if (req.session.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Only admins can submit reports'
        });
    }

    const { eventDate, reportTitle, reportContent, eventName } = req.body;
    if (!eventDate || !reportTitle || !reportContent) {
        return res.status(400).json({
            success: false,
            message: 'Event date, title, and content are required'
        });
    }
    if (String(reportTitle).length > 200 || String(reportContent).length > 50000) {
        return res.status(400).json({
            success: false,
            message: 'Title or content too long'
        });
    }

    const reports = getReports();
    const newReport = {
        id: Date.now().toString(),
        eventDate: eventDate,
        eventName: eventName || 'Unnamed Event',
        reportTitle: reportTitle,
        reportContent: reportContent,
        submittedBy: req.session.name,
        submittedByUsername: req.session.username,
        submittedDate: new Date().toISOString(),
        status: 'submitted'
    };

    reports.reports.push(newReport);
    saveReports(reports);
    writeAuditLog('REPORT_SUBMIT', { id: newReport.id, eventDate: newReport.eventDate }, req.session.userId);

    res.json({
        success: true,
        message: 'Report submitted successfully',
        report: newReport
    });
});

// Get all reports
app.get('/api/reports', (req, res) => {
    const reports = getReports();
    res.json({
        success: true,
        reports: reports.reports
    });
});

// Get report by date
app.get('/api/reports/date/:eventDate', (req, res) => {
    const eventDate = req.params.eventDate;
    const reports = getReports();
    const dateReports = reports.reports.filter(r => r.eventDate === eventDate);

    res.json({
        success: true,
        reports: dateReports
    });
});

// Download report
app.get('/api/reports/download/:id', (req, res) => {
    const reportId = req.params.id;
    const reports = getReports();
    const report = reports.reports.find(r => r.id === reportId);

    if (!report) {
        return res.status(404).json({
            success: false,
            message: 'Report not found'
        });
    }

    const reportContent = `
Event Report
============
Event Name: ${report.eventName}
Event Date: ${report.eventDate}
Report Title: ${report.reportTitle}
Status: ${report.status}

Report Content:
${report.reportContent}

Submitted by: ${report.submittedBy}
Submitted on: ${new Date(report.submittedDate).toLocaleString()}
`;

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="Report_${reportId}.txt"`);
    res.send(reportContent);
});

// Delete report (admin only)
app.delete('/api/reports/:id', isAuthenticated, (req, res) => {
    if (req.session.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Only admins can delete reports'
        });
    }

    const reportId = req.params.id;
    const reports = getReports();
    const reportIndex = reports.reports.findIndex(r => r.id === reportId);

    if (reportIndex === -1) {
        return res.status(404).json({
            success: false,
            message: 'Report not found'
        });
    }

    const deletedReport = reports.reports[reportIndex];
    reports.reports.splice(reportIndex, 1);
    saveReports(reports);
    writeAuditLog('REPORT_DELETE', { id: reportId, title: deletedReport.reportTitle }, req.session.userId);

    res.json({
        success: true,
        message: 'Report deleted successfully'
    });
});

// Events database file path
const eventsDbPath = path.join(__dirname, 'events.json');

// Initialize events database
function initEventsDatabase() {
    if (!fs.existsSync(eventsDbPath)) {
        const defaultEvents = {
            events: []
        };
        fs.writeFileSync(eventsDbPath, JSON.stringify(defaultEvents, null, 2));
    }
}

// Read events database
function getEvents() {
    if (!fs.existsSync(eventsDbPath)) {
        initEventsDatabase();
    }
    const data = fs.readFileSync(eventsDbPath, 'utf8');
    return JSON.parse(data);
}

// Write events database
function saveEvents(data) {
    fs.writeFileSync(eventsDbPath, JSON.stringify(data, null, 2));
}

// Announcements database
const announcementsPath = path.join(__dirname, 'announcements.json');
function getAnnouncements() {
    if (!fs.existsSync(announcementsPath)) {
        fs.writeFileSync(announcementsPath, JSON.stringify({ announcements: [] }, null, 2));
    }
    return JSON.parse(fs.readFileSync(announcementsPath, 'utf8'));
}
function saveAnnouncements(data) {
    fs.writeFileSync(announcementsPath, JSON.stringify(data, null, 2));
}

// =================================
// EVENTS API ENDPOINTS
// =================================

// Get all events (no auth required - all users can view)
app.get('/api/events', (req, res) => {
    const events = getEvents();
    res.json({
        success: true,
        events: events.events
    });
});

// Get events for a specific date (no auth required)
app.get('/api/events/date/:eventDate', (req, res) => {
    const eventDate = req.params.eventDate;
    const events = getEvents();
    const dateEvents = events.events.filter(e => e.eventDate === eventDate);
    
    res.json({
        success: true,
        events: dateEvents
    });
});

// Search events and reports
app.get('/api/search', (req, res) => {
    const q = (req.query.q || '').trim().toLowerCase();
    if (!q) {
        return res.json({ success: true, events: [], reports: [] });
    }
    const events = getEvents();
    const reports = getReports();
    const eventsMatch = events.events.filter(e =>
        (e.title && e.title.toLowerCase().includes(q)) ||
        (e.description && e.description.toLowerCase().includes(q)) ||
        (e.eventDate && e.eventDate.includes(q))
    );
    const reportsMatch = reports.reports.filter(r =>
        (r.reportTitle && r.reportTitle.toLowerCase().includes(q)) ||
        (r.reportContent && r.reportContent.toLowerCase().includes(q)) ||
        (r.eventDate && r.eventDate.includes(q))
    );
    res.json({ success: true, events: eventsMatch, reports: reportsMatch });
});

// Calendar export (iCal or CSV)
app.get('/api/events/export', (req, res) => {
    const format = (req.query.format || 'csv').toLowerCase();
    const from = req.query.from || '';
    const to = req.query.to || '';
    const events = getEvents();
    let list = events.events;
    if (from) list = list.filter(e => (e.eventDate || '') >= from);
    if (to) list = list.filter(e => (e.eventDate || '') <= to);
    list.sort((a, b) => (a.eventDate || '').localeCompare(b.eventDate || ''));

    if (format === 'ical') {
        let ical = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//College Calendar//EN\r\n';
        list.forEach(e => {
            ical += 'BEGIN:VEVENT\r\n';
            ical += 'UID:' + (e.id || Date.now()) + '@calendar\r\n';
            ical += 'DTSTART;VALUE=DATE:' + (e.eventDate || '').replace(/-/g, '') + '\r\n';
            ical += 'SUMMARY:' + (e.title || '').replace(/\n/g, ' ') + '\r\n';
            ical += 'DESCRIPTION:' + (e.description || '').replace(/\n/g, ' ').substring(0, 200) + '\r\n';
            ical += 'END:VEVENT\r\n';
        });
        ical += 'END:VCALENDAR\r\n';
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="calendar.ics"');
        return res.send(ical);
    }
    // CSV
    const header = 'Date,Title,Description,Type\r\n';
    const rows = list.map(e => [
        e.eventDate || '',
        '"' + (e.title || '').replace(/"/g, '""') + '"',
        '"' + (e.description || '').replace(/"/g, '""') + '"',
        e.type || ''
    ].join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="events.csv"');
    res.send('\uFEFF' + header + rows);
});

// Announcements: list (all)
app.get('/api/announcements', (req, res) => {
    const data = getAnnouncements();
    const list = (data.announcements || []).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json({ success: true, announcements: list });
});

// Announcements: create (admin only)
app.post('/api/announcements', isAuthenticated, (req, res) => {
    if (req.session.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const { title, body } = req.body;
    if (!title || !body) {
        return res.status(400).json({ success: false, message: 'Title and body required' });
    }
    const data = getAnnouncements();
    const ann = {
        id: Date.now().toString(),
        title: title.trim(),
        body: body.trim(),
        createdBy: req.session.username,
        createdAt: new Date().toISOString()
    };
    data.announcements = data.announcements || [];
    data.announcements.push(ann);
    saveAnnouncements(data);
    writeAuditLog('ANNOUNCEMENT_CREATE', { id: ann.id, title: ann.title }, req.session.userId);
    res.json({ success: true, announcement: ann });
});

// Announcements: update (admin only)
app.put('/api/announcements/:id', isAuthenticated, (req, res) => {
    if (req.session.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const id = req.params.id;
    const { title, body } = req.body;
    const data = getAnnouncements();
    const idx = (data.announcements || []).findIndex(a => a.id === id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Not found' });
    if (title !== undefined) data.announcements[idx].title = title.trim();
    if (body !== undefined) data.announcements[idx].body = body.trim();
    saveAnnouncements(data);
    res.json({ success: true, announcement: data.announcements[idx] });
});

// Announcements: delete (admin only)
app.delete('/api/announcements/:id', isAuthenticated, (req, res) => {
    if (req.session.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const id = req.params.id;
    const data = getAnnouncements();
    const idx = (data.announcements || []).findIndex(a => a.id === id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Not found' });
    const removed = data.announcements.splice(idx, 1)[0];
    saveAnnouncements(data);
    writeAuditLog('ANNOUNCEMENT_DELETE', { id }, req.session.userId);
    res.json({ success: true, message: 'Deleted' });
});

// Create new event (admin only)
app.post('/api/events', isAuthenticated, (req, res) => {
    if (req.session.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Only admins can create events'
        });
    }

    const { eventDate, title, description, type } = req.body;
    if (!eventDate || !title || !type) {
        return res.status(400).json({
            success: false,
            message: 'Event date, title, and type are required'
        });
    }
    if (String(title).length > 200 || (description && String(description).length > 2000)) {
        return res.status(400).json({
            success: false,
            message: 'Title or description too long'
        });
    }

    const events = getEvents();
    const newEvent = {
        id: Date.now().toString(),
        eventDate: eventDate,
        title: title,
        description: description || '',
        type: type,
        createdBy: req.session.username,
        createdByName: req.session.name,
        createdDate: new Date().toISOString(),
        updated: false
    };

    events.events.push(newEvent);
    saveEvents(events);
    writeAuditLog('EVENT_CREATE', { id: newEvent.id, title: newEvent.title, eventDate: newEvent.eventDate }, req.session.userId);

    res.json({
        success: true,
        message: 'Event created successfully',
        event: newEvent
    });
});

// Update event (admin only)
app.put('/api/events/:id', isAuthenticated, (req, res) => {
    if (req.session.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Only admins can update events'
        });
    }

    const eventId = req.params.id;
    const { title, description, type } = req.body;

    const events = getEvents();
    const eventIndex = events.events.findIndex(e => e.id === eventId);

    if (eventIndex === -1) {
        return res.status(404).json({
            success: false,
            message: 'Event not found'
        });
    }

    const event = events.events[eventIndex];
    event.title = title || event.title;
    event.description = description !== undefined ? description : event.description;
    event.type = type || event.type;
    event.updated = true;
    event.updatedDate = new Date().toISOString();

    saveEvents(events);
    writeAuditLog('EVENT_UPDATE', { id: eventId, title: event.title }, req.session.userId);

    res.json({
        success: true,
        message: 'Event updated successfully',
        event: event
    });
});

// Delete event (admin only)
app.delete('/api/events/:id', isAuthenticated, (req, res) => {
    if (req.session.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Only admins can delete events'
        });
    }

    const eventId = req.params.id;
    const events = getEvents();
    const eventIndex = events.events.findIndex(e => e.id === eventId);

    if (eventIndex === -1) {
        return res.status(404).json({
            success: false,
            message: 'Event not found'
        });
    }

    const deletedEvent = events.events[eventIndex];
    events.events.splice(eventIndex, 1);
    saveEvents(events);
    writeAuditLog('EVENT_DELETE', { id: eventId, title: deletedEvent.title }, req.session.userId);

    res.json({
        success: true,
        message: 'Event deleted successfully'
    });
});

// ========== CHATBOT ENDPOINTS ==========

// Get chat history for user (optional auth)
app.get('/api/chat/history', (req, res) => {
    const userId = req.session.userId || 'anonymous_' + Date.now();
    const chatFile = path.join(__dirname, `chat_${userId}.json`);
    
    try {
        if (fs.existsSync(chatFile)) {
            const chatData = fs.readFileSync(chatFile, 'utf8');
            const messages = JSON.parse(chatData);
            res.json({
                success: true,
                messages: messages
            });
        } else {
            res.json({
                success: true,
                messages: []
            });
        }
    } catch (error) {
        res.json({
            success: true,
            messages: []
        });
    }
});

// Save chat message (optional auth)
app.post('/api/chat/message', chatLimiter, (req, res) => {
    const userId = req.session.userId || 'anonymous';
    const { message } = req.body;
    
    if (!message || message.trim() === '') {
        return res.status(400).json({
            success: false,
            message: 'Message cannot be empty'
        });
    }

    const chatFile = path.join(__dirname, `chat_${userId}.json`);
    let messages = [];

    // Get existing messages
    try {
        if (fs.existsSync(chatFile)) {
            const chatData = fs.readFileSync(chatFile, 'utf8');
            messages = JSON.parse(chatData);
        }
    } catch (error) {
        messages = [];
    }

    // User message
    messages.push({
        id: Date.now(),
        type: 'user',
        text: message,
        timestamp: new Date().toISOString()
    });

    // Bot response (simple AI)
    const botResponse = generateChatbotResponse(message);
    messages.push({
        id: Date.now() + 1,
        type: 'bot',
        text: botResponse,
        timestamp: new Date().toISOString()
    });

    // Keep only last 100 messages
    if (messages.length > 100) {
        messages = messages.slice(-100);
    }

    // Save messages
    fs.writeFileSync(chatFile, JSON.stringify(messages, null, 2));

    res.json({
        success: true,
        userMessage: message,
        botResponse: botResponse
    });
});

// Clear chat history (optional auth)
app.post('/api/chat/clear', (req, res) => {
    const userId = req.session.userId || 'anonymous';
    const chatFile = path.join(__dirname, `chat_${userId}.json`);
    
    try {
        if (fs.existsSync(chatFile)) {
            fs.unlinkSync(chatFile);
        }
        res.json({
            success: true,
            message: 'Chat history cleared'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error clearing chat history'
        });
    }
});

// Chatbot AI Response Generator – answers ONLY from information available on this web app (no external/general knowledge)
const SCOPE_MESSAGE = `I can only provide information that is available on this college web app. I cannot answer questions beyond that. I can help with: calendar, events, admissions, courses, dashboard, reports, campus facilities, and login. For anything else, please contact the college office or visit the main college website.`;

// Parse a date from user message (e.g. "feb 20", "february 20", "feb 20 what event", "20/02") -> "YYYY-MM-DD" or null
function parseDateFromMessage(text) {
    const msg = text.toLowerCase().trim();
    const months = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
    const now = new Date();
    const currentYear = now.getFullYear();

    // Already YYYY-MM-DD
    const isoMatch = msg.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
    if (isoMatch) {
        const y = parseInt(isoMatch[1], 10);
        const m = parseInt(isoMatch[2], 10) - 1;
        const d = parseInt(isoMatch[3], 10);
        const date = new Date(y, m, d);
        if (!isNaN(date.getTime())) return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    // Month name + day anywhere in message (e.g. "feb 20 what event", "what event on february 20")
    // Try both patterns: "feb 20" and "20 feb"
    for (const [name, monthNum] of Object.entries(months)) {
        // Pattern 1: "feb 20" or "february 20"
        const regex1 = new RegExp(`\\b${name}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(20\\d{2}))?`, 'i');
        // Pattern 2: "20 feb" or "20 february"
        const regex2 = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+${name}(?:\\s+(20\\d{2}))?`, 'i');
        const m1 = msg.match(regex1);
        const m2 = msg.match(regex2);
        const match = m1 || m2;
        if (match) {
            const day = parseInt(match[1], 10);
            const year = match[2] ? parseInt(match[2], 10) : currentYear;
            if (day >= 1 && day <= 31) {
                const date = new Date(year, monthNum, day);
                if (!isNaN(date.getTime())) {
                    return `${year}-${String(monthNum + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                }
            }
        }
    }

    // "20/02", "20-02", "20.02", "02/20"
    const slashMatch = msg.match(/\b(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](20\d{2}))?\b/);
    if (slashMatch) {
        const a = parseInt(slashMatch[1], 10);
        const b = parseInt(slashMatch[2], 10);
        const year = slashMatch[3] ? parseInt(slashMatch[3], 10) : currentYear;
        let day, month;
        if (a <= 12 && b <= 31) {
            day = b;
            month = a - 1;
        } else {
            day = a;
            month = b - 1;
        }
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    return null;
}

// -------- Chatbot uses events.json database (same as Academic Calendar) --------
// getEvents() reads from eventsDbPath (events.json); all event answers come from that file.

// Get events for a date and format as bot reply (tries same date in current year and next year for academic calendar)
function getEventsReplyForDate(eventDateStr) {
    try {
        const data = getEvents(); // direct read from events.json
        const allEvents = data.events || [];
        let list = allEvents.filter(e => e.eventDate === eventDateStr);
        // If no events on exact date, try same month-day in next year (e.g. "feb 20" in 2025 → also check 2026-02-20)
        if (list.length === 0 && eventDateStr) {
            const [y, m, d] = eventDateStr.split('-').map(Number);
            const nextYearStr = `${y + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            list = allEvents.filter(e => e.eventDate === nextYearStr);
            if (list.length > 0) eventDateStr = nextYearStr;
        }
        const dateLabel = new Date(eventDateStr + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
        if (list.length === 0) {
            return `📅 There are no events on ${dateLabel} in the academic calendar. You can check other dates on the Academic Calendar page.`;
        }
        let reply = `📅 Events on ${dateLabel} (from academic calendar):\n\n`;
        list.forEach((e) => {
            reply += `• ${e.title || 'Event'} (${e.type || 'event'})`;
            if (e.description && e.description.trim()) reply += ` — ${e.description.trim()}`;
            reply += '\n';
        });
        return reply.trim();
    } catch (err) {
        return `📅 I couldn’t look up the calendar right now. Please check the Academic Calendar page on this web app.`;
    }
}

// Get upcoming/all events from events.json and format as bot reply
function getEventsReplyUpcoming(limit = 10) {
    try {
        const data = getEvents(); // direct read from events.json
        const allEvents = (data.events || []).slice();
        const sorted = allEvents.sort((a, b) => (a.eventDate || '').localeCompare(b.eventDate || ''));
        const today = new Date().toISOString().slice(0, 10);
        const upcoming = sorted.filter(e => (e.eventDate || '') >= today).slice(0, limit);
        if (upcoming.length === 0) {
            return `📅 There are no upcoming events in the academic calendar right now. You can check the Academic Calendar page or ask for a specific date (e.g. "events on Feb 20").`;
        }
        let reply = `📅 Upcoming events (from academic calendar):\n\n`;
        upcoming.forEach((e) => {
            const dateLabel = e.eventDate ? new Date(e.eventDate + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
            reply += `• ${dateLabel}: ${e.title || 'Event'} (${e.type || 'event'})`;
            if (e.description && e.description.trim()) reply += ` — ${e.description.trim()}`;
            reply += '\n';
        });
        return reply.trim();
    } catch (err) {
        return `📅 I couldn’t look up the calendar right now. Please check the Academic Calendar page on this web app.`;
    }
}

function generateChatbotResponse(userMessage) {
    const msg = userMessage.toLowerCase().trim();

    // Greeting – clarify limited scope
    if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey') || msg === 'hi' || msg === 'hello') {
        return `👋 Hello! I'm the college assistant for this web app. I can only answer questions using information available here: calendar, events, admissions, dashboard, reports, and college info on this site. How can I help you within that?`;
    }

    // PRIORITY 1: Date + event query – MUST check BEFORE generic "event" check
    // Examples: "feb 20", "what event on feb 20", "events on 20 feb", "feb 20 what event"
    const parsedDate = parseDateFromMessage(userMessage);
    if (parsedDate) {
        console.log(`[Chatbot] Parsed date "${parsedDate}" from message: "${userMessage}"`);
        return getEventsReplyForDate(parsedDate);
    }

    // Upcoming / all events – fetch directly from events.json
    if (msg.includes('upcoming') || msg.includes('all events') || msg.includes('list events') || msg.includes('what events') || msg.includes('next events')) {
        return getEventsReplyUpcoming(10);
    }

    // Event related (from web app) – generic calendar question (data from same DB as Academic Calendar)
    if (msg.includes('event') || msg.includes('calendar')) {
        return `📅 I use the same academic calendar as the app. Ask me "upcoming events" or "what events on Feb 20?" and I’ll fetch the data. You can also view the Academic Calendar page.`;
    }

    // Admission (info as on web/app)
    if (msg.includes('admission') || msg.includes('apply')) {
        return `🎓 For admission inquiries, please visit our main college website or contact our admissions office (as listed on this site). I can only share what’s available on this web app.`;
    }

    // Course/Academic (as on web app)
    if (msg.includes('course') || msg.includes('syllabus') || msg.includes('academic')) {
        return `📚 Our college offers various engineering programs (e.g. CSE, ECE, Mechanical, Civil). For detailed syllabus or course info not on this app, please contact your department or academic advisor.`;
    }

    // Contact (as available on app)
    if (msg.includes('contact') || msg.includes('phone') || msg.includes('email')) {
        return `📞 Contact details are available on the main college website. On this web app I can only point you to what’s shown here; for the latest contact info please check the official college site.`;
    }

    // Report (web app feature)
    if (msg.includes('report') || msg.includes('submit')) {
        return `📄 You can submit event reports through the dashboard on this web app. Use the "Submit Report" button to fill in event details and upload your report.`;
    }

    // About college (as on app)
    if (msg.includes('about') || msg.includes('mission')) {
        return `🏛️ Meenakshi Sundararajan Engineering College is dedicated to quality engineering education. The information I give is limited to what’s on this web app. For more, visit the main college website.`;
    }

    // Dashboard (web app only)
    if (msg.includes('dashboard') || msg.includes('feature') || msg.includes('how to')) {
        return `🎯 On this web app, the dashboard lets you: view campus highlights and events, access the academic calendar, submit and manage reports, change your password, and (for admin) manage users. What would you like help with?`;
    }

    // Campus facilities (as on app)
    if (msg.includes('library') || msg.includes('lab') || msg.includes('facility') || msg.includes('gym')) {
        return `🏗️ Campus facilities (labs, library, sports, classrooms) are described on this web app. Check the dashboard and campus tour for details available here.`;
    }

    // Closing
    if (msg.includes('thanks') || msg.includes('thank you') || msg.includes('bye') || msg.includes('goodbye')) {
        return `😊 You're welcome! I can only help with information on this web app. Have a great day!`;
    }

    // Password/Account (web app)
    if (msg.includes('password') || msg.includes('forgot') || msg.includes('account')) {
        return `🔐 You can change your password from the dashboard after logging in. If you've forgotten it, use the "Forgot password?" link on the login page (below Sign In) to get a reset token and set a new password—no need to contact admin. Token expires in 1 hour. You can use the form on this page to reset—no need to contact anyone.`;
    }

    // Admin (web app)
    if (msg.includes('admin') || msg.includes('manage')) {
        return `👨‍💼 On this web app, admin can: add and manage posts, manage users, view and delete reports, and system configuration. I don’t have access beyond what’s on this site.`;
    }

    // Login/Access (web app)
    if (msg.includes('login') || msg.includes('access') || msg.includes('sign in')) {
        return `🔐 To access the dashboard on this web app, log in with your college credentials. New students should contact admissions for login details.`;
    }

    // Help / what can you do
    if (msg.includes('help') || msg.includes('what can you') || msg.includes('what do you')) {
        return `I only give information that is available on this college web app. I can help with:\n• Calendar and events\n• Admissions (as on this site)\n• Dashboard and reports\n• Campus facilities (as on this site)\n• Login and account\n\nI cannot answer questions outside this web app’s information.`;
    }

    // Default: strict scope – only app information, nothing more
    return `🤖 ${SCOPE_MESSAGE}`;
}

// Initialize database and start server
initDatabase();
initReportsDatabase();
initEventsDatabase();

// Export app for Vercel serverless
module.exports = app;

// Start the Express server locally (not in Vercel)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

