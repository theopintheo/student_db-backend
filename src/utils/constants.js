module.exports = {
    ROLES: {
        ADMIN: 'admin',
        EMPLOYEE: 'employee',
        COUNSELOR: 'counselor',
        TRAINER: 'trainer',
        STUDENT: 'student'
    },
    
    LEAD_STATUS: {
        NEW: 'new',
        CONTACTED: 'contacted',
        FOLLOW_UP: 'follow_up',
        QUALIFIED: 'qualified',
        CONVERTED: 'converted',
        LOST: 'lost',
        NOT_INTERESTED: 'not_interested'
    },
    
    LEAD_SOURCE: {
        WEBSITE: 'website',
        REFERRAL: 'referral',
        WALK_IN: 'walk_in',
        SOCIAL_MEDIA: 'social_media',
        CAMPAIGN: 'campaign',
        OTHER: 'other'
    },
    
    STUDENT_STATUS: {
        ACTIVE: 'active',
        ALUMNI: 'alumni',
        DROPPED: 'dropped',
        SUSPENDED: 'suspended',
        TRANSFERRED: 'transferred',
        PROBATION: 'probation'
    },
    
    ENROLLMENT_STATUS: {
        PENDING: 'pending',
        ACTIVE: 'active',
        COMPLETED: 'completed',
        DROPPED: 'dropped',
        SUSPENDED: 'suspended',
        TRANSFERRED: 'transferred'
    },
    
    PAYMENT_STATUS: {
        PENDING: 'pending',
        COMPLETED: 'completed',
        FAILED: 'failed',
        REFUNDED: 'refunded',
        CANCELLED: 'cancelled'
    },
    
    PAYMENT_MODE: {
        CASH: 'cash',
        CHEQUE: 'cheque',
        ONLINE: 'online',
        CARD: 'card',
        BANK_TRANSFER: 'bank_transfer',
        UPI: 'upi',
        OTHER: 'other'
    },
    
    BATCH_STATUS: {
        UPCOMING: 'upcoming',
        ONGOING: 'ongoing',
        COMPLETED: 'completed',
        CANCELLED: 'cancelled'
    },
    
    ATTENDANCE_STATUS: {
        PRESENT: 'present',
        ABSENT: 'absent',
        LATE: 'late',
        LEAVE: 'leave'
    },
    
    GENDER: {
        MALE: 'male',
        FEMALE: 'female',
        OTHER: 'other'
    },
    
    COURSE_CATEGORY: {
        TECHNOLOGY: 'technology',
        BUSINESS: 'business',
        DESIGN: 'design',
        LANGUAGE: 'language',
        SCIENCE: 'science',
        ARTS: 'arts',
        HEALTH: 'health',
        OTHER: 'other'
    },
    
    DOCUMENT_TYPE: {
        PHOTO: 'photo',
        MARKSHEET: 'marksheet',
        ID_PROOF: 'id_proof',
        ADDRESS_PROOF: 'address_proof',
        CERTIFICATE: 'certificate',
        OTHER: 'other'
    },
    
    ID_PROOF_TYPE: {
        AADHAAR: 'aadhaar',
        PAN: 'pan',
        PASSPORT: 'passport',
        VOTER_ID: 'voter_id',
        DRIVING_LICENSE: 'driving_license'
    },
    
    COMMUNICATION_TYPE: {
        CALL: 'call',
        EMAIL: 'email',
        MEETING: 'meeting',
        MESSAGE: 'message',
        WHATSAPP: 'whatsapp'
    },
    
    SESSION_STATUS: {
        SCHEDULED: 'scheduled',
        COMPLETED: 'completed',
        CANCELLED: 'cancelled'
    }
};