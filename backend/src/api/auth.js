import { ALLOWED_API_KEYS, RATE_LIMIT_CONFIG } from '../config/index.js';

/**
 * ============================================================================
 * API KEY AUTHENTICATION MIDDLEWARE
 * ============================================================================
 * 
 * Validates that incoming requests include a valid API key in the header.
 * Required header: X-API-Key: <key>
 * 
 * Usage:
 *   app.use(authMiddleware);
 * 
 * Bypass:
 *   Health and static endpoints can skip auth in their individual handlers.
 */

export function authMiddleware(req, res, next) {
    // Allow health checks to pass through (for Nginx/Docker healthchecks)
    if (req.path === '/health') {
        return next();
    }

    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'X-API-Key header is required'
        });
    }

    // Check if key is in allowed list
    if (!ALLOWED_API_KEYS.includes(apiKey)) {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Invalid API key'
        });
    }

    // Attach key to request for logging
    req.apiKey = apiKey;
    next();
}

/**
 * ============================================================================
 * RATE LIMITING MIDDLEWARE
 * ============================================================================
 * 
 * Simple in-memory rate limiter. Track requests per IP address.
 * For production, consider using Redis.
 * 
 * Usage:
 *   app.use(rateLimitMiddleware);
 * 
 * Config in .env:
 *   RATE_LIMIT_WINDOW_MS=60000
 *   RATE_LIMIT_MAX_REQUESTS=100
 */

const requestCounts = new Map();

function cleanupOldEntries() {
    const now = Date.now();
    const window = RATE_LIMIT_CONFIG.windowMs;

    for (const [ip, entries] of requestCounts.entries()) {
        // Remove timestamps older than the window
        const recentEntries = entries.filter(timestamp => now - timestamp < window);
        
        if (recentEntries.length === 0) {
            requestCounts.delete(ip);
        } else {
            requestCounts.set(ip, recentEntries);
        }
    }
}

export function rateLimitMiddleware(req, res, next) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const window = RATE_LIMIT_CONFIG.windowMs;
    const maxRequests = RATE_LIMIT_CONFIG.maxRequests;

    // Initialize or get request entries for this IP
    if (!requestCounts.has(ip)) {
        requestCounts.set(ip, []);
    }

    const entries = requestCounts.get(ip);
    
    // Remove old entries outside the window
    const recentEntries = entries.filter(timestamp => now - timestamp < window);
    
    // Check if limit exceeded
    if (recentEntries.length >= maxRequests) {
        return res.status(429).json({
            error: 'Too Many Requests',
            message: `Rate limit exceeded: ${maxRequests} requests per ${window}ms`,
            retryAfter: Math.ceil((recentEntries[0] + window - now) / 1000)
        });
    }

    // Record this request
    recentEntries.push(now);
    requestCounts.set(ip, recentEntries);

    // Attach remaining quota to response headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', maxRequests - recentEntries.length);
    res.setHeader('X-RateLimit-Reset', new Date(recentEntries[0] + window).toISOString());

    // Cleanup old entries periodically (every 1000 requests)
    if (Math.random() < 0.001) {
        cleanupOldEntries();
    }

    next();
}

/**
 * ============================================================================
 * EXPORT-SPECIFIC RATE LIMITER
 * ============================================================================
 * 
 * Stricter limit for resource-intensive export operations.
 * Applied only to /api/export/* endpoints.
 * 
 * Config in .env:
 *   EXPORT_RATE_LIMIT_WINDOW_MS=3600000
 *   EXPORT_RATE_LIMIT_MAX_REQUESTS=10
 */

const exportRequestCounts = new Map();

export function exportRateLimitMiddleware(req, res, next) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const window = RATE_LIMIT_CONFIG.exportWindowMs;
    const maxRequests = RATE_LIMIT_CONFIG.exportMaxRequests;

    if (!exportRequestCounts.has(ip)) {
        exportRequestCounts.set(ip, []);
    }

    const entries = exportRequestCounts.get(ip);
    const recentEntries = entries.filter(timestamp => now - timestamp < window);

    if (recentEntries.length >= maxRequests) {
        return res.status(429).json({
            error: 'Too Many Requests',
            message: `Export rate limit exceeded: ${maxRequests} exports per ${Math.round(window / 60000)} minutes`,
            retryAfter: Math.ceil((recentEntries[0] + window - now) / 1000)
        });
    }

    recentEntries.push(now);
    exportRequestCounts.set(ip, recentEntries);

    res.setHeader('X-Export-RateLimit-Limit', maxRequests);
    res.setHeader('X-Export-RateLimit-Remaining', maxRequests - recentEntries.length);

    next();
}