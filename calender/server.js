const express = require('express');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Session configuration
app.use(session({
    secret: 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false, // Set to true in production with HTTPS
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));

// Database file path
const dbPath = path.join(__dirname, 'database.json');

// Reports database file path
const reportsDbPath = path.join(__dirname, 'reports.json');

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
app.post('/api/login', (req, res) => {
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

// Register new user (admin only)
app.post('/api/register', isAuthenticated, (req, res) => {
    if (req.session.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Only admins can register new users'
        });
    }

    const { username, password, email, name, role } = req.body;

    if (!username || !password || !email || !name || !role) {
        return res.status(400).json({
            success: false,
            message: 'All fields are required'
        });
    }

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

    events.events.splice(eventIndex, 1);
    saveEvents(events);

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
app.post('/api/chat/message', (req, res) => {
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

// Chatbot AI Response Generator
function generateChatbotResponse(userMessage) {
    const msg = userMessage.toLowerCase().trim();

    // Greeting responses
    if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
        return `👋 Hello! Welcome to Meenakshi Sundararajan Engineering College. I'm here to help you with questions about our calendar, events, and college information. How can I assist you today?`;
    }

    // Event related questions
    if (msg.includes('event') || msg.includes('calendar')) {
        return `📅 Our academic calendar includes various events like lectures, workshops, seminars, and graduation ceremonies. You can view all upcoming events on the Academic Calendar page. What specific events are you interested in?`;
    }

    // Admission questions
    if (msg.includes('admission') || msg.includes('apply') || msg.includes('course')) {
        return `🎓 For admission inquiries, please visit our main college website or contact our admissions office. You can also reach out to us at admissions@meenakshi.edu. Is there anything else I can help with?`;
    }

    // Course/Academic questions
    if (msg.includes('course') || msg.includes('syllabus') || msg.includes('academic')) {
        return `📚 Our college offers various engineering programs including CSE, ECE, Mechanical, Civil, and more. For detailed syllabus information, please contact your department head or academic advisor.`;
    }

    // Contact information
    if (msg.includes('contact') || msg.includes('phone') || msg.includes('email')) {
        return `📞 You can reach us at:\n🏫 Email: info@college.edu\n📱 Phone: +91-XXXX-XXXXXX\n🌐 Website: www.college.edu`;
    }

    // Report related
    if (msg.includes('report') || msg.includes('submit')) {
        return `📄 You can submit event reports through the dashboard. Click on "Submit Report" button to fill in event details and upload your report. Reports are valuable for documentation and records!`;
    }

    // About college
    if (msg.includes('about') || msg.includes('college') || msg.includes('mission')) {
        return `🏛️ Meenakshi Sundararajan Engineering College is dedicated to providing quality engineering education and fostering innovation. We offer state-of-the-art facilities and expert faculty guidance. Is there something specific you'd like to know?`;
    }

    // Dashboard features
    if (msg.includes('dashboard') || msg.includes('feature') || msg.includes('how to')) {
        return `🎯 Our dashboard lets you:\n✅ View campus highlights and events\n✅ Access the academic calendar\n✅ Submit and manage reports\n✅ Change your password\n✅ Manage users (admin only)\n\nWhat would you like help with?`;
    }

    // Campus facilities
    if (msg.includes('library') || msg.includes('lab') || msg.includes('facility') || msg.includes('gym')) {
        return `🏗️ We have excellent facilities including state-of-the-art labs, a comprehensive library, sports facilities, and modern classrooms. Visit our campus tour video on the dashboard to see more!`;
    }

    // Closing messages
    if (msg.includes('thanks') || msg.includes('thank you') || msg.includes('bye') || msg.includes('goodbye')) {
        return `😊 You're welcome! Feel free to ask me anything about the college. Have a great day!`;
    }

    // Password/Account help
    if (msg.includes('password') || msg.includes('forgot') || msg.includes('account')) {
        return `🔐 You can change your password from the dashboard after logging in. If you've forgotten your password, please contact the admin office for assistance.`;
    }

    // Admin functions
    if (msg.includes('admin') || msg.includes('manage')) {
        return `👨‍💼 Admin features include:\n✅ Add and manage posts\n✅ User management\n✅ View and delete reports\n✅ System configuration\nAre you an admin? Need help with specific admin tasks?`;
    }

    // Login/Access questions
    if (msg.includes('login') || msg.includes('access') || msg.includes('sign in')) {
        return `🔐 To access the dashboard, you need to log in with your college credentials. If you're a new student, please contact the admissions office to get your login details.`;
    }

    // Default response
    return `🤖 I'm not entirely sure about that. Could you please rephrase your question? I can help with:\n• Calendar and events\n• Admission inquiries\n• Campus facilities\n• Reports and documents\n• Dashboard features\n• General college information`;
}

// Initialize database and start server
initDatabase();
initReportsDatabase();
initEventsDatabase();
app.listen(PORT, () => {
    console.log(`\n🔒 Calendar Server Running on http://localhost:${PORT}`);
    console.log(`📊 Authentication System: ENABLED`);
    console.log(`🤖 Chatbot System: ENABLED\n`);
    console.log(`📝 Default Credentials:`);
    console.log(`   Admin: admin / admin123`);
    console.log(`   Student 1: student1 / student123`);
    console.log(`   Student 2: student2 / password123\n`);
});
