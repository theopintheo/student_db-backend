const express = require('express');
const router = express.Router();
const multer = require('multer');
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validationMiddleware');
const { protect, authorize, hasPermission } = require('../middleware/authMiddleware');
const {
    getContent,
    getContentById,
    createContent,
    updateContent,
    deleteContent,
    uploadFile,
    shareContent,
    getCourseContent,
    getStudentContent,
    downloadContent
} = require('../controllers/contentController');

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads/content');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain',
            'image/jpeg',
            'image/png',
            'image/gif',
            'video/mp4',
            'audio/mpeg',
            'application/zip'
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'), false);
        }
    }
});

// All routes are protected
router.use(protect);

// File upload route
router.post('/upload',
    authorize('admin', 'trainer'),
    hasPermission('content', 'canCreate'),
    upload.single('file'),
    uploadFile
);

// Download content
router.get('/:id/download',
    hasPermission('content', 'canView'),
    validate([
        param('id').isMongoId().withMessage('Invalid content ID')
    ]),
    downloadContent
);

// Share content with students
router.post('/:id/share',
    authorize('admin', 'trainer'),
    hasPermission('content', 'canEdit'),
    validate([
        param('id').isMongoId().withMessage('Invalid content ID'),
        body('students').isArray().withMessage('Students array is required'),
        body('students.*').isMongoId().withMessage('Invalid student ID')
    ]),
    shareContent
);

// Get content for specific course
router.get('/course/:courseId',
    hasPermission('content', 'canView'),
    validate([
        param('courseId').isMongoId().withMessage('Invalid course ID')
    ]),
    getCourseContent
);

// Get content accessible to specific student
router.get('/student/:studentId',
    hasPermission('content', 'canView'),
    validate([
        param('studentId').isMongoId().withMessage('Invalid student ID')
    ]),
    getStudentContent
);

// CRUD routes
router.route('/')
    .get(hasPermission('content', 'canView'), getContent)
    .post(
        authorize('admin', 'trainer'),
        hasPermission('content', 'canCreate'),
        validate([
            body('title').notEmpty().withMessage('Title is required'),
            body('type').isIn(['document', 'video', 'link', 'assignment', 'quiz', 'resource'])
                .withMessage('Invalid content type'),
            body('course').isMongoId().withMessage('Valid course ID is required')
        ]),
        createContent
    );

router.route('/:id')
    .get(
        hasPermission('content', 'canView'),
        validate([
            param('id').isMongoId().withMessage('Invalid content ID')
        ]),
        getContentById
    )
    .put(
        authorize('admin', 'trainer'),
        hasPermission('content', 'canEdit'),
        validate([
            param('id').isMongoId().withMessage('Invalid content ID')
        ]),
        updateContent
    )
    .delete(
        authorize('admin', 'trainer'),
        hasPermission('content', 'canDelete'),
        validate([
            param('id').isMongoId().withMessage('Invalid content ID')
        ]),
        deleteContent
    );

module.exports = router;