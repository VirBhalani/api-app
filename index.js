require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();
const app = express();
// Configure Google Custom Search
const customSearch = google.customsearch('v1');
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const SEARCH_ENGINE_ID = process.env.SEARCH_ENGINE_ID;

// Add middleware to parse JSON
app.use(express.json());

// Helper function to extract domain from URL without using URL API
const extractDomain = (url) => {
    try {
        return url.split('//')[1].split('/')[0];
    } catch (err) {
        return 'unknown';
    }
};

router.get('/', async (req, res) => {
    try {
        res.status(200).json({ message: 'Get all items' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Educational Resource Routes
router.get('/resources', async (req, res) => {
    try {
        const { subject, difficulty, type, keyword, page = 1, limit = 10 } = req.query;
        
        // Construct search query
        let searchQuery = keyword || '';
        if (subject) searchQuery += ` ${subject}`;
        if (type) searchQuery += ` ${type}`;
        if (difficulty) searchQuery += ` ${difficulty} level`;
        
        // Calculate start index for pagination
        const startIndex = ((page - 1) * limit) + 1;

        // Make request to Google Custom Search API
        const searchResults = await customSearch.cse.list({
            auth: GOOGLE_API_KEY,
            cx: SEARCH_ENGINE_ID,
            q: searchQuery,
            start: startIndex,
            num: limit,
            // Optionally restrict to specific sites
            siteSearch: 'coursera.org,edx.org,khanacademy.org',
            // Filter to educational content
            fileType: 'html,pdf,doc,docx',
        });

        // Transform and structure the response
        const resources = searchResults.data.items.map(item => ({
            title: item.title,
            description: item.snippet,
            url: item.link,
            source: new URL(item.link).hostname,
            type: 'course', // You might want to determine this based on the source
            thumbnail: item.pagemap?.cse_thumbnail?.[0]?.src || null,
            subject: subject || 'Unknown',
            difficulty: difficulty || 'All levels'
        }));

        res.status(200).json({ 
            message: 'Get educational resources',
            filters: { subject, difficulty, type, keyword },
            pagination: { 
                page: parseInt(page),
                limit: parseInt(limit),
                totalResults: searchResults.data.searchInformation.totalResults,
            },
            data: resources
        });
    } catch (error) {
        console.error('Google Search API Error:', error);
        res.status(500).json({ 
            message: 'Error fetching resources',
            error: error.message 
        });
    }
});

router.get('/resources/:id', async (req, res) => {
    try {
        const { id } = req.params;
        res.status(200).json({ 
            message: `Get educational resource ${id}`,
            data: {
                title: 'Sample Course',
                subject: 'Mathematics',
                difficulty: 'Intermediate',
                type: 'Video',
                content: 'Course content here'
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        res.status(200).json({ 
            message: 'Login successful',
            token: 'sample-jwt-token'
        });
    } catch (error) {
        res.status(401).json({ message: error.message });
    }
});

// User Progress and Interaction Routes
router.post('/progress/:resourceId', async (req, res) => {
    try {
        const { resourceId } = req.params;
        const { progress } = req.body;
        res.status(200).json({ 
            message: 'Progress updated',
            data: { resourceId, progress }
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

router.post('/bookmarks/:resourceId', async (req, res) => {
    try {
        const { resourceId } = req.params;
        res.status(200).json({ 
            message: 'Resource bookmarked',
            resourceId
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

router.post('/reviews/:resourceId', async (req, res) => {
    try {
        const { resourceId } = req.params;
        const { rating, review } = req.body;
        res.status(201).json({ 
            message: 'Review submitted',
            data: { resourceId, rating, review }
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Add CRUD operations for resources
router.post('/resources', async (req, res) => {
    try {
        const { title, subject, difficulty, type, content, source_url } = req.body;
        // TODO: Implement resource creation in database
        res.status(201).json({
            message: 'Resource created successfully',
            data: { title, subject, difficulty, type, content, source_url }
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

router.put('/resources/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, subject, difficulty, type, content } = req.body;
        // TODO: Implement resource update in database
        res.status(200).json({
            message: 'Resource updated successfully',
            data: { id, title, subject, difficulty, type, content }
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

router.delete('/resources/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // TODO: Implement resource deletion in database
        res.status(200).json({
            message: 'Resource deleted successfully',
            id
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Generate Token Utility Function
const generateToken = (userId) => {
    return jwt.sign(
        { userId },
        process.env.JWT_SECRET || 'your-default-secret-key',
        { expiresIn: '30d' }
    );
};

// Test route
app.get('/test', (req, res) => {
    res.json({ message: 'Server is working!' });
});

// Registration route
app.post('/register', async (req, res) => {
    console.log('Registration request received:', req.body);
    try {
        const { email, password, name } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({
                message: 'Please provide email, password, and name'
            });
        }

        const existingUser = await prisma.user.findUnique({
            where: { email: email }
        });

        if (existingUser) {
            return res.status(400).json({
                message: 'User with this email already exists'
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name,
                role: 'STUDENT'
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true
            }
        });

        const token = generateToken(user.id);
        res.header('Authorization', `Bearer ${token}`);

        res.status(201).json({
            message: 'User registered successfully',
            data: { 
                user,
                token,
                tokenType: 'Bearer',
                expiresIn: '30 days'
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            message: 'Error registering user',
            error: error.message
        });
    }
});

// Login route with generateToken
app.post('/login', async (req, res) => {
    console.log('Login request received:', req.body);
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                message: 'Please provide email and password'
            });
        }

        // Find user
        const user = await prisma.user.findUnique({
            where: { email }
        });

        // Check if user exists and password matches
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({
                message: 'Invalid email or password'
            });
        }

        // Generate token
        const token = generateToken(user.id);

        // Set token in header
        res.header('Authorization', `Bearer ${token}`);

        // Send response
        res.status(200).json({
            message: 'Login successful',
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role
                },
                token,
                tokenType: 'Bearer',
                expiresIn: '30 days'
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            message: 'Error during login',
            error: error.message
        });
    }
});

// Add endpoint to get user's learning dashboard
router.get('/dashboard', async (req, res) => {
    try {
        // TODO: Implement authentication middleware
        res.status(200).json({
            message: 'User dashboard retrieved',
            data: {
                bookmarked_resources: [],
                in_progress_resources: [],
                completed_resources: [],
                recent_activity: []
            }
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Educational Resource Routes
router.get('/resources/search', async (req, res) => {
    try {
        const { query, page = 1, limit = 10 } = req.query;
        
        if (!query) {
            return res.status(400).json({
                message: 'Search query is required'
            });
        }

        // Calculate start index for pagination
        const startIndex = ((page - 1) * limit) + 1;

        // Make request to Google Custom Search API
        const searchResults = await customSearch.cse.list({
            auth: GOOGLE_API_KEY,
            cx: SEARCH_ENGINE_ID,
            q: query,
            start: startIndex,
            num: limit
        });

        // Transform and structure the response
        const resources = searchResults.data.items?.map(item => ({
            title: item.title,
            description: item.snippet,
            url: item.link,
            source: extractDomain(item.link),
            thumbnail: item.pagemap?.cse_thumbnail?.[0]?.src || null,
            datePublished: item.pagemap?.metatags?.[0]?.['date.published'] || null
        })) || [];

        res.status(200).json({ 
            message: 'Search results retrieved successfully',
            pagination: { 
                page: parseInt(page),
                limit: parseInt(limit),
                totalResults: searchResults.data.searchInformation.totalResults,
            },
            data: resources
        });
    } catch (error) {
        console.error('Google Search API Error:', error);
        res.status(500).json({ 
            message: 'Error performing search',
            error: error.message 
        });
    }
});

// Updated to POST method with body parameters
app.post('/resources/search', async (req, res) => {
    try {
        const { 
            subject = '', 
            topic = '', 
            difficulty = '', 
            type = '',
            page = 1, 
            limit = 10 
        } = req.body;
        
        // Construct search query from body parameters
        const searchQuery = [
            subject,
            topic,
            difficulty,
            type
        ].filter(Boolean).join(' '); // Joins non-empty parameters with spaces

        if (!searchQuery) {
            return res.status(400).json({
                message: 'At least one search parameter (subject, topic, difficulty, or type) is required'
            });
        }

        // Calculate start index for pagination
        const startIndex = ((page - 1) * limit) + 1;

        // Make request to Google Custom Search API
        const searchResults = await customSearch.cse.list({
            auth: GOOGLE_API_KEY,
            cx: SEARCH_ENGINE_ID,
            q: searchQuery,
            start: startIndex,
            num: limit
        });

        // Transform and structure the response
        const resources = searchResults.data.items?.map(item => ({
            title: item.title,
            description: item.snippet,
            url: item.link,
            source: extractDomain(item.link),
            thumbnail: item.pagemap?.cse_thumbnail?.[0]?.src || null,
            datePublished: item.pagemap?.metatags?.[0]?.['date.published'] || null,
            // Include search parameters in response
            searchParams: {
                subject,
                topic,
                difficulty,
                type
            }
        })) || [];

        res.status(200).json({ 
            message: 'Search results retrieved successfully',
            searchQuery,
            pagination: { 
                page: parseInt(page),
                limit: parseInt(limit),
                totalResults: searchResults.data.searchInformation.totalResults,
            },
            data: resources
        });
    } catch (error) {
        console.error('Google Search API Error:', error);
        res.status(500).json({ 
            message: 'Error performing search',
            error: error.message 
        });
    }
});

// Authentication Middleware
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-default-secret-key');
        
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, email: true, role: true }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
};

// Protected route example - User profile
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true
            }
        });

        res.status(200).json({
            message: 'Profile retrieved successfully',
            data: user
        });
    } catch (error) {
        res.status(500).json({
            message: 'Error retrieving profile',
            error: error.message
        });
    }
});

app.use('/api/items', router);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
