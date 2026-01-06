const defaultPermissions = [
    {
        module: 'dashboard',
        canView: true,
        canCreate: false,
        canEdit: false,
        canDelete: false
    },
    {
        module: 'leads',
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: false
    },
    {
        module: 'students',
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: false
    },
    {
        module: 'courses',
        canView: true,
        canCreate: false,
        canEdit: false,
        canDelete: false
    },
    {
        module: 'payments',
        canView: true,
        canCreate: true,
        canEdit: false,
        canDelete: false
    },
    {
        module: 'attendance',
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: false
    },
    {
        module: 'content',
        canView: true,
        canCreate: false,
        canEdit: false,
        canDelete: false
    },
    {
        module: 'users',
        canView: false,
        canCreate: false,
        canEdit: false,
        canDelete: false
    },
    {
        module: 'reports',
        canView: true,
        canCreate: false,
        canEdit: false,
        canDelete: false
    }
];

const adminPermissions = defaultPermissions.map(p => ({
    ...p,
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: true
}));

const trainerPermissions = defaultPermissions.map(p => {
    if (p.module === 'students' || p.module === 'attendance' || p.module === 'content') {
        return {
            ...p,
            canView: true,
            canCreate: true,
            canEdit: true,
            canDelete: false
        };
    }
    return p;
});

const counselorPermissions = defaultPermissions.map(p => {
    if (p.module === 'leads' || p.module === 'students') {
        return {
            ...p,
            canView: true,
            canCreate: true,
            canEdit: true,
            canDelete: false
        };
    }
    return p;
});

const getPermissionsByRole = (role) => {
    switch (role) {
        case 'admin':
            return adminPermissions;
        case 'trainer':
            return trainerPermissions;
        case 'counselor':
            return counselorPermissions;
        case 'employee':
            return defaultPermissions;
        case 'student':
            return defaultPermissions.filter(p => 
                p.module === 'dashboard' || 
                p.module === 'courses' || 
                p.module === 'content'
            ).map(p => ({ ...p, canCreate: false, canEdit: false, canDelete: false }));
        default:
            return defaultPermissions;
    }
};

module.exports = {
    defaultPermissions,
    getPermissionsByRole
};